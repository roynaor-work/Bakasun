// v9 guards: lost tracking, child-vs-parent focus, lighting, phone stability, missing limb.
// Pure and deterministic. Everything is advisory; none of it changes how reps are counted.
// Kill switches: ?camGuard=0 (all), ?camFocus=1 turns the two-person focus ON (default off: costs inference time).
export const GUARD = { lostMs: 1200, backMs: 500, darkLuma: 55, brightLuma: 235, backlightRatio: 1.6, backlightMin: 90,
  shakeG: 1.6, shakeHoldMs: 600, tiltDeg: 25, focusSwitch: 1.4, lightHoldMs: 1500 };
export function guardEnabled(search = globalThis.location?.search || '', name = 'camGuard', dflt = true) {
  try { const v = new URLSearchParams(search).get(name); if (v === '0') return false; if (v === '1') return true; } catch {}
  return dflt;
}

// Announces once when the child leaves the frame while counting, once when back.
// Never touches the count: the counter keeps its own value through a lost period.
export class TrackingGuard {
  constructor() { this.reset(); }
  reset() { this.lostSince = null; this.backSince = null; this.lost = false; }
  update(present, time) {
    if (present) {
      this.lostSince = null; this.backSince ??= time;
      if (this.lost && time - this.backSince >= GUARD.backMs) { this.lost = false; return 'back'; }
      return null;
    }
    this.backSince = null; this.lostSince ??= time;
    if (!this.lost && time - this.lostSince >= GUARD.lostMs) { this.lost = true; return 'lost'; }
    return null;
  }
}

// Which pose is the child? Largest torso in frame wins (the nearer, usually the child
// who is placed in front); the previous choice is kept unless another is much bigger.
const torso = (p, aspect) => { const s = [11, 12].filter(i => p[i]), h = [23, 24].filter(i => p[i]);
  if (!s.length || !h.length) return 0;
  const sx = s.reduce((a, i) => a + p[i].x, 0) / s.length, sy = s.reduce((a, i) => a + p[i].y, 0) / s.length;
  const hx = h.reduce((a, i) => a + p[i].x, 0) / h.length, hy = h.reduce((a, i) => a + p[i].y, 0) / h.length;
  return Math.hypot((sx - hx) * aspect, sy - hy); };
export class ChildFocus {
  constructor() { this.last = null; }
  pick(poses, aspect = 1) {
    const sized = (poses || []).map((pose, index) => ({ pose, index, size: torso(pose?.landmarks || [], aspect) })).filter(c => c.size > .02);
    if (!sized.length) return null;
    const best = sized.reduce((a, b) => b.size > a.size ? b : a);
    const prev = this.last == null ? null : sized.find(c => Math.abs(c.size - this.last.size) < this.last.size * .5 &&
      Math.abs(torsoX(c.pose) - this.last.x) < .25);
    const chosen = prev && best.size < prev.size * GUARD.focusSwitch ? prev : best;
    this.last = { size: chosen.size, x: torsoX(chosen.pose) };
    return { pose: chosen.pose, others: sized.length - 1 };
  }
}
const torsoX = pose => { const l = pose?.landmarks || []; const v = [11, 12, 23, 24].filter(i => l[i]); return v.length ? v.reduce((a, i) => a + l[i].x, 0) / v.length : .5; };

// luma: Uint8 grayscale w*h; box: {x0,y0,x1,y1} normalized body box (optional).
export function analyzeLight(luma, w, h, box = null) {
  if (!luma?.length || !w || !h) return { state: 'unknown' };
  let sum = 0; for (let i = 0; i < luma.length; i++) sum += luma[i];
  const mean = sum / luma.length;
  if (mean < GUARD.darkLuma) return { state: 'dark', mean };
  if (box && box.x1 > box.x0 && box.y1 > box.y0) {
    let inS = 0, inN = 0, outS = 0, outN = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const inside = x / w >= box.x0 && x / w <= box.x1 && y / h >= box.y0 && y / h <= box.y1, v = luma[y * w + x];
      if (inside) { inS += v; inN++; } else { outS += v; outN++; } }
    if (inN > 4 && outN > 4) { const a = inS / inN, b = outS / outN;
      if (b >= GUARD.backlightMin && b > a * GUARD.backlightRatio) return { state: 'backlight', mean, body: a, around: b }; }
  }
  return { state: mean > GUARD.brightLuma ? 'bright' : 'ok', mean };
}
// Holds a non-ok state for a while before reporting it, so one dark frame says nothing.
export class LightGuard {
  constructor() { this.key = null; this.since = null; }
  update(state, time) { if (state !== this.key) { this.key = state; this.since = time; }
    return ['ok', 'unknown'].includes(state) || time - this.since < GUARD.lightHoldMs ? null : state; }
}

// Device motion. gravity = {x,y,z} in m/s^2 (accelerationIncludingGravity, portrait phone).
export function phoneState(gravity) {
  if (!gravity || ![gravity.x, gravity.y, gravity.z].every(Number.isFinite)) return null;
  const g = Math.hypot(gravity.x, gravity.y, gravity.z) || 1;
  if (gravity.y < -3) return 'upside-down';
  const fromUpright = Math.acos(Math.max(-1, Math.min(1, gravity.y / g))) * 180 / Math.PI; // 0 = upright portrait
  if (Math.abs(gravity.x) > g * .75) return 'landscape';
  if (fromUpright > GUARD.tiltDeg && gravity.y > 0) return 'tilted';
  return null;
}
export class ShakeGuard {
  constructor() { this.since = null; this.last = null; }
  update(accel, time) {
    if (!accel || ![accel.x, accel.y, accel.z].every(Number.isFinite)) return false;
    const m = Math.hypot(accel.x, accel.y, accel.z), shaking = this.last != null && Math.abs(m - this.last) > GUARD.shakeG;
    this.last = m;
    if (!shaking) { this.since = null; return false; }
    this.since ??= time; return time - this.since >= GUARD.shakeHoldMs;
  }
}

// Which body part is missing when the child is placed too close/too far? Names for the hint.
export function missingPart(points, minConfidence = .3) {
  const ok = i => points?.[i] && (points[i].visibility ?? 0) >= minConfidence && (points[i].presence ?? 1) >= minConfidence &&
    points[i].x >= 0 && points[i].x <= 1 && points[i].y >= 0 && points[i].y <= 1;
  const any = ids => ids.some(ok);
  if (!any([11, 12, 23, 24])) return null;
  if (!any([0, 7, 8])) return 'head';
  if (!any([27, 28])) return 'legs';
  return null;
}
