# מקורות ורישיון · מסלול סקי

התוספות המקוריות בתיקייה זו נוצרו במיוחד עבור `roynaor-work/Bakasun` ב־31.10.2026; הסיומת `20261101` בשם הענף היא מזהה המשימה. ככל שקיימות בהן זכויות שניתן להקדיש, היוצרים מקדישים אותן לנחלת הכלל לפי **CC0-1.0**: מותר להשתמש, לשנות ולהפיץ, לרבות שימוש מסחרי, ללא חובת ייחוס. אין כאן טענה לבלעדיות בתוצרי AI או להענקת זכויות שאינן קיימות.

נוסח הרישיון: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

To the extent possible under law, the contributors dedicate the original materials in this folder to the public domain under CC0 1.0 Universal, waiving copyright and related rights worldwide. The materials are provided without warranty.

| קבצים | מקור מדויק |
| --- | --- |
| מודלי `models/*.glb`, חוזי `models.json` ו־`tools/build-models.py` | גאומטריה מקורית פרוצדורלית שנבנתה ב־Blender למשימה זו, כולל קואורדינטות UV, צבעי קודקודים ועוגנים. לא הועתקו רשתות מתוך `../models/`,‏ `../models2/` או מאגר צד שלישי. |
| `textures/*-snow.webp`,‏ `textures/halfpipe-ice.webp`,‏ `textures/snow-ripples.webp` | אטלס מקור חדש שנוצר בכלי ImageGen של OpenAI לפי הוראה טקסטואלית מקורית, ולאחר מכן חיתוך, הקטנה והפיכה מחזורית של השוליים ב־`tools/build-surfaces.mjs`. ההוראה וחותמת המקור ב־[PROMPTS.md](PROMPTS.md). תמונת המקור הגדולה היא חומר ביניים ואינה חלק מהחבילה. |
| `textures/groomed-normal.webp`,‏ `textures/ice-normal.webp` | מפות normal מקוריות שהופקו פרוצדורלית ב־`tools/build-surfaces.mjs`; אינן סריקה או הורדה של חומר חיצוני. |
| `vfx/*`,‏ `decals/*`,‏ `tools/build-effects.mjs` | תמונות RGBA, נתוני תזמון ועזר להנחת עקבות שנוצרו בקוד פרוצדורלי מקורי. אין בהם תמונות ImageGen או נכסי צד שלישי. |
| `preview.html`,‏ `previews/*` וכלי התצוגה | תצוגת WebGL מקורית ורינדורים של קובצי המסירה הסופיים. הגאומטריה בתצוגה מפוענחת מה־GLB הסופי בזמן בניית דף התצוגה; לא צוירה חלופה ידנית. |
| תיעוד, כלי אימות ודוחות | טקסט, קוד ונתוני בדיקה מקוריים שנכתבו למשימה. |

לא נעשה שימוש במותג, בלוגו או בתמונת ייחוס של צד שלישי בנכסים החדשים. תוצר שנוצר בסיוע AI אינו מוצג כצילום או כאיור ידני. הנכסים הקיימים ב־`../models2/`,‏ `../environment/`,‏ `../baked/` ו־`../vfx/` נבדקו לצורך תאימות בלבד; הרישוי שלהם אינו משתנה.

CC0 כאן חל רק על התוספות המקוריות בתיקייה `alpine-track/`. הוא **אינו** משנה רישיונות של Blender, Draco, Three.js, sharp, Playwright או קובצי vendor. ספריות וכלי ההפקה נשארים מחוץ לחבילה; השימוש בהם אינו מעתיק את רישיונם לנכסי הפלט. רישיונות קיימים נשמרים ב־[LICENSE.three](../../vendor/LICENSE.three),‏ [Draco](../viewer/draco/LICENSE.draco) ובתיעוד הכלים עצמם. אין בחבילה עותק חדש של ספריית צד שלישי.
