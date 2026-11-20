import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { buildShell as installedShell, buildFiles } from '../workout/island/tools/offline-shell.mjs';
import { createEngine } from '../workout/island/engine/engine.mjs';
import { loadData } from '../workout/island/engine/load-data.mjs';
import { installLearningV2 } from '../workout/island/assets/learning-v2/src/integration-runtime.mjs';
import { DOMAINS } from '../workout/island/assets/learning-v2/src/data.mjs';

// Ported from the Codex package (design/learning-questions-v2/tests/integration.test.mjs): the engine and the
// runtime are the ones in the repo, with a synthetic bank so the rules are tested without the real questions.
const fixtureIsland = fileURLToPath(new URL('../workout/island/', import.meta.url));
const pack = 'assets/learning-v2';
const bank = Array.from({ length: 7 }, (_, index) => index + 6).flatMap(age =>
  DOMAINS.flatMap(domain => Array.from({ length: 18 }, (_, index) => ({
    id: `${domain}-${age}-${index}`,
    domain, age, difficulty: Math.floor(index / 6) + 1, topic: 'test',
    options: ['אחת', 'שתיים', 'שלוש', 'ארבע'], answer: 0,
    followUps: { correct: `${domain}-${age}-${(index + 6) % 18}`, incorrect: `${domain}-${age}-${(index + 12) % 18}` },
  }))));

const data = await loadData(new URL('./', pathToFileURL(fixtureIsland)), async url => ({
  ok: true,
  json: async () => JSON.parse(await readFile(url, 'utf8')),
}));

const startTime = Date.UTC(2026, 10, 18, 12);
function makeStorage() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}
function fixture({ enabled = true, storage = makeStorage(), now = () => startTime } = {}) {
  const engine = createEngine(data, {
    storage, now,
    installLearningV2: enabled ? (engine, context) => installLearningV2(engine, { ...context, load: async () => bank, random: () => 0 }) : undefined,
  });
  return { engine, v2: engine.learningV2, storage };
}
function answerCorrect(v2) {
  assert.equal(v2.answer(v2.current().question.answer).correct, true);
}

test('manual construction needs a correct answer and rewards the first building once, including after undo', async () => {
  const { engine, v2 } = fixture();
  engine.skipTutorial();
  assert.equal(v2.setAge(8).ok, true);
  const target = { typeId: 'powerPlant', x: 8, z: 5 };
  const cost = engine.registry.buildings.get(target.typeId).cost;
  const place = () => engine.place(target.typeId, target.x, target.z);
  const initial = engine.state.money;
  assert.deepEqual(place(), { ok: false, reason: 'learning.v2.cityQuestion' });
  assert.equal(engine.state.money, initial);
  await v2.prepare();
  assert.equal(v2.startBuild(target).ok, true);
  const first = v2.current().question;
  assert.equal(v2.answer(1).resolved, false);
  assert.equal(v2.answer(1).ok, false);
  assert.deepEqual(v2.answer(2), { ok: true, correct: false, resolved: true });
  assert.equal(v2.commitBuild().ok, false);
  assert.equal(engine.state.money, initial);
  assert.equal(v2.advance().ok, true);
  assert.notEqual(v2.current().question.id, first.id);
  answerCorrect(v2);
  v2.cancel();
  assert.equal(v2.commitBuild().ok, false);
  assert.equal(engine.state.money, initial);

  assert.equal(v2.startBuild(target).ok, true);
  answerCorrect(v2);
  assert.equal(engine.state.money, initial);
  const built = v2.commitBuild();
  assert.equal(built.learningReward, 12);
  assert.equal(engine.state.money, initial - cost + 12);
  assert.equal(v2.commitBuild().ok, false);
  assert.equal(engine.state.claimedRewards.filter(id => id === 'learning-v2.building.powerPlant').length, 1);
  assert.equal(engine.undo().ok, true);
  assert.equal(engine.state.money, initial + 12);
  assert.equal(v2.needsBuildingQuestion(target.typeId), false);
  assert.equal(place().ok, true);
  assert.equal(engine.state.money, initial - cost + 12);
  assert.equal(engine.reset().ok, true);
  assert.equal(v2.setAge(8).ok, true);
  assert.equal(v2.needsBuildingQuestion(target.typeId), true);
});

test('prepared plots and direct builds share the gate and revalidate an open question before paying', async () => {
  const { engine, v2 } = fixture();
  engine.skipTutorial();
  engine.enableReadyBuilding();
  v2.setAge(12);
  await v2.prepare();
  const plot = engine.readyPlotForType('basketball');
  assert.ok(plot.ok);
  const target = { ...plot, plotId: plot.id };
  assert.equal(engine.buildReadyPlot(plot.id).reason, 'learning.v2.cityQuestion');
  assert.equal(v2.startBuild({ ...target, plotId: 'stale' }).ok, false);
  assert.equal(v2.startBuild(target).ok, true);
  answerCorrect(v2);
  const initial = engine.state.money;
  engine.state.money = 0;
  assert.equal(v2.commitBuild().ok, false);
  assert.equal(engine.state.money, 0);
  assert.equal(engine.state.claimedRewards.includes('learning-v2.building.basketball'), false);
  v2.cancel();
  engine.state.money = initial;
  assert.equal(v2.startBuild(target).ok, true);
  answerCorrect(v2);
  const built = v2.commitBuild();
  assert.equal(built.plotId, plot.id);
  assert.equal(built.learningReward, 12);
  assert.equal(engine.state.money, initial - engine.registry.buildings.get('basketball').cost + 12);
});

