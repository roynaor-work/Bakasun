# טניס — אחיזה v1

חבילת נכסים עצמאית: מחבט קשיח באורך 68 ס״מ, תנוחת אחיזה ליד ימין ותשעה קליפים מקוריים. כל הקבצים חדשים בתיקייה זו. [דוח](REPORT.md) · [רישיון ומקורות](LICENSES.md) · [גיליון 72 הפריימים](contact-sheet.webp).

## פתיחה

1. משורש המאגר הפעילו שרת קבצים:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

2. פתחו [preview.html](http://127.0.0.1:8765/workout/island/design/tennis-grip-v1/preview.html).
3. בחרו קליפ, עברו ל״תקריב אחיזה״ ועצרו בנקודות שונות. אפשר לגרור לסיבוב, לגלול להגדלה וללחוץ על שמונת הפריימים. בהגשה המצלמה מתרחקת כדי להציג גם את קשת ההטלה.

התוצאה הרצויה: הידית נשארת בתוך האצבעות בכל קליפ, שתי ידיים בהיכון ובבקהנד, יד שמאל פתוחה בהטלה, ולמחבט אין שינוי בקנה מידה או בסיבוב המקומי ביחס ליד ימין.

## נכסי ריצה

| קובץ | שימוש |
|---|---|
| `runtime/player.glb` | דמות CC0 על השלד הקנוני, המחבט והידיים כבר מחוברים, תשע אנימציות מוטמעות וכדור הדגמה |
| `runtime/racket.glb` | מחבט עצמאי; צומת `grip` בראש הידית, צומת `head` במרכז משטח המיתרים |
| `runtime/right-hand-grip.glb` | כף יד ואצבעות סגורות, בקואורדינטות המקומיות של `RightHand` |
| `runtime/pose-mask.json` | מסכת עצם `RightHand`, תנוחת היכון לדוגמה, מיקום socket וטרנספורמציית אחיזה קבועה |
| `runtime/attach.mjs` | חיבור מחבט עצמאי לפי socket ו־`grip`, עם מרחב Three.js של המארח |
| `runtime/catalog.json` | משכים, שמות, אירועי מגע והטלה, חלונות תמיכה ו־hash של הדמות |
| `runtime/motions.json` | כל הפוזות המקוריות ב־30Hz, כולל סיבובי 18 העצמות ומסלול כדור ההדגמה |

הקליפים: `idle`, `forehand`, `backhand`, `serve`, `volley`, `drop_shot`, `lob`, `recover`, `run_side`. היחידות מטרים, ‎+Y למעלה, ‎+Z קדימה ו־‎+X לשמאל הדמות. הסיבובים הם quaternion-xyzw מוחלטים ביחס להורה. אין תנועת `Root`; תזוזה אנכית קטנה ב־`Hips` משמשת לכיפוף ולהגשה. `run_side` הוא מחזור במקום; המארח יכול להזיז את כל הדמות בנפרד.

## חוזה האחיזה

המחבט העצמאי מתחיל בתחתית הידית ב־`[0,0,0]`. אורכו 0.68 מ׳, ראשו האובלי ברוחב כ־0.26 מ׳, `grip = [0,0.20,0]` ו־`head = [0,0.50,0]`. ציר ‎+Y שלו עובר לאורך הידית אל הראש, ו־‎+Z הוא הנורמל למיתרים.

מסכת היד מכילה ארבע אצבעות מכופפות ואגודל מולן. אין עצמות אצבעות בשלד בן 18 העצמות; הצורה הסגורה היא משטח קשיח תחת `RightHand`, והעצם עצמה מקבלת את ערוץ התנועה המקורי בכל קליפ. ליד שמאל יש morph מקורי לפתיחה בהטלה ולתמיכה באחיזה. אין הוספת עצמות לשלד הגוף.

כשטוענים את `player.glb`, המחבט כבר מחובר. כדי להשתמש במחבט ובמסכה בנפרד:

1. השתמשו בגוף עם שמות, הורים ו־bind תואמים לשלד שב־`catalog.json`.
2. החליפו את משטח כף היד הפתוחה במסכה; אין להציג שתי כפות ידיים באותו מקום.
3. טענו את המחבט העצמאי וקראו ל־`attachRacket(THREE, rightHand, racketScene, poseMask)` פעם אחת.
4. הפעילו את ערוצי התנועה של הגוף, כולל `RightHand`. אל תדרסו אותם בסיבוב Euler נוסף של המחבט.

הנוסחה היא `T_hand_socket × inverse(T_racket_grip)`. כל הסיבוב והמיקום המקומיים של המחבט נשארים קבועים בזמן הניגון. ה־helper נבדק בדפדפן מול החיבור המוטמע.

הדמות הנוכחית ב־`tennis-view.mjs` משתמשת גם ב־`Hand_R` וב־IK נפרד, וחבילת `tennis-v7` משתמשת ב־bind של T-pose. שינוי שם עצם או העתקה ישירה של סיבובים ביניהם אינם retarget תקין. שילוב עתידי צריך לכבד את ה־bind ואת היחידות; החבילה הזו אינה משנה את חיבור המשחק הקיים.

## שחזור

הבנייה והמדידות צריכות Node 24 ומעלה. מחוללי הנכסים משתמשים רק ב־Three.js ובמקורות CC0 קיימים בקריאה בלבד:

```sh
node workout/island/design/tennis-grip-v1/source/build.mjs
node workout/island/design/tennis-grip-v1/source/verify.mjs
node workout/island/design/tennis-grip-v1/source/measure.mjs
```

כלי `motion-qa-v1/run.mjs` אינו ב־main שעליו מבוססת החבילה. `measure.mjs` מחלץ את כלי המקור מקומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24` לתיקייה זמנית. Node hook מחליף רק את רשימת מקורות הקלט הסגורה. ה־CLI, קורא ה־GLB, נוסחאות המדדים, הספים והשקלול נשארים זהים למקור. הפלט המספרי המקורי נשמר ב־`verification/qa/report.json`; בתוצרי HTML מתוקנים רק קישורי ניווט למבנה החבילה.

צילום, אחרי הפעלת שרת הקבצים, דורש Playwright ו־Chromium מותקנים. `PLAYWRIGHT_MODULE` ו־`CHROMIUM_EXECUTABLE` מאפשרים לבחור התקנות קיימות; אין התקנת תלות בתוך המאגר. גיליון הפריימים דורש Python, Pillow וגופן DejaVuSans:

```sh
node workout/island/design/tennis-grip-v1/source/capture.mjs
python3 workout/island/design/tennis-grip-v1/source/sheets.py
```

אימות Khronos עם תלות כתיבה חיצונית:

```sh
npm install --prefix /tmp/tennis-grip-tools --cache /tmp/tennis-grip-npm-cache --no-audit --no-fund gltf-validator@2.0.0-dev.3.10
node workout/island/design/tennis-grip-v1/source/validate-glb.mjs
node workout/island/design/tennis-grip-v1/source/inventory.mjs
```

כל תוצרי הבנייה נכתבים לתיקייה הזו; כלי QA ותלויות כתיבה זמניות נמצאים ב־`/tmp`. שום קובץ מקור קיים, בדיקה קיימת, קובץ ops או קובץ שחרור אינו משתנה.
