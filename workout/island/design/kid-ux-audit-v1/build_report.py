#!/usr/bin/env python3
"""Render the manually reviewed findings and the complete screenshot index.

Measurements are diagnostics; this file deliberately contains curated findings,
not a rule that turns every small DOM rectangle into an accessibility failure.
"""
import json
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo
import math
import statistics

HERE = Path(__file__).resolve().parent
NAMES = {'island':'האי והעיר','library':'ספריית המשחקים','learning':'למידה',
 'alienDefense':'הגנה מפני חייזרים','fireRescue':'כיבוי שריפה','navalDuel':'קרב ספינות',
 'soccer':'ליגת העיר בכדורגל','tennis':'טניס בעיר','islandRacing':'מרוצי העיר',
 'streetSlam':'ליגת העיר בכדורסל','alpineRush':'מרוץ סנובורד','boarDefense':'אי החזירים',
 'catchCriminal':'תפוס את הפושע','shared':'משותף למשחקים'}
FINDINGS=[]
SCREEN_LABELS=['ספריית המשחקים','הספרייה ומסך הבית','ספריית המשחקים','הורדה למכשיר',
 'הוראות פתיחה','שמיעה חוזרת','השהיה ויציאה','תוצאות הצלחה וכישלון','מפת האי וניווט',
 'מפת יעדים','יצירת דמות','הדרכה ראשונה','מדדי העיר','העירייה: תכנון ותקציב',
 'הוראות ומפת הליגה','משחק','משחק','משחק','משחק והסבר מחוות','ניהול המועדון',
 'מרוץ','לוח המשחק','טבלת העונה','תפריט ראשי','מוסך ונשקים','תדריך פנימי','שאלת שפה',
 'נעילת משחקים יומית','מסלול ליגה','לוח יעדי הליגה','חדר כיבוי רב כלים','משחק',
 'לוח המשחק','בחירת תחמושת','הדרכה פנימית למרדף','שלב לכידה','משחק זיכרון','פאזל',
 'בקשת פסק זמן','ספסל חילופים בזמן פסק זמן']


def finding(number, game, screen_ids, severity, dimensions, title, observation, fix,
            acceptance, sources=(), confidence='observed'):
    FINDINGS.append(dict(id=f'KUX-{number:03}',game=game,gameLabel=NAMES[game],screenLabel=SCREEN_LABELS[number-1],screens=screen_ids.split(),
        severity=severity,dimensions=dimensions.split(),title=title,observation=observation,
        proposedFix=fix,acceptance=acceptance,sources=list(sources),confidence=confidence))


finding(1,'library','games-library','P2','touch-target',
 'כל עשרת כפתורי הכניסה נמוכים מהרף',
 'עשרת כפתורי הכניסה נמדדו 132×34 פיקסלי CSS. כל הכרטיס אינו יעד חלופי: הפעולה מחוברת לכפתור שבתוכו. ההקטנה חלה דווקא בטלפון לרוחב.',
 'גובה פעיל 48 לפחות; אפשר להפוך גם את הכרטיס ליעד כניסה יחיד וברור.',
 'ב־844×390 כל כפתור כניסה הוא לפחות 44×44 וניתן להפעילו בנגיעה סמוך לשוליו.',
 ['presentation/adventure.css:61','ui/activity.mjs:118'])
finding(2,'shared','games-library soccer-home tennis-home streetSlam-home','P2','touch-target',
 'הסגירה והצליל במסכי הבית קטנים',
 'במראה הכהה של הספרייה ומסכי הבית הסגירה היא 40×40 והצליל 64.61×40. במסכי המשחק עצמם כפתורי ההשהיה גדולים יותר.',
 'להחיל מינימום 48×48 על רכיבי המסגרת גם במצב לרוחב.',
 'גובה ורוחב פעילים של 44 לפחות בכל מסכי הבית והספרייה.',
 ['presentation/adventure.css:55'])
finding(3,'library','games-library','P2','typography',
 'שמות המשחקים קטנים וצפופים',
 'שמות המשחקים וכפתורי הכניסה הם 12 פיקסלים, תג חדש הוא 11; עשרה משחקים נדחסים לחמש עמודות. שם משחק רב מילים נשבר לשורות קצרות.',
 'שמות 16–18 פיקסלים, שלוש או ארבע עמודות עם איור מוכר; להשאיר גלילה ברורה.',
 'ילד יכול לזהות משחק לפי איור ושם קריא בלי להגדיל את הדף.',
 ['presentation/adventure.css:61'],confidence='observed-layout; child-comprehension-needs-playtest')
finding(4,'library','games-library--scroll-01','P2','contrast',
 'הטקסט באזור ההורדה כמעט נבלע ברקע',
 'צבע הטקסט הוא RGB(237,242,236). הרקע הנראה בצילום הוא בערך RGB(186,192,194): יחס כ־1.6:1. זהו רקע שקוף מעל ערכת עיצוב כהה, ולכן יחס חישוב אוטומטי מתוך CSS לבדו אינו מספיק.',
 'לקבוע במפורש צבע דיו כהה לפאנל ההורדה הבהיר, או להשתמש בפאנל כהה אטום עם טקסט בהיר.',
 'יחס 4.5:1 לפחות לטקסט רגיל בכל ערכת עיצוב, לפי הרקע המרונדר.',
 ['styles.css:368','ui/offline-panel.mjs:23'])
finding(5,'shared','soccer-instructions tennis-instructions streetSlam-instructions islandRacing-instructions alpineRush-instructions boarDefense-instructions','P1','instruction non-reading',
 'שער הכניסה למשחק דורש קריאת פסקאות',
 'ההסבר הראשוני מבוסס על שלוש פסקאות, לרוב בגופן 13 פיקסלים, ואיור סטטי. כפתור ההתחלה נמצא מתחת לקפל בחלק מהמסכים. אין באותו שער הדגמת פעולה באמצעות אצבע, והטקסט כולל מושגים כמו ג׳ויסטיק, מסירה ארוכה והגבהה.',
 'להציג הדגמה קצרה של פעולה אחת בכל צעד: אצבע, תנועה ותוצאה, עם משפט קולי קצר וכפתור התחלה קבוע.',
 'ניתן ללמוד את פעולת הבסיס בלי לקרוא; ההתחלה והיציאה נשארות נראות בכל צעד.',
 ['ui/activity.mjs:243','ui/activity.mjs:250'],confidence='observed-layout; comprehension-heuristic')
