// Pure, deterministic pose logic. Nothing here records images or writes storage.
export const EXERCISES = ['squats', 'jumping-jacks', 'high-knees', 'lunges', 'push-ups', 'knee-push-ups', 'glute-bridge'];
export const FLOOR = ['push-ups', 'knee-push-ups', 'glute-bridge'];
export const EXERCISE_FEEDBACK = {
  lunges: 'בַּמַּכְרָע שׁוֹמְרִים עַל גּוּף זָקוּף. עוֹלִים בְּנַחַת וּמַחֲלִיפִים רֶגֶל.',
  'push-ups': 'הַגּוּף בְּקוֹ יָשָׁר. לֹא שׁוֹמְטִים אֶת הָאַגָּן. מְכַוְּפִים אֶת הַמַּרְפְּקִים וְדוֹחֲפִים בְּנַחַת.',
  'knee-push-ups': 'הַגּוּף יָשָׁר מֵהַבִּרְכַּיִם עַד הַכְּתֵפַיִם. לֹא מְקַפְּלִים אֶת הַמָּתְנַיִם בִּמְקוֹם אֶת הַמַּרְפְּקִים.',
  'glute-bridge': 'מַרְמִים אֶת הָאַגָּן עַד קוֹ יָשָׁר בְּנוֹחוּת, בְּלִי לְקַמֵּר אֶת הַגַּב. מוֹרִידִים לְאַט.',
};
export const REASONS = {
  partial: 'טווח התנועה היה חלקי',
  knees: 'הברכיים התקרבו פנימה לאורך התנועה',
  fast: 'התנועה הייתה קצרה מכדי לזהות מחזור ברור',
  tracking: 'הגוף הוסתר או הזיהוי לא היה ברור',
  timeout: 'לא זוהתה חזרה לעמדת ההתחלה',
  alternate: 'לא זוהתה החלפה לרגל השנייה',
  unfinished: 'התנועה הייתה עדיין באמצע בסיום',
  alignment: 'לא נשמר קו הגוף המתאים לתרגיל',
};
export const FEEDBACK = {
  partial: 'נְנַסֶּה תְּנוּעָה שְׁלֵמָה וְנוֹחָה, וְנַחֲזֹר לַעֲמִידַת הַהַתְחָלָה. אֶפְשָׁר לְבַקֵּשׁ מִמְּבֻגָּר לְהַדְגִּים.',
  knees: 'בַּסְּקְוָואט, הַבִּרְכַּיִם נָעוֹת בְּכִוּוּן אֶצְבְּעוֹת הָרַגְלַיִם. נֵרֵד בְּנוֹחוּת וְנַעֲלֶה בְּנַחַת.',
  fast: 'נְנַסֶּה לָנוּעַ בְּנַחַת, כְּדֵי שֶׁהַמַּצְלֵמָה תַּסְפִּיק לִרְאוֹת אֶת כָּל הַתְּנוּעָה.',
  tracking: 'הַמַּצְלֵמָה לֹא רוֹאָה בְּבֵרוּר. נַחֲזֹר לַמָּקוֹם הַמְּסֻמָּן. אִם לֹא בָּרוּר, נִשְׁאַל מְבֻגָּר.',
  timeout: 'נַעֲצֹר לְרֶגַע וְנַחֲזֹר לַעֲמִידַת הַהַתְחָלָה. אִם לֹא בָּרוּר, נִשְׁאַל מְבֻגָּר.',
  alternate: 'בְּבִרְכַּיִם גְּבוֹהוֹת מַרְמִים רֶגֶל אַחַת, מוֹרִידִים, וְאָז מַחֲלִיפִים רֶגֶל.',
  unfinished: 'הַתְּנוּעָה עוֹד לֹא הִסְתַּיְּמָה.',
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
export function angle(a, b, c) {
  const ab = dist(a, b), bc = dist(b, c);
  if (ab < 1e-6 || bc < 1e-6) return NaN;
  return Math.acos(clamp((ab * ab + bc * bc - dist(a, c) ** 2) / (2 * ab * bc), -1, 1)) * 180 / Math.PI;
}
export function thresholds({ age = 7, height = 120 } = {}) {
  if (!Number.isFinite(age) || age < 5 || age > 12 || !Number.isFinite(height) || height < 90 || height > 180) {
    throw new RangeError('גיל 5–12 וגובה 90–180 ס״מ נדרשים למעבדה');
  }
  // Engineering starting points, NOT paediatric norms. Keep the age effect small.
  return { squatDown: age <= 8 ? 125 : 120, squatStart: 150, squatUp: 157,
    kneeRise: clamp((age <= 8 ? 12 : 14) / height, .07, .16),
    kneeStart: .045, kneeRest: .025, jackOpen: 1.8, jackStart: 1.5, jackClosed: 1.3,
    wristMargin: 4 / height, dwell: age <= 8 ? 150 : 120, minCycle: 350,
    maxCycle: 8000, maxGap: 450, trackingGrace: 400, smoothing: 80, valgusHold: 200,
    lungeStart: 145, lungeDown: 110, lungeUp: 157, lungeDepth: .08, torsoLean: .45,
    pushStart: 145, pushDown: 100, pushUp: 160, bodyStraight: 150,
    bridgeStart: 145, bridgeUp: 165, bridgeDown: 135, bridgeArch: .15, formHold: 200 };
}
const SIDES = [[11, 13, 15, 23, 25, 27], [12, 14, 16, 24, 26, 28]];
// A complete side is an alternative, never a mixture of left and right joints.
export const REQUIRED_POINTS = {
  squats: { left: [11, 23, 25, 27], right: [12, 24, 26, 28] },
  'high-knees': { left: [11, 23, 25, 27], right: [12, 24, 26, 28] },
  lunges: { left: [11, 23, 25, 27], right: [12, 24, 26, 28] },
  'jumping-jacks': { left: [11, 13, 23, 25, 27], right: [12, 14, 24, 26, 28] },
  'push-ups': { left: [11, 13, 15, 23, 27], right: [12, 14, 16, 24, 28] },
  'knee-push-ups': { left: [11, 13, 15, 23, 25], right: [12, 14, 16, 24, 26] },
  'glute-bridge': { left: [11, 23, 25], right: [12, 24, 26] },
};
export const FRAMING = { coreConfidence: .45, footConfidence: .30, observationConfidence: .30,
  margin: 0, headroom: .05, minSpan: .24, pointHoldMs: 400 };
export const DIAGNOSTIC_LABELS = {
  missing: 'לא זוהה גוף', coordinates: 'נקודה לא ברורה', visibility: 'נקודה מוסתרת',
  presence: 'זיהוי נקודה חלש', margin: 'נקודה מחוץ לתמונה', headroom: 'חסר מקום מעל הראש',
  bodySpan: 'הגוף קטן בתמונה', shoulderWidth: 'הכתפיים צרות בתמונה',
  frontRatio: 'מומלץ לפנות למצלמה', hipWidth: 'האגן צר בתמונה',
  floorView: 'תרגיל הרצפה אינו במבט צד ברור', held: 'נקודות נשמרו מפריים קודם',
};
export const POINT_LABELS = {
  0: 'אף', 7: 'אוזן שמאל', 8: 'אוזן ימין', 11: 'כתף שמאל', 12: 'כתף ימין',
  13: 'מרפק שמאל', 14: 'מרפק ימין', 15: 'כף יד שמאל', 16: 'כף יד ימין',
  23: 'אגן שמאל', 24: 'אגן ימין', 25: 'ברך שמאל', 26: 'ברך ימין',
  27: 'קרסול שמאל', 28: 'קרסול ימין', 29: 'עקב שמאל', 30: 'עקב ימין',
  31: 'אצבעות רגל שמאל', 32: 'אצבעות רגל ימין',
};
const confidence = p => Math.min(Number.isFinite(p?.visibility) ? p.visibility : 0, p?.presence ?? 1);
const imageCoordinates = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const inImage = p => imageCoordinates(p) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const goodPoint = (p, limit = FRAMING.coreConfidence) => inImage(p) && confidence(p) >= limit;
const finiteWorld = p => p && ['x', 'y', 'z'].every(key => Number.isFinite(p[key]));
const requiredIds = exercise => [...new Set(Object.values(REQUIRED_POINTS[exercise] || REQUIRED_POINTS.squats).flat())];
const finiteValues = values => values.filter(Number.isFinite);
const maxValue = values => finiteValues(values).length ? Math.max(...finiteValues(values)) : null;
const minValue = values => finiteValues(values).length ? Math.min(...finiteValues(values)) : null;

// report.ok describes the movement dependencies. Placement warnings never stop
// an otherwise observable exercise; floor orientation is a movement safeguard.
export function bodyReport(points, aspect = 1, exercise = 'squats') {
  const p = points || [], failures = [], warnings = [];
  const sets = Object.values(REQUIRED_POINTS[exercise] || REQUIRED_POINTS.squats);
  const scores = sets.map(ids => ids.reduce((sum, i) => sum + (goodPoint(p[i]) ? 2 : confidence(p[i])), 0) / ids.length);
  const side = scores[0] >= scores[1] ? 0 : 1, required = sets[side];
  const availableSides = sets.map(ids => ids.every(i => goodPoint(p[i])));
  if (!p.length) failures.push({ reason: 'missing' });
  else for (const i of required) {
    if (!imageCoordinates(p[i])) { failures.push({ reason: 'coordinates', point: i }); continue; }
    if (!(p[i].visibility >= FRAMING.coreConfidence)) failures.push({ reason: 'visibility', point: i });
    if (p[i].presence != null && !(p[i].presence >= FRAMING.coreConfidence)) failures.push({ reason: 'presence', point: i });
    if (!inImage(p[i])) failures.push({ reason: 'margin', point: i });
  }
  const [s, , , h, k, a] = SIDES[side];
  const visible = p.filter(q => goodPoint(q)), xs = visible.map(q => q.x), ys = visible.map(q => q.y);
  const head = minValue([0, 7, 8].filter(i => goodPoint(p[i])).map(i => p[i].y));
  const ankle = maxValue([27, 28].filter(i => goodPoint(p[i])).map(i => p[i].y));
  const torso = imageCoordinates(p[s]) && imageCoordinates(p[h]) ? Math.hypot((p[s].x - p[h].x) * aspect, p[s].y - p[h].y) : 0;
  const span = FLOOR.includes(exercise) ? (visible.length ? Math.hypot((Math.max(...xs) - Math.min(...xs)) * aspect, Math.max(...ys) - Math.min(...ys)) : 0) :
    head != null && ankle != null ? ankle - head : imageCoordinates(p[s]) && imageCoordinates(p[a]) ? (p[a].y - p[s].y) / .8 : torso * 3;
  if (span < FRAMING.minSpan) warnings.push({ reason: 'bodySpan' });
  if (head != null && head - torso * FRAMING.headroom < 0) warnings.push({ reason: 'headroom' });
  if (!FLOOR.includes(exercise) && goodPoint(p[11]) && goodPoint(p[12])) {
    const shoulder = Math.abs(p[11].x - p[12].x);
    if (shoulder < .03) warnings.push({ reason: 'shoulderWidth' });
    if (torso > 0 && shoulder * aspect / torso < .30) warnings.push({ reason: 'frontRatio' });
  }
  if (FLOOR.includes(exercise) && imageCoordinates(p[s]) && imageCoordinates(p[h]) &&
      Math.abs(p[s].x - p[h].x) * aspect < Math.abs(p[s].y - p[h].y) * .5) failures.push({ reason: 'floorView' });
  return { ok: failures.length === 0, failures, warnings, side, required, availableSides, span };
}
export function fullBody(points, aspect = 1) { return bodyReport(points, aspect).ok; }

export function features(points, world, aspect = 1, report = bodyReport(points, aspect)) {
  if (!report.ok) return null;
  const p = points, [s, e, w, h, k, a] = SIDES[report.side];
  const point = i => goodPoint(p[i]);
  const worldAngle = ids => ids.every(i => point(i) && finiteWorld(world?.[i])) ? angle(...ids.map(i => world[i])) : NaN;
  const finite = n => Number.isFinite(n) ? n : null;
  const knees = SIDES.map(([, , , hip, knee, ankle]) => finite(worldAngle([hip, knee, ankle])));
  const visibleSides = report.availableSides || [true, true];
  const span = Math.max(.001, report.span || 0);
  const torsoLength = Math.hypot((p[s].x - p[h].x) * aspect, p[s].y - p[h].y);
  const shoulder = point(11) && point(12) && Math.abs(p[11].x - p[12].x) > .03 ? Math.abs(p[11].x - p[12].x) : torsoLength * .8;
  const hip = point(23) && point(24) ? Math.abs(p[23].x - p[24].x) : null;
  const ankleWidth = point(27) && point(28) ? Math.abs(p[27].x - p[28].x) : null;
  const kneeWidth = point(25) && point(26) ? Math.abs(p[25].x - p[26].x) : null;
  const arm = ([shoulderId, elbowId, wristId]) => {
    const hasWrist = point(wristId) && !p[wristId].held, hasElbow = point(elbowId);
    // A wrist beyond the frame is never a required point for jumping jacks.
    const up = hasWrist ? p[wristId].y < (point(0) ? p[0].y : p[shoulderId].y - torsoLength * .5) : hasElbow && p[elbowId].y < p[shoulderId].y;
    const down = hasWrist ? p[wristId].y >= p[shoulderId].y - span * .015 : hasElbow && p[elbowId].y >= p[shoulderId].y;
    const rise = hasWrist ? (p[shoulderId].y - p[wristId].y) / span : hasElbow ? (p[shoulderId].y - p[elbowId].y) / span : null;
    return { up, down, rise };
  };
  const arms = SIDES.map(([shoulderId, elbowId, wristId], i) => visibleSides[i] ? arm([shoulderId, elbowId, wristId]) : null).filter(Boolean);
  const lineY = point(k) && p[k].x !== p[s].x ? p[s].y + (p[k].y - p[s].y) * (p[h].x - p[s].x) / (p[k].x - p[s].x) : p[h].y;
  const torsoWorld = finiteWorld(world?.[s]) && finiteWorld(world?.[h]);
  const depth = SIDES.map(([, , , hipId, , ankleId]) => point(hipId) && point(ankleId) && finiteWorld(world?.[hipId]) && finiteWorld(world?.[ankleId]) ? world[ankleId].z - world[hipId].z : null);
  return {
    squat: maxValue(knees), lunge: minValue(knees), leftKnee: knees[0], rightKnee: knees[1],
    lungeDepthDifference: depth.every(v => v != null) ? depth[0] - depth[1] : null,
    leftDepth: depth[0], rightDepth: depth[1],
    elbow: finite(worldAngle([s, e, w])), bodyLine: finite(worldAngle([s, h, a])),
    kneeBodyLine: finite(worldAngle([s, h, k])), bridge: finite(worldAngle([s, h, k])),
    arch: torsoLength > 0 ? (lineY - p[h].y) / torsoLength : 0,
    lean: torsoWorld ? Math.hypot(world[s].x - world[h].x, world[s].z - world[h].z) / Math.max(.001, Math.abs(world[s].y - world[h].y)) : null,
    kneeIn: ankleWidth != null && kneeWidth != null && hip != null && ankleWidth > hip * .85 && kneeWidth < ankleWidth * .60 && kneeWidth < hip * .85,
    feet: shoulder > 0 ? (ankleWidth ?? (point(a) ? (Math.abs(p[a].x - p[h].x) + shoulder * .30) * 2 : 0)) / shoulder : null,
    armsUp: arms.length > 0 && arms.every(arm => arm.up), armsDown: arms.length > 0 && arms.every(arm => arm.down),
    wristRise: minValue(arms.map(arm => arm.rise)),
    leftRise: visibleSides[0] && point(23) && point(25) ? (p[23].y - p[25].y) / span : null,
    rightRise: visibleSides[1] && point(24) && point(26) ? (p[24].y - p[26].y) / span : null,
  };
}

// Confidence EMA and confidence-weighted coordinate EMA share the exact path
// in live calibration, counting and replay. Raw records remain untouched.
export class PoseFilter {
  constructor(exercise = 'squats', options = {}) { this.exercise = exercise; this.t = options; this.reset(); }
  reset() { this.lastTime = null; this.imageCache = []; this.worldCache = []; this.confidences = []; }
  update(points, world, time, aspect = 1) {
    const step = this.lastTime == null ? 50 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    const smoothing = this.t.smoothing || 80, holdMs = Math.min(FRAMING.pointHoldMs, this.t.trackingGrace || FRAMING.pointHoldMs);
    const coordinateK = 1 - Math.exp(-Math.min(step || 50, 200) / (smoothing / 2));
    const confidenceK = 1 - Math.exp(-Math.min(step || 50, 200) / (smoothing * 1.5));
    const observed = [], held = [], observedWorld = [], filtered = [], filteredWorld = [];
    for (let i = 0; i < 33; i++) {
      const raw = points?.[i], q = inImage(raw) ? confidence(raw) : 0;
      this.confidences[i] = this.confidences[i] == null ? q : this.confidences[i] + confidenceK * (q - this.confidences[i]);
      observed[i] = inImage(raw) && q >= FRAMING.observationConfidence;
      if (observed[i]) {
        const previous = this.imageCache[i], blend = previous && time - previous.time <= holdMs ? coordinateK * clamp(q, .1, 1) : 1;
        const value = { x: raw.x, y: raw.y, z: Number.isFinite(raw.z) ? raw.z : 0 };
        if (previous) for (const key of ['x', 'y', 'z']) value[key] = previous.value[key] + blend * (value[key] - previous.value[key]);
        this.imageCache[i] = { value, time, confidence: this.confidences[i] };
      }
      const cached = this.imageCache[i];
      held[i] = !observed[i] && !!cached && time - cached.time <= holdMs;
      if (cached && time - cached.time <= holdMs) {
        // A clearly observed returning point is usable immediately. A decayed
        // confidence EMA must not extend an otherwise bounded dropout.
        const currentConfidence = Math.max(cached.confidence, observed[i] ? Math.min(q, FRAMING.coreConfidence) : 0);
        filtered[i] = { ...cached.value, visibility: currentConfidence, presence: currentConfidence, held: held[i] };
      }
      observedWorld[i] = observed[i] && finiteWorld(world?.[i]);
      if (observedWorld[i]) {
        const previous = this.worldCache[i], blend = previous && time - previous.time <= holdMs ? coordinateK * clamp(q, .1, 1) : 1;
        const value = { x: world[i].x, y: world[i].y, z: world[i].z };
        if (previous) for (const key of ['x', 'y', 'z']) value[key] = previous.value[key] + blend * (value[key] - previous.value[key]);
        this.worldCache[i] = { value, time };
      }
      const cachedWorld = this.worldCache[i];
      if (cachedWorld && time - cachedWorld.time <= holdMs) filteredWorld[i] = { ...cachedWorld.value };
    }
    let report = bodyReport(filtered, aspect, this.exercise);
    const sides = Object.values(REQUIRED_POINTS[this.exercise]);
    const currentSide = sides.findIndex(ids => ids.every(i => observed[i] && goodPoint(filtered[i])));
    if (report.ok && !report.required.every(i => observed[i]) && currentSide >= 0) {
      report = { ...report, side: currentSide, required: sides[currentSide] };
    }
    const f = features(filtered, filteredWorld, aspect, report);
    const needsWorld = !['jumping-jacks', 'high-knees'].includes(this.exercise);
    const worldIds = this.exercise === 'squats' ? report.required.filter(i => i >= 23) : report.required;
    const fresh = report.ok && report.required.every(i => observed[i]) && (!needsWorld || worldIds.every(i => observedWorld[i]));
    const usable = report.ok && !worldRequired(this.exercise, f);
    return { points: filtered, world: filteredWorld, report, features: f, observed, held, observedWorld, usable, fresh: usable && fresh };
  }
}

// The start button and counter use the SAME exercise-specific rest condition.
export function atRest(exercise, f, t) {
  if (!f) return false;
  if (exercise === 'squats') return f.squat != null && f.squat > t.squatUp;
  if (exercise === 'jumping-jacks') return f.feet < t.jackClosed && f.armsDown;
  if (exercise === 'lunges') return f.lunge != null && f.lunge > t.lungeUp;
  if (exercise === 'push-ups' || exercise === 'knee-push-ups') return f.elbow != null && f.elbow > t.pushUp;
  if (exercise === 'glute-bridge') return f.bridge != null && f.bridge < t.bridgeDown;
  return maxValue([f.leftRise, f.rightRise]) != null && maxValue([f.leftRise, f.rightRise]) < t.kneeRest;
}
export function statusCode(report, phase, worldMissing = false) {
  if (!report.ok) {
    if (report.failures.some(f => f.reason === 'bodySpan')) return 'far';
    if (report.failures.some(f => f.reason === 'floorView')) return 'side';
    if (report.failures.some(f => f.point >= 23)) return 'legs';
    if (report.failures.some(f => [0, 7, 8].includes(f.point) || f.reason === 'headroom')) return 'head';
    if (report.failures.some(f => [13, 14, 15, 16].includes(f.point))) return 'hands';
    if (report.failures.some(f => ['frontRatio', 'shoulderWidth', 'hipWidth'].includes(f.reason))) return 'front';
    return 'body';
  }
  if (worldMissing) return 'world';
  return phase;
}
export function worldRequired(exercise, f) {
  return !f || (exercise === 'squats' && f.squat == null) || (exercise === 'lunges' && (f.lunge == null || f.lean == null)) ||
    (exercise === 'push-ups' && (f.elbow == null || f.bodyLine == null)) ||
    (exercise === 'knee-push-ups' && (f.elbow == null || f.kneeBodyLine == null)) ||
    (exercise === 'glute-bridge' && f.bridge == null);
}

export class RepCounter {
  constructor(exercise, profile) {
    if (!EXERCISES.includes(exercise)) throw new RangeError('תרגיל לא מוכר');
    this.exercise = exercise; this.t = thresholds(profile);
    this.begin();
  }
  begin(time = null, armed = false) {
    this.count = 0; this.rejected = 0; this.reasons = {}; this.lastSide = null;
    this.lastTime = time; this.lastGoodTime = time; this.lostSince = null; this.lossReset = false;
    this.ended = false; this.trackingCause = null; this.filter = new PoseFilter(this.exercise, this.t);
    this.diagnostics = { frames: 0, fullBodyPassed: 0, fullBodyFailed: 0,
      failureFrames: Object.fromEntries(Object.keys(DIAGNOSTIC_LABELS).map(k => [k, 0])), failedPoints: {},
      worldMissingFrames: 0, phaseMs: { waiting: 0, armed: 0, moving: 0 },
      idleTrackingResets: 0, trackingResets: 0, graceRecoveries: 0,
      cyclesStarted: 0, restFrames: 0, startFrames: 0, targetFrames: 0, heldFrames: 0,
      requiredPoints: Object.fromEntries(requiredIds(this.exercise).map(i => [i, { observedFrames: 0, heldFrames: 0, usableFrames: 0 }])),
      stopReasons: {}, warningFrames: {}, rejectedBy: { framing: 0, motionThreshold: 0, tracking: 0, other: 0 } };
    this.reset(); if (armed) this.phase = 'armed';
    this.status = this.phase;
  }
  reset() {
    this.phase = 'waiting'; this.smoothed = null; this.restSince = null;
    this.targetSince = null; this.kneeSince = null; this.formSince = null; this.cycle = null;
  }
  reject(reason) {
    this.rejected++; this.reasons[reason] = (this.reasons[reason] || 0) + 1;
    const category = reason === 'partial' ? 'motionThreshold' : reason === 'tracking' ? (this.trackingCause === 'framing' ? 'framing' : 'tracking') : 'other';
    this.diagnostics.rejectedBy[category]++;
    return { type: 'rejected', reason };
  }
  snapshot() {
    const d = structuredClone(this.diagnostics);
    for (const point of Object.values(d.requiredPoints)) {
      point.observedPercent = d.frames ? 100 * point.observedFrames / d.frames : 0;
      point.heldPercent = d.frames ? 100 * point.heldFrames / d.frames : 0;
    }
    return { ...d, fullBodyPercent: d.frames ? 100 * d.fullBodyPassed / d.frames : 0 };
  }
  finish(time = this.lastTime) {
    if (this.ended) return null;
    if (this.lastTime != null && Number.isFinite(time) && time > this.lastTime) {
      this.diagnostics.phaseMs[this.phase] += time - this.lastTime; this.lastTime = time;
    }
    const event = this.cycle ? this.reject('unfinished') : null;
    this.reset(); this.ended = true; return event;
  }
  resetTracking(reason = 'tracking') {
    this.diagnostics.trackingResets++;
    this.diagnostics.stopReasons[reason] = (this.diagnostics.stopReasons[reason] || 0) + 1;
    const event = this.cycle ? this.reject('tracking') : null;
    if (!this.cycle) this.diagnostics.idleTrackingResets++;
    this.reset(); this.filter?.reset(); this.lossReset = true; return event;
  }
  update(points, world, time, aspect = 1) {
    if (this.ended || !Number.isFinite(time) || (this.lastTime != null && time <= this.lastTime)) return null;
    const gap = this.lastTime == null ? 0 : time - this.lastTime;
    this.diagnostics.phaseMs[this.phase] += gap;
    this.lastTime = time;
    let event = null;
    if (gap > this.t.maxGap && !this.lossReset) event = this.resetTracking();
    const rawReport = bodyReport(points, aspect, this.exercise);
    this.filter.t = this.t;
    const filtered = this.filter.update(points, world, time, aspect);
    const { report, features: raw } = filtered;
    const d = this.diagnostics;
    d.frames++; if (rawReport.ok) d.fullBodyPassed++; else d.fullBodyFailed++;
    for (const reason of new Set(rawReport.failures.map(f => f.reason))) d.failureFrames[reason]++;
    for (const { reason, point } of rawReport.failures) {
      if (point == null) continue;
      d.failedPoints[reason] ??= {};
      d.failedPoints[reason][point] = (d.failedPoints[reason][point] || 0) + 1;
    }
    for (const reason of new Set(rawReport.warnings.map(f => f.reason))) d.warningFrames[reason] = (d.warningFrames[reason] || 0) + 1;
    for (const [id, diagnostic] of Object.entries(d.requiredPoints)) {
      if (filtered.observed[id]) diagnostic.observedFrames++;
      if (filtered.held[id]) diagnostic.heldFrames++;
      if (goodPoint(filtered.points[id])) diagnostic.usableFrames++;
    }
    if (report.required.some(id => filtered.held[id])) d.heldFrames++;
    const worldMissing = report.ok && (worldRequired(this.exercise, raw) ||
      (!['jumping-jacks', 'high-knees'].includes(this.exercise) && report.required.some(i =>
        (this.exercise !== 'squats' || i >= 23) && !filtered.observedWorld[i])));
    if (worldMissing) d.worldMissingFrames++;
    // Held coordinates maintain continuity only. They cannot arm, finish a
    // target dwell, complete a repetition or satisfy the minimum cycle time.
    if (!filtered.fresh) {
      this.lostSince ??= this.lastGoodTime ?? time;
      this.trackingCause = points?.length && !rawReport.ok ? 'framing' : 'tracking';
      if (time - this.lostSince > this.t.trackingGrace && !this.lossReset) event = this.resetTracking();
      this.status = statusCode(rawReport, this.phase, worldMissing);
      const reason = !points?.length ? 'missing' : !rawReport.ok ? rawReport.failures[0].reason : worldMissing ? 'world' : 'held';
      d.stopReasons[reason] = (d.stopReasons[reason] || 0) + 1;
      return event || { type: 'tracking' };
    }
    if (this.lostSince != null) {
      const lostMs = time - this.lostSince;
      if (lostMs > this.t.trackingGrace && !this.lossReset) event = this.resetTracking();
      if (!this.lossReset) {
        // Unknown frames preserve state but never satisfy dwell/minimum cycle time.
        for (const key of ['restSince', 'targetSince', 'kneeSince', 'formSince']) if (this[key] != null) this[key] += lostMs;
        if (this.cycle) this.cycle.since += lostMs;
        d.graceRecoveries++;
      }
    }
    this.lostSince = null; this.lossReset = false; this.lastGoodTime = time; this.trackingCause = null;
    const k = 1 - Math.exp(-Math.min(gap || 50, 150) / this.t.smoothing);
    if (!this.smoothed) this.smoothed = { ...raw };
    else for (const key of ['squat', 'lunge', 'elbow', 'bridge', 'feet', 'wristRise', 'leftRise', 'rightRise']) {
      if (raw[key] == null || this.smoothed[key] == null) this.smoothed[key] = raw[key];
      else this.smoothed[key] += k * (raw[key] - this.smoothed[key]);
    }
    const f = { ...raw, ...this.smoothed, armsUp: raw.armsUp, armsDown: raw.armsDown, kneeIn: raw.kneeIn };
    const t = this.t;
    const side = this.exercise === 'lunges' ? raw.lungeDepthDifference != null ?
      raw.lungeDepthDifference < -t.lungeDepth ? 'left' : raw.lungeDepthDifference > t.lungeDepth ? 'right' : null :
      raw.leftDepth != null && raw.leftDepth < -t.lungeDepth ? 'left' : raw.rightDepth != null && raw.rightDepth < -t.lungeDepth ? 'right' : null :
      f.leftRise != null && (f.rightRise == null || f.leftRise >= f.rightRise) ? 'left' : f.rightRise != null ? 'right' : null;
    const alternating = ['high-knees', 'lunges'].includes(this.exercise);
    const rise = maxValue([f.leftRise, f.rightRise]);
    const rest = atRest(this.exercise, f, t);
    let start, target;
    if (this.exercise === 'squats') {
      start = f.squat < t.squatStart; target = f.squat <= t.squatDown;
    } else if (this.exercise === 'jumping-jacks') {
      start = f.feet > t.jackStart || f.wristRise > t.wristMargin;
      target = f.feet > t.jackOpen && f.armsUp;
    } else if (this.exercise === 'lunges') {
      start = f.lunge < t.lungeStart;
      target = side != null && f.lunge <= t.lungeDown && (side === 'left' ? raw.leftKnee : raw.rightKnee) <= t.lungeDown;
    } else if (['push-ups', 'knee-push-ups'].includes(this.exercise)) {
      start = f.elbow < t.pushStart; target = f.elbow <= t.pushDown;
    } else if (this.exercise === 'glute-bridge') {
      start = f.bridge > t.bridgeStart; target = f.bridge >= t.bridgeUp;
    } else {
      start = rise > t.kneeStart;
      target = rise > t.kneeRise && (f.leftRise == null || f.rightRise == null || minValue([f.leftRise, f.rightRise]) < t.kneeRest);
    }
    if (rest) d.restFrames++; if (start) d.startFrames++; if (target) d.targetFrames++;
    this.status = this.phase;
    if (!this.cycle) {
      if (rest) {
        this.restSince ??= time;
        if (time - this.restSince >= t.dwell) this.phase = 'armed';
      } else {
        this.restSince = null;
        if (this.phase === 'armed' && start) {
          this.cycle = { since: time, reached: false, kneeIn: false, badForm: false, side };
          this.phase = 'moving'; d.cyclesStarted++;
        }
      }
      this.status = this.phase; return event;
    }
    if (time - this.cycle.since > t.maxCycle) {
      event = this.reject('timeout'); this.reset(); this.status = this.phase; return event;
    }
    if (this.exercise === 'lunges' && this.cycle.side == null && side != null) this.cycle.side = side;
    if (target && (!alternating || side === this.cycle.side)) {
      this.targetSince ??= time;
      if (time - this.targetSince >= t.dwell) this.cycle.reached = true;
    } else this.targetSince = null;
    if (this.exercise === 'squats' && f.squat < t.squatStart && f.kneeIn) {
      this.kneeSince ??= time;
      if (time - this.kneeSince >= t.valgusHold) this.cycle.kneeIn = true;
    } else this.kneeSince = null;
    const badForm = this.exercise === 'lunges' ? raw.lean > t.torsoLean :
      this.exercise === 'push-ups' ? raw.bodyLine < t.bodyStraight :
      this.exercise === 'knee-push-ups' ? raw.kneeBodyLine < t.bodyStraight :
      this.exercise === 'glute-bridge' ? raw.arch > t.bridgeArch : false;
    if (badForm) {
      this.formSince ??= time;
      if (time - this.formSince >= t.formHold) this.cycle.badForm = true;
    } else this.formSince = null;
    if (rest) {
      this.restSince ??= time;
      if (time - this.restSince >= t.dwell) {
        const c = this.cycle;
        const reason = time - c.since < t.minCycle ? 'fast' : c.kneeIn ? 'knees' : c.badForm ? 'alignment' : !c.reached ? 'partial' :
          alternating && c.side === this.lastSide ? 'alternate' : null;
        if (reason) event = this.reject(reason);
        else { this.count++; event = { type: 'counted', count: this.count }; }
        if (alternating && !reason) this.lastSide = c.side;
        this.reset(); this.phase = 'armed'; this.restSince = time;
      }
    } else this.restSince = null;
    this.status = this.phase; return event;
  }
}
