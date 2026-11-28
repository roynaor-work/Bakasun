// Camera workout v1, real-people round (28/11/2026): the child's own proportions (body.mjs), steps in the
// guidance, and per-exercise confidence, each behind its address flag and off by default. Synthetic bodies of
// different sizes stand in for children until clips of real children exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADULT, proportionsOf, bodyFromFrames, kindOf, scalesOf, stepsBack } from '../workout/js/camera-v1/body.mjs';
import { measure } from '../workout/js/camera-v1/geometry.mjs';
import { guide } from '../workout/js/camera-v1/guide.mjs';
import { cameraFlags } from '../workout/js/camera-v1/flag.mjs';
import { MotionCounter } from '../workout/js/camera-v1/motion.mjs';
import { PoseTracker, calibrationFor, CALIBRATION_MS } from '../workout/js/camera-v1/tracking.mjs';

// A standing body in world coordinates (metres, y down, hip-centred). size scales every length, thigh/shin/arm
// are the lengths against the torso, turn rotates the body about the vertical axis (a diagonal stance).
function world({ torso = ADULT.torsoMeters, thigh = ADULT.thigh, shin = ADULT.shin, arm = ADULT.arm, turn = 0, v = .95 } = {}) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 }));
  const half = .19 * torso / ADULT.torsoMeters * 1.0;
  const cos = Math.cos(turn), sin = Math.sin(turn);
  const put = (i, x, y, z = 0) => { pts[i] = { x: x * cos + z * sin, y, z: -x * sin + z * cos, visibility: v, presence: v }; };
  for (const [sign, base] of [[-1, 11], [1, 12]]) {
    const x = sign * half;
    put(base, x, -torso);
    put(base + 12, x * .6, 0);
    put(base + 2, x * 1.15, -torso + arm * torso * .5);
    put(base + 4, x * 1.2, -torso + arm * torso);
    put(base + 14, x * .6, thigh * torso);
    put(base + 16, x * .6, (thigh + shin) * torso);
  }
  return pts;
}
const still = (options, n = 8) => Array.from({ length: n }, () => world(options));

test('proportions come out the same for any size of the same build, and any stance angle', () => {
  const adult = proportionsOf(world());
  assert.ok(Math.abs(adult.thigh - ADULT.thigh) < .01 && Math.abs(adult.shin - ADULT.shin) < .01 && Math.abs(adult.arm - ADULT.arm) < .01, JSON.stringify(adult));
  for (const turn of [0, .5, 1.1]) {
    const seen = proportionsOf(world({ turn }));
    assert.ok(Math.abs(seen.thigh - adult.thigh) < .01, 'the angle changes nothing: ' + turn);
  }
  const small = proportionsOf(world({ torso: .3 }));
  assert.ok(Math.abs(small.thigh - adult.thigh) < .01, 'a smaller child of the same build has the same ratios');
  assert.ok(small.torsoMeters < adult.torsoMeters);
});

test('a bad frame is not a body: missing hips, nonsense lengths, too few frames', () => {
  assert.equal(proportionsOf(null), null);
  assert.equal(proportionsOf(world({ v: .2 })), null, 'unsure joints give nothing');
  assert.equal(proportionsOf(world({ torso: 1.4 })), null, 'a torso of a metre and a half is no torso');
  const odd = proportionsOf(world({ thigh: 3 }));
  assert.equal(odd.thigh, undefined, 'an implausible thigh is left out, the rest kept');
  assert.equal(bodyFromFrames(still({}, 2)), null, 'two frames are not a measurement');
  const body = bodyFromFrames([...still({}, 6), world({ thigh: 1.3 })]);
  assert.ok(Math.abs(body.thigh - ADULT.thigh) < .02, 'one blurred frame does not move the median');
});

test('kinds and scales: a small child, an eleven-year-old as tall as a grown-up, a grown-up', () => {
  const kinds = [[.28, 'small'], [.40, 'child'], [.47, 'grown'], [.52, 'grown']];
  for (const [torso, kind] of kinds) assert.equal(kindOf(bodyFromFrames(still({ torso }))), kind, String(torso));
  const tall = scalesOf(bodyFromFrames(still({ torso: .48, thigh: ADULT.thigh })));
  assert.ok(Math.abs(tall.leg - 1) < .02 && Math.abs(tall.arm - 1) < .03, 'a tall eleven-year-old is read on the grown-up scale');
  const short = scalesOf(bodyFromFrames(still({ torso: .3, thigh: .78, arm: .9 })));
  assert.ok(short.leg > 1.1 && short.arm > 1.1, 'shorter legs and arms against the torso are scaled up: ' + JSON.stringify(short));
  assert.deepEqual(scalesOf(null), { leg: 1, shin: 1, arm: 1 });
  assert.ok(scalesOf({ thigh: .1 }).leg <= 1.35, 'a nonsense measurement cannot turn a threshold into nonsense');
});

