# רישיון ומקורות

כל הקבצים החדשים בתיקיית `lod/` הם **CC0-1.0**. זוהי התאמה של הגאומטריה המקורית והבדיונית מ־PR #409, שגם היא CC0 לפי [הרישיון המקורי](../LICENSES.md). אין דמויות אמיתיות, צילומים, לוגואים או נכסים ממאגר חיצוני.

במידה המותרת בדין, יוצרי התוספות מוותרים על זכויות היוצרים והזכויות הנלוות באמצעות [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode). מותר להעתיק, לשנות ולהפיץ, גם מסחרית, ללא חובת ייחוס. אין אחריות או הענקת זכויות צד שלישי.

| קבצים | מקור |
|---|---|
| `runtime/lod0/fan-01.glb` עד `fan-12.glb` | עותקים זהים בבייטים של `../runtime/fan-*.glb`, קומיט `950f6650bc2dd4b2216c66228ceceb7476949b9b` |
| `runtime/lod1/fan-01.glb` עד `fan-12.glb` | גאומטריה מופחתת מקורית, 90 משולשים; מידות ופלטות מהמחולל המקורי; `source/build.py` |
| `runtime/lod2/fan-01.glb` עד `fan-12.glb` | גאומטריה מקורית, 24 משולשים; ראש וגוף בעלי נפח וגפיים דו־צדדיות; `source/build.py` |
| `runtime/crowd-lod.mjs`, `runtime/lod-policy.mjs` | מתאם ומדיניות LOD מקוריים; תנועת הידיים והראש מותאמת מהמתאם המקורי של #409 |
| `scene.mjs` | אותה סצנת השוואה ופריסת מושבים מתצוגת #409, בהתאמה לנתוני הטניס הקיימים |
| `preview.html`, `preview.css`, `preview.mjs` | תצוגה, בקרי השוואה ומדידת RAF מקוריים |
| `source/*` | כלי יצירה, תיעוד מדיניות, מדידה וקריאה למאמת glTF; קוד מקורי |
| `assets.json`, `lod-config.json`, `distribution.json`, `policy-verification.json` | מפרט, פלטי מחולל ונתונים מספריים מקוריים |
| `measurements.json`, `verification.json`, `gltf-validation.json` | תוצאות שנרשמו בכלי העבודה; קוד הספריות אינו מופץ |
| `preview.webp`, `variants.webp`, `levels-0.webp`, `levels-90.webp`, `levels-180.webp` | צילומי WebGL של התצוגה והמודלים; תמונת היציע כוללת את היציע הקיים ברישיון CC0 |
| `REPORT.md`, `LICENSES.md` | תיעוד מקורי |

תלויות קיימות נקראות במיקומן, ללא העתקה או שינוי: three.js r160 ו־GLTFLoader תחת `../../../vendor/` ברישיון MIT; `../../../assets/tennis-stadium-v1/stand-10m.glb` ברישיון CC0 לפי [רישיון הנכסים הקיימים](../../../assets/tennis-stadium-v1/LICENSES.md); המתאם המקורי `../runtime/crowd.mjs` והמחולל `../source/build.py` ברישיון CC0.

Python, Node.js, Chromium, Playwright, Pillow ו־Khronos glTF Validator משמשים כלי פיתוח בלבד. אין בחבילה ספרייה נוספת, קובץ WASM, דקודר או טקסטורה למודלים.
