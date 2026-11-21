// Where to go when the camera does not see the child well. Pure: takes the pose sample of one frame,
// the tracker's status and the exercise's needs, and returns one short instruction, as display text
// and as a vowel-marked reading for the device voice. Nothing is kept beyond the last seen position.
const SEEN = .4;
const NEED = .49;
const EDGE = .03;
const EXIT_MS = 8000;

const PARTS = {
  head: { ids: [0, 7, 8], text: 'הראש לא נראה', say: 'הָרֹאשׁ לֹא נִרְאֶה' },
  shoulders: { ids: [11, 12], text: 'הכתפיים לא נראות', say: 'הַכְּתֵפַיִם לֹא נִרְאוֹת' },
  hands: { ids: [13, 14, 15, 16], text: 'הידיים לא נראות', say: 'הַיָּדַיִם לֹא נִרְאוֹת' },
  hips: { ids: [23, 24], text: 'האגן לא נראה', say: 'הָאַגָּן לֹא נִרְאֶה' },
  knees: { ids: [25, 26], text: 'הברכיים לא נראות', say: 'הַבִּרְכַּיִם לֹא נִרְאוֹת' },
  feet: { ids: [27, 28, 29, 30, 31, 32], text: 'הרגליים לא נראות', say: 'הָרַגְלַיִם לֹא נִרְאוֹת' },
};
const PART_OF = new Map(Object.entries(PARTS).flatMap(([name, part]) => part.ids.map(id => [id, name])));
const WHOLE = { text: 'לא רואים את כל הגוף', say: 'לֹא רוֹאִים אֶת כָּל הַגּוּף' };

const MOVES = {
  left: { text: 'זוז קצת שמאלה', say: 'זוּז קְצָת שְׂמֹאלָה' },
  right: { text: 'זוז קצת ימינה', say: 'זוּז קְצָת יָמִינָה' },
  back: { text: 'זוז קצת אחורה', say: 'זוּז קְצָת אָחוֹרָה' },
  closer: { text: 'התקרב קצת לטלפון', say: 'הִתְקָרֵב קְצָת לַטֵּלֵפוֹן' },
  raise: { text: 'הרם קצת את הטלפון, או זוז אחורה', say: 'הָרֵם קְצָת אֶת הַטֵּלֵפוֹן, אוֹ זוּז אָחוֹרָה' },
  center: { text: 'עמוד באמצע התמונה', say: 'עֲמֹד בְּאֶמְצַע הַתְּמוּנָה' },
  clear: { text: 'בדוק שיש אור ושלא מסתירים אותך', say: 'בְּדֹק שֶׁיֵּשׁ אוֹר וְשֶׁלֹּא מַסְתִּירִים אוֹתְךָ' },
};

