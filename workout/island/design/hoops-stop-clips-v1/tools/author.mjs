// SPDX-License-Identifier: CC0-1.0
// Original basketball stopping and defensive footwork clips on the canonical 18-bone rig. 30 Hz, metres, Root fixed.
// Travel is declared separately (clip.path); a planted sole is planted in root-path + clip space (measure.mjs checks it).
import fs from 'node:fs/promises';
import {synth, swingArm, smoothPass, loadIdle, yawPose, blend, idleAnchor, SOLE, bones, fk, curve, euler, rotate, add, sub, mul, slerp, qm, qi, I, clamp, smooth, solve} from './synth.mjs';

const base = new URL('../', import.meta.url);
const {idle} = await loadIdle();
const C = (t, keys) => curve(keys, t);
const D2R = Math.PI / 180;

// ---------- root paths ----------
/** Constant deceleration from v0 to rest over Ts, along heading (dx,dz); then still. */
const stopPath = (v0, Ts, dir = [0, 1]) => { const a = v0 / Ts; return t => { const s = t < 0 ? v0 * t : t < Ts ? v0 * t - .5 * a * t * t : v0 * Ts / 2; return [dir[0] * s, dir[1] * s]; }; };
const cruise = (v, dir = [0, 1]) => t => [dir[0] * v * t, dir[1] * v * t];
const sc = (list, k) => list.map(c => ({...c, td: c.td * k, to: c.to * k}));

// ---------- clip factories ----------
/** Jump stop from a sprint: last cruise step, a short hop, both feet land ahead of the pelvis and absorb. */
function stopSprint(v0) {
  const Ts = .42, T = .65, k = Ts / .495, D = v0 * Ts / 2;
  const L = sc([{td: -.30, to: -.20}, {td: -.02, to: .09, auto: [.12, .1]}, {td: .36, to: 9, fin: true}], k);
  const R = sc([{td: -.16, to: -.07, auto: [-.12, .1]}, {td: .16, to: .27, auto: [-.14, .2]}, {td: .385, to: 9, fin: true}], k);
  // virtual earlier contacts need anchors: place them one stride behind
  L[0].a = [.12, -v0 * .26]; R[0].a = [-.12, -v0 * .12 - .1];
  const lean = C2([[0, 24], [.15 * k, 22], [.30 * k, 14], [.40 * k, 10], [.55 * k, 6], [.65, 0]]);
  const y = C2([[0, .76], [.09 * k, .78], [.2 * k, .74], [.3 * k, .72], [.4 * k, .56], [.5 * k, .52], [.57, .66], [.65, .785]]);
  return {
    T, root: stopPath(v0, Ts), contacts: {Left: L, Right: R}, lift: (t, d) => Math.min(.34, .08 + .08 * d),
    body: t => ({y: y(t), lean: lean(t), hipPitch: lean(t) * .5, spinePitch: lean(t) * .25, chestPitch: lean(t) * .15, head: -lean(t) * .3, roll: 0, kneeOut: .1, ox: 0, oz: 0}),
    arms: (t, c) => {
      const f = armPhase(t, c), brake = smooth((t - .22 * k) / (.18 * k)), settle = 1 - smooth((t - .46) / .16);
      const a = {Left: swingArm('Left', f.L * (1 - brake), .5 * brake * settle, .04 * brake), Right: swingArm('Right', f.R * (1 - brake), .5 * brake * settle, .04 * brake)};
      return a;
    },
    meta: {Ts, D},
  };
}
function C2(keys) { return t => C(t, keys); }
const armPhase = (t, c) => ({L: clamp(-c.rel.Right / .55, -1, 1), R: clamp(-c.rel.Left / .55, -1, 1)});

