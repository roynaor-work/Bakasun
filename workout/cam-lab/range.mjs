// v9: wide-range placement estimate. Works when legs are cut off (too close),
// when the child is far, and in waist-up mode. Advisory only, never blocks a rep.
// Kill switch: ?camRange=0 or localStorage['camlab.range']='0' (see rangeEnabled).
export const RANGE = { torsoToHeight: 3.2, shoulderToHeight: 4, headAboveShoulder: .45,
  minSpan: .24, maxSpan: .85, upperMin: .28, upperMax: .75, upperExtra: .2, bottomMargin: 1.02,
  minConfidence: .3, minShoulderDx: .04 };
// No current counter works from waist up (all seven need knees/ankles); the mode
// is ready for upper-body exercises. Add an id here to enable it for that exercise.
export const UPPER_BODY_EXERCISES = new Set();
export function rangeEnabled(search = globalThis.location?.search || '', storage = globalThis.localStorage) {
  try { if (new URLSearchParams(search).get('camRange') === '0') return false; } catch {}
  try { return storage?.getItem('camlab.range') !== '0'; } catch { return true; }
}
const ok = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  (p.visibility ?? 0) >= RANGE.minConfidence && (p.presence ?? 1) >= RANGE.minConfidence;
const mid = (p, ids) => { const v = ids.filter(i => ok(p[i])).map(i => p[i]);
  return v.length ? { x: v.reduce((s, q) => s + q.x, 0) / v.length, y: v.reduce((s, q) => s + q.y, 0) / v.length } : null; };

// Returns null when no upright torso is visible. span = fraction of frame height the
// whole standing body would occupy (upper mode: head to just below the hips).
export function estimateRange(points, { aspect = 1, upperBody = false } = {}) {
  const p = points || [], sh = mid(p, [11, 12]), hp = mid(p, [23, 24]);
  if (!sh || !hp) return null;
  const dx = (hp.x - sh.x) * aspect, dy = hp.y - sh.y;
  if (dy <= 0 || dy < Math.abs(dx) * 1.2) return null; // floor or sideways: no range cue
  const torso = Math.hypot(dx, dy);
  const heads = [0, 7, 8].filter(i => ok(p[i])).map(i => p[i].y);
  const top = heads.length ? Math.min(...heads) : sh.y - torso * RANGE.headAboveShoulder;
  const ankle = [27, 28].filter(i => ok(p[i])).map(i => p[i].y);
  const legsCut = !ankle.length || Math.max(...ankle) > 1;
  let span, basis;
  if (upperBody) { span = hp.y - top + torso * RANGE.upperExtra; basis = 'upper'; }
  else if (!legsCut && heads.length) { span = Math.max(...ankle) - top; basis = 'full'; }
  else { span = torso * RANGE.torsoToHeight; basis = 'torso'; }
  const bottom = (heads.length ? top : sh.y - torso * RANGE.headAboveShoulder) + span;
  const topCut = top < 0 || (heads.length === 0 && sh.y - torso * RANGE.headAboveShoulder < 0);
  return { span, basis, legsCut, topCut, bottom, torso, top };
}
export function rangeDirection(est, { upperBody = false } = {}) {
  if (!est) return null;
  const [lo, hi] = upperBody ? [RANGE.upperMin, RANGE.upperMax] : [RANGE.minSpan, RANGE.maxSpan];
  if (est.span < lo) return 'closer';
  if (est.span > hi || est.topCut || (!upperBody && est.bottom > RANGE.bottomMargin)) return 'away';
  return null;
}
