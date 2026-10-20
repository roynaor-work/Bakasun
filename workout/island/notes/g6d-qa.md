# G6d — קרב ימי: כיוון, סוף תנועה, גרפיקה וצליל

20.10.2026. הענף `codex/g6d-naval` נפתח מ־`origin/main 995e285`, לאחר fetch. לא שונו `DATA_VERSION=g9-20261020-1` או `CURRENT_VERSION=15`.

## מה השתנה והיכן רואים

| בקשה | מימוש ואימות | צילום ב־844×390 |
|---|---|---|
| מעט קושי לכוון | `assist=.1`, `autoLead=.3` מחוברים למסלול המשחק; נדנוד yaw/elevation מוגדל ב־50%; מסלול מקוצר מ־.28 ל־.14 | [כוונת, מסלול וחץ רוח](../verification/g6d/03-reticle-wind.jpg) |
| רוח | וקטור דטרמיניסטי של כיוון ועוצמה לכל סבב ירי; חץ ושלושה סימוני עוצמה ללא מילים. סטייה מצטברת ריבועית בזמן המעוף, נשמרת בכל קליע חופף; אפשר לפצות ידנית. טורפדו ומטען עומק אינם מוסטים באוויר | [חץ הרוח](../verification/g6d/03-reticle-wind.jpg), [נחיתת הפספוס](../verification/g6d/06-miss-splash.jpg) |
| עזיבת ג׳ויסטיק | פנייה במסלול הזוויתי הקצר לעמדת צד לאורך .6 שניות, עם smoothstep; המצלמה חוזרת לכיוון האויב בנפרד מכיוון גוף הספינה. פקודת שיט חדשה מחזירה שליטה מיידית | [ספינה מהצד מול אויב](../verification/g6d/04-broadside-enemy.jpg) |
| ים, שמיים ואיים | גובה גלים ונורמלים מתעדכנים; shader עם נצנוץ וגלים קטנים; 24 חלקי עננים ואופק ערפילי, שלושה איים ו־45 עצים ב־InstancedMesh | [ים וגלים](../verification/g6d/01-sea-waves.jpg) |
| קצף ושובל | חלקיקי קצף בחרטום ורשימת שובל קצובה שמזדקנת מאחורי הירכתיים; בנויים מראש ומאוחדים בקריאת ציור | [שיט, קצף ושובל](../verification/g6d/02-bow-foam-wake.jpg) |
| פגיעה ופספוס | עשן כהה רך, אש מהבהבת בספינה פגועה, הבזק בקצה הקנה; פספוס יוצר עמוד מים גדול וטיפות | [פגיעה, אש ועשן](../verification/g6d/05-hit-fire-smoke.jpg), [התזה](../verification/g6d/06-miss-splash.jpg), [הבזק לוע](../verification/g6d/07-muzzle-flash.jpg) |
| צליל | מודול ימי נפרד `minigames/g6d-audio.mjs`: שמונה קובצי OGG מקומיים, תותח עמוק, שריקת פגז, התזה, מתכת, פיצוץ, טורפדו, גלים ומנוע שעוצמתו/מהירותו תלויות בשיט. טעינה/פתיחת AudioContext רק אחרי מחווה; pause/dispose ונשמר מתג `island.sound` | אימות ניגון, טעינה והשתקה ב־[דוח הדפדפן](../verification/g6d/844-verification.json); קול אינו ניתן להוכחה בצילום סטטי |
| נפילה למצב פשוט | המודל, חישוב הרוח, המצלמה והכוונת ממשיכים לפעול במצב Canvas הקיים | [Canvas](../verification/g6d/08-canvas-fallback.jpg) |

שמונה צילומים בסך הכול. צילומי הפגיעה והפספוס נוצרים מירי דרך מחוות המגע האמיתיות, עם פיצוי רוח ידני; לא מוזרקים חיים, פגיעה או אפקט לצילומים אלה.

