import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../workout/island/engine/load-data.mjs';
import { createEngine } from '../workout/island/engine/engine.mjs';
import { createInitialState, STORAGE_KEY } from '../workout/island/engine/persistence.mjs';

const requested = [];
const base = await loadData(new URL('../workout/island/', import.meta.url), async url => {
  requested.push(url.href);
  return { ok: true, json: async () => JSON.parse(await readFile(url, 'utf8')) };
});
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
function fixture(flags = {}) {
  const storage = memoryStorage();
  const data = { ...base, featureFlags: { ...base.featureFlags, ...flags } };
  return { engine: createEngine(data, { storage, now: () => 1000 }), storage, data };
}
function finishTutorial(engine) {
  for (const step of base.tutorial.steps) {
    const target = base.config.tutorialPlacements[step.id];
    assert.equal(engine.place(step.buildType, target.x, target.z).ok, true, `tutorial ${step.id}`);
  }
  assert.equal(engine.state.tutorial.completed, true);
}

test('island bundled data loads through local file URLs and joins balance values for the view', () => {
  assert.ok(requested.every(url => url.startsWith('file:')));
  assert.equal(base.buildings.filter(b => !b.locked).length, 17);
  assert.equal(base.buildings.find(b => b.id === 'house').cost, base.config.buildings.house.cost);
  assert.deepEqual(base.buildings.find(b => b.id === 'soccer').footprint, [4, 3]);
  assert.equal(base.tutorial.steps.length, 5);
  assert.equal(base.episodes.length, 1);
});

test('island data loader stops on missing JSON and rejects extension paths outside its folder', async () => {
  await assert.rejects(loadData(new URL('../workout/island/', import.meta.url), async () => ({ ok: false })), /reason.data/);
  await assert.rejects(loadData(new URL('../workout/island/', import.meta.url), async url => ({
    ok: true,
    json: async () => url.pathname.endsWith('/extensions.json') ? { modules: ['../outside.mjs'] } : JSON.parse(await readFile(url, 'utf8')),
  })), /reason.invalid/);
});

test('island first save has seed access roads, shared money, four resources and no account', () => {
  const { engine } = fixture();
  assert.equal(engine.state.money, base.config.startingMoney);
  assert.deepEqual(engine.state.resources, base.config.startingResources);
  assert.ok(engine.state.buildings.every(b => b.typeId === 'road'));
  assert.equal(engine.state.avatar.created, false);
  assert.equal(engine.state.world.size, 16);
  assert.equal(engine.state.version, 3);
});

test('island character choices persist and unlisted choices do not replace the avatar', () => {
  const { engine, storage, data } = fixture();
  assert.equal(engine.setAvatar({ gender: 'girl', hairstyle: 'long', shirtColor: data.avatar.shirtColors[1].color, created: true }).ok, true);
  const before = structuredClone(engine.state.avatar);
  assert.equal(engine.setAvatar({ gender: 'unknown' }).ok, false);
  assert.deepEqual(engine.state.avatar, before);
  const reloaded = createEngine(data, { storage });
  assert.deepEqual(reloaded.state.avatar, before);
});

test('island rejected purchases do not consume money, allocate IDs or create undo records', () => {
  const { engine } = fixture();
  const before = engine.exportJSON();
  assert.equal(engine.place('house', 0, 0).reason, 'reason.road');
  assert.equal(engine.place('wall', 0, 0).reason, 'reason.locked');
  assert.equal(engine.place('missing', 0, 0).ok, false);
  assert.equal(engine.exportJSON(), before);
  assert.equal(engine.canUndo(), false);
});

test('island tutorial advances only after the requested construction and reaches all five steps', () => {
  const { engine } = fixture();
  assert.equal(engine.nextObjective().buildType, 'house');
  assert.equal(engine.place('road', 12, 6).ok, true);
  assert.equal(engine.state.tutorial.step, 0, 'an unrelated road cannot complete the house step');
  assert.equal(engine.undo().ok, true);
  finishTutorial(engine);
  assert.equal(engine.nextObjective().kind, 'mission');
  assert.equal(engine.state.claimedRewards.filter(id => id.startsWith('tutorial.')).length, 5);
});

