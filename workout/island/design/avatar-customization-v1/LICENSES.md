# רישיונות ומקורות

הגאומטריה החדשה, ממשק התצוגה, מסכות הצבע, קוד הכלים והתיעוד המקוריים בחבילה זו מוקדשים לנחלת הכלל תחת **CC0-1.0**. במידה המותרת בחוק, המחברים מוותרים על זכויות היוצרים והזכויות הנלוות בתוכן המקורי שלהם. הדמויות בדויות. לא שולבו מותגים, מספרי קבוצה, סמלים או לוגואים בנכסים.

| תוכן | מקור | רישיון |
|---|---|---|
| `assets/` — 46 פריטים, כולל פעולת קרח ללא גאומטריה | גאומטריה מקורית, `tools/build.py`; ללא מודל פריט חיצוני | CC0-1.0 |
| ארבעת הגופים ב־`references/models/` והאטלס ב־`references/textures/` | עותקים זהים מ־`workout/island/assets/athlete-body-v22/`, בקומיט `43b27dc235387e3cb737aee9558cdf9d5fd5a262` | CC0-1.0 לפי manifest המקור |
| השלד הקנוני, שמות העצמות ותרגומי המנוחה | `body-manifest.json#canonicalBones` של אותו מקור; חוזה motion2 בן 18 עצמות | CC0-1.0 |
| `vendor/*.js` וקטעי ספרייה ב־`preview.bundle.js` | Three.js r160, GLTFLoader, SkeletonUtils ו־BufferGeometryUtils, עותקים מקומיים מהמאגר | MIT, הטקסט המלא ב־[vendor/LICENSE.three](vendor/LICENSE.three) |
| תצוגה, קוד שילוב, תמונות פריטים וצילומי אימות | נכתבו או רונדרו במשימה זו; התמונות נגזרות מנכסי CC0 | CC0-1.0 |

שרשרת מקור הגוף והאטלס מתועדת ב־[athlete-body-v1 / LICENSES.md](https://github.com/roynaor-work/Bakasun/blob/5075ff850f6a1c9dab8e557eb95745b45d785df5/workout/island/design/athlete-body-v1/LICENSES.md): גוף canonical-player-01 מ־motion-fix-v12, שמקורו ב־soccer-motion-v11 ובנכסי MakeHuman hm08 המוצהרים CC0. אין כאן קוד של MakeHuman. אטלס הקלט: SHA-256 `7024031216a0af3bd15d6295d4bb4d525f01322f9d93b2cc2121e2975eb2c8fc`.

רישיונות: [CC0-1.0 — נוסח משפטי](https://creativecommons.org/publicdomain/zero/1.0/legalcode), [Three.js — MIT](vendor/LICENSE.three). ספריות MIT נשארות ברישיונן ואינן מוקדשות מחדש תחת CC0. Khronos glTF Validator, NumPy, esbuild, Playwright ו־Chromium הם כלי בנייה ובדיקה שאינם מופצים כחלק מהחבילה. אין גופן חיצוני.

משקל ו־SHA-256 לכל קובץ מסירה, למעט קובץ האינדקס עצמו, נמצאים ב־[verification/inventory.json](verification/inventory.json). הפניות רשת במסמך זה הן קרדיטים בלבד; התצוגה אינה טוענת מהן דבר.
