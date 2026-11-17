# רישיונות ומקורות

כל הדמויות בדיוניות. הגאומטריה, הצבעים והקליפים נוצרו עבור חבילה זו; אין צילומי אנשים, דמויות מסחריות, מותגים או נתונים אישיים.

| רכיב | מקור | רישיון |
|---|---|---|
| 11 קובצי `models/*.glb`, צבעי קודקודים וקליפים | `source/geometry.py`, `source/motions.mjs`, `source/build.mjs` | CC0-1.0 |
| מחוללים, תצוגה, manifest, דוח וצילומי אימות | קבצים מקוריים בתיקייה זו | CC0-1.0 |
| חוזה שלד: שמות, הורים ומנוחת 18 עצמות | `../motion2/soccer.json`, חבילת תנועה מקורית בריפו | CC0-1.0 |
| `source/qa-vendor/metrics.mjs` ושתי בדיקות המקור | `motion-qa-v1`, קומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24` | CC0-1.0; הועתקו ללא שינוי |
| `source/qa-vendor/glb.mjs` | אותו מקור; הוחלף רק נתיב import של three.js המקומי | CC0-1.0 |
| three.js, GLTFLoader, SkeletonUtils | העותקים הקיימים בריפו: `../../vendor/`; כלי QA משתמש ב־`../defense-v7/vendor/` | MIT; קובצי הרישיון קיימים לצד הספריות |
| Khronos glTF Validator | `gltf-validator@2.0.0-dev.3.10`, כלי פיתוח בלבד | Apache-2.0 |
| NumPy | `numpy==2.3.5`, כלי בנייה בלבד | BSD-3-Clause |
| Playwright / Chromium | בדיקות תצוגה בלבד; אינם נכללים בנכסים | Apache-2.0 / רישיונות Chromium |

CC0 מאפשר שימוש, שינוי והפצה, לרבות שימוש מסחרי: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

מקור ה־QA, SHA-256 לפני ואחרי ההעתקה ושינוי נתיב הייבוא מתועדים ב־[provenance.json](source/qa-vendor/provenance.json). נוסחאות המדדים, המשקלים והספים נשמרו ללא שינוי. אין העתקה של ספריות תצוגה לחבילה: התצוגה משתמשת בקבצים המקומיים הקיימים בריפו, ללא CDN.

הקליפים הם אנימציה מחושבת ומעוצבת, ולא הקלטות motion capture. הקוד המקורי נמסר תחת CC0-1.0, בכפוף לרישיונות התלויות המפורטים לעיל.
