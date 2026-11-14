/** v7 "תפוס את הפושע": aim assist for the bow-style net (the catch after the chase). Pure, no DOM, no Three.js.
 * Roy (13/11): "the ability to catch him and hit is very, very, very hard ... it has to be realistic and possible".
 * Four helpers, all measured in what the child sees: degrees of visual angle from the officer's eye.
 *  - lead:      where the thief will be when the net arrives (his sideways run and the flight time), shown as a marker
 *  - magnetism: at release, an aim inside the cone is pulled toward the ideal aim (full pull in the inner part, fading to the edge)
 *  - sticky:    while dragging inside the cone the sight moves slower and drifts toward the target
 *  - close time: the first time the sight locks on in a turn the thief slows down for 1 to 1.5 s (engine.closeTime)
 * Stages 1-3 forgive almost any reasonable aim, stage 10 asks for a careful one. `?catchAssist=0` switches all of it off. */

export const ASSIST7 = Object.freeze({
  // per stage 1..10
  cone: [21, 20.5, 20, 17.5, 17, 17.5, 16, 13, 12, 11.5],     // degrees: inside it the release is helped
  inner: .78,                                                 // share of the cone with the full pull (and the lock)
  pull: [1, 1, 1, .97, .96, .95, .94, .92, .9, .88],           // the pull at its strongest
  closeSeconds: [1.5, 1.45, 1.4, 1.3, 1.3, 1.25, 1.2, 1.15, 1.1, 1],
  closeRate: [.3, .3, .32, .35, .36, .38, .4, .42, .44, .45],  // the thief moves at this share of his speed in close time
  radiusScale: [1.35, 1.3, 1.25, 1.15, 1.12, 1.1, 1.08, 1.05, 1.03, 1], // the catch zone (v6: 1 everywhere)
  extraThrows: [0, 0, 0, 1, 1, 1, 1, 1, 2, 1],                 // more throws on the hard stages
  sticky: .55, stickyPull: 2.4,                                // finger speed inside the cone, drift toward the target per second
  eye: {x: .2, y: 1.55},                                       // catch-bow-view BOW.eyeX / eyeY
  chest: 1.0,
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DEG = 180 / Math.PI;
export const pick = (arr, stage) => Array.isArray(arr) ? arr[clamp(stage, 1, 10) - 1] ?? arr[arr.length - 1] : arr;

export const STRINGS = Object.freeze({
  'catch.assist.lead': 'לשם הוא רץ', 'catch.assist.lock': 'נעול', 'catch.assist.close': 'זמן קרוב',
});

/** The v7 levels for the throw engine: the v6 overrides plus a larger catch zone and the extra throws. */
export function levels7(balance, A = ASSIST7) {
  return balance.levels.map((l, i) => {
    const v6 = {...l, obstacles: [], movers: [], ...(l.v6 || {})}, st = i + 1;
    // pop: null = no ducking: since v6 the street cover is gone, so he crouched in the open and a well aimed net passed over him
    return {...v6, pop: null, radiusScale: (v6.radiusScale || 1) * pick(A.radiusScale, st), throws: (v6.throws || balance.throws) + pick(A.extraThrows, st), ...(l.v7throw || {})};
  });
}

/** The point (engine coordinates: x forward, y up, z sideways) where the arc of `aim` passes the distance `atX`. */
export function arcPointAt(engine, aim, atX, {wind = true, t0 = engine.clock + engine.balance.physics.throwSeconds} = {}) {
  const f = engine.trajectory(aim.angle, aim.power ?? 1, aim.tool || engine.aim.tool, {withWind: wind, t0, yaw: aim.yaw || 0, stopAtObstacle: false});
  const p = f.path, i = p.findIndex(q => q.x >= atX);
  if (i < 0) { const q = p[p.length - 1]; return {x: q.x, y: q.y, z: q.z || 0, t: q.t, short: true}; }
  if (i === 0) return {x: p[0].x, y: p[0].y, z: p[0].z || 0, t: p[0].t};
  const a = p[i - 1], b = p[i], u = (atX - a.x) / Math.max(1e-6, b.x - a.x);
  return {x: atX, y: a.y + (b.y - a.y) * u, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * u, t: a.t + (b.t - a.t) * u};
}

/** Where the thief's chest will be when a net released at `tRelease` gets to him (two fixed-point passes on the flight time). */
export function leadPoint(engine, {tRelease = engine.clock, aim = engine.aimNow(), A = ASSIST7} = {}) {
  const P = engine.balance.physics, t0 = tRelease + P.throwSeconds;
  let c = engine.criminalAt(t0), T = .9;
  for (let k = 0; k < 3; k++) { const at = arcPointAt(engine, aim, c.x, {wind: false, t0}); T = at.short ? T : at.t; c = engine.criminalAt(t0 + T); }
  return {x: c.x, y: A.chest + (c.y || 0), z: c.z || 0, t: t0 + T, exposed: c.exposed, now: engine.criminalAt(tRelease)};
}

/** Visual angle (degrees) between two points seen from the eye: total, sideways and up. */
export function visualAngle(p, q, A = ASSIST7) {
  const e = A.eye, ax = p.x - e.x, ay = p.y - e.y, az = p.z, bx = q.x - e.x, by = q.y - e.y, bz = q.z;
  const yaw = (Math.atan2(az, ax) - Math.atan2(bz, bx)) * DEG, pitch = (Math.atan2(ay, Math.hypot(ax, az)) - Math.atan2(by, Math.hypot(bx, bz))) * DEG;
  return {e: Math.hypot(yaw, pitch), yaw, pitch};
}

/** The aim (yaw, angle at full draw) whose net reaches `target` (wind included unless wind:false): yaw for the side and the
 * cross wind, angle by bisection for the height at the target's distance. */
export function idealAim(engine, target, {wind = true, tool = engine.aim.tool, t0 = engine.clock + engine.balance.physics.throwSeconds} = {}) {
  const P = engine.balance.physics;
  let yaw = Math.atan2(target.z, target.x - P.release.x) * DEG, angle = engine.aim.angle;
  const heightAt = (a, y) => arcPointAt(engine, {angle: a, power: 1, yaw: y, tool}, target.x, {wind: false, t0});
  for (let k = 0; k < 3; k++) {
    let lo = P.angle.min, hi = Math.min(P.angle.max, 55);
    if (heightAt(lo, yaw).y > target.y) angle = lo;
    else { for (let n = 0; n < 16; n++) { const mid = (lo + hi) / 2, at = heightAt(mid, yaw); if (at.short || at.y < target.y) lo = mid; else hi = mid; } angle = (lo + hi) / 2; }
    if (!wind) break;
    const withW = arcPointAt(engine, {angle, power: 1, yaw, tool}, target.x, {wind: true, t0});
    const dz = target.z - withW.z; if (Math.abs(dz) < .02) break;
    yaw += Math.atan2(dz, Math.max(1, target.x - P.release.x)) * DEG;
  }
  return {yaw: clamp(yaw, -(P.yawMax ?? 24), P.yawMax ?? 24), angle: clamp(angle, P.angle.min, P.angle.max), power: 1, tool};
}

/** How strongly an aim `e` degrees off the target is pulled at this stage: full in the inner cone, fading to 0 at its edge. */
export function pullFor(e, stage, A = ASSIST7) {
  const cone = pick(A.cone, stage), inner = cone * A.inner, top = pick(A.pull, stage);
  if (e <= inner) return top;
  if (e >= cone) return 0;
  const u = (e - inner) / Math.max(1e-6, cone - inner); return top * (1 - u * u * (3 - 2 * u)); // a smooth fade to the edge
}

/** What the HUD needs every frame: the lead marker, the sight's error, lock (inner cone) and the cone. */
export function assistInfo(engine, stage, {A = ASSIST7, now = engine.aimNow()} = {}) {
  const lead = leadPoint(engine, {aim: now, A});
  const sight = arcPointAt(engine, now, lead.x, {wind: (engine.aimHelp || 0) >= 1});
  const err = visualAngle(sight, lead, A), cone = pick(A.cone, stage);
  return {lead, sight, e: err.e, yaw: err.yaw, pitch: err.pitch, cone, inner: cone * A.inner, locked: err.e <= cone && lead.exposed, full: err.e <= cone * A.inner, inCone: err.e <= cone, pull: pullFor(err.e, stage, A)};
}

/** At release: pull the aim toward the ideal (if inside the cone) by writing it back to the engine, then the caller releases.
 * The engine adds its own hand sway to the aim (aimNow), so the written aim is the corrected one minus that sway. */
export function assistRelease(engine, stage, {A = ASSIST7} = {}) {
  if (engine.state.phase !== 'aim') return null;
  const now = engine.aimNow();
  // the flight time of the corrected arc decides where he will be: solve the lead with the ideal aim until it settles
  let lead = leadPoint(engine, {aim: now, A}), ideal = idealAim(engine, lead, {wind: true, tool: now.tool});
  for (let k = 0; k < 3; k++) { const l2 = leadPoint(engine, {aim: ideal, A}), moved = Math.hypot(l2.x - lead.x, l2.z - lead.z); lead = l2; ideal = idealAim(engine, lead, {wind: true, tool: now.tool}); if (moved < .03) break; }
  const sight = arcPointAt(engine, now, lead.x, {wind: true});
  const err = visualAngle(sight, lead, A), pull = lead.exposed ? pullFor(err.e, stage, A) : 0;
  if (pull <= 0) return {e: err.e, pull: 0};
  const yaw = now.yaw + (ideal.yaw - now.yaw) * pull, angle = now.angle + (ideal.angle - now.angle) * pull, w = engine.wobbleAt(engine.clock);
  engine.setAim({yaw: yaw - (w.yaw || 0), angle: angle - (w.angle || 0)});
  return {e: err.e, pull, ideal, yaw, angle};
}
