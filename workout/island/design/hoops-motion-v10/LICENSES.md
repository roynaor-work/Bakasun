# רישיונות ומקורות — v10

כל הקבצים החדשים במסירה זו מוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). התנועות, קוד המקור, התצוגה, המדידות והתיעוד הם יצירה מקורית למסירה זו. הדמויות בדויות ואין מותגים, סמלי קבוצות או אנשים אמיתיים.

## מקור קפוא של הדמויות

שלושת המודלים ונתוני הקשירה מועתקים ללא שינוי מ־[hoops-tall-v1 בקומיט cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa](https://github.com/roynaor-work/Bakasun/tree/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1). הגיבובים של המודלים מופיעים ב־runtime/rig.json וב־verification/measurements.json. [רישיון המקור המלא](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/LICENSES.md).

אנטומיה, פנים, עור ועיניים: נכסי הליבה של MakeHuman/MPFB ב־CC0 לפי [המקור הרשמי](https://static.makehumancommunity.org/about/license.html). מקור הביניים במאגר: hoops-v7/characters/models/pg-lod1.glb, SHA-256 4f9ee0fc5b7d08836981483d279dc7025b417501486268797995478b8a9dd651. גזרת הגופייה מבוססת על authored-sewn-jersey המקורי של המאגר; הנעליים, השיער, המכנסיים והתאמות המידות והמשקולות הם היצירה המקורית של hoops-tall-v1 ונמסרו שם ב־CC0. לא נוספו נכסי ביגוד מסחריים.

השלד משתמש בשמות ובהיררכיה הקנוניים של motion2; הפרופורציות ממקור tall הקפוא. כל התנועות נכתבו כאן מחדש כמטרות ואילוצים ונפתרו ב־IK; לא הועתקו דגימות אנימציה מ־v8 או v9 ואין שימוש במוקאפ של אדם אמיתי.

## תלות בכלים קיימים

לא נוספו ספריות צד שלישי לתיקייה. preview.mjs מפנה לעותקי Three.js r160 ו־GLTFLoader שכבר ב־hoops-motion-v8/runtime/vendor, עם [רישיון MIT הקיים](../hoops-motion-v8/runtime/vendor/LICENSE.three). ספריות אלו אינן מוצגות כ־CC0 ואינן מועתקות או משנות רישיון. כלי glTF Transform, glTF Validator, Sharp ו־Playwright מותקנים ב־/tmp בלבד; קוד הכלים אינו חלק מהנכסים המופצים. אין נכסים חיצוניים נטענים מהרשת בזמן התצוגה.

## רישיון ומקור לכל קובץ

| קובץ | מקור | רישיון |
|---|---|---|
| [LICENSES.md](LICENSES.md) | יצירה מקורית למסירה זו | CC0-1.0 |
| [README.md](README.md) | יצירה מקורית למסירה זו | CC0-1.0 |
| [REPORT.md](REPORT.md) | יצירה מקורית למסירה זו | CC0-1.0 |
| [preview.css](preview.css) | יצירה מקורית למסירה זו | CC0-1.0 |
| [preview.html](preview.html) | יצירה מקורית למסירה זו | CC0-1.0 |
| [preview.mjs](preview.mjs) | יצירה מקורית למסירה זו | CC0-1.0 |
| [runtime/catalog.json](runtime/catalog.json) | קטלוג מקורי — source/author.mjs; נתוני פרופילים מ־tall CC0 | CC0-1.0 |
| [runtime/clips/center/defensive_block.glb](runtime/clips/center/defensive_block.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/defensive_slide_left.glb](runtime/clips/center/defensive_slide_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/defensive_slide_right.glb](runtime/clips/center/defensive_slide_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/defensive_stance.glb](runtime/clips/center/defensive_stance.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dribble_behind_back.glb](runtime/clips/center/dribble_behind_back.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dunk_high.glb](runtime/clips/center/dunk_high.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/dunk_low.glb](runtime/clips/center/dunk_low.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/layup_left.glb](runtime/clips/center/layup_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/layup_right.glb](runtime/clips/center/layup_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/pivot.glb](runtime/clips/center/pivot.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/shot_start.glb](runtime/clips/center/shot_start.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/sprint_brake.glb](runtime/clips/center/sprint_brake.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/sprint_brake_ball.glb](runtime/clips/center/sprint_brake_ball.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/stop_two_feet.glb](runtime/clips/center/stop_two_feet.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/turn_180_left.glb](runtime/clips/center/turn_180_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/turn_180_right.glb](runtime/clips/center/turn_180_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/turn_90_left.glb](runtime/clips/center/turn_90_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/center/turn_90_right.glb](runtime/clips/center/turn_90_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/defensive_block.glb](runtime/clips/guard/defensive_block.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/defensive_slide_left.glb](runtime/clips/guard/defensive_slide_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/defensive_slide_right.glb](runtime/clips/guard/defensive_slide_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/defensive_stance.glb](runtime/clips/guard/defensive_stance.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dribble_behind_back.glb](runtime/clips/guard/dribble_behind_back.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dunk_high.glb](runtime/clips/guard/dunk_high.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/dunk_low.glb](runtime/clips/guard/dunk_low.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/layup_left.glb](runtime/clips/guard/layup_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/layup_right.glb](runtime/clips/guard/layup_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/pivot.glb](runtime/clips/guard/pivot.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/shot_start.glb](runtime/clips/guard/shot_start.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/sprint_brake.glb](runtime/clips/guard/sprint_brake.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/sprint_brake_ball.glb](runtime/clips/guard/sprint_brake_ball.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/stop_two_feet.glb](runtime/clips/guard/stop_two_feet.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/turn_180_left.glb](runtime/clips/guard/turn_180_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/turn_180_right.glb](runtime/clips/guard/turn_180_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/turn_90_left.glb](runtime/clips/guard/turn_90_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/guard/turn_90_right.glb](runtime/clips/guard/turn_90_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/defensive_block.glb](runtime/clips/wing/defensive_block.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/defensive_slide_left.glb](runtime/clips/wing/defensive_slide_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/defensive_slide_right.glb](runtime/clips/wing/defensive_slide_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/defensive_stance.glb](runtime/clips/wing/defensive_stance.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dribble_behind_back.glb](runtime/clips/wing/dribble_behind_back.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dunk_high.glb](runtime/clips/wing/dunk_high.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/dunk_low.glb](runtime/clips/wing/dunk_low.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/layup_left.glb](runtime/clips/wing/layup_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/layup_right.glb](runtime/clips/wing/layup_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/pivot.glb](runtime/clips/wing/pivot.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/shot_start.glb](runtime/clips/wing/shot_start.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/sprint_brake.glb](runtime/clips/wing/sprint_brake.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/sprint_brake_ball.glb](runtime/clips/wing/sprint_brake_ball.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/stop_two_feet.glb](runtime/clips/wing/stop_two_feet.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/turn_180_left.glb](runtime/clips/wing/turn_180_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/turn_180_right.glb](runtime/clips/wing/turn_180_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/turn_90_left.glb](runtime/clips/wing/turn_90_left.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/clips/wing/turn_90_right.glb](runtime/clips/wing/turn_90_right.glb) | ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית | CC0-1.0 |
| [runtime/keyframes/center/defensive_block.json](runtime/keyframes/center/defensive_block.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/defensive_slide_left.json](runtime/keyframes/center/defensive_slide_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/defensive_slide_right.json](runtime/keyframes/center/defensive_slide_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/defensive_stance.json](runtime/keyframes/center/defensive_stance.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dribble_behind_back.json](runtime/keyframes/center/dribble_behind_back.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dunk_high.json](runtime/keyframes/center/dunk_high.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/dunk_low.json](runtime/keyframes/center/dunk_low.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/layup_left.json](runtime/keyframes/center/layup_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/layup_right.json](runtime/keyframes/center/layup_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/pivot.json](runtime/keyframes/center/pivot.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/shot_start.json](runtime/keyframes/center/shot_start.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/sprint_brake.json](runtime/keyframes/center/sprint_brake.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/sprint_brake_ball.json](runtime/keyframes/center/sprint_brake_ball.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/stop_two_feet.json](runtime/keyframes/center/stop_two_feet.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/turn_180_left.json](runtime/keyframes/center/turn_180_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/turn_180_right.json](runtime/keyframes/center/turn_180_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/turn_90_left.json](runtime/keyframes/center/turn_90_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/center/turn_90_right.json](runtime/keyframes/center/turn_90_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/defensive_block.json](runtime/keyframes/guard/defensive_block.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/defensive_slide_left.json](runtime/keyframes/guard/defensive_slide_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/defensive_slide_right.json](runtime/keyframes/guard/defensive_slide_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/defensive_stance.json](runtime/keyframes/guard/defensive_stance.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dribble_behind_back.json](runtime/keyframes/guard/dribble_behind_back.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dunk_high.json](runtime/keyframes/guard/dunk_high.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/dunk_low.json](runtime/keyframes/guard/dunk_low.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/layup_left.json](runtime/keyframes/guard/layup_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/layup_right.json](runtime/keyframes/guard/layup_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/pivot.json](runtime/keyframes/guard/pivot.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/shot_start.json](runtime/keyframes/guard/shot_start.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/sprint_brake.json](runtime/keyframes/guard/sprint_brake.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/sprint_brake_ball.json](runtime/keyframes/guard/sprint_brake_ball.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/stop_two_feet.json](runtime/keyframes/guard/stop_two_feet.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/turn_180_left.json](runtime/keyframes/guard/turn_180_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/turn_180_right.json](runtime/keyframes/guard/turn_180_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/turn_90_left.json](runtime/keyframes/guard/turn_90_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/guard/turn_90_right.json](runtime/keyframes/guard/turn_90_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/defensive_block.json](runtime/keyframes/wing/defensive_block.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/defensive_slide_left.json](runtime/keyframes/wing/defensive_slide_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/defensive_slide_right.json](runtime/keyframes/wing/defensive_slide_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/defensive_stance.json](runtime/keyframes/wing/defensive_stance.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dribble_behind_back.json](runtime/keyframes/wing/dribble_behind_back.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dunk_high.json](runtime/keyframes/wing/dunk_high.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/dunk_low.json](runtime/keyframes/wing/dunk_low.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/layup_left.json](runtime/keyframes/wing/layup_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/layup_right.json](runtime/keyframes/wing/layup_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/pivot.json](runtime/keyframes/wing/pivot.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/shot_start.json](runtime/keyframes/wing/shot_start.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/sprint_brake.json](runtime/keyframes/wing/sprint_brake.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/sprint_brake_ball.json](runtime/keyframes/wing/sprint_brake_ball.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/stop_two_feet.json](runtime/keyframes/wing/stop_two_feet.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/turn_180_left.json](runtime/keyframes/wing/turn_180_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/turn_180_right.json](runtime/keyframes/wing/turn_180_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/turn_90_left.json](runtime/keyframes/wing/turn_90_left.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/keyframes/wing/turn_90_right.json](runtime/keyframes/wing/turn_90_right.json) | מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs | CC0-1.0 |
| [runtime/math.mjs](runtime/math.mjs) | יצירה מקורית למסירה זו | CC0-1.0 |
| [runtime/models/center.glb](runtime/models/center.glb) | [עותק runtime מקורי מ־tall](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/runtime/center.glb) — MakeHuman CC0 ותוספות tall מקוריות כמתואר לעיל | CC0-1.0 |
| [runtime/models/guard.glb](runtime/models/guard.glb) | [עותק runtime מקורי מ־tall](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/runtime/guard.glb) — MakeHuman CC0 ותוספות tall מקוריות כמתואר לעיל | CC0-1.0 |
| [runtime/models/wing.glb](runtime/models/wing.glb) | [עותק runtime מקורי מ־tall](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/runtime/wing.glb) — MakeHuman CC0 ותוספות tall מקוריות כמתואר לעיל | CC0-1.0 |
| [runtime/rig.json](runtime/rig.json) | עותק rig.json מקומיט tall הקפוא; מידות ומפת שלד CC0 | CC0-1.0 |
| [source/README.md](source/README.md) | יצירה מקורית למסירה זו | CC0-1.0 |
| [source/author.mjs](source/author.mjs) | יצירה מקורית למסירה זו | CC0-1.0 |
| [source/document.mjs](source/document.mjs) | יצירה מקורית למסירה זו | CC0-1.0 |
| [source/export-glb.mjs](source/export-glb.mjs) | יצירה מקורית למסירה זו | CC0-1.0 |
| [source/verify-browser.mjs](source/verify-browser.mjs) | יצירה מקורית למסירה זו | CC0-1.0 |
| [source/verify.mjs](source/verify.mjs) | יצירה מקורית למסירה זו | CC0-1.0 |
| [verification/browser.json](verification/browser.json) | מדידה מקורית של הקבצים שנמסרו — source/verify.mjs או source/verify-browser.mjs | CC0-1.0 |
| [verification/contact-sheet.png](verification/contact-sheet.png) | צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs | CC0-1.0 |
| [verification/gltf-validation.json](verification/gltf-validation.json) | מדידה מקורית של הקבצים שנמסרו — source/verify.mjs או source/verify-browser.mjs | CC0-1.0 |
| [verification/layup-sequence.png](verification/layup-sequence.png) | צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs | CC0-1.0 |
| [verification/measurements.json](verification/measurements.json) | מדידה מקורית של הקבצים שנמסרו — source/verify.mjs או source/verify-browser.mjs | CC0-1.0 |
| [verification/preview-desktop.png](verification/preview-desktop.png) | צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs | CC0-1.0 |
| [verification/preview-mobile.png](verification/preview-mobile.png) | צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs | CC0-1.0 |
