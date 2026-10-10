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
  framing: 'נקודות החובה לא היו ברורות בתוך המסגרת',
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
  framing: 'נַחֲזֹר לַמִּסְגֶּרֶת. הַמַּצְלֵמָה צְרִיכָה לִרְאוֹת אֶת הַמִּפְרָקִים שֶׁל הַתַּרְגִּיל.',
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
const BODY = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
// Feet are small and often occluded by each other. Keep confident ankles, but
// accept weaker heel/toe confidence. A separate grace period handles flicker.
export const FRAMING = { coreConfidence: .65, footConfidence: .35, margin: .01, headroom: .08,
  bodySpan: .26, shoulderWidth: .025, hipWidth: .012 };
const CORE = [11, 12, 23, 24, 25, 26, 27, 28];
export function requiredPoints(exercise, side = 0) {
  if (exercise === 'full-body') return BODY;
  if (exercise === 'placement') return [0, ...CORE];
  if (!FLOOR.includes(exercise)) return exercise === 'jumping-jacks' ? [...CORE, 13, 14] : CORE;
  const ids = exercise === 'push-ups' ? [11, 13, 15, 23, 27] :
    exercise === 'knee-push-ups' ? [11, 13, 15, 23, 25] : [11, 23, 25];
  return ids.map(i => i + side);
}
export function pointFailures(p, i) {
  const failures = [], confidence = i >= 29 ? FRAMING.footConfidence : FRAMING.coreConfidence;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return [{ reason: 'coordinates', point: i }];
  if (!(p.visibility >= confidence)) failures.push({ reason: 'visibility', point: i });
  if (p.presence != null && !(p.presence >= confidence)) failures.push({ reason: 'presence', point: i });
  if (!(p.x > FRAMING.margin && p.x < 1 - FRAMING.margin && p.y > FRAMING.margin && p.y < 1 - FRAMING.margin)) {
    failures.push({ reason: 'margin', point: i });
  }
  return failures;
}
function headY(p) {
  const heads = [0, 7, 8].filter(i => !pointFailures(p[i], i).length).map(i => p[i].y);
  const average = ids => {
    const ys = ids.map(i => p[i]?.y).filter(Number.isFinite);
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
  };
  const shoulder = average([11, 12]);
  return heads.length ? Math.min(...heads) : shoulder - Math.abs(average([23, 24]) - shoulder) * .6;
}
export const DIAGNOSTIC_LABELS = {
  missing: 'לא זוהה גוף', coordinates: 'נקודה לא ברורה', visibility: 'נקודה מוסתרת',
  presence: 'זיהוי נקודה חלש', margin: 'נקודה קרובה לשולי התמונה', headroom: 'חסר מקום מעל הראש',
  bodySpan: 'הגוף קטן מדי בתמונה', shoulderWidth: 'הכתפיים צרות מדי בתמונה',
  frontRatio: 'הגוף אינו מול המצלמה', hipWidth: 'האגן צר מדי בתמונה',
  floorView: 'תרגיל הרצפה אינו במבט צד ברור',
};
export const POINT_LABELS = {
  0: 'אף', 7: 'אוזן שמאל', 8: 'אוזן ימין', 11: 'כתף שמאל', 12: 'כתף ימין',
  13: 'מרפק שמאל', 14: 'מרפק ימין', 15: 'כף יד שמאל', 16: 'כף יד ימין',
  23: 'אגן שמאל', 24: 'אגן ימין', 25: 'ברך שמאל', 26: 'ברך ימין',
  27: 'קרסול שמאל', 28: 'קרסול ימין', 29: 'עקב שמאל', 30: 'עקב ימין',
  31: 'אצבעות רגל שמאל', 32: 'אצבעות רגל ימין',
};
// Only failure codes and point IDs leave this function, never coordinates.
// Several failures can occur in one frame; each cause/point is counted once.
export function bodyReport(points, aspect = 1, exercise = 'squats', { movement = false } = {}) {
  const failures = [];
  if (!points || points.length < 33) return { ok: false, failures: [{ reason: 'missing' }], required: requiredPoints(exercise) };
  const floor = FLOOR.includes(exercise);
  // A side view hides the far limbs. Require one COMPLETE confident side,
  // never splice the visible elbow from one side with the hip from the other.
  const sides = [requiredPoints(exercise, 0), requiredPoints(exercise, 1)];
  const quality = ids => Math.min(...ids.map(i => {
    const p = points[i], confidence = i >= 29 ? FRAMING.footConfidence : FRAMING.coreConfidence;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x <= FRAMING.margin || p.x >= 1 - FRAMING.margin ||
      p.y <= FRAMING.margin || p.y >= 1 - FRAMING.margin) return 0;
    return Math.min(p.visibility || 0, p.presence ?? 1) / confidence;
  }));
  const side = quality(sides[0]) >= quality(sides[1]) ? 0 : 1;
  const required = floor ? sides[side] : requiredPoints(exercise);
  for (const i of required) failures.push(...pointFailures(points[i], i));
  if (floor) {
    if (!failures.some(f => f.reason === 'coordinates')) {
      const xs = required.map(i => points[i].x), ys = required.map(i => points[i].y);
      if (!movement && Math.hypot((Math.max(...xs) - Math.min(...xs)) * aspect, Math.max(...ys) - Math.min(...ys)) < FRAMING.bodySpan) {
        failures.push({ reason: 'bodySpan' });
      }
      const s = 11 + side, h = 23 + side;
      if (Math.abs(points[s].x - points[h].x) * aspect < Math.abs(points[s].y - points[h].y) * .5) {
        failures.push({ reason: 'floorView' });
      }
    }
  } else if (!movement && !failures.some(f => f.reason === 'coordinates')) {
    const torso = Math.abs((points[23].y + points[24].y - points[11].y - points[12].y) / 2);
    const head = headY(points);
    const top = head - torso * (exercise === 'full-body' ? .2 : FRAMING.headroom);
    const span = Math.max(points[27].y, points[28].y) - head;
    const shoulder = Math.abs(points[11].x - points[12].x);
    // Head clearance is setup guidance; it must not discard a squat/jack frame.
    if (['placement', 'full-body'].includes(exercise) && !(top > FRAMING.margin)) failures.push({ reason: 'headroom' });
    if (!(span >= (exercise === 'full-body' ? .4 : FRAMING.bodySpan))) failures.push({ reason: 'bodySpan' });
    if (shoulder < (exercise === 'full-body' ? .06 : FRAMING.shoulderWidth)) failures.push({ reason: 'shoulderWidth' });
    if (!(torso > 0 && Number.isFinite(aspect) && aspect > 0 && shoulder * aspect / torso >= .45)) {
      failures.push({ reason: 'frontRatio' });
    }
    if (Math.abs(points[23].x - points[24].x) < (exercise === 'full-body' ? .025 : FRAMING.hipWidth)) failures.push({ reason: 'hipWidth' });
  }
  return { ok: failures.length === 0, failures, side, required };
}
export function fullBody(points, aspect = 1) {
  // Compatibility utility for the original all-landmarks regressions.
  // Runtime setup/counting use bodyReport with their explicit purpose.
  return bodyReport(points, aspect, 'full-body').ok;
}
export function features(points, world, aspect = 1, report = bodyReport(points, aspect)) {
  if (!report.ok) return null;
  const p = points;
  const span = Math.max(p[27]?.y ?? 0, p[28]?.y ?? 0) - headY(p);
  const shoulder = Math.abs((p[11]?.x ?? 0) - (p[12]?.x ?? 0));
  const hip = Math.abs((p[23]?.x ?? 0) - (p[24]?.x ?? 0));
  // World points preserve squat flexion in a front view; image-space knee angles do not.
  const usableWorld = world?.length >= 33 && [23, 24, 25, 26, 27, 28].every(i =>
    world[i] && ['x', 'y', 'z'].every(k => Number.isFinite(world[i][k])));
  const kneeAngles = usableWorld ? [angle(world[23], world[25], world[27]), angle(world[24], world[26], world[28])] : [];
  const depthDifference = usableWorld ? (world[27].z - world[23].z) - (world[28].z - world[24].z) : null;
  const ankleWidth = Math.abs((p[27]?.x ?? 0) - (p[28]?.x ?? 0));
  const kneeWidth = Math.abs((p[25]?.x ?? 0) - (p[26]?.x ?? 0));
  const [s, e, w, h, k, a] = report.side === 1 ? [12, 14, 16, 24, 26, 28] : [11, 13, 15, 23, 25, 27];
  const worldAngle = ids => world?.length >= 33 && ids.every(i => world[i] && ['x', 'y', 'z'].every(key => Number.isFinite(world[i][key]))) ?
    angle(...ids.map(i => world[i])) : NaN;
  const finite = n => Number.isFinite(n) ? n : null;
  const torsoLength = Math.hypot((p[s].x - p[h].x) * aspect, p[s].y - p[h].y);
  const lineY = p[k] && p[k].x !== p[s].x ? p[s].y + (p[k].y - p[s].y) * (p[h].x - p[s].x) / (p[k].x - p[s].x) : p[h].y;
  const torsoWorld = [11, 12, 23, 24].every(i => world?.[i] && ['x', 'y', 'z'].every(key => Number.isFinite(world[i][key])));
  const torsoDelta = key => world[11][key] + world[12][key] - world[23][key] - world[24][key];
  const arms = [[11, 13, 15], [12, 14, 16]].map(([s, e, w]) => {
    if (!p[s] || !Number.isFinite(p[s].y)) return { up: false, down: false, rise: 0 };
    const torso = Math.abs((p[23]?.y ?? p[h].y) - p[s]?.y);
    if (!pointFailures(p[w], w).length) return { up: p[w].y < headY(p),
      down: p[w].y >= p[s].y - span * .015, rise: (p[s].y - p[w].y) / span };
    if (!pointFailures(p[e], e).length) return { up: p[e].y < p[s].y - torso * .25,
      down: p[e].y > p[s].y + torso * .15, rise: (p[s].y - p[e].y) / span };
    return { up: false, down: false, rise: 0 };
  });
  return {
    squat: kneeAngles.length && kneeAngles.every(Number.isFinite) ? Math.max(...kneeAngles) : null,
    lunge: kneeAngles.length && kneeAngles.every(Number.isFinite) ? Math.min(...kneeAngles) : null,
    lungeDepthDifference: depthDifference,
    leftKnee: kneeAngles[0] ?? null, rightKnee: kneeAngles[1] ?? null,
    elbow: finite(worldAngle([s, e, w])),
    bodyLine: finite(worldAngle([s, h, a])), kneeBodyLine: finite(worldAngle([s, h, k])),
    bridge: finite(worldAngle([s, h, k])),
    arch: torsoLength > 0 ? (lineY - p[h].y) / torsoLength : 0,
    lean: torsoWorld ? Math.hypot(torsoDelta('x'), torsoDelta('z')) / Math.max(.001, Math.abs(torsoDelta('y'))) : null,
    kneeIn: ankleWidth > hip * .85 && kneeWidth < ankleWidth * .60 && kneeWidth < hip * .85,
    feet: shoulder ? ankleWidth / shoulder : 0,
    armsUp: arms.every(a => a.up),
    // Relaxed arms need not touch the torso; allow 1.5% of body span above shoulders.
    armsDown: arms.every(a => a.down),
    wristRise: Math.min(...arms.map(a => a.rise)),
    leftRise: span > 0 && p[25] ? (p[23].y - p[25].y) / span : 0,
    rightRise: span > 0 && p[26] ? (p[24].y - p[26].y) / span : 0,
  };
}

