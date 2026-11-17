# ערכת בדיקות דפדפן אחידה למשחקי האי

ה־API מפעיל מסלול אמיתי של משתמש: יצירת דמות ברירת מחדל, תפריט האי, בחירת משחק, בניית המתקן הנדרש באישור דרך הממשק, בחירת שלב/ליגה, פתיחה, 30 שניות משחק ויציאה חזרה לתפריט. עשרת המשחקים מוגדרים ב־[scenarios/games.mjs](scenarios/games.mjs).

כל הקוד החדש הוא JavaScript, ללא בנייה, TypeScript, תלות WASM חדשה או שינוי בקבצי המשחקים. נדרשים Node 20 ומעלה, Playwright ו־Chromium. לפי ההבהרה עם רועי, הבדיקה הראשית משתמשת במפענחי הנכסים שכבר קיימים באפליקציה. אבחון שבו WASM כבוי לגמרי זמין בנפרד.

## הרצה

1. פותחים מסוף בשורש הריפו. בסביבה הנתונה Playwright כבר מותקן; אין צורך בהתקנה או בשינוי החבילות של הריפו. במחשב אחר אפשר להתקין רק בתוך התיקייה הזו:

   ```bash
   npm --prefix workout/island/design/e2e-harness-v1 install --no-package-lock
   ```

2. מריצים את כל עשרת המשחקים. השרת המקומי נפתח ונסגר אוטומטית:

   ```bash
   node workout/island/design/e2e-harness-v1/src/cli.mjs
   ```

3. פותחים את [דוח HTML](artifacts/latest/report.html) או את [דוח JSON](artifacts/latest/report.json). הדוח מכיל קישור לכל צילום וליומן המגע. הרצה מוצלחת מחזירה קוד 0; כישלון משחק או בדיקה מחזיר 1; אפשרות שגויה או תקלה בהקמת הסביבה מחזירה 2. כישלון במשחק אחד אינו עוצר את האחרים.

להרצת בדיקות הערכה, כולל נגיעות אמיתיות ו־CSP ב־Chromium:

```bash
node --test workout/island/design/e2e-harness-v1/src/tests/*.test.mjs
```

אם ההתקנה אינה ניתנת לפתרון אוטומטי, מגדירים את הנתיב המוחלט לקובץ הכניסה של Playwright, ואת Chromium לפי הצורך:

```bash
export ISLAND_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs
export CHROMIUM_PATH=/usr/bin/chromium
```

פרטי כל האפשרויות ושמות המשחקים:

```bash
node workout/island/design/e2e-harness-v1/src/cli.mjs --help
node workout/island/design/e2e-harness-v1/src/cli.mjs --list
```

## API

```js
import {runScenario} from './workout/island/design/e2e-harness-v1/src/runner.mjs';

const result = await runScenario('soccer', {
  scenario: 'lifecycle',
  playMs: 30_000,
  timeoutMs: 90_000,
  finishMode: 'exit',
  query: {soccerV6: '0'},
  outputDir: './workout/island/design/e2e-harness-v1/artifacts/my-run',
  maxTriangles: 130_000,
  maxDrawCalls: 90,
});
console.log(result.status, result.firstFrameMs, result.render);
```

ערכי `scenario`: פתיחה בלבד (`opening`), פתיחה ומשחק (`play30`), או שלושת השלבים (`lifecycle`, וגם `finish`). כל קריאה משתמשת בהקשר דפדפן נקי משלה ומפיקה דוח JSON ו־HTML. שגיאות תרחיש מוחזרות בתוצאה עם צילומי כישלון; קלט API לא תקין זורק שגיאה. אפשר להעביר `browser` שנפתח באמצעות `launchBrowser` מ־[src/runtime.mjs](src/runtime.mjs) כדי להשתמש באותו תהליך לסדרה; כל משחק עדיין מקבל הקשר נפרד. במקרה כזה הקורא אחראי לסגירת התהליך.

