# בנייה ואימות — hoops-motion-v10

כל המקור והפלטים החדשים נמצאים בתיקייה זו בלבד. כלי הפיתוח מותקנים ב־`/tmp`; אין צורך לשנות את `package.json` או את קובצי הנעילה של המאגר.

## תלויות

נדרשים Node.js, Python 3 לצפייה ידנית ו־Chromium לבדיקת הדפדפן. גרסאות כלי הבנייה והאימות:

```sh
npm install --cache /tmp/hoops-v10-npm-cache --prefix /tmp/hoops-v10-tools --no-audit --no-fund @gltf-transform/core@4.2.1 three@0.160.1 gltf-validator@2.0.0-dev.3.10 playwright@1.56.1 sharp@0.35.5
```

`sharp` משמש לפענוח תמונות האימות. Three.js ו־GLTFLoader של התצוגה נקראים מהעותקים שכבר קיימים ב־`hoops-motion-v8/runtime/vendor/` ברישיון MIT. כלי הבנייה אינם מועתקים לחבילה ואין צורך בכלי דחיסה או במפענח WASM בזמן הריצה.

## מקור הדמויות

`runtime/rig.json` ו־`runtime/models/{guard,wing,center}.glb` מקורם ב־`workout/island/design/hoops-tall-v1/`, commit `cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa`. קובצי המודלים זהים לעותקי `runtime/` במקור. הגופים בגובה 1.88, 1.98 ו־2.08 מטר; לכל אחד 18 עצמות, סיבובי קשירה בזהות ואורכי איברים משלו. יש לשמר את מידות הפרופיל. פרטי האנטומיה של MakeHuman CC0 והתוספות המקוריות מפורטים ב־[LICENSES.md](../LICENSES.md).

## סדר הפעלה

כל הפקודות הבאות מופעלות משורש המאגר. ברירת המחדל של הכלים היא `/tmp/hoops-v10-tools`. בשימוש בתיקייה אחרת יש להגדיר את שני המשתנים לאותו נתיב: `HOOPS_TOOLS_DIR` ליצואן ו־`HOOPS_V10_TOOLS` למאמתים.

1. יצירת 18 מהלכים מקוריים עבור כל אחד משלושת הפרופילים, באמצעות מטרות תנועה ופתרון IK אנליטי, ודגימה ב־30Hz:

```sh
node workout/island/design/hoops-motion-v10/source/author.mjs
```

2. יצוא 54 קובצי GLB של אנימציה, ללא דחיסת גאומטריה וללא תלות במפענח:

```sh
node workout/island/design/hoops-motion-v10/source/export-glb.mjs
```

3. אימות עצמאי של הפלטים שנמסרו:

```sh
node workout/island/design/hoops-motion-v10/source/verify.mjs
```

4. טעינת כל הביצועים על שלוש הדמויות ב־Chromium, ובדיקת תצוגה במחשב ובטלפון תחת CSP שחוסם WASM:

```sh
node workout/island/design/hoops-motion-v10/source/verify-browser.mjs
```

בדיקת הדפדפן מפעילה שרת HTTP מקומי בעצמה. ברירת המחדל לדפדפן היא `/usr/bin/chromium`; ניתן להחליפה באמצעות `CHROMIUM_PATH`. צילום באמצעות SwiftShader אינו מדידת ביצועים של כרטיס גרפי או של טלפון.

5. לאחר שכל המדידות עוברות, מייצרים מחדש את הדוח ורשימת הרישיונות ומריצים שוב את קריאת כל הקבצים הסופיים:

```sh
node workout/island/design/hoops-motion-v10/source/document.mjs
node workout/island/design/hoops-motion-v10/source/verify.mjs
```

## מה נבדק

`verify.mjs` קורא את הנכסים הקיימים ואינו מייבא את מחולל התנועה. הוא משווה את ערוצי ה־GLB ל־JSON, מריץ glTF Validator, בודק את השלד והקצב ב־30Hz, מחשב תנועת סוליות בעולם גם בין הדגימות ב־120Hz, ובודק את הושטת היד בהטבעה ואת עליית האגן. בדיקות המשטח משתמשות במשקולות העור של שלוש הדמויות בפועל. סף הנטיעה הוא 0.02 מטר. גבולות המדידה והמספרים שנמדדו נמצאים ב־[REPORT.md](../REPORT.md).

מעבר לקריאת כל קובצי ה־GLB וה־JSON, המאמת קורא כל קובץ בחבילה, בודק תחביר JavaScript ומפענח את תמונות האימות. `verify-browser.mjs` טוען את כל 54 אנימציות ה־GLB, שלוש הדמויות ונתוני המגע; הוא דוגם פוזות על המשטחים ומצלם את התצוגה. הפלטים נכתבים אל `verification/measurements.json`, `verification/gltf-validation.json` ואל קובצי הדפדפן והצילומים באותה תיקיית אימות.

## חוזה יצוא

כל GLB כולל `Motion`, את 18 העצמות ו־`Ball`, ללא גאומטריית דמות. הזזות המנוחה שלו תואמות לפרופיל המסוים; ערוץ האגן כולל את המנוחה וההיסט. זמן glTF הוא בשניות, וזמן JSON מנורמל. הערוצים משתמשים ב־LINEAR; סיבובים נדגמים ב־SLERP. תנועת העולם נכתבת רק לערוצי `Motion`; העצם `Root` נשארת בזהות. נתוני מגע, שלבי כדור ואירועים נכתבים גם ב־extras. בניגון על דמות יש ליצור קבוצת `Motion` ולתת למערבל את האנימציה מהקובץ, כפי שמוצג ב־[README.md](../README.md).
