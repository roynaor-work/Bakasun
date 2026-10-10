import { atRest, DIAGNOSTIC_LABELS, POINT_LABELS } from './counter.mjs';

export const STATUS = {
  side: ['בתרגיל רצפה עוברים למבט צד, כך שרואים את אורך הגוף', 'בְּתַרְגִּיל רִצְפָּה עוֹבְרִים לְמַבָּט צַד, כָּךְ שֶׁרוֹאִים אֶת אֹרֶךְ הַגּוּף.'],
  far: ['המכשיר רחוק מדי — קרבו אותו עד שכל הגוף ברור ונשאר בתוך התמונה', 'הַמַּכְשִׁיר רָחוֹק מִדַּי. קָרְבוּ אוֹתוֹ עַד שֶׁכָּל הַגּוּף בָּרוּר וְנִשְׁאָר בַּתְּמוּנָה.'],
  tilt: ['המכשיר נטוי לצד — ישרו אותו ועמדו זקוף לבדיקה', 'הַמַּכְשִׁיר נָטוּי לַצַּד. יַשְּׁרוּ אוֹתוֹ וְעִמְדוּ זָקוּף לַבְּדִיקָה.'],
  pair: ['אבא ואני: עמדו זקוף זה לצד זה, באותו מרחק; צריך הבדל גובה ברור', 'עִמְדוּ זָקוּף זֶה לְצַד זֶה, בְּאוֹתוֹ מֶרְחָק מֵהַמַּצְלֵמָה. צָרִיךְ הֶבְדֵּל גֹּבַהּ בָּרוּר.'],
  ambiguous: ['האנשים חופפים או הזהות לא ברורה — התרחקו מעט זה מזה; הספירה נעצרה', 'הַזֶּהוּת לֹא בְּרוּרָה. הִתְרַחֲקוּ מְעַט זֶה מִזֶּה. הַסְּפִירָה נֶעֶצְרָה.'],
  'missing-person': ['אחד המשתתפים חסר — רק המונה שלו נעצר; חזרו לעמדת ההתחלה', 'אֶחָד הַמִּשְׁתַּתְּפִים חָסֵר. הַמּוֹנֶה שֶׁלּוֹ נֶעֱצַר. חִזְרוּ לְעֶמְדַת הַהַתְחָלָה.'],
  'stand-placement': ['קודם עומדים מול המצלמה לבדיקת הצבה, ואז עוברים לתרגיל במבט צד', 'קֹדֶם עוֹמְדִים מוּל הַמַּצְלֵמָה, וְאָז עוֹבְרִים לַתַּרְגִּיל בְּמַבָּט צַד.'],
  'floor-rest': ['עברו לעמדת ההתחלה של תרגיל הרצפה במבט צד', 'עִבְרוּ לְעֶמְדַת הַהַתְחָלָה שֶׁל תַּרְגִּיל הָרִצְפָּה בְּמַבָּט צַד.'],
  legs: ['לא רואה את הרגליים', 'לֹא רוֹאֶה אֶת הָרַגְלַיִם.'],
  head: ['לא רואה את הראש', 'לֹא רוֹאֶה אֶת הָרֹאשׁ.'],
  hands: ['לא רואה את הידיים', 'לֹא רוֹאֶה אֶת הַיָּדַיִם.'],
  front: ['תעמוד מול המצלמה', 'תַּעֲמֹד מוּל הַמַּצְלֵמָה.'],
  body: ['לא רואה את כל הגוף', 'לֹא רוֹאֶה אֶת כָּל הַגּוּף.'],
  world: ['לא מזהה את זוויות המפרקים', 'לֹא מְזַהֶה אֶת זָוִיּוֹת הַמִּפְרָקִים.'],
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
    d.frames ? `נקודות החובה במסגרת עברו ב־${d.fullBodyPercent.toFixed(1)}% מהפריימים (${d.fullBodyPassed} מתוך ${d.frames})` : 'לא התקבלו פריימים בזמן הספירה',
    `חזרות שנפסלו בגלל מסגרת/נקודות חובה: ${d.rejectedBy.framing} · תנועה שלא הגיעה לסף: ${d.rejectedBy.motionThreshold} · אובדן זיהוי/זוויות: ${d.rejectedBy.tracking} · סיבות אחרות: ${d.rejectedBy.other}`,
    `זמן המתנה לעמידה: ${(d.phaseMs.waiting / 1000).toFixed(1)} שניות · מוכן לתנועה: ${(d.phaseMs.armed / 1000).toFixed(1)} שניות · באמצע תנועה: ${(d.phaseMs.moving / 1000).toFixed(1)} שניות`,
    `מחזורים שהתחילו: ${d.cyclesStarted} · איפוסים בגלל אובדן זיהוי לפני מחזור: ${d.idleTrackingResets}`,
    `פריימים בעמידת התחלה: ${d.restFrames} · בתחילת תנועה: ${d.startFrames} · ביעד: ${d.targetFrames}`,
    `אובדני זיהוי קצרים שמהם חזרנו: ${d.graceRecoveries} · איפוסי זיהוי בסך הכול: ${d.trackingResets}`,
    `פריימים ללא זוויות התרגיל בעולם: ${d.worldMissingFrames}`,
  ];
  const frequent = Object.entries({ ...d.failureFrames, world: d.worldMissingFrames }).sort((a, b) => b[1] - a[1])[0];
  lines.push(frequent?.[1] ? `הסיבה הנפוצה להמתנה: ${DIAGNOSTIC_LABELS[frequent[0]] || 'זוויות לא ברורות'} — ${frequent[1]} פריימים` : 'כשל מסגרת/זיהוי: 0 פריימים');
  if (d.frames && !d.startFrames) lines.push('פריימים שעברו את סף תחילת התנועה: 0; לא זוהתה תחילת חזרה');
  for (const [id, percent] of Object.entries(d.requiredPointPercent)) {
    lines.push(`${POINT_LABELS[id]} — עברה ב־${percent.toFixed(1)}% (${d.requiredPointPassed[id] || 0}/${d.requiredPointFrames[id]})`);
  }
  for (const [reason, count] of Object.entries(d.failureFrames)) {
    if (!count) continue;
    const points = Object.entries(d.failedPoints[reason] || {}).map(([id, n]) => `${POINT_LABELS[id]}: ${n}`).join(', ');
    lines.push(`${DIAGNOSTIC_LABELS[reason]} — ${count} פריימים${points ? ` (${points})` : ''}`);
  }
  return lines;
}
