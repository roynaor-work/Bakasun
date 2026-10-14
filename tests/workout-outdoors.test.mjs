import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTDOOR_TASKS, outdoorAge, outdoorTask, pickOutdoorTask, outdoorStars, pendingOutdoor } from '../workout/js/outdoors.js';
import { VOICE_BY_ID, splitVoiceText } from '../workout/js/voice-lines.js';
import { summarize, stats, suggestLevel } from '../workout/js/logic.js';

const now = new Date('2026-10-14T12:00:00Z');
const item = { exId: 'squats', type: 'reps', target: 10, done: 10 };
const completion = { taskId: 'wall-8', age: 8, completedAt: now.toISOString() };

test('24 missions cover ages 6–9 and each has one plain child sentence and a catalog voice', () => {
  assert.equal(OUTDOOR_TASKS.length, 24);
  assert.equal(new Set(OUTDOOR_TASKS.map(t => t.id)).size, 24);
  for (const age of [6, 7, 8, 9]) {
    const tasks = OUTDOOR_TASKS.filter(t => t.age === age);
    assert.equal(tasks.length, 6);
    for (const task of tasks) {
      const line = VOICE_BY_ID[task.voiceId];
      assert.ok(task.name.length < 20);
      assert.match(line.text, /^[^.!?]+[.!?]$/u);
      assert.doesNotMatch(line.text, /[\u0591-\u05c7]|סמיכה/u);
      assert.match(line.tts, /[\u0591-\u05c7]/u);
      assert.deepEqual(splitVoiceText(line.text).map(p => p.id), [task.voiceId]);
    }
  }
});

test('selection rotates only within the saved age, including repeated/skipped workouts', () => {
  for (const age of [6, 7, 8, 9]) {
    const sessions = [];
    for (let i = 0; i < 7; i++) {
      const task = pickOutdoorTask(age, sessions);
      assert.equal(task.age, age);
      assert.notEqual(task.id, sessions.at(-1)?.outdoor.taskId);
      sessions.push({ outdoor: { taskId: task.id, age } });
    }
    assert.equal(sessions[0].outdoor.taskId, sessions[6].outdoor.taskId);
  }
  for (const age of [undefined, null, '8', 5, 10, NaN]) assert.equal(outdoorAge(age), 6);
  assert.equal(outdoorTask('missing'), null);
});

test('completion adds exactly one star to summary, history and weekly totals, without altering effort or progression', () => {
  const original = { items: Array.from({ length: 5 }, () => ({ ...item })), duration: 60 };
  const withOutdoor = { ...original, outdoor: completion };
  assert.equal(summarize(original).stars, 3);
  assert.equal(summarize(withOutdoor).stars, 4);
  assert.equal(summarize(withOutdoor).reps, 50);
  assert.equal(stats([withOutdoor]).stars, 4);
  assert.equal(suggestLevel([withOutdoor, withOutdoor, withOutdoor], 'easy'), suggestLevel([original, original, original], 'easy'));
  assert.equal(summarize({ items: [], outdoor: completion }).stars, 1);
  for (const outdoor of [null, {}, { ...completion, taskId: 'fake' }, { ...completion, age: 6 },
    { ...completion, completedAt: undefined }, { ...completion, completedAt: 'bad' }, { ...completion, completedAt: true }]) assert.equal(outdoorStars(outdoor), 0);
});

test('saved completion survives reload, cannot be claimed twice, and failed saving awards no star', async () => {
  let raw = JSON.stringify({ profile: { name: '', ratioV2: true, noTimerV1: true }, sessions: [
    { id: 'first', items: [item], outdoor: { taskId: 'wall-8', age: 8 } },
    { id: 'second', items: [item], outdoor: { taskId: 'tree-8', age: 8 } },
  ], tokens: 7, parent: { pinHash: 'synthetic', outdoorAge: 8, together: { mode: 'challenge', exId: 'squats', target: 5 } } });
  let fail = false;
  globalThis.localStorage = { getItem: () => raw, setItem: (key, value) => { if (fail) throw new Error('full'); raw = value; } };
  try {
    const { store } = await import('../workout/js/store.js?outdoor-test');
    assert.equal(store.parent.outdoorEnabled, true);
    assert.equal(pendingOutdoor(store.sessions).id, 'second');
    const before = structuredClone(store.data);
    assert.equal(store.completeOutdoor('first', now), true);
    assert.equal(store.completeOutdoor('first', now), false);
    assert.equal(store.completeOutdoor('missing', now), false);
    const reloaded = (await import('../workout/js/store.js?outdoor-reload')).store;
    assert.equal(summarize(reloaded.sessions[0]).stars, 4);
    assert.equal(reloaded.tokens, 7);
    assert.deepEqual(reloaded.sessions[0].items, before.sessions[0].items);
    assert.deepEqual(reloaded.parent.together, before.parent.together);
    store.setParent({ outdoorEnabled: false });
    assert.equal(store.completeOutdoor('second', now), false);
    store.setParent({ outdoorEnabled: true }); fail = true;
    assert.equal(store.completeOutdoor('second', now), false);
    assert.equal(outdoorStars(store.sessions[1].outdoor), 0);
    fail = false;
    assert.equal(store.completeOutdoor('second', now), true);
    assert.equal(pendingOutdoor(store.sessions), null);
  } finally { delete globalThis.localStorage; }
});