finding(6,'shared','soccer-instructions-replay tennis-instructions-replay streetSlam-instructions-replay boarDefense-instructions-replay','P1','audio instruction non-reading',
 'כפתור שמיעת ההוראות אינו מקריא אותן',
 'לאחר נגיעת CDP בכפתור ההשמעה החוזרת נרשם צליל לחיצה, אך לא בקשת דיבור. narrateHelp קורא ל־ui.narrate, שמשגר אירוע island:narrate; לא נמצא באפליקציה מאזין שמנגן את ההסבר. אין להסיק מכך שכל צלילי המשחק חסרים.',
 'לחבר את הכפתור להקלטה עברית או למקריא זמין, ולספק הדגמה חזותית כשאין קול.',
 'נגיעה מהימנה בכפתור מפעילה את משפט ההוראה עצמו, עם מצב טעינה/כשל גלוי ובלי להסתמך על צליל לחיצה.',
 ['ui/activity.mjs:242','ui/interface.mjs:83','app.mjs:81'])
finding(7,'shared','soccer-pause tennis-pause streetSlam-pause islandRacing-pause alpineRush-pause','P2','exit instruction',
 'היציאה קיימת אך דורשת לזהות שתי צלמיות',
 'במשחק מופיעה צלמית השהיה. אחריה מוצגים המשך, צליל ויציאה כצלמיות ללא כיתוב נראה; השם לחזור לעיר קיים במאפיין הנגישות בלבד. נבדקה חזרה אמיתית לאי באמצעות שתי נגיעות.',
 'להוסיף כיתוב נראה לחזור לאי ליד דלת היציאה, וכיתוב השהיה/בית בשלב הכניסה.',
 'הפעולה מובנת גם לילד שאינו מכיר את סמל הדלת; החזרה לאי משחררת את המשחק.',
 ['ui/game-shell.mjs:155','ui/game-shell.mjs:168'],confidence='observed-flow; recognizability-heuristic')
finding(8,'shared','soccer-result-win soccer-result-win--scroll-02 tennis-result-win streetSlam-result-lose','P2','exit layout typography',
 'הפעולות הבאות במסכי הסיום יורדות מתחת לקפל',
 'כותרת, כרטיס פרס ונתונים תופסים את גובה החלון. צריך לגלול כדי להגיע שוב, שלבים או יציאה; בסיום הכדורגל נדרשו מספר תצוגות גלילה. אלה צילומי תבנית תוצאה מנתוני בדיקה, לא ניצחונות ששוחקו.',
 'שורת פעולות קבועה בתחתית: שוב ולחזור לאי; לקפל פירוט פרסים והצעות שדרוג.',
 'בסיום הצלחה וכישלון יש יציאה ופעולה ראשית נראות ב־844×390 ללא גלילה.',
 ['ui/activity.mjs:341','ui/activity.mjs:361'])
finding(9,'island','island-02-first-city island-06-map','P2','spacing',
 'רווחי הניווט קטנים לאצבע של ילד',
 'בין מרכז העיר לעוד פעולות ובין כסף למשימות נמדדו 2 פיקסלים; בין מפה לטיול ובין קיצורי הדרך התחתונים כ־5. היעדים הראשיים עצמם עומדים ב־44.',
 'רווח 8–12 פיקסלים בין פעולות נפרדות, ויותר בין פעולות שקל לבלבל ביניהן.',
 'מרווח לפחות 8 לפי כלל הביקורת; זהו כלל עיצוב לילד, לא טענה לכשל WCAG כשלעצמו.',
 ['styles.css:9','ui/city-access.mjs:16'])
finding(10,'island','island-06-map','P2','touch-target exit',
 'סגירת המפה ויעדי המקום קטנים',
 'סגירת המפה נמדדה 36×36; כפתור העירייה 67.38×38. שני היעדים נראים וניתנים לפגיעה במרכז, אך קטנים מדרישת 44.',
 'סגירה 48×48 ושורות יעדים בגובה 48, עם שם ואיור.',
 'כל יעד מקום וסגירה במפה לפחות 44×44.',
 ['ui/city-access.mjs:30'])
finding(11,'island','island-01-avatar-first-use island-01-avatar-first-use--scroll-01','P2','layout typography',
 'בחירת הדמות נראית חתוכה בתחילת הדרך',
 'תצוגת הדמות בגובה 120 משאירה מעט מקום לבחירה: שורת השמות נחתכת ליד הכפתור הקבוע, ושאר השדות דורשים שלוש גלילות. כותרות השדות הן 12 פיקסלים. יעדי הבחירה עצמם 56 ומעלה.',
 'לקצר את התצוגה המקדימה לרוחב, לחשוף לפחות שתי קבוצות בחירה ולהוסיף סימן גלילה או צעדים מאוירים.',
 'ברור שיש עוד אפשרויות, והכפתור הקבוע אינו מסתיר את טקסט האפשרות בשורת הבחירה.',
 ['ui/interface.mjs:632','styles.css:41'])
finding(12,'island','island-03-tutorial-tasks','P1','instruction non-reading audio',
 'ההתחלה בעיר מוסברת בטקסט בלבד',
 'ההדרכה הראשונה אומרת זו העירייה שלך ומתחילים בעירייה, אך אינה מדגימה אצבע שנוגעת במבנה או מקריאה את הפעולה. העזרה במפה מוצגת כהודעת טקסט חולפת.',
 'אצבע מודגמת, הדגשת המבנה ומשפט מוקלט אחד; לתת לילד לחזור על הפעולה ולקבל אישור ברור.',
 'אפשר להשלים את פעולת הפתיחה בלי לקרוא את הפסקה ובלי להכיר את המושג עירייה.',
 ['ui/interface.mjs:290','ui/interface.mjs:83'],confidence='observed-flow; comprehension-heuristic')
