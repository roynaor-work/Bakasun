export { missionStrings } from './board.mjs?v=island-v2-20261107-24';
import { announceCityMissionRewards, cityMissionEntry, renderCityMissions } from './board.mjs?v=island-v2-20261107-24';
import { createMissionState, advanceMissions, mergeMissionSaves, validMissionState } from './logic.mjs?v=island-v2-20261107-24';
import { gameAvailability } from '../../activity/availability.mjs?v=island-v2-20261107-24';
import { cityConnections } from '../../engine/city-connections.mjs?v=island-v2-20261107-24';
import { citySites } from '../../engine/city-sites.mjs?v=island-v2-20261107-24';
import { readyPlots } from '../../engine/ready-plots.mjs?v=island-v2-20261107-24';
import { cellsFor, placementAvailability, upgradeAvailability } from '../../engine/rules.mjs?v=island-v2-20261107-24';
import catalog from './catalog.mjs?v=island-v2-20261107-24';
import { leagueMatch } from '../../minigames/soccer-campaign.mjs?v=island-v2-20261107-24';

const resources = ['money', 'food', 'materials', 'energy'];
const kinds = ['build', 'upgrade', 'collect', 'connect', 'play', 'rescue'];
const id = value => typeof value === 'string' && /^[a-z][\w.-]{0,79}$/i.test(value);
const ids = value => Array.isArray(value) && value.every(id);
const whole = (value, minimum) => Number.isSafeInteger(value) && value >= minimum;

function validDefinition(row) {
  return id(row?.id) && kinds.includes(row.kind)
    && typeof row.title === 'string' && typeof row.description === 'string'
    && (row.target === undefined || id(row.target))
    && (row.requiresTypes === undefined || ids(row.requiresTypes))
    && (row.amount === undefined || whole(row.amount, 1))
    && (row.event === undefined || typeof row.event === 'boolean')
    && ['minCityStage', 'maxCityStage', 'minBuildings', 'minDisconnected'].every(key =>
      row[key] === undefined || whole(row[key], 0))
    && ['minGameStage', 'weight'].every(key => row[key] === undefined || whole(row[key], 1))
    && (row.stageOffset === undefined || Number.isSafeInteger(row.stageOffset) && row.stageOffset <= 0)
    && (['play', 'rescue'].includes(row.kind) ? ids(row.gameIds) && row.gameIds.length > 0 : row.gameIds === undefined)
    && row.reward && Object.keys(row.reward).length > 0 && Object.entries(row.reward)
      .every(([key, amount]) => resources.includes(key) && whole(amount, 1));
}

export function loadCityMissions() {
  const { pacing, missions } = catalog;
  if (!['firstEventAfter', 'eventCooldown', 'minMissionsBetweenEvents']
    .every(key => whole(pacing?.[key], 1))
    || !Array.isArray(missions) || !missions.length || new Set(missions.map(row => row?.id)).size !== missions.length
    || !missions.every(validDefinition)) {
    throw new Error('Invalid city missions catalog');
  }
  return engine => createCityMissionRuntime(engine, catalog);
}

const neighbors = ([x, z]) => [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]];

function roadSuggestion(state, registry, connections, disconnected) {
  if (!connections.connected.size || !disconnected.size) return null;
  const occupied = new Set();
  const destinations = new Set();
  for (const row of state.buildings) {
    const cells = cellsFor(registry.buildings.get(row.typeId), row.x, row.z);
    for (const cell of cells) {
      if (!connections.roads.has(cell.join(','))) occupied.add(cell.join(','));
      if (disconnected.has(row.id)) for (const neighbor of neighbors(cell)) destinations.add(neighbor.join(','));
    }
  }
  const reserved = (state.readyPlan?.lots ?? []).concat(state.cityManagement.zones.map(zone => ({
    ...zone, typeId: registry.config.cityManagement.zones[zone.kind].typeId
  })));
  for (const row of reserved) {
    for (const cell of cellsFor(registry.buildings.get(row.typeId), row.x, row.z)) {
      if (!connections.roads.has(cell.join(','))) occupied.add(cell.join(','));
    }
  }
  const seen = new Set(connections.connected);
  const queue = Array.from(seen, key => ({ cell: key.split(',').map(Number), first: null }));
  for (let i = 0; i < queue.length; i++) {
    const { cell, first } = queue[i];
    for (const candidate of neighbors(cell)) {
      const [x, z] = candidate, key = candidate.join(',');
      if (x < 0 || z < 0 || x >= state.world.size || z >= state.world.size || seen.has(key) || occupied.has(key)) continue;
      seen.add(key);
      const start = first ?? { x, z };
      if (destinations.has(key)) return start;
      queue.push({ cell: candidate, first: start });
    }
  }
  return null;
}

