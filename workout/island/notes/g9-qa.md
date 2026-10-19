# G9 · סגירת סבב: גרסה, יומנים וספריית דגמים

תאריך שחרור: **2026-10-20**. תיעוד הריצה: `2026-10-19T23:21:30+03:00` (Asia/Jerusalem). בסיס `origin/main 5d0480fa8a4f1fedb9659aff8d19319e33b527ae`; ענף `codex/g9-release`.

DATA_VERSION הוא `g9-20261020-1`; CURRENT_VERSION נשאר **15**. עודכנו כל קישורי הגרסה והציפיות בבדיקות. חיפוש המחרוזת הישנה ב־workout/island וב־tests מחזיר רק את ההיסטוריה ב־CHANGELOG.md וב־QA.md. דוחות המקור נשמרו: גרסת הבסיס ההיסטורית מכונה בהם `G2j (QA.md)`, עם פירוש מדויק ב־QA.md, ואינה מוצגת כהרצת G9.

## תוצאות בדיקות

`node --test tests/*.mjs`: **1,778 בדיקות, 1,740 עברו, 38 דולגו, 0 כשלים**, קוד יציאה 0. הדילוגים הקיימים נשמרו; נוספה בדיקת ספרייה אחת. זמן הריצה 163.89 שניות.

כל קובצי `workout/island/tests/*-browser.mjs` הורצו ב־844×390. לכל קובץ הוגדרו `<TAG>_WIDTH=844 <TAG>_HEIGHT=390`; בפיילוט התג הוא `TASK017`. שרת משורש המאגר רץ ב־`127.0.0.1:8765` עבור task016, task017-pilot וגם G2f/G2g. יתר התרחישים משתמשים ב־serveIsland.

סביבה: Node v24.19.0, Chromium 151.0.7922.173 / ANGLE SwiftShader, ‏`PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright`, ‏`CHROMIUM_PATH=/usr/bin/chromium`. ריצת Node וסדרת G8 הורצו לצד בדיקות הדפדפן, שהושלמו בשני תורים מקבילים; הזמנים הם זמן תסריט בענן ואינם מדידת FPS בטלפון.

| קובץ | משתני גודל | גודל | קוד יציאה | שניות |
|---|---|---|---:|---:|
| `g2f-browser.mjs` | `G2F_WIDTH` / `G2F_HEIGHT` | 844×390 | 0 | 147.65 |
| `g2g-browser.mjs` | `G2G_WIDTH` / `G2G_HEIGHT` | 844×390 | 0 | 162.59 |
| `g2h-browser.mjs` | `G2H_WIDTH` / `G2H_HEIGHT` | 844×390 | 0 | 46.20 |
| `g2i-browser.mjs` | `G2I_WIDTH` / `G2I_HEIGHT` | 844×390 | 0 | 35.78 |
| `g2j-browser.mjs` | `G2J_WIDTH` / `G2J_HEIGHT` | 844×390 | 0 | 71.05 |
| `g2k-browser.mjs` | `G2K_WIDTH` / `G2K_HEIGHT` | 844×390 | 0 | 118.78 |
| `g2l-browser.mjs` | `G2L_WIDTH` / `G2L_HEIGHT` | 844×390 | 0 | 188.43 |
| `g3b-browser.mjs` | `G3B_WIDTH` / `G3B_HEIGHT` | 844×390 | 0 | 197.83 |
| `g3c-browser.mjs` | `G3C_WIDTH` / `G3C_HEIGHT` | 844×390 | 0 | 169.81 |
| `g3d-browser.mjs` | `G3D_WIDTH` / `G3D_HEIGHT` | 844×390 | 0 | 228.45 |
| `g3e-browser.mjs` | `G3E_WIDTH` / `G3E_HEIGHT` | 844×390 | 0 | 99.65 |
| `g3f-browser.mjs` | `G3F_WIDTH` / `G3F_HEIGHT` | 844×390 | 0 | 183.05 |
| `g3g-browser.mjs` | `G3G_WIDTH` / `G3G_HEIGHT` | 844×390 | 0 | 95.34 |
| `g4b-browser.mjs` | `G4B_WIDTH` / `G4B_HEIGHT` | 844×390 | 0 | 49.67 |
| `g4c-browser.mjs` | `G4C_WIDTH` / `G4C_HEIGHT` | 844×390 | 0 | 37.89 |
| `g4d-browser.mjs` | `G4D_WIDTH` / `G4D_HEIGHT` | 844×390 | 0 | 410.53 |
| `g5-browser.mjs` | `G5_WIDTH` / `G5_HEIGHT` | 844×390 | 0 | 355.11 |
| `g6-browser.mjs` | `G6_WIDTH` / `G6_HEIGHT` | 844×390 | 0 | 29.41 |
| `g6b-browser.mjs` | `G6B_WIDTH` / `G6B_HEIGHT` | 844×390 | 0 | 22.89 |
| `g6c-browser.mjs` | `G6C_WIDTH` / `G6C_HEIGHT` | 844×390 | 0 | 97.71 |
| `g7-browser.mjs` | `G7_WIDTH` / `G7_HEIGHT` | 844×390 | 0 | 109.50 |
| `g8-browser.mjs` | `G8_WIDTH` / `G8_HEIGHT` | 844×390 | 0 | 180.41 |
| `night-browser.mjs` | `NIGHT_WIDTH` / `NIGHT_HEIGHT` | 844×390 | 0 | 0.68 |
| `task016-browser.mjs` | `TASK016_WIDTH` / `TASK016_HEIGHT` | 844×390 | 0 | 65.96 |
| `task017-pilot-browser.mjs` | `TASK017_WIDTH` / `TASK017_HEIGHT` | 844×390 | 0 | 34.59 |

