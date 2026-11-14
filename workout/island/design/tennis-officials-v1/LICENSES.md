# מקורות ורישיונות

דמויות בדויות בלבד, ללא סריקות של אנשים, שמות שחקנים, סמלי מועדונים או מותגים. לא נעשה שימוש בקליפים מסחריים, motion capture, דיבור מוקלט או TTS.

| רכיב | מקור | רישיון |
|---|---|---|
| שבע הדמויות והאטלסים | עיבוד מקומי של `../tennis-v7/models/{man-01,man-02,woman-01,woman-02}.glb`; מקור האנטומיה `../characters2/source/`; צבעי מדים חדשים, פישוט ושימור עיניים ב־`source/build-characters.mjs` | CC0-1.0, לפי `../tennis-v7/LICENSES.md` |
| השלד | שמות, סדר והורים מ־`../motion2/soccer.json`; תנוחת T, מידות ו־inverse binds מ־`../tennis-v7/rig.json` | CC0-1.0 |
| 14 תנועות מקוריות | `source/motions.mjs`, אפיית IK ב־30Hz ל־GLB תקני ב־`source/build-clips.mjs` | CC0-1.0 |
| כיסא שופט, מגרש התצוגה וממשק | `source/build-chair.mjs`, `source/preview.mjs`, `preview.html` | CC0-1.0 |
| ארבעת הצלילים | סינתזה מקורית ודטרמיניסטית ב־`source/build-audio.py`; ללא הקלטות או דגימות חיצוניות | CC0-1.0 |
| מתאם QA, מחוללי הקטלוג והדוח | `source/validate-motion.mjs`, `source/finalize.py` | CC0-1.0 |
| motion-qa-v1 | עותק ללא שינוי של המעריך, קורא GLB ובדיקות ההזרקה מהענף `codex/motion-qa-v1`, קומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24`; פירוט ו־SHA-256 ב־`source/qa-vendor/provenance.json` | CC0-1.0; נוסח רישום המקור ב־`source/qa-vendor/motion-qa-v1/LICENSES.upstream.md` |
| Three.js r160, GLTFLoader, SkeletonUtils | חבילת npm `three@0.160.0`, מאוגדת מקומית ב־`vendor/three-gltf-r160.mjs`; עותק Three נוסף לצורך כלי ה־QA השמור | MIT; הנוסח המלא ב־`vendor/LICENSE.three` וב־`source/qa-vendor/soccer-motion-v8/runtime/vendor/LICENSE.three` |
| כלי בנייה בלבד | glTF Transform 4.5.1, meshoptimizer 0.24.0, esbuild 0.25.12 (MIT); Draco 1.5.9, glTF Validator 2.0.0-dev.3.10 (Apache-2.0); sharp 0.35.5 (Apache-2.0); NumPy/SciPy (BSD); Playwright 1.56.1 (Apache-2.0) | אינם מופצים כספריות ריצה בחבילה; דרושים רק לבנייה או בדיקה |
| גופנים | גופני מערכת | אין קובצי גופן בחבילה |

כל הנכסים והקוד המקוריים החדשים בחבילה מוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). ספריות צד שלישי שומרות על רישיונותיהן. המקורות המקוריים נקראו בלבד. ה־hash של המקורות ושל קובצי GLB הסופיים נמצא ב־`catalog.json` ובקובצי האימות. עותקי PNG של האטלסים מיועדים לעיון; אותו אטלס מוטמע בתוך כל GLB, ואין צורך לטעון את שניהם.
