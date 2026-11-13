import {bladeContact,skatingTravel} from './skating.mjs';
/** Original motion QA mathematics, CC0-1.0. All distances are metres, all times seconds.
 * This is a reproducible diagnostic score, not a learned or perceptual quality model.
 */
export const METRICS = Object.freeze({
  footSliding: Object.freeze({ label: 'החלקת רגליים', unit: 'height ratio', green: .01, yellow: .035, weight: 18,
    description: 'Maximum horizontal sole displacement from the first sample of each declared support window, divided by character height. Inferred support is used only when no windows were supplied.' }),
  floorPenetration: Object.freeze({ label: 'חדירה לרצפה', unit: 'height ratio', green: .005, yellow: .02, weight: 15,
    description: 'Maximum depth of the supplied sole probe points and all skeletal joint centers below the declared floor plane, divided by height. Sole probes are not a mesh collision audit.' }),
  posePops: Object.freeze({ label: 'קפיצות פוזה', unit: 'discontinuity ratio', green: 1, yellow: 2.5, weight: 18,
    description: 'Maximum adjacent 60 Hz-equivalent step: root-relative marker displacement / 0.04 height, root-relative rotation / 15 degrees, or root translation / 0.08 height. A fast continuous action can also exceed this screening threshold.' }),
  anatomy: Object.freeze({ label: 'חריגות אנטומיות', unit: '% affected frames', green: .5, yellow: 3, weight: 14,
    description: 'Percentage of frames with elbow or knee flexion above 165 degrees, neck bend above 80 degrees, or a segment length changing by more than 5%. Optional calibrated hinge checks detect reverse knee flexion above 8 degrees. Conservative marker limits do not diagnose axial joint twist.' }),
  ballContact: Object.freeze({ label: 'מגע בכדור', unit: 'height ratio', green: .015, yellow: .05, weight: 13,
    description: 'Maximum absolute distance from the ball surface to the sampled, bone-transformed declared contact point, divided by height. Events are evaluated at their exact declared times by interpolation.' }),
  continuity: Object.freeze({ label: 'כניסה ויציאה מול המתנה', unit: 'continuity ratio', green: 1, yellow: 3, weight: 10,
    description: 'Worst entry/exit mismatch to the best matching idle phase: RMS marker error / 0.04 height, RMS bone rotation / 25 degrees, or RMS endpoint velocity error / 0.75 height per second. Horizontal root translation is aligned; root height and body pose remain measurable.' }),
  bodySliding: Object.freeze({ label: 'מהירות גוף מול צעדים', unit: 'relative speed error', green: .2, yellow: .5, weight: 8,
    description: 'Relative difference between average root travel speed and the median backward support-foot sweep speed relative to the root. Cadence and implied stride lengths are also reported. In-place clips need an explicit reference travel scenario; stationary actions are not scored as locomotion.' }),
  symmetry: Object.freeze({ label: 'סימטריה', unit: 'relative mismatch', green: .03, yellow: .1, weight: 4,
    description: 'Maximum bilateral segment-length mismatch. Looping locomotion additionally compares reflected half-cycle leg markers; explicit pose symmetry compares simultaneous bilateral markers. One-sided actions retain unscored motion diagnostics, so a valid kick or dribble arm is not penalized for intentional asymmetry.' }),
});

