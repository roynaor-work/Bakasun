# קליפי נגיחה לכדורגל

שישה קליפים מקוריים, CC0-1.0, על שלד 18 העצמות של `design/motion/soccer.json`. מטרים, Y למעלה, Z קדימה, X לשמאל האנטומי. כל קליפ הוא GLB עצמאי ללא דחיסה: דמות בדיונית קיימת של v10 ותנועה חדשה ב־30Hz. Root נשאר בראשית ובסיבוב זהות. Hips כולל כריעה, קפיצה וצלילה חזותיות בלבד.

[תצוגת תלת־ממד](preview.html) · [דוח וראיות](REPORT.md) · [לוח QA](verification/qa/report.html) · [רישיונות](LICENSES.md)

## הקבצים לצריכה

- `runtime/catalog.json`: מטא־דאטה, זמנים בשניות, אירועים, `coreRange`, תמיכות ונתיב כדור, נתיבים ו־SHA-256.
- `runtime/clips/*.glb`: ששת הקליפים; 18 ערוצי סיבוב וערוץ הזזת Hips, אינטרפולציית glTF LINEAR / quaternion slerp.
- `runtime/motions.json`: אותן פוזות מלאות ב־JSON: `frames[].time`, `hips`, `rotations`.
- `runtime/reference/`: עותקי CC0 מדויקים של `idle_relaxed` ו־`run` מ־v10, לצורך בדיקה ומעבר.
- `runtime/player.mjs`: דוגם פוזות וגשר C1 בין פוזה מוצגת ומהירותה לבין שלב יעד נבחר. הוא אינו מחובר למשחק.

`events` מכיל `type`, `event`, `frame`, `time`. מגע מכיל `bone: Head`, ונקודת מצח מקומית המכוילת למשולש עור אמיתי מעל העיניים של המודל, בערך `[-0.000013,0.180856,0.117755]`. שלושת קודקודי המשולש מחוברים ב־100% לעצם Head; המשולש, משקלי העור והמטריצה מתועדים ב־`verification/contact-surface.json`. `ball.samples` הוא מסלול הדגמה עצמאי, מכויל פעם אחת ברגע המגע; הכדור אינו ילד של הראש. קצב, מיקום וכיוון הכדור במשחק נשארים באחריות הסימולציה. אין להפעיל לוגיקת משחק מההדגמה.

נגיחות הקפיצה נוחתות על שתי סוליות ב־1.000 שנ׳. הצלילה נוחתת על שתי כפות הידיים ב־1.200 שנ׳; מגע הרגליים חוזר ב־1.400 שנ׳, ואז התאוששות. `supports[].local` מגדיר את נקודת התמיכה; אין לפרש תמיכת יד כתמיכת רגל. `land` בצלילה הוא נחיתת הידיים.

## מעבר מעמידה ומריצה

פוזות הקצה תואמות ל־`idle_relaxed`. עבור ריצה יש להשתמש בגשר, לפי הזמנים בקטלוג: 0.20 שנ׳ לעמידה ו־0.30 שנ׳ לריצה. החלפת קליפים ישירה אינה המעבר המתוכנן. API הגשר מקבל callbacks המחזירים `{hips, rotations}`; `fromTime` הוא השלב הנוכחי ו־`toTime` שלב היעד. יש לספק את הפוזה והמהירות המוצגות בפועל כשקוטעים ערבוב פעיל.

```js
import {makeBridge, sampleMotion} from './runtime/player.mjs';
const transition = makeBridge({
  from: t => sampleMotion(runMotion, t, {loop: true}),
  to: t => sampleMotion(headerMotion, t),
  fromTime: currentRunPhase,
  toTime: 0,
  duration: 0.30,
});
const pose = transition.sample(elapsedTransitionSeconds);
// At transition.duration, continue header playback from transition.toTime.
```

זמן היעד נשאר בשלב הנבחר עד סוף הגשר, ואז ממשיך משם. הגשר משמר פוזה ומהירות בכניסה וביציאה באמצעות Hermite; הוא אינו משגר אירועים. תיקון IK ועוגני רגליים בעולם במהלך מעבר נשארים אצל הצרכן, יחד עם תנועת השחקן. מדידת 2 ס״מ מתייחסת לחלונות הנחיתה של הקליפים עצמם. גשר מקומי לבדו אינו מבטיח נעילת סוליות בזמן תנועת השחקן בעולם.

## שחזור

נדרשים Node 24 ומעלה ו־Git; אין התקנת npm. קובצי הייחוס כבר כלולים. ליצירת הקליפים:

```sh
node workout/island/design/soccer-header-v1/source/calibrate-forehead.mjs
node workout/island/design/soccer-header-v1/source/author.mjs
node workout/island/design/soccer-header-v1/source/bake.mjs
```

למדידה:

```sh
node workout/island/design/soccer-header-v1/measure.mjs
node workout/island/design/soccer-header-v1/source/measure-transitions.mjs
node workout/island/design/soccer-header-v1/source/report.mjs
```

`measure.mjs` מחלץ ל־`/tmp` את `motion-qa-v1/run.mjs` ואת תלותיו מקומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24`. כלי ה־QA אינו קיים ב־main שעליו מבוססת החבילה; Git מושך את הקומיט אם הוא חסר. ה־CLI המקורי מופעל ללא שינוי ב־120Hz. Node hook מחליף רק את טוען הספריות הסגור במתאם לחבילה החדשה. קוד המדדים, הספים, המשקלים וקורא ה־GLB נשארים זהים למקור. ב־REPORT נרשמים המקור, הפקודה והחריגה הזו מצורת ההפעלה הרגילה. רק תוצרי החבילה החדשה נכתבים למאגר.

תצוגה מקומית:

```sh
python3 -m http.server 8765
```

פתחו [את התצוגה](http://localhost:8765/workout/island/design/soccer-header-v1/preview.html), בחרו קליפ ולחצו על מגע/נחיתה כדי לבדוק פריים מדויק. צילום ואימות דפדפן אופציונליים: `source/capture.mjs`, עם Playwright/Chromium מחוץ למאגר; אפשר להגדיר `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` ו־`SOCCER_HEADER_PREVIEW_URL`.
