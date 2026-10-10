import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter, EXERCISES, bodyReport, EXERCISE_FEEDBACK } from '../workout/cam-lab/counter.mjs';
import { EXERCISES as CATALOG } from '../workout/js/exercises.js';
import { PeopleTracker } from '../workout/cam-lab/people.mjs';
import { PlacementGuide } from '../workout/cam-lab/placement.mjs';
import { SkeletonRecorder, replayRecording } from '../workout/cam-lab/recording.mjs';
import { pose, floorPose, lungePose, person } from './cam-lab-fixtures.js';

function sequence(exercise) {
  const c = new RepCounter(exercise); let time = 0;
  return { c, send(sample, duration = 700) {
    for (let elapsed = 0; elapsed < duration; elapsed += 50) {
      time += 50; c.update(sample?.p || [], sample?.world || [], time, 4 / 3);
    }
  } };
}
const motions = {
  lunges: { rest: () => lungePose(), target: () => lungePose({ angle: 95 }), partial: () => lungePose({ angle: 135 }), bad: () => lungePose({ angle: 95, lean: true }) },
  'push-ups': { rest: () => floorPose({ bridge: 180 }), target: () => floorPose({ elbow: 85, bridge: 180 }), partial: () => floorPose({ elbow: 130, bridge: 180 }), bad: () => floorPose({ elbow: 85, bridge: 180, badForm: true }) },
  'knee-push-ups': { rest: () => floorPose({ bridge: 180 }), target: () => floorPose({ elbow: 85, bridge: 180 }), partial: () => floorPose({ elbow: 130, bridge: 180 }), bad: () => floorPose({ elbow: 85, bridge: 180, badForm: true }) },
  'glute-bridge': { rest: () => floorPose(), target: () => floorPose({ bridge: 175 }), partial: () => floorPose({ bridge: 155 }), bad: () => floorPose({ bridge: 175, arch: true }) },
};
test('four additions are existing repetition exercises with local vocal corrections', () => {
  assert.equal(EXERCISES.length, 7);
  for (const id of Object.keys(motions)) {
    assert.equal(CATALOG.find(e => e.id === id).type, 'reps');
    assert.ok(EXERCISES.includes(id)); assert.ok(EXERCISE_FEEDBACK[id]);
  }
});
for (const [exercise, motion] of Object.entries(motions)) {
  test(`${exercise}: full cycle counts once, hold does not repeat, partial rejects`, () => {
    const s = sequence(exercise); s.send(motion.rest()); s.send(motion.target(), 2000);
    assert.equal(s.c.count, 0); s.send(motion.rest()); assert.equal(s.c.count, 1); assert.equal(s.c.rejected, 0);
    // A new lunge must use the other leg; partial rejection precedes alternation.
    s.send(motion.partial()); s.send(motion.rest()); assert.equal(s.c.count, 1); assert.equal(s.c.reasons.partial, 1);
  });
  test(`${exercise}: common form error is reported and never counted`, () => {
    const s = sequence(exercise); s.send(motion.rest()); s.send(motion.bad()); s.send(motion.rest());
    assert.equal(s.c.count, 0); assert.equal(s.c.reasons.alignment, 1);
  });
  test(`${exercise}: no initial rest, one-frame target, missing world and long loss cannot count`, () => {
    const a = sequence(exercise); a.send(motion.target()); a.send(motion.rest()); assert.equal(a.c.count, 0);
    a.send(motion.target(), 50); a.send(motion.rest()); assert.equal(a.c.count, 0);
    const b = sequence(exercise), target = motion.target(); b.send(motion.rest()); b.send(target);
    b.send({ p: target.p, world: [] }, 600); b.send(motion.rest());
    assert.equal(b.c.count, 0); assert.equal(b.c.reasons.tracking, 1);
    const d = sequence(exercise); d.send(motion.rest()); d.send(motion.target()); d.send(null, 600); d.send(motion.rest());
    assert.equal(d.c.count, 0); assert.equal(d.c.reasons.tracking, 1);
  });
  test(`${exercise}: rest jitter and repeated complete cycles at 5 FPS`, () => {
    const s = new RepCounter(exercise); let time = 0;
    const send = (sample, frames = 6) => { for (let i = 0; i < frames; i++) { time += 200; s.update(sample.p, sample.world, time, 4 / 3); } };
    send(motion.rest());
    for (let i = 0; i < 20; i++) { const p = motion.rest(); p.p[15].y += .001 * (i % 2); send(p, 1); }
    assert.equal(s.count, 0); assert.equal(s.diagnostics.cyclesStarted, 0);
    for (let i = 0; i < 3; i++) { send(exercise === 'lunges' ? lungePose({ angle: 95, side: i % 2 ? 'right' : 'left' }) : motion.target()); send(motion.rest()); }
    assert.equal(s.count, 3);
  });
}
test('lunges require alternating the leg that actually bends', () => {
  const s = sequence('lunges'); s.send(lungePose());
  for (const side of ['left', 'left', 'right']) { s.send(lungePose({ angle: 95, side })); s.send(lungePose()); }
  assert.equal(s.c.count, 2); assert.equal(s.c.reasons.alternate, 1);
});
test('lunge side uses front-foot depth when both knees bend equally; uncertain depth cannot count', () => {
  const s = sequence('lunges'); s.send(lungePose());
  for (const side of ['left', 'right']) {
    const p = lungePose({ angle: 95, side }), both = pose({ angle: 95 });
    for (const i of side === 'left' ? [24, 26, 28] : [23, 25, 27]) p.world[i] = both.world[i];
    s.send(p); s.send(lungePose());
  }
  assert.equal(s.c.count, 2);
  const q = sequence('lunges'); q.send(lungePose()); const uncertain = lungePose({ angle: 95 });
  uncertain.world[27].z = 0; q.send(uncertain); q.send(lungePose()); assert.equal(q.c.count, 0);
});
test('floor framing accepts a complete visible side, but never mixes partial sides', () => {
  const p = floorPose(); assert.equal(bodyReport(p.p, 4 / 3, 'push-ups').ok, true);
  assert.equal(bodyReport(p.p, 4 / 3).ok, false);
  p.p[15].visibility = .1; p.p[16].visibility = 1;
  assert.equal(bodyReport(p.p, 4 / 3, 'push-ups').ok, false);
  const q = floorPose(); q.p[27].x = .995;
  assert.equal(bodyReport(q.p, 4 / 3, 'push-ups').ok, false);
  const feet = floorPose({ farHidden: false });
  feet.p[29].visibility = .4; feet.p[14].visibility = .55;
  assert.equal(bodyReport(feet.p, 4 / 3, 'push-ups').ok, true); // Valid left side beats invalid right.
  for (const exercise of ['push-ups', 'knee-push-ups', 'glute-bridge']) {
    const s = sequence(exercise); s.send(pose(), 3000);
    assert.equal(s.c.phase, 'waiting'); assert.equal(bodyReport(pose().p, 4 / 3, exercise).ok, false);
  }
});

