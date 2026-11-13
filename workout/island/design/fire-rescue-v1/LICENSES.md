# מקורות ורישיונות — חברים לחילוץ v1

כל הקבצים החדשים בתיקייה זו הם יצירה מקורית שנכתבה ונוצרה עבור
`roynaor-work/Bakasun`, במסגרת משימת Fire Rescue v1, בתאריך 2026-11-13.
הגאומטריה, הדמויות הבדיוניות, השלדים, ההבעות והכוריאוגרפיה נוצרו במקור
ב־[source/build_assets.py](source/build_assets.py). אין שימוש בסריקות, בתצלומים,
באנשים אמיתיים, בדמויות ממותגות או במודלים שהורדו ממאגר חיצוני.

| קובץ | מקור | רישיון |
| --- | --- | --- |
| [girl.glb](girl.glb) | דמות, שלד, צבעים וחמש אנימציות מקוריים; נוצר באמצעות `source/build_assets.py` | CC0-1.0 |
| [cat.glb](cat.glb) | דמות, שלד, צבעים וחמש אנימציות מקוריים; נוצר באמצעות `source/build_assets.py` | CC0-1.0 |
| [dog.glb](dog.glb) | דמות, שלד, צבעים וחמש אנימציות מקוריים; נוצר באמצעות `source/build_assets.py` | CC0-1.0 |
| [source/build_assets.py](source/build_assets.py) | קוד יצירה וייצוא glTF מקורי; ספרייה תקנית של Python בלבד | CC0-1.0 |
| [manifest.json](manifest.json) | נתוני הקבצים ו־SHA-256 שנוצרו מאותו סקריפט | CC0-1.0 |
| [recolor.js](recolor.js) | כלי מקורי להחלפת צבעי הקודקודים לפי מסכות | CC0-1.0 |
| [preview.html](preview.html) | מבנה ותוכן מקוריים של תצוגת הנכסים | CC0-1.0 |
| [preview.css](preview.css) | עיצוב מקורי של תצוגת הנכסים | CC0-1.0 |
| [preview.js](preview.js) | קוד תצוגה מקורי; טוען את קובצי ה־GLB עצמם | CC0-1.0 |
| [overview.webp](overview.webp) | צילום Chromium של התצוגה המקורית והדמויות המקוריות | CC0-1.0 |
| [motion-sheet.webp](motion-sheet.webp) | דף תנוחות מצילומי אותן דמויות בכל חמש האנימציות | CC0-1.0 |
| [REPORT.md](REPORT.md) | תיעוד ונתוני מסירה מקוריים | CC0-1.0 |
| [LICENSES.md](LICENSES.md) | מסמך מקורות ורישוי מקורי זה | CC0-1.0 |

## הקדשה לנחלת הכלל

To the extent possible under law, the contributors have waived all copyright
and related or neighboring rights to the original work in this directory under
the **Creative Commons CC0 1.0 Universal Public Domain Dedication**.
The work is provided without warranty. Attribution is appreciated but not required.

SPDX: **CC0-1.0**.
[תקציר CC0](https://creativecommons.org/publicdomain/zero/1.0/) ·
[הנוסח המשפטי המלא](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
ההקדשה חלה גם על כל תוצרי שלושת המודלים שנוצרים מחדש מהסקריפט המקורי.

## ספריית תצוגה קיימת במאגר

התצוגה מפנה לקבצים הקיימים `../../vendor/three.module.js`,
`../../vendor/GLTFLoader.js` ו־`../../vendor/BufferGeometryUtils.js`.
שלושתם חלק מ־Three.js, גרסה r160, ברישיון **MIT**,
Copyright © 2010–2023 Three.js Authors.
[מקור Three.js r160](https://github.com/mrdoob/three.js/tree/r160) ·
[הרישיון שכבר קיים במאגר](../../vendor/LICENSE.three).
קבצים אלה אינם מועתקים לחבילה זו ואינם כלולים בהקדשת CC0 של היצירה המקורית.
הגופן הוא גופן מערכת של המכשיר; אין קובצי גופנים או תמונות צד שלישי בחבילה.
