import test from 'node:test';
import assert from 'node:assert/strict';
// Include the existing lab regressions in the repository's standard test command.
import '../workout/tests/cam-lab.test.mjs';
import { RepCounter, bodyReport, fullBody, features, thresholds, statusCode } from '../workout/cam-lab/counter.mjs';
import { StatusLine, RestGate, diagnosticLines } from '../workout/cam-lab/feedback.mjs';

import { pose } from './cam-lab-fixtures.js';
function sequence(exercise = 'squats') {
  const c = new RepCounter(exercise); let time = 0;
  const send = (sample, duration = 600) => {
    for (let elapsed = 0; elapsed < duration; elapsed += 50) {
      time += 50; c.update(sample?.p || [], sample?.world || [], time, 4 / 3);
    }
  };
  return { c, send, time: () => time };
}

test('weak heels and toes remain usable; ankles still require high confidence', () => {
  const sample = pose({ footConfidence: .4 }); assert.ok(fullBody(sample.p, 4 / 3));
  sample.p[27].visibility = .4;
  assert.deepEqual(bodyReport(sample.p, 4 / 3).failures, [{ reason: 'visibility', point: 27 }]);
});
test('a point inside the new margin and reasonable headroom pass; clipped head/ankle still fail', () => {
  const sample = pose(); sample.p[15].x = .02; sample.p[0].y = .075;
  assert.ok(fullBody(sample.p, 4 / 3));
  sample.p[27].y = .995;
  assert.ok(bodyReport(sample.p, 4 / 3).failures.some(f => f.reason === 'margin' && f.point === 27));
  sample.p[27].y = .92; sample.p[0].y = .025;
  assert.ok(bodyReport(sample.p, 4 / 3, 'placement').failures.some(f => f.reason === 'headroom'));
  assert.ok(bodyReport(sample.p, 4 / 3, 'squats').ok); // Setup clearance cannot block a rep.
});
test('optional heel flicker during standing, descent and return does not block squats', () => {
  const s = sequence(); s.send(pose());
  for (const angle of [110, 110, 110, 180, 180, 180]) {
    s.send(pose({ angle, footConfidence: .1 }), 50);
    s.send(pose({ angle }), 150);
  }
  assert.equal(s.c.count, 1); assert.equal(s.c.rejected, 0);
  const d = s.c.snapshot();
  assert.equal(d.fullBodyFailed, 0); assert.equal(d.failureFrames.visibility, 0);
  assert.equal(d.failedPoints.visibility?.[29], undefined); assert.equal(d.failedPoints.presence?.[32], undefined);
  assert.equal(d.graceRecoveries, 0); assert.equal(d.trackingResets, 0);
});
test('200ms tracking loss midway through a rep preserves the cycle', () => {
  const s = sequence(); s.send(pose()); s.send(pose({ angle: 110 }));
  const cycle = s.c.cycle; s.send(null, 200);
  assert.equal(s.c.cycle, cycle); assert.equal(s.c.phase, 'moving');
  s.send(pose({ angle: 110 }), 250); s.send(pose());
  assert.equal(s.c.count, 1); assert.equal(s.c.rejected, 0);
  assert.equal(s.c.snapshot().graceRecoveries, 1);
});
test('400ms between good frames survives; 450ms requires rearming', () => {
  for (const missing of [350, 400]) {
    const s = sequence(); s.send(pose()); s.send(pose({ angle: 110 }));
    s.send(null, missing); s.send(pose());
    assert.equal(s.c.count, missing === 350 ? 1 : 0);
    assert.equal(s.c.reasons.tracking || 0, missing === 350 ? 0 : 1);
  }
});
test('unknown frames do not satisfy target dwell', () => {
  const s = sequence(); s.send(pose()); s.send(pose({ angle: 130 }));
  s.send(pose({ angle: 90 }), 50); s.send(null, 200); s.send(pose({ angle: 90 }), 50);
  assert.equal(s.c.cycle.reached, false);
  s.send(pose()); assert.equal(s.c.count, 0); assert.equal(s.c.reasons.partial, 1);
});
test('a child returning only to 159 degrees can count repeated squats', () => {
  const s = sequence(); s.send(pose({ angle: 159, feet: 1.7, hands: .3 }));
  assert.equal(s.c.phase, 'armed');
  for (let i = 0; i < 3; i++) { s.send(pose({ angle: 110 })); s.send(pose({ angle: 159 })); }
  assert.equal(s.c.count, 3); assert.equal(s.c.rejected, 0);
  assert.equal(s.c.snapshot().cyclesStarted, 3);
});
test('relaxed jack stance arms and returns, while jitter never starts a cycle', () => {
  const s = sequence('jumping-jacks'); s.send(pose({ feet: 1.25, hands: .29 }));
  assert.equal(s.c.phase, 'armed');
  for (let i = 0; i < 20; i++) { s.send(pose({ feet: 1.31, hands: .3 }), 50); s.send(pose({ feet: 1.26, hands: .29 }), 50); }
  assert.equal(s.c.snapshot().cyclesStarted, 0);
  s.send(pose({ feet: 2.2, hands: .07 })); s.send(pose({ feet: 1.25, hands: .29 }));
  assert.equal(s.c.count, 1);
});
test('calibration uses the exercise rest and the start click preserves readiness', () => {
  const c = new RepCounter('squats'), gate = new RestGate('squats', c.t);
  const sample = pose({ angle: 159, feet: 1.7, hands: .3 });
  const f = features(sample.p, sample.world, 4 / 3);
  assert.equal(gate.update(f, 0), false); assert.equal(gate.update(f, 1200), false); // long gap
  for (let t = 1250; t <= 2400; t += 50) gate.update(f, t);
  assert.equal(gate.update(f, 2450), true);
  c.begin(2450, true); const down = pose({ angle: 110 });
  c.update(down.p, down.world, 2500, 4 / 3);
  assert.equal(c.phase, 'moving'); assert.equal(c.snapshot().cyclesStarted, 1);
});
test('calibration tolerates short flicker but does not credit missing standing time', () => {
  const gate = new RestGate('squats', thresholds()); const sample = pose();
  const f = features(sample.p, sample.world, 4 / 3);
  for (let t = 0; t <= 1000; t += 50) gate.update(f, t);
  gate.update(null, 1050); gate.update(null, 1100);
  assert.equal(gate.update(f, 1150), false);
  for (let t = 1200; t <= 1300; t += 50) gate.update(f, t);
  assert.equal(gate.update(f, 1350), true);
});
test('diagnostics count phases, failures, idle resets once per outage, and finish tail', () => {
  const c = new RepCounter('squats'), sample = pose(); c.begin(0);
  for (const t of [50, 100, 150, 200, 250]) c.update(sample.p, sample.world, t, 4 / 3);
  for (const t of [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800]) c.update([], [], t, 4 / 3);
  c.update(sample.p, sample.world, 850, 4 / 3); c.finish(900); c.finish(1000);
  const d = c.snapshot();
  assert.equal(d.frames, 17); assert.equal(d.fullBodyPassed, 6); assert.equal(d.fullBodyFailed, 11);
  assert.equal(d.fullBodyPercent, 600 / 17); assert.equal(d.failureFrames.missing, 11);
  assert.equal(d.idleTrackingResets, 1); assert.equal(d.trackingResets, 1);
  assert.deepEqual(d.phaseMs, { waiting: 400, armed: 500, moving: 0 });
  assert.equal(c.count, 0); assert.equal(c.rejected, 0);
  assert.ok(diagnosticLines(d).some(line => line.includes('לפני מחזור: 1')));
  const before = c.snapshot(); c.update([], [], 1100); assert.deepEqual(c.snapshot(), before);
  c.begin(1200); assert.equal(c.snapshot().frames, 0); assert.equal(c.snapshot().idleTrackingResets, 0);
});
test('moving phase records wall time across grace, while duplicate timestamps add nothing', () => {
  const c = new RepCounter('squats'), sample = pose({ angle: 110 }); c.begin(0, true);
  c.update(sample.p, sample.world, 50, 4 / 3);
  c.update([], [], 100, 4 / 3); c.update([], [], 150, 4 / 3);
  c.update(sample.p, sample.world, 200, 4 / 3);
  const before = c.snapshot(); c.update([], [], 200, 4 / 3); c.update([], [], 199, 4 / 3);
  assert.deepEqual(c.snapshot(), before);
  c.finish(300);
  assert.deepEqual(c.snapshot().phaseMs, { waiting: 0, armed: 50, moving: 250 });
  assert.equal(c.snapshot().graceRecoveries, 1); assert.equal(c.reasons.unfinished, 1);
});
test('all framing failures are named without leaking coordinates; numeric snapshots only', () => {
  const c = new RepCounter('squats'); const sample = pose();
  sample.p[27].visibility = .1; sample.p[28].presence = .1; sample.p[23].x = .995;
  sample.p[0].y = .03; sample.p[11].x = .47; sample.p[12].x = .53;
  c.update(sample.p, sample.world, 50, 4 / 3);
  const d = c.snapshot();
  for (const key of ['visibility', 'presence', 'margin', 'frontRatio']) assert.equal(d.failureFrames[key], 1, key);
  assert.equal(d.failureFrames.headroom, 0);
  assert.equal(d.failedPoints.margin[23], 1); assert.equal(d.failedPoints.visibility[27], 1);
  const numeric = value => {
    if (typeof value === 'object') for (const v of Object.values(value)) numeric(v);
    else assert.ok(typeof value === 'number' && Number.isFinite(value));
  };
  numeric(d);
  assert.ok(!/"(?:x|y|z|landmarks|world)"/.test(JSON.stringify(d)));
  assert.ok(diagnosticLines(d).some(line => line.includes('קרסול שמאל: 1')));
});
test('front-view and world failures are distinguished from framing and rest failures', () => {
  const c = new RepCounter('squats'), sample = pose();
  c.update(sample.p, [], 50, 4 / 3);
  assert.equal(c.status, 'world'); assert.equal(c.snapshot().fullBodyPassed, 1);
  assert.equal(c.snapshot().worldMissingFrames, 1);
  const report = bodyReport(sample.p, 4 / 3);
  assert.equal(statusCode(report, 'waiting'), 'waiting');
  sample.p[27].visibility = .1; assert.equal(statusCode(bodyReport(sample.p), 'armed'), 'legs');
  sample.p[27].visibility = 1; sample.p[7].visibility = .1;
  assert.equal(statusCode(bodyReport(sample.p), 'armed'), 'armed');
  sample.p[0].visibility = .1;
  assert.equal(statusCode(bodyReport(sample.p, 1, 'placement'), 'armed'), 'head');
});
test('status line changes at most once a second and uses the latest reason', () => {
  const line = new StatusLine(); assert.equal(line.update('waiting', 0)[0], 'תעמוד ישר כדי להתחיל');
  assert.equal(line.update('legs', 400), null); assert.equal(line.update('head', 999), null);
  assert.equal(line.update('head', 1000)[0], 'לא רואה את הראש');
  assert.equal(line.update('armed', 1500), null);
  assert.equal(line.update('moving', 2000)[0], 'יפה, עכשיו חוזרים לעמידה');
  assert.equal(line.update('moving', 4000), null);
});