## כיול

200 מפגשים חדשים בכל רמה, זרעים 0–199; זמני פתיחה `(seed % 9) × .7` שניות; ירייה רגילה אחת בכל מפגש, ללא ציוד וללא שדרוג כוח. אויבים נעים והפגיעה מוכרעת בהתנגשות אחרי זמן המעוף בפועל. זהו מדגם לחיצה קצרה, ולא מדידת שחקן אנושי.

| קושי קיים במשחק | פגיעות/יריות | אחוז |
|---|---|---|
| קל — שלב 1 | 88/200 | 44% |
| בינוני — שלב 5 | 86/200 | 43% |
| קשה — שלב 10 | 66/200 | 33% |

אין בורר קושי נוסף במשחק; דרגת הקושי היא השלב הקיים. שלב 5 עומד ביעד 35%–45% ובטווח הבדיקה 30%–50%. הסיוע הישן לירי קצר חזה תנועה מלאה, למרות שדות התצורה הישנים; כעת השדות אכן משפיעים.

בדיקות G6c הישנות עודכנו במפורש להתנהגות המבוקשת: סף 60% הקודם הוחלף בטווח הניתן לבדיקה בכל עשרת השלבים, ובדיקת הדפדפן בודקת נחיתה במקום להניח שכל לחיצה היא פגיעה. בבדיקות G2f נערכו רק מקרי הקרב הימי: ציפייה לנחיתה לפי רוח, ופיצוי רוח בירייה אחרונה כדי לשמר את בדיקת מיצוי התחמושת. הבדיקה החדשה G6d אוכפת בנפרד את יעד הביניים המחמיר של 200 יריות.

## מקורות הצלילים ורישיון לכל קובץ

`kenney.nl` חסום ב־403 בסביבת הבנייה. קובצי Kenney הורדו דרך מאגרי GitHub המכילים רישיון CC0 שאומת, ללא עקיפת חסימת האתר. תותח/פיצוץ/מנוע/טורפדו הומרו למונו 22,050Hz באיכות Vorbis 1, עד 2.5 שניות; מתכת נשמרה כמו במקור. בניגון נוספו שינויי קצב ומסנן נמוכים לתותח, לפיצוץ ולמנוע. שלושת קובצי האוויר/מים נוצרו מרעש מסונן, מעטפות ושכבות תדרים; סקריפט השחזור שמור במאגר ומוקדש ל־CC0. אין שימוש בצליל עם רישיון אחר.

