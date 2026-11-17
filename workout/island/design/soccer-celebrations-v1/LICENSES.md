# רישיונות ומקורות

התרומות המקוריות בחבילה זו מוקדשות לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode), במידה המותרת בחוק. קובצי ספריית Three.js נשארים ברישיון MIT, עם ההודעה המלאה ב־[vendor/LICENSE.three](vendor/LICENSE.three). שימוש חוזר בארכיון מחייב לשמר את הודעת MIT יחד עם הספרייה.

## מקור הדמות והשלד

הדמויות בדיוניות. הרשת, המשקלים, החומרים והטקסטורות המוטמעות נגזרו מהנכס המקומי:

`workout/island/design/soccer-header-v1/runtime/reference/idle_relaxed.glb`

עותק זהה שלו נמצא ב־[source/qa-reference-idle.glb](source/qa-reference-idle.glb). חתימתו:

`7a8421e3d81cb472435f523a2e99f6d75daa16afe14a423bd25d80d5df6f6b41`

המקור המדויק: [הנכס ב־main בקומיט הבסיס](https://github.com/roynaor-work/Bakasun/blob/43b27dc235387e3cb737aee9558cdf9d5fd5a262/workout/island/design/soccer-header-v1/runtime/reference/idle_relaxed.glb), לפי [רישיון חבילת הנגיחות](https://github.com/roynaor-work/Bakasun/blob/43b27dc235387e3cb737aee9558cdf9d5fd5a262/workout/island/design/soccer-header-v1/LICENSES.md). שרשרת המקור המתועדת היא שחקן בדיוני המבוסס על MakeHuman hm08 ועל נכסי מערכת CC0 מחבילת התנועה v8, דרך הקליפ הסופי v10. רישוי הגאומטריה, משקלי העור, החומרים והטקסטורות הוא CC0-1.0, בהתאם למקור המתועד; אין כאן צילום או סריקה של אדם אמיתי.

השלד הקנוני והיסטי המנוחה הועתקו מתוך [motion/soccer.json](https://github.com/roynaor-work/Bakasun/blob/43b27dc235387e3cb737aee9558cdf9d5fd5a262/workout/island/design/motion/soccer.json) אל [source/canonical-skeleton.json](source/canonical-skeleton.json) ו־[source/qa-canonical-skeleton.json](source/qa-canonical-skeleton.json), ברישיון CC0-1.0. מתמטיקת השלד וכלי GLB נגזרו מ־[source/rig.mjs](https://github.com/roynaor-work/Bakasun/blob/43b27dc235387e3cb737aee9558cdf9d5fd5a262/workout/island/design/soccer-header-v1/source/rig.mjs) ומ־[source/glb.mjs](https://github.com/roynaor-work/Bakasun/blob/43b27dc235387e3cb737aee9558cdf9d5fd5a262/workout/island/design/soccer-header-v1/source/glb.mjs) של חבילת הנגיחות, ברישיון CC0-1.0. הפניית התלות הותאמה לספרייה המקומית בחבילה זו.

התנועות, כוריאוגרפיית הזוגות והקבוצה, נתיבי הריצה והגלישה, שלבי הגביע, גאומטריית הגביע, גווני התלבושות, התצוגה, מקורות הבנייה והבדיקות והתיעוד נוצרו למשימה זו. אין קליפי motion capture חיצוניים, מותגי ספורט, סמלי קבוצות או ייחוס לתנועת ספורטאי מסוים.

## קוד צד שלישי ותלויות בדיקה

| קבצים | רישיון | מקור |
|---|---|---|
| [vendor/three.module.js](vendor/three.module.js), [vendor/GLTFLoader.js](vendor/GLTFLoader.js), [vendor/BufferGeometryUtils.js](vendor/BufferGeometryUtils.js) | MIT; Copyright © 2010–2023 three.js authors | עותקים של התלות המקומית בחבילת soccer-motion-v8; [Three.js r160](https://github.com/mrdoob/three.js/tree/r160), עם [נוסח הרישיון המלא](vendor/LICENSE.three) |
| [source/upstream-qa](source/upstream-qa/provenance.json) — שמונת קובצי הכלי המקוריים | CC0-1.0 | [motion-qa-v1 בקומיט 5eb4f093bc22523ee417a7f2345c3b813bffba24](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1), לפי [הרישיון שלו](https://github.com/roynaor-work/Bakasun/blob/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1/LICENSES.md). הקבצים נשמרו ללא שינוי וחתימותיהם מאומתות בזמן הרצה |

Playwright ו־Chromium שימשו מחוץ לחבילה לצילום ואימות. הקוד והבינריים שלהם אינם מופצים כאן; תמונות הרינדור הן תוצרי החבילה. Python ו־Node הם סביבות ריצה של המשתמש ואינם מצורפים. אין ספריית decoder, קובץ WASM או תלות רשת לניגון.

מאמת הפורמט המקומי [source/validator](source/validator/package.json) הוא חבילת Khronos glTF Validator בגרסה 2.0.0-dev.3.10, מקומפלת מ־Dart ל־JavaScript ללא WASM. רישיון Apache-2.0 המלא מצורף ב־[LICENSE](source/validator/LICENSE), והודעות ורישיונות הרכיבים הנלווים, ובהם Dart SDK, נשמרים ב־[NOTICES](source/validator/NOTICES). מקור החבילה הוא [ההפצה המקורית ב־npm](https://registry.npmjs.org/gltf-validator/-/gltf-validator-2.0.0-dev.3.10.tgz); חתימות קובציה נמצאות בדוח אימות הפורמט. קוד זה משמש לבדיקה מקומית ואינו נטען בתצוגה.

## כיסוי קובצי החבילה

כל שורה חלה על כל הקבצים שבדפוס הנתיב הנתון; החרגות MIT מפורשות בטבלה לעיל.

| קבצים | רישיון | אופן יצירה |
|---|---|---|
| models/*.glb | CC0-1.0 | 14 תנועות מקוריות על הרשת הבדיונית הקיימת לעיל; משקלים וחומרים מוטמעים. הגביע וגווני התלבושות נגזרים ומקוריים כמפורט לעיל |
| catalog.json | CC0-1.0 | מטא־דאטה, תפקידים, אירועים, חלונות מגע ותמיכה ומידות שלד המקור |
| sheets/*.webp, verification/preview-*.png | CC0-1.0 | צילומי רינדור מקוריים של הנכסים הבדיוניים בתצוגת החבילה |
| preview.html, preview.css, preview.mjs | CC0-1.0 | עיצוב וקוד מקוריים לתצוגת החגיגות; Three.js עצמו ברישיון MIT |
| start-preview.py, package.json | CC0-1.0 | מפעיל מקומי והגדרות שחזור מקוריים |
| source/author.mjs | CC0-1.0 | תנועה וכוריאוגרפיה מקוריות, פתרון קינמטי ומסלולים אפויים |
| source/rig.mjs, source/glb.mjs | CC0-1.0 | נגזרות כלי המתמטיקה והפורמט מחבילת הנגיחות, עם המקור המדויק לעיל |
| source/canonical-skeleton.json, source/qa-canonical-skeleton.json | CC0-1.0 | הגדרת השלד המקומית ממקור התנועה הקנוני |
| source/qa-reference-idle.glb | CC0-1.0 | עותק זהה של נכס ההמתנה הקיים, עם SHA-256 לעיל |
| source/run-qa.mjs, source/qa-sources.mjs, source/qa-loader.mjs, source/measure-surfaces.mjs, source/capture.mjs, source/QA.md | CC0-1.0 | מתאמי קלט, מדידות משלימות, צילום ותיעוד מקוריים למשימה |
| source/validate-glb.mjs | CC0-1.0 | מפעיל מקורי למאמת הפורמט המקומי |
| source/package.py | CC0-1.0 | כלי אריזה מקורי, היוצר את הארכיון ומניפסט החתימות |
| source/verify-package.mjs | CC0-1.0 | כלי מקורי לאימות שלמות החבילה והצלבת ראיותיה |
| MANIFEST.sha256 | CC0-1.0 | רשימת חתימות שנוצרה מקובצי המסירה באמצעות כלי האריזה |
| source/validator/** | Apache-2.0 והודעות הרכיבים הנלוות | חבילת Khronos glTF Validator כפי שתוארה לעיל, עם LICENSE ו־NOTICES המקוריים |
| source/upstream-qa/provenance.json | CC0-1.0 | רישום מקור וחתימות של כלי הבדיקה המקורי |
| verification/*.json | CC0-1.0 | ראיות בדיקה מקוריות הנגזרות מהנכסים; תוכן המדידה מציין קצב, שיטה, מקורות ומגבלות |
| verification/qa/** | CC0-1.0 | דוחות מדדים, HTML וגיליונות שלד שהפיק כלי QA המקורי על נכסי החבילה |
| REPORT.md, LICENSES.md | CC0-1.0 | תיעוד מקור, מסירה ואימות מקורי |
| soccer-celebrations-v1.zip | רישיונות רכיביו | ארכיון זהה של התיקייה, עם מסמכי הרישוי וכלי התצוגה המקומיים; ללא ארכיון מקונן |

חתימות 14 הקבצים הראשיים נמצאות ב־[catalog.json](catalog.json); חתימות המקורות וכלי הבדיקה נמצאות ב־[provenance.json](source/upstream-qa/provenance.json) וב־[motion-qa.json](verification/motion-qa.json). [MANIFEST.sha256](MANIFEST.sha256) מרכז את חתימות קובצי המסירה. הנכסים והתנועה מיועדים לשימוש, התאמה והפצה לפי רישיונות אלה.