test('island undo retains earned income and once-only tutorial rewards without duplication', () => {
  const { engine } = fixture();
  const start = engine.state.money;
  assert.equal(engine.place('house', 4, 5).ok, true);
  const earned = engine.tick(60).gained.money;
  assert.equal(engine.undo().ok, true);
  assert.equal(engine.state.money, start + base.config.tutorialRewards.house.money + earned);
  assert.equal(engine.state.tutorial.step, 1, 'undo must not erase completed progress');
  engine.restartTutorial();
  const placed = engine.place('house', 4, 5);
  assert.equal(placed.reward.paid, false, 'replaying a guide step cannot pay twice');
  assert.equal(engine.state.claimedRewards.filter(id => id === 'tutorial.house').length, 1);
});

test('island moving, upgrading, removing and undoing change only their own costs and geometry', () => {
  const { engine } = fixture();
  const placed = engine.place('house', 4, 5), home = engine.state.buildings.find(b => b.id === placed.id);
  const money = engine.state.money;
  assert.equal(engine.move(home.id, 5, 5).ok, true);
  assert.equal(engine.state.money, money);
  engine.undo(); assert.deepEqual([home.x, home.z], [4, 5]);
  assert.equal(engine.upgrade(home.id).ok, true);
  assert.equal(home.level, 2);
  engine.undo(); assert.equal(home.level, 1); assert.equal(engine.state.money, money);
  const removed = engine.remove(home.id);
  assert.equal(removed.ok, true);
  assert.ok(removed.refund > 0);
  engine.undo();
  assert.ok(engine.state.buildings.some(b => b.id === home.id));
  assert.equal(engine.state.money, money);
});

test('island undo does not duplicate citizens or buildings when called beyond history', () => {
  const { engine } = fixture(), initialCount = engine.state.buildings.length;
  engine.place('house', 4, 5);
  engine.undo();
  const before = engine.exportJSON();
  assert.equal(engine.undo().ok, false);
  assert.equal(engine.exportJSON(), before);
  assert.equal(engine.state.buildings.length, initialCount);
  assert.equal(engine.population(), 0);
});

