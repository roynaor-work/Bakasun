# מקורות ורישיונות — Racing liveries v1

כל **הקבצים החדשים בחבילה זו** הם יצירה מקורית שנוצרה במסגרת המשימה עבור
Bakasun, או תצלומי תצוגה של היצירה המקורית ושל דגם הפורמולה הקיים, שגם הוא CC0.
הם נמסרים תחת **CC0-1.0**: ויתור על זכויות יוצרים וזכויות נלוות ככל שהדין מאפשר,
ובמקום שבו ויתור כזה אינו תקף, רישיון בלתי מותנה לשימוש לכל מטרה ללא דרישת ייחוס.
הנוסח המשפטי המלא: [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode).
מזהה SPDX: `CC0-1.0`.

| קבצים | מקור | רישיון |
| --- | --- | --- |
| `manifest.json` | מיפוי מקורי לחלקי הדגם. שמות הקבוצות, הצבעים, שיוך הנהגים והמספרים נקראו מ־`../../minigames/racing-league-core.mjs`, ללא העתקת קוד המנוע | CC0-1.0 |
| `palettes/flame.json`, `palettes/ocean.json`, `palettes/gold.json`, `palettes/silver.json`, `palettes/forest.json`, `palettes/night.json` | צבעי הגוף לפי `TEAMS`; הצבעים המשניים, הגימור, הפסים וגרסאות הזוגות עוצבו במקור עבור החבילה | CC0-1.0 |
| `numbers/flame-1.png`, `numbers/flame-4.png` | ציור מצולעים מקורי, נוצר ב־`source/build_assets.py` | CC0-1.0 |
| `numbers/ocean-16.png`, `numbers/ocean-63.png` | כנ״ל | CC0-1.0 |
| `numbers/gold-44.png`, `numbers/gold-81.png` | כנ״ל | CC0-1.0 |
| `numbers/silver-11.png`, `numbers/silver-31.png` | כנ״ל | CC0-1.0 |
| `numbers/forest-27.png`, `numbers/forest-14.png` | כנ״ל | CC0-1.0 |
| `numbers/night-55.png`, `numbers/night-22.png` | כנ״ל | CC0-1.0 |
| `source/build_assets.py` | מחולל מקורי המבוסס על הספרייה התקנית של Python; צורות הספרות נכתבו כמצולעים, ללא גופן | CC0-1.0 |
| `apply-livery.mjs` | מתאם צבע מקורי ו־shader מקורי; משתמש בממשק Three.js הקיים במאגר | CC0-1.0 |
| `preview.html`, `preview.css`, `preview.mjs` | ממשק, עיצוב, תאורה וצל מקורי שנוצר עבור החבילה; גופני מערכת בלבד | CC0-1.0 |
| `evidence/desktop.jpg`, `evidence/mobile.jpg`, `evidence/ocean-front.jpg`, `evidence/ocean-rear.jpg`, `evidence/ocean-top.jpg` | צילומי Chromium של התצוגה המקומית, הצביעות המקוריות ודגם הפורמולה המקורי CC0; ללא תמונות חיצוניות | CC0-1.0 |
| `evidence/browser.json` | תוצאות אימות מקומיות שנוצרו במסגרת המשימה | CC0-1.0 |
| `REPORT.md`, `LICENSES.md` | תיעוד מקורי של החבילה | CC0-1.0 |

## נכסים קיימים שנקראים במקומם

- הדגם: [`../../assets/racing-formula/formula.glb`](../../assets/racing-formula/formula.glb).
  דגם מקורי, ללא מותגים, CC0-1.0 לפי
  [`../racing-formula/README.md`](../racing-formula/README.md) ולפי `extras.license`
  בשורש `Formula` בתוך ה־GLB. לא הועתק ולא שונה.
- Three.js ו־GLTFLoader: מודולים קיימים ב־`../../vendor/`, רישיון MIT הקיים במאגר
  ([`../../vendor/LICENSE.three`](../../vendor/LICENSE.three)). אינם קבצים חדשים
  בחבילה ואינם מקבלים רישיון אחר. אין עותק נוסף שלהם ואין תלות ב־CDN.
- תצלומי התצוגה אינם כוללים נכס sport-coupe, שנושא רישיון אחר. נבחר רק דגם
  הפורמולה המקורי CC0 שבו המשחק משתמש כעת.

אין בחבילה לוגואים, סמלי יצרנים, מדבקות חסות, גופנים מיובאים או תמונות צד שלישי.
הסימנים היחידים המצוירים על המכוניות הם מספרי הרכב; שמות הקבוצות מופיעים בממשק
ובתיעוד שמחוץ לדגם.
