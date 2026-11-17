# ביקורת שימושיות לילד בן 7 — האי והמשחקים

17.11.2026 · ענף `codex/kid-ux-audit-v1` · מקור שנבדק: `43b27dc235387e3cb737aee9558cdf9d5fd5a262` · גרסה `island-v2-20261107-15`.

**40 ממצאים מתועדים, 441 צילומי מסך.** הביקורת בוצעה בממשק האי ובעשרת משחקיו, בחלון טלפון לרוחב בגודל **844×390 פיקסלי CSS**, ביחס פיקסלים 1. קובצי המוצר הקיימים לא נערכו.

יש לתקן תחילה את ההדרכה ללא קריאה ואת כפתור שמיעת ההוראות, ואחריהם יעדי כניסה, טקסט קטן וניגודיות. יציאה מהמשחקים קיימת; הקושי הוא בעיקר לגלות אותה. זו ביקורת מומחה עם אוטומציה, ולא מחקר עם ילד או בדיקת מכשיר פיזי.

## אופן הבדיקה והגבולות

- Chromium נייד מדומה, עברית וכיוון ימין־לשמאל, אזור זמן ירושלים. כל נגיעה, החזקה וגרירה נוצרה באמצעות CDP; לא נעשה שימוש בלחיצות עכבר או בלחיצות כפויות. נבדק גם מגע בשתי אצבעות.
- נמדדו מלבני היעדים, שטח נראה לאחר חיתוך, פגיעה במרכז, רווחים, גופנים, צבעים, גלילה ובקשות צליל/דיבור. מלבן קטן של checkbox אינו מוכרז אוטומטית כליקוי אם גם התווית מפעילה אותו.
- חלק מהניווט והכנת המצבים בוצע דרך API הפיתוח. הסקריפט מנסה גלילת מגע; מיקום מחדש דרך scrollIntoView לאחר כישלון איסוף מסומן ביומן כהכנת צילום, ואינו נחשב הוכחה שגלילת משתמש הצליחה.
- רף יעד הלחיצה המבוקש הוא 44×44. רווח 8 פיקסלים וגופן 14–18 הם המלצות מותאמות לילד, ולא ספי WCAG מחייבים. לטקסט רגיל נבדק יחס 4.5:1; רקעים שקופים וגרדיאנטים מחייבים בדיקה חזותית נוספת.
- צילומי המצב הראשוני משתמשים בברירת המחדל של האפליקציה. לאחר מכן הוכנה שמירה מקומית בדיונית בגיל 7 עם מבנים פתוחים. צילומי תוצאה, התקדמות פתוחה, משאית ליד דלת והאצת מודל מסומנים כנתוני בדיקה; אינם הוכחת ניצחון, קושי מתאים או יכולת של ילד.
- בחלק מצילומי התפריטים הוקפאה אנימציית הרקע התלת־ממדי בלבד, במפה וברקע תפריטי החזירים, כדי לקצר צילום סטטי. מדידות המשוב נעשו בהרצה נפרדת, עם מנוע רגיל, ללא הקפאה ובדפדפן יחיד. הרינדור בתוכנה ולכן התוצאות אינן זמני תגובה של טלפון.
- רדיוס האגודל המשוער הוא 32 פיקסלים סביב נקודת המגע. זו בדיקת חפיפה גאומטרית; אי אפשר לאשר גודל אצבע, אחיזה, השתקפות שמש או עוצמת שמע פיזית מתוך צילום.
- מדיניות אבטחת התוכן נשמרה. Service Workers נחסמו בהקשר הזמני; נבדק מראה פאנל ההורדה, לא אמינות התקנה או משחק ללא רשת. לא נשלחו נתוני ילד לשירות חיצוני.
- הכיסוי הוא של תבניות המסך, התפריטים והמצבים המתועדים להלן. לא בוצע מעבר בכל 30 שלבים בכל משחק, בכל מזג אוויר ובכל הסתעפות אקראית. לא נכללו משחקי אפליקציית האימון שמחוץ לתיקיית האי.

## ממצאים לפי משחק ומסך

חומרה: **P1** — לטפל ראשון; **P2** — קושי חוזר; **P3** — ליטוש. הערכות הבנה ואגודל מסומנות בנפרד ממדידות בפועל.

