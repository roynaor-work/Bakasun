import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {yawSpring, bodyLean, dribbleOffset, createAthleteBody} from '../workout/island/minigames/soccer-athlete-body.mjs';
import {locomotionWeights, strideWarp} from '../workout/island/minigames/soccer-athlete-motion.mjs';

const config = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8')).minigames.soccer;
const m = config.view.athlete.motion;

test('yaw spring turns smoothly: no snap, no overshoot, settles', () => {
  const s = {yaw: 0, rate: 0}; let maxRate = 0, maxYaw = 0;
  for (let i = 0; i < 90; i++) { yawSpring(s, Math.PI / 2, 1 / 60, m.turnStiffness); maxRate = Math.max(maxRate, Math.abs(s.rate)); maxYaw = Math.max(maxYaw, s.yaw); }
  assert.ok(Math.abs(s.yaw - Math.PI / 2) < 0.01, 'settles on the wanted heading');
  assert.ok(maxYaw <= Math.PI / 2 + 1e-6, 'critically damped: never overshoots');
  assert.ok(maxRate < m.turnStiffness * Math.PI / 2 * 0.4, 'turn rate builds up instead of jumping');
  const first = {yaw: 0, rate: 0}; yawSpring(first, Math.PI / 2, 1 / 60, m.turnStiffness);
  assert.ok(first.yaw < 0.05, 'the first frame of a 90 degree turn moves only a little');
  const wrap = {yaw: 3.1, rate: 0}; yawSpring(wrap, -3.1, 1 / 60, m.turnStiffness);
  assert.ok(wrap.yaw > 3.1 || wrap.yaw < -3.1, 'takes the short way across +-pi');
});

test('body leans into the turn and with acceleration, within limits', () => {
  const left = bodyLean(5, 2, 0, m), right = bodyLean(5, -2, 0, m);
  assert.ok(left.roll < 0 && right.roll > 0, 'roll toward the inside of the turn');
  assert.ok(Math.abs(bodyLean(8, 30, 0, m).roll) <= m.maxRoll + 1e-9);
  assert.equal(bodyLean(0, 3, 0, m).roll === 0, true, 'no lean when standing');
  assert.ok(bodyLean(5, 0, 10, m).pitch > 0 && bodyLean(5, 0, -10, m).pitch < 0, 'forward on push-off, back on braking');
  assert.ok(bodyLean(5, 0, 1000, m).pitch <= m.maxPushPitch && bodyLean(5, 0, -1000, m).pitch >= -m.maxBrakePitch);
});

test('dribble touch: ball starts at the foot, rolls ahead, comes back for the next touch', () => {
  const at = u => dribbleOffset(u, 0.7, 5.3, 0.5, m);
  assert.ok(Math.abs(at(0) - 0.5 - m.dribbleGap) < 1e-9, 'leaves just ahead of the toe');
  assert.ok(at(0.35) > at(0.1) && at(0.35) > at(0.6), 'furthest ahead mid-cycle');
  assert.ok(Math.abs(at(0.7) - at(0)) < 1e-9, 'back at the toe for the next touch');
  assert.ok(dribbleOffset(0.35, 0.7, 1, 0.5, m) < at(0.35), 'smaller touches when slow');
});

test('stride warping: cadence times stride length matches the speed', () => {
  const clips = {jog: {speed: 2.8, duration: 0.767}, run: {speed: 3.35, duration: 0.667}, sprint: {speed: 4.25, duration: 0.633}};
  for (const v of [3, 5.3, 7.7]) {
    const w = locomotionWeights(v, v > 6, m), {rate, warp} = strideWarp(v, w, clips, m);
    let stride = 0, total = 0; for (const c of ['jog', 'run', 'sprint']) { stride += w[c] * clips[c].speed * clips[c].duration; total += w[c]; }
    stride /= total;
    assert.ok(warp >= 1 && warp <= m.maxStride);
    assert.ok(Math.abs(rate * stride * warp / v - 1) < 0.12, `feet keep up at ${v} m/s`);
  }
});

