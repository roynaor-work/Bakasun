# רישיונות ומקורות

כל הקוד, מסלולי התנועה, דוחות המדידה, תרשימי השלד והגיליונות החדשים בחבילה זו משוחררים תחת [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

השלד, 15 המצבים שכבר עברו, מודלי השחקן והשוער והמקל נקראים מחבילת [hockey-v1](../hockey-v1/LICENSES.md), קומיט `dc99f03416ca279b549b7f2db927ef7a6ac401e0`. אין העתק חדש של הגופים או המקל. תצוגת הלפני נקראת מחבילת [hockey-v1-fix](../hockey-v1-fix/LICENSES.md), קומיט `d45575a8ac7f3f054aa9ddf80ad4593d7b5e6cee`.

`source/kinematics.mjs` ו־`source/build-clips.mjs` הם בנייה מקורית מחדש של התנועות על השלד הקיים. `preview.html`, `source/render-sheets.mjs` ו־`source/mesh-contact-audit.mjs` נגזרו מקובצי ההדגמה והאימות של `hockey-v1-fix`, ברישיון CC0. `source/validate.mjs`, `source/build-report.mjs` ו־`source/build-manifest.mjs` הם קוד אימות ותיעוד מקורי למשימה זו.

כלי המדידה נמצא ב־[motion-qa-v1](../motion-qa-v1/LICENSES.md), עם מקור הנוסחאות המקוריות הנעול והרחבת הלהב. ספריות התצוגה הקיימות [three.js](../../vendor/three.module.js) ו־[GLTFLoader](../../vendor/GLTFLoader.js) נשארות ברישיון MIT של מחבריהן; הן אינן מועתקות לחבילה. Playwright ו־Chromium משמשים להפקת הראיות בלבד ואינם חלק מהמסירה.

חתימות כל קובצי המסירה ומקורות המדידה זמינות ב־[manifest.json](manifest.json). לא נוספו נכסי מדיה חיצוניים או פרטי אנשים.
