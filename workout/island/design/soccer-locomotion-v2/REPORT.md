# דוח מסירה — ספריית תנועה לכדורגל v2

19 קליפים מקוריים על שלד קנוני של 18 עצמות, ב־30 הרץ. מינימום **88.1**, **0 מדדים אדומים**, וכיסוי מלא לכל המדדים החלים. סטיית התמיכה המרבית שנמדדה בתלת־ממד: **0.805 ס״מ** מתוך מגבלה של 2 ס״מ. כל בדיקות ATHLETE_STANDARD עברו.

[תצוגת תלת־ממד](preview.html) · [לוח QA](verification/qa/report.html) · [אימות דרישות מפורט](verification/requirements.json) · [מדידת מעברים](verification/transitions.json) · [ראיות דפדפן](verification/browser.json) · [מקורות ורישיונות](LICENSES.md)

## קליפים וראיות

שלוש עמידות עם נשימה ושינויי משקל/מבט, ארבע מהירויות עם נדנוד זרועות נגדי לרגליים, האצה של 0.500 שניות והאטה של 0.467 שניות, פניות לשני הכיוונים, צעדי צד, ריצה לאחור וריצה עם כדור. בכל קליפ סיבוב Root הוא זהות ומיקומו אפס; אין תנועת שורש או דחיסה. גליון PNG מכיל שמונה פריימים שונים מתוך ה־GLB עצמו.

| קליפ | שניות | פריימים ב־30Hz | ציון | אדומים | סטיית תמיכה מרבית, ס״מ | ATHLETE_STANDARD | 8 פריימים ומדדים |
|---|---:|---:|---:|---:|---:|---|---|
| `idle_relaxed` · עמידה רגועה ונשימה | 4.000 | 121 | 100.0 | 0 | 0.000 | עבר | [PNG](verification/sheets/idle_relaxed.png) · [QA](verification/qa/clips/soccer-locomotion-v2--idle_relaxed.html) |
| `idle_weight_shift` · העברת משקל רגועה | 4.000 | 121 | 99.9 | 0 | 0.000 | עבר | [PNG](verification/sheets/idle_weight_shift.png) · [QA](verification/qa/clips/soccer-locomotion-v2--idle_weight_shift.html) |
| `idle_scan` · עמידה ומבט סביב | 4.000 | 121 | 99.9 | 0 | 0.000 | עבר | [PNG](verification/sheets/idle_scan.png) · [QA](verification/qa/clips/soccer-locomotion-v2--idle_scan.html) |
| `walk` · הליכה | 1.067 | 33 | 91.8 | 0 | 0.052 | עבר | [PNG](verification/sheets/walk.png) · [QA](verification/qa/clips/soccer-locomotion-v2--walk.html) |
| `jog` · ריצה קלה | 0.867 | 27 | 90.4 | 0 | 0.092 | עבר | [PNG](verification/sheets/jog.png) · [QA](verification/qa/clips/soccer-locomotion-v2--jog.html) |
| `run` · ריצה | 0.733 | 23 | 91.3 | 0 | 0.152 | עבר | [PNG](verification/sheets/run.png) · [QA](verification/qa/clips/soccer-locomotion-v2--run.html) |
| `sprint` · ספרינט | 0.667 | 21 | 89.2 | 0 | 0.326 | עבר | [PNG](verification/sheets/sprint.png) · [QA](verification/qa/clips/soccer-locomotion-v2--sprint.html) |
| `turn_left_45` · פנייה 45° שמאלה | 1.467 | 45 | 91.0 | 0 | 0.165 | עבר | [PNG](verification/sheets/turn_left_45.png) · [QA](verification/qa/clips/soccer-locomotion-v2--turn_left_45.html) |
| `turn_right_45` · פנייה 45° ימינה | 1.467 | 45 | 91.0 | 0 | 0.165 | עבר | [PNG](verification/sheets/turn_right_45.png) · [QA](verification/qa/clips/soccer-locomotion-v2--turn_right_45.html) |
| `turn_left_90` · פנייה 90° שמאלה | 1.467 | 45 | 90.1 | 0 | 0.253 | עבר | [PNG](verification/sheets/turn_left_90.png) · [QA](verification/qa/clips/soccer-locomotion-v2--turn_left_90.html) |
| `turn_right_90` · פנייה 90° ימינה | 1.467 | 45 | 90.1 | 0 | 0.253 | עבר | [PNG](verification/sheets/turn_right_90.png) · [QA](verification/qa/clips/soccer-locomotion-v2--turn_right_90.html) |
| `turn_left_180` · פנייה 180° שמאלה | 2.200 | 67 | 90.0 | 0 | 0.117 | עבר | [PNG](verification/sheets/turn_left_180.png) · [QA](verification/qa/clips/soccer-locomotion-v2--turn_left_180.html) |
| `turn_right_180` · פנייה 180° ימינה | 2.200 | 67 | 90.0 | 0 | 0.117 | עבר | [PNG](verification/sheets/turn_right_180.png) · [QA](verification/qa/clips/soccer-locomotion-v2--turn_right_180.html) |
| `strafe_left` · צעדי צד שמאלה | 0.867 | 27 | 92.8 | 0 | 0.022 | עבר | [PNG](verification/sheets/strafe_left.png) · [QA](verification/qa/clips/soccer-locomotion-v2--strafe_left.html) |
| `strafe_right` · צעדי צד ימינה | 0.867 | 27 | 92.8 | 0 | 0.022 | עבר | [PNG](verification/sheets/strafe_right.png) · [QA](verification/qa/clips/soccer-locomotion-v2--strafe_right.html) |
| `run_backward` · ריצה אחורה | 0.733 | 23 | 93.8 | 0 | 0.037 | עבר | [PNG](verification/sheets/run_backward.png) · [QA](verification/qa/clips/soccer-locomotion-v2--run_backward.html) |
| `run_ball` · ריצה עם כדור | 0.733 | 23 | 93.3 | 0 | 0.098 | עבר | [PNG](verification/sheets/run_ball.png) · [QA](verification/qa/clips/soccer-locomotion-v2--run_ball.html) |
| `idle_to_run` · האצה מעמידה לריצה | 0.500 | 16 | 88.1 | 0 | 0.805 | עבר | [PNG](verification/sheets/idle_to_run.png) · [QA](verification/qa/clips/soccer-locomotion-v2--idle_to_run.html) |
| `run_to_idle` · האטה מריצה לעמידה | 0.467 | 15 | 88.3 | 0 | 0.801 | עבר | [PNG](verification/sheets/run_to_idle.png) · [QA](verification/qa/clips/soccer-locomotion-v2--run_to_idle.html) |

