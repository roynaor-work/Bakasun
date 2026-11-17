# רישיונות ומקורות

כל התנועות, מסלולי הייחוס, התצוגה, כלי ההפקה והתיעוד החדשים בחבילה מקוריים. התרומות המקוריות מוקדשות לנחלת הכלל לפי **CC0-1.0**: במידה המותרת בחוק, בעל התרומה מוותר על זכויות היוצרים והזכויות הנלוות בתרומה לכל מטרה וללא תנאי. [הנוסח המשפטי המלא של CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) חל על התרומות האלה. לא נעשה שימוש בצילום אנשים, motion capture חיצוני, מותגים או דמות של ספורטאי מסוים.

## מקור הגאומטריה והשלד

הדמות הבדיונית, החומרים והעור בכל GLB נלקחו מהנכס הקיים [soccer-header-v1/runtime/reference/idle_relaxed.glb](../soccer-header-v1/runtime/reference/idle_relaxed.glb), ללא שינוי בגאומטריה. מקורו ב־soccer-motion-v10, קומיט `57c536e1291803161e069eff97987295c6194466`, וגאומטריית MakeHuman hm08 ונכסי המערכת CC0 של soccer-motion-v8. ההצהרות המקוריות נשמרות ב־[רישיונות חבילת הנגיחה](../soccer-header-v1/LICENSES.md), [רישיונות v10 בקומיט המקורי](https://github.com/roynaor-work/Bakasun/blob/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/LICENSES.md) ו־[רישיון v8](../soccer-motion-v8/LICENSE.md). כל קליפ מקבל אנימציה חדשה ומוסר נתונים שאינם בשימוש, ללא דחיסת Draco או Meshopt.

המתמטיקה של השלד, קורא/כותב ה־GLB ודגימת הפוזות/גשר C1 מיובאים מהקבצים הקיימים של חבילת הנגיחה, ברישיון CC0-1.0. הם אינם מועתקים מחדש או נערכים. [provenance.json](verification/provenance.json) רושם נתיב, גודל ו־SHA-256 של מקורות אלה ושל כל קובץ מסירה.

## תוכנה קיימת לצפייה ולמדידה

| מקור | רישיון ושימוש |
|---|---|
| [source/rig.mjs של הנגיחה](../soccer-header-v1/source/rig.mjs) | CC0-1.0; שלד קנוני ו־IK |
| [source/glb.mjs של הנגיחה](../soccer-header-v1/source/glb.mjs) | CC0-1.0; קריאה, כתיבה וסילוק נתוני GLB שאינם בשימוש |
| [runtime/player.mjs של הנגיחה](../soccer-header-v1/runtime/player.mjs) | CC0-1.0; דגימה ו־Hermite C1 |
| [athletes-core.mjs](../../minigames/athletes-core.mjs) | קוד קיים במאגר; נקרא ללא שינוי לצורך ATHLETE_STANDARD והמדדים האחידים |
| [three.js המקומי](../soccer-motion-v8/runtime/vendor/three.module.js) ו־[GLTFLoader](../soccer-motion-v8/runtime/vendor/GLTFLoader.js) | MIT, Copyright Three.js authors; [הרישיון הקיים](../soccer-motion-v8/runtime/vendor/LICENSE.three). תלות קיימת בלבד |
| [motion-qa-v1 בקומיט המוצמד](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1) | CC0-1.0 לפי [רישיונות הכלי](https://github.com/roynaor-work/Bakasun/blob/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1/LICENSES.md); מחולץ זמנית ללא שינוי, אינו נוסף לחבילה |
| Playwright ו־Chromium | כלי צילום חיצוניים למאגר; אינם נכסי מסירה או תלות של הקליפים |

תנאי התלויות הקיימות נשארים בתוקף. אין בחבילה ספריית צד שלישי חדשה, decoder או WASM.

## מיפוי קובצי החבילה

| קבצים חדשים | רישיון / מקור |
|---|---|
| `runtime/clips/*.glb` | CC0-1.0; תנועה מקורית וגאומטריה קיימת CC0 כמפורט לעיל |
| `runtime/motions.json`, `runtime/catalog.json` | CC0-1.0; פוזות, אירועים, תמיכות ומסלולי הדגמה מקוריים |
| `runtime/player.mjs`, `source/*.mjs` | CC0-1.0; כלי הפקה, גשרים, מדידה וצילום מקוריים; הייבואים מפורטים לעיל |
| `measure.mjs`, `qa-register.mjs`, `qa-sources.mjs` | CC0-1.0; הפעלה ומתאם מקוריים; נוסחאות כלי ה־QA נשמרות ללא שינוי |
| `preview.html`, `preview.css`, `preview.mjs` | CC0-1.0; תצוגה מקורית, עם שימוש בתוכנת MIT הקיימת |
| `verification/sheets/*.png`, `verification/preview-*.png` | CC0-1.0; רינדור מקורי ב־Chromium של הדמות הבדיונית והתנועות |
| `verification/qa/**` | CC0-1.0; פלט מדידה ו־SVG מקורי של הנכסים עם כלי QA ברישיון CC0; HTML להצגת אותן תוצאות |
| יתר `verification/*.json`, `README.md`, `REPORT.md`, `LICENSES.md` | CC0-1.0; ראיות, תיעוד ורישיונות מקוריים |

המלאי המדויק והחתימות מחושבים מחדש באמצעות `source/report.mjs` אחרי המדידה והצילום.
