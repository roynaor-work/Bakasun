# רישיונות ומקורות לכל קובץ

כל הקבצים בתיקייה זו הם יצירה מקורית שהוכנה עבור Bakasun ב־07.11.2026, ומשוחררים תחת CC0-1.0. המקור לכל קובץ מפורט להלן. אין הקלטות שטח, דגימות חיצוניות או הקלטות מותג; צלילי הניידת והוולקן הם סינתזה גנרית מקורית.

## הקדשה ורישיון

All original material in this directory is dedicated to the public domain under the Creative Commons CC0 1.0 Universal Public Domain Dedication (SPDX: CC0-1.0), to the extent permitted by law. You may copy, modify, distribute and use it, including commercially, without attribution. No warranty is provided.

[סיכום CC0](https://creativecommons.org/publicdomain/zero/1.0/) · [הנוסח המשפטי המחייב](https://creativecommons.org/publicdomain/zero/1.0/legalcode)

כלי העבודה — Python, NumPy, SciPy, FFmpeg ו־Playwright — אינם מופצים בחבילה, ורישיונותיהם נשארים של בעליהם. אין כאן שילוב של קוד המקור שלהם.

## אודיו

כל מקור אודיו נוצר בפונקציה `synth` בקובץ [build.py](build.py), בזרע `11072026`. הקוד כולל את כל הנוסחאות והמסננים. `build` מפעילה הגברה קבועה ומקודדת ל־Vorbis quality 3 ול־MP3 128 kbit/s.

| קובץ | רישיון | מקור ושינוי |
|---|---|---|
| `audio/siren-two-tone-loop.ogg` | CC0-1.0 | `build.py:synth(siren-two-tone-loop)` — סינוסים והרמוניות; מעבר תדר מרוכך בין שני גוונים; קידוד OGG |
| `audio/siren-two-tone-loop.mp3` | CC0-1.0 | `build.py:synth(siren-two-tone-loop)` — סינוסים והרמוניות; מעבר תדר מרוכך בין שני גוונים; קידוד MP3 |
| `audio/siren-wail-loop.ogg` | CC0-1.0 | `build.py:synth(siren-wail-loop)` — סינתזת תדר מחזורית איטית והרמוניות; קידוד OGG |
| `audio/siren-wail-loop.mp3` | CC0-1.0 | `build.py:synth(siren-wail-loop)` — סינתזת תדר מחזורית איטית והרמוניות; קידוד MP3 |
| `audio/siren-yelp-loop.ogg` | CC0-1.0 | `build.py:synth(siren-yelp-loop)` — סינתזת תדר מחזורית מהירה והרמוניות; קידוד OGG |
| `audio/siren-yelp-loop.mp3` | CC0-1.0 | `build.py:synth(siren-yelp-loop)` — סינתזת תדר מחזורית מהירה והרמוניות; קידוד MP3 |
| `audio/siren-doppler-loop.ogg` | CC0-1.0 | `build.py:synth(siren-doppler-loop)` — יללה איטית, אפנון תדר עדין ומיקום סטריאו מחזורי; קידוד OGG |
| `audio/siren-doppler-loop.mp3` | CC0-1.0 | `build.py:synth(siren-doppler-loop)` — יללה איטית, אפנון תדר עדין ומיקום סטריאו מחזורי; קידוד MP3 |
| `audio/police-horn.ogg` | CC0-1.0 | `build.py:synth(police-horn)` — סכום חמישה סינוסים, מעטפת צפירה ורוויה רכה; קידוד OGG |
| `audio/police-horn.mp3` | CC0-1.0 | `build.py:synth(police-horn)` — סכום חמישה סינוסים, מעטפת צפירה ורוויה רכה; קידוד MP3 |
| `audio/vulcan-fire-loop.ogg` | CC0-1.0 | `build.py:synth(vulcan-fire-loop)` — רעש מקורי בזרע קבוע, תהודות ו־80 פעימות בשנייה; קידוד OGG |
| `audio/vulcan-fire-loop.mp3` | CC0-1.0 | `build.py:synth(vulcan-fire-loop)` — רעש מקורי בזרע קבוע, תהודות ו־80 פעימות בשנייה; קידוד MP3 |
| `audio/vulcan-spin-up.ogg` | CC0-1.0 | `build.py:synth(vulcan-spin-up)` — סינתזת רוטור, תדר עולה מ־18 ל־80 פעימות בשנייה; קידוד OGG |
| `audio/vulcan-spin-up.mp3` | CC0-1.0 | `build.py:synth(vulcan-spin-up)` — סינתזת רוטור, תדר עולה מ־18 ל־80 פעימות בשנייה; קידוד MP3 |
| `audio/vulcan-spin-down.ogg` | CC0-1.0 | `build.py:synth(vulcan-spin-down)` — סינתזת רוטור, תדר יורד מ־80 ל־12 פעימות בשנייה; קידוד OGG |
| `audio/vulcan-spin-down.mp3` | CC0-1.0 | `build.py:synth(vulcan-spin-down)` — סינתזת רוטור, תדר יורד מ־80 ל־12 פעימות בשנייה; קידוד MP3 |
| `audio/vulcan-flash.ogg` | CC0-1.0 | `build.py:synth(vulcan-flash)` — רעש מסונן, תהודה יורדת ומעטפת הדף; קידוד OGG |
| `audio/vulcan-flash.mp3` | CC0-1.0 | `build.py:synth(vulcan-flash)` — רעש מסונן, תהודה יורדת ומעטפת הדף; קידוד MP3 |
| `audio/vulcan-background-loop.ogg` | CC0-1.0 | `build.py:synth(vulcan-background-loop)` — מקור הירי הרציף בהנמכת 8 דציבל; קידוד OGG |
| `audio/vulcan-background-loop.mp3` | CC0-1.0 | `build.py:synth(vulcan-background-loop)` — מקור הירי הרציף בהנמכת 8 דציבל; קידוד MP3 |
| `audio/metal-impact.ogg` | CC0-1.0 | `build.py:synth(metal-impact)` — חמש תהודות לא־הרמוניות דועכות ומכת רעש; קידוד OGG |
| `audio/metal-impact.mp3` | CC0-1.0 | `build.py:synth(metal-impact)` — חמש תהודות לא־הרמוניות דועכות ומכת רעש; קידוד MP3 |
| `audio/near-miss-whoosh.ogg` | CC0-1.0 | `build.py:synth(near-miss-whoosh)` — רעש מסונן, מעטפת משב ומעבר משמאל לימין; קידוד OGG |
| `audio/near-miss-whoosh.mp3` | CC0-1.0 | `build.py:synth(near-miss-whoosh)` — רעש מסונן, מעטפת משב ומעבר משמאל לימין; קידוד MP3 |

## קוד, תיעוד ונתוני אימות

| קובץ | רישיון | מקור |
|---|---|---|
| `build.py` | CC0-1.0 | קוד DSP, קידוד ואימות מקורי שנכתב למשימה זו |
| `audit-preview.py` | CC0-1.0 | קוד ביקורת דפדפן מקורי למשימה זו, באמצעות API ציבורי של Playwright |
| `preview.html` | CC0-1.0 | עיצוב, טקסט וקוד נגן מקוריים; גופני מערכת בלבד |
| `manifest.json` | CC0-1.0 | פלט מקורי של `build.py:build`, מפרט 12 צלילים ומדידות תפר המקור |
| `measurements.json` | CC0-1.0 | מדידות וגיבובים שחושבו מקבצי המסירה ב־`build.py:verify` |
| `browser-validation.json` | CC0-1.0 | תוצאות ביצוע מקוריות של `audit-preview.py` על דף ההאזנה והקבצים המקומיים |
| `README.md` | CC0-1.0 | הוראות יצירה, אימות והאזנה מקוריות למשימה זו |
| `REPORT.md` | CC0-1.0 | דוח מקורי שנערך מתוך המדידות ומבדיקת התצוגה |
| `LICENSES.md` | CC0-1.0 | רישום המקורות וההקדשה המקוריים של חבילה זו |

גיבובי SHA-256 לכל קובצי האודיו נמצאים ב־[measurements.json](measurements.json). אין חובת מתן קרדיט כתנאי שימוש.
