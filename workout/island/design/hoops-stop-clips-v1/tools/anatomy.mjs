// SPDX-License-Identifier: CC0-1.0
// Joint ranges, limb clearance, floor penetration and trunk lean on the baked frames (all 30 Hz frames plus 240 Hz interpolated samples for the floor).
import fs from 'node:fs/promises';
import {fk, rotate, sub, add, mul, qi, clamp} from './rig.mjs';
import {sampleMotion} from '../runtime/player.mjs';
import {soleWorld, rootAt} from './qa.mjs';

const D2R = Math.PI / 180;
const ptSeg = (p, a, b) => { const ab = sub(b, a), t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2), 0, 1); return Math.hypot(...sub(p, add(a, mul(ab, t)))); };
const segGap = (a, b, c, d) => { let m = 9; for (let i = 0; i <= 10; i++) { const p = add(a, mul(sub(b, a), i / 10)); m = Math.min(m, ptSeg(p, c, d)); } return m; };

export function anatomy(clip) {
  const o = {kneeFlexMin: 999, kneeFlexMax: -999, elbowFlexMin: 999, elbowFlexMax: -999, hipFlexMin: 999, hipFlexMax: -999, legGapMin: 9, handTorsoMin: 9, trunkLeanMin: 999, trunkLeanMax: -999, soleBelowFloorCm: 0, floatCm: 0, handFloorMin: 9};
  for (const f of clip.frames) {
    const p = {hips: f.hips, rotations: f.rotations}, w = fk(p);
    for (const s of ['Left', 'Right']) {
      const kq = f.rotations[s + 'Leg'], kn = 2 * Math.atan2(kq[0], kq[3]) / D2R, kn2 = kn > 180 ? kn - 360 : kn < -180 ? kn + 360 : kn;
      o.kneeFlexMin = Math.min(o.kneeFlexMin, kn2); o.kneeFlexMax = Math.max(o.kneeFlexMax, kn2);
      const eq = f.rotations[s + 'ForeArm'], el = -2 * Math.atan2(eq[0], eq[3]) / D2R;
      o.elbowFlexMin = Math.min(o.elbowFlexMin, el); o.elbowFlexMax = Math.max(o.elbowFlexMax, el);
      const th = rotate(qi(w.Hips.rotation), sub(w[s + 'Leg'].position, w[s + 'UpLeg'].position)), flex = Math.atan2(th[2], -th[1]) / D2R;
      o.hipFlexMin = Math.min(o.hipFlexMin, flex); o.hipFlexMax = Math.max(o.hipFlexMax, flex);
      o.handTorsoMin = Math.min(o.handTorsoMin, ptSeg(w[s + 'Hand'].position, w.Hips.position, w.Neck.position));
      o.handFloorMin = Math.min(o.handFloorMin, w[s + 'Hand'].position[1]);
    }
    o.legGapMin = Math.min(o.legGapMin,
      segGap(w.LeftUpLeg.position, w.LeftLeg.position, w.RightUpLeg.position, w.RightLeg.position), segGap(w.LeftLeg.position, w.LeftFoot.position, w.RightLeg.position, w.RightFoot.position),
      segGap(w.LeftUpLeg.position, w.LeftLeg.position, w.RightLeg.position, w.RightFoot.position), segGap(w.LeftLeg.position, w.LeftFoot.position, w.RightUpLeg.position, w.RightLeg.position));
    const up = rotate(w.Chest.rotation, [0, 1, 0]), lean = Math.atan2(up[2] * Math.cos(0) , up[1]) / D2R; // forward = +Z in the clip frame, rotated body: use the pelvis heading
    const fwd = rotate(w.Hips.rotation, [0, 0, 1]), hdg = Math.hypot(fwd[0], fwd[2]) || 1, f2 = [fwd[0] / hdg, fwd[2] / hdg], l = (up[0] * f2[0] + up[2] * f2[1]) / up[1];
    const leanDeg = Math.atan(l) / D2R; o.trunkLeanMin = Math.min(o.trunkLeanMin, leanDeg); o.trunkLeanMax = Math.max(o.trunkLeanMax, leanDeg);
  }
  const n = Math.round(clip.duration * 240);
  for (let i = 0; i <= n; i++) {
    const t = Math.min(clip.duration, i / 240), p = sampleMotion(clip, t), w = fk(p);
    for (const b of ['LeftFoot', 'RightFoot']) { const s = soleWorld(clip, b, t)[1]; o.soleBelowFloorCm = Math.max(o.soleBelowFloorCm, -s * 100); }
    // toe-down heel/ball is not modelled (one rigid foot): the lowest foot point is the sole at the ankle origin
    o.handFloorMin = Math.min(o.handFloorMin, w.LeftHand.position[1], w.RightHand.position[1]);
  }
  const r = x => +x.toFixed(2);
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v)]));
}
export const limits = {kneeFlex: [-2, 150], elbowFlex: [-2, 150], hipFlex: [-35, 125], legGapMin: .08, handTorsoMin: .1, soleBelowFloorCm: .5};
export function anatomyVerdict(a) {
  const f = [];
  if (a.kneeFlexMin < limits.kneeFlex[0] || a.kneeFlexMax > limits.kneeFlex[1]) f.push('knee');
  if (a.elbowFlexMin < limits.elbowFlex[0] || a.elbowFlexMax > limits.elbowFlex[1]) f.push('elbow');
  if (a.hipFlexMin < limits.hipFlex[0] || a.hipFlexMax > limits.hipFlex[1]) f.push('hip');
  if (a.legGapMin < limits.legGapMin) f.push('legs-cross');
  if (a.handTorsoMin < limits.handTorsoMin) f.push('hand-in-torso');
  if (a.soleBelowFloorCm > limits.soleBelowFloorCm) f.push('floor');
  return f;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(await fs.readFile(new URL('../runtime/motions.json', import.meta.url)));
  const rows = data.clips.map(c => { const a = anatomy(c); return {id: c.id, ...a, fail: anatomyVerdict(a).join(',')}; });
  console.table(rows.map(({id, kneeFlexMin, kneeFlexMax, elbowFlexMin, elbowFlexMax, hipFlexMin, hipFlexMax, legGapMin, handTorsoMin, trunkLeanMax, soleBelowFloorCm, fail}) => ({id: id.replace('hoops_', ''), kneeFlexMin, kneeFlexMax, elbowFlexMin, elbowFlexMax, hipFlexMin, hipFlexMax, legGapMin, handTorsoMin, trunkLeanMax, soleBelowFloorCm, fail})));
}
