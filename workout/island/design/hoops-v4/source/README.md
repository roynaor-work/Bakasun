# הפקה ואימות חוזרים

הפקה מתוך נכסי המקור המקומיים במאגר; אין צורך להוריד מחדש MakeHuman או קובצי BVH. נדרשים Blender 4.3.2,‏ Node 22 ומעלה, Python עם Pillow, ו־Chromium. התלויות ב־[package.json](package.json) משמשות להפקה ולאימות בלבד.

משורש המאגר מתקינים כלי עבודה מחוץ לתיקיית המסירה:

```sh
npm install --prefix /tmp/hoops-v4-tools --package-lock=false @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 draco3dgltf@1.5.9 gltf-validator@2.0.0-dev.3.10 sharp@0.35.5 playwright@1.62.1
```

בונים את הנכסים, ואז דוחסים את קובצי הייצוא:

```sh
blender -b -t 6 --factory-startup --python workout/island/design/hoops-v4/source/build_characters.py
node workout/island/design/hoops-v4/source/compress_characters.mjs --modules /tmp/hoops-v4-tools
blender -b -t 6 --factory-startup --python workout/island/design/hoops-v4/source/build_arena.py
node workout/island/design/hoops-v4/source/compress_arena.mjs --modules /tmp/hoops-v4-tools
```

מאמתים את ה־GLB, מצלמים בפועל דרך התצוגה ומפיקים מניפסט ומשקלים:

```sh
node workout/island/design/hoops-v4/source/validate.mjs --modules /tmp/hoops-v4-tools
node workout/island/design/hoops-v4/source/capture.mjs --playwright /tmp/hoops-v4-tools/node_modules/playwright/package.json --executable /usr/bin/chromium
node workout/island/design/hoops-v4/source/package.mjs
```

יש להתאים את נתיב Chromium למערכת. סקריפט הצילום מפעיל שרת HTTP מקומי זמני בעצמו, חוסם בקשות חיצוניות, ומסיים אותו בתום הריצה. צילומי המסך נלקחים מה־GLB הדחוסים המסופקים; אין הוספת דמויות או פרטי גאומטריה בתוכנת תמונות. Pillow משמשת להמרה ל־WebP ולסידור גיליונות התצוגה בלבד.

`validate.mjs` מפענח את כל הנכסים ובודק גם את הקובץ הדחוס וגם גרסה מפוענחת באמצעות Khronos glTF Validator. דוח האימות מתעד גודל, גיבוב, גובה בפוזת המנוחה, שלד, קליפים, מרקמים ומשקלים. דוח הדפדפן מתעד טעינה, החלפת צבעים וקליפים, פקדי תצוגה, מידות טלפון וצילומים. מדידת CPU באמצעות Chromium ו־SwiftShader אינה מדידת GPU או FPS בטלפון פיזי.

לאחר שינויים בתצוגה או בנכסים מריצים שוב את הבדיקה הנוגעת לשינוי, ואז `package.mjs` לעדכון המניפסט והגיבובים. בדיקות המאגר הכלליות מופעלות בנפרד משורש המאגר באמצעות `npm test`.

כלי הבנייה כותבים בתיקייה זו וב־`/tmp/hoops-v4-players/`. קובצי המקור המשותפים תחת `models/`,‏ `models2/`,‏ `assets/` ו־`vendor/` נקראים בלבד.
