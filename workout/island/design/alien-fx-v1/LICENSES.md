# מקורות ורישיונות — Alien FX v1

כל הקבצים החדשים בתיקייה זו נוצרו עבור `roynaor-work/Bakasun` ב־13.11.2026. אין נכסים שנלקחו ממאגר צד שלישי. כל הזכויות שניתן להקדיש בתוצרים מוקדשות לפי **CC0-1.0**. מותר להשתמש, לשנות, להעתיק ולהפיץ, לרבות שימוש מסחרי, ללא חובת ייחוס.

נוסח ההקדשה: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode). ככל שהוויתור אינו תקף בדין החל, ניתנת הרשאה חופשית, בלתי חוזרת וללא תמלוגים למימוש אותן פעולות. ההקדשה חלה רק על הקבצים החדשים בתיקייה זו; אינה משנה רישיון של קובץ קיים במאגר.

| קבצים | מקור | רישיון |
|---|---|---|
| `source/effects-original.png` | תמונת מקור חדשה באמצעות OpenAI ImageGen המובנה, ללא ייחוס חיצוני; ההוראה המלאה ב־`source/PROMPTS.md` | CC0-1.0, ככל שקיימות זכויות שניתן להקדיש |
| `sprites/cannon-regular.png`, `sprites/vulcan-burst.png`, `sprites/alien-impact.png`, `sprites/alien-explosion.png`, `sprites/shield-ring.png` | נגזרות מהמקור המצורף; חיתוך, התאמת גודל, זווית, alpha ואריזה באמצעות `source/pack.mjs` | CC0-1.0, כנ״ל |
| `sprites/boss-explosion.png` | נגזרת מהמקור המצורף, עם גל הלם וחלקיקי אור גאומטריים מקוריים; 64 פריימים | CC0-1.0, כנ״ל |
| `sprites/heat-bar.png`, `sprites/heat-icon.png`, `sprites/overheat-shutdown.png` | גאומטריה וגרדיאנטים מקוריים ב־`source/pack.mjs`, ללא גופן או טקסט בתוך הגרפיקה | CC0-1.0 |
| `audio/vulcan-burst.ogg`, `audio/vulcan-burst.mp3`, `audio/overheat.ogg`, `audio/overheat.mp3`, `audio/boss-explosion.ogg`, `audio/boss-explosion.mp3` | סינתזה מקורית של תדרים ורעש עם seed קבוע ב־`source/synthesize.py`; ללא הקלטות, דיבור או דגימות ממקור אחר | CC0-1.0 |
| `source/pack.mjs`, `source/synthesize.py`, `source/package.json`, `source/requirements.txt` | קוד ומטא־נתונים מקוריים לחבילה | CC0-1.0 |
| `preview.html`, `preview.css`, `preview.js`, `preview-data.js` | מציג עצמאי מקורי. החלליות להדגמה הן צורות גאומטריות מקוריות. אין ספרייה, גופן או שירות חיצוני במציג | CC0-1.0 |
| `manifest.json`, `REPORT.md`, `LICENSES.md`, `source/PROMPTS.md`, `source/audio-measurements.json`, `evidence/validation.json`, `FILE-SIZES.csv` | תיעוד, קואורדינטות, נתוני תזמון, מדידות ורשימת קבצים מקוריים | CC0-1.0 |
| `evidence/preview-desktop.webp`, `evidence/preview-mobile.webp` | צילומי הדפדפן של המציג המקורי והנכסים המצורפים, ללא תוכן חיצוני | CC0-1.0, ככל שקיימות זכויות שניתן להקדיש |

יצירה בסיוע AI אינה מוצגת כאיור אנושי ידני, וההקדשה אינה טוענת לבלעדיות או לזכויות שאינן קיימות. אין לוגו, סימן מסחרי או טקסט בתוך הספרייטים. כותרות המציג והתיעוד הן מידע שמחוץ לגרפיקה.

Sharp, ‏NumPy, ‏FFmpeg, ‏Chromium ו־Playwright שימשו ככלי עבודה בלבד ואינם מופצים בתיקייה. רישיונותיהם אינם מוחלפים על ידי הקדשה זו.
