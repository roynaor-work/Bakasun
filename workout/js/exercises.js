// קטלוג התרגילים. כל התרגילים מותאמים לבית: סלון של 2 עד 3 מטר פנויים, מסדרון של 5 עד 6 מטר, קיר פנוי, הדום או מדרגה. בלי מזרן ובלי ציוד.
// place: 'hall' = תרגיל למסדרון. say = מה מוקרא בקול כשמבקשים עזרה (אם אין, מורכב מהשלבים). לכל תרגיל יש "סרטון": רצף פוזות של דמות מקלות שהמנוע ב-figure.js מנפיש ביניהן.
import { SAY } from './say.js?v=20261010-camera-1';

// כל משפט בנוסח המאושר הוא שלב, כולל משפט השם ושאלות.
export const explanationSteps = text => text.match(/[^.!?]+[.!?]+/gu).map(sentence => sentence.trim());

// מערכת צירים: 200x200, הרצפה בגובה 182. כל מפרק הוא [x, y].
// מפרקים: head, neck, hip, le/lh (מרפק/כף יד שמאל), re/rh (ימין), lk/lf (ברך/רגל שמאל), rk/rf (ימין).

const P = (base, patch) => ({ ...base, ...patch });

// ---- פוזות בסיס: מבט מלפנים ----
const FRONT = {
  head: [100, 52], neck: [100, 68], hip: [100, 114],
  le: [86, 92], lh: [84, 116], re: [114, 92], rh: [116, 116],
  lk: [93, 148], lf: [92, 182], rk: [107, 148], rf: [108, 182],
};
const smooth = f => { f.smooth = true; return f; }; /* רצף מחזורי שעובר דרך הפוזות בעקומה חלקה (Catmull-Rom ב-poseAt) במקום להאט בכל פוזה */
const shift = (p, dx, dy) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? [v[0] + dx, v[1] + dy] : v]));

const JJ_MID = P(shift(FRONT, 0, -6), { le: [80, 66], lh: [62, 62], re: [120, 66], rh: [138, 62], lk: [86, 142], lf: [80, 182], rk: [114, 142], rf: [120, 182] }); // כפות הרגליים על הרצפה (182) עם ברכיים כפופות = נחיתה/זינוק; ב-176 הדמות התלת-ממדית עמדה על קצות האצבעות ונראתה מרחפת (רועי 01/10)
const JJ_OPEN = P(shift(FRONT, 0, -26), {
  le: [82, 30], lh: [74, 6], re: [118, 30], rh: [126, 6],
  lk: [80, 122], lf: [66, 152], rk: [120, 122], rf: [134, 152],
}); // באוויר: כל הגוף 26 למעלה, הרגליים פתוחות ומנותקות מהרצפה (רועי: "לא נראה מספיק קפיצה")

const ROPE_ARMS = { le: [88, 98], lh: [78, 118], re: [112, 98], rh: [122, 118] }; // מרפקים צמודים, כפות ידיים בצד המותן
const ROPE_DOWN = P(FRONT, { ...ROPE_ARMS, rope: 300 });
const ROPE_UP = P(shift(FRONT, 0, -14), { ...ROPE_ARMS, le: [88, 86], lh: [76, 100], re: [112, 86], rh: [124, 100], lf: [92, 168], rf: [108, 168], lk: [94, 136], rk: [106, 136], rope: -80 }); // באוויר: הרגליים מנותקות, כפות הידיים מסובבות

const TUCK = P(shift(FRONT, 0, -44), { /* הברכיים קדימה אל החזה (עומק z), לא לצדדים (רועי 01/10: "זה לא לחזה, לצדדים") */
  hip: [100, 76], lk: [95, 70, 44], lf: [94, 104, 30], rk: [105, 70, 44], rf: [106, 104, 30],
  le: [80, 88], lh: [78, 108], re: [120, 88], rh: [122, 108],
});
const TUCK_CROUCH = P(FRONT, { hip: [100, 128], lk: [90, 150], rk: [110, 150], le: [84, 104], lh: [80, 126], re: [116, 104], rh: [120, 126] }); /* כריעה לפני הניתור ונחיתה רכה */

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
// תרגילי רועיקי (01/10/2026, לפי הדגמות האנימציה בערוץ של רועי)
const PLANK_WIDE = P(PLANK, { lk: [64, 160], lf: [36, 180], rk: [78, 168], rf: [60, 182] }); // פתח: רגליים נפתחות (בצד נראה כפיצול קטן)
const CRAB_UP = { head: [52, 92], neck: [60, 108], hip: [100, 126], le: [40, 140], lh: [38, 182], re: [44, 138], rh: [42, 182], lk: [130, 142], lf: [148, 182], rk: [132, 144], rf: [150, 182] }; // סרטן: ידיים מאחור על הרצפה, ירכיים למעלה
const CRAB_KICK = P(CRAB_UP, { lk: [128, 118], lf: [162, 110] }); // בעיטה קדימה-למעלה ברגל אחת
const DIP_UP = { head: [92, 72], neck: [94, 90], hip: [104, 140], le: [78, 116], lh: [80, 148], re: [82, 116], rh: [84, 148], lk: [138, 150], lf: [162, 182], rk: [140, 152], rf: [164, 182] }; // ידיים על ההדום מאחור, ישבן באוויר לפני ההדום
const DIP_DOWN = P(DIP_UP, { head: [96, 92], neck: [98, 110], hip: [104, 158], le: [70, 134], re: [74, 134] }); // המרפקים נכפפים אחורה, הגוף יורד
const DIP_BOX = { type: 'box', x: 50, y: 148, w: 48, h: 34 };
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
// כפיפות בטן: הידיים מאחורי הראש (בעורף), המרפקים פתוחים קדימה. גם בשכיבה וגם בכפיפה (רועי, 30/09)
const LYING_HH = P(LYING, { le: [52, 150], lh: [26, 160], re: [54, 148], rh: [28, 158] });
const CRUNCH = P(LYING, { neck: [84, 126], head: [76, 110], le: [112, 138], lh: [82, 118], re: [114, 136], rh: [84, 116] }); // למעלה: הגו ב-45 מעלות, הידיים בעורף, המרפקים מגיעים לברכיים (רועי)
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
  head: [100, 80], neck: [100, 96], hip: [100, 142],
  le: [96, 120], lh: [98, 138], re: [104, 120], rh: [102, 138],
  lk: [130, 146], lf: [130, 182], rk: [78, 176], rf: [60, 182],
}; // עמוק: הירכיים יורדות 28, הברך הקדמית מעל הקרסול, הברך האחורית כמעט נוגעת ברצפה (רועי)

