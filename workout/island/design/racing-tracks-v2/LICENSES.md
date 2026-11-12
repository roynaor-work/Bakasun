# מקור ורישיונות — racing-tracks-v2

כל קובץ חדש בחבילה זו הוא יצירה מקורית שנוצרה למשימה זו ב־7 בנובמבר 2026. אין נכסים שנלקחו מאתרים, חבילות או מאגרים חיצוניים. המסלולים בדיוניים ואינם העתקה של מסלולים מסחריים.

## רישיון משותף

**CC0 1.0 Universal — SPDX: CC0-1.0.** במידה המרבית המותרת בחוק, מחברי הקבצים החדשים מוותרים על זכויות היוצרים והזכויות הנלוות ביצירות אלה ומקדישים אותן לנחלת הכלל. אפשר להעתיק, לשנות ולהפיץ, גם מסחרית, ללא בקשת רשות. אין אחריות. הנוסח המשפטי המלא: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

| קובץ | מקור | רישיון |
|---|---|---|
| `tracks.json` | קואורדינטות מקוריות מ־`generate.mjs`; שש פריסות בדיוניות | CC0-1.0 |
| `tracks.mjs` | ייצוא מודול שנוצר מאותו מקור של `tracks.json` | CC0-1.0 |
| `layouts.json` | פניות, קשתות, שיקאנות וישורות שמחשב המחולל המקורי | CC0-1.0 |
| `generate.mjs` | מחולל מקורי; קודקודים ורדיוסים שחוברו למשימה | CC0-1.0 |
| `geometry.mjs` | קוד מקורי לעיגול פניות, ספליין מחזורי ובדיקות מרחק וחיתוך; משתמש ב־`createTrack` הקיים | CC0-1.0 |
| `analysis.mjs` | קוד ניתוח מקורי המתאר את המשוואות והקבועים של מנוע המאגר | CC0-1.0 |
| `simulate.mjs` | נהג בדיקה מקורי והזרקת תלות בזיכרון; מייבא את מנוע הפיזיקה הקיים ללא העתקתו | CC0-1.0 |
| `ribbon-check.mjs` | קוד מקורי לשחזור מתמטי וחיתוך של משולשי רצועות הכביש והקרקע | CC0-1.0 |
| `measure.mjs` | הרצה מקורית של המדידות, לפני ואחרי | CC0-1.0 |
| `measurements.json` | נתונים מספריים שנמדדו מקומית באמצעות `measure.mjs`, כולל בסיס ההשוואה | CC0-1.0 |
| `simulations.json` | עקבות הקפה שנוצרו בסימולציות המקומיות של המנוע הקיים | CC0-1.0 |
| `preview.html` | מבנה, טקסט וממשק אבחון מקוריים | CC0-1.0 |
| `preview.css` | עיצוב מקורי; גופני מערכת בלבד | CC0-1.0 |
| `preview.mjs` | רכיבי SVG, גרפים, ניגון וניווט מקוריים; ללא נכסי מדיה חיצוניים | CC0-1.0 |
| `verify.test.mjs` | בדיקות קבלה מקוריות לחבילה | CC0-1.0 |
| `REPORT.md` | דוח, תיעוד ומדידות מקוריים למשימה | CC0-1.0 |
| `LICENSES.md` | מסמך מקור ורישוי מקורי | CC0-1.0 |
| `browser-check.py` | תוכנית בדיקת דפדפן מקורית; Playwright משמש כלי בדיקה מותקן ואינו נכס של התצוגה | CC0-1.0 |
| `browser-verification.json` | תוצאות בדיקת התצוגה המקומית, שנוצרו באמצעות browser-check.py | CC0-1.0 |
| `preview-shots/desktop-coast.jpg` | צילום מסך של התצוגה המקורית ב־Chromium מקומי באמצעות browser-check.py | CC0-1.0 |
| `preview-shots/desktop-harbor.jpg` | צילום מסך של התצוגה המקורית ב־Chromium מקומי באמצעות browser-check.py | CC0-1.0 |
| `preview-shots/desktop-jungle.jpg` | צילום מסך של התצוגה המקורית ב־Chromium מקומי באמצעות browser-check.py | CC0-1.0 |
| `preview-shots/desktop-ruins.jpg` | צילום מסך של התצוגה המקורית ב־Chromium מקומי באמצעות browser-check.py | CC0-1.0 |
| `preview-shots/desktop-summit.jpg` | צילום מסך של התצוגה המקורית ב־Chromium מקומי באמצעות browser-check.py | CC0-1.0 |
| `preview-shots/desktop-volcano.jpg` | צילום מסך של התצוגה המקורית ב־Chromium מקומי באמצעות browser-check.py | CC0-1.0 |
| `preview-shots/mobile-landscape.jpg` | צילום מסך של התצוגה המקורית ב־Chromium מקומי באמצעות browser-check.py | CC0-1.0 |
| `preview-shots/mobile-portrait.jpg` | צילום מסך של התצוגה המקורית ב־Chromium מקומי באמצעות browser-check.py | CC0-1.0 |

## מקורות התנהגות ותלויות קיימות

בסיס ההשוואה: [Bakasun main, קומיט e8145727](https://github.com/roynaor-work/Bakasun/tree/e8145727d343adfa6bfa06f0c1a3287ab2ac6c1b). קובצי `workout/island/minigames/racing-tracks.mjs`, `racing-physics.mjs` ו־`racing-view.mjs` נקראו לצורך תאימות ובדיקות. הם אינם חלק מהקבצים החדשים ואינם מקבלים רישיון חדש באמצעות מסמך זה. טביעות המקורות המחושבים רשומות במדידות. גיאומטריית התכנונים החדשים לא נגזרה מנקודות המסלולים הישנים.
