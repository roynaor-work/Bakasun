// Original racing-tracks-v2 analysis. CC0-1.0; see LICENSES.md.
import { createTrack, getRacingStage, racingAngle, RACING_TRACK_SCALE } from '../../minigames/racing-tracks.mjs';

export const MODEL = Object.freeze({ fixedStep: 1 / 60, engineTau: 6.2, shiftCut: .16,
  gearBounds: Object.freeze([0, .15, .31, .47, .62, .76, .89]), brake: 27, coast: 5,
  lateralSoftCap: 44, minimumCurvature: .003 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (s, length) => ((s % length) + length) % length;

/** Raw definitions use pre-scale metres. Production scales X/Z, never Y or width. */
export function buildScaledTrack(definition, { scale = RACING_TRACK_SCALE, tier = 0, reverse = false } = {}) {
  const points = definition.points.map(([x, y, z]) => [x * scale, y, z * scale]);
  if (reverse) points.splice(1, points.length - 1, ...points.slice(1).reverse());
  return createTrack({ ...definition, points, width: definition.width * (1 - tier * .025) });
}

export function steeringRate(speed) {
  return 1.72 * (.2 + .8 * Math.min(speed / 12, 1)) / (1 + Math.max(0, speed - 25) * .016);
}

/** Exact full-lock yaw ceiling of the default player's soft lateral cap. */
export function physicalCornerSpeed(curvature, topSpeed) {
  let low = 0, high = topSpeed;
  for (let i = 0; i < 30; i++) {
    const speed = (low + high) / 2;
    const yaw = speed > 10 ? MODEL.lateralSoftCap / speed * Math.tanh(steeringRate(speed) * speed / MODEL.lateralSoftCap) : steeringRate(speed);
    if (speed * curvature <= yaw) low = speed; else high = speed;
  }
  return low;
}

export function engineAcceleration(speed, topSpeed) {
  const ratio = clamp(speed / topSpeed, 0, .999);
  let gear = 0;
  while (gear < 6 && ratio >= MODEL.gearBounds[gear + 1]) gear++;
  const low = MODEL.gearBounds[gear], high = gear < 6 ? MODEL.gearBounds[gear + 1] : 1;
  const fraction = clamp((ratio - low) / (high - low), 0, 1);
  // Spatial envelope: the actual headless engine also applies its 0.16 s shift cut.
  return Math.max(0, (topSpeed - speed) / MODEL.engineTau * (1.4 - .75 * fraction));
}

/** Fastest periodic centre-line envelope under the production aiCorner target.
 * It is an AI-derived design target, not the player's absolute physical optimum.
 * Brake/coast and geared thrust match racing-physics; 0.16 s shifts are measured
 * in simulate.mjs rather than hidden inside this spatial envelope.
 */
export function buildSpeedProfile(definitionOrTrack, { tier = 0, scale = RACING_TRACK_SCALE, step = 2,
  reverse = tier === 3, safety = 1, lateralAcceleration } = {}) {
  const track = definitionOrTrack.sample ? definitionOrTrack : buildScaledTrack(definitionOrTrack, { tier, scale, reverse });
  const stage = getRacingStage(tier * 6 + 1), topSpeed = stage.playerSpeed, aiCorner = stage.aiCorner;
  const count = Math.ceil(track.length / step), ds = track.length / count;
  const rows = Array.from({ length: count }, (_, i) => {
    const s = i * ds, p = track.sample(s);
    const aiCurvature = Math.abs(racingAngle(track.sample(s + 22).heading - track.sample(s + 4).heading)) / 18;
    const localCurvature = Math.abs(racingAngle(track.sample(s + 2).heading - track.sample(s - 2).heading)) / 4;
    const curvature = Math.max(aiCurvature, localCurvature);
    const physicalCornerCap = physicalCornerSpeed(curvature, topSpeed);
    const targetLateral = lateralAcceleration === 'ai' || lateralAcceleration == null ? aiCorner : lateralAcceleration;
    const cornerCap = Math.min(topSpeed, physicalCornerCap, Math.sqrt(targetLateral / Math.max(MODEL.minimumCurvature, curvature))) * safety;
    return { s, x: p.x, y: p.y, z: p.z, heading: p.heading, curvature, aiCurvature, localCurvature, physicalCornerCap, cornerCap, speed: cornerCap };
  });
  // Periodic forward/backward passes avoid a favourable artificial start speed.
  for (let pass = 0; pass < 12; pass++) {
    let change = 0;
    for (let k = count - 1; k >= 0; k--) {
      const next = rows[(k + 1) % count];
      const speed = Math.min(rows[k].speed, Math.sqrt(next.speed ** 2 + 2 * (MODEL.brake + MODEL.coast) * ds));
      change = Math.max(change, rows[k].speed - speed); rows[k].speed = speed;
    }
    for (let k = 0; k < count; k++) {
      const previous = rows[(k + count - 1) % count];
      const speed = Math.min(rows[k].speed, Math.sqrt(previous.speed ** 2 + 2 * engineAcceleration(previous.speed, topSpeed) * ds));
      change = Math.max(change, rows[k].speed - speed); rows[k].speed = speed;
    }
    if (change < 1e-7) break;
  }
  let under85 = 0, over95 = 0, seconds = 0, brakingDistance = 0;
  for (let k = 0; k < count; k++) {
    const row = rows[k], next = rows[(k + 1) % count];
    row.braking = next.speed < row.speed - .01;
    row.accelerating = next.speed > row.speed + .01;
    if (row.braking) brakingDistance += ds;
    if (row.speed < .85 * topSpeed) under85 += ds;
    if (row.speed > .95 * topSpeed) over95 += ds;
    seconds += 2 * ds / (row.speed + next.speed);
  }
  return { length: track.length, topSpeed, aiCorner, lateralAcceleration: lateralAcceleration === 'ai' || lateralAcceleration == null ? aiCorner : lateralAcceleration, ds, samples: rows,
    under85Fraction: under85 / track.length, over95Fraction: over95 / track.length,
    brakingFraction: brakingDistance / track.length, minSpeed: Math.min(...rows.map(r => r.speed)),
    maxSpeed: Math.max(...rows.map(r => r.speed)), idealLapSeconds: seconds };
}

export function profileSpeedAt(profile, s, key = 'speed') {
  const index = wrap(s, profile.length) / profile.ds, low = Math.floor(index), t = index - low;
  const a = profile.samples[low % profile.samples.length], b = profile.samples[(low + 1) % profile.samples.length];
  return a[key] + (b[key] - a[key]) * t;
}
