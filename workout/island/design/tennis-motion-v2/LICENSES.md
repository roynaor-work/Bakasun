# רישיונות ומקורות

הכוריאוגרפיה, קוד היצירה והגשרים, התיעוד, נתוני הקטלוג, המדידות והתמונות המקוריים בחבילה זו מוקדשים לנחלת הכלל לפי [CC0-1.0 — הנוסח המשפטי](https://creativecommons.org/publicdomain/zero/1.0/legalcode). במידה המותרת בחוק, המחבר מוותר על זכויות היוצרים והזכויות הנלוות בתרומות המקוריות האלה. רכיבי התוכנה ברישיון MIT המפורטים להלן שומרים על רישיונם ועל הודעות זכויות היוצרים שלהם.

| רכיב | מקור ורישיון |
|---|---|
| 24 פעולות, גרסאות גובה, מסלולי כדור ו־metadata | כוריאוגרפיה מקורית ו־IK אנליטי אפוי ב־[source/author.mjs](source/author.mjs), ‏CC0-1.0. אלה תנועות מאוירות מתמטית; אין שימוש ב־motion capture מסחרי. |
| קובצי ספריית התנועה `tennis-motion-v2.glb`, ‏`height-low.glb`, ‏`height-high.glb` | אנימציות מקוריות עם השלד, inverse bind וחוזה האחיזה המורשים להלן. גאומטריית הקישור הזעירה והשקופה ל־skin ול־morph היא יצירה מקורית ב־`source/build.mjs`, ‏CC0-1.0. מראה הדמות המלא אינו משוכפל בספריות אלה. |
| חוזה האחיזה, המחבט, מעטפות הידיים והזרועות ופתיחת יד שמאל | [tennis-grip-v1 בקומיט a096e507b11389fc10272c38101f968820e89f7e](https://github.com/roynaor-work/Bakasun/tree/a096e507b11389fc10272c38101f968820e89f7e/workout/island/design/tennis-grip-v1), ‏CC0-1.0 לפי [רישיון המקור](https://github.com/roynaor-work/Bakasun/blob/a096e507b11389fc10272c38101f968820e89f7e/workout/island/design/tennis-grip-v1/LICENSES.md). קובץ המקור העצמאי נשמר ב־[source/reference/grip-player.glb](source/reference/grip-player.glb). |
| גוף, בגדים, פנים, שיער וטקסטורות שבקובץ המקור | ממוחזרים מתוך `soccer-header-v1/runtime/reference/idle_relaxed.glb` דרך tennis-grip-v1. לפי רישיון המקור: גוף בדיוני המבוסס על MakeHuman hm08 ונכסי מערכת CC0 של soccer-motion-v8, באמצעות [soccer-motion-v10 בקומיט 57c536e1291803161e069eff97987295c6194466](https://github.com/roynaor-work/Bakasun/tree/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10), ‏CC0-1.0. |
| השלד וכלי GLB | חוזה 18 העצמות של `workout/island/design/motion/soccer.json`; כלי השלד ו־GLB נגזרים מעותקי CC0 שב־tennis-grip-v1. השמות, ההורים ומנח המנוחה נשמרים. |
| `vendor/motion-qa-v1/` | עותקים ללא שינוי של כלי המדידה ובדיקותיו מתוך [motion-qa-v1 בקומיט 5eb4f093bc22523ee417a7f2345c3b813bffba24](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1), ‏CC0-1.0 לפי [רישיון הכלי](https://github.com/roynaor-work/Bakasun/blob/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1/LICENSES.md). העדויות לזהות הבתים נמצאות ב־[verification/qa-provenance.json](verification/qa-provenance.json). |
| `vendor/three.module.js`, ‏`vendor/GLTFLoader.js`, ‏`vendor/BufferGeometryUtils.js` | Three.js r160, ‏Copyright © Three.js authors, ‏MIT. [הרישיון המלא הכלול בחבילה](vendor/LICENSE.three); [מקור upstream](https://github.com/mrdoob/three.js/tree/r160). |
| preview, גשרי C1, קוד בנייה/אימות/צילום, קטלוג, דוחות ו־WebP/PNG | יצירה מקורית למשימה; התצלומים מציגים את הנכסים המורשים לעיל, ‏CC0-1.0. |

הגאומטריה והמרקמים המלאים נשמרים פעם אחת ב־`source/reference/grip-player.glb`, והוא נטען באמצעות `catalog.referenceAsset`. התצוגה מחילה עליו את האנימציות מהספריות לפי שמות העצמות והצמתים. קובץ המקור נשמר ללא שינוי וכל רכיב ממוחזר שומר על רישיונו.

אין בחבילה לוגואים, דמות של שחקן טניס אמיתי, תצלומי אנשים או סריקה של אדם מסוים. הגאומטריה והמרקמים שבקובץ הייחוס מיועדים לדמות בדיונית.

Playwright, Chromium, Pillow, גופן DejaVu Sans ו־Khronos glTF Validator שימשו להפקה ולאימות מחוץ לחבילה. תוכנות וגופנים אלה אינם מופצים כאן. התצוגה עצמאית מבחינת קובצי הנכסים והספריות; היא אינה טוענת נכסים מ־CDN.

מלאי הקבצים, גודלם, רישיונם ו־SHA-256 שלהם נמצא ב־[manifest.json](manifest.json). קובץ המלאי עצמו אינו כולל hash של עצמו. הקומיטים וקובץ המקור נעולים גם ב־[catalog.json](catalog.json).