test('island expansion adds land while preserving existing construction and resources', () => {
  const { engine } = fixture();
  engine.place('house', 4, 5);
  const buildings = structuredClone(engine.state.buildings), resources = structuredClone(engine.state.resources);
  assert.equal(engine.grantParts('general', 5).expanded, true);
  assert.equal(engine.state.world.size, 20);
  assert.equal(engine.grantParts('general', 7).expanded, true);
  assert.equal(engine.state.world.size, 24);
  assert.deepEqual(engine.state.buildings, buildings);
  assert.deepEqual(engine.state.resources, resources);
  for (const count of [-1, 1.2, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.equal(engine.grantParts('general', count).ok, false);
});

test('island completed world reload preserves buildings, avatar and claimed rewards', () => {
  const { engine, storage, data } = fixture();
  engine.setAvatar({ created: true }); finishTutorial(engine);
  engine.save();
  const reloaded = createEngine(data, { storage });
  for (const key of ['buildings', 'avatar', 'claimedRewards', 'tutorial', 'parts', 'resources', 'money']) assert.deepEqual(reloaded.state[key], engine.state[key]);
});

test('island engine refuses to overwrite a corrupt stored world even after an autosave command', () => {
  const storage = memoryStorage(), raw = '{broken';
  storage.setItem(STORAGE_KEY, raw);
  const engine = createEngine(base, { storage, now: () => 1234 });
  assert.equal(engine.storageStatus.ok, false);
  engine.tick(1); engine.save();
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(storage.getItem(`${STORAGE_KEY}.corrupt.1234`), raw);
});

test('island failed import persistence never replaces the live progress', () => {
  let fail = false;
  const storage = memoryStorage(), setItem = storage.setItem;
  storage.setItem = (key, value) => { if (fail) throw new Error('quota'); setItem(key, value); };
  const engine = createEngine(base, { storage, now: () => 1000 });
  engine.place('house', 4, 5);
  const backup = createInitialState(base, 1000); backup.money = 9000;
  const before = engine.exportJSON(); fail = true;
  assert.equal(engine.importJSON(JSON.stringify(backup)).reason, 'reason.storage');
  assert.equal(engine.exportJSON(), before);
});

test('island importing a backup resets undo history so old actions cannot corrupt merged buildings', () => {
  const { engine } = fixture(); engine.place('house', 4, 5);
  assert.equal(engine.canUndo(), true);
  assert.equal(engine.importJSON(engine.exportJSON()).ok, true);
  assert.equal(engine.canUndo(), false);
  const before = engine.exportJSON(); engine.undo(); assert.equal(engine.exportJSON(), before);
});

test('island all five extension examples register through one-file installers', () => {
  const { engine } = fixture();
  assert.ok(engine.registry.buildings.has('flowerGarden'));
  assert.ok(engine.registry.sports.has('practiceSport'));
  assert.ok(engine.registry.minigames.has('practiceContract'));
  assert.ok(engine.registry.eventTypes.has('friendlyVisit'));
  assert.ok(engine.registry.metrics.has('teamSpirit'));
  assert.equal(engine.validatePlacement('flowerGarden', 4, 6).reason, 'reason.locked');
  assert.equal('teamSpirit' in engine.metrics(), false);
});

test('island new building, sport and event types work without edits to the engine', () => {
  const { engine } = fixture({ events: true });
  engine.registerBuilding({ id: 'testKiosk', title: 'test.kiosk', footprint: [1, 1], cost: 2, radius: 1, income: 2, effects: {}, levels: [{ cost: 0 }] });
  assert.equal(engine.place('testKiosk', 0, 0).ok, true);
  engine.registerSport({ id: 'testSport', title: 'test.sport', teamSize: 2, buildingId: 'testKiosk' });
  assert.equal(engine.registry.sports.get('testSport').teamSize, 2);
  engine.registerEventType({ id: 'testVisit', warningId: 'test.warning', prepare: () => ({ visitors: 2 }) });
  assert.deepEqual(engine.prepareEvent('testVisit'), { ok: true, warningId: 'test.warning', prepared: { visitors: 2 } });
  assert.throws(() => engine.registerBuilding({ id: 'testKiosk' }), /reason.duplicate/);
});

test('island a future minigame receives the time contract without starting gameplay in this release', () => {
  const { engine } = fixture({ minigames: true });
  engine.registerMinigame({ id: 'testContract', title: 'test.game', start: ctx => ({ allowed: ctx.canPlay(), spent: ctx.spendPlayTime(5) }), onResult: result => result });
  assert.deepEqual(engine.startMinigame('testContract').session, { allowed: true, spent: true });
  assert.throws(() => engine.registerMinigame({ id: 'invalidGame', start() {} }), /reason.invalid/);
  assert.equal(fixture().engine.startMinigame('practiceContract').ok, false);
});

test('island example episode is loaded from JSON, gated and rewarded at most once', () => {
  const { engine } = fixture();
  assert.equal(engine.startEpisode('missing').ok, false);
  assert.equal(engine.startEpisode('firstVisit', { testMode: true }).ok, false);
  finishTutorial(engine);
  assert.equal(engine.startEpisode('firstVisit').ok, false, 'sample content stays hidden in ordinary play');
  const episode = engine.startEpisode('firstVisit', { testMode: true });
  assert.equal(episode.ok, true);
  assert.ok(episode.episode.dialogues.length > 0);
  const money = engine.state.money;
  assert.equal(engine.completeEpisode('firstVisit', { testMode: true }).paid, true);
  assert.equal(engine.completeEpisode('firstVisit', { testMode: true }).paid, false);
  assert.equal(engine.state.money, money + base.config.episodeRewards.firstVisit.money);
});

test('island disabled feature flags suppress economy, sports and metrics without removing saved content', () => {
  const { engine } = fixture({ economy: false, sportFacilities: false, metrics: false });
  const money = engine.state.money; engine.tick(30);
  assert.equal(engine.state.money, money);
  assert.deepEqual(engine.metrics(), {});
  assert.equal(engine.validatePlacement('soccer', 3, 8).reason, 'reason.locked');
});