function leg() {
  // pivot > hips > thigh > shin > foot, a straight-ish leg 0.9 m long
  const pivot = new T.Group(), hips = new T.Bone(), up = new T.Bone(), low = new T.Bone(), foot = new T.Bone();
  hips.position.set(0, 0.98, 0); up.position.set(0.1, -0.03, 0); low.position.set(0, -0.44, 0.01); foot.position.set(0, -0.42, -0.01);
  low.rotation.x = -0.1; up.rotation.x = 0.05;
  pivot.add(hips); hips.add(up); up.add(low); low.add(foot);
  const otherUp = new T.Bone(), otherLow = new T.Bone(), otherFoot = new T.Bone(); otherUp.position.set(-0.1, -0.03, 0); otherLow.position.set(0, -0.44, 0.01); otherFoot.position.set(0, -0.42, 0); hips.add(otherUp); otherUp.add(otherLow); otherLow.add(otherFoot);
  otherLow.rotation.x = 0.9; // lifted
  const bones = {UpperLeg_R: {bone: up}, LowerLeg_R: {bone: low}, Foot_R: {bone: foot}, UpperLeg_L: {bone: otherUp}, LowerLeg_L: {bone: otherLow}, Foot_L: {bone: otherFoot}};
  return {pivot, bones, foot, low, up};
}

test('a planted foot stays on its spot while the body moves over it', () => {
  const {pivot, bones, foot, low, up} = leg(), body = createAthleteBody(T, {bones}, {...m, plantHeight: 0.2, plantIn: 1e-4});
  body.orient({vx: 0, vz: 0}, 0, 1 / 60, false);
  const start = new T.Vector3(), now = new T.Vector3();
  pivot.updateMatrixWorld(true); foot.getWorldPosition(start);
  assert.ok(start.y < 0.2, 'test leg reaches the turf');
  const rest = [up.quaternion.clone(), low.quaternion.clone(), foot.quaternion.clone()];
  body.plant(pivot, 1 / 60, 1); // touches down here
  for (let i = 1; i <= 10; i++) {
    [up.quaternion, low.quaternion, foot.quaternion].forEach((q, j) => q.copy(rest[j])); // the mixer rewrites the pose each frame
    pivot.position.set(0, 0, i * 0.012); // body slides 12 cm forward over the foot
    body.plant(pivot, 1 / 60, 1);
    pivot.updateMatrixWorld(true); foot.getWorldPosition(now);
  }
  assert.ok(Math.hypot(now.x - start.x, now.z - start.z) < 0.01, `foot stayed planted (moved ${Math.hypot(now.x - start.x, now.z - start.z).toFixed(3)} m)`);
  assert.ok(Math.abs(now.y - start.y) < 0.02);
  body.plant(pivot, 1 / 60, 0); body.plant(pivot, 0.5, 0);
  [up.quaternion, low.quaternion, foot.quaternion].forEach((q, j) => q.copy(rest[j]));
  body.plant(pivot, 1 / 60, 0); pivot.updateMatrixWorld(true); foot.getWorldPosition(now);
  assert.ok(Math.abs(now.z - 0.12 - start.z) < 0.01, 'released when actions take over');
});

test('render interpolation: even motion on a 120 Hz display, simulation unchanged', async () => {
  const {createSoccer} = await import('../workout/island/minigames/soccer.mjs');
  const make = () => createSoccer({config, seed: 41, stage: 4});
  const a = make(), b = make(), input = {moveX: 1, moveZ: 0};
  for (let i = 0; i < 30; i++) { a.update(1 / 60, input); b.update(1 / 120, input); b.update(1 / 120, input); }
  assert.deepEqual(b.getState().players.map(p => p.x), a.getState().players.map(p => p.x), 'the fixed-step simulation does not depend on the display rate');
  const id = b.getState().controlled, raw = [], shown = [];
  for (let i = 0; i < 12; i++) { b.update(1 / 120, input); raw.push(b.getState().players[id].x); shown.push(b.renderState().players[id].x); }
  const steps = xs => xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(steps(raw).some(d => Math.abs(d) < 1e-9), 'raw state stands still on every other 120 Hz frame');
  const d = steps(shown), mean = d.reduce((s, x) => s + x, 0) / d.length;
  assert.ok(mean > 0.01 && d.every(x => Math.abs(x - mean) < mean * 0.35), 'interpolated positions advance evenly every frame');
  assert.equal(b.renderState().players[id].vx, b.getState().players[id].vx);
});