/** Stride stop from a run: a braking stride, one more step, the pelvis comes over the final feet. */
function stopRun(v0) {
  const Ts = .34, T = .55, D = v0 * Ts / 2, k = Ts / .40;
  const L = sc([{td: -.30, to: -.16}, {td: -.06, to: .09, auto: [.1, .1]}, {td: .31, to: 9, fin: true}], k);
  const R = sc([{td: -.22, to: -.09, auto: [-.1, .1]}, {td: .12, to: .25, auto: [-.13, .16]}, {td: .38, to: 9, fin: true}], k);
  L[0].a = [.1, -v0 * .24]; R[0].a = [-.1, -v0 * .13];
  const lean = C2([[0, 14], [.12 * k, 14], [.25 * k, 10], [.4 * k, 7], [.55, 0]]);
  const y = C2([[0, .77], [.09 * k, .78], [.2 * k, .72], [.3 * k, .69], [.4 * k, .66], [.46, .72], [.55, .785]]);
  return {
    T, root: stopPath(v0, Ts), contacts: {Left: L, Right: R}, lift: (t, d) => Math.min(.3, .06 + .1 * d),
    body: t => ({y: y(t), lean: lean(t), hipPitch: lean(t) * .5, spinePitch: lean(t) * .25, chestPitch: lean(t) * .15, head: -lean(t) * .3, kneeOut: .08}),
    arms: (t, c) => { const f = armPhase(t, c), br = smooth((t - .15 * k) / (.2 * k)), st = 1 - smooth((t - .36) / .14);
      return {Left: swingArm('Left', f.L * (1 - .7 * br) * st, .4 * br * st, .03 * br), Right: swingArm('Right', f.R * (1 - .7 * br) * st, .4 * br * st, .03 * br)}; },
    meta: {Ts, D},
  };
}
/** Slowing from a jog to a walk-in-place and a stand. */
function stopJog(v0) {
  const Ts = .30, T = .5, D = v0 * Ts / 2, k = Ts / .41;
  const L = sc([{td: -.34, to: -.2}, {td: -.08, to: .12, auto: [.08, .08]}, {td: .41, to: 9, fin: true}], k);
  const R = sc([{td: -.24, to: -.1, auto: [-.08, .08]}, {td: .21, to: 9, fin: true}], k);
  L[0].a = [.1, -v0 * .26]; R[0].a = [-.1, -v0 * .14];
  const lean = C2([[0, 9], [.15 * k, 8], [.3 * k, 5], [.5, 0]]);
  const y = C2([[0, .775], [.1 * k, .775], [.22 * k, .745], [.35 * k, .75], [.42, .77], [.5, .785]]);
  return {
    T, root: stopPath(v0, Ts), contacts: {Left: L, Right: R}, lift: (t, d) => Math.min(.18, .04 + .1 * d),
    body: t => ({y: y(t), lean: lean(t), hipPitch: lean(t) * .5, spinePitch: lean(t) * .25, chestPitch: lean(t) * .15, head: -lean(t) * .3}),
    arms: (t, c) => { const f = armPhase(t, c), st = 1 - smooth((t - .25 * k) / (.3)); return {Left: swingArm('Left', f.L * st * .8, 0, 0), Right: swingArm('Right', f.R * st * .8, 0, 0)}; },
    meta: {Ts, D},
  };
}
/** Defensive slide, looping, 0.8 s, two lateral steps per foot cycle pair. Travel toward the athlete's left (+X). */
const SLIDE_V = 3.4, SLIDE_T = .8;
function slideBody(t) { const b = .012 * Math.cos(2 * Math.PI * t / .2); return {y: .625 + b, lean: 14, hipPitch: 16, spinePitch: 6, chestPitch: -2, head: -6, roll: 3, kneeOut: .25, ox: 0, oz: 0}; }
function slideArms(t) {
  const w = 2 * Math.PI * t / SLIDE_T;
  return {Left: {hand: [.34, -.26 + .03 * Math.sin(w), .17 + .04 * Math.sin(w)], elbow: [.7, -.4, -.5]}, Right: {hand: [-.30, -.14 + .03 * Math.cos(w), .26 + .04 * Math.cos(w)], elbow: [-.7, -.4, -.5]}};
}
function slideFast() {
  const T = SLIDE_T, L = [], R = [];
  for (let k = -2; k <= 3; k++) {
    L.push({td: .4 * k, to: .4 * k + .16, auto: [.35, .04]});
    R.push({td: .4 * k + .2, to: .4 * k + .36, auto: [-.35, -.04]});
  }
  return {T, root: cruise(SLIDE_V, [1, 0]), contacts: {Left: L, Right: R}, lift: (t, d) => Math.min(.16, .04 + .06 * d), body: slideBody, arms: slideArms, meta: {speed: SLIDE_V, loopSeconds: T}};
}
const mixArm = (a, b, u) => ({hand: a.hand.map((v, i) => v + (b.hand[i] - v) * u), elbow: a.elbow.map((v, i) => v + (b.elbow[i] - v) * u)});
/** Slide into a turn-and-run (the body turns to face +X, the direction of travel). */
function slideRecoverForward() {
  const T = .5, speed = C2([[0, SLIDE_V], [.5, 4.5]]);
  const root = t => { let x = 0; const n = Math.max(1, Math.round(Math.abs(t) * 600)), h = t / n; for (let i = 0; i < n; i++) x += speed(i * h + h / 2) * h; return [x, 0]; };
  const yaw = t => 90 * smooth((t - .04) / .36);
  const L = [{td: -.4, to: -.24, auto: [.35, .04]}, {td: 0, to: .16, auto: [.35, .04]}, {td: .36, to: .47, auto: [.14, .12]}];
  const R = [{td: -.2, to: -.04, auto: [-.35, -.04]}, {td: .20, to: .34, auto: [-.24, .02]}, {td: .54, to: 9, auto: [-.14, .12]}];
  const ramp = t => smooth((t - .1) / .35);
  return {T, root, endYaw: 90, contacts: {Left: L, Right: R}, lift: (t, d) => Math.min(.2, .05 + .08 * d),
    body: t => { const s = slideBody(t), r = ramp(t); return {...s, y: s.y + (.78 - s.y) * r, lean: 14 + 4 * r, hipPitch: s.hipPitch * (1 - r) + 9 * r, yaw: yaw(t), roll: s.roll * (1 - r), kneeOut: s.kneeOut * (1 - r)}; },
    arms: (t, c) => { const r = ramp(t), s = slideArms(t), f = armPhase(t, c); const ra = {Left: swingArm('Left', f.L, 0, 0), Right: swingArm('Right', f.R, 0, 0)}; return {Left: mixArm(s.Left, ra.Left, r), Right: mixArm(s.Right, ra.Right, r)}; },
    meta: {speedStart: SLIDE_V, speedEnd: 4.5, bodyYawChangeDegrees: 90}};
}
export {stopRun, stopJog, slideFast, slideRecoverForward, SLIDE_V, SLIDE_T, slideBody, slideArms, mixArm};

