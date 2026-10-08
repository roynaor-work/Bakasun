import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MINUTE_MS, COUNTDOWN_MS, MINUTE_RECORDS_KEY, startMinuteTest, advanceMinuteTest,
  changeMinuteCount, cancelMinuteTest, minuteResult, recordMinuteTest, loadMinuteRecords, saveMinuteRecords,
} from '../workout/js/minute-test.js';

const completed = (exId, count) => {
  let state = startMinuteTest(exId, 100);
  for (let i = 0; i < count; i++) state = changeMinuteCount(state, 1, state.readyAt + i);
  return advanceMinuteTest(state, state.endAt);
};
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('three preparation seconds are followed by exactly sixty seconds, starting at zero', () => {
  const start = startMinuteTest('squats', 500);
  assert.equal(start.count, 0);
  assert.equal(start.readyAt, 500 + COUNTDOWN_MS);
  assert.equal(start.endAt - start.readyAt, MINUTE_MS);
  assert.equal(advanceMinuteTest(start, start.readyAt - 1).status, 'countdown');
  assert.equal(advanceMinuteTest(start, start.readyAt).status, 'running');
  assert.equal(advanceMinuteTest(start, start.endAt - 1).status, 'running');
  assert.equal(advanceMinuteTest(start, start.endAt).status, 'completed');
  assert.equal(start.status, 'countdown', 'the input is not mutated');
});

test('only a manual tap during the minute counts; the exact deadline rejects another tap', () => {
  let state = startMinuteTest('squats', 0);
  state = changeMinuteCount(state, 1, state.readyAt - 1);
  assert.equal(state.count, 0);
  state = changeMinuteCount(state, 1, state.readyAt);
  assert.equal(state.count, 1);
  state = changeMinuteCount(state, 1, state.endAt - 1);
  assert.equal(state.count, 2);
  state = changeMinuteCount(state, 1, state.endAt);
  assert.equal(state.count, 2);
  assert.equal(state.status, 'completed');
  assert.equal(changeMinuteCount(state, 1, state.endAt + 1000).count, 2);
});

test('a delayed timer finishes without adding repetitions or extending the minute', () => {
  const state = changeMinuteCount(startMinuteTest('crunches', 0), 1, COUNTDOWN_MS);
  const late = advanceMinuteTest(state, state.endAt + 90_000);
  assert.equal(late.status, 'completed');
  assert.equal(late.endAt, COUNTDOWN_MS + MINUTE_MS);
  assert.equal(late.count, 1);
});

test('a correction never goes below zero and invalid tap values do not add repetitions', () => {
  let state = advanceMinuteTest(startMinuteTest('squats', 0), COUNTDOWN_MS);
  assert.equal(changeMinuteCount(state, -1, COUNTDOWN_MS).count, 0);
  state = changeMinuteCount(state, 1, COUNTDOWN_MS);
  assert.equal(changeMinuteCount(state, -1, COUNTDOWN_MS).count, 0);
  for (const delta of [2, 0, -2, NaN, Infinity, '1']) assert.equal(changeMinuteCount(state, delta, COUNTDOWN_MS).count, 1);
  for (const now of [NaN, Infinity, undefined]) assert.equal(changeMinuteCount(state, 1, now).count, 1);
});

test('stopping during preparation or before the last millisecond cannot save or change a best', () => {
  const records = recordMinuteTest({}, completed('squats', 8));
  const state = startMinuteTest('squats', 0);
  for (const now of [0, state.readyAt, state.endAt - 1]) {
    const stopped = cancelMinuteTest(state, now);
    assert.equal(stopped.status, 'cancelled');
    assert.equal(minuteResult(stopped, records), null);
    assert.equal(recordMinuteTest(records, stopped), records);
    assert.equal(changeMinuteCount(stopped, 1, state.readyAt).count, 0);
    assert.equal(advanceMinuteTest(stopped, state.endAt + 1000).status, 'cancelled');
  }
  assert.equal(minuteResult(state), null);
  assert.equal(recordMinuteTest(records, state), records);
  assert.equal(cancelMinuteTest(state, state.endAt).status, 'completed');
});

