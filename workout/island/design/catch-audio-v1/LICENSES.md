# מקורות ורישיונות · catch-audio-v1

כל הקבצים החדשים בתיקייה זו מקוריים ונוצרו במסגרת משימת הסינתזה ב־13 בנובמבר 2026. קובצי האודיו נוצרו מגלי סינוס ורעש פסאודו־אקראי עם seeds קבועים; אין הקלטות, דגימות חיצוניות, קולות אנושיים, מוזיקה או נכסי צד שלישי. קוד המקור המלא הוא `generate.py`, ללא קלט רשת. אין שימוש בקובצי האודיו הקיימים במאגר.

כל האודיו, המקור, דף ההאזנה, המטא־נתונים והתיעוד החדשים בתיקייה זו מוקדשים לנחלת הכלל תחת **CC0 1.0 Universal (CC0-1.0)**, ככל שקיימות בהם זכויות שניתן להקדיש. ניתן להשתמש, לשנות, להפיץ ולשלב במוצר מסחרי ללא חובת ייחוס. אין אחריות. [הנוסח המשפטי המלא של CC0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). ההקדשה מוגבלת לקבצים החדשים בתיקייה זו ואינה משנה רישיונות בשאר המאגר.

| קבצים | מקור ומתכון | seed | רישיון |
| --- | --- | ---: | --- |
| `police-soft.ogg`, `police-soft.mp3` | `generate.py:synth('police-soft')` — FM סינוס 420–700 Hz, הרמוניה שנייה חלשה | 20261113 | CC0-1.0 |
| `siren-far-helicopter.ogg`, `siren-far-helicopter.mp3` | `synth('siren-far-helicopter')` — FM נמוך, רעש רוטור מסונן ופעימות 24 Hz | 20261114 | CC0-1.0 |
| `siren-near.ogg`, `siren-near.mp3` | `synth('siren-near')` — FM עם הרמוניה שלישית חלשה ומודולציה רכה | 20261115 | CC0-1.0 |
| `shot-beep.ogg`, `shot-beep.mp3` | `synth('shot-beep')` — צפצוף יורד דועך, ללא פיצוץ | 20261116 | CC0-1.0 |
| `nitro.ogg`, `nitro.mp3` | `synth('nitro')` — רעש מסונן שהולך ומתבהר וסינוס עולה | 20261117 | CC0-1.0 |
| `puncture.ogg`, `puncture.mp3` | `synth('puncture')` — נשיפת רעש מסונן ומכה נמוכה דועכת | 20261118 | CC0-1.0 |
| `brake-loop.ogg`, `brake-loop.mp3` | `synth('brake-loop')` — חיכוך מסונן ותהודה מחזורית מעוגלת | 20261119 | CC0-1.0 |
| `net-drop.ogg`, `net-drop.mp3` | `synth('net-drop')` — רשרוש מסונן ומכה רכה מאוחרת | 20261120 | CC0-1.0 |
| `barrier-break.ogg`, `barrier-break.mp3` | `synth('barrier-break')` — ארבע תהודות דועכות עם רשרוש שברים | 20261121 | CC0-1.0 |
| `generate.py` | קוד סינתזה, קידוד והפקת מדידות מקורי למשימה זו | — | CC0-1.0 |
| `manifest.json` | נתוני התוצרים, מדידות ומיפוי מקור המופקים ב־`generate.py:main` | — | CC0-1.0 |
| `REPORT.md` | תיעוד ומתודולוגיה מקוריים, טבלאות מתוך `generate.py:report` | — | CC0-1.0 |
| `listen.html` | HTML/CSS/JavaScript מקוריים להאזנה דרך Web Audio; ללא ספריות או גופנים חיצוניים | — | CC0-1.0 |
| `REVIEW.md` | תיעוד מקורי של אימות החבילה, הדפדפן והיקף השינוי | — | CC0-1.0 |
| `LICENSES.md` | מסמך מקור ורישוי מקורי זה | — | CC0-1.0 |

## כלי עבודה שאינם מופצים בחבילה

- [Python](https://www.python.org/) — PSF; מפרש בלבד.
- [NumPy](https://numpy.org/) ו־[SciPy](https://scipy.org/) — BSD-3-Clause; יצירת מערכים ורעש וכתיבת PCM זמני.
- [FFmpeg](https://ffmpeg.org/), [Opus](https://opus-codec.org/) ו־[LAME](https://lame.sourceforge.io/) — קידוד ופענוח בלבד. רישיון FFmpeg תלוי בבנייה; Opus הוא BSD ו־LAME הוא LGPL. בינאריים וספריות אינם מצורפים, ורישיונם אינו רישיון האודיו המקורי.
- [Playwright](https://playwright.dev/) ו־Chromium — אימות דף ההאזנה ופענוח; אינם חלק מהתוצר.