const EPS = 1e-9;
const RAD = 180 / Math.PI;
const FEET = ['LeftFoot', 'RightFoot'];
const SEGMENTS = [
  ['Hips', 'Spine'], ['Spine', 'Chest'], ['Chest', 'Neck'], ['Neck', 'Head'],
  ...['Left', 'Right'].flatMap(side => [[`${side}Arm`, `${side}ForeArm`], [`${side}ForeArm`, `${side}Hand`], [`${side}UpLeg`, `${side}Leg`], [`${side}Leg`, `${side}Foot`]]),
];
const PAIRS = ['Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'Toes', 'Shoulder'];
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const length = a => Math.hypot(...a);
const distance = (a, b) => length(sub(a, b));
const horizontal = a => Math.hypot(a[0], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const finiteVector = (a, n = 3) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const rms = a => Math.sqrt(mean(a.map(v => v * v)));
const percentile = (a, p) => { if (!a.length) return 0; const sorted = [...a].sort((a, b) => a - b); return sorted[Math.round((sorted.length - 1) * p)]; };
const median = a => percentile(a, .5);
const round = (value, digits = 6) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const normalize = a => length(a) > EPS ? mul(a, 1 / length(a)) : [1, 0, 0];
const angle = (a, b) => Math.acos(clamp(dot(a, b) / Math.max(EPS, length(a) * length(b)), -1, 1)) * RAD;
const qnormalize = q => mul(q, 1 / Math.max(EPS, length(q)));
const qinverse = q => [-q[0], -q[1], -q[2], q[3]];
function qmultiply(a, b) {
  const [x, y, z, w] = a; const [X, Y, Z, W] = b;
  return [w * X + x * W + y * Z - z * Y, w * Y - x * Z + y * W + z * X, w * Z + x * Y - y * X + z * W, w * W - x * X - y * Y - z * Z];
}
function rotate(q, p) {
  const r = qmultiply(qmultiply(qnormalize(q), [...p, 0]), qinverse(qnormalize(q)));
  return r.slice(0, 3);
}
function qslerp(a, b, alpha) {
  a = qnormalize(a); b = qnormalize(b);
  let cosine = dot(a, b);
  if (cosine < 0) { b = mul(b, -1); cosine = -cosine; }
  if (cosine > .9995) return qnormalize(a.map((v, i) => v * (1 - alpha) + b[i] * alpha));
  const theta = Math.acos(clamp(cosine, -1, 1));
  return add(mul(a, Math.sin((1 - alpha) * theta) / Math.sin(theta)), mul(b, Math.sin(alpha * theta) / Math.sin(theta)));
}
const qangle = (a, b) => 2 * Math.acos(clamp(Math.abs(dot(qnormalize(a), qnormalize(b))), 0, 1)) * RAD;
const rootOf = frame => frame.root ?? frame.joints.Root ?? [0, 0, 0];
const poseJoints = frame => frame.rawJoints ?? frame.localJoints ?? frame.joints;
const poseRoot = frame => (frame.rawJoints || frame.localJoints) ? (frame.assetRoot ?? poseJoints(frame).Root ?? [0, 0, 0]) : rootOf(frame);
const posePoint = (frame, name) => {
  const p = poseJoints(frame)[name];
  if (!p) return null;
  const root = poseRoot(frame);
  return [p[0] - root[0], p[1], p[2] - root[2]];
};
function poseRotation(frame, bone) {
  const q = frame.rawRotations?.[bone] ?? frame.rotations?.[bone];
  if (!q) return null;
  const rootQ = frame.rawRotations?.Root ?? frame.rotations?.Root;
  return rootQ && bone !== 'Root' ? qmultiply(qinverse(qnormalize(rootQ)), qnormalize(q)) : q;
}
function interpolateMap(a = {}, b = {}, alpha, quaternion = false) {
  return Object.fromEntries(Object.keys(a).filter(key => b[key]).map(key => [key,
    quaternion ? qslerp(a[key], b[key], alpha) : a[key].map((v, i) => v * (1 - alpha) + b[key][i] * alpha),
  ]));
}
function sample(frames, t) {
  if (t <= frames[0].t + EPS) return frames[0];
  if (t >= frames.at(-1).t - EPS) return frames.at(-1);
  let lo = 0; let hi = frames.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid; }
  const a = frames[lo]; const b = frames[hi]; const alpha = (t - a.t) / (b.t - a.t);
  const result = { t, joints: interpolateMap(a.joints, b.joints, alpha), rotations: interpolateMap(a.rotations, b.rotations, alpha, true) };
  for (const key of ['root', 'referenceRoot', 'assetRoot', 'ball']) {
    if (a[key] && b[key]) result[key] = a[key].map((v, i) => v * (1 - alpha) + b[key][i] * alpha);
  }
  if (a.rawJoints && b.rawJoints) result.rawJoints = interpolateMap(a.rawJoints, b.rawJoints, alpha);
  if (a.localJoints && b.localJoints) result.localJoints = interpolateMap(a.localJoints, b.localJoints, alpha);
  if (a.rawRotations && b.rawRotations) result.rawRotations = interpolateMap(a.rawRotations, b.rawRotations, alpha, true);
  if (a.scales && b.scales) result.scales = interpolateMap(a.scales, b.scales, alpha);
  return result;
}
function localPoint(frame, bone, local = [0, 0, 0]) {
  if (!frame.joints[bone]) return null;
  const scaled = local.map((v, i) => v * (frame.scales?.[bone]?.[i] ?? 1));
  return add(frame.joints[bone], frame.rotations?.[bone] ? rotate(frame.rotations[bone], scaled) : scaled);
}
function result(id, value, evidence = {}) {
  if (!Number.isFinite(value)) return unavailable('insufficient-data', 'The metric had no valid observations.', evidence);
  const { green, yellow } = METRICS[id];
  const status = value <= green ? 'green' : value <= yellow ? 'yellow' : 'red';
  let score;
  if (value <= green) score = 100 - 20 * value / Math.max(EPS, green);
  else if (value <= yellow) score = 80 - 30 * (value - green) / (yellow - green);
  else score = Math.max(0, 50 - 50 * (value - yellow) / Math.max(EPS, yellow * 2));
  return { value: round(value), status, score: round(score, 2), evidence };
}
const unavailable = (status, reason, evidence = {}) => ({ value: null, status, score: null, reason, evidence });

function supportWindows(frames, metadata, height) {
  const declared = (metadata.supports ?? []).filter(w => FEET.includes(w.bone) && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start);
  if (declared.length) return { windows: declared, source: 'declared' };
  const windows = [];
  const floor = metadata.floorY ?? 0;
  for (const bone of FEET) {
    let start = null;
    for (let i = 0; i < frames.length; i++) {
      const p = localPoint(frames[i], bone, metadata.soleLocal ?? [0, 0, 0]);
      const prior = i ? localPoint(frames[i - 1], bone, metadata.soleLocal ?? [0, 0, 0]) : p;
      const dt = i ? frames[i].t - frames[i - 1].t : 1;
      const stable = p && prior && p[1] <= floor + .025 * height && Math.abs(p[1] - prior[1]) / dt < .08 * height;
      if (stable && start === null) start = frames[i].t;
      if ((!stable || i === frames.length - 1) && start !== null) {
        const end = stable ? frames[i].t : frames[Math.max(0, i - 1)].t;
        if (end - start >= .06) windows.push({ bone, start, end, local: metadata.soleLocal ?? [0, 0, 0] });
        start = null;
      }
    }
  }
  return { windows, source: 'inferred from height and vertical speed; no horizontal-speed condition' };
}
function windowFrames(frames, window) {
  const start = Math.max(frames[0].t, window.start); const end = Math.min(frames.at(-1).t, window.end);
  if (end <= start) return [];
  return [sample(frames, start), ...frames.filter(frame => frame.t > start + EPS && frame.t < end - EPS), sample(frames, end)];
}
function footSliding(frames, metadata, height, supports) {
  const observations = []; const speeds = [];
  for (const window of supports.windows) {
    const points = windowFrames(frames, window).map(frame => ({ t: frame.t, p: localPoint(frame, window.bone, window.local ?? metadata.soleLocal ?? [0, 0, 0]) })).filter(o => o.p);
    if (points.length < 2) continue;
    const first = points[0];
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      observations.push({ bone: window.bone, t: round(current.t), start: round(first.t), end: round(points.at(-1).t), driftMeters: horizontal(sub(current.p, first.p)) });
      if (i) speeds.push(horizontal(sub(current.p, points[i - 1].p)) / (current.t - points[i - 1].t));
    }
  }
  if (!observations.length) return unavailable('insufficient-data', 'No measurable foot support interval.', { supportSource: supports.source });
  observations.sort((a, b) => b.driftMeters - a.driftMeters);
  const worst = observations[0];
  return result('footSliding', worst.driftMeters / height, {
    coordinateSpace: metadata.coordinateSpace ?? 'sampled asset world', supportSource: supports.source,
    windows: supports.windows.length, samples: observations.length, maxDriftMeters: round(worst.driftMeters), p95SpeedMetersPerSecond: round(percentile(speeds, .95)),
    worst: { ...worst, driftMeters: round(worst.driftMeters) },
  });
}
function floorPenetration(frames, metadata, height) {
  let worst = null; let count = 0; let supplied = false;
  const floor = metadata.floorY ?? 0;
  for (const frame of frames) {
    let points = [];
    if (Array.isArray(frame.floorPoints)) {
      supplied = true;
      points = frame.floorPoints.map((point, i) => finiteVector(point) ? { bone: `probe${i}`, position: point } : point).filter(point => finiteVector(point?.position));
    } else {
      points = FEET.map(bone => ({ bone, position: localPoint(frame, bone, metadata.soleLocal ?? [0, 0, 0]) })).filter(point => point.position);
    }
    // A joint center below the floor is a definite lower bound on body penetration.
    points.push(...Object.entries(frame.joints).map(([bone,position])=>({bone,position})));
    for (const point of points) {
      const depth = Math.max(0, floor - point.position[1]); count++;
      if (!worst || depth > worst.depthMeters) worst = { t: round(frame.t), bone: point.bone, depthMeters: depth, y: round(point.position[1]) };
    }
  }
  if (!worst) return unavailable('insufficient-data', 'No supplied floor probes or foot markers.');
  return result('floorPenetration', worst.depthMeters / height, {
    samples: count, floorY: floor, probeKind: metadata.floorProbeKind ?? (supplied ? 'declared sole probes plus skeletal joint centers (no mesh surfaces)' : 'skeletal foot marker/declared sole offset; mesh unavailable'),
    maxDepthMeters: round(worst.depthMeters), worst: { ...worst, depthMeters: round(worst.depthMeters) },
  });
}
function posePops(frames, height) {
  let worst = { ratio: 0 }; let maxDegrees60Hz = 0; let maxMarkerStepHeight60Hz = 0; let maxRootStepHeight60Hz = 0; let observations = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]; const b = frames[i]; const timeScale = 1 / ((b.t - a.t) * 60);
    for (const bone of Object.keys(poseJoints(a))) {
      if (bone === 'Root') continue;
      const p = posePoint(a, bone); const next = posePoint(b, bone);
      if (!p || !next) continue;
      const markerStep = distance(p, next) * timeScale / height;
      const qa = poseRotation(a, bone); const qb = poseRotation(b, bone);
      const degrees = qa && qb ? qangle(qa, qb) * timeScale : 0;
      const ratio = Math.max(markerStep / .04, degrees / 15);
      maxDegrees60Hz = Math.max(maxDegrees60Hz, degrees); maxMarkerStepHeight60Hz = Math.max(maxMarkerStepHeight60Hz, markerStep); observations++;
      if (ratio > worst.ratio) worst = { ratio, t: round(b.t), previousTime: round(a.t), bone, markerStepHeight60Hz: round(markerStep), degrees60Hz: round(degrees) };
    }
    const rootStep = distance(rootOf(a), rootOf(b)) * timeScale / height;
    maxRootStepHeight60Hz = Math.max(maxRootStepHeight60Hz, rootStep);
    if (rootStep / .08 > worst.ratio) worst = { ratio: rootStep / .08, t: round(b.t), previousTime: round(a.t), bone: 'Root', rootStepHeight60Hz: round(rootStep) };
  }
  if (!observations) return unavailable('insufficient-data', 'No common markers in adjacent frames.');
  return result('posePops', worst.ratio, { adjacentPairs: frames.length - 1, observations, maxDegrees60Hz: round(maxDegrees60Hz), maxMarkerStepHeight60Hz: round(maxMarkerStepHeight60Hz), maxRootStepHeight60Hz: round(maxRootStepHeight60Hz), worst });
}
function anatomy(frames, metadata) {
  const baselines = new Map();
  for (const [a, b] of SEGMENTS) {
    const lengths = frames.filter(frame => frame.joints[a] && frame.joints[b]).map(frame => distance(frame.joints[a], frame.joints[b])).filter(v => v > EPS);
    if (lengths.length) baselines.set(`${a}:${b}`, median(lengths));
  }
  let testedFrames = 0; let badFrames = 0; let checks = 0; let maxFlexion = 0; let maxStretch = 0;
  const violations = [];
  for (const frame of frames) {
    let tested = false; let bad = false;
    const mark = evidence => { bad = true; violations.push({ t: round(frame.t), ...evidence }); };
    for (const side of ['Left', 'Right']) {
      for (const [proximal, joint, distal, limit, kind] of [
        [`${side}UpLeg`, `${side}Leg`, `${side}Foot`, 165, 'knee'],
        [`${side}Arm`, `${side}ForeArm`, `${side}Hand`, 165, 'elbow'],
      ]) {
        const [a, b, c] = [proximal, joint, distal].map(name => frame.joints[name]);
        if (!a || !b || !c || length(sub(a, b)) < EPS || length(sub(c, b)) < EPS) continue;
        const flexion = 180 - angle(sub(a, b), sub(c, b)); tested = true; checks++;
        maxFlexion = Math.max(maxFlexion, flexion);
        if (flexion > limit) mark({ joint, kind, flexionDegrees: round(flexion), limitDegrees: limit, excess: flexion - limit });
        if (kind === 'knee' && metadata.checkHingeDirection && frame.rotations?.[proximal]) {
          const lateral = rotate(frame.rotations[proximal], [1, 0, 0]);
          const sign = dot(cross(sub(b, a), sub(c, b)), lateral);
          if (sign < -EPS && flexion > 8) mark({ joint, kind: 'reverse-knee', flexionDegrees: round(flexion), limitDegrees: 8, excess: flexion - 8 });
        }
      }
    }
    const { Chest: chest, Neck: neck, Head: head } = frame.joints;
    if (chest && neck && head && length(sub(neck, chest)) > EPS && length(sub(head, neck)) > EPS) {
      tested = true; checks++;
      const bend = angle(sub(neck, chest), sub(head, neck));
      if (bend > 80) mark({ joint: 'Neck', kind: 'neck-bend', flexionDegrees: round(bend), limitDegrees: 80, excess: bend - 80 });
    }
    for (const [a, b] of SEGMENTS) {
      const baseline = baselines.get(`${a}:${b}`);
      if (!baseline || !frame.joints[a] || !frame.joints[b]) continue;
      tested = true; checks++;
      const error = Math.abs(distance(frame.joints[a], frame.joints[b]) / baseline - 1); maxStretch = Math.max(maxStretch, error);
      if (error > .05) mark({ joint: b, kind: 'segment-length-change', relativeLengthError: round(error), limit: .05, excess: error * 100 });
    }
    if (tested) testedFrames++;
    if (bad) badFrames++;
  }
  if (!testedFrames) return unavailable('insufficient-data', 'No measurable joint triples or segments.');
  violations.sort((a, b) => b.excess - a.excess || a.t - b.t);
  return result('anatomy', 100 * badFrames / testedFrames, {
    testedFrames, affectedFrames: badFrames, checks, maxLimbFlexionDegrees: round(maxFlexion), maxRelativeSegmentLengthChange: round(maxStretch),
    hingeDirectionChecked: !!metadata.checkHingeDirection, axialTwistChecked: false, violations: violations.slice(0, 8).map(({ excess, ...v }) => v),
  });
}
function ballContact(frames, metadata, height) {
  if (metadata.ballMeasurementUnavailable && metadata.ballContactExpected) return unavailable('insufficient-data', metadata.ballMeasurementUnavailable, { independentTrajectoryAvailable: false });
  const windows = metadata.ballContacts ?? metadata.contactWindows ?? [];
  if(metadata.ballVisible===false&&!metadata.ballContactExpected&&!windows.length&&!metadata.contacts?.length) return unavailable('not-applicable','This action explicitly has no visible ball or declared ball contact.');
  const declarations = metadata.contacts ?? (metadata.events ?? []).filter(event => /^(contact|touch|catch|receive|release)$/.test(event.type ?? event.name ?? ''));
  // Generic presentation cues need no duplicate effector when an explicit window supplies it.
  const events = declarations.filter(event => (event.bone ?? event.effector) || !windows.some(window => {
    const t = event.time ?? event.atSeconds;
    return (window.bone ?? window.effector) && t >= window.start - EPS && t <= window.end + EPS;
  }));
  for (const window of windows) {
    if (!Number.isFinite(window.start) || !Number.isFinite(window.end) || window.end < window.start) {
      events.push({ time: NaN, bone: window.bone ?? window.effector }); continue;
    }
    const times = [window.start, ...frames.filter(frame => frame.t > window.start + EPS && frame.t < window.end - EPS).map(frame => frame.t), window.end];
    events.push(...times.map(time => ({ time, bone: window.bone ?? window.effector, local: window.local ?? window.localPointMeters })));
  }
  const contacts = []; const missed = [];
  const radius = metadata.ball?.radius ?? metadata.ballRadius;
  if (!events.length) return unavailable('not-applicable', 'No declared ball contact events.');
  if (!(radius > 0)) return unavailable('insufficient-data', 'Ball radius is missing.');
  const seen = new Set();
  for (const event of events) {
    const t = event.time ?? event.atSeconds;
    const bone = event.bone ?? event.effector;
    if (!Number.isFinite(t) || !bone) { missed.push({ bone: bone ?? null, t: t ?? null, reason: 'contact time/bone missing' }); continue; }
    const key = `${bone}:${t}:${JSON.stringify(event.local ?? event.localPointMeters ?? [0, 0, 0])}`;
    if (seen.has(key)) continue; seen.add(key);
    if (t < frames[0].t - EPS || t > frames.at(-1).t + EPS) { missed.push({ bone, t, reason: 'outside sampled interval' }); continue; }
    const frame = sample(frames, t);
    const p = localPoint(frame, bone, event.local ?? event.localPointMeters ?? [0, 0, 0]);
    if (!p || !frame.ball) { missed.push({ bone, t, reason: 'ball or contact marker missing' }); continue; }
    const centerDistance = distance(p, frame.ball); const signedGap = centerDistance - radius;
    contacts.push({ t: round(t), bone, gapMeters: round(Math.abs(signedGap)), signedGapMeters: round(signedGap), centerDistanceMeters: round(centerDistance),
      contactPoint: p.map(v => round(v)), ballCenter: frame.ball.map(v => round(v)), declaredLocalPoint: !!(event.local ?? event.localPointMeters) });
  }
  if (!contacts.length) return unavailable('insufficient-data', 'Declared contacts could not be sampled.', { missed });
  contacts.sort((a, b) => b.gapMeters - a.gapMeters);
  const measured = result('ballContact', contacts[0].gapMeters / height, { radiusMeters: radius, samples: contacts.length, missed, contacts: contacts.slice(0, 20), contactDetailsTruncated: contacts.length > 20, coordinateSpace: metadata.coordinateSpace ?? 'sampled asset world' });
  if (missed.length) return { ...unavailable('insufficient-data', 'Some declared contacts could not be sampled; partial observations cannot certify the full clip.', {
    ...measured.evidence, observedValue: measured.value, observedStatus: measured.status, observationCoverage: contacts.length / (contacts.length + missed.length),
  }), partial: true };
  return measured;
}
function markerVelocity(frames, index, bone) {
  if (frames.length < 2) return null;
  const a = frames[Math.max(0, index - 1)]; const b = frames[Math.min(frames.length - 1, index + 1)];
  const p = posePoint(a, bone); const q = posePoint(b, bone);
  return p && q ? mul(sub(q, p), 1 / (b.t - a.t)) : null;
}
function endpointContinuity(frames, index, idleFrames, height) {
  const frame = frames[index]; let best = null;
  for (let i = 0; i < idleFrames.length; i++) {
    const idle = idleFrames[i]; const positions = []; const rotations = []; const velocities = [];
    for (const bone of Object.keys(poseJoints(frame))) {
      if (bone === 'Root') continue;
      const p = posePoint(frame, bone); const q = posePoint(idle, bone);
      if (!p || !q) continue;
      positions.push(distance(p, q) / height);
      const a = poseRotation(frame, bone); const b = poseRotation(idle, bone);
      if (a && b) rotations.push(qangle(a, b));
      const v = markerVelocity(frames, index, bone); const w = markerVelocity(idleFrames, i, bone);
      if (v && w) velocities.push(distance(v, w) / height);
    }
    if (!positions.length) continue;
    const position = rms(positions); const rotation = rms(rotations); const velocity = rms(velocities);
    const ratio = Math.max(position / .04, rotation / 25, velocity / .75);
    if (!best || ratio < best.ratio) best = { ratio, t: round(frame.t), idleTime: round(idle.t), markers: positions.length, rmsPositionHeight: round(position), rmsRotationDegrees: round(rotation), rmsVelocityHeightPerSecond: round(velocity), velocityEvaluated: velocities.length > 0 };
  }
  return best;
}
function continuity(frames, idleFrames, height) {
  const entryIdle = Array.isArray(idleFrames) ? idleFrames : idleFrames?.entry;
  const exitIdle = Array.isArray(idleFrames) ? idleFrames : idleFrames?.exit;
  if (!entryIdle?.length || !exitIdle?.length) return unavailable('insufficient-data', 'Matching entry and exit idle samples are required.');
  const entry = endpointContinuity(frames, 0, entryIdle, height);
  const exit = endpointContinuity(frames, frames.length - 1, exitIdle, height);
  if (!entry || !exit) return unavailable('insufficient-data', 'No markers shared with the matching idle.');
  return result('continuity', Math.max(entry.ratio, exit.ratio), { entry, exit, worstEndpoint: entry.ratio >= exit.ratio ? 'entry' : 'exit', alignment: 'horizontal root translation; raw asset poses used when provided' });
}
function pathDistance(frames, key) {
  let distance = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = key === 'root' ? rootOf(frames[i - 1]) : frames[i - 1][key];
    const b = key === 'root' ? rootOf(frames[i]) : frames[i][key];
    if (a && b) distance += horizontal(sub(b, a));
  }
  return distance;
}
function bodySliding(frames, metadata, height, supports, duration, clipId) {
  const locomotion = metadata.locomotion ?? /(?:run|walk|sprint|jog|moving|shuffle|defensive_slide)/i.test(clipId ?? '');
  if (!locomotion) return unavailable('not-applicable', 'This action is not declared locomotion.');
  const observed = pathDistance(frames, 'root') / duration;
  const reference = pathDistance(frames, 'referenceRoot') / duration;
  const explicitSpeed = metadata.expectedRootSpeed ?? metadata.speed;
  let speed = observed; let rootSource = 'sampled presented root';
  if (speed < .025 * height && Number.isFinite(explicitSpeed) && explicitSpeed > 0) { speed = explicitSpeed; rootSource = 'declared simulation speed'; }
  else if (speed < .025 * height && reference > .025 * height) { speed = reference; rootSource = 'authored reference travel; not actual runtime motion'; }
  if (speed < .025 * height) return unavailable('not-applicable', 'In-place locomotion has no declared travel scenario; simulation speed cannot be inferred.', { observedRootSpeedMetersPerSecond: round(observed), referenceRootSpeedMetersPerSecond: round(reference) });
  let forward = sub(rootOf(frames.at(-1)), rootOf(frames[0]));
  if (horizontal(forward) < EPS && frames[0].referenceRoot && frames.at(-1).referenceRoot) forward = sub(frames.at(-1).referenceRoot, frames[0].referenceRoot);
  forward = horizontal(forward) > EPS ? normalize([forward[0], 0, forward[2]]) : [0, 0, 1];
  const windows = supports.windows.filter(window => window.end - window.start >= Math.max(.06, duration * .08));
  const sweeps = [];
  for (const window of windows) {
    const samples = windowFrames(frames, window);
    if (samples.length < 2) continue;
    const first = samples[0]; const last = samples.at(-1);
    const a = localPoint(first, window.bone, window.local ?? metadata.soleLocal ?? [0, 0, 0]);
    const b = localPoint(last, window.bone, window.local ?? metadata.soleLocal ?? [0, 0, 0]);
    if (!a || !b) continue;
    const sweep = -dot(sub(sub(b, rootOf(last)), sub(a, rootOf(first))), forward);
    const elapsed = last.t - first.t;
    sweeps.push({ bone: window.bone, start: round(first.t), end: round(last.t), duration: elapsed, sweepMeters: sweep, speed: Math.max(0, sweep / elapsed) });
  }
  if (!sweeps.length) return unavailable('insufficient-data', 'Locomotion has no measurable support sweep.', { rootSpeedMetersPerSecond: round(speed), rootSource });
  const starts = [...new Set(sweeps.map(sweep => sweep.start))].sort((a, b) => a - b);
  const intervals = starts.slice(1).map((t, i) => t - starts[i]).filter(dt => dt > .06);
  const cadence = metadata.loop ? sweeps.length / duration : intervals.length ? 1 / median(intervals) : null;
  const sweepSpeed = median(sweeps.map(sweep => sweep.speed));
  const error = Math.abs(speed - sweepSpeed) / Math.max(speed, sweepSpeed, .025 * height);
  return result('bodySliding', error, { rootSource, rootSpeedMetersPerSecond: round(speed), observedRootSpeedMetersPerSecond: round(observed), referenceRootSpeedMetersPerSecond: round(reference),
    supportSource: supports.source, backwardSweepSpeedMetersPerSecond: round(sweepSpeed), cadenceStepsPerSecond: round(cadence),
    impliedStrideMeters: cadence ? round(sweepSpeed * 2 / cadence) : null, rootStrideMeters: cadence ? round(speed * 2 / cadence) : null,
    supportSweeps: sweeps.map(({ duration, speed, sweepMeters, ...s }) => ({ ...s, duration: round(duration), sweepMeters: round(sweepMeters), speedMetersPerSecond: round(speed) })),
  });
}
function reflectedPoseError(frame, other, height, legsOnly = false) {
  const joints = poseJoints(frame); const otherJoints = poseJoints(other);
  const center = joints.Hips; const otherCenter = otherJoints.Hips;
  if (!center || !otherCenter || !joints.LeftUpLeg || !joints.RightUpLeg || !otherJoints.LeftUpLeg || !otherJoints.RightUpLeg) return null;
  const lateral = normalize(sub(joints.LeftUpLeg, joints.RightUpLeg));
  const otherLateral = normalize(sub(otherJoints.LeftUpLeg, otherJoints.RightUpLeg));
  const up = [0, 1, 0];
  const forward = normalize(cross(lateral, up)); const otherForward = normalize(cross(otherLateral, up));
  const coordinates = (point, center, lateral, forward) => { const p = sub(point, center); return [dot(p, lateral), p[1], dot(p, forward)]; };
  const errors = [];
  for (const name of legsOnly ? ['UpLeg', 'Leg', 'Foot', 'Toes'] : PAIRS) {
    const a = joints[`Left${name}`]; const b = otherJoints[`Right${name}`];
    if (!a || !b) continue;
    const p = coordinates(a, center, lateral, forward); const q = coordinates(b, otherCenter, otherLateral, otherForward);
    errors.push(distance(p, [-q[0], q[1], q[2]]) / height);
  }
  return errors.length ? rms(errors) : null;
}
function symmetry(frames, metadata, height, duration, clipId) {
  const segments = [];
  for (const [a, b] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand'], ['UpLeg', 'Leg'], ['Leg', 'Foot']]) {
    const errors = [];
    for (const frame of frames) {
      const [la, lb, ra, rb] = [`Left${a}`, `Left${b}`, `Right${a}`, `Right${b}`].map(name => frame.joints[name]);
      if (!la || !lb || !ra || !rb) continue;
      const left = distance(la, lb); const right = distance(ra, rb);
      if (Math.max(left, right) > EPS) errors.push(Math.abs(left - right) / Math.max(left, right));
    }
    if (errors.length) segments.push({ segment: `${a}-${b}`, mismatch: median(errors) });
  }
  const inferredGait = metadata.loop && /(?:run|walk|sprint|jog|shuffle|defensive_slide)/i.test(clipId ?? '');
  const mode = metadata.symmetryMode ?? (inferredGait ? 'gait' : 'structural');
  const motionErrors = [];
  const bilateralPoseErrors = [];
  for (const frame of frames) {
    const error = reflectedPoseError(frame, frame, height);
    if (error !== null) bilateralPoseErrors.push(error);
  }
  if (mode === 'gait' || mode === 'pose' || metadata.mirrorFrames?.length) {
    for (const frame of frames) {
      let other;
      if (metadata.mirrorFrames?.length) other = sample(metadata.mirrorFrames, frame.t / duration * metadata.mirrorFrames.at(-1).t);
      else if (mode === 'gait') other = sample(frames, frames[0].t + ((frame.t - frames[0].t + duration / 2) % duration));
      else other = frame;
      const error = reflectedPoseError(frame, other, height, mode === 'gait');
      if (error !== null) motionErrors.push({ t: round(frame.t), error });
    }
  }
  if (!segments.length && !motionErrors.length) return unavailable('insufficient-data', 'No bilateral segments or paired motion markers.');
  const structural = segments.length ? Math.max(...segments.map(segment => segment.mismatch)) : 0;
  const motion = motionErrors.length ? rms(motionErrors.map(sample => sample.error)) : 0;
  motionErrors.sort((a, b) => b.error - a.error);
  return result('symmetry', Math.max(structural, motion), { mode: metadata.mirrorFrames?.length ? 'mirrored clip pair' : mode,
    modeSource: metadata.symmetryMode ? 'declared' : inferredGait ? 'looping locomotion id rule; legs only' : 'structural default for intentional asymmetry',
    structuralMismatch: round(structural), segments: segments.map(segment => ({ ...segment, mismatch: round(segment.mismatch) })),
    motionRmsHeight: motionErrors.length ? round(motion) : null, worstMotion: motionErrors.length ? { t: motionErrors[0].t, errorHeight: round(motionErrors[0].error) } : null,
    bilateralPoseRmsHeightUnscored: bilateralPoseErrors.length ? round(rms(bilateralPoseErrors)) : null,
    note: mode === 'structural' ? 'One-sided authored actions are checked for structural symmetry only.' : 'Motion is mirrored in a pelvis-centred body basis.',
  });
}