| מזהה | משחק ומסך | ליקוי והראיה | צילום | חומרה | תיקון מוצע |
|---|---|---|---|---|---|
| KUX-001 | ספריית המשחקים<br>ספריית המשחקים | כל עשרת כפתורי הכניסה נמוכים מהרף — עשרת כפתורי הכניסה נמדדו 132×34 פיקסלי CSS. כל הכרטיס אינו יעד חלופי: הפעולה מחוברת לכפתור שבתוכו. ההקטנה חלה דווקא בטלפון לרוחב. | [games-library](screenshots/games-library.png) | P2 | גובה פעיל 48 לפחות; אפשר להפוך גם את הכרטיס ליעד כניסה יחיד וברור. |
| KUX-002 | משותף למשחקים<br>הספרייה ומסך הבית | הסגירה והצליל במסכי הבית קטנים — במראה הכהה של הספרייה ומסכי הבית הסגירה היא 40×40 והצליל 64.61×40. במסכי המשחק עצמם כפתורי ההשהיה גדולים יותר. | [games-library](screenshots/games-library.png)<br>[soccer-home](screenshots/soccer-home.png)<br>[tennis-home](screenshots/tennis-home.png) | P2 | להחיל מינימום 48×48 על רכיבי המסגרת גם במצב לרוחב. |
| KUX-003 | ספריית המשחקים<br>ספריית המשחקים | שמות המשחקים קטנים וצפופים — שמות המשחקים וכפתורי הכניסה הם 12 פיקסלים, תג חדש הוא 11; עשרה משחקים נדחסים לחמש עמודות. שם משחק רב מילים נשבר לשורות קצרות. | [games-library](screenshots/games-library.png) | P2 | שמות 16–18 פיקסלים, שלוש או ארבע עמודות עם איור מוכר; להשאיר גלילה ברורה. |
| KUX-004 | ספריית המשחקים<br>הורדה למכשיר | הטקסט באזור ההורדה כמעט נבלע ברקע — צבע הטקסט הוא RGB(237,242,236). הרקע הנראה בצילום הוא בערך RGB(186,192,194): יחס כ־1.6:1. זהו רקע שקוף מעל ערכת עיצוב כהה, ולכן יחס חישוב אוטומטי מתוך CSS לבדו אינו מספיק. | [games-library--scroll-01](screenshots/games-library--scroll-01.png) | P2 | לקבוע במפורש צבע דיו כהה לפאנל ההורדה הבהיר, או להשתמש בפאנל כהה אטום עם טקסט בהיר. |
| KUX-005 | משותף למשחקים<br>הוראות פתיחה | שער הכניסה למשחק דורש קריאת פסקאות — ההסבר הראשוני מבוסס על שלוש פסקאות, לרוב בגופן 13 פיקסלים, ואיור סטטי. כפתור ההתחלה נמצא מתחת לקפל בחלק מהמסכים. אין באותו שער הדגמת פעולה באמצעות אצבע, והטקסט כולל מושגים כמו ג׳ויסטיק, מסירה ארוכה והגבהה. | [soccer-instructions](screenshots/soccer-instructions.png)<br>[tennis-instructions](screenshots/tennis-instructions.png)<br>[streetSlam-instructions](screenshots/streetSlam-instructions.png) | P1 | להציג הדגמה קצרה של פעולה אחת בכל צעד: אצבע, תנועה ותוצאה, עם משפט קולי קצר וכפתור התחלה קבוע. |
| KUX-006 | משותף למשחקים<br>שמיעה חוזרת | כפתור שמיעת ההוראות אינו מקריא אותן — לאחר נגיעת CDP בכפתור ההשמעה החוזרת נרשם צליל לחיצה, אך לא בקשת דיבור. narrateHelp קורא ל־ui.narrate, שמשגר אירוע island:narrate; לא נמצא באפליקציה מאזין שמנגן את ההסבר. אין להסיק מכך שכל צלילי המשחק חסרים. | [soccer-instructions-replay](screenshots/soccer-instructions-replay.png)<br>[tennis-instructions-replay](screenshots/tennis-instructions-replay.png)<br>[streetSlam-instructions-replay](screenshots/streetSlam-instructions-replay.png) | P1 | לחבר את הכפתור להקלטה עברית או למקריא זמין, ולספק הדגמה חזותית כשאין קול. |
| KUX-007 | משותף למשחקים<br>השהיה ויציאה | היציאה קיימת אך דורשת לזהות שתי צלמיות — במשחק מופיעה צלמית השהיה. אחריה מוצגים המשך, צליל ויציאה כצלמיות ללא כיתוב נראה; השם לחזור לעיר קיים במאפיין הנגישות בלבד. נבדקה חזרה אמיתית לאי באמצעות שתי נגיעות. | [soccer-pause](screenshots/soccer-pause.png)<br>[tennis-pause](screenshots/tennis-pause.png)<br>[streetSlam-pause](screenshots/streetSlam-pause.png) | P2 | להוסיף כיתוב נראה לחזור לאי ליד דלת היציאה, וכיתוב השהיה/בית בשלב הכניסה. |
| KUX-008 | משותף למשחקים<br>תוצאות הצלחה וכישלון | הפעולות הבאות במסכי הסיום יורדות מתחת לקפל — כותרת, כרטיס פרס ונתונים תופסים את גובה החלון. צריך לגלול כדי להגיע שוב, שלבים או יציאה; בסיום הכדורגל נדרשו מספר תצוגות גלילה. אלה צילומי תבנית תוצאה מנתוני בדיקה, לא ניצחונות ששוחקו. | [soccer-result-win](screenshots/soccer-result-win.png)<br>[soccer-result-win--scroll-02](screenshots/soccer-result-win--scroll-02.png)<br>[tennis-result-win](screenshots/tennis-result-win.png) | P2 | שורת פעולות קבועה בתחתית: שוב ולחזור לאי; לקפל פירוט פרסים והצעות שדרוג. |
| KUX-009 | האי והעיר<br>מפת האי וניווט | רווחי הניווט קטנים לאצבע של ילד — בין מרכז העיר לעוד פעולות ובין כסף למשימות נמדדו 2 פיקסלים; בין מפה לטיול ובין קיצורי הדרך התחתונים כ־5. היעדים הראשיים עצמם עומדים ב־44. | [island-02-first-city](screenshots/island-02-first-city.png)<br>[island-06-map](screenshots/island-06-map.png) | P2 | רווח 8–12 פיקסלים בין פעולות נפרדות, ויותר בין פעולות שקל לבלבל ביניהן. |
| KUX-010 | האי והעיר<br>מפת יעדים | סגירת המפה ויעדי המקום קטנים — סגירת המפה נמדדה 36×36; כפתור העירייה 67.38×38. שני היעדים נראים וניתנים לפגיעה במרכז, אך קטנים מדרישת 44. | [island-06-map](screenshots/island-06-map.png) | P2 | סגירה 48×48 ושורות יעדים בגובה 48, עם שם ואיור. |
| KUX-011 | האי והעיר<br>יצירת דמות | בחירת הדמות נראית חתוכה בתחילת הדרך — תצוגת הדמות בגובה 120 משאירה מעט מקום לבחירה: שורת השמות נחתכת ליד הכפתור הקבוע, ושאר השדות דורשים שלוש גלילות. כותרות השדות הן 12 פיקסלים. יעדי הבחירה עצמם 56 ומעלה. | [island-01-avatar-first-use](screenshots/island-01-avatar-first-use.png)<br>[island-01-avatar-first-use--scroll-01](screenshots/island-01-avatar-first-use--scroll-01.png) | P2 | לקצר את התצוגה המקדימה לרוחב, לחשוף לפחות שתי קבוצות בחירה ולהוסיף סימן גלילה או צעדים מאוירים. |
| KUX-012 | האי והעיר<br>הדרכה ראשונה | ההתחלה בעיר מוסברת בטקסט בלבד — ההדרכה הראשונה אומרת זו העירייה שלך ומתחילים בעירייה, אך אינה מדגימה אצבע שנוגעת במבנה או מקריאה את הפעולה. העזרה במפה מוצגת כהודעת טקסט חולפת. | [island-03-tutorial-tasks](screenshots/island-03-tutorial-tasks.png) | P1 | אצבע מודגמת, הדגשת המבנה ומשפט מוקלט אחד; לתת לילד לחזור על הפעולה ולקבל אישור ברור. |
| KUX-013 | האי והעיר<br>מדדי העיר | נתוני העיר צפופים וחלקם בהירים מדי — טקסט המשנה עיר קטנה. הרפתקה גדולה. נמדד 11 פיקסלים וביחס 3.11:1. התפריט כולל מספר רב של מדדים ומשאבים בגובה חלון מוגבל. | [island-08-city-stats](screenshots/island-08-city-stats.png) | P2 | טקסט משני 14–16, ניגודיות 4.5:1, ושלושה מדדים מאוירים עיקריים עם פירוט נפתח. |
| KUX-014 | האי והעיר<br>העירייה: תכנון ותקציב | ניהול העיר מציע ממשק עמוס של מבוגר — כפתור התחלת ניהול עיר הוא 120×40. בלוח יש תכנון, שירותים, תקציבים, אחוזי מימון ומיסוי; אין דרך מאוירת קצרה שמסבירה לילד מה כדאי לעשות עכשיו. | [island-18-city-blueprint](screenshots/island-18-city-blueprint.png)<br>[island-18-city-budget](screenshots/island-18-city-budget.png) | P2 | גובה 48 לפעולה הראשית; מסלול ילד עם פעולה מומלצת אחת ותחזית מאוירת, ופירוט ניהול בלשונית משנית. |
| KUX-015 | ליגת העיר בכדורגל<br>הוראות ומפת הליגה | ההסבר מציע בחירת שוער שאינה במסך הליגה — ההוראות מציינות אפשר לבחור להיות השוער לפני המשחק. מסך הליגה הנוכחי מציג בחירת משחק, אימונים והרכבים; בחירת תפקיד השוער נמצאת בענף ממשק ישן שאינו מוצג כשיש ליגות. | [soccer-instructions](screenshots/soccer-instructions.png)<br>[soccer-stages](screenshots/soccer-stages.png) | P2 | לעדכן את ההוראה למסלול הפעיל, או להציג כניסה ברורה לבחירת התפקיד אם עדיין תומכים בו. |
| KUX-016 | ליגת העיר בכדורגל<br>משחק | כיתובי פעולות ומטרת המשחק קטנים — בעיטה, מסירה וריצה נמדדו 11 פיקסלים, הגבהה 10 ומטרת השער 11. הכפתורים עצמם גדולים, 64–80. במודל אגודל ברדיוס 32, הכיתוב שבתחתית הכפתור המוחזק מכוסה; לא נמדדה חפיפה לכפתור השכן. | [soccer-playing](screenshots/soccer-playing.png)<br>[soccer-touch-held](screenshots/soccer-touch-held.png) | P2 | כיתוב 14–16, סמל שקל לזהות, ומשוב הפעולה גם מעל האצבע או ליד השחקן. |
| KUX-017 | טניס בעיר<br>משחק | הכיתוב מכה קצרה לרשת רחב מכפתורו — כל תוויות הפעולה הן 10 פיקסלים. הכיתוב מכה קצרה לרשת נמדד כ־76.67 פיקסלים בתוך כפתור שרוחבו 64, ולכן גולש לשוליו. | [tennis-playing](screenshots/tennis-playing.png) | P2 | סמל מובחן ושם קצר כמו קצרה, 14–16 פיקסלים; להגדיל יעד או לשבור לשתי שורות מתוכננות. |
| KUX-018 | טניס בעיר<br>משחק | כיתוב החבטה לא מגיע לניגודיות הנדרשת — התווית חבטה בגודל 10 פיקסלים נמדדה ביחס 3.40:1 על הרקע המלא של כפתורה. | [tennis-playing](screenshots/tennis-playing.png) | P2 | להכהות את כפתור החבטה או לשנות את צבע הכיתוב, יחד עם הגדלת הגופן. |
| KUX-019 | ליגת העיר בכדורסל<br>משחק והסבר מחוות | שלוש מחוות למסירה נלמדות ממשפט קטן — מסירה קצרה בנגיעה, מסירת קרקע בנגיעה כפולה ורחוקה בהחזקה מוסברות בהודעה בגופן 12. שמות התפקידים על המגרש מופיעים גם כקיצורים באנגלית בגופן 10. | [streetSlam-playing](screenshots/streetSlam-playing.png)<br>[streetSlam-after-controls](screenshots/streetSlam-after-controls.png) | P2 | ללמד מחווה אחת בכל שלב באימון מאויר, עם קו מסירה ותוצאה; להציע שמות/סמלים פשוטים לתפקידים. |
| KUX-020 | ליגת העיר בכדורסל<br>ניהול המועדון | ניהול הקבוצה מחייב גלילה ארוכה מאוד — פתיחת ניהול הקבוצה חושפת כרטיסים, מיקומים, עייפות ושדרוגים על פני שמונה תצוגות לפחות; פעולת משחק וניווט אינם נשמרים יחד באזור קבוע. | [streetSlam-club](screenshots/streetSlam-club.png)<br>[streetSlam-club--scroll-07](screenshots/streetSlam-club--scroll-07.png) | P2 | להפריד כרטיס ילד קצר עם בחירה מומלצת מניהול מלא, ולהשאיר לשחק וחזרה גלויים. |
| KUX-021 | מרוצי העיר<br>מרוץ | כפתור הכניסה לפיטס נמוך מהרף — כניסה לפיטס להחלפת צמיגים נמדד 96×40. זהו כפתור פעולה תוך כדי נהיגה, ולכן גובהו חשוב יותר מהגובה של קישור קרדיט משני. | [islandRacing-touch-held](screenshots/islandRacing-touch-held.png) | P2 | גובה 48 לפחות, מרחק 8 מההאצה והניטרו, וחיווי בקשה שאינו מוסתר באגודל. |
| KUX-022 | מרוצי העיר<br>לוח המשחק | מד המהירות וההסברים זעירים וכוללים קיצורים — קמ״ש בגופן 8, האצה אוטומטית 9, ERS וטיפ ההיגוי 10. קיצורים ומונחי נהיגה מופיעים לצד כמה פעולות בו זמנית. | [islandRacing-touch-held](screenshots/islandRacing-touch-held.png) | P2 | תווית מרכזית 14–16, מטען מאויר במקום קיצור לא מוסבר, ולימוד האצה/היגוי/בלימה בצעדים. |
| KUX-023 | מרוצי העיר<br>טבלת העונה | מספרי נהגים בהירים על צבעי קבוצה בהירים — מספרי חולצות/נהגים בטבלת העונה נמדדו בין היתר 1.26:1, 1.68:1 ו־1.81:1 בגודל 15.2. לא כל הצבעים שומרים על קריאות אחידה. | [islandRacing-league-season--scroll-01](screenshots/islandRacing-league-season--scroll-01.png)<br>[islandRacing-league-season--scroll-02](screenshots/islandRacing-league-season--scroll-02.png) | P2 | לבחור דיו כהה/בהיר לפי בהירות צבע הקבוצה או להציב את המספר על תג אטום קבוע. |
| KUX-024 | אי החזירים<br>תפריט ראשי | העזרה, הרגישות והחזרה לעיר בגובה 32 בלבד — בתפריט הפנימי נמדדו איך משחקים, איכות, רגישות וחזרה לעיר בגובה 32. חזרה לעיר ברוחב כ־50, וכותרות/הערת השמירה מגיעות ל־9–10 פיקסלים. | [boarDefense-campaign-menu](screenshots/boarDefense-campaign-menu.png) | P2 | שורות קישורים בגובה 48, פיצול לשתי שורות ברוחב זה, והפרדה בולטת של החזרה לעיר. |
| KUX-025 | אי החזירים<br>מוסך ונשקים | במוסך כפתורי הקנייה והלשוניות קטנים ונחתכים — הלשוניות נשקים וביצורים הן בגובה 39 וכפתורי קנייה 38. בתצוגה העליונה נשארו כ־15.8 פיקסלים נראים מכפתורי הקנייה של השורה הראשונה. הכפתור לגל הבא וחזרה נמצאים בסוף מסמך גלילה בגובה 1471. | [boarDefense-shop](screenshots/boarDefense-shop.png)<br>[boarDefense-shop--scroll-04](screenshots/boarDefense-shop--scroll-04.png) | P2 | גובה 48 ללשוניות ולרכישה, ושורת פעולות קבועה לגל הבא/חזרה; להציג פחות נתוני נשק בכרטיס הראשי. |
| KUX-026 | אי החזירים<br>תדריך פנימי | התדריך הנייד כולל עומס של מקשי מחשב — בתדריך הפנימי נדרשת גלילה דרך פסקאות וטבלת מקשים כגון Q, E, R ורווח. ההסבר לטלפון הוא משפט מילולי על ג׳ויסטיק וירי, ללא הדגמה פעילה של שתי אצבעות. | [boarDefense-help](screenshots/boarDefense-help.png)<br>[boarDefense-help--scroll-01](screenshots/boarDefense-help--scroll-01.png) | P2 | תדריך נייד נפרד: ציור אגודל שמאל מכוון וימין יורה, הדגמת פגיעה וקול קצר; מקשי המחשב רק במחשב. |
| KUX-027 | למידה<br>שאלת שפה | אין מסלול ללא קריאה כשחסר קול עברי בגיל 7 — בגיל 7 רמת הפתיחה היא 4. בהרצה ללא קול עברי זמין הופיעה שאלת שפה עם תשובות כתובות וכפתור רמקול, ללא הקראת שאלה בפועל. החלופה החזותית בקוד מוגבלת לרמות 1–2. | [learning-language-question](screenshots/learning-language-question.png) | P1 | הקלטות מוכנות לשאלות החיוניות, או חלופה חזותית גם ברמה 4; להראות בבירור כשקול אינו זמין. |
| KUX-028 | האי והעיר<br>נעילת משחקים יומית | נעילת המשחקים מוסברת כהוראה ארוכה — במצב יום נוסף בגיל 7, המשחקים דורשים שני סבבים של שמונה שאלות. הסיבה והכמות מוסברות בטקסט 13 פיקסלים; אין רצף מאויר של שני סבבים שמוביל למשחק שבחר הילד. | [island-26-daily-locked](screenshots/island-26-daily-locked.png) | P2 | להציג שני צעדים מאוירים והבטחה ברורה לחזרה למשחק שנבחר, עם הסבר קולי קצר. |
| KUX-029 | מרוץ סנובורד<br>מסלול ליגה | שמות הטריקים הם בגודל 9 פיקסלים — תפיסה, סיבוב, סלטה ושילוב נמדדו 9; הסבר טריקים באוויר 11. יעדי הטריקים עצמם כ־67×67, כך שהקושי הוא קריאה ולימוד ולא גודל הלחיצה. | [alpineRush-league-live](screenshots/alpineRush-league-live.png) | P2 | שמות 14–16 ודמות קטנה שמדגימה את הטריק לפני הפעלתו; להדגיש רק את הפעולה הזמינה כעת. |
| KUX-030 | מרוץ סנובורד<br>לוח יעדי הליגה | היעד מקום 6/3 נראה כשבר לא הגיוני — בחיווי יעד הליגה הופיע מקום 6/3: מיקום נוכחי 6 מול יעד 3. שתי המשמעויות אינן כתובות, והשימוש בלוכסן נראה כמו מקום שישי מתוך שלושה. זהו קושי במשמעות המספרים, לא הוכחה שכל כיוון העברית הפוך. | [alpineRush-league-live](screenshots/alpineRush-league-live.png) | P2 | להפריד במילים או סמלים: עכשיו מקום 6; כדי לעבור — מקום 3 ומעלה. |
| KUX-031 | כיבוי שריפה<br>חדר כיבוי רב כלים | תוויות כלי הכיבוי בתוך הבניין זעירות — צינור מים, מטף ושמיכת כיבוי נמדדו 9 פיקסלים. הכפתורים עצמם 56×56 ויש סמלים, אך ההבחנה בין כלים חדשים נשענת גם על התווית. | [fireRescue-entry-12-clock](screenshots/fireRescue-entry-12-clock.png) | P2 | תוויות 14 לפחות או כרטיס כלי מוגדל בהחלפה, עם הקראה והדגמת שימוש; לשמור על הגדלים הטובים של היעדים. |
| KUX-032 | הגנה מפני חייזרים<br>משחק | שמות הנשקים והגל קטנים בזמן הטיסה — ירי רגיל וולקן מופיעים בגופן 10, ומספר הגל 11. בכפתורים יש סמלים וצבעים, אך ההבדל בין ירי רגיל, ירי מיוחד ומתג נשק אינו נלמד בהדגמה באותו מסך. | [alienDefense-playing](screenshots/alienDefense-playing.png) | P2 | תווית נשק 14–16, חיווי תחמושת ברור ליד האצבע והיכרות חזותית עם כל נשק בתורו. |
| KUX-033 | קרב ספינות<br>לוח המשחק | השעון וההכוונה בספינות מצוירים קטנים — מדידת קריאות ציור הקנבס מצאה שעון 10 פיקסלים, אחוזי גוף הספינה 11, מלאי 13 וההוראה געו בספינה או בכפתור הנעילה 12. אלה מידות CSS לאחר התמרת הקנבס, ולא רק גדלי טקסט ב־DOM. | [navalDuel-canvas-text](screenshots/navalDuel-canvas-text.png) | P2 | הוראות 14–16 ושעון ברור יותר, עם חיווי חזותי/קולי לנעילה לפני ירי. |
| KUX-034 | קרב ספינות<br>בחירת תחמושת | בחירת התחמושת נשענת על סמלים ומספרים בלבד — מגירת התחמושת מציגה שישה סמלים ומספרי מלאי, בלי שם או הדגמה נראים. שמות קיימים במאפייני הנגישות/ריחוף. המגירה נמצאת גם על אזור הספינה היריבה במבט שנבדק. | [navalDuel-weapon-picker](screenshots/navalDuel-weapon-picker.png)<br>[navalDuel-weapon-changed](screenshots/navalDuel-weapon-changed.png) | P2 | להוסיף תצוגה קצרה של מה הנשק עושה, עם משפט מוקלט ובחירה נראית; למקם את המגירה כך שאינה מכסה את המטרה. |
| KUX-035 | תפוס את הפושע<br>הדרכה פנימית למרדף | לפני המרדף מופיע תדריך ארוך מרובה מחוות — תדריך הפתיחה הפנימי כולל ארבע פסקאות: היגוי, כיוון הטיה, טורבו/בלם, שישה כלים, טבעות מיקוד והשלכה בהחזקה ושחרור. אין בו אימון קצר שמאפשר לבצע פעולה אחת לפני שמתחילים. | [catchCriminal-in-game-help](screenshots/catchCriminal-in-game-help.png) | P1 | שלושה צעדים מעשיים: היגוי, כלי אחד ולכידה; בכל צעד אצבע מונפשת, תוצאה וקול. להציג כלים נוספים בהדרגה. |
| KUX-036 | תפוס את הפושע<br>שלב לכידה | הבחירה בין רשת צרה לרחבה קטנה ומוסברת רק בטקסט עזר — שמות רשת צרה ורשת רחבה נמדדו 11 פיקסלים בתוך יעדים בגובה כ־54. ההבדל בטווח ובדיוק נמצא בתיאור הנגישות/הוראות; הסמלים דומים. | [catchCriminal-capture-aim](screenshots/catchCriminal-capture-aim.png) | P2 | להציג קונוס/טווח לדוגמה בכל בחירה, תווית 14 לפחות ומשפט קצר שמסביר למה לבחור בכל כלי. |
| KUX-037 | למידה<br>משחק זיכרון | קלפי הזיכרון עומדים במינימום אך כמעט צמודים — בגיל 7 וברמה 4 נמדדו 12 קלפים בגודל 62×44 ורווח 4 בלבד, אופקית ואנכית. הם עומדים במינימום הלחיצה המבוקש, אך אין מרווח סלחני לילד. | [learning-variant-memory](screenshots/learning-variant-memory.png) | P2 | רווח 8 וגובה 52–56 לקלפים, תוך שמירת הלוח והיציאה באותו חלון. |
| KUX-038 | למידה<br>פאזל | הפאזל אינו מדגים שמחליפים חלקים בשתי לחיצות — הכותרת אומרת להרכיב את תמונת העיר, אך הפעולה היא בחירת שני חלקים להחלפה, ולא גרירה של חלק למקומו. ההסבר המדויק מופיע ברמז כתוב/קולי, ובמכשיר ללא קול אינו נלמד ללא קריאה. | [learning-variant-jigsaw](screenshots/learning-variant-jigsaw.png)<br>[learning-variant-jigsaw-touched](screenshots/learning-variant-jigsaw-touched.png) | P2 | להדגים פעם אחת שתי נגיעות והחלפה, או לאפשר גם גרירה טבעית עם יעד נחיתה מודגש. |
| KUX-039 | ליגת העיר בכדורסל<br>בקשת פסק זמן | פסק זמן נראה זמין אך הבקשה נדחית בלי הסבר — בבדיקת נגיעה, פסק זמן נשאר כפתור זמין אך לא נפתח ספסל: המצב שנשמר היה משחק חי, הכדור בידי היריב, ונותרו 7 פסקי זמן. המנוע מחזיר ok:false בתנאי זה בלי סיבת דחייה, והכפתור אינו מסביר את תנאי ההחזקה. | [streetSlam-timeout](screenshots/streetSlam-timeout.png) | P2 | להציג סיבה קצרה כמו פסק זמן רק כשהכדור שלכם, או מצב לא זמין מוסבר עם חיווי מיידי לאחר בקשה. |
| KUX-040 | ליגת העיר בכדורסל<br>ספסל חילופים בזמן פסק זמן | סגירת ספסל החילופים צרה מדרישת המינימום — במצב פסק זמן חוקי נמדדה סגירת הספסל 40×56. זוהי צלמית ללא כיתוב נראה, ליד כרטיסי שחקנים בגודל נדיב יותר. המסך הוצג ממצב מנוע חוקי בדיוני מוקפא; נגיעות החלפה נבדקו בפועל בתוך מצב זה. | [streetSlam-timeout-bench](screenshots/streetSlam-timeout-bench.png) | P2 | רוחב 48 לפחות וכיתוב חזרה למשחק, כדי להבדיל מסגירת המשחק וחזרה לאי. |