/** Slide into a backpedal run: the body keeps facing +Z while the travel turns from +X to -Z. */
function slideRecoverBack() {
  const T = .5, speed = C2([[0, SLIDE_V], [.25, 3.2], [.5, 3.4]]), head = t => 90 + 90 * smooth((t - .05) / .35); // heading from +X to -Z (degrees from +Z, clockwise toward +X)
  const root = t => { let x = 0, z = 0; const n = Math.max(1, Math.round(Math.abs(t) * 600)), h = t / n; for (let i = 0; i < n; i++) { const tm = i * h + h / 2, s = speed(tm), a = head(tm) * D2R; x += s * Math.sin(a) * h; z += s * Math.cos(a) * h; } return [x, z]; };
  const L = [{td: -.4, to: -.24, auto: [.35, .04]}, {td: 0, to: .16, auto: [.35, .04]}, {td: .36, to: .5, auto: [.14, -.1]}];
  const R = [{td: -.2, to: -.04, auto: [-.35, -.04]}, {td: .20, to: .34, auto: [-.2, -.12]}, {td: .54, to: 9, auto: [-.14, -.1]}];
  const ramp = t => smooth((t - .12) / .3);
  return {T, root, endYaw: 0, contacts: {Left: L, Right: R}, lift: (t, d) => Math.min(.16, .04 + .07 * d),
    body: t => { const s = slideBody(t), r = ramp(t); return {...s, y: s.y + (.7 - s.y) * r, lean: 14 - 6 * r, hipPitch: s.hipPitch * (1 - r) + 4 * r, roll: s.roll * (1 - r), kneeOut: s.kneeOut * (1 - r) + .1 * r}; },
    arms: (t, c) => { const r = ramp(t), s = slideArms(t), f = armPhase(t, c); const ra = {Left: swingArm('Left', f.L * .6, .25, .05), Right: swingArm('Right', f.R * .6, .25, .05)}; return {Left: mixArm(s.Left, ra.Left, r), Right: mixArm(s.Right, ra.Right, r)}; },
    meta: {speedStart: SLIDE_V, speedEnd: 3.4, travelHeadingChangeDegrees: 90}};
}
/** Cut to the left: plant the outside (right) foot wide, drive off it, new heading +70 degrees. */
function cutPlant() {
  const T = .6, A = 70, speed = C2([[0, 4.5], [.18, 4.2], [.3, 2.6], [.42, 3.2], [.6, 4.4]]), head = t => A * smooth((t - .2) / .2);
  const root = t => { let x = 0, z = 0; const n = Math.max(1, Math.round(Math.abs(t) * 600)), h = t / n; for (let i = 0; i < n; i++) { const tm = i * h + h / 2, s = speed(tm), a = head(tm) * D2R; x += s * Math.sin(a) * h; z += s * Math.cos(a) * h; } return [x, z]; };
  const L = [{td: -.3, to: -.17}, {td: -.05, to: .07, auto: [.1, .1]}, {td: .47, to: .57, auto: [.12, .16]}, {td: .72, to: 9, auto: [.1, .1]}];
  const R = [{td: -.22, to: -.1}, {td: .17, to: .39, auto: [-.34, .22]}, {td: .62, to: 9, auto: [-.1, .1]}];
  L[0].a = [.12, -1.1]; R[0].a = [-.12, -.55];
  const yaw = t => A * smooth((t - .14) / .26), lean = C2([[0, 12], [.16, 10], [.3, 20], [.5, 16], [.6, 14]]);
  const y = C2([[0, .77], [.1, .77], [.18, .7], [.3, .63], [.4, .66], [.5, .75], [.6, .77]]);
  return {T, root, endYaw: A, contacts: {Left: L, Right: R}, lift: (t, d) => Math.min(.26, .06 + .09 * d),
    body: t => ({y: y(t), lean: lean(t), hipPitch: lean(t) * .5, spinePitch: lean(t) * .25, chestPitch: lean(t) * .12, head: -lean(t) * .3, yaw: yaw(t), roll: -5 * Math.sin(Math.PI * clamp((t - .15) / .35, 0, 1)), twist: 12 * Math.sin(Math.PI * clamp((t - .15) / .4, 0, 1)), kneeOut: .12}),
    arms: (t, c) => { const f = armPhase(t, c), w = smooth((t - .15) / .1) * (1 - smooth((t - .4) / .15)); return {Left: swingArm('Left', f.L, .35 * w, 0), Right: swingArm('Right', f.R, .35 * w, 0)}; },
    meta: {entrySpeedMps: 4.5, exitHeadingDegrees: A, minSpeedMps: 2.6}};
}
/** Stride stop into a front pivot on the left foot: the body turns 90 degrees to the left (+X) around the planted left sole. */
function pivotStop() {
  const v0 = 3, Ts = .4, T = .8, D = v0 * Ts / 2, A = [.13, D + .025], t0 = .42, a0 = [.13, .025];
  const yaw = t => 90 * smooth((t - t0) / .32);
  const stop = stopPath(v0, Ts);
  const root = t => t <= Ts + 1e-9 ? stop(t) : [A[0] - (a0[0] * Math.cos(yaw(t) * D2R) + a0[1] * Math.sin(yaw(t) * D2R)), A[1] - (-a0[0] * Math.sin(yaw(t) * D2R) + a0[1] * Math.cos(yaw(t) * D2R))];
  const L = [{td: -.35, to: -.2, a: [.12, -.9]}, {td: -.08, to: .1, auto: [.08, .08]}, {td: .30, to: 9, a: A}];
  const R = [{td: -.25, to: -.1, a: [-.12, -.45]}, {td: .12, to: .24, auto: [-.12, .14]}, {td: .72, to: 9, fin: true}];
  const lean = C2([[0, 10], [.2, 12], [.4, 6], [.8, 0]]);
  const y = C2([[0, .775], [.1, .775], [.28, .68], [.4, .66], [.6, .7], [.8, .785]]);
  return {T, root, endYaw: 90, contacts: {Left: L, Right: R}, lift: (t, d) => Math.min(.14, .04 + .06 * d),
    body: t => ({y: y(t), lean: lean(t), hipPitch: lean(t) * .5, spinePitch: lean(t) * .25, chestPitch: lean(t) * .15, head: -lean(t) * .3, yaw: yaw(t), kneeOut: .1, twist: -10 * Math.sin(Math.PI * clamp((t - t0) / .4, 0, 1))}),
    arms: (t, c) => { const f = armPhase(t, c), st = 1 - smooth((t - .15) / .2), sp = smooth((t - .3) / .1) * (1 - smooth((t - .6) / .2)); return {Left: swingArm('Left', f.L * st, .4 * sp, 0), Right: swingArm('Right', f.R * st, .4 * sp, 0)}; },
    meta: {entrySpeedMps: v0, Ts, pivotFoot: 'Left', pivotDegrees: 90}};
}
/** Three first steps from a standing start: lean, push, accelerate to about 4 m/s. */
function startFromStand() {
  const T = .9, speed = t => 4.3 * smooth((t - .08) / .6) ;
  const root = t => { if (t <= .08) return [0, 0]; let z = 0; const n = Math.max(1, Math.round(t * 600)), h = t / n; for (let i = 0; i < n; i++) z += speed(i * h + h / 2) * h; return [0, z]; };
  const L = [{td: -.6, to: .2, a: [.13, .025]}, {td: .40, to: .53, auto: [.12, .12]}, {td: .70, to: .81, auto: [.12, .14]}];
  const R = [{td: -.6, to: .1, a: [-.13, -.025]}, {td: .22, to: .36, auto: [-.12, .1]}, {td: .56, to: .67, auto: [-.12, .14]}, {td: .84, to: 9, auto: [-.12, .14]}];
  const lean = C2([[0, 0], [.1, 14], [.4, 22], [.7, 15], [.9, 12]]);
  const y = C2([[0, .785], [.1, .74], [.3, .72], [.5, .75], [.9, .78]]);
  return {T, root, endYaw: 0, contacts: {Left: L, Right: R}, lift: (t, d) => Math.min(.22, .05 + .09 * d),
    body: t => ({y: y(t), lean: lean(t), hipPitch: lean(t) * .5, spinePitch: lean(t) * .25, chestPitch: lean(t) * .15, head: -lean(t) * .3, kneeOut: .06}),
    arms: (t, c) => { const f = armPhase(t, c), a = smooth((t - .08) / .3); return {Left: swingArm('Left', f.L * a, 0, 0), Right: swingArm('Right', f.R * a, 0, 0)}; },
    meta: {exitSpeedMps: 4.3, steps: 3}};
}
export {slideRecoverBack, cutPlant, pivotStop, startFromStand};

