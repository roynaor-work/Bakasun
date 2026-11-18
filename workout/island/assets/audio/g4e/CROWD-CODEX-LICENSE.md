# מקורות ורישיונות — tennis-crowd-audio-v1

כל הקבצים בחבילה נוצרו באופן מקורי למשימה זו. אין הקלטות של אנשים, דגימות ממאגר חיצוני,
שמות דוברים, חיקוי של אדם אמיתי, מותגים או יצירה משולבת של צד שלישי.
כל מה שניתן לשחרור בחבילה מוקדש לשימוש חופשי תחת **CC0-1.0**.
אין צורך בייחוס. מותר להשתמש, לשנות ולהפיץ, לרבות שימוש מסחרי, ללא אחריות.

נוסח הרישיון המלא: <https://creativecommons.org/publicdomain/zero/1.0/legalcode>
SPDX: `CC0-1.0`. הקישורים כאן הם לרישיון בלבד, ואינם מקור של דגימות אודיו.

| קובץ | מקור מדויק / תהליך | רישיון |
|---|---|---|
| `stadium-bed.ogg` | סינתזה מקורית, `generate.py`, seed 20261107, ‏murmur + חפיפת לופ 1 שנייה; libvorbis | CC0-1.0 |
| `stadium-bed.mp3` | אותו מקור מקורי, seed 20261107; libmp3lame | CC0-1.0 |
| `applause-short.ogg` | סינתזה מקורית, `generate.py`, seed 20261108, ‏15 מוחאים מדומים; libvorbis | CC0-1.0 |
| `applause-short.mp3` | אותו מקור מקורי, seed 20261108; libmp3lame | CC0-1.0 |
| `applause-medium.ogg` | סינתזה מקורית, `generate.py`, seed 20261109, ‏26 מוחאים מדומים; libvorbis | CC0-1.0 |
| `applause-medium.mp3` | אותו מקור מקורי, seed 20261109; libmp3lame | CC0-1.0 |
| `applause-large.ogg` | סינתזה מקורית, `generate.py`, seed 20261110, ‏42 מוחאים מדומים; libvorbis | CC0-1.0 |
| `applause-large.mp3` | אותו מקור מקורי, seed 20261110; libmp3lame | CC0-1.0 |
| `near-point-oh.ogg` | סינתזה מקורית, `generate.py`, seed 20261111, ‏48 שכבות פורמנטים ותנועה עולה; libvorbis | CC0-1.0 |
| `near-point-oh.mp3` | אותו מקור מקורי, seed 20261111; libmp3lame | CC0-1.0 |
| `mistake-aw.ogg` | סינתזה מקורית, `generate.py`, seed 20261112, ‏48 שכבות פורמנטים ותנועה יורדת; libvorbis | CC0-1.0 |
| `mistake-aw.mp3` | אותו מקור מקורי, seed 20261112; libmp3lame | CC0-1.0 |
| `pre-serve-hush.ogg` | סינתזה מקורית, `generate.py`, seed 20261113, רחש מפוזר ורעש ורוד מסונן דועך; libvorbis | CC0-1.0 |
| `pre-serve-hush.mp3` | אותו מקור מקורי, seed 20261113; libmp3lame | CC0-1.0 |
| `match-cheer.ogg` | סינתזה מקורית, `generate.py`, seed 20261114, מחיאות ושני גלי קהל; libvorbis | CC0-1.0 |
| `match-cheer.mp3` | אותו מקור מקורי, seed 20261114; libmp3lame | CC0-1.0 |
| `generate.py` | קוד סינתזה ושחזור מקורי שנכתב למשימה | CC0-1.0 |
| `verify.py` | קוד בדיקת קבצים ומדידות מקורי שנכתב למשימה | CC0-1.0 |
| `preview.html` | דף ובקר ניגון Web Audio מקוריים, ללא ספריות או נכסים חיצוניים | CC0-1.0 |
| `manifest.json` | מטא־נתונים שנוצרו על ידי `generate.py` | CC0-1.0 |
| `measurements.json` | תוצאות פענוח ומדידה שנוצרו על ידי `verify.py --report` | CC0-1.0 |
| `REPORT.md` | דוח מקורי שנוצר על ידי `verify.py --report`, כולל תוצאות מדידה | CC0-1.0 |
| `LICENSES.md` | הצהרת מקור ורשימת רישיונות מקורית זו; נוסח CC0 עצמו נגיש בקישור לעיל | CC0-1.0 |

כלי העיבוד הם תלויות סביבת פיתוח בלבד ואינם נכללים בחבילה: Python, NumPy, SciPy ו־FFmpeg
(libvorbis, libmp3lame). הפעלת כלים אלה אינה מכניסה דגימות או נכסים חיצוניים לצלילים.
קובצי ביניים WAV נשמרים בתיקייה זמנית מחוץ למאגר ונמחקים אוטומטית בסוף הרינדור.
