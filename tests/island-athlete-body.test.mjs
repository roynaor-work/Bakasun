import test from 'node:test';
import assert from 'node:assert/strict';
import {athleteRetargetMap, sleeveWeights, athleteKitFor, athleteHeight, qFromUnitVectors, CANON_REST, ATHLETE_MAP, athleteBodyEnabled} from '../workout/island/minigames/athlete-body.mjs';

// A small athlete-like rig: Hips -> LowerBack -> Spine -> Spine1 -> LeftShoulder -> LeftArm (diagonal) -> LeftForeArm -> LeftHand -> LThumb
const rig = {joints: [
  {name: 'Hips', parent: null, translation: [0, 0.95, 0], rotation: [0, 0, 0, 1]},
  {name: 'LowerBack', parent: 'Hips', translation: [0, 0.05, 0], rotation: [0.1, 0, 0, 0.995]},
  {name: 'Spine', parent: 'LowerBack', translation: [0, 0.15, 0], rotation: [0, 0, 0, 1]},
  {name: 'Spine1', parent: 'Spine', translation: [0, 0.2, 0], rotation: [0, 0, 0, 1]},
  {name: 'Neck', parent: 'Spine1', translation: [0, 0.1, 0], rotation: [0, 0, 0, 1]},
  {name: 'Head', parent: 'Neck', translation: [0, 0.12, 0], rotation: [0, 0, 0, 1]},
  {name: 'LeftShoulder', parent: 'Spine1', translation: [0.05, 0.08, 0], rotation: [0, 0, 0.2, 0.98]},
  {name: 'LeftArm', parent: 'LeftShoulder', translation: [0.12, 0, 0], rotation: [0, 0, 0, 1]},
  {name: 'LeftForeArm', parent: 'LeftArm', translation: [0.2, -0.2, 0], rotation: [0, 0, 0, 1]},
  {name: 'LeftHand', parent: 'LeftForeArm', translation: [0.15, -0.15, 0], rotation: [0, 0, 0, 1]},
  {name: 'LThumb', parent: 'LeftHand', translation: [0.03, -0.02, 0.02], rotation: [0, 0.3, 0, 0.954]},
  {name: 'RightArm', parent: 'Spine1', translation: [-0.16, 0.06, 0], rotation: [0, 0, 0, 1]},
  {name: 'RightForeArm', parent: 'RightArm', translation: [0, -0.27, 0], rotation: [0, 0, 0, 1]},
  {name: 'RightHand', parent: 'RightForeArm', translation: [0, -0.24, 0], rotation: [0, 0, 0, 1]},
  {name: 'LeftUpLeg', parent: 'Hips', translation: [0.1, 0, 0], rotation: [0, 0, 0, 1]}, {name: 'LeftLeg', parent: 'LeftUpLeg', translation: [0, -0.45, 0], rotation: [0, 0, 0, 1]}, {name: 'LeftFoot', parent: 'LeftLeg', translation: [0, -0.42, 0], rotation: [0, 0, 0, 1]},
  {name: 'RightUpLeg', parent: 'Hips', translation: [-0.1, 0, 0], rotation: [0, 0, 0, 1]}, {name: 'RightLeg', parent: 'RightUpLeg', translation: [0, -0.45, 0], rotation: [0, 0, 0, 1]}, {name: 'RightFoot', parent: 'RightLeg', translation: [0, -0.42, 0], rotation: [0, 0, 0, 1]},
]};
const qrot = (q, v) => { const [x, y, z, w] = q, [vx, vy, vz] = v; const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz; return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };

test('retarget map covers every athlete joint and points the diagonal upper arm straight down', () => {
  const map = athleteRetargetMap(rig, CANON_REST);
  assert.equal(map.bones.length, rig.joints.length);
  assert.equal(map.targetBoneCount, rig.joints.length);
  const names = new Set(map.bones.map(b => b.target)); for (const j of rig.joints) assert.ok(names.has(j.name), j.name);
  const arm = map.bones.find(b => b.target === 'LeftArm');
  assert.equal(arm.source, 'LeftArm');
  // basis * (athlete child direction) = canonical child direction (straight down)
  const d = qrot(arm.targetBasisWorldQuaternion, [0.2, -0.2, 0].map(v => v / Math.hypot(0.2, 0.2)));
  assert.ok(Math.abs(d[0]) < 1e-6 && Math.abs(d[1] + 1) < 1e-6, 'arm basis ' + d);
  // extra bones ride on the nearest mapped ancestor
  const lb = map.bones.find(b => b.target === 'LowerBack'); assert.equal(lb.inheritSource, 'Hips'); assert.equal(lb.source, null);
  const sh = map.bones.find(b => b.target === 'LeftShoulder'); assert.equal(sh.inheritSource, 'Chest');
  const th = map.bones.find(b => b.target === 'LThumb'); assert.equal(th.inheritSource, 'LeftHand');
  assert.ok(Math.abs(map.motionScale - 0.95 / 0.86) < 1e-9);
  assert.deepEqual(map.canonical, Object.keys(ATHLETE_MAP));
});

