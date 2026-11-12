# רישיון ומקורות

כל הקבצים החדשים בתיקייה זו מוקדשים לציבור תחת [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/): קוד תיקון, תנועות, ניסיונות, דוחות וגיליונות רנדר. אין נכס חיצוני חדש ואין שינוי ברישיון של ספריות העזר.

| רכיב | מקור | רישיון |
|---|---|---|
| תנועות לפני התיקון ו־15 התנועות שנשמרו | [clips.json של PR 414, קומיט dc99f034](https://github.com/roynaor-work/Bakasun/blob/dc99f03416ca279b549b7f2db927ef7a6ac401e0/workout/island/design/hockey-v1/clips.json), יצירה מקורית של Codex | CC0-1.0 |
| תיקוני תנועה ושלושת הניסיונות | יצירה מקורית עבור מסירה זו, `source/stride-fixes.mjs`, `source/edge-fixes.mjs`, `source/goalie-fixes.mjs`, `source/build-fix.mjs`; נגזרת מתנועות CC0 של PR 414 | CC0-1.0 |
| מתאם קלט, בדיקת רשת ותצוגה | עיבוד של קובצי `source/` ו־`preview.html` המקוריים ב־[hockey-v1 באותו קומיט](https://github.com/roynaor-work/Bakasun/tree/dc99f03416ca279b549b7f2db927ef7a6ac401e0/workout/island/design/hockey-v1) | CC0-1.0 |
| מדדי QA ותוצריהם | כלי motion-qa-v1 המקורי מ־[PR 371, קומיט 5eb4f093](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1); הורדה לתיקייה זמנית ואימות SHA-256, ללא שינוי בנוסחאות או בספים | CC0-1.0 |
| גיליונות PNG ותמונת גלריה | רנדר דפדפן של תנועות לפני ואחרי ושל שלושת קובצי GLB המקוריים; אותם דגמים, תאורה ומצלמה | CC0-1.0 |
| גופים ומקל המוצגים בגיליונות | קובצי `../hockey-v1/models/` של PR 414, ללא העתקה או שינוי. ליבת גוף MakeHuman/עיניים CC0 וציוד מקורי, כמפורט ב־[רישיון המקור](../hockey-v1/LICENSES.md) וב־[ראיית המקור](../hockey-v1/model-evidence.json) | CC0-1.0 |
| קוד הפקה, אימות, דוח ומניפסט חדשים | יצירה מקורית של Codex, 12/11/2026 | CC0-1.0 |

Three.js ו־GLTFLoader נטענים מהעותקים הקיימים במאגר ברישיון MIT ואינם נכללים בתיקייה. Playwright ו־Chromium משמשים להפקה בלבד ואינם מופצים. `ATHLETE_STANDARD` ופונקציות השלד נקראים ישירות מהקוד הקיים, ללא העתקה או שינוי.

[manifest.json](manifest.json) כולל גודל, רישיון, מקור ו־SHA-256 לכל קובץ אחר בתיקייה, וכן חתימות של התלויות המקוריות. [qa-tool-provenance.json](qa-tool-provenance.json) מתעד את חתימות שמונת קובצי כלי המדידה ואת התאמת מדדי קו הבסיס.
