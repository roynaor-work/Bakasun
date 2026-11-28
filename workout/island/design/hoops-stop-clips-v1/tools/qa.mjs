// SPDX-License-Identifier: CC0-1.0
// Measurements on baked frames: sole planting in world space (root path + clip space), at 240 Hz with the GLB's
// native LINEAR interpolation (translation lerp, rotation slerp via runtime/player.mjs).
import {point, fk, sub, add, qi, rotate} from './rig.mjs';
import {sampleMotion} from '../runtime/player.mjs';
import {SOLE} from './synth.mjs';

export function rootAt(clip, t) {
  const s = clip.path.samples, f = clamp01(t * 30, 0, s.length - 1), i = Math.min(s.length - 2, Math.floor(f)), u = f - i;
  return [s[i][0] + (s[i + 1][0] - s[i][0]) * u, s[i][1] + (s[i + 1][1] - s[i][1]) * u];
}
const clamp01 = (v, a, b) => Math.max(a, Math.min(b, v));
export function soleWorld(clip, bone, t, local = SOLE) {
  const p = sampleMotion(clip, t, {loop: false}), r = rootAt(clip, t), q = point(p, bone, local);
  return [q[0] + r[0], q[1], q[2] + r[1]];
}
export function measureSupports(clip, rate = 240) {
  const out = [];
  for (const s of clip.supports) {
    const pts = [];
    for (let t = s.start; t <= s.end + 1e-9; t += 1 / rate) pts.push(soleWorld(clip, s.bone, Math.min(t, s.end), s.local));
    let spread = 0, ydev = 0, dev = 0;
    for (let i = 0; i < pts.length; i++) {
      ydev = Math.max(ydev, Math.abs(pts[i][1]));
      dev = Math.max(dev, Math.hypot(pts[i][0] - s.anchor[0], pts[i][2] - s.anchor[2]));
      for (let j = i + 1; j < pts.length; j++) spread = Math.max(spread, Math.hypot(pts[i][0] - pts[j][0], pts[i][2] - pts[j][2]));
    }
    out.push({bone: s.bone, start: s.start, end: s.end, samples: pts.length, slideCm: +(spread * 100).toFixed(3), anchorDevCm: +(dev * 100).toFixed(3), floorCm: +(ydev * 100).toFixed(3)});
  }
  return out;
}
/** Planted-foot ground speed (m/s) at the 30 Hz frames: how fast the sole moves in the world while a support window is open. */
export function maxSlide(clip) { const m = measureSupports(clip); return {slideCm: Math.max(0, ...m.map(x => x.slideCm)), floorCm: Math.max(0, ...m.map(x => x.floorCm)), windows: m.length}; }