test('an inherited bone keeps its bind local rotation relative to its mapped ancestor', () => {
  const map = athleteRetargetMap(rig, CANON_REST);
  const hips = map.bones.find(b => b.target === 'Hips').targetBasisWorldQuaternion, lb = map.bones.find(b => b.target === 'LowerBack').targetBasisWorldQuaternion;
  // basis(LowerBack) = basis(Hips) * bindLocal(LowerBack); with Hips basis = bind (identity child-less? no: Hips has child Spine) -> check the product form
  const bind = [0.1, 0, 0, 0.995], n = Math.hypot(...bind), b = bind.map(v => v / n);
  const [ax, ay, az, aw] = hips, [bx, by, bz, bw] = b;
  const expect = [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(expect[i] - lb[i]) < 1e-9);
});

test('qFromUnitVectors matches the shortest rotation, including the antiparallel case', () => {
  const q = qFromUnitVectors([1, 0, 0], [0, 1, 0]); const v = qrot(q, [1, 0, 0]);
  assert.ok(Math.abs(v[0]) < 1e-9 && Math.abs(v[1] - 1) < 1e-9);
  const back = qrot(qFromUnitVectors([0, 1, 0], [0, -1, 0]), [0, 1, 0]); assert.ok(Math.abs(back[1] + 1) < 1e-9);
});

test('sleeve weights flag the arm-skinned vertices only', () => {
  const names = ['Hips', 'Spine1', 'LeftShoulder', 'LeftArm', 'LeftForeArm'];
  const idx = Uint16Array.from([3, 2, 0, 0, 2, 3, 0, 0, 1, 2, 0, 0, 4, 3, 0, 0]), w = Float32Array.from([0.9, 0.1, 0, 0, 0.7, 0.3, 0, 0, 0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0]);
  const r = sleeveWeights(idx, w, names);
  assert.deepEqual([...r.weights].map(v => v >= 0.5 ? 1 : 0), [1, 0, 0, 1]); assert.equal(r.sleeves, 2); assert.equal(r.count, 4);
  assert.ok(r.weights[0] === 1 && r.weights[3] === 1 && r.weights[2] < r.weights[1] && r.weights[1] < 0.5, 'continuous falloff');
});

test('kits: basketball is primary with white sneakers, soccer keeper contrasts, a selected kit passes through', () => {
  const b = athleteKitFor('basketball', ['#112233', '#ffcc00']); assert.equal(b.primary, '#112233'); assert.equal(b.boots, '#f6f6f3'); assert.equal(b.bootAccent, '#ffcc00'); assert.equal(b.style, 'basketball');
  const k = athleteKitFor('soccer', ['#112233', '#ffcc00'], {keeper: true, keeperColor: '#abcdef'}); assert.equal(k.primary, '#abcdef');
  const s = athleteKitFor('soccer', null, {selected: {primary: '#000000', secondary: '#111111', shorts: '#222222', shortsTrim: '#333333', socks: '#444444', socksTrim: '#555555'}}); assert.equal(s.primary, '#000000'); assert.equal(s.style, 'soccer');
});

test('heights follow the sport table unless a height is given', () => {
  assert.equal(athleteHeight('basketball', 'center'), 2.08); assert.equal(athleteHeight('soccer', 'keeper'), 1.86); assert.equal(athleteHeight('soccer', 'field', 1.75), 1.75); assert.equal(athleteHeight('hockey', 'skater'), 1.8);
});

test('the flag: off only with ?athleteBody=0', () => {
  assert.equal(athleteBodyEnabled('?athleteBody=0'), false); assert.equal(athleteBodyEnabled(''), true); assert.equal(athleteBodyEnabled('?athleteBody=1'), true);
});