finding(13,'island','island-08-city-stats','P2','typography contrast',
 'נתוני העיר צפופים וחלקם בהירים מדי',
 'טקסט המשנה עיר קטנה. הרפתקה גדולה. נמדד 11 פיקסלים וביחס 3.11:1. התפריט כולל מספר רב של מדדים ומשאבים בגובה חלון מוגבל.',
 'טקסט משני 14–16, ניגודיות 4.5:1, ושלושה מדדים מאוירים עיקריים עם פירוט נפתח.',
 'אין טקסט הדרכתי חיוני מתחת ל־14, והמדד מסביר לילד פעולה ולא רק מספר.',
 ['styles.css:14','ui/interface.mjs:243'])
finding(14,'island','island-18-city-blueprint island-18-city-budget','P2','touch-target instruction non-reading',
 'ניהול העיר מציע ממשק עמוס של מבוגר',
 'כפתור התחלת ניהול עיר הוא 120×40. בלוח יש תכנון, שירותים, תקציבים, אחוזי מימון ומיסוי; אין דרך מאוירת קצרה שמסבירה לילד מה כדאי לעשות עכשיו.',
 'גובה 48 לפעולה הראשית; מסלול ילד עם פעולה מומלצת אחת ותחזית מאוירת, ופירוט ניהול בלשונית משנית.',
 'הפעולה הראשית עומדת ברף 44; ילד יכול להבין תוצאה צפויה לפני אישור בלי לפענח תקציב.',
 ['ui/city-management.mjs:28','ui/city-management.mjs:80'],confidence='observed-layout; comprehension-heuristic')
finding(15,'soccer','soccer-instructions soccer-stages','P2','instruction',
 'ההסבר מציע בחירת שוער שאינה במסך הליגה',
 'ההוראות מציינות אפשר לבחור להיות השוער לפני המשחק. מסך הליגה הנוכחי מציג בחירת משחק, אימונים והרכבים; בחירת תפקיד השוער נמצאת בענף ממשק ישן שאינו מוצג כשיש ליגות.',
 'לעדכן את ההוראה למסלול הפעיל, או להציג כניסה ברורה לבחירת התפקיד אם עדיין תומכים בו.',
 'כל פעולה המתוארת בהסבר ניתנת לאיתור במסך הבא.',
 ['ui/activity.mjs:210','data/strings.he.json'])
finding(16,'soccer','soccer-playing soccer-touch-held','P2','typography thumb',
 'כיתובי פעולות ומטרת המשחק קטנים',
 'בעיטה, מסירה וריצה נמדדו 11 פיקסלים, הגבהה 10 ומטרת השער 11. הכפתורים עצמם גדולים, 64–80. במודל אגודל ברדיוס 32, הכיתוב שבתחתית הכפתור המוחזק מכוסה; לא נמדדה חפיפה לכפתור השכן.',
 'כיתוב 14–16, סמל שקל לזהות, ומשוב הפעולה גם מעל האצבע או ליד השחקן.',
 'הילד רואה איזה מצב מופעל גם במהלך החזקה. מסקנת האגודל נשארת הערכה גאומטרית עד בדיקת מכשיר.',
 ['minigames/soccer-session.mjs','minigames/soccer-controls.css'],confidence='observed-fonts; thumb-geometry-heuristic')
finding(17,'tennis','tennis-playing','P2','typography layout',
 'הכיתוב מכה קצרה לרשת רחב מכפתורו',
 'כל תוויות הפעולה הן 10 פיקסלים. הכיתוב מכה קצרה לרשת נמדד כ־76.67 פיקסלים בתוך כפתור שרוחבו 64, ולכן גולש לשוליו.',
 'סמל מובחן ושם קצר כמו קצרה, 14–16 פיקסלים; להגדיל יעד או לשבור לשתי שורות מתוכננות.',
 'הכיתוב נשאר בתוך הכפתור ואינו דורש גופן 10 כדי להתאים.',
 ['minigames/tennis-session.mjs'])
finding(18,'tennis','tennis-playing','P2','contrast',
 'כיתוב החבטה לא מגיע לניגודיות הנדרשת',
 'התווית חבטה בגודל 10 פיקסלים נמדדה ביחס 3.40:1 על הרקע המלא של כפתורה.',
 'להכהות את כפתור החבטה או לשנות את צבע הכיתוב, יחד עם הגדלת הגופן.',
 'יחס 4.5:1 לפחות לטקסט הפעולה במצב זמין ובמצב לחוץ.',
 ['minigames/tennis-session.mjs'])
finding(19,'streetSlam','streetSlam-playing streetSlam-after-controls','P2','instruction typography non-reading',
 'שלוש מחוות למסירה נלמדות ממשפט קטן',
 'מסירה קצרה בנגיעה, מסירת קרקע בנגיעה כפולה ורחוקה בהחזקה מוסברות בהודעה בגופן 12. שמות התפקידים על המגרש מופיעים גם כקיצורים באנגלית בגופן 10.',
 'ללמד מחווה אחת בכל שלב באימון מאויר, עם קו מסירה ותוצאה; להציע שמות/סמלים פשוטים לתפקידים.',
 'אפשר לגלות ולתרגל כל מחווה בלי לקרוא משפט מרובה תנאים בזמן משחק.',
 ['minigames/hoops-session.mjs','minigames/hoops-controls.mjs'],confidence='observed-instructions; comprehension-heuristic')
finding(20,'streetSlam','streetSlam-club streetSlam-club--scroll-07','P2','layout instruction exit',
 'ניהול הקבוצה מחייב גלילה ארוכה מאוד',
 'פתיחת ניהול הקבוצה חושפת כרטיסים, מיקומים, עייפות ושדרוגים על פני שמונה תצוגות לפחות; פעולת משחק וניווט אינם נשמרים יחד באזור קבוע.',
 'להפריד כרטיס ילד קצר עם בחירה מומלצת מניהול מלא, ולהשאיר לשחק וחזרה גלויים.',
 'ניתן להתחיל משחק או לצאת מהניהול בלי לגלול דרך כל שחקני הספסל.',
 ['ui/activity.mjs:198','ui/hoops-club.mjs'])
finding(21,'islandRacing','islandRacing-touch-held','P2','touch-target',
 'כפתור הכניסה לפיטס נמוך מהרף',
 'כניסה לפיטס להחלפת צמיגים נמדד 96×40. זהו כפתור פעולה תוך כדי נהיגה, ולכן גובהו חשוב יותר מהגובה של קישור קרדיט משני.',
 'גובה 48 לפחות, מרחק 8 מההאצה והניטרו, וחיווי בקשה שאינו מוסתר באגודל.',
 'הכפתור הזמין במהלך מרוץ הוא לפחות 44×44.',
 ['minigames/racing-pit-ui.mjs'])
