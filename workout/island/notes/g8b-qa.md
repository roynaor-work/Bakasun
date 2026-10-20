# G8b — בדיקת מעטפת ההשהיה

תאריך: 20.10.2026. ענף: `codex/g8b-pause`. בסיס: `origin/main` ב־`70239cd` (כולל משיכת main ומיזוגו מחדש לפני סיום).

## השינוי

- כרטיס ממורכז על רקע כהה; שורה יחידה של המשך, צליל ויציאה. המשך ירוק וגדול יותר, יציאה אדומה, אייקון הצליל משתנה בין פעיל למושתק. ללא טקסט גלוי או אייקון יציאה כפול; שמות נגישים נשארו.
- בזמן השהיה המעטפת מסתירה לחלוטין את פקדי המשחק ואת כפתורי הכותרת באמצעות `visibility:hidden`, כולל הצאצאים. הפקדים נשארים בפריסה כדי שמדידות שטח המשחק לא ישתנו.
- המעטפת אינה מחליפה עוד את `textContent` של כפתור ההשהיה. האייקונים שהמשחקים התקינו עליו נשמרים באותם צומתי DOM גם לאחר המשך.
- העיצוב החדש מוגבל לכרטיס ההשהיה; הסגנון של כיבוי אינו יכול להקטין את אייקון ההמשך.
- קוד המוצר שונה רק ב־`ui/game-shell.mjs` וב־`ui/game-shell.css`. אין שינוי ב־`minigames/*`, ב־`extensions/*`, ב־`DATA_VERSION` (`g9-20261020-1`), ב־`CURRENT_VERSION`, ב־`CHANGELOG.md` או ב־`QA.md`. לא נוסף משאב זמן ריצה חדש.

## השוואת פקדים

`workout/island/tests/g8b-browser.mjs` מריץ את חמשת המשחקים ב־844×390 וב־740×360. בכל תרחיש שלושה מחזורי השהיה/המשך: 10 תרחישים, 30 מחזורים.

נבדקים `getBoundingClientRect().toJSON()` וכל המאפיינים ב־`getComputedStyle`, גם עבור `::before` ו־`::after`, של מכולת הפקדים, כל צאצאיה וכפתור ההשהיה וצאצאיו. ההשוואה מדויקת, ללא סבילות מספרית, וכוללת פקדים שהיו מוסתרים מלכתחילה. נבדקים גם היעדר כפתורים וג'ויסטיק גלויים בהשהיה, `inert`, שימור תוכן כפתור ההשהיה, שלושת כפתורי הכרטיס, מרכוזו, מידות האייקונים ושני מצבי הצליל.

שעון הסימולציה נשלט ב־Playwright. אנימציות CSS מקוריות, כגון פעימת אייקון ההגשה בטניס, מוקפאות בבדיקה באמצעות Web Animations API ובאותו שלב לפני שתי המדידות; אין הזרקת CSS או שינוי עיצוב הפקדים. כך נמדדת השפעת ההשהיה עצמה, בלי הבדל טבעי בשלב האנימציה.

התוצאה: כל עשרת התרחישים עברו; כל המידות וכל הסגנונות שנבדקו חזרו זהים. נתונים ותקציר סגנונות: [verification.json](../verification/g8b/verification.json).

## צילומים

10 קבצים בלבד. בכל תמונה: השהיה משמאל, המשך מימין; כל חצי מצולם בגודל המקורי.

| משחק | 844×390 | 740×360 |
|---|---|---|
| כדורגל | [השוואה](../verification/g8b/soccer-844-pause-resume.webp) | [השוואה](../verification/g8b/soccer-740-pause-resume.webp) |
| טניס | [השוואה](../verification/g8b/tennis-844-pause-resume.webp) | [השוואה](../verification/g8b/tennis-740-pause-resume.webp) |
| קרב ימי | [השוואה](../verification/g8b/navalDuel-844-pause-resume.webp) | [השוואה](../verification/g8b/navalDuel-740-pause-resume.webp) |
| כיבוי | [השוואה](../verification/g8b/fireRescue-844-pause-resume.webp) | [השוואה](../verification/g8b/fireRescue-740-pause-resume.webp) |
| חלליות | [השוואה](../verification/g8b/alienDefense-844-pause-resume.webp) | [השוואה](../verification/g8b/alienDefense-740-pause-resume.webp) |

