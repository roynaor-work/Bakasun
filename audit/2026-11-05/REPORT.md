# ביקורת ארבע האפליקציות — 05.11.2026

עודכן בפועל: 05.11.2026 00:31 בישראל (2026-11-04T22:31:41Z). שם התיקייה והתאריך בכותרת נקבעו בבקשה.

**37 ממצאים: 3 בעדיפות P1, 24 בעדיפות P2 ו־10 בעדיפות P3.** הסיכונים הראשונים לטיפול הם הרשאת יצירת תשלום, חברות ארגון אוטומטית ומחיקת מטמונים/קבצי שיתוף בעדכון. קוד המוצר לא שונה; הממצאים אינם מסומנים כמתוקנים.

בסיס הבדיקה הוא `main` בקומיט `5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275`, שנשלף בתחילת העבודה. הענף המבוקש: `codex/audit-2026-11-05-20261105`. כל המסירה תחת `audit/2026-11-05/`; לא נערכו קבצים קיימים, `release.json`, `release.mjs`, תגי גרסה, `CLAUDE.md`, `ops/CONTROL.md` או בדיקות.

## מה נבדק

| אפליקציה | גבולות שנבדקו |
|---|---|
| באקה סאן | shell, מסכי עסק, גיבוי/מיזוג/קבצים, סנכרון מקומי עם mocks, CSP, service worker, CSV ו־SQL הרשאות |
| האימון | בית, תרגילים, הגדרות, הורים, מעקב; אחסון ומדיה, משטחי מצלמה/הקלטה, מקלדת ופתיחה ללא רשת |
| האי | יצירת דמות, עיר, תפריט, כדורגל/כדורסל/סקי, CSP/Draco, offline, נכסים, מודולים, LOD ו־instancing |
| החנות | גיל, קטלוג, מוצר, סל, קופה, תודה, טופס/תקנון, תשלום מדומה, אחסון ו־SQL |

לא צורף רפרנס חזותי חיצוני. נקודת הייחוס היא ה־main הקפוא ורשימת הבדיקה. בקשת התלת־ממד פורשה כקריטריונים לבדיקת הנכסים הקיימים; לא נבנו או חוברו נכסי מוצר חדשים במסגרת audit בקריאה בלבד.

## תוצאות הרצה והגבולות שלהן

- שלוש הרצות מלאות, בדיקות מקוריות ללא שינוי: **3,278 נרשמו; 3,227 עברו, 51 דולגו, אפס נכשלו בכל הרצה.** מתאם הביקורת בחר Chromium מקומי וחסם תעבורה חיצונית. מספרים זהים אינם הוכחה שאין flakiness מחוץ לשלוש ההרצות.
- 33 מהדילוגים הם יעדי תיקון B3. שחזורי `current` שעברו מוכיחים שההתנהגות הבעייתית עדיין קיימת; הם אינם אישור לתיקון.
- מבחני CSP/דיאלוג העסק שהופעלו במפורש: **3 עברו, אפס נכשלו או דולגו**. שתי בדיקות CSP של האי חזרו ועברו גם ב־Node Playwright 1.62.1 המוגדר ב־CI, עם אותו Chromium מערכת. helper מוסיף CSP ככותרת לדפי העזר; גבול ההסקה מתועד ב־A33.
- בדיקת דפדפן ייעודית לתנועת כדורגל motion2: **6 עברו, אפס נכשלו או דולגו**, בשתי התנוחות. פלט restart הוגדר לתיקיית ביקורת זמנית ניתנת לכתיבה; קוד הבדיקה המקורי לא שונה.
- סוויטת offline ייעודית: **2 עברו, 1 נכשל**. הורדת שלושת המשחקים ופתיחתם ללא רשת עברו; נכסים חסומים נפלו לגיבוי. מבחן auto-download כשל ב־avatarLoaded אחרי 120 שניות, וגם שתי חזרות ממוקדות ללא כלי האבחון נכשלו. אבחון מנוטר בתנאי המקור נכשל פעם ועבר בחזרה; אבחון שסגר את דף data saver לפני הדף האוטומטי עבר. כלי האבחון עצמם משנים תזמון, ולכן אינם מחליפים את שלושת הכשלים ואינם מוכיחים גורם סיבתי. כל התוצאות נשמרות; אין טענה שהכשל תוקן או שהופעל בטלפון.
- נגישות: **72 מצבי מסך** בשתי התנוחות, מסלולי Tab/Escape ובקרות חיוביות, שלוש שפות בעסק וחמישה משטחי HTML נוספים. axe 4.11.0, selectors ויחסי צבע מחושבים נשמרו; HTML של nodes ופרטי קשר לא הועתקו.
- גיבוי עוין באי: **42 מקרים עברו**, כולל גרסאות עתידיות, טיפוסים פגומים, רשומות כפולות, מספר לא סופי, מפתחות שמורים וכשל מכסת כתיבה. דחייה לא שינתה את המצב או האחסון. באימון ובחנות לא נמצא ממשק יבוא JSON; אין להציג הזרקת localStorage כפעולת יבוא משתמש.
- סנכרון משפחתי: ה־SQL המקורי עם pgcrypto והלקוח המקורי אומתו מול Postgres מקומי. A36 משחזר אישור סנכרון שגוי ומחיקת פריט מתור מקומי בעת שינוי קוד משפחה; בקרה עם מזהה חדש עברה, וגבול הבעלות נשמר.
- גרסאות הבדיקה: שלוש ההרצות המלאות השתמשו ב־Node 24.19.0, ב־Node Playwright 1.57.0 וב־Chromium 151. בדיקות Python השתמשו ב־Playwright 1.62.0. מבחן auto-download חזר ונכשל גם בהשוואה נפרדת ל־Node Playwright 1.62.1; ההשוואה אינה runner ה־CI המלא המוגדר ל־Node 22. כל הגרסאות מתועדות ב־[environment.json](evidence/environment.json).
- מקלדת באימון ובאי: כרטיסי קטלוג האימון לא קיבלו מיקוד בשתי התנוחות, אף שקישורי הניווט פעלו ב־Enter (A37). חלון ההורה באי נבדק עם Tab/Shift+Tab, Escape והחזרת מיקוד כבקרה חיובית.
- מקור ונכסים: **6,103 קבצים**, 2,441 קובצי טקסט ו־236 GLB. בנוסף נסרקו **11,988 blobs טקסטואליים בהיסטוריית main**, כ־241.5MB, במאגר שאינו shallow. חתימות המפתחות שנבדקו לא מצאו private key, token שירות או מפתח שרת; עשרת מופעי JWT בהיסטוריה סווגו `anon`. הסריקה חתימתית ואינה הוכחה שאין סוד בפורמט אחר.
- כל פעולות הרשת העסקיות/תשלום היו mocks או נחסמו. ניסיון לקרוא כותרות משבעה קבצים סטטיים ב־GitHub Pages נחסם בפרוקסי הסביבה לפני השרת; אין להסיק מכך תגובת 403 של האתר. לא נבדקו מסד/Storage פרוסים, תשלום אמיתי, דואר/וואטסאפ או טלפון פיזי. רשימות CI/status שה־connector החזיר ל־SHA היו ריקות; אין אישור למצב CI או להגנת main החיה.

### יציבות ממושכת

מבחן 7,200 שניות, במקטעים של 600 שניות, מתועד ב־[soak.json](evidence/soak.json). כעת נמדדו 120.0 דקות ו־639 דגימות. מצב: הסתיים.

כל אפליקציה מקבלת שלושה מקטעים עם פרופיל חדש לכל מקטע; אין טענה שכל אפליקציה נבדקה שעתיים רצופות באותו context. מדידות heap נאספו אחרי GC, אך אינן מדידת זיכרון GPU. הצטברות מאזינים אומתה בנפרד ב־A35; אין לייחס לה אוטומטית את כל גידול ה־heap.

סיכום מקטעים ומדדי זיכרון באותו מסלול: [soak-summary.json](evidence/soak-summary.json). היעדר שגיאת JavaScript מדווחת אינו הוכחה נגד קיפאון רינדור שקט.

### בקרות חיוביות ושלילת ממצאי שווא

- נתיבי ההזרקה הישנים בשיחות ובפתקים לא הריצו marker. אין להציגם שוב כ־XSS פתוח.
- הדיאלוג המשותף בעסק לכד מיקוד, סגר ב־Escape והחזירו; הכשל הוא בחלונות מותאמים ובסמנטיקה, לפי הממצא הספציפי.
- האי שומר גיבוי corrupt ואינו דורס את המקור. worker האי מגביל מחיקת caches ל־namespace שלו.
- הורדת offline מלאה אפשרה לפתוח שלושה משחקים בלי רשת. ביקור ראשון עם data saver, או אפליקציה ללא shell worker, אינו אותה הבטחה.
- three.js r160 מקומי, decoder מקומי, LOD ו־instancing לקהל קיימים. נכס שהגיע ל־main אך לא נטען במשחק אינו ״מחובר״.

## ממצאים מדורגים

P1 = קדימות מיידית בגלל גבול הרשאה/תשלום או אובדן קובץ ממתין. P2 = תיקון נדרש לאמינות, אבטחה, נגישות או תקציב היעד. P3 = הקשחה, איכות/תחזוקת בדיקות או פער עם השפעה מוגבלת. אין דירוג CVSS או טענה לניצול בייצור. קובצי כלי שחזור ששמם מקוצר נמצאים ב־audit/2026-11-05/tools/; הפקודות המלאות והתלויות מופיעות ב־README.