// A frontal standing frame in the picture, with the thigh drawn shorter when the stance is turned.
function picture({ torso = .2, lift = 0, thighShown = 1 } = {}) {
  const pts = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0, presence: 0 }));
  const at = (i, x, y) => { pts[i] = { x: .5 + x, y, visibility: .95, presence: .95 }; };
  const hipY = .5, thigh = ADULT.thigh * torso * thighShown, shin = ADULT.shin * torso;
  for (const [sign, base] of [[-1, 11], [1, 12]]) {
    const x = sign * .05;
    at(base, x, hipY - torso); at(base + 2, x * 1.2, hipY - torso / 2); at(base + 4, x * 1.3, hipY);
    at(base + 12, x, hipY);
    const raised = sign === 1 ? lift * thigh : 0;
    at(base + 14, x, hipY + thigh - raised); at(base + 16, x, hipY + thigh + shin - raised);
    at(base + 20, x, hipY + thigh + shin + .02 - raised);
  }
  at(0, 0, hipY - torso - .09);
  return pts;
}

test('camBody: a child whose thigh could not be measured in the picture is still read on the grown-up scale', () => {
  const required = [[11, 23, 25, 27], [12, 24, 26, 28]];
  // A child with short thighs who starts crouched (as in a squat jump or a hall exercise): the picture gives
  // no straight-leg frame, so reference.thigh is null and the old reading cannot adapt at all.
  const crouched = picture({ thighShown: .78 }).map((p, i) => i === 25 || i === 26 ? { ...p, x: p.x + (i === 25 ? -.09 : .09) } : p);
  const reference = measure(crouched, .75, null, required);
  assert.equal(reference.thigh, null, 'no standing thigh from a bent start');
  const lifted = picture({ lift: .6, thighShown: .78 });
  const old = measure(lifted, .75, reference, required).kneeLift;
  const scale = scalesOf(bodyFromFrames(still({ thigh: ADULT.thigh * .78 }))).leg;
  assert.ok(scale > 1.2 && scale <= 1.35, String(scale));
  const now = measure(lifted, .75, { ...reference, legScale: scale }, required).kneeLift;
  assert.ok(Math.abs(now / old - scale) < 1e-9, 'the knee lift is restated by the measured proportion');
  // And where the picture did give a thigh, the world-based scale takes its place (it does not stack).
  const standing = measure(picture({ thighShown: .78 }), .75, null, required);
  assert.ok(standing.thigh > 0);
  const both = measure(lifted, .75, { ...standing, legScale: 1 }, required).kneeLift;
  const picOnly = measure(lifted, .75, standing, required).kneeLift;
  assert.ok(both !== picOnly && Math.abs(both - measure(lifted, .75, { ...standing, thigh: null }, required).kneeLift) < 1e-9, 'one scale, not two');
  // The arm reach is restated too.
  const arms = measure(picture(), .75, { ...reference, armScale: 1.2 }, required);
  const plain = measure(picture(), .75, reference, required);
  assert.ok(Math.abs(arms.left.armUp / plain.left.armUp - 1.2) < 1e-9);
});

test('camBody off by default: setReference without scales leaves the reference as before', () => {
  const counter = new MotionCounter('high-knees', { goal: 5 });
  assert.equal(counter.setReference(picture(), { aspect: .75 }), true);
  assert.equal(counter.reference.legScale, undefined);
  const scaled = new MotionCounter('high-knees', { goal: 5 });
  scaled.setReference(picture(), { aspect: .75, scales: { leg: 1.2, arm: 1.1 } });
  assert.equal(scaled.reference.legScale, 1.2);
  assert.equal(scaled.reference.armScale, 1.1);
});