finding(22,'islandRacing','islandRacing-touch-held','P2','typography instruction',
 'מד המהירות וההסברים זעירים וכוללים קיצורים',
 'קמ״ש בגופן 8, האצה אוטומטית 9, ERS וטיפ ההיגוי 10. קיצורים ומונחי נהיגה מופיעים לצד כמה פעולות בו זמנית.',
 'תווית מרכזית 14–16, מטען מאויר במקום קיצור לא מוסבר, ולימוד האצה/היגוי/בלימה בצעדים.',
 'הוראות חיוניות אינן קטנות מ־14, ואין צורך להבין קיצור באנגלית כדי להתחיל.',
 ['minigames/racing-speedometer.mjs','minigames/racing-controls.mjs'],confidence='observed-fonts; comprehension-heuristic')
finding(23,'islandRacing','islandRacing-league-season--scroll-01 islandRacing-league-season--scroll-02','P2','contrast',
 'מספרי נהגים בהירים על צבעי קבוצה בהירים',
 'מספרי חולצות/נהגים בטבלת העונה נמדדו בין היתר 1.26:1, 1.68:1 ו־1.81:1 בגודל 15.2. לא כל הצבעים שומרים על קריאות אחידה.',
 'לבחור דיו כהה/בהיר לפי בהירות צבע הקבוצה או להציב את המספר על תג אטום קבוע.',
 'יחס לפחות 4.5:1 לכל המספרים בכל צבעי הקבוצות.',
 ['ui/racing-league.mjs'])
finding(24,'boarDefense','boarDefense-campaign-menu','P2','touch-target exit',
 'העזרה, הרגישות והחזרה לעיר בגובה 32 בלבד',
 'בתפריט הפנימי נמדדו איך משחקים, איכות, רגישות וחזרה לעיר בגובה 32. חזרה לעיר ברוחב כ־50, וכותרות/הערת השמירה מגיעות ל־9–10 פיקסלים.',
 'שורות קישורים בגובה 48, פיצול לשתי שורות ברוחב זה, והפרדה בולטת של החזרה לעיר.',
 'היציאה והעזרה עומדות ב־44×44 ומובחנות מהגדרות טכניות.',
 ['minigames/boar-island/index.html:26','minigames/boar-island/game.js:1107','minigames/boar-island/style.css'])
finding(25,'boarDefense','boarDefense-shop boarDefense-shop--scroll-04','P2','touch-target layout exit',
 'במוסך כפתורי הקנייה והלשוניות קטנים ונחתכים',
 'הלשוניות נשקים וביצורים הן בגובה 39 וכפתורי קנייה 38. בתצוגה העליונה נשארו כ־15.8 פיקסלים נראים מכפתורי הקנייה של השורה הראשונה. הכפתור לגל הבא וחזרה נמצאים בסוף מסמך גלילה בגובה 1471.',
 'גובה 48 ללשוניות ולרכישה, ושורת פעולות קבועה לגל הבא/חזרה; להציג פחות נתוני נשק בכרטיס הראשי.',
 'אפשר לקנות, לחזור או להתחיל גל בלי לחפש כפתור חתוך ובלי לעבור דרך כל הכרטיסים.',
 ['minigames/boar-island/index.html:29','minigames/boar-island/style.css'])
finding(26,'boarDefense','boarDefense-help boarDefense-help--scroll-01','P2','instruction typography non-reading',
 'התדריך הנייד כולל עומס של מקשי מחשב',
 'בתדריך הפנימי נדרשת גלילה דרך פסקאות וטבלת מקשים כגון Q, E, R ורווח. ההסבר לטלפון הוא משפט מילולי על ג׳ויסטיק וירי, ללא הדגמה פעילה של שתי אצבעות.',
 'תדריך נייד נפרד: ציור אגודל שמאל מכוון וימין יורה, הדגמת פגיעה וקול קצר; מקשי המחשב רק במחשב.',
 'ילד מצליח להבין את חלוקת הידיים בלי לקרוא הוראות מקלדת.',
 ['minigames/boar-island/index.html:37'],confidence='observed-help; comprehension-heuristic')
finding(27,'learning','learning-language-question','P1','audio instruction non-reading',
 'אין מסלול ללא קריאה כשחסר קול עברי בגיל 7',
 'בגיל 7 רמת הפתיחה היא 4. בהרצה ללא קול עברי זמין הופיעה שאלת שפה עם תשובות כתובות וכפתור רמקול, ללא הקראת שאלה בפועל. החלופה החזותית בקוד מוגבלת לרמות 1–2.',
 'הקלטות מוכנות לשאלות החיוניות, או חלופה חזותית גם ברמה 4; להראות בבירור כשקול אינו זמין.',
 'במכשיר ללא קול עברי אפשר להבין מה נדרש בלי להסתמך על כפתור רמקול שאינו משמיע את השאלה.',
 ['learning/interface.mjs:83','learning/voice.mjs','learning/state.mjs:8'],confidence='observed-with-no-Hebrew-voice; device-dependent')
finding(28,'island','island-26-daily-locked','P2','instruction non-reading',
 'נעילת המשחקים מוסברת כהוראה ארוכה',
 'במצב יום נוסף בגיל 7, המשחקים דורשים שני סבבים של שמונה שאלות. הסיבה והכמות מוסברות בטקסט 13 פיקסלים; אין רצף מאויר של שני סבבים שמוביל למשחק שבחר הילד.',
 'להציג שני צעדים מאוירים והבטחה ברורה לחזרה למשחק שנבחר, עם הסבר קולי קצר.',
 'הילד מבין למה המשחק נעול, כמה נשאר ואיך חוזרים אליו, בלי לקרוא פסקה.',
 ['learning/interface.mjs:38','learning/state.mjs:11'],confidence='observed-flow; comprehension-heuristic')
