export const PLACEMENT = { tiltDegrees: 10, agreementDegrees: 6, holdMs: 800,
  minSpan: .24, maxSpan: .85, comfortableSpan: .5 };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const visible = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  (p.visibility ?? 0) >= .3 && (p.presence ?? 1) >= .3;
// A visual distance hint, never a condition for starting or counting reps.
// Steps are a rough pinhole estimate, not a calibrated measurement in metres.
export function placementDistance(points, { aspect = 1, heightCm = 120 } = {}) {
  const side = [[11, 23, 27], [12, 24, 28]].find(ids => ids.every(i => visible(points?.[i])));
  if (!side) return { span: null, position: .5, direction: null, steps: 0, advisory: true, blocking: false,
    message: 'עדיין מכוונים: אפשר להתחיל כשהנקודות הדרושות לתרגיל נראות.' };
  const [s, h, a] = side, p = points;
  const head = [0, 7, 8].filter(i => visible(p[i])).map(i => p[i].y);
  const torso = Math.abs(p[h].y - p[s].y);
  const top = head.length ? Math.min(...head) : p[s].y - torso * .5;
  const upright = p[s].y < p[h].y && p[h].y < p[a].y;
  const span = upright ? p[a].y - top : Math.hypot((p[a].x - p[s].x) * aspect, p[a].y - p[s].y);
  if (!Number.isFinite(span) || span <= 0) return { span: null, position: .5, direction: null, steps: 0,
    advisory: true, blocking: false, message: 'כוונו את המצלמה כך שהנקודות הדרושות לתרגיל ייראו.' };
  const close = upright && (span > PLACEMENT.maxSpan || top < 0 || p[a].y > 1);
  const far = upright && span < PLACEMENT.minSpan;
  const direction = close ? 'away' : far ? 'closer' : null;
  const scale = clamp(Number.isFinite(heightCm) ? heightCm : 120, 90, 180) / 120;
  const steps = direction ? clamp(Math.ceil(Math.abs(2.5 * scale * PLACEMENT.comfortableSpan / span - 2.5 * scale) / .4), 1, 6) : 0;
  return { span, position: clamp((span - PLACEMENT.minSpan) / (PLACEMENT.maxSpan - PLACEMENT.minSpan), 0, 1),
    direction, steps, advisory: true, blocking: false,
    message: direction ? `${direction === 'closer' ? 'תתקרב' : 'תתרחק'} בערך ${steps === 1 ? 'צעד אחד' : `${steps} צעדים`}. זה אומדן בלבד; אפשר לספור כשהנקודות הדרושות נראות.` :
      'המרחק נוח. אפשר להתחיל כשהנקודות הדרושות לתרגיל נראות.' };
}
// Camera roll is estimated from three parallel body axes ONLY in upright setup.
// It is a visual hint, not a device inclinometer; floor movement never feeds it.
export class PlacementGuide {
  constructor() { this.since = null; this.lastTime = null; this.distance = placementDistance([]); }
  update(poses, time, aspect = 1) {
    if (this.lastTime != null && time - this.lastTime > 450) this.since = null;
    this.lastTime = time;
    let tilted = false;
    this.distance = placementDistance(poses[0]?.landmarks || [], { aspect });
    for (const { landmarks: p } of poses) {
      const upright = p?.length >= 33 && [11, 12, 23, 24, 27, 28].every(i => p[i] && Number.isFinite(p[i].y)) &&
        p[11].y < p[23].y && p[12].y < p[24].y && p[23].y < p[27].y && p[24].y < p[28].y;
      if (upright && placementDistance(p, { aspect }).direction === 'closer') { this.since = null; return 'far'; }
      if (!upright || ![11, 12, 23, 24, 27, 28].every(i => visible(p[i]))) continue;
      const slopes = [[11, 12], [23, 24], [27, 28]].map(([a, b]) =>
        Math.atan((p[b].y - p[a].y) / ((p[b].x - p[a].x) * aspect)) * 180 / Math.PI);
      tilted ||= slopes.every(Number.isFinite) && Math.abs(slopes[0]) >= PLACEMENT.tiltDegrees &&
        Math.max(...slopes) - Math.min(...slopes) <= PLACEMENT.agreementDegrees;
    }
    if (!tilted) { this.since = null; return null; }
    this.since ??= time;
    return time - this.since >= PLACEMENT.holdMs ? 'tilt' : null;
  }
}