משך ברירת המחדל הוא 30 שניות שעון של סשן עם קנבס פעיל ולא מושהה לאחר הפריים הראשון וצילום הפתיחה, כולל ספירה פנימית ומעברים מצוירים של המשחק. זמן הסימולציה נמדד בנפרד כשהוא זמין, כסכום ההתקדמויות שנצפו; שעונים שמתאפסים בין תורות אינם זמן גלובלי. אין האצת זמן, עצירת שעון או סימולציית פריימים. אם שלב קצר מסתיים לפני הזמן, הערכה מצלמת את התוצאה, חוזרת דרך תפריט האי ומשחקת שוב; זמן התפריט והטעינה אינו נספר כמשחק פעיל. מספר החזרות וזמן הקיר הכולל נשמרים בדוח. היעלמות משחק ללא תוצאה היא כישלון. משך קצר יותר באמצעות `playMs` או `--play-ms` מסומן בדוח כהרצה שאינה בדיקת 30 השניות התקנית.

תרחיש הסיום הרגיל בודק השהיה, אישור יציאה, שחרור הסשן, עומק היסטוריה וחזרה לתפריט משחקים שמיש. להמתנה גם לתוצאה טבעית של שלב/משחק, ללא כפיית ניצחון או הפסד:

```bash
node workout/island/design/e2e-harness-v1/src/cli.mjs --games tennis --finish natural --finish-timeout-ms 300000
```

פקיעת זמן בהמתנה לתוצאה היא כישלון; לאחריה עדיין נבדקת יציאה דרך הממשק. זו אינה הבטחה שהנהג האוטומטי ינצח או יסיים כל קמפיין.

## תנאי הריצה והמדידה

| נושא | התנהגות |
|---|---|
| מסך | 844×390, יחס פיקסלים 1, `hasTouch: true`, `isMobile: true` |
| גרפיקה | `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` |
| JavaScript בלבד | קוד הערכה חדש כולו JavaScript; מפענחי המשחקים הקיימים פועלים כרגיל, בלי החלפת קוד או הוספת מפענח |
| קלט | רק `Input.dispatchTouchEvent` ב־CDP, כולל גלילה, שתי אצבעות, התפריט וכפתורי היציאה |
| מצב התחלתי | הקשר חדש; ללא קובץ מצב, ללא הזרקת localStorage, כסף, התקדמות, מודל או תוצאות |
| תצפית | `dev=1` חושף את נתוני הקריאה הקיימים של המשחקים; השימוש הוא בקריאת snapshot ונתוני renderer בלבד |
| CSP | מסמכי האפליקציה מוגשים כפי שהם; מאזן דרך אירועי CSP, קונסול, ערוצי Audits/Log/Network של Chromium |
| שגיאות | כל שגיאות הקונסול, החריגות והפרות CSP נשמרות; אין רשימת חריגים שמוסתרת מהדוח |
| פריים ראשון | דגימה ראשונה של קנבס המשחק הפעיל אחרי טעינה/ספירה, עם משולשים וקריאות ציור חיוביים וללא השהיה |
| זמן פתיחה | מהנגיעה האחרונה שמתחילה משחק עד זיהוי הפריים; `islandToFirstFrameMs` כולל גם את המסלול מהאי |
| מונים | מינימום, ממוצע ושיא **שנדגם** לאורך התרחיש; אין שינוי בפונקציות הציור כדי לספור כל פריים |
| תקציבים | אפשר להוסיף `maxTriangles`/`maxDrawCalls`; אין תקציב אחיד מומצא לכל המשחקים |
| תמונות | פתיחה, אחרי המשחק, חזרה לתפריט; או צילום כישלון אם התרחיש נחסם |
| מטמון | Service Workers חסומים, הקשר נקי בכל ריצה; הערכה אינה בדיקת התקנה או שימוש לא מקוון |

