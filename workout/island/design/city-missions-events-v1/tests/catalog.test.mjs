import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadData} from '../../../engine/load-data.mjs';
import {createRegistry} from '../../../engine/registry.mjs';

const readJSON = async url => JSON.parse(await readFile(url, 'utf8'));
const catalog = await readJSON(new URL('../data/catalog.json', import.meta.url));
const islandRoot = new URL('../../../', import.meta.url);
const data = await loadData(islandRoot, async url => ({
  ok: true,
  json: () => readJSON(url)
}));
const registry = createRegistry(data);

test('the city catalog has a quiet start, a gap between events and all six action types', () => {
  const {firstEventAfter, eventCooldown, minMissionsBetweenEvents} = catalog.pacing;
  assert.ok(Number.isSafeInteger(firstEventAfter) && firstEventAfter > 0);
  assert.ok(Number.isSafeInteger(eventCooldown) && eventCooldown >= firstEventAfter);
  assert.ok(Number.isSafeInteger(minMissionsBetweenEvents) && minMissionsBetweenEvents >= 1);
  assert.deepEqual(
    new Set(catalog.missions.map(mission => mission.kind)),
    new Set(['build', 'upgrade', 'collect', 'connect', 'play', 'rescue'])
  );
  assert.equal(new Set(catalog.missions.map(mission => mission.id)).size, catalog.missions.length);
});

test('every row uses shipped building IDs, economy resources and checked rewards', () => {
  const keys = new Set([
    'id', 'kind', 'event', 'title', 'description', 'target', 'amount', 'gameIds', 'minCityStage',
    'maxCityStage', 'requiresTypes', 'minBuildings', 'minDisconnected', 'minGameStage',
    'stageOffset', 'weight', 'reward'
  ]);
  const resources = Object.keys(data.config.startingResources);
  const rewardKeys = new Set(['money', ...resources]);
  const cityStages = data.config.worldStages.length;

  for (const mission of catalog.missions) {
    const {id, kind, target, requiresTypes = [], minCityStage = 0, maxCityStage = cityStages - 1} = mission;
    assert.match(id, /^[a-z]+(?:-[a-z]+)+$/);
    assert.ok(Object.keys(mission).every(key => keys.has(key)), id);
    assert.match(mission.title, /\p{Script=Hebrew}/u, id);
    assert.match(mission.description, /\p{Script=Hebrew}/u, id);
    assert.ok(Number.isInteger(minCityStage) && minCityStage >= 0, id);
    assert.ok(Number.isInteger(maxCityStage) && maxCityStage < cityStages && maxCityStage >= minCityStage, id);
    for (const type of requiresTypes) assert.ok(registry.buildings.has(type), `${id} requires ${type}`);

    if (kind === 'build' || kind === 'upgrade') {
      const building = registry.buildings.get(target);
      assert.ok(building && !building.locked && building.cost > 0, id);
      if (kind === 'upgrade') assert.ok(building.levels.length > 1, id);
    }
    if (kind === 'connect') assert.ok(mission.minDisconnected >= 1, id);
    if (kind === 'collect') {
      assert.ok(resources.includes(target) && Number.isSafeInteger(mission.amount) && mission.amount > 0, id);
      const producers = requiresTypes.length ? requiresTypes.map(type => registry.buildings.get(type)) : [...registry.buildings.values()];
      assert.ok(producers.some(building => building.resources?.[target] > 0), `${id} needs a producer`);
    }
    const reward = Object.entries(mission.reward);
    assert.ok(reward.length > 0, id);
    for (const [key, amount] of reward) {
      assert.ok(rewardKeys.has(key) && Number.isSafeInteger(amount) && amount > 0, `${id} reward ${key}`);
    }
  }
});

test('the game targets resolve to the enabled island registry and playable stages', () => {
  const usesGame = mission => ['play', 'rescue'].includes(mission.kind);
  for (const mission of catalog.missions.filter(usesGame)) {
    assert.ok(mission.gameIds.length > 0, mission.id);
    assert.equal(new Set(mission.gameIds).size, mission.gameIds.length, mission.id);
    for (const id of mission.gameIds) {
      const game = registry.minigames.get(id);
      const balance = data.config.minigames[id];
      const minStage = mission.minGameStage ?? 1;
      assert.ok(game && (!game.featureFlag || data.featureFlags[game.featureFlag]), id);
      assert.ok(data.config.minigameLevels[id], `${id} has persisted progress`);
      assert.ok(Number.isInteger(minStage) && minStage >= 1 && minStage <= balance.levels.length, id);
      assert.ok(Number.isInteger(mission.stageOffset) && mission.stageOffset <= 0, mission.id);
    }
  }
});

test('city events map to the intended games and city dependencies', () => {
  const events = new Map(catalog.missions.filter(row => row.event).map(row => [row.id, row]));
  const fire = events.get('event-fire');
  assert.equal(fire.kind, 'rescue');
  assert.deepEqual(fire.gameIds, ['fireRescue']);
  assert.deepEqual(fire.requiresTypes, ['fireStation']);
  assert.equal(fire.minGameStage, 2);
  assert.equal(data.config.minigames.fireRescue.levels[fire.minGameStage - 1].feature, 'feature.fire.2');
  const fireTraining = catalog.missions.find(row => row.id === 'play-fire-training');
  assert.ok(fireTraining.kind === 'play' && !fireTraining.event && !fireTraining.minGameStage);
  assert.deepEqual(fireTraining.gameIds, fire.gameIds);

  const crime = events.get('event-crime');
  assert.deepEqual(crime.gameIds, ['catchCriminal']);
  assert.deepEqual(crime.requiresTypes, ['police']);
  const sports = events.get('event-sports');
  assert.equal(sports.kind, 'play');
  assert.deepEqual(sports.gameIds, ['soccer', 'streetSlam', 'tennis']);
  assert.ok(sports.gameIds.every(id => data.config.minigames[id].requiresBuilding));
  const storm = events.get('event-storm');
  assert.deepEqual(storm.gameIds, ['navalDuel']);
  assert.deepEqual(storm.requiresTypes, ['harbor']);
  const race = events.get('event-racing');
  assert.deepEqual(race.gameIds, ['islandRacing']);
  assert.ok(race.minCityStage > 0);
  assert.ok([...events.values()].every(row => Number.isSafeInteger(row.weight) && row.weight > 0));
});
