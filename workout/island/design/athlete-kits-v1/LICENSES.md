# מקורות ורישיונות — athlete-kits-v1

כל הקבצים החדשים בחבילה הם יצירה מקורית למשימה זו ומוקדשים לנחלת הכלל תחת **CC0 1.0 Universal**: <https://creativecommons.org/publicdomain/zero/1.0/>. ככל שהדין מאפשר, היוצרים מוותרים על זכויות היוצרים והזכויות הנלוות בהם; אין אחריות. אין בחבילה תמונות מאגר, גופנים, מותגים, סמלי ליגה, סמלי קבוצה או דמות של שחקן מזוהה.

| קובץ חדש | מקור | רישיון |
| --- | --- | --- |
| `kit-mask-basketball.png` | פלט מקורי של `generate.py`: רסטר של מיקומי משולשים ו־UV מתוך גוף ה־hm08 הקיים, וגבולות בגד שנכתבו למשימה | CC0-1.0 |
| `kit-detail-basketball.png` | פלט מקורי של `generate.py`: נוסחאות קפלים, תפרים, סרטי קצה ואריג מחורר; ללא קלט של תמונה | CC0-1.0 |
| `kit-normal-basketball.jpg` | פלט מקורי של `generate.py`: נגזרות של שדה גובה פרוצדורלי שנוצר למשימה | CC0-1.0 |
| `generate.py` | קוד מקורי למשימה; קורא GLB בלבד, אינו משנה אותו | CC0-1.0 |
| `preview.html` | ממשק, עיצוב וטקסט מקוריים למשימה; גופני מערכת בלבד | CC0-1.0 |
| `preview.mjs` | קוד תצוגה מקורי למשימה, כולל יישום חוזה ערוצי הקיט והתאמת גזרה זמנית | CC0-1.0 |
| `REPORT.md` | תיעוד מקורי למשימה | CC0-1.0 |
| `LICENSES.md` | רישום מקורות מקורי למשימה | CC0-1.0 |
| `screenshots/comparison-front.png` | צילום Chromium מקומי של `preview.html`, חזית וגלריית הטקסטורות; גוף וטקסטורות מקור כמתועד להלן | CC0-1.0 |
| `screenshots/comparison-back.png` | צילום Chromium מקומי של אותה תצוגה, גב | CC0-1.0 |
| `screenshots/mask-three-quarter.png` | צילום Chromium מקומי של אותה תצוגה, מסכות על הגוף בזווית שלושה רבעים | CC0-1.0 |
| `screenshots/source-geometry.png` | צילום Chromium מקומי של אותה תצוגה, התאמת הגזרה כבויה | CC0-1.0 |
| `screenshots/lod1-side.png` | צילום Chromium מקומי של אותה תצוגה, LOD1 בצד ובצבע חמרה | CC0-1.0 |
| `screenshots/mobile.png` | צילום Chromium מקומי של אותה תצוגה ברוחב 390 פיקסלים | CC0-1.0 |

## קלט קיים, נקרא בלבד

- הגוף `../../assets/athlete/athlete.glb`: MakeHuman hm08, גזרת גוף, שלד ו־UV של MakeHuman/MPFB, **CC0-1.0**. עיבוד מעטפת הקיט, העור והשיער הם נכסים פרוצדורליים של הפרויקט, **CC0-1.0** לפי [README המקור](../../assets/athlete/README.md) ו־[provenance.json](../../assets/athlete/provenance.json).
- טקסטורות המקור המוצגות/נטענות: `kit-mask.png`, `kit-detail.png`, `kit-normal.jpg`, `kit-orm.jpg`, `skin-albedo.jpg`, `skin-mask.png`, `skin-normal.jpg`, `skin-orm.jpg` תחת `../../assets/athlete/textures/`. יצירות פרוצדורליות של הפרויקט, **CC0-1.0**, לפי אותם מסמכי מקור. התמונות משמשות לתצוגת הבסיס והעור; הגנרטור החדש אינו מעבד אותן.
- מקור מיפוי הערוצים: [`soccer-athlete.mjs`](../../minigames/soccer-athlete.mjs), כתיעוד לחוזה הנתונים הקיים. לא שונה ולא הועתק לחבילה.
- מקור upstream לגאומטריה: [MakeHuman Assets license](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.ASSETS.md), [MPFB](https://github.com/makehumancommunity/mpfb2). כתובות וגרסאות המקור המלאות נשארו ב־`provenance.json` הקיים.
- גרסת המאגר שנקראה: [`51f4faab518c695672efaf6323a8b72f239a2b84`](https://github.com/roynaor-work/Bakasun/tree/51f4faab518c695672efaf6323a8b72f239a2b84). לא נעשה שימוש באנימציות CMU שבתוך ה־GLB: הצילומים הם בפוזת המנוחה.

## תוכנות וספריות שאינן נכסים חדשים בחבילה

התצוגה מפנה לקבצים המקומיים הקיימים `../../vendor/three.module.js` (r160), `GLTFLoader.js`, `BufferGeometryUtils.js` ו־`SkeletonUtils.js`. Three.js הוא **MIT**, Copyright © 2010–2023 three.js authors; נוסח הרישיון הקיים נשמר ב־[`../../vendor/LICENSE.three`](../../vendor/LICENSE.three). לא נוסף עותק של ספריית צד שלישי לתיקייה זו. רישיון CC0 של הקבצים החדשים אינו משנה את רישיון הספרייה.

numpy, Pillow ו־scipy שימשו ככלי יצירה; Chromium/Playwright שימשו לצילום ואימות מקומיים בלבד. הקוד שלהם אינו נכלל בחבילה ואינו נטען בדף התצוגה.