export function createCityMissionRuntime(engine, catalog, { random = Math.random } = {}) {
  const { state, registry, flags, data } = engine;
  const missions = flags.events ? catalog.missions : catalog.missions.filter(row => !row.event);
  const availableCatalog = { ...catalog, missions };
  const definitions = new Map(missions.map(row => [row.id, row]));
  const buildTargets = new Set(missions.filter(row => row.kind === 'build').map(row => row.target));
  const gameIds = new Set(missions.flatMap(row => row.gameIds ?? []));
  let layout = null, layoutSignature;
  const ready = () => state.avatar.created && (!flags.tutorial || state.tutorial.completed || state.tutorial.skipped);
  const current = () => state.cityMissions;
  const definition = entry => definitions.get(entry?.id);

  function inspectLayout() {
    const signature = JSON.stringify([state.world, state.buildings, state.readyPlan, state.cityManagement.zones]);
    if (signature === layoutSignature) return layout;
    layoutSignature = signature;
    const affordable = { ...state, money: Number.MAX_SAFE_INTEGER };
    const permitsConstruction = state.buildings.length < (data.config.maxSaveBuildings ?? 2000);
    let buildTypes = [];
    if (permitsConstruction) {
      if (state.readyPlan && flags.readyPlots) {
        buildTypes = readyPlots(affordable, registry, flags).filter(plot => plot.ok && buildTargets.has(plot.typeId)).map(plot => plot.typeId);
      } else {
        buildTypes = [...buildTargets].filter(id => {
          const type = registry.buildings.get(id);
          return type && !type.locked && (!type.featureFlag || flags[type.featureFlag])
            && (type.category !== 'sports' || flags.sportFacilities)
            && citySites(affordable, registry, id, { limit: 1, flags }).length > 0;
        });
      }
    }
    const upgradeable = state.buildings.filter(row => {
      if (row.typeId === 'cityHall' || registry.buildings.get(row.typeId)?.isRoad) return false;
      const check = upgradeAvailability(state, registry, row.id);
      return check.ok || check.reason === 'reason.money';
    });
    const connections = cityConnections(state, registry);
    const ordinary = state.buildings.filter(row => row.typeId !== 'cityHall' && registry.buildings.get(row.typeId)?.requiresRoad);
    const disconnected = new Map(ordinary.filter(row => !connections.hasAccess(row)).map(row => [row.id, row.typeId]));
    const connected = new Set(ordinary.filter(row => !disconnected.has(row.id)).map(row => row.id));
    const road = permitsConstruction && placementAvailability(state, registry, 'road').ok
      ? roadSuggestion(state, registry, connections, disconnected) : null;
    layout = { buildTypes, upgradeable, disconnected, connected, road };
    return layout;
  }

  function collectable(detail) {
    if (!flags.economy) return [];
    const income = engine.income();
    return resources.filter(id => detail.gained?.[id] > 0 || income[id] > 0 || income.sources.some(source =>
      source.resource === id && source.amount > 0
    ));
  }

  function playableGames() {
    const games = {};
    if (!flags.minigames) return games;
    for (const id of gameIds) {
      const game = registry.minigames.get(id), progress = state.minigameProgress[id];
      if (!game || !progress || (game.featureFlag && !flags[game.featureFlag])
        || !gameAvailability(state, data.config, id).ok) continue;
      const stage = id === 'soccer' ? Math.min(progress.stage, leagueMatch(data.config.minigames.soccer, progress.stage).total ?? progress.stage) : progress.stage;
      games[id] = { stage };
    }
    return games;
  }

  function signalFor(type, detail, active, oldLayout, newLayout) {
    const kind = definition(active)?.kind;
    if (type === 'city-mission-skip') return { type: 'skip', token: detail.token };
    if ((kind === 'play' || kind === 'rescue') && type === 'minigame' && !detail.result.fireBonus) {
      return { type: 'game', token: detail.cityMissionToken, gameId: detail.id,
        stage: detail.result.stage, outcome: detail.result.outcome };
    }
    if (kind === 'build' && (type === 'place' || type === 'tick')) {
      const ids = type === 'place' ? [detail.id] : detail.developed.map(row => row.buildingId);
      const target = state.buildings.find(row => ids.includes(row.id) && row.typeId === active.target)?.typeId;
      if (target) return { type: 'build', target };
    }
    if (kind === 'upgrade' && type === 'upgrade') {
      return { type: 'upgrade', target: state.buildings.find(row => row.id === detail.id)?.typeId };
    }
    if (kind === 'collect' && type === 'tick') {
      return { type: 'collect', target: active.target, amount: detail.gained[active.target] };
    }
    if (kind === 'connect' && oldLayout && ['place', 'move'].includes(type)) {
      const newlyConnected = [...oldLayout.disconnected].filter(([id]) => newLayout.connected.has(id));
      const connected = Object.create(null);
      for (const [, typeId] of newlyConnected) connected[typeId] = (connected[typeId] ?? 0) + 1;
      return { type: 'connect', amount: newlyConnected.length, connected };
    }
    return { type: 'sync' };
  }

  function update(type, detail = {}) {
    if (!ready()) {
      layoutSignature = undefined;
      layout = null;
      return null;
    }
    const previous = validMissionState(current()) ? current() : createMissionState();
    const oldLayout = layout, newLayout = inspectLayout();
    const context = {
      ready: true, cityStage: state.world.stage, playSeconds: state.playSeconds,
      buildings: state.buildings, buildTypes: newLayout.buildTypes,
      upgradeTypes: newLayout.upgradeable.map(row => row.typeId), resourcesEarnable: collectable(detail),
      connectable: Boolean(newLayout.road), disconnectedCount: newLayout.disconnected.size,
      disconnectedTypes: [...newLayout.disconnected.values()], games: playableGames(),
      random: random()
    };
    const result = advanceMissions(previous, availableCatalog, context, signalFor(type, detail, previous.active, oldLayout, newLayout));
    state.cityMissions = result.state;
    if (result.reward) {
      state.money += result.reward.money ?? 0;
      for (const resource of Object.keys(state.resources)) state.resources[resource] += result.reward[resource] ?? 0;
    }
    return result.reward;
  }

  update('sync');
  return {
    ready, current, definition, update,
    mergeImport(target, incoming) {
      const merged = mergeMissionSaves(target.cityMissions, incoming.cityMissions);
      if (merged !== undefined) target.cityMissions = merged;
    },
    createEntry: cityMissionEntry, render: renderCityMissions, announceRewards: announceCityMissionRewards,
    buildObjective() {
      const active = current()?.active;
      return ready() && definition(active)?.kind === 'build' ? { id: active.id, buildType: active.target } : null;
    },
    gameToken(id, stage) {
      const active = current()?.active;
      return ready() && active?.gameId === id && active.stage === stage ? active.token : undefined;
    },
    upgradeTarget(type) {
      const candidates = inspectLayout().upgradeable.filter(row => row.typeId === type);
      return candidates.find(row => upgradeAvailability(state, registry, row.id).ok) ?? candidates[0];
    },
    nextRoad: () => inspectLayout().road
  };
}
