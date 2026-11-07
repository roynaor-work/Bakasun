# שחזור החבילה

הגאומטריה והחומרים נוצרו במיוחד לחבילה זו, ללא נכסים שהורדו וללא מרקמים.
קובצי ה־GLB בתיקיית `runtime/` הם קובצי המסירה והטעינה, ללא Draco או meshopt.

## יצירה

מתיקיית `ship-chase-models-v1/`, באמצעות Blender ‏4.3.2:

```sh
blender -b -t 1 --python source/generate_ship_props.py
blender -b -t 1 --python source/generate_vehicles.py
```

שני הסקריפטים עצמאיים ומייצאים שבעה קבצים. אין צורך בתוסף צד שלישי.
הסקריפטים עובדים במטרים, עם Z למעלה ו־‎-Y קדימה ב־Blender;
הייצוא ממיר ל־‎+Y למעלה ו־‎+Z קדימה ב־glTF.
גרסת Blender אחרת עשויה לייצר סדר בינרי שונה, ולכן אחרי יצירה מחדש יש להריץ שוב את המדידות.

## אימות

הבדיקה הראשונה משתמשת ישירות ב־GLTFLoader הקיים במאגר, ללא חבילות נוספות:

```sh
node verification/check-assets.mjs
```

לבדיקת תקן ולבדיקת דפדפן יש להתקין את הגרסאות המוצמדות המפורטות
ב־`verification/package.json` בתיקיית כלי עבודה חיצונית:

```sh
npm install --prefix /tmp/ship-chase-tooling --cache /tmp/ship-chase-npm-cache --no-audit --no-fund playwright@1.58.2 gltf-validator@2.0.0-dev.3.10
node verification/khronos-check.mjs --modules /tmp/ship-chase-tooling
node verification/browser-check.mjs --modules /tmp/ship-chase-tooling
```

בדיקת הדפדפן משתמשת ב־Chromium המותקן במערכת, וב־Python 3 עם Pillow
לשמירת צילומי WebP. ברירת המחדל היא `/usr/bin/chromium`; אפשר לספק נתיב אחר
במשתנה `CHROMIUM_PATH`. פרטי ההרצה מופיעים בסקריפט הבדיקה.
הבדיקה מריצה שרת מקומי ומסיימת אותו בסוף.
הספריות וכלי הבדיקה אינם חלק מקובצי המסירה.

## פתיחת התצוגה

מהשורש של המאגר:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

פותחים בדפדפן:

```text
http://127.0.0.1:8765/workout/island/design/ship-chase-models-v1/preview.html
```

בתצוגה אפשר לראות את כל שבעת המודלים יחד, למקד מודל דרך הטבלה,
לסובב את המבט, ולהשהות את סיבוב הגלגלים והקנים.
הספריות נטענות מהקבצים הקיימים ב־`workout/island/vendor/`.
ב־sparse checkout יש לכלול גם תיקייה קיימת זו כדי לפתוח ולבדוק את התצוגה.