// The start button and counter use the SAME exercise-specific rest condition.
export function atRest(exercise, f, t) {
  if (!f) return false;
  if (exercise === 'squats') return f.squat != null && f.squat > t.squatUp;
  if (exercise === 'jumping-jacks') return f.feet < t.jackClosed && f.armsDown;
  if (exercise === 'lunges') return f.lunge != null && f.lunge > t.lungeUp;
  if (exercise === 'push-ups' || exercise === 'knee-push-ups') return f.elbow != null && f.elbow > t.pushUp;
  if (exercise === 'glute-bridge') return f.bridge != null && f.bridge < t.bridgeDown;
  return Math.max(f.leftRise, f.rightRise) < t.kneeRest;
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
    this.ended = false;
    this.diagnostics = { frames: 0, fullBodyPassed: 0, fullBodyFailed: 0,
      failureFrames: Object.fromEntries(Object.keys(DIAGNOSTIC_LABELS).map(k => [k, 0])), failedPoints: {},
      requiredPointFrames: {}, requiredPointPassed: {},
      rejectedBy: { framing: 0, motionThreshold: 0, tracking: 0, other: 0 },
      worldMissingFrames: 0, phaseMs: { waiting: 0, armed: 0, moving: 0 },
      idleTrackingResets: 0, trackingResets: 0, graceRecoveries: 0,
      cyclesStarted: 0, restFrames: 0, startFrames: 0, targetFrames: 0 };
    this.reset(); if (armed) this.phase = 'armed';
    this.status = this.phase;
  }
  reset() {
    this.phase = 'waiting'; this.smoothed = null; this.restSince = null;
    this.targetSince = null; this.kneeSince = null; this.formSince = null; this.cycle = null;
  }
  reject(reason) {
    this.rejected++; this.reasons[reason] = (this.reasons[reason] || 0) + 1;
    this.diagnostics.rejectedBy[reason === 'framing' ? 'framing' : reason === 'partial' ? 'motionThreshold' :
      reason === 'tracking' ? 'tracking' : 'other']++;
    return { type: 'rejected', reason };
  }
  snapshot() {
    const d = this.diagnostics;
    return { ...structuredClone(d), fullBodyPercent: d.frames ? 100 * d.fullBodyPassed / d.frames : 0,
      requiredPointPercent: Object.fromEntries(Object.keys(d.requiredPointFrames).map(i =>
        [i, 100 * (d.requiredPointPassed[i] || 0) / d.requiredPointFrames[i]])) };
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
    const event = this.cycle ? this.reject(reason) : null;
    if (!this.cycle) this.diagnostics.idleTrackingResets++;
    this.reset(); this.lossReset = true; return event;
  }
  update(points, world, time, aspect = 1) {
    if (this.ended || !Number.isFinite(time) || (this.lastTime != null && time <= this.lastTime)) return null;
    const gap = this.lastTime == null ? 0 : time - this.lastTime;
    this.diagnostics.phaseMs[this.phase] += gap;
    this.lastTime = time;
    let event = null;
    if (gap > this.t.maxGap && !this.lossReset) event = this.resetTracking();
    // Apparent size/front projection can shrink during a squat. Placement and
    // rearming check geometry; an armed cycle requires its actual joints only.
    const report = bodyReport(points, aspect, this.exercise, { movement: this.phase !== 'waiting' });
    const d = this.diagnostics;
    d.frames++; if (report.ok) d.fullBodyPassed++; else d.fullBodyFailed++;
    for (const i of report.required) {
      d.requiredPointFrames[i] = (d.requiredPointFrames[i] || 0) + 1;
      if (!pointFailures(points?.[i], i).length) d.requiredPointPassed[i] = (d.requiredPointPassed[i] || 0) + 1;
    }
    for (const reason of new Set(report.failures.map(f => f.reason))) d.failureFrames[reason]++;
    for (const { reason, point } of report.failures) {
      if (point == null) continue;
      d.failedPoints[reason] ??= {};
      d.failedPoints[reason][point] = (d.failedPoints[reason][point] || 0) + 1;
    }
    const raw = features(points, world, aspect, report);
    const worldMissing = report.ok && worldRequired(this.exercise, raw);
    if (worldMissing) d.worldMissingFrames++;
    if (!raw || worldMissing) {
      this.lostSince ??= this.lastGoodTime ?? time;
      // Keep the outage cause for the first good frame after a long dropout.
      this.lossReason = report.ok || report.failures.some(f => f.reason === 'missing') ? 'tracking' : 'framing';
      if (time - this.lostSince > this.t.trackingGrace && !this.lossReset) event = this.resetTracking(this.lossReason);
      this.status = statusCode(report, this.phase, worldMissing);
      return event || { type: 'tracking' };
    }
    if (this.lostSince != null) {
      const lostMs = time - this.lostSince;
      if (lostMs > this.t.trackingGrace && !this.lossReset) event = this.resetTracking(this.lossReason);
      if (!this.lossReset) {
        // Unknown frames preserve state but never satisfy dwell/minimum cycle time.
        for (const key of ['restSince', 'targetSince', 'kneeSince', 'formSince']) if (this[key] != null) this[key] += lostMs;
        if (this.cycle) this.cycle.since += lostMs;
        d.graceRecoveries++;
      }
    }
    this.lostSince = null; this.lossReset = false; this.lastGoodTime = time;
    const k = 1 - Math.exp(-Math.min(gap || 50, 150) / this.t.smoothing);
    if (!this.smoothed) this.smoothed = { ...raw };
    else for (const key of ['squat', 'lunge', 'elbow', 'bridge', 'feet', 'wristRise', 'leftRise', 'rightRise']) {
      if (raw[key] != null) this.smoothed[key] += k * (raw[key] - this.smoothed[key]);
    }
    const f = { ...raw, ...this.smoothed, armsUp: raw.armsUp, armsDown: raw.armsDown, kneeIn: raw.kneeIn };
    const t = this.t;
    const side = this.exercise === 'lunges' ? raw.lungeDepthDifference < -t.lungeDepth ? 'left' :
      raw.lungeDepthDifference > t.lungeDepth ? 'right' : null : f.leftRise >= f.rightRise ? 'left' : 'right';
    const alternating = ['high-knees', 'lunges'].includes(this.exercise);
    const rise = Math.max(f.leftRise, f.rightRise);
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
      target = rise > t.kneeRise && Math.min(f.leftRise, f.rightRise) < t.kneeRest;
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
