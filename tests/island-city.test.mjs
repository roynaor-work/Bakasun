import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../workout/island/engine/load-data.mjs';
import { createEngine } from '../workout/island/engine/engine.mjs';
import { createRegistry } from '../workout/island/engine/registry.mjs';
import { population, levelValue, calculateMetrics } from '../workout/island/engine/metrics.mjs';
import { placementAvailability, upgradeAvailability } from '../workout/island/engine/rules.mjs';
import { createInitialState, STORAGE_KEY } from '../workout/island/engine/persistence.mjs';

const data = await loadData(new URL('../workout/island/', import.meta.url), async url => ({ ok: true, json: async () => JSON.parse(await readFile(url, 'utf8')) }));
const strings = JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json', import.meta.url), 'utf8'));
const row = (id, typeId, x = 0, z = 0, level = 1) => ({ id, typeId, x, z, level });
function storageFor(state) {
  const values = new Map(state ? [[STORAGE_KEY, JSON.stringify(state)]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function fixture() {
  const engine = createEngine(data, { storage: storageFor(), now: () => 1000 });
  engine.skipTutorial();
  for (let i = 0; i < 200; i++) engine.tick(60);
  return engine;
}
function city(registry, typeId, count, stage, residents) {
  registry.registerBuilding({ id: 'testResidents', population: residents, levels: [{ population: residents }] });
  return { world: { stage, size: data.config.worldStages[stage].size }, money: 10000, buildings: [...Array.from({ length: count }, (_, i) => row(`old-${i}`, typeId)), row('residents', 'testResidents')] };
}

test('island every bundled type and extension has a data-only limit and a translated reason', () => {
  const registry = createRegistry(data);
  for (const type of registry.buildings.values()) {
    assert.ok(['capacity', 'stageCap', 'unique', 'free'].includes(type.limit.kind), type.id);
    if (type.limit.kind === 'free') continue;
    assert.ok(strings[type.limit.reason], type.id);
    if (type.limit.maxCount) assert.equal(type.limit.maxCount.length, data.config.worldStages.length);
    if (type.limit.kind === 'capacity') {
      assert.ok(type.supply > type.limit.margin);
      assert.ok(type.levels.every((level, i) => level.supply > (type.levels[i - 1]?.supply ?? 0)));
    }
  }
});

for (const type of data.buildings.filter(type => type.limit.kind === 'capacity')) {
  test(`island ${type.id} capacity uses the strict population plus margin boundary and every level`, () => {
    for (let level = 1; level <= type.levels.length; level++) {
      const registry = createRegistry(data), supply = type.levels[level - 1].supply;
      const state = city(registry, type.id, 1, 0, supply - type.limit.margin);
      state.buildings[0].level = level;
      assert.equal(placementAvailability(state, registry, type.id).reason, type.limit.reason, 'equality is blocked');
      state.buildings.push(row('extra-resident', 'house'));
      assert.equal(placementAvailability(state, registry, type.id).ok, true, 'growth creates demand');
    }
  });
}

test('island house upgrades raise real population and reopen demand; water upgrades satisfy it again', () => {
  const engine = fixture();
  const tower = engine.place('waterTower', 4, 8); assert.equal(tower.ok, true);
  assert.equal(engine.validatePlacement('waterTower', 10, 8).reason, data.config.buildings.waterTower.limit.reason);
  const houses = [4, 6, 8, 10].map(x => engine.place('house', x, 5));
  for (const house of houses) assert.equal(house.ok, true);
  assert.equal(engine.population(), 16);
  for (const house of houses) assert.equal(engine.upgrade(house.id).ok, true);
  assert.equal(engine.population(), 32);
  assert.equal(engine.validatePlacement('waterTower', 10, 8).ok, true);
  assert.equal(engine.upgrade(tower.id).ok, true);
  assert.equal(engine.validatePlacement('waterTower', 10, 8).reason, data.config.buildings.waterTower.limit.reason);
  assert.equal(engine.income().sources.find(source => source.id === 'tourists').amount,
    data.config.incomeSources[0].basePerMinute + 32 * data.config.incomeSources[0].populationRate);
});

test('island capacity sums every existing level but only for the requested service type', () => {
  const registry = createRegistry(data), type = registry.buildings.get('waterTower');
  const supply = type.levels[0].supply + type.levels[1].supply;
  const state = city(registry, type.id, 2, 0, supply - type.limit.margin);
  state.buildings[1].level = 2;
  state.buildings.push(row('other-service', 'hospital'));
  assert.equal(placementAvailability(state, registry, type.id).ok, false);
  state.buildings.push(row('new-home', 'house'));
  assert.equal(placementAvailability(state, registry, type.id).ok, true);
});

for (const typeId of ['house', 'shop', 'factory', 'farm', 'harbor']) {
  test(`island ${typeId} count cap applies at every world stage`, () => {
    for (let stage = 0; stage < data.config.worldStages.length; stage++) {
      const registry = createRegistry(data), limit = registry.buildings.get(typeId).limit;
      const state = city(registry, typeId, limit.maxCount[stage], stage, 10000);
      assert.equal(placementAvailability(state, registry, typeId).reason, limit.countReason || limit.reason);
      state.buildings.splice(0, 1);
      assert.equal(placementAvailability(state, registry, typeId).ok, true);
    }
  });
}

test('island expansion raises the house count cap without replacing the city', () => {
  const engine = fixture();
  for (const [x, z] of [[4, 5], [6, 5], [8, 5], [4, 8], [10, 8], [8, 8]]) assert.equal(engine.place('house', x, z).ok, true);
  const before = engine.exportJSON();
  assert.equal(engine.place('house', 10, 5).reason, 'reason.limit.house');
  assert.equal(engine.exportJSON(), before, 'blocked placement cannot charge, allocate an ID, or change progress');
  engine.grantParts(data.world.partGroup, data.config.worldStages[1].requiredParts);
  assert.equal(engine.place('house', 10, 5).ok, true);
});

test('island all four house levels and stage limits use the command and keep money intact on rejection', () => {
  const engine = fixture(), home = engine.place('house', 4, 5);
  assert.equal(engine.population(), 4);
  assert.equal(engine.upgrade(home.id).ok, true); assert.equal(engine.population(), 8);
  let before = engine.exportJSON();
  assert.equal(engine.upgrade(home.id).reason, 'reason.stageLevel'); assert.equal(engine.exportJSON(), before);
  engine.grantParts(data.world.partGroup, data.config.worldStages[1].requiredParts);
  assert.equal(engine.upgrade(home.id).ok, true); assert.equal(engine.population(), 16);
  assert.equal(engine.upgrade(home.id).reason, 'reason.stageLevel');
  engine.grantParts(data.world.partGroup, data.config.worldStages[2].requiredParts);
  assert.equal(engine.upgrade(home.id).ok, true); assert.equal(engine.population(), 24);
  before = engine.exportJSON();
  assert.equal(engine.upgrade(home.id).reason, 'reason.maxLevel'); assert.equal(engine.exportJSON(), before);
});

test('island an unaffordable upgrade has a visible reason and becomes available after income', () => {
  const engine = createEngine(data, { storage: storageFor() });
  const home = engine.place('house', 4, 5);
  engine.state.money = data.config.buildings.house.levels[1].cost - 1;
  const before = engine.exportJSON();
  assert.equal(upgradeAvailability(engine.state, engine.registry, home.id).reason, 'reason.money');
  assert.equal(engine.upgrade(home.id).reason, 'reason.money'); assert.equal(engine.exportJSON(), before);
  engine.tick(60);
  assert.equal(upgradeAvailability(engine.state, engine.registry, home.id).ok, true);
});

for (const type of data.buildings.filter(type => type.category === 'sports')) {
  test(`island ${type.id} permits a second facility only at the final stage and population threshold`, () => {
    for (let stage = 0; stage < data.config.worldStages.length; stage++) {
      const registry = createRegistry(data), state = city(registry, type.id, 1, stage, 10000);
      assert.equal(placementAvailability(state, registry, type.id).ok, stage === 2);
    }
    const registry = createRegistry(data), threshold = type.limit.minPopulation[2];
    const state = city(registry, type.id, 1, 2, threshold - data.config.buildings.house.levels[0].population);
    assert.equal(placementAvailability(state, registry, type.id).ok, false);
    state.buildings.push(row('last-house', 'house'));
    assert.equal(placementAvailability(state, registry, type.id).ok, true);
    state.buildings.push(row('second-facility', type.id));
    assert.equal(placementAvailability(state, registry, type.id).ok, false);
  });
}

test('island prison stays unique and free decorations have no city count limit', () => {
  for (let stage = 0; stage < data.config.worldStages.length; stage++) {
    const registry = createRegistry(data), state = city(registry, 'prison', 1, stage, 10000);
    assert.equal(placementAvailability(state, registry, 'prison').ok, false);
    for (const typeId of ['park', 'road', 'wall', 'flowerGarden']) {
      state.buildings.push(...Array.from({ length: 100 }, (_, i) => row(`free-${typeId}-${i}`, typeId)));
      assert.equal(placementAvailability(state, registry, typeId).ok, true);
    }
  }
  const engine = fixture(), park = engine.place('park', 4, 5);
  assert.equal(engine.upgrade(park.id).ok, true);
  assert.equal(engine.upgrade(park.id).ok, true, 'free parks keep their original upgrade availability in the first stage');
});

test('island moving over-supplied services is free, preserves level and fails atomically on an invalid destination', () => {
  const engine = fixture(), tower = engine.place('waterTower', 4, 5);
  engine.upgrade(tower.id);
  assert.equal(engine.validatePlacement('waterTower', 6, 5).ok, false);
  const before = engine.exportJSON(), money = engine.state.money;
  assert.equal(engine.move(tower.id, 4, 7).reason, 'reason.occupied');
  assert.equal(engine.exportJSON(), before);
  assert.equal(engine.move(tower.id, 6, 5).ok, true);
  assert.equal(engine.state.money, money);
  assert.equal(engine.state.buildings.find(b => b.id === tower.id).level, 2);
  engine.undo();
  assert.equal(engine.state.buildings.find(b => b.id === tower.id).x, 4);
  assert.equal(engine.state.money, money);
  engine.remove(tower.id);
  assert.equal(engine.undo().ok, true, 'restoring a removed service bypasses current demand');
});

function oldCity(version) {
  const state = createInitialState(data, 1000);
  state.version = version; state.money = 4321;
  state.buildings.push(...Array.from({ length: 8 }, (_, i) => row(`old-home-${i}`, 'house', i * 2, 0, i === 0 ? 3 : 1)));
  state.buildings.push(...Array.from({ length: 3 }, (_, i) => row(`old-water-${i}`, 'waterTower', i * 2, 3)));
  return state;
}
for (const version of [1, 2]) {
  test(`island legacy v${version} city with three towers and eight houses loads, moves and imports without loss`, () => {
    const previous = oldCity(version), storage = storageFor(previous), engine = createEngine(data, { storage });
    assert.equal(engine.storageStatus.ok, true);
    assert.deepEqual(engine.state.buildings, previous.buildings);
    assert.equal(engine.state.money, previous.money);
    assert.equal(engine.validatePlacement('house', 10, 5).reason, 'reason.limit.house');
    assert.equal(engine.validatePlacement('waterTower', 10, 5).reason, 'reason.limit.waterTower');
    assert.equal(engine.move('old-water-0', 10, 5).ok, true);
    assert.equal(engine.state.money, previous.money);
    assert.equal(engine.move('old-home-0', 12, 6).ok, true, 'house count and stage level cannot prevent a move');
    assert.equal(engine.state.buildings.find(b => b.id === 'old-home-0').level, 3);
    assert.equal(engine.undo().ok, true);
    assert.equal(engine.state.buildings.find(b => b.id === 'old-home-0').x, 0);
    const freshStorage = storageFor(), fresh = createEngine(data, { storage: freshStorage });
    assert.equal(fresh.importJSON(JSON.stringify(previous)).ok, true);
    assert.equal(fresh.state.buildings.filter(b => b.typeId === 'house').length, 8);
    assert.equal(fresh.state.buildings.filter(b => b.typeId === 'waterTower').length, 3);
    assert.equal(fresh.state.money, previous.money);
    fresh.save();
    const reloaded = createEngine(data, { storage: freshStorage });
    assert.equal(reloaded.storageStatus.ok, true);
    assert.deepEqual(reloaded.state.buildings, fresh.state.buildings);
    assert.equal(reloaded.state.money, previous.money);
  });
}

test('island explicit level population also weights service metrics, including zero and extension values', () => {
  const registry = createRegistry({ config: { levelMultiplier: 0.5 }, buildings: [
    { id: 'testHome', population: 4, footprint: [1, 1], levels: [{ population: 0 }, { population: 20 }] },
    { id: 'testService', radius: 2, footprint: [1, 1], effects: { health: 40 } },
  ], metrics: [{ id: 'health', base: 0 }] });
  const state = { buildings: [row('service', 'testService'), row('near', 'testHome', 1, 0, 2), row('far', 'testHome', 6, 0, 1)] };
  assert.equal(population(state, registry, registry.config), 20);
  assert.equal(levelValue(state.buildings[2], registry.buildings.get('testHome'), 'population', registry.config), 0);
  assert.equal(calculateMetrics(state, registry, { ...registry.config, metricMin: 0, metricMax: 100 }).health, 40);
});

test('island a new balance-driven capacity type works through registration and existing placement contract', () => {
  const engine = fixture();
  engine.registerBuilding({ id: 'testPower', footprint: [1, 1], cost: 1, supply: 10, levels: [{ cost: 0, supply: 10 }, { cost: 2, supply: 20 }], limit: { kind: 'capacity', margin: 2, reason: 'reason.limit.test' } });
  assert.equal(engine.place('testPower', 0, 0).ok, true);
  assert.equal(engine.validatePlacement('testPower', 1, 0).reason, 'reason.limit.test');
  assert.equal(engine.move(engine.state.buildings.at(-1).id, 1, 0).ok, true);
});

test('island locked expansion land is rejected by the existing bounds contract and opens with parts', () => {
  const engine = fixture(), x = data.config.worldStages[0].size;
  assert.equal(engine.validatePlacement('road', x, 7).reason, 'reason.bounds');
  engine.grantParts(data.world.partGroup, data.config.worldStages[1].requiredParts);
  assert.equal(engine.validatePlacement('road', x, 7).ok, true);
  assert.equal(engine.validatePlacement('road', data.config.worldStages[1].size, 7).reason, 'reason.bounds');
});
