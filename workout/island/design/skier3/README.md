# גולש סקי · v3

[skier.glb](skier.glb) הוא גולש מונפש ועצמאי, עם גוף וביגוד מפורטים, קסדה, משקף, מגפיים, תופסנים, מגלשיים ושני מקלות עם ידיות וסלסילות. הגאומטריה המפורטת מגיעה מהגולש המקורי ב־[characters2](../characters2/README.md); השלד הותאם ל־18 עצמות, הקליפים הוטמעו ונוספו מקלות. כל המקורות ברישיון CC0-1.0.

| מדד | תוצאה |
| --- | ---: |
| גודל GLB | 424,676 bytes |
| משולשים מצוירים, כולל שני המקלות | 24,918 |
| עצמות בשלד | 18 |
| קליפים מוטמעים | 5 |
| טקסטורות | 0; צבעי קודקודים |
| דחיסה | Draco נדרש בכל primitive |

המספרים וה־SHA-256 העדכניים נמצאים ב־[manifest.json](manifest.json), והבדיקה העצמאית ב־[verification/assets-report.json](verification/assets-report.json).

## צפייה

1. הפעילו שרת מקומי משורש המאגר:

   ```sh
   node workout/island/design/skier3/tools/verify-browser.mjs --serve
   ```

2. פתחו את [הצופה המקומי](http://127.0.0.1:8766/design/skier3/viewer.html).
3. בחרו קליפ, השהו או הזיזו את ציר הזמן. הציפייה: כל חמש הפעולות נראות, המגלשיים והמקלות מחוברים, וטעינת הנכסים מסתיימת ללא שגיאות.

הצופה משתמש ב־three.js ובמפענח Draco המקומיים. אין צורך בחיבור לאינטרנט לאחר שהמאגר נמצא במחשב. מצב „על ההר” מציג את הסקיאר בעולם המשותף; „ספריית נכסים” מאפשרת לסובב, לבדוק ולהוריד כל אחד מ־13 קובצי ה־GLB. גרירה מסובבת, גלילה או צביטה משנות זום, וכפתור המצלמה מאפס את המבט.

[דוח המסירה וספירת המשולשים](verification/report.md) · [צילומי כל הקליפים](verification/motion-contact-sheet.webp)

## הקליפים

| שם GLB | פעולה | משך | ניגון | נתוני המקור |
| --- | --- | ---: | --- | --- |
| `glide` | גלישה | 1.20 שנ׳ | לולאה | `motion/alpine.json / glide` |
| `crouch` | כריעת מהירות | 1.20 שנ׳ | לולאה | `motion2/alpine/alpine.json / tuck` |
| `boost` | דחיפה בשני מקלות | 0.80 שנ׳ | לולאה | `motion/alpine.json / pole_push` |
| `fall` | נפילה קדימה | 1.10 שנ׳ | פעם אחת | `motion2/alpine/alpine.json / fall_forward` |
| `get_up` | קימה מהשלג | 1.90 שנ׳ | פעם אחת | `motion2/alpine/alpine.json / recover_forward` |

ב־GLB נשמרה פוזת הסיום של הנפילה כפוזת הפתיחה של הקימה. יש לנגן את שתי הפעולות עם `LoopOnce` ו־`clampWhenFinished`, ולהתחיל את הקימה לאחר סיום הנפילה. שלוש הלולאות חוזרות לאותה פוזה בקצוות. תנועה בעולם והפעלת הבוסט נשארות בבעלות הסימולציה; הקליפים אינם מפעילים פיזיקה, ניקוד או תזוזה קדימה.

האפייה מכילה כל מפתח מקור ובנוסף דגימות של 60Hz. היא מפעילה את מתאם התנועה הקיים, כולל כיול עצמות, IK ותיקון רצפה, ושומרת את התוצאה כערוצי translation/rotation רגילים ב־glTF. אין צורך במתאם כדי לנגן את חמש האנימציות המוטמעות.

## חוזה 18 העצמות

השמות, הסדר ב־skin וההורות זהים ל־`skeleton.bones` ב־[motion2/alpine.json](../motion2/alpine.json):

```text
Root → Hips → Spine → Chest → Neck → Head
Chest → LeftArm → LeftForeArm → LeftHand
Chest → RightArm → RightForeArm → RightHand
Hips → LeftUpLeg → LeftLeg → LeftFoot
Hips → RightUpLeg → RightLeg → RightFoot
```

היחידות הן מטרים, `+Y` למעלה ו־`+Z` קדימה. תנוחת המנוחה והפרופורציות מכוילות לגולש המפורט. [rig.json](rig.json) מכיל את הטרנספורמציות, inverse bind matrices ובסיסי ההתאמה המספריים. אין להעתיק סיבובי JSON קנוניים ישירות אל צירי המנוחה של הגולש; להוספת קליפים יש לבצע את אותו כיול עולמי המתועד בקובץ.

שתי עצמות הכתפיים המסייעות של המקור הוסרו. טרנספורמציית הזרוע חושבה מחדש מול החזה, ומשקלי הכתף הועברו לחזה: הכתפיים במקור יורשות את החזה קשיח ולכן פעולת העור שלהן שקולה. אורכי הגפיים ו־inverse bind matrices של 18 העצמות שנשארו נשמרו. לכל קודקוד עד ארבע השפעות מנורמלות.

`LeftPole` ו־`RightPole` הם צומתי mesh המחוברים לכפות הידיים; הם אינם עצמות נוספות. לכל מקל היסט אחיזה בכף היד וערוצי סיבוב מוטמעים, המטים אותו לאחור כשהיד קרובה לשלג. בנפילה ובקימה נוסף תיקון אחיזה מרבי של 4.981 מ״מ בתוך כף הכפפה, כדי שגם שפת הידית תישאר מעל השלג. זוהי תנועת ציוד חזותית, ולא פתרון דינמי של מגע או כוח דחיפה.

## בנייה חוזרת

מתקינים מחוץ למאגר את שלוש התלויות המדויקות מ־[source/package.json](source/package.json), ואז מריצים משורש המאגר:

```sh
node workout/island/design/skier3/source/build.mjs --modules /tmp/alpine-tools/package.json
```

הבנייה כותבת רק `skier.glb`, `manifest.json` ו־`rig.json` בתיקייה זו. המקורות הקיימים נקראים בלבד, וחותמותיהם נרשמות ב־manifest. קובץ ה־GLB הסופי מכיל את כל הגאומטריה והאנימציה ללא הפניות למשאבים חיצוניים.

## אימות חוזר

תלויות הבדיקה המדויקות רשומות ב־[tools/package.json](tools/package.json). מתקינים אותן מחוץ למאגר. Chromium נדרש לבדיקת הדפדפן; אפשר לבחור אותו באמצעות `PLAYWRIGHT_EXECUTABLE_PATH`, ואת Playwright באמצעות `PLAYWRIGHT_MODULE`.

```sh
node workout/island/design/skier3/tools/validate-assets.mjs --modules /tmp/alpine-tools
node workout/island/design/skier3/tools/verify-browser.mjs --modules /tmp/alpine-tools
npm test
node workout/island/design/skier3/tools/report.mjs
```

הבודק העצמאי בודק את 13 הקבצים הסופיים, דחיסה, גדלים, מרקמים, משולשים, skin, מטריצות bind, ערוצי תנועה והצמדת נפילה לקימה. בודק הדפדפן מפעיל שרת המוגבל ל־localhost ולנתיבי הנכסים, חוסם בקשות חיצוניות ומפיק דוח וצילומי WebP בשלושה גדלי מסך. `report.mjs` מסרב להפיק סיכום אם חותמות הקבצים, המקורות או התמונות אינן תואמות לדוחות. `repository-tests.json` מתעד את הרצת בדיקות המאגר שסופקה במסירה; בהרצה חדשה יש לעדכן אותו לפי תוצאת `npm test` בפועל.