function pairRig() {
  const tracker = new PeopleTracker(), counters = [new RepCounter('squats'), new RepCounter('squats')];
  const recorder = new SkeletonRecorder(); let time = 0, started = false; const missing = [false, false];
  recorder.start({ exercise: 'squats', mode: 'pair', thresholds: counters[0].t, adultThresholds: counters[1].t, aspect: 4 / 3 }, 0);
  const child = opts => person(pose(opts), { x: .28, size: .70 });
  const dad = opts => person(pose(opts), { x: .72, size: 1 });
  const send = (poses, duration = 700) => {
    for (let i = 0; i < duration; i += 50) {
      time += 50; recorder.add(poses, time);
      const assigned = tracker.update(poses, time, 4 / 3);
      if (started) counters.forEach((c, index) => {
        if (tracker.status === 'ambiguous' && !c.lossReset) c.resetTracking();
        missing[index] = !assigned[index];
        c.update(assigned[index]?.landmarks || [], assigned[index]?.world || [], time, 4 / 3);
      });
    }
  };
  return { tracker, counters, recorder, child, dad, send, begin() {
    started = true; recorder.markCountStart(time); counters.forEach(c => c.begin(time, true));
  } };
}
test('two people count independently despite detector order changes, disappearance and return', () => {
  const r = pairRig(); r.send([r.dad(), r.child()], 1500); assert.equal(r.tracker.tracks.length, 2); r.begin();
  r.send([r.child({ angle: 110 }), r.dad()]); r.send([r.dad(), r.child()]);
  assert.deepEqual(r.counters.map(c => c.count), [1, 0]);
  r.send([r.dad({ angle: 110 }), r.child({ angle: 110 })]);
  r.send([r.dad()], 100); // Brief loss preserves the cycle, longer absence cancels.
  assert.ok(r.counters[0].cycle); assert.equal(r.counters[0].rejected, 0);
  r.send([r.dad()]); assert.deepEqual(r.counters.map(c => c.count), [1, 1]);
  assert.equal(r.counters[0].cycle, null); assert.equal(r.counters[0].reasons.tracking, 1);
  r.send([r.child(), r.dad()]); r.send([r.dad(), r.child({ angle: 110 })]); r.send([r.child(), r.dad()]);
  assert.deepEqual(r.counters.map(c => c.count), [2, 1]);
  const replay = replayRecording(JSON.parse(r.recorder.json()));
  assert.deepEqual(replay.map(c => c.counted), [2, 1]); assert.equal(replay[0].reasons.tracking, 1);
});
test('a lone adult never inherits the missing child slot, even after a long absence', () => {
  const r = pairRig(); r.send([r.child(), r.dad()], 1500); r.begin();
  for (let i = 0; i < 3; i++) { r.send([r.dad({ angle: 110 })]); r.send([r.dad()]); }
  assert.deepEqual(r.counters.map(c => c.count), [0, 3]); assert.equal(r.tracker.tracks.length, 2);
  r.send([r.child(), r.dad()]); r.send([r.child({ angle: 110 }), r.dad()]); r.send([r.child(), r.dad()]);
  assert.deepEqual(r.counters.map(c => c.count), [1, 3]);
});
test('the survivor walking to the other position cannot take the reserved identity, even for similar sizes', () => {
  const t = new PeopleTracker(); let time = 0;
  const child = person(pose(), { x: .28, size: .84 }), adult = person(pose(), { x: .72, size: 1 });
  for (let i = 0; i < 30; i++) { time += 50; t.update([child, adult], time, 4 / 3); }
  assert.equal(t.tracks.length, 2);
  const moved = person(pose(), { x: .28, size: 1 });
  time += 50; assert.deepEqual(t.update([moved], time, 4 / 3), [null, null]);
});
test('height labels need two upright people at similar depth; ambiguity pauses both', () => {
  const t = new PeopleTracker(), a = person(pose(), { x: .28, size: .8 }), b = person(pose(), { x: .72, size: .82 });
  for (let time = 0; time < 2000; time += 50) assert.deepEqual(t.update([a, b], time, 4 / 3), [null, null]);
  assert.equal(t.tracks.length, 0);
  const crouched = pairRig(); crouched.send([crouched.child({ angle: 110 }), crouched.dad()], 1500);
  assert.equal(crouched.tracker.tracks.length, 0);
  const r = pairRig(); r.send([r.child(), r.dad()], 1500); r.begin();
  const one = r.child(), two = r.dad(); two.landmarks.forEach(p => p.x -= .44);
  r.send([one, two]); assert.equal(r.tracker.status, 'ambiguous');
  assert.deepEqual(r.counters.map(c => c.count), [0, 0]);
  r.send([r.dad(), r.child()]); assert.equal(r.tracker.status, 'armed');
});
test('tracker handles gradual standing-to-floor movement without relabeling by current height', () => {
  const t = new PeopleTracker(); let time = 0;
  const make = (x, size, bend) => {
    const p = person(pose(), { x, size });
    // Rotate the complete skeleton about the hip, preserving bone lengths.
    const cx = p.landmarks[23].x, cy = p.landmarks[23].y;
    p.landmarks.forEach(q => { const dx = (q.x - cx) * 4 / 3, dy = q.y - cy;
      q.x = cx + (dx * Math.cos(bend) - dy * Math.sin(bend)) / (4 / 3); q.y = cy + dx * Math.sin(bend) + dy * Math.cos(bend); });
    return p;
  };
  for (let i = 0; i < 30; i++) { time += 50; t.update([make(.28, .7, 0), make(.72, 1, 0)], time, 4 / 3); }
  for (let i = 1; i < 12; i++) {
    time += 50; const a = make(.28, .7, i * .08), b = make(.72, 1, i * .08);
    const assigned = t.update(i % 2 ? [b, a] : [a, b], time, 4 / 3);
    assert.equal(assigned[0], a); assert.equal(assigned[1], b);
  }
});
test('placement gives actionable distance and sustained roll feedback; floor poses are excluded', () => {
  const guide = new PlacementGuide(), small = person(pose(), { size: .3 });
  assert.equal(guide.update([small], 0, 4 / 3), 'far');
  const tilted = person(pose(), { x: .5, size: .8 });
  tilted.landmarks.forEach(p => p.y += (p.x - .5) * 4 / 3 * Math.tan(12 * Math.PI / 180));
  for (let t = 50; t < 850; t += 50) assert.equal(guide.update([tilted], t, 4 / 3), null);
  assert.equal(guide.update([tilted], 850, 4 / 3), 'tilt');
  assert.equal(guide.update([person(pose())], 900, 4 / 3), null);
  assert.equal(guide.update([{ landmarks: floorPose().p }], 950, 4 / 3), null);
});
test('recorder defaults off, whitelists skeleton fields, stops at limit and replays all new motions', () => {
  const off = new SkeletonRecorder(); off.add([{ landmarks: pose().p }], 10); assert.equal(off.json(), null);
  for (const [exercise, motion] of Object.entries(motions)) {
    const recorder = new SkeletonRecorder(), counter = new RepCounter(exercise); let time = 0;
    recorder.start({ exercise, mode: 'solo', thresholds: counter.t, aspect: 4 / 3, image: 'forbidden' }, 0);
    const add = sample => { for (let i = 0; i < 16; i++) { time += 50;
      recorder.add([{ landmarks: sample.p.map(p => ({ ...p, image: 'forbidden' })), world: sample.world, bitmap: 'forbidden' }], time); } };
    add(motion.rest()); recorder.markCountStart(time); add(motion.target()); add(motion.rest()); recorder.stop();
    const json = recorder.json(); assert.ok(!/forbidden|bitmap|image|video|age|height/.test(json));
    assert.equal(replayRecording(JSON.parse(json))[0].counted, 1, exercise);
    const before = json; recorder.add([], time + 100); assert.equal(recorder.json(), before);
  }
  const limited = new SkeletonRecorder(2); limited.start({ exercise: 'squats', mode: 'solo', thresholds: new RepCounter('squats').t, aspect: 1 }, 0);
  limited.add([], 10); limited.add([], 20); limited.add([], 30);
  assert.equal(limited.active, false); assert.equal(limited.recording.frames.length, 2); assert.equal(limited.recording.stoppedByLimit, true);
  assert.throws(() => replayRecording(limited.recording));
});
