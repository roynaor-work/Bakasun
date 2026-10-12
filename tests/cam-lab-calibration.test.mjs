import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RepCounter, PoseFilter, features, bodyReport } from '../workout/cam-lab/counter.mjs';
import { RestCalibration } from '../workout/cam-lab/rest-calibration.mjs';
import { replayRecording } from '../workout/cam-lab/recording.mjs';
import { runReplay } from '../workout/cam-lab/tools/replay.mjs';
import { PeopleTracker } from '../workout/cam-lab/people.mjs';
import { pose, person, lungePose, floorPose } from './cam-lab-fixtures.js';

const fixturePath = new URL('./fixtures/squats-low-standing.json', import.meta.url);
const readFixture = async () => JSON.parse(await readFile(fixturePath, 'utf8'));
const close = (value, expected) => assert.ok(Math.abs(value - expected) < .01, `${value} ≈ ${expected}`);
function calibrate(counter, sample) {
  const calibration = new RestCalibration(counter.exercise, counter.t), filter = new PoseFilter(counter.exercise, counter.t);
  for (let time = 0; time <= 1000; time += 50) {
    const result = filter.update(sample.p, sample.world, time, 3 / 4);
    calibration.update(result.features, time, result.fresh);
  }
  counter.calibration = calibration.finalize();
  return calibration;
}

test('synthetic low-standing skeleton goes from zero to five full squats, with a 504ms model gap', async () => {
  const fixture = await readFixture();
  const gapIndex = fixture.frames.findIndex(f => f.modelTransition);
  assert.equal(fixture.frames[gapIndex].t - fixture.frames[gapIndex - 1].t, 504);
  const before = structuredClone(fixture);
  before.frames.forEach(f => { delete f.modelTransition; });
  assert.equal(replayRecording(before)[0].counted, 0);
  assert.equal(replayRecording(before)[0].reasons.tracking, 1);
  const result = await runReplay([fixturePath.pathname, '--calibrate']);
  assert.equal(result.baseline[0].counted, 0);
  assert.equal(result.calibrated[0].counted, 5);
  const { diagnostics, thresholds } = result.calibrated[0];
  close(diagnostics.calibration.median, 160); close(thresholds.squatUp, 140); close(thresholds.squatStart, 133);
  assert.equal(thresholds.squatDown, 120); assert.equal(thresholds.maxGap, 450);
  assert.equal(diagnostics.trackingResets, 0); assert.equal(diagnostics.modelTransitionGaps, 1);
});

test('a 125-degree half squat never reaches the absolute depth target after calibration', async () => {
  const fixture = await readFixture();
  for (const frame of fixture.frames) {
    if (frame.t < fixture.countStartMs) continue;
    const world = frame.poses[0].world.map(tuple => ({ x: tuple[0], y: tuple[1], z: tuple[2] }));
    const landmarks = frame.poses[0].landmarks.map(tuple => ({ x: tuple[0], y: tuple[1], z: tuple[2], visibility: tuple[3], presence: tuple[4] }));
    if (features(landmarks, world, fixture.aspect, bodyReport(landmarks, fixture.aspect)).squat < 125.01) {
      frame.poses[0].world = pose({ angle: 125 }).world.map(p => [p.x, p.y, p.z]);
    }
  }
  const [result] = replayRecording(fixture, { calibrate: true, details: true });
  assert.equal(result.counted, 0); assert.equal(result.reasons.partial, 5);
  assert.equal(result.diagnostics.targetFrames, 0); assert.equal(result.thresholds.squatDown, 120);
});

test('calibration bounds and per-person medians preserve the absolute depth threshold', () => {
  for (const [reference, up] of [[149, 138], [160, 140], [180, 157]]) {
    const counter = new RepCounter('squats'); calibrate(counter, pose({ angle: reference }));
    close(counter.calibration.median, reference); close(counter.t.squatUp, up); close(counter.t.squatStart, up - 7);
    assert.equal(counter.t.squatDown, 120);
  }
  const child = new RepCounter('squats'), adult = new RepCounter('squats', { age: 10, height: 180 });
  calibrate(child, pose({ angle: 159 })); calibrate(adult, pose({ angle: 168 }));
  close(child.t.squatUp, 139); close(adult.t.squatUp, 148);
  child.begin(1200, true); close(child.snapshot().calibration.median, 159);
});

