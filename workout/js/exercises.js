// קטלוג התרגילים. לכל תרגיל יש "סרטון": רצף פוזות של דמות מקלות שהמנוע ב-figure.js מנפיש ביניהן.
// מערכת צירים: 200x200, הרצפה בגובה 182. כל מפרק הוא [x, y].
// מפרקים: head, neck, hip, le/lh (מרפק/כף יד שמאל), re/rh (ימין), lk/lf (ברך/רגל שמאל), rk/rf (ימין).

const P = (base, patch) => ({ ...base, ...patch });

// ---- פוזות בסיס: מבט מלפנים ----
const FRONT = {
  head: [100, 52], neck: [100, 68], hip: [100, 114],
  le: [86, 92], lh: [84, 116], re: [114, 92], rh: [116, 116],
  lk: [93, 148], lf: [92, 182], rk: [107, 148], rf: [108, 182],
};
const shift = (p, dx, dy) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? [v[0] + dx, v[1] + dy] : v]));

const JJ_MID = P(shift(FRONT, 0, -6), { le: [80, 66], lh: [62, 62], re: [120, 66], rh: [138, 62], lk: [86, 142], lf: [80, 176], rk: [114, 142], rf: [120, 176] });
const JJ_OPEN = P(shift(FRONT, 0, -12), {
  le: [82, 40], lh: [74, 16], re: [118, 40], rh: [126, 16],
  lk: [82, 138], lf: [70, 170], rk: [118, 138], rf: [130, 170],
});

const ROPE_ARMS = { le: [82, 96], lh: [72, 112], re: [118, 96], rh: [128, 112] };
const ROPE_DOWN = P(FRONT, { ...ROPE_ARMS, rope: 300 });
const ROPE_UP = P(shift(FRONT, 0, -12), { ...ROPE_ARMS, lh: [72, 100], rh: [128, 100], rope: -80 });

const TUCK = P(shift(FRONT, 0, -34), {
  hip: [100, 84], lk: [88, 104], lf: [92, 132], rk: [112, 104], rf: [108, 132],
  le: [80, 88], lh: [78, 108], re: [120, 88], rh: [122, 108],
});

const SIT = {
  head: [100, 88], neck: [100, 104], hip: [100, 152],
  lk: [84, 128], lf: [78, 154], rk: [116, 128], rf: [122, 154],
  le: [86, 124], lh: [92, 138], re: [114, 124], rh: [108, 138],
};
const TWIST_L = P(SIT, { neck: [96, 104], head: [94, 88], le: [76, 118], lh: [56, 122], re: [96, 126], rh: [58, 124] });
const TWIST_R = P(SIT, { neck: [104, 104], head: [106, 88], re: [124, 118], rh: [144, 122], le: [104, 126], lh: [142, 124] });

// ---- פוזות בסיס: מבט מהצד, הפנים לימין ----
const SIDE = {
  head: [100, 52], neck: [100, 68], hip: [100, 114],
  le: [98, 92], lh: [96, 116], re: [102, 92], rh: [104, 116],
  lk: [98, 148], lf: [97, 182], rk: [102, 148], rf: [103, 182],
};
const SQUAT = {
  head: [114, 80], neck: [104, 94], hip: [84, 136],
  le: [120, 98], lh: [140, 100], re: [122, 100], rh: [142, 102],
  lk: [118, 152], lf: [102, 182], rk: [120, 154], rf: [106, 182],
};
const JUMP = {
  head: [100, 22], neck: [100, 38], hip: [100, 84],
  le: [104, 52], lh: [108, 26], re: [98, 52], rh: [94, 26],
  lk: [98, 118], lf: [97, 150], rk: [102, 118], rf: [103, 150],
};
const PLANK = {
  head: [154, 124], neck: [138, 136], hip: [95, 148],
  le: [139, 160], lh: [140, 182], re: [137, 160], rh: [136, 182],
  lk: [72, 166], lf: [50, 182], rk: [70, 166], rf: [48, 182],
};
const PLANK_BREATH = P(PLANK, { hip: [95, 150], neck: [138, 138], head: [154, 126] });
const PUSH_DOWN = {
  head: [152, 156], neck: [134, 164], hip: [92, 162],
  le: [120, 176], lh: [140, 182], re: [118, 176], rh: [136, 182],
  lk: [70, 172], lf: [50, 182], rk: [68, 172], rf: [48, 182],
};
const CLIMB_L = P(PLANK, { lk: [118, 150], lf: [112, 180] });
const CLIMB_R = P(PLANK, { rk: [116, 150], rf: [110, 180] });

const LYING = {
  head: [34, 168], neck: [50, 172], hip: [100, 172],
  le: [40, 152], lh: [30, 164], re: [42, 150], rh: [32, 162],
  lk: [124, 144], lf: [148, 182], rk: [126, 146], rf: [150, 182],
};
const CRUNCH = P(LYING, { neck: [60, 148], head: [48, 132], le: [50, 130], lh: [38, 142], re: [52, 128], rh: [40, 140] });
const BIKE_L = P(CRUNCH, { lk: [112, 142], lf: [120, 166], rk: [140, 158], rf: [176, 164] });
const BIKE_R = P(CRUNCH, { rk: [112, 142], rf: [120, 166], lk: [140, 158], lf: [176, 164] });

