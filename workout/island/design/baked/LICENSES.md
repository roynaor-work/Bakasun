# מקורות ורישיונות · הצללה אפויה

תאריך יצירה: 30.10.2026. כל מפות ההצללה והתאורה בחבילה הן **יצירה מקורית עבור המאגר**, שהופקה באמצעות חישוב גאומטרי ב־Blender Cycles מהמודלים הקיימים. אין תמונת AO מוכנה, צילום, HDRI, נכס שנרכש או מודל שהורד מצד שלישי. אין שימוש ב־ImageGen ליצירת מפות האפייה האלה.

| קבצים | מקור | רישום שימוש |
| --- | --- | --- |
| `soccer-stadium-ao.webp`, `soccer-stadium-light.webp` | אפייה מקורית של `../models/soccer-stadium.glb` עם שערי `soccer-goal.glb` כגאומטריה חוסמת סטטית | יצירה מקורית עבור המאגר; כפוף לתנאי המאגר ולהרשאות בעליו |
| `basketball-arena-ao.webp`, `basketball-arena-light.webp` | אפייה מקורית של `../models/basketball-arena.glb`, כולל הסלים המובנים | כנ״ל |
| `ski-slope-ao.webp`, `ski-slope-light.webp` | אפייה מקורית של `../models/ski-slope.glb` עם `slalom-gate.glb` כחוסם סטטי | כנ״ל |
| `soccer-stadium-uv2.glb` | עותק נגזר מה־GLB המקורי עם פריסת UV שנייה מקורית; UV0 וצבעי המקור נשמרים. קידוד Draco חוזר | תנאי המודל המקורי נשמרים, כמפורט ב־[רישיונות המודלים](../models/LICENSES.md) |
| `previews/*.webp` (18 תמונות: לפני, AO, AO+תאורה × שלוש סצנות × שני כיוונים) | רינדורים מקוריים של המודלים והמפות המסופקים, בשילוב אריחי הסביבה הקיימים לפי הפירוט למטה | רינדור מקורי עבור המאגר; רכיבי מרקמי הסביבה לפי CC0-1.0 המתועד במקור |
| `tools/*.py`, `tools/*.cjs`, `preview.html`, `README.md`, `LICENSES.md`, `manifest.json`, `validation.json`, `geometry-validation.json`, `browser-validation.json`, `VALIDATION.md` | קוד, תיעוד ונתוני בדיקה מקוריים שנכתבו עבור החבילה | יצירה מקורית עבור המאגר; תנאי המאגר וההרשאות הניתנות בו |

מקור הגאומטריה: `roynaor-work/Bakasun`, ‏`main` קומיט `039419a2182d40f12d9acbfe0451e18118394d41`. לפי `../models/LICENSES.md`, הגאומטריה היא יצירה מקורית של המאגר מ־30.10.2026 ללא מקור חיצוני. הגיבובים המדויקים של שלושת קובצי המקור מצורפים ל־manifest.json. אין כאן הענקת CC0 מחדש בשם בעלי הגאומטריה.

שלושת אריחי הסביבה המשולבים ברינדורים הם `../environment/textures/grass-mown.webp`, ‏`parquet.webp`, ‏`snow.webp`. לפי [רישיונות הסביבה](../environment/LICENSES.md), אלה יצירות מקוריות שהופקו באמצעות OpenAI ImageGen והוקדשו תחת CC0-1.0. הם משמשים ברינדורי האצטדיון, האולם והמדרון בהתאמה; הקבצים אינם מועתקים לחבילה ואינם מוטמעים ב־GLB או במפות הנתונים. [נוסח CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

Blender, Cycles, Draco, numpy, Pillow ו־Playwright משמשים ככלי הפקה ובדיקה בלבד. לא מועתקת לחבילה ספרייה שלהם, והחבילה אינה משנה את רישיונותיהם. התצוגה משתמשת בגופן מערכת מקומי ואינה כוללת גופן חיצוני.
