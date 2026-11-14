# מקורות ורישיונות — catch-props-v1

## רישיון כל הקבצים החדשים

כל קובצי החבילה המנויים להלן הם עבודה מקורית שנוצרה למשימה זו ומוקדשת לציבור לפי **CC0 1.0 Universal — CC0-1.0**. מותר להעתיק, לשנות, לשלב ולהפיץ, לרבות שימוש מסחרי, ללא חובת ייחוס. ככל שוויתור על הזכויות אינו אפשרי לפי הדין החל, חל רישיון הגיבוי שב־CC0. התוצרים ניתנים ללא אחריות.

- [תמצית CC0 הרשמית](https://creativecommons.org/publicdomain/zero/1.0/).
- [נוסח CC0 1.0 Universal המחייב](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
- מקור החבילה: יצירה מקורית עבור משימת Codex במאגר הציבורי [roynaor-work/Bakasun](https://github.com/roynaor-work/Bakasun), תיקייה `workout/island/design/catch-props-v1/`, ענף `codex/catch-props-v1`, ‏13/11/2026.

אין נכסי מודלים שהורדו, תמונות מלאי, פונטים, סימני יצרן, לוחיות רישוי, צילום, סריקה או נתוני אדם אמיתי. הצבעים, הגאומטריה, האייקונים הגאומטריים והליוורי הבדיוני מקוריים. אין טקסט מודפס על אטלס הצבעים או על מודל. הטקסט בתצוגה ובתיעוד הוא ממשק סקירה בלבד.

## רשימת קבצים ומקורם

| קובץ | מקור | רישיון |
|---|---|---|
| `models/nitro-bottle.glb` | גאומטריית בקבוק וברק מקורית; `source/build.py`, פונקציה `nitro` | CC0-1.0 |
| `models/repair-wheel.glb` | גאומטריית צמיג, חישוק ומפתח מקורית; `repair_wheel` | CC0-1.0 |
| `models/oil-slick-a.glb` | משטח שמן וקו מתאר מקוריים; `decal('oil', 'a')` | CC0-1.0 |
| `models/oil-slick-b.glb` | משטח שמן וקו מתאר מקוריים; `decal('oil', 'b')` | CC0-1.0 |
| `models/puddle-a.glb` | משטח שלולית וקו מתאר מקוריים; `decal('water', 'a')` | CC0-1.0 |
| `models/puddle-b.glb` | משטח שלולית וקו מתאר מקוריים; `decal('water', 'b')` | CC0-1.0 |
| `models/warning-sign.glb` | שלט וסמל בליטת כביש מקוריים; `warning_sign` | CC0-1.0 |
| `models/short-ramp.glb` | רמפה וסימוני כיוון מקוריים; `ramp(False)` | CC0-1.0 |
| `models/jump-bridge.glb` | זוג רמפות, סמכים ומעקות מקוריים; `ramp(True)` | CC0-1.0 |
| `models/police-helicopter.glb` | גוף, סקידים, להבים ורוטור מקוריים; `helicopter` | CC0-1.0 |
| `models/civilian-hatchback.glb` | גאומטריית מכונית מקורית; `car('hatchback')` | CC0-1.0 |
| `models/civilian-sedan.glb` | גאומטריית מכונית מקורית; `car('sedan')` | CC0-1.0 |
| `models/taxi.glb` | גאומטריית מונית מקורית ללא כיתוב; `car('taxi')` | CC0-1.0 |
| `models/motorcycle.glb` | גאומטריית אופנוע מקורית; `motorcycle` | CC0-1.0 |
| `models/police-barrel.glb` | גאומטריית חבית מקורית; `barrel` | CC0-1.0 |
| `models/police-barrier.glb` | זוג חביות ופס מחסום מקוריים; `barrier(False)` | CC0-1.0 |
| `models/construction-barrier.glb` | גאומטריית מחסום בנייה מקורית; `barrier(True)` | CC0-1.0 |
| `models/traffic-cone.glb` | גאומטריית קונוס מקורית; `cone` | CC0-1.0 |
| `models/guardrail.glb` | גאומטריית מעקה גלית מקורית; `guardrail` | CC0-1.0 |
| `atlas-1024.png` | אטלס דגימות צבע מקורי, נכתב ישירות באמצעות `atlas_png` | CC0-1.0 |
| `manifest.json` | קטלוג, פלטות ומדידות שנוצרו באמצעות המחולל המקורי | CC0-1.0 |
| `source/build.py` | מחולל מקורי ומייצא GLB מקורי, Python סטנדרטי בלבד | CC0-1.0 |
| `preview.html` | מבנה ממשק מקורי | CC0-1.0 |
| `preview.css` | עיצוב ממשק מקורי | CC0-1.0 |
| `preview.js` | קוד תצוגה ותפאורת כביש מקוריים | CC0-1.0 |
| `previews/road-rear.png` | צילום דפדפן של הסצנה המקורית ב־`preview.html` | CC0-1.0 |
| `previews/road-overview.png` | צילום דפדפן של הסצנה המקורית ב־`preview.html` | CC0-1.0 |
| `previews/mobile.png` | צילום דפדפן של הסצנה המקורית בגודל 390×844 | CC0-1.0 |
| `previews/asset-sheet.png` | רינדור דפדפן של כל המודלים המקוריים בגיליון אחד | CC0-1.0 |
| `validation.json` | מדידות מקוריות, סיכום פלט כלי glTF וראיות אימות הדפדפן | CC0-1.0 |
| `REPORT.md` | תיעוד והוראות מקוריים | CC0-1.0 |
| `LICENSES.md` | רישום מקורות ורישיונות מקורי זה | CC0-1.0 |

כל תמונה המוטמעת ב־GLB היא עותק זהה של `atlas-1024.png`, באותו רישיון. SHA-256 של ה־GLB ושל האטלס רשומים ב־`manifest.json`; תוצאות אימות נוספות ב־`validation.json`.

## ספריות וכלי עבודה

התצוגה מייבאת את **Three.js r160**, ‏`GLTFLoader.js` ו־`BufferGeometryUtils.js` מהתיקייה הקיימת `workout/island/vendor/`. אלה תלויות קוד קיימות ברישיון MIT, זכויות יוצרים 2010–2023 Three.js Authors. הן לא הועתקו, שונו או נכללו בקבצים החדשים; רישיון CC0 של החבילה אינו מחליף את רישיון MIT שלהן. [מקור ורישיון Three.js r160](https://github.com/mrdoob/three.js/blob/r160/LICENSE).

כלי אימות ששימשו בסביבה בלבד: Python 3, ‏Chromium, ‏Playwright ו־[Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator). אין קוד של כלים אלה בחבילה. לצורך יצירת המודלים נכתב מייצא GLB מקורי; אין צורך ב־Blender, כלי דחיסה או כלי תלת ממד מסחרי כדי לשחזר אותם.
