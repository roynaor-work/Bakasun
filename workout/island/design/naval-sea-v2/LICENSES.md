# רישיונות ומקורות

| תכולה | מקור | רישיון |
|---|---|---|
| כל קובצי `textures/` | יצירה מקורית עבור חבילה זו, באמצעות NumPy ו־Pillow; המקור המלא ב־`source/build-textures.py` | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/), הנוסח המלא ב־[LICENSE.assets](LICENSE.assets) |
| ארבעת הסלעים, ארבעת הצפים והמגדלור ב־`models/` | יצירה מקורית ב־Blender; המקור המלא ב־`source/build-models.py` | CC0-1.0 |
| קוד התצוגה, שיידרים, מחוללים, מסמכים וצילומי הבדיקה המקוריים | יצירה מקורית עבור החבילה | CC0-1.0 |
| `source/reference-corvette.glb` | ספינת הקורבטה הקיימת ב־`workout/island/assets/naval-v7/ships/corvette-lod1.glb`, מתוך חבילת `naval-v7` במאגר זה. עותק לתצוגת קנה מידה; הוסר קידוד Draco, הוסרו עוגנים ריקים וערוץ UV שאינו בשימוש. אין שינוי בקובץ המקורי | CC0-1.0, לפי `workout/island/design/naval-v7/LICENSES.md` ו־`LICENSE.assets` |
| `vendor/three.module.js`, `GLTFLoader.js`, `BufferGeometryUtils.js` | Three.js r160; עותקים מקומיים מ־`workout/island/design/naval-v7/vendor/` | MIT; כל הודעות זכויות היוצרים נשמרו. נוסח מלא ב־[vendor/LICENSE.three](vendor/LICENSE.three). מקור: [Three.js r160](https://github.com/mrdoob/three.js/tree/r160) |

הנכסים מקוריים ואינם מבוססים על צילום, מאגר מסחרי, מותג או אדם אמיתי. לא נדרשים רישיון בתשלום, קרדיט בתוך המשחק או גישה לשירות חיצוני לצפייה בנכסים.

כלי היצירה והבדיקה מותקנים מחוץ למאגר ואינם חלק מקוד הריצה: Blender 4.3.2 ‏(GPL), Python עם NumPy ‏(BSD) ו־Pillow ‏(HPND), ‏glTF-Transform 4.2.1 ‏(MIT), ‏draco3dgltf 1.5.7 ‏(Apache-2.0), ‏Khronos glTF Validator 2.0.0-dev.3.10 ‏(Apache-2.0), ‏Playwright ‏(Apache-2.0) ו־pngjs ‏(MIT). פלט גאומטריה וטקסטורות אינו מחייב הכללת Blender במשחק.
