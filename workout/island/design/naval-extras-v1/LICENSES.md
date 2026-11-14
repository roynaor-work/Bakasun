# מקור ורישיונות — naval-extras-v1

כל הקבצים החדשים בחבילה זו הם יצירה מקורית שנוצרה במיוחד לבקשה זו, ללא נכסי מדיה שהורדו, ללא דגימות צליל, ללא מותגים וללא כיתוב על נכסי המשחק. כולם מוקדשים לנחלת הכלל תחת **CC0-1.0**. מותר להשתמש, לשנות ולהפיץ, כולל מסחרית, ללא חובת ייחוס.

נוסח הרישיון: [CC0 1.0 Universal — Legal Code](https://creativecommons.org/publicdomain/zero/1.0/legalcode). מזהה SPDX: `CC0-1.0`.

To the extent possible under law, the authors dedicate all copyright and related and neighboring rights in the original files listed below to the public domain under CC0 1.0 Universal. Where a waiver is not legally effective, the fallback license in CC0 applies. The work is provided without warranty.

## רישום לכל קובץ

כל הנתיבים יחסיים לתיקייה זו. אין קובץ מדיה חיצוני שהועתק לתוכה.

| קבצים | מקור ושיטת יצירה | רישיון |
|---|---|---|
| `supply_buoy.glb`, `ammo_crate.glb` | גאומטריה מקורית; `source/build.py::pickups`. מצוף כתום עם פנס פועל וארגז עץ על מצופים. | CC0-1.0 |
| `patrol_boat.glb`, `small_destroyer.glb`, `tower_submarine.glb` | צלליות וגאומטריה מקוריות; `source/build.py::ship` ו־`gun`. שלוש סצנות לכל ספינה. אין העתקה מספינות קיימות במאגר. | CC0-1.0 |
| `shell_regular.glb`, `shell_heavy.glb`, `landing_flag.glb` | גאומטריה מקורית; `source/build.py::projectiles`. הדגל כתום וחלק, ללא סמל מדינה. | CC0-1.0 |
| `naval_atlas_1024.png` | אטלס צבע וגרדיאנטים מקורי, 1024×1024; `source/build.py::atlas`. | CC0-1.0 |
| `bow_mist.png`, `landing_splash.png`, `water_explosion.png`, `foam.png` | חלקיקים וצורות מקוריים, חישוב פריימים ו־antialiasing; `source/build.py::sprite_frame` ו־`effects`. | CC0-1.0 |
| `vulcan_missile.png`, `landing_decal.png` | ספרייט טיל בדיוני וטבעת מקוריים, ללא כיתוב; `source/build.py::sprite_frame` ו־`effects`. | CC0-1.0 |
| `supply_collect.ogg`, `supply_collect.mp3` | סינתזה מקורית של שלושה צלילים עולים; `source/build.py::synth`, ללא הקלטות. | CC0-1.0 |
| `shell_hit_ship.ogg`, `shell_hit_ship.mp3` | סינתזה מקורית של מכה עמומה ומצלול קצר; `source/build.py::synth`. | CC0-1.0 |
| `base_cannon.ogg`, `base_cannon.mp3` | סינתזה מקורית של ירייה מעוגלת; `source/build.py::synth`. | CC0-1.0 |
| `depot_burst.ogg`, `depot_burst.mp3` | סינתזה מקורית של רעם קצר עם שתי פעימות משנה; `source/build.py::synth`. | CC0-1.0 |
| `preview.html`, `preview.css`, `preview.js` | ממשק ותצוגה מקוריים שנכתבו לחבילה זו. | CC0-1.0 |
| `preview-desktop.png`, `preview-mobile.png` | צילומי התצוגה המקורית ב־Chromium עם רינדור SwiftShader; נכסי חבילה זו בלבד. | CC0-1.0 |
| `source/build.py`, `source/catalog.py`, `source/requirements.txt` | כלי יצירה וקיטלוג מקוריים שנכתבו לחבילה זו. | CC0-1.0 |
| `manifest.json`, `audio_metrics.json`, `asset_audit.json` | רישום ונתוני מדידה של קבצי החבילה; SHA-256 נמדד מהבתים בפועל. | CC0-1.0 |
| `REPORT.md`, `LICENSES.md` | תיעוד מקורי של העבודה, התפעול והרישיונות. | CC0-1.0 |

## כלים ותלויות שאינם מועתקים לחבילה

- התצוגה מפנה לקובצי Three.js שכבר קיימים במאגר: `../../vendor/three.module.js`, `../../vendor/GLTFLoader.js`, `../../vendor/BufferGeometryUtils.js`. רישיונם MIT נמצא ב־[`../../vendor/LICENSE.three`](../../vendor/LICENSE.three). רישיון CC0 של חבילה זו אינו משנה את רישיונם. לא נטען מפענח Draco או Meshopt.
- Python, NumPy, SciPy, Pillow ו־FFmpeg משמשים ככלי יצירה בלבד; קוד המקור שלהם אינו כלול. קודקים: Vorbis ו־MP3. לא צורפו דגימות שמע או מוזיקה.
- Khronos glTF Validator משמש לאימות חיצוני בלבד; אינו כלול בחבילה. Chromium משמש להצגת התוצאה ולצילום בלבד.
- גופני הממשק הם גופני מערכת; אין קובץ גופן מצורף. אין טקסטורות, דגמי תלת ממד, צלילים או ספרייטים מצד שלישי.

החבילה הקיימת `../naval-v7/` שימשה לעיון בסגנון ובסביבה בלבד. אין העתקת גאומטריה, מרקמים, צלילים או קוד ממנה.
