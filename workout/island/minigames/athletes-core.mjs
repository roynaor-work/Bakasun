/** Unified athletes, core (09/11/2026, session "unified-athletes-v1"). One description of how an athlete is built and judged,
 * shared by every sports game: soccer, basketball, tennis and the games that come later (ice hockey and so on).
 *
 * Why: Roy saw basketball players with distorted arms that run and then walk sideways, while the soccer players look right.
 * The three games load three different motion libraries but they all use the same canonical 18-bone rig
 * (Root, Hips, Spine, Chest, Neck, Head, both arms, both legs; rest pose below, metres, +Y up, +Z forward, +X the athlete's left),
 * so one set of rules, thresholds and metrics can describe all of them. Pure maths, no three.js, no DOM: node tests run it directly.
 *
 * Pieces:
 *  - CANON_BONES / canonicalPose / jointWorld: forward kinematics on the canonical rig.
 *  - normalise*Clip: soccer (v9/v10 json), basketball (tall pack) and tennis (core.json) clips into one shape.
 *  - gaitMetrics: arm spread, elbow, forward lean, stance-foot slide of a locomotion clip, measured the same way for every game.
 *  - ATHLETE_STANDARD: the one quality bar (feel score at least 88, the floor of the corrected catalog of motion-fix-v12).
 *  - the locomotion rules (ladder, heading, arm carry) live in athletes-rules.mjs. */
export const CANON_BONES = Object.freeze([
  {name: 'Root', parent: null, rest: [0, 0, 0]},
  {name: 'Hips', parent: 'Root', rest: [0, 0.86, 0]},
  {name: 'Spine', parent: 'Hips', rest: [0, 0.2, 0]},
  {name: 'Chest', parent: 'Spine', rest: [0, 0.18, 0]},
  {name: 'Neck', parent: 'Chest', rest: [0, 0.1, 0]},
  {name: 'Head', parent: 'Neck', rest: [0, 0.13, 0]},
  {name: 'LeftArm', parent: 'Chest', rest: [0.16, 0.06, 0]},
  {name: 'LeftForeArm', parent: 'LeftArm', rest: [0, -0.27, 0]},
  {name: 'LeftHand', parent: 'LeftForeArm', rest: [0, -0.24, 0]},
  {name: 'RightArm', parent: 'Chest', rest: [-0.16, 0.06, 0]},
  {name: 'RightForeArm', parent: 'RightArm', rest: [0, -0.27, 0]},
  {name: 'RightHand', parent: 'RightForeArm', rest: [0, -0.24, 0]},
  {name: 'LeftUpLeg', parent: 'Hips', rest: [0.1, 0, 0]},
  {name: 'LeftLeg', parent: 'LeftUpLeg', rest: [0, -0.41, 0]},
  {name: 'LeftFoot', parent: 'LeftLeg', rest: [0, -0.37, 0]},
  {name: 'RightUpLeg', parent: 'Hips', rest: [-0.1, 0, 0]},
  {name: 'RightLeg', parent: 'RightUpLeg', rest: [0, -0.41, 0]},
  {name: 'RightFoot', parent: 'RightLeg', rest: [0, -0.37, 0]},
]);
export const CANON_NAMES = Object.freeze(CANON_BONES.map(b => b.name));
const IDENT = [0, 0, 0, 1];
export const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
export const qrotate = (q, v) => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [p[0], p[1], p[2]]; };
export const qnorm = q => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
export function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > .9995) return qnorm(a.map((v, i) => v + (b[i] - v) * t));
  const h = Math.acos(Math.min(1, d)), s = Math.sin(h), x = Math.sin((1 - t) * h) / s, y = Math.sin(t * h) / s;
  return a.map((v, i) => v * x + b[i] * y);
}
export const qaxis = (axis, angle) => { const s = Math.sin(angle / 2), n = Math.hypot(...axis) || 1; return [axis[0] / n * s, axis[1] / n * s, axis[2] / n * s, Math.cos(angle / 2)]; };

