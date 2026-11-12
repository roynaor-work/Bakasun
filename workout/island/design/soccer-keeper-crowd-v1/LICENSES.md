# מקורות ורישיונות לכל קובץ

היצירות המקוריות שנוספו במשימה זו משוחררות לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode): במידה המותרת בחוק, ויתור על זכויות היוצרים והזכויות הנלוות, ללא תנאי ייחוס. קוד ונכסי CC0 שמקורם בענפי הפרויקט נשארים ברישיון זה. לא נעשה שימוש במותגים, סמלי קבוצות או בתצלומי אנשים.

## מקורות מוצמדים

- [motion-fix-v12 @ 5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad](https://github.com/roynaor-work/Bakasun/tree/5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad/workout/island/design/motion-fix-v12): שלד canonical18, מודל canonical-keeper (CC0-1.0) ושני מודולי ייצוא/מתמטיקה מקוריים CC0. מקור המודל הרשום בקטלוג: soccer-motion-v10 @ 57c536e1291803161e069eff97987295c6194466, runtime/clips/goalkeeper_hand_roll.glb, CC0-1.0. הכפפה הסגורה נוספה במודל חדש; המקור לא השתנה.
- [motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1): כלי מדידה מקורי CC0. קוד המדידה אינו מועתק לחבילת המסירה; הפלט מופק במטמון חיצוני. style.css המקורי של כלי QA נכלל ברישיון CC0 להצגת דוחותיו. SHA-256 של הקוד שלא שונה נמצא ב־qa/summary.json.
- [soccer-stadium-v8 @ 51f4faab518c695672efaf6323a8b72f239a2b84](https://github.com/roynaor-work/Bakasun/tree/51f4faab518c695672efaf6323a8b72f239a2b84/workout/island/design/soccer-stadium-v8): מקור האטלס ופרמטרי האיור. [רישום המקור](../soccer-stadium-v8/LICENSES.md) מצהיר שאיורי הקהל מקוריים לפרויקט; אינו קובע להם מזהה SPDX. `LicenseRef-Bakasun-Original` בדוח זה מציין את העותק של אותם איורי פרויקט שנכלל לבקשת בעל המאגר, לשימוש בפרויקט. תוספת הפוזה, קובץ ה־SVG והקוד החדשים הם CC0-1.0. תווית זו אינה רישיון צד שלישי.

## תלויות קיימות בלבד

התצוגה מפנה ל־[three.js r160](https://github.com/mrdoob/three.js/tree/r160) ול־GLTFLoader שכבר נמצאים ב־workout/island/vendor; רישיונם [MIT](../../vendor/LICENSE.three). לא נוסף או הועתק קוד צד שלישי. Node, sharp/libvips, Playwright ו־Chromium שימשו ליצירה ולאימות בסביבה בלבד. הטקסט בצילומים נרנדר בגופן מערכת, ללא קובץ גופן בחבילה.

## רישום כל הקבצים

| קובץ | רישיון | מקור |
|---|---|---|
| [LICENSES.md](LICENSES.md) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [README.md](README.md) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [REPORT.md](REPORT.md) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [manifest.json](manifest.json) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [preview.css](preview.css) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [preview.html](preview.html) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [preview.mjs](preview.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [qa/browser.json](qa/browser.json) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/clips/soccer-keeper-crowd-v1--disappointed.html](qa/clips/soccer-keeper-crowd-v1--disappointed.html) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/clips/soccer-keeper-crowd-v1--disappointed.json](qa/clips/soccer-keeper-crowd-v1--disappointed.json) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/clips/soccer-keeper-crowd-v1--keeper_after_goal.html](qa/clips/soccer-keeper-crowd-v1--keeper_after_goal.html) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/clips/soccer-keeper-crowd-v1--keeper_after_goal.json](qa/clips/soccer-keeper-crowd-v1--keeper_after_goal.json) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/clips/soccer-keeper-crowd-v1--keeper_celebrate.html](qa/clips/soccer-keeper-crowd-v1--keeper_celebrate.html) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/clips/soccer-keeper-crowd-v1--keeper_celebrate.json](qa/clips/soccer-keeper-crowd-v1--keeper_celebrate.json) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/clips/soccer-keeper-crowd-v1--keeper_ready_reference.html](qa/clips/soccer-keeper-crowd-v1--keeper_ready_reference.html) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/clips/soccer-keeper-crowd-v1--keeper_ready_reference.json](qa/clips/soccer-keeper-crowd-v1--keeper_ready_reference.json) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/measurements.json](qa/measurements.json) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/report.html](qa/report.html) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/report.json](qa/report.json) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/sheets/soccer-keeper-crowd-v1--disappointed.svg](qa/sheets/soccer-keeper-crowd-v1--disappointed.svg) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/sheets/soccer-keeper-crowd-v1--keeper_after_goal.svg](qa/sheets/soccer-keeper-crowd-v1--keeper_after_goal.svg) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/sheets/soccer-keeper-crowd-v1--keeper_celebrate.svg](qa/sheets/soccer-keeper-crowd-v1--keeper_celebrate.svg) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/sheets/soccer-keeper-crowd-v1--keeper_ready_reference.svg](qa/sheets/soccer-keeper-crowd-v1--keeper_ready_reference.svg) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [qa/summary.json](qa/summary.json) | CC0-1.0 | מדידה/דוח מקורי מה־GLB המקומי באמצעות motion-qa-v1 @ 5eb4f093bc22523ee417a7f2345c3b813bffba24; מתאם קלט בלבד. |
| [runtime/catalog.json](runtime/catalog.json) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [runtime/clips/disappointed.glb](runtime/clips/disappointed.glb) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [runtime/clips/keeper_after_goal.glb](runtime/clips/keeper_after_goal.glb) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [runtime/clips/keeper_celebrate.glb](runtime/clips/keeper_celebrate.glb) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [runtime/clips/keeper_ready_reference.glb](runtime/clips/keeper_ready_reference.glb) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [runtime/crowd-atlas.png](runtime/crowd-atlas.png) | LicenseRef-Bakasun-Original + CC0-1.0 | 16 תאי v8 מקוריים: soccer-stadium-v8/runtime/crowd-atlas.webp בקומיט 51f4faab518c695672efaf6323a8b72f239a2b84; 16 תאי hands_up מקוריים למשימה, CC0. |
| [runtime/crowd-manifest.json](runtime/crowd-manifest.json) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [runtime/keeper.glb](runtime/keeper.glb) | CC0-1.0 | canonical-keeper.glb של motion-fix-v12 @ 5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad (CC0), בתוספת כפפה סגורה מקורית; source/build-keeper.mjs. |
| [runtime/keyframes/disappointed.json](runtime/keyframes/disappointed.json) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [runtime/keyframes/keeper_after_goal.json](runtime/keyframes/keeper_after_goal.json) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [runtime/keyframes/keeper_celebrate.json](runtime/keyframes/keeper_celebrate.json) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [runtime/keyframes/keeper_ready_reference.json](runtime/keyframes/keeper_ready_reference.json) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [sheets/disappointed.png](sheets/disappointed.png) | CC0-1.0 | צילום מקורי של התצוגה המקומית; source/capture.mjs. איורי הקהל המקוריים בצילומי preview נכללים ברישום LicenseRef-Bakasun-Original למטה. |
| [sheets/keeper_after_goal.png](sheets/keeper_after_goal.png) | CC0-1.0 | צילום מקורי של התצוגה המקומית; source/capture.mjs. איורי הקהל המקוריים בצילומי preview נכללים ברישום LicenseRef-Bakasun-Original למטה. |
| [sheets/keeper_celebrate.png](sheets/keeper_celebrate.png) | CC0-1.0 | צילום מקורי של התצוגה המקומית; source/capture.mjs. איורי הקהל המקוריים בצילומי preview נכללים ברישום LicenseRef-Bakasun-Original למטה. |
| [sheets/preview-390x844.png](sheets/preview-390x844.png) | CC0-1.0 + LicenseRef-Bakasun-Original | צילום מקורי של מודל CC0 ושל האטלס החדש; 16 תאי v8 המקוריים שבתצוגה נכללים ברישום איורי הפרויקט למטה. |
| [sheets/preview-844x390.png](sheets/preview-844x390.png) | CC0-1.0 + LicenseRef-Bakasun-Original | צילום מקורי של מודל CC0 ושל האטלס החדש; 16 תאי v8 המקוריים שבתצוגה נכללים ברישום איורי הפרויקט למטה. |
| [source/build-crowd.mjs](source/build-crowd.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/build-keeper.mjs](source/build-keeper.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/build-motion.mjs](source/build-motion.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/capture.mjs](source/capture.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/crowd-raised.svg](source/crowd-raised.svg) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/crowd-variants.json](source/crowd-variants.json) | CC0-1.0 | פרמטרי מיקום ופלטת צבעים מתוך source/textures.py של soccer-stadium-v8 @ 51f4faab518c695672efaf6323a8b72f239a2b84; רישום נתונים מקורי למשימה. |
| [source/finalize.mjs](source/finalize.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/glb-writer.mjs](source/glb-writer.mjs) | CC0-1.0 | נגזר מ־motion-fix-v12/repair/glb-writer.mjs בקומיט 5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad; התאמות מקוריות למשימה. |
| [source/measure.mjs](source/measure.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/preview.mjs](source/preview.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/qa-loader.mjs](source/qa-loader.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/qa-sources.mjs](source/qa-sources.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/register-qa.mjs](source/register-qa.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [source/rig-ops.mjs](source/rig-ops.mjs) | CC0-1.0 | נגזר מ־motion-fix-v12/repair/rig-ops.mjs בקומיט 5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad; התאמות מקוריות למשימה. |
| [source/rig.json](source/rig.json) | CC0-1.0 | 18 עצמות ה־bind מתוך canonical-keeper.glb של motion-fix-v12 בקומיט 5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad. |
| [source/run-qa.mjs](source/run-qa.mjs) | CC0-1.0 | יצירה מקורית למשימה: קוד, איור וקטורי, מיפוי, תנועה, נתונים או תיעוד; מקורות הייחוס מפורטים להלן. |
| [style.css](style.css) | CC0-1.0 | קובץ העיצוב המקורי של motion-qa-v1 בקומיט 5eb4f093bc22523ee417a7f2345c3b813bffba24; הועתק ללא שינוי להצגת דוחות הכלי המקומיים. |
