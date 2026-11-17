# מקורות ורישיונות

הדמויות בדיוניות. אין שימוש בצילום פנים, סריקת אדם מסוים, זהות של שחקן אמיתי, סמל מועדון או מותג בגדים. גילי הדמויות וצבעיהן הם החלטות עיצוב בלבד.

| רכיב | מקור | רישיון |
|---|---|---|
| בסיס אנטומי hm08 | [MakeHuman, `makehuman/data/3dobjs/base.obj`](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/3dobjs/base.obj). המחברים הרשומים: Data Collection AB, Joel Palmius, Jonas Hauquier. כותרת הנכס מקדישה אותו במפורש ל־CC0 מספטמבר 2020. | CC0-1.0 |
| עותק הבסיס לשחזור | `source/vendor/makehuman-base.obj.gz`, עותק נתונים דחוס ללא שינוי. גרסת המקור, SHA-256 והמחברים ב־`source/vendor/provenance.json`. נלקח משטח `body` בלבד; העזרים אינם נכנסים ל־GLB. | CC0-1.0; [נוסח הרישיון המלא](source/vendor/MakeHuman-LICENSE.ASSETS.md) |
| 14 דמויות, התאמת פרופורציות, לבוש, כובעים, שיער, נעליים, אטלסים ואנימציות | עיבוד חדש באמצעות `source/build-geometry.py` ו־`source/build.py`. הטקסטורות מקוריות וסינתטיות; אין תמונות צד שלישי. | CC0-1.0 |
| התצוגה, כיסאות, סביבה, צילומי התוצאה, manifest, קוד הבנייה והאימות | עבודה מקורית לחבילה זו. | CC0-1.0 |
| Three.js r160, GLTFLoader, OrbitControls | npm `three@0.160.0`, מאוגד מקומית ב־`vendor/three-r160.js`. | MIT; [נוסח מלא](vendor/LICENSE.three) |
| Khronos glTF Validator | npm `gltf-validator@2.0.0-dev.3.10`, כלי אימות בלבד, אינו מופץ בספריית זמן הריצה. | Apache-2.0 |
| esbuild | npm `esbuild@0.25.12`, כלי איגוד בלבד. | MIT |
| Blender 4.3.2 | כלי יצירת גאומטריה בלבד; תוכנת Blender אינה מופצת בחבילה. רישיון תוכנת הכלי אינו משנה את רישיון הנתונים של הנכס. | GPL-3.0-or-later לתוכנה |
| NumPy, SciPy, Pillow, Playwright | כלי בנייה ובדיקה בלבד; גרסאות ב־`source/requirements.txt`. | BSD-3-Clause, BSD-3-Clause, HPND, Apache-2.0 בהתאמה |
| גופן | גופן מערכת מקומי. | אין קובץ גופן מופץ |

העבודה המקורית והנגזרות בחבילה מוקדשות לנחלת הכלל לפי [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), לרבות שימוש מסחרי, שינוי והפצה. רכיבי צד שלישי שומרים על רישיונותיהם. `source/vendor/MakeHuman-LICENSE.md` מתעד את ההבחנה בין קוד MakeHuman לבין נכסי הנתונים שלו; לא הועתק קוד יישום של MakeHuman.
