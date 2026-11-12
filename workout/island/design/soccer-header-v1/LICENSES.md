# רישיונות ומקור לכל קובץ

כל הקבצים החדשים בחבילה הם מקוריים או נגזרים ממקורות **CC0-1.0**. כל התרומות המקוריות מוקדשות לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode); במידה המותרת בחוק, מוותרים על זכויות היוצרים והזכויות הנלוות. אין מותגים, לוגואים, צילום אנשים אמיתיים, תנועות של ספורטאי מסוים או נתוני motion capture חיצוניים.

## מקורות מדויקים

נגיחות, מסלולי ההדגמה, תצוגה, גשרים ותיעוד נוצרו למשימה. שתי תלויות הנתונים והגאומטריה מגיעות מהקליפים הסופיים של [soccer-motion-v10 @ 57c536e1291803161e069eff97987295c6194466](https://github.com/roynaor-work/Bakasun/tree/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10), לפי [LICENSES.md שלו](https://github.com/roynaor-work/Bakasun/tree/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/LICENSES.md). מקור הגאומטריה הוא שחקן בדיוני מבוסס MakeHuman hm08 ונכסי מערכת CC0 מ־soccer-motion-v8; [רישיון ה־v8 הקיים](../soccer-motion-v8/LICENSE.md). אותו mesh/skin/materials מופיע בקליפים החדשים, עם תנועות חדשות וללא דחיסה. הייחוסים ושני כלי המתמטיקה/GLB הועתקו ללא שינוי; נתיב מדויק ו־SHA-256 נרשמים בכל שורה וב־[provenance.json](verification/provenance.json).

כלי QA נקרא בקומיט **5eb4f093bc22523ee417a7f2345c3b813bffba24**, לפי [הרישיון שלו](https://github.com/roynaor-work/Bakasun/blob/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1/LICENSES.md). קוד QA אינו מועתק לחבילה; הוא מחולץ זמנית מ־Git. נתוני המדדים ו־SVG הם תוצרים של הנכסים החדשים עם נוסחאות CC0. שינויים בכלי או בתלויות הקיימות לא נדרשו.

תלויות תוכנה **קיימות בלבד**, שאינן מתווספות לחבילה: [three.js r160 המקומי](../soccer-motion-v8/runtime/vendor/three.module.js) ו־[GLTFLoader](../soccer-motion-v8/runtime/vendor/GLTFLoader.js), ברישיון [MIT הקיים](../soccer-motion-v8/runtime/vendor/LICENSE.three), Copyright Three.js authors; [מקור upstream](https://github.com/mrdoob/three.js/tree/r160). התנאים שלהם נשארים בתוקף. Playwright ו־Chromium רצים מחוץ למאגר לצילום בלבד; אינם נכסי המסירה. אין ספריית צד שלישי חדשה, decoder, Draco, Meshopt או WASM.

## מלאי פרטני

| קובץ | רישיון | מקור / אופן יצירה |
|---|---|---|
| [LICENSES.md](LICENSES.md) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [README.md](README.md) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [REPORT.md](REPORT.md) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [measure.mjs](measure.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [preview.css](preview.css) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [preview.html](preview.html) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [preview.mjs](preview.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [qa-register.mjs](qa-register.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [qa-report.mjs](qa-report.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [qa-sources.mjs](qa-sources.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [runtime/catalog.json](runtime/catalog.json) | CC0-1.0 | פוזות ומטא־דאטה מקוריים למשימה, נאפו בכלי author/bake; פוזות הגבול מייחוס העמידה CC0 של v10 |
| [runtime/clips/header_clear.glb](runtime/clips/header_clear.glb) | CC0-1.0 | תנועת נגיחה מקורית מ־source/author.mjs + source/bake.mjs; גאומטריה וחומרים מהייחוס idle_relaxed של v10 (CC0), כמפורט להלן |
| [runtime/clips/header_dive.glb](runtime/clips/header_dive.glb) | CC0-1.0 | תנועת נגיחה מקורית מ־source/author.mjs + source/bake.mjs; גאומטריה וחומרים מהייחוס idle_relaxed של v10 (CC0), כמפורט להלן |
| [runtime/clips/header_jump_goal.glb](runtime/clips/header_jump_goal.glb) | CC0-1.0 | תנועת נגיחה מקורית מ־source/author.mjs + source/bake.mjs; גאומטריה וחומרים מהייחוס idle_relaxed של v10 (CC0), כמפורט להלן |
| [runtime/clips/header_jump_left.glb](runtime/clips/header_jump_left.glb) | CC0-1.0 | תנועת נגיחה מקורית מ־source/author.mjs + source/bake.mjs; גאומטריה וחומרים מהייחוס idle_relaxed של v10 (CC0), כמפורט להלן |
| [runtime/clips/header_jump_right.glb](runtime/clips/header_jump_right.glb) | CC0-1.0 | תנועת נגיחה מקורית מ־source/author.mjs + source/bake.mjs; גאומטריה וחומרים מהייחוס idle_relaxed של v10 (CC0), כמפורט להלן |
| [runtime/clips/header_stand_goal.glb](runtime/clips/header_stand_goal.glb) | CC0-1.0 | תנועת נגיחה מקורית מ־source/author.mjs + source/bake.mjs; גאומטריה וחומרים מהייחוס idle_relaxed של v10 (CC0), כמפורט להלן |
| [runtime/motions.json](runtime/motions.json) | CC0-1.0 | פוזות ומטא־דאטה מקוריים למשימה, נאפו בכלי author/bake; פוזות הגבול מייחוס העמידה CC0 של v10 |
| [runtime/player.mjs](runtime/player.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [runtime/reference/idle_relaxed.glb](runtime/reference/idle_relaxed.glb) | CC0-1.0 | [workout/island/design/soccer-motion-v10/runtime/clips/idle_relaxed.glb @ 57c536e12918](https://github.com/roynaor-work/Bakasun/tree/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/runtime/clips/idle_relaxed.glb); SHA-256 7a8421e3d81cb472435f523a2e99f6d75daa16afe14a423bd25d80d5df6f6b41 |
| [runtime/reference/run.glb](runtime/reference/run.glb) | CC0-1.0 | [workout/island/design/soccer-motion-v10/runtime/clips/run.glb @ 57c536e12918](https://github.com/roynaor-work/Bakasun/tree/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/runtime/clips/run.glb); SHA-256 71576c2d48fdbed1361a1cc8281b23330702c836caad524654f2b49f8b4db934 |
| [source/author.mjs](source/author.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [source/bake.mjs](source/bake.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [source/calibrate-forehead.mjs](source/calibrate-forehead.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [source/capture.mjs](source/capture.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [source/glb.mjs](source/glb.mjs) | CC0-1.0 | [workout/island/design/soccer-motion-v10/source/glb.mjs @ 57c536e12918](https://github.com/roynaor-work/Bakasun/tree/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/source/glb.mjs); SHA-256 7ab86f62c4942df3ce7d704e721ec2e7de3e318c9dd415eec2944ab24b8f50a0 |
| [source/measure-transitions.mjs](source/measure-transitions.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [source/report.mjs](source/report.mjs) | CC0-1.0 | קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו |
| [source/rig.mjs](source/rig.mjs) | CC0-1.0 | [workout/island/design/soccer-motion-v10/source/rig.mjs @ 57c536e12918](https://github.com/roynaor-work/Bakasun/tree/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/source/rig.mjs); SHA-256 fdfccf8692d71753853522b8b831ea1e143a1eb03e7f969458a09b852665d87d |
| [verification/browser.json](verification/browser.json) | CC0-1.0 | ראיות מקוריות ממדידת הנכסים והגשרים של החבילה; SHA-256 ומקורות בגוף הקובץ |
| [verification/contact-surface.json](verification/contact-surface.json) | CC0-1.0 | ראיות מקוריות ממדידת הנכסים והגשרים של החבילה; SHA-256 ומקורות בגוף הקובץ |
| [verification/header_clear-contact.png](verification/header_clear-contact.png) | CC0-1.0 | צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט |
| [verification/header_dive-contact.png](verification/header_dive-contact.png) | CC0-1.0 | צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט |
| [verification/header_dive-land.png](verification/header_dive-land.png) | CC0-1.0 | צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט |
| [verification/header_jump_goal-contact.png](verification/header_jump_goal-contact.png) | CC0-1.0 | צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט |
| [verification/header_jump_left-contact.png](verification/header_jump_left-contact.png) | CC0-1.0 | צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט |
| [verification/header_jump_right-contact.png](verification/header_jump_right-contact.png) | CC0-1.0 | צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט |
| [verification/header_stand_goal-contact.png](verification/header_stand_goal-contact.png) | CC0-1.0 | צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט |
| [verification/preview-desktop.png](verification/preview-desktop.png) | CC0-1.0 | צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט |
| [verification/preview-mobile.png](verification/preview-mobile.png) | CC0-1.0 | צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט |
| [verification/provenance.json](verification/provenance.json) | CC0-1.0 | ראיות מקוריות ממדידת הנכסים והגשרים של החבילה; SHA-256 ומקורות בגוף הקובץ |
| [verification/qa/clips/soccer-header-v1--header_clear.html](verification/qa/clips/soccer-header-v1--header_clear.html) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_clear.json](verification/qa/clips/soccer-header-v1--header_clear.json) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_dive.html](verification/qa/clips/soccer-header-v1--header_dive.html) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_dive.json](verification/qa/clips/soccer-header-v1--header_dive.json) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_jump_goal.html](verification/qa/clips/soccer-header-v1--header_jump_goal.html) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_jump_goal.json](verification/qa/clips/soccer-header-v1--header_jump_goal.json) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_jump_left.html](verification/qa/clips/soccer-header-v1--header_jump_left.html) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_jump_left.json](verification/qa/clips/soccer-header-v1--header_jump_left.json) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_jump_right.html](verification/qa/clips/soccer-header-v1--header_jump_right.html) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_jump_right.json](verification/qa/clips/soccer-header-v1--header_jump_right.json) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_stand_goal.html](verification/qa/clips/soccer-header-v1--header_stand_goal.html) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--header_stand_goal.json](verification/qa/clips/soccer-header-v1--header_stand_goal.json) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--idle_relaxed.html](verification/qa/clips/soccer-header-v1--idle_relaxed.html) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/clips/soccer-header-v1--idle_relaxed.json](verification/qa/clips/soccer-header-v1--idle_relaxed.json) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/report.html](verification/qa/report.html) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/report.json](verification/qa/report.json) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/sheets/soccer-header-v1--header_clear.svg](verification/qa/sheets/soccer-header-v1--header_clear.svg) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/sheets/soccer-header-v1--header_dive.svg](verification/qa/sheets/soccer-header-v1--header_dive.svg) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/sheets/soccer-header-v1--header_jump_goal.svg](verification/qa/sheets/soccer-header-v1--header_jump_goal.svg) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/sheets/soccer-header-v1--header_jump_left.svg](verification/qa/sheets/soccer-header-v1--header_jump_left.svg) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/sheets/soccer-header-v1--header_jump_right.svg](verification/qa/sheets/soccer-header-v1--header_jump_right.svg) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/sheets/soccer-header-v1--header_stand_goal.svg](verification/qa/sheets/soccer-header-v1--header_stand_goal.svg) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/qa/sheets/soccer-header-v1--idle_relaxed.svg](verification/qa/sheets/soccer-header-v1--idle_relaxed.svg) | CC0-1.0 | תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ 5eb4f093bc22 (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA |
| [verification/requirements.json](verification/requirements.json) | CC0-1.0 | ראיות מקוריות ממדידת הנכסים והגשרים של החבילה; SHA-256 ומקורות בגוף הקובץ |
| [verification/transitions.json](verification/transitions.json) | CC0-1.0 | ראיות מקוריות ממדידת הנכסים והגשרים של החבילה; SHA-256 ומקורות בגוף הקובץ |

שחזור המלאי והדוח: node workout/island/design/soccer-header-v1/source/report.mjs, לאחר הפקת המדידות. הקבצים בשורות runtime/reference ו־source/rig.mjs, source/glb.mjs מקורם ב־v10; שאר המקורות הם המקוריים המוצהרים בטבלה.