finding(29,'alpineRush','alpineRush-league-live','P2','typography',
 'שמות הטריקים הם בגודל 9 פיקסלים',
 'תפיסה, סיבוב, סלטה ושילוב נמדדו 9; הסבר טריקים באוויר 11. יעדי הטריקים עצמם כ־67×67, כך שהקושי הוא קריאה ולימוד ולא גודל הלחיצה.',
 'שמות 14–16 ודמות קטנה שמדגימה את הטריק לפני הפעלתו; להדגיש רק את הפעולה הזמינה כעת.',
 'אין צורך לפענח כיתוב זעיר בזמן קפיצה.',
 ['minigames/alpine-hud.mjs','minigames/alpine-session.mjs:205'],confidence='observed-fonts; comprehension-heuristic')
finding(30,'alpineRush','alpineRush-league-live','P2','rtl instruction',
 'היעד מקום 6/3 נראה כשבר לא הגיוני',
 'בחיווי יעד הליגה הופיע מקום 6/3: מיקום נוכחי 6 מול יעד 3. שתי המשמעויות אינן כתובות, והשימוש בלוכסן נראה כמו מקום שישי מתוך שלושה. זהו קושי במשמעות המספרים, לא הוכחה שכל כיוון העברית הפוך.',
 'להפריד במילים או סמלים: עכשיו מקום 6; כדי לעבור — מקום 3 ומעלה.',
 'ברור איזה מספר הוא המצב הנוכחי ואיזה הוא תנאי ההצלחה.',
 ['minigames/alpine-session.mjs','minigames/alpine-league-stages.mjs'],confidence='observed-label; comprehension-heuristic')
finding(31,'fireRescue','fireRescue-entry-12-clock','P2','typography instruction',
 'תוויות כלי הכיבוי בתוך הבניין זעירות',
 'צינור מים, מטף ושמיכת כיבוי נמדדו 9 פיקסלים. הכפתורים עצמם 56×56 ויש סמלים, אך ההבחנה בין כלים חדשים נשענת גם על התווית.',
 'תוויות 14 לפחות או כרטיס כלי מוגדל בהחלפה, עם הקראה והדגמת שימוש; לשמור על הגדלים הטובים של היעדים.',
 'ניתן לזהות כלי חדש לפני לחיצה בלי לקרוא טקסט בגודל 9.',
 ['minigames/fire-v24-session.mjs:36','minigames/fire-v24.css'],confidence='observed-fonts; comprehension-heuristic')
finding(32,'alienDefense','alienDefense-playing','P2','typography instruction',
 'שמות הנשקים והגל קטנים בזמן הטיסה',
 'ירי רגיל וולקן מופיעים בגופן 10, ומספר הגל 11. בכפתורים יש סמלים וצבעים, אך ההבדל בין ירי רגיל, ירי מיוחד ומתג נשק אינו נלמד בהדגמה באותו מסך.',
 'תווית נשק 14–16, חיווי תחמושת ברור ליד האצבע והיכרות חזותית עם כל נשק בתורו.',
 'אפשר להבין מה יירה ומה יתחלף לפני מגע, בלי לקרוא כיתוב 10 פיקסלים בזמן טיסה.',
 ['minigames/alien-session.mjs','minigames/alien-flight-input-hud.mjs'],confidence='observed-fonts; comprehension-heuristic')
finding(33,'navalDuel','navalDuel-canvas-text','P2','typography instruction',
 'השעון וההכוונה בספינות מצוירים קטנים',
 'מדידת קריאות ציור הקנבס מצאה שעון 10 פיקסלים, אחוזי גוף הספינה 11, מלאי 13 וההוראה געו בספינה או בכפתור הנעילה 12. אלה מידות CSS לאחר התמרת הקנבס, ולא רק גדלי טקסט ב־DOM.',
 'הוראות 14–16 ושעון ברור יותר, עם חיווי חזותי/קולי לנעילה לפני ירי.',
 'טקסט ההכוונה קריא בזמן תנועה ואינו מחייב להבחין בתווית 10–12 פיקסלים.',
 ['minigames/naval-hud.mjs:78','minigames/naval-hud.mjs:34'])
finding(34,'navalDuel','navalDuel-weapon-picker navalDuel-weapon-changed','P2','instruction non-reading layout',
 'בחירת התחמושת נשענת על סמלים ומספרים בלבד',
 'מגירת התחמושת מציגה שישה סמלים ומספרי מלאי, בלי שם או הדגמה נראים. שמות קיימים במאפייני הנגישות/ריחוף. המגירה נמצאת גם על אזור הספינה היריבה במבט שנבדק.',
 'להוסיף תצוגה קצרה של מה הנשק עושה, עם משפט מוקלט ובחירה נראית; למקם את המגירה כך שאינה מכסה את המטרה.',
 'אפשר להבדיל בין סוגי ירי חדשים בלי ריחוף עכבר ובלי לנחש מה מספר המלאי מסביר.',
 ['minigames/naval-hud.mjs:185'],confidence='observed-layout; comprehension-heuristic')
finding(35,'catchCriminal','catchCriminal-in-game-help','P1','instruction non-reading',
 'לפני המרדף מופיע תדריך ארוך מרובה מחוות',
 'תדריך הפתיחה הפנימי כולל ארבע פסקאות: היגוי, כיוון הטיה, טורבו/בלם, שישה כלים, טבעות מיקוד והשלכה בהחזקה ושחרור. אין בו אימון קצר שמאפשר לבצע פעולה אחת לפני שמתחילים.',
 'שלושה צעדים מעשיים: היגוי, כלי אחד ולכידה; בכל צעד אצבע מונפשת, תוצאה וקול. להציג כלים נוספים בהדרגה.',
 'ילד שאינו קורא יכול להתחיל מרדף ולבצע לכידה בסיסית בלי לפענח את הפסקאות.',
 ['minigames/catch-session6.mjs:159'],confidence='observed-help; comprehension-heuristic')
finding(36,'catchCriminal','catchCriminal-capture-aim','P2','typography instruction',
 'הבחירה בין רשת צרה לרחבה קטנה ומוסברת רק בטקסט עזר',
 'שמות רשת צרה ורשת רחבה נמדדו 11 פיקסלים בתוך יעדים בגובה כ־54. ההבדל בטווח ובדיוק נמצא בתיאור הנגישות/הוראות; הסמלים דומים.',
 'להציג קונוס/טווח לדוגמה בכל בחירה, תווית 14 לפחות ומשפט קצר שמסביר למה לבחור בכל כלי.',
 'לפני השלכה נראים ההבדלים בין הרשתות בלי להסתמך על טקסט 11 או על ריחוף.',
 ['minigames/catch-session6.mjs:151'],confidence='observed-fonts; comprehension-heuristic')