const HOP_L = shift(P(FRONT, { le: [84, 94], lh: [78, 108], re: [116, 94], rh: [122, 108] }), -26, 0);
const HOP_R = shift(P(FRONT, { le: [84, 94], lh: [78, 108], re: [116, 94], rh: [122, 108] }), 26, 0);
const HOP_AIR = shift(P(FRONT, { le: [80, 88], lh: [72, 100], re: [120, 88], rh: [128, 100], lk: [95, 134], lf: [94, 156], rk: [105, 134], rf: [106, 156] }), 0, -30);


// ---- פוזות נוספות: חימום, ניתור מתקדם, כוח, מתיחות ----
const JOG_L = P(shift(SIDE, 0, -4), { lk: [118, 122], lf: [108, 150], rk: [96, 150], rf: [94, 180], le: [112, 88], lh: [124, 74], re: [90, 92], rh: [82, 112] }); // הברך עולה למותן, הרגל השנייה ישרה על הרצפה, הידיים מתנדנדות (רועי: "נראה כאילו אין תנועת רגליים")
const JOG_R = P(shift(SIDE, 0, -4), { rk: [118, 122], rf: [108, 150], lk: [96, 150], lf: [94, 180], re: [112, 88], rh: [124, 74], le: [90, 92], lh: [82, 112] });
/* ריחוף קצר בריצה קלה: שתי הרגליים מעט מעל הרצפה, במספריים קטנים; ידיים הפוכות לרגליים (רועי: "נראה כאילו הולך הליכות קטנות") */
const JOG_FLY_A = { head: [104, 46], neck: [102, 62], hip: [100, 106], le: [110, 88], lh: [120, 76], re: [92, 92], rh: [84, 110], lk: [112, 136], lf: [116, 164], rk: [92, 138], rf: [84, 162] };
const JOG_FLY_B = { ...JOG_FLY_A, le: JOG_FLY_A.re, lh: JOG_FLY_A.rh, re: JOG_FLY_A.le, rh: JOG_FLY_A.lh, lk: JOG_FLY_A.rk, lf: JOG_FLY_A.rf, rk: JOG_FLY_A.lk, rf: JOG_FLY_A.lf };
const ARMS_UP = P(FRONT, { le: [90, 44], lh: [86, 20], re: [110, 44], rh: [114, 20] });
const ARMS_OUT = P(FRONT, { le: [72, 68], lh: [46, 68], re: [128, 68], rh: [154, 68] });
const ARMS_DOWN = P(FRONT, { le: [84, 94], lh: [80, 118], re: [116, 94], rh: [120, 118] });
// סיבובי ידיים: עיגול במישור הצד. המספר השלישי = עומק (קדימה חיובי), רק לתלת-ממד; בדו-ממד הידיים נראות מקוצרות
const ARMS_FWD = P(FRONT, { le: [90, 70, 22], lh: [86, 68, 48], re: [110, 70, 22], rh: [114, 68, 48] });
const ARMS_BACK = P(FRONT, { le: [88, 72, -20], lh: [84, 76, -44], re: [112, 72, -20], rh: [116, 76, -44] });
const POGO_DOWN = P(FRONT, { le: [86, 94], lh: [90, 114], re: [114, 94], rh: [110, 114], lk: [93, 150], rk: [107, 150], lf: [92, 175], rf: [108, 175] }); // 175 = עקב מורם: קופצים על קצות האצבעות (רועי: "נראה כאילו קופץ על העקבים")
// סיבובי ידיים: מעגל רציף ב-8 תחנות (זרוע ישרה, היד במרחק 48 מהכתף במישור הצד), ריכוך קטן בכל תחנה = תנועה זורמת
const ARM_CIRC = a => P(FRONT, { le: [88, 68 - Math.cos(a) * 26, Math.sin(a) * 26], lh: [84, 68 - Math.cos(a) * 48, Math.sin(a) * 48], re: [112, 68 - Math.cos(a) * 26, Math.sin(a) * 26], rh: [116, 68 - Math.cos(a) * 48, Math.sin(a) * 48] });
const ARM_CIRCLE_FRAMES = smooth(Array.from({ length: 8 }, (_, i) => [ARM_CIRC(i / 8 * Math.PI * 2), 160])); /* עקומה חלקה דרך 8 התחנות: עיגול רציף, לא רובוט (רועי 01/10) */
const POGO_UP = P(shift(POGO_DOWN, 0, -24), { lf: [92, 150], rf: [108, 150], lk: [94, 134], rk: [106, 134] }); // באוויר, כפות הרגליים מנותקות (24 גבוה: ב-16 זה נראה כמו רעד, רועי: "נראה כמו תקלה")
const STAR_SQUAT = P(FRONT, { head: [100, 82], neck: [100, 98], hip: [100, 136], lk: [82, 156], lf: [86, 182], rk: [118, 156], rf: [114, 182], le: [88, 120], lh: [92, 142], re: [112, 120], rh: [108, 142] });
const BROAD_FROM = -48, BROAD_TO = 58; /* קו זינוק וקו נחיתה (רועי: "סמן קו שיראה שהוא קופץ למרחק"); המרחק 106 = כמטר */
const BROAD_SET = shift(SQUAT, BROAD_FROM + 16, 0);
const BROAD_AIR = shift({ head: [100, 40], neck: [100, 56], hip: [96, 100], le: [112, 42], lh: [128, 30], re: [110, 44], rh: [126, 32], lk: [116, 116], lf: [126, 140], rk: [118, 118], rf: [128, 142] }, 6, -6);
const BROAD_LAND = shift(P(SQUAT, { le: [120, 96], lh: [140, 84], re: [122, 98], rh: [142, 86] }), BROAD_TO - 2, 0); // נחיתה בסקוואט, ידיים קדימה לאיזון
const BROAD_STAND = shift(SIDE, BROAD_TO, 0);
const BROAD_BACK = shift(SIDE, BROAD_FROM + 16, 0);
const BROAD_MARKS = { type: 'marks', from: BROAD_FROM, to: BROAD_TO };
const ONE_LEG = P(SIDE, { rk: [92, 142], rf: [82, 156], re: [106, 92], rh: [112, 112], le: [94, 92], lh: [90, 112] });
const ONE_LEG_UP = shift(P(ONE_LEG, { lk: [98, 144], lf: [96, 170], rk: [88, 134], rf: [74, 142] }), 0, -34); /* רועי 01/10: קופץ גבוה יותר (26) והרגל החופשית מתקפלת */
const STEP_BOX = { type: 'box', x: 118, y: 148, w: 60, h: 34 };
const STEP_START = shift(SIDE, -24, 0);
const STEP_SQUAT = shift(SQUAT, -22, 0);
const STEP_AIR = { head: [112, 30], neck: [112, 46], hip: [110, 90], le: [118, 60], lh: [124, 36], re: [116, 62], rh: [122, 38], lk: [126, 108], lf: [132, 130], rk: [128, 110], rf: [134, 132] };
const STEP_ON = { head: [146, 24], neck: [146, 40], hip: [146, 86], le: [144, 64], lh: [142, 88], re: [148, 64], rh: [150, 88], lk: [144, 118], lf: [143, 148], rk: [148, 118], rf: [149, 148] };
const CALF_DOWN = SIDE;
const CALF_UP = P(shift(SIDE, 0, -8), { lf: [101, 176], rf: [107, 176] });
const BRIDGE_DOWN = P(FLAT, { lk: [124, 144], lf: [148, 182], rk: [126, 146], rf: [150, 182] });
const BRIDGE_UP = P(BRIDGE_DOWN, { hip: [100, 134], neck: [54, 168] }); // הירכיים גבוה, קו ישר מהכתפיים לברכיים
const WALL = { type: 'wall', x: 56 };
const WALL_SIT = { head: [66, 74], neck: [66, 90], hip: [66, 136], le: [74, 112], lh: [92, 134], re: [72, 114], rh: [90, 136], lk: [100, 136], lf: [100, 182], rk: [102, 138], rf: [102, 182] };
const WALL_SIT_B = P(WALL_SIT, { head: [66, 75], neck: [66, 91] });
const KNEE_PLANK = { head: [156, 128], neck: [140, 140], hip: [102, 158], le: [141, 162], lh: [142, 182], re: [139, 162], rh: [138, 182], lk: [80, 182], lf: [56, 172], rk: [78, 182], rf: [54, 170] };
const KNEE_DOWN = P(KNEE_PLANK, { head: [154, 158], neck: [136, 166], hip: [100, 170], le: [122, 178], re: [120, 178] });
const PIKE_UP = { head: [123, 160], neck: [115, 146], hip: [98, 132], le: [140, 166], lh: [159, 182], re: [138, 166], rh: [157, 182], lk: [95, 157], lf: [91, 182], rk: [93, 157], rf: [89, 182] }; /* V הפוך: הגו והידיים בקו אחד אל הרצפה, הרגליים מתחת לאגן. נבחר במדידה בתלת-ממד (scratchpad/dbg5): רק כך גם הידיים וגם כפות הרגליים נוגעות ברצפה (הזרועות של הדמות קצרות מהציור) */
const PIKE_DOWN = P(PIKE_UP, { head: [128, 174], neck: [117, 156], hip: [100, 140], le: [127, 176], re: [125, 176] });
const SIDE_PLANK = { head: [40, 108], neck: [54, 120], hip: [100, 142], le: [52, 152], lh: [50, 182], re: [64, 100], rh: [70, 74], lk: [126, 156], lf: [152, 172], rk: [128, 152], rf: [154, 168] };
const SIDE_PLANK_B = P(SIDE_PLANK, { hip: [100, 144], neck: [54, 122], head: [40, 110] });
const V_DOWN = P(FLAT, { le: [30, 172], lh: [14, 170], re: [32, 174], rh: [16, 172] });
const V_UP = { head: [56, 112], neck: [66, 126], hip: [100, 172], le: [96, 116], lh: [124, 112], re: [98, 118], rh: [126, 114], lk: [124, 142], lf: [138, 112], rk: [126, 144], rf: [140, 114] };
const HOLLOW = { head: [42, 150], neck: [56, 160], hip: [100, 172], le: [40, 138], lh: [26, 128], re: [42, 140], rh: [28, 130], lk: [128, 164], lf: [156, 156], rk: [130, 166], rf: [158, 158] };
const HOLLOW_B = P(HOLLOW, { head: [42, 152], neck: [56, 162] });
const QUAD_STRETCH = P(SIDE, { rk: [92, 148], rf: [86, 118], re: [96, 96], rh: [86, 118], le: [110, 88], lh: [124, 70] });
const HAM_STRETCH = { head: [138, 128], neck: [126, 114], hip: [100, 114], le: [118, 142], lh: [112, 170], re: [120, 144], rh: [114, 172], lk: [98, 148], lf: [97, 182], rk: [102, 148], rf: [103, 182] };
const CALF_WALL = { type: 'wall', x: 152 };
const CALF_STRETCH = { head: [120, 58], neck: [116, 74], hip: [100, 118], le: [134, 82], lh: [152, 92], re: [132, 84], rh: [150, 94], lk: [118, 150], lf: [120, 182], rk: [84, 150], rf: [70, 182] };

