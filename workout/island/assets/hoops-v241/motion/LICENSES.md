# רישיונות ומקורות

כל התנועות והתוספות המקוריות בחבילה מוקדשות לנחלת הכלל תחת [CC0-1.0](LICENSE). אין motion capture מסחרי, אדם מזוהה, לוגו או נכס ברישיון שאינו מאפשר הפצה.

| רכיב | מקור | רישיון |
|---|---|---|
| תנועות הכדורסל, כדור, אירועים, מחוללים ותיעוד | יצירה מקורית למשימה זו | CC0-1.0 |
| תכנון מסלולי צעדים, IK ומעברי האצה/עצירה | [soccer-locomotion-v2, קומיט ec6c73949fb5](https://github.com/roynaor-work/Bakasun/tree/ec6c73949fb5820826b4c082972f5d4f1136641f/workout/island/design/soccer-locomotion-v2), עם התאמות מקוריות לכדורסל | CC0-1.0 |
| שלד וקינמטיקה | `minigames/athletes-core.mjs` ו־`soccer-header-v1/source/rig.mjs` הקיימים במאגר | CC0-1.0 לפי קובצי המקור |
| קורא/כותב GLB וגשר C1 | `soccer-header-v1/source/glb.mjs` ו־`soccer-header-v1/runtime/player.mjs`, שימוש בקבצים הקיימים | CC0-1.0 |
| מודל שחקן התצוגה | גאומטריית שחקן כדורסל בדיוני מ־`assets/hoops-tall/guard.glb`; [שרשרת רישיון hoops-tall-v1 בקומיט cfd4215c314f](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/LICENSES.md); נתיב, hash והתאמת השלד ב־`verification/model-provenance.json` | CC0-1.0; בסיס MakeHuman וציוד/מדים מקוריים CC0 |
| נוסחאות QA, דוח ו־SVG | [motion-qa-v1, קומיט 5eb4f093bc22](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1) | CC0-1.0 |
| Three.js ו־GLTFLoader | תלויות מקומיות קיימות, אינן מתווספות בחבילה | [MIT הקיים](../soccer-motion-v8/runtime/vendor/LICENSE.three), Three.js authors |
| גיליונות פריימים וצילומי תצוגה | רינדור מקורי של התנועות והדמות הבדיונית | CC0-1.0 |

SHA-256 וגדלי קובצי המקור נרשמים ב־`verification/author-provenance.json`, `verification/model-provenance.json` וב־`verification/requirements.json`. לכל GLB סופי יש גודל ו־SHA-256 ב־`runtime/catalog.json`. מחוללי התנועה אינם משנים קובץ מקור קיים; כלי ה־QA מחולץ זמנית ואינו מועתק לחבילה.

Playwright/Chromium משמשים לצילום מחוץ למאגר ואינם נכסי הפצה. אין תלויות npm חדשות במאגר, אין Draco ואין רכיבי WebAssembly.
