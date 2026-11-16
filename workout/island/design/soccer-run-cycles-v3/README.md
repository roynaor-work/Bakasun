# מחזורי ריצה לכדורגל · 3

חבילת תנועה עצמאית על שלד קנוני בן 18 עצמות. [תצוגה](preview.html), [קטלוג](catalog.json), [דוח מסירה ומדידות](REPORT.md), [דוח QA המקורי](verification/qa/report.html), [רישיונות](LICENSES.md).

מגישים את שורש המאגר בשרת מקומי ופותחים את `workout/island/design/soccer-run-cycles-v3/preview.html`. התצוגה מיועדת גם לחלון 844×390, עם בחירת קליפ, עצירה, חיפוש בזמן, מצלמות ותמיכות בעולם. כל GLB עצמאי ומכיל רשת, חומרים, skin ואנימציה.

```sh
python3 -m http.server 8765
```

```text
http://localhost:8765/workout/island/design/soccer-run-cycles-v3/preview.html
```

## הפקה ובדיקה

```sh
node workout/island/design/soccer-run-cycles-v3/source/build.mjs
node workout/island/design/soccer-run-cycles-v3/measure.mjs
node workout/island/design/soccer-run-cycles-v3/source/dense-support.mjs
node workout/island/design/soccer-run-cycles-v3/source/check-transitions.mjs
node workout/island/design/soccer-run-cycles-v3/source/audit-glb.mjs
node workout/island/design/soccer-run-cycles-v3/source/capture.mjs
```

כלי המדידה מחלץ זמנית את כלי QA המקורי מתוך קומיט Git נעול. נדרשים Node 24 ו־Git; לצילום נדרשים Playwright ו־Chromium. נתיבי תלות חיצוניים ניתנים להגדרה בסקריפטים. כלי בדיקת GLB משתמש ב־gltf-validator חיצוני ומדווח על הגרסה בפלט. אין צורך במפענח דחיסה בזמן צפייה.

## צריכה

היחידות מטרים, Y למעלה, Z קדימה, X לשמאל אנטומי. סדר העצמות, ההורות ומיקומי המנוחה זהים לחוזה הקנוני. כל פוזה כוללת סיבובים מקומיים מוחלטים בפורמט quaternion ‏xyzw והיסט מוחלט של Hips. הנכסים נדגמים ב־120Hz; תרגום ליניארי וסיבוב ב־slerp בין המפתחות.

Root נשאר במקור. הסימולציה מזיזה את הדמות לפי המהירות הרצויה. `referenceTravel` הוא תרחיש מדידה חיצוני: יש להחיל אותו פעם אחת בתצוגת בדיקה, ואין לחברו שוב למסלול שכבר מסופק מהמשחק. בריצת שופט מפעילים קצב קליפ של `speed / 5`, כולל שינוי זמן האירועים וחלונות התמיכה יחד.

גשרי ההאצה והבלימה כוללים שלבי הצבת רגליים ומסלול עולם מתאים. `nativeHandoff` מציין את פאזת המקור ואת פאזת היעד המדויקות. הבקר ב־[runtime/player.mjs](runtime/player.mjs) מספק דגימה, גשר Hermite ורציפות בעת קטיעה. נעילת העולם נמדדת בגשרים האפויים ובחלונות התמיכה המוצהרים; לגשר Hermite כללי יש להוסיף את אילוצי התמיכה של הצרכן.

סמני תפיסה הם אירועי תצוגה. מיקום כדור המשחק, בעלות ותוצאת תפיסה נשארים בשליטת הסימולציה.
