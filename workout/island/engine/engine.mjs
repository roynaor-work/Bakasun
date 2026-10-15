import { createRegistry } from './registry.mjs';
import { validatePlacement, canRemove, upgradeAvailability } from './rules.mjs';
import { calculateMetrics, population, coverageForBuilding } from './metrics.mjs';
import { calculateIncome, accrueIncome } from './economy.mjs';
import { createInitialState, loadWorld, saveWorld, exportWorld, importWorld } from './persistence.mjs';
import { loadEpisode, episodeAvailable } from './episodes.mjs';
import { canPlay, spendPlayTime, createNarrationHook } from './hooks.mjs';

const clone = value => JSON.parse(JSON.stringify(value));

/** Pure game state and commands. No DOM, Three.js, timers, network, or audio. */
export function createEngine(data, options = {}) {
  const registry = createRegistry(data);
  const config = data.config;
  const flags = data.featureFlags || {};
  const now = options.now || Date.now;
  let storage = options.storage;
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const loaded = loadWorld(storage, data, registry, now());
  const state = loaded.ok && loaded.state ? loaded.state : createInitialState(data, now());
  const listeners = new Set(), history = [];
  let saveBlocked = !loaded.ok && loaded.reason !== 'reason.storage';
  const narration = createNarrationHook();
  const engine = { state, data, registry, flags, narration, storageStatus: loaded.ok ? { ok: true } : loaded, canPlay, spendPlayTime };

  function notify(type, detail = {}) {
    const event = { type, ...detail };
    for (const listener of listeners) listener(state, event);
    return event;
  }
  function save() {
    state.updatedAt = now();
    const result = saveBlocked ? { ok: false, reason: engine.storageStatus.reason } : saveWorld(storage, state);
    engine.storageStatus = result;
    return result;
  }
  function changed(type, detail = {}) {
    const saved = save();
    notify(type, { ...detail, saved });
    return saved;
  }
  function remember(action) {
    history.push(action);
    if (history.length > config.maxUndo) history.shift();
  }
  function expand() {
    const parts = state.parts[data.world.partGroup] || 0;
    let expanded = false;
    config.worldStages.forEach((stage, index) => {
      if (index > state.world.stage && parts >= stage.requiredParts) { state.world = { size: stage.size, stage: index }; expanded = true; }
    });
    return expanded;
  }
  function grantReward(id, reward) {
    if (state.claimedRewards.includes(id)) return false;
    state.claimedRewards.push(id);
    state.money += reward.money || 0;
    for (const resource of Object.keys(state.resources)) state.resources[resource] += reward[resource] || 0;
    if (reward.parts) {
      const group = data.world.partGroup;
      state.parts[group] = (state.parts[group] || 0) + reward.parts;
      expand();
    }
    return true;
  }
  function tutorialObjective() {
    if (!flags.tutorial || state.tutorial.completed || state.tutorial.skipped) return null;
    const step = data.tutorial.steps[state.tutorial.step];
    return step ? { ...step, kind: 'tutorial', reward: config.tutorialRewards[step.id] || {}, target: config.tutorialPlacements[step.id] } : null;
  }
  function nextObjective() {
    const tutorial = tutorialObjective();
    if (tutorial) return tutorial;
    const mission = (data.missions || []).find(row => !state.completedMissions.includes(row.id));
    if (mission) return { ...mission, kind: 'mission', reward: config.missionReward };
    const nextStage = config.worldStages[state.world.stage + 1];
    return nextStage ? { id: 'expand', title: 'mission.expand', kind: 'parts', targetParts: nextStage.requiredParts, reward: {} } : { id: 'grow', title: 'mission.grow', buildType: 'house', kind: 'freebuild', reward: {} };
  }
  function onPlaced(typeId) {
    const objective = nextObjective();
    if (objective.buildType !== typeId || !['tutorial', 'mission'].includes(objective.kind)) return null;
    const paid = grantReward(`${objective.kind}.${objective.id}`, objective.reward);
    if (objective.kind === 'tutorial') {
      state.tutorial.step++;
      state.tutorial.completed = state.tutorial.step >= data.tutorial.steps.length;
    } else state.completedMissions.push(objective.id);
    return { ...objective, paid };
  }
  function enabledType(typeId) {
    const type = registry.buildings.get(typeId);
    if (type?.category === 'sports' && !flags.sportFacilities) return false;
    return !type?.featureFlag || Boolean(flags[type.featureFlag]);
  }
  function check(typeId, x, z, ignoreId) {
    if (!enabledType(typeId)) return { ok: false, reason: 'reason.locked' };
    return validatePlacement(state, registry, typeId, x, z, ignoreId, flags);
  }

  engine.subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  engine.save = save;
  engine.validatePlacement = check;
  engine.nextObjective = nextObjective;
  engine.population = () => population(state, registry, config);
  engine.metrics = () => {
    if (!flags.metrics) return {};
    const values = calculateMetrics(state, registry, config);
    for (const metric of registry.metrics.values()) if (metric.featureFlag && !flags[metric.featureFlag]) delete values[metric.id];
    return values;
  };
  engine.coverage = id => coverageForBuilding(state, registry, id, config);
  engine.income = () => flags.economy ? calculateIncome(state, registry, config) : { money: 0, food: 0, materials: 0, energy: 0, sources: [] };
  engine.incomePerMinute = () => engine.income().money;
  engine.canUndo = () => Boolean(history.length);
  engine.place = (typeId, x, z) => {
    const validation = check(typeId, x, z);
    if (!validation.ok) return validation;
    const type = registry.buildings.get(typeId);
    let id;
    do { id = `building-${state.nextId++}`; } while (state.buildings.some(row => row.id === id));
    state.money -= type.cost;
    const building = { id, typeId, x, z, level: 1 };
    state.buildings.push(building);
    remember({ kind: 'place', id, moneyDelta: -type.cost });
    const reward = onPlaced(typeId);
    changed('place', { id, reward });
    if (reward) narration.announce(reward.title, { reward: reward.reward });
    return { ok: true, reason: 'reason.placed', id, reward };
  };
  engine.move = (id, x, z) => {
    const building = state.buildings.find(row => row.id === id);
    if (!building) return { ok: false, reason: 'reason.invalid' };
    const validation = check(building.typeId, x, z, id);
    if (!validation.ok) return validation;
    remember({ kind: 'move', id, previous: { x: building.x, z: building.z }, moneyDelta: 0 });
    Object.assign(building, { x, z });
    changed('move', { id });
    return { ok: true, reason: 'reason.moved', id };
  };
  engine.remove = id => {
    const validation = canRemove(state, registry, id);
    if (!validation.ok) return validation;
    const index = state.buildings.findIndex(row => row.id === id);
    const building = state.buildings[index];
    const type = registry.buildings.get(building.typeId);
    const investment = type.cost + type.levels.slice(1, building.level).reduce((sum, level) => sum + level.cost, 0);
    const refund = Math.floor(investment * config.removeRefundRatio);
    remember({ kind: 'remove', building: clone(building), index, moneyDelta: refund });
    state.buildings.splice(index, 1); state.money += refund;
    changed('remove', { id, refund });
    return { ok: true, reason: 'reason.removed', id, refund };
  };
  engine.upgrade = id => {
    const validation = upgradeAvailability(state, registry, id);
    if (!validation.ok) return validation;
    const building = state.buildings.find(row => row.id === id);
    const nextLevel = validation.nextLevel;
    remember({ kind: 'upgrade', id, previousLevel: building.level, moneyDelta: -nextLevel.cost });
    state.money -= nextLevel.cost; building.level++;
    changed('upgrade', { id });
    return { ok: true, reason: 'reason.upgraded', id };
  };
  engine.undo = () => {
    const action = history.pop();
    if (!action) return { ok: false, reason: 'reason.noUndo' };
    const building = state.buildings.find(row => row.id === action.id);
    if (action.kind === 'place') state.buildings.splice(state.buildings.findIndex(row => row.id === action.id), 1);
    if (action.kind === 'move' && building) Object.assign(building, action.previous);
    if (action.kind === 'upgrade' && building) building.level = action.previousLevel;
    if (action.kind === 'remove') state.buildings.splice(action.index, 0, action.building);
    // Only reverse the action delta: earned income and once-only rewards remain intact.
    state.money -= action.moneyDelta;
    changed('undo', { action: action.kind });
    return { ok: true, reason: 'reason.undone', id: action.id || action.building?.id };
  };
  engine.tick = seconds => {
    if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, reason: 'reason.invalid' };
    const duration = Math.min(seconds, config.maxTickSeconds);
    const gained = flags.economy ? accrueIncome(state, registry, config, duration) : {};
    state.playSeconds += duration;
    changed('tick', { gained });
    return { ok: true, gained };
  };
  engine.setAvatar = input => {
    if (!input || typeof input !== 'object') return { ok: false, reason: 'reason.invalid' };
    const next = { ...state.avatar };
    const choiceLists = { gender: 'genders', hairstyle: 'hairstyles', skinColor: 'skinColors', hairColor: 'hairColors', shirtColor: 'shirtColors', pantsColor: 'pantsColors' };
    for (const [field, list] of Object.entries(choiceLists)) {
      if (input[field] != null && !data.avatar[list].some(row => (row.color || row.id) === input[field])) return { ok: false, reason: 'reason.invalid' };
      if (input[field] != null) next[field] = input[field];
    }
    if (input.nameId != null) {
      if (!data.avatar.names.some(row => row.labelId === input.nameId)) return { ok: false, reason: 'reason.invalid' };
      next.nameId = input.nameId;
    }
    if (input.name != null) next.name = String(input.name).trim().slice(0, 30);
    next.created = input.created !== false;
    state.avatar = next;
    changed('avatar');
    return { ok: true, reason: 'reason.avatar' };
  };
  engine.grantParts = (groupId, count) => {
    if (typeof groupId !== 'string' || !/^[a-zA-Z][\w.-]*$/.test(groupId) || !Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger((state.parts[groupId] || 0) + count)) return { ok: false, reason: 'reason.invalid' };
    state.parts[groupId] = (state.parts[groupId] || 0) + count;
    const expanded = expand();
    changed('parts', { groupId, count, expanded });
    return { ok: true, reason: expanded ? 'reason.expanded' : 'reason.parts', expanded, size: state.world.size };
  };
  engine.skipTutorial = () => { state.tutorial.skipped = true; changed('tutorial'); return { ok: true }; };
  engine.restartTutorial = () => { Object.assign(state.tutorial, { step: 0, completed: false, skipped: false }); changed('tutorial'); return { ok: true }; };
  engine.exportJSON = () => exportWorld(state);
  engine.importJSON = raw => {
    const result = importWorld(raw, state, data, registry);
    if (!result.ok) return result;
    // Persist before changing the live object, so quota/security errors cannot replace it.
    const saved = saveWorld(storage, result.state);
    if (!saved.ok) { engine.storageStatus = saved; notify('storage', saved); return saved; }
    Object.assign(state, result.state); history.length = 0; saveBlocked = false;
    engine.storageStatus = { ok: true };
    notify('import', { added: result.added, conflicts: result.conflicts });
    return { ok: true, reason: 'reason.imported', added: result.added, conflicts: result.conflicts };
  };
  engine.startEpisode = (id, { testMode = false } = {}) => {
    const result = loadEpisode(data, id);
    if (!result.ok) return result;
    if ((!flags.episodes || result.episode.testOnly) && !testMode) return { ok: false, reason: 'reason.locked' };
    if (!episodeAvailable(result.episode, state)) return { ok: false, reason: 'reason.locked' };
    return result;
  };
  engine.completeEpisode = (id, options) => {
    const result = engine.startEpisode(id, options);
    if (!result.ok) return result;
    if (!state.completedEpisodes.includes(id)) state.completedEpisodes.push(id);
    const paid = grantReward(`episode.${id}`, result.episode.rewards);
    changed('episode', { id, paid });
    return { ok: true, paid };
  };
  engine.startMinigame = (id, context = {}) => {
    const minigame = registry.minigames.get(id);
    if (!minigame || !flags.minigames || (minigame.featureFlag && !flags[minigame.featureFlag])) return { ok: false, reason: 'reason.locked' };
    if (!canPlay()) return { ok: false, reason: 'reason.playTime' };
    return { ok: true, session: minigame.start({ state, engine, canPlay, spendPlayTime, ...context }) };
  };
  engine.prepareEvent = id => {
    const event = registry.eventTypes.get(id);
    if (!event || !flags.events || (event.featureFlag && !flags[event.featureFlag])) return { ok: false, reason: 'reason.locked' };
    if (!event.warningId) return { ok: false, reason: 'reason.invalid' };
    return { ok: true, warningId: event.warningId, prepared: event.prepare?.({ state, engine }) };
  };
  for (const name of ['registerBuilding', 'registerSport', 'registerMinigame', 'registerEventType', 'registerMetric', 'registerIncomeSource']) engine[name] = record => { const result = registry[name](record); notify('registry', { id: record.id }); return result; };
  return engine;
}
