# האי שלי · ערכת HUD פעילה

רכיבי DOM עצמאיים, מודולי ES מקוריים, בלי build, ספריות ריצה, רשת, תמונות או גופנים חיצוניים. הדמו מציג נתונים מומצאים בלבד. אין בחבילה חיבור למשחק, שמירות או החלטות על ניקוד, כוכבים ופיזיקה.

מקורות העיצוב ב־main: `../soccer/{spec.md,hud.html,hud.css}`, `../hoops/…`, `../alpine/…` ו־`../screens/`. נשמרו הפלטות, יעדי המגע, המיקום הפיזי של השליטה, מסגרות כהות וטקסט חי מעליהן. האייקונים הם גאומטריית SVG מקומית ללא טקסט. מסך התוצאה מבוסס על קומפוזיציית המסגרת ב־screens; אין העתקת טקסט לתמונה או טעינת חבילות נכסים.

## צפייה ובדיקה

1. משורש המאגר להפעיל שרת קבצים מקומי, למשל:

   ```sh
   python -m http.server 8765
   ```

2. לפתוח [demo.html](http://localhost:8765/workout/island/design/hud-kit/demo.html). מודולי ES דורשים HTTP; פתיחה ב־file:// אינה נתמכת. לבחור ערכה, אירוע וכיוון טקסט. לגרור את הסטיק או להתמקד בו וללחוץ חצים. להחזיק פעולה ראשית לטעינה; מסירה מחליפה את הפעולה הראשית בין בעיטה לחסימה באותו יעד. ספרינט משנה מהירות לדוגמה.
3. לפתוח השהיה ותוצאה דרך הבורר או כפתור ההשהיה; Tab נשאר בלוח, Escape חוזר דרך callback. שלושת ערכי האירוע הם שער, קליעה ונפילה. כל הרכיבים נבנים בדמו, ולוח השהיה ותוצאה מוצגים בנפרד. מד הכוח מופיע בזמן טעינה, ומד הסקי מוצג בכל ערכה כדי לאפשר בדיקה משותפת.
4. לצפות ב־390×844 וב־844×390. צפויה תצוגה ללא גלילת עמוד או חפיפות רכיבים. `?static` עוצר את האנימציה לצילום ובדיקות.

## חוזה אחיד

כל אחד מתשעת המודולים מייצא `create(host, options)` ומחזיר בדיוק `{ update(state), destroy() }`. `host` הוא אלמנט מחובר למסמך, בתוך `.ih-kit`. כל מופע מוסיף שורש משלו ומסיר רק אותו. אפשר כמה מופעים באותו host; הסרת אחד אינה משנה את האחרים. אחרי destroy, עדכונים ו־destroy נוספים אינם עושים דבר, וכל המאזינים מוסרים. הרכיבים אינם שומרים את אובייקט ה־state ואינם משנים אותו.

`update` מקבל **תמונת מצב מלאה**, לא patch: שדה חסר חוזר לברירת המחדל. `options.initial` מאפשר מצב התחלתי. אפשר לשנות ולמחזר את אותו אובייקט לאורך זמן. רוב הרכיבים מוצגים כברירת מחדל, עם `visible: false` להסתרה; לוחות ואירועים מוסתרים עד `visible: true`.

```html
<link rel="stylesheet" href="./hud-kit/hud.css">
<div class="ih-kit" dir="rtl" data-theme="soccer"><div id="score-host"></div></div>
<script type="module">
  import { create } from './hud-kit/scoreboard.mjs';
  const hud = create(document.querySelector('#score-host'));
  const display = { home: 2, away: 1, timeMs: 84000,
    homeLabel: 'האי', awayLabel: 'החוף', period: 'מחצית שנייה' };
  hud.update(display);
  // המתאם החיצוני ממפה נתוני משחק לשדות תצוגה; אין להעביר מנוע או session.
  // בסגירת התצוגה: hud.destroy();
</script>
```

אפשר לייבא כל מודול בנפרד או להשתמש בשמות מ־`index.mjs`: `scoreboard`, `joystick`, `actionButton`, `powerMeter`, `speedMeter`, `pauseButton`, `pausePanel`, `resultScreen`, `eventBanner`.

| מודול | state | options נוספים |
| --- | --- | --- |
| `scoreboard.mjs` | `home`, `away` מספרים 0–999; `homeLabel`, `awayLabel`, `period` טקסט; `timeMs` מילישניות; `shotSeconds` מספר 0–99 או null להסתרה | `label`, `shotLabel`, `separator` (ברירת מחדל ` : `), `hundredths` (ברירת מחדל false) |
| `joystick.mjs` | `x`, `y` צירים פיזיים בתחום ‎−1…1; `disabled` | `label`, `deadZone` (0.08), `onChange(x, y, active)` |
| `action-button.mjs` | `label`, `icon`, `charge` בתחום 0…1; `loading`, `disabled` | `primary`, `label`, `icon`, `unavailableLabel`; `onPress()`, `onRelease(cancelled)`, `onActivate()` |
| `power-meter.mjs` | `value` בתחום 0…1; `label` | `label` |
| `speed-meter.mjs` | `kmh`, `unit` | `maxKmh` (160; מספר שלם חיובי), `label`, `unit` |
| `pause-button.mjs` | `label`, `icon`, `disabled` | `label`, `onPause()` |
| `pause-panel.mjs` | `visible`, `title`, `eyebrow`, `subtitle` | `label`, `primaryLabel`, `menuLabel`, `onResume()`, `onMenu()` |
| `result-screen.mjs` | `visible`, `outcome`: win/loss/draw/incomplete; `value` טקסט מספרי; `stars` 0–3; עד שלושה `stats: [{label, value}]`; `title`, `eyebrow`, `subtitle` | `label`, `starsLabel`, `primaryLabel`, `menuLabel`, `onReplay()`, `onMenu()` |
| `event-banner.mjs` | `visible`, `kind`: goal/basket/fall; `title`, `detail` | `initial` בלבד |

כל מספר חייב להיות number סופי. ערכים חסרים, NaN ומחרוזות מספריות מנורמלים לערך בטוח. שעון נחתך לתחום 00:00–99:59 (או 99:59.99), לא נכרך לאפס. מהירות מוגבלת ל־maxKmh. מד כוח וטעינה מתעגלים לאחוז שלם. תוצאה וכוכבים מוצגים רק כפי שסופקו; אין חישוב תגמול, ניצחון או קליעה. במסלול חלקי יש לספק `outcome: 'incomplete'` ותווית מדד כמו ״זמן חלקי״.

## קלט ואחריות המתאם

- הסטיק מחזיר צירים פיזיים: x חיובי ימינה, y חיובי למטה. RTL אינו משקף תנועה. dead zone רדיאלי ואלכסון מנורמל. המצב החיצוני `x/y` מצייר סטיק כשאין קלט פעיל ואינו יוצר callback. בזמן מגע/מקלדת הקלט המקומי גובר עליו.
- הסטיק לוכד pointer אחד; יציאה משטחו ממשיכה תנועה. pointerup, pointercancel, אובדן capture, blur, הסתרת המסמך, resize, השבתה, הסתרה ו־destroy מחזירים אפס ומשחררים קלט. מקשי החצים תומכים גם באלכסון. כפתור פעולה משחרר החזקה גם בביטול, blur והשבתה. כל מופע מחזיק pointer משלו, כך שאפשר סטיק ופעולה יחד.
- `onPress/onRelease` מיועדים להחזקה וטעינה. `onActivate` הוא click נפרד לפעולות בדידות; אין לחבר אליו שוב אותה פעולת שחרור. `loading` הוא מצב חזותי ואינו משבית את הכפתור. `disabled` מציג מסגרת מקווקוות ותווית ״לא זמין״. האייקונים הנתמכים: shot, pass, boost, block, steal, trick, pause, play, goal, basket, fall.
- לוחות אינם מקפיאים סימולציה ואינם משנים מצב בעצמם. המתאם מעביר `visible`, מקפיא/מחדש את המשחק ומטפל בקריאות חזרה. Escape בהשהיה מפעיל `onResume`; בתוצאה `onMenu`. יש לסגור לוח קודם לפני פתיחת האחר. dialog מקורי חוסם את הרקע, מחזיק פוקוס ומחזיר אותו למפעיל כשנסגר. בהגדלת טקסט או גובה חריג מותרת גלילה פנימית בלוח.
- באנר אינו מחזיק טיימר ואינו מפיק אירוע משחק. המתאם שולט במשך התצוגה באמצעות `visible`.

## פריסה, נגישות ועלות עדכון

`hud.css` מוגבל למחלקות `ih-*`. עטיפת `.ih-kit` מקבלת `data-theme="soccer|hoops|alpine"` וכיוון טקסט בירושה. אפשר להשתמש בפריסת `.ih-stage/.ih-layout` שבדמו או למקם hosts בעצמכם. הסטיק נשאר משמאל הפיזי והפעולות מימין בשני כיווני הטקסט. לוח, שעון, מדדים ומהירות משתמשים ב־`dir="ltr"`, bidi isolate וספרות tabular.

השוליים הם 12px **בנוסף** ל־safe-area, דרך `--ih-safe-{top,right,bottom,left}`; ברירת המחדל היא `env(safe-area-inset-*)`. אפשר לדרוס ל־24px לבדיקות. כל יעד מגע לפחות 44px, כפתור השהיה 48px, סטיק 96/104px. reduced motion מבטל מעברי לחיצה. focus גלוי; אירוע הוא status מנומס, בלי הכרזה מחדש בכל פריים. מדדים משתמשים ב־role=meter.

אין לולאת animation או timer בתוך הרכיבים. אלמנטים, מאזינים, closures, מערכי הכוכבים/מדדים ווקטור הסטיק מוקצים ביצירה בלבד. בכל update נעשות השוואות פרימיטיביות; לא נבנים אובייקטים, מערכים או צמתי DOM. טקסט/transform נוצרים ונכתבים רק כשהערך המוצג השתנה. עדכוני זמן מתבצעים רק במעבר שנייה/מאית, כוח באחוז שלם ומהירות בקמ״ש שלם. הדמו עצמו משתמש ב־requestAnimationFrame ובאובייקטי state ממוחזרים. לא נטען כאן מנוע משחק.

## בדיקות

משורש המאגר:

```sh
node --test workout/island/design/hud-kit/tests/values.test.mjs
node workout/island/design/hud-kit/tests/browser.mjs
```

בדיקת הדפדפן דורשת Playwright מותקן לצורכי פיתוח ו־Chromium שלו. אפשר להשתמש ב־Chrome מקומי באמצעות `--chrome`; `PLAYWRIGHT_MODULE` יכול להצביע לתיקיית החבילה ו־`PLAYWRIGHT_EXECUTABLE_PATH` לקובץ הדפדפן. אין תלות זאת בדמו או ברכיבים. נוצר שרת loopback זמני בלבד; בקשות למקור אחר נחסמות ומכשילות את הבדיקה.

הבדיקה מפעילה `--use-gl=angle --use-angle=swiftshader`, מאמתת bounds וחפיפה בין רכיבים/תוכן לוחות, 44px, RTL/LTR, safe area 0/24px, reduced motion, החלפת תווית/אייקון, ניקוי מאזינים, מופעים עצמאיים, pointer capture/cancel ומקלדת. ברירת מחדל: JSON וצילומי מסך ב־`verification/`; `HUD_TEST_OUT` משנה את יעד הראיות. ראו [VALIDATION.md](VALIDATION.md) להרצה שנמסרה ומגבלותיה.
