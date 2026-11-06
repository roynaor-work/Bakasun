#!/usr/bin/env node
/** Independent audit of delivered gzip clips. Does not import the author or mixer. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const canonicalPath = fileURLToPath(new URL('../../motion2/hoops.json', import.meta.url));
export const LIMITS = Object.freeze({ holdMeters: .02, supportMeters: .02, quaternionNorm: 1e-6,
  releaseVelocityMetersPerSecond: .3, jointStepRadians: .45, jointLinearSpeedMetersPerSecond: 12,
  floorMeters: .001, bounceHeightMeters: .005 });
const RATE = 120;
// Rounded delivered keys and exact uniform probes can be nanoseconds apart.
// Keep both for contact coverage; do not divide FK roundoff by those intervals.
const MIN_SPEED_INTERVAL_SECONDS = 1e-6;
const plus = (a, b) => a.map((x, i) => x + b[i]);
const minus = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const length = a => Math.hypot(...a);
const distance = (a, b) => length(minus(a, b));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const normalize = q => scale(q, 1 / length(q));
function product(a, b) {
  const [x, y, z, w] = a, [X, Y, Z, W] = b;
  return [w * X + x * W + y * Z - z * Y, w * Y - x * Z + y * W + z * X,
    w * Z + x * Y - y * X + z * W, w * W - x * X - y * Y - z * Z];
}
function rotate(q, v) { return product(product(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]).slice(0, 3); }
function slerp(a, b, t) {
  let d = dot(a, b);
  if (d < 0) { b = scale(b, -1); d = -d; }
  if (d > .9995) return normalize(lerp(a, b, t));
  const angle = Math.acos(Math.min(1, d)), denominator = Math.sin(angle);
  return a.map((x, i) => (Math.sin((1 - t) * angle) * x + Math.sin(t * angle) * b[i]) / denominator);
}
const quaternionAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(dot(a, b) / (length(a) * length(b)))));

/** LINEAR time and shortest-arc slerp: precisely the delivered clip contract. */
export function sampleClip(clip, t) {
  const frames = clip.keyframes;
  if (t <= 0) return frames[0];
  if (t >= 1) return frames.at(-1);
  let lo = 0, hi = frames.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (frames[mid].time <= t) lo = mid; else hi = mid; }
  const a = frames[lo], b = frames[hi], w = (t - a.time) / (b.time - a.time);
  return { time: t,
    rotations: Object.fromEntries(Object.keys(a.rotations).map(n => [n, slerp(a.rotations[n], b.rotations[n], w)])),
    hipsOffsetMeters: lerp(a.hipsOffsetMeters, b.hipsOffsetMeters, w),
    referenceRootTranslationMeters: lerp(a.referenceRootTranslationMeters, b.referenceRootTranslationMeters, w),
    ...(a.ballRotationQuaternion && b.ballRotationQuaternion ? {ballRotationQuaternion: slerp(a.ballRotationQuaternion, b.ballRotationQuaternion, w)} : {}),
    ballPositionMeters: lerp(a.ballPositionMeters, b.ballPositionMeters, w) };
}
export function forwardKinematics(frame, skeleton) {
  const world = {};
  for (const bone of skeleton.bones) {
    const parent = bone.parent ? world[bone.parent] : null;
    const translation = bone.name === 'Hips' ? plus(bone.restTranslationMeters, frame.hipsOffsetMeters) : bone.restTranslationMeters;
    world[bone.name] = { position: parent ? plus(parent.position, rotate(parent.rotation, translation)) : [...translation],
      rotation: parent ? product(parent.rotation, frame.rotations[bone.name]) : [...frame.rotations[bone.name]] };
  }
  return world;
}
const point = (fk, name, local) => plus(fk[name].position, rotate(fk[name].rotation, local));
const rounded = (n, digits = 3) => Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
const unitVector = v => scale(v, 1 / length(v));
function velocity(clip, a, b) {
  return scale(minus(sampleClip(clip, b).ballPositionMeters, sampleClip(clip, a).ballPositionMeters), 1 / ((b - a) * clip.durationSeconds));
}

