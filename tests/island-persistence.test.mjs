import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRegistry } from '../workout/island/engine/registry.mjs';
import { CURRENT_VERSION, STORAGE_KEY, createInitialState, migrateSave, validateSave, loadWorld, saveWorld, exportWorld, importWorld } from '../workout/island/engine/persistence.mjs';

const files = ['config', 'buildings', 'world', 'avatar', 'team', 'players', 'tutorial'];
const data = Object.fromEntries(await Promise.all(files.map(async id => [id, JSON.parse(await readFile(new URL(`../workout/island/data/${id}.json`, import.meta.url), 'utf8'))])));
const registry = createRegistry(data);
const initial = () => createInitialState(data, 1000);
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

test('island saves use the stable island.v1 key and carry an explicit schema version', () => {
  const storage = memoryStorage(), state = initial();
  assert.equal(STORAGE_KEY, 'island.v1');
  assert.equal(saveWorld(storage, state).ok, true);
  assert.equal(JSON.parse(storage.values.get('island.v1')).version, CURRENT_VERSION);
  assert.deepEqual(loadWorld(storage, data, registry).state, state);
});

test('island JSON export and import preserve a complete existing world', () => {
  const state = initial();
  state.buildings.push({ id: 'home', typeId: 'house', x: 4, z: 5, level: 2 });
  state.avatar.created = true;
  state.tutorial = { step: 5, completed: true, skipped: false };
  state.parts.general = 9;
  state.claimedRewards = ['tutorial.house'];
  const roundtrip = importWorld(exportWorld(state), state, data, registry);
  assert.equal(roundtrip.ok, true);
  for (const key of ['money', 'resources', 'buildings', 'avatar', 'tutorial', 'parts', 'claimedRewards']) assert.deepEqual(roundtrip.state[key], state[key]);
});

test('island migration loads a version-one save without losing its currency or buildings', () => {
  const legacy = { version: 1, coins: 540, buildings: [{ type: 'road', x: 1, z: 1 }], avatar: { created: true, gender: 'girl' }, parts: { general: 3 }, tutorial: { step: 2 }, claimedRewards: ['tutorial.house'] };
  const snapshot = structuredClone(legacy), migrated = migrateSave(legacy, data, registry);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.version, CURRENT_VERSION);
  assert.equal(migrated.state.money, 540);
  assert.equal(migrated.state.buildings[0].typeId, 'road');
  assert.equal(migrated.state.buildings[0].x, 1);
  assert.equal(migrated.state.buildings[0].level, 1);
  assert.equal(migrated.state.avatar.gender, 'girl');
  assert.equal(migrated.state.tutorial.step, 2);
  assert.deepEqual(migrated.state.claimedRewards, ['tutorial.house']);
  assert.deepEqual(legacy, snapshot, 'migration must not mutate the supplied save');
});

test('island migration also recognizes an unversioned legacy world', () => {
  const migrated = migrateSave({ buildings: [], coins: 42 }, data, registry);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.state.money, 42);
  assert.equal(migrated.state.version, 11);
});

test('island migration retains an expanded legacy world and derives its matching stage', () => {
  const migrated = migrateSave({ version: 1, worldSize: 20, buildings: [], coins: 90, parts: { general: 5 } }, data, registry);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.state.world, { size: 20, stage: 1 });
  assert.equal(migrated.state.parts.general, 5);
});

test('island a save from a future version is rejected instead of silently downgraded', () => {
  const state = { ...initial(), version: 100 };
  assert.equal(migrateSave(state, data, registry).reason, 'reason.future');
  assert.equal(importWorld(JSON.stringify(state), initial(), data, registry).reason, 'reason.future');
});

for (const [label, corrupt] of [
  ['negative money', s => { s.money = -1; }],
  ['nonfinite resource', s => { s.resources.food = Infinity; }],
  ['unknown building', s => { s.buildings[0].typeId = 'unregistered'; }],
  ['duplicate instance ID', s => { s.buildings[1].id = s.buildings[0].id; }],
  ['overlapping buildings', s => { s.buildings[1].x = s.buildings[0].x; }],
  ['out-of-bounds footprint', s => { s.buildings.push({ id: 'outside', typeId: 'house', x: 15, z: 0, level: 1 }); }],
  ['unsupported upgrade level', s => { s.buildings[0].level = 50; }],
  ['fractional part count', s => { s.parts.general = 1.5; }],
  ['unsafe part count', s => { s.parts.general = Number.MAX_SAFE_INTEGER + 1; }],
  ['mismatched world stage', s => { s.world.stage = 1; }],
  ['tutorial beyond its final step', s => { s.tutorial.step = 100; }],
  ['unknown avatar gender', s => { s.avatar.gender = 'unlisted'; }],
  ['invalid avatar color', s => { s.avatar.skinColor = '#not-a-color'; }],
  ['nonboolean avatar creation state', s => { s.avatar.created = 'false'; }],
  ['oversized avatar name', s => { s.avatar.name = 'a'.repeat(31); }],
  ['invalid team color', s => { s.team.colors = ['invalid']; }],
  ['negative player attributes', s => { s.players[0].speed = -2; }],
]) {
  test(`island save validation rejects ${label}`, () => {
    const state = initial(); corrupt(state);
    assert.equal(validateSave(state, data, registry).ok, false);
  });
}