const SPRINT_L = P(HK_L, { head: [108, 48], neck: [104, 64], lk: [124, 118], lf: [118, 150] });
const SPRINT_R = P(HK_R, { head: [108, 48], neck: [104, 64], rk: [124, 118], rf: [118, 150] });
/* ריחוף בריצה: שתי הרגליים באוויר, הרגל הקדמית נפתחת קדימה-למטה והאחורית נגררת, ידיים הפוכות לרגליים */
const FLY_A = { head: [110, 42], neck: [106, 58], hip: [100, 104], le: [118, 82], lh: [132, 70], re: [88, 86], rh: [78, 104], lk: [122, 128], lf: [132, 156], rk: [84, 126], rf: [72, 150] };
const FLY_B = { ...FLY_A, re: FLY_A.le, rh: FLY_A.lh, le: FLY_A.re, lh: FLY_A.rh, rk: FLY_A.lk, rf: FLY_A.lf, lk: FLY_A.rk, lf: FLY_A.rf };
const TAKEOFF = { head: [104, 66], neck: [102, 82], hip: [94, 126], le: [84, 104], lh: [70, 118], re: [118, 92], rh: [136, 74], lk: [110, 152], lf: [100, 182], rk: [118, 146], rf: [126, 176] };
const REACH = P(JUMP, { le: [104, 50], lh: [108, 22], re: [98, 60], rh: [94, 84] });
const BOUND_L = { head: [104, 40], neck: [102, 56], hip: [98, 100], le: [118, 76], lh: [132, 60], re: [86, 74], rh: [72, 88], lk: [124, 112], lf: [142, 140], rk: [78, 122], rf: [62, 146] };
const BOUND_R = { head: [104, 40], neck: [102, 56], hip: [98, 100], re: [118, 76], rh: [132, 60], le: [86, 74], lh: [72, 88], rk: [124, 112], rf: [142, 140], lk: [78, 122], lf: [62, 146] };
const BOUND_LAND = P(SIDE, { hip: [100, 120], lk: [110, 150], lf: [104, 182], rk: [94, 152], rf: [92, 182] });