finding(37,'learning','learning-variant-memory','P2','spacing',
 'קלפי הזיכרון עומדים במינימום אך כמעט צמודים',
 'בגיל 7 וברמה 4 נמדדו 12 קלפים בגודל 62×44 ורווח 4 בלבד, אופקית ואנכית. הם עומדים במינימום הלחיצה המבוקש, אך אין מרווח סלחני לילד.',
 'רווח 8 וגובה 52–56 לקלפים, תוך שמירת הלוח והיציאה באותו חלון.',
 'לפחות 8 בין קלפים לפי כלל הביקורת; משוב פתיחת הקלף נשאר מיידי.',
 ['learning/learning.css:14'],confidence='observed-spacing; child-motor-heuristic')
finding(38,'learning','learning-variant-jigsaw learning-variant-jigsaw-touched','P2','instruction non-reading',
 'הפאזל אינו מדגים שמחליפים חלקים בשתי לחיצות',
 'הכותרת אומרת להרכיב את תמונת העיר, אך הפעולה היא בחירת שני חלקים להחלפה, ולא גרירה של חלק למקומו. ההסבר המדויק מופיע ברמז כתוב/קולי, ובמכשיר ללא קול אינו נלמד ללא קריאה.',
 'להדגים פעם אחת שתי נגיעות והחלפה, או לאפשר גם גרירה טבעית עם יעד נחיתה מודגש.',
 'אפשר לגלות את המחווה בלי לקרוא רמז; החלק הראשון שנבחר נשאר מודגש.',
 ['learning/interface.mjs:103'],confidence='observed-interaction; discoverability-heuristic')
finding(39,'streetSlam','streetSlam-timeout','P2','feedback instruction',
 'פסק זמן נראה זמין אך הבקשה נדחית בלי הסבר',
 'בבדיקת נגיעה, פסק זמן נשאר כפתור זמין אך לא נפתח ספסל: המצב שנשמר היה משחק חי, הכדור בידי היריב, ונותרו 7 פסקי זמן. המנוע מחזיר ok:false בתנאי זה בלי סיבת דחייה, והכפתור אינו מסביר את תנאי ההחזקה.',
 'להציג סיבה קצרה כמו פסק זמן רק כשהכדור שלכם, או מצב לא זמין מוסבר עם חיווי מיידי לאחר בקשה.',
 'נגיעה שאינה חוקית נותנת הסבר ולא נראית ככפתור שאינו מגיב. במצב החזקה חוקי נפתח הספסל.',
 ['minigames/hoops-engine.mjs:300','minigames/hoops-controls.mjs:216','minigames/hoops-session.mjs:154'])
finding(40,'streetSlam','streetSlam-timeout-bench','P2','touch-target exit',
 'סגירת ספסל החילופים צרה מדרישת המינימום',
 'במצב פסק זמן חוקי נמדדה סגירת הספסל 40×56. זוהי צלמית ללא כיתוב נראה, ליד כרטיסי שחקנים בגודל נדיב יותר. המסך הוצג ממצב מנוע חוקי בדיוני מוקפא; נגיעות החלפה נבדקו בפועל בתוך מצב זה.',
 'רוחב 48 לפחות וכיתוב חזרה למשחק, כדי להבדיל מסגירת המשחק וחזרה לאי.',
 'יעד הסגירה לפחות 44×44 וניתן לזהות שהוא מחזיר למגרש.',
 ['minigames/hoops-session.mjs:161','minigames/hoops-session.mjs:168'])


def load_evidence():
    bundles={p.name:json.loads(p.read_text()) for p in HERE.glob('evidence-*.json')}
    screens={}
    # A later dedicated capture supersedes an earlier attempt at the same state.
    for filename,data in sorted(bundles.items(),key=lambda v:v[1]['metadata']['capturedAt']):
        for i,s in enumerate(data['screens']):
            if 'capture-error' in s['id']:continue
            screens[s['id']]={**s,'evidenceFile':filename,'evidenceScreenIndex':i}
    return bundles,screens