## הזרועות והטיית הגוף

המדדים הבאים מחושבים בכלי הקיים `athletes-core.mjs`, במערכת הגוף לאורך מחזור מלא. זווית המרפק היא הזווית הפנימית: 180° ישר, 90° כפוף. רוחב הזרוע המרבי מושווה לסף 24°; דרישות טווח הנדנוד והטיית הגו עולות לפי סוג הריצה.

| קליפ | מהירות ייחוס, מ׳/שנ׳ | פתיחת זרוע מרבית | טווח נדנוד | מרפק ממוצע | הטיית גו ממוצעת | תקן |
|---|---:|---:|---:|---:|---:|---|
| `walk` | 1.00 | 4.7° | 54.0° | 92.0° | 1.4° | עבר |
| `jog` | 1.65 | 5.6° | 70.0° | 90.0° | 3.5° | עבר |
| `run` | 2.20 | 6.8° | 83.9° | 90.0° | 6.2° | עבר |
| `sprint` | 3.20 | 8.1° | 92.0° | 90.0° | 9.0° | עבר |

העמידות נבדקות מול סף העמידה. קליפי הפנייה נבדקים מול תקן ריצה; במעברי האצה/האטה נבדקת פתיחת הזרועות, כי ממוצעי מרפק, נדנוד והטיה של מחזור ריצה מלא אינם חלים על קליפ המתחיל או מסתיים בעמידה רגועה. ראיות ופירוט התחולה נמצאים ב־requirements.json. בדיקת האנטומיה המקורית של כלי ה־QA חלה על כל הפריימים.

## מדידה ללא שינוי כלי ה־QA

קובץ `workout/island/design/motion-qa-v1/run.mjs` אינו נמצא ב־main שעליו מבוססת החבילה. `measure.mjs` מחלץ זמנית את הקובץ ואת שבע תלויותיו מתוך הקומיט **5eb4f093bc22523ee417a7f2345c3b813bffba24**, כפי שנעשה ב־soccer-header-v1. הוא מריץ את ה־CLI המקורי ב־120 הרץ, עם Node hook המחליף רק את מלאי הספריות הסגור ב־`qa-sources.mjs`. נוסחאות המדידה, הספים, המשקלים וקורא ה־GLB לא משתנים. חתימות שמונת קובצי המקור נשמרות ב־requirements.json וב־provenance.json.

```sh
node workout/island/design/soccer-locomotion-v2/measure.mjs
```

הפעלת ה־CLI בפועל: `node --import <qa-register.mjs> <temporary>/workout/island/design/motion-qa-v1/run.mjs --library soccer-locomotion-v2 --fps 120 --out <verification/qa>`.

