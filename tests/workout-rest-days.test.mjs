import test from 'node:test';
import assert from 'node:assert/strict';
import { restProgress, restBadges } from '../workout/js/rest-days.js';
import { stats, rankOf, unlockCredits } from '../workout/js/logic.js';
import { companionProgress } from '../workout/js/companion.js';

const sessions = dates => dates.map((date, i) => ({ id: `rest-test-${i}`, date,
  items: [{ type: 'reps', target: 10, done: 10 }], duration: 60 }));

test('one free day preserves training days, without counting the free day', () => {
  const history = sessions(['2026-10-05', '2026-10-06']);
  assert.deepEqual(restProgress(history, '2026-10-08'), { days: 2, best: 2, restUsed: true, trainedToday: false });
  history.push(...sessions(['2026-10-08']));
  assert.deepEqual(restProgress(history, '2026-10-08'), { days: 3, best: 3, restUsed: true, trainedToday: true });
  assert.equal(restProgress(history, '2026-10-09').days, 3);
});

test('isolated free days can repeat; two consecutive free days start a new run', () => {
  const history = sessions(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-06']);
  assert.equal(restProgress(history, '2026-10-06').days, 4);
  assert.deepEqual(restProgress(history, '2026-10-09'), { days: 0, best: 4, restUsed: false, trainedToday: false });
  history.push(...sessions(['2026-10-09']));
  assert.deepEqual(restProgress(history, '2026-10-09'), { days: 1, best: 4, restUsed: false, trainedToday: true });
});

test('ordering, duplicate workouts, invalid and future dates do not inflate the run', () => {
  const history = sessions(['2026-10-06', '2026-10-04', '2026-10-05', '2026-10-05', '2026-10-30', 'bad', '2026-02-30']);
  history.push({ date: null }, {});
  assert.deepEqual(restProgress(history, '2026-10-06'), { days: 3, best: 3, restUsed: false, trainedToday: true });
  assert.deepEqual(restProgress([], '2026-10-06'), { days: 0, best: 0, restUsed: false, trainedToday: false });
  assert.equal(restProgress(history, 'invalid').days, 0);
});

test('rest never changes saved workouts, stars, belt, character or unlock credits', () => {
  const history = sessions(Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`));
  const copy = structuredClone(history), before = stats(history, new Date(2026, 8, 10));
  restProgress(history, '2026-10-01');
  const after = stats(history, new Date(2026, 9, 1));
  assert.deepEqual(history, copy);
  assert.equal(after.workouts, before.workouts); assert.equal(after.stars, before.stars);
  assert.deepEqual(rankOf(after.workouts), rankOf(before.workouts));
  assert.deepEqual(companionProgress(after.workouts), companionProgress(before.workouts));
  assert.equal(unlockCredits(after.workouts, 6), unlockCredits(before.workouts, 6));
  assert.equal(restProgress(history, '2026-10-01').best, 10);
  assert.ok(restBadges(after, restProgress(history, '2026-10-01')).includes('three'));
  assert.ok(restBadges(after, restProgress(history, '2026-10-01')).includes('week'));
});

test('local calendar days survive daylight saving and month/year boundaries', () => {
  const previous = process.env.TZ;
  const result = (dates, today) => restProgress(dates.map(date => ({ date: new Date(...date).toISOString() })), new Date(...today)).days;
  try {
    for (const TZ of ['Asia/Jerusalem', 'America/New_York', 'Etc/UTC']) {
      process.env.TZ = TZ;
      assert.deepEqual([
        result([[2026, 2, 7, 12], [2026, 2, 8, 12], [2026, 2, 9, 12]], [2026, 2, 9, 18]),
        result([[2026, 9, 24, 12], [2026, 9, 26, 12]], [2026, 9, 26, 18]),
        result([[2026, 11, 31, 12], [2027, 0, 2, 12]], [2027, 0, 2, 18]),
      ], [3, 2, 2], TZ);
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
