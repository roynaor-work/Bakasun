// SPDX-License-Identifier: CC0-1.0
// Original contact-driven synthesiser for the canonical 18-bone rig (metres, +Y up, +Z forward, +X left).
// A clip is described in the clip frame (the Root, fixed at the origin with identity rotation, is the player's
// position; travel is a separate path). Every foot has a list of ground contacts anchored in that frame; the
// stance foot is solved by two-bone IK to its anchor minus the path, so a planted foot is planted in the world.
import fs from 'node:fs/promises';
import {bones, fk, solve, curve, euler, rotate, add, sub, mul, mix, slerp, qm, qi, I, clamp, smooth} from './rig.mjs';
import {unpack, readAccessor} from './glb.mjs';

export const SOLE = [0, -.08, 0];
export const LEG = .78;
const D2R = Math.PI / 180;
export const idleAnchor = {Left: [.13, .025], Right: [-.13, -.025]};

let idleCache;
export async function loadIdle() {
  if (idleCache) return idleCache;
  const glb = unpack(await fs.readFile(new URL('../../soccer-clips-v13/runtime/reference/idle_relaxed.glb', import.meta.url)));
  const idle = {hips: [0, .785, 0], rotations: Object.fromEntries(bones.map(b => [b.name, [...I]]))};
  const anim = glb.document.animations[0];
  for (const c of anim.channels) {
    const s = anim.samplers[c.sampler], v = readAccessor(glb, s.output).values, name = glb.document.nodes[c.target.node].name;
    if (c.target.path === 'rotation') idle.rotations[name] = v.slice(0, 4);
    if (c.target.path === 'translation' && name === 'Hips') idle.hips = v.slice(0, 3);
  }
  idleCache = {idle, template: glb};
  return idleCache;
}
export const yawQ = deg => euler(0, deg, 0);
/** Rotate a whole pose rigidly about the Root's Y axis (used for turning clips). */
export function yawPose(p, deg) {
  const q = yawQ(deg);
  return {hips: rotate(q, p.hips), rotations: {...Object.fromEntries(Object.entries(p.rotations).map(([k, v]) => [k, [...v]])), Hips: qm(q, p.rotations.Hips)}};
}
export const blend = (a, b, u) => ({hips: mix(a.hips, b.hips, u), rotations: Object.fromEntries(bones.map(({name}) => [name, slerp(a.rotations[name], b.rotations[name], u)]))});
const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const rot2 = (v, deg) => { const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c]; }; // (x,z) rotated about +Y by deg
const easeSwing = u => u * u * (3 - 2 * u);

