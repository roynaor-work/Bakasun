// Camera workout v1, real-people round three (28/11/2026): what the real clips of the third round showed.
// camPlace (a body that fills the width is told to move back, hidden legs with nothing cut too), camForearm
// (a plank on the forearms is a plank) and the start confidence per exercise. All behind address flags, off by
// default. The clip numbers are in workout/tools/camera-real-v1.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { guide } from '../workout/js/camera-v1/guide.mjs';
import { MotionCounter, CAMERA_EXERCISES } from '../workout/js/camera-v1/motion.mjs';
import { confidenceFor, CONFIDENCE_BY_EXERCISE, CONFIDENCE_START } from '../workout/js/camera-v1/tracking.mjs';

const blank = () => Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0, presence: 0 }));
const put = (pts, ids, x, y, v = .95) => { for (const i of [].concat(ids)) pts[i] = { x, y, visibility: v, presence: v }; };

// A body lying side-on, head at the left: size is the torso length in the picture, x0 the shoulder.
function lying({ x0 = .3, size = .2, elbow = 'forearm', y = .6 } = {}) {
  const pts = blank(), s = size;
  put(pts, [0, 7, 8], x0 - .5 * s, y - .1 * s);
  put(pts, [11, 12], x0, y);
  put(pts, [23, 24], x0 + s, y + .1 * s);
  put(pts, [25, 26], x0 + 1.75 * s, y + .3 * s);
  put(pts, [27, 28], x0 + 2.5 * s, y + .5 * s);
  put(pts, [29, 30], x0 + 2.6 * s, y + .6 * s);
  put(pts, [31, 32], x0 + 2.6 * s, y + .7 * s);
  if (elbow === 'forearm') { put(pts, [13, 14], x0, y + .6 * s); put(pts, [15, 16], x0 - .4 * s, y + .6 * s); }
  else { put(pts, [13, 14], x0, y + .35 * s); put(pts, [15, 16], x0, y + .7 * s); }
  return pts;
}
// A child standing in front of the phone, in the middle; feet can be made unsure (hidden) without being cut.
function standing({ feet = .95, size = .16 } = {}) {
  const pts = blank(), s = size;
  put(pts, [0, 7, 8], .5, .5 - 1.5 * s);
  put(pts, 11, .5 - .3 * s, .5 - s); put(pts, 12, .5 + .3 * s, .5 - s);
  put(pts, [13, 15], .5 - .45 * s, .5 - .3 * s); put(pts, [14, 16], .5 + .45 * s, .5 - .3 * s);
  put(pts, 23, .5 - .2 * s, .5); put(pts, 24, .5 + .2 * s, .5);
  put(pts, 25, .5 - .2 * s, .5 + .9 * s); put(pts, 26, .5 + .2 * s, .5 + .9 * s);
  put(pts, [27, 29, 31], .5 - .2 * s, .5 + 1.8 * s, feet); put(pts, [28, 30, 32], .5 + .2 * s, .5 + 1.8 * s, feet);
  return pts;
}
const sampleOf = points => ({ poses: [{ landmarks: points }], time: 5000, aspect: .75 });

test('camPlace: a lying body that fills the width is told to move back, not to the side', () => {
  const policy = CAMERA_EXERCISES.plank;
  // Shoulder at .22, toes at .22 + 2.6 * .3 = 1.0: the feet touch the right edge and the head is near the left.
  const wide = lying({ x0: .22, size: .3 });
  assert.equal(guide(sampleOf(wide), 'center', policy, {}).move, 'right', 'as before: a step to the side');
  assert.equal(guide(sampleOf(wide), 'center', { ...policy, place: true }, {}).move, 'back');
  // A small body cut at one side has room: the step to the side stays.
  const small = lying({ x0: .74, size: .1 });
  assert.equal(guide(sampleOf(small), 'center', { ...policy, place: true }, {}).move, 'right');
});

test('camPlace: hidden legs or head with nothing cut at an edge mean distance; hidden hands do not', () => {
  const policy = CAMERA_EXERCISES.squats;
  const noFeet = standing({ feet: .1 });
  const before = guide(sampleOf(noFeet), 'missing', policy, {});
  assert.equal(before.move, 'clear');
  assert.deepEqual(before.parts, ['feet']);
  const after = guide(sampleOf(noFeet), 'missing', { ...policy, place: true }, {});
  assert.equal(after.move, 'back');
  assert.match(after.text, /הרגליים לא נראות.*אחורה/);
  const noHands = standing();
  for (const i of [13, 14, 15, 16]) noHands[i] = { ...noHands[i], visibility: .1 };
  const hands = guide(sampleOf(noHands), 'missing', { ...CAMERA_EXERCISES['jumping-jacks'], place: true }, {});
  assert.equal(hands.move, 'clear', 'hands behind the body are not a matter of distance');
  assert.equal(guide(sampleOf(standing()), 'ready', { ...policy, place: true }, {}), null, 'seen well: nothing to say');
});

// Holds the pose for a while and returns the credited seconds (null when the pose is not even a start).
function held(points, options) {
  const counter = new MotionCounter('plank', { goal: 30 });
  if (!counter.setReference(points, { aspect: 1, ...options })) return null;
  let out;
  for (let t = 0; t <= 3000; t += 66) out = counter.update(points, 1000 + t, { aspect: 1 });
  return out.activeMs / 1000;
}

test('camForearm: a forearm plank is credited only with the flag; a straight-arm plank always; three body sizes', () => {
  // A small child, an eleven-year-old as tall as a grown-up, a grown-up near the phone.
  for (const size of [.11, .17, .24]) {
    assert.equal(held(lying({ size, x0: .2 }), {}), 0, 'off by default: ' + size);
    assert.ok(held(lying({ size, x0: .2 }), { forearm: true }) > 2, 'credited with the flag: ' + size);
    assert.ok(held(lying({ size, x0: .2, elbow: 'straight' }), {}) > 2, 'the straight-arm plank is untouched: ' + size);
  }
});

test('camForearm: lying flat on the stomach or a pike is not a forearm plank', () => {
  const flat = lying({ size: .2 });
  for (const i of [11, 12]) flat[i] = { ...flat[i], y: .6 + .5 * .2 };
  assert.ok(!(held(flat, { forearm: true }) > 0), 'shoulders down by the floor');
  const pike = lying({ size: .2 });
  for (const i of [23, 24]) pike[i] = { ...pike[i], y: .6 - .9 * .2 };
  assert.ok(!(held(pike, { forearm: true }) > 0), 'hips high in the air');
});

test('camConf per exercise: never above the common limit, never under the stay limit, off unless asked', () => {
  for (const [id, limit] of Object.entries(CONFIDENCE_BY_EXERCISE)) {
    assert.ok(CAMERA_EXERCISES[id], 'a known exercise: ' + id);
    assert.ok(limit <= .49 && limit >= .40, id + ' ' + limit);
    assert.equal(confidenceFor(CAMERA_EXERCISES[id], false, id), .49);
    assert.equal(confidenceFor(CAMERA_EXERCISES[id], true, id), limit);
  }
  assert.equal(confidenceFor(CAMERA_EXERCISES.squats, true, 'squats'), .49, 'a standing exercise keeps the common limit');
  assert.equal(confidenceFor(CAMERA_EXERCISES.superman, true, 'superman'), CONFIDENCE_START.floor, 'a floor exercise not in the table: the floor limit');
  assert.equal(confidenceFor({ setup: 'floor' }, true), CONFIDENCE_START.floor, 'no id: per setup, as before');
});
