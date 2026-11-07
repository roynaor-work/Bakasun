# כדורגל · תנועות v10

30 קליפים על שלד motion2 בן 18 עצמות, ב־30Hz: שמונה חיתוכים, שמונה קבלות קצרות, שלוש הוצאות שוער, שני סיבובים עם הכדור, בלימה והאצה מחדש, שתי תנועות חיכוך, שתי תנועות הגנה צמודה ושלוש עמידות ו־run מתוקנים. הנכסים והקוד המקורי הם CC0; הדמויות בדיוניות וללא מותגים.

## צפייה

1. משורש המאגר מפעילים שרת מקומי:

   ```sh
   python3 -m http.server 8765
   ```

2. פותחים את [preview.html](http://localhost:8765/workout/island/design/soccer-motion-v10/preview.html).
3. בוחרים קליפ, לולאה או ״ריצה ← קליפ ← ריצה״. ״לפריים המגע״ עוצר באירוע הראשי. אפשר לשנות מצלמה וקצב ולגרור לפריים מסוים. ״הצג במקום״ מסיר את מסלול הייחוס החיצוני ומציג את ה־GLB כפי שצרכן המשחק יקבל אותו.

הטעינה משתמשת ב־three.js וב־GLTFLoader הקיימים ב־v8 שב־main. אין תלות ב־v9 בזמן ריצה ואין צורך ב־DracoLoader, ב־meshopt או ב־WebAssembly. ה־CSP של דף התצוגה חוסם WebAssembly ו־workers.

## חוזה חיבור

הקטלוג הוא [runtime/catalog.json](runtime/catalog.json), ופריימי המקור המלאים הם [runtime/motions.json](runtime/motions.json). כל קליפ כולל `id`, `label`, `duration`, `frameCount`, `contactFrame`, `event`, `events`, `supports`, `entry`, `exit` ו־`rootMotion:false`. בעמידות ללא מגע חדש `contactFrame` ו־`event` הם `null`; לא מומצא אירוע כדור.

הצירים הם ‎+Y למעלה, ‎+Z קדימה ו־‎+X שמאל אנטומי; היחידות מטרים. הסיבובים הם parent-local quaternion בסדר xyzw. יש 18 ערוצי סיבוב וערוץ תרגום אגן אחד. ערוץ Root נשאר זהות: אין מסלול שורש מונפש, אין שינוי קנה מידה ואין תזוזת שחקן בתוך ה־GLB.

`referenceRootMotion` הוא מסלול מדידה ותצוגה בלבד, מחוץ ל־GLB. המשחק שומר אחריות מלאה למיקום ולכיוון. אין להחיל את המסלול הזה בנוסף לבקר התנועה. מדידת הנטיעה מוסיפה אותו פעם אחת כדי להגדיר את מערכת העולם שבה העוגנים קבועים. במצב in-place כף הרגל נעה ביחס לגוף כמקובל בהנפשת ריצה; זאת אינה הבטחה לנעילה מול כל מסלול שהבקר יבחר.

`events[].frame` מתחיל ב־0; `time = frame / 30`. `local` היא נקודת המגע במערכת העצם, ו־`position` היא הנקודה לאחר תנועת הייחוס. `ball.samples` הוא שחזור חזותי לבדיקת המגע; הוא אינו פיזיקה או שינוי בעלות בכדור. `receive`, `release` ו־`contact` הם אירועים מפורשים. בבלימה יש גם `brake` ו־`accelerate`.

כל קליפ ריצה וחיתוך נכנס בפאזת `run` של v9 בזמן 0: שמאל נוגעת בקרקע, ימין באמצע הצעד. פוזת שני הפריימים הראשונים נשמרת בקליפי הפעולה. ב־run המתוקן נשמרים פאזת הרגליים ויעדי כפות הרגליים; האגן והמרפקים משתנים בכוונה.

`entry`/`exit` מציינים את קליפ הייחוס ואת הפאזה בשניות. בפעולות הרגילות הכניסה והיציאה הן התאמות מקומיות מדודות ל־run או ל־idle של v9. בעמידות המתוקנות וב־run המתוקן `editedReference:true` מציין שינוי מכוון; דף התצוגה מדגים ערבוב מפורש. אין לטעון שהזרועות המתוקנות זהות לזרועות v9.

מעברי הפעולות בדף התצוגה משתמשים ב־run המקורי של v9 כייחוס. אם בקר המשחק מחליף אותו ב־run המתוקן של v10, יש לערבב את הפוזה המוצגת במשך כ־0.1 שניות בכניסה לפעולה וביציאה ממנה, תוך שמירת פאזת הרגליים. `blendSeconds:0` בפעולה מתאר התאמה ל־v9 בלבד; הוא אינו טוען להתאמת הזרועות והאגן המתוקנים של v10.

קבלות `first_touch_*_quick` אורכות בדיוק 0.5 שניות, עם `receive` בפריים 10. הן מסתיימות בהמשך ספיגת הנגיעה ולא בחזרה לעמידה. `exit.continuation:true` ו־`blendSeconds:0.2` מגדירים את המעבר המוצג למצב הבא. היציאה הגולמית והמעבר המוצג נמדדים בנפרד בדוח.

| בחירה | גובה כדור מומלץ במטרים | גרסאות |
|---|---|---|
| חזה | 1.05–1.60 | standing / running |
| ירך | 0.45–1.05 | standing / running |
| פנים רגל | 0–0.45, הצד הפנימי | standing / running |
| חוץ רגל | 0–0.45, הצד החיצוני | standing / running |

אלה טווחי ניתוב מומלצים, לא חוקי פיזיקה. יש לבחור גם לפי מצב השחקן וכיוון הכדור. לכל קבלה `ballSelection` בקטלוג.

## הפקה ובדיקה

כל הפלט נכתב לתיקייה הזאת בלבד. ההפקה קוראת את גאומטריית v8 הקיימת ומפענחת אותה במצב לא מקוון לצורך היצוא; התוצרים עצמם אינם דחוסים. פוזות הייחוס המדויקות של v9 נשמרות כאן עם commit ו־SHA-256 ב־[verification/reference.json](verification/reference.json).

```sh
node workout/island/design/soccer-motion-v10/source/author.mjs
node workout/island/design/soccer-motion-v10/source/bake.mjs
node workout/island/design/soccer-motion-v10/source/calibrate.mjs
node workout/island/design/soccer-motion-v10/source/bake.mjs
node workout/island/design/soccer-motion-v10/verification/check.mjs --validator /tmp/v10-tools/node_modules/gltf-validator
node workout/island/design/soccer-motion-v10/verification/ground.mjs
node workout/island/design/soccer-motion-v10/verification/browser-check.mjs
node workout/island/design/soccer-motion-v10/source/report.mjs
node workout/island/design/soccer-motion-v10/verification/load-files.mjs
```

מאמת Khronos הוא כלי פיתוח חיצוני, לא קובץ בחבילה. אפשר להתקין אותו בתיקייה זמנית באמצעות `npm install --prefix /tmp/v10-tools gltf-validator@2.0.0-dev.3.10`; להרצת הדפדפן נדרשים Playwright ו־Chromium, כמפורט בראש סקריפט הבדיקה.

המסירה היא חבילת נכסים ו־PR טיוטה. Claude מחבר לאחר המיזוג ומודד שוב בבקר המשחק האמיתי. לא שונו קוד המשחק, שחרורים, תגי גרסה, ops או בדיקות קיימות.
