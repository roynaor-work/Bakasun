# רישיון ומקורות

כל הקבצים החדשים בתיקייה זו והתרומות המקוריות שלהם מוקדשים לנחלת הכלל תחת [CC0-1.0 — הנוסח המשפטי](https://creativecommons.org/publicdomain/zero/1.0/legalcode). במידה המותרת בחוק, המחבר מוותר על זכויות היוצרים והזכויות הנלוות בתרומות המקוריות. נכסי המקור הממוחזרים להלן מופצים כ־CC0 בחבילותיהם. אין שימוש בלוגואים, בדמות של שחקן אמיתי, בתמונות אנשים, בסריקת אדם מסוים או ב־motion capture מסחרי.

| רכיב | מקור ורישיון |
|---|---|
| מחבט, מעטפת הידיים, אצבעות, זרועות, morph פתיחת שמאל | יצירה מקורית ב־`source/build.mjs`, CC0-1.0 |
| תשע תנועות, מסלולי הדגמה ונתוני metadata | כוריאוגרפיה מקורית ו־IK אפוי ב־`source/author.mjs`, CC0-1.0 |
| גוף, בגדים, פנים, שיער וטקסטורות | `../soccer-header-v1/runtime/reference/idle_relaxed.glb`, CC0 לפי [רישיון החבילה](../soccer-header-v1/LICENSES.md); גוף בדיוני שמקורו ב־MakeHuman hm08 ובנכסי מערכת CC0 של [soccer-motion-v8](../soccer-motion-v8/LICENSE.md), באמצעות [soccer-motion-v10 @ 57c536e1291803161e069eff97987295c6194466](https://github.com/roynaor-work/Bakasun/tree/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10) |
| כלי שלד `source/rig.mjs` | העתק CC0 מ־`../soccer-header-v1/source/rig.mjs`, עם מגבלת טווח הגעה לזרוע בעותק החדש |
| כלי GLB `source/glb.mjs` | העתק ללא שינוי של קוד CC0 מ־`../soccer-header-v1/source/glb.mjs`, שמקורו בכלי v10 |
| חוזה 18 העצמות | `../motion/soccer.json`, CC0, שמות/סדר/הורים ומיקומי מנוחה זהים |
| דוחות QA, גיליונות SVG ו־`verification/style.css` | תוצרי כלי [motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1), לפי [רישיון CC0 שלו](https://github.com/roynaor-work/Bakasun/blob/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1/LICENSES.md); תיקוני ניווט לתוצרי HTML בלבד |
| preview, helper, כלי מדידה וצילום, PNG/WebP, מסמכים ו־JSON | תוצרים מקוריים למשימה המבוססים על הנכסים המורשים לעיל, CC0-1.0 |

המקורות המדויקים, תפקידם, גודלם ו־SHA-256 שלהם מופיעים ב־[provenance.json](verification/provenance.json). מלאי כל הקבצים החדשים ו־SHA-256 שלהם מופיע ב־[manifest.json](manifest.json), למעט hash של קובץ המלאי עצמו.

תלויות קיימות בקריאה בלבד: [Three.js r160](../soccer-motion-v8/runtime/vendor/three.module.js) ו־[GLTFLoader](../soccer-motion-v8/runtime/vendor/GLTFLoader.js), Copyright Three.js authors, [רישיון MIT המלא הקיים](../soccer-motion-v8/runtime/vendor/LICENSE.three), [מקור upstream](https://github.com/mrdoob/three.js/tree/r160). הן אינן קבצים חדשים בחבילה ותנאיהן נשארים בתוקף. אין העתק של מפענח Draco ואין נכס דחוס בחבילה.

תלויות כתיבה מחוץ למאגר: Playwright/Chromium לצילום, Pillow להרכבת גיליונות, DejaVuSans לכיתובים בתמונות ו־Khronos glTF Validator לאימות. קובצי תוכנה וגופנים אלה אינם מופצים בחבילה. הצילומים והגיליונות מציגים את הדמות והציוד המורשים עצמם.
