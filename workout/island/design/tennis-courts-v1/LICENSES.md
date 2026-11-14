# רישיונות ומקורות

כל הקבצים החדשים בתיקייה זו הם יצירה מקורית עבור חבילת מגרשי הטניס ומוקדשים לנחלת הכלל תחת **CC0-1.0**. אין תמונות קנויות, צילומים, לוגואים, טקסט פרסומי או סימני מסחר. טקסטורות המשטחים, הרשת, השלטים, היציעים, השמיים והאפקטים נוצרו במחולל המתמטי המצורף; אין נכסים שנוצרו בשירות תמונות חיצוני.

במידה המותרת בדין, יוצרי החבילה מוותרים על זכויות היוצרים והזכויות הנלוות ביצירות באמצעות [CC0 1.0 Universal — הנוסח המשפטי](https://creativecommons.org/publicdomain/zero/1.0/legalcode). מותר להעתיק, לשנות ולהפיץ, גם מסחרית וללא ייחוס. אין אחריות מכל סוג; ההקדשה אינה מעניקה זכויות של צד שלישי.

| קבצים | רישיון | מקור |
|---|---|---|
| `runtime/textures/clay/*.png` | CC0-1.0 | רעש מחזורי דטרמיניסטי, גרגרי חימר, גווני משטח וקווי מגרש; `source/build.py` |
| `runtime/textures/grass/*.png` | CC0-1.0 | רעש מחזורי מקורי, פסי כיסוח ושחיקה עדינה ליד קווי הבסיס; אותו מחולל |
| `runtime/textures/hard/*.png` | CC0-1.0 | גרגר אקרילי עדין, משטח כחול ושוליים כהים; אותו מחולל |
| `runtime/textures/shared/court-lines.png` | CC0-1.0 | קווי יחידים וזוגות, תיבות שירות וסימני מרכז; גאומטריה מקורית לפי המידות המתועדות במניפסט |
| `runtime/textures/shared/net.png` | CC0-1.0 | אריג שקוף, סרט עליון וכריכה תחתונה; אותו מחולל |
| `runtime/textures/shared/ball-shadow.png` | CC0-1.0 | פונקציית דעיכה רדיאלית עם alpha חלק; אותו מחולל |
| `runtime/textures/shared/clay-dust.png`, `grass-spray.png` | CC0-1.0 | סימולציית חלקיקים דטרמיניסטית מקורית, שישה פריימים לכל אפקט; אותו מחולל |
| `runtime/textures/shared/stand-lower.png`, `stand-upper.png` | CC0-1.0 | חזיתות שני מפלסי יציע; אותו מחולל |
| `runtime/textures/shared/blank-signs.png` | CC0-1.0 | ארבעה לוחות צבע ריקים, ללא כתובות או סמלים; אותו מחולל |
| `runtime/textures/shared/sky-day.png`, `sky-sunset.png`, `sky-night.png` | CC0-1.0 | מעברי צבע, עננים מחזוריים, שמש וכוכבים דטרמיניסטיים מקוריים; אותו מחולל |
| `runtime/textures/shared/floodlight-beam.png`, `floodlight-lamp.png` | CC0-1.0 | חרוט אור שקוף ופאנל מנורות מקורי; אותו מחולל |
| `runtime/court.mjs` | CC0-1.0 | מתאם תצוגה מקורי ל־three r160, כולל מבנה יציע, רשת שקועה, אפקטים וצל כדור |
| `source/build.py`, `verify.py`, `browser-check.py` | CC0-1.0 | כלי יצירה ואימות מקוריים |
| `manifest.json`, `assets.json` | CC0-1.0 | מפרט, מידות, רישוי, תקציב וחתימות SHA-256 שמפיק המחולל |
| `preview.html`, `preview.css`, `preview.mjs` | CC0-1.0 | עיצוב ומימוש מקוריים של תצוגת המגרשים |
| `preview.webp`, `verification/*.webp` | CC0-1.0 | צילומים מתצוגת החבילה. צילום `crowd-compatible.webp` כולל גם את מודלי הקהל המקוריים הקיימים, ברישיון CC0 המפורט להלן |
| `verification/*.json` | CC0-1.0 | נתוני אימות ומדידות שהפיקו כלי הבדיקה; אינם קוד של כלי צד שלישי |
| `REPORT.md`, `LICENSES.md` | CC0-1.0 | תיעוד מקור, חיבור ואימות מקורי |

## תלויות קיימות

- `../../vendor/three.module.js`, `../../vendor/GLTFLoader.js` ו־`../../vendor/BufferGeometryUtils.js`: [three.js r160, MIT](https://github.com/mrdoob/three.js/blob/r160/LICENSE), לפי [הרישיון המקומי](../../vendor/LICENSE.three). אינן מועתקות ואינן כלולות בהקדשת CC0 או במשקל ערכת PNG.
- מצב ״קהל תואם״ מפנה אל `../tennis-crowd-3d-v1/runtime/crowd.mjs`, `assets.json` ו־12 קובצי `fan-*.glb`: **CC0-1.0**, לפי [הרישיון הקיים](../tennis-crowd-3d-v1/LICENSES.md). זהו רפרנס לתאימות; המודלים לא הועתקו לחבילה החדשה, אינם נדרשים להצגת המגרשים ואינם כלולים בתקציבם.
- פריסת המושבים והמצלמה מתאימות לחבילת הקהל המקורית בקומיט `950f6650bc2dd4b2216c66228ceceb7476949b9b`. כל שינוי הייצור נשאר בקבצים החדשים; לא שונה מתאם הקהל הקיים.

Python, NumPy, Pillow, Playwright ו־Chromium משמשים כלי יצירה ובדיקה ואינם מופצים בחבילה. אין גופנים, שירותי רשת, מפענחי דחיסה או קובצי WASM חדשים.
