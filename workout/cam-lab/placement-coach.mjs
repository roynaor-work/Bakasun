import { placementDistance } from './placement.mjs';
import { PLACEMENT_LINES } from './placement-lines.mjs';

export const COACH = { holdMs: 350, maxGap: 1200, edge: .06, centerMargin: .15,
  shoulderWidth: .04, confusionMove: .04, responseMs: 6000 };
const visible = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  Math.min(p.visibility ?? 0, p.presence ?? 1) >= .45;

// Image coordinates are unmirrored. Anatomical shoulder labels establish the
// child's right; mirroring changes only the on-screen arrow, never the words.
export function placementHint(points, options = {}) {
  const p = points || [], distance = placementDistance(p, options);
  const hips = [23, 24].filter(i => visible(p[i]));
  const anchors = hips.length ? hips : [11, 12].filter(i => visible(p[i]));
  const center = anchors.length ? anchors.reduce((sum, i) => sum + p[i].x, 0) / anchors.length : null;
  const core = [11, 12, 23, 24].filter(i => visible(p[i]));
  const clipped = core.some(i => p[i].x < COACH.edge || p[i].x > 1 - COACH.edge);
  const lateral = center != null && (clipped || Math.abs(center - .5) > COACH.centerMargin);
  const imageDirection = lateral ? center < .5 ? 1 : -1 : 0;
  const shoulderDelta = visible(p[11]) && visible(p[12]) ? p[12].x - p[11].x : 0;
  const rightImageDirection = Math.abs(shoulderDelta) >= COACH.shoulderWidth ? Math.sign(shoulderDelta) : 0;
  const arrow = imageDirection ? (options.mirrored ? -imageDirection : imageDirection) > 0 ? 'right' : 'left' : null;
  const code = lateral && clipped ? rightImageDirection ? imageDirection === rightImageDirection ? 'right' : 'left' : 'arrow' :
    distance.direction === 'closer' ? 'far' : distance.direction === 'away' ? 'near' :
    lateral ? rightImageDirection ? imageDirection === rightImageDirection ? 'right' : 'left' : 'arrow' : null;
  return { code, center, imageDirection, rightImageDirection, arrow: ['left', 'right', 'arrow'].includes(code) ? arrow : null,
    ...(PLACEMENT_LINES[code] || {}), advisory: true, blocking: false };
}

export class PlacementCoach {
  constructor() { this.reset(); }
  reset() { this.since = null; this.key = null; this.lastTime = null; this.spoken = null; this.confused = false; this.current = null; }
  markSpoken(hint, time) {
    if (hint?.arrow) this.spoken = { center: hint.center, imageDirection: hint.imageDirection,
      rightImageDirection: hint.rightImageDirection, time };
  }
  update(points, time, options = {}) {
    const gap = this.lastTime != null && time - this.lastTime > COACH.maxGap;
    this.lastTime = time;
    const hint = placementHint(points, options);
    if (!hint.code || gap) { this.since = null; this.key = null; this.current = null; }
    if (!hint.code) { this.spoken = null; this.confused = false; return null; }
    if (hint.imageDirection && this.spoken && time - this.spoken.time <= COACH.responseMs &&
      hint.imageDirection === this.spoken.imageDirection) {
      const wrongWay = (hint.center - this.spoken.center) * hint.imageDirection < -COACH.confusionMove;
      const reversedLabels = hint.rightImageDirection && this.spoken.rightImageDirection &&
        hint.rightImageDirection !== this.spoken.rightImageDirection;
      this.confused ||= wrongWay || reversedLabels;
    }
    if (this.confused && hint.arrow) Object.assign(hint, { code: 'arrow', ...PLACEMENT_LINES.arrow });
    const key = `${hint.code}:${hint.arrow || ''}`;
    if (key !== this.key) { this.key = key; this.since = time; }
    if (time - this.since < COACH.holdMs) { this.current = null; return null; }
    this.current = hint; return hint;
  }
}
