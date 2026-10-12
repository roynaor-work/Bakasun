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
  return { code, center, placed: center != null && distance.span != null && !code,
    imageDirection, rightImageDirection, arrow: ['left', 'right', 'arrow'].includes(code) ? arrow : null,
    ...(PLACEMENT_LINES[code] || {}), advisory: true, blocking: false };
}

export class PlacementCoach {
  constructor() { this.reset(); }
  reset() {
    this.since = null; this.key = null; this.lastTime = null; this.spoken = null; this.current = null;
    this.mistakes = 0; this.sideUncertain = false; this.episode = 0; this.instructed = false;
    this.arrivalSince = null; this.arrivalDelivered = false; this.arrivalUntil = null; this.delivered = new Set();
  }
  markSpoken(hint, time) {
    if (!hint) return;
    if (hint.event) this.delivered.add(hint.event);
    if (hint.code === 'arrived') {
      this.arrivalDelivered = true; this.arrivalUntil = time + 1800; this.instructed = false; return;
    }
    if (!this.instructed) { this.episode++; this.arrivalDelivered = false; this.arrivalUntil = null; }
    this.instructed = true;
    if (hint?.arrow) this.spoken = { center: hint.center, imageDirection: hint.imageDirection,
      rightImageDirection: hint.rightImageDirection, time };
  }
  update(points, time, options = {}) {
    const gap = this.lastTime != null && time - this.lastTime > COACH.maxGap;
    this.lastTime = time;
    const hint = placementHint(points, options);
    if (gap) { this.since = null; this.key = null; this.arrivalSince = null; this.spoken = null; }
    if (!hint.code) {
      this.since = null; this.key = null; this.current = null; this.spoken = null;
      this.mistakes = 0; this.sideUncertain = false;
      if (!hint.placed) { this.arrivalSince = null; return null; }
      this.arrivalSince ??= time;
      if (time - this.arrivalSince < COACH.holdMs || !this.instructed &&
        !(this.arrivalDelivered && time < this.arrivalUntil)) return null;
      const event = `arrived:${this.episode}`;
      return this.current = { ...hint, code: 'arrived', ...PLACEMENT_LINES.arrived, event, urgent: !this.delivered.has(event) };
    }
    this.arrivalSince = null;
    if (hint.imageDirection && this.spoken && time - this.spoken.time <= COACH.responseMs &&
      hint.imageDirection === this.spoken.imageDirection) {
      const wrongWay = (hint.center - this.spoken.center) * hint.imageDirection < -COACH.confusionMove;
      const reversedLabels = hint.rightImageDirection && this.spoken.rightImageDirection &&
        hint.rightImageDirection !== this.spoken.rightImageDirection;
      if (wrongWay) { this.mistakes = Math.min(2, this.mistakes + 1); this.spoken = null; }
      if (reversedLabels) { this.sideUncertain = true; this.spoken = null; }
    }
    if (hint.arrow && (this.sideUncertain || this.mistakes)) {
      const code = this.sideUncertain || this.mistakes >= 2 ? 'arrow' : 'wrong-side';
      Object.assign(hint, { code, ...PLACEMENT_LINES[code] });
    }
    hint.event = `${hint.code}:${this.episode}:${this.mistakes}`;
    hint.urgent = (hint.code === 'wrong-side' || this.mistakes >= 2) && !this.delivered.has(hint.event);
    const key = `${hint.code}:${hint.arrow || ''}`;
    if (key !== this.key) { this.key = key; this.since = time; }
    if (time - this.since < COACH.holdMs) { this.current = null; return null; }
    this.current = hint; return hint;
  }
}
