# מקורות ורישיונות — קהל v1

כל הקבצים החדשים בתיקייה זו הם יצירה מקורית שנוצרה למשימה ב־12.11.2026.
לא שולבו הקלטות, קולות של אנשים, דגימות צד שלישי, מוזיקה או תוצרי שירות יצירת אודיו.
אין מילים, חיקוי של אדם מסוים, שריקות או מחוללי טון קבוע.

## רישיון

כל האודיו, קוד ההפקה, דף ההאזנה, התיעוד והמטא־נתונים המקוריים בתיקייה
זו מוקדשים לנחלת הכלל תחת **CC0 1.0 Universal — CC0-1.0**, במידה שחלים
עליהם זכויות. מותר להשתמש, לשנות, להפיץ ולשלב במוצר מסחרי ללא חובת ייחוס.
ללא אחריות. [נוסח CC0 המלא](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
ההקדשה אינה משנה רישיון של קוד או נכסים אחרים במאגר.

## מיפוי כל הקבצים למקור

המקור המלא לאודיו הוא [generate.py](generate.py), הפונקציה `render` והטבלה
`RECIPES`. המקור הוא סינתזה סטוכסטית: רעש PCG64, מעטפות אקראיות,
מסננים רחבים, מחיאות רכות והחזרי מרחב. אין אוסצילטורים קוליים או מחזורי גובה צליל.

| קבצים | מקור | זרע | רישיון |
| --- | --- | --- | --- |
| `ambience-loop.ogg`, `ambience-loop.mp3` | `render`: המולה רחבה, לולאה של 24 שניות | 2026111201 | CC0-1.0 |
| `crowd-calm.ogg`, `crowd-calm.mp3` | `render`: רקע שקט, לולאה של 12.288 שניות | 2026111202 | CC0-1.0 |
| `crowd-excited.ogg`, `crowd-excited.mp3` | `render`: גל התרגשות | 2026111203 | CC0-1.0 |
| `crowd-goal.ogg`, `crowd-goal.mp3` | `render`: שאגת שער | 2026111204 | CC0-1.0 |
| `generate.py` | קוד מקורי למשימה, כולל מדידות של הקבצים המקודדים | — | CC0-1.0 |
| `manifest.json`, `measurements.json` | נתונים שהופקו ב־`main` של `generate.py` | — | CC0-1.0 |
| `browser-verification.json` | מדידות פענוח, לולאות וניגון ב־Chromium באמצעות Playwright | — | CC0-1.0 |
| `REPORT.md` | דוח מקורי המבוסס על המדידות | — | CC0-1.0 |
| `listen.html` | דף האזנה מקורי, ללא ספריות חיצוניות | — | CC0-1.0 |

דגימות המקור הישנות ב־`../audio/soccer/` משמשות למדידת ״לפני״ בלבד;
לא הועתק מהן אודיו לתוצרים החדשים. המקור שלהן הוא המאגר בענף main,
קומיט `51f4faab518c695672efaf6323a8b72f239a2b84`, והן כבר מסומנות CC0-1.0
ב־[רישיון החבילה הקודמת](../audio/LICENSES.md). הנתיב והגיבוב של כל קובץ
השוואה מתועדים ב־`measurements.json`.

## כלי הפקה — אינם מופצים בחבילה

| כלי | שימוש | מקור ורישיון |
| --- | --- | --- |
| Python | הרצת קוד | [python.org](https://www.python.org/), PSF-2.0 |
| NumPy | רעש, FFT וחישוב מספרי | [numpy.org](https://numpy.org/), BSD-3-Clause |
| SciPy | מעטפות אקראיות ומדידת ספקטרום | [scipy.org](https://scipy.org/), BSD-3-Clause |
| FFmpeg | קידוד, פענוח ו־EBU R128 / BS.1770 | [ffmpeg.org](https://ffmpeg.org/), בניית הסביבה GPL-2.0-or-later |
| libvorbis | קידוד Vorbis במכל Ogg | [xiph.org/vorbis](https://xiph.org/vorbis/), BSD-3-Clause |
| LAME | קידוד MP3 | [lame.sourceforge.io](https://lame.sourceforge.io/), LGPL-2.0-or-later |
| Playwright / Chromium | אימות פענוח ולולאות בדפדפן | [playwright.dev](https://playwright.dev/), Apache-2.0; [רישיונות Chromium](https://www.chromium.org/developers/how-tos/get-the-code/), BSD ורישיונות רכיבים |

הכלים והבינאריים אינם כלולים בתוצרים; רישיונות הכלים אינם רישיון האודיו.
