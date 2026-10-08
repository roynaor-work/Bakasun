// Pure, deterministic pose logic. Nothing here records images or writes storage.
export const EXERCISES = ['squats', 'jumping-jacks', 'high-knees'];
export const REASONS = {
  partial: 'טווח התנועה היה חלקי',
  knees: 'הברכיים התקרבו פנימה לאורך התנועה',
  fast: 'התנועה הייתה קצרה מכדי לזהות מחזור ברור',
  tracking: 'הגוף הוסתר או הזיהוי לא היה ברור',
  timeout: 'לא זוהתה חזרה לעמדת ההתחלה',
  alternate: 'לא זוהתה החלפה לרגל השנייה',
  unfinished: 'התנועה הייתה עדיין באמצע בסיום',
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
    maxCycle: 8000, maxGap: 450, trackingGrace: 300, smoothing: 80, valgusHold: 200 };
}
const BODY = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
// Feet are small and often occluded by each other. Keep confident ankles, but
// accept weaker heel/toe confidence. A separate grace period handles flicker.
export const FRAMING = { coreConfidence: .65, footConfidence: .35, margin: .01, headroom: .2 };
export const DIAGNOSTIC_LABELS = {
  missing: 'לא זוהה גוף', coordinates: 'נקודה לא ברורה', visibility: 'נקודה מוסתרת',
  presence: 'זיהוי נקודה חלש', margin: 'נקודה קרובה לשולי התמונה', headroom: 'חסר מקום מעל הראש',
  bodySpan: 'הגוף קטן מדי בתמונה', shoulderWidth: 'הכתפיים צרות מדי בתמונה',
  frontRatio: 'הגוף אינו מול המצלמה', hipWidth: 'האגן צר מדי בתמונה',
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
export function bodyReport(points, aspect = 1) {
  const failures = [];
  if (!points || points.length < 33) return { ok: false, failures: [{ reason: 'missing' }] };
  for (const i of BODY) {
    const p = points[i], confidence = i >= 29 ? FRAMING.footConfidence : FRAMING.coreConfidence;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      failures.push({ reason: 'coordinates', point: i }); continue;
    }
    if (!(p.visibility >= confidence)) failures.push({ reason: 'visibility', point: i });
    if (p.presence != null && !(p.presence >= confidence)) failures.push({ reason: 'presence', point: i });
    if (!(p.x > FRAMING.margin && p.x < 1 - FRAMING.margin && p.y > FRAMING.margin && p.y < 1 - FRAMING.margin)) {
      failures.push({ reason: 'margin', point: i });
    }
  }
  if (!failures.some(f => f.reason === 'coordinates')) {
    const torso = Math.abs((points[23].y + points[24].y - points[11].y - points[12].y) / 2);
    const head = Math.min(points[0].y, points[7].y, points[8].y);
    const top = head - torso * FRAMING.headroom;
    const span = Math.max(points[27].y, points[28].y) - head;
    const shoulder = Math.abs(points[11].x - points[12].x);
    if (!(top > FRAMING.margin)) failures.push({ reason: 'headroom' });
    if (!(span >= .4)) failures.push({ reason: 'bodySpan' });
    if (shoulder < .06) failures.push({ reason: 'shoulderWidth' });
    if (!(torso > 0 && Number.isFinite(aspect) && aspect > 0 && shoulder * aspect / torso >= .45)) {
      failures.push({ reason: 'frontRatio' });
    }
    if (Math.abs(points[23].x - points[24].x) < .025) failures.push({ reason: 'hipWidth' });
  }
  return { ok: failures.length === 0, failures };
}
export function fullBody(points, aspect = 1) {
  return bodyReport(points, aspect).ok;
}
export function features(points, world, aspect = 1, report = bodyReport(points, aspect)) {
  if (!report.ok) return null;
  const p = points;
  const span = Math.max(p[27].y, p[28].y) - Math.min(p[0].y, p[7].y, p[8].y);
  const shoulder = Math.abs(p[11].x - p[12].x);
  const hip = Math.abs(p[23].x - p[24].x);
  // World points preserve squat flexion in a front view; image-space knee angles do not.
  const usableWorld = world?.length >= 33 && [23, 24, 25, 26, 27, 28].every(i =>
    world[i] && ['x', 'y', 'z'].every(k => Number.isFinite(world[i][k])));
  const kneeAngles = usableWorld ? [angle(world[23], world[25], world[27]), angle(world[24], world[26], world[28])] : [];
  const ankleWidth = Math.abs(p[27].x - p[28].x);
  const kneeWidth = Math.abs(p[25].x - p[26].x);
  return {
    squat: kneeAngles.length && kneeAngles.every(Number.isFinite) ? Math.max(...kneeAngles) : null,
    kneeIn: ankleWidth > hip * .85 && kneeWidth < ankleWidth * .60 && kneeWidth < hip * .85,
    feet: ankleWidth / shoulder,
    armsUp: p[15].y < p[0].y && p[16].y < p[0].y,
    // Relaxed arms need not touch the torso; allow 1.5% of body span above shoulders.
    armsDown: p[15].y >= p[11].y - span * .015 && p[16].y >= p[12].y - span * .015,
    wristRise: Math.min(p[11].y - p[15].y, p[12].y - p[16].y) / span,
    leftRise: (p[23].y - p[25].y) / span,
    rightRise: (p[24].y - p[26].y) / span,
  };
}