export function auditClip(clip, canonicalSkeleton, filename = clip.id || clip.clip || 'unknown') {
  const errors = [], fail = message => { if (!errors.includes(message)) errors.push(message); };
  const names = canonicalSkeleton.bones.map(b => b.name);
  const result = { filename, id: clip.id || clip.clip, pass: false, errors, samples: 0, holdSamples: 0, supportSamples: 0,
    exactCanonical: JSON.stringify(clip.skeleton) === JSON.stringify(canonicalSkeleton),
    maxQuaternionNormError: 0, maxHoldSurfaceErrorMeters: 0, maxSupportDriftMeters: 0,
    maxJointStepRadians: 0, maxJointStepMeters: 0, minBallBottomMeters: Infinity, minSoleMeters: Infinity,
    maxJointSpeedMetersPerSecond: 0, worstJointSpeed: null,
    jointLinearSpeeds: Object.fromEntries(names.map(name => [name, {maxMetersPerSecond: 0, from: 0, to: 0}])),
    minKneeForwardDot: 1, maxKneeFlexionRadians: 0, kneeBendSamples: 0, minPlantedSoleUpDot: 1,
    ballSpin: { keys: 0, maxNormError: 0, minAdjacentDot: 1, maxStepRadians: 0, maxSpeedRadiansPerSecond: 0, loopClosureRadians: null },
    releases: [], bounces: [], contacts: [], jumps: [], worstHold: null, worstSupport: null, worstJointStep: null };
  if (!result.exactCanonical) fail('Skeleton differs from the exact motion2 canonical contract');
  if (clip.rootMotion !== false) fail('Canonical delivery must declare in-place rootMotion: false');
  if (!(clip.durationSeconds > 0) || !Array.isArray(clip.keyframes) || clip.keyframes.length < 2) {
    fail('Missing duration or keyframes'); return result;
  }
  const frames = clip.keyframes;
  let last = -1, valid = true;
  for (const [index, frame] of frames.entries()) {
    if (!Number.isFinite(frame.time) || frame.time <= last || frame.time < 0 || frame.time > 1) { fail('Keyframe times must be finite and strictly increasing'); valid = false; }
    last = frame.time;
    if (Object.keys(frame.rotations || {}).sort().join('|') !== [...names].sort().join('|')) { fail('A frame does not contain exactly the canonical 18 rotations'); valid = false; }
    for (const name of names) {
      const q = frame.rotations?.[name];
      if (!finite(q, 4) || length(q) < 1e-12) { fail(`Invalid quaternion ${name} at key ${index}`); valid = false; continue; }
      result.maxQuaternionNormError = Math.max(result.maxQuaternionNormError, Math.abs(length(q) - 1));
      if (name === 'Root' && quaternionAngle(q, [0, 0, 0, 1]) > 1e-7) fail('Root rotation is not identity');
    }
    for (const field of ['hipsOffsetMeters', 'referenceRootTranslationMeters', 'ballPositionMeters']) if (!finite(frame[field], 3)) { fail(`Invalid ${field} at key ${index}`); valid = false; }
    if (!finite(frame.ballRotationQuaternion, 4) || length(frame.ballRotationQuaternion) < 1e-12) {
      fail(`Missing or invalid ball rotation at key ${index}`); valid = false;
    } else {
      const spin = result.ballSpin;
      spin.keys++;
      spin.maxNormError = Math.max(spin.maxNormError, Math.abs(length(frame.ballRotationQuaternion) - 1));
      if (index && finite(frames[index - 1].ballRotationQuaternion, 4) && frame.time > frames[index - 1].time) {
        const previous = frames[index - 1], angle = quaternionAngle(previous.ballRotationQuaternion, frame.ballRotationQuaternion);
        spin.minAdjacentDot = Math.min(spin.minAdjacentDot, dot(previous.ballRotationQuaternion, frame.ballRotationQuaternion));
        spin.maxStepRadians = Math.max(spin.maxStepRadians, angle);
        spin.maxSpeedRadiansPerSecond = Math.max(spin.maxSpeedRadiansPerSecond, angle / ((frame.time - previous.time) * clip.durationSeconds));
      }
    }
  }
  if (frames[0].time !== 0 || frames.at(-1).time !== 1) fail('Missing exact endpoint keys');
  if (result.maxQuaternionNormError > LIMITS.quaternionNorm) fail('Quaternion normalization exceeds 1e-6');
  if (result.ballSpin.maxNormError > LIMITS.quaternionNorm) fail('Ball quaternion normalization exceeds 1e-6');
  if (result.ballSpin.minAdjacentDot < -1e-8) fail('Ball spin changes quaternion hemisphere between adjacent keys');
  if (result.ballSpin.maxStepRadians > LIMITS.jointStepRadians) fail('Ball spin step exceeds 0.45 rad at 120 Hz or a boundary');
  if (!valid) return result;
  const radius = clip.ball?.radiusMeters;
  if (!(Number.isFinite(radius) && Math.abs(radius - .12) < 1e-8)) { fail('Canonical basketball radius must be 0.12 m'); return result; }
  const holds = clip.ballContactWindows || [], supports = clip.supportWindows || [];
  for (const [kind, windows] of [['hold', holds], ['support', supports]]) for (const window of windows) {
    if (!names.includes(window.effector) || !finite(window.localPointMeters, 3) ||
      !(window.startTime >= 0 && window.endTime <= 1 && window.startTime <= window.endTime)) { fail(`Invalid ${kind} window`); valid = false; }
    if (kind === 'support' && !finite(window.anchorMeters, 3)) { fail('Invalid authored support anchor'); valid = false; }
  }
  if (!valid) return result;
  // Sample every key, 120 Hz, and exact markers/window boundaries plus 1 ms on each side.
  const times = new Set(frames.map(f => f.time));
  const steps = Math.ceil(clip.durationSeconds * RATE);
  for (let i = 0; i <= steps; i++) times.add(i / steps);
  const boundaries = [...(clip.events || []).map(e => e.time), ...[...holds, ...supports].flatMap(w => [w.startTime, w.endTime])];
  for (const t of boundaries) {
    if (!Number.isFinite(t) || t < 0 || t > 1) { fail('Invalid contact/event boundary'); continue; }
    times.add(t); times.add(Math.max(0, t - .001 / clip.durationSeconds)); times.add(Math.min(1, t + .001 / clip.durationSeconds));
  }
  const supportAnchors = new Map(supports.map(w => [w, plus(w.anchorMeters, sampleClip(clip, w.startTime).referenceRootTranslationMeters)]));
  const sorted = [...times].sort((a, b) => a - b);
  let previous = null;
  for (const t of sorted) {
    const frame = sampleClip(clip, t), fk = forwardKinematics(frame, canonicalSkeleton);
    result.samples++;
    result.minBallBottomMeters = Math.min(result.minBallBottomMeters, frame.ballPositionMeters[1] - radius);
    for (const name of ['LeftFoot', 'RightFoot']) {
      const locals = supports.filter(w => w.effector === name).map(w => w.localPointMeters);
      for (const local of locals.length ? locals : [[0, -.08, 0]]) result.minSoleMeters = Math.min(result.minSoleMeters, point(fk, name, local)[1]);
    }
    for (const side of ['Left', 'Right']) {
      const hip = fk[`${side}UpLeg`].position, knee = fk[`${side}Leg`].position, ankle = fk[`${side}Foot`].position;
      const axis = unitVector(minus(ankle, hip));
      const bend = minus(minus(knee, hip), scale(axis, dot(minus(knee, hip), axis)));
      const bodyForward = rotate(fk.Hips.rotation, [0, 0, 1]);
      const projectedForward = minus(bodyForward, scale(axis, dot(bodyForward, axis)));
      const flexion = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(unitVector(minus(hip, knee)), unitVector(minus(ankle, knee))))));
      result.maxKneeFlexionRadians = Math.max(result.maxKneeFlexionRadians, flexion);
      if (flexion > .1 && length(bend) > .001 && length(projectedForward) > 1e-9) {
        result.kneeBendSamples++;
        result.minKneeForwardDot = Math.min(result.minKneeForwardDot, dot(unitVector(bend), unitVector(projectedForward)));
      }
    }
    for (const w of holds) if (t >= w.startTime - 1e-10 && t <= w.endTime + 1e-10) {
      result.holdSamples++;
      const error = Math.abs(distance(point(fk, w.effector, w.localPointMeters), frame.ballPositionMeters) - radius);
      if (error > result.maxHoldSurfaceErrorMeters) { result.maxHoldSurfaceErrorMeters = error; result.worstHold = { effector: w.effector, normalizedTime: t }; }
    }
    for (const w of supports) if (t >= w.startTime - 1e-10 && t <= w.endTime + 1e-10) {
      result.supportSamples++;
      const world = plus(point(fk, w.effector, w.localPointMeters), frame.referenceRootTranslationMeters);
      const drift = distance(world, supportAnchors.get(w));
      result.minPlantedSoleUpDot = Math.min(result.minPlantedSoleUpDot, rotate(fk[w.effector].rotation, [0, 1, 0])[1]);
      if (drift > result.maxSupportDriftMeters) { result.maxSupportDriftMeters = drift; result.worstSupport = { effector: w.effector, normalizedTime: t, kind: w.kind }; }
    }
    if (previous) for (const name of names) {
      const angle = quaternionAngle(previous.frame.rotations[name], frame.rotations[name]);
      if (angle > result.maxJointStepRadians) { result.maxJointStepRadians = angle; result.worstJointStep = { bone: name, from: previous.time, to: t }; }
      const translation = distance(previous.fk[name].position, fk[name].position);
      const referenceTranslation = distance(plus(previous.fk[name].position, previous.frame.referenceRootTranslationMeters),
        plus(fk[name].position, frame.referenceRootTranslationMeters));
      const seconds = (t - previous.time) * clip.durationSeconds;
      result.maxJointStepMeters = Math.max(result.maxJointStepMeters, translation);
      if (seconds >= MIN_SPEED_INTERVAL_SECONDS && referenceTranslation / seconds > result.jointLinearSpeeds[name].maxMetersPerSecond) {
        result.jointLinearSpeeds[name] = {maxMetersPerSecond: referenceTranslation / seconds, from: previous.time, to: t};
      }
      if (seconds >= MIN_SPEED_INTERVAL_SECONDS && referenceTranslation / seconds > result.maxJointSpeedMetersPerSecond) {
        result.maxJointSpeedMetersPerSecond = referenceTranslation / seconds;
        result.worstJointSpeed = { bone: name, from: previous.time, to: t, distanceMeters: referenceTranslation, seconds };
      }
    }
    previous = { time: t, frame, fk };
  }
  for (const event of clip.events || []) {
    if (event.domain !== 'presentation') fail('An event does not declare the presentation domain');
    if (Math.abs(event.atSeconds - event.time * clip.durationSeconds) > 1e-6) fail('Event seconds do not match normalized time');
    if (!['release', 'bounce', 'contact', 'secure'].includes(event.name)) continue;
    const dt = Math.min(1 / RATE / clip.durationSeconds, event.time, 1 - event.time);
    if (!(dt > 0)) { fail(`${event.name} has no two-sided velocity interval`); continue; }
    const before = velocity(clip, event.time - dt, event.time), after = velocity(clip, event.time, event.time + dt);
    if (event.name === 'contact' || event.name === 'secure') {
      // An actual block/impact can impart an impulse. Report contact velocity
      // rather than treating every collision as a failed free-flight handoff.
      result.contacts.push({ name: event.name, normalizedTime: event.time, before, after, mismatch: distance(before, after) });
    } else if (event.name === 'release') {
      const mismatch = distance(before, after);
      result.releases.push({ normalizedTime: event.time, before, after, mismatch });
      if (mismatch > LIMITS.releaseVelocityMetersPerSecond) fail('Release velocity mismatch exceeds 0.3 m/s');
    } else {
      const height = sampleClip(clip, event.time).ballPositionMeters[1] - radius;
      const restitution = before[1] < 0 ? after[1] / -before[1] : Infinity;
      const good = before[1] < -.05 && after[1] > .05 && Math.abs(height) <= LIMITS.bounceHeightMeters && restitution <= 1.2;
      result.bounces.push({ normalizedTime: event.time, before, after, height, restitution, pass: good });
      if (!good) fail('Bounce must meet floor and reverse downward velocity with restitution <=1.2');
    }
  }
  for (const takeoff of (clip.events || []).filter(e => e.name === 'takeoff')) {
    const landing = (clip.events || []).find(e => e.name === 'land' && e.time > takeoff.time);
    if (!landing) { fail('Takeoff has no later landing marker'); continue; }
    const airtime = (landing.time - takeoff.time) * clip.durationSeconds;
    const hipsY = t => {const frame = sampleClip(clip, t); return forwardKinematics(frame, canonicalSkeleton).Hips.position[1] + frame.referenceRootTranslationMeters[1];};
    const y0 = hipsY(takeoff.time), y1 = hipsY(landing.time), launchVelocity = (y1 - y0) / airtime + .5 * 9.81 * airtime;
    let apexY = -Infinity, apexTime = 0, maximumBallisticDeviation = 0, sy = 0, ss2 = 0, ss4 = 0, ss2y = 0;
    const count = 241;
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1), t = takeoff.time + (landing.time - takeoff.time) * u, elapsed = u * airtime;
      const y = hipsY(t), centered = elapsed - airtime / 2;
      if (y > apexY) {apexY = y; apexTime = t;}
      maximumBallisticDeviation = Math.max(maximumBallisticDeviation, Math.abs(y - (y0 + launchVelocity * elapsed - 4.905 * elapsed * elapsed)));
      sy += y; ss2 += centered * centered; ss4 += centered ** 4; ss2y += centered * centered * y;
    }
    const quadratic = (ss2y - ss2 * sy / count) / (ss4 - ss2 * ss2 / count);
    result.jumps.push({ takeoff: takeoff.time, landing: landing.time, airtimeSeconds: airtime, apexNormalizedTime: apexTime,
      hipsRiseMeters: apexY - y0, expectedBallisticRiseMeters: launchVelocity ** 2 / (2 * 9.81),
      fittedGravityMetersPerSecond2: -2 * quadratic, maximumBallisticDeviationMeters: maximumBallisticDeviation });
  }
  if (result.maxHoldSurfaceErrorMeters > LIMITS.holdMeters) fail('Whole-window palm/finger guide surface error exceeds 20 mm');
  if (result.maxSupportDriftMeters > LIMITS.supportMeters) fail('Referenced planted support drift exceeds 20 mm');
  if (result.maxJointStepRadians > LIMITS.jointStepRadians) fail('Joint rotation step exceeds 0.45 rad at 120 Hz or a boundary');
  const speedJoints = ['LeftHand', 'RightHand', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
  for (const name of speedJoints) if (result.jointLinearSpeeds[name].maxMetersPerSecond > LIMITS.jointLinearSpeedMetersPerSecond) {
    fail(`Joint linear speed exceeds 12 m/s: ${name} ${result.jointLinearSpeeds[name].maxMetersPerSecond.toFixed(3)}`);
  }
  if (result.minBallBottomMeters < -LIMITS.floorMeters) fail('Ball penetrates the floor by more than 1 mm');
  if (result.minSoleMeters < -LIMITS.floorMeters) fail('Sole guide penetrates the floor by more than 1 mm');
  if (clip.loop) {
    result.ballSpin.loopClosureRadians = quaternionAngle(frames[0].ballRotationQuaternion, frames.at(-1).ballRotationQuaternion);
    if (result.ballSpin.loopClosureRadians > 1e-5) fail('Ball spin loop orientation does not close');
    for (const name of names) if (quaternionAngle(frames[0].rotations[name], frames.at(-1).rotations[name]) > 1e-5) fail('Loop rotations do not close');
    if (distance(frames[0].hipsOffsetMeters, frames.at(-1).hipsOffsetMeters) > 1e-5 || distance(frames[0].ballPositionMeters, frames.at(-1).ballPositionMeters) > 1e-5) fail('Loop translations or ball path do not close');
  }
  result.pass = errors.length === 0;
  return result;
}

