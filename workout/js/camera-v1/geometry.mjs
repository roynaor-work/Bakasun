const LEFT = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 };
const RIGHT = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 };
const SIDES = [LEFT, RIGHT];

export const either = (...joints) => SIDES.map(side => joints.map(name => side[name]));
export const both = (...joints) => either(...joints).flat();
const CONFIDENCE = .35;
export const observed = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 &&
  (p.visibility ?? 0) >= CONFIDENCE && (p.presence ?? 1) >= CONFIDENCE;

export function seen(points, required) {
  return (Array.isArray(required[0]) ? required : [required]).some(set => set.every(i => observed(points?.[i])));
}

function mean(a, b) {
  if (!a || !b) return a || b;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN;
}

function angle(a, b, c) {
  const u = distance(a, b), v = distance(c, b);
  if (!(u > .0001 && v > .0001)) return NaN;
  const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y);
  return Math.acos(Math.max(-1, Math.min(1, dot / (u * v)))) * 180 / Math.PI;
}

const finite = values => values.filter(Number.isFinite);
export const max = values => finite(values).length ? Math.max(...finite(values)) : NaN;
export const min = values => finite(values).length ? Math.min(...finite(values)) : NaN;

// The knee-lift limits of the profiles were tuned on a body whose thigh is this many torso lengths. Children
// differ (a six-year-old's legs are shorter for the same torso than an eleven-year-old's), so a knee lift
// is read against the child's own thigh, measured while standing still, and restated on this scale.
export const NOMINAL_THIGH = .9;
// Only a child who stands on two straight legs gives a true thigh length: a raised or bent knee shortens it.
const standingThigh = f => {
  if (!(f.torsoUp > .65)) return null;
  const lengths = f.sides.map(side => side.kneeAngle >= 158 && side.kneeRise < -.3 ? -side.kneeRise : NaN);
  const seen = lengths.filter(Number.isFinite);
  if (!seen.length || seen.length === 2 && Math.abs(seen[0] - seen[1]) > .12) return null;
  return Math.max(...seen);
};

export function measure(points, aspect, reference, required) {
  const p = points.map(q => observed(q) ? { x: q.x * aspect, y: q.y } : null);
  const sides = SIDES.map((ids, index) => {
    const j = Object.fromEntries(Object.entries(ids).map(([name, i]) => [name, p[i]]));
    return { ...j, index, score: Object.values(ids).reduce((value, i) => value + (p[i] ? points[i].visibility : 0), 0),
      complete: !required || !Array.isArray(required[0]) || required[index].every(i => p[i]) };
  });
  const [left, right] = sides;
  const main = sides.filter(side => side.complete).sort((a, b) => b.score - a.score)[0];
  const hip = mean(left.hip, right.hip), shoulder = mean(left.shoulder, right.shoulder);
  if (!main || !hip || !shoulder) return null;
  const s = reference?.scale ?? distance(main.shoulder || shoulder, main.hip || hip);
  if (!(s >= .035)) return null;
  // camBody=1: the legs and arms are restated on the grown-up scale from the child's measured proportions
  // (body.mjs, world landmarks), which do not depend on the angle the thigh happened to be seen at.
  const thighScale = reference?.legScale ?? (reference?.thigh ? Math.max(.8, Math.min(1.7, NOMINAL_THIGH / reference.thigh)) : 1);
  const armScale = reference?.armScale ?? 1;
  const dx = (a, b) => a && b ? (a.x - b.x) / s : NaN;
  const dy = (a, b) => a && b ? (a.y - b.y) / s : NaN;
  const dist = (a, b) => distance(a, b) / s;
  for (const side of sides) {
    const { shoulder, elbow, wrist, hip, knee, ankle, toe, heel } = side;
    side.kneeAngle = angle(hip, knee, ankle);
    side.elbowAngle = angle(shoulder, elbow, wrist);
    side.line = angle(shoulder, hip, ankle);
    side.kneeLine = angle(shoulder, hip, knee);
    side.legAngle = angle(shoulder, hip, knee);
    side.torsoLength = dist(shoulder, hip);
    side.sole = max([toe?.y, heel?.y, ankle ? ankle.y + .08 * s : NaN]);
    side.armUp = dy(shoulder, wrist) * armScale;
    side.heelRise = dy(toe, heel);
    side.kneeRise = dy(hip, knee) * thighScale;
  }
  const floor = reference?.floor ?? max(sides.map(side => side.sole));
  const clearance = y => (floor - y) / s;
  for (const side of sides) side.clearance = clearance(side.sole);
  const footLift = min(sides.map(side => side.clearance));
  const kneeLift = max(sides.map(side => side.kneeRise));
  const feet = Math.abs(dx(left.ankle, right.ankle));
  const shoulders = Math.abs(dx(left.shoulder, right.shoulder));
  const face = p[0] && p[7] && p[8] ? dx(p[0], mean(p[7], p[8])) : dx(p[0], shoulder);
  const out = { left, right, sides, main, hip, shoulder, nose: p[0], scale: s, floor, face, dx, dy, dist, thigh: reference?.thigh ?? null,
    footLift, kneeLift, feet, shoulders, clearance, hipRise: reference ? dy(reference.hip, hip) : 0,
    torsoUp: dy(hip, shoulder), torsoWide: Math.abs(dx(hip, shoulder)),
    kneeWidth: Math.abs(dx(left.knee, right.knee)), wristSpread: Math.abs(dx(left.wrist, right.wrist)),
    ankleOrder: Math.sign(dx(left.ankle, right.ankle)), bodyLine: main.line, kneeLine: main.kneeLine,
    kneeAngle: main.kneeAngle, elbowAngle: main.elbowAngle,
    // camDepth=1: how much easier than the written depth a push-up counts (1 = as written); see body.mjs depthEaseOf.
    depthEase: reference?.depthEase ?? 1 };
  // A first measurement (no reference yet) of a standing child records the child's own thigh length.
  if (!reference) out.thigh = standingThigh(out);
  return out;
}
