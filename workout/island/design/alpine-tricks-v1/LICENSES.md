# מקורות ורישיונות · alpine-tricks-v1

| רכיב בחבילה | מקור | תנאים |
|---|---|---|
| גוף הגולש, ביגוד, אטלס, קסדה, משקף, מגפיים, מגלשיים ומקלות ב־`alpine-tricks.glb` | [alpine-v7/characters/ski-male.glb](../alpine-v7/characters/ski-male.glb), לפי [רישיונות alpine-v7](../alpine-v7/LICENSES.md), [skier3](../skier3/LICENSES.md) ו־[characters2](../characters2/LICENSES.md). חותמת המקור ב־`catalog.json`. | CC0-1.0 ליצירה המקורית המתועדת במקורות. ה־bind נשמר; הגאומטריה קודדה מחדש ב־Draco, וערוצי האנימציה הוחלפו. |
| שלד 18 העצמות ו־`rig.json` | [alpine-v7/characters/rig.json](../alpine-v7/characters/rig.json), התאמת `skier3` לחוזה [motion2](../motion2/README.md). | CC0-1.0 |
| `source/motion.mjs` | התאמה של פותר ה־IK המכויל מתוך [alpine-v7/motion/motion.mjs](../alpine-v7/motion/motion.mjs). | CC0-1.0 |
| `source/scene.mjs` | מתאם קריאה מתוך `documentScene` ב־[alpine-v7/tools/motion-bake.mjs](../alpine-v7/tools/motion-bake.mjs). | CC0-1.0 |
| 12 התנועות, 42 הגשרים, `source/poses.mjs`, כלי הבנייה והבדיקה, הקטלוג, התצוגה והתיעוד החדשים | כוריאוגרפיה ויצירה מקורית לחבילה זו, בסיוע AI; תנועה אנליטית ו־IK, ללא לכידת תנועה חיצונית. | CC0-1.0 ליצירה המקורית. |
| `sheets/` וצילומי `verification/` | רינדורים של נכס הגולש והתנועות המפורטים כאן. | תנאי הנכס המוצג חלים; היצירה המקורית החדשה CC0-1.0. |
| פלט `verification/motion-qa/` | נוסחאות וקורא `motion-qa-v1` בקומיט [5eb4f093bc22523ee417a7f2345c3b813bffba24](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1), לפי [רישיון המקור](https://github.com/roynaor-work/Bakasun/blob/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1/LICENSES.md). הכלי נקרא מעותק זמני מחוץ לריפו. | CC0-1.0 ליצירה המקורית של כלי המדידה ולפלט; ספריות צד שלישי נשארות בתנאיהן. |

היצירה המקורית החדשה המפורטת לעיל מוקדשת לנחלת הכלל לפי [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). מותר להשתמש, לשנות ולהפיץ, לרבות לשימוש מסחרי, בכפוף לתנאי ההקדשה. אין בחבילה סריקה, דיוקן או לכידת תנועה של אדם אמיתי, ואין שימוש בנכס של משחק מסחרי או בציוד ממותג.

## ספריות קיימות וכלי מחבר

| ספרייה | שימוש | רישיון |
|---|---|---|
| [Three.js](https://github.com/mrdoob/three.js), `GLTFLoader`, `DRACOLoader` | העותקים הקיימים ב־`../../vendor/`; פענוח, רינדור וחישובי תלת־ממד. | MIT; [נוסח מקומי מלא](../../vendor/LICENSE.three). |
| [Draco](https://github.com/google/draco), המפענח המקומי | הגאומטריה ב־GLB הסופי דחוסה ב־Draco; ערוצי התנועה נשמרים במאגרי glTF רגילים. | Apache-2.0; [נוסח מקומי מלא](../alpine-v7/licenses/draco-Apache-2.0.txt), [פרטי העותק](../../vendor/draco/README.md). |
| [glTF Transform](https://github.com/donmccurdy/glTF-Transform) ‏4.2.1 | כלי מחבר ופענוח בלבד, מותקן מחוץ לריפו. | MIT |
| `draco3dgltf` ‏1.5.7 | פענוח המקור וקידוד הגאומטריה בזמן הבנייה; פענוח עצמאי בבדיקות. | Apache-2.0 |
| [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) ‏2.0.0-dev.3.10 | אימות ה־GLB הסופי. | Apache-2.0 |
| [Playwright](https://github.com/microsoft/playwright) | בדיקות דפדפן והפקת גיליונות. | Apache-2.0 |
| [sharp](https://github.com/lovell/sharp) ‏0.34.5 | חיבור פריימים לגיליונות WebP. | Apache-2.0; תנאי התלויות כלולים בחבילת ההתקנה. |

כלי המחבר אינם מוטמעים בנכס זמן המשחק. רישיונות ספריות הצד השלישי אינם מוחלפים ב־CC0. מקורות קיימים נקראו בלבד; כל קובצי המסירה החדשים נמצאים בתיקייה זו.