// מהירות וקואורדינציה במסדרון: קיר בשני הצדדים
const FLIP = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? [200 - v[0], v[1]] : v]));
const TURN = p => ({ ...FLIP(p), face: -1 }); /* כמו FLIP, אבל בתלת-ממד (מבט צד) הדמות באמת מסתובבת ופונה שמאלה, במקום לרוץ אחורה (ריצת מעבורת: קיר לקיר) */
const WALLS = { type: 'walls' };
const TOUCH_WALL = { head: [150, 60], neck: [146, 76], hip: [128, 120], le: [166, 92], lh: [184, 110], re: [126, 98], rh: [112, 118], lk: [148, 150], lf: [156, 182], rk: [110, 152], rf: [98, 182] };
const TOUCH_FLOOR = { head: [138, 134], neck: [124, 146], hip: [92, 142], le: [138, 164], lh: [150, 180], re: [134, 166], rh: [146, 180], lk: [124, 154], lf: [112, 182], rk: [126, 156], rf: [116, 182] }; /* סקוואט עמוק עם גו כפוף: רק כך הזרוע התלת-ממדית מגיעה לרצפה */
const READY = { head: [126, 118], neck: [114, 134], hip: [78, 134], le: [122, 158], lh: [128, 180], re: [118, 160], rh: [122, 180], lk: [112, 154], lf: [104, 182], rk: [84, 166], rf: [64, 176] }; /* הרגל האחורית על האצבעות (176), כמו בעמדת זינוק אמיתית */ /* עמדת 'היכון': האגן מעל הכתפיים, הכתפיים מעל הידיים שעל הרצפה */
const SHUFFLE_WIDE = P(FRONT, { lk: [82, 146], lf: [72, 182], rk: [118, 146], rf: [128, 182], hip: [100, 120], neck: [100, 74], head: [100, 58], le: [84, 100], lh: [80, 124], re: [116, 100], rh: [120, 124] });
const SHUFFLE_NARROW = P(SHUFFLE_WIDE, { lk: [96, 148], lf: [96, 182], rk: [104, 148], rf: [104, 182] });
const CROSS_FRONT = P(FRONT, { lk: [104, 146], lf: [116, 182], rk: [98, 148], rf: [90, 182], le: [80, 90], lh: [70, 76], re: [120, 90], rh: [130, 76] });
const CROSS_BACK = P(FRONT, { lk: [90, 148], lf: [82, 182], rk: [108, 146], rf: [120, 182], le: [80, 90], lh: [70, 76], re: [120, 90], rh: [130, 76] });
const SKIP_L = P(shift(HK_L, 0, -10), { lf: [110, 150], re: [104, 50], rh: [110, 28] });
const SKIP_R = P(shift(HK_R, 0, -10), { rf: [110, 150], le: [104, 50], lh: [110, 28] });
const BACK_A = { head: [92, 54], neck: [96, 70], hip: [104, 116], le: [104, 92], lh: [110, 112], re: [94, 92], rh: [88, 110], lk: [90, 144], lf: [86, 178], rk: [112, 146], rf: [110, 182] };
const BACK_B = { head: [92, 54], neck: [96, 70], hip: [104, 116], le: [94, 92], lh: [88, 110], re: [104, 92], rh: [110, 112], rk: [90, 144], rf: [86, 178], lk: [112, 146], lf: [110, 182] };