test('insufficient, sparse, moving, held and non-rest samples fall back to the fixed thresholds', () => {
  const cases = [
    [{ squat: 160 }, [0, 50, 100], true],
    [{ squat: 160 }, [0, 500, 1000, 1500, 2000, 2500, 3000, 3500], true],
    [{ squat: 160 }, Array.from({ length: 30 }, (_, i) => i * 50), false],
    [{ squat: 125 }, Array.from({ length: 30 }, (_, i) => i * 50), true],
  ];
  for (const [f, times, fresh] of cases) {
    const counter = new RepCounter('squats'), original = { ...counter.t }, calibration = new RestCalibration('squats', counter.t);
    times.forEach(t => calibration.update(f, t, fresh));
    const result = calibration.finalize(); assert.equal(result.status, 'fallback');
    assert.equal(result.reason, 'insufficient-stable-frames'); assert.deepEqual(counter.t, original);
  }
  const counter = new RepCounter('squats'), calibration = new RestCalibration('squats', counter.t);
  for (let time = 0; time <= 1500; time += 50) calibration.update({ squat: time % 100 ? 170 : 150 }, time);
  assert.equal(calibration.finalize().status, 'fallback');
  calibration.reset(); assert.equal(calibration.result, null); assert.equal(counter.t.squatUp, 157);
});

test('calibration freezes before the countdown and does not learn from subsequent motion', () => {
  const counter = new RepCounter('squats'), calibration = calibrate(counter, pose({ angle: 160 }));
  const frozen = structuredClone(calibration.result);
  for (let time = 1100; time <= 3000; time += 50) calibration.update({ squat: 175 }, time);
  assert.deepEqual(calibration.finalize(), frozen); close(counter.t.squatUp, 140);
});

test('pair identity preparation accepts a stable standing reference below the former 157-degree gate', () => {
  const tracker = new PeopleTracker();
  const child = person(pose({ angle: 150 }), { x: .25, size: .65 });
  const adult = person(pose({ angle: 160 }), { x: .75, size: 1 });
  let assigned;
  for (let time = 0; time <= 1400; time += 50) assigned = tracker.update([adult, child], time, 3 / 4);
  assert.equal(tracker.status, 'armed'); assert.equal(assigned[0], child); assert.equal(assigned[1], adult);
});

for (const exercise of ['lunges', 'push-ups', 'knee-push-ups']) {
  test(`${exercise}: a calibrated 146-degree return completes full reps and still rejects partial depth`, () => {
    const sample = (angle, side = 'left') => exercise === 'lunges' ? lungePose({ angle, side }) : floorPose({ bridge: 180, elbow: angle });
    const run = (calibrated, target) => {
      const counter = new RepCounter(exercise); if (calibrated) calibrate(counter, sample(160));
      counter.begin(1200, true); let time = 1200;
      const send = (angle, side) => {
        const s = sample(angle, side);
        for (let i = 0; i < 20; i++) counter.update(s.p, s.world, time += 50, 3 / 4);
      };
      send(160); send(target, 'left'); send(146); send(target, 'right'); send(146);
      counter.finish(time); return counter;
    };
    assert.equal(run(false, 85).count, 0);
    const full = run(true, 85); assert.equal(full.count, 2); assert.equal(full.rejected, 0);
    assert.equal(run(true, exercise === 'lunges' ? 120 : 110).count, 0);
    assert.equal(full.t.lungeDown, 110); assert.equal(full.t.pushDown, 100); assert.equal(full.t.bodyStraight, 150);
  });
}

test('a known model gap preserves the cycle; an ordinary gap or missing person still resets it', () => {
  for (const [modelTransition, missing, expected] of [[true, false, 1], [false, false, 0], [true, true, 0]]) {
    const counter = new RepCounter('squats'); counter.begin(0, true); let time = 0;
    const send = (s, frames = 20) => {
      for (let i = 0; i < frames; i++) counter.update(s.p, s.world, time += 50, 3 / 4);
    };
    send(pose()); send(pose({ angle: 70 }));
    const bottom = pose({ angle: 70 });
    counter.update(missing ? [] : bottom.p, missing ? [] : bottom.world, time += 504, 3 / 4, { modelTransition });
    if (missing) send({ p: [], world: [] }, 10);
    send(pose()); assert.equal(counter.count, expected);
    assert.equal(counter.snapshot().trackingResets, expected ? 0 : 1);
  }
});

test('model loading time cannot finish a target or return dwell', () => {
  const counter = new RepCounter('squats'); counter.begin(0, true);
  const bottom = pose({ angle: 60 });
  counter.update(bottom.p, bottom.world, 50); counter.update(bottom.p, bottom.world, 100);
  assert.equal(counter.cycle.reached, false);
  counter.update(bottom.p, bottom.world, 604, 1, { modelTransition: true });
  assert.equal(counter.cycle.reached, false);
  counter.update(bottom.p, bottom.world, 804); assert.equal(counter.cycle.reached, true);
});
