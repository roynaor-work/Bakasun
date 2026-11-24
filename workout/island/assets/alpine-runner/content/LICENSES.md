# מקורות ורישיונות — alpine-content-v1

החבילה נוצרה עבור Bakasun ב־16 בנובמבר 2026. הגאומטריה, החלקיקים, התצוגה, כלי הבנייה, הדוחות והתמונות החדשים מוקדשים לנחלת הכלל לפי **CC0 1.0 Universal — SPDX: CC0-1.0**. מותר שימוש מסחרי, שינוי, שילוב והפצה ללא חובת ייחוס. כשוויתור על זכויות אינו אפשרי, חלה הרשאת הגיבוי של CC0. אין כאן טענה לבלעדיות בתוצר בסיוע AI.

[הנוסח המשפטי המלא של CC0](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

| קבצים | מקור ורישיון |
|---|---|
| `models/*.glb`, למעט המתחרה | גאומטריה מקורית ומסלולי אנימציה מתוך `source/build_assets.py`. צורות מפוסלות ממשולשים, ללא הורדת מודלים. CC0-1.0. |
| `models/rival-skier.glb` | הגאומטריה המוכנה מ־[`../alpine-themes-v1/shared/reference-skier.glb`](../alpine-themes-v1/shared/reference-skier.glb), מתוך חבילת CC0 של המאגר. נוספה אנימציית `carve`; הגאומטריה לא שונתה. המקור ו־SHA-256 שלו במניפסט. רישיון המקור נשמר: [alpine-themes-v1/LICENSES.md](../alpine-themes-v1/LICENSES.md). |
| צבעים ושפת עיצוב | התאמה ל־`alpine-themes-v1`, ענף הרפרנס בקומיט `c918a88f9c6b1d2b66f6cd97cbac9b741e7e6ef9`. פלטות ששת הנושאים מועתקות כנתונים במניפסט; מקור CC0-1.0. |
| `png/*.png` | רינדור ישיר של 28 קובצי ה־GLB הסופיים, ב־Three.js/Chromium, באמצעות `source/verify.mjs` ו־`preview.mjs`. שקיפות מקורית, ללא ציור נוסף, תמונות רשת או עיבוד גנרטיבי. רישיון היצירות המרונדרות: CC0-1.0. |
| `effects/*.png` | נוסחאות אלפא וצבע מקוריות מתוך `source/build_assets.py`. CC0-1.0. |
| `effects/runtime.mjs`, `preview.*`, `source/*`, JSON ותיעוד | קוד, נתונים ותיעוד מקוריים למשימה. CC0-1.0. |
| `verification/*.png` | צילומי הדפדפן של החבילה ודף מגע שמסדר את רינדורי ה־PNG, ללא מדיה חיצונית. CC0-1.0. |
| `verification/*.json` | תוצאות כלי האימות והבדיקות על הקבצים שנמסרו. CC0-1.0 לתיעוד. |

[`asset-inventory.json`](asset-inventory.json) מונה כל קובץ בחבילה, מקור, רישיון, מספר בתים ו־SHA-256. רק קובץ המלאי עצמו אינו נחתם בעצמו כדי להימנע מחתימה מעגלית.

אין בחבילה נכסי מדיה חיצוניים, סימני מסחר, גופנים, צילומי אנשים או תוכן פרטי. חיפוש נכסים מוכנים כלל את נכסי המאגר ואת Kenney; אתר Kenney החזיר 403 ולא הועתק ממנו תוכן. הגולש הקיים ברפרנס נמצא מתאים ושומש מחדש. יתר התוכן מקורי וניתן לשחזור מהקוד.

כלי ההפקה אינם מופצים כאן: Python ‏(PSF), NumPy ‏(BSD-3-Clause), Pillow ‏(MIT-CMU), Khronos glTF Validator ‏(Apache-2.0), Playwright ‏(Apache-2.0), Chromium ‏(BSD ותלויותיו). התצוגה משתמשת בספריות הקיימות מחוץ לחבילה: [`../../vendor/three.module.js`](../../vendor/three.module.js), `GLTFLoader.js` ו־`BufferGeometryUtils.js`, ברישיון [Three.js MIT](../../vendor/LICENSE.three). רישיון כלי אינו משנה את רישיון הנכסים שנוצרו באמצעותו.