/** World joints of a canonical pose {rot:{bone:q}, hips:[x,y,z] (offset from the rest hips)}. Y up, Z forward, X = athlete's left. */
export function jointWorld(pose, bones = CANON_BONES) {
  const out = {};
  for (const b of bones) {
    let local = b.rest; if (b.name === 'Hips' && pose.hips) local = [local[0] + pose.hips[0], local[1] + pose.hips[1], local[2] + pose.hips[2]];
    const q = pose.rot[b.name] || IDENT;
    if (!b.parent) { out[b.name] = {p: local, q}; continue; }
    const parent = out[b.parent], r = qrotate(parent.q, local);
    out[b.name] = {p: [parent.p[0] + r[0], parent.p[1] + r[1], parent.p[2] + r[2]], q: qmul(parent.q, q)};
  }
  return out;
}

// ---- normalisation of the three libraries into one clip shape ---------------------------------------------------
// Canonical clip: {name, lib, dur, fps, loop, speed (m/s the clip was authored at, 0 if unknown), frames:[{t, rot:{bone:[x,y,z,w]}, hips:[x,y,z]}], events, supports}
function decode64(text, Type) { const bin = typeof atob === 'function' ? atob(text) : Buffer.from(text, 'base64').toString('binary'), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Type(bytes.buffer); }
/** Soccer packs (assets/soccer-v9|v10/clips.json): keyframes with times 0..1 and rotations by bone. */
export function normaliseSoccerClip(name, state, lib = 'soccer') {
  const frames = state.keyframes.map(k => ({t: k.time * state.durationSeconds, rot: k.rotations, hips: k.hipsOffsetMeters || [0, 0, 0]}));
  return {name, lib, dur: state.durationSeconds, loop: !!state.loop, speed: state.speedMps || 0, frames, events: state.events || [], supports: state.supports || []};
}
/** Basketball tall pack (assets/hoops-tall/motion.json): int16 quaternions and hips, 30 Hz. */
export function normaliseTallClip(name, clip, fps = 30) {
  const quat = typeof clip.quat === 'string' ? Float32Array.from(decode64(clip.quat, Int16Array), v => v / 32767) : clip.quat;
  const hips = typeof clip.hips === 'string' ? Float32Array.from(decode64(clip.hips, Int16Array), v => v / 10000) : clip.hips, frames = [];
  for (let f = 0; f < clip.frames; f++) {
    const rot = {}; CANON_NAMES.forEach((b, i) => { const o = (f * CANON_NAMES.length + i) * 4; rot[b] = qnorm([quat[o], quat[o + 1], quat[o + 2], quat[o + 3]]); });
    frames.push({t: f / fps, rot, hips: [hips[f * 3], hips[f * 3 + 1], hips[f * 3 + 2]]});
  }
  return {name, lib: 'hoops', dur: clip.duration, loop: !!clip.loop, speed: clip.refSpeed || 0, frames, events: clip.events || {}, supports: [], ball: clip.ball || null};
}
/** Writes the rotations of a canonical clip back into a decoded tall clip (Float32Array, frames x 18 bones x 4). */
export function writeTallRotations(clip, canonical, bones) {
  for (let f = 0; f < canonical.frames.length; f++) for (const b of bones) {
    const i = CANON_NAMES.indexOf(b), o = (f * CANON_NAMES.length + i) * 4, q = canonical.frames[f].rot[b];
    clip.quat[o] = q[0]; clip.quat[o + 1] = q[1]; clip.quat[o + 2] = q[2]; clip.quat[o + 3] = q[3];
  }
}
/** Tennis core.json: frames spaced evenly over the duration. */
export function normaliseTennisClip(name, clip) {
  const n = clip.frames.length - 1;
  return {name, lib: 'tennis', dur: clip.dur, loop: !!clip.loop, speed: 0, frames: clip.frames.map((f, i) => ({t: i / n * clip.dur, rot: f.rot, hips: f.hips})), events: clip.events || [], supports: []};
}
/** Pose of a canonical clip at `seconds` (loops wrap, one-shots hold). */
export function sampleCanonical(clip, seconds) {
  const fr = clip.frames, d = clip.dur, t = clip.loop ? ((seconds % d) + d) % d : Math.max(0, Math.min(d, seconds));
  let i = 0; while (i < fr.length - 2 && fr[i + 1].t <= t) i++;
  const a = fr[i], b = fr[Math.min(fr.length - 1, i + 1)], u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0, rot = {};
  for (const name of CANON_NAMES) rot[name] = qslerp(a.rot[name] || IDENT, b.rot[name] || IDENT, u);
  return {rot, hips: a.hips.map((v, k) => v + (b.hips[k] - v) * u)};
}

