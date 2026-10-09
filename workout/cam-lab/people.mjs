import { bodyReport, features } from './counter.mjs';

export const TRACKING = { calibrationMs: 1200, heightRatio: 1.18, feetLevel: .08,
  scaleChange: .22, sizeAdvantage: .04, movement: .30, ambiguity: .15, overlap: .18, maxGap: 450 };
const distance = (a, b, aspect) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
function descriptor(p, aspect) {
  const sides = [[11, 23, 25, 27], [12, 24, 26, 28]];
  const good = ids => ids.every(i => p?.[i] && Number.isFinite(p[i].x) && Number.isFinite(p[i].y) &&
    p[i].visibility >= .65 && (p[i].presence == null || p[i].presence >= .65));
  const ids = sides.find(good);
  if (!ids) return null;
  const [s, h, k, a] = ids;
  const size = distance(p[s], p[h], aspect) + distance(p[h], p[k], aspect) + distance(p[k], p[a], aspect);
  if (size < .2) return null;
  return { size, center: { x: p[h].x, y: p[h].y },
    height: p[a].y - Math.min(p[0]?.y ?? 1, p[7]?.y ?? 1, p[8]?.y ?? 1), feet: p[a].y };
}

// Labels are established ONLY while both people stand at the same camera depth.
// Detector array indices have no identity meaning. Ambiguous association pauses;
// missing tracks remain reserved, with their counts, for the whole attempt.
export class PeopleTracker {
  constructor() { this.tracks = []; this.since = null; this.lastTime = null; this.status = 'pair'; }
  update(poses, time, aspect = 1) {
    if (!Number.isFinite(time) || (this.lastTime != null && time <= this.lastTime)) return [null, null];
    const gap = this.lastTime == null ? 0 : time - this.lastTime; this.lastTime = time;
    const candidates = poses.slice(0, 2).map(pose => ({ pose, d: descriptor(pose.landmarks, aspect) })).filter(c => c.d);
    if (!this.tracks.length) {
      const standing = candidates.filter(c => {
        const report = bodyReport(c.pose.landmarks, aspect);
        const f = features(c.pose.landmarks, c.pose.world, aspect, report);
        return report.ok && f?.squat > 157;
      });
      standing.sort((a, b) => a.d.height - b.d.height);
      if (standing.length !== 2 || standing[1].d.height / standing[0].d.height < TRACKING.heightRatio ||
          Math.abs(standing[0].d.feet - standing[1].d.feet) > TRACKING.feetLevel ||
          distance(standing[0].d.center, standing[1].d.center, aspect) < TRACKING.overlap ||
          standing[1].d.size / standing[0].d.size < TRACKING.heightRatio) {
        this.since = null; this.reference = null; this.status = 'pair'; return [null, null];
      }
      if (gap > TRACKING.maxGap || this.reference?.some((r, i) =>
        distance(r.center, standing[i].d.center, aspect) > .06 || Math.abs(r.size / standing[i].d.size - 1) > .08)) this.since = null;
      this.since ??= time; this.reference = standing.map(c => c.d);
      if (time - this.since < TRACKING.calibrationMs) return [null, null];
      this.tracks = standing.map(c => ({ size: c.d.size, center: c.d.center }));
    }
    const costs = this.tracks.map((track, i) => candidates.map(c => {
      const scale = Math.abs(c.d.size / track.size - 1), move = distance(c.d.center, track.center, aspect);
      const otherScale = Math.abs(c.d.size / this.tracks[1 - i].size - 1);
      // Position can support identity, but cannot override a size mismatch or
      // steal a missing person's reserved slot when the survivor walks across.
      return scale <= TRACKING.scaleChange && scale + TRACKING.sizeAdvantage <= otherScale && move <= TRACKING.movement ? scale * 3 + move : Infinity;
    }));
    if (candidates.length === 2 && distance(candidates[0].d.center, candidates[1].d.center, aspect) < TRACKING.overlap) {
      this.status = 'ambiguous'; return [null, null];
    }
    const assignments = [];
    for (let a = -1; a < candidates.length; a++) for (let b = -1; b < candidates.length; b++) {
      if (a >= 0 && a === b) continue;
      const cost = (a < 0 ? 1.4 : costs[0][a]) + (b < 0 ? 1.4 : costs[1][b]);
      if (Number.isFinite(cost)) assignments.push({ ids: [a, b], cost });
    }
    assignments.sort((a, b) => a.cost - b.cost);
    if (assignments[1] && assignments[1].cost - assignments[0].cost < TRACKING.ambiguity) {
      this.status = 'ambiguous'; return [null, null];
    }
    const matched = assignments[0].ids.map((id, i) => {
      if (id < 0) return null;
      this.tracks[i].center = candidates[id].d.center;
      return candidates[id].pose;
    });
    this.status = matched.every(Boolean) ? 'armed' : 'missing-person';
    return matched;
  }
}
