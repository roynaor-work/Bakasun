# מרדף הכבאית v1

חבילת נכסים ותצוגת עיצוב ל־`workout/island`. כל קובצי החבילה חדשים; החיבור למשחק הפעיל נפרד.

1. מתוך התיקייה הזו הפעילו:

   ```sh
   python3 -m http.server 8765
   ```

2. פתחו [preview.html](http://localhost:8765/preview.html) בדפדפן, בחלון ‎844×390.
3. הפעילו את המשימה: נסיעה בכביש, הגעה, כניסה דרך הדלת וכיבוי מול אותו שעון. הממשק מסביר את הבקרים; אפשר להשהות, להתחיל מחדש ולהפעיל קול. ספריית הנכסים מציגה גם אריחים ורכבים שאינם במסלול הנסיעה הראשי.

אין התקנת חבילות, build או CDN לפתיחת התצוגה. נדרש HTTP מקומי משום שדפדפנים מגבילים טעינת מודולי JavaScript ונכסי GLB דרך `file://`.

המסירה המכונתית היא [manifest.json](manifest.json): נתיבים, SHA-256, משקלים, יחידות, צמתים, קליפים, יציאות כביש, אזורי לולאה ועוצמות קול מדודות. [REPORT.md](REPORT.md) כולל תוצאות בדיקות ומגבלות, ו־[LICENSES.md](LICENSES.md) כולל מקור ורישוי.

לשחזור נכסים, מתוך התיקייה הזו (Blender 4.3.2, Python/NumPy ו־FFmpeg):

```sh
blender -b --python scripts/generate_truck.py
blender -b --python scripts/generate_environment.py
python3 scripts/generate_audio.py
```

לאימות ולרענון חתימות:

```sh
node scripts/validate_assets.mjs
python3 scripts/build_manifest.py
```

פרטי התקנת Khronos Validator המקובע מופיעים בראש סקריפט הבדיקה. בדיקת התצוגה נמצאת ב־`scripts/verify_preview.mjs`; אפשר לכוון את `PLAYWRIGHT_MODULE` ו־`CHROMIUM` להתקנות המקומיות. המניפסט, הדוח וצילומי ה־QA הסופיים מצורפים, ולכן אין צורך להריץ כלי יצירה כדי לבחון את החבילה.
