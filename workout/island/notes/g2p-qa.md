# G2p — חלליות: ממשק, טיל, תנועה וצלילים

ענף: `codex/g2p-aliens`. בסיס: `origin/main` — `1f05826` (20.10.2026).

בוצע fetch ו־merge של `origin/main` לאחר היישום: `Already up to date`. גרסאות הנתונים והשמירה נשמרו.

## מה השתנה ומה רואים

| סעיף | התנהגות | צילום ב־verification/g2p |
| --- | --- | --- |
| תחילת שלב 1 | שורת המבנה מתחילה בחלק העליון; כל מרכזי החייזרים של שלב 1 ברבע העליון לאחר הכניסה. מרחק התחלתי מינימלי של 45% מגובה הזירה מהשחקן בכל עשרת השלבים. | [01-stage-one.webp](../verification/g2p/01-stage-one.webp) |
| פקדים | ירי אדום 88px עם ברק; טיל כתום 76px עם גוף, חלון, כנפיים, להבה ותג תחמושת; ג׳ויסטיק קבוע וגלוי, גם אחרי שחרור. שתי הידיים נתמכות. | [02-fire-missile-controls.webp](../verification/g2p/02-fire-missile-controls.webp) |
| טיל | אין כוונת, צלב, עיגול יעד או השהיית כיוון. יוצא מיד ממרכז הספינה, טס קדימה בקו ישר עם אש ועשן; תזוזת הספינה אינה משנה את המסלול. | [03-missile-flight.webp](../verification/g2p/03-missile-flight.webp) |
| פגיעה | בדיקת מקטע מוצאת את החייזר הראשון במסלול, בלי תלות בסדר הרשימה או באורך הפריים. במסלול ריק: פיצוץ ב־y=40% מלמעלה, כלומר בגובה 60% מעל תחתית הזירה. נזק אזורי סביב הפגיעה לפי יעד 30% הקיים, עם עמידות החייזרים הכבדים. רק במוקד הפגיעה יש הבזק וגל הדף, והגודל החזותי מוגבל. | [04-local-explosion.webp](../verification/g2p/04-local-explosion.webp) |
| תנועה | כניסה בקשת עם האצה והאטה רציפות, תנודה משותפת ועדינה וירידה איטית; אין ירידת מדרגה בקצה המסך. צוללים מהשורה הקדמית יורדים בקשת וחוזרים למבנה הנע. | [05-curved-entry.webp](../verification/g2p/05-curved-entry.webp) |
| אנכי | ב־390×844 נשאר מנגנון הסיבוב הקיים: מוצג סמל סיבוב והמשחק/הצלילים מושהים. הפקדים מכוסים בשכבת הסיבוב, אך מיקומיהם נבדקים בתוך גבולות המסך; לאחר מעבר לרוחב ממשיכים משחק ובודקים אותם במגע. | [06-portrait-rotation-guard.webp](../verification/g2p/06-portrait-rotation-guard.webp) |

אין מלל על זירת הקרב; מספר הטילים הוא הטקסט היחיד. צילום אינו יכול להוכיח צליל או רציפות תנועה, ולכן אלה נבדקים גם דרך דגימות אודיו, מדידות פריימים ובדיקות אוטומטיות.

## צלילים ומקורות

כל שבעת הקבצים הוחלפו בתערובות חדשות: דגימות Kenney הקיימות תחת CC0, סינון נמוכים, מעטפות כניסה/דעיכה, הרמוניות ורעש מסונן. שיגור כולל שריקה יורדת, והפיצוץ העמוק נשען על שכבה נמוכה. הירייה קצרה והשקטה ביותר גם בשיא וגם ב־RMS. אין מוזיקת רקע.