const FLAT = {
  head: [34, 168], neck: [50, 172], hip: [100, 172],
  le: [72, 178], lh: [92, 180], re: [74, 176], rh: [94, 178],
  lk: [125, 176], lf: [150, 180], rk: [127, 174], rf: [152, 178],
};
const LEGS_UP = P(FLAT, { lk: [100, 138], lf: [100, 104], rk: [102, 138], rf: [102, 104] });
const LEGS_HALF = P(FLAT, { lk: [118, 150], lf: [136, 128], rk: [120, 150], rf: [138, 128] });
const FLUTTER_A = P(FLAT, { lk: [126, 162], lf: [152, 152], rk: [127, 174], rf: [152, 180] });
const FLUTTER_B = P(FLAT, { rk: [126, 162], rf: [152, 152], lk: [127, 174], lf: [152, 180] });

const PRONE = {
  head: [160, 170], neck: [146, 174], hip: [96, 176],
  le: [166, 172], lh: [186, 170], re: [164, 174], rh: [184, 172],
  lk: [70, 178], lf: [44, 180], rk: [72, 176], rf: [46, 178],
};
const SUPERMAN = P(PRONE, { head: [164, 150], neck: [148, 160], le: [170, 152], lh: [190, 142], re: [168, 154], rh: [188, 144], lk: [70, 170], lf: [42, 156], rk: [72, 168], rf: [44, 154] });

const HK_L = P(shift(SIDE, 0, -6), { lk: [118, 112], lf: [112, 146], le: [112, 88], lh: [126, 78], re: [90, 92], rh: [82, 108] });
const HK_R = P(shift(SIDE, 0, -6), { rk: [118, 112], rf: [112, 146], re: [112, 88], rh: [126, 78], le: [90, 92], lh: [82, 108] });

const LUNGE_UP = P(SIDE, { lk: [114, 148], lf: [122, 182], rk: [90, 152], rf: [80, 182], le: [96, 96], lh: [98, 114], re: [104, 96], rh: [102, 114] });
const LUNGE_DOWN = {
  head: [100, 68], neck: [100, 84], hip: [100, 130],
  le: [96, 108], lh: [98, 126], re: [104, 108], rh: [102, 126],
  lk: [128, 152], lf: [128, 182], rk: [82, 168], rf: [70, 182],
};

const HOP_L = shift(P(FRONT, { le: [84, 94], lh: [78, 108], re: [116, 94], rh: [122, 108] }), -26, 0);
const HOP_R = shift(P(FRONT, { le: [84, 94], lh: [78, 108], re: [116, 94], rh: [122, 108] }), 26, 0);
const HOP_AIR = shift(P(FRONT, { le: [80, 88], lh: [72, 100], re: [120, 88], rh: [128, 100], lk: [95, 140], lf: [94, 168], rk: [105, 140], rf: [106, 168] }), 0, -18);