// ---- the metrics ---------------------------------------------------------------------------------------------------
const deg = r => r * 180 / Math.PI;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Measurements of one pose in the body frame (the hips' yaw removed, so a turning run is not read as a sideways arm). */
export function poseMeasures(pose) {
  const w = jointWorld(pose), hipsQ = w.Hips.q;
  // body frame: the hips' forward (+Z rotated), flattened to the floor
  const f = qrotate(hipsQ, [0, 0, 1]), yaw = Math.atan2(f[0], f[2]), c = Math.cos(-yaw), s = Math.sin(-yaw);
  const body = p => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  const rel = (a, b) => body(sub(w[a].p, w[b].p));
  const out = {};
  for (const side of ['Left', 'Right']) {
    const sgn = side === 'Left' ? 1 : -1;
    const upper = rel(side + 'ForeArm', side + 'Arm'), fore = rel(side + 'Hand', side + 'ForeArm');
    // abduction: angle of the upper arm away from straight down, in the frontal plane (outward positive)
    out[side + 'Abd'] = deg(Math.atan2(upper[0] * sgn, -upper[1]));
    // elbow interior angle between the upper arm and the forearm
    out[side + 'Elbow'] = deg(Math.acos(Math.max(-1, Math.min(1, -dot(upper, fore) / (len(upper) * len(fore) || 1)))));
    // swing: forward component of the upper arm in the sagittal plane
    out[side + 'Swing'] = deg(Math.atan2(upper[2], -upper[1]));
    const shoulder = rel(side + 'Arm', 'Hips'), hand = rel(side + 'Hand', 'Hips');
    out[side + 'HandOut'] = (hand[0] - shoulder[0]) * sgn; // how far the hand is outside the shoulder line (m)
  }
  const chest = rel('Neck', 'Hips'); out.Lean = deg(Math.atan2(chest[2], chest[1])); // forward positive
  const head = rel('Head', 'Neck'); out.HeadTilt = deg(Math.atan2(head[2], head[1]));
  return out;
}
/** Stance-foot slide of a looping gait: for the frames in which a foot is the low one, the foot should travel backwards at the body speed.
 * `speed` is fitted (least squares) so that clips of unknown authoring speed are judged on the same footing. Returns {speed, slide (m/s rms), slideRatio}. */
export function footSlide(clip, steps = 60) {
  const dt = clip.dur / steps, series = {Left: [], Right: []};
  for (let i = 0; i <= steps; i++) {
    const w = jointWorld(sampleCanonical(clip, i * dt));
    for (const side of ['Left', 'Right']) series[side].push({y: w[side + 'Foot'].p[1], z: w[side + 'Foot'].p[2], x: w[side + 'Foot'].p[0]});
  }
  const minY = Math.min(...series.Left.map(p => p.y), ...series.Right.map(p => p.y)), samples = [];
  for (const side of ['Left', 'Right']) {
    const s = series[side];
    for (let i = 0; i < steps; i++) {
      const low = s[i].y < minY + .025 && s[i + 1].y < minY + .025; // planted: the foot is on the floor at both ends of the step
      if (low) samples.push({vz: (s[i + 1].z - s[i].z) / dt, vx: (s[i + 1].x - s[i].x) / dt, vy: (s[i + 1].y - s[i].y) / dt});
    }
  }
  if (!samples.length) return {speed: 0, slide: 0, slideRatio: 0, planted: 0};
  // the planted foot moves backwards at the body speed; the fit is the mean, the slide is the spread around it
  const mean = samples.reduce((a, s) => a + s.vz, 0) / samples.length, speed = Math.max(0, -mean);
  const rms = Math.sqrt(samples.reduce((a, s) => a + (s.vz - mean) ** 2 + s.vx * s.vx + s.vy * s.vy, 0) / samples.length);
  return {speed, slide: rms, slideRatio: rms / Math.max(.8, speed), planted: samples.length / (2 * steps)};
}
/** Gait measures of a looping clip: means and extremes over one cycle. */
export function gaitMetrics(clip, steps = 40, {skip = null} = {}) {
  const rows = []; for (let i = 0; i < steps; i++) rows.push(poseMeasures(sampleCanonical(clip, i / steps * clip.dur)));
  const avg = k => rows.reduce((a, r) => a + r[k], 0) / rows.length, max = k => Math.max(...rows.map(r => r[k])), min = k => Math.min(...rows.map(r => r[k]));
  const sides = ['Left', 'Right'].filter(s => s !== skip), abd = rows.map(r => sides.reduce((a, s) => a + r[s + 'Abd'], 0) / sides.length), foot = footSlide(clip);
  return {
    armAbdMean: abd.reduce((a, v) => a + v, 0) / abd.length, armAbdMax: Math.max(...rows.map(r => Math.max(...sides.map(s => r[s + 'Abd'])))),
    handOutMax: Math.max(max('LeftHandOut'), max('RightHandOut')),
    elbowMean: (avg('LeftElbow') + avg('RightElbow')) / 2, elbowMin: Math.min(min('LeftElbow'), min('RightElbow')),
    swingRange: Math.max(max('LeftSwing'), max('RightSwing')) - Math.min(min('LeftSwing'), min('RightSwing')),
    lean: avg('Lean'), leanMax: max('Lean'), slide: foot.slide, slideRatio: foot.slideRatio, refSpeed: foot.speed, planted: foot.planted,
  };
}
/** The one standard. Numbers are what the soccer reference gaits (v9 walk, jog, run, sprint) measure with gaitMetrics, plus a margin
 * (see verification report). Judged on the cycle means of a looping clip, in the body frame (the hips' yaw removed).
 *  armAbdMax    the upper arm never leaves the body by more than this many degrees (reference gaits: 15 to 16)
 *  swingMin     range of the forward-back arm swing in degrees (reference: 65 to 95; stiff arms read as a robot)
 *  elbowMin/Max interior elbow angle, mean (reference: 51 to 62; a straight arm is 180)
 *  leanMin      forward lean of the trunk in degrees (reference: 2, 5, 8, 12 for walk, jog, run, sprint) */
export const ATHLETE_STANDARD = Object.freeze({
  feelScoreMin: 88, // corrected catalog of motion-fix-v12: every allowed library averages 95 to 97, none under 88 in a game clip
  gait: Object.freeze({
    walk:   {armAbdMax: 24, swingMin: 40, elbowMin: 40, elbowMax: 100, leanMin: 0},
    jog:    {armAbdMax: 24, swingMin: 55, elbowMin: 40, elbowMax: 100, leanMin: 3},
    run:    {armAbdMax: 24, swingMin: 65, elbowMin: 40, elbowMax: 100, leanMin: 6},
    sprint: {armAbdMax: 24, swingMin: 70, elbowMin: 40, elbowMax: 100, leanMin: 9},
  }),
  stand: Object.freeze({armAbdMax: 30}), // idle and ready clips (soccer idles measure 26 before its own stand layer)
});
/** Failed checks of a gait clip's metrics (empty list = passes). `kind` is walk, jog, run or sprint. */
export function checkGait(m, kind, std = ATHLETE_STANDARD) {
  const s = std.gait[kind], bad = [];
  if (!s) return bad;
  if (m.armAbdMax > s.armAbdMax) bad.push(`arms ${m.armAbdMax.toFixed(0)}° out (max ${s.armAbdMax}°)`);
  if (m.swingRange < s.swingMin) bad.push(`arm swing ${m.swingRange.toFixed(0)}° (min ${s.swingMin}°)`);
  if (m.elbowMean < s.elbowMin || m.elbowMean > s.elbowMax) bad.push(`elbows ${m.elbowMean.toFixed(0)}° (allowed ${s.elbowMin} to ${s.elbowMax}°)`);
  if (m.lean < s.leanMin) bad.push(`lean ${m.lean.toFixed(1)}° (min ${s.leanMin}°)`);
  return bad;
}
/** Failed checks of a standing clip. */
export function checkStand(m, std = ATHLETE_STANDARD) {
  return m.armAbdMax > std.stand.armAbdMax ? [`arms ${m.armAbdMax.toFixed(0)}° out (max ${std.stand.armAbdMax}°)`] : [];
}
