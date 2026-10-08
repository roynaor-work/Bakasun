import { atRest, DIAGNOSTIC_LABELS, POINT_LABELS } from './counter.mjs';

export const STATUS = {
  legs: ['לא רואה את הרגליים', 'לֹא רוֹאֶה אֶת הָרַגְלַיִם.'],
  head: ['לא רואה את הראש', 'לֹא רוֹאֶה אֶת הָרֹאשׁ.'],
  hands: ['לא רואה את הידיים', 'לֹא רוֹאֶה אֶת הַיָּדַיִם.'],
  front: ['תעמוד מול המצלמה', 'תַּעֲמֹד מוּל הַמַּצְלֵמָה.'],
  body: ['לא רואה את כל הגוף', 'לֹא רוֹאֶה אֶת כָּל הַגּוּף.'],
  world: ['לא מזהה את כיפוף הברכיים', 'לֹא מְזַהֶה אֶת כִּפּוּף הַבִּרְכַּיִם.'],
  waiting: ['תעמוד ישר כדי להתחיל', 'תַּעֲמֹד יָשָׁר כְּדֵי לְהַתְחִיל.'],
  armed: ['מוכן, אפשר להתחיל', 'מוּכָן, אֶפְשָׁר לְהַתְחִיל.'],
  moving: ['יפה, עכשיו חוזרים לעמידה', 'יָפֶה, עַכְשָׁו חוֹזְרִים לַעֲמִידָה.'],
};

export class StatusLine {
  constructor() { this.code = null; this.lastChange = -Infinity; }
  update(code, time) {
    if (code === this.code || time - this.lastChange < 1000) return null;
    this.code = code; this.lastChange = time;
    return STATUS[code];
  }
}

// Calibration keeps its progress through brief unknown frames, without crediting
// that unknown time as standing. A visible non-rest pose restarts calibration.
export class RestGate {
  constructor(exercise, thresholds) {
    this.exercise = exercise; this.t = thresholds;
    this.since = null; this.lastRest = null; this.lostSince = null;
  }
  update(f, time) {
    if (this.lastRest != null && time - this.lastRest > this.t.maxGap) this.since = null;
    if (!f) {
      this.lostSince ??= this.lastRest ?? time;
      if (time - this.lostSince > this.t.trackingGrace) this.since = null;
      return false;
    }
    if (this.lostSince != null) {
      if (time - this.lostSince > this.t.trackingGrace) this.since = null;
      else if (this.since != null) this.since += time - this.lostSince;
      this.lostSince = null;
    }
    if (!atRest(this.exercise, f, this.t)) { this.since = null; return false; }
    this.lastRest = time; this.since ??= time;
    return time - this.since >= 1200;
  }
}

export function diagnosticLines(d) {
  const lines = [
    d.frames ? `כל הגוף היה ברור ב־${d.fullBodyPercent.toFixed(1)}% מהפריימים (${d.fullBodyPassed} מתוך ${d.frames})` : 'לא התקבלו פריימים בזמן הספירה',
    `זמן המתנה לעמידה: ${(d.phaseMs.waiting / 1000).toFixed(1)} שניות · מוכן לתנועה: ${(d.phaseMs.armed / 1000).toFixed(1)} שניות · באמצע תנועה: ${(d.phaseMs.moving / 1000).toFixed(1)} שניות`,
    `מחזורים שהתחילו: ${d.cyclesStarted} · איפוסים בגלל אובדן זיהוי לפני מחזור: ${d.idleTrackingResets}`,
    `פריימים בעמידת התחלה: ${d.restFrames} · בתחילת תנועה: ${d.startFrames} · ביעד: ${d.targetFrames}`,
    `אובדני זיהוי קצרים שמהם חזרנו: ${d.graceRecoveries} · איפוסי זיהוי בסך הכול: ${d.trackingResets}`,
    `פריימים ללא זווית ברך תלת־ממדית ברורה: ${d.worldMissingFrames}`,
  ];
  for (const [reason, count] of Object.entries(d.failureFrames)) {
    if (!count) continue;
    const points = Object.entries(d.failedPoints[reason] || {}).map(([id, n]) => `${POINT_LABELS[id]}: ${n}`).join(', ');
    lines.push(`${DIAGNOSTIC_LABELS[reason]} — ${count} פריימים${points ? ` (${points})` : ''}`);
  }
  return lines;
}