// frames: [פוזה, משך במילישניות עד הפוזה הבאה]. הרצף חוזר על עצמו.
export const EXERCISES = [
  // --- ניתור ---
  { id: 'jumping-jacks', name: 'קפיצות פישוק', cat: 'jump', type: 'reps', base: 20,
    tip: 'קופצים, פותחים רגליים וידיים למעלה, וחוזרים. לנחות רך על קצות האצבעות.',
    frames: [[FRONT, 220], [JJ_MID, 160], [JJ_OPEN, 240], [JJ_MID, 160]] },
  { id: 'squat-jumps', name: 'קפיצות סקוואט', cat: 'jump', type: 'reps', base: 10,
    tip: 'יורדים לסקוואט, מתפוצצים למעלה עם הידיים, ונוחתים בשקט חזרה לסקוואט.',
    frames: [[SQUAT, 420], [JUMP, 320], [SIDE, 180]] },
  { id: 'high-knees', name: 'ברכיים גבוהות', cat: 'jump', type: 'time', base: 30,
    tip: 'רצים במקום ומרימים את הברכיים לגובה המותן. הידיים עובדות כמו בריצה.',
    frames: [[HK_L, 260], [shift(SIDE, 0, -2), 120], [HK_R, 260], [shift(SIDE, 0, -2), 120]] },
  { id: 'tuck-jumps', name: 'קפיצות ברכיים לחזה', cat: 'jump', type: 'reps', base: 8,
    tip: 'קופצים גבוה ומקרבים את הברכיים לחזה. נחיתה רכה, ברכיים מעט כפופות.',
    frames: [[FRONT, 320], [TUCK, 380], [FRONT, 320], [FRONT, 200]] },
  { id: 'side-hops', name: 'קפיצות לצדדים', cat: 'jump', type: 'time', base: 30,
    tip: 'קופצים משני הרגליים מצד לצד מעל קו דמיוני. מהר וקל.',
    frames: [[HOP_L, 200], [HOP_AIR, 160], [HOP_R, 200], [HOP_AIR, 160]] },
  { id: 'jump-rope', name: 'קפיצה בחבל', cat: 'jump', type: 'time', base: 45,
    tip: 'קפיצות קטנות ומהירות. אין חבל? מסובבים את הידיים כאילו יש.',
    frames: [[ROPE_DOWN, 240], [ROPE_UP, 240]] },
  { id: 'burpees', name: 'ברפי', cat: 'jump', type: 'reps', base: 6,
    tip: 'עמידה, סקוואט, ידיים לרצפה ורגליים אחורה לפלאנק, חזרה לסקוואט, וקפיצה למעלה.',
    frames: [[SIDE, 240], [SQUAT, 300], [PLANK, 380], [SQUAT, 300], [JUMP, 320]] },

  // --- בטן ---
  { id: 'crunches', name: 'כפיפות בטן', cat: 'core', type: 'reps', base: 15,
    tip: 'שוכבים על הגב, ברכיים כפופות, ידיים ליד הראש. מרימים את הכתפיים מהרצפה ונושפים.',
    frames: [[LYING, 500], [CRUNCH, 500]] },
  { id: 'bicycle', name: 'אופניים', cat: 'core', type: 'reps', base: 20,
    tip: 'מקרבים ברך אחת לחזה ומיישרים את השנייה. מחליפים כמו על אופניים.',
    frames: [[BIKE_L, 380], [BIKE_R, 380]] },
  { id: 'leg-raises', name: 'הרמות רגליים', cat: 'core', type: 'reps', base: 12,
    tip: 'שוכבים ישר, מרימים את הרגליים לתקרה ומורידים לאט בלי לגעת ברצפה.',
    frames: [[FLAT, 260], [LEGS_HALF, 300], [LEGS_UP, 420], [LEGS_HALF, 320]] },
  { id: 'plank', name: 'פלאנק', cat: 'core', type: 'time', base: 30,
    tip: 'הגוף בקו ישר כמו קרש. הבטן מכווצת, לא להרים את הישבן ולא לשמוט אותו.',
    frames: [[PLANK, 1200], [PLANK_BREATH, 1200]] },
  { id: 'flutter-kicks', name: 'מספריים', cat: 'core', type: 'time', base: 30,
    tip: 'שוכבים על הגב, רגליים באוויר, מנפנפים למעלה ולמטה בתנועות קטנות.',
    frames: [[FLUTTER_A, 240], [FLUTTER_B, 240]] },
  { id: 'russian-twists', name: 'סיבובי גו', cat: 'core', type: 'reps', base: 20,
    tip: 'יושבים עם רגליים באוויר, ידיים צמודות, ומסובבים את הגוף מצד לצד.',
    frames: [[TWIST_L, 380], [SIT, 120], [TWIST_R, 380], [SIT, 120]] },
  { id: 'superman', name: 'סופרמן', cat: 'core', type: 'reps', base: 12,
    tip: 'שוכבים על הבטן, מרימים ידיים ורגליים ביחד ומחזיקים שנייה. כמו סופרמן בטיסה.',
    frames: [[PRONE, 500], [SUPERMAN, 700], [SUPERMAN, 300]] },
  { id: 'mountain-climbers', name: 'מטפסי הרים', cat: 'core', type: 'time', base: 30,
    tip: 'בפלאנק, מקרבים ברך לחזה ומחליפים מהר. הישבן נשאר למטה.',
    frames: [[CLIMB_L, 260], [PLANK, 100], [CLIMB_R, 260], [PLANK, 100]] },

  // --- כוח ---
  { id: 'squats', name: 'סקוואט', cat: 'strength', type: 'reps', base: 15,
    tip: 'יורדים כמו לשבת על כיסא, הברכיים לא עוברות את קצות האצבעות, עולים חזק.',
    frames: [[SIDE, 500], [SQUAT, 600]] },
  { id: 'push-ups', name: 'שכיבות סמיכה', cat: 'strength', type: 'reps', base: 10,
    tip: 'ידיים ברוחב הכתפיים, גוף ישר, יורדים עד שהחזה קרוב לרצפה ודוחפים.',
    frames: [[PLANK, 600], [PUSH_DOWN, 600]] },
  { id: 'lunges', name: 'מכרעים', cat: 'strength', type: 'reps', base: 12,
    tip: 'צעד גדול קדימה ויורדים עד שהברך האחורית כמעט נוגעת ברצפה. מחליפים רגל.',
    frames: [[LUNGE_UP, 500], [LUNGE_DOWN, 600]] },
];

export const CATS = {
  jump: { name: 'ניתור', emoji: '🦘', color: 'var(--c-jump)' },
  core: { name: 'בטן', emoji: '🔥', color: 'var(--c-core)' },
  strength: { name: 'כוח', emoji: '💪', color: 'var(--c-strength)' },
};

export const byId = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
