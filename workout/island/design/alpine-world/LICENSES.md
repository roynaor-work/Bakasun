# מקורות ורישיונות · עולם סקי

החבילה משלבת נכסים קיימים של המאגר עם שתי תוספות מקוריות. אין רישוי מחדש לנכסים שהועתקו, ואין שימוש במותגים, לוגואים או גאומטריה שהורדה ממאגר חיצוני.

| קבצים | מקור מדויק | תנאי שימוש |
| --- | --- | --- |
| `models/fir-a.glb`, `fir-b.glb`, `fir-c.glb`, `rock-small.glb`, `rock-large.glb`, `snow-sign.glb`, `slalom-gate.glb`, `start-gate.glb`, `finish-gate.glb` | עותקים זהים בבתים של הקבצים באותם שמות ב־`../models2/`. חותמות SHA-256 נרשמות במניפסט. | תנאי הנכסים המקוריים של המאגר, לפי [models2/LICENSES.md](../models2/LICENSES.md) ו־[models/LICENSES.md](../models/LICENSES.md). אין עבורם כאן הצהרת CC0 חדשה. |
| `models/mogul.glb` | עותק זהה בבתים של `../alpine-track/models/mogul.glb`. | CC0-1.0 לפי [alpine-track/LICENSES.md](../alpine-track/LICENSES.md). |
| `textures/ski-powder-atlas.png` והעותק המוטמע ב־`models/snow-powder.glb` | עותק זהה של `../alpine-track/vfx/ski-powder-atlas.png`: חלקיקי Gaussian שנוצרו ב־`../alpine-track/tools/build-effects.mjs`. | CC0-1.0 לפי [alpine-track/LICENSES.md](../alpine-track/LICENSES.md); הייחוס נשמר אף שאין חובה משפטית לייחס. |
| הגאומטריה של `models/ice-wall.glb` | יצירה מקורית עבור המאגר ב־02.11.2026, מתוך `tools/build-originals.py`: רשת קרח מפוסלת, כרכוב שלג וסדקים גאומטריים. | תנאי המאגר וההרשאות הניתנות בו. אין כאן טענה לרישיון צד שלישי או לבלעדיות בתוצר בסיוע AI. |
| גאומטריית המלבנים והאנימציה של `models/snow-powder.glb` | שלושה מלבנים מוצלבים לכל פריים; כל אחד דוגם את מסגרת האטלס שלו. הגאומטריה נוצרה ב־`tools/build-originals.py`, וערוצי האנימציה ב־`tools/pack.mjs`. | התוספות החדשות לפי תנאי המאגר; רישיון האטלס המקורי נשאר CC0-1.0. |
| `tools/*`, `manifest.json`, תיעוד | כלי יצירה, אריזה ומדידות שנכתבו למשימה זו. | קוד ותיעוד מקוריים עבור המאגר; תנאי המאגר. |

Blender ‏(GPL-3.0-or-later), glTF Transform ‏(MIT), Draco ‏(Apache-2.0), sharp ‏(Apache-2.0) הם כלי הפקה ואינם חלק מהמסירה. רישיון הכלי אינו מעניק רישיון חדש לגאומטריה. ספריות הצופה הקיימות נשארות מחוץ לחבילה: [Three.js](../../vendor/LICENSE.three) ומפענח [Draco](../viewer/draco/LICENSE.draco).