המספרים מתאימים להשוואה בין ריצות זהות ב־SwiftShader; הם אינם מדידת FPS או זמני טעינה של טלפון. קובצי WASM שמשחק קיים מבקש מופיעים ב־`wasmRequests`. הערכה אינה מוסיפה או מחליפה מפענחים.

לאבחון של תלות המשחקים ב־WASM:

```bash
node workout/island/design/e2e-harness-v1/src/cli.mjs --no-wasm --output workout/island/design/e2e-harness-v1/artifacts/no-wasm-new
```

אפשרות ה־API המקבילה היא `noWasm: true`. במצב הזה נשלח `--js-flags=--jitless` ונבדק ש־WebAssembly אינו חשוף עוד לפני הניווט וגם במסגרת החזירים. הדגל מכבה גם JIT של JavaScript, ולכן אין להשוות זמני אבחון אלה להרצה הראשית. משחק שמחייב מפענח WASM עשוי להיכשל או להציג גיבוי: הדוח שומר את השגיאה ומסמן שלבים שלא בוצעו כ־`blocked`. עצם בקשת קובץ WASM אינה אומרת שהקוד הורץ. הדגל הישן `--no-expose-wasm` אינו מכבה אותו ב־Chromium 151, ולכן אינו משמש בערכה.

קריאת נתוני הפושע משתמשת בפונקציה הקיימת שמחזירה את התצוגה, ומשם ב־`renderer.info`. היא אינה מפעילה ציור, פקודות debug או שינויים במודל. במשחק החזירים נקראים `renderer.info` ונתוני המצב של המסגרת. מצב QA הקיים של החזירים מופעל על ידי מתאם האי כשמועבר `dev=1`; הדבר מתועד ב־URL של המסגרת ובדוח.

## דגלי חזרה בכתובת

אפשר להעביר כל דגל URL קיים דרך `query`, או לחזור על `--query`. השאילתה הקיימת של `--base-url` נשמרת. `dev=1` נשאר חובה לצורך קריאת מונים.

```bash
node workout/island/design/e2e-harness-v1/src/cli.mjs --games fire --query fireV7=0
```

המקרים המוכנים ב־[scenarios/url-flags.mjs](scenarios/url-flags.mjs) כוללים גם ציפייה לנתון שנצפה במנוע הציור. שינוי הכתובת לבדו אינו מספיק כדי להעביר את הבדיקה:

```bash
node workout/island/design/e2e-harness-v1/src/cli.mjs --case boar-v1
node workout/island/design/e2e-harness-v1/src/cli.mjs --matrix --scenario opening
```

`--matrix` מריץ בסיס ואת מקרי החזרה לכל המשחקים שנבחרו. הרצה נגד אתר קיים נתמכת עם `--base-url` שמצביע לכתובת האי. מגבלות טעינה או CSP של האתר נשמרות ונרשמות.

## מבנה התוצרים

```text
artifacts/latest/
  report.json
  report.html
  <game>/<variant>/
    result.json
    touches.json
    opening.png
    play30.png
    finish.png
    failure.png       # רק אם הייתה תקלה
```

דוח ההרצה שנמסר בענף זה: [REPORT.md](REPORT.md). הרצות הבדיקה נכתבות רק לתיקייה החדשה או לתיקיית פלט ייעודית. אין לכתוב לאותה תיקיית פלט משני תהליכים במקביל. עבור אתר/גרסה חדשים יש ליצור תיקיית פלט חדשה כדי לשמור ראיות קודמות.

אם סביבת הדפדפן חוסמת פתיחת קובצי HTML מקומיים, אפשר להציג את הדוח שנמסר דרך שרת ה־JavaScript של הערכה. הפקודה מדפיסה קישור; מסיימים עם Ctrl+C:

```bash
node --input-type=module -e "import {serveIsland} from './workout/island/design/e2e-harness-v1/src/server.mjs'; const server = await serveIsland(); console.log(server.url + 'design/e2e-harness-v1/artifacts/baseline/report.html');"
```