| מזהה | קדימות | אפליקציות | תחום | ממצא |
|---|---|---|---|---|
| [A01](#a01) | P1 | החנות | אבטחה | יצירת תשלום יכולה להחליף סכום של הזמנה אחרת |
| [A02](#a02) | P1 | באקה סאן | אבטחה | bootstrap מצרף כל משתמש בפרויקט לארגון |
| [A03](#a03) | P1 | באקה סאן / האימון / האי | אמינות | עדכון באקה סאן מוחק מטמוני אפליקציות ותור שיתוף |
| [A04](#a04) | P2 | החנות | אבטחה | אימות תשלום מקבל סכום חסר או לא סופי |
| [A05](#a05) | P2 | החנות | אמינות | north.sql אינו ניתן להתקנה במסד חדש |
| [A06](#a06) | P2 | באקה סאן | אבטחה | גיבוי עם מזהה תקין ושדה מטיפוס שגוי משבית מסך |
| [A07](#a07) | P2 | באקה סאן / האימון / החנות | אמינות | JSON פגום מוחלף בנתונים ריקים ללא עותק התאוששות |
| [A08](#a08) | P2 | האימון / החנות | אמינות | כשל מכסת אחסון מוצג כהצלחה מקומית |
| [A09](#a09) | P2 | באקה סאן | אמינות | הגדרה שנדחתה ביבוא עדיין נכנסת לתור הענן |
| [A10](#a10) | P2 | באקה סאן | אמינות | מחיקה ישנה מהענן מוחקת עריכה מקומית חדשה |
| [A11](#a11) | P2 | באקה סאן / האימון | אמינות | יצוא JSON אינו גיבוי מלא של הקבצים המקומיים |
| [A12](#a12) | P2 | באקה סאן | אמינות | תשובת שרת 503 דורסת מודול תקין במטמון |
| [A13](#a13) | P2 | האימון / החנות | אבטחה | אין CSP במסמכי הכניסה של האימון והחנות |
| [A15](#a15) | P2 | באקה סאן | אבטחה | יצוא CSV משמר נוסחאות בטקסט מיובא |
| [A16](#a16) | P2 | האימון / החנות | נגישות | שדות וכפתורי תמונות ללא שמות נגישים |
| [A17](#a17) | P2 | באקה סאן / האימון / החנות | נגישות | טקסט משני ובקרות אינם עומדים בניגודיות AA |
| [A18](#a18) | P2 | באקה סאן | נגישות | חלון פעולות בלוח האירועים אינו נגיש כמחסום מיקוד |
| [A19](#a19) | P2 | החנות | נגישות | שער הגיל ומגירת הסל משאירים את הרקע במקלדת |
| [A22](#a22) | P2 | החנות | אמינות | כשל שמירת הזמנה עדיין מרוקן את הסל |
| [A24](#a24) | P2 | באקה סאן / האימון / האי | ביצועים | גרף טעינת הפתיחה כולל עשרות מודולים שאינם נדרשים למסך |
| [A25](#a25) | P2 | האי | ביצועים | שתי זהויות של מודול offline עוקפות איחוד הורדות |
| [A26](#a26) | P2 | האי | ביצועים | דמויות הכדורסל חורגות מדרישות שלד 18 ואטלס אחד |
| [A29](#a29) | P2 | באקה סאן / האימון / האי / החנות | CI | בדיקות דפדפן מרכזיות אינן שער CI רגיל |
| [A30](#a30) | P2 | באקה סאן / החנות | בדיקות | ירוק כולל שחזורי באגים ו־33 יעדי תיקון מדולגים |
| [A31](#a31) | P2 | באקה סאן / האימון / האי / החנות | CI | workflow הפריסה אינו תלוי בהצלחת בדיקות |
| [A36](#a36) | P2 | האימון | אמינות | שינוי קוד משפחה עלול לאבד עדכון ענן עם אותו מזהה רשומה |
| [A37](#a37) | P2 | האימון | נגישות | כרטיסי קטלוג התרגילים אינם נגישים במקלדת |
| [A14](#a14) | P3 | האימון / החנות | אבטחה | ערכי תמונה מהאחסון משולבים כ־HTML ללא escaping |
| [A20](#a20) | P3 | באקה סאן / החנות | נגישות | תפקיד dialog מוצמד לאלמנטים שאינם מתירים אותו |
| [A21](#a21) | P3 | באקה סאן | נגישות | תוכן האפליקציה העסקית אינו בתוך main landmark |
| [A23](#a23) | P3 | החנות | אמינות | מספר הזמנה לא מוכר מוצג כהזמנה שנקלטה |
| [A27](#a27) | P3 | האי | ביצועים | חריגות תקציב בנכסים וכיסוי Draco חלקי |
| [A28](#a28) | P3 | האימון / האי / החנות | CI | פריסת Pages כוללת חומרי פיתוח ואימות רבים |
| [A32](#a32) | P3 | האימון | בדיקות | כשל השקת דפדפן משאיר שרת בדיקה פתוח |
| [A33](#a33) | P3 | האי | בדיקות | מבחן CSP ל־worker מוסיף כותרת שאינה מוגדרת בפריסה |
| [A34](#a34) | P3 | באקה סאן | בדיקות | fixture שמוגדר סינתטי כולל פרט קשר עסקי קיים |
| [A35](#a35) | P3 | באקה סאן / האימון | ביצועים | מאזיני אירוע מצטברים בביקורים חוזרים במסכים |

<a id="a01"></a>
### A01 — P1: יצירת תשלום יכולה להחליף סכום של הזמנה אחרת

ה־handler מקבל order.no ושורות מהקורא, מחשב מהן מחיר ושולח PATCH בהרשאת שרת להזמנה שמספרה נבחר בבקשה. בשחזור נשלח total=10 אל מספר ההזמנה הסינתטי, כאשר clientTotal היה 1000, בלי קריאת הזמנה שמורה או בדיקת בעלות. הבקשות נעצרו ב־fetch מדומה; אין טענה שהשתנתה רשומת ייצור.

**שחזור:**
1. הריצו node audit/2026-11-05/tools/backend.mjs עם PGlite מותקן לפי README.
2. בדקו payment-order-authorization-and-return-origin: status=200, readSavedOrder=false ו־patch.total=10.

**תיקון מוצע:** לטעון הזמנה שמורה לפי מזהה אטום ויכולת גישה קשורה ללקוח; לחשב מהשורות השמורות, להגביל מעבר סטטוס ולמנוע החלפת תהליך של הזמנה אחרת. להגביל גם returnBase לרשימת origins מאושרים.

**אימות תיקון:** בקשה ללא יכולת גישה או עם מספר הזמנה אחר נדחית; שינוי שורות בדפדפן אינו משנה הזמנה שמורה; אין פנייה לספק לפני האימות.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [supabase/functions/grow-pay/index.ts:18](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/functions/grow-pay/index.ts#L18), [supabase/functions/grow-pay/index.ts:41](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/functions/grow-pay/index.ts#L41).

ראיות: [iterations/02/backend.json](iterations/02/backend.json).

<a id="a02"></a>
### A02 — P1: bootstrap מצרף כל משתמש בפרויקט לארגון

הרצת ה־SQL עם שני משתמשי auth סינתטיים הוסיפה את שניהם ל־members, גם כשהשני לא הוזמן. docs/settings ו־Storage מסתמכים על חברות זו לגישה לנתוני הארגון.

**שחזור:**
1. הריצו backend.mjs.
2. ב־bootstrap-membership בדקו unrelatedUserEnrolled=true.

**תיקון מוצע:** להחליף cross join ברשימת משתמשים מוזמנים ומפורשת, עם בדיקת זהות ועסק לפני INSERT. לבדוק בנפרד חברויות קיימות בענן.

**אימות תיקון:** משתמש לא מוזמן אינו מקבל חברות או גישה ל־docs/settings/receipts; משתמש מוזמן מקבל רק את הארגון והתפקיד שאושרו.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [supabase/bootstrap.sql:6](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/bootstrap.sql#L6), [supabase/schema.sql:52](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/schema.sql#L52), [supabase/storage.sql:11](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/storage.sql#L11).

ראיות: [iterations/02/backend.json](iterations/02/backend.json).

<a id="a03"></a>
### A03 — P1: עדכון באקה סאן מוחק מטמוני אפליקציות ותור שיתוף

הפעלת sw.js האמיתי מחקה bakasun-share, island-assets-audit, workout-royiki-v1 ומטמון שאינו קשור. אובדן תור שיתוף יכול למחוק את העותק היחיד של קובץ שטרם יובא; הורדת האי ללא רשת מתבטלת.

**שחזור:**
1. הריצו python3 audit/2026-11-05/tools/reliability.py.
2. השוו before/after ב־root-worker-cross-app-cache-deletion. כל הנתונים בשחזור נוצרו על ידי הכלי.

**תיקון מוצע:** למחוק רק גרסאות shell ישנות שה־worker הזה מחזיק בהן, לפי namespace מפורש; לשמר את תור השיתוף ומטמוני שאר האפליקציות.

**אימות תיקון:** לאחר התקנת גרסה חדשה, קובץ שיתוף ממתין עדיין נפתח ושלושת משחקי האי עדיין עולים ללא רשת; רק shell ישן מוסר.

**גבול הראיה:** אומת ב־Cache API אמיתי בפרופיל בדיקה חדש; אין פגיעה בנתוני משתמש אמיתי.

מקור: [sw.js:9](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/sw.js#L9), [sw.js:17](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/sw.js#L17).

ראיות: [iterations/05/reliability.json](iterations/05/reliability.json).

<a id="a04"></a>
### A04 — P2: אימות תשלום מקבל סכום חסר או לא סופי

matchesOrder מחזיר true כשהספק מסמן עסקה כששולמה אך sum חסר, null או הופך ל־NaN. השוואה עם NaN אינה דוחה את העסקה. בקרות Infinity ואפס דווקא נדחו; אין להציג אותן כקלט שהתקבל.

**שחזור:**
1. הריצו backend.mjs.
2. השוו payment-amount-validation עבור missing, null ו־invalid לבקרות Infinity, אפס ו־100.

**תיקון מוצע:** לדרוש paid מאומת, מזהה עסקה וסכום Number.isFinite חיובי שתואם להזמנה ולמטבע לפני שינוי ל־paid; לטפל במידע פגום כמצב לא מאומת.

**אימות תיקון:** סכום חסר/פגום/אינסופי נדחה; סכום תואם מאושר; אי־התאמת עסקה או סכום נדחית.

**גבול הראיה:** נבדק handler עם תשובות ספק מדומות. לא הוכח שתוקף יכול לשנות תשובת ספק אמיתית.

מקור: [supabase/functions/_shared/grow.mjs:97](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/functions/_shared/grow.mjs#L97), [supabase/functions/_shared/grow.mjs:94](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/functions/_shared/grow.mjs#L94).

ראיות: [iterations/02/backend.json](iterations/02/backend.json).

<a id="a05"></a>
### A05 — P2: north.sql אינו ניתן להתקנה במסד חדש

Postgres דחה את קובץ ה־SQL עם 42703: grow_process_id אינו קיים בעת יצירת מדיניות INSERT. עמודות התשלום נוספות רק בהמשך הקובץ. הקובץ גם אינו מצהיר במפורש על GRANT לטבלאות החדשות.

**שחזור:**
1. הריצו backend.mjs על PGlite חדש.
2. בדקו north-fresh-SQL: compiled=false.

**תיקון מוצע:** להגדיר את כל העמודות לפני יצירת policies, להחיל migration טרנזקציוני ולהוסיף GRANT מצומצם לתפקידים הדרושים, בהתאם ל־RLS ולהנחיות הריפו.

**אימות תיקון:** התקנה חדשה והרצה חוזרת מסתיימות בהצלחה; anon מוסיף רק הזמנה חדשה, אינו קורא/מעדכן הזמנות, וצוות מורשה מקבל גישה נדרשת.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [supabase/north.sql:27](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/north.sql#L27), [supabase/north.sql:48](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/north.sql#L48).

ראיות: [iterations/02/backend.json](iterations/02/backend.json).

<a id="a06"></a>
### A06 — P2: גיבוי עם מזהה תקין ושדה מטיפוס שגוי משבית מסך

importJson מסנן id ושני שדות מיוחדים אך מקבל priority כאובייקט. מסך המשימות מציג charAt is not a function והרשומה נשארת לאחר רענון. בשחזור נוסף יבוא שנזרק באמצע הותיר רשומה בזיכרון והפעיל change callback לפני הדחייה; היבוא אינו אטומי.

**שחזור:**
1. הריצו tools/security.py.
2. בדקו bakasun-backup-type-confusion וצילומי bakasun-poison בשתי המידות.

**תיקון מוצע:** לבדוק גודל, מספר רשומות וסכמה לכל אוסף לפני שינוי state. להציג שגיאות קלט ולבצע מיזוג רק לאחר בדיקה מלאה, עם אפשרות התאוששות מהייבוא.

**אימות תיקון:** object/null/מערכים בשדות scalar נדחים ללא שינוי במסד; גיבוי תקין עדיין מתמזג; מסכי משימות נפתחים לאחר רענון.

**גבול הראיה:** אומת דרך יבוא אותו JSON במודול האמיתי ובדפדפן; change hook מדומה ולא בוצע יבוא לענן.

מקור: [js/store.js:87](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/store.js#L87), [js/screens/tasks.js:24](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/screens/tasks.js#L24).

ראיות: [iterations/02/security.json](iterations/02/security.json), [iterations/06/backup-atomicity.json](iterations/06/backup-atomicity.json).

<a id="a07"></a>
### A07 — P2: JSON פגום מוחלף בנתונים ריקים ללא עותק התאוששות

שלוש שכבות האחסון מחזירות ברירת מחדל אחרי parse שנכשל. שמירה/שינוי הבא דורס את הטקסט הפגום, בלי התראה או backup. האי משמש בקרה חיובית: הוא שומר עותק corrupt ומשמר את המקור.

**שחזור:**
1. הריצו reliability.py.
2. השוו שלושת מקרי corrupt-local-state למקרה island-corrupt-local-state.

**תיקון מוצע:** לשמר את הבתים המקוריים תחת מפתח התאוששות, להציג מצב כשל ולחסום דריסה אוטומטית עד להחלטת שחזור מפורשת.

**אימות תיקון:** מידע פגום אינו נעלם בפתיחה או בשמירה הבאה; ניתן להורידו לבדיקה; פגיעה במכסה אינה מוחקת גם את עותק ההתאוששות.

**גבול הראיה:** השחזור משתמש בטקסט סינתטי פגום בלבד, לא במאגר אישי.

מקור: [js/store.js:21](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/store.js#L21), [workout/js/store.js:7](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/store.js#L7), [north/js/cart.js:6](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/cart.js#L6).

ראיות: [iterations/05/reliability.json](iterations/05/reliability.json).

<a id="a08"></a>
### A08 — P2: כשל מכסת אחסון מוצג כהצלחה מקומית

באימון save מחזיר false אך setProfile ומסלולים נוספים מתעלמים מכך. בחנות save בולע חריגה, והסל מציג פריט שלא נשמר. בבקרת באקה סאן הופיע פס שגיאה כנדרש.

**שחזור:**
1. הריצו reliability.py.
2. בדקו workout-quota-error ו־north-quota-error: storageUnchanged=true בלי errorBar/alert; בחנות cartCount=1.

**תיקון מוצע:** להעביר סטטוס שמירה לממשק, להציג הודעה נגישה ולהציע יצוא/ניסיון חוזר. אין לסמן מידע כעמיד אחרי כשל; לשמר שינוי זמני בצורה ברורה.

**אימות תיקון:** QuotaExceededError ו־SecurityError מובילים להודעה ברורה; רענון אינו מפתיע באובדן שינוי שהוצג כשמור.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [workout/js/store.js:47](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/store.js#L47), [workout/js/store.js:58](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/store.js#L58), [north/js/cart.js:10](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/cart.js#L10).

ראיות: [iterations/05/reliability.json](iterations/05/reliability.json).

<a id="a09"></a>
### A09 — P2: הגדרה שנדחתה ביבוא עדיין נכנסת לתור הענן

ייבוא משמר הגדרה מקומית קיימת, אך onChange מקבל את הערך מהגיבוי שנדחה. כשהסנכרון מופעל, enqueue שומר את ערך ה־hook הזה בתור, ולכן המכשיר והסנכרון מחזיקים ערכים שונים. בדיקת B3-S02 current עברה בשלוש הרצות; יעד התיקון מדולג.

**שחזור:**
1. הריצו node --test tests/bakasun-store.mjs.
2. בדקו B3-S02 current: הערך המקומי נשמר אך changes מכיל את ערך הגיבוי.

**תיקון מוצע:** להפעיל onChange רק כשהמיזוג שינה את ההגדרה ובערך האפקטיבי שנשמר, תוך שמירת הגדרות שמוגדרות כמקומיות למכשיר.

**אימות תיקון:** גיבוי עם ערך שונה אינו משנה תור ענן כאשר ההגדרה המקומית ניצחה; הגדרה חסרה/ריקה מתמזגת פעם אחת.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [js/store.js:102](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/store.js#L102), [tests/bakasun-store.mjs:29](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/bakasun-store.mjs#L29).

ראיות: [evidence/verification-summary.json](evidence/verification-summary.json).

<a id="a10"></a>
### A10 — P2: מחיקה ישנה מהענן מוחקת עריכה מקומית חדשה

mergeRemote מטפל ב־deleted לפני השוואת גרסאות. tombstone ישן מסיר רשומה שנערכה עכשיו. השחזור הקיים B3-S01 current עדיין עובר; בדיקת חוזה התיקון מדולגת.

**שחזור:**
1. הריצו node --test tests/bakasun-store.mjs.
2. בדקו B3-S01 current: לקוח סינתטי חדש נמחק עם tombstone משנת 2000.

**תיקון מוצע:** להגדיר סדר שרת/גרסה שנראתה והכרעה מפורשת בין עריכה למחיקה, כולל רשומה ששוחזרה. לא להכריע לפי שעון מכשיר בלבד.

**אימות תיקון:** מחיקה שכבר הוחלפה בעריכה או שחזור אינה מנצחת; מחיקה חדשה תקפה נשמרת; שני מכשירים מתכנסים לאותה תוצאה.

**גבול הראיה:** נבדק ממשק המיזוג בקוד המקומי; סדר אירועים בשירות פרוס לא נבדק.

מקור: [js/store.js:75](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/store.js#L75), [tests/bakasun-store.mjs:13](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/bakasun-store.mjs#L13).

ראיות: [evidence/verification-summary.json](evidence/verification-summary.json).

<a id="a11"></a>
### A11 — P2: יצוא JSON אינו גיבוי מלא של הקבצים המקומיים

בבאקה סאן exportJson מכיל metadata ומזהי קבצים אך לא blobs מ־IndexedDB. באימון export מסדר את state בלבד, ואינו כולל סרטונים/תמונות/הקלטות שנשמרו במאגרים אחרים. עותק שלא עלה לענן אינו ניתן לשחזור מה־JSON בלבד.

**שחזור:**
1. הריצו בדיקת B3-S04 current ב־tests/bakasun-store.mjs.
2. השוו את שדות exportJson ו־store.export לממשקי אחסון הקבצים והווידאו.

**תיקון מוצע:** להציע ארכיון שחזור עם bytes ו־manifest מאומת, או לשנות את התיאור ל״גיבוי נתונים בלבד״ ולהוסיף מסלול נפרד לקבצים. להציג קבצים שטרם גובו.

**אימות תיקון:** שחזור במכשיר חדש ללא רשת מחזיר את המסמך/המדיה או מזהיר במפורש שהגיבוי אינו כולל אותם.

**גבול הראיה:** בדיקת B3 מוכיחה את מסלול העסק; מסלול האימון נבדק מהפרדת מאגרי האחסון בקוד.

מקור: [js/store.js:84](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/store.js#L84), [js/files.js:6](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/files.js#L6), [workout/js/store.js:62](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/store.js#L62).

ראיות: [evidence/verification-summary.json](evidence/verification-summary.json).

<a id="a12"></a>
### A12 — P2: תשובת שרת 503 דורסת מודול תקין במטמון

sw.js מכניס כל תגובת GET למטמון בלי לבדוק status. תשובת 503 מקומית החליפה tasks.js תקין, ולאחר מעבר ללא רשת ה־shell לא הציג כותרת מסך.

**שחזור:**
1. הריצו reliability.py.
2. בדקו root-worker-caches-error-response: cachedStatus.module=503, offlineHasHeading=false.

**תיקון מוצע:** לשמור רק תגובות תקינות ושלמות מהסוג המתאים; לשמר עותק תקין על 5xx ולדווח על ניסיון עדכון כושל. להגביל caching למשאבים שבבעלות ה־shell.

**אימות תיקון:** 500/503/404 אינם מחליפים JS/HTML תקין; אחריהם רענון ללא רשת עדיין עולה עם הגרסה האחרונה התקינה.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [sw.js:32](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/sw.js#L32).

ראיות: [iterations/05/reliability.json](iterations/05/reliability.json).

<a id="a13"></a>
### A13 — P2: אין CSP במסמכי הכניסה של האימון והחנות

שני מסמכי HTML אינם מכריזים CSP, וה־workflow אינו מוסיף מדיניות עבורם. marker שהוכנס כ־inline script רץ, בעוד באקה סאן והאי חסמו אותו. זו שכבת הגנה חסרה באותו origin של מידע עסקי ומשפחתי.

**שחזור:**
1. הריצו security.py.
2. השוו ארבעה מקרי CSP-inline-marker.

**תיקון מוצע:** להגדיר מדיניות מצומצמת בכל מסמכי הכניסה, להעביר inline scripts לקבצים מקומיים ולבדוק גם workers, דפי עזר ונתיבי תשלום. להפריד origins לאפליקציות בעלות גבולות אמון שונים כשאפשר.

**אימות תיקון:** inline handlers/scripts ו־eval נחסמים בלי לשבור פונקציונליות; בדיקות שליליות מאמתות חסימה תחת המדיניות שנשלחת בפועל.

**גבול הראיה:** כותרות HTTP נמדדו רק בשרת המקומי. ניסיון קריאת שבעה קבצים סטטיים מהאתר החי נחסם בפרוקסי סביבת העבודה ב־403 לפני הגעה לשרת; זו אינה תגובת האתר. אין אישור לכותרות hosting בפועל.

מקור: [workout/index.html:3](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/index.html#L3), [north/index.html:3](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/index.html#L3), [.github/workflows/pages.yml:25](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/.github/workflows/pages.yml#L25).

ראיות: [iterations/02/security.json](iterations/02/security.json), [evidence/hosting-headers.json](evidence/hosting-headers.json).

<a id="a15"></a>
### A15 — P2: יצוא CSV משמר נוסחאות בטקסט מיובא

csvCell מצטט מפרידים ומרכאות אך אינו מנטרל קידומות נוסחה. טקסט חיצוני מרשימת משתתפים/ייבוא יכול להיפתח כנוסחה ביישום גיליונות. בדיקת B3-A02 current עדיין עוברת.

**שחזור:**
1. הריצו node --test tests/bakasun-security.mjs.
2. בדקו את הפלט עבור ערך טקסט סינתטי שמתחיל ב־=; לא נדרש לפתוח גיליון או רשת כדי לאמת את הקידומת.

**תיקון מוצע:** לנטרל קידומות נוסחה בשדות טקסט לא מהימנים לפי מדיניות CSV מתועדת, כולל whitespace; לשמר ערכים מספריים חוקיים כשדות מספריים.

**אימות תיקון:** קידומות =,+,-,@ בטקסט אינן מפוענחות כנוסחה; פסיקים, שורות חדשות, עברית ומספרים נשמרים.

**גבול הראיה:** לא הופעלה נוסחה חיצונית ולא נפתח Excel/Sheets; ההוכחה היא שימור הקידומת בקובץ.

מקור: [js/logic/participants.js:137](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/logic/participants.js#L137), [tests/bakasun-security.mjs:54](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/bakasun-security.mjs#L54).

ראיות: [evidence/verification-summary.json](evidence/verification-summary.json).

<a id="a16"></a>
### A16 — P2: שדות וכפתורי תמונות ללא שמות נגישים

axe מצא label חסר בארבעה שדות הגדרות אימון ובשדות החנות, select ללא שם בבונה ושני כפתורי thumbnails ללא שם בדף מוצר. label סמוך אינו קשור לקלט ללא for/id או עטיפה.

**שחזור:**
1. הריצו accessibility.py וצילומי סבב 04.
2. סננו label/select-name/button-name בראיות. בדקו ניווט Tab בהגדרות ובקופה.

**תיקון מוצע:** לחבר תוויות לקלט ולתת שם מתאר לכל כפתור תמונה; לשמור השמות לאחר רינדור מחדש ושינוי שיטת משלוח/תשלום.

**אימות תיקון:** axe אינו מחזיר את הכללים הללו במסכי המדגם; טכנולוגיה מסייעת מזהה שם ותפקיד לכל שדה/כפתור.

**גבול הראיה:** WCAG 1.3.1/3.3.2/4.1.2; בדיקה אוטומטית ומקלדת, ללא אישור קורא מסך מלא.

מקור: [north/js/app.js:110](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/app.js#L110), [north/js/app.js:177](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/app.js#L177), [workout/js/app.js:1058](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/app.js#L1058).

ראיות: [iterations/03/accessibility.json](iterations/03/accessibility.json), [iterations/04/capture.json](iterations/04/capture.json).

<a id="a17"></a>
### A17 — P2: טקסט משני ובקרות אינם עומדים בניגודיות AA

axe מצא כשלים חוזרים בשלוש האפליקציות: למשל 4.26:1 בטקסט האימון ו־3.81:1 בסיכום הבונה, מול 4.5:1 בטקסט רגיל. בבאקה סאן נמצאו גם כשלי טקסט בהגדרות ובלוח הבקרה.

**שחזור:**
1. פתחו accessibility.json וסננו color-contrast.
2. כל node כולל selector, צבעי foreground/background וגודל טקסט מחושב.

**תיקון מוצע:** לעדכן tokens של טקסט משני, מצבי כפתור ופלטות בשני מצבי צבע; למדוד צבעים מורכבים ושקיפויות בפועל, לא לפי צילום בלבד.

**אימות תיקון:** טקסט רגיל מגיע לפחות ל־4.5:1, טקסט גדול ל־3:1 והבקרות נבדקות גם במיקוד/disabled לפי תחולת הקריטריון.

**גבול הראיה:** WCAG 1.4.3. לא כל כלל best-practice של axe הוא כשלעצמו כשל WCAG; כל מקרה נבחן לפי יחס וגודל.

מקור: [css/app.css:1](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/css/app.css#L1), [workout/css/style.css:1](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/css/style.css#L1), [north/css/style.css:2](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/css/style.css#L2).

ראיות: [iterations/03/accessibility.json](iterations/03/accessibility.json).

<a id="a18"></a>
### A18 — P2: חלון פעולות בלוח האירועים אינו נגיש כמחסום מיקוד

החלון המותאם בלוח אינו משתמש ב־dialog המשותף: אין role=dialog, עשרה מתוך 16 צעדי Tab יצאו ממנו ו־Escape לא סגר. הבקרה של הדיאלוג המשותף עברה.

**שחזור:**
1. הריצו accessibility.py --keyboard-only אחרי הסריקה הראשונה.
2. בדקו bakasun-board-dialog לעומת bakasun-shared-dialog-control.

**תיקון מוצע:** להעביר את החלון לרכיב דיאלוג אחיד עם שם, מיקוד ראשוני, trap, Escape ושחזור מיקוד; להשבית רקע בזמן פתיחה.

**אימות תיקון:** Tab/Shift+Tab נשארים בחלון; Escape סוגר; המיקוד חוזר לכפתור הפעולות גם לאחר שינוי סטטוס.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [js/screens/board.js:189](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/screens/board.js#L189).

ראיות: [iterations/03/accessibility.json](iterations/03/accessibility.json).

<a id="a19"></a>
### A19 — P2: שער הגיל ומגירת הסל משאירים את הרקע במקלדת

שער הגיל אינו דיאלוג סמנטי והמיקוד מגיע לרקע. מגירת הסל נסגרת ב־Escape אך כל צעדי Tab במדגם יצאו ממנה, והסגירה לא החזירה מיקוד לכפתור הסל.

**שחזור:**
1. בדקו north-age-gate ו־north-cart-drawer ב־accessibility.json.
2. פתחו סל ב־Enter והמשיכו ב־Tab/Shift+Tab.

**תיקון מוצע:** להשתמש בדיאלוג נגיש עם aria-modal/inert או dialog מקורי; למקד את הפעולה הרלוונטית, ללכוד Tab ולשחזר מיקוד.

**אימות תיקון:** המשתמש אינו מגיע לקישורי רקע כשהשכבה פתוחה; שם השכבה מוכר לטכנולוגיה מסייעת; Escape והחזרת מיקוד עקביים.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [north/js/app.js:370](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/app.js#L370), [north/js/app.js:21](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/app.js#L21), [north/index.html:48](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/index.html#L48).

ראיות: [iterations/03/accessibility.json](iterations/03/accessibility.json).

<a id="a22"></a>
### A22 — P2: כשל שמירת הזמנה עדיין מרוקן את הסל

אחרי כשל רשת saveOrder מחזיר false, אך submitOrder ממשיך לדף תודה ומנקה את הסל. כשגם sessionStorage נכשל אין עותק עמיד של ההזמנה ואין קישור שחזור לקופה. יש הצעה לשליחה ידנית כשהעמוד עדיין פתוח.

**שחזור:**
1. הריצו checkout.py; כל פניות הרשת החיצוניות נחסמות.
2. בדקו failed-order-and-session-denied: cartCount=0, sessionOrderAvailable=false.

**תיקון מוצע:** לשמור draft עמיד ולא לנקות סל עד אישור שמירה; בכשל להציע ניסיון חוזר ושיתוף ידני מתוך אותו draft. לא להתקדם למצב הצלחה כשאין קבלה מהשרת.

**אימות תיקון:** כשל שרת/רשת/מכסת sessionStorage משמר סל ופרטי draft; רענון מאפשר להשלים בלי ליצור הזמנה כפולה.

**גבול הראיה:** נעשה שימוש בנתוני טופס סינתטיים בזיכרון בלבד; לא נשלחה הזמנה או הודעה.

מקור: [north/js/app.js:293](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/app.js#L293), [north/js/app.js:295](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/app.js#L295).

ראיות: [iterations/05/checkout.json](iterations/05/checkout.json).

<a id="a24"></a>
### A24 — P2: גרף טעינת הפתיחה כולל עשרות מודולים שאינם נדרשים למסך

גרף static בלבד מונה 124 זהויות מודול בעסק, 69 באימון ו־107 באי, לפני imports דינמיים והרחבות. באימון כ־2.00MB קוד מפוענח; בעסק כ־1.60MB. ספריות משחקים/מצלמה ומסכים רבים מיובאים בפתיחה.

**שחזור:**
1. הריצו module_graph.mjs.
2. השוו ל־startup-performance.json: המדידות הן HTTP/1 מקומי ללא דחיסה, ולא מדידות אתר חי.

**תיקון מוצע:** לטעון מסכים, משחקים ומצלמה בעצלות בנקודות השימוש, עם fallback מסודר; לשמור module singleton אחד למאגרים ולתורי רשת. אין צורך ב־build כדי להשתמש ב־import().

**אימות תיקון:** פתיחת בית אינה מבקשת מודולי מצלמה/משחק שלא נפתחו; LCP/long tasks ותקציב bytes נבדקים על אותו פרופיל לפני/אחרי.

**גבול הראיה:** משקל gzip בגרף הוא חישוב קובץ, לא תעבורת production. LCP ענן אינו LCP בטלפון פיזי.

מקור: [js/app.js:6](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/app.js#L6), [workout/js/app.js:16](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/app.js#L16), [workout/island/engine/load-data.mjs:20](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/island/engine/load-data.mjs#L20).

ראיות: [evidence/module-graph.json](evidence/module-graph.json), [iterations/04/startup-performance.json](iterations/04/startup-performance.json).

<a id="a25"></a>
### A25 — P2: שתי זהויות של מודול offline עוקפות איחוד הורדות

ui/offline.mjs נטען עם תג גרסה ובלעדיו. לכל עותק running משלו: באותה זהות שתי קריאות הורידו פעם אחת; דרך שני העותקים אותו URL הורד פעמיים במקביל.

**שחזור:**
1. הריצו offline-identity.mjs.
2. בדקו control.fetchCount=1 לעומת reproduction.fetchCount=2 ו־uniqueUrls=1; הגרף מאשר שתי זהויות פעילות.

**תיקון מוצע:** לקבע URL קנוני אחד לכל singleton במערכת התיוג המרכזית, או לשתף promise/תור לפי גרסה ו־origin בין עותקים. אין לשנות תגי גרסה במשימת audit זו.

**אימות תיקון:** לחיצה על הורדה בזמן הורדה אוטומטית מצטרפת לאותו תור; כל קובץ יורד פעם אחת ומדדי התקדמות עקביים.

**גבול הראיה:** ההורדה הכפולה שוחזרה עם manifest/Cache API מדומים של קובץ אחד, בלי תעבורה אמיתית.

מקור: [workout/island/app.mjs:16](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/island/app.mjs#L16), [workout/island/ui/offline.mjs:111](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/island/ui/offline.mjs#L111).

ראיות: [evidence/module-graph.json](evidence/module-graph.json), [iterations/04/offline-identity.json](iterations/04/offline-identity.json).

<a id="a26"></a>
### A26 — P2: דמויות הכדורסל חורגות מדרישות שלד 18 ואטלס אחד

בדיקת startup של CSP אישרה characterVersion=4. גופי lod-v4 הפעילים מכילים skin של 52 עצמות. בדיקת createAvatarV1 ו־compactAvatar המקוריים על חמשת התפקידים יצרה שתי מפות לדמות: גוף 1024×512 ואלפא 1024×1024. כל מפה עומדת בגבול המידה, אך דרישות 18 העצמות ואטלס אחד אינן מתקיימות. נכסי v6 שמורים אינם הוכחה שחוברו.

**שחזור:**
1. בדקו hoops-v5-session-start-result בראיות ה־CSP ו־assets.json.
2. הריצו runtime_assets.py; חמשת התפקידים מדווחים 52 עצמות, textureCount=2 ו־drawCalls=2 באריזת הדמות.

**תיקון מוצע:** לתכנן חיבור/retarget לנכס הקנוני בעל 18 עצמות ולבחון איחוד מפות הגוף והאלפא בתוך התקציב, תוך שימור קצוות השיער והצללה. לשמר אנימציות ובחירת שחקן ולמדוד לפני החלפת ברירת מחדל.

**אימות תיקון:** כל דמות פעילה מדווחת 18 עצמות עם שמות קנוניים ומפת דמות אחת עד 1024; מיפוי אנימציה ו־LOD עוברים בדיקות מגע ותנועה; מצב fallback מוגדר ומדווח.

**גבול הראיה:** שש התמונות המקוריות ב־GLB אינן שש מפות runtime. בדיקת האריזה משתמשת בכרטיס/צבעים סינתטיים וללא אנימציות; אינה מדידת FPS. אטלס האלפא יכול להיות משותף בין מופעים.

מקור: [tests/island-browser-csp.test.mjs:155](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/island-browser-csp.test.mjs#L155), [workout/island/minigames/hoops-lod.mjs:181](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/island/minigames/hoops-lod.mjs#L181).

ראיות: [evidence/assets.json](evidence/assets.json), [evidence/csp-summary.json](evidence/csp-summary.json), [iterations/10/runtime-assets.json](iterations/10/runtime-assets.json).

<a id="a29"></a>
### A29 — P2: בדיקות דפדפן מרכזיות אינן שער CI רגיל

ה־job הכללי מריץ Node ללא דגלי browser; ה־job הייעודי מריץ רק island-browser-csp. בדיקות מקלדת העסק, offline, motion/controls ושחזור טעינה נשארות opt-in. אין axe לכל ארבע האפליקציות ב־workflow.

**שחזור:**
1. קראו tests.yml והשוו לתנאי enabled בקבצי browser.
2. הרצה מלאה בתנאי הביקורת: 51 skipped; הפעלת CSP בנפרד: 3 passed.

**תיקון מוצע:** להגדיר jobs ממוקדים עם runtime דפדפן מותקן, axe ומסלולי מקלדת/offline בשתי התנוחות. להבדיל tests שלא הופעלו מהצלחה ולהשאיר artifacts במקרה כשל.

**אימות תיקון:** CI מפעיל במפורש את מסלולי הסיכון בכל האפליקציות; כשל נגישות/JS/offline מכשיל job; אין תלות ב־Playwright שמותקן במקרה במחשב.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [.github/workflows/tests.yml:13](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/.github/workflows/tests.yml#L13), [.github/workflows/tests.yml:29](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/.github/workflows/tests.yml#L29), [tests/bakasun-a11y-browser.mjs:10](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/bakasun-a11y-browser.mjs#L10).

ראיות: [evidence/verification-summary.json](evidence/verification-summary.json).

<a id="a30"></a>
### A30 — P2: ירוק כולל שחזורי באגים ו־33 יעדי תיקון מדולגים

33 מהדילוגים הם בדיקות B3 של ההתנהגות המתוקנת העתידית. במקביל current tests מאמתים שהבאג הקיים עדיין קורה, ולכן הצלחתם אינה עדות שהסיכון נפתר.

**שחזור:**
1. הריצו node --test tests/bakasun-*.mjs.
2. קראו שם current מול fix ו־skip reason במקרי תשלום, גיבוי, אחסון ו־CSV.

**תיקון מוצע:** לקשר כל יעד תיקון לממצא פתוח ולשנות אותו לשער מחייב כאשר התיקון ממומש; לדווח CI על debt צפוי בנפרד ממעבר regressions. לא להסיר skips רק כדי לשפר מספר.

**אימות תיקון:** לאחר תיקון ההתנהגות הרצויה נבדקת ללא skip, ושחזור הישן אינו מגדיר את הבאג כהצלחה נדרשת.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [tests/bakasun-cloud.mjs:52](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/bakasun-cloud.mjs#L52), [tests/bakasun-store.mjs:20](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/bakasun-store.mjs#L20).

ראיות: [evidence/verification-summary.json](evidence/verification-summary.json).

<a id="a31"></a>
### A31 — P2: workflow הפריסה אינו תלוי בהצלחת בדיקות

Publish app מופעל ישירות על push ל־main, בנפרד מ־Tests וללא needs או בדיקת תוצאות. לפי ה־YAML לבדו, בדיקות ופריסה יכולות לרוץ במקביל וגם קוד שנכשל יכול להתפרסם.

**שחזור:**
1. השוו triggers ו־jobs בשני קובצי workflow.
2. בדקו שאין שער בדיקות בתוך job הפריסה.

**תיקון מוצע:** לקשור את הפריסה לאותן בדיקות של אותו SHA באמצעות job תלוי/workflow מאומת, ולהגדיר branch protection בצד GitHub לפי מדיניות הצוות.

**אימות תיקון:** קומיט עם בדיקה נכשלת אינו נפרס; הארטיפקט והבדיקות קשורים לאותו SHA; פריסה ידנית כפופה לשער מוגדר.

**גבול הראיה:** הגנת main והגדרות repository חיות לא נבדקו. ה־connector החזיר רשימות ריקות ל־runs/statuses של SHA הבסיס; לא נטענת טענה שמיזוג בפועל אינו מוגן.

מקור: [.github/workflows/pages.yml:4](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/.github/workflows/pages.yml#L4), [.github/workflows/pages.yml:14](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/.github/workflows/pages.yml#L14).

ראיות: [evidence/verification-summary.json](evidence/verification-summary.json).

<a id="a36"></a>
### A36 — P2: שינוי קוד משפחה עלול לאבד עדכון ענן עם אותו מזהה רשומה

family_events משתמש ב־id כמפתח ראשי גלובלי. אחרי העלאת רשומת כדורסל לקוד A, שליחתה עם אותו id לקוד B אינה מעדכנת דבר בגלל תנאי הבעלות, אבל family_push מחזיר 1. cloud.push המקורי מחזיר true, מרוקן את התור וקובע pending=0, אף שלמשפחה החדשה אין רשומה. גם בתור ללא רשת, אותו id מחליף פריט ממשפחה אחרת. בקרה עם מזהה חדש נשמרה בהצלחה; הרשומה המקורית נשארה מוגנת.

**שחזור:**
1. הריצו node audit/2026-11-05/tools/family_sync.mjs עם PGlite ו־pgcrypto המקומיים.
2. בדקו same-session-after-family-code-change: newFamilyRows=0 לצד clientReportedSuccess=true ו־persistedQueueLength=0.
3. מסלול הממשק: העלאת רשומת כדורסל, יצירת קוד משפחה חדש בהגדרות, עריכת אותה רשומה ושמירה; בדקו במכשיר של המשפחה החדשה. השתמשו רק בשני קודים סינתטיים בסביבה מקומית.

**תיקון מוצע:** להגדיר מפתח רשומה ותור המורכב מהמשפחה והמזהה, ולהחזיר מזהי שורות שאושרו בפועל ושגיאות התנגשות. להסיר מהתור רק רשומות שהשרת אישר שנשמרו, ולהציג עדכון שנותר מקומי.

**אימות תיקון:** אותו id בשתי משפחות נשמר בנפרד או נדחה במפורש בלי להימחק מהתור; עדכון באותה משפחה עובד; אין אפשרות לשנות רשומה של משפחה אחרת.

**גבול הראיה:** ה־SQL המקורי הורץ ללא שינוי עם pgcrypto אמיתי ב־Postgres מקומי, והלקוח המקורי השתמש בתשובת ה־RPC דרך fetch מדומה. לא נבדק מסד חי. הכשל הוא אישור שגוי לסנכרון; תנאי הבעלות עצמו לא נעקף.

מקור: [supabase/family.sql:10](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/family.sql#L10), [supabase/family.sql:61](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/supabase/family.sql#L61), [workout/js/cloud.js:36](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/cloud.js#L36), [workout/js/parent.js:336](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/parent.js#L336).

ראיות: [iterations/13/family-sync.json](iterations/13/family-sync.json).

<a id="a37"></a>
### A37 — P2: כרטיסי קטלוג התרגילים אינם נגישים במקלדת

בכל אחת משתי התנוחות נמצאו 50 כרטיסי תרגיל כ־div עם data-go, ללא תפקיד, tabindex או צאצא נגיש לפעולה. ניסיון focus לא מיקד את הכרטיס, ו־40 צעדי Tab לא הגיעו לאף כרטיס. קישורי הניווט הרגילים כן פעלו ב־Enter. הפעולה על הכרטיס מחוברת רק למאזין click מואצל.

**שחזור:**
1. פתחו workout/index.html#/exercises בפרופיל חדש.
2. נווטו ב־Tab: ניתן להגיע למסננים ולניווט, אך לא לכרטיסי התרגילים. בדקו שאין a/button בתוך הכרטיס.
3. הריצו keyboard_extra.py והשוו בין כרטיסי התרגיל לבין nativeLinkEnterWorks=true בשתי המידות.

**תיקון מוצע:** להשתמש בקישור a עם href למסלול התרגיל עבור כל כרטיס ניווט, עם שם ומצב focus-visible ברורים. לשמר את כל הכרטיס כאזור מגע נוח ולבדוק חזרה לקטלוג.

**אימות תיקון:** Tab ו־Shift+Tab מגיעים לכל כרטיס מוצג, Enter פותח את התרגיל, והמיקוד נראה. אין צורך בעכבר או בהקלדת URL ידנית.

**גבול הראיה:** WCAG 2.1.1; שחזור מקלדת ידני בשתי תנוחות. axe לבדו אינו מגלה בהכרח פעולת click מואצלת על div, ולכן ממצא זה נפרד משמות השדות החסרים.

מקור: [workout/js/app.js:459](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/app.js#L459), [workout/js/app.js:1219](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/app.js#L1219).

ראיות: [iterations/15/keyboard-extra.json](iterations/15/keyboard-extra.json).

<a id="a14"></a>
### A14 — P3: ערכי תמונה מהאחסון משולבים כ־HTML ללא escaping

ערך img בסל החנות ו־kidfit.facePic באימון נכנסים ישירות למחרוזת HTML. ערך מקומי שהכיל סגירת מרכאות ו־onerror הפעיל marker בשני המסלולים.

**שחזור:**
1. הריצו security.py.
2. בדקו north-local-state-XSS ו־workout-local-state-XSS: executed=1.

**תיקון מוצע:** ליצור אלמנטים עם DOM API, לקבוע src כמאפיין ולבדוק פרוטוקולים וסכמת state. לא לטפל ב־localStorage כמקור HTML מהימן; להוסיף CSP כשכבה נוספת.

**אימות תיקון:** מרכאות/תגיות/handlers בערכי state אינם יוצרים מאפיינים; קלט תקין עדיין מציג תמונה.

**גבול הראיה:** נדרשת כבר שליטה באחסון של ה־origin. לא נמצא מסלול מסירה מרחוק; זהו ממצא הקשחה מותנה, לא הוכחת XSS מרחוק.

מקור: [north/js/app.js:212](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/app.js#L212), [workout/js/app.js:1135](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/app.js#L1135).

ראיות: [iterations/02/security.json](iterations/02/security.json).

<a id="a20"></a>
### A20 — P3: תפקיד dialog מוצמד לאלמנטים שאינם מתירים אותו

axe מחזיר aria-allowed-role על form בדיאלוג המשותף ועל aside במגירת הסל. לכידת מיקוד תקינה אינה מתקנת את סמנטיקת האלמנט.

**שחזור:**
1. בדקו capture.json בסבב 02 עבור aria-allowed-role.
2. פתחו קריאה חדשה ואת הסל ובדקו את אלמנט הדיאלוג.

**תיקון מוצע:** להשתמש ב־dialog או במעטפת div בעלת role=dialog, ולהשאיר form/aside בתפקיד HTML מתאים. לעדכן בעת התיקון בדיקות שתלויות בסמנטיקה הישנה.

**אימות תיקון:** aria-allowed-role אינו מופיע ושם/aria-modal נשמרים יחד עם בדיקות המקלדת.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [js/ui.js:35](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/ui.js#L35), [north/index.html:48](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/index.html#L48).

ראיות: [iterations/02/capture.json](iterations/02/capture.json).

<a id="a21"></a>
### A21 — P3: תוכן האפליקציה העסקית אינו בתוך main landmark

בכל 52 ביקורי מסכי העסק axe החזיר landmark-one-main, משום שה־root הוא div. חלק גדול מתוכן המסכים נשאר מחוץ ל־landmarks.

**שחזור:**
1. בדקו landmark-one-main ו־region בסריקת 03.
2. בדקו את #app ב־index.html.

**תיקון מוצע:** להגדיר main יחיד לתוכן הראשי ולספק מסלול דילוג לניווט חוזר; לשמור כותרות מסך ומיקוד גם לאחר redraw.

**אימות תיקון:** main יחיד מופיע בכל מסך; ניווט וירטואלי יכול להגיע אליו; אזורי nav נשארים מסומנים.

**גבול הראיה:** זהו כלל מבני/best-practice של axe; לא מוצג לבדו כהוכחה להפרת כל דרישות WCAG 2.4.1.

מקור: [index.html:36](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/index.html#L36).

ראיות: [iterations/03/accessibility.json](iterations/03/accessibility.json).

<a id="a23"></a>
### A23 — P3: מספר הזמנה לא מוכר מוצג כהזמנה שנקלטה

פתיחת thanks עם מספר שלא קיים במכשיר מציגה ״ההזמנה נקלטה״ בלי לקרוא מצב מאומת. אותו מצב מופיע אחרי כשל שמירת הזמנה ו־sessionStorage ורענון.

**שחזור:**
1. פתחו מקומית north/index.html#/thanks/audit-nonexistent.
2. בדקו north-fabricated-thanks-route ו־afterReloadClaimsReceived.

**תיקון מוצע:** להציג ״לא ניתן לאמת את ההזמנה״ עם דרך התאוששות, או לאמת באמצעות יכולת גישה מוגבלת לסטטוס הזמנה; לא להשתמש בפרמטר URL כהוכחת קליטה.

**אימות תיקון:** מספר שרירותי, session פגום ורענון אחרי כשל אינם מציגים אישור קליטה; הזמנה מאומתת כן.

**גבול הראיה:** אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.

מקור: [north/js/app.js:331](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/north/js/app.js#L331).

ראיות: [iterations/05/reliability.json](iterations/05/reliability.json), [iterations/05/checkout.json](iterations/05/checkout.json).

<a id="a27"></a>
### A27 — P3: חריגות תקציב בנכסים וכיסוי Draco חלקי

assets/alpine-rush/athlete.glb הוא 1,674,140 bytes וללא Draco; זהו חריג גודל GLB היחיד מבין 236, ואינו דמות הסקי הראשית. שתי מפות חיצוניות של athlete fallback בכדורגל ותמונה בנכס הספרייה shop-corner הן 2048×2048. גם שני נכסי מסלול סקי פעילים שנתבקשו במבחנים, route-marker-sunset ו־safety-fence-sunset, אינם דחוסים ב־Draco; משקליהם קטנים, 11,648 ו־45,108 bytes. אין להסיק שכל חריג הוא עלות פתיחה גדולה.

**שחזור:**
1. הריצו inventory.py ו־constraints.py; בדקו allInventoryImagesOver1024 ואת חריג הגודל.
2. השוו לדמויות ברירת המחדל בכדורגל ובסקי, ולקוד בחירת athlete fallback ב־soccer-view.mjs.

**תיקון מוצע:** להחיל תקציב על נכסים פעילים ו־fallback: להקטין מפות עד 1024, לדחוס GLB ולבדוק גודל כולל עם קבצים חיצוניים. לברר שימוש בנכסי ספרייה ישנים ולהוציא נכס לא נדרש מההפצה במסגרת שינוי נפרד.

**אימות תיקון:** כל GLB בחבילת היעד עד 1,500,000 bytes, וכל מפה מוטמעת או חיצונית עד 1024. גם כשל טעינת הדמות הראשית מוביל ל־fallback העומד בתקציב תחת CSP.

**גבול הראיה:** חריגות הטקסטורה אינן מפות דמויות ברירת המחדל בששת המבחנים. שני נכסי המסלול הלא דחוסים כן נתבקשו; אין מכאן הוכחה להאטת הסקי הנוכחי או לכך שנכס הספרייה מצויר בעיר.

מקור: [workout/island/minigames/alpine-view.mjs:22](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/island/minigames/alpine-view.mjs#L22), [workout/island/minigames/soccer-view.mjs:126](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/island/minigames/soccer-view.mjs#L126).

ראיות: [evidence/assets.json](evidence/assets.json), [evidence/platform-constraints.json](evidence/platform-constraints.json), [TEXTURES.md](TEXTURES.md).

<a id="a28"></a>
### A28 — P3: פריסת Pages כוללת חומרי פיתוח ואימות רבים

מודל כללי ההעתקה ב־workflow כולל 4,143 קבצים וכ־419MB. כ־196MB מסווגים בכלים, verification, previews וחומרי מקור/בדיקה; source יחיד מסונן אך תיקיות פיתוח אחרות נשארות.

**שחזור:**
1. הריצו deployment.py.
2. בדקו nonRuntimeArtifacts ולמשל דוחות viewer גדולים שנכללים בפריסה.

**תיקון מוצע:** לבנות allowlist לנכסי runtime ודפי עזר שנבחרו במפורש; לארוז דוחות/מקור מחוץ לאתר המוצר ולבדוק manifest מול חבילת הפריסה.

**אימות תיקון:** משחקים ו־offline עדיין נטענים, וחומרי המקור/האימות שאינם מיועדים לציבור אינם מופצים. למדוד artifact לפני/אחרי.

**גבול הראיה:** 419MB הם bytes של קבצי ההפצה, לא טעינת פתיחה. הסיווג לפי נתיבים הוא אומדן ואינו טענה שכל דף עזר צריך להימחק.

מקור: [.github/workflows/pages.yml:26](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/.github/workflows/pages.yml#L26), [.github/workflows/pages.yml:29](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/.github/workflows/pages.yml#L29).

ראיות: [evidence/deployment.json](evidence/deployment.json).

<a id="a32"></a>
### A32 — P3: כשל השקת דפדפן משאיר שרת בדיקה פתוח

בדיקת workout-royiki מפעילה server ואז chromium.launch לפני try/finally. כש־Playwright קיים אך browser binary חסר, launch נכשל והשרת נשאר פתוח; הרצה ממוקדת נזקקה ל־timeout לאחר שכבר דיווחה not ok.

**שחזור:**
1. הריצו בדיקה ממוקדת בסביבה עם Playwright ללא browser ברירת המחדל.
2. בדקו timeout של 35 שניות מול כשל launch מיידי; נתיב Chromium תקין דרך adapter איפשר לסוויטה להשלים.

**תיקון מוצע:** לעטוף את פתיחת השרת והדפדפן ב־try/finally מוקדם, לכבד CHROMIUM_PATH ולהגדיר runtime דטרמיניסטי/timeout ברמת job.

**אימות תיקון:** כשל launch מסיים תהליך לא־אפס מיד ומשחרר שרת; מחשב ללא Playwright מדלג במפורש; runtime תקין מריץ את הבדיקה.

**גבול הראיה:** אומת כבעיית ניידות/ניקוי של כלי בדיקה מקומי; לא כשל מוצר ולא הוכחה שה־runner הנוכחי של GitHub נתקע.

מקור: [tests/workout-royiki.test.mjs:92](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/workout-royiki.test.mjs#L92), [tests/workout-royiki.test.mjs:93](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/workout-royiki.test.mjs#L93).

ראיות: [evidence/verification-summary.json](evidence/verification-summary.json).

<a id="a33"></a>
### A33 — P3: מבחן CSP ל־worker מוסיף כותרת שאינה מוגדרת בפריסה

מבחן worker-startup-eval מספק ל־worker כותרת CSP דרך route.fulfill. בשחזור אותה מדיניות במסמך בלבד לא חסמה eval ב־worker חיצוני; הכותרת הנוספת כן חסמה. serveIsland מוסיף גם CSP לכל HTML של כלי העזר, מעבר לתגי הקבצים עצמם.

**שחזור:**
1. הריצו worker_csp.py.
2. השוו workerResponseHasPolicy=false/true; קראו את fixture blocked-worker-startup-eval ואת headers ב־serveIsland.

**תיקון מוצע:** להפריד מבחן של מנגנון ניטור ממבחן פריסת המדיניות: לאמת כותרות אמיתיות לכל worker/document שנדרש לו CSP, או להגדיר במפורש שההגנה ברמת קוד ולא מדיניות worker.

**אימות תיקון:** מבחן deployment נכשל אם מדיניות נדרשת חסרה בתגובה; negative fixture שמוסיף header אינו מוצג כהוכחה שהאתר שולח אותה.

**גבול הראיה:** ממצא בהסקה ובכיסוי הבדיקה, לא הוכחת תקיפה של decoder אמיתי. כותרות השרת החי לא נמדדו ואין טענה שה־worker הנוכחי מפעיל eval על קלט תוקף.

מקור: [tests/island-browser-csp.test.mjs:66](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/island-browser-csp.test.mjs#L66), [tests/helpers/island-browser.mjs:194](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/helpers/island-browser.mjs#L194).

ראיות: [iterations/06/worker-csp-boundary.json](iterations/06/worker-csp-boundary.json).

<a id="a34"></a>
### A34 — P3: fixture שמוגדר סינתטי כולל פרט קשר עסקי קיים

בדיקת B3-A04 current מאמתת שמספר קשר ב־fixture זהה לברירת המחדל העסקית האמיתית שבקוד. המספר עצמו אינו מועתק לביקורת. הסריקה שומרת רק מיקומי קבצים ושורות.

**שחזור:**
1. הריצו tests/bakasun-security.mjs בלי להדפיס את ערכי ה־fixture.
2. בדקו B3-A04 current ואת source-scan.json.

**תיקון מוצע:** להחליף פרטי קשר בחומרי בדיקה בערכים סינתטיים מובהקים, ולהוסיף guard שמונע העתקת פרטי מוצר/אנשים ל־fixtures. לא להסיק אוטומטית שפרט קשר עסקי ציבורי הוא סוד.

**אימות תיקון:** ה־fixture אינו שווה לערך העסקי ואין בו פרטי לקוח/אדם אמיתי; בדיקות אינן יוזמות חיוג/הודעות.

**גבול הראיה:** לא נשמר בביקורת מספר טלפון או ערך מפתח. זהו ממצא היגיינת נתוני בדיקה; לא הוכחה לחשיפת נתוני לקוחות בענן.

מקור: [tests/bakasun-security.mjs:80](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/tests/bakasun-security.mjs#L80).

ראיות: [evidence/verification-summary.json](evidence/verification-summary.json), [evidence/source-scan.json](evidence/source-scan.json).

<a id="a35"></a>
### A35 — P3: מאזיני אירוע מצטברים בביקורים חוזרים במסכים

ב־24 מחזורי ניווט באימון מספר המאזינים עלה מ־16 ל־40 וחזר ל־16 רק לאחר voiceschanged. בעסק עלה מ־21 ל־93 וחזר ל־21 לאחר bakasun:installable. once אינו מנקה מאזין אם האירוע אינו מגיע; render רושם callback חדש בכל פעם.

**שחזור:**
1. הריצו listener_retention.py ואת אותו כלי עם --bakasun.
2. השוו JSEventListeners ב־baseline, cycles-24 ואחרי האירוע. המדידה נעשית לאחר GC ובאותו מסך.

**תיקון מוצע:** לרשום מאזיני lifecycle פעם אחת ברמת מודול או להסירם ביציאה/רינדור מחדש באמצעות cleanup או AbortController. לא לרשום שוב אם הקולות/מצב ההתקנה כבר ידועים.

**אימות תיקון:** מספר המאזינים נשאר קבוע לאחר 24 מחזורי ניווט, ואירוע מאוחר אינו גורם לעשרות רינדורים כפולים.

**גבול הראיה:** הוכחה להצטברות מאזינים; גידול heap שנמדד אינו מיוחס כולו למאזינים. אין מכאן קביעה על קצב קריסה או FPS בטלפון.

מקור: [js/screens/today.js:79](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/js/screens/today.js#L79), [workout/js/app.js:1167](https://github.com/roynaor-work/Bakasun/blob/5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275/workout/js/app.js#L1167).

ראיות: [iterations/06/listener-retention.json](iterations/06/listener-retention.json), [iterations/06/bakasun-listener-retention.json](iterations/06/bakasun-listener-retention.json), [evidence/soak.json](evidence/soak.json).

## משקלים וביצועים

MB בטבלאות = 1,000,000 bytes. משקל gzip הוא חישוב מקומי, לא טענה ששרת הייצור משתמש באותו encoding. [WEIGHTS.md](WEIGHTS.md) מפרט את כל 236 קובצי ה־GLB; ה־HTML מאפשר סינון לכל קובץ. אין GLB חדש בחבילת הביקורת.

### תנאי הפלטפורמה

| דרישה | מצב המוצר שנמצא | ראיות ומגבלות |
|---|---|---|
| three.js r160 מקומי וללא build | אומת | REVISION=160 בייבוא המקורי; דפי המוצר משתמשים במודולים מקומיים. דף הביקורת אינו דורש three.js. |
| GLB עד 1.5MB עם Draco | חלקי במאגר ובנכסי מסלול פעילים | 155 מתוך 236 GLB דחוסים בכל primitives. שמונה דמויות שנבחרו עומדות בגודל וב־Draco. שני נכסי מסלול סקי שנמדדו אינם דחוסים, ומשקלם 11.6/45.1KB. athlete.glb הישן חורג מ־1.5MB ואינו דמות הסקי הפעילה. |
| טקסטורות עד 1024 | מדגם ברירת המחדל עומד; legacy חורג | 38 GLB שתועדו במשחקים ומפות הדמות שנוצרו בקוד עד 1024. שתי מפות חיצוניות של athlete fallback ותמונת ספרייה אחת הן 2048. רקעי 1280 מסומנים בנפרד מטקסטורות חומר. ראו A27. |
| אטלס אחד לדמות | לא עומד בכדורסל | חמש דמויות lod-v4 יוצרות אטלס גוף ואטלס אלפא נפרדים. שש תמונות הקובץ אינן שש מפות runtime. ראו A26 ו־TEXTURES.md. |
| שלד קנוני 18 מ־motion2 | לא עומד בכדורסל | שלושת חוזי motion2 זהים ובעלי 18 עצמות. שמות כדורגל/סקי שנבחרו תואמים; הכדורסל הפעיל הוא 52. rig.json הישן בעל 20 עצמות אינו החוזה הקנוני. |
| LOD | קיים, לא אישור יעד FPS | כדורגל מפעיל רמות דמות ואיכות; כדורסל מפעיל דילול קהל לפי frame time; סקי מחליף איכות ומקטעים נראים. המדדים והשינויים נשמרו בהרצות המשחק. |
| instancing לקהל | קיים בכדורגל; כדורסל ממוזג | קהל הכדורגל בנוי מחמש קבוצות InstancedMesh. זירת v5 בכדורסל משתמשת ב־mesh כרטיסים ממוזג עם LOD של אינדקסים; אין להציגו כ־InstancedMesh. |
| 30fps בטלפון בינוני | לא אומת | SwiftShader בענן אינו GPU של טלפון. נדרש מכשיר פיזי; הציון העצמי נשאר 6 עם החוסר המפורש. |

מקור: [platform-constraints.json](evidence/platform-constraints.json), [runtime-assets.json](iterations/10/runtime-assets.json) ו־[TEXTURES.md](TEXTURES.md). זוהי בדיקת המוצר הקיים; אי־עמידה אינה מוסתרת באמצעות ציוני איכות הביקורת.

### גרף מודולים static

| אפליקציה | זהויות מודול | bytes מפוענחים | gzip מחושב MB |
|---|---:|---:|---:|
| באקה סאן | 124 | 1,600,221 | 0.573 |
| האימון | 69 | 2,000,651 | 0.579 |
| האי | 107 | 1,509,912 | 0.442 |
| החנות | 5 | 78,880 | 0.025 |

הגרף אינו כולל imports דינמיים שלא ניתן להכריע סטטית. זהות מודול כוללת query string; הקבצים הכפולים מפורטים ב־module-graph.json.

### LCP בפרופיל מואט

CPU ×4, viewport 390×844, DPR 2, latency 150ms והורדה 1.6Mbps. שרת HTTP/1 מקומי **ללא דחיסה**, cache רשת מבוטל, service workers חסומים ו־webfonts חיצוניים חסומים. שלוש דגימות לכל אפליקציה. באי ההמתנה כוללת עיר ודמות מוכנות, לאחר שנפסלה מדידה חלקית של loading.

| אפליקציה | דגימות | חציון LCP ms | טווח ms | תעבורה מקומית מרבית MB |
|---|---:|---:|---|---:|
| באקה סאן | 3 | 10,308 | 10,208–10,488 | 1.714 |
| האימון | 3 | 12,612 | 12,316–14,704 | 2.365 |
| האי | 3 | 40,652 | 40,240–44,060 | 10.358 |
| החנות | 3 | 2,988 | 2,896–3,064 | 0.605 |

**הטבלה אינה LCP של האתר החי או טלפון.** דחיסת hosting, HTTP/2/GPU ואיכות הרשת שונים. נרשמו מדידות ה־lab עצמן, בלי להפוך אותן לציון production. יש לאמת בשרת היעד ובטלפון לאחר שינוי טעינה.

### ששת מבחני המשחקים

הסשנים והנכסים האמיתיים הורצו 30 שניות בכוונת כל bench; מדדי FPS להלן הם **SwiftShader בענן משותף תחת עומס**. אין להסיק מהם שהמשחק בטלפון רץ באותו FPS, או שאושר יעד 30fps. זמני אמת, warmup, LOD ו־frame tails נשמרו ב־game-performance.json.

| משחק | viewport | FPS בענן | p95 frame ms | משולשים ב־frame שנדגם |
|---|---|---:|---:|---:|
| כדורגל | 390×844 | 2.7 | 666.7 | 44149 |
| כדורסל | 390×844 | 1.95 | 883.4 | 95156 |
| סקי | 390×844 | 0.6 | 2649.9 | 152574 |
| כדורגל | 844×390 | 2 | 1416.7 | 44150 |
| כדורסל | 844×390 | 0.94 | 1433.3 | 95325 |
| סקי | 844×390 | 0.6 | 2699.8 | 152164 |

משולשי GLB להלן הם סכום meshes ייחודיים מתוך accessor counts, גם עם Draco; הם אינם הכפלת instances, מספר שחקנים או מעברי צל. מספר תמונות בקובץ אינו מספר אטלסי UV או טקסטורות GPU.

### דוגמאות לנכסי runtime וחלופות

| קובץ | MB | משולשים ייחודיים | עצמות skins | תמונות משובצות |
|---|---:|---:|---|---:|
| `workout/island/assets/kid-full.glb` | 1.473368 | 15152 | [31, 31] | 1 |
| `workout/island/assets/soccer-v5/teal-quiff.glb` | 0.045060 | 12564 | [18] | 0 |
| `workout/island/assets/soccer-v5/goalkeeper.glb` | 0.045412 | 12616 | [18] | 0 |
| `workout/island/design/hoops/lod-v4/hoops-v4-pg-lod.glb` | 0.244148 | 5260 | [52] | 6 |
| `workout/island/design/hoops-v5/models/crowd.glb` | 1.029776 | 5524 | [] | 1 |
| `workout/island/design/skier3/skier.glb` | 0.424676 | 24758 | [18] | 0 |
| `workout/island/assets/alpine-rush/athlete.glb` | 1.674140 | 11376 | [49, 2] | 2 |

הנכס האחרון הוא חריג ישן ואינו דמות הסקי הראשית. שלד הכדורגל/סקי הקנוני הוא 18, אבל מסלול הכדורסל הפעיל עדיין משתמש ב־52. תמונות preview גדולות אינן נספרות אוטומטית כטקסטורות חומר פעילות.

### הפצה ו־offline

לפי מודל `.github/workflows/pages.yml`: 4,143 קבצים, 419.134MB. חומרי כלים/אימות שסווגו לפי הנתיב: 196.422MB. זהו משקל artifact ולא משקל startup.

| חבילת אי | קבצים | MB גולמיים |
|---|---:|---:|
| soccer | 54 | 13.187 |
| hoops | 102 | 12.091 |
| alpine | 85 | 6.096 |
| כלל URLs ייחודיים, כולל shell | 667 | 42.173 |

סכומי המשחקים עשויים לכלול קבצים משותפים. alias השורש הריק ב־manifest אינו קובץ חסר. משקל התוכן מחושב מקבצים, לא מתעבורת headers או aliases. אין קובץ manifest חסר במודל חבילת הפריסה שנבדק.

## רשימת בדיקה וציון עצמי

הציונים מתייחסים לאיכות הביקורת, לא לבריאות המוצר. ממצא פתוח אינו ״עבר״. פריט מתחת ל־8 נשאר גלוי עם הסבר החוסר, ולא מקבל ציון מלאכותי כדי לסיים.

| פריט | ציון / 10 | ראיות ומה חסר |
|---|---:|---|
| היקף ופרטיות | 9 | ארבע אפליקציות, main קפוא, נתונים סינתטיים וחסימת רשת; לא נבדק מסד ייצור. |
| אבטחה: XSS, CSP, סודות ואחסון | 9 | שחזורי דפדפן/handler/SQL וסריקת 11,988 גרסאות קבצים; אין טענה שלא ייתכן סוד בפורמט אחר. |
| נגישות: axe ומקלדת | 8 | 72 מצבי מסך, משטחים נוספים, דיאלוגים ושלוש שפות. קורא מסך פיזי לא נבדק. |
| ביצועים ומשקלים | 8 | שלוש דגימות startup מואטות, שש מדידות משחק וסקירת GLB/מודולים; מדידות ענן ללא דחיסת HTTP אינן production RUM. |
| אמינות וגיבויים עוינים | 9 | Cache API אמיתי, שגיאות רשת/מכסה/JSON, offline ושלושת המשחקים אחרי הורדה. |
| בדיקות ו־CI | 9 | שלוש הרצות מלאות זהות; 33 יעדי תיקון מדולגים זוהו. מבחן auto-download כשל וחזר ונכשל, ומדווח כלא פתור. |
| יעד 30fps בטלפון בינוני | 6 | חסר מכשיר פיזי עם GPU אמיתי. לא ניתן להסיק עמידה ביעד מ־SwiftShader; יש להשלים בדיקת טלפון. זו אינה תעודת ביצועים. |
| סבבים וצילומים | 9 | 15 סבבים מתועדים כרגע; שיטות zoom/camera מתוארות, וכל מידה בשם הקובץ נבדקת. |
| בדיקת יציבות ממושכת | 9 | 120.0 דקות; ההרצה הסתיימה. |
| HTML מקומי ודוח בר־שחזור | 8 | קבצים מקומיים בלבד, ללא build/CDN/fetch. תוצאות אימות הדף נשמרות בסבב המסירה. |

## סבבי עבודה

| סבב | תוכן | ביקורת עצמית וצילומים |
|---|---|---|
| 01 | בסיס ומיפוי | [ביקורת](iterations/01/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 02 | אבטחה וגיבוי עוין | [ביקורת](iterations/02/CRITIQUE.md), 20 צילומים + ראיות משלימות בתיקייה |
| 03 | נגישות ומקלדת | [ביקורת](iterations/03/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 04 | ביצועים ומשקל | [ביקורת](iterations/04/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 05 | אמינות וללא רשת | [ביקורת](iterations/05/CRITIQUE.md), 20 צילומים + ראיות משלימות בתיקייה |
| 06 | אימות המסירה ושלילת ממצאי שווא | [ביקורת](iterations/06/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 07 | תיקון ובדיקה חוזרת של המסירה | [ביקורת](iterations/07/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 08 | אימות מסירה נוסף | [ביקורת](iterations/08/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 09 | כיסוי גלריה וקישורים | [ביקורת](iterations/09/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 10 | תנאי פלטפורמה וגיבוי עוין באי | [ביקורת](iterations/10/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 11 | סינון, כיווניות ואימות חוזר | [ביקורת](iterations/11/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 12 | מקורות חיצוניים ותלות בזמני בדיקה | [ביקורת](iterations/12/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 13 | סנכרון משפחתי ובדיקת קישורים | [ביקורת](iterations/13/CRITIQUE.md), 32 צילומים + ראיות משלימות בתיקייה |
| 14 | מקלדת וגרסאות runtime | [ביקורת](iterations/14/CRITIQUE.md), 16 צילומים + ראיות משלימות בתיקייה |
| 15 | אימות מסירה וכיסוי מקלדת מלא | [ביקורת](iterations/15/CRITIQUE.md), 24 צילומים + ראיות משלימות בתיקייה |

כל צילומי המכשיר הם 390×844 או 844×390. קרוב=100%; רחוק=67% zoom במסכי HTML, או camera overview באי כאשר dev view זמין. המדידות נעשו לפני zoom; צילום רחוק אינו בדיקת reflow. דף המסירה עצמו נבדק גם הוא בשתי המידות וללא רשת. ניווט file:// נחסם במדיניות הדפדפן המנוהל; האימות החלופי סיפק כל קובץ מקומית בזיכרון עם offline=true וללא שרת או תעבורת רשת. פתיחה ישירה של file:// מחוץ לסביבה זו לא אומתה.

## סדר תיקון מוצע

1. לסגור את גבולות הרשאת התשלום וחברות הארגון (A01–A02), ולשמר מטמונים/תור שיתוף בעדכון (A03).
2. להקשיח אימות סכום והתקנת SQL, יבוא ואחסון (A04–A12), ואז לטפל בזרימת כשל הקופה.
3. לתקן שמות, ניגודיות ומודאלים עם בדיקת מקלדת/axe חוזרת; לחבר שלד קנוני בעבודה נפרדת, בלי לשנות מדדי משחק.
4. לחייב כיסוי דפדפן ושער פריסה; להפוך יעדי תיקון מדולגים לבדיקות מחייבות עם כל תיקון, ולמדוד שוב בטלפון פיזי.

## שחזור ומסירה

[README.md](README.md) מפרט הרצות ותלויות. [index.html](index.html) הוא דף מקומי ללא רשת או build. [SESSION.md](SESSION.md) מתעד את ההיקף והוראת קבצים חדשים בלבד. [evidence/verification-summary.json](evidence/verification-summary.json) שומר תוצאות ולא ערכי סודות. [DELIVERY.json](DELIVERY.json), [FILE-WEIGHTS.md](FILE-WEIGHTS.md) ו־[SHA256SUMS](SHA256SUMS) מתעדים את החבילה הסופית, משקליה וחתימותיה.

לא נשלחו הודעות, לא בוצעה פריסה או פעולת תשלום, ולא מוזג PR. תיקונים הם הצעות בלבד.