// The start button and counter use the SAME exercise-specific rest condition.
export function atRest(exercise, f, t) {
  if (!f) return false;
  if (exercise === 'squats') return f.squat != null && f.squat > t.squatUp;
  if (exercise === 'jumping-jacks') return f.feet < t.jackClosed && f.armsDown;
  return Math.max(f.leftRise, f.rightRise) < t.kneeRest;
}
export function statusCode(report, phase, worldMissing = false) {
  if (!report.ok) {
    if (report.failures.some(f => f.point >= 23)) return 'legs';
    if (report.failures.some(f => [0, 7, 8].includes(f.point) || f.reason === 'headroom')) return 'head';
    if (report.failures.some(f => [13, 14, 15, 16].includes(f.point))) return 'hands';
    if (report.failures.some(f => ['frontRatio', 'shoulderWidth', 'hipWidth'].includes(f.reason))) return 'front';
    return 'body';
  }
  if (worldMissing) return 'world';
  return phase;
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
      worldMissingFrames: 0, phaseMs: { waiting: 0, armed: 0, moving: 0 },
      idleTrackingResets: 0, trackingResets: 0, graceRecoveries: 0,
      cyclesStarted: 0, restFrames: 0, startFrames: 0, targetFrames: 0 };
    this.reset(); if (armed) this.phase = 'armed';
    this.status = this.phase;
  }
  reset() {
    this.phase = 'waiting'; this.smoothed = null; this.restSince = null;
    this.targetSince = null; this.kneeSince = null; this.cycle = null;
  }
  reject(reason) {
    this.rejected++; this.reasons[reason] = (this.reasons[reason] || 0) + 1;
    return { type: 'rejected', reason };
  }
  snapshot() {
    return { ...structuredClone(this.diagnostics), fullBodyPercent: this.diagnostics.frames ?
      100 * this.diagnostics.fullBodyPassed / this.diagnostics.frames : 0 };
  }
  finish(time = this.lastTime) {
    if (this.ended) return null;
    if (this.lastTime != null && Number.isFinite(time) && time > this.lastTime) {
      this.diagnostics.phaseMs[this.phase] += time - this.lastTime; this.lastTime = time;
    }
    const event = this.cycle ? this.reject('unfinished') : null;
    this.reset(); this.ended = true; return event;
  }
  resetTracking() {
    this.diagnostics.trackingResets++;
    const event = this.cycle ? this.reject('tracking') : null;
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
    const report = bodyReport(points, aspect);
    const d = this.diagnostics;
    d.frames++; if (report.ok) d.fullBodyPassed++; else d.fullBodyFailed++;
    for (const reason of new Set(report.failures.map(f => f.reason))) d.failureFrames[reason]++;
    for (const { reason, point } of report.failures) {
      if (point == null) continue;
      d.failedPoints[reason] ??= {};
      d.failedPoints[reason][point] = (d.failedPoints[reason][point] || 0) + 1;
    }
    const raw = features(points, world, aspect, report);
    const worldMissing = report.ok && this.exercise === 'squats' && raw.squat == null;
    if (worldMissing) d.worldMissingFrames++;
    if (!raw || (this.exercise === 'squats' && raw.squat == null)) {
      this.lostSince ??= this.lastGoodTime ?? time;
      if (time - this.lostSince > this.t.trackingGrace && !this.lossReset) event = this.resetTracking();
      this.status = statusCode(report, this.phase, worldMissing);
      return event || { type: 'tracking' };
    }
    if (this.lostSince != null) {
      const lostMs = time - this.lostSince;
      if (lostMs > this.t.trackingGrace && !this.lossReset) event = this.resetTracking();
      if (!this.lossReset) {
        // Unknown frames preserve state but never satisfy dwell/minimum cycle time.
        for (const key of ['restSince', 'targetSince', 'kneeSince']) if (this[key] != null) this[key] += lostMs;
        if (this.cycle) this.cycle.since += lostMs;
        d.graceRecoveries++;
      }
    }
    this.lostSince = null; this.lossReset = false; this.lastGoodTime = time;
    const k = 1 - Math.exp(-Math.min(gap || 50, 150) / this.t.smoothing);
    if (!this.smoothed) this.smoothed = { ...raw };
    else for (const key of ['squat', 'feet', 'wristRise', 'leftRise', 'rightRise']) {
      if (raw[key] != null) this.smoothed[key] += k * (raw[key] - this.smoothed[key]);
    }
    const f = { ...raw, ...this.smoothed, armsUp: raw.armsUp, armsDown: raw.armsDown, kneeIn: raw.kneeIn };
    const t = this.t;
    const side = f.leftRise >= f.rightRise ? 'left' : 'right';
    const rise = Math.max(f.leftRise, f.rightRise);
    const rest = atRest(this.exercise, f, t);
    let start, target;
    if (this.exercise === 'squats') {
      start = f.squat < t.squatStart; target = f.squat <= t.squatDown;
    } else if (this.exercise === 'jumping-jacks') {
      start = f.feet > t.jackStart || f.wristRise > t.wristMargin;
      target = f.feet > t.jackOpen && f.armsUp;
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
          this.cycle = { since: time, reached: false, kneeIn: false, side };
          this.phase = 'moving'; d.cyclesStarted++;
        }
      }
      this.status = this.phase; return event;
    }
    if (time - this.cycle.since > t.maxCycle) {
      event = this.reject('timeout'); this.reset(); this.status = this.phase; return event;
    }
    if (target && (this.exercise !== 'high-knees' || side === this.cycle.side)) {
      this.targetSince ??= time;
      if (time - this.targetSince >= t.dwell) this.cycle.reached = true;
    } else this.targetSince = null;
    if (this.exercise === 'squats' && f.squat < t.squatStart && f.kneeIn) {
      this.kneeSince ??= time;
      if (time - this.kneeSince >= t.valgusHold) this.cycle.kneeIn = true;
    } else this.kneeSince = null;
    if (rest) {
      this.restSince ??= time;
      if (time - this.restSince >= t.dwell) {
        const c = this.cycle;
        const reason = time - c.since < t.minCycle ? 'fast' : c.kneeIn ? 'knees' : !c.reached ? 'partial' :
          this.exercise === 'high-knees' && c.side === this.lastSide ? 'alternate' : null;
        if (reason) event = this.reject(reason);
        else { this.count++; event = { type: 'counted', count: this.count }; }
        if (this.exercise === 'high-knees' && c.reached) this.lastSide = c.side;
        this.reset(); this.phase = 'armed'; this.restSince = time;
      }
    } else this.restSince = null;
    this.status = this.phase; return event;
  }
}
