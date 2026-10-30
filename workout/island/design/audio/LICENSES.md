# מקורות ורישיון — חבילת קול האי

כל קובצי OGG בחבילה זו הם יצירה מקורית, שנוצרה ב־30.10.2026 בסינתזה בקוד במסגרת המשימה. מקור היצירה המלא מצורף ב־`tools/generate.py`; לכל קובץ מופיעים מתכון ו־seed בטבלה שלהלן וב־`mix.json`. לא הורדו, הומרו, נדגמו או שולבו הקלטות, קולות אנושיים, מוזיקה או דוגמיות ממקור חיצוני. קולות הקהל הם אוסצילטורים ותהודות מסונתזים ללא מילים. אין חיקוי של אדם מסוים ואין שמות או סמלים מסחריים בתוך הנכסים.

## תנאי שימוש

כל קובצי הקול, קוד הסינתזה והבדיקה, התיעוד, המטא־נתונים ותצוגת ההאזנה המקוריים בתיקייה זו מוקדשים לנחלת הכלל תחת **CC0 1.0 Universal (CC0-1.0)**, במידה שהדבר חל על הזכויות בהם. מותר להשתמש, לשנות, להפיץ ולשלב גם במוצר מסחרי, ללא חובת ייחוס. אין אחריות. תנאי CC0 המלאים: https://creativecommons.org/publicdomain/zero/1.0/legalcode . ההקדשה חלה רק על התוצרים החדשים בתיקייה זו ואינה משנה רישיון של קוד או נכסים אחרים במאגר.

## כלי ייצור שאינם משולבים בנכסים

- Python: https://www.python.org/ — מפרש בלבד (PSF).
- NumPy: https://numpy.org/ — חשבון מספרי ו־PCG64 (BSD-3-Clause).
- FFmpeg: https://ffmpeg.org/ — קידוד ופענוח בלבד; FFmpeg 7.1 התקבל מתוך imageio-ffmpeg 0.7.0, https://github.com/imageio/imageio-ffmpeg . הבינארי והספרייה אינם מופצים בחבילה; רישיונותיהם הנפרדים אינם רישיון קובצי הקול.
- libopus: https://opus-codec.org/ — מקודד Opus (BSD-3-Clause), דרך FFmpeg.
- Chromium/Chrome ו־Playwright שימשו לפענוח ובדיקת ניגון; אינם חלק מהתוצר.

## מיפוי מלא למקור

כל המתכונים מופיעים בפונקציה `make` ובפונקציות העזר של `tools/generate.py`. רעש נוצר מ־PCG64 ומסונן ב־FFT; פגיעות מסכומי סינוסים דועכים; רשת ושלג מרעש מסונן ומעטפות; קהל מתהודות תנועה קולית, נשימה ומחיאות מסונתזות. אין מקור חיצוני לנכס כלשהו.

| קובץ | מתכון בקוד | seed |
| --- | --- | --- |
| `soccer/kick.ogg` | `kick` | 20261030 |
| `soccer/net.ogg` | `net` | 20261031 |
| `soccer/whistle.ogg` | `whistle` | 20261032 |
| `soccer/pass.ogg` | `pass` | 20261033 |
| `soccer/crowd-calm.ogg` | `crowd-calm` | 20261034 |
| `soccer/crowd-excited.ogg` | `crowd-excited` | 20261035 |
| `soccer/crowd-goal.ogg` | `crowd-goal` | 20261036 |
| `soccer/ambience-loop.ogg` | `soccer-loop` | 20261037 |
| `basketball/bounce.ogg` | `bounce` | 20261038 |
| `basketball/swish.ogg` | `swish` | 20261039 |
| `basketball/rim.ogg` | `rim` | 20261040 |
| `basketball/shoes.ogg` | `shoes` | 20261041 |
| `basketball/buzzer.ogg` | `buzzer` | 20261042 |
| `basketball/crowd-calm.ogg` | `crowd-calm` | 20261043 |
| `basketball/crowd-excited.ogg` | `crowd-excited` | 20261044 |
| `basketball/ambience-loop.ogg` | `basketball-loop` | 20261045 |
| `ski/scrape-slow.ogg` | `scrape-slow` | 20261046 |
| `ski/scrape-medium.ogg` | `scrape-medium` | 20261047 |
| `ski/scrape-fast.ogg` | `scrape-fast` | 20261048 |
| `ski/wind.ogg` | `wind` | 20261049 |
| `ski/jump.ogg` | `jump` | 20261050 |
| `ski/landing.ogg` | `landing` | 20261051 |
| `ski/fall.ogg` | `fall` | 20261052 |
| `ski/slalom-gate.ogg` | `gate` | 20261053 |
| `ski/ambience-loop.ogg` | `ski-loop` | 20261054 |
| `scenes/opening.ogg` | `opening` | 20261055 |
| `scenes/victory.ogg` | `victory` | 20261056 |
| `scenes/defeat.ogg` | `defeat` | 20261057 |