// frames: [פוזה, משך במילישניות עד הפוזה הבאה]. הרצף חוזר על עצמו.
// steps: איך עושים, בשלבים קצרים. tip: על מה לשים לב. prop: אביזר מצויר (קופסה או קיר).
export const EXERCISES = [
  // --- חימום ---
  { id: 'jog', name: 'ריצה קלה במקום', cat: 'warm', type: 'time', base: 40,
    steps: explanationSteps(SAY['jog']),
    frames: smooth([[JOG_L, 190], [JOG_FLY_A, 110], [JOG_R, 190], [JOG_FLY_B, 110]]), view3d: 'side' },
  { id: 'arm-circles', name: 'סיבובי ידיים', cat: 'warm', type: 'time', base: 20, view3d: 'front', /* הידיים קרובות לגוף במישור הצד, הזיהוי האוטומטי חושב שזה מבט צד */
    steps: explanationSteps(SAY['arm-circles']),
    frames: ARM_CIRCLE_FRAMES },
  { id: 'ankle-hops', name: 'קפיצות קפיץ', cat: 'warm', type: 'time', base: 30,
    steps: explanationSteps(SAY['ankle-hops']),
    frames: smooth([[POGO_DOWN, 160], [shift(POGO_DOWN, 0, -10), 70], [POGO_UP, 160], [shift(POGO_DOWN, 0, -12), 70]]) },

  // --- ניתור ---
  { id: 'jumping-jacks', name: 'פתח-סגור', cat: 'jump', type: 'reps', base: 20,
    steps: explanationSteps(SAY['jumping-jacks']),
    frames: smooth([[FRONT, 220], [JJ_MID, 160], [JJ_OPEN, 240], [JJ_MID, 160]]) },
  { id: 'squat-jumps', name: 'קפיצות סקוואט', cat: 'jump', type: 'reps', base: 10,
    steps: explanationSteps(SAY['squat-jumps']),
    frames: [[SQUAT, 420], [JUMP, 320], [SIDE, 180]] },
  { id: 'high-knees', name: 'ברכיים גבוהות', cat: 'jump', type: 'time', base: 30,
    steps: explanationSteps(SAY['high-knees']),
    frames: smooth([[HK_L, 260], [shift(SIDE, 0, -4), 120], [HK_R, 260], [shift(SIDE, 0, -4), 120]]) },
  { id: 'tuck-jumps', name: 'קפיצות ברכיים לחזה', cat: 'jump', type: 'reps', base: 8,
    steps: explanationSteps(SAY['tuck-jumps']),
    frames: [[TUCK_CROUCH, 240], [TUCK, 360], [TUCK_CROUCH, 240], [FRONT, 320]] },
  { id: 'side-hops', name: 'קפיצות לצדדים', cat: 'jump', type: 'time', base: 30,
    steps: explanationSteps(SAY['side-hops']),
    frames: smooth([[HOP_L, 200], [HOP_AIR, 160], [HOP_R, 200], [HOP_AIR, 160]]) },
  { id: 'jump-rope', name: 'קפיצה בחבל דמיוני', cat: 'jump', type: 'time', base: 45,
    steps: explanationSteps(SAY['jump-rope']),
    frames: smooth([[P(ROPE_DOWN, { rope: -80 }), 120], [P(ROPE_UP, { rope: 20 }), 120], [P(shift(ROPE_UP, 0, -14), { rope: 300 }), 120], [P(shift(ROPE_DOWN, 0, -8), { rope: 20, lk: [94, 142], rk: [106, 142], lf: [92, 176], rf: [108, 176] }), 120]]) }, /* ארבע פאזות כמו בקפיצה אמיתית: על הרצפה החבל מעל הראש, עולה (החבל באמצע), בשיא החבל עובר מתחת לרגליים, יורד (החבל באמצע) */
  { id: 'burpees', name: 'ברפי', cat: 'jump', type: 'reps', base: 6,
    steps: explanationSteps(SAY['burpees']),
    frames: [[SIDE, 240], [SQUAT, 300], [PLANK, 380], [SQUAT, 300], [JUMP, 320]] },
  { id: 'star-jumps', name: 'קפיצות כוכב', cat: 'jump', type: 'reps', base: 10,
    steps: explanationSteps(SAY['star-jumps']),
    frames: [[STAR_SQUAT, 380], [JJ_OPEN, 340], [STAR_SQUAT, 200]] },
  { id: 'broad-jump', name: 'קפיצה לרוחק', cat: 'jump', type: 'reps', base: 6,
    steps: explanationSteps(SAY['broad-jump']),
    frames: [[BROAD_SET, 460], [BROAD_AIR, 340], [BROAD_LAND, 360], [BROAD_STAND, 300], [BROAD_BACK, 500]], prop: BROAD_MARKS },
  { id: 'single-leg-hops', name: 'קפיצות על רגל אחת (כל רגל)', cat: 'jump', type: 'reps', base: 8,
    steps: explanationSteps(SAY['single-leg-hops']),
    frames: smooth([[ONE_LEG, 200], [shift(ONE_LEG, 0, -8), 80], [ONE_LEG_UP, 130], [shift(ONE_LEG_UP, 0, 6), 110], [shift(ONE_LEG, 0, -10), 80]]) }, /* שתי פוזות באוויר כדי שהניתור ייראה */
  { id: 'step-jumps', name: 'קפיצה על מדרגה', cat: 'jump', type: 'reps', base: 8, prop: STEP_BOX,
    steps: explanationSteps(SAY['step-jumps']),
    frames: [[STEP_START, 300], [STEP_SQUAT, 380], [STEP_AIR, 300], [STEP_ON, 500], [STEP_START, 400]] },
  { id: 'hall-sprint', name: 'ריצה מהירה במסדרון', cat: 'jump', type: 'reps', base: 6, place: 'hall',
    steps: explanationSteps(SAY['hall-sprint']),
    frames: smooth([[SPRINT_L, 150], [FLY_A, 110], [SPRINT_R, 150], [FLY_B, 110]]), view3d: 'side' }, /* בלי פוזות SIDE ביניהן הזיהוי האוטומטי חשב שזה מבט מלפנים */ /* מחזור ריצה אמיתי: מגע שמאל, ריחוף (רגליים במספריים), מגע ימין, ריחוף (רועי: "שיראה שהוא רץ") */
  { id: 'run-jump', name: 'ריצה וקפיצה לרוחק', cat: 'jump', type: 'reps', base: 5, place: 'hall',
    steps: explanationSteps(SAY['run-jump']),
    frames: [[SPRINT_L, 200], [SPRINT_R, 200], [TAKEOFF, 260], [BROAD_AIR, 360], [BROAD_LAND, 380], [BROAD_STAND, 280], [BROAD_BACK, 500]] },
  { id: 'run-vertical', name: 'ריצה וקפיצה לגובה', cat: 'jump', type: 'reps', base: 6, place: 'hall',
    steps: explanationSteps(SAY['run-vertical']),
    frames: [[SPRINT_L, 200], [SPRINT_R, 200], [TAKEOFF, 240], [REACH, 380], [SIDE, 260]], view3d: 'side' },
  { id: 'bounding', name: 'צעדי ענק במסדרון', cat: 'jump', type: 'reps', base: 4, place: 'hall',
    steps: explanationSteps(SAY['bounding']),
    frames: smooth([[BOUND_L, 320], [BOUND_LAND, 140], [BOUND_R, 320], [BOUND_LAND, 140]]) },

  // --- מהירות וקואורדינציה (המסדרון: קיר ליד השירותים, קיר ליד המרפסת, כ-7 מטר) ---
  { id: 'shuttle-run', name: 'ריצה מקיר לקיר', cat: 'speed', type: 'reps', base: 6, place: 'hall',
    steps: explanationSteps(SAY['shuttle-run']),
    frames: [[shift(SPRINT_L, -50, 0), 200], [shift(SPRINT_R, 10, 0), 200], [TOUCH_WALL, 260], [TURN(shift(SPRINT_L, -50, 0)), 200], [TURN(shift(SPRINT_R, 10, 0)), 200], [TURN(TOUCH_WALL), 260]], prop: WALLS, view3d: 'side' },
  { id: 'reaction-sprint', name: 'ריצה בצפצוף', cat: 'speed', type: 'reps', base: 5, place: 'hall', signal: true,
    steps: explanationSteps(SAY['reaction-sprint']),
    frames: [[READY, 900], [READY, 300], [shift(SPRINT_L, -20, 0), 180], [shift(SPRINT_R, 20, 0), 180], [shift(SPRINT_L, 50, 0), 180], [TOUCH_WALL, 200], [TOUCH_WALL, 400]], prop: WALLS, view3d: 'side' },
  { id: 'side-shuffle', name: 'צעדי צד מקיר לקיר', cat: 'speed', type: 'reps', base: 4, place: 'hall',
    steps: explanationSteps(SAY['side-shuffle']),
    frames: [[shift(SHUFFLE_WIDE, -40, 0), 200], [shift(SHUFFLE_NARROW, -10, 0), 160], [shift(SHUFFLE_WIDE, 20, 0), 200], [shift(SHUFFLE_NARROW, 50, 0), 160], [shift(SHUFFLE_WIDE, 20, 0), 200], [shift(SHUFFLE_NARROW, -10, 0), 160]], prop: WALLS },
  { id: 'carioca', name: 'צעדי צד עם הצלבה', cat: 'speed', type: 'reps', base: 4, place: 'hall',
    steps: explanationSteps(SAY['carioca']),
    frames: [[shift(CROSS_FRONT, -30, 0), 260], [shift(FRONT, 0, 0), 200], [shift(CROSS_BACK, 30, 0), 260], [shift(FRONT, 0, 0), 200]], prop: WALLS },
  { id: 'skipping', name: 'דילוגים במסדרון', cat: 'speed', type: 'reps', base: 4, place: 'hall',
    steps: explanationSteps(SAY['skipping']),
    frames: smooth([[SKIP_L, 280], [shift(SIDE, 0, -4), 140], [SKIP_R, 280], [shift(SIDE, 0, -4), 140]]) },
  { id: 'floor-wall-run', name: 'רצפה וקיר', cat: 'speed', type: 'reps', base: 4, place: 'hall',
    steps: explanationSteps(SAY['floor-wall-run']),
    frames: [[TOUCH_FLOOR, 300], [shift(SPRINT_L, -20, 0), 180], [shift(SPRINT_R, 20, 0), 180], [P(TOUCH_WALL, { lh: [186, 60], le: [162, 72], head: [148, 52], neck: [144, 68] }), 300], [TURN(TOUCH_FLOOR), 300], [TURN(shift(SPRINT_L, -20, 0)), 180], [TURN(shift(SPRINT_R, 20, 0)), 180], [TURN(P(TOUCH_WALL, { lh: [186, 60], le: [162, 72], head: [148, 52], neck: [144, 68] })), 300]], prop: WALLS, view3d: 'side' },
  { id: 'back-run', name: 'ריצה לאחור', cat: 'speed', type: 'reps', base: 4, place: 'hall',
    steps: explanationSteps(SAY['back-run']),
    frames: [[BACK_A, 220], [BACK_B, 220]] },

  // --- בטן ---
  { id: 'crunches', name: 'כפיפות בטן', cat: 'core', type: 'reps', base: 15,
    steps: explanationSteps(SAY['crunches']),
    frames: [[LYING_HH, 500], [CRUNCH, 500]] },
  { id: 'bicycle', name: 'אופניים', cat: 'core', type: 'reps', base: 20,
    steps: explanationSteps(SAY['bicycle']),
    frames: [[BIKE_L, 380], [BIKE_R, 380]] },
  { id: 'leg-raises', name: 'הרמות רגליים', cat: 'core', type: 'reps', base: 12,
    steps: explanationSteps(SAY['leg-raises']),
    frames: [[FLAT, 260], [LEGS_HALF, 300], [LEGS_UP, 420], [LEGS_HALF, 320]] },
  { id: 'v-ups', name: 'סגירת ספר', cat: 'core', type: 'reps', base: 10,
    steps: explanationSteps(SAY['v-ups']),
    frames: [[V_DOWN, 500], [V_UP, 600]] },
  { id: 'plank', name: 'קרש', cat: 'core', type: 'time', base: 30,
    steps: explanationSteps(SAY['plank']),
    frames: [[PLANK, 1200], [PLANK_BREATH, 1200]] },
  { id: 'side-plank', name: 'קרש על הצד (כל צד)', cat: 'core', type: 'time', base: 20, view3d: 'front', /* בתלת-ממד: שוכב על הצד עם הפנים למצלמה, הגוף לאורך המסך */
    steps: explanationSteps(SAY['side-plank']),
    frames: [[SIDE_PLANK, 1200], [SIDE_PLANK_B, 1200]] },
  { id: 'hollow-hold', name: 'סירה', cat: 'core', type: 'time', base: 20,
    steps: explanationSteps(SAY['hollow-hold']),
    frames: [[HOLLOW, 1200], [HOLLOW_B, 1200]] },
  { id: 'flutter-kicks', name: 'מספריים', cat: 'core', type: 'time', base: 30,
    steps: explanationSteps(SAY['flutter-kicks']),
    frames: [[FLUTTER_A, 240], [FLUTTER_B, 240]] },
  { id: 'russian-twists', name: 'סיבובים בישיבה', cat: 'core', type: 'reps', base: 20, view3d: 'front', /* בתלת-ממד: ישוב מול המצלמה, הידיים עוברות מצד לצד */
    steps: explanationSteps(SAY['russian-twists']),
    frames: [[TWIST_L, 380], [SIT, 120], [TWIST_R, 380], [SIT, 120]] },
  { id: 'superman', name: 'סופרמן', cat: 'core', type: 'reps', base: 12,
    steps: explanationSteps(SAY['superman']),
    frames: [[PRONE, 500], [SUPERMAN, 700], [SUPERMAN, 300]] },
  { id: 'plank-jacks', name: 'פתח-סגור על הידיים', cat: 'core', type: 'reps', base: 12,
    steps: explanationSteps(SAY['plank-jacks']),
    frames: [[PLANK, 380], [PLANK_WIDE, 380]] },
  { id: 'crab-kicks', name: 'בעיטות סרטן', cat: 'core', type: 'reps', base: 12,
    steps: explanationSteps(SAY['crab-kicks']),
    frames: [[CRAB_UP, 360], [CRAB_KICK, 420], [CRAB_UP, 360], [P(CRAB_UP, { rk: [128, 118], rf: [162, 110] }), 420]] },
  { id: 'mountain-climbers', name: 'מטפסי הרים', cat: 'core', type: 'time', base: 30,
    steps: explanationSteps(SAY['mountain-climbers']),
    frames: [[CLIMB_L, 260], [PLANK, 100], [CLIMB_R, 260], [PLANK, 100]] },

  // --- כוח רגליים ---
  { id: 'squats', name: 'סקוואט', cat: 'legs', type: 'reps', base: 15,
    steps: explanationSteps(SAY['squats']),
    frames: [[SIDE, 500], [SQUAT, 600]] },
  { id: 'lunges', name: 'ירידה לברך (כל רגל)', cat: 'legs', type: 'reps', base: 12,
    steps: explanationSteps(SAY['lunges']),
    frames: [[LUNGE_UP, 500], [LUNGE_DOWN, 600]] },
  { id: 'calf-raises', name: 'הרמות עקבים', cat: 'legs', type: 'reps', base: 20,
    steps: explanationSteps(SAY['calf-raises']),
    frames: [[CALF_DOWN, 500], [CALF_UP, 700]] },
  { id: 'glute-bridge', name: 'גשר ישבן', cat: 'legs', type: 'reps', base: 15,
    steps: explanationSteps(SAY['glute-bridge']),
    frames: [[BRIDGE_DOWN, 500], [BRIDGE_UP, 700]] },
  { id: 'wall-sit', name: 'כיסא נעלם', cat: 'legs', type: 'time', base: 30, prop: WALL,
    steps: explanationSteps(SAY['wall-sit']),
    frames: [[WALL_SIT, 1200], [WALL_SIT_B, 1200]] },

  // --- כוח עליון ---
  { id: 'push-ups', name: 'שכיבות סמיכה', cat: 'upper', type: 'reps', base: 10,
    steps: explanationSteps(SAY['push-ups']),
    frames: [[PLANK, 600], [PUSH_DOWN, 600]] },
  { id: 'knee-push-ups', name: 'שכיבות סמיכה על הברכיים', cat: 'upper', type: 'reps', base: 12,
    steps: explanationSteps(SAY['knee-push-ups']),
    frames: [[KNEE_PLANK, 600], [KNEE_DOWN, 600]] },
  { id: 'chair-dips', name: 'דחיפות על כיסא', cat: 'upper', type: 'reps', base: 10, prop: DIP_BOX,
    steps: explanationSteps(SAY['chair-dips']),
    frames: [[DIP_UP, 500], [DIP_DOWN, 500]] },
  { id: 'pike-push-ups', name: 'שכיבות סמיכה באוהל', cat: 'upper', type: 'reps', base: 8,
    steps: explanationSteps(SAY['pike-push-ups']),
    frames: [[PIKE_UP, 600], [PIKE_DOWN, 600]] },

  // --- מתיחות לסיום ---
  { id: 'quad-stretch', name: 'מתיחה: עקב לטוסיק (כל רגל)', cat: 'stretch', type: 'time', base: 20,
    steps: explanationSteps(SAY['quad-stretch']),
    frames: [[QUAD_STRETCH, 1500], [P(QUAD_STRETCH, { head: [100, 53] }), 1500]] },
  { id: 'hamstring-stretch', name: 'מתיחה: ידיים לרצפה', cat: 'stretch', type: 'time', base: 20,
    steps: explanationSteps(SAY['hamstring-stretch']),
    frames: [[HAM_STRETCH, 1500], [P(HAM_STRETCH, { lh: [112, 173], rh: [114, 175] }), 1500]] },
  { id: 'calf-stretch', name: 'מתיחה: דוחפים את הקיר (כל רגל)', cat: 'stretch', type: 'time', base: 20, prop: CALF_WALL,
    steps: explanationSteps(SAY['calf-stretch']),
    frames: [[CALF_STRETCH, 1500], [P(CALF_STRETCH, { hip: [101, 118] }), 1500]] },
];

export const CATS = {
  warm: { name: 'חימום', emoji: '🌤️' },
  jump: { name: 'קפיצות', emoji: '🦘' },
  speed: { name: 'מהירות וזריזות', emoji: '⚡' },
  legs: { name: 'כוח רגליים', emoji: '🦵' },
  upper: { name: 'כוח עליון', emoji: '💪' },
  core: { name: 'בטן', emoji: '🔥' },
  stretch: { name: 'מתיחות', emoji: '🧘' },
};

export const byId = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
