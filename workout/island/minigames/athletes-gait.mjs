/** Unified athletes, gait layer (09/11/2026). The rules that make every sport's players move like the soccer reference:
 *  1. arms: walking and running arms come from one donor (the soccer v9/v10 gaits), phase-aligned to the host's own legs, so the
 *     legs and the foot plants stay exactly as authored and only the arms and the trunk change (arms next to the body, bent elbows,
 *     a real swing, a forward lean that grows with speed). Clips that carry a ball keep the ball arm.
 *  2. standing and turning clips (idle, brake, cuts, dribble walk): the same cap on how far the arm may leave the body.
 *  3. heading: the visible body turns toward where it travels while it runs, never runs or walks sideways, never backwards.
 * Data in, data out; no three.js. The donor is assets/athletes-v1/gait-donor.json (built by tools/athletes/build-donor.mjs). */
import {CANON_NAMES, jointWorld, sampleCanonical, poseMeasures, gaitMetrics, qaxis, qmul, qslerp, normaliseTallClip, writeTallRotations, ATHLETE_STANDARD} from './athletes-core.mjs';

export const GAIT_KINDS = Object.freeze(['walk', 'jog', 'run', 'sprint']);
export const ARM_BONES = Object.freeze({Left: ['LeftArm', 'LeftForeArm', 'LeftHand'], Right: ['RightArm', 'RightForeArm', 'RightHand']});
export const TRUNK_BONES = Object.freeze(['Spine', 'Chest']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** ?athletes=0 switches the whole unified layer off (before/after captures); config.athletes.enabled=false does the same. */
export function athletesEnabled(config, search = globalThis.location?.search || '') {
  const q = (typeof search === 'string' ? new URLSearchParams(search) : search)?.get?.('athletes');
  if (q === '0') return false;
  if (q === '1') return true;
  return config?.athletes?.enabled !== false;
}

// ---- donor ---------------------------------------------------------------------------------------------------------
/** Donor gaits from canonical soccer clips: arms and trunk rotations, the phase reference (left foot z) and the measured lean. */
export function buildDonor(clips, {samples = 24} = {}) {
  const gaits = {};
  for (const [kind, clip] of Object.entries(clips)) {
    const frames = clip.frames.map(f => ({t: +f.t.toFixed(4), rot: Object.fromEntries([...TRUNK_BONES, ...ARM_BONES.Left, ...ARM_BONES.Right].map(b => [b, f.rot[b].map(v => +v.toFixed(5))]))}));
    const foot = []; for (let i = 0; i < samples; i++) foot.push(+jointWorld(sampleCanonical(clip, i / samples * clip.dur)).LeftFoot.p[2].toFixed(4));
    const m = gaitMetrics(clip, 40);
    gaits[kind] = {dur: clip.dur, speed: clip.speed, source: clip.lib + '/' + clip.name, frames, footZ: foot, lean: +m.lean.toFixed(2), swing: +m.swingRange.toFixed(1), armAbdMax: +m.armAbdMax.toFixed(1)};
  }
  return {schemaVersion: 1, rig: CANON_NAMES, gaits};
}
export function checkDonor(donor) {
  if (!donor || donor.schemaVersion !== 1 || !donor.gaits) throw Error('Gait donor: unexpected file');
  if (donor.rig?.join() !== CANON_NAMES.join()) throw Error('Gait donor: another rig');
  for (const k of GAIT_KINDS) if (!donor.gaits[k]?.frames?.length) throw Error('Gait donor: missing ' + k);
  return donor;
}
const donorPose = (g, u) => { // u 0..1 over one cycle, closed loop
  const fr = g.frames, t = ((u % 1) + 1) % 1 * g.dur;
  let i = 0; while (i < fr.length - 2 && fr[i + 1].t <= t) i++;
  const a = fr[i], b = fr[i + 1], k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
  return Object.fromEntries(Object.keys(a.rot).map(n => [n, qslerp(a.rot[n], b.rot[n], k)]));
};
/** Phase offset (0..1) that lines the donor's left-foot cycle up with the host's, by correlation of the foot's forward position. */
export function alignPhase(host, donor, samples = 24) {
  const h = []; for (let i = 0; i < samples; i++) h.push(jointWorld(sampleCanonical(host, i / samples * host.dur)).LeftFoot.p[2]);
  const d = donor.footZ, n = d.length, mean = a => a.reduce((x, y) => x + y, 0) / a.length, mh = mean(h), md = mean(d);
  let best = 0, bestScore = -Infinity;
  for (let shift = 0; shift < n; shift++) {
    let score = 0; for (let i = 0; i < samples; i++) score += (h[i] - mh) * (d[(Math.round(i * n / samples) + shift) % n] - md);
    if (score > bestScore) { bestScore = score; best = shift; }
  }
  return best / n;
}

// ---- edits on a canonical clip (in place) ---------------------------------------------------------------------------
/** Replaces the arms (sides given) and the trunk (optional) of `host` with the donor gait's, phase-aligned. */
export function applyDonor(host, gait, {sides = ['Left', 'Right'], trunk = true} = {}) {
  const phase = alignPhase(host, gait), bones = [...(trunk ? TRUNK_BONES : []), ...sides.flatMap(s => ARM_BONES[s])];
  host.frames.forEach((f, i) => { const rot = donorPose(gait, i / (host.frames.length - 1 || 1) + phase); for (const b of bones) f.rot[b] = rot[b]; });
  return host;
}
/** Adds forward pitch to the spine until the clip's mean lean equals `target` degrees (never reduces a lean that is already there). */
export function setLean(host, target) {
  // Pitching the spine moves only the part of the trunk above it, so the lean follows in a fraction of the angle: converge in a few passes.
  let lean = gaitMetrics(host, 24).lean;
  for (let pass = 0; pass < 6 && target - lean > .05; pass++) {
    const q = qaxis([1, 0, 0], (target - lean) * 1.8 * Math.PI / 180);
    for (const f of host.frames) f.rot.Spine = qmul(q, f.rot.Spine);
    lean = gaitMetrics(host, 24).lean;
  }
  return lean;
}
/** Takes the arm back toward the body wherever its abduction exceeds `cap` degrees (every frame, shoulder rotation in the chest frame). */
export function capAbduction(host, cap, sides = ['Left', 'Right']) {
  let touched = 0;
  for (const f of host.frames) {
    const pose = {rot: f.rot, hips: f.hips}, m = poseMeasures(pose);
    for (const side of sides) {
      const over = m[side + 'Abd'] - cap; if (over <= 0) continue;
      const angle = (side === 'Left' ? -1 : 1) * over * Math.PI / 180, bone = side + 'Arm';
      f.rot[bone] = qmul(qaxis([0, 0, 1], angle), f.rot[bone]); touched++;
    }
  }
  return touched;
}
/** The hand that holds the ball in a clip with a ball track: the one closer to the ball on average; 'Right' without a track. */
export function ballArm(host) {
  const b = host.ball; if (!b || !host.frames.length) return 'Right';
  let dl = 0, dr = 0;
  host.frames.forEach((f, i) => {
    const j = Math.min(b.length / 3 - 1, Math.round(i / (host.frames.length - 1 || 1) * (b.length / 3 - 1))), w = jointWorld({rot: f.rot, hips: f.hips});
    for (const [side, acc] of [['Left', 0], ['Right', 1]]) { const h = w[side + 'Hand'].p, d = Math.hypot(h[0] - b[j * 3], h[1] - b[j * 3 + 1], h[2] - b[j * 3 + 2]); if (acc) dr += d; else dl += d; }
  });
  return dl < dr ? 'Left' : 'Right';
}

// ---- the plan for the basketball tall pack -----------------------------------------------------------------------------
const GAIT_NAME = /^(walk|jog|run|sprint)(_ball)?$/;
const CAP_RUN = 22, CAP_STAND = 14;
/** What the unified layer does to one tall clip, by name. null = untouched (shots, passes, blocks, defence, celebrations keep their authored arms). */
export function tallPlanFor(id) {
  const g = GAIT_NAME.exec(id);
  if (g) return {kind: 'gait', gait: g[1], ball: !!g[2]};
  if (/^idle_/.test(id)) return {kind: 'cap', cap: CAP_STAND, ball: /_ball$/.test(id)};
  if (/^(brake|brake_ball|basket_cut_(left|right)|cut_\d+_(left|right)(_ball)?|dribble_walk_(left|right))$/.test(id)) return {kind: 'cap', cap: CAP_RUN, ball: /ball|dribble/.test(id)};
  return null;
}
/** Applies the unified gait rules to every clip of a decoded tall pack (typed arrays, in place). Returns a summary. */
export function unifyTallPack(pack, donor, {fps = pack.fps || 30} = {}) {
  checkDonor(donor);
  const report = {gait: [], cap: [], skipped: 0};
  for (const [id, clip] of Object.entries(pack.clips)) {
    const plan = tallPlanFor(id); if (!plan) { report.skipped++; continue; }
    const host = normaliseTallClip(id, clip, fps), keep = plan.ball ? ballArm(host) : null, free = ['Left', 'Right'].filter(s => s !== keep);
    if (plan.kind === 'gait') {
      const gait = donor.gaits[plan.gait];
      applyDonor(host, gait, {sides: free, trunk: !plan.ball});
      setLean(host, gait.lean);
      report.gait.push(id);
    } else { capAbduction(host, plan.cap, free); report.cap.push(id); }
    writeTallRotations(clip, host, [...TRUNK_BONES, ...free.flatMap(s => ARM_BONES[s])]);
  }
  return report;
}

// ---- heading ----------------------------------------------------------------------------------------------------------
const wrap = a => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
export const HEADING = Object.freeze({minSpeed: 1.6, engage: 40 * Math.PI / 180, release: 16 * Math.PI / 180, rate: 12, faceRate: 16});
export const createHeading = (yaw = 0) => ({yaw, following: false});
/** The visible body yaw. The simulation's face (where the player looks and shoots) is untouched; this is only what the mesh shows.
 *  - fast and travelling clearly across or against his face, not defending, not acting: the body turns toward the travel direction
 *    (a runner runs where he is going), with hysteresis so it does not flicker;
 *  - otherwise the body takes the simulation's face. `p` = {face, vx, vz, act, stumble}, `ctx` = {defending, hasBall}. Returns the yaw. */
export function stepHeading(state, p, ctx, dt, h = HEADING) {
  const speed = Math.hypot(p.vx || 0, p.vz || 0), face = p.face || 0, travel = Math.atan2(p.vx || 0, p.vz || 0);
  const acting = !!p.act && p.act !== 'cross' && p.act !== 'spin' || !!p.stumble;
  const off = Math.abs(wrap(travel - face)), sliding = ctx.defending && !ctx.hasBall && speed < 4.2;
  if (speed < h.minSpeed || acting || sliding) state.following = false;
  else if (!state.following && off > h.engage) state.following = true;
  else if (state.following && off < h.release) state.following = false;
  const want = state.following ? travel : face, rate = state.following ? h.rate : h.faceRate;
  state.yaw += clamp(wrap(want - state.yaw), -rate * dt, rate * dt);
  return state.yaw;
}
/** Angle (degrees) between the body's visible front and the travel direction; the "walks sideways" measure. 0 when he is standing. */
export function sidewaysDeg(yaw, vx, vz, minSpeed = HEADING.minSpeed) {
  return Math.hypot(vx, vz) < minSpeed ? 0 : Math.abs(wrap(Math.atan2(vx, vz) - yaw)) * 180 / Math.PI;
}
export {ATHLETE_STANDARD};