המקור נעול ל־commit `185a77e7c675341ad8d0805b3bbe4f20427c2481`. [רישיון המקור](https://github.com/Boyquotes/kenney-digital-audio-for-godot/blob/185a77e7c675341ad8d0805b3bbe4f20427c2481/LICENSE), [עותק CC0 המקומי](../assets/audio/g2m/LICENSE.txt). גם השכבות המקוריות וקוד הסינתזה מוקדשים ל־CC0; אין מקור צד שלישי נוסף.

| קובץ | שימוש | משך | בתים | peak / RMS לפני gain ראשי | מקור ורישיון |
| --- | --- | --- | --- | --- | --- |
| `shot.ogg` | ירייה | 0.105 שנ׳ | 3,960 | 0.070 / 0.01947 | [Kenney CC0](https://github.com/Boyquotes/kenney-digital-audio-for-godot/blob/185a77e7c675341ad8d0805b3bbe4f20427c2481/addons/kenney%20digital%20audio/laser_1.ogg) |
| `hit.ogg` | פגיעה | 0.170 שנ׳ | 4,383 | 0.145 / 0.03757 | [Kenney CC0](https://github.com/Boyquotes/kenney-digital-audio-for-godot/blob/185a77e7c675341ad8d0805b3bbe4f20427c2481/addons/kenney%20digital%20audio/space_trash_1.ogg) |
| `explosion.ogg` | פיצוץ חייזר | 0.380 שנ׳ | 5,419 | 0.210 / 0.04413 | [Kenney CC0](https://github.com/Boyquotes/kenney-digital-audio-for-godot/blob/185a77e7c675341ad8d0805b3bbe4f20427c2481/addons/kenney%20digital%20audio/space_trash_3.ogg) |
| `missileLaunch.ogg` | שיגור ושריקה | 0.600 שנ׳ | 6,514 | 0.220 / 0.03113 | [Kenney CC0](https://github.com/Boyquotes/kenney-digital-audio-for-godot/blob/185a77e7c675341ad8d0805b3bbe4f20427c2481/addons/kenney%20digital%20audio/phase_jump_1.ogg) |
| `missileExplosion.ogg` | פיצוץ טיל עמוק | 0.800 שנ׳ | 7,451 | 0.360 / 0.06376 | [Kenney CC0](https://github.com/Boyquotes/kenney-digital-audio-for-godot/blob/185a77e7c675341ad8d0805b3bbe4f20427c2481/addons/kenney%20digital%20audio/space_trash_4.ogg) |
| `bonus.ogg` | בונוס | 0.420 שנ׳ | 5,194 | 0.195 / 0.02588 | [Kenney CC0](https://github.com/Boyquotes/kenney-digital-audio-for-godot/blob/185a77e7c675341ad8d0805b3bbe4f20427c2481/addons/kenney%20digital%20audio/power_up_7.ogg) |
| `stageEnd.ogg` | סוף שלב | 0.920 שנ׳ | 7,242 | 0.235 / 0.02646 | [Kenney CC0](https://github.com/Boyquotes/kenney-digital-audio-for-godot/blob/185a77e7c675341ad8d0805b3bbe4f20427c2481/addons/kenney%20digital%20audio/three_tone_1.ogg) |

סך קובצי OGG: **40,163 בתים**, פחות מ־400KB. Gain ראשי: 0.30. הפסקה/השתקה/יציאה עוצרות מקורות ומשחררות את הגרף. אם קובץ או codec אינו זמין, יש סינתזה משלוש שכבות עם מעטפות (שתי הרמוניות ורעש מסונן), לא צפצוף יחיד. בדיקת יחידה מדמה כשל בכל שבעת הקבצים.

מקור בנייה: [g2p-soften.py](../assets/audio/g2m/g2p-soften.py), נתוני provenance ועוצמות: [sources.json](../assets/audio/g2m/sources.json). לשחזור מעבירים לסקריפט תיקייה עם שבע דגימות G2m המקוריות מה־commit שלפני G2p.

## בדיקות

- `tests/island-g2p.test.mjs`: שמונה בדיקות חדשות — אפס ציור יעד במנוחה ובטיסה; חיתוך ראשון; גובה פיצוץ; מרחק מבנה; כניסה כולל הפריים הראשון וההתיישבות; צלילה וחזרה; תקציב ורישיון אודיו; fallback/השתקה/פינוי.
- `workout/island/tests/g2p-browser.mjs`: Chromium/SwiftShader, מגע מדומה, 844×390 וגם 390×844; תנועה וירי בו־זמנית, ספירת תחמושת, טיל ישר, פיצוץ, שבע דגימות מפוענחות, השתקה, סיבוב ו־Canvas חלופי. [תוצאות](../verification/g2p/verification.json).
- בדיקות חלליות ישנות עודכנו להסרת כוונת/המתנה ולג׳ויסטיק קבוע. ציפיות הבוט הדטרמיניסטי עודכנו לתנועה החדשה; בדיקת סדר דפוסי השלבים מבודדת עם כוח 2 כדי למדוד מעבר בין גלים. בדיקות הרישיונות, ההתנגשויות, התחמושת, הפיזור, הקושי בשלבים הראשונים והתגמולים נשמרו.
- `node --test tests/*.mjs`: **1,843 עברו, 0 כשלו, 38 דולגו** (1,881 בדיקות; הדילוגים שייכים לסוויטה הקיימת). [סיכום](../verification/g2p/unit-tests.json), [לוג מלא דחוס](../verification/g2p/unit-tests.log.gz). בתחילה מגבלת sandbox חסמה שני `spawnSync`; ההרצה הסופית עם הרשאות סביבת הריצה עברה ללא שינוי בקוד שלהן.
- בוט שלב 1: 10/10 זרעים ניצחו תוך 38.6–47.6 שניות; בחלק מההרצות נותרו 3–4 מתוך 5 חיים.
- כל **33** קובצי `*-browser.mjs` הורצו וסיימו עם **exit 0** (32 תרחישי דפדפן ומודול העזר `night-browser.mjs`); כולם נבדקו ב־844×390 מול שרת Python חדש על `127.0.0.1:8765` משורש המאגר. [סיכום הריצה המלאה](../verification/g2p/browser-suite.json), [לוגים דחוסים](../verification/g2p/browser-suite.log.gz).
- `g4d-browser.mjs` עבר את כל בדיקות המשחק אך בהרצה הראשונה נכשל ב־rename של הדוח: עם `G4E_WIDTH=844`, העזר יוצר `844-verification.json` ואילו הסקריפט מצפה ל־`verification.json`. בהרצה החוזרת נוצר hard link בין שני שמות **קובצי הפלט הזמניים**; הסקריפט המקורי הורץ שוב, עבר והחזיר exit 0. אומת שהדוח הסופי מצביע לאותו inode ושאין שגיאות בדפדפן. קוד הטניס לא נערך. כל ניסיונות ההרצה נשמרו בסיכום.

לא בוצעה האזנה דרך רמקול פיזי של טלפון או מדידת FPS במכשיר פיזי. בדיקות הדפדפן אינן מחליפות התרשמות שמיעתית של הבעלים.

## גבולות שינוי

שונו קוד/בדיקות/נכסי חלליות בלבד, והסעיף `minigames.alienDefense` ב־config. CSS חדש ב־`minigames/g2p-alien.css` ונטען עם `?v=g9-20261020-1`. לא שונו קובצי המעטפת המשותפים, `sound.mjs`, גרסאות הנתונים/השמירה, CHANGELOG או QA, ולא הוסר GLB.