## בדיקות מלאות

- `node --test tests/*.mjs`: **0 כשלים**; 1,782 עברו, 38 דולגו, 1,820 בסך הכול. חמש בדיקות G8b החדשות עברו.
- `g8b-browser.mjs`: **עבר** בשני הגדלים, 30 מחזורי השהיה/המשך, 816 השוואות צמתים מלאות.
- `g8-browser.mjs`: **עבר**, כולל מסך מלא, ספירת כניסה, חזרה/המשך, מעבר בין חמשת המשחקים ומצבי denied/missing/installed/iOS מדומים; תקציבי ההורדה עברו.
- כל 29 הקבצים התואמים ל־`workout/island/tests/*-browser.mjs` הורצו ב־844×390 (G8b הורץ גם ב־740×360). 28 הסתיימו בקוד 0; `night-browser.mjs` הוא מודול עזר ללא תרחיש עצמאי. **נותר כשל ותיק אחד**, המפורט להלן. לכן דרישת 0 כשלים בכל בדיקות הדפדפן אינה מתקיימת בבסיס הנוכחי.

השרת היה שרת Python משורש המאגר על `127.0.0.1:8765`; לא נשאר שרת קודם על הפורט. השרת שמר על חסימת נתיבים מחוץ ל־`/workout/island/`, כמו שרת העזר המקורי. לקבצים שמקימים שרת Node פנימי הופעל מתאם ESM זמני מחוץ למאגר, ששינה רק את תוצאת `serveIsland` לכתובת שרת Python ול־`close` ריק. קוד התרחישים וה־assertions נשארו ללא שינוי. בדיקות G8 ותקציבי ההורדה הורצו ללא בדיקת דפדפן מקבילה.

תוצאות ניתנות לקריאה גם ב־[regression.json](../verification/g8b/regression.json).

| קובץ | תוצאה |
|---|---|
| `g2f-browser.mjs` | כשל קיים ב־main |
| `g2g-browser.mjs` | עבר |
| `g2h-browser.mjs` | עבר |
| `g2i-browser.mjs` | עבר |
| `g2j-browser.mjs` | עבר |
| `g2k-browser.mjs` | עבר |
| `g2l-browser.mjs` | עבר |
| `g2n-browser.mjs` | עבר |
| `g3b-browser.mjs` | עבר |
| `g3c-browser.mjs` | עבר |
| `g3d-browser.mjs` | עבר |
| `g3e-browser.mjs` | עבר |
| `g3f-browser.mjs` | עבר |
| `g3g-browser.mjs` | עבר |
| `g3h-browser.mjs` | עבר |
| `g4b-browser.mjs` | עבר |
| `g4c-browser.mjs` | עבר |
| `g4d-browser.mjs` | עבר |
| `g5-browser.mjs` | עבר |
| `g6-browser.mjs` | עבר |
| `g6b-browser.mjs` | עבר |
| `g6c-browser.mjs` | עבר |
| `g6d-browser.mjs` | עבר |
| `g7-browser.mjs` | עבר |
| `g8-browser.mjs` | עבר |
| `g8b-browser.mjs` | עבר |
| `night-browser.mjs` | מודול עזר — נטען בהצלחה |
| `task016-browser.mjs` | עבר |
| `task017-pilot-browser.mjs` | עבר |

### הכשל הקיים

`g2f-browser.mjs:34` נכשל ב־`assert.ok(m.enemyFleetHp<initial.enemyFleetHp)` אחרי ירי בקרב הימי. הכשל קורה לפני תרחיש ההשהיה, באותה שורה ובאותו תנאי גם בענף זה וגם בעותק נפרד ונקי של `origin/main` ב־`70239cd`, מול שרת Python נוסף על פורט 8766. אין כאן ייחוס של הכשל לשינויי G8b.

לא שונו המשחק או בדיקת G2f הוותיקה, בהתאם להגבלת הקבצים במשימה. שחזור: שרת Python משורש העותק הנקי, ואז `G2F_WIDTH=844 G2F_HEIGHT=390 ISLAND_URL=http://127.0.0.1:8766/workout/island/?dev=1 node workout/island/tests/g2f-browser.mjs`.

ההרצות ב־Chromium עם SwiftShader ומגע מדומה. לא בוצעה בדיקה בטלפון פיזי או ב־Safari אמיתי.
