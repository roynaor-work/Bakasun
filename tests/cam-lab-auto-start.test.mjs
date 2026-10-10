import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoStart } from '../workout/cam-lab/auto-start.mjs';

test('ready poses produce 3, 2, 1, then begin exactly once per attempt', () => {
  const events = [], make = () => new AutoStart({ onCue: n => events.push(n), begin: () => events.push('begin') });
  const start = make();
  start.update(false, 0); assert.deepEqual(events, []);
  for (let time = 100; time <= 4100; time += 100) start.update(true, time);
  assert.deepEqual(events, [3, 2, 1, 'begin']);
  start.update(false, 4200); start.update(true, 9000);
  assert.deepEqual(events, [3, 2, 1, 'begin']);
  const next = make();
  for (const time of [10000, 11000, 12000, 13000]) next.update(true, time);
  assert.deepEqual(events, [3, 2, 1, 'begin', 3, 2, 1, 'begin']);
});

test('lost readiness cancels the countdown; manual start prevents an automatic restart', () => {
  const events = [], start = new AutoStart({ onCue: n => events.push(n), begin: () => events.push('begin'), onCancel: () => events.push('cancel') });
  start.update(true, 0); start.update(true, 1000); start.update(false, 1500);
  start.update(true, 2000); start.update(true, 2500);
  assert.deepEqual(events, [3, 2, 'cancel', 3]);
  start.complete(); start.update(true, 5000); start.update(false, 6000); start.update(true, 7000);
  assert.deepEqual(events, [3, 2, 'cancel', 3]);
});

test('slow pose processing never compresses or skips countdown cues', () => {
  const events = [], start = new AutoStart({ onCue: n => events.push(n), begin: () => events.push('begin') });
  for (const time of [0, 4000, 4100, 5000, 6000]) start.update(true, time);
  assert.deepEqual(events, [3, 2, 1, 'begin']);
});
