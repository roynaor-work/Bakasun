# מקורות ורישיונות

SPDX-License-Identifier: CC0-1.0

כל הקבצים החדשים בתיקייה זו הם יצירה מקורית שהוכנה עבור המשימה הזאת, ומוקדשים לנחלת הכלל לפי [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). מותר להעתיק, לשנות, להפיץ ולהשתמש מסחרית ללא דרישת ייחוס. [הנוסח המשפטי המלא](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

| קובץ | מקור | רישיון |
| --- | --- | --- |
| `private-2f.glb` | גאומטריה, UV ואנימציות מקוריים; מופק באמצעות `build_assets.py` | CC0-1.0 |
| `residential-3f.glb` | גאומטריה, UV ואנימציות מקוריים; מופק באמצעות `build_assets.py` | CC0-1.0 |
| `highrise-5f.glb` | גאומטריה, UV ואנימציות מקוריים; מופק באמצעות `build_assets.py` | CC0-1.0 |
| `warm-atlas-1024.png` | אטלס מקורי שנוצר פרוצדורלית ב־`make_atlas()`; בלי תצלומים או תמונות חיצוניות | CC0-1.0 |
| `atlas.json`, `manifest.json` | מיפוי אריחים, מדידות, שמות צמתים, שמות אנימציות וחתימות; מופקים מאותו סקריפט | CC0-1.0 |
| `build_assets.py` | קוד מקורי ליצירת האטלס, הגאומטריה ואריזת glTF 2.0 | CC0-1.0 |
| `preview.html`, `preview.css`, `preview.js` | ממשק תצוגה מקורי; גופני מערכת בלבד | CC0-1.0 |
| `overview.png`, `states.png`, `lobby.png`, `mobile.png` | צילומי Chromium של התצוגה המקורית ושל הנכסים שבתיקייה | CC0-1.0 |
| `REPORT.md`, `LICENSES.md` | תיעוד מקורי של החבילה | CC0-1.0 |

אין בנכסי התלת־ממד או באטלס סמלים, מותגים, מספרי בית, כיתוב או גופנים. הטקסט בדף התצוגה ובמסמכים מיועד להפעלת הנכסים ולתיעודם.

## תלויות קיימות של התצוגה

אין העתקה של ספריות לתיקייה זו. `preview.js` מייבא מתוך המאגר את `../../vendor/three.module.js` ואת `../../vendor/GLTFLoader.js`; הטוען משתמש גם ב־`../../vendor/BufferGeometryUtils.js`. שלושתם חלק מ־[Three.js r160](https://github.com/mrdoob/three.js/tree/r160), מאת Three.js Authors, ברישיון MIT; הנוסח הקיים במאגר נמצא ב־[LICENSE.three](../../vendor/LICENSE.three). רישיון CC0 של הקבצים החדשים אינו מחליף את רישיון MIT של התלויות הקיימות.

ה־GLB מכיל את הגאומטריה והאטלס בתוכו ואינו תלוי בספריות התצוגה, במפענח דחיסה או במשאב רשת. `build_assets.py` משתמש רק בספרייה התקנית של Python 3. כלי המדידה והדפדפן ששימשו לסקירה אינם מועתקים לחבילה.