test('first, higher, equal and lower results compare with the same exercise personal best', () => {
  let records = {};
  const expectations = [[8, 'first', null, 8], [12, 'higher', 8, 12], [12, 'same', 12, 12], [4, 'lower', 12, 12]];
  for (let i = 0; i < expectations.length; i++) {
    const [count, comparison, previousBest, best] = expectations[i];
    const state = completed('squats', count);
    const result = minuteResult(state, records);
    assert.equal(result.comparison, comparison);
    assert.equal(result.previousBest, previousBest);
    assert.equal(result.best, best);
    assert.match(result.message, /המאמץ שלך/);
    assert.ok(result.comparisonText.length > 0);
    const before = structuredClone(records);
    const next = recordMinuteTest(records, state);
    assert.deepEqual(records, before, 'previous records are not mutated');
    assert.deepEqual(next.squats, { best, last: count, attempts: i + 1 });
    records = next;
  }
});

test('each exercise has its own record and ordinary workout counts cannot become minute records', () => {
  const records = recordMinuteTest({}, completed('squats', 20));
  assert.equal(minuteResult(completed('crunches', 3), records).previousBest, null);
  const next = recordMinuteTest(records, completed('crunches', 3));
  assert.equal(next.squats.best, 20);
  assert.equal(next.crunches.best, 3);
  const ordinaryWorkout = { exId: 'squats', count: 200, done: 200, type: 'reps' };
  assert.equal(recordMinuteTest(next, ordinaryWorkout), next);
});

test('a completed zero-count minute is a valid first result and keeps an existing best', () => {
  const zero = completed('squats', 0);
  const first = minuteResult(zero);
  assert.equal(first.best, 0);
  assert.equal(first.comparison, 'first');
  assert.match(first.message, /אפשר לנוח/);
  let records = recordMinuteTest({}, zero);
  assert.equal(minuteResult(zero, records).comparison, 'same', 'zero is different from no previous minute');
  records = recordMinuteTest(records, completed('squats', 5));
  assert.equal(minuteResult(zero, records).best, 5);
});

test('minute records survive a localStorage round trip without writing existing workout data', () => {
  const storage = memoryStorage();
  const legacy = JSON.stringify({ sessions: [{ id: 'session-1' }], tokens: 3, games: { bests: { snake: 42 } } });
  storage.setItem('kidfit.v1', legacy);
  assert.deepEqual(loadMinuteRecords(storage), {});
  const records = recordMinuteTest({}, completed('squats', 10));
  assert.equal(saveMinuteRecords(storage, records), true);
  assert.deepEqual(loadMinuteRecords(storage), records);
  assert.equal(storage.getItem('kidfit.v1'), legacy);
  assert.equal(storage.getItem('kidfit.activeWorkout'), null);
});

test('missing, corrupt or invalid records are safe; a storage write failure is reported', () => {
  const storage = memoryStorage();
  for (const raw of ['{broken', 'null', '[]', '5', '"text"']) {
    storage.setItem(MINUTE_RECORDS_KEY, raw);
    assert.deepEqual(loadMinuteRecords(storage), {});
  }
  const valid = { best: 10, last: 8, attempts: 2 };
  for (const invalid of [null, {}, { ...valid, best: -1 }, { ...valid, last: 11 }, { ...valid, attempts: 0 }, { ...valid, best: '10' }, { ...valid, last: 1.5 }]) {
    storage.setItem(MINUTE_RECORDS_KEY, JSON.stringify({ squats: valid, crunches: invalid }));
    assert.deepEqual(loadMinuteRecords(storage), { squats: valid });
  }
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadMinuteRecords(blocked), {});
  assert.equal(saveMinuteRecords(blocked, {}), false);
  for (const count of [-1, 1.5, Infinity, '5']) assert.equal(minuteResult({ status: 'completed', exId: 'squats', count }), null);
});

test('invalid exercise IDs and clock values are rejected before starting', () => {
  for (const id of ['', null, 12]) assert.throws(() => startMinuteTest(id, 0), TypeError);
  for (const now of [-1, NaN, Infinity, undefined]) assert.throws(() => startMinuteTest('squats', now), TypeError);
});
