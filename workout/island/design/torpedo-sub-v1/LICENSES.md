# מקור ורישיון — torpedo-sub-v1

כל קובצי החבילה הם יצירה מקורית שנוצרה לבקשה זו: גאומטריה, ספרייטים, סינתזת שמע, קוד מקור, תצוגה ותיעוד. לא הורדו מודלים, מרקמים או דגימות שמע, ולא הועתקו נכסי משחק קיימים. הנכסים בדיוניים, ללא מותגים, סמלים או כיתוב אפוי.

**SPDX-License-Identifier: CC0-1.0**

To the extent possible under law, the authors have waived all copyright and related or neighboring rights to the original files in this directory under the CC0 1.0 Universal Public Domain Dedication. Where the waiver is not effective, the CC0 fallback license applies. The work is provided without warranty. You may copy, modify and distribute it, including commercially, without requesting permission or attribution.

נוסח מחייב: [CC0 1.0 Universal — Legal Code](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

| קבצים | מקור |
|---|---|
| `models/torpedo-player.glb`, `models/torpedo-enemy.glb` | גאומטריה מקורית: גוף סיבובי בעל 12 צלעות, הגאי זנב, מדחף תלת־להבי ומפתחות סיבוב. `source/build_assets.py::model`. |
| `sprites/bubble-trail.png`, `sprites/bubbles-rise.png` | חלקיקי בועות מקוריים עם זרימה מחזורית. `frame` ו־`bubble`. |
| `sprites/sonar-ring.png` | טבעות מקוריות מתרחבות ונעלמות. `frame`. |
| `sprites/underwater-explosion.png` | עמוד מים מתפצל, טיפות וענן בועות מקוריים; 32 פריימים. `frame`. |
| `sprites/launch-flash.png` | הבזק מים מתומן ובועות מקוריות. `frame`. |
| `sprites/submarine-shadow.png`, `sprites/enemy-warning-line.png` | צללית צוללת בדיונית וקו נקודות מקוריים. `decals`. |
| כל קובצי `audio/*.ogg` ו־`audio/*.mp3` | סינתזה מקורית של גלים ורעש מסונן; ללא קולות מוקלטים, דיבור או מוזיקה. `synth` ו־`audio`. |
| `source/build_assets.py`, `preview.html`, `preview.css`, `preview.js` | קוד מקורי שנכתב לחבילה זו. |
| `manifest.json`, `REPORT.md`, `LICENSES.md` | רישום קבצים, מדידות ותיעוד מקוריים. |
| `preview-desktop.png`, `preview-mobile.png` | צילומי תצוגת החבילה המקורית ב־Chromium. |

התצוגה מייבאת את Three.js ואת GLTFLoader הקיימים במאגר דרך `../../vendor/`. אלו תלויות קוד תחת MIT; רישיונן נשאר [LICENSE.three](../../vendor/LICENSE.three). קובצי הספרייה אינם מועתקים לחבילה. לא נטען מפענח Draco או Meshopt, ולא נטען שום משאב מרשת חיצונית.

Python, NumPy, SciPy, Pillow, FFmpeg, Chromium ו־Khronos glTF Validator שימשו ככלי יצירה או אימות בלבד; קוד הכלים אינו חלק מחבילת הנכסים. גופני הממשק הם גופני מערכת. `../naval-v7/` שימשה רפרנס סגנוני בלבד. בחיפוש במאגר לא נמצא טורפדו תואם למפרט; כל הגאומטריה בחבילה נוצרה מחדש.
