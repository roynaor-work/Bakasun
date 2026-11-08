# רישיונות ומקורות

כל הקבצים החדשים בחבילה זו הם יצירה מקורית שנוצרה לבקשת המשתמש עבור המאגר,
ומוקדשים לנחלת הכלל תחת **CC0-1.0**. אין שימוש במודלים, תמונות, מרקמים,
גופנים או סמלים שהורדו מצד שלישי. אין מותגים, סמלי רשות אמיתית או אנשים.

לכל הקבצים המפורטים להלן חל
[CC0 1.0 Universal — הנוסח המשפטי המלא](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
מותר להעתיק, לשנות ולהשתמש מסחרית ללא חובת ייחוס, בגבולות הדין.
החבילה נמסרת ללא אחריות. מקור הגאומטריה הוא הסקריפט המקומי המצוין בכל שורה;
אין כתובת הורדה חיצונית לנכסים משום שהם נבנו במקור לחבילה זו.

| קובץ | רישיון | מקור |
|---|---|---|
| `runtime/player-ship.glb` | CC0-1.0 | גאומטריה וחומרי PBR מקוריים; `source/generate_ship_props.py`, פונקציית `ship` |
| `runtime/roadblock.glb` | CC0-1.0 | גאומטריה וחומרי PBR מקוריים; `source/generate_ship_props.py`, פונקציית `roadblock` |
| `runtime/cone.glb` | CC0-1.0 | גאומטריה וחומרי PBR מקוריים; `source/generate_ship_props.py`, פונקציית `cone` |
| `runtime/police-car.glb` | CC0-1.0 | גאומטריה וחומרי PBR מקוריים; `source/generate_vehicles.py` |
| `runtime/sports-car.glb` | CC0-1.0 | גאומטריה וחומרי PBR מקוריים; `source/generate_vehicles.py` |
| `runtime/pickup.glb` | CC0-1.0 | גאומטריה וחומרי PBR מקוריים; `source/generate_vehicles.py` |
| `runtime/armored-boss.glb` | CC0-1.0 | גאומטריה וחומרי PBR מקוריים; `source/generate_vehicles.py` |
| `source/generate_ship_props.py` | CC0-1.0 | קוד יצירה מקורי ב־Python / Blender שנכתב לחבילה זו |
| `source/generate_vehicles.py` | CC0-1.0 | קוד יצירה מקורי ב־Python / Blender שנכתב לחבילה זו |
| `source/README.md` | CC0-1.0 | הוראות שחזור מקוריות לחבילה זו |
| `preview.html` | CC0-1.0 | מבנה, עיצוב וטקסט מקוריים לתצוגת החבילה |
| `preview.js` | CC0-1.0 | קוד תצוגה והנפשה מקורי לחבילה זו |
| `REPORT.md` | CC0-1.0 | דוח מקורי המבוסס על מדידות קובצי המסירה והרצות הבדיקות |
| `LICENSES.md` | CC0-1.0 | רשימת מקורות והצהרת רישוי מקורית לחבילה זו |
| `verification/check-assets.mjs` | CC0-1.0 | בדיקת גאומטריה וטעינה מקורית שנכתבה לחבילה זו |
| `verification/asset-results.json` | CC0-1.0 | פלט מדידה מקורי של `verification/check-assets.mjs` על שבעת קובצי המסירה |
| `verification/khronos-check.mjs` | CC0-1.0 | מעטפת בדיקה מקורית; אינה כוללת את ספריית Khronos עצמה |
| `verification/gltf-results.json` | CC0-1.0 | תוצאות הרצת `verification/khronos-check.mjs` על שבעת קובצי המסירה |
| `verification/browser-check.mjs` | CC0-1.0 | קוד בדיקת דפדפן וצילום מקורי שנכתב לחבילה זו |
| `verification/browser-results.json` | CC0-1.0 | מדידות מקוריות של טעינה, רינדור ותנועה באמצעות `verification/browser-check.mjs` |
| `verification/overview.webp` | CC0-1.0 | צילום מקורי של `preview.html` ב־Chromium; שבעת המודלים המקוריים יחד |
| `verification/mobile.webp` | CC0-1.0 | צילום מקורי של `preview.html` ב־Chromium, רוחב 390 פיקסלים |
| `verification/detail-player-ship.webp` | CC0-1.0 | צילום מקורי של מודל החללית בתצוגת החבילה ב־Chromium |
| `verification/detail-police-car.webp` | CC0-1.0 | צילום מקורי של מודל הניידת בתצוגת החבילה ב־Chromium |
| `verification/package.json` | CC0-1.0 | רשימת תלויות בדיקה מקורית; אין חבילות צד שלישי כלולות בחבילה |

## תוכנה קיימת וכלי עבודה שאינם נמסרים כחלק מהחבילה

התצוגה והבדיקה מייבאות את Three.js r160 ואת GLTFLoader מהקבצים **הקיימים**
ב־`../../vendor/`, לרבות תלות GLTFLoader ב־BufferGeometryUtils.
המקור הוא [פרויקט Three.js](https://github.com/mrdoob/three.js/tree/r160),
ברישיון **MIT**; ההודעה המלאה שמורה במאגר ב־[LICENSE.three](../../vendor/LICENSE.three).
לא הועתקה ספרייה זו לתיקיית החבילה ולא נעשה שימוש במפענחי Draco או meshopt.
גופן הממשק הוא גופן המערכת של הצופה, ללא קובץ גופן בחבילה.

הגאומטריה נבנתה ב־[Blender](https://www.blender.org/about/license/),
והרינדור והבדיקות השתמשו ב־Chromium, ב־[Playwright](https://github.com/microsoft/playwright)
וב־[Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator).
המרת צילומים ל־WebP השתמשה ב־[Pillow](https://python-pillow.org/).
כלים אלה מותקנים חיצונית; אין עותק של הקוד או של הקבצים הבינריים שלהם במסירה,
ורישיונותיהם אינם מוחלפים בהצהרת CC0 של קובצי החבילה.
