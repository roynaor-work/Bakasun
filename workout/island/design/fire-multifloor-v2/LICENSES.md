# מקורות ורישיונות · Fire Multifloor v2

נוצר ב־17 בנובמבר 2026 עבור Bakasun. הרכבים והציוד אינם נושאים מותג, סמל רשות או סימן מסחרי.

| קבצים | מקור | רישיון |
|---|---|---|
| `models/fire-truck.glb`, `source/build_truck.py` | כבאית מקורית שנבנתה במשימה: תא נהג, חרטום, תאי ציוד, גלגלים, צינורות, אורות וסולם טלסקופי | CC0-1.0 |
| `models/building-*.glb`, `source/build_building.py` | ארכיטקטורה, מסדרונות, מדרגות ונזק גאומטרי מקוריים; ריהוט וכלי גאומטריה מותאמים מ־Fire Rooms v1 המפורט למטה | CC0-1.0 |
| חמשת דגמי הציוד, `icons/*.svg`, `source/build_equipment.py` | מודלים ואייקונים מקוריים שנבנו במשימה | CC0-1.0 |
| `effects/*`, `source/build_effects.py`, `source/build_atmosphere.py` | ציור חלקיקים מקורי ודטרמיניסטי; ללא תמונות מקור או טקסטורות שנרכשו | CC0-1.0 |
| קוד התצוגה, manifest, נתוני מקור, תיעוד וראיות | יצירה מקורית עבור החבילה | CC0-1.0 |

הריהוט וחוזה `burn_` מבוססים על [Fire Rooms v1, commit 37305d4](https://github.com/roynaor-work/Bakasun/tree/37305d4d816d9dc3dcd2e31c2410a169c02490ca/workout/island/design/fire-rooms-v1). מקור זה נמסר ברישיון CC0-1.0, כמתועד ב־[LICENSES.md המקורי](https://github.com/roynaor-work/Bakasun/blob/37305d4d816d9dc3dcd2e31c2410a169c02490ca/workout/island/design/fire-rooms-v1/LICENSES.md). קוד המקור הרלוונטי מותאם ומוכל בתוך `source/build_building.py`; שחזור החבילה אינו זקוק לענף המקורי.

נכסי הכיבוי הקיימים בריפו נבדקו כרפרנס לסגנון. לא הועתקו מהם דגמי משאית או ציוד. קטלוג Kenney נבדק כמקור אפשרי; לא נכלל בחבילה נכס ממנו. אין תמונות אנשים, גופנים מוטמעים או נתוני לקוחות.

## הקדשה לציבור

ככל שקיימות זכויות יוצרים או זכויות קשורות ביצירה המקורית ובשינויים בחבילה, הן מוקדשות לנחלת הכלל לפי [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) ו־[הנוסח המשפטי](https://creativecommons.org/publicdomain/zero/1.0/legalcode). מותר להעתיק, לשנות ולהפיץ, לרבות שימוש מסחרי. אין אחריות.

## תלויות התצוגה וכלי העבודה

התצוגה משתמשת בקבצים הקיימים `../../vendor/three.module.js`, `../../vendor/GLTFLoader.js` ו־`../../vendor/BufferGeometryUtils.js`. רישיון three.js הוא MIT, כמפורט ב־[LICENSE.three](../../vendor/LICENSE.three). הם אינם מועתקים לתיקייה ואינם נכללים בהקדשת CC0. אין CDN או בקשות צד שלישי.

יצירת המשאית והציוד נעשתה באמצעות Blender 4.3.2; יצירת אפקטים באמצעות Pillow. כלים אלה אינם מופצים בחבילה. המאמת הרשמי `gltf-validator@2.0.0-dev.3.10` של Khronos מותקן מחוץ למאגר, ברישיון Apache-2.0. צילומי התצוגה נוצרו באמצעות Playwright ו־Chromium; הם אינם תלות בזמן הריצה.