לכל ממצא יש בקובץ [הנתונים](findings.json) גם קריטריון קבלה, מידת ודאות והפניות למקור. מדידות מלאות לכל צילום נמצאות בקובצי `evidence-*.json`; הנתונים הם ראיות לבדיקה ולא רשימה אוטומטית של כשלים. חישוב הניגודיות בפאנל ההורדה מתועד גם ב־[דגימות מהצילום](contrast-evidence.json).

## משוב, צליל ויציאה

המדד הבא הוא הזמן מהפעלת מאזין pointerdown עד חזרת מסגרת המשוב שהמוצר עצמו מודד. הוא אינו זמן עד תנועת שחקן, השמעת צליל בפועל או זמן נסיעה של אירוע מהמכשיר. זמן המתנה יזום בסקריפט ומשך קריאת CDP אינם מוצגים כזמן תגובה.

| משחק | מה נמדד | דגימות | חציון, מ״ש | אחוזון 95, מ״ש | מקסימום, מ״ש |
|---|---|---:|---:|---:|---:|
| הגנה מפני חייזרים | פעולה ראשית והשהיה/המשך | 12 | 114.0 | 296.3 | 296.3 |
| כיבוי שריפה | פעולה ראשית והשהיה/המשך | 12 | 256.5 | 894.8 | 894.8 |
| קרב ספינות | פעולה ראשית והשהיה/המשך | 12 | 158.4 | 519.7 | 519.7 |
| ליגת העיר בכדורגל | פעולה ראשית והשהיה/המשך | 12 | 103.9 | 169.9 | 169.9 |
| טניס בעיר | פעולה ראשית והשהיה/המשך | 12 | 210.6 | 246.5 | 246.5 |
| מרוצי העיר | פעולה ראשית והשהיה/המשך | 12 | 1088.6 | 1164.4 | 1164.4 |
| ליגת העיר בכדורסל | השהיה/המשך במסגרת | 8 | 282.6 | 377.6 | 377.6 |
| מרוץ סנובורד | פעולה ראשית והשהיה/המשך | 12 | 756.7 | 1170.4 | 1170.4 |
| אי החזירים | השהיה/המשך במסגרת | 8 | 913.3 | 1350.5 | 1350.5 |
| תפוס את הפושע | השהיה/המשך במסגרת | 8 | 141.6 | 176.5 | 176.5 |

נתוני המשוב נשמרים ב־[ראיות ההרצה הנפרדת](evidence-feedback.json). במדידת התוכנה נצפו גם חריגות גדולות מ־100 מ״ש, במיוחד במשחקים הכבדים. זהו סיכון לבדיקה בטלפון, לא קביעה שהמכשיר עצמו מאחר באותו זמן. יש להשלים מדידת פעולה וקול בטלפון לפני החלטת ביצועים. הצלילים שנצפו בתיעוד הם הפעלות Web Audio/מדיה במצב מנוע קיים; אין כאן טענה שהוקלטה עוצמת השמע באוזן.

היציאה לאי הצליחה בכל עשרת המשחקים. ברוב מסכי המשחק היעדים המרכזיים גדולים מ־44, ובמסכי בחירת התלבושת ובחדרי הכיבוי נמצאו יעדים נדיבים. בחדר הכיבוי קיימת הדרכה ציורית בשלושה צעדים; היא דוגמה שימושית לשיפור שער ההוראות הכללי. במודל האגודל שנבדק הכיתוב שבתוך הכפתור המוחזק עשוי להיות מכוסה, אך לא נמצאה חפיפה גורפת לכפתורי הפעולה השכנים; התחושה במכשיר נותרה לבדיקה.

## סיכום הכיסוי

| אזור | צילומים | חזרה מהמשחק לאי |
|---|---:|---|
| האי והעיר | 82 | — |
| ספריית המשחקים | 2 | — |
| למידה | 26 | — |
| הגנה מפני חייזרים | 26 | אומתה בנגיעה |
| כיבוי שריפה | 51 | אומתה בנגיעה |
| קרב ספינות | 30 | אומתה בנגיעה |
| ליגת העיר בכדורגל | 35 | אומתה בנגיעה |
| טניס בעיר | 25 | אומתה בנגיעה |
| מרוצי העיר | 39 | אומתה בנגיעה |
| ליגת העיר בכדורסל | 35 | אומתה בנגיעה |
| מרוץ סנובורד | 37 | אומתה בנגיעה |
| אי החזירים | 27 | אומתה בנגיעה |
| תפוס את הפושע | 26 | אומתה בנגיעה |

עברית וכיווניות: כיוון המסמך ומרבית הממשק הוא ימין־לשמאל; שדות מספריים מבודדים נבדקו במפות הליגה ובמסכי תוצאה. לוחות פאזל וזיכרון משתמשים בכיוון שמאל־לימין במכוון לצורך מיפוי התמונה. לא הוסב כל כיוון שמאל־לימין לליקוי; קיצורים לא מוכרים וקטעי טקסט קטנים מתועדים בנפרד.

## שחזור ואימות

נדרשים Python Playwright ו־Chromium מותקן. הסקריפט מקים שרת לולאה מקומי ואינו משנה קובצי מוצר. להפעלה מלאה:

```bash
python3 workout/island/design/kid-ux-audit-v1/audit.py --phase island,library,alienDefense,fireRescue,navalDuel,soccer,tennis,islandRacing,streetSlam,alpineRush,boarDefense,catchCriminal,advanced,fire-cards --output /tmp/kid-ux-captures
python3 workout/island/design/kid-ux-audit-v1/audit.py --phase feedback,hoops-detail --output /tmp/kid-ux-captures
```

יש להריץ משוב בנפרד אחרי סיום הרצות הצילום, בלי דפדפנים או בדיקות נוספות ברקע. ניתן לבחור נתיב דפדפן באמצעות `--browser`. תוצאת אימות הקבצים והבדיקות נמצאת ב־[verification.json](verification.json).

בדיקות המאגר: בהרצה המקורית 4,261 עברו, 64 דולגו ואחת נכשלה משום שהדפדפן המצורף ל־Playwright אינו מותקן. אותה בדיקת דפדפן השאירה שרת פתוח לאחר כשל ההפעלה; רק העובד הכושל הופסק כדי לקבל סיכום. בהרצת השלמה עם הדפדפן המותקן עברו כל חמש הבדיקות באותו קובץ, כולל בדיקת הדפדפן. לא נערכו קובצי בדיקה או מוצר. לשחזור מיפוי הדפדפן בלבד:

```bash
NODE_OPTIONS='--import ./workout/island/design/kid-ux-audit-v1/test-browser.mjs' node --test tests/workout-royiki.test.mjs
```

תקלות איסוף מוקדמות של צילום בעומס ושל בחירת בקר תחמושת נסתר הושלמו בהרצות נפרדות. הן מתועדות ביומני הראיות ואינן נספרות כליקויי מוצר.

## כל הצילומים

כל קישור מציג צילום מקורי בגודל 844×390. גלילה היא חלק מאותה תבנית מסך; סוג נתוני הבדיקה מופיע במפורש.