export const FAMILIES = {};
export async function build(specFn, id, opts = {}) {
  const spec = specFn();
  const res = synth(spec, idle);
  return {spec, ...res};
}
export {stopSprint, stopPath, cruise, C2, armPhase};

// ---------- diagnostics ----------
const ang = q => 2 * Math.acos(clamp(Math.abs(q[3]), 0, 1)) / D2R;
export function diagnostics(frames) {
  const out = {reachErr: 0, kneeMin: 999, kneeMax: -999, elbowMin: 999, elbowMax: -999, hipFlexMin: 999, hipFlexMax: -999, legGap: 9, handGap: 9};
  for (const fr of frames) {
    const p = fr.pose; out.reachErr = Math.max(out.reachErr, p.reachError);
    const w = fk(p);
    for (const s of ['Left', 'Right']) {
      const kq = p.rotations[s + 'Leg'], kn = 2 * Math.atan2(kq[0], kq[3]) / D2R; // about X
      out.kneeMin = Math.min(out.kneeMin, kn); out.kneeMax = Math.max(out.kneeMax, kn);
      const eq = p.rotations[s + 'ForeArm'], el = -2 * Math.atan2(eq[0], eq[3]) / D2R;
      out.elbowMin = Math.min(out.elbowMin, el); out.elbowMax = Math.max(out.elbowMax, el);
      const hipsQ = w.Hips.rotation, inv = qi(hipsQ);
      const th = rotate(inv, sub(w[s + 'Leg'].position, w[s + 'UpLeg'].position));
      const flex = Math.atan2(th[2], -th[1]) / D2R;
      out.hipFlexMin = Math.min(out.hipFlexMin, flex); out.hipFlexMax = Math.max(out.hipFlexMax, flex);
    }
    out.legGap = Math.min(out.legGap, segGap(w.LeftUpLeg.position, w.LeftLeg.position, w.RightUpLeg.position, w.RightLeg.position), segGap(w.LeftLeg.position, w.LeftFoot.position, w.RightLeg.position, w.RightFoot.position), segGap(w.LeftUpLeg.position, w.LeftLeg.position, w.RightLeg.position, w.RightFoot.position), segGap(w.LeftLeg.position, w.LeftFoot.position, w.RightUpLeg.position, w.RightLeg.position));
    for (const s of ['Left', 'Right']) {
      const h = w[s + 'Hand'].position; out.handGap = Math.min(out.handGap, ptSeg(h, w.Hips.position, w.Chest.position));
    }
  }
  return out;
}
function ptSeg(p, a, b) { const ab = sub(b, a), t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2), 0, 1); return Math.hypot(...sub(p, add(a, mul(ab, t)))); }
function segGap(a, b, c, d) { let m = 9; for (let i = 0; i <= 10; i++) { const p = add(a, mul(sub(b, a), i / 10)); m = Math.min(m, ptSeg(p, c, d)); } return m; }