test('island corrupt saved JSON is preserved at its original key and backed up', () => {
  const storage = memoryStorage(), raw = '{"version":2,"buildings":';
  storage.setItem(STORAGE_KEY, raw);
  const result = loadWorld(storage, data, registry, 1234);
  assert.equal(result.ok, false);
  assert.equal(result.backupKey, 'island.v1.corrupt.1234');
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(storage.getItem(result.backupKey), raw);
});

test('island unavailable browser storage reports a failure and never pretends a save succeeded', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.equal(loadWorld(storage, data, registry).reason, 'reason.storage');
  assert.equal(saveWorld(storage, initial()).reason, 'reason.storage');
  assert.equal(loadWorld(null, data, registry).reason, 'reason.storage');
});

test('island invalid imports leave the current world untouched', () => {
  const current = initial(), before = structuredClone(current);
  for (const raw of ['{', 'null', '[]', '{"version":999}', '{}']) assert.equal(importWorld(raw, current, data, registry).ok, false);
  assert.deepEqual(current, before);
});

test('island import adds nonconflicting buildings and retains current progress and currency', () => {
  const current = initial(), incoming = initial();
  current.money = 1500;
  current.tutorial = { step: 5, completed: true, skipped: false };
  current.parts.general = 8;
  current.completedMissions = ['first-park'];
  current.claimedRewards = ['tutorial.house'];
  incoming.money = 20;
  incoming.buildings.push({ id: 'imported-road', typeId: 'road', x: 0, z: 0, level: 1 });
  incoming.claimedRewards = ['tutorial.road'];
  const merged = importWorld(exportWorld(incoming), current, data, registry);
  assert.equal(merged.ok, true);
  assert.equal(merged.added, 1);
  assert.equal(merged.state.money, 1500);
  assert.equal(merged.state.parts.general, 8);
  assert.equal(merged.state.tutorial.completed, true);
  assert.deepEqual(new Set(merged.state.claimedRewards), new Set(['tutorial.house', 'tutorial.road']));
  assert.deepEqual(merged.state.completedMissions, ['first-park']);
  assert.equal(merged.state.buildings.length, current.buildings.length + 1);
  assert.equal(current.buildings.some(b => b.id === 'imported-road'), false, 'merge must not mutate the current world');
});

test('island importing the same backup twice cannot duplicate money, parts or buildings', () => {
  const current = initial(), incoming = initial();
  incoming.money = 2000; incoming.parts.general = 9;
  incoming.buildings.push({ id: 'once-only', typeId: 'road', x: 0, z: 0, level: 1 });
  const raw = exportWorld(incoming), first = importWorld(raw, current, data, registry);
  const second = importWorld(raw, first.state, data, registry);
  assert.equal(first.ok && second.ok, true);
  assert.equal(second.added, 0);
  assert.equal(second.state.money, first.state.money);
  assert.equal(second.state.parts.general, first.state.parts.general);
  assert.equal(second.state.buildings.length, first.state.buildings.length);
});

test('island import opens land already earned by merged parts without shrinking the current world', () => {
  const current = initial(), incoming = initial(); incoming.parts.general = 12;
  const merged = importWorld(exportWorld(incoming), current, data, registry);
  assert.equal(merged.ok, true);
  assert.equal(merged.state.parts.general, 12);
  assert.deepEqual(merged.state.world, { size: 24, stage: 2 });
});

test('island a conflicting imported building never removes or replaces current construction', () => {
  const current = initial(), incoming = initial();
  current.buildings.push({ id: 'current-road', typeId: 'road', x: 0, z: 0, level: 1 });
  incoming.buildings.push({ id: 'other-road', typeId: 'road', x: 0, z: 0, level: 1 });
  const merged = importWorld(exportWorld(incoming), current, data, registry);
  assert.equal(merged.ok, true);
  assert.equal(merged.conflicts, 1);
  assert.ok(merged.state.buildings.some(b => b.id === 'current-road'));
  assert.equal(merged.state.buildings.some(b => b.id === 'other-road'), false);
});
