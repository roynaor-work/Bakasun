# מקורות ורישיונות

הגאומטריה, הפרקט, מפת הקהל הבדיוני, סביבת התאורה, החומרים, מסגרות השידור וקוד החבילה מקוריים ונוצרו למשימה זו. המקור ניתן לשחזור מתוך `source/`. אין נכסי מועדון, ליגה, יצרן ציוד, סמל, צילום אדם אמיתי או נתוני לקוח.

| רכיב מקומי | מקור | רישיון |
|---|---|---|
| three.module.js, GLTFLoader.js, DRACOLoader.js, BufferGeometryUtils.js | עותקי r160 מתוך `workout/island/vendor/` של הריפו; גרסה נבדקת אוטומטית. | MIT, העתק מלא ב־`runtime/vendor/LICENSE.three` |
| draco-worker.js | פרוטוקול DRACOWorker המקורי של r160, מתוך העותק הסטטי בריפו; המעטפת והנתיב הותאמו לחבילה. | MIT, `runtime/vendor/LICENSE.three` |
| draco_wasm_wrapper.js, draco_decoder.wasm | מפענח glTF של Draco המלווה את three.js r160, מתוך `workout/island/vendor/draco/`. | Apache-2.0, העתק מלא ב־`runtime/vendor/draco/LICENSE.draco` |
| עיצוב וטקסטורות מקוריים | `source/create-textures.py`, `source/ceiling.mjs`, `source/build-arena.mjs` | נכסי הפרויקט שנוצרו לבקשת בעל הריפו; ללא תלות בנכסי stock. |
| טקסט מוטבע בפרקט | גופן DejaVu Sans של סביבת ההפקה, רק למילה הגנרית BASKETBALL. אין קובץ גופן בזמן ריצה. | Bitstream Vera / DejaVu; טקסט רסטר בלבד. |

כלי npm ו־Pillow מיועדים להפקה ולבדיקות דפדפן, ואינם כלולים בחבילת הריצה. רישיונות הספריות נשמרו בשלמותם. `RUNTIME.md` מכיל גדלים וחתימות של הקבצים המדויקים.
