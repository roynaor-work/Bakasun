# מקורות ורישיונות · soccer-pitch-v1

כל הקבצים החדשים בחבילה זו הם יצירה מקורית או נגזרות ממקור CC0, ומסופקים תחת **CC0-1.0**. אין נכסים ממשחק מסחרי, מועדון, ליגה או שחקן אמיתי. על המודלים, השלטים, התלבושת והכדור אין מותגים, אותיות או מספרים.

| קבצים | מקור | רישיון |
| --- | --- | --- |
| `pitch.glb`, `goal.glb`, `corner_flag.glb`, `bench.glb`, `ad_board.glb`, `ball.glb` | גאומטריה מקורית ודטרמיניסטית ב־`source/build.py`; מידות לפי מפרט המשימה. הכדור והרשת נוצרו מתמטית. | CC0-1.0 |
| `atlas.png` | דשא, צבעים שטוחים, רשת שקופה ותבנית 32 לוחות בכדור: יצירה מקורית ב־`source/build.py`, seed `20261113`. רק אזור הפנים ב־`[8,800,264,996]` נגזר מחיתוך אזור `[0,0,640,490]` של טקסטורת Kenney המפורטת להלן. גרפיקת הבגדים של המקור אינה כלולה. | CC0-1.0 למקור ולהתאמות |
| `reference_player.glb` | נגזרת סטטית של Kenney Animated Characters Protagonists 1.1, מתוך ה־FBX המקורי המקודד ב־`workout/3d/model/character.js`. העמדה עם ידיים למטה, גובה 1.75 מ׳, מדים בצבעים שטוחים ופריסת UV לפנים נוצרו ב־`source/prepare_reference.py`. ללא שלד, אנימציות או דחיסת רשת בפלט. | CC0-1.0 למקור ולהתאמות |
| `source/build.py`, `source/prepare_reference.py` | קוד מקורי של יצירה ואריזה; הספריות המשמשות ככלי בנייה אינן מופצות בחבילה. | CC0-1.0 |
| `preview.html`, `preview.css`, `preview.mjs` | קוד תצוגה מקורי. ספריות Three.js נטענות מהעותקים הקיימים במאגר, ללא העתקתן או שינוין. | CC0-1.0 לקוד המקורי |
| `manifest.json`, `validation.json`, `REPORT.md`, `LICENSES.md` | תיעוד, מדידות ונתוני מסירה מקוריים. | CC0-1.0 |
| `previews/*.png` | צילומי Chromium של נכסי CC0 והתצוגה המקורית בחבילה זו. | CC0-1.0 |

## מקור Kenney

[Animated Characters Protagonists, גרסה 1.1, מאת Kenney](https://kenney.nl/assets/animated-characters-protagonists), ברישיון [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

עותקי המקור במאגר נשארו ללא שינוי. קומיט הבסיס של חבילה זו: `d759582c171600dd7c7df7906c2fb38ae7f8b88a`.

| מקור במאגר | SHA-256 |
| --- | --- |
| [`../../../3d/model/character.js`](../../../3d/model/character.js) | `5495f73ac7ad786761393537855a3c7996d7e8c410134c19aafe13a7295562b6` |
| [`../../../3d/model/skaterMaleA.png`](../../../3d/model/skaterMaleA.png) | `cabeed9d1be58037cc1cf3e29fdb42a0cb6af15bebeed877c41a758a932d14f8` |
| [`../../../3d/model/License.txt`](../../../3d/model/License.txt) | הודעת CC0 המקורית של Kenney; המקור הקובע לרישיון. |

הודעת הרישיון המקורית:

```text
Animated Characters Protagonists (1.1)
Created/distributed by Kenney (www.kenney.nl)

License: (Creative Commons Zero, CC0)
http://creativecommons.org/publicdomain/zero/1.0/

You can use this content for personal, educational, and commercial purposes.
Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)
```

## תלויות קיימות וכלי עבודה

Three.js r160 ו־GLTFLoader נטענים מ־`../../vendor/`, תחת [רישיון MIT הקיים](../../vendor/LICENSE.three). אלה קבצים קיימים מחוץ לחבילה; רישיון CC0 אינו מחליף את רישיונם. אין טעינת CDN, מפענח רשת או שירות חיצוני בתצוגה.

Python, Pillow ו־Blender משמשים לבנייה בלבד. Khronos glTF Validator ו־Playwright שימשו לאימות מקומי, ולא הועתקו למאגר. מידות המשחק הן נתונים עובדתיים לפי בקשת המשתמש; מוסכמת המדידה מפורטת ב־`REPORT.md`, עם הפניה ל־[IFAB, חוק 1](https://www.theifab.com/laws/latest/the-field-of-play/).

## הקדשת CC0

במידה המרבית שהדין מאפשר, כל זכויות היוצרים והזכויות הנלוות ביצירה המקורית ובהתאמות שבחבילה זו מוקדשות לנחלת הכלל לפי [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). מותר להשתמש, לשנות ולהפיץ, גם מסחרית, ללא חובת ייחוס. הקבצים מסופקים כפי שהם, ללא אחריות.
