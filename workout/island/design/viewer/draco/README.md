# מפענח Draco מקומי

קבצים סטטיים של הצופה בלבד. אין הורדה מהרשת בזמן ניגון, אין npm ואין build. `vendor/` לא השתנה.

| קובץ מקומי | גרסה ומקור רשמי | רישיון |
| --- | --- | --- |
| `DRACOLoader.js` | [Three.js r160](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/loaders/DRACOLoader.js), תואם ל־`vendor/three.module.js` | MIT, `LICENSE.three` |
| `draco_wasm_wrapper.js` | [Google Draco 1.5.9, glTF wrapper](https://www.gstatic.com/draco/versioned/decoders/1.5.9/draco_wasm_wrapper_gltf.js), שונה שם הקובץ בלבד | Apache-2.0, `LICENSE.draco` |
| `draco_decoder.wasm` | [Google Draco 1.5.9, glTF WASM](https://www.gstatic.com/draco/versioned/decoders/1.5.9/draco_decoder_gltf.wasm), שונה שם הקובץ בלבד | Apache-2.0, `LICENSE.draco` |

מקור רישיון Draco: [google/draco, tag 1.5.9](https://github.com/google/draco/blob/1.5.9/LICENSE). רישיון Three הועתק מהרישיון של הספרייה המקומית הקיימת.

חמישה שינויים מקומיים ב־DRACOLoader הרשמי: נתיב import יחסי ל־Three המקומי; סוג MIME של Blob הוא `application/javascript`; יצירת Worker עם `{type:'module'}`; שימוש מפורש ב־`self.onmessage`; קריאת ספריות המפענח דרך גוף תגובת `fetch` המקורית עד סופה, תוך שימור שגיאות ורישום ב־LoadingManager. השינוי האחרון מחליף עטיפת Response/ReadableStream של FileLoader מ־r160: בבדיקת Chrome עם יירוט בקשות היא גרמה לביטול בקשת מפענח בשלוש מתוך חמש טעינות, גם לאחר אספקת כל הבתים. באותה בדיקה לאחר התיקון כל חמש הטעינות השלימו את שתי הבקשות ללא ביטול. בדיקות הרשת נשארו קשיחות. ה־wrapper המקורי מצורף לאותו מודול Worker; הוא אינו נטען בתג script קלאסי. תוכן המפענח עצמו לא השתנה. גרסת WASM מחייבת דפדפן עם WebAssembly; אין fallback חסר שנדרש בזמן הניגון.

ב־30.10.2026 נבדקה טעינה בפועל ב־Chrome, עם `--use-gl=angle --use-angle=swiftshader`, דרך שרת מקומי בלבד. ארבע הדמויות נטענו עם 20 עצמות כל אחת: 1,281 קודקודים בכדורגל; 1,259 בשוער; 1,257 בכדורסל; 1,260 בסקי. זו בדיקת פענוח, והמדידות המלאות של תנועה מופיעות בדוח הצופה.

`provenance.json` מציין את מקור הקבצים ואת SHA-256 של העותקים המקומיים, כולל השינויים המתוארים ב־loader.
