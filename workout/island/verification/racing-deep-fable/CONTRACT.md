# מרוצי האי: סבב עומק (racing-deep-fable), חוזה עבודה לסוכני המשנה

נכתב 11/11/2026 על ידי סשן Fable המוביל (session_018LH5qWju298qpgb8f5Fd9g), סשן ילד של "ריכוז עבודה". הוראת רועי: "רוץ עכשיו. אני רוצה גרסה טובה ומלאה להכל." היעד: מרוצי האי ברמה של משחק פורמולה 1 מלא לטלפון (רועי הגדיר את v18 כ-60% מהדרך וביקש 80% ומעלה).

## ענפים
- ענף האינטגרציה: `claude/racing-deep-fable` (מ-main אחרי v20, כולל PR #390 סביבה, #391 מסלולי v2, #394 שדה 10 מכוניות ולוח דירוג, #396 התהפכות והילוכים).
- כל סוכן עובד בענף משלו מתוך ענף האינטגרציה: `claude/racing-deep-m2` (מסלולים, התנהגות מתחרים, מראה), `claude/racing-deep-m3` (קול, הילוכים, ERS, שליטה), `claude/racing-deep-m4` (ליגה, הצעת שדרוג, שידור). דוחפים את הענף; הסשן המוביל ממזג לאינטגרציה. לא פותחים PR ולא ממזגים ל-main.

## כללים קשיחים (רועי)
1. לא נוגעים ב-`release.json`, ב-`release.mjs`, בתגי `?v=` בייבואים, ב-`CHANGELOG.md` וב-`ops/CONTROL.md`. העלאת גרסה נעשית באיחוד המרכזי. קובץ חדש מיובא עם אותו תג `?v=island-v2-20261107-8` כמו הקבצים הקיימים.
2. כל שינוי התנהגות מאחורי דגל כיבוי בכתובת (`?racingX=0` מחזיר למצב הקודם), וכל שינוי בשמירה תוספתי בלבד: גרסת השמירה (19) לא עולה, שדה חדש מתווסף עם ברירת מחדל, קריאה של שמירה ישנה לא נכשלת. אין מחיקת נתונים.
3. האפליקציה לילדים בני 7 ומעלה. טקסט למשתמש בעברית בלבד, בלי סימני קריאה, בלי טון מאיים, בלי מותגים (לא שמות קבוצות או נהגים אמיתיים של פורמולה 1: צבעי קבוצות ושמות משלנו).
4. בלי הורדות מהרשת בזמן ריצה ובלי קבצים חיצוניים חדשים גדולים; נכסי Codex הקיימים ב-`workout/island/design/racing-*` ו-`assets/racing-*` מותר לחבר. נכס שחסר: לא מציירים בקוד תחליף זמני, אלא רושמים בדוח "משימת Codex" מוכנה להדבקה (ultra למודלים, extra high למרקמים/אפקטים, high לצלילים).
5. הוכחה לכל סעיף: לא "תוקן" אלא מדידה (כלי ב-`workout/island/tools/`), בדיקת יחידה, ובדיקה בדפדפן אמיתי עם מגע ב-844×390 (Playwright, Chromium ב-`/opt/pw-browsers` או `/usr/bin/chromium`, `--use-gl=angle --use-angle=swiftshader`, `hasTouch:true`; תבנית: `workout/island/tests/racing-league-browser.mjs` ו-`night-browser.mjs`; ביצועים: `node workout/island/tools/perf-racing.mjs 20 844x390 '<query>'`). צילומים נשמרים ב-`workout/island/verification/racing-deep-fable/<m>/shots/`.
6. בדיקות: `node --test tests/island-racing*.mjs` חייב לעבור בכל קומיט; בסוף `npm test` מלא (כ-3,600 בדיקות, כמה דקות). בדיקה חדשה לכל כלל חדש, רצוי כזו שנכשלת על הקוד הישן.
7. דוח לכל אבן דרך: `workout/island/verification/racing-deep-fable/M<n>-REPORT.md` בעברית, טבלה עם העמודות: הערה/יעד | הוכחה (כלי, בדיקה, צילום) | תוצאה (מספרים לפני ואחרי). בסוף הדוח: רשימת דגלים, מה לא נעשה ולמה, ומה לבדוק בטלפון.
8. קומיטים בעברית, קטנים, עם שתי שורות הסיום:
   `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` ו-`Claude-Session: https://claude.ai/code/session_018LH5qWju298qpgb8f5Fd9g`.
9. מודל זיכרון ובדיקות הדלסיות: המודל (`racing-physics.mjs`) בלי DOM ובלי WebGL; כל כלי מדידה מריץ אותו ב-node.

## בעלות על קבצים (כדי שהמיזוג יהיה פשוט)
| סוכן | קבצים שלו | מותר לגעת בזהירות (שורות בודדות) |
|---|---|---|
| M2 מסלולים, מתחרים, מראה | `racing-tracks.mjs`, `racing-physics.mjs` (הכול חוץ מבלוק תיבת ההילוכים `if(engineModel){...}` ובלוק ה-ERS), `racing-view.mjs`, `racing-car-look.mjs`, `racing-f1.mjs`, `racing-env-v2.mjs`, `racing-scenery.mjs`, `racing-roadside.mjs`, `tools/racing-grid-measure.mjs`, `tools/racing-speedprofile.mjs`, `tools/racing-topspeed.mjs`, `tests/island-racing-tracks*.mjs`, `workout/island/tests/racing-grid.test.mjs` | `racing-session.mjs` (רק אירועים חדשים), `racing-league-core.mjs` (רק מספר הקפות לעונה אם משך המרוץ משתנה) |
| M3 קול, הילוכים, ERS, שליטה | `racing-audio.mjs`, `racing-samples.mjs`, `racing-unlock.mjs`, `racing-controls.mjs`, `racing-speedometer.mjs`, `racing-physics.mjs` (רק בלוק תיבת ההילוכים וה-ERS וקבועי GEARS/ERS), `racing.css` (רק מד ההילוכים ו-ERS), `tools/racing-engine-measure.mjs`, `tools/racing-ers-measure.mjs`, `tools/racing-shift-audio.mjs`, `tools/racing-topspeed-measure.mjs`, `workout/island/tests/racing-engine|ers|samples|sound-start|controls|wheel.test.mjs` | `racing-session.mjs` (רק שורות הקול והחיווי) |
| M4 ליגה, הצעת שדרוג, שידור | `racing-league-core.mjs`, `racing-league.mjs`, `racing-league-result.mjs`, `ui/racing-league.mjs`, `ui/racing-league.css`, `ui/upgrade-offer*.mjs`, `racing-tower.mjs` (לוח הדירוג החי: להרחיב לשידור מלא), קובץ חדש `racing-broadcast.mjs` (רמזורי זינוק, פערים, מסך פתיחה של המרוץ, פודיום), `racing.css` (רק חלקי השידור והליגה), `tools/racing-league-sim.mjs`, `workout/island/tests/racing-league*.mjs` | `racing-session.mjs` (רק חיבור השידור ו-`leagueOrder`), `engine/persistence.mjs` (תוספתי בלבד) |

מי שחייב לגעת בקובץ של סוכן אחר: שינוי מינימלי, הערה בקומיט, ורישום בדוח. הסשן המוביל פותר התנגשויות.

## הרף המדיד של הגרסה המלאה (מהסשן המרכזי)
- מסלולים: 6 מסלולים עם פניות ובלימות, קו ישר אחד ארוך לכל היותר; בכל מסלול לפחות 40% מזמן ההקפה מתחת ל-85% מהמהירות המרבית ולא יותר מ-25% מעל 95% (נהג מיומן, `tools/racing-topspeed.mjs` / `racing-speedprofile.mjs`); מרוץ ליגה נגמר לפני תקרת 295 שניות.
- 8 עד 12 מכוניות עם התנהגות תחרות: עקיפות, שמירה על קו, התנגשויות, התהפכות ושחזור (שחקן ומחשב), בלי פקקים ובלי מכוניות שנתקעות זו בזו.
- שידור בסגנון פורמולה 1: לוח דירוג חי עם פערים בשניות, מספרים וצבעי קבוצות, זינוק עם רמזורים, פיטס במסלול.
- ERS עם חיווי; קול מלא (מנוע, הילוכים, צמיגים, רוח; בלי סירנת פתיחה), בלי רעש בהחלפה, סאונד מתחילת המרוץ בשני מצבי ההאצה (ברירת מחדל ידנית), בלי צליל "תקוע" במהירות שיא.
- ליגה: עונות, חנות שדרוגים, הצעת שדרוג בסוף שלב.
- 30fps בטלפון בינוני: מדידה בתוכנה (SwiftShader יחסי) ודגל מכשיר חלש (`ctx.lite`, `?quality=low`) שמוריד מכוניות ואפקטים.