def main():
    bundles,screens=load_evidence()
    missing=sorted({sid for f in FINDINGS for sid in f['screens'] if sid not in screens})
    if missing:raise ValueError('Missing evidence: '+', '.join(missing))
    first=next(iter(bundles.values()))['metadata']
    exits={}
    for d in bundles.values():
        for event in d['interactions']:
            if event.get('kind')=='exit-result':exits[event['game']]=event['inactive']
    counts=Counter(s['game'] for s in screens.values())
    feedback=bundles.get('evidence-feedback.json',{})
    feedback_fixtures={}
    for data in sorted(bundles.values(),key=lambda v:v['metadata']['capturedAt']):
        for key,value in data.get('fixtures',{}).items():
            if key.endswith('-feedback'):feedback_fixtures[key]=value
    latency=[]
    for game in NAMES:
        f=feedback_fixtures.get(game+'-feedback')
        if not f:continue
        samples=[x['milliseconds'] for x in f['samples'] if isinstance(x.get('milliseconds'),(int,float)) and x['milliseconds']>=0]
        if samples:
            values=sorted(samples);latency.append({'game':game,'count':len(values),'primaryControl':f.get('primaryControl'),'medianMs':round(statistics.median(values),1),'p95Ms':round(values[max(0,math.ceil(len(values)*.95)-1)],1),'maxMs':round(max(values),1),'metric':'built-in pointerdown-to-press-feedback RAF callback; software renderer, not hardware latency'})
    coverage=[]
    for sid,s in screens.items():
        relevant=[f['id'] for f in FINDINGS if sid in f['screens']]
        coverage.append({k:s[k] for k in ['id','game','state','fixture','screenshot','evidenceFile','evidenceScreenIndex']}|{'findingIds':relevant})
    payload={'schemaVersion':1,'auditId':'kid-ux-audit-v1','date':'2026-11-17','timezone':'Asia/Jerusalem','repository':'roynaor-work/Bakasun','branch':'codex/kid-ux-audit-v1','sourceCommit':first['sourceCommit'],'release':first['release'],
        'method':{'viewportCssPx':{'width':844,'height':390},'deviceScaleFactor':1,'browser':first['browser'],'input':'Playwright + CDP Input.dispatchTouchEvent; trusted touch events; up to two simultaneous touches','targetMinimumCssPx':44,'recommendedSpacingCssPx':8,'contrastNormalText':4.5,'thumbRadiusAssumptionCssPx':32,'sourceFilesModified':False,'childParticipant':False,'realPhone':False,'decorativeBackgroundFrozenForStillMenus':True,'timingFromExclusiveSeparateRun':bool(feedback),'serviceWorkers':'blocked; offline-install reliability excluded','fixtures':'Only disposable synthetic local browser storage; game result displays, unlocked progression, parked truck and accelerated game models are labelled per screenshot.'},
        'severityDefinitions':{'P1':'חסם משמעותי להבנת הפעולה או לביצועה ללא קריאה; טיפול ראשון','P2':'קושי חוזר: יעד קטן, קריאות, צפיפות או יציאה לא ברורה','P3':'ליטוש או פגיעה מוגבלת'},
        'summary':{'findingCount':len(FINDINGS),'bySeverity':dict(Counter(f['severity'] for f in FINDINGS)),'screenshotCount':len(screens),'screensByGame':dict(counts),'verifiedExits':exits},
        'findings':FINDINGS,'feedbackMeasurements':latency,'screens':coverage}
    (HERE/'findings.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    lines=['# ביקורת שימושיות לילד בן 7 — האי והמשחקים','',
        f'17.11.2026 · ענף `{payload["branch"]}` · מקור שנבדק: `{payload["sourceCommit"]}` · גרסה `{payload["release"]}`.','',
        f'**{len(FINDINGS)} ממצאים מתועדים, {len(screens)} צילומי מסך.** הביקורת בוצעה בממשק האי ובעשרת משחקיו, בחלון טלפון לרוחב בגודל **844×390 פיקסלי CSS**, ביחס פיקסלים 1. קובצי המוצר הקיימים לא נערכו.','',
        'יש לתקן תחילה את ההדרכה ללא קריאה ואת כפתור שמיעת ההוראות, ואחריהם יעדי כניסה, טקסט קטן וניגודיות. יציאה מהמשחקים קיימת; הקושי הוא בעיקר לגלות אותה. זו ביקורת מומחה עם אוטומציה, ולא מחקר עם ילד או בדיקת מכשיר פיזי.','',
        '## אופן הבדיקה והגבולות','',
        '- Chromium נייד מדומה, עברית וכיוון ימין־לשמאל, אזור זמן ירושלים. כל נגיעה, החזקה וגרירה נוצרה באמצעות CDP; לא נעשה שימוש בלחיצות עכבר או בלחיצות כפויות. נבדק גם מגע בשתי אצבעות.',
        '- נמדדו מלבני היעדים, שטח נראה לאחר חיתוך, פגיעה במרכז, רווחים, גופנים, צבעים, גלילה ובקשות צליל/דיבור. מלבן קטן של checkbox אינו מוכרז אוטומטית כליקוי אם גם התווית מפעילה אותו.',
        '- חלק מהניווט והכנת המצבים בוצע דרך API הפיתוח. הסקריפט מנסה גלילת מגע; מיקום מחדש דרך scrollIntoView לאחר כישלון איסוף מסומן ביומן כהכנת צילום, ואינו נחשב הוכחה שגלילת משתמש הצליחה.',
        '- רף יעד הלחיצה המבוקש הוא 44×44. רווח 8 פיקסלים וגופן 14–18 הם המלצות מותאמות לילד, ולא ספי WCAG מחייבים. לטקסט רגיל נבדק יחס 4.5:1; רקעים שקופים וגרדיאנטים מחייבים בדיקה חזותית נוספת.',
        '- צילומי המצב הראשוני משתמשים בברירת המחדל של האפליקציה. לאחר מכן הוכנה שמירה מקומית בדיונית בגיל 7 עם מבנים פתוחים. צילומי תוצאה, התקדמות פתוחה, משאית ליד דלת והאצת מודל מסומנים כנתוני בדיקה; אינם הוכחת ניצחון, קושי מתאים או יכולת של ילד.',
        '- בחלק מצילומי התפריטים הוקפאה אנימציית הרקע התלת־ממדי בלבד, במפה וברקע תפריטי החזירים, כדי לקצר צילום סטטי. מדידות המשוב נעשו בהרצה נפרדת, עם מנוע רגיל, ללא הקפאה ובדפדפן יחיד. הרינדור בתוכנה ולכן התוצאות אינן זמני תגובה של טלפון.',
        '- רדיוס האגודל המשוער הוא 32 פיקסלים סביב נקודת המגע. זו בדיקת חפיפה גאומטרית; אי אפשר לאשר גודל אצבע, אחיזה, השתקפות שמש או עוצמת שמע פיזית מתוך צילום.',
        '- מדיניות אבטחת התוכן נשמרה. Service Workers נחסמו בהקשר הזמני; נבדק מראה פאנל ההורדה, לא אמינות התקנה או משחק ללא רשת. לא נשלחו נתוני ילד לשירות חיצוני.',
        '- הכיסוי הוא של תבניות המסך, התפריטים והמצבים המתועדים להלן. לא בוצע מעבר בכל 30 שלבים בכל משחק, בכל מזג אוויר ובכל הסתעפות אקראית. לא נכללו משחקי אפליקציית האימון שמחוץ לתיקיית האי.','',
        '## ממצאים לפי משחק ומסך','',
        'חומרה: **P1** — לטפל ראשון; **P2** — קושי חוזר; **P3** — ליטוש. הערכות הבנה ואגודל מסומנות בנפרד ממדידות בפועל.','',
        '| מזהה | משחק ומסך | ליקוי והראיה | צילום | חומרה | תיקון מוצע |','|---|---|---|---|---|---|']
    for f in FINDINGS:
        links='<br>'.join(f'[{sid}]({screens[sid]["screenshot"]})' for sid in f['screens'][:3])
        obs=(f['title']+' — '+f['observation']).replace('|','\\|')
        lines.append(f'| {f["id"]} | {f["gameLabel"]}<br>{f["screenLabel"]} | {obs} | {links} | {f["severity"]} | {f["proposedFix"]} |')
    lines+=['','לכל ממצא יש בקובץ [הנתונים](findings.json) גם קריטריון קבלה, מידת ודאות והפניות למקור. מדידות מלאות לכל צילום נמצאות בקובצי `evidence-*.json`; הנתונים הם ראיות לבדיקה ולא רשימה אוטומטית של כשלים. חישוב הניגודיות בפאנל ההורדה מתועד גם ב־[דגימות מהצילום](contrast-evidence.json).','',
        '## משוב, צליל ויציאה','',
        'המדד הבא הוא הזמן מהפעלת מאזין pointerdown עד חזרת מסגרת המשוב שהמוצר עצמו מודד. הוא אינו זמן עד תנועת שחקן, השמעת צליל בפועל או זמן נסיעה של אירוע מהמכשיר. זמן המתנה יזום בסקריפט ומשך קריאת CDP אינם מוצגים כזמן תגובה.','',
        '| משחק | מה נמדד | דגימות | חציון, מ״ש | אחוזון 95, מ״ש | מקסימום, מ״ש |','|---|---|---:|---:|---:|---:|']
    for row in latency:lines.append(f'| {NAMES[row["game"]]} | {"פעולה ראשית והשהיה/המשך" if row["primaryControl"] else "השהיה/המשך במסגרת"} | {row["count"]} | {row["medianMs"]} | {row["p95Ms"]} | {row["maxMs"]} |')
    lines+=['','נתוני המשוב נשמרים ב־[ראיות ההרצה הנפרדת](evidence-feedback.json). במדידת התוכנה נצפו גם חריגות גדולות מ־100 מ״ש, במיוחד במשחקים הכבדים. זהו סיכון לבדיקה בטלפון, לא קביעה שהמכשיר עצמו מאחר באותו זמן. יש להשלים מדידת פעולה וקול בטלפון לפני החלטת ביצועים. הצלילים שנצפו בתיעוד הם הפעלות Web Audio/מדיה במצב מנוע קיים; אין כאן טענה שהוקלטה עוצמת השמע באוזן.','',
        'היציאה לאי הצליחה בכל עשרת המשחקים. ברוב מסכי המשחק היעדים המרכזיים גדולים מ־44, ובמסכי בחירת התלבושת ובחדרי הכיבוי נמצאו יעדים נדיבים. בחדר הכיבוי קיימת הדרכה ציורית בשלושה צעדים; היא דוגמה שימושית לשיפור שער ההוראות הכללי. במודל האגודל שנבדק הכיתוב שבתוך הכפתור המוחזק עשוי להיות מכוסה, אך לא נמצאה חפיפה גורפת לכפתורי הפעולה השכנים; התחושה במכשיר נותרה לבדיקה.','',
        '## סיכום הכיסוי','',
        '| אזור | צילומים | חזרה מהמשחק לאי |','|---|---:|---|']
    for game in NAMES:
        if game=='shared' or game not in counts:continue
        lines.append(f'| {NAMES[game]} | {counts[game]} | {"אומתה בנגיעה" if exits.get(game) else "—"} |')
    lines+=['','עברית וכיווניות: כיוון המסמך ומרבית הממשק הוא ימין־לשמאל; שדות מספריים מבודדים נבדקו במפות הליגה ובמסכי תוצאה. לוחות פאזל וזיכרון משתמשים בכיוון שמאל־לימין במכוון לצורך מיפוי התמונה. לא הוסב כל כיוון שמאל־לימין לליקוי; קיצורים לא מוכרים וקטעי טקסט קטנים מתועדים בנפרד.','',
        '## שחזור ואימות','',
        'נדרשים Python Playwright ו־Chromium מותקן. הסקריפט מקים שרת לולאה מקומי ואינו משנה קובצי מוצר. להפעלה מלאה:', '',
        '```bash','python3 workout/island/design/kid-ux-audit-v1/audit.py --phase island,library,alienDefense,fireRescue,navalDuel,soccer,tennis,islandRacing,streetSlam,alpineRush,boarDefense,catchCriminal,advanced,fire-cards --output /tmp/kid-ux-captures',
        'python3 workout/island/design/kid-ux-audit-v1/audit.py --phase feedback,hoops-detail --output /tmp/kid-ux-captures','```','',
        'יש להריץ משוב בנפרד אחרי סיום הרצות הצילום, בלי דפדפנים או בדיקות נוספות ברקע. ניתן לבחור נתיב דפדפן באמצעות `--browser`. תוצאת אימות הקבצים והבדיקות נמצאת ב־[verification.json](verification.json).','',
        'בדיקות המאגר: בהרצה המקורית 4,261 עברו, 64 דולגו ואחת נכשלה משום שהדפדפן המצורף ל־Playwright אינו מותקן. אותה בדיקת דפדפן השאירה שרת פתוח לאחר כשל ההפעלה; רק העובד הכושל הופסק כדי לקבל סיכום. בהרצת השלמה עם הדפדפן המותקן עברו כל חמש הבדיקות באותו קובץ, כולל בדיקת הדפדפן. לא נערכו קובצי בדיקה או מוצר. לשחזור מיפוי הדפדפן בלבד:','',
        '```bash',"NODE_OPTIONS='--import ./workout/island/design/kid-ux-audit-v1/test-browser.mjs' node --test tests/workout-royiki.test.mjs",'```','',
        'תקלות איסוף מוקדמות של צילום בעומס ושל בחירת בקר תחמושת נסתר הושלמו בהרצות נפרדות. הן מתועדות ביומני הראיות ואינן נספרות כליקויי מוצר.','',
        '## כל הצילומים','',
        'כל קישור מציג צילום מקורי בגודל 844×390. גלילה היא חלק מאותה תבנית מסך; סוג נתוני הבדיקה מופיע במפורש.','',
        '| משחק | מסך/מצב | נתוני הבדיקה | צילום | ממצאים מקושרים |','|---|---|---|---|---|']
    for s in coverage:
        lines.append(f'| {NAMES.get(s["game"],s["game"])} | {s["state"]} | `{s["fixture"]}` | [{s["id"]}]({s["screenshot"]}) | {", ".join(s["findingIds"]) or "—"} |')
    (HERE/'REPORT.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps(payload['summary'],ensure_ascii=False,indent=2))


if __name__=='__main__':main()