export async function auditMotion({ inputDir = resolve(packageRoot, 'runtime/keyframes'), output = resolve(packageRoot, 'verification/MOTION.md') } = {}) {
  const canonicalBytes = await readFile(canonicalPath), skeleton = JSON.parse(canonicalBytes).skeleton;
  const filenames = (await readdir(inputDir)).filter(f => f.endsWith('.json.gz')).sort();
  const records = [];
  for (const filename of filenames) {
    const compressed = await readFile(resolve(inputDir, filename));
    try { const clip = JSON.parse(gunzipSync(compressed)); records.push({ ...auditClip(clip, skeleton, filename), sha256: createHash('sha256').update(compressed).digest('hex') }); }
    catch (error) { records.push({ filename, id: filename.replace('.json.gz', ''), pass: false, errors: [error.message], sha256: createHash('sha256').update(compressed).digest('hex') }); }
  }
  const pass = records.length >= 14 && records.every(r => r.pass);
  const lines = ['# ביקורת תנועה עצמאית', '', `תוצאה: **${pass ? 'PASS' : 'FAIL'}**. ${records.length} קליפים דחוסים נקראו מהתוצרים שנמסרים. זמן הבדיקה: ${new Date().toISOString()}.`, '',
    'הבודק אינו טוען את המחבר או את המתאם: הוא מפענח gzip, מחשב FK משלו ודוגם slerp בקשת הקצרה עם זמן ליניארי. נבדקו כל המפתחות, 120 דגימות לשנייה, זמני אירועים וגבולות חלונות וכן 1 מ״ש משני צדי הגבול. אין כאן תיקון IK, רצפה או נעילת רגל שמסתירים שגיאה.', '',
    'ספים: סטיית נורמת quaternion עד 0.000001; מרחק נקודת כף היד/האצבע מפני הכדור עד 20 מ״מ בכל חלון האחיזה; סטיית תמיכה נטועה עד 20 מ״מ; אי התאמת מהירות שחרור עד 0.3 מ׳/ש׳; צעד סיבוב מפרק עד 0.45 רדיאן; מהירות שורש כף יד, ברך וקרסול עד 12 מ׳/ש׳. סיבוב הכדור נבדק בכל מפתח: נורמה באותו סף, סימן רציף בין שכנים, צעד עד 0.45 רדיאן וסגירת אוריינטציה בלולאות. מהירות הכדור מחושבת בהפרש חד צדדי של 1/120 שנייה; מהירות המפרקים מחושבת לפי הפרש הזמן האמיתי בין דגימות ובתוספת מסלול השורש המתאר את העולם לצורך הבדיקה. חלונות קצרים ממיקרושנייה אינם משמשים לחלוקה במהירות, כדי שלא להגדיל שגיאת עיגול בין זמנים כמעט זהים; הם נשארים בבדיקות המגע והרצפה. בקפיצה מהרצפה המהירות האנכית חייבת להפוך משלילית לחיובית, גובה תחתית הכדור עד 5 מ״מ מהרצפה ומקדם החזרה עד 1.2.', '',
    'עוגני התמיכה מפורשים מהקליפ, בתוספת מסלול הייחוס בזמן תחילת החלון. נקודת הסוליה נבדקת בעולם של מסלול הייחוס לאורך כל החלון; בציר מותר לסובב את כף הרגל סביב נקודת המגע הנטועה. זו בדיקת נתונים קנוניים לפני ריטרגוט. בדיקת קודקודי GLB, האנטומיה הנראית, המצלמות והערבוב דורשת גם בדיקת רנדר נפרדת. נקודת המגע היא ההיסט שנמסר בחלון, ולכן המדידה אינה טענה שכל שטח כף היד צמוד לכדור.', '',
    '| קליפ | שלד מדויק | דגימות / אחיזה / תמיכה | נורמה מרבית | אחיזה מ״מ | תמיכה מ״מ | צעד רד׳ | כדור מינ׳ מ״מ | שחרור מ׳/ש׳ | תוצאה |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---|'];
  for (const r of records) lines.push(`| ${r.id} | ${r.exactCanonical ? '18/18' : 'FAIL'} | ${r.samples ?? 0} / ${r.holdSamples ?? 0} / ${r.supportSamples ?? 0} | ${r.maxQuaternionNormError?.toExponential(2) ?? '—'} | ${rounded((r.maxHoldSurfaceErrorMeters ?? NaN) * 1000)} | ${rounded((r.maxSupportDriftMeters ?? NaN) * 1000)} | ${rounded(r.maxJointStepRadians)} | ${rounded((r.minBallBottomMeters ?? NaN) * 1000)} | ${rounded(Math.max(0, ...(r.releases || []).map(v => v.mismatch)))} | ${r.pass ? 'PASS' : 'FAIL'} |`);
  lines.push('', '## פרטים לפי קליפ', '');
  for (const r of records) {
    lines.push(`### ${r.id}`, '', `SHA-256: \`${r.sha256}\`.`, '');
    if (r.worstHold) lines.push(`אחיזה מרבית: ${r.worstHold.effector}, זמן מנורמל ${rounded(r.worstHold.normalizedTime, 6)}.`);
    if (r.worstSupport) lines.push(`תמיכה מרבית: ${r.worstSupport.effector}, זמן מנורמל ${rounded(r.worstSupport.normalizedTime, 6)}, ${r.worstSupport.kind}.`);
    if (r.worstJointStep) lines.push(`צעד הסיבוב המרבי: ${r.worstJointStep.bone}, ${rounded(r.worstJointStep.from, 6)} → ${rounded(r.worstJointStep.to, 6)}.`);
    if (r.worstJointSpeed) lines.push(`מהירות מיקום מפרק מרבית במסלול הייחוס: ${rounded(r.maxJointSpeedMetersPerSecond)} מ׳/ש׳, ${r.worstJointSpeed.bone}, ${rounded(r.worstJointSpeed.from, 8)} → ${rounded(r.worstJointSpeed.to, 8)}; ${rounded(r.worstJointSpeed.distanceMeters * 1000)} מ״מ ב־${rounded(r.worstJointSpeed.seconds * 1000, 6)} מ״ש.`);
    if (r.jointLinearSpeeds) lines.push(`מהירויות שיא במ׳/ש׳ לכל עצם: ${Object.entries(r.jointLinearSpeeds).map(([name, metric]) => `${name} ${rounded(metric.maxMetersPerSecond)}`).join('; ')}.`);
    if (r.kneeBendSamples) lines.push(`מדדי אנטומיה משלימים (${r.kneeBendSamples} דגימות ברך): כיוון כיפוף ברך מול קדמת האגן ${rounded(r.minKneeForwardDot, 5)} (חיובי = קדימה); כיפוף מרבי ${rounded(r.maxKneeFlexionRadians * 180 / Math.PI, 2)}°; נורמל סוליה נטועה מול מעלה ${rounded(r.minPlantedSoleUpDot, 5)}; צעד מיקום מפרק מרבי ${rounded(r.maxJointStepMeters * 1000)} מ״מ.`);
    if (r.ballSpin) lines.push(`סיבוב כדור (${r.ballSpin.keys} מפתחות): שגיאת נורמה ${r.ballSpin.maxNormError.toExponential(2)}; dot מזערי בין שכנים ${rounded(r.ballSpin.minAdjacentDot, 6)}; צעד סיבוב מרבי ${rounded(r.ballSpin.maxStepRadians, 6)} רד׳; מהירות זוויתית מרבית ${rounded(r.ballSpin.maxSpeedRadiansPerSecond)} רד׳/ש׳${r.ballSpin.loopClosureRadians === null ? '' : `; סגירת לולאה ${rounded(r.ballSpin.loopClosureRadians, 8)} רד׳`}.`);
    for (const jump of r.jumps || []) lines.push(`ניתור ${rounded(jump.takeoff, 6)} → ${rounded(jump.landing, 6)}: זמן אוויר ${rounded(jump.airtimeSeconds, 6)} ש׳; שיא בזמן מנורמל ${rounded(jump.apexNormalizedTime, 6)}; עליית Hips ${rounded(jump.hipsRiseMeters * 1000)} מ״מ; עלייה בליסטית צפויה ${rounded(jump.expectedBallisticRiseMeters * 1000)} מ״מ; g מותאם ${rounded(jump.fittedGravityMetersPerSecond2, 5)} מ׳/ש׳²; סטייה בליסטית מרבית ${rounded(jump.maximumBallisticDeviationMeters * 1000)} מ״מ. זהו מדד Hips משלים, לא מדידת מרכז מסה אנטומי.`);
    for (const e of r.releases || []) lines.push(`שחרור ${rounded(e.normalizedTime, 6)}: מהירות לפני [${e.before.map(v => rounded(v)).join(', ')}], אחרי [${e.after.map(v => rounded(v)).join(', ')}], הפרש ${rounded(e.mismatch)} מ׳/ש׳.`);
    for (const e of r.contacts || []) lines.push(`מגע ${e.name} ב־${rounded(e.normalizedTime, 6)}: מהירות לפני [${e.before.map(v => rounded(v)).join(', ')}], אחרי [${e.after.map(v => rounded(v)).join(', ')}], הפרש ${rounded(e.mismatch)} מ׳/ש׳ (מדווח בלבד; חסימה יכולה להקנות מתקף).`);
    for (const e of r.bounces || []) lines.push(`הקפצה ${rounded(e.normalizedTime, 6)}: Y לפני ${rounded(e.before[1])}, אחרי ${rounded(e.after[1])} מ׳/ש׳; תחתית ${rounded(e.height * 1000)} מ״מ; החזרה ${rounded(e.restitution)}; ${e.pass ? 'PASS' : 'FAIL'}.`);
    lines.push('', ...(r.errors.length ? r.errors.map(error => `- ${error}`) : ['PASS — כל המדידות בתוך הספים.']), '');
  }
  lines.push(`שלד מקור: \`motion2/hoops.json\`; SHA-256 \`${createHash('sha256').update(canonicalBytes).digest('hex')}\`.`, '', 'שחזור:', '', '```sh', 'node workout/island/design/hoops-motion-v8/source/audit-motion.mjs', '```', '');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, lines.join('\n'));
  return { pass, records, output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await auditMotion();
  for (const r of result.records) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}: hold=${rounded((r.maxHoldSurfaceErrorMeters ?? NaN) * 1000)}mm support=${rounded((r.maxSupportDriftMeters ?? NaN) * 1000)}mm release=${rounded(Math.max(0, ...(r.releases || []).map(v => v.mismatch)))}m/s ${r.errors.join('; ')}`);
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.records.length} delivered clips; ${result.output}`);
  process.exitCode = result.pass ? 0 : 1;
}
