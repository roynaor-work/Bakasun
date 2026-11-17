# שחזור ובדיקות

מריצים את הפקודות משורש המאגר. כלי העבודה מותקנים מחוץ למאגר כדי לשמור על תחום השינוי ועל מגבלת המשקל. דרושים Node.js, Python 3 עם NumPy ו־Pillow, Blender ו־Chromium.

```sh
npm install --prefix /tmp/racing-podium-tools --cache /tmp/racing-podium-npm-cache --no-package-lock --no-audit --no-fund three@0.160.0 @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 gltf-validator@2.0.0-dev.3.10 draco3dgltf@1.5.9 meshoptimizer@0.24.0 esbuild@0.25.12 playwright@1.56.1
```

המקורות האנטומיים הקיימים נקראים ללא שינוי. קובצי ביניים גדולים נשמרים תחת `/tmp/racing-podium-raw/`.

```sh
python3 workout/island/design/racing-podium-v1/source/build-driver-mesh.py
node workout/island/design/racing-podium-v1/source/build-drivers.mjs
blender -b -t 1 -P workout/island/design/racing-podium-v1/source/build-props.py
python3 workout/island/design/racing-podium-v1/source/build-effects.py
```

אחרי בנייה מחדש מריצים מחדש את הבדיקות, כדי שה־SHA-256 בדוחות יתאים לנכסים שנמסרים. בודק התנועה קורא שישה מודולים מקוריים של `motion-qa-v1` מהקומיט המקובע בקוד, מעתיק אותם לתיקייה זמנית, ומחליף רק את מתאם הקלט. אם הקומיט עדיין לא קיים מקומית, הסקריפט מבצע fetch לענף הכלי. הספים, המשקולות, הדגימה והניקוד של הכלי אינם משתנים.

```sh
node workout/island/design/racing-podium-v1/source/validate-glb.mjs
node workout/island/design/racing-podium-v1/source/run-qa.mjs
node workout/island/design/racing-podium-v1/source/verify-browser.mjs
```

התצוגה משתמשת בספריות Three.js הקיימות במאגר, ללא CDN. לפתיחה ידנית:

```sh
python3 -m http.server 8765
```

פותחים את [התצוגה המקומית](http://localhost:8765/workout/island/design/racing-podium-v1/preview.html). בוחרים נהג או נהגת, בוחרים תנועה, ומשתמשים בהשהיה ובפס הזמן לבדיקה. התצוגה תוכננה ונבדקה ב־844×390; בדיקות הדפדפן משתמשות בשרת זמני משלהן.

בסיום, אחרי הוספת קבצי החבילה ל־staging ועדכון הדוח, מייצרים מניפסט משקל ו־hashes. המחולל בודק שלא נוספו שינויים מחוץ לתיקייה, שהבדיקות עברו, שהנכסים תואמים ל־hashes שנבדקו ושכל התיקייה קטנה מ־4,000,000 בתים.

```sh
node workout/island/design/racing-podium-v1/source/finalize.mjs
```

`manifest.json` מתעד את כלל קובצי החבילה מלבד עצמו באמצעות SHA-256. משקלו שלו כלול בתקציב הכולל. `REPORT.md` מתעד את התוצאות ואת גבולות הבדיקה; בדיקה אוטומטית אינה אישור לביצועים בטלפון פיזי.

## מקרה דפדפן קיים בסביבה ללא Chromium של Playwright

בהרצת הריפו הכללית, מקרה הדפדפן של `workout-royiki` נכשל עקב חוסר בדפדפן המצורף ל־Playwright. הקובץ החדש `system-chromium.mjs` בוחר את הדפדפן המותקן דרך נקודת ההרחבה הקיימת של עזר הבדיקות; הוא אינו מחליף או מחליש קביעות. כך שוחזרה בהצלחה הבדיקה הקיימת:

```sh
ISLAND_PLAYWRIGHT="$PWD/workout/island/design/racing-podium-v1/source/system-chromium.mjs" node --test tests/workout-royiki.test.mjs
```
