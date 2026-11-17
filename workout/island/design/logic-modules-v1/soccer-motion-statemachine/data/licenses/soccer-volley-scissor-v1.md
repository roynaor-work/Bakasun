# רישוי ומקורות

הכוריאוגרפיה, מסלולי הכדור, נתוני המגע, הקוד המקורי, התיעוד וצילומי התצוגה בחבילה מוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). ככל שהחוק מאפשר, היוצרים מוותרים על זכויות היוצרים והזכויות הנלוות; כשהוויתור אינו תקף חל רישיון הגיבוי של CC0. אין אחריות.

## תנועה, דמות וכלים — CC0-1.0

התנועות החדשות נכתבו באופן פרוצדורלי עם קינמטיקה הפוכה על השלד הקנוני בן 18 העצמות. הן אינן הקלטת motion capture ואינן מבוססות על זהות של ספורטאי מסוים. הדמות הבדיונית, הגאומטריה, ה־skin והחומרים מקורם בדמות MakeHuman hm08 ונכסי מערכת CC0, דרך soccer-motion-v8 ו־[soccer-motion-v10](https://github.com/roynaor-work/Bakasun/blob/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/LICENSES.md).

| קבצים | מקור |
|---|---|
| `reference/idle_relaxed.glb`, `reference/run.glb`; גאומטריית `clips/*.glb` | [soccer-kicks-v2 @ d4a27a94](https://github.com/roynaor-work/Bakasun/tree/d4a27a94dd63127dd9f38fc641db414bd09bac35/workout/island/design/soccer-kicks-v2), שמעתיק את ייחוסי soccer-header-v1 ללא שינוי |
| `reference/locomotion_idle.glb`, `reference/locomotion_run.glb` | [soccer-locomotion-v2 @ ec6c7394](https://github.com/roynaor-work/Bakasun/tree/ec6c73949fb5820826b4c082972f5d4f1136641f/workout/island/design/soccer-locomotion-v2), ייחוסי האנימציה המלאים לבדיקת תאימות |
| `source/rig.mjs`, `source/glb.mjs`, `source/hermite.mjs` | כלי soccer-header-v1 מתוך קומיט kicks לעיל. ב־rig הותאם נתיב הייבוא המקומי בלבד |
| `player.mjs` | גשר Hermite C1 ותיקון רצפה מ־soccer-kicks-v2; נתיבי הייבוא הותאמו לתיקייה העצמאית |
| `vendor/qa/metrics.mjs`, `vendor/qa/glb.mjs` | [motion-qa-v1 @ 5eb4f093](https://github.com/roynaor-work/Bakasun/blob/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1/LICENSES.md). המדדים הועתקו ללא שינוי; ב־parser הותאם נתיב Three בלבד |
| יתר הקבצים מחוץ ל־`vendor/` | תרומה מקורית למשימה זו, או נתונים נגזרים מהמקורות המפורטים כאן; CC0-1.0 |

## תוכנה — MIT

`vendor/three.module.js`, `vendor/GLTFLoader.js`, `vendor/BufferGeometryUtils.js` הם Three.js r160, Copyright © 2010–2023 Three.js authors, לפי [רישיון MIT המצורף](vendor/LICENSE.three). הועתקו מהריפו ללא שינוי. תנאי MIT נשמרים ואינם מוחלפים בהקדשת CC0.

Playwright/Chromium, Python/Pillow ו־Khronos glTF Validator משמשים לבנייה ולבדיקה מחוץ לחבילת הנכסים ואינם נמסרים כתלויות ריצה. אין צורך בהורדות רשת כדי להפעיל את התצוגה דרך שרת HTTP מקומי.

חתימות המקורות וחתימת כל קובץ מסירה נמצאות ב־[provenance.json](verification/provenance.json) וב־[inventory.json](verification/inventory.json). למלאי עצמו אין חתימה עצמית, כדי למנוע תלות מעגלית.
