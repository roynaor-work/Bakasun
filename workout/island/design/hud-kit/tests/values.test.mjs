import test from 'node:test';
import assert from 'node:assert/strict';
import { finite, clamp, integer, percent, clockTick, clockText, stickValues, eventKind, outcomeKind } from '../values.mjs';

test('invalid, missing, negative and unbounded input never reaches displays', () => {
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, '8', {}]) {
    assert.equal(finite(bad, 7), 7); assert.equal(integer(bad), 0); assert.equal(percent(bad), 0);
  }
  assert.equal(clamp(-5), 0); assert.equal(clamp(5), 1);
  assert.equal(integer(1.9), 1); assert.equal(integer(2000), 999);
  assert.equal(percent(.674), 67); assert.equal(percent(.675), 68);
});
test('clock is quantized, bounded and rolls minutes/hundredths correctly', () => {
  assert.equal(clockText(clockTick(59999)), '00:59');
  assert.equal(clockText(clockTick(60000)), '01:00');
  assert.equal(clockText(clockTick(59999, true), true), '00:59.99');
  assert.equal(clockText(clockTick(60000, true), true), '01:00.00');
  assert.equal(clockText(clockTick(999999999, true), true), '99:59.99');
  assert.equal(clockText(clockTick(-1)), '00:00');
  assert.equal(clockTick(1001), clockTick(1999));
});
test('stick has radial dead zone, normalized diagonals, physical axes and reuses output', () => {
  const out = { x: 9, y: 9 };
  assert.equal(stickValues(out, .03, .03), out); assert.deepEqual(out, { x: 0, y: 0 });
  stickValues(out, 1, 1); assert.ok(Math.abs(Math.hypot(out.x, out.y) - 1) < .001);
  stickValues(out, -4, 0); assert.deepEqual(out, { x: -1, y: 0 });
  stickValues(out, 0, -1); assert.deepEqual(out, { x: 0, y: -1 });
  stickValues(out, NaN, Infinity); assert.deepEqual(out, { x: 0, y: 0 });
  stickValues(out, .5, 0, 0); assert.deepEqual(out, { x: .5, y: 0 });
});
test('event and outcome vocabulary is bounded, stars use integer clamp', () => {
  for (const kind of ['goal', 'basket', 'fall']) assert.equal(eventKind(kind), kind);
  assert.equal(eventKind('<script>'), 'goal'); assert.equal(outcomeKind('loss'), 'loss');
  assert.equal(outcomeKind('incomplete'), 'incomplete'); assert.equal(outcomeKind('unknown'), 'draw');
  assert.equal(integer(4, 3), 3); assert.equal(integer(-1, 3), 0);
});
