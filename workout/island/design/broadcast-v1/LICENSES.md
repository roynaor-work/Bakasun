# מקורות ורישיונות

| פלט חדש | מקור קיים | שינוי |
| --- | --- | --- |
| `assets/athlete-lod0.glb`, `assets/athlete-lod1.glb` | `../hoops/lod-v4/hoops-v4-pg-lod.glb` | חיבור הרשתות לחומר אחד, אטלס UV אחד, אפיית albedo ו־normal, מסכת צבע למדים, צמצום LOD1 ו־Draco |
| `assets/spectator.glb` | אותה דמות | הקפאת שלד וצמצום ל־244 משולשים, להצגה ב־instancing |
| `assets/soccer-stage.glb` | `../soccer-v4/soccer-stadium.glb` | הסרת קהל סטטי, צמצום יציעים ומשטח, חיבור חומרים ו־Draco |
| `assets/basketball-stage.glb` | `../hoops/lod-v4/hoops-v4-arena-lod.glb` | הסרת קהל סטטי, משטחי מגרש וגופי תאורה תלויים שמסתירים מצלמה; צמצום מושבים וחיבור הרשתות |
| `assets/athlete-albedo.png`, `assets/athlete-normal.png` | חומרי הדמות לעיל | אפייה ל־1024² ותוספת normal עדין לבד |
| הגדרות, דף תצוגה, כלי הפקה וצילומים | נוצרו במשימה זו | לפי תנאי המאגר ובכפוף לרישיונות הנכסים המופיעים בצילומים |

הדמות מבוססת על MakeHuman / MPFB2 הקיימים בריפו. רישום המקור ב־[ASSETS.md](../../ASSETS.md) וב־[רישיונות hoops-v4](../hoops-v4/LICENSES.md) מתאר ליבת MakeHuman כ־CC0 ומציין שלא נשמר אישור נפרד לכל חבילת שיער ונעליים. ההגשה הזו אינה מוסיפה הצהרת רישוי שלא הייתה במקור. למקור האצטדיון ראו גם [רישיונות soccer-v4](../soccer-v4/LICENSES.md).

האנימציות הועתקו מהקליפים המוטבעים במקור, דרך שרשרת ההמרה הקיימת מ־CMU Graphics Lab Motion Capture Database. הן אינן מוצגות כ־CC0. מותר להשתמש בנתוני CMU במוצרים לפי תנאי המקור, ואין למכור את נתוני התנועה עצמם. הייחוס המקורי:

> The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.

Three.js וה־loaders המקומיים: MIT. מפענח Draco המקומי: Apache-2.0. ראו [רישיון Three.js](../../vendor/LICENSE.three) ו־[מפענח Draco](../viewer/draco/README.md). נכסי המקור נשארו ללא שינוי. גיבובי SHA-256 של המקורות והפלט נמצאים ב־`verification/assets.json`.

אין בחבילה זו מותגים, סמלי מועדונים או דיוקנאות של שחקנים אמיתיים.
