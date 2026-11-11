# רישיונות ומקורות — hoops-motion-v11

כל הקבצים החדשים בתיקיית hoops-motion-v11 — הנכסים, הכוריאוגרפיה, קוד המקור המקורי, התצוגה, התיעוד והמדידות — מקוריים/CC0 ומוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). ההקדשה חלה ככל שהדין מאפשר; נוסח CC0 המלא בקישור. הדמויות בדויות. אין מותגים, סמלי קבוצות או דמויות של אנשים אמיתיים. אין שימוש במוקאפ או בסריקה של אדם אמיתי.

לא נוספו עותקי תוכנה של צד שלישי לתיקיית v11. התצוגה משתמשת בשלושה קובצי תוכנה שכבר קיימים ב־main מחוץ לתיקייה זו, תחת hoops-motion-v8/runtime/vendor. הם נשארים ברישיון MIT ואינם מוצגים כ־CC0. הודעת הזכויות והרישיון המלאה נמצאת ב־[LICENSE.three הקיים בקומיט הבסיס](https://github.com/roynaor-work/Bakasun/blob/ae09529bc8fc9ff42f6aa76b8e79e7f760992f62/workout/island/design/hoops-motion-v8/runtime/vendor/LICENSE.three). לא נערך קובץ תוכנה קיים ולא שונה רישיונו.

## מקור קפוא של הדמויות

שלושת קובצי runtime/models והקובץ runtime/rig.json הועתקו ללא שינוי מ־[hoops-tall-v1 בקומיט cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa](https://github.com/roynaor-work/Bakasun/tree/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1). המודלים הם עותקי runtime הבלתי דחוסים מהמקור. הגיבובים נמצאים בפרופילי runtime/rig.json וב־verification/measurements.json. [רישיון המקור המלא](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/LICENSES.md).

גוף, פנים, עור ועיניים: ליבת MakeHuman/MPFB, לפי [דף הרישוי הרשמי](https://static.makehumancommunity.org/about/license.html): “All core assets are shared under Creative Commons, CC0”. מקור הביניים הוא hoops-v7/characters/models/pg-lod1.glb, SHA-256 4f9ee0fc5b7d08836981483d279dc7025b417501486268797995478b8a9dd651. גזרת הגופייה מבוססת על authored-sewn-jersey המקורי של המאגר. השיער, הנעליים, המכנסיים, שינויי המידות והמשקולות והאזורים החדשים באטלס נוצרו ב־hoops-tall-v1 ונמסרו שם ב־CC0. לא נוספו נכסי לבוש מסחריים. נתוני הקשירה נשענים על השלד הקנוני של motion2 עם מידות tall.

## מקור התנועה והקוד

30 המהלכים החדשים נוצרו כמטרות תנועה ואילוצים ב־source/author.mjs ונפתרו לכל פרופיל בנפרד. קוד המתמטיקה, יצואן האנימציה ומסגרת האימות נשענים על הקוד המקורי CC0 ב־[hoops-motion-v10 בקומיט a5d245981acba83c1bad88de59bf30ca7bde53a5](https://github.com/roynaor-work/Bakasun/tree/a5d245981acba83c1bad88de59bf30ca7bde53a5/workout/island/design/hoops-motion-v10). המקור המדויק מצוין לכל קובץ בטבלה. אין כאן העברה של רישיון חדש לקובצי מקור קיימים מחוץ לתיקייה.

## תלויות תוכנה וכלים

התצוגה משתמשת ב־Three.js r160, GLTFLoader ו־BufferGeometryUtils המקומיים שכבר נמצאים ב־main, קומיט ae09529bc8fc9ff42f6aa76b8e79e7f760992f62. הם אינם קבצים חדשים במסירה ואינם מועתקים לתיקיית v11. המקורות המדויקים במאגר:

| תלות תוכנה קיימת, מחוץ לתיקיית v11 | מקור קפוא ב־main | SHA-256 שנמדד בדפדפן | רישיון קיים |
|---|---|---|---|
| three.module.js | [מקור](https://github.com/roynaor-work/Bakasun/blob/ae09529bc8fc9ff42f6aa76b8e79e7f760992f62/workout/island/design/hoops-motion-v8/runtime/vendor/three.module.js) | 3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6 | [MIT](https://github.com/roynaor-work/Bakasun/blob/ae09529bc8fc9ff42f6aa76b8e79e7f760992f62/workout/island/design/hoops-motion-v8/runtime/vendor/LICENSE.three) |
| GLTFLoader.js | [מקור](https://github.com/roynaor-work/Bakasun/blob/ae09529bc8fc9ff42f6aa76b8e79e7f760992f62/workout/island/design/hoops-motion-v8/runtime/vendor/GLTFLoader.js) | 1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e | [MIT](https://github.com/roynaor-work/Bakasun/blob/ae09529bc8fc9ff42f6aa76b8e79e7f760992f62/workout/island/design/hoops-motion-v8/runtime/vendor/LICENSE.three) |
| BufferGeometryUtils.js | [מקור](https://github.com/roynaor-work/Bakasun/blob/ae09529bc8fc9ff42f6aa76b8e79e7f760992f62/workout/island/design/hoops-motion-v8/runtime/vendor/BufferGeometryUtils.js) | 3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3 | [MIT](https://github.com/roynaor-work/Bakasun/blob/ae09529bc8fc9ff42f6aa76b8e79e7f760992f62/workout/island/design/hoops-motion-v8/runtime/vendor/LICENSE.three) |

התוכנה מזוהה לפי REVISION 160, גיבובי הקבצים והמקור הקפוא במאגר; אין כאן טענה לזהות בבתים מול npm three@0.160.1. מקור Three.js במעלה הזרם הוא [r160](https://github.com/mrdoob/three.js/tree/r160), ופרטי ההפצה הקיימת הם אלו שבקומיט main המקושר. התצוגה אינה טוענת ספריות, מודלים או תמונות משירות חיצוני בזמן הריצה. בשכפול sparse יש להוסיף את תיקיית התוכנה הקיימת לפי README.md. הודעת MIT נשארת ללא שינוי במיקומה הקיים מחוץ לתיקיית המסירה.

כלי הפיתוח @gltf-transform/core 4.2.1, gltf-validator 2.0.0-dev.3.10, Playwright 1.56.1 ו־Sharp 0.35.5 מותקנים ב־/tmp/hoops-v11-tools בלבד. קוד הכלים אינו חלק מהנכסים המופצים ואינו נכלל בהקדשת CC0 של החבילה. גרסת three בכלי הפיתוח היא 0.160.1; התצוגה נבדקת מול ספריית r160 המשותפת הקיימת בפועל.

## מקור ורישיון לכל קובץ חדש

המלאי הבא נוצר מסריקת הקבצים הקיימים בפועל בתיקיית החבילה, כולל מסמכי הרישוי והמדידה עצמם.

| קובץ | מקור | רישיון |
|---|---|---|
| [LICENSES.md](LICENSES.md) | יצירה מקורית למסירת v11 | CC0-1.0 |
| [README.md](README.md) | יצירה מקורית למסירת v11 | CC0-1.0 |
| [REPORT.md](REPORT.md) | יצירה מקורית למסירת v11 | CC0-1.0 |
| [preview.css](preview.css) | תצוגת v11 מקורית; תשתית ניגון/ממשק הותאמה מ־[hoops-motion-v10/preview.css](https://github.com/roynaor-work/Bakasun/blob/a5d245981acba83c1bad88de59bf30ca7bde53a5/workout/island/design/hoops-motion-v10/preview.css) | CC0-1.0 |
| [preview.html](preview.html) | תצוגת v11 מקורית; תשתית ניגון/ממשק הותאמה מ־[hoops-motion-v10/preview.html](https://github.com/roynaor-work/Bakasun/blob/a5d245981acba83c1bad88de59bf30ca7bde53a5/workout/island/design/hoops-motion-v10/preview.html) | CC0-1.0 |
| [preview.mjs](preview.mjs) | תצוגת v11 מקורית; תשתית ניגון/ממשק הותאמה מ־[hoops-motion-v10/preview.mjs](https://github.com/roynaor-work/Bakasun/blob/a5d245981acba83c1bad88de59bf30ca7bde53a5/workout/island/design/hoops-motion-v10/preview.mjs) | CC0-1.0 |
| [runtime/catalog.json](runtime/catalog.json) | קטלוג מהלכים מקורי — source/author.mjs; מידות ומטא־נתוני פרופילים מ־hoops-tall-v1 CC0 | CC0-1.0 |
| [runtime/clips/center/body_block.glb](runtime/clips/center/body_block.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/close_guard.glb](runtime/clips/center/close_guard.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_behind_back.glb](runtime/clips/center/dribble_behind_back.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_between_legs.glb](runtime/clips/center/dribble_between_legs.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_crossover.glb](runtime/clips/center/dribble_crossover.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_hesitation.glb](runtime/clips/center/dribble_hesitation.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_jab_step.glb](runtime/clips/center/dribble_jab_step.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_protective.glb](runtime/clips/center/dribble_protective.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_spin.glb](runtime/clips/center/dribble_spin.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_sprint.glb](runtime/clips/center/dribble_sprint.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_step_back.glb](runtime/clips/center/dribble_step_back.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/fadeaway.glb](runtime/clips/center/fadeaway.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/floater.glb](runtime/clips/center/floater.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/hook_shot.glb](runtime/clips/center/hook_shot.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/jump_shot.glb](runtime/clips/center/jump_shot.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/lane_intercept.glb](runtime/clips/center/lane_intercept.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/pass_alley_oop.glb](runtime/clips/center/pass_alley_oop.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/pass_behind_back.glb](runtime/clips/center/pass_behind_back.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/pass_bounce.glb](runtime/clips/center/pass_bounce.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/pass_chest.glb](runtime/clips/center/pass_chest.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/pass_jump.glb](runtime/clips/center/pass_jump.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/pass_overhead.glb](runtime/clips/center/pass_overhead.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/rebound_defensive.glb](runtime/clips/center/rebound_defensive.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/rebound_offensive.glb](runtime/clips/center/rebound_offensive.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/screen.glb](runtime/clips/center/screen.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/shot_block.glb](runtime/clips/center/shot_block.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/shot_under_pressure.glb](runtime/clips/center/shot_under_pressure.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/steal.glb](runtime/clips/center/steal.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/three_catch.glb](runtime/clips/center/three_catch.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/three_off_dribble.glb](runtime/clips/center/three_off_dribble.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/body_block.glb](runtime/clips/guard/body_block.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/close_guard.glb](runtime/clips/guard/close_guard.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_behind_back.glb](runtime/clips/guard/dribble_behind_back.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_between_legs.glb](runtime/clips/guard/dribble_between_legs.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_crossover.glb](runtime/clips/guard/dribble_crossover.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_hesitation.glb](runtime/clips/guard/dribble_hesitation.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_jab_step.glb](runtime/clips/guard/dribble_jab_step.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_protective.glb](runtime/clips/guard/dribble_protective.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_spin.glb](runtime/clips/guard/dribble_spin.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_sprint.glb](runtime/clips/guard/dribble_sprint.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_step_back.glb](runtime/clips/guard/dribble_step_back.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/fadeaway.glb](runtime/clips/guard/fadeaway.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/floater.glb](runtime/clips/guard/floater.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/hook_shot.glb](runtime/clips/guard/hook_shot.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/jump_shot.glb](runtime/clips/guard/jump_shot.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/lane_intercept.glb](runtime/clips/guard/lane_intercept.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/pass_alley_oop.glb](runtime/clips/guard/pass_alley_oop.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/pass_behind_back.glb](runtime/clips/guard/pass_behind_back.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/pass_bounce.glb](runtime/clips/guard/pass_bounce.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/pass_chest.glb](runtime/clips/guard/pass_chest.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/pass_jump.glb](runtime/clips/guard/pass_jump.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/pass_overhead.glb](runtime/clips/guard/pass_overhead.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/rebound_defensive.glb](runtime/clips/guard/rebound_defensive.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/rebound_offensive.glb](runtime/clips/guard/rebound_offensive.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/screen.glb](runtime/clips/guard/screen.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/shot_block.glb](runtime/clips/guard/shot_block.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/shot_under_pressure.glb](runtime/clips/guard/shot_under_pressure.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/steal.glb](runtime/clips/guard/steal.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/three_catch.glb](runtime/clips/guard/three_catch.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/three_off_dribble.glb](runtime/clips/guard/three_off_dribble.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/body_block.glb](runtime/clips/wing/body_block.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/close_guard.glb](runtime/clips/wing/close_guard.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_behind_back.glb](runtime/clips/wing/dribble_behind_back.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_between_legs.glb](runtime/clips/wing/dribble_between_legs.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_crossover.glb](runtime/clips/wing/dribble_crossover.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_hesitation.glb](runtime/clips/wing/dribble_hesitation.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_jab_step.glb](runtime/clips/wing/dribble_jab_step.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_protective.glb](runtime/clips/wing/dribble_protective.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_spin.glb](runtime/clips/wing/dribble_spin.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_sprint.glb](runtime/clips/wing/dribble_sprint.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_step_back.glb](runtime/clips/wing/dribble_step_back.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/fadeaway.glb](runtime/clips/wing/fadeaway.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/floater.glb](runtime/clips/wing/floater.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/hook_shot.glb](runtime/clips/wing/hook_shot.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/jump_shot.glb](runtime/clips/wing/jump_shot.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/lane_intercept.glb](runtime/clips/wing/lane_intercept.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/pass_alley_oop.glb](runtime/clips/wing/pass_alley_oop.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/pass_behind_back.glb](runtime/clips/wing/pass_behind_back.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/pass_bounce.glb](runtime/clips/wing/pass_bounce.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/pass_chest.glb](runtime/clips/wing/pass_chest.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/pass_jump.glb](runtime/clips/wing/pass_jump.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/pass_overhead.glb](runtime/clips/wing/pass_overhead.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/rebound_defensive.glb](runtime/clips/wing/rebound_defensive.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/rebound_offensive.glb](runtime/clips/wing/rebound_offensive.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/screen.glb](runtime/clips/wing/screen.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/shot_block.glb](runtime/clips/wing/shot_block.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/shot_under_pressure.glb](runtime/clips/wing/shot_under_pressure.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/steal.glb](runtime/clips/wing/steal.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/three_catch.glb](runtime/clips/wing/three_catch.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/three_off_dribble.glb](runtime/clips/wing/three_off_dribble.glb) | יצוא של הכוריאוגרפיה המקורית — source/author.mjs ו־source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/keyframes/center/body_block.json](runtime/keyframes/center/body_block.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/close_guard.json](runtime/keyframes/center/close_guard.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_behind_back.json](runtime/keyframes/center/dribble_behind_back.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_between_legs.json](runtime/keyframes/center/dribble_between_legs.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_crossover.json](runtime/keyframes/center/dribble_crossover.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_hesitation.json](runtime/keyframes/center/dribble_hesitation.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_jab_step.json](runtime/keyframes/center/dribble_jab_step.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_protective.json](runtime/keyframes/center/dribble_protective.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_spin.json](runtime/keyframes/center/dribble_spin.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_sprint.json](runtime/keyframes/center/dribble_sprint.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_step_back.json](runtime/keyframes/center/dribble_step_back.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/fadeaway.json](runtime/keyframes/center/fadeaway.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/floater.json](runtime/keyframes/center/floater.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/hook_shot.json](runtime/keyframes/center/hook_shot.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/jump_shot.json](runtime/keyframes/center/jump_shot.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/lane_intercept.json](runtime/keyframes/center/lane_intercept.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/pass_alley_oop.json](runtime/keyframes/center/pass_alley_oop.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/pass_behind_back.json](runtime/keyframes/center/pass_behind_back.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/pass_bounce.json](runtime/keyframes/center/pass_bounce.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/pass_chest.json](runtime/keyframes/center/pass_chest.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/pass_jump.json](runtime/keyframes/center/pass_jump.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/pass_overhead.json](runtime/keyframes/center/pass_overhead.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/rebound_defensive.json](runtime/keyframes/center/rebound_defensive.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/rebound_offensive.json](runtime/keyframes/center/rebound_offensive.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/screen.json](runtime/keyframes/center/screen.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/shot_block.json](runtime/keyframes/center/shot_block.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/shot_under_pressure.json](runtime/keyframes/center/shot_under_pressure.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/steal.json](runtime/keyframes/center/steal.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/three_catch.json](runtime/keyframes/center/three_catch.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/three_off_dribble.json](runtime/keyframes/center/three_off_dribble.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/body_block.json](runtime/keyframes/guard/body_block.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/close_guard.json](runtime/keyframes/guard/close_guard.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_behind_back.json](runtime/keyframes/guard/dribble_behind_back.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_between_legs.json](runtime/keyframes/guard/dribble_between_legs.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_crossover.json](runtime/keyframes/guard/dribble_crossover.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_hesitation.json](runtime/keyframes/guard/dribble_hesitation.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_jab_step.json](runtime/keyframes/guard/dribble_jab_step.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_protective.json](runtime/keyframes/guard/dribble_protective.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_spin.json](runtime/keyframes/guard/dribble_spin.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_sprint.json](runtime/keyframes/guard/dribble_sprint.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_step_back.json](runtime/keyframes/guard/dribble_step_back.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/fadeaway.json](runtime/keyframes/guard/fadeaway.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/floater.json](runtime/keyframes/guard/floater.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/hook_shot.json](runtime/keyframes/guard/hook_shot.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/jump_shot.json](runtime/keyframes/guard/jump_shot.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/lane_intercept.json](runtime/keyframes/guard/lane_intercept.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/pass_alley_oop.json](runtime/keyframes/guard/pass_alley_oop.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/pass_behind_back.json](runtime/keyframes/guard/pass_behind_back.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/pass_bounce.json](runtime/keyframes/guard/pass_bounce.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/pass_chest.json](runtime/keyframes/guard/pass_chest.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/pass_jump.json](runtime/keyframes/guard/pass_jump.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/pass_overhead.json](runtime/keyframes/guard/pass_overhead.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/rebound_defensive.json](runtime/keyframes/guard/rebound_defensive.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/rebound_offensive.json](runtime/keyframes/guard/rebound_offensive.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/screen.json](runtime/keyframes/guard/screen.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/shot_block.json](runtime/keyframes/guard/shot_block.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/shot_under_pressure.json](runtime/keyframes/guard/shot_under_pressure.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/steal.json](runtime/keyframes/guard/steal.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/three_catch.json](runtime/keyframes/guard/three_catch.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/three_off_dribble.json](runtime/keyframes/guard/three_off_dribble.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/body_block.json](runtime/keyframes/wing/body_block.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/close_guard.json](runtime/keyframes/wing/close_guard.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_behind_back.json](runtime/keyframes/wing/dribble_behind_back.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_between_legs.json](runtime/keyframes/wing/dribble_between_legs.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_crossover.json](runtime/keyframes/wing/dribble_crossover.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_hesitation.json](runtime/keyframes/wing/dribble_hesitation.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_jab_step.json](runtime/keyframes/wing/dribble_jab_step.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_protective.json](runtime/keyframes/wing/dribble_protective.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_spin.json](runtime/keyframes/wing/dribble_spin.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_sprint.json](runtime/keyframes/wing/dribble_sprint.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_step_back.json](runtime/keyframes/wing/dribble_step_back.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/fadeaway.json](runtime/keyframes/wing/fadeaway.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/floater.json](runtime/keyframes/wing/floater.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/hook_shot.json](runtime/keyframes/wing/hook_shot.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/jump_shot.json](runtime/keyframes/wing/jump_shot.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/lane_intercept.json](runtime/keyframes/wing/lane_intercept.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/pass_alley_oop.json](runtime/keyframes/wing/pass_alley_oop.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/pass_behind_back.json](runtime/keyframes/wing/pass_behind_back.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/pass_bounce.json](runtime/keyframes/wing/pass_bounce.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/pass_chest.json](runtime/keyframes/wing/pass_chest.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/pass_jump.json](runtime/keyframes/wing/pass_jump.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/pass_overhead.json](runtime/keyframes/wing/pass_overhead.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/rebound_defensive.json](runtime/keyframes/wing/rebound_defensive.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/rebound_offensive.json](runtime/keyframes/wing/rebound_offensive.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/screen.json](runtime/keyframes/wing/screen.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/shot_block.json](runtime/keyframes/wing/shot_block.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/shot_under_pressure.json](runtime/keyframes/wing/shot_under_pressure.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/steal.json](runtime/keyframes/wing/steal.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/three_catch.json](runtime/keyframes/wing/three_catch.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/three_off_dribble.json](runtime/keyframes/wing/three_off_dribble.json) | כוריאוגרפיה מקורית של v11; פתרון נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/math.mjs](runtime/math.mjs) | העתק/התאמה של קוד מתמטיקה מקורי CC0 — [hoops-motion-v10/runtime/math.mjs](https://github.com/roynaor-work/Bakasun/blob/a5d245981acba83c1bad88de59bf30ca7bde53a5/workout/island/design/hoops-motion-v10/runtime/math.mjs) | CC0-1.0 |
| [runtime/models/center.glb](runtime/models/center.glb) | [עותק runtime זהה מ־hoops-tall-v1](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/runtime/center.glb) — ליבת MakeHuman CC0 ותוספות tall מקוריות, כמפורט לעיל | CC0-1.0 |
| [runtime/models/guard.glb](runtime/models/guard.glb) | [עותק runtime זהה מ־hoops-tall-v1](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/runtime/guard.glb) — ליבת MakeHuman CC0 ותוספות tall מקוריות, כמפורט לעיל | CC0-1.0 |
| [runtime/models/wing.glb](runtime/models/wing.glb) | [עותק runtime זהה מ־hoops-tall-v1](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/runtime/wing.glb) — ליבת MakeHuman CC0 ותוספות tall מקוריות, כמפורט לעיל | CC0-1.0 |
| [runtime/rig.json](runtime/rig.json) | [עותק זהה של rig.json מ־hoops-tall-v1](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/rig.json) — מידות ושלד CC0 | CC0-1.0 |
| [source/README.md](source/README.md) | יצירה מקורית למסירת v11 | CC0-1.0 |
| [source/audit-motion.mjs](source/audit-motion.mjs) | יצירה מקורית למסירת v11 | CC0-1.0 |
| [source/author.mjs](source/author.mjs) | יצירה מקורית למסירת v11 | CC0-1.0 |
| [source/document.mjs](source/document.mjs) | התאמה והרחבה למסירת v11 של קוד מקורי CC0 — [hoops-motion-v10/source/document.mjs](https://github.com/roynaor-work/Bakasun/blob/a5d245981acba83c1bad88de59bf30ca7bde53a5/workout/island/design/hoops-motion-v10/source/document.mjs) | CC0-1.0 |
| [source/export-glb.mjs](source/export-glb.mjs) | התאמה והרחבה למסירת v11 של קוד מקורי CC0 — [hoops-motion-v10/source/export-glb.mjs](https://github.com/roynaor-work/Bakasun/blob/a5d245981acba83c1bad88de59bf30ca7bde53a5/workout/island/design/hoops-motion-v10/source/export-glb.mjs) | CC0-1.0 |
| [source/verify-browser.mjs](source/verify-browser.mjs) | התאמה והרחבה למסירת v11 של קוד מקורי CC0 — [hoops-motion-v10/source/verify-browser.mjs](https://github.com/roynaor-work/Bakasun/blob/a5d245981acba83c1bad88de59bf30ca7bde53a5/workout/island/design/hoops-motion-v10/source/verify-browser.mjs) | CC0-1.0 |
| [source/verify.mjs](source/verify.mjs) | התאמה והרחבה למסירת v11 של קוד מקורי CC0 — [hoops-motion-v10/source/verify.mjs](https://github.com/roynaor-work/Bakasun/blob/a5d245981acba83c1bad88de59bf30ca7bde53a5/workout/island/design/hoops-motion-v10/source/verify.mjs) | CC0-1.0 |
| [verification/browser.json](verification/browser.json) | מדידה מקורית של הקבצים שנמסרו — source/verify.mjs או source/verify-browser.mjs | CC0-1.0 |
| [verification/contact-sheet.png](verification/contact-sheet.png) | צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs | CC0-1.0 |
| [verification/dribble-sequence.png](verification/dribble-sequence.png) | צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs | CC0-1.0 |
| [verification/gltf-validation.json](verification/gltf-validation.json) | מדידה מקורית של הקבצים שנמסרו — source/verify.mjs או source/verify-browser.mjs | CC0-1.0 |
| [verification/measurements.json](verification/measurements.json) | מדידה מקורית של הקבצים שנמסרו — source/verify.mjs או source/verify-browser.mjs | CC0-1.0 |
| [verification/motion-continuity.json](verification/motion-continuity.json) | מדידת רציפות מקורית ובלתי תלויה ב־FK של החבילה — source/audit-motion.mjs; גיבובי הקלט בכל שורה | CC0-1.0 |
| [verification/preview-desktop.png](verification/preview-desktop.png) | צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs | CC0-1.0 |
| [verification/preview-mobile.png](verification/preview-mobile.png) | צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs | CC0-1.0 |
