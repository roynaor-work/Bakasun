import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createEngine } from '../../../engine/engine.mjs';
import { loadData } from '../../../engine/load-data.mjs';
import { STORAGE_KEY } from '../../../engine/persistence.mjs';
import { BUILDINGS } from '../data/catalog.mjs';
import { constructionStage } from '../src/progression.mjs';

const enabled = process.env.ISLAND_CITY_PROGRESS_INTEGRATION === '1';
const options = { skip: enabled ? false : 'apply the patch in a disposable checkout and set ISLAND_CITY_PROGRESS_INTEGRATION=1' };
const island = new URL('../../../', import.meta.url);
const load = () => loadData(island, async url => ({
  ok: true,
  json: async () => JSON.parse(await readFile(url, 'utf8')),
}));

function storageFixture() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
    key: index => [...entries.keys()][index] ?? null,
  };
}

async function activeEngine(storage = storageFixture(), now = () => 1000) {
  const { prepareCityProgressData, cityProgressStorage } = await import('../src/island-adapter.mjs');
  const data = await load();
  prepareCityProgressData(data);
  const engine = createEngine(data, { storage: cityProgressStorage(storage), now });
  assert.ok(engine.cityProgress(), 'the patch must activate the prepared engine');
  return engine;
}

function place(engine, typeId) {
  for (let z = 0; z < engine.state.world.size; z++) {
    for (let x = 0; x < engine.state.world.size; x++) {
      if (engine.validatePlacement(typeId, x, z).ok) {
        const result = engine.place(typeId, x, z);
        assert.equal(result.ok, true, JSON.stringify(result));
        return { ...result, x, z };
      }
    }
  }
  assert.fail(`No available lot for ${typeId}`);
}

function tick(engine, duration) {
  while (duration > 0) {
    const seconds = Math.min(duration, engine.data.config.maxTickSeconds);
    assert.equal(engine.tick(seconds).ok, true);
    duration -= seconds;
  }
}

function balance(engine) {
  return { money: engine.state.money, ...engine.state.resources };
}

test('runtime isolates the older save and resumes the same build after a long break', options, async () => {
  const storage = storageFixture();
  let now = 1000;
  const legacy = createEngine(await load(), { storage, now: () => now });
  legacy.skipTutorial();
  const home = place(legacy, 'house');
  assert.ok(!legacy.cityProgress?.());
  const original = storage.getItem(STORAGE_KEY);
  const engine = await activeEngine(storage, () => now);
  assert.equal(engine.state.buildings.find(row => row.id === home.id).typeId, 'house');
  assert.equal(engine.cityProgress().day, 1);
  const built = place(engine, 'park');
  const duration = BUILDINGS.park.stageSeconds;
  assert.equal(constructionStage(engine.state, built.id), 'foundation');
  tick(engine, duration / 2);
  assert.equal(constructionStage(engine.state, built.id), 'half-built');
  assert.equal(storage.getItem(STORAGE_KEY), original);

  now += 7 * 24 * 60 * 60 * 1000;
  const resumed = await activeEngine(storage, () => now);
  assert.equal(resumed.storageStatus.ok, true);
  assert.equal(resumed.cityProgress().activeSeconds, duration / 2);
  assert.equal(constructionStage(resumed.state, built.id), 'half-built');
  tick(resumed, duration / 2);
  assert.equal(constructionStage(resumed.state, built.id), 'complete');

  const rollback = createEngine(await load(), { storage, now: () => now });
  assert.ok(!rollback.cityProgress?.());
  assert.deepEqual(rollback.state.buildings, JSON.parse(original).buildings);
  assert.equal(rollback.state.buildings.some(row => row.id === built.id), false);
  assert.equal(storage.getItem(STORAGE_KEY), original);
});

test('runtime price, pending lot, and undo use the same authoritative transaction', options, async () => {
  const engine = await activeEngine();
  engine.skipTutorial();
  const before = balance(engine);
  const idBefore = engine.state.nextId;
  const park = place(engine, 'park');
  for (const [resource, price] of Object.entries(BUILDINGS.park.cost)) {
    assert.equal(balance(engine)[resource], before[resource] - price, resource);
  }
  assert.equal(engine.state.nextId, idBefore + 1);
  const after = engine.exportJSON();
  assert.equal(engine.place('park', park.x, park.z).ok, false);
  assert.equal(engine.exportJSON(), after, 'rejection must not debit resources or allocate a second ID');
  assert.equal(engine.undo().ok, true);
  assert.equal(engine.state.buildings.some(row => row.id === park.id), false);
  assert.deepEqual(balance(engine), before);
  assert.ok(!Object.hasOwn(engine.state.cityProgress.projects, park.id));
});

