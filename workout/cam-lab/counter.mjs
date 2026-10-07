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
  return { squatDown: age <= 8 ? 125 : 120, squatStart: 150, squatUp: 163,
    kneeRise: clamp((age <= 8 ? 12 : 14) / height, .07, .16),
    kneeStart: .045, kneeRest: .025, jackOpen: 1.8, jackStart: 1.35, jackClosed: 1.2,
    wristMargin: 4 / height, dwell: age <= 8 ? 150 : 120, minCycle: 350,
    maxCycle: 8000, maxGap: 450, smoothing: 80, valgusHold: 200 };
}
const BODY = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
export function fullBody(points) {
  if (!points || points.length < 33) return false;
  if (!BODY.every(i => {
    const p = points[i];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.visibility >= .65 &&
      (p.presence == null || p.presence >= .65) && p.x > .025 && p.x < .975 && p.y > .025 && p.y < .975;
  })) return false;
  // Nose alone is insufficient: leave room above the ears for the top of the head.
  const torso = Math.abs((points[23].y + points[24].y - points[11].y - points[12].y) / 2);
  const top = Math.min(points[0].y, points[7].y, points[8].y) - torso * .3;
  const bottom = Math.max(...[27, 28, 29, 30, 31, 32].map(i => points[i].y));
  return top > .025 && bottom - top > .4;
}
export function features(points, world, aspect = 1) {
  if (!fullBody(points)) return null;
  const p = points;
  const span = Math.max(p[27].y, p[28].y) - Math.min(p[0].y, p[7].y, p[8].y);
  const shoulder = Math.abs(p[11].x - p[12].x);
  const hip = Math.abs(p[23].x - p[24].x);
  const torso = Math.abs((p[23].y + p[24].y - p[11].y - p[12].y) / 2);
  if (shoulder < .06 || shoulder * aspect / torso < .45 || hip < .025 || span < .4) return null;
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
    armsDown: p[15].y > p[11].y && p[16].y > p[12].y,
    wristRise: Math.min(p[11].y - p[15].y, p[12].y - p[16].y) / span,
    leftRise: (p[23].y - p[25].y) / span,
    rightRise: (p[24].y - p[26].y) / span,
  };
}

export class RepCounter {
  constructor(exercise, profile) {
    if (!EXERCISES.includes(exercise)) throw new RangeError('תרגיל לא מוכר');
    this.exercise = exercise; this.t = thresholds(profile);
    this.count = 0; this.rejected = 0; this.reasons = {}; this.lastSide = null;
    this.lastTime = null; this.reset();
  }
  reset() {
    this.phase = 'waiting'; this.smoothed = null; this.restSince = null;
    this.targetSince = null; this.kneeSince = null; this.cycle = null;
  }
  reject(reason) {
    this.rejected++; this.reasons[reason] = (this.reasons[reason] || 0) + 1;
    return { type: 'rejected', reason };
  }
  finish() {
    const event = this.cycle ? this.reject('unfinished') : null;
    this.reset(); return event;
  }
  update(points, world, time, aspect = 1) {
    if (!Number.isFinite(time) || (this.lastTime != null && time <= this.lastTime)) return null;
    const gap = this.lastTime == null ? 0 : time - this.lastTime;
    this.lastTime = time;
    let event = null;
    if (gap > this.t.maxGap) {
      if (this.cycle) event = this.reject('tracking');
      this.reset();
    }
    const raw = features(points, world, aspect);
    if (!raw || (this.exercise === 'squats' && raw.squat == null)) {
      if (this.cycle) event = this.reject('tracking');
      this.reset(); return event || { type: 'tracking' };
    }
    const k = 1 - Math.exp(-Math.min(gap || 50, 150) / this.t.smoothing);
    if (!this.smoothed) this.smoothed = { ...raw };
    else for (const key of ['squat', 'feet', 'wristRise', 'leftRise', 'rightRise']) {
      if (raw[key] != null) this.smoothed[key] += k * (raw[key] - this.smoothed[key]);
    }
    const f = { ...raw, ...this.smoothed, armsUp: raw.armsUp, armsDown: raw.armsDown, kneeIn: raw.kneeIn };
    const t = this.t;
    const side = f.leftRise >= f.rightRise ? 'left' : 'right';
    const rise = Math.max(f.leftRise, f.rightRise);
    let rest, start, target;
    if (this.exercise === 'squats') {
      rest = f.squat > t.squatUp; start = f.squat < t.squatStart; target = f.squat <= t.squatDown;
    } else if (this.exercise === 'jumping-jacks') {
      rest = f.feet < t.jackClosed && f.armsDown;
      start = f.feet > t.jackStart || f.wristRise > t.wristMargin;
      target = f.feet > t.jackOpen && f.armsUp;
    } else {
      rest = rise < t.kneeRest; start = rise > t.kneeStart;
      target = rise > t.kneeRise && Math.min(f.leftRise, f.rightRise) < t.kneeRest;
    }
    if (!this.cycle) {
      if (rest) {
        this.restSince ??= time;
        if (time - this.restSince >= t.dwell) this.phase = 'armed';
      } else {
        this.restSince = null;
        if (this.phase === 'armed' && start) {
          this.cycle = { since: time, reached: false, kneeIn: false, side };
          this.phase = 'moving';
        }
      }
      return event;
    }
    if (time - this.cycle.since > t.maxCycle) {
      event = this.reject('timeout'); this.reset(); return event;
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
    return event;
  }
}
