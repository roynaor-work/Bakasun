import { bodyReport, FRAMING, statusCode } from './counter.mjs';
export const PLACEMENT = { tiltDegrees: 10, agreementDegrees: 6, holdMs: 800 };
// Perspective gives a relative distance hint, not metres or a calibrated lens FOV.
export function distanceGuide(points, aspect = 1, exercise = 'placement') {
  const report = bodyReport(points, aspect, exercise);
  const ids = exercise === 'placement' ? [0, 11, 12, 23, 24, 27, 28] : report.required;
  if (!ids.every(i => Number.isFinite(points?.[i]?.x) && Number.isFinite(points?.[i]?.y))) {
    return { value: 0, text: 'עמדו מול המצלמה כדי למדוד את גודל הגוף', direction: 'unknown', percent: 0 };
  }
  const ys = ids.map(i => points[i].y), xs = ids.map(i => points[i].x);
  const span = exercise === 'placement' ? Math.max(...ys) - Math.min(...ys) :
    Math.hypot((Math.max(...xs) - Math.min(...xs)) * aspect, Math.max(...ys) - Math.min(...ys));
  const verticalClip = Math.min(...ys) < .03 || Math.max(...ys) > .97 || report.failures.some(f => f.reason === 'headroom');
  let direction = span < FRAMING.bodySpan ? 'closer' : span > .85 || verticalClip ? 'away' : 'good';
  if (direction === 'good' && (Math.min(...xs) <= FRAMING.margin || Math.max(...xs) >= 1 - FRAMING.margin)) direction = 'center';
  const percent = direction === 'closer' ? Math.round(100 * (1 - span / .30)) :
    direction === 'away' ? Math.max(10, Math.round(100 * (span / .80 - 1))) : 0;
  const text = direction === 'closer' ? `התקרבו בכ־${percent}% מהמרחק הנוכחי` : direction === 'away' ?
    `התרחקו בכ־${percent}% מהמרחק הנוכחי` : direction === 'center' ? 'זוזו למרכז התמונה' : 'המרחק מתאים — אפשר לעמוד כאן';
  return { value: Math.max(0, Math.min(1, span)), direction, percent,
    text: `${text} · גודל גוף ${Math.round(span * 100)}%. זה אומדן; מתקנים בצעדים קטנים.` };
}
// Camera roll is estimated from three parallel body axes ONLY in upright setup.
// It is a visual hint, not a device inclinometer; floor movement never feeds it.
export class PlacementGuide {
  constructor() { this.since = null; this.lastTime = null; }
  update(poses, time, aspect = 1) {
    if (this.lastTime != null && time - this.lastTime > 450) this.since = null;
    this.lastTime = time;
    let tilted = false;
    for (const { landmarks: p } of poses) {
      const report = bodyReport(p, aspect, 'placement');
      const upright = p?.length >= 33 && [11, 12, 23, 24, 27, 28].every(i => p[i] && Number.isFinite(p[i].y)) &&
        p[11].y < p[23].y && p[12].y < p[24].y && p[23].y < p[27].y && p[24].y < p[28].y;
      if (upright && !report.ok) { this.since = null; return statusCode(report, 'waiting'); }
      if (!report.ok) continue;
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