`night-browser.mjs` הוא מודול עזר: ריצה ישירה שלו מאמתת טעינה בלבד. התרחישים שמשתמשים בו נבדקו בנפרד בטבלה.

## חמש הרצות G8 ברצף

בכל הרצה נבדקו חמשת המשחקים, כולל סיבוב לאורך וחזרה לרוחב בטניס. `rotate` משתמש ב־`page.waitForFunction` על `data-orientation-blocked`, עם `timeout:5000` ו־`polling:50` בזמן אמת, ואחר כך צעד שעון מדומה של 32ms. התנהגות המעטפת והמשחק נשמרה.

| הרצה | גודל | קוד יציאה | שניות | דוח |
|---|---|---:|---:|---|
| 1 | 844×390 | 0 | 180.41 | [JSON gzip](../verification/g9/g8-1-verification.json.gz) |
| 2 | 844×390 | 0 | 170.42 | [JSON gzip](../verification/g9/g8-2-verification.json.gz) |
| 3 | 844×390 | 0 | 177.52 | [JSON gzip](../verification/g9/g8-3-verification.json.gz) |
| 4 | 844×390 | 0 | 254.22 | [JSON gzip](../verification/g9/g8-4-verification.json.gz) |
| 5 | 844×390 | 0 | 229.78 | [JSON gzip](../verification/g9/g8-5-verification.json.gz) |

## הורדה קרה בחמש הרצות G8

כל משחק נמדד בהקשר דפדפן חדש, אחרי טעינת עיר חדשה. נספרו גופי התשובות וכותרות HTTP ללא דחיסה/מטמון בשרת המקומי. להלן המקסימום לכל משחק בכל חמש ההרצות, מול תקציבי ה־config הקיימים: 8,000,000 בתים לעיר ו־6,000,000 לתוספת משחק.

| משחק | עיר — בתים | תוספת משחק — בתים |
|---|---:|---:|
| `soccer` | 5,827,795 | 1,475,577 |
| `navalDuel` | 5,827,795 | 301,292 |
| `tennis` | 5,827,795 | 2,993,043 |
| `fireRescue` | 5,827,795 | 3,300,725 |
| `alienDefense` | 5,827,795 | 3,661,645 |

## ספריית הדגמים וגבולות השינוי

27 קובצי GLB שוחזרו ללא שינוי מהמקור `fa3b133880234a0d88d0226b61db011a0dfdb30b` אל `workout/island-library/models/`: **11,699,888 בתים**. הגדלים וה־SHA256 נוצרו מבתי קומיט המקור ומתועדים ב־[README](../../island-library/README.md). בדיקת `tests/island-library.test.mjs` מאמתת שכל קובץ מכוסה בטבלה וזהה לחתימה ולגודל המקוריים. נבדקה גם זהות בייטים ישירות מול `git show` לכל 27 הקבצים.

הספרייה מחוץ לנתיב המשחק, ואין אליה הפניות ב־config או ב־manifest. כל חמש הרצות G8 ממשיכות לאמת שאין בקשות מחוץ לאי ושעיר ותוספת משחק עומדות בתקציבים הקיימים. קובצי הדגמים הפעילים, vendor, ה־config, המניפסט וטקסטי המוצר זהים בבייטים ל־main. לאחר נטרול החלפת הגרסה, כל קובצי קוד המשחק שהשתנו זהים ל־main.

נוספה רשומת CHANGELOG לכל שמונה משימות הסבב וכן רשומת שחרור G9. תוצאות המקור והפערים מכל דוח מרוכזים ב־[QA.md](../QA.md); דוחות notes נשמרו. אין שינוי בסכימת השמירה, בפיזיקה, בדגמים או בתקציב.

[תוצאות מובנות, פקודות וחתימות](../verification/g9/results.json). דוחות G8 ולוגים נשמרים ב־gzip ללא אובדן; SHA256 ב־results.json הוא של התוכן לפני דחיסה. תוצרי צילומים ודוחות היסטוריים שהבדיקות כתבו מחדש הוחזרו לגרסת הבסיס, והראיות החדשות מרוכזות ב־verification/g9.

## פערים שנותרו

אין בדיקת מכשיר Android/iPhone פיזי, Safari, התקנה אמיתית ממסך הבית, נעילת כיוון חומרתית או הבטחת FPS. בדיקות המצבים החלופיים וההתקנה משתמשות בהזרקה. פערי המשחקים והמחקר נשארים כפי שתועדו בסעיף הסבב ב־QA.md; G9 אינה משנה אותם.
