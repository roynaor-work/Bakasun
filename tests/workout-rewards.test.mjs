import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutReward, gameReward, summarize, stats, suggestLevel } from '../workout/js/logic.js';

const item = (done, target = 10, type = 'reps') => ({ exId: 'squats', type, target, done });

test('a partial workout earns effort even below the target or after a hard workout', () => {
  const items = [item(1), item(0), item(0)];
  const reward = workoutReward(items);
  assert.equal(reward.stars, 1);
  assert.deepEqual(reward.reasons, ['על שניסית וזזת']);
  assert.equal(summarize({ items, feedback: 'hard' }).stars, 1);
  assert.equal(workoutReward([item(1, 30, 'time'), item(0)]).stars, 1);
});

test('perseverance recognizes trying most exercises without completing every target', () => {
  const items = Array.from({ length: 10 }, (_, i) => item(i < 6 ? 1 : 0));
  assert.equal(workoutReward(items).stars, 1);
  items[6].done = 1;
  assert.equal(workoutReward(items).stars, 2);
  assert.deepEqual(workoutReward(items).reasons, ['על שניסית וזזת', 'על שהתמדת באימון']);
});

test('completion adds the third star and extra reps do not add more stars', () => {
  for (const items of [[item(10)], [item(10), item(30, 30, 'time')], [item(1000)]]) {
    assert.equal(workoutReward(items).stars, 3);
    assert.equal(workoutReward(items).reasons.at(-1), 'על שסיימת את כל התרגילים');
  }
});

test('an empty or skipped workout earns no stars and receives a warm rest message', () => {
  for (const items of [[], [item(0)], [item(10, 10), item(0)].map(i => ({ ...i, skipped: true }))]) {
    const reward = workoutReward(items);
    assert.equal(reward.stars, 0);
    assert.deepEqual(reward.reasons, []);
    assert.match(reward.message, /אפשר לנוח/);
    assert.equal(summarize({ items }).stars, 0);
  }
  assert.equal(workoutReward().stars, 0);
});

test('invalid counts and zero targets cannot produce a completion award', () => {
  for (const done of [undefined, NaN, Infinity, -1, '10']) assert.equal(workoutReward([item(done)]).stars, 0);
  for (const target of [undefined, NaN, Infinity, 0, -1, '10']) {
    const sum = summarize({ items: [item(1, target)] });
    assert.equal(sum.stars, 2);
    assert.equal(sum.full, 0);
  }
});

test('saved legacy workouts retain their totals, rewards and level suggestion after reload', () => {
  const sessions = [
    { date: '2026-10-01T12:00:00Z', duration: 60, items: [item(1), item(0), item(0)] },
    { date: '2026-10-02T12:00:00Z', duration: 120, items: [item(10), item(30, 30, 'time')] },
  ];
  const restored = JSON.parse(JSON.stringify(sessions));
  const st = stats(restored, new Date('2026-10-02T15:00:00Z'));
  assert.equal(st.stars, 4);
  assert.equal(st.totalReps, 11);
  assert.equal(st.totalSeconds, 30);
  assert.equal(st.totalDuration, 180);
  assert.deepEqual(summarize(restored[1]).starReasons, workoutReward(sessions[1].items).reasons);
  const complete = { items: Array.from({ length: 6 }, () => item(10)) };
  assert.equal(suggestLevel([complete, complete, complete], 'normal'), 'hard');
  assert.equal(suggestLevel([complete, { items: complete.items.map(i => ({ ...i, done: 1 })) }, complete], 'normal'), null);
});

test('game rewards are identical for losses, wins, zero scores and personal records', () => {
  const effort = { attempts: 3, completed: true };
  const expected = gameReward(effort);
  assert.equal(expected.stars, 3);
  for (const outcome of [
    { score: 0, best: 1000, won: false }, { score: 100, best: 1000, won: false },
    { score: 1000, best: 1000, won: true }, { score: 2000, best: 1000, won: true },
  ]) assert.deepEqual(gameReward({ ...effort, ...outcome }), expected);
});

test('game effort survives an early exit; completion does not require winning', () => {
  assert.equal(gameReward({ attempts: 1 }).stars, 1);
  assert.equal(gameReward({ attempts: 3 }).stars, 2);
  assert.equal(gameReward({ attempts: 1, completed: true }).stars, 2);
  assert.deepEqual(gameReward({ attempts: 3, completed: true }).reasons,
    ['על שניסית לשחק', 'על שהמשכת לנסות', 'על שסיימת את הסבב']);
  assert.equal(gameReward({ attempts: 100, completed: true }).stars, 3);
});

test('an unplayed game and an automatic demo do not award stars', () => {
  assert.equal(gameReward().stars, 0);
  assert.equal(gameReward({ completed: true }).stars, 0);
  assert.equal(gameReward({ attempts: 100, completed: true, demo: true }).stars, 0);
  for (const attempts of [-1, NaN, Infinity, '3']) assert.equal(gameReward({ attempts, completed: true }).stars, 0);
});