/** Analyze already-sampled canonical world poses. Input is deliberately renderer-independent. */
export function analyzeClip({ frames, duration, height = 1.7, metadata = {}, idleFrames, clipId = '', sport = '' }) {
  if (!Array.isArray(frames) || frames.length < 2) throw new TypeError('analyzeClip requires at least two sampled frames.');
  if (!(height > 0) || !Number.isFinite(height)) throw new TypeError('Character height must be a positive finite number.');
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!Number.isFinite(frame.t) || (i && frame.t <= frames[i - 1].t)) throw new TypeError('Frame times must be finite and strictly increasing.');
    if (!frame.joints || !Object.values(frame.joints).every(p => finiteVector(p))) throw new TypeError('Every joint must be a finite xyz position.');
    for (const key of ['root', 'referenceRoot', 'assetRoot', 'ball']) if (frame[key] != null && !finiteVector(frame[key])) throw new TypeError(`${key} must be a finite xyz position.`);
    if (frame.rotations && !Object.values(frame.rotations).every(q => finiteVector(q, 4) && length(q) > EPS)) throw new TypeError('Rotations must be finite, nonzero xyzw quaternions.');
  }
  duration ??= frames.at(-1).t - frames[0].t;
  if (!(duration > 0) || !Number.isFinite(duration)) throw new TypeError('Clip duration must be positive and finite.');
  const supports = supportWindows(frames, metadata, height);
  const blade=metadata.contactModel==='blade';
  const bladeMetric=blade?bladeContact(frames,metadata,height,supports,{windowFrames,localPoint,rotate}):null;
  const travelMetric=blade?skatingTravel(frames,metadata,height,duration):null;
  const metrics = {
    footSliding: blade ? bladeMetric.available ? result('footSliding',bladeMetric.value,bladeMetric.evidence) : unavailable('insufficient-data',bladeMetric.reason,bladeMetric.evidence) : footSliding(frames, metadata, height, supports),
    floorPenetration: floorPenetration(frames, metadata, height),
    posePops: posePops(frames, height),
    anatomy: anatomy(frames, metadata),
    ballContact: ballContact(frames, metadata, height),
    continuity: continuity(frames, idleFrames, height),
    bodySliding: blade ? travelMetric.available ? result('bodySliding',travelMetric.value,travelMetric.evidence) : unavailable(travelMetric.reason==='stationary'?'not-applicable':'insufficient-data',travelMetric.reason,travelMetric.evidence) : bodySliding(frames, metadata, height, supports, duration, clipId),
    symmetry: symmetry(frames, metadata, height, duration, clipId),
  };
  let applicableWeight = 0; let measuredWeight = 0; let total = 0;
  for (const [id, metric] of Object.entries(metrics)) {
    if (metric.status === 'not-applicable') continue;
    const weight = METRICS[id].weight; applicableWeight += weight;
    if (metric.score !== null) { measuredWeight += weight; total += weight * metric.score; }
  }
  // Missing applicable measurements contribute no points; they can never silently appear green.
  const score = applicableWeight ? round(total / applicableWeight, 1) : 0;
  const reasons = Object.entries(metrics).filter(([, metric]) => metric.status === 'red' || metric.status === 'yellow' || metric.status === 'insufficient-data')
    .sort(([a, av], [b, bv]) => ((bv.status === 'insufficient-data' ? 100 : 100 - bv.score) * METRICS[b].weight) - ((av.status === 'insufficient-data' ? 100 : 100 - av.score) * METRICS[a].weight))
    .map(([id, metric]) => ({ metric: id, label: METRICS[id].label, status: metric.status, value: metric.value, unit: METRICS[id].unit, reason: metric.reason ?? metric.evidence?.interpretation ?? METRICS[id].description }));
  return { score, coverage: round(applicableWeight ? measuredWeight / applicableWeight : 0, 4), metrics, reasons,
    scoring: { kind: 'weighted reproducible screening proxy', applicableWeight, measuredWeight, missingApplicableMetricsScoreZero: true }, clipId, sport };
}