test('runtime catalog preserves base footprints and never mistakes an unlock threshold for residents', options, async () => {
  const legacy = createEngine(await load(), { storage: storageFixture(), now: () => 1000 });
  const engine = await activeEngine();
  for (const id of Object.keys(BUILDINGS)) {
    const record = engine.registry.buildings.get(id);
    const original = legacy.registry.buildings.get(id);
    assert.ok(record, id);
    if (original) assert.deepEqual(record.footprint, original.footprint, id);
    const residents = record.levels[0].population ?? record.population ?? 0;
    assert.equal(residents, original?.levels[0].population ?? original?.population ?? 0, id);
  }
  assert.equal(engine.registry.buildings.get('library').learningStation, 'language');
});

test('runtime upgrades are delayed, remain undoable after completion, and refund the actual purchase', options, async () => {
  const engine = await activeEngine();
  engine.skipTutorial();
  const park = place(engine, 'park');
  const record = BUILDINGS.park;
  tick(engine, record.stageSeconds);
  const option = record.upgrades[0];
  for (let day = 1; day < option.day; day++) tick(engine, engine.cityProgress().daySeconds);
  engine.state.money = 10_000;
  for (const resource of Object.keys(engine.state.resources)) engine.state.resources[resource] = 10_000;
  const before = balance(engine);
  assert.equal(engine.upgrade(park.id).ok, true);
  assert.equal(engine.state.buildings.find(row => row.id === park.id).level, 1);
  for (const [resource, price] of Object.entries(option.cost)) assert.equal(balance(engine)[resource], before[resource] - price);
  tick(engine, option.stageSeconds);
  assert.equal(engine.state.buildings.find(row => row.id === park.id).level, 2);
  const afterTick = balance(engine);
  assert.equal(engine.undo().ok, true);
  assert.equal(engine.state.buildings.find(row => row.id === park.id).level, 1);
  for (const [resource, price] of Object.entries(option.cost)) assert.equal(balance(engine)[resource], afterTick[resource] + price);
});

test('runtime income changes at project completion and agrees for large and small active ticks', options, async () => {
  const fine = await activeEngine();
  const batched = await activeEngine();
  const starter = fine.income().food;
  const record = BUILDINGS.grocery;
  for (const engine of [fine, batched]) {
    engine.skipTutorial();
    const grocery = place(engine, 'grocery');
    assert.equal(constructionStage(engine.state, grocery.id), 'foundation');
    assert.equal(engine.income().food, starter);
  }
  const afterCompletion = 10;
  const requested = record.stageSeconds + afterCompletion;
  const beforeFood = batched.state.resources.food;
  tick(batched, requested);
  for (let elapsed = 0; elapsed < requested; elapsed++) tick(fine, 1);
  const net = batched.state.resources.food - beforeFood;
  assert.ok(Math.abs(net - (starter * requested + record.yield.food * afterCompletion) / 60) < 1e-8);
  for (const [resource, value] of Object.entries(balance(batched))) {
    assert.ok(Math.abs(value - balance(fine)[resource]) < 1e-8, resource);
  }
});

test('runtime additive import skips foreign foundations and rejects malformed project references', options, async () => {
  const source = await activeEngine();
  const target = await activeEngine();
  source.skipTutorial();
  target.skipTutorial();
  const park = place(source, 'park');
  const pending = source.exportJSON();
  assert.equal(target.importJSON(pending).ok, true);
  assert.ok(!target.state.buildings.some(row => row.id === park.id));

  const broken = JSON.parse(pending);
  broken.cityProgress.projects['orphan-project'] = broken.cityProgress.projects[park.id];
  const before = target.exportJSON();
  assert.equal(target.importJSON(JSON.stringify(broken)).ok, false);
  assert.equal(target.exportJSON(), before);

  tick(source, BUILDINGS.park.stageSeconds);
  assert.equal(target.importJSON(source.exportJSON()).ok, true);
  assert.equal(target.state.buildings.find(row => row.id === park.id).typeId, 'park');
  assert.equal(constructionStage(target.state, park.id), 'complete');
});