const LINES = {
  none: { text: 'המצלמה לא רואה אותך. בוא לעמוד מול הטלפון', say: 'הַמַּצְלֵמָה לֹא רוֹאָה אוֹתְךָ. בּוֹא לַעֲמֹד מוּל הַטֵּלֵפוֹן' },
  exit: { text: 'יצאת מהתמונה', say: 'יָצָאתָ מֵהַתְּמוּנָה' },
  dark: { text: 'חשוך מדי. הדלק אור מלפנים', say: 'חָשׁוּךְ מִדַּי. הַדְלֵק אוֹר מִלְּפָנִים' },
  backlit: { text: 'האור מאחוריך. הסתובב כך שהאור יאיר עליך מלפנים', say: 'הָאוֹר מֵאֲחוֹרֶיךָ. הִסְתּוֹבֵב כָּךְ שֶׁהָאוֹר יָאִיר עָלֶיךָ מִלְּפָנִים' },
  multiple: { text: 'המצלמה רואה יותר מאדם אחד. רק מי שמתאמן נשאר בתמונה', say: 'הַמַּצְלֵמָה רוֹאָה יוֹתֵר מֵאָדָם אֶחָד. רַק מִי שֶׁמִּתְאַמֵּן נִשְׁאָר בַּתְּמוּנָה' },
  'phone-moved': { text: 'הטלפון זז. נכוון שוב', say: 'הַטֵּלֵפוֹן זָז. נְכַוֵּן שׁוּב' },
  tight: { text: 'אין מקום לזוז אחורה? אפשר לסובב את הטלפון, להרחיק אותו, או לבחור תרגיל אחר', say: 'אֵין מָקוֹם לָזוּז אָחוֹרָה? אֶפְשָׁר לְסוֹבֵב אֶת הַטֵּלֵפוֹן, לְהַרְחִיק אוֹתוֹ, אוֹ לִבְחֹר תַּרְגִּיל אַחֵר' },
  'turn-side': { text: 'הסתובב עם הצד אל הטלפון', say: 'הִסְתּוֹבֵב עִם הַצַּד אֶל הַטֵּלֵפוֹן' },
  'face-camera': { text: 'הסתובב עם הפנים אל הטלפון', say: 'הִסְתּוֹבֵב עִם הַפָּנִים אֶל הַטֵּלֵפוֹן' },
  calibrating: { text: 'הישאר רגע בלי לזוז', say: 'הִשָּׁאֵר רֶגַע בְּלִי לָזוּז' },
  reacquiring: { text: 'זזת מהר. חזור לתנוחת ההתחלה', say: 'זַזְתָּ מַהֵר. חֲזֹר לִתְנוּחַת הַהַתְחָלָה' },
  stale: { text: 'רגע, המצלמה מחכה לתמונה חדשה', say: '' },
  ok: { text: 'מעולה, רואים אותך', say: 'מְעֻלֶּה, רוֹאִים אוֹתְךָ' },
  landscape: { text: 'בתרגיל הזה כדאי להשכיב את הטלפון לרוחב', say: 'בַּתַּרְגִּיל הַזֶּה כְּדַאי לְהַשְׁכִּיב אֶת הַטֵּלֵפוֹן לָרֹחַב' },
  goal: { text: 'הגעת ליעד. אפשר לסיים את התרגיל', say: 'הִגַּעְתָּ לַיַּעַד. אֶפְשָׁר לְסַיֵּם אֶת הַתַּרְגִּיל' },
};
export const GUIDE_COPY = Object.freeze({ PARTS, MOVES, LINES, WHOLE });

const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const confidence = p => Math.min(p.visibility ?? 0, p.presence ?? 1);
const inside = (p, margin = 0) => p.x >= margin && p.x <= 1 - margin && p.y >= margin && p.y <= 1 - margin;
const seen = p => finite(p) && confidence(p) >= SEEN && inside(p);
const usable = p => finite(p) && confidence(p) >= NEED && inside(p, .017);
const line = (code, ...pieces) => ({
  code,
  text: pieces.map(piece => piece.text).join('. ') + '.',
  say: pieces.every(piece => piece.say) ? pieces.map(piece => piece.say).join('. ') + '.' : '',
});

function mainPerson(poses) {
  let best = null, most = 0;
  for (const pose of Array.isArray(poses) ? poses : []) {
    const count = Array.isArray(pose?.landmarks) ? pose.landmarks.filter(seen).length : 0;
    if (count > most) { best = pose.landmarks; most = count; }
  }
  return most >= 3 ? best : null;
}

function missingParts(points, required) {
  const groups = Array.isArray(required?.[0]) ? required : [required || []];
  let fewest = null;
  for (const group of groups) {
    const missing = group.filter(id => !usable(points[id]));
    if (!fewest || missing.length < fewest.length) fewest = missing;
  }
  const names = [...new Set((fewest || []).map(id => PART_OF.get(id)).filter(Boolean))];
  // Hidden knees together with hidden feet are simply "the legs".
  return { ids: fewest || [], names: names.includes('feet') ? names.filter(name => name !== 'knees') : names };
}

// The preview is mirrored, so a child who stands at the left of the camera image sees themselves at
// the right of the screen and returns to the middle by moving to their own left.
const towardMiddle = x => x < .5 ? 'left' : 'right';

/**
 * @param sample   { poses, time } of one frame, as the pose worker posts it
 * @param status   the tracker's status for that frame
 * @param policy   { required } of the exercise
 * @param memory   a plain object owned by the caller; holds only the last seen position and time
 * @returns null when the child is seen well, otherwise { code, text, say, move, parts }
 */
