# מקורות ורישיונות — Fire Rooms v1

תאריך יצירה: 13 בנובמבר 2026.

כל הקבצים החדשים בחבילה הזאת הם יצירה מקורית שנוצרה עבור Bakasun במשימה זו. הגאומטריה נבנתה מקוד המקור הכלול; הצבעים והאטלס נוצרו מאפס. אין נכסי מאגר, תבניות, תמונות, לוגואים, גופנים מוטמעים או חומרים של צד שלישי בקבצים החדשים.

| קובץ | מקור | רישיון |
|---|---|---|
| `living-room.glb` | מודל מקורי; `source/build_rooms.py` → `living_room()` | CC0-1.0 |
| `kitchen.glb` | מודל מקורי; `source/build_rooms.py` → `kitchen()` | CC0-1.0 |
| `bedroom.glb` | מודל מקורי; `source/build_rooms.py` → `bedroom()` | CC0-1.0 |
| `palette-1024.png` | אטלס צבעים מקורי; `PALETTE` ו־`png_atlas()` באותו מקור | CC0-1.0 |
| `source/build_rooms.py` | קוד מידול וייצוא GLB מקורי; הספרייה הסטנדרטית של Python בלבד | CC0-1.0 |
| `manifest.json` | נתונים שנוצרים מאותו מקור, כולל שמות צמתים, מיקומים וספירות | CC0-1.0 |
| `preview.html`, `preview.css`, `preview.mjs` | דף תצוגה מקורי שנכתב למשימה זו | CC0-1.0 |
| `renders/living-room-intact.png`, `renders/living-room-burnt.png` | צילומי רינדור של המודל המקורי במצלמה הכלולה ב־GLB, ללא ממשק או כיתוב | CC0-1.0 |
| `renders/kitchen-intact.png`, `renders/kitchen-burnt.png` | צילומי רינדור של המודל המקורי במצלמה הכלולה ב־GLB, ללא ממשק או כיתוב | CC0-1.0 |
| `renders/bedroom-intact.png`, `renders/bedroom-burnt.png` | צילומי רינדור של המודל המקורי במצלמה הכלולה ב־GLB, ללא ממשק או כיתוב | CC0-1.0 |
| `REPORT.md`, `verification.json`, `LICENSES.md` | תיעוד ותוצאות מדידה מקוריים לחבילה זו | CC0-1.0 |

## הקדשה לציבור

ככל שקיימות זכויות יוצרים וזכויות קשורות בקבצים המקוריים בחבילה זו, הן מוקדשות לנחלת הכלל לפי [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), לרבות הוויתור והרישיון החלופי שב[נוסח המשפטי](https://creativecommons.org/publicdomain/zero/1.0/legalcode). מותר להעתיק, לשנות ולהפיץ, גם מסחרית, ללא חובת ייחוס. אין אחריות.

## תלויות קיימות בדף התצוגה

דף התצוגה מייבא את `../../vendor/three.module.js` ואת `../../vendor/GLTFLoader.js`; האחרון מייבא את `../../vendor/BufferGeometryUtils.js`. אלו קבצים קיימים במאגר, ברישיון MIT של three.js, המתועד ב־[`../../vendor/LICENSE.three`](../../vendor/LICENSE.three). הם אינם מועתקים לחבילה ואינם מקבלים רישיון CC0. לא נטענים קוד, גופנים או נכסים מ־CDN.

הכבאית הקיימת של האפליקציה שימשה רפרנס חזותי לסגנון בלבד. לא הועתקו ממנה גאומטריה, טקסטורות או פרטים מזהים.