test('the tracker hands the still frames of its calibration to the page', () => {
  const tracker = new PoseTracker({ view: 'front', setup: 'standing', required: [[11, 23, 25, 27], [12, 24, 26, 28]] });
  let last;
  const pose = { landmarks: picture(), world: world() };
  for (let time = 0; time <= 1500; time += 66) last = tracker.update({ poses: [pose], time, aspect: .75 });
  assert.equal(last.status, 'ready');
  assert.ok(last.calibration.worlds.length >= 4, 'calibration carries world frames');
  const body = bodyFromFrames(last.calibration.worlds);
  assert.ok(body && Math.abs(body.thigh - ADULT.thigh) < .05, JSON.stringify(body));
});

test('steps: a small child close by needs a step, a tall one near the phone needs more; no data, no number', () => {
  assert.equal(stepsBack({ torsoMeters: .3, torsoInPicture: .2 }), 0, 'a whole small child at this size fits');
  const close = stepsBack({ torsoMeters: .5, torsoInPicture: .34 });
  const closer = stepsBack({ torsoMeters: .5, torsoInPicture: .42 });
  assert.ok(close >= 1 && closer >= close, `${close} then ${closer}`);
  assert.ok(closer <= 4);
  assert.equal(stepsBack({ torsoMeters: undefined, torsoInPicture: .3 }), null);
  assert.equal(stepsBack({ torsoMeters: .4, torsoInPicture: 0 }), null);
});

test('camSteps: the guidance names the number of steps only when the flag is on and the size is known', () => {
  const near = picture({ torso: .42 });
  const sample = { poses: [{ landmarks: near, world: world() }], time: 1000, aspect: .75 };
  const policy = { required: [[11, 23, 25, 27], [12, 24, 26, 28]] };
  const plain = guide(sample, 'move-back', policy, {});
  assert.equal(plain.move, 'back');
  assert.ok(!/צעד/.test(plain.text), plain.text);
  const counted = guide(sample, 'move-back', { ...policy, steps: true }, {});
  assert.match(counted.text, /צעד/);
  assert.match(counted.say, /צְעָדִים|צַעַד/);
  const unknown = guide({ poses: [{ landmarks: near, world: [] }], time: 1000, aspect: .75 }, 'move-back', { ...policy, steps: true }, {});
  assert.ok(!/צעד/.test(unknown.text), 'without a size there is no number');
  const remembered = guide({ poses: [{ landmarks: near, world: [] }], time: 1000, aspect: .75 }, 'move-back', { ...policy, steps: true }, { torsoMeters: .5 });
  assert.match(remembered.text, /צעד/, 'the size measured at calibration is used when this frame has none');
});

test('flags: all off unless the address asks, and malformed addresses are harmless', () => {
  const off = { body: false, steps: false, conf: false, depth: false, place: false, forearm: false, start: false };
  assert.deepEqual({ ...cameraFlags('') }, off);
  assert.deepEqual({ ...cameraFlags('?camBody=1&camSteps=1') }, { ...off, body: true, steps: true });
  assert.deepEqual({ ...cameraFlags('?camBody=0&camConf=1') }, { ...off, conf: true });
  assert.deepEqual({ ...cameraFlags('?camPlace=1&camForearm=1') }, { ...off, place: true, forearm: true });
  assert.doesNotThrow(() => cameraFlags('%E0%A4%A'));
});

test('camStart: a standing exercise is ready after a shorter still moment; floor exercises and the default keep 650 ms', () => {
  assert.equal(calibrationFor({ setup: 'standing' }, false), 650);
  assert.equal(calibrationFor({ setup: 'floor' }, true), 650);
  assert.equal(calibrationFor({ setup: 'standing' }, true), CALIBRATION_MS.standingQuick);
  assert.equal(cameraFlags('?camStart=1').start, true);
  // Three sizes in the picture: a small child, an eleven-year-old as tall as a grown-up, a grown-up.
  for (const torso of [.11, .15, .19]) {
    const firstReady = calibrationMs => {
      const tracker = new PoseTracker({ view: 'front', setup: 'standing', required: [[11, 23, 25, 27], [12, 24, 26, 28]], calibrationMs });
      const pose = { landmarks: picture({ torso }), world: world() };
      for (let time = 0; time <= 2000; time += 66) if (tracker.update({ poses: [pose], time, aspect: .75 }).status === 'ready') return time;
      return null;
    };
    const quick = firstReady(calibrationFor({ setup: 'standing' }, true)), common = firstReady(calibrationFor({ setup: 'standing' }, false));
    assert.ok(quick != null && common != null, 'both become ready: ' + torso);
    assert.ok(common - quick >= 190, `the quick start is ready about a quarter of a second sooner (${quick} against ${common}): ` + torso);
  }
});
