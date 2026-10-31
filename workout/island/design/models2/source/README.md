# שחזור חבילת v2

Blender 4.3.2, Node 22+, Chromium וגרסאות Node המוצמדות ב־`package.json`. ההפקה קוראת את `../../models/source/` היחסי לתיקייה זו; נדרש עץ המאגר המלא. אין כתיבה מחוץ ל־`models2/`.

1. מתקינים את תלויות `package.json` בתיקיית כלים נפרדת. אין לשמור `node_modules` במאגר. `--modules` בכל הפקודות מצביע לתיקייה שמכילה `package.json` ו־`node_modules`.
2. משורש המאגר מריצים לפי הסדר:

   ```sh
   blender -b -t 6 --python workout/island/design/models2/source/build.py
   node workout/island/design/models2/source/compress.mjs --modules /absolute/tooling
   node workout/island/design/models2/source/validate.mjs --modules /absolute/tooling
   node workout/island/design/models2/source/browser-check.cjs --modules /absolute/tooling
   node workout/island/design/models2/source/package-report.mjs
   ```

3. נדרשים `allPassed: true` ב־`validation.json`,‏ `browser-validation.json` ו־`package-budget.json`, אפס שגיאות בשתי סדרות פלט ה־Validator, ומעבר חזותי על שש תמונות הטלפון ועל גיליון האביזרים. טבלת המדידות נכתבת מחדש ב־`VALIDATION.md`. `CHROMIUM_PATH` מאפשר לבחור דפדפן במקום `/usr/bin/chromium`.

הייצוא מ־Blender הוא שלב ביניים. בחבילת Blender המותקנת כאן חסרה ספריית Draco הפנימית, ולכן **חובה** להריץ את `compress.mjs`; קבצי הביניים אינם קובצי המסירה. הקידוד העצמאי משתמש ב־Edgebreaker, מהירות קידוד/פענוח 5, מיקום 16 bits, נורמל 10 וצבע 8. האימות נכשל אם אין Draco נדרש בכל primitive. המפענח העצמאי מסיר את ההרחבה בזיכרון, כותב GLB מפוענח ומעביר גם אותו ל־glTF Validator. העותק המפוענח אינו נשמר בחבילה.

AO מחושב מחדש באמצעות BVH, שמונה קרני חצי־כדור דטרמיניסטיות למרכז כל פאה, בטווח 4 מ׳ באצטדיון ו־1.4 מ׳ בשאר הנכסים. הכפלה מוגבלת ל־0.68–1 נשמרת ב־`COLOR_0`; אין מפות UV או טקסטורות AO. צבעי הלוחות והעצים משתמשים ב־seed קבוע. זו הצללה סטטית של הגאומטריה בלבד; אין בה צל של שחקנים נעים.

התצוגה טוענת את קובצי המסירה עם GLTFLoader ומפענח Draco המקומיים של המאגר. הבדיקה מפעילה שרת loopback זמני, מצלמת 390×844 ו־844×390, בודקת שינוי תמונה בסיבוב וחזרה מדויקת באיפוס, ומשווה משולשים ו־draw calls של Three.js למדידות הפענוח העצמאי. כל 15 האביזרים נטענים ומרונדרים בנפרד. ההוכחה היא אמולציית viewport ב־Chromium/SwiftShader; אין כאן מדידת FPS, זיכרון GPU או ביצועי טלפון פיזי.
