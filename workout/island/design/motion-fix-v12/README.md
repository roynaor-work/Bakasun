# תיקוני תנועה v12

פתחו את preview.html ואת report.html דרך שרת HTTP משורש המאגר. קטלוג החיבור המותר הוא runtime/catalog.json; חסימות מפורשות ב־blocklist.json. כל נכס הוא קובץ חדש, בלי שינוי באפליקציה.

## הפעלה מקומית

```sh
python3 -m http.server 8765
```

כתובת התצוגה: http://localhost:8765/workout/island/design/motion-fix-v12/preview.html

## שחזור

יש למשוך את עשרת המקורות המוצמדים המפורטים בדוח; מתאם המקורות משתמש ב־git show ומטמון מחוץ למאגר. מדידת המקור יוצרת את קובצי המקור הזמניים עבור הבנייה. המודלים כלולים; source-models.mjs מתעד הפקה חוזרת ופענוח רשתות אופליין.

```sh
node --max-old-space-size=8192 workout/island/design/motion-fix-v12/measure.mjs
node --max-old-space-size=8192 workout/island/design/motion-fix-v12/build.mjs
node workout/island/design/motion-fix-v12/finalize.mjs
node workout/island/design/motion-fix-v12/write-docs.mjs
node workout/island/design/motion-fix-v12/report.mjs
node workout/island/design/motion-fix-v12/verify.mjs
node --max-old-space-size=8192 workout/island/design/motion-fix-v12/audit-native.mjs
node workout/island/design/motion-fix-v12/verify-browser.mjs
node workout/island/design/motion-fix-v12/licenses.mjs
node workout/island/design/motion-fix-v12/verify.mjs --licenses-only
```

בדיקת הדפדפן משתמשת ב־Chromium מותקן וב־playwright-core מחוץ למאגר. אפשר להגדיר MOTION_PLAYWRIGHT ו־MOTION_CHROMIUM. בהיעדר חבילת הבדיקה:

```sh
npm install --prefix /tmp/motion-fix-deps --cache /tmp/motion-npm-cache --no-audit --no-fund playwright-core
```

לריצה בדפדפן אין צורך ב־npm או בפענוח דחיסה. הפלט המקורי והמתוקן בנפרד, כל קובץ מתוקן נושא חותמת motion-fix-v12. יש לקרוא את משך הפעולה החדש, coreRange, timeScale ואת אירועי המגע שבקטלוג; אין להניח שמשך מקור מואט נשאר קבוע.
