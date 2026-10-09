import { bodyReport } from './counter.mjs';
export const PLACEMENT = { tiltDegrees: 10, agreementDegrees: 6, holdMs: 800 };
// Camera roll is estimated from three parallel body axes ONLY in upright setup.
// It is a visual hint, not a device inclinometer; floor movement never feeds it.
export class PlacementGuide {
  constructor() { this.since = null; this.lastTime = null; }
  update(poses, time, aspect = 1) {
    if (this.lastTime != null && time - this.lastTime > 450) this.since = null;
    this.lastTime = time;
    let tilted = false;
    for (const { landmarks: p } of poses) {
      const report = bodyReport(p, aspect);
      const upright = p?.length >= 33 && [11, 12, 23, 24, 27, 28].every(i => p[i] && Number.isFinite(p[i].y)) &&
        p[11].y < p[23].y && p[12].y < p[24].y && p[23].y < p[27].y && p[24].y < p[28].y;
      if (upright && report.failures.some(f => f.reason === 'bodySpan')) { this.since = null; return 'far'; }
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
