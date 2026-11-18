# גליץ, תגובות ושוער v2

19 קליפים מקוריים על השלד הקנוני של 18 העצמות, 30 הרץ, מטרים, quaternion מקומי מוחלט `xyzw`. צירים: Y למעלה, Z קדימה, X לשמאל האנטומי. [תצוגת תנועה](preview.html) · [דוח ומדידות](REPORT.md) · [רישיון ומקורות](LICENSES.md).

## צריכת הנכסים

- `runtime/catalog.json`: קליפים, זמנים בשניות, אירועים, תמיכות, התאוששות הבאה ו־SHA-256.
- `runtime/clips/*.glb`: אנימציות שלד בלבד, בלי שכפול הגאומטריה. מנגנים על מודל בעל אותם שמות, הורים ו־bind; אלה אינם delta rotations עבור שלד אחר.
- `runtime/motions.json`: כל 559 הפוזות המלאות. `frames[].hips` הוא מיקום אגן מקומי מוחלט; להמרה לפורמט motion הישן, `hipsOffsetMeters = hips - [0,0.86,0]`.
- `runtime/reference/idle_relaxed.glb`: מודל השדה CC0 ועמידת הייחוס. `runtime/keeper-open.glb`: שוער עם כפפות פתוחות לקליטה ולהצלות; `runtime/keeper.glb`: אותו bind קנוני עם כפפה ימנית סגורה ל־punch בלבד. המודלים כוללים טקסטורות ומעטפת בלתי דחוסות.
- `runtime/reference/run.glb`: ריצת ייחוס CC0. `runtime/player.mjs`: דגימת פוזות וגשר C1.
- `sheets/`: גיליון PNG בן שמונה פריימים לכל קליפ, מה־GLB הסופי על הדמות המלאה.

Root נשאר `[0,0,0]` עם סיבוב זהות וללא ערוץ תנועה. כל כריעה, ירידה, קפיצה ונחיתה אופיינה ב־Hips. המשחק אחראי לתנועת הדמות ולסיבובה בעולם; אין לחלץ את היסט האגן למסלול השחקן.

`next` מחבר פעולה לקימה בפוזה ובמהירות תואמות. אין להכניס עמידת ביניים או לערבב מ־idle ישירות לתחילת קימה שוכבת. הגליץ אורך 1.0 שנ׳ והקימה שלו 0.6; נפילה קלה 0.3 וקימה 0.4, יחד 0.7; פאול 1.2; כל קימת שוער 0.8.

## כניסה ויציאה

מעבר לעמידה: 0.20 שנ׳. מעבר מריצה ואליה: 0.30 שנ׳, מכל שלב נוכחי. הגשר מקבל את הפוזה והמהירות המוצגות בפועל, לרבות בעת קטיעת מעבר פעיל. הוא שומר על C0/C1 ומוסיף קשת אגן חזותית של 6.5 ס״מ, עם היסט ונגזרת אפס בקצוות, כדי למנוע חדירת אצבעות הריצה במהלך הערבוב. כל 320 צירופי פאזות הייחוס נמדדו גם מול מעטפת המודל.

```js
import {makeBridge, sampleMotion} from './runtime/player.mjs';
const bridge = makeBridge({
  from: t => sampleMotion(runMotion, t, {loop: true}),
  to: t => sampleMotion(tackleMotion, t),
  fromTime: currentRunPhase,
  toTime: 0,
  duration: 0.30,
});
const pose = bridge.sample(elapsed);
// At the end, resume the target from bridge.resumeTargetTime.
```

הגשר מחזיק את שלב היעד עד סופו, ואז ממשיכים ממנו; אין לקדם את שעון היעד גם בזמן הגשר. הגשר אינו משגר אירועים. נעילת רגל בעולם בזמן תנועת השחקן בפועל דורשת התאמה אצל הצרכן; המדידות כאן הן על נתוני הייחוס המקומיים.

## מגע ללא פאול

`stumble_light` הוא התגובה המועדפת: חצי שנייה של אובדן שיווי משקל, ידיים לצדדים והמשך. אם המשחק בוחר נפילה קלה, `fall_soft → getup_soft` מספקים 0.7 שנ׳ של תנועה פעילה. הדרישה שהנפגע יהיה מוכן מעט אחרי המחליק היא כלל תזמון של המשחק: `catalog.interaction` מגדיר לפחות 0.1 שנ׳ אחרי המחליק. כשנדרש, מחזיקים את פוזת הצד הנתמכת לפני תחילת הקימה; אין להאט את קובץ הקימה. לדוגמה: מגע גליץ ב־0.5, נפילה עד 0.8, החזקת צד עד 1.3, קימה עד 1.7; המחליק מוכן ב־1.6. זמן ההחזקה אינו חלק מ־0.7 שנ׳ התנועה הפעילה.

כל האירועים הם רמזי תצוגה. קביעת פאול, לקיחת כדור והתקדמות נשארות בסימולציה. מסלול הכדור בתצוגה הוא מסלול הדגמה מספרי, מכויל בנקודת המגע, ללא הורות לעצם; אין להשתמש בו כפיזיקת משחק. בקליטות נמדד מגע דומיננטי אחד; היד השנייה מסומנת `secure` ואינה מדידת אחיזה דו־ידנית.

## שחזור

Node 24+, Python עם Pillow, Git, ובצילום בלבד Playwright/Chromium. אין התקנת npm בחבילה.

```sh
node workout/island/design/soccer-tackle-keeper-v2/source/build.mjs
node workout/island/design/soccer-tackle-keeper-v2/source/run-qa.mjs
node workout/island/design/soccer-tackle-keeper-v2/source/measure.mjs
node workout/island/design/soccer-tackle-keeper-v2/source/capture.mjs
node workout/island/design/soccer-tackle-keeper-v2/source/report.mjs
```

כלי `motion-qa-v1` טרם נמצא ב־main של בסיס המשימה. `run-qa.mjs` מחלץ אותו מקומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24` לעותק זמני ומפעיל שם את `node workout/island/design/motion-qa-v1/run.mjs`. רק מלאי הקלט מוחלף. נוסחאות, ספים, משקלים וקורא GLB נותרים זהים בבתים. ה־CLI מודד 14 רצפי פעולה וקימה מלאים מול idle; כל 19 הקליפים המפוצלים נמדדים בנוסף ב־API המקורי מול קצות הקליפים השכנים האמיתיים. כך סוף נפילה נבחן מול תחילת הקימה, ולא נטען שהוא עמידה. כל הפקודות והחתימות ב־`qa/summary.json`.

לתצוגה מקומית הפעילו שרת משורש המאגר ופתחו את `workout/island/design/soccer-tackle-keeper-v2/preview.html`. צילום תומך ב־`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `SOCCER_PREVIEW_URL` ו־`SOCCER_PREVIEW_PORT`. אין חיבור למשחק החי, שינוי קוד קיים, גרסה, ops או בדיקות.