test('a transient save error keeps the reward and building together and can be retried', async () => {
  const backing = makeStorage();
  let storageAvailable = true;
  const storage = { ...backing, setItem: (key, value) => {
    if (!storageAvailable) throw new Error('storage unavailable');
    backing.setItem(key, value);
  } };
  const { engine, v2 } = fixture({ storage });
  engine.skipTutorial();
  v2.setAge(8);
  await v2.prepare();
  assert.equal(v2.startBuild({ typeId: 'powerPlant', x: 8, z: 5 }).ok, true);
  answerCorrect(v2);
  storageAvailable = false;
  const built = v2.commitBuild();
  assert.equal(built.learningReward, 12);
  assert.equal(engine.storageStatus.ok, false);
  assert.equal(v2.commitBuild().ok, false);

  storageAvailable = true;
  assert.equal(engine.save().ok, true);
  const restored = fixture({ storage }).engine;
  assert.ok(restored.state.buildings.some(building => building.id === built.id));
  assert.equal(restored.state.claimedRewards.filter(id => id === 'learning-v2.building.powerPlant').length, 1);
  assert.equal(restored.state.money, engine.state.money);
});

test('the city hall serves geography, records hints, and completes a daily round once', async () => {
  let time = startTime;
  const { engine, v2, storage } = fixture({ now: () => time });
  engine.skipTutorial();
  v2.setAge(12);
  time += 86_400_000;
  assert.deepEqual([engine.learningStatus().target, engine.learningStatus().locked], [2, true]);
  await v2.prepare();
  assert.equal(v2.startRound('general').ok, true);
  const first = v2.current().question;
  assert.equal(first.domain, 'general');
  assert.equal(first.age, 12);
  assert.equal(v2.useHint(), true);
  answerCorrect(v2);
  assert.equal(v2.useHint(), false);
  assert.equal(v2.advance().done, undefined);
  const seen = new Set([first.id]);
  const money = engine.state.money;
  for (let index = 1; index < 8; index++) {
    const question = v2.current().question;
    assert.equal(question.domain, 'general');
    assert.equal(seen.has(question.id), false);
    seen.add(question.id);
    answerCorrect(v2);
    const next = v2.advance();
    if (index === 7) assert.deepEqual(next.result, { money: 57, stars: 3, station: 'general', firstTry: 7, retried: 1, total: 8 });
  }
  assert.equal(v2.advance().ok, false);
  assert.equal(engine.state.money, money + 57);
  assert.equal(engine.state.learning.generalStars, undefined);
  assert.equal(engine.state.learning.v2.generalStars, 3);
  assert.equal(engine.learningStatus().rounds, 1);
  assert.equal(engine.state.learning.lastMissionDate, null);
  const reloaded = fixture({ storage, now: () => time });
  assert.equal(reloaded.v2.age(), 12);
  await reloaded.v2.prepare();
  assert.equal(reloaded.v2.startRound('general').ok, true);
  assert.equal(seen.has(reloaded.v2.current().question.id), false);
  const rolledBack = fixture({ enabled: false, storage, now: () => time });
  assert.equal(rolledBack.engine.storageStatus.ok, true);
  assert.equal(rolledBack.engine.state.learning.age, 4);
  assert.equal(rolledBack.engine.startLearning('language').ok, true);
  assert.equal(rolledBack.engine.learningRound().total, 5);
});

test('backup import restores the new age and takes the highest geography stars', async () => {
  const source = fixture(), destination = fixture();
  source.v2.setAge(12);
  source.engine.state.learning.v2.generalStars = 5;
  destination.v2.setAge(9);
  destination.engine.state.learning.v2.generalStars = 8;
  const restored = destination.engine.importJSON(source.engine.exportJSON());
  assert.equal(restored.ok, true);
  assert.equal(destination.v2.age(), 12);
  assert.equal(destination.engine.state.learning.v2.generalStars, 8);
});

test('ages four and five and the legacy engine build without the new gate', () => {
  for (const enabled of [true, false]) {
    const { engine, v2 } = fixture({ enabled });
    engine.skipTutorial();
    if (enabled) assert.equal(v2.setAge(5).ok, true);
    const result = engine.place('powerPlant', 8, 5);
    assert.equal(result.ok, true);
    assert.equal(result.learningReward, undefined);
    assert.equal(engine.startLearning('math').ok, true);
    assert.equal(engine.learningRound().total, 5);
  }
});

test('offline shell includes and hashes the integration and all five data files', async () => {
  const shell = await installedShell(fixtureIsland);
  const expected = [
    ...['adaptive.mjs', 'data.mjs', 'integration-runtime.mjs', 'integration.mjs', 'integration.css'].map(name => `${pack}/src/${name}`),
    ...DOMAINS.map(domain => `${pack}/data/${domain}.json`),
  ];
  for (const path of expected) assert.ok(shell.includes(path), path);
  const files = await buildFiles({ shell: expected }, fixtureIsland);
  for (const path of expected) {
    assert.match(files[path][0], /^[0-9a-f]{16}$/);
    assert.ok(files[path][1] > 0);
  }
});
