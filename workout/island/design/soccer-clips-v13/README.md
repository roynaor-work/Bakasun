# פעולות כדורגל · v13

שמונה קליפים מקוריים ב־30 הרץ על שלד 18 העצמות הקנוני של `design/motion/soccer.json`, תואם ל־`soccer-header-v1` ול־`motion-fix-v12`. יחידות במטרים, Y למעלה, Z קדימה, X לשמאל הדמות. Root קבוע בראשית ובסיבוב זהות; תנועת האגן מקומית בלבד.

[תצוגה תלת־ממדית](preview.html) · [דוח ציונים](REPORT.md) · [לוח QA](verification/qa/report.html) · [רישיונות לכל קובץ](LICENSES.md)

## נכסי הצריכה

- `runtime/clips/*.glb`: שמונה קובצי GLB עצמאיים, כל אחד עם דמות בדיונית, skin קנוני וקליפ אחד; ללא Draco, Meshopt או תלות בפענוח.
- `runtime/motions.json`: הפוזות המלאות, 18 סיבובי עצמות ומיקום Hips לכל פריים.
- `runtime/catalog.json`: משכים, `events`, `supports`, חלון מגע בתיקול, טווחי ליבה, כדור הדגמה, נתיבים וחתימות SHA-256.
- `runtime/reference/`: עמידה וריצה מ־soccer-header-v1, שמקורן בקליפי v10 הסופיים.
- `runtime/player.mjs`: דוגם פוזות וגשר C1 לכניסה וליציאה מול עמידה או ריצה.
- `verification/sheets/*.png`: שמונה פריימים תלת־ממדיים לכל קליפ, כולל רגע המגע או השחרור. נוסף לכך כלי ה־QA מפיק גיליונות SVG של שמונה פוזות מדודות.

משך כולל: חגיגת שוער 1.8 שנ׳, בעיטת שוער 1.6, זריקת שוער 1.2, תיקול כולל קימה 1.0, מסירה גבוהה 1.2, שליטה בחזה 1.2, יעף 1.2, זריקת חוץ 1.4. אירועים הם בשניות ובמספרי פריימים מבסיס אפס. חלון המגע של התיקול הוא 11/30–14/30 שנ׳; `contact` בפריים 12. כל `local` מתאר נקודה במערכת העצם, ללא תנועת שורש.

כדור ההדגמה מוחזק ביד לפני זריקה או הנחה, ונע באופן עצמאי אחרי השחרור/הבעיטה. בבעיטת השוער הוא יורד מהיד לדשא, נשאר נייח עד `contact` בפריים 30, ואז נבעט למרחק. בתיקול נבדק מגע בכל חלון הזמן. בזריקת החוץ נבדקות שתי הידיים ברגע השחרור ושתי הסוליות לאורך הקליפ. הסימולציה צורכת את האירועים ומחליטה על מהירות וכיוון הכדור בעולם; מסלולי ההדגמה אינם לוגיקת משחק.

## רציפות

פוזות הקצה תואמות לעמידה, עם מרווח נייח של פריים בתחילה ובסוף. למעבר לריצה משתמשים בגשר המצורף, במשך 0.30 שנ׳; לעמידה 0.20 שנ׳. יש לספק את הפוזה המוצגת ואת מהירותה אם קוטעים מעבר שכבר פעיל.

```js
import {makeBridge, sampleMotion} from './runtime/player.mjs';
const transition = makeBridge({
  from: t => sampleMotion(runMotion, t, {loop: true}),
  to: t => sampleMotion(actionMotion, t),
  fromTime: currentRunPhase,
  toTime: 0,
  duration: .30,
});
const pose = transition.sample(elapsed);
// At duration, resume actionMotion at transition.resumeTargetTime.
```

שלב היעד נשמר עד סוף הגשר וממשיך ממנו. הגשר משמר פוזה ומהירות ואינו משגר אירועים. הצרכן ממשיך לנהל מיקום שחקן, עוגני רגליים ו־IK בעולם. מדידת ההחלקה עד 2 ס״מ בודקת את כל חלונות התמיכה של הקליפים; רציפות הגשר נבדקת בנפרד על ערוצי GLB הסופיים.

## שחזור

Node 24 ומעלה ו־Git מספיקים לבנייה ולמדידה. אין התקנת npm.

```sh
node workout/island/design/soccer-clips-v13/source/author.mjs
node workout/island/design/soccer-clips-v13/source/bake.mjs
node workout/island/design/soccer-clips-v13/measure.mjs
node workout/island/design/soccer-clips-v13/source/measure-transitions.mjs
```

`motion-qa-v1/run.mjs` עדיין אינו ב־main של בסיס הענף. `measure.mjs` מחלץ אותו ואת תלותיו ללא שינוי מקומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24` לתיקייה זמנית, ומפעיל את ה־CLI המקורי ב־120 הרץ. Node hook מפנה רק את טוען המקורות לספרייה החדשה; נוסחאות המדדים, הספים, המשקלים, קורא ה־GLB ומפיק גיליונות ה־SVG נשארים זהים בתים למקור. `requirements.json` כולל חתימות של כלי ה־QA והשוואה לשלד GLB אמיתי של v12. הקבצים שהכלי כותב מחוץ לפלט QA נשארים בתיקייה הזמנית.

לתצוגה ולצילום:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

פתחו [תצוגה מקומית](http://127.0.0.1:8765/workout/island/design/soccer-clips-v13/preview.html). הצילום משתמש ב־Playwright, Chromium, Python ו־Pillow מחוץ למאגר. אפשר להגדיר `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `PYTHON` ו־`SOCCER_CLIPS_PREVIEW_URL`.

```sh
node workout/island/design/soccer-clips-v13/source/capture.mjs
node workout/island/design/soccer-clips-v13/source/report.mjs
```
