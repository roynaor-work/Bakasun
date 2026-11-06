import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchMap, joystickCenter, joystickVector, intersects, SIZES } from '../runtime/layout.mjs';

function checkGeometry(map) {
  const { joystick, actions, width, height, safe, middle } = map;
  assert.ok(joystick.x + joystick.width < middle, 'the full joystick zone stays in the physical left half');
  for (const action of actions) {
    assert.ok(action.x > middle, `${action.id} stays in the right half`);
    assert.equal(intersects(joystick, action), false, `joystick overlaps ${action.id}`);
    assert.ok(action.x - (joystick.x + joystick.width) >= map.gap - 1e-9, 'reserved central gap');
  }
  for (const [index, target] of map.targets.entries()) {
    for (const value of [target.x, target.y, target.width, target.height]) assert.ok(Number.isFinite(value));
    assert.ok(target.width > 0 && target.height > 0);
    assert.ok(target.x >= safe.left - 1e-9 && target.y >= safe.top - 1e-9, `${target.id} starts inside safe area`);
    assert.ok(target.x + target.width <= width - safe.right + 1e-9, `${target.id} ends inside safe width`);
    assert.ok(target.y + target.height <= height - safe.bottom + 1e-9, `${target.id} ends inside safe height`);
    for (const other of map.targets.slice(index + 1)) {
      assert.equal(intersects(target, other), false, `${target.id} overlaps ${other.id}`);
    }
  }
  for (const x of [-width, 0, joystick.x, middle, width * 2]) {
    for (const y of [-height, 0, joystick.y, height, height * 2]) {
      const center = joystickCenter(map, x, y);
      assert.ok(center.x - map.radius >= joystick.x - 1e-9);
      assert.ok(center.x + map.radius <= joystick.x + joystick.width + 1e-9);
      assert.ok(center.y - map.radius >= joystick.y - 1e-9);
      assert.ok(center.y + map.radius <= joystick.y + joystick.height + 1e-9);
    }
  }
}

for (const [width, height] of SIZES) {
  test(`touch map ${width}×${height}: no overlap, physical sides, floating rim, 48px targets`, () => {
    const map = touchMap(width, height);
    checkGeometry(map);
    assert.ok(map.targets.every(target => Math.min(target.width, target.height) >= 48));
  });
}

test('every integer width 280–2560, portrait and landscape: separated touch regions', () => {
  for (let width = 280; width <= 2560; width++) {
    for (const height of [280, 390, 640, 768, 844, 915, 1440]) checkGeometry(touchMap(width, height));
  }
});

test('deterministic fractional screens and asymmetric safe areas', () => {
  let seed = 89;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let count = 0; count < 6000; count++) {
    const width = 280 + random() * 4000;
    const height = 280 + random() * 2200;
    const insets = { top: random() * 44, right: random() * 44, bottom: random() * 34, left: random() * 44 };
    checkGeometry(touchMap(width, height, insets));
  }
});

test('narrow screens with a side notch retain 48px action targets', () => {
  for (const width of [320, 360, 390, 412]) {
    for (const side of ['left', 'right']) {
      const map = touchMap(width, 568, { [side]: 44, bottom: 21 });
      checkGeometry(map);
      for (const action of map.actions) assert.ok(action.width >= 48 && action.height >= 48);
    }
  }
});

test('invalid dimensions and impossible safe areas are rejected explicitly', () => {
  for (const value of [0, -1, NaN, Infinity, '390', null]) {
    assert.throws(() => touchMap(value, 844), RangeError);
    assert.throws(() => touchMap(390, value), RangeError);
  }
  for (const value of [-1, NaN, Infinity, '12']) assert.throws(() => touchMap(390, 844, { left: value }), RangeError);
  assert.throws(() => touchMap(390, 844, { left: 390 }), RangeError);
  assert.throws(() => touchMap(390, 844, { top: 844 }), RangeError);
  assert.throws(() => touchMap(390, 844, { left: 220 }), RangeError);
});

test('joystick vectors: deadzone, normalized diagonal, bounded full deflection', () => {
  const center = { x: 100, y: 100 };
  assert.deepEqual(joystickVector(center, 100, 100, 52), { x: 0, y: 0, knobX: 0, knobY: 0 });
  assert.equal(joystickVector(center, 101, 100, 52).x, 0);
  for (let angle = 0; angle < 360; angle++) {
    const radians = angle * Math.PI / 180;
    const result = joystickVector(center, 100 + Math.cos(radians) * 1000, 100 + Math.sin(radians) * 1000, 52);
    assert.ok(Math.abs(Math.hypot(result.x, result.y) - 1) < 1e-12);
    assert.ok(Math.hypot(result.knobX, result.knobY) <= 52 * .55 + 1e-9);
  }
});

test('collision guard detects containment, crossings and clearance', () => {
  const box = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(intersects(box, { x: 99, y: 10, width: 10, height: 10 }), true);
  assert.equal(intersects(box, { x: 20, y: 20, width: 10, height: 10 }), true);
  assert.equal(intersects(box, { x: 100, y: 0, width: 10, height: 10 }), false);
  assert.equal(intersects(box, { x: 105, y: 0, width: 10, height: 10 }, 8), true);
});
