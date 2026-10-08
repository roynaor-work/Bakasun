import { test } from 'node:test';
import assert from 'node:assert/strict';
import { togetherChoice, buildTogetherWorkout, togetherLabel } from '../workout/js/together.js';
import { buildItems, summarize, stats } from '../workout/js/logic.js';
import { programById, PROGRAMS } from '../workout/js/programs.js';
import { byId } from '../workout/js/exercises.js';

const build = (choice, level = 'normal', boost = {}) => buildTogetherWorkout(choice, programById, byId, level, boost);

test('no activity starts without a valid parent choice', () => {
  for (const choice of [null, undefined, {}, { mode: 'solo' },
    { mode: 'workout', programId: 'missing' }, { mode: 'workout', programId: 'toString' },
    { mode: 'challenge', exId: '__proto__', target: 10 }]) assert.equal(build(choice), null);
});

test('parent choices retain only the activity fields', () => {
  const choice = { mode: 'challenge', exId: 'squats', target: 8, name: 'private', winner: 'dad' };
  assert.deepEqual(togetherChoice(choice, programById, byId), { mode: 'challenge', exId: 'squats', target: 8 });
  assert.deepEqual(togetherChoice({ mode: 'workout', programId: 'full', target: 999 }, programById, byId), { mode: 'workout', programId: 'full' });
});

test('challenge targets reject empty, fractional, negative and oversized input', () => {
  for (const target of [0, -1, 1.5, NaN, Infinity, '10', undefined, 101])
    assert.equal(build({ mode: 'challenge', exId: 'squats', target }), null);
  for (const target of [1, 100]) assert.equal(build({ mode: 'challenge', exId: 'squats', target }).items[0].target, target);
  assert.equal(build({ mode: 'challenge', exId: 'plank', target: 181 }), null);
  for (const target of [1, 180]) assert.equal(build({ mode: 'challenge', exId: 'plank', target }).items[0].target, target);
});

test('all shared programs preserve the ordinary workout items and personal difficulty', () => {
  const boost = { boost: 2, swaps: 1 };
  for (const program of PROGRAMS) {
    const before = JSON.stringify(program);
    const activity = build({ mode: 'workout', programId: program.id }, 'easy', boost);
    assert.deepEqual(activity.items, buildItems(program, byId, 'easy', boost));
    assert.equal(activity.program.id, program.id);
    assert.ok(activity.program.name.startsWith('אבא ואני: '));
    assert.equal(JSON.stringify(program), before, 'the catalog is unchanged');
  }
});

test('a joint challenge uses the parent target exactly, for reps or seconds', () => {
  for (const [exId, type] of [['squats', 'reps'], ['plank', 'time']]) {
    const activity = build({ mode: 'challenge', exId, target: 12 }, 'pro', { boost: 5, swaps: 2 });
    assert.equal(activity.items.length, 1);
    assert.equal(activity.items[0].exId, exId);
    assert.equal(activity.items[0].type, type);
    assert.equal(activity.items[0].target, 12);
    assert.equal(activity.program.id, 'together-challenge');
  }
});

test('an active activity keeps its choice if the parent later changes the plan', () => {
  const choice = { mode: 'challenge', exId: 'squats', target: 8 };
  const activity = build(choice);
  choice.exId = 'plank'; choice.target = 30;
  assert.deepEqual(activity.choice, { mode: 'challenge', exId: 'squats', target: 8 });
  const resumed = JSON.parse(JSON.stringify({ together: activity.choice, program: activity.program, items: activity.items }));
  assert.deepEqual(resumed.together, activity.choice);
  assert.deepEqual(resumed.items, activity.items);
});

test('shared metadata adds no adult repetitions, extra stars or extra workouts', () => {
  const activity = build({ mode: 'challenge', exId: 'squats', target: 10 });
  const session = { date: '2026-10-08T10:00:00Z', duration: 30,
    items: activity.items.map(it => ({ ...it, done: 3 })) };
  const shared = { ...session, together: activity.choice, dadReps: 100, winner: 'dad' };
  assert.deepEqual(summarize(shared), summarize(session));
  assert.equal(summarize(shared).reps, 3);
  assert.equal(summarize(shared).stars, 2);
  assert.equal(stats([shared]).workouts, 1);
  const skipped = { ...shared, items: shared.items.map(it => ({ ...it, done: 0, skipped: true })) };
  assert.equal(summarize(skipped).stars, 0);
});

test('mode labels distinguish shared workouts and challenges', () => {
  assert.equal(togetherLabel({ mode: 'workout' }), 'אבא ואני · אימון משותף');
  assert.equal(togetherLabel({ mode: 'challenge' }), 'אבא ואני · אתגר משותף');
  assert.equal(togetherLabel(null), '');
});

test('old local data loads unchanged and a parent choice survives reloading storage', async () => {
  const old = { profile: { name: '', level: 'easy', ratioV2: true, noTimerV1: true },
    parent: { pinHash: 'synthetic-hash' }, sessions: [{ id: 'existing', items: [] }], tokens: 4,
    games: { resetV: 2, bests: { snake: 42 }, played: {}, recent: [], count: 1 } };
  let raw = JSON.stringify(old);
  globalThis.localStorage = { getItem: () => raw, setItem: (key, value) => { assert.equal(key, 'kidfit.v1'); raw = value; } };
  try {
    const { store } = await import('../workout/js/store.js?together-storage-test');
    assert.equal(store.parent.together, null);
    assert.deepEqual(store.sessions, old.sessions);
    assert.equal(store.tokens, 4);
    const choice = { mode: 'workout', programId: 'full' };
    store.setParent({ together: choice });
    const reloaded = (await import('../workout/js/store.js?together-reload-test')).store;
    assert.deepEqual(reloaded.parent.together, choice);
    assert.equal(reloaded.parent.pinHash, old.parent.pinHash);
    assert.equal(reloaded.games.bests.snake, 42);
    assert.deepEqual(reloaded.sessions, old.sessions);
    assert.equal(reloaded.profile.level, 'easy');
  } finally { delete globalThis.localStorage; }
});
