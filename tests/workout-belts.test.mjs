import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, rankOf, rankUp, stats } from '../workout/js/logic.js';

const belts = ['חגורה לבנה', 'חגורה צהובה', 'חגורה כתומה', 'חגורה ירוקה', 'חגורה כחולה', 'חגורה שחורה'];
const thresholds = [0, 3, 8, 15, 25, 40];

test('belts use the existing workout thresholds, including both sides of every boundary', () => {
  assert.deepEqual(RANKS.map(r => r.min), thresholds);
  assert.equal(new Set(RANKS.map(r => r.color)).size, belts.length);
  for (let i = 0; i < thresholds.length; i++) {
    const count = thresholds[i];
    assert.equal(rankOf(count).belt, belts[i]);
    assert.equal(rankOf(count + 1).belt, belts[i]);
    if (i) assert.equal(rankOf(count - 1).belt, belts[i - 1]);
    assert.match(rankOf(count).color, /^#[0-9A-F]{6}$/);
  }
});

test('progress resets at a new belt and counts only the remaining workouts', () => {
  const almost = rankOf(7);
  assert.equal(almost.toNext, 1);
  assert.equal(almost.next.belt, 'חגורה כתומה');
  assert.equal(almost.progress, 4);
  assert.equal(almost.span, 5);
  assert.equal(almost.progressPct, 80);
  const next = rankOf(8);
  assert.equal(next.toNext, 7);
  assert.equal(next.progress, 0);
  assert.equal(next.span, 7);
  assert.equal(next.progressPct, 0);
  for (let count = 0; count <= 100; count++) {
    const r = rankOf(count);
    assert.ok(r.progressPct >= 0 && r.progressPct <= 100);
    if (r.next) assert.equal(r.progress + r.toNext, r.span);
  }
});

test('the final belt has no next goal, including after many more workouts', () => {
  for (const count of [40, 41, 1000]) {
    const r = rankOf(count);
    assert.equal(r.belt, 'חגורה שחורה');
    assert.equal(r.next, undefined);
    assert.equal(r.toNext, 0);
    assert.equal(r.span, 0);
    assert.equal(r.progressPct, 100);
  }
});

test('a new belt is awarded at a crossing, without a second award on reload or a rest day', () => {
  for (const min of thresholds.slice(1)) {
    assert.equal(rankUp(min - 1, min).min, min);
    assert.equal(rankUp(min, min), null);
    assert.equal(rankUp(min, min + 1), null);
  }
  assert.equal(rankUp(0, 0), null);
  assert.equal(rankUp(0, 25).belt, 'חגורה כחולה');
  assert.equal(rankUp(25, 8), null);
});

test('legacy workouts restore the same belt regardless of stars, difficulty, score or day gaps', () => {
  const sessions = Array.from({ length: 8 }, (_, i) => ({
    id: `session-${i}`, date: new Date(Date.UTC(2026, 8, 1 + i * 3)).toISOString(),
    items: [{ type: 'reps', target: 10, done: i % 2 ? 1 : 10 }],
    feedback: i % 2 ? 'hard' : 'easy', level: i % 2 ? 'easy' : 'hard', games: { score: i * 100 },
  }));
  const restored = JSON.parse(JSON.stringify(sessions));
  for (const date of [new Date('2026-10-01T12:00:00Z'), new Date('2026-10-05T12:00:00Z')]) {
    const st = stats(restored, date);
    assert.equal(st.streak, 0);
    assert.equal(rankOf(st.workouts).belt, 'חגורה כתומה');
    assert.equal(rankOf(st.workouts).toNext, 7);
  }
  const lowEffort = restored.map(s => ({ ...s, items: [] }));
  assert.deepEqual(rankOf(stats(lowEffort).workouts), rankOf(stats(restored).workouts));
});

test('invalid counts are safe and fractional counts do not award a belt early', () => {
  for (const value of [undefined, null, -10, NaN, Infinity, -Infinity, '40']) {
    assert.equal(rankOf(value).belt, 'חגורה לבנה');
    assert.equal(rankOf(value).workouts, 0);
    assert.equal(rankOf(value).toNext, 3);
    assert.equal(rankOf(value).progressPct, 0);
  }
  assert.equal(rankOf(2.99).belt, 'חגורה לבנה');
  assert.equal(rankOf(3.99).workouts, 3);
  assert.equal(rankOf(3.99).belt, 'חגורה צהובה');
});
