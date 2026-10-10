import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter, EXERCISES, bodyReport, requiredPoints, features } from '../workout/cam-lab/counter.mjs';
import { distanceGuide } from '../workout/cam-lab/placement.mjs';
import { diagnosticLines } from '../workout/cam-lab/feedback.mjs';
import { cameraConstraints, chooseZoom, configureCamera, cameraSummary, wideCameras } from '../workout/cam-lab/camera.mjs';
import { pose, floorPose, lungePose, person } from './cam-lab-fixtures.js';

const motion = {
  squats: [() => pose(), () => pose({ angle: 110 })],
  'jumping-jacks': [() => pose(), () => {
    const p = pose({ feet: 2.2, hands: .07 }); p.p[13].y = p.p[14].y = .18; return p;
  }],
  'high-knees': [() => pose(), () => {
    const p = pose(); p.p[25].y = .40; p.p[27].y = .60; return p;
  }],
  lunges: [() => lungePose(), () => lungePose({ angle: 95 })],
  'push-ups': [() => floorPose({ bridge: 180 }), () => floorPose({ elbow: 85, bridge: 180 })],
  'knee-push-ups': [() => floorPose({ bridge: 180 }), () => floorPose({ elbow: 85, bridge: 180 })],
  'glute-bridge': [() => floorPose(), () => floorPose({ bridge: 175 })],
};
function rig(exercise, step = 50) {
  const c = new RepCounter(exercise); let time = 0;
  return { c, send(sample, duration = 800) {
    for (let elapsed = 0; elapsed < duration; elapsed += step) {
      time += step; c.update(sample?.p || [], sample?.world || [], time, 3 / 4);
    }
  } };
}
function small(sample) {
  // 0.28 head-to-ankle height, centred; image scale changes, world angles do not.
  const p = person(sample, { size: .28 / .77, x: .5 }).landmarks;
  p.forEach(q => { q.y -= .25; });
  return { p, world: sample.world };
}
function optionalMissing(sample, exercise) {
  const report = bodyReport(sample.p, 3 / 4, exercise);
  for (let i = 0; i < 33; i++) if (!report.required.includes(i)) sample.p[i] = undefined;
  return sample;
}
for (const exercise of EXERCISES) {
  test(`${exercise}: only required points count a full rep; stationary jitter never counts`, () => {
    const [rest, target] = motion[exercise], s = rig(exercise);
    const clean = sample => optionalMissing(sample, exercise);
    s.send(clean(rest()));
    for (let i = 0; i < 30; i++) {
      const sample = clean(rest());
      sample.p.filter(Boolean).forEach(p => { p.x += i % 2 ? .001 : -.001; });
      s.send(sample, 50);
    }
    assert.equal(s.c.count, 0); assert.equal(s.c.diagnostics.cyclesStarted, 0);
    s.send(clean(target())); s.send(clean(rest()));
    assert.equal(s.c.count, 1); assert.equal(s.c.rejected, 0);
  });
  test(`${exercise}: one/two invalid required-point frames preserve a rep, not stationary noise`, () => {
    const [rest, target] = motion[exercise];
    for (const frames of [1, 2]) {
      const s = rig(exercise); s.send(rest()); s.send(target());
      const bad = target(), id = requiredPoints(exercise)[0]; bad.p[id].visibility = .1;
      s.send(bad, frames * 50); s.send(target(), 300); s.send(rest());
      assert.equal(s.c.count, 1); assert.equal(s.c.rejected, 0); assert.equal(s.c.diagnostics.graceRecoveries, 1);
      const still = rig(exercise); still.send(rest());
      const weakRest = rest(); weakRest.p[id].visibility = .1;
      for (let i = 0; i < 12; i++) { still.send(weakRest, frames * 50); still.send(rest(), 100); }
      assert.equal(still.c.count, 0); assert.equal(still.c.diagnostics.cyclesStarted, 0);
    }
  });
}
for (const exercise of ['squats', 'jumping-jacks', 'high-knees', 'lunges']) {
  test(`${exercise}: child span 0.28 and shallow headroom allow movement, not standing`, () => {
    const [rest, target] = motion[exercise], s = rig(exercise);
    assert.ok(bodyReport(small(rest()).p, 3 / 4, 'placement').ok);
    s.send(small(rest()), 3000); assert.equal(s.c.count, 0);
    s.send(small(target())); s.send(small(rest())); assert.equal(s.c.count, 1);
    const nearTop = rest(); nearTop.p[0].y = .04;
    assert.ok(bodyReport(nearTop.p, 3 / 4, 'placement').ok);
    const still = rig(exercise); still.send(nearTop, 3000); assert.equal(still.c.count, 0);
  });
}
for (const exercise of ['push-ups', 'knee-push-ups', 'glute-bridge']) {
  test(`${exercise}: small floor span 0.28 and the right side alone count, while holding still does not`, () => {
    const [rest, target] = motion[exercise];
    const transform = sample => {
      const ids = requiredPoints(exercise), xs = ids.map(i => sample.p[i].x), ys = ids.map(i => sample.p[i].y);
      const scale = .28 / Math.hypot((Math.max(...xs) - Math.min(...xs)) * .75, Math.max(...ys) - Math.min(...ys));
      sample.p.forEach(p => { p.x = .5 + (p.x - .5) * scale; p.y = .5 + (p.y - .6) * scale; });
      for (const i of requiredPoints(exercise, 1)) sample.p[i].visibility = 1;
      for (const i of ids) sample.p[i].visibility = .1;
      const report = bodyReport(sample.p, .75, exercise); assert.equal(report.side, 1); assert.ok(report.ok);
      return optionalMissing(sample, exercise);
    };
    const s = rig(exercise); s.send(transform(rest()), 3000); assert.equal(s.c.count, 0);
    s.send(transform(target())); s.send(transform(rest())); assert.equal(s.c.count, 1);
  });
}
test('jacks: clipped/weak wrists use raised elbows, and legs-only, arms-only and stillness never count', () => {
  const clipped = (up = false, open = false) => {
    const sample = pose({ feet: open ? 2.2 : 1 });
    for (const i of [15, 16]) Object.assign(sample.p[i], { y: -.2, visibility: .1, presence: .1 });
    for (const i of [13, 14]) sample.p[i].y = up ? .18 : .4;
    return sample;
  };
  const s = rig('jumping-jacks'); s.send(clipped(), 3000); assert.equal(s.c.count, 0);
  s.send(clipped(true, true)); s.send(clipped()); assert.equal(s.c.count, 1);
  const f = features(clipped(true, true).p, [], 3 / 4, bodyReport(clipped(true, true).p, 3 / 4, 'jumping-jacks'));
  assert.equal(f.armsUp, true);
  for (const [up, open] of [[false, true], [true, false]]) {
    const q = rig('jumping-jacks'); q.send(clipped()); q.send(clipped(up, open)); q.send(clipped());
    assert.equal(q.c.count, 0); assert.equal(q.c.reasons.partial, 1);
  }
  const jitter = rig('jumping-jacks'); jitter.send(clipped());
  for (let i = 0; i < 50; i++) {
    const sample = clipped(); sample.p[13].y += i % 2 ? .005 : -.005;
    sample.p[14].y += i % 2 ? -.005 : .005; jitter.send(sample, 50);
  }
  assert.equal(jitter.c.count, 0); assert.equal(jitter.c.diagnostics.cyclesStarted, 0);
});
test('squatting can shrink apparent height below placement span, without allowing stationary motion to count', () => {
  const s = rig('squats'); s.send(small(pose()));
  const down = small(pose({ angle: 110 }));
  down.p.forEach(p => { p.y = .55 + (p.y - .55) * .7; });
  assert.ok(bodyReport(down.p, .75, 'squats').failures.some(f => f.reason === 'bodySpan'));
  s.send(down); s.send(small(pose())); assert.equal(s.c.count, 1); assert.equal(s.c.rejected, 0);
  const still = rig('squats'); still.send(small(pose()));
  for (let i = 0; i < 20; i++) {
    const sample = small(pose()); sample.p.forEach(p => { p.y = .55 + (p.y - .55) * (i % 2 ? .7 : .71); });
    still.send(sample, 100);
  }
  assert.equal(still.c.count, 0); assert.equal(still.c.diagnostics.cyclesStarted, 0);
});
test('distance meter accepts a simulated 1.2m interval; gives relative approach/retreat amounts', () => {
  // Known synthetic pinhole projection only; not validation of an Android lens.
  for (const metres of [2, 2.4, 2.8, 3.2]) {
    const span = 1.2 / (2 * metres * Math.tan(Math.PI / 6));
    const sample = person(pose(), { size: span / .77, x: .5 });
    assert.ok(bodyReport(sample.landmarks, 3 / 4, 'placement').ok);
    assert.equal(distanceGuide(sample.landmarks, 3 / 4).direction, 'good');
    const c = rig('squats'); c.send({ p: sample.landmarks, world: sample.world }, 2000); assert.equal(c.c.count, 0);
  }
  const far = person(pose(), { size: .2 / .77 });
  assert.equal(distanceGuide(far.landmarks).direction, 'closer'); assert.equal(distanceGuide(far.landmarks).percent, 33);
  const close = pose(); close.p[0].y = -.04;
  assert.equal(distanceGuide(close.p).direction, 'away'); assert.ok(distanceGuide(close.p).percent >= 10);
  assert.equal(distanceGuide([]).direction, 'unknown');
});
test('numeric diagnostics distinguish framing, insufficient motion and missing model angles, with per-point percentages', () => {
  const s = rig('squats'); s.send(pose()); s.send(pose({ angle: 110 }));
  const clipped = pose({ angle: 110 }); clipped.p[27].y = 1.1;
  s.send(clipped, 600); s.send(pose());
  s.send(pose({ angle: 140 })); s.send(pose());
  const d = s.c.snapshot();
  assert.equal(d.rejectedBy.framing, 1); assert.equal(d.rejectedBy.motionThreshold, 1);
  assert.ok(d.requiredPointPercent[27] < 100); assert.equal(d.requiredPointPercent[11], 100);
  assert.equal(d.requiredPointPercent[15], undefined);
  const lines = diagnosticLines(d).join('\n');
  assert.match(lines, /מסגרת\/נקודות חובה: 1/); assert.match(lines, /תנועה שלא הגיעה לסף: 1/);
  assert.match(lines, /הסיבה הנפוצה.*שולי התמונה/);
  const numeric = value => { if (typeof value === 'object') Object.values(value).forEach(numeric);
    else assert.ok(typeof value === 'number' && Number.isFinite(value)); };
  numeric(d); assert.doesNotMatch(JSON.stringify(d), /"(?:x|y|z|landmarks|world|image|video)"/);
  const idle = rig('squats'); idle.send(pose(), 2000); assert.equal(idle.c.count, 0);
  assert.ok(diagnosticLines(idle.c.snapshot()).some(l => /לא זוהתה תחילת חזרה/.test(l)));
});
test('camera orientation and explicit lens selection keep a bounded pixel budget', () => {
  assert.deepEqual(cameraConstraints(true).video.width, { ideal: 480, max: 480 });
  assert.deepEqual(cameraConstraints(true).video.height, { ideal: 640, max: 640 });
  assert.equal(cameraConstraints(false).video.facingMode, 'user');
  assert.deepEqual(cameraConstraints(false, 'chosen').video.deviceId, { exact: 'chosen' });
  assert.equal(cameraConstraints(false).audio, false);
});
test('zoom selection handles fractional minima, steps, fixed zoom and missing/invalid zoom', () => {
  for (const [caps, wide, normal] of [
    [{}, null, null], [{ zoom: { min: .5, max: 4, step: .1 } }, .5, 1],
    [{ zoom: { min: .7, max: 3, step: .1 } }, .7, 1],
    [{ zoom: { min: 1, max: 4 } }, null, 1], [{ zoom: { min: 2, max: 4 } }, null, 2],
    [{ zoom: { min: .5, max: .5 } }, .5, .5], [{ zoom: { min: 0, max: 4 } }, null, null],
    [{ zoom: { min: 4, max: 1 } }, null, null], [{ zoom: true }, null, null],
  ]) { assert.equal(chooseZoom(caps), wide); assert.equal(chooseZoom(caps, false), normal); }
});
test('camera applies supported wide zoom and reports actual values, never claims an unavailable 0.5 lens', async () => {
  const devices = [{ kind: 'videoinput', deviceId: 'rear-wide', label: 'Back ultra-wide camera' },
    { kind: 'videoinput', deviceId: 'front', label: 'Front camera' }];
  for (const mode of ['supported', 'nozoom', 'rejected', 'ignored', 'unreported', 'min-one']) {
    let calls = 0, enumerated = 0, zoom = 1;
    const track = { getCapabilities: () => mode === 'nozoom' ? {} : { zoom: { min: mode === 'min-one' ? 1 : .5, max: 4 } },
      applyConstraints: async c => { calls++; if (mode === 'rejected') throw Error('not supported');
        if (mode !== 'ignored') zoom = c.advanced[0].zoom; },
      getSettings: () => ({ deviceId: 'front', width: 480, height: 640, ...(mode === 'unreported' ? {} : { zoom }) }) };
    const result = await configureCamera(track, { enumerateDevices: async () => { enumerated++; return devices; } });
    assert.equal(calls, ['nozoom', 'min-one'].includes(mode) ? 0 : 1);
    assert.equal(result.wideApplied, +(mode === 'supported'));
    assert.equal(enumerated, mode === 'supported' ? 0 : 1);
    assert.equal(result.alternatives.length, mode === 'supported' ? 0 : 1);
    assert.match(cameraSummary(result), /480×640/);
    if (mode !== 'supported') assert.match(cameraSummary(result), /לא אישר זום רחב/);
    if (mode === 'unreported') assert.match(cameraSummary(result), /זום לא דווח/);
    // Controls cannot synthesize exercise movement.
    const still = rig('squats'); still.send(pose(), 2000); assert.equal(still.c.count, 0);
  }
  assert.deepEqual(wideCameras(devices, 'rear-wide'), []);
  assert.deepEqual(wideCameras([{ kind: 'videoinput', deviceId: 'hidden', label: '' }]), []);
  const normal = await configureCamera({ getCapabilities: () => ({ zoom: { min: .5, max: 4 } }),
    applyConstraints: async c => assert.equal(c.advanced[0].zoom, 1), getSettings: () => ({ zoom: 1 }) }, {}, false);
  assert.equal(normal.requestedWide, 0); assert.match(cameraSummary(normal), /נבחר מצב רגיל/);
});