כל GLB נבדק בנפרד: 18 עצמות עם שמות/הורים/מידות מנוחה קנוניים, כל דגימות הזמן ב־30 הרץ, התאמה ל־JSON המקורי, SHA-256 וגודל, Root קבוע וללא Draco/Meshopt. סך 19 קובצי ה־GLB: 14,882,940 בתים. [provenance.json](verification/provenance.json) מפרט חתימות לכל קובצי המסירה ולתלויות הקיימות.

## מגעי קרקע, מסלול ופניות

הנכס הוא תנועה במקום. לצורך מדידת החלקה פיזיקלית, המתאם מפעיל פעם אחת את `referenceTravel.samples` — מיקום וכיוון חיצוניים של השחקן — על השלד המקורי. הסוליה נמדדת בעולם מול העוגן הראשון בכל חלון תמיכה; בדיקת הדרישה משתמשת גם בסטייה תלת־ממדית. ה־Root המקורי והפוזה המקומית נשמרים בנפרד ומאומתים. כיוון פניות 45/90/180 מעלות שייך לאותו מסלול חיצוני; הוא אינו ערוץ סיבוב Root בנכס.

המדידה מתייחסת לנקודת הסוליה המוצהרת `[0,-.08,0]`, לפרקי השלד ולחלונות התמיכה המוצהרים; היא אינה בדיקת התנגשויות מלאה של משטחי העור. ב־run_ball מסלול כדור עצמאי ומגעי נעל נבדקים במועדים המדויקים. עיצוב ידיים/אצבעות מגיע מהדמות הקיימת; בשלד 18 העצמות אין עצמות אצבעות.

## רציפות בין קליפים

ה־API ב־`runtime/player.mjs` מספק גשר Hermite C1 המשמר פוזה ומהירות בין כל זוג קליפים, עם טיפול בקטיעת ערבוב פעיל. נבדקו **361 זוגות סדורים** בשלוש בחירות של שלבי כניסה/יציאה ועוד קטיעה לכל זוג: **1444 גשרים**, 1444 עברו. המדידה קוראת את ערכי FLOAT מתוך ה־GLB בפועל ודוגמת את הגשרים ב־240 הרץ.

שגיאת פוזת קצה מרבית: 3.415e-6 מעלות; שארית מהירות זוויתית מרבית: 1.136e-5 רדיאנים/שנייה. Root נשאר קבוע לאורך כל הגשרים. [הראיות המלאות](verification/transitions.json) כוללות ספים, חתימות נכסים וכל זוג שנדגם.

נבדקו גם 4 חיבורים ישירים בין קליפי ההאצה/ההאטה לבין עמידה וריצה, לפי הפריימים הסמוכים בקבצים האפויים: 4 עברו. שארית המהירות הזוויתית המרבית בחיבורים אלה: 1.292e-6 רדיאנים/שנייה.

יש להפעיל את API הגשר בעת החלפת קליפים ולחדש את היעד מהשלב שנבחר. מדידת C1 זו נפרדת מהחלקת הרגליים בחלונות התמיכה. ערבוב שרירותי תוך הזזת השחקן בעולם דורש גם שמירת עוגני מגע ב־IK עד שחרור התמיכה; גשר מקומי לבדו אינו מבטיח סטיית סוליה עד 2 ס״מ במהלך כל ערבוב אפשרי. החבילה אינה מחוברת לקוד המשחק.

## תצוגה ושחזור

נטענו כל 19 הקליפים ונוצרו 19 גליונות בני שמונה פריימים. דפדפן: 0 שגיאות; גלילה אופקית בטלפון: לא נמצאה; בקשות WASM/decoder: 0. הרינדור נבדק גם כשה־WebAssembly חסום. [מחשב](verification/preview-desktop.png) · [טלפון](verification/preview-mobile.png).

בהרצת הבדיקות הקיימות `npm test`: 3905 עברו, 64 דולגו, וכישלון סביבתי אחד נגרם מהיעדר קובץ Chromium ברירת המחדל של Playwright. קובץ הבדיקות היחיד שנכשל הורץ שוב עם Chromium המותקן ועם הגדרת `ISLAND_PLAYWRIGHT` הקיימת: 5/5 עברו. קוד הבדיקות והטענות לא שונו; החבילה המלאה לא הורצה מחדש בתצורת הדפדפן החלופית. [פקודות ותוצאות מדויקות](verification/checks.json).

פקודות ההפקה והצפייה ב־[README.md](README.md). כל התוצרים נמצאים בתיקייה החדשה בלבד; אין שינוי בקוד קיים, release, תגי גרסה, CLAUDE.md, ops או בדיקות. התנועות והתרומות החדשות CC0-1.0; הדמות הקיימת CC0 ותלויות Three.js הקיימות MIT, כמפורט ב־LICENSES.md.