export function guide(sample, status, policy = {}, memory = {}) {
  if (status === 'ready') return null;
  const time = Number.isFinite(sample?.time) ? sample.time : 0;
  if (['dark', 'backlit', 'multiple', 'turn-side', 'face-camera', 'calibrating', 'reacquiring', 'stale', 'phone-moved'].includes(status)) {
    return { ...line(status, LINES[status]), move: null, parts: [] };
  }
  const points = mainPerson(sample?.poses);
  if (!points) {
    const last = memory.last;
    if (last && time - last.time <= EXIT_MS && (last.x < .3 || last.x > .7)) {
      const move = towardMiddle(last.x);
      return { ...line('exit:' + move, LINES.exit, MOVES[move]), move, parts: [] };
    }
    return { ...line('none', LINES.none), move: null, parts: [] };
  }
  const body = points.filter(seen);
  const xs = body.map(p => p.x), ys = body.map(p => p.y);
  const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  const middle = (box.left + box.right) / 2;
  memory.last = { x: middle, time };

  const { ids, names } = missingParts(points, policy.required);
  // A hidden joint the model still places at or past an edge tells which edge cut it.
  const lost = ids.map(id => points[id]).filter(finite);
  const cut = {
    left: box.left < EDGE || lost.some(p => p.x < EDGE),
    right: box.right > 1 - EDGE || lost.some(p => p.x > 1 - EDGE),
    top: box.top < EDGE || lost.some(p => p.y < EDGE),
    bottom: box.bottom > 1 - EDGE || lost.some(p => p.y > 1 - EDGE),
  };
  let move;
  if (status === 'move-back' || (cut.left && cut.right)) move = 'back';
  else if (status === 'move-closer') move = 'closer';
  else if (status === 'raise-phone') move = 'raise';
  else if (cut.left || cut.right) move = cut.left ? 'left' : 'right';
  else if (cut.top || cut.bottom) move = 'back';
  else if (middle < .38 || middle > .62) move = towardMiddle(middle);
  else move = names.length ? 'clear' : 'center';

  const parts = names.length > 2 ? [WHOLE] : names.map(name => PARTS[name]);
  const code = [status, names.join('+'), move].join(':');
  return { ...line(code, ...parts, MOVES[move]), move, parts: names };
}

// Decides when an instruction is read aloud: only after it has held for a moment, never the same one
// twice within the repeat interval, and one short confirmation when the child is seen again.
export class GuideVoice {
  constructor({ speak, holdMs = 800, gapMs = 2600, repeatMs = 7000 } = {}) {
    this.speak = speak;
    this.holdMs = holdMs;
    this.gapMs = gapMs;
    this.repeatMs = repeatMs;
    this.reset();
  }

  reset() {
    this.code = null;
    this.since = 0;
    this.spoken = new Map();
    this.lastTime = -Infinity;
    this.problem = false;
  }

  update(instruction, time) {
    if (!instruction) {
      this.code = null;
      if (!this.problem || time - this.lastTime < this.gapMs / 2) return false;
      this.problem = false;
      this.spoken.clear();
      return this._say(LINES.ok.say + '.', time);
    }
    if (instruction.code !== this.code) { this.code = instruction.code; this.since = time; }
    if (!instruction.say || time - this.since < this.holdMs || time - this.lastTime < this.gapMs) return false;
    const before = this.spoken.get(instruction.code);
    const repeat = instruction.code === 'calibrating' ? this.repeatMs * 3 : this.repeatMs;
    if (before != null && time - before < repeat) return false;
    this.spoken.set(instruction.code, time);
    if (instruction.code !== 'calibrating') this.problem = true;
    return this._say(instruction.say, time);
  }

  _say(text, time) {
    this.lastTime = time;
    try { this.speak?.(text); } catch { /* a silent device still shows the text */ }
    return true;
  }
}

// Corrections of the movement itself (form, a short repetition, pace) must not nag: never two within the
// gap, never the same one twice within its own interval, and only every second time its cause comes up.
export class CueLimiter {
  constructor({ gapMs = 4500, sameMs = 11000, every = 2 } = {}) {
    this.gapMs = gapMs;
    this.sameMs = sameMs;
    this.every = every;
    this.reset();
  }

  reset() {
    this.last = -Infinity;
    this.seen = new Map();
  }

  /** @returns true when the correction named by code may be shown and said at this time */
  allow(code, time) {
    const entry = this.seen.get(code) ?? { count: 0, at: -Infinity, shownAt: null };
    this.seen.set(code, entry);
    // One cause that lasts (the same hint frame after frame) is one occurrence.
    if (time - entry.at > 900) entry.count++;
    entry.at = time;
    if (time - this.last < this.gapMs) return false;
    if (entry.shownTime != null && time - entry.shownTime < this.sameMs) return false;
    if (entry.shownAt != null && entry.count - entry.shownAt < this.every) return false;
    entry.shownAt = entry.count;
    entry.shownTime = time;
    this.last = time;
    return true;
  }
}
