# רישיון ומקורות — racing-pit-sequence-v2

קוד הרצף, הכוראוגרפיה החדשה, נתוני הזמנים, קוד התצוגה, בדיקות ותיעוד
מקוריים בתיקייה זו נמסרים לפי **CC0-1.0**. ככל שהדין מאפשר, היוצרים
מוותרים על זכויות היוצרים והזכויות הנלוות ביצירה המקורית ומקדישים אותה
לנחלת הכלל. מותר להעתיק, לשנות, להפיץ ולהשתמש מסחרית ללא דרישת ייחוס.
[הנוסח המשפטי המחייב](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

| רכיב | מקור | רישיון |
|---|---|---|
| `sequence.json`, `src/`, `tests/`, התצוגה וסקריפטי ההפקה והאימות | מימוש JavaScript מקורי לחבילה זו | CC0-1.0 |
| `clips/pit-actions.glb` | אנימציות חדשות שנכתבו ב־`source/build-clips.mjs`; הגאומטריה, הסקין והשלד מקורם בדמות `wheel_front_left.glb` של חבילת v1 | CC0-1.0; [הצהרת המקור](../racing-pit-v1/LICENSES.md) |
| `clips/contracts.json` | חוזה האנימציות, משכי הפעולות ונקודות המגע החדשים | CC0-1.0 |
| `source/qa-upstream/*.mjs` | שישה מודולים מקוריים, ללא שינוי, מכלי Motion QA בענף `codex/motion-qa-v1`, קומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24`; מקור וטביעות אצבע ב־`source/qa-upstream/provenance.sha256.json` | CC0-1.0 לפי `licenses.mjs` של הכלי |
| `verification/` | מדידות, דגימות של הסצנה וצילומי התצוגה שנוצרו מחבילה זו; המכונית והצוות המצולמים מקוריים ברישיונות המפורטים להלן | CC0-1.0 |

## נכסים ותלויות מקומיים קיימים

הקבצים הבאים נקראים ממקומם המקורי במאגר. אף אחד מהם לא נערך:

- `../racing-pit-v1/models/*.glb`: ארבע דמויות החלפת גלגלים, דמות מפעיל
  הג׳ק לשני מופעים, גלגל חלופי, אקדח, ג׳ק, סימון עצירה ורמזור —
  [CC0-1.0 של חבילת v1](../racing-pit-v1/LICENSES.md).
- `../racing-pit-v1/rig.json`: חוזה השלד הקנוני בן 18 העצמות — CC0-1.0.
- `../racing-formula/formula.glb`: מכונית הפורמולה המקורית —
  [CC0-1.0 של המקור](../racing-formula/README.md).
- `../racing-v7/vendor/three.module.js`, `GLTFLoader.js`,
  `SkeletonUtils.js` והתלויות המקומיות של הטוען: Three.js r160 —
  [MIT והודעת זכויות היוצרים המלאה](../racing-v7/vendor/LICENSE.three).
- `../soccer-motion-v8/runtime/vendor/three.module.js`: העותק המקומי של
  Three.js המשמש את כלי ה־QA המקורי — MIT, לא קוד חדש של החבילה.

התצוגה אינה טוענת ספריות מרחוק, מרקמים חיצוניים, WebAssembly או מפענחי
Draco/meshopt/KTX2. Playwright ו־Chromium משמשים לאימות בלבד ואינם
תלויות של הניגון. אין נכסים שנרכשו, נתונים אישיים או סמלים מסחריים חדשים.