| משחק | מסך/מצב | נתוני הבדיקה | צילום | ממצאים מקושרים |
|---|---|---|---|---|
| האי והעיר | island-01-avatar-first-use | `fresh-install` | [island-01-avatar-first-use](screenshots/island-01-avatar-first-use.png) | KUX-011 |
| האי והעיר | island-01-avatar-first-use--scroll-01 | `fresh-install` | [island-01-avatar-first-use--scroll-01](screenshots/island-01-avatar-first-use--scroll-01.png) | KUX-011 |
| האי והעיר | island-01-avatar-first-use--scroll-02 | `fresh-install` | [island-01-avatar-first-use--scroll-02](screenshots/island-01-avatar-first-use--scroll-02.png) | — |
| האי והעיר | island-01-avatar-first-use--scroll-03 | `fresh-install` | [island-01-avatar-first-use--scroll-03](screenshots/island-01-avatar-first-use--scroll-03.png) | — |
| האי והעיר | island-02-first-city | `fresh-install` | [island-02-first-city](screenshots/island-02-first-city.png) | KUX-009 |
| האי והעיר | island-03-tutorial-tasks | `fresh-install` | [island-03-tutorial-tasks](screenshots/island-03-tutorial-tasks.png) | KUX-012 |
| האי והעיר | island-04-more | `fresh-install` | [island-04-more](screenshots/island-04-more.png) | — |
| האי והעיר | island-05-help-toast | `fresh-install` | [island-05-help-toast](screenshots/island-05-help-toast.png) | — |
| האי והעיר | island-06-map | `fresh-install` | [island-06-map](screenshots/island-06-map.png) | KUX-009, KUX-010 |
| האי והעיר | island-06-map--scroll-01 | `fresh-install` | [island-06-map--scroll-01](screenshots/island-06-map--scroll-01.png) | — |
| האי והעיר | island-07-tour | `fresh-install` | [island-07-tour](screenshots/island-07-tour.png) | — |
| האי והעיר | island-08-city-stats | `fresh-install` | [island-08-city-stats](screenshots/island-08-city-stats.png) | KUX-013 |
| האי והעיר | island-08-city-stats--scroll-01 | `fresh-install` | [island-08-city-stats--scroll-01](screenshots/island-08-city-stats--scroll-01.png) | — |
| האי והעיר | island-09-scores | `fresh-install` | [island-09-scores](screenshots/island-09-scores.png) | — |
| האי והעיר | island-09-scores--scroll-01 | `fresh-install` | [island-09-scores--scroll-01](screenshots/island-09-scores--scroll-01.png) | — |
| האי והעיר | island-10-training-hub | `fresh-install` | [island-10-training-hub](screenshots/island-10-training-hub.png) | — |
| האי והעיר | island-10-training-hub--scroll-01 | `fresh-install` | [island-10-training-hub--scroll-01](screenshots/island-10-training-hub--scroll-01.png) | — |
| האי והעיר | island-11-first-daily | `fresh-install` | [island-11-first-daily](screenshots/island-11-first-daily.png) | — |
| האי והעיר | island-11-first-daily--scroll-01 | `fresh-install` | [island-11-first-daily--scroll-01](screenshots/island-11-first-daily--scroll-01.png) | — |
| האי והעיר | island-12-parent-settings | `fresh-install` | [island-12-parent-settings](screenshots/island-12-parent-settings.png) | — |
| האי והעיר | island-12-parent-settings--scroll-01 | `fresh-install` | [island-12-parent-settings--scroll-01](screenshots/island-12-parent-settings--scroll-01.png) | — |
| האי והעיר | island-12-parent-settings--scroll-02 | `fresh-install` | [island-12-parent-settings--scroll-02](screenshots/island-12-parent-settings--scroll-02.png) | — |
| האי והעיר | island-13-parent-age-7 | `fresh-install` | [island-13-parent-age-7](screenshots/island-13-parent-age-7.png) | — |
| האי והעיר | island-14-reset-confirmation | `fresh-install` | [island-14-reset-confirmation](screenshots/island-14-reset-confirmation.png) | — |
| האי והעיר | island-14-reset-confirmation--scroll-01 | `fresh-install` | [island-14-reset-confirmation--scroll-01](screenshots/island-14-reset-confirmation--scroll-01.png) | — |
| האי והעיר | island-15-progressed-city | `synthetic-progressed-city-age-7` | [island-15-progressed-city](screenshots/island-15-progressed-city.png) | — |
| האי והעיר | island-16-avatar-edit | `synthetic-progressed-city-age-7` | [island-16-avatar-edit](screenshots/island-16-avatar-edit.png) | — |
| האי והעיר | island-16-avatar-edit--scroll-01 | `synthetic-progressed-city-age-7` | [island-16-avatar-edit--scroll-01](screenshots/island-16-avatar-edit--scroll-01.png) | — |
| האי והעיר | island-16-avatar-edit--scroll-02 | `synthetic-progressed-city-age-7` | [island-16-avatar-edit--scroll-02](screenshots/island-16-avatar-edit--scroll-02.png) | — |
| האי והעיר | island-16-avatar-edit--scroll-03 | `synthetic-progressed-city-age-7` | [island-16-avatar-edit--scroll-03](screenshots/island-16-avatar-edit--scroll-03.png) | — |
| האי והעיר | island-17-catalog-basic | `synthetic-progressed-city-age-7` | [island-17-catalog-basic](screenshots/island-17-catalog-basic.png) | — |
| האי והעיר | island-17-catalog-services | `synthetic-progressed-city-age-7` | [island-17-catalog-services](screenshots/island-17-catalog-services.png) | — |
| האי והעיר | island-17-catalog-sports | `synthetic-progressed-city-age-7` | [island-17-catalog-sports](screenshots/island-17-catalog-sports.png) | — |
| האי והעיר | island-17-catalog-defense | `synthetic-progressed-city-age-7` | [island-17-catalog-defense](screenshots/island-17-catalog-defense.png) | — |
| האי והעיר | island-17-catalog-learning | `synthetic-progressed-city-age-7` | [island-17-catalog-learning](screenshots/island-17-catalog-learning.png) | — |
| ליגת העיר בכדורגל | instructions | `synthetic-progressed-city-age-7` | [soccer-instructions](screenshots/soccer-instructions.png) | KUX-005, KUX-015 |
| ליגת העיר בכדורגל | instructions | `synthetic-progressed-city-age-7` | [soccer-instructions--scroll-01](screenshots/soccer-instructions--scroll-01.png) | — |
| ליגת העיר בכדורגל | instructions replay | `synthetic-progressed-city-age-7` | [soccer-instructions-replay](screenshots/soccer-instructions-replay.png) | KUX-006 |
| ליגת העיר בכדורגל | home | `synthetic-progressed-city-age-7` | [soccer-home](screenshots/soccer-home.png) | KUX-002 |
| ליגת העיר בכדורגל | stages / league entry | `synthetic-progressed-city-age-7` | [soccer-stages](screenshots/soccer-stages.png) | KUX-015 |
| ליגת העיר בכדורגל | stages / league entry | `synthetic-progressed-city-age-7` | [soccer-stages--scroll-01](screenshots/soccer-stages--scroll-01.png) | — |
| ליגת העיר בכדורגל | upgrades | `synthetic-progressed-city-age-7` | [soccer-upgrades](screenshots/soccer-upgrades.png) | — |
| ליגת העיר בכדורגל | upgrades | `synthetic-progressed-city-age-7` | [soccer-upgrades--scroll-01](screenshots/soccer-upgrades--scroll-01.png) | — |
| ליגת העיר בכדורגל | equipment | `synthetic-progressed-city-age-7` | [soccer-equipment](screenshots/soccer-equipment.png) | — |
| ליגת העיר בכדורגל | equipment | `synthetic-progressed-city-age-7` | [soccer-equipment--scroll-01](screenshots/soccer-equipment--scroll-01.png) | — |
| ליגת העיר בכדורגל | training | `synthetic-progressed-city-age-7` | [soccer-training](screenshots/soccer-training.png) | — |
| ליגת העיר בכדורגל | training | `synthetic-progressed-city-age-7` | [soccer-training--scroll-01](screenshots/soccer-training--scroll-01.png) | — |
| ליגת העיר בכדורגל | rosters | `synthetic-progressed-city-age-7` | [soccer-rosters](screenshots/soccer-rosters.png) | — |
| ליגת העיר בכדורגל | rosters | `synthetic-progressed-city-age-7` | [soccer-rosters--scroll-01](screenshots/soccer-rosters--scroll-01.png) | — |
| ליגת העיר בכדורגל | rosters | `synthetic-progressed-city-age-7` | [soccer-rosters--scroll-02](screenshots/soccer-rosters--scroll-02.png) | — |
| ליגת העיר בכדורגל | team | `synthetic-progressed-city-age-7` | [soccer-team](screenshots/soccer-team.png) | — |
| ליגת העיר בכדורגל | team | `synthetic-progressed-city-age-7` | [soccer-team--scroll-01](screenshots/soccer-team--scroll-01.png) | — |
| ליגת העיר בכדורגל | team | `synthetic-progressed-city-age-7` | [soccer-team--scroll-02](screenshots/soccer-team--scroll-02.png) | — |
| ליגת העיר בכדורגל | startup | `synthetic-progressed-city-age-7` | [soccer-starting](screenshots/soccer-starting.png) | — |
| ליגת העיר בכדורגל | live play | `synthetic-progressed-city-age-7` | [soccer-playing](screenshots/soccer-playing.png) | KUX-016 |
| ליגת העיר בכדורגל | two thumbs / live touch | `synthetic-progressed-city-age-7` | [soccer-touch-held](screenshots/soccer-touch-held.png) | KUX-016 |
| ליגת העיר בכדורגל | control feedback | `synthetic-progressed-city-age-7` | [soccer-after-controls](screenshots/soccer-after-controls.png) | — |
| ליגת העיר בכדורגל | pause and exit | `synthetic-progressed-city-age-7` | [soccer-pause](screenshots/soccer-pause.png) | KUX-007 |
| ליגת העיר בכדורגל | returned to island | `synthetic-progressed-city-age-7` | [soccer-after-exit](screenshots/soccer-after-exit.png) | — |
| ליגת העיר בכדורגל | result display fixture | `synthetic-result-display-win` | [soccer-result-win](screenshots/soccer-result-win.png) | KUX-008 |
| ליגת העיר בכדורגל | result display fixture | `synthetic-result-display-win` | [soccer-result-win--scroll-01](screenshots/soccer-result-win--scroll-01.png) | — |
| ליגת העיר בכדורגל | result display fixture | `synthetic-result-display-win` | [soccer-result-win--scroll-02](screenshots/soccer-result-win--scroll-02.png) | KUX-008 |
| ליגת העיר בכדורגל | result display fixture | `synthetic-result-display-lose` | [soccer-result-lose](screenshots/soccer-result-lose.png) | — |
| ליגת העיר בכדורגל | result display fixture | `synthetic-result-display-lose` | [soccer-result-lose--scroll-01](screenshots/soccer-result-lose--scroll-01.png) | — |
| ליגת העיר בכדורגל | result display fixture | `synthetic-result-display-lose` | [soccer-result-lose--scroll-02](screenshots/soccer-result-lose--scroll-02.png) | — |
| ליגת העיר בכדורגל | result display fixture | `synthetic-result-display-lose` | [soccer-result-lose--scroll-03](screenshots/soccer-result-lose--scroll-03.png) | — |
| ספריית המשחקים | games-library | `synthetic-progressed-city-age-7` | [games-library](screenshots/games-library.png) | KUX-001, KUX-002, KUX-003 |
| ספריית המשחקים | games-library--scroll-01 | `synthetic-progressed-city-age-7` | [games-library--scroll-01](screenshots/games-library--scroll-01.png) | KUX-004 |
| ליגת העיר בכדורסל | instructions | `synthetic-progressed-city-age-7` | [streetSlam-instructions](screenshots/streetSlam-instructions.png) | KUX-005 |
| ליגת העיר בכדורסל | instructions | `synthetic-progressed-city-age-7` | [streetSlam-instructions--scroll-01](screenshots/streetSlam-instructions--scroll-01.png) | — |
| ליגת העיר בכדורסל | instructions replay | `synthetic-progressed-city-age-7` | [streetSlam-instructions-replay](screenshots/streetSlam-instructions-replay.png) | KUX-006 |
| ליגת העיר בכדורסל | home | `synthetic-progressed-city-age-7` | [streetSlam-home](screenshots/streetSlam-home.png) | KUX-002 |
| ליגת העיר בכדורסל | stages / league entry | `synthetic-progressed-city-age-7` | [streetSlam-stages](screenshots/streetSlam-stages.png) | — |
| ליגת העיר בכדורסל | stages / league entry | `synthetic-progressed-city-age-7` | [streetSlam-stages--scroll-01](screenshots/streetSlam-stages--scroll-01.png) | — |
| ליגת העיר בכדורסל | upgrades | `synthetic-progressed-city-age-7` | [streetSlam-upgrades](screenshots/streetSlam-upgrades.png) | — |
| ליגת העיר בכדורסל | upgrades | `synthetic-progressed-city-age-7` | [streetSlam-upgrades--scroll-01](screenshots/streetSlam-upgrades--scroll-01.png) | — |
| ליגת העיר בכדורסל | equipment | `synthetic-progressed-city-age-7` | [streetSlam-equipment](screenshots/streetSlam-equipment.png) | — |
| ליגת העיר בכדורסל | equipment | `synthetic-progressed-city-age-7` | [streetSlam-equipment--scroll-01](screenshots/streetSlam-equipment--scroll-01.png) | — |
| ליגת העיר בכדורסל | club management | `synthetic-progressed-city-age-7` | [streetSlam-club](screenshots/streetSlam-club.png) | KUX-020 |
| ליגת העיר בכדורסל | club management | `synthetic-progressed-city-age-7` | [streetSlam-club--scroll-01](screenshots/streetSlam-club--scroll-01.png) | — |
| ליגת העיר בכדורסל | club management | `synthetic-progressed-city-age-7` | [streetSlam-club--scroll-02](screenshots/streetSlam-club--scroll-02.png) | — |
| ליגת העיר בכדורסל | club management | `synthetic-progressed-city-age-7` | [streetSlam-club--scroll-03](screenshots/streetSlam-club--scroll-03.png) | — |
| ליגת העיר בכדורסל | club management | `synthetic-progressed-city-age-7` | [streetSlam-club--scroll-04](screenshots/streetSlam-club--scroll-04.png) | — |
| ליגת העיר בכדורסל | club management | `synthetic-progressed-city-age-7` | [streetSlam-club--scroll-05](screenshots/streetSlam-club--scroll-05.png) | — |
| ליגת העיר בכדורסל | club management | `synthetic-progressed-city-age-7` | [streetSlam-club--scroll-06](screenshots/streetSlam-club--scroll-06.png) | — |
| ליגת העיר בכדורסל | club management | `synthetic-progressed-city-age-7` | [streetSlam-club--scroll-07](screenshots/streetSlam-club--scroll-07.png) | KUX-020 |
| ליגת העיר בכדורסל | startup | `synthetic-progressed-city-age-7` | [streetSlam-starting](screenshots/streetSlam-starting.png) | — |
| ליגת העיר בכדורסל | live play | `synthetic-progressed-city-age-7` | [streetSlam-playing](screenshots/streetSlam-playing.png) | KUX-019 |
| ליגת העיר בכדורסל | two thumbs / live touch | `synthetic-progressed-city-age-7` | [streetSlam-touch-held](screenshots/streetSlam-touch-held.png) | — |
| ליגת העיר בכדורסל | control feedback | `synthetic-progressed-city-age-7` | [streetSlam-after-controls](screenshots/streetSlam-after-controls.png) | KUX-019 |
| ליגת העיר בכדורסל | pause and exit | `synthetic-progressed-city-age-7` | [streetSlam-pause](screenshots/streetSlam-pause.png) | KUX-007 |
| ליגת העיר בכדורסל | returned to island | `synthetic-progressed-city-age-7` | [streetSlam-after-exit](screenshots/streetSlam-after-exit.png) | — |
| ליגת העיר בכדורסל | result display fixture | `synthetic-result-display-win` | [streetSlam-result-win](screenshots/streetSlam-result-win.png) | — |
| ליגת העיר בכדורסל | result display fixture | `synthetic-result-display-win` | [streetSlam-result-win--scroll-01](screenshots/streetSlam-result-win--scroll-01.png) | — |
| ליגת העיר בכדורסל | result display fixture | `synthetic-result-display-lose` | [streetSlam-result-lose](screenshots/streetSlam-result-lose.png) | KUX-008 |
| ליגת העיר בכדורסל | result display fixture | `synthetic-result-display-lose` | [streetSlam-result-lose--scroll-01](screenshots/streetSlam-result-lose--scroll-01.png) | — |
| ליגת העיר בכדורסל | result display fixture | `synthetic-result-display-lose` | [streetSlam-result-lose--scroll-02](screenshots/streetSlam-result-lose--scroll-02.png) | — |
| טניס בעיר | instructions | `synthetic-progressed-city-age-7` | [tennis-instructions](screenshots/tennis-instructions.png) | KUX-005 |
| טניס בעיר | instructions | `synthetic-progressed-city-age-7` | [tennis-instructions--scroll-01](screenshots/tennis-instructions--scroll-01.png) | — |
| טניס בעיר | instructions replay | `synthetic-progressed-city-age-7` | [tennis-instructions-replay](screenshots/tennis-instructions-replay.png) | KUX-006 |
| טניס בעיר | home | `synthetic-progressed-city-age-7` | [tennis-home](screenshots/tennis-home.png) | KUX-002 |
| טניס בעיר | stages / league entry | `synthetic-progressed-city-age-7` | [tennis-stages](screenshots/tennis-stages.png) | — |
| טניס בעיר | stages / league entry | `synthetic-progressed-city-age-7` | [tennis-stages--scroll-01](screenshots/tennis-stages--scroll-01.png) | — |
| טניס בעיר | stages / league entry | `synthetic-progressed-city-age-7` | [tennis-stages--scroll-02](screenshots/tennis-stages--scroll-02.png) | — |
| טניס בעיר | stages / league entry | `synthetic-progressed-city-age-7` | [tennis-stages--scroll-03](screenshots/tennis-stages--scroll-03.png) | — |
| טניס בעיר | stages / league entry | `synthetic-progressed-city-age-7` | [tennis-stages--scroll-04](screenshots/tennis-stages--scroll-04.png) | — |
| טניס בעיר | upgrades | `synthetic-progressed-city-age-7` | [tennis-upgrades](screenshots/tennis-upgrades.png) | — |
| טניס בעיר | upgrades | `synthetic-progressed-city-age-7` | [tennis-upgrades--scroll-01](screenshots/tennis-upgrades--scroll-01.png) | — |
| טניס בעיר | equipment | `synthetic-progressed-city-age-7` | [tennis-equipment](screenshots/tennis-equipment.png) | — |
| טניס בעיר | equipment | `synthetic-progressed-city-age-7` | [tennis-equipment--scroll-01](screenshots/tennis-equipment--scroll-01.png) | — |
| טניס בעיר | startup | `synthetic-progressed-city-age-7` | [tennis-starting](screenshots/tennis-starting.png) | — |
| טניס בעיר | live play | `synthetic-progressed-city-age-7` | [tennis-playing](screenshots/tennis-playing.png) | KUX-017, KUX-018 |
| טניס בעיר | two thumbs / live touch | `synthetic-progressed-city-age-7` | [tennis-touch-held](screenshots/tennis-touch-held.png) | — |
| טניס בעיר | control feedback | `synthetic-progressed-city-age-7` | [tennis-after-controls](screenshots/tennis-after-controls.png) | — |
| טניס בעיר | pause and exit | `synthetic-progressed-city-age-7` | [tennis-pause](screenshots/tennis-pause.png) | KUX-007 |
| טניס בעיר | returned to island | `synthetic-progressed-city-age-7` | [tennis-after-exit](screenshots/tennis-after-exit.png) | — |
| טניס בעיר | result display fixture | `synthetic-result-display-win` | [tennis-result-win](screenshots/tennis-result-win.png) | KUX-008 |
| טניס בעיר | result display fixture | `synthetic-result-display-win` | [tennis-result-win--scroll-01](screenshots/tennis-result-win--scroll-01.png) | — |
| טניס בעיר | result display fixture | `synthetic-result-display-lose` | [tennis-result-lose](screenshots/tennis-result-lose.png) | — |
| טניס בעיר | result display fixture | `synthetic-result-display-lose` | [tennis-result-lose--scroll-01](screenshots/tennis-result-lose--scroll-01.png) | — |
| טניס בעיר | result display fixture | `synthetic-result-display-lose` | [tennis-result-lose--scroll-02](screenshots/tennis-result-lose--scroll-02.png) | — |
| מרוץ סנובורד | instructions | `synthetic-progressed-city-age-7` | [alpineRush-instructions](screenshots/alpineRush-instructions.png) | KUX-005 |
| מרוץ סנובורד | instructions | `synthetic-progressed-city-age-7` | [alpineRush-instructions--scroll-01](screenshots/alpineRush-instructions--scroll-01.png) | — |
| מרוץ סנובורד | instructions replay | `synthetic-progressed-city-age-7` | [alpineRush-instructions-replay](screenshots/alpineRush-instructions-replay.png) | — |
| מרוץ סנובורד | home | `synthetic-progressed-city-age-7` | [alpineRush-home](screenshots/alpineRush-home.png) | — |
| מרוץ סנובורד | stages / league entry | `synthetic-progressed-city-age-7` | [alpineRush-stages](screenshots/alpineRush-stages.png) | — |
| מרוץ סנובורד | stages / league entry | `synthetic-progressed-city-age-7` | [alpineRush-stages--scroll-01](screenshots/alpineRush-stages--scroll-01.png) | — |
| מרוץ סנובורד | stages / league entry | `synthetic-progressed-city-age-7` | [alpineRush-stages--scroll-02](screenshots/alpineRush-stages--scroll-02.png) | — |
| מרוץ סנובורד | upgrades | `synthetic-progressed-city-age-7` | [alpineRush-upgrades](screenshots/alpineRush-upgrades.png) | — |
| מרוץ סנובורד | upgrades | `synthetic-progressed-city-age-7` | [alpineRush-upgrades--scroll-01](screenshots/alpineRush-upgrades--scroll-01.png) | — |
| מרוץ סנובורד | equipment | `synthetic-progressed-city-age-7` | [alpineRush-equipment](screenshots/alpineRush-equipment.png) | — |
| מרוץ סנובורד | equipment | `synthetic-progressed-city-age-7` | [alpineRush-equipment--scroll-01](screenshots/alpineRush-equipment--scroll-01.png) | — |
| מרוץ סנובורד | league season | `synthetic-progressed-city-age-7` | [alpineRush-league-season](screenshots/alpineRush-league-season.png) | — |
| מרוץ סנובורד | league season | `synthetic-progressed-city-age-7` | [alpineRush-league-season--scroll-01](screenshots/alpineRush-league-season--scroll-01.png) | — |
| מרוץ סנובורד | league season | `synthetic-progressed-city-age-7` | [alpineRush-league-season--scroll-02](screenshots/alpineRush-league-season--scroll-02.png) | — |
| מרוץ סנובורד | league season | `synthetic-progressed-city-age-7` | [alpineRush-league-season--scroll-03](screenshots/alpineRush-league-season--scroll-03.png) | — |
| מרוץ סנובורד | league shop | `synthetic-progressed-city-age-7` | [alpineRush-league-shop](screenshots/alpineRush-league-shop.png) | — |
| מרוץ סנובורד | league shop | `synthetic-progressed-city-age-7` | [alpineRush-league-shop--scroll-01](screenshots/alpineRush-league-shop--scroll-01.png) | — |
| מרוץ סנובורד | startup | `synthetic-progressed-city-age-7` | [alpineRush-starting](screenshots/alpineRush-starting.png) | — |
| מרוץ סנובורד | internal start card before downhill run | `synthetic-progressed-city-age-7` | [alpineRush-playing](screenshots/alpineRush-playing.png) | — |
| מרוץ סנובורד | internal start card before downhill run | `synthetic-progressed-city-age-7` | [alpineRush-touch-held](screenshots/alpineRush-touch-held.png) | — |
| מרוץ סנובורד | internal start card before downhill run | `synthetic-progressed-city-age-7` | [alpineRush-after-controls](screenshots/alpineRush-after-controls.png) | — |
| מרוץ סנובורד | pause and exit | `synthetic-progressed-city-age-7` | [alpineRush-pause](screenshots/alpineRush-pause.png) | KUX-007 |
| מרוץ סנובורד | returned to island | `synthetic-progressed-city-age-7` | [alpineRush-after-exit](screenshots/alpineRush-after-exit.png) | — |
| מרוץ סנובורד | result display fixture | `synthetic-result-display-win` | [alpineRush-result-win](screenshots/alpineRush-result-win.png) | — |
| מרוץ סנובורד | result display fixture | `synthetic-result-display-win` | [alpineRush-result-win--scroll-01](screenshots/alpineRush-result-win--scroll-01.png) | — |
| מרוץ סנובורד | result display fixture | `synthetic-result-display-lose` | [alpineRush-result-lose](screenshots/alpineRush-result-lose.png) | — |
| מרוץ סנובורד | result display fixture | `synthetic-result-display-lose` | [alpineRush-result-lose--scroll-01](screenshots/alpineRush-result-lose--scroll-01.png) | — |
| מרוץ סנובורד | result display fixture | `synthetic-result-display-lose` | [alpineRush-result-lose--scroll-02](screenshots/alpineRush-result-lose--scroll-02.png) | — |
| מרוצי העיר | instructions | `synthetic-progressed-city-age-7` | [islandRacing-instructions](screenshots/islandRacing-instructions.png) | KUX-005 |
| מרוצי העיר | instructions | `synthetic-progressed-city-age-7` | [islandRacing-instructions--scroll-01](screenshots/islandRacing-instructions--scroll-01.png) | — |
| מרוצי העיר | instructions replay | `synthetic-progressed-city-age-7` | [islandRacing-instructions-replay](screenshots/islandRacing-instructions-replay.png) | — |
| מרוצי העיר | home | `synthetic-progressed-city-age-7` | [islandRacing-home](screenshots/islandRacing-home.png) | — |
| מרוצי העיר | stages / league entry | `synthetic-progressed-city-age-7` | [islandRacing-stages](screenshots/islandRacing-stages.png) | — |
| מרוצי העיר | stages / league entry | `synthetic-progressed-city-age-7` | [islandRacing-stages--scroll-01](screenshots/islandRacing-stages--scroll-01.png) | — |
| מרוצי העיר | upgrades | `synthetic-progressed-city-age-7` | [islandRacing-upgrades](screenshots/islandRacing-upgrades.png) | — |
| מרוצי העיר | upgrades | `synthetic-progressed-city-age-7` | [islandRacing-upgrades--scroll-01](screenshots/islandRacing-upgrades--scroll-01.png) | — |
| מרוצי העיר | equipment | `synthetic-progressed-city-age-7` | [islandRacing-equipment](screenshots/islandRacing-equipment.png) | — |
| מרוצי העיר | equipment | `synthetic-progressed-city-age-7` | [islandRacing-equipment--scroll-01](screenshots/islandRacing-equipment--scroll-01.png) | — |
| מרוצי העיר | league season | `synthetic-progressed-city-age-7` | [islandRacing-league-season](screenshots/islandRacing-league-season.png) | — |
| מרוצי העיר | league season | `synthetic-progressed-city-age-7` | [islandRacing-league-season--scroll-01](screenshots/islandRacing-league-season--scroll-01.png) | KUX-023 |
| מרוצי העיר | league season | `synthetic-progressed-city-age-7` | [islandRacing-league-season--scroll-02](screenshots/islandRacing-league-season--scroll-02.png) | KUX-023 |
| מרוצי העיר | league season | `synthetic-progressed-city-age-7` | [islandRacing-league-season--scroll-03](screenshots/islandRacing-league-season--scroll-03.png) | — |
| מרוצי העיר | league season | `synthetic-progressed-city-age-7` | [islandRacing-league-season--scroll-04](screenshots/islandRacing-league-season--scroll-04.png) | — |
| מרוצי העיר | league shop | `synthetic-progressed-city-age-7` | [islandRacing-league-shop](screenshots/islandRacing-league-shop.png) | — |
| מרוצי העיר | league shop | `synthetic-progressed-city-age-7` | [islandRacing-league-shop--scroll-01](screenshots/islandRacing-league-shop--scroll-01.png) | — |
| מרוצי העיר | startup | `synthetic-progressed-city-age-7` | [islandRacing-starting](screenshots/islandRacing-starting.png) | — |
| מרוצי העיר | race introduction / start countdown and controls | `synthetic-progressed-city-age-7` | [islandRacing-playing](screenshots/islandRacing-playing.png) | — |
| מרוצי העיר | race introduction / start countdown and controls | `synthetic-progressed-city-age-7` | [islandRacing-touch-held](screenshots/islandRacing-touch-held.png) | KUX-021, KUX-022 |
| מרוצי העיר | race introduction / start countdown and controls | `synthetic-progressed-city-age-7` | [islandRacing-after-controls](screenshots/islandRacing-after-controls.png) | — |
| מרוצי העיר | pause and exit | `synthetic-progressed-city-age-7` | [islandRacing-pause](screenshots/islandRacing-pause.png) | KUX-007 |
| מרוצי העיר | returned to island | `synthetic-progressed-city-age-7` | [islandRacing-after-exit](screenshots/islandRacing-after-exit.png) | — |
| מרוצי העיר | result display fixture | `synthetic-result-display-win` | [islandRacing-result-win](screenshots/islandRacing-result-win.png) | — |
| מרוצי העיר | result display fixture | `synthetic-result-display-win` | [islandRacing-result-win--scroll-01](screenshots/islandRacing-result-win--scroll-01.png) | — |
| מרוצי העיר | result display fixture | `synthetic-result-display-lose` | [islandRacing-result-lose](screenshots/islandRacing-result-lose.png) | — |
| מרוצי העיר | result display fixture | `synthetic-result-display-lose` | [islandRacing-result-lose--scroll-01](screenshots/islandRacing-result-lose--scroll-01.png) | — |
| מרוצי העיר | result display fixture | `synthetic-result-display-lose` | [islandRacing-result-lose--scroll-02](screenshots/islandRacing-result-lose--scroll-02.png) | — |
| האי והעיר | island-18-city-blueprint | `synthetic-progressed-city-age-7` | [island-18-city-blueprint](screenshots/island-18-city-blueprint.png) | KUX-014 |
| האי והעיר | island-18-city-blueprint--scroll-01 | `synthetic-progressed-city-age-7` | [island-18-city-blueprint--scroll-01](screenshots/island-18-city-blueprint--scroll-01.png) | — |
| האי והעיר | island-18-city-blueprint--scroll-02 | `synthetic-progressed-city-age-7` | [island-18-city-blueprint--scroll-02](screenshots/island-18-city-blueprint--scroll-02.png) | — |
| האי והעיר | island-18-city-blueprint--scroll-03 | `synthetic-progressed-city-age-7` | [island-18-city-blueprint--scroll-03](screenshots/island-18-city-blueprint--scroll-03.png) | — |
| האי והעיר | island-18-city-blueprint--scroll-04 | `synthetic-progressed-city-age-7` | [island-18-city-blueprint--scroll-04](screenshots/island-18-city-blueprint--scroll-04.png) | — |
| האי והעיר | island-18-city-blueprint--scroll-05 | `synthetic-progressed-city-age-7` | [island-18-city-blueprint--scroll-05](screenshots/island-18-city-blueprint--scroll-05.png) | — |
| האי והעיר | island-18-city-blueprint--scroll-06 | `synthetic-progressed-city-age-7` | [island-18-city-blueprint--scroll-06](screenshots/island-18-city-blueprint--scroll-06.png) | — |
| האי והעיר | island-18-city-blueprint--scroll-07 | `synthetic-progressed-city-age-7` | [island-18-city-blueprint--scroll-07](screenshots/island-18-city-blueprint--scroll-07.png) | — |
| האי והעיר | island-18-city-blueprint--scroll-08 | `synthetic-progressed-city-age-7` | [island-18-city-blueprint--scroll-08](screenshots/island-18-city-blueprint--scroll-08.png) | — |
| האי והעיר | island-18-city-blueprint--scroll-09 | `synthetic-progressed-city-age-7` | [island-18-city-blueprint--scroll-09](screenshots/island-18-city-blueprint--scroll-09.png) | — |
| האי והעיר | island-18-city-overview | `synthetic-progressed-city-age-7` | [island-18-city-overview](screenshots/island-18-city-overview.png) | — |
| האי והעיר | island-18-city-overview--scroll-01 | `synthetic-progressed-city-age-7` | [island-18-city-overview--scroll-01](screenshots/island-18-city-overview--scroll-01.png) | — |
| האי והעיר | island-18-city-overview--scroll-02 | `synthetic-progressed-city-age-7` | [island-18-city-overview--scroll-02](screenshots/island-18-city-overview--scroll-02.png) | — |
| האי והעיר | island-18-city-overview--scroll-03 | `synthetic-progressed-city-age-7` | [island-18-city-overview--scroll-03](screenshots/island-18-city-overview--scroll-03.png) | — |
| האי והעיר | island-18-city-budget | `synthetic-progressed-city-age-7` | [island-18-city-budget](screenshots/island-18-city-budget.png) | KUX-014 |
| האי והעיר | island-18-city-budget--scroll-01 | `synthetic-progressed-city-age-7` | [island-18-city-budget--scroll-01](screenshots/island-18-city-budget--scroll-01.png) | — |
| האי והעיר | island-18-city-budget--scroll-02 | `synthetic-progressed-city-age-7` | [island-18-city-budget--scroll-02](screenshots/island-18-city-budget--scroll-02.png) | — |
| האי והעיר | island-18-city-budget--scroll-03 | `synthetic-progressed-city-age-7` | [island-18-city-budget--scroll-03](screenshots/island-18-city-budget--scroll-03.png) | — |
| האי והעיר | island-18-city-budget--scroll-04 | `synthetic-progressed-city-age-7` | [island-18-city-budget--scroll-04](screenshots/island-18-city-budget--scroll-04.png) | — |
| האי והעיר | island-18-city-zones | `synthetic-progressed-city-age-7` | [island-18-city-zones](screenshots/island-18-city-zones.png) | — |
| האי והעיר | island-18-city-zones--scroll-01 | `synthetic-progressed-city-age-7` | [island-18-city-zones--scroll-01](screenshots/island-18-city-zones--scroll-01.png) | — |
| האי והעיר | island-19-ready-plots | `synthetic-progressed-city-age-7` | [island-19-ready-plots](screenshots/island-19-ready-plots.png) | — |
| האי והעיר | island-19-ready-plots--scroll-01 | `synthetic-progressed-city-age-7` | [island-19-ready-plots--scroll-01](screenshots/island-19-ready-plots--scroll-01.png) | — |
| האי והעיר | island-19-ready-plots--scroll-02 | `synthetic-progressed-city-age-7` | [island-19-ready-plots--scroll-02](screenshots/island-19-ready-plots--scroll-02.png) | — |
| האי והעיר | island-19-ready-plots--scroll-03 | `synthetic-progressed-city-age-7` | [island-19-ready-plots--scroll-03](screenshots/island-19-ready-plots--scroll-03.png) | — |
| האי והעיר | island-19-ready-plots--scroll-04 | `synthetic-progressed-city-age-7` | [island-19-ready-plots--scroll-04](screenshots/island-19-ready-plots--scroll-04.png) | — |
| האי והעיר | island-19-ready-plots--scroll-05 | `synthetic-progressed-city-age-7` | [island-19-ready-plots--scroll-05](screenshots/island-19-ready-plots--scroll-05.png) | — |
| האי והעיר | island-19-ready-plots--scroll-06 | `synthetic-progressed-city-age-7` | [island-19-ready-plots--scroll-06](screenshots/island-19-ready-plots--scroll-06.png) | — |
| האי והעיר | island-19-ready-plots--scroll-07 | `synthetic-progressed-city-age-7` | [island-19-ready-plots--scroll-07](screenshots/island-19-ready-plots--scroll-07.png) | — |
| האי והעיר | island-19-ready-plots--scroll-08 | `synthetic-progressed-city-age-7` | [island-19-ready-plots--scroll-08](screenshots/island-19-ready-plots--scroll-08.png) | — |
| האי והעיר | island-19-ready-plots--scroll-09 | `synthetic-progressed-city-age-7` | [island-19-ready-plots--scroll-09](screenshots/island-19-ready-plots--scroll-09.png) | — |
| האי והעיר | island-20-ready-build-confirm | `synthetic-progressed-city-age-7` | [island-20-ready-build-confirm](screenshots/island-20-ready-build-confirm.png) | — |
| האי והעיר | island-21-building-info | `synthetic-progressed-city-age-7` | [island-21-building-info](screenshots/island-21-building-info.png) | — |
| האי והעיר | island-21-building-info--scroll-01 | `synthetic-progressed-city-age-7` | [island-21-building-info--scroll-01](screenshots/island-21-building-info--scroll-01.png) | — |
| האי והעיר | island-21-building-info--scroll-02 | `synthetic-progressed-city-age-7` | [island-21-building-info--scroll-02](screenshots/island-21-building-info--scroll-02.png) | — |
| האי והעיר | island-22-placement-valid | `synthetic-progressed-city-age-7` | [island-22-placement-valid](screenshots/island-22-placement-valid.png) | — |
| האי והעיר | island-23-placement-invalid | `synthetic-progressed-city-age-7` | [island-23-placement-invalid](screenshots/island-23-placement-invalid.png) | — |
| האי והעיר | island-24-coverage-water | `synthetic-progressed-city-age-7` | [island-24-coverage-water](screenshots/island-24-coverage-water.png) | — |
| האי והעיר | island-24-coverage-health | `synthetic-progressed-city-age-7` | [island-24-coverage-health](screenshots/island-24-coverage-health.png) | — |
| האי והעיר | island-24-coverage-education | `synthetic-progressed-city-age-7` | [island-24-coverage-education](screenshots/island-24-coverage-education.png) | — |
| האי והעיר | island-24-coverage-safety | `synthetic-progressed-city-age-7` | [island-24-coverage-safety](screenshots/island-24-coverage-safety.png) | — |
| האי והעיר | island-25-exit-confirm | `synthetic-progressed-city-age-7` | [island-25-exit-confirm](screenshots/island-25-exit-confirm.png) | — |
| האי והעיר | island-26-daily-locked | `synthetic-next-day-locked-age-7` | [island-26-daily-locked](screenshots/island-26-daily-locked.png) | KUX-028 |
| האי והעיר | island-26-daily-locked--scroll-01 | `synthetic-next-day-locked-age-7` | [island-26-daily-locked--scroll-01](screenshots/island-26-daily-locked--scroll-01.png) | — |
| למידה | learning-language-question | `synthetic-progressed-city-age-7` | [learning-language-question](screenshots/learning-language-question.png) | KUX-027 |
| למידה | learning-language-wrong | `synthetic-progressed-city-age-7` | [learning-language-wrong](screenshots/learning-language-wrong.png) | — |
| למידה | learning-language-correct | `synthetic-progressed-city-age-7` | [learning-language-correct](screenshots/learning-language-correct.png) | — |
| למידה | learning-language-result | `synthetic-learning-completion-age-7` | [learning-language-result](screenshots/learning-language-result.png) | — |
| למידה | learning-language-result--scroll-01 | `synthetic-learning-completion-age-7` | [learning-language-result--scroll-01](screenshots/learning-language-result--scroll-01.png) | — |
| למידה | learning-math-question | `synthetic-progressed-city-age-7` | [learning-math-question](screenshots/learning-math-question.png) | — |
| למידה | learning-math-wrong | `synthetic-progressed-city-age-7` | [learning-math-wrong](screenshots/learning-math-wrong.png) | — |
| למידה | learning-math-correct | `synthetic-progressed-city-age-7` | [learning-math-correct](screenshots/learning-math-correct.png) | — |
| למידה | learning-math-result | `synthetic-learning-completion-age-7` | [learning-math-result](screenshots/learning-math-result.png) | — |
| למידה | learning-math-result--scroll-01 | `synthetic-learning-completion-age-7` | [learning-math-result--scroll-01](screenshots/learning-math-result--scroll-01.png) | — |
| למידה | learning-animals-question | `synthetic-progressed-city-age-7` | [learning-animals-question](screenshots/learning-animals-question.png) | — |
| למידה | learning-animals-wrong | `synthetic-progressed-city-age-7` | [learning-animals-wrong](screenshots/learning-animals-wrong.png) | — |
| למידה | learning-animals-correct | `synthetic-progressed-city-age-7` | [learning-animals-correct](screenshots/learning-animals-correct.png) | — |
| למידה | learning-animals-result | `synthetic-learning-completion-age-7` | [learning-animals-result](screenshots/learning-animals-result.png) | — |
| למידה | learning-animals-result--scroll-01 | `synthetic-learning-completion-age-7` | [learning-animals-result--scroll-01](screenshots/learning-animals-result--scroll-01.png) | — |
| למידה | learning-puzzles-question | `synthetic-progressed-city-age-7` | [learning-puzzles-question](screenshots/learning-puzzles-question.png) | — |
| למידה | learning-puzzles-wrong | `synthetic-progressed-city-age-7` | [learning-puzzles-wrong](screenshots/learning-puzzles-wrong.png) | — |
| למידה | learning-puzzles-correct | `synthetic-progressed-city-age-7` | [learning-puzzles-correct](screenshots/learning-puzzles-correct.png) | — |
| למידה | learning-puzzles-result | `synthetic-learning-completion-age-7` | [learning-puzzles-result](screenshots/learning-puzzles-result.png) | — |
| למידה | learning-puzzles-result--scroll-01 | `synthetic-learning-completion-age-7` | [learning-puzzles-result--scroll-01](screenshots/learning-puzzles-result--scroll-01.png) | — |
| האי והעיר | island-27-event-fire | `synthetic-progressed-city-age-7` | [island-27-event-fire](screenshots/island-27-event-fire.png) | — |
| האי והעיר | island-27-event-aliens | `synthetic-progressed-city-age-7` | [island-27-event-aliens](screenshots/island-27-event-aliens.png) | — |
| האי והעיר | island-27-event-ship | `synthetic-progressed-city-age-7` | [island-27-event-ship](screenshots/island-27-event-ship.png) | — |
| קרב ספינות | instructions | `synthetic-progressed-city-age-7` | [navalDuel-instructions](screenshots/navalDuel-instructions.png) | — |
| קרב ספינות | instructions | `synthetic-progressed-city-age-7` | [navalDuel-instructions--scroll-01](screenshots/navalDuel-instructions--scroll-01.png) | — |
| קרב ספינות | instructions | `synthetic-progressed-city-age-7` | [navalDuel-instructions--scroll-02](screenshots/navalDuel-instructions--scroll-02.png) | — |
| קרב ספינות | instructions replay | `synthetic-progressed-city-age-7` | [navalDuel-instructions-replay](screenshots/navalDuel-instructions-replay.png) | — |
| קרב ספינות | home | `synthetic-progressed-city-age-7` | [navalDuel-home](screenshots/navalDuel-home.png) | — |
| קרב ספינות | stages / league entry | `synthetic-progressed-city-age-7` | [navalDuel-stages](screenshots/navalDuel-stages.png) | — |
| קרב ספינות | stages / league entry | `synthetic-progressed-city-age-7` | [navalDuel-stages--scroll-01](screenshots/navalDuel-stages--scroll-01.png) | — |
| קרב ספינות | stages / league entry | `synthetic-progressed-city-age-7` | [navalDuel-stages--scroll-02](screenshots/navalDuel-stages--scroll-02.png) | — |
| קרב ספינות | stages / league entry | `synthetic-progressed-city-age-7` | [navalDuel-stages--scroll-03](screenshots/navalDuel-stages--scroll-03.png) | — |
| קרב ספינות | upgrades | `synthetic-progressed-city-age-7` | [navalDuel-upgrades](screenshots/navalDuel-upgrades.png) | — |
| קרב ספינות | upgrades | `synthetic-progressed-city-age-7` | [navalDuel-upgrades--scroll-01](screenshots/navalDuel-upgrades--scroll-01.png) | — |
| קרב ספינות | equipment | `synthetic-progressed-city-age-7` | [navalDuel-equipment](screenshots/navalDuel-equipment.png) | — |
| קרב ספינות | equipment | `synthetic-progressed-city-age-7` | [navalDuel-equipment--scroll-01](screenshots/navalDuel-equipment--scroll-01.png) | — |
| קרב ספינות | equipment | `synthetic-progressed-city-age-7` | [navalDuel-equipment--scroll-02](screenshots/navalDuel-equipment--scroll-02.png) | — |
| קרב ספינות | equipment | `synthetic-progressed-city-age-7` | [navalDuel-equipment--scroll-03](screenshots/navalDuel-equipment--scroll-03.png) | — |
| קרב ספינות | startup | `synthetic-progressed-city-age-7` | [navalDuel-starting](screenshots/navalDuel-starting.png) | — |
| קרב ספינות | live play | `synthetic-progressed-city-age-7` | [navalDuel-playing](screenshots/navalDuel-playing.png) | — |
| קרב ספינות | two thumbs / live touch | `synthetic-progressed-city-age-7` | [navalDuel-touch-held](screenshots/navalDuel-touch-held.png) | — |
| קרב ספינות | control feedback | `synthetic-progressed-city-age-7` | [navalDuel-after-controls](screenshots/navalDuel-after-controls.png) | — |
| קרב ספינות | pause and exit | `synthetic-progressed-city-age-7` | [navalDuel-pause](screenshots/navalDuel-pause.png) | — |
| קרב ספינות | returned to island | `synthetic-progressed-city-age-7` | [navalDuel-after-exit](screenshots/navalDuel-after-exit.png) | — |
| קרב ספינות | result display fixture | `synthetic-result-display-win` | [navalDuel-result-win](screenshots/navalDuel-result-win.png) | — |
| קרב ספינות | result display fixture | `synthetic-result-display-win` | [navalDuel-result-win--scroll-01](screenshots/navalDuel-result-win--scroll-01.png) | — |
| קרב ספינות | result display fixture | `synthetic-result-display-lose` | [navalDuel-result-lose](screenshots/navalDuel-result-lose.png) | — |
| קרב ספינות | result display fixture | `synthetic-result-display-lose` | [navalDuel-result-lose--scroll-01](screenshots/navalDuel-result-lose--scroll-01.png) | — |
| הגנה מפני חייזרים | instructions | `synthetic-progressed-city-age-7` | [alienDefense-instructions](screenshots/alienDefense-instructions.png) | — |
| הגנה מפני חייזרים | instructions | `synthetic-progressed-city-age-7` | [alienDefense-instructions--scroll-01](screenshots/alienDefense-instructions--scroll-01.png) | — |
| הגנה מפני חייזרים | instructions replay | `synthetic-progressed-city-age-7` | [alienDefense-instructions-replay](screenshots/alienDefense-instructions-replay.png) | — |
| הגנה מפני חייזרים | home | `synthetic-progressed-city-age-7` | [alienDefense-home](screenshots/alienDefense-home.png) | — |
| הגנה מפני חייזרים | stages / league entry | `synthetic-progressed-city-age-7` | [alienDefense-stages](screenshots/alienDefense-stages.png) | — |
| הגנה מפני חייזרים | stages / league entry | `synthetic-progressed-city-age-7` | [alienDefense-stages--scroll-01](screenshots/alienDefense-stages--scroll-01.png) | — |
| הגנה מפני חייזרים | stages / league entry | `synthetic-progressed-city-age-7` | [alienDefense-stages--scroll-02](screenshots/alienDefense-stages--scroll-02.png) | — |
| הגנה מפני חייזרים | stages / league entry | `synthetic-progressed-city-age-7` | [alienDefense-stages--scroll-03](screenshots/alienDefense-stages--scroll-03.png) | — |
| הגנה מפני חייזרים | stages / league entry | `synthetic-progressed-city-age-7` | [alienDefense-stages--scroll-04](screenshots/alienDefense-stages--scroll-04.png) | — |
| הגנה מפני חייזרים | upgrades | `synthetic-progressed-city-age-7` | [alienDefense-upgrades](screenshots/alienDefense-upgrades.png) | — |
| הגנה מפני חייזרים | upgrades | `synthetic-progressed-city-age-7` | [alienDefense-upgrades--scroll-01](screenshots/alienDefense-upgrades--scroll-01.png) | — |
| הגנה מפני חייזרים | equipment | `synthetic-progressed-city-age-7` | [alienDefense-equipment](screenshots/alienDefense-equipment.png) | — |
| הגנה מפני חייזרים | equipment | `synthetic-progressed-city-age-7` | [alienDefense-equipment--scroll-01](screenshots/alienDefense-equipment--scroll-01.png) | — |
| הגנה מפני חייזרים | hangar | `synthetic-progressed-city-age-7` | [alienDefense-hangar](screenshots/alienDefense-hangar.png) | — |
| הגנה מפני חייזרים | startup | `synthetic-progressed-city-age-7` | [alienDefense-starting](screenshots/alienDefense-starting.png) | — |
| הגנה מפני חייזרים | live play | `synthetic-progressed-city-age-7` | [alienDefense-playing](screenshots/alienDefense-playing.png) | KUX-032 |
| הגנה מפני חייזרים | two thumbs / live touch | `synthetic-progressed-city-age-7` | [alienDefense-touch-held](screenshots/alienDefense-touch-held.png) | — |
| הגנה מפני חייזרים | control feedback | `synthetic-progressed-city-age-7` | [alienDefense-after-controls](screenshots/alienDefense-after-controls.png) | — |
| הגנה מפני חייזרים | pause and exit | `synthetic-progressed-city-age-7` | [alienDefense-pause](screenshots/alienDefense-pause.png) | — |
| הגנה מפני חייזרים | returned to island | `synthetic-progressed-city-age-7` | [alienDefense-after-exit](screenshots/alienDefense-after-exit.png) | — |
| הגנה מפני חייזרים | result display fixture | `synthetic-result-display-win` | [alienDefense-result-win](screenshots/alienDefense-result-win.png) | — |
| הגנה מפני חייזרים | result display fixture | `synthetic-result-display-win` | [alienDefense-result-win--scroll-01](screenshots/alienDefense-result-win--scroll-01.png) | — |
| הגנה מפני חייזרים | result display fixture | `synthetic-result-display-lose` | [alienDefense-result-lose](screenshots/alienDefense-result-lose.png) | — |
| הגנה מפני חייזרים | result display fixture | `synthetic-result-display-lose` | [alienDefense-result-lose--scroll-01](screenshots/alienDefense-result-lose--scroll-01.png) | — |
| הגנה מפני חייזרים | result display fixture | `synthetic-result-display-lose` | [alienDefense-result-lose--scroll-02](screenshots/alienDefense-result-lose--scroll-02.png) | — |
| כיבוי שריפה | instructions | `synthetic-progressed-city-age-7` | [fireRescue-instructions](screenshots/fireRescue-instructions.png) | — |
| כיבוי שריפה | instructions | `synthetic-progressed-city-age-7` | [fireRescue-instructions--scroll-01](screenshots/fireRescue-instructions--scroll-01.png) | — |
| כיבוי שריפה | instructions replay | `synthetic-progressed-city-age-7` | [fireRescue-instructions-replay](screenshots/fireRescue-instructions-replay.png) | — |
| כיבוי שריפה | home | `synthetic-progressed-city-age-7` | [fireRescue-home](screenshots/fireRescue-home.png) | — |
| כיבוי שריפה | stages / league entry | `synthetic-progressed-city-age-7` | [fireRescue-stages](screenshots/fireRescue-stages.png) | — |
| כיבוי שריפה | stages / league entry | `synthetic-progressed-city-age-7` | [fireRescue-stages--scroll-01](screenshots/fireRescue-stages--scroll-01.png) | — |
| כיבוי שריפה | stages / league entry | `synthetic-progressed-city-age-7` | [fireRescue-stages--scroll-02](screenshots/fireRescue-stages--scroll-02.png) | — |
| כיבוי שריפה | stages / league entry | `synthetic-progressed-city-age-7` | [fireRescue-stages--scroll-03](screenshots/fireRescue-stages--scroll-03.png) | — |
| כיבוי שריפה | stages / league entry | `synthetic-progressed-city-age-7` | [fireRescue-stages--scroll-04](screenshots/fireRescue-stages--scroll-04.png) | — |
| כיבוי שריפה | upgrades | `synthetic-progressed-city-age-7` | [fireRescue-upgrades](screenshots/fireRescue-upgrades.png) | — |
| כיבוי שריפה | upgrades | `synthetic-progressed-city-age-7` | [fireRescue-upgrades--scroll-01](screenshots/fireRescue-upgrades--scroll-01.png) | — |
| כיבוי שריפה | equipment | `synthetic-progressed-city-age-7` | [fireRescue-equipment](screenshots/fireRescue-equipment.png) | — |
| כיבוי שריפה | equipment | `synthetic-progressed-city-age-7` | [fireRescue-equipment--scroll-01](screenshots/fireRescue-equipment--scroll-01.png) | — |
| כיבוי שריפה | certificates | `synthetic-progressed-city-age-7` | [fireRescue-certificates](screenshots/fireRescue-certificates.png) | — |
| כיבוי שריפה | startup | `synthetic-progressed-city-age-7` | [fireRescue-starting](screenshots/fireRescue-starting.png) | — |
| כיבוי שריפה | live play | `synthetic-progressed-city-age-7` | [fireRescue-playing](screenshots/fireRescue-playing.png) | — |
| כיבוי שריפה | two thumbs / live touch | `synthetic-progressed-city-age-7` | [fireRescue-touch-held](screenshots/fireRescue-touch-held.png) | — |
| כיבוי שריפה | control feedback | `synthetic-progressed-city-age-7` | [fireRescue-after-controls](screenshots/fireRescue-after-controls.png) | — |
| כיבוי שריפה | pause and exit | `synthetic-progressed-city-age-7` | [fireRescue-pause](screenshots/fireRescue-pause.png) | — |
| כיבוי שריפה | returned to island | `synthetic-progressed-city-age-7` | [fireRescue-after-exit](screenshots/fireRescue-after-exit.png) | — |
| כיבוי שריפה | result display fixture | `synthetic-result-display-win` | [fireRescue-result-win](screenshots/fireRescue-result-win.png) | — |
| כיבוי שריפה | result display fixture | `synthetic-result-display-win` | [fireRescue-result-win--scroll-01](screenshots/fireRescue-result-win--scroll-01.png) | — |
| כיבוי שריפה | result display fixture | `synthetic-result-display-lose` | [fireRescue-result-lose](screenshots/fireRescue-result-lose.png) | — |
| כיבוי שריפה | result display fixture | `synthetic-result-display-lose` | [fireRescue-result-lose--scroll-01](screenshots/fireRescue-result-lose--scroll-01.png) | — |
| כיבוי שריפה | result display fixture | `synthetic-result-display-lose` | [fireRescue-result-lose--scroll-02](screenshots/fireRescue-result-lose--scroll-02.png) | — |
| כיבוי שריפה | entry building on street | `synthetic-unlocked-progress-age-7` | [fireRescue-entry-3-street](screenshots/fireRescue-entry-3-street.png) | — |
| כיבוי שריפה | entry button | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-3-ready](screenshots/fireRescue-entry-3-ready.png) | — |
| כיבוי שריפה | early interior transition; visible lesson captured separately | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-3-lesson](screenshots/fireRescue-entry-3-lesson.png) | — |
| כיבוי שריפה | early interior transition; visible lesson captured separately | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-3-room](screenshots/fireRescue-entry-3-room.png) | — |
| כיבוי שריפה | direct touch on fire | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-3-spray](screenshots/fireRescue-entry-3-spray.png) | — |
| כיבוי שריפה | clock near timeout | `synthetic-clock-near-timeout` | [fireRescue-entry-3-clock](screenshots/fireRescue-entry-3-clock.png) | — |
| כיבוי שריפה | pause inside building | `synthetic-clock-near-timeout` | [fireRescue-entry-3-pause](screenshots/fireRescue-entry-3-pause.png) | — |
| כיבוי שריפה | entry building on street | `synthetic-clock-near-timeout` | [fireRescue-entry-12-street](screenshots/fireRescue-entry-12-street.png) | — |
| כיבוי שריפה | entry button | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-12-ready](screenshots/fireRescue-entry-12-ready.png) | — |
| כיבוי שריפה | early interior transition; visible lesson captured separately | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-12-lesson](screenshots/fireRescue-entry-12-lesson.png) | — |
| כיבוי שריפה | early interior transition; visible lesson captured separately | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-12-room](screenshots/fireRescue-entry-12-room.png) | — |
| כיבוי שריפה | direct touch on fire | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-12-spray](screenshots/fireRescue-entry-12-spray.png) | — |
| כיבוי שריפה | clock near timeout | `synthetic-clock-near-timeout` | [fireRescue-entry-12-clock](screenshots/fireRescue-entry-12-clock.png) | KUX-031 |
| כיבוי שריפה | pause inside building | `synthetic-clock-near-timeout` | [fireRescue-entry-12-pause](screenshots/fireRescue-entry-12-pause.png) | — |
| כיבוי שריפה | bonus targets introduction | `synthetic-unlocked-fire-bonus` | [fireRescue-bonus-targets-intro](screenshots/fireRescue-bonus-targets-intro.png) | — |
| כיבוי שריפה | bonus targets live | `synthetic-unlocked-fire-bonus` | [fireRescue-bonus-targets-play](screenshots/fireRescue-bonus-targets-play.png) | — |
| כיבוי שריפה | bonus targets pause | `synthetic-unlocked-fire-bonus` | [fireRescue-bonus-targets-pause](screenshots/fireRescue-bonus-targets-pause.png) | — |
| כיבוי שריפה | bonus interior introduction | `synthetic-unlocked-fire-bonus` | [fireRescue-bonus-interior-intro](screenshots/fireRescue-bonus-interior-intro.png) | — |
| כיבוי שריפה | bonus interior live | `synthetic-unlocked-fire-bonus` | [fireRescue-bonus-interior-play](screenshots/fireRescue-bonus-interior-play.png) | — |
| כיבוי שריפה | bonus interior pause | `synthetic-unlocked-fire-bonus` | [fireRescue-bonus-interior-pause](screenshots/fireRescue-bonus-interior-pause.png) | — |
| ליגת העיר בכדורגל | practice targets | `synthetic-progressed-city-age-7` | [soccer-drill-targets](screenshots/soccer-drill-targets.png) | — |
| ליגת העיר בכדורגל | practice penalties | `synthetic-progressed-city-age-7` | [soccer-drill-penalties](screenshots/soccer-drill-penalties.png) | — |
| ליגת העיר בכדורגל | practice cones | `synthetic-progressed-city-age-7` | [soccer-drill-cones](screenshots/soccer-drill-cones.png) | — |
| מרוץ סנובורד | internal start card | `synthetic-progressed-city-age-7` | [alpineRush-league-internal-start-card](screenshots/alpineRush-league-internal-start-card.png) | — |
| מרוץ סנובורד | live league stage | `synthetic-progressed-city-age-7` | [alpineRush-league-live](screenshots/alpineRush-league-live.png) | KUX-029, KUX-030 |
| מרוץ סנובורד | two thumbs / live touch | `synthetic-progressed-city-age-7` | [alpineRush-league-touch-held](screenshots/alpineRush-league-touch-held.png) | — |
| מרוץ סנובורד | control feedback | `synthetic-progressed-city-age-7` | [alpineRush-league-after-controls](screenshots/alpineRush-league-after-controls.png) | — |
| מרוץ סנובורד | league pause | `synthetic-progressed-city-age-7` | [alpineRush-league-pause](screenshots/alpineRush-league-pause.png) | — |
| מרוצי העיר | internal start card | `synthetic-progressed-city-age-7` | [islandRacing-league-internal-start-card](screenshots/islandRacing-league-internal-start-card.png) | — |
| מרוצי העיר | verified live league race | `synthetic-progressed-city-age-7` | [islandRacing-league-live](screenshots/islandRacing-league-live.png) | — |
| מרוצי העיר | two thumbs / live touch | `synthetic-progressed-city-age-7` | [islandRacing-league-touch-held](screenshots/islandRacing-league-touch-held.png) | — |
| מרוצי העיר | control feedback | `synthetic-progressed-city-age-7` | [islandRacing-league-after-controls](screenshots/islandRacing-league-after-controls.png) | — |
| מרוצי העיר | racing-auto | `synthetic-progressed-city-age-7` | [islandRacing-racing-auto](screenshots/islandRacing-racing-auto.png) | — |
| מרוצי העיר | racing-pit | `synthetic-progressed-city-age-7` | [islandRacing-racing-pit](screenshots/islandRacing-racing-pit.png) | — |
| מרוצי העיר | live league pause | `synthetic-progressed-city-age-7` | [islandRacing-league-pause](screenshots/islandRacing-league-pause.png) | — |
| ליגת העיר בכדורסל | actual shot and movement | `synthetic-progressed-city-age-7` | [streetSlam-shot-two-thumbs](screenshots/streetSlam-shot-two-thumbs.png) | — |
| ליגת העיר בכדורסל | uniform picker | `synthetic-progressed-city-age-7` | [streetSlam-uniform-picker](screenshots/streetSlam-uniform-picker.png) | — |
| ליגת העיר בכדורסל | timeout request rejected while opponent holds ball | `synthetic-progressed-city-age-7` | [streetSlam-timeout](screenshots/streetSlam-timeout.png) | KUX-039 |
| מרוצי העיר | league result fixture | `synthetic-result-display-league` | [islandRacing-league-result](screenshots/islandRacing-league-result.png) | — |
| מרוצי העיר | league result fixture | `synthetic-result-display-league` | [islandRacing-league-result--scroll-01](screenshots/islandRacing-league-result--scroll-01.png) | — |
| מרוץ סנובורד | league result fixture | `synthetic-result-display-league` | [alpineRush-league-result](screenshots/alpineRush-league-result.png) | — |
| מרוץ סנובורד | league result fixture | `synthetic-result-display-league` | [alpineRush-league-result--scroll-01](screenshots/alpineRush-league-result--scroll-01.png) | — |
| למידה | word | `synthetic-learning-age-7-level-4` | [learning-variant-word](screenshots/learning-variant-word.png) | — |
| למידה | word touched | `synthetic-learning-age-7-level-4` | [learning-variant-word-touched](screenshots/learning-variant-word-touched.png) | — |
| למידה | memory | `synthetic-learning-age-7-level-4` | [learning-variant-memory](screenshots/learning-variant-memory.png) | KUX-037 |
| למידה | memory touched | `synthetic-learning-age-7-level-4` | [learning-variant-memory-touched](screenshots/learning-variant-memory-touched.png) | — |
| למידה | jigsaw | `synthetic-learning-age-7-level-4` | [learning-variant-jigsaw](screenshots/learning-variant-jigsaw.png) | KUX-038 |
| למידה | jigsaw touched | `synthetic-learning-age-7-level-4` | [learning-variant-jigsaw-touched](screenshots/learning-variant-jigsaw-touched.png) | KUX-038 |
| תפוס את הפושע | instructions | `synthetic-progressed-city-age-7` | [catchCriminal-instructions](screenshots/catchCriminal-instructions.png) | — |
| תפוס את הפושע | instructions replay | `synthetic-progressed-city-age-7` | [catchCriminal-instructions-replay](screenshots/catchCriminal-instructions-replay.png) | — |
| תפוס את הפושע | home | `synthetic-progressed-city-age-7` | [catchCriminal-home](screenshots/catchCriminal-home.png) | — |
| תפוס את הפושע | stages / league entry | `synthetic-progressed-city-age-7` | [catchCriminal-stages](screenshots/catchCriminal-stages.png) | — |
| תפוס את הפושע | stages / league entry | `synthetic-progressed-city-age-7` | [catchCriminal-stages--scroll-01](screenshots/catchCriminal-stages--scroll-01.png) | — |
| תפוס את הפושע | upgrades | `synthetic-progressed-city-age-7` | [catchCriminal-upgrades](screenshots/catchCriminal-upgrades.png) | — |
| תפוס את הפושע | upgrades | `synthetic-progressed-city-age-7` | [catchCriminal-upgrades--scroll-01](screenshots/catchCriminal-upgrades--scroll-01.png) | — |
| תפוס את הפושע | equipment | `synthetic-progressed-city-age-7` | [catchCriminal-equipment](screenshots/catchCriminal-equipment.png) | — |
| תפוס את הפושע | equipment | `synthetic-progressed-city-age-7` | [catchCriminal-equipment--scroll-01](screenshots/catchCriminal-equipment--scroll-01.png) | — |
| תפוס את הפושע | startup | `synthetic-progressed-city-age-7` | [catchCriminal-starting](screenshots/catchCriminal-starting.png) | — |
| תפוס את הפושע | live play | `synthetic-progressed-city-age-7` | [catchCriminal-playing](screenshots/catchCriminal-playing.png) | — |
| תפוס את הפושע | first chase help | `synthetic-progressed-city-age-7` | [catchCriminal-in-game-help](screenshots/catchCriminal-in-game-help.png) | KUX-035 |
| תפוס את הפושע | two thumbs / live touch | `synthetic-progressed-city-age-7` | [catchCriminal-touch-held](screenshots/catchCriminal-touch-held.png) | — |
| תפוס את הפושע | control feedback | `synthetic-progressed-city-age-7` | [catchCriminal-after-controls](screenshots/catchCriminal-after-controls.png) | — |
| תפוס את הפושע | chase controls | `synthetic-progressed-city-age-7` | [catchCriminal-chase-controls](screenshots/catchCriminal-chase-controls.png) | — |
| תפוס את הפושע | chase to capture transition | `synthetic-accelerated-chase-completion` | [catchCriminal-stop-transition](screenshots/catchCriminal-stop-transition.png) | — |
| תפוס את הפושע | capture aim | `synthetic-accelerated-chase-completion` | [catchCriminal-capture-aim](screenshots/catchCriminal-capture-aim.png) | KUX-036 |
| תפוס את הפושע | capture drag held | `synthetic-accelerated-chase-completion` | [catchCriminal-capture-held](screenshots/catchCriminal-capture-held.png) | — |
| תפוס את הפושע | capture release | `synthetic-accelerated-chase-completion` | [catchCriminal-capture-release](screenshots/catchCriminal-capture-release.png) | — |
| תפוס את הפושע | pause and exit | `synthetic-progressed-city-age-7` | [catchCriminal-pause](screenshots/catchCriminal-pause.png) | — |
| תפוס את הפושע | returned to island | `synthetic-progressed-city-age-7` | [catchCriminal-after-exit](screenshots/catchCriminal-after-exit.png) | — |
| תפוס את הפושע | result display fixture | `synthetic-result-display-win` | [catchCriminal-result-win](screenshots/catchCriminal-result-win.png) | — |
| תפוס את הפושע | result display fixture | `synthetic-result-display-win` | [catchCriminal-result-win--scroll-01](screenshots/catchCriminal-result-win--scroll-01.png) | — |
| תפוס את הפושע | result display fixture | `synthetic-result-display-lose` | [catchCriminal-result-lose](screenshots/catchCriminal-result-lose.png) | — |
| תפוס את הפושע | result display fixture | `synthetic-result-display-lose` | [catchCriminal-result-lose--scroll-01](screenshots/catchCriminal-result-lose--scroll-01.png) | — |
| אי החזירים | instructions | `synthetic-progressed-city-age-7` | [boarDefense-instructions](screenshots/boarDefense-instructions.png) | KUX-005 |
| אי החזירים | instructions | `synthetic-progressed-city-age-7` | [boarDefense-instructions--scroll-01](screenshots/boarDefense-instructions--scroll-01.png) | — |
| אי החזירים | instructions replay | `synthetic-progressed-city-age-7` | [boarDefense-instructions-replay](screenshots/boarDefense-instructions-replay.png) | KUX-006 |
| אי החזירים | startup | `synthetic-progressed-city-age-7` | [boarDefense-starting](screenshots/boarDefense-starting.png) | — |
| אי החזירים | live play | `synthetic-progressed-city-age-7` | [boarDefense-playing](screenshots/boarDefense-playing.png) | — |
| אי החזירים | embedded campaign menu | `synthetic-progressed-city-age-7` | [boarDefense-campaign-menu](screenshots/boarDefense-campaign-menu.png) | KUX-024 |
| אי החזירים | embedded campaign menu | `synthetic-progressed-city-age-7` | [boarDefense-campaign-menu--scroll-01](screenshots/boarDefense-campaign-menu--scroll-01.png) | — |
| אי החזירים | help | `synthetic-progressed-city-age-7` | [boarDefense-help](screenshots/boarDefense-help.png) | KUX-026 |
| אי החזירים | help | `synthetic-progressed-city-age-7` | [boarDefense-help--scroll-01](screenshots/boarDefense-help--scroll-01.png) | KUX-026 |
| אי החזירים | shop | `synthetic-progressed-city-age-7` | [boarDefense-shop](screenshots/boarDefense-shop.png) | KUX-025 |
| אי החזירים | shop | `synthetic-progressed-city-age-7` | [boarDefense-shop--scroll-01](screenshots/boarDefense-shop--scroll-01.png) | — |
| אי החזירים | shop | `synthetic-progressed-city-age-7` | [boarDefense-shop--scroll-02](screenshots/boarDefense-shop--scroll-02.png) | — |
| אי החזירים | shop | `synthetic-progressed-city-age-7` | [boarDefense-shop--scroll-03](screenshots/boarDefense-shop--scroll-03.png) | — |
| אי החזירים | shop | `synthetic-progressed-city-age-7` | [boarDefense-shop--scroll-04](screenshots/boarDefense-shop--scroll-04.png) | KUX-025 |
| אי החזירים | fortifications | `synthetic-progressed-city-age-7` | [boarDefense-fortifications](screenshots/boarDefense-fortifications.png) | — |
| אי החזירים | fortifications | `synthetic-progressed-city-age-7` | [boarDefense-fortifications--scroll-01](screenshots/boarDefense-fortifications--scroll-01.png) | — |
| אי החזירים | fortifications | `synthetic-progressed-city-age-7` | [boarDefense-fortifications--scroll-02](screenshots/boarDefense-fortifications--scroll-02.png) | — |
| אי החזירים | embedded live battle | `synthetic-progressed-city-age-7` | [boarDefense-battle](screenshots/boarDefense-battle.png) | — |
| אי החזירים | embedded live touch | `synthetic-progressed-city-age-7` | [boarDefense-battle-touch](screenshots/boarDefense-battle-touch.png) | — |
| אי החזירים | campaign defeat | `synthetic-accelerated-boar-loss` | [boarDefense-defeat](screenshots/boarDefense-defeat.png) | — |
| אי החזירים | shop after defeat | `synthetic-accelerated-boar-loss` | [boarDefense-defeat-shop](screenshots/boarDefense-defeat-shop.png) | — |
| אי החזירים | campaign between waves | `synthetic-accelerated-boar-win` | [boarDefense-wave-result](screenshots/boarDefense-wave-result.png) | — |
| אי החזירים | campaign between waves | `synthetic-accelerated-boar-win` | [boarDefense-wave-result--scroll-01](screenshots/boarDefense-wave-result--scroll-01.png) | — |
| אי החזירים | pause and exit | `synthetic-progressed-city-age-7` | [boarDefense-pause](screenshots/boarDefense-pause.png) | — |
| אי החזירים | returned to island | `synthetic-progressed-city-age-7` | [boarDefense-after-exit](screenshots/boarDefense-after-exit.png) | — |
| כיבוי שריפה | visible tutorial / room instruction | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-3-visible-card](screenshots/fireRescue-entry-3-visible-card.png) | — |
| כיבוי שריפה | visible interior play | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-3-visible-play](screenshots/fireRescue-entry-3-visible-play.png) | — |
| כיבוי שריפה | visible tutorial / room instruction | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-12-visible-card](screenshots/fireRescue-entry-12-visible-card.png) | — |
| כיבוי שריפה | visible room card | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-12-visible-room-card](screenshots/fireRescue-entry-12-visible-room-card.png) | — |
| כיבוי שריפה | visible interior play | `synthetic-truck-parked-at-entry-door` | [fireRescue-entry-12-visible-play](screenshots/fireRescue-entry-12-visible-play.png) | — |
| קרב ספינות | canvas HUD text measurements | `isolated-software-renderer-feedback-probe` | [navalDuel-canvas-text](screenshots/navalDuel-canvas-text.png) | KUX-033 |
| קרב ספינות | expanded weapon choices | `isolated-software-renderer-feedback-probe` | [navalDuel-weapon-picker](screenshots/navalDuel-weapon-picker.png) | KUX-034 |
| קרב ספינות | weapon selected by trusted touch | `isolated-software-renderer-feedback-probe` | [navalDuel-weapon-changed](screenshots/navalDuel-weapon-changed.png) | KUX-034 |
| קרב ספינות | lock feedback | `isolated-software-renderer-feedback-probe` | [navalDuel-lock-action](screenshots/navalDuel-lock-action.png) | — |
| הגנה מפני חייזרים | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-alienDefense](screenshots/feedback-alienDefense.png) | — |
| כיבוי שריפה | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-fireRescue](screenshots/feedback-fireRescue.png) | — |
| קרב ספינות | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-navalDuel](screenshots/feedback-navalDuel.png) | — |
| ליגת העיר בכדורגל | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-soccer](screenshots/feedback-soccer.png) | — |
| טניס בעיר | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-tennis](screenshots/feedback-tennis.png) | — |
| מרוצי העיר | internal start card | `isolated-software-renderer-feedback-probe` | [feedback-islandRacing-internal-start-card](screenshots/feedback-islandRacing-internal-start-card.png) | — |
| מרוצי העיר | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-islandRacing](screenshots/feedback-islandRacing.png) | — |
| ליגת העיר בכדורסל | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-streetSlam](screenshots/feedback-streetSlam.png) | — |
| מרוץ סנובורד | internal start card | `isolated-software-renderer-feedback-probe` | [feedback-alpineRush-internal-start-card](screenshots/feedback-alpineRush-internal-start-card.png) | — |
| מרוץ סנובורד | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-alpineRush](screenshots/feedback-alpineRush.png) | — |
| אי החזירים | actual two-finger aiming and firing | `isolated-software-renderer-feedback-probe` | [feedback-boarDefense-firing](screenshots/feedback-boarDefense-firing.png) | — |
| אי החזירים | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-boarDefense](screenshots/feedback-boarDefense.png) | — |
| תפוס את הפושע | isolated feedback probe | `isolated-software-renderer-feedback-probe` | [feedback-catchCriminal](screenshots/feedback-catchCriminal.png) | — |
| ליגת העיר בכדורסל | timeout bench display from legal model state | `synthetic-legal-timeout-bench-display-frozen-model` | [streetSlam-timeout-bench](screenshots/streetSlam-timeout-bench.png) | KUX-040 |
| ליגת העיר בכדורסל | trusted touches select a substitution in the fixture | `synthetic-legal-timeout-bench-display-frozen-model` | [streetSlam-timeout-substitution](screenshots/streetSlam-timeout-substitution.png) | — |
