// The child's own body, read from proportions and not from how tall the child looks in the picture.
// A tall eleven-year-old standing near the phone fills the frame like an adult, a small six-year-old at the
// same spot fills a third of it, and neither says anything about the legs: a six-year-old's thigh is a little
// shorter against the torso, an eleven-year-old's is that of a grown-up. The pose model's world landmarks are
// metric and do not depend on the angle or on the distance, so a standing frame gives
//   - the torso, thigh, shin and arm lengths against the torso (what the thresholds are written in),
//   - the torso length in metres (a rough size, which with the torso in the picture gives the distance).
// Behind the URL flags camBody=1 (thresholds scaled to these proportions) and camSteps=1 (the guidance counts
// steps). Pure and local: numbers in, numbers out, nothing is stored.
const L = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 };
const R = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 };
const CONFIDENCE = .5;

// Grown-up proportions measured on world landmarks (torso = shoulder midpoint to hip midpoint).
export const ADULT = Object.freeze({ thigh: .92, shin: .90, arm: 1.08, torsoMeters: .50 });
// Real children and adults stay inside this; anything outside is a bad frame, not a body.
const PLAUSIBLE = Object.freeze({ thigh: [.55, 1.35], shin: [.5, 1.3], arm: [.6, 1.6], torsoMeters: [.2, .7] });
// One metre of torso is this far from the phone when it fills one frame height; the phone's vertical field of
// view is not known, so this is the usual ~50 degrees of a phone held upright. The guidance is coarse on purpose.
const FRAME_PER_METER_AT_ONE = .93;
const STEP_METERS = .6;
const HEIGHT_PER_TORSO = 3.3;
const FRAME_SHARE = .85;

const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z ?? 0);
const solid = p => finite(p) && Math.min(p.visibility ?? 0, p.presence ?? 1) >= CONFIDENCE;
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 });
const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const within = (value, [low, high]) => value >= low && value <= high;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * One frame of world landmarks (33 points, metres) into lengths. Null unless both shoulders and hips are
 * confident; a limb whose joints are not confident is simply missing from the answer.
 */
export function proportionsOf(world) {
  if (!Array.isArray(world) || world.length < 29) return null;
  const j = side => Object.fromEntries(Object.entries(side).map(([name, i]) => [name, solid(world[i]) ? world[i] : null]));
  const sides = [j(L), j(R)];
  const [l, r] = sides;
  if (!l.shoulder || !r.shoulder || !l.hip || !r.hip) return null;
  const torso = d3(mid(l.shoulder, r.shoulder), mid(l.hip, r.hip));
  if (!within(torso, PLAUSIBLE.torsoMeters)) return null;
  const lengths = (a, b) => sides.map(s => s[a] && s[b] ? d3(s[a], s[b]) / torso : NaN).filter(Number.isFinite);
  const thigh = median(lengths('hip', 'knee'));
  const shin = median(lengths('knee', 'ankle'));
  const arm = median(sides.map(s => s.shoulder && s.elbow && s.wrist ? (d3(s.shoulder, s.elbow) + d3(s.elbow, s.wrist)) / torso : NaN).filter(Number.isFinite));
  const out = { torsoMeters: torso };
  if (within(thigh, PLAUSIBLE.thigh)) out.thigh = thigh;
  if (within(shin, PLAUSIBLE.shin)) out.shin = shin;
  if (within(arm, PLAUSIBLE.arm)) out.arm = arm;
  return out;
}

/** The median of several frames: a still child gives many, and one blurred frame must not set the scale. */
export function bodyFromFrames(frames) {
  const each = (Array.isArray(frames) ? frames : []).map(frame => proportionsOf(frame)).filter(Boolean);
  if (each.length < 3) return null;
  const pick = key => { const values = each.map(item => item[key]).filter(Number.isFinite); return values.length >= 3 ? median(values) : null; };
  const body = { frames: each.length, torsoMeters: pick('torsoMeters'), thigh: pick('thigh'), shin: pick('shin'), arm: pick('arm') };
  body.kind = kindOf(body);
  return body;
}

/** Small child, child, or grown-up build, from the torso length: the label the guidance and the report use. */
export function kindOf(body) {
  const torso = body?.torsoMeters;
  if (!Number.isFinite(torso)) return 'unknown';
  return torso < .36 ? 'small' : torso < .44 ? 'child' : 'grown';
}

/**
 * Factors that restate a child's lengths on the grown-up scale the thresholds were written in. 1 = no change.
 * leg: raises a knee lift measured against a short thigh; arm: a reach measured against a short arm.
 * Clamped to what real bodies give, so a bad frame cannot turn a threshold into nonsense.
 */
export function scalesOf(body) {
  const factor = (value, nominal) => Number.isFinite(value) ? clamp(nominal / value, .8, 1.35) : 1;
  return { leg: factor(body?.thigh, ADULT.thigh), shin: factor(body?.shin, ADULT.shin), arm: factor(body?.arm, ADULT.arm) };
}

/** How many steps back bring the whole child into the picture, or null when that cannot be told. */
export function stepsBack({ torsoMeters, torsoInPicture }) {
  if (!(torsoMeters > 0) || !(torsoInPicture > 0)) return null;
  const distance = torsoMeters / (torsoInPicture * FRAME_PER_METER_AT_ONE);
  const need = HEIGHT_PER_TORSO * torsoInPicture / FRAME_SHARE;
  if (need <= 1) return 0;
  return clamp(Math.ceil(distance * (need - 1) / STEP_METERS), 1, 4);
}

export const STEP_WORDS = Object.freeze({
  1: { text: 'זוז צעד אחד אחורה', say: 'זוּז צַעַד אֶחָד אָחוֹרָה' },
  2: { text: 'זוז שני צעדים אחורה', say: 'זוּז שְׁנֵי צְעָדִים אָחוֹרָה' },
  3: { text: 'זוז שלושה צעדים אחורה', say: 'זוּז שְׁלוֹשָׁה צְעָדִים אָחוֹרָה' },
  4: { text: 'זוז ארבעה צעדים אחורה', say: 'זוּז אַרְבָּעָה צְעָדִים אָחוֹרָה' },
});

// camDepth=1: on real people (a side view, the model's elbow angle reads high and the shoulder looks lower
// than it is) most push-ups of a steady set stopped short of .39 torso lengths of lowering. 0.77 of that
// (.30) counted 19 of ~20 reps in the one clip measured; a child with short arms lowers less in torso units,
// so the factor shrinks with the arm scale of scalesOf(). Clamped, so a bad frame cannot empty the threshold.
export const DEPTH_EASE = .77;
export function depthEaseOf(body = null) {
  const arm = scalesOf(body).arm;
  // Measured lying in the push-up start, the same grown-ups read an arm of .80 to .93 torso lengths against 1.05
  // standing (the far arm hides behind the near one), so the lower end is kept close: .66, not less.
  return clamp(DEPTH_EASE / arm, .66, .85);
}
