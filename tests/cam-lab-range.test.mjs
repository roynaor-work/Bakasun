import test from 'node:test';
import assert from 'node:assert/strict';
import { placementDistance } from '../workout/cam-lab/placement.mjs';
import { placementHint, PlacementCoach } from '../workout/cam-lab/placement-coach.mjs';
import { estimateRange, rangeEnabled, UPPER_BODY_EXERCISES } from '../workout/cam-lab/range.mjs';
import { AutoStart } from '../workout/cam-lab/auto-start.mjs';
import { pose, person, floorPose } from './cam-lab-fixtures.js';

const cutLegs = (size = 1.5) => { const l = person(pose(), { x: .5, size }).landmarks;
  for (const i of [25, 26, 27, 28, 29, 30, 31, 32]) { l[i].visibility = l[i].presence = .05; l[i].y = Math.max(l[i].y, 1.05); } return l; };

test('too close with legs cut off: silent before v9, "step back" with a down arrow now', () => {
  const l = cutLegs();
  assert.equal(placementDistance(l, { range: false }).direction, null);
  assert.equal(placementDistance(l).direction, 'away');
  const hint = placementHint(l); assert.equal(hint.code, 'near'); assert.equal(hint.vArrow, 'back');
  assert.match(hint.text, /קרוב מדי/);
});

test('far with only torso reliable still says come closer; comfortable torso is in range', () => {
  const far = person(pose(), { x: .5, size: .25 }).landmarks;
  for (const i of [27, 28, 29, 30, 31, 32]) far[i].visibility = .05;
  const hint = placementHint(far); assert.equal(hint.code, 'far'); assert.equal(hint.vArrow, 'closer');
  const good = person(pose(), { x: .5, size: .85 }).landmarks;
  for (const i of [27, 28, 29, 30, 31, 32]) good[i].visibility = .05;
  assert.equal(placementDistance(good).direction, null);
});

test('floor poses and sideways bodies give no range cue; flag turns v9 off', () => {
  assert.equal(estimateRange(floorPose().p), null);
  assert.equal(placementHint(floorPose().p).code, null);
  assert.equal(rangeEnabled('?camRange=0', null), false);
  assert.equal(rangeEnabled('', { getItem: () => '0' }), false);
  assert.equal(rangeEnabled('', { getItem: () => null }), true);
  assert.equal(UPPER_BODY_EXERCISES.size, 0);
});

test('waist-up mode: hips-up body is in range, cut at the chest asks to step back, tiny asks to come closer', () => {
  const mk = size => { const l = person(pose(), { x: .5, size }).landmarks;
    for (const i of [25, 26, 27, 28]) l[i].visibility = l[i].presence = .05; return l; };
  assert.equal(placementDistance(mk(1), { upperBody: true }).direction, null);
  assert.equal(placementDistance(mk(.3), { upperBody: true }).direction, 'closer');
  const big = mk(2.2); big[0].y = -.1;
  assert.equal(placementDistance(big, { upperBody: true }).direction, 'away');
});

// Direction check for the child: the spoken side is anatomical, the arrow follows the screen.
test('four directions: words are the child’s sides, arrows follow the screen (mirrored and rear)', () => {
  const standing = center => { const s = pose(); [s.p[11].x, s.p[12].x] = [s.p[12].x, s.p[11].x];
    s.p.forEach(p => { p.x += center - .5; }); return s.p; };
  // child faces camera: child's right is image-left, so image-left position => "left" is wrong; test both
  const cases = [[.25, 'left', { mirrored: true, arrow: 'left' }, { mirrored: false, arrow: 'right' }],
                 [.75, 'right', { mirrored: true, arrow: 'right' }, { mirrored: false, arrow: 'left' }]];
  // standing(): landmark 11 sits at the larger x, i.e. the child faces the camera.
  for (const [c, word, front, rear] of cases) for (const o of [front, rear]) {
    const h = placementHint(standing(c), { mirrored: o.mirrored }); assert.equal(h.code, word); assert.equal(h.arrow, o.arrow);
  }
  assert.equal(placementHint(cutLegs()).vArrow, 'back');
  const far = person(pose(), { size: .2 }).landmarks; assert.equal(placementHint(far).vArrow, 'closer');
});

test('auto start: reaching the range with no tap runs 3-2-1 then begins; leaving cancels', () => {
  const cues = []; let begun = 0, cancelled = 0;
  const auto = new AutoStart({ onCue: n => cues.push(n), begin: () => begun++, onCancel: () => cancelled++ });
  const coach = new PlacementCoach(); const p = pose().p; let t = 0, placed = false;
  for (; t < 8000; t += 100) { const h = coach.update(p, t); placed = placementHint(p).placed;
    auto.update(placed, t); if (t === 1500) auto.update(false, t + 1), auto.update(true, t + 2); }
  assert.equal(begun, 1); assert.ok(cancelled >= 1); assert.deepEqual(cues.slice(-3), [3, 2, 1]);
});