/** Footwork. spec.contacts[side] = [{td,to,a:[x,z] | auto:[ox,oz] | fin:true, pitch}] sorted, covering before 0 and after T. */
export function synth(spec, idle) {
  const N = Math.round(spec.T * 30) + 1, frames = [], notes = {reach: 0, ceiling: 0, clamped: 0, maxYShift: 0};
  const rootAt = t => spec.root(t);
  const bodyAt = t => spec.body(t);
  const yawAt = t => (bodyAt(t).yaw || 0);
  const pelvisXZ = t => { const r = rootAt(t), b = bodyAt(t); return [r[0] + (b.ox || 0), r[1] + (b.oz || 0)]; };
  const endRoot = rootAt(spec.T), endYaw = spec.endYaw || 0;
  // resolve anchors
  const contacts = {};
  for (const side of ['Left', 'Right']) {
    contacts[side] = spec.contacts[side].map(c => {
      let a = c.a;
      if (c.fin) { a = add2(endRoot, rot2(idleAnchor[side], endYaw)); }
      else if (c.auto) { const m = (c.td + Math.min(c.to, spec.T + 1)) / 2, tm = clamp(m, -1, spec.T + 1), p = pelvisXZ(tm); a = add2(p, rot2(c.auto, yawAt(tm) + (c.yawBias || 0))); }
      return {...c, a, to: c.fin ? Math.max(c.to, spec.T + 5) : c.to, yaw: c.yaw ?? null};
    });
  }
  function footAt(side, t) {
    const list = contacts[side];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (t >= c.td - 1e-9 && t <= c.to + 1e-9) return {stance: true, xz: c.a, y: 0, pitch: c.pitch ?? 0, yaw: c.yaw ?? yawAt(t) + (c.footYaw || 0), c};
      const n = list[i + 1];
      if (n && t > c.to + 1e-9 && t < n.td - 1e-9) {
        const u = (t - c.to) / (n.td - c.to), e = easeSwing(u), xz = lerp2(c.a, n.a, e);
        const dist = Math.hypot(n.a[0] - c.a[0], n.a[1] - c.a[1]);
        const H = (spec.lift ? spec.lift(t, dist, n.td - c.to, side) : Math.min(.28, .05 + .09 * dist)) ;
        const y = H * Math.sin(Math.PI * Math.pow(u, .85)) ;
        const pitch = 38 * Math.pow(1 - u, 3) - 14 * Math.pow(u, 3) + (c.swingPitch || 0) * Math.sin(Math.PI * u);
        return {stance: false, xz, y, pitch, yaw: yawAt(t) + ((1 - u) * (c.footYaw || 0) + u * (n.footYaw || 0)), u};
      }
    }
    const c = list[list.length - 1];
    return {stance: true, xz: c.a, y: 0, pitch: 0, yaw: yawAt(t), c};
  }
  const footQ = (pitch, yaw) => qm(euler(0, yaw, 0), euler(pitch, 0, 0));
  for (let i = 0; i < N; i++) {
    const t = i / 30, root = rootAt(t), b = bodyAt(t), yaw = b.yaw || 0;
    const pel = [root[0] + (b.ox || 0), root[1] + (b.oz || 0)];
    const feet = {Left: footAt('Left', t), Right: footAt('Right', t)};
    // height ceiling from the planted feet (and from swinging feet so they can reach their targets)
    let y = b.y;
    const hip = {};
    for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
      const dx = .1 * sg;
      hip[side] = [pel[0] + dx * Math.cos(yaw * D2R), pel[1] - dx * Math.sin(yaw * D2R)];
    }
    const ankle = {};
    for (const side of ['Left', 'Right']) {
      const f = feet[side], q = footQ(f.pitch, f.yaw), off = rotate(q, [0, .08, 0]);
      ankle[side] = [f.xz[0] + off[0], f.y + off[1], f.xz[1] + off[2]];
    }
    for (const side of ['Left', 'Right']) {
      const f = feet[side], h = Math.hypot(ankle[side][0] - hip[side][0], ankle[side][2] - hip[side][1]), room = (LEG * .992) ** 2 - h * h;
      if (f.stance) {
        if (room < 0) { notes.reach = Math.max(notes.reach, Math.sqrt(h * h) - LEG * .992); }
        else y = Math.min(y, ankle[side][1] + Math.sqrt(room));
      }
    }
    if (y < b.y - 1e-6) { notes.ceiling++; notes.maxYShift = Math.max(notes.maxYShift, b.y - y); }
    // swinging feet that cannot reach: bring the target towards the hip
    for (const side of ['Left', 'Right']) {
      const f = feet[side];
      const v = sub(ankle[side], [hip[side][0], y, hip[side][1]]), d = Math.hypot(...v);
      if (d > LEG * .992) { if (!f.stance) { const k = LEG * .985 / d; ankle[side] = add([hip[side][0], y, hip[side][1]], mul(v, k)); notes.clamped++; } }
    }
    // build the pose
    const p = {hips: [pel[0] - root[0], y, pel[1] - root[1]], rotations: Object.fromEntries(bones.map(bb => [bb.name, [...I]]))};
    const lean = b.lean ?? 0;
    p.rotations.Hips = qm(euler(0, yaw, 0), euler(b.hipPitch ?? lean * .45, 0, b.roll ?? 0));
    p.rotations.Spine = euler(b.spinePitch ?? lean * .3, (b.twist || 0) * .4, b.spineRoll ?? 0);
    p.rotations.Chest = euler(b.chestPitch ?? lean * .25, (b.twist || 0) * .6, b.chestRoll ?? 0);
    p.rotations.Head = euler(b.head ?? 0, b.headYaw ?? 0, 0);
    const dir = rotate(euler(0, yaw, 0), [0, 0, 1]);
    const errors = [], legSolve = {};
    for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
      const f = feet[side], target = [ankle[side][0] - root[0], ankle[side][1], ankle[side][2] - root[1]];
      const knee = b['knee' + side] ?? add(dir, [sg * (b.kneeOut ?? 0), 0, 0]);
      errors.push(solve(p, side + 'UpLeg', side + 'Leg', side + 'Foot', target, knee, footQ(f.pitch, f.yaw)).error);
      legSolve[side] = {target, pole: knee, q: footQ(f.pitch, f.yaw)};
    }
    // arms in the chest frame, relative to the shoulder
    const w = fk(p);
    const chestQ = w.Chest.rotation;
    const rel = {Left: 0, Right: 0};
    for (const side of ['Left', 'Right']) rel[side] = ((feet[side].xz[0] - pel[0]) * Math.sin(yaw * D2R) + (feet[side].xz[1] - pel[1]) * Math.cos(yaw * D2R));
    const arms = spec.arms(t, {rel, yaw, b, feet});
    for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
      const a = arms[side], shoulder = w[side + 'Arm'].position, target = add(shoulder, rotate(chestQ, a.hand));
      const elbowPole = rotate(chestQ, a.elbow ?? [sg * .45, -.55, -.7]);
      errors.push(solve(p, side + 'Arm', side + 'ForeArm', side + 'Hand', target, elbowPole, a.aim).error);
    }
    p.reachError = Math.max(...errors);
    frames.push({time: t, pose: p, legSolve, root: [root[0], root[1]], feet: {Left: {stance: feet.Left.stance, xz: feet.Left.xz, yaw: feet.Left.yaw, pitch: feet.Left.pitch}, Right: {stance: feet.Right.stance, xz: feet.Right.xz, yaw: feet.Right.yaw, pitch: feet.Right.pitch}}, yaw, pel});
  }
  return {frames, contacts, notes};
}
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];

/** Running/shuffling arms in the chest frame: f in [-1,1] = forward swing. */
export function swingArm(side, f, spread = 0, lift = 0) {
  const sg = side === 'Left' ? 1 : -1;
  const z = f >= 0 ? .27 * f : .24 * f, y = -.33 + .13 * Math.max(0, f) - .05 * Math.max(0, -f) + lift;
  return {hand: [sg * (.05 + .42 * spread), y, z + .08 * spread], elbow: [sg * (.35 + .5 * spread), -.6, -.75]};
}
export const smoothPass = (frames, names, passes = 1) => {
  for (let pass = 0; pass < passes; pass++) {
    const prev = frames.map(f => structuredClone(f.pose.rotations));
    for (let i = 1; i < frames.length - 1; i++) for (const n of names) frames[i].pose.rotations[n] = slerp(slerp(prev[i - 1][n], prev[i + 1][n], .5), prev[i][n], .5);
  }
};
export {bones, fk, solve, curve, euler, rotate, add, sub, mul, mix, slerp, qm, qi, I, clamp, smooth};
