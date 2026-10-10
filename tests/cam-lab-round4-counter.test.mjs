import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter, PoseFilter, EXERCISES } from '../workout/cam-lab/counter.mjs';
import { pose, floorPose, lungePose } from './cam-lab-fixtures.js';

const motions = {
  squats: [() => pose(), () => pose({ angle: 110 })],
  'jumping-jacks': [() => pose(), () => pose({ feet: 2.2, hands: .07 })],
  'high-knees': [() => pose(), () => {
    const sample = pose(); sample.p[25].y = .40; sample.p[27].y = .60; return sample;
  }],
  lunges: [() => lungePose(), () => lungePose({ angle: 95 })],
  'push-ups': [() => floorPose({ bridge: 180, farHidden: false }),
    () => floorPose({ bridge: 180, elbow: 85, farHidden: false })],
  'knee-push-ups': [() => floorPose({ bridge: 180, farHidden: false }),
    () => floorPose({ bridge: 180, elbow: 85, farHidden: false })],
  'glute-bridge': [() => floorPose({ farHidden: false }),
    () => floorPose({ bridge: 175, farHidden: false })],
};
function hideLeft(sample) {
  for (const i of [11, 13, 15, 23, 25, 27]) sample.p[i].visibility = sample.p[i].presence = .05;
  return sample;
}
function rig(exercise) {
  const counter = new RepCounter(exercise); let time = 0;
  return { counter, send(sample, frames = 16) {
    for (let i = 0; i < frames; i++) {
      time += 50; counter.update(sample.p, sample.world, time, 4 / 3);
    }
  } };
}

for (const exercise of EXERCISES) {
  test(`${exercise}: an observed opposite side cannot finish an unseen active-side return`, () => {
    const [rest, target] = motions[exercise], r = rig(exercise);
    r.send(rest()); r.send(target());
    assert.equal(r.counter.cycle.observationSide, 0);
    r.send(hideLeft(rest()), 20);
    assert.equal(r.counter.count, 0);
    assert.equal(r.counter.reasons.tracking, 1);
    assert.ok(r.counter.snapshot().stopReasons.activeSide > 0);
  });
  for (const missing of [1, 2, 3]) {
    test(`${exercise}: ${missing} active-side dropouts recover while the opposite side remains visible`, () => {
      const [rest, target] = motions[exercise], r = rig(exercise);
      r.send(rest()); r.send(target());
      r.send(hideLeft(rest()), missing);
      assert.equal(r.counter.count, 0);
      r.send(target(), 8); r.send(rest());
      assert.equal(r.counter.count, 1); assert.equal(r.counter.rejected, 0);
      assert.equal(r.counter.snapshot().graceRecoveries, 1);
    });
  }
}

test('held raised knees cannot supply target dwell through an observed opposite side', () => {
  for (const targetFrames of [2, 3, 4, 5]) {
    const [rest, target] = motions['high-knees'], r = rig('high-knees');
    r.send(rest()); r.send(target(), targetFrames);
    const before = r.counter.snapshot();
    assert.notEqual(r.counter.cycle?.reached, true);
    r.send(hideLeft(rest()), 6);
    assert.equal(r.counter.snapshot().targetFrames, before.targetFrames);
    assert.equal(r.counter.snapshot().cyclesStarted, before.cyclesStarted);
    r.send(rest()); assert.equal(r.counter.count, 0);
  }
});

test('motion features exclude held opposite joints while the overlay retains them', () => {
  const [, target] = motions['high-knees'], filter = new PoseFilter('high-knees');
  const up = target(); filter.update(up.p, up.world, 0, 4 / 3);
  const partial = hideLeft(pose()), sample = filter.update(partial.p, partial.world, 50, 4 / 3);
  assert.equal(sample.fresh, true); assert.equal(sample.freshSides[0], false);
  assert.equal(sample.freshSides[1], true); assert.equal(sample.held[25], true);
  assert.ok(sample.points[25]); assert.equal(sample.features.leftRise, null);
  assert.ok(sample.features.rightRise < .025);
});

for (const exercise of ['squats', 'push-ups', 'knee-push-ups', 'glute-bridge']) {
  test(`${exercise}: a newly visible resting left side cannot finish a right-side cycle`, () => {
    const [rest, target] = motions[exercise], r = rig(exercise);
    r.send(hideLeft(rest())); r.send(hideLeft(target()));
    assert.equal(r.counter.cycle.observationSide, 1);
    assert.equal(r.counter.cycle.reached, true);
    const mismatched = target(), leftRest = rest();
    for (const id of [11, 13, 15, 23, 25, 27]) {
      mismatched.p[id] = leftRest.p[id]; mismatched.world[id] = leftRest.world[id];
    }
    r.send(mismatched, 30);
    assert.equal(r.counter.count, 0); assert.equal(r.counter.rejected, 0);
    r.send(rest()); assert.equal(r.counter.count, 1);
  });
}