| קובץ | בייטים | מקור | רישיון |
|---|---|---|---|
| `cannon.ogg` | 5,800 | [מקור CC0 ב־GitHub](https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/c094967fe930c57ddb376f67c75f8aa0296690b7/addons/kenney%20sci-fi%20sounds/low_frequency_explosion_000.ogg) | CC0 1.0 |
| `whistle.ogg` | 6,894 | [סינתזה מקורית בשכבות](../tests/g6d-audio-build.py), הקדשה ל־CC0 1.0 | CC0 1.0 |
| `splash.ogg` | 7,960 | [סינתזה מקורית בשכבות](../tests/g6d-audio-build.py), הקדשה ל־CC0 1.0 | CC0 1.0 |
| `metal.ogg` | 6,110 | [מקור CC0 ב־GitHub](https://raw.githubusercontent.com/Boyquotes/kenney-impact-sounds-for-godot/999dd1684873f8b020a3aa5b26e713da21688924/addons/kenney%20impact%20sounds/impact_metal_heavy_000.ogg) | CC0 1.0 |
| `explosion.ogg` | 6,456 | [מקור CC0 ב־GitHub](https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/c094967fe930c57ddb376f67c75f8aa0296690b7/addons/kenney%20sci-fi%20sounds/explosion_crunch_000.ogg) | CC0 1.0 |
| `torpedo.ogg` | 14,004 | [מקור CC0 ב־GitHub](https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/c094967fe930c57ddb376f67c75f8aa0296690b7/addons/kenney%20sci-fi%20sounds/thruster_fire_000.ogg) | CC0 1.0 |
| `waves.ogg` | 18,475 | [סינתזה מקורית בשכבות](../tests/g6d-audio-build.py), הקדשה ל־CC0 1.0 | CC0 1.0 |
| `engine.ogg` | 11,189 | [מקור CC0 ב־GitHub](https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/c094967fe930c57ddb376f67c75f8aa0296690b7/addons/kenney%20sci-fi%20sounds/space_engine_low_000.ogg) | CC0 1.0 |

סך קובצי הקול: **76,888 בייטים** מתוך 400,000 מותרים. [נוסח CC0](../assets/audio/g6d/LICENSE.txt). [רישיון חבילת Sci-Fi](https://github.com/Boyquotes/kenney-sci-fi-sounds-for-godot/blob/main/LICENSE), [רישיון Impact](https://github.com/Boyquotes/kenney-impact-sounds-for-godot/blob/main/LICENSE). החבילות המקוריות: [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds), [Impact Sounds](https://kenney.nl/assets/impact-sounds).

## אימות סופי

`node --test tests/*.mjs` — **1,788 בדיקות: 1,750 עברו, 38 דילוגים קיימים, 0 כשלים**. עשר בדיקות G6d החדשות עברו: 200 יריות ברמות 1/5/10, סיום פנייה בתוך שנייה, מעבר זוויות, שינוי רוח/נחיתה, פיצוי ידני, שימור רוח בקליעים חופפים, שימור טורפדו ותקציב קול. [סיכום יחידה וכיול](../verification/g6d/unit-results.json).

כל ארבע בדיקות הדפדפן של הקרב הימי עברו ב־844×390, ללא שגיאות קונסול וללא בקשות מחוץ ל־`/workout/island/`:

| סוויטה | תוצאה | מרב משולשים שנדגם | מרב קריאות ציור שנדגם | ראיה |
|---|---|---|---|---|
| `g6-browser.mjs` | עבר | 19,258 | 39 | [תוצאה](../verification/g6d/g6-regression.json) |
| `g6b-browser.mjs` | עבר | 18,492 | 31 | [תוצאה](../verification/g6d/g6b-regression.json) |
| `g6c-browser.mjs` | עבר | 19,452 | 47 | [תוצאה](../verification/g6d/g6c-regression.json) |
| `g6d-browser.mjs` | עבר | 19,470 | 48 | [תוצאה](../verification/g6d/844-verification.json) |

המרב שנדגם: **19,470 משולשים ו־48 קריאות ציור**, לעומת התקרה הקיימת 90,000/70. תוצאות דפדפן הרגרסיה נשמרו ללא צילומים נוספים; שמונת צילומי G6d הם הראיה החזותית השמורה. [חתימות קובצי המימוש](../verification/g6d/source-sha256.json).


מדדי WebGL הם מ־Chromium 151 / SwiftShader. מצב בדיקת העומס מפעיל את הבוס יחד עם צי של שלב 10 בעזרת הריגת אויב ביניים לצורך מדידה; זו אינה טענת ניצחון. ירידה ברזולוציה ו־Canvas הופעלו במפורש ונבדקו. הבדיקות אינן בדיקת טלפון פיזי, iOS, איכות שמיעה אנושית או FPS על חומרה ניידת.

לא שונו קבצי המעטפת, `sound.mjs`, `app.mjs`, `styles.css`, `press.mjs`, `buildings.json`, `CHANGELOG.md` או `QA.md`. התצורה השתנתה רק בתוך `minigames.navalDuel`. לא נוספו GLB או CSS, ולא נערכה שמירה או גרסת שחרור. לכל מודול/צליל חדש שנטען במשחק נוסף `?v=g9-20261020-1`.
