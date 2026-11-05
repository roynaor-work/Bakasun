"""Evidence-backed findings, source anchors verified against the frozen main."""
from common import *

def ref(file,needle):
    lines=(ROOT/file).read_text().splitlines()
    hits=[i+1 for i,line in enumerate(lines) if needle in line]
    if not hits:raise ValueError(f'Unresolved source anchor: {file}: {needle}')
    return {'file':file,'line':hits[0]}

def findings():
    rows=[]
    def add(id,p,apps,area,title,observed,steps,fix,verify,refs,evidence,limit='אומת בקוד ובסביבה מקומית; מצב שירות הייצור לא נבדק.'):
        rows.append(dict(id=id,priority=p,apps=apps,area=area,title=title,observed=observed,reproduction=steps,proposedFix=fix,verification=verify,sources=[ref(*r) for r in refs],evidence=evidence,limits=limit))
    add('A01',1,['north'],'אבטחה','יצירת תשלום יכולה להחליף סכום של הזמנה אחרת',
        'ה־handler מקבל order.no ושורות מהקורא, מחשב מהן מחיר ושולח PATCH בהרשאת שרת להזמנה שמספרה נבחר בבקשה. בשחזור נשלח total=10 אל מספר ההזמנה הסינתטי, כאשר clientTotal היה 1000, בלי קריאת הזמנה שמורה או בדיקת בעלות. הבקשות נעצרו ב־fetch מדומה; אין טענה שהשתנתה רשומת ייצור.',
        ['הריצו node audit/2026-11-05/tools/backend.mjs עם PGlite מותקן לפי README.', 'בדקו payment-order-authorization-and-return-origin: status=200, readSavedOrder=false ו־patch.total=10.'],
        'לטעון הזמנה שמורה לפי מזהה אטום ויכולת גישה קשורה ללקוח; לחשב מהשורות השמורות, להגביל מעבר סטטוס ולמנוע החלפת תהליך של הזמנה אחרת. להגביל גם returnBase לרשימת origins מאושרים.',
        'בקשה ללא יכולת גישה או עם מספר הזמנה אחר נדחית; שינוי שורות בדפדפן אינו משנה הזמנה שמורה; אין פנייה לספק לפני האימות.',
        [('supabase/functions/grow-pay/index.ts','const order = body.order'),('supabase/functions/grow-pay/index.ts','if (su && sk) await fetch')],['iterations/02/backend.json'])
    add('A02',1,['bakasun'],'אבטחה','bootstrap מצרף כל משתמש בפרויקט לארגון',
        'הרצת ה־SQL עם שני משתמשי auth סינתטיים הוסיפה את שניהם ל־members, גם כשהשני לא הוזמן. docs/settings ו־Storage מסתמכים על חברות זו לגישה לנתוני הארגון.',
        ['הריצו backend.mjs.', 'ב־bootstrap-membership בדקו unrelatedUserEnrolled=true.'],
        'להחליף cross join ברשימת משתמשים מוזמנים ומפורשת, עם בדיקת זהות ועסק לפני INSERT. לבדוק בנפרד חברויות קיימות בענן.',
        'משתמש לא מוזמן אינו מקבל חברות או גישה ל־docs/settings/receipts; משתמש מוזמן מקבל רק את הארגון והתפקיד שאושרו.',
        [('supabase/bootstrap.sql','from auth.users u, orgs o'),('supabase/schema.sql','create policy docs_all'),('supabase/storage.sql','create policy receipts_read')],['iterations/02/backend.json'])
    add('A03',1,['bakasun','workout','island'],'אמינות','עדכון באקה סאן מוחק מטמוני אפליקציות ותור שיתוף',
        'הפעלת sw.js האמיתי מחקה bakasun-share, island-assets-audit, workout-royiki-v1 ומטמון שאינו קשור. אובדן תור שיתוף יכול למחוק את העותק היחיד של קובץ שטרם יובא; הורדת האי ללא רשת מתבטלת.',
        ['הריצו python3 audit/2026-11-05/tools/reliability.py.', 'השוו before/after ב־root-worker-cross-app-cache-deletion. כל הנתונים בשחזור נוצרו על ידי הכלי.'],
        'למחוק רק גרסאות shell ישנות שה־worker הזה מחזיק בהן, לפי namespace מפורש; לשמר את תור השיתוף ומטמוני שאר האפליקציות.',
        'לאחר התקנת גרסה חדשה, קובץ שיתוף ממתין עדיין נפתח ושלושת משחקי האי עדיין עולים ללא רשת; רק shell ישן מוסר.',
        [('sw.js',"self.addEventListener('activate'"),('sw.js',"caches.open('bakasun-share')")],['iterations/05/reliability.json'], 'אומת ב־Cache API אמיתי בפרופיל בדיקה חדש; אין פגיעה בנתוני משתמש אמיתי.')
    add('A04',2,['north'],'אבטחה','אימות תשלום מקבל סכום חסר או לא סופי',
        'matchesOrder מחזיר true כשהספק מסמן עסקה כששולמה אך sum חסר, null או הופך ל־NaN. השוואה עם NaN אינה דוחה את העסקה. בקרות Infinity ואפס דווקא נדחו; אין להציג אותן כקלט שהתקבל.',
        ['הריצו backend.mjs.', 'השוו payment-amount-validation עבור missing, null ו־invalid לבקרות Infinity, אפס ו־100.'],
        'לדרוש paid מאומת, מזהה עסקה וסכום Number.isFinite חיובי שתואם להזמנה ולמטבע לפני שינוי ל־paid; לטפל במידע פגום כמצב לא מאומת.',
        'סכום חסר/פגום/אינסופי נדחה; סכום תואם מאושר; אי־התאמת עסקה או סכום נדחית.',
        [('supabase/functions/_shared/grow.mjs','export function matchesOrder'),('supabase/functions/_shared/grow.mjs','sum: d.sum != null')],['iterations/02/backend.json'], 'נבדק handler עם תשובות ספק מדומות. לא הוכח שתוקף יכול לשנות תשובת ספק אמיתית.')
    add('A05',2,['north'],'אמינות','north.sql אינו ניתן להתקנה במסד חדש',
        'Postgres דחה את קובץ ה־SQL עם 42703: grow_process_id אינו קיים בעת יצירת מדיניות INSERT. עמודות התשלום נוספות רק בהמשך הקובץ. הקובץ גם אינו מצהיר במפורש על GRANT לטבלאות החדשות.',
        ['הריצו backend.mjs על PGlite חדש.', 'בדקו north-fresh-SQL: compiled=false.'],
        'להגדיר את כל העמודות לפני יצירת policies, להחיל migration טרנזקציוני ולהוסיף GRANT מצומצם לתפקידים הדרושים, בהתאם ל־RLS ולהנחיות הריפו.',
        'התקנה חדשה והרצה חוזרת מסתיימות בהצלחה; anon מוסיף רק הזמנה חדשה, אינו קורא/מעדכן הזמנות, וצוות מורשה מקבל גישה נדרשת.',
        [('supabase/north.sql','with check (status'),('supabase/north.sql','add column if not exists grow_process_id')],['iterations/02/backend.json'])
    add('A06',2,['bakasun'],'אבטחה','גיבוי עם מזהה תקין ושדה מטיפוס שגוי משבית מסך',
        'importJson מסנן id ושני שדות מיוחדים אך מקבל priority כאובייקט. מסך המשימות מציג charAt is not a function והרשומה נשארת לאחר רענון. בשחזור נוסף יבוא שנזרק באמצע הותיר רשומה בזיכרון והפעיל change callback לפני הדחייה; היבוא אינו אטומי.',
        ['הריצו tools/security.py.', 'בדקו bakasun-backup-type-confusion וצילומי bakasun-poison בשתי המידות.'],
        'לבדוק גודל, מספר רשומות וסכמה לכל אוסף לפני שינוי state. להציג שגיאות קלט ולבצע מיזוג רק לאחר בדיקה מלאה, עם אפשרות התאוששות מהייבוא.',
        'object/null/מערכים בשדות scalar נדחים ללא שינוי במסד; גיבוי תקין עדיין מתמזג; מסכי משימות נפתחים לאחר רענון.',
        [('js/store.js','importJson(text)'),('js/screens/tasks.js','const prioKey')],['iterations/02/security.json','iterations/06/backup-atomicity.json'], 'אומת דרך יבוא אותו JSON במודול האמיתי ובדפדפן; change hook מדומה ולא בוצע יבוא לענן.')
    add('A07',2,['bakasun','workout','north'],'אמינות','JSON פגום מוחלף בנתונים ריקים ללא עותק התאוששות',
        'שלוש שכבות האחסון מחזירות ברירת מחדל אחרי parse שנכשל. שמירה/שינוי הבא דורס את הטקסט הפגום, בלי התראה או backup. האי משמש בקרה חיובית: הוא שומר עותק corrupt ומשמר את המקור.',
        ['הריצו reliability.py.', 'השוו שלושת מקרי corrupt-local-state למקרה island-corrupt-local-state.'],
        'לשמר את הבתים המקוריים תחת מפתח התאוששות, להציג מצב כשל ולחסום דריסה אוטומטית עד להחלטת שחזור מפורשת.',
        'מידע פגום אינו נעלם בפתיחה או בשמירה הבאה; ניתן להורידו לבדיקה; פגיעה במכסה אינה מוחקת גם את עותק ההתאוששות.',
        [('js/store.js','function load()'),('workout/js/store.js','function load()'),('north/js/cart.js','export function load')],['iterations/05/reliability.json'], 'השחזור משתמש בטקסט סינתטי פגום בלבד, לא במאגר אישי.')
    add('A08',2,['workout','north'],'אמינות','כשל מכסת אחסון מוצג כהצלחה מקומית',
        'באימון save מחזיר false אך setProfile ומסלולים נוספים מתעלמים מכך. בחנות save בולע חריגה, והסל מציג פריט שלא נשמר. בבקרת באקה סאן הופיע פס שגיאה כנדרש.',
        ['הריצו reliability.py.', 'בדקו workout-quota-error ו־north-quota-error: storageUnchanged=true בלי errorBar/alert; בחנות cartCount=1.'],
        'להעביר סטטוס שמירה לממשק, להציג הודעה נגישה ולהציע יצוא/ניסיון חוזר. אין לסמן מידע כעמיד אחרי כשל; לשמר שינוי זמני בצורה ברורה.',
        'QuotaExceededError ו־SecurityError מובילים להודעה ברורה; רענון אינו מפתיע באובדן שינוי שהוצג כשמור.',
        [('workout/js/store.js','save() { try'),('workout/js/store.js','setProfile(patch)'),('north/js/cart.js','export function save')],['iterations/05/reliability.json'])
    add('A09',2,['bakasun'],'אמינות','הגדרה שנדחתה ביבוא עדיין נכנסת לתור הענן',
        'ייבוא משמר הגדרה מקומית קיימת, אך onChange מקבל את הערך מהגיבוי שנדחה. כשהסנכרון מופעל, enqueue שומר את ערך ה־hook הזה בתור, ולכן המכשיר והסנכרון מחזיקים ערכים שונים. בדיקת B3-S02 current עברה בשלוש הרצות; יעד התיקון מדולג.',
        ['הריצו node --test tests/bakasun-store.mjs.', 'בדקו B3-S02 current: הערך המקומי נשמר אך changes מכיל את ערך הגיבוי.'],
        'להפעיל onChange רק כשהמיזוג שינה את ההגדרה ובערך האפקטיבי שנשמר, תוך שמירת הגדרות שמוגדרות כמקומיות למכשיר.',
        'גיבוי עם ערך שונה אינו משנה תור ענן כאשר ההגדרה המקומית ניצחה; הגדרה חסרה/ריקה מתמזגת פעם אחת.',
        [('js/store.js','value: data.settings[k]'),('tests/bakasun-store.mjs','B3-S02 current')],['evidence/verification-summary.json'])
    add('A10',2,['bakasun'],'אמינות','מחיקה ישנה מהענן מוחקת עריכה מקומית חדשה',
        'mergeRemote מטפל ב־deleted לפני השוואת גרסאות. tombstone ישן מסיר רשומה שנערכה עכשיו. השחזור הקיים B3-S01 current עדיין עובר; בדיקת חוזה התיקון מדולגת.',
        ['הריצו node --test tests/bakasun-store.mjs.', 'בדקו B3-S01 current: לקוח סינתטי חדש נמחק עם tombstone משנת 2000.'],
        'להגדיר סדר שרת/גרסה שנראתה והכרעה מפורשת בין עריכה למחיקה, כולל רשומה ששוחזרה. לא להכריע לפי שעון מכשיר בלבד.',
        'מחיקה שכבר הוחלפה בעריכה או שחזור אינה מנצחת; מחיקה חדשה תקפה נשמרת; שני מכשירים מתכנסים לאותה תוצאה.',
        [('js/store.js','if (r.deleted)'),('tests/bakasun-store.mjs','B3-S01 current')],['evidence/verification-summary.json'], 'נבדק ממשק המיזוג בקוד המקומי; סדר אירועים בשירות פרוס לא נבדק.')
    add('A11',2,['bakasun','workout'],'אמינות','יצוא JSON אינו גיבוי מלא של הקבצים המקומיים',
        'בבאקה סאן exportJson מכיל metadata ומזהי קבצים אך לא blobs מ־IndexedDB. באימון export מסדר את state בלבד, ואינו כולל סרטונים/תמונות/הקלטות שנשמרו במאגרים אחרים. עותק שלא עלה לענן אינו ניתן לשחזור מה־JSON בלבד.',
        ['הריצו בדיקת B3-S04 current ב־tests/bakasun-store.mjs.', 'השוו את שדות exportJson ו־store.export לממשקי אחסון הקבצים והווידאו.'],
        'להציע ארכיון שחזור עם bytes ו־manifest מאומת, או לשנות את התיאור ל״גיבוי נתונים בלבד״ ולהוסיף מסלול נפרד לקבצים. להציג קבצים שטרם גובו.',
        'שחזור במכשיר חדש ללא רשת מחזיר את המסמך/המדיה או מזהיר במפורש שהגיבוי אינו כולל אותם.',
        [('js/store.js','exportJson()'),('js/files.js','indexedDB'),('workout/js/store.js','export()')],['evidence/verification-summary.json'], 'בדיקת B3 מוכיחה את מסלול העסק; מסלול האימון נבדק מהפרדת מאגרי האחסון בקוד.')
    add('A12',2,['bakasun'],'אמינות','תשובת שרת 503 דורסת מודול תקין במטמון',
        'sw.js מכניס כל תגובת GET למטמון בלי לבדוק status. תשובת 503 מקומית החליפה tasks.js תקין, ולאחר מעבר ללא רשת ה־shell לא הציג כותרת מסך.',
        ['הריצו reliability.py.', 'בדקו root-worker-caches-error-response: cachedStatus.module=503, offlineHasHeading=false.'],
        'לשמור רק תגובות תקינות ושלמות מהסוג המתאים; לשמר עותק תקין על 5xx ולדווח על ניסיון עדכון כושל. להגביל caching למשאבים שבבעלות ה־shell.',
        '500/503/404 אינם מחליפים JS/HTML תקין; אחריהם רענון ללא רשת עדיין עולה עם הגרסה האחרונה התקינה.',
        [('sw.js','c.put(e.request, copy)')],['iterations/05/reliability.json'])
    add('A13',2,['workout','north'],'אבטחה','אין CSP במסמכי הכניסה של האימון והחנות',
        'שני מסמכי HTML אינם מכריזים CSP, וה־workflow אינו מוסיף מדיניות עבורם. marker שהוכנס כ־inline script רץ, בעוד באקה סאן והאי חסמו אותו. זו שכבת הגנה חסרה באותו origin של מידע עסקי ומשפחתי.',
        ['הריצו security.py.', 'השוו ארבעה מקרי CSP-inline-marker.'],
        'להגדיר מדיניות מצומצמת בכל מסמכי הכניסה, להעביר inline scripts לקבצים מקומיים ולבדוק גם workers, דפי עזר ונתיבי תשלום. להפריד origins לאפליקציות בעלות גבולות אמון שונים כשאפשר.',
        'inline handlers/scripts ו־eval נחסמים בלי לשבור פונקציונליות; בדיקות שליליות מאמתות חסימה תחת המדיניות שנשלחת בפועל.',
        [('workout/index.html','<head>'),('north/index.html','<head>'),('.github/workflows/pages.yml','cp -r css js icons')],['iterations/02/security.json','evidence/hosting-headers.json'], 'כותרות HTTP נמדדו רק בשרת המקומי. ניסיון קריאת שבעה קבצים סטטיים מהאתר החי נחסם בפרוקסי סביבת העבודה ב־403 לפני הגעה לשרת; זו אינה תגובת האתר. אין אישור לכותרות hosting בפועל.')
    add('A14',3,['workout','north'],'אבטחה','ערכי תמונה מהאחסון משולבים כ־HTML ללא escaping',
        'ערך img בסל החנות ו־kidfit.facePic באימון נכנסים ישירות למחרוזת HTML. ערך מקומי שהכיל סגירת מרכאות ו־onerror הפעיל marker בשני המסלולים.',
        ['הריצו security.py.', 'בדקו north-local-state-XSS ו־workout-local-state-XSS: executed=1.'],
        'ליצור אלמנטים עם DOM API, לקבוע src כמאפיין ולבדוק פרוטוקולים וסכמת state. לא לטפל ב־localStorage כמקור HTML מהימן; להוסיף CSP כשכבה נוספת.',
        'מרכאות/תגיות/handlers בערכי state אינם יוצרים מאפיינים; קלט תקין עדיין מציג תמונה.',
        [('north/js/app.js','<img src="${i.img}"'),('workout/js/app.js',"localStorage.getItem('kidfit.facePic') ? `<img")],['iterations/02/security.json'], 'נדרשת כבר שליטה באחסון של ה־origin. לא נמצא מסלול מסירה מרחוק; זהו ממצא הקשחה מותנה, לא הוכחת XSS מרחוק.')
    add('A15',2,['bakasun'],'אבטחה','יצוא CSV משמר נוסחאות בטקסט מיובא',
        'csvCell מצטט מפרידים ומרכאות אך אינו מנטרל קידומות נוסחה. טקסט חיצוני מרשימת משתתפים/ייבוא יכול להיפתח כנוסחה ביישום גיליונות. בדיקת B3-A02 current עדיין עוברת.',
        ['הריצו node --test tests/bakasun-security.mjs.', 'בדקו את הפלט עבור ערך טקסט סינתטי שמתחיל ב־=; לא נדרש לפתוח גיליון או רשת כדי לאמת את הקידומת.'],
        'לנטרל קידומות נוסחה בשדות טקסט לא מהימנים לפי מדיניות CSV מתועדת, כולל whitespace; לשמר ערכים מספריים חוקיים כשדות מספריים.',
        'קידומות =,+,-,@ בטקסט אינן מפוענחות כנוסחה; פסיקים, שורות חדשות, עברית ומספרים נשמרים.',
        [('js/logic/participants.js','export function csvCell'),('tests/bakasun-security.mjs','B3-A02 current')],['evidence/verification-summary.json'], 'לא הופעלה נוסחה חיצונית ולא נפתח Excel/Sheets; ההוכחה היא שימור הקידומת בקובץ.')
    add('A16',2,['workout','north'],'נגישות','שדות וכפתורי תמונות ללא שמות נגישים',
        'axe מצא label חסר בארבעה שדות הגדרות אימון ובשדות החנות, select ללא שם בבונה ושני כפתורי thumbnails ללא שם בדף מוצר. label סמוך אינו קשור לקלט ללא for/id או עטיפה.',
        ['הריצו accessibility.py וצילומי סבב 04.', 'סננו label/select-name/button-name בראיות. בדקו ניווט Tab בהגדרות ובקופה.'],
        'לחבר תוויות לקלט ולתת שם מתאר לכל כפתור תמונה; לשמור השמות לאחר רינדור מחדש ושינוי שיטת משלוח/תשלום.',
        'axe אינו מחזיר את הכללים הללו במסכי המדגם; טכנולוגיה מסייעת מזהה שם ותפקיד לכל שדה/כפתור.',
        [('north/js/app.js','<input name="name"'),('north/js/app.js','class="thumbs"'),('workout/js/app.js','function settings()')],['iterations/03/accessibility.json','iterations/04/capture.json'], 'WCAG 1.3.1/3.3.2/4.1.2; בדיקה אוטומטית ומקלדת, ללא אישור קורא מסך מלא.')
    add('A17',2,['bakasun','workout','north'],'נגישות','טקסט משני ובקרות אינם עומדים בניגודיות AA',
        'axe מצא כשלים חוזרים בשלוש האפליקציות: למשל 4.26:1 בטקסט האימון ו־3.81:1 בסיכום הבונה, מול 4.5:1 בטקסט רגיל. בבאקה סאן נמצאו גם כשלי טקסט בהגדרות ובלוח הבקרה.',
        ['פתחו accessibility.json וסננו color-contrast.', 'כל node כולל selector, צבעי foreground/background וגודל טקסט מחושב.'],
        'לעדכן tokens של טקסט משני, מצבי כפתור ופלטות בשני מצבי צבע; למדוד צבעים מורכבים ושקיפויות בפועל, לא לפי צילום בלבד.',
        'טקסט רגיל מגיע לפחות ל־4.5:1, טקסט גדול ל־3:1 והבקרות נבדקות גם במיקוד/disabled לפי תחולת הקריטריון.',
        [('css/app.css',':root'),('workout/css/style.css',':root'),('north/css/style.css',':root')],['iterations/03/accessibility.json'], 'WCAG 1.4.3. לא כל כלל best-practice של axe הוא כשלעצמו כשל WCAG; כל מקרה נבחן לפי יחס וגודל.')
    add('A18',2,['bakasun'],'נגישות','חלון פעולות בלוח האירועים אינו נגיש כמחסום מיקוד',
        'החלון המותאם בלוח אינו משתמש ב־dialog המשותף: אין role=dialog, עשרה מתוך 16 צעדי Tab יצאו ממנו ו־Escape לא סגר. הבקרה של הדיאלוג המשותף עברה.',
        ['הריצו accessibility.py --keyboard-only אחרי הסריקה הראשונה.', 'בדקו bakasun-board-dialog לעומת bakasun-shared-dialog-control.'],
        'להעביר את החלון לרכיב דיאלוג אחיד עם שם, מיקוד ראשוני, trap, Escape ושחזור מיקוד; להשבית רקע בזמן פתיחה.',
        'Tab/Shift+Tab נשארים בחלון; Escape סוגר; המיקוד חוזר לכפתור הפעולות גם לאחר שינוי סטטוס.',
        [('js/screens/board.js','wrap.innerHTML = `<div class="modal-card"')],['iterations/03/accessibility.json'])
    add('A19',2,['north'],'נגישות','שער הגיל ומגירת הסל משאירים את הרקע במקלדת',
        'שער הגיל אינו דיאלוג סמנטי והמיקוד מגיע לרקע. מגירת הסל נסגרת ב־Escape אך כל צעדי Tab במדגם יצאו ממנה, והסגירה לא החזירה מיקוד לכפתור הסל.',
        ['בדקו north-age-gate ו־north-cart-drawer ב־accessibility.json.', 'פתחו סל ב־Enter והמשיכו ב־Tab/Shift+Tab.'],
        'להשתמש בדיאלוג נגיש עם aria-modal/inert או dialog מקורי; למקד את הפעולה הרלוונטית, ללכוד Tab ולשחזר מיקוד.',
        'המשתמש אינו מגיע לקישורי רקע כשהשכבה פתוחה; שם השכבה מוכר לטכנולוגיה מסייעת; Escape והחזרת מיקוד עקביים.',
        [('north/js/app.js',"$('#gate').innerHTML"),('north/js/app.js','function openDrawer'),('north/index.html','<aside class="pane"')],['iterations/03/accessibility.json'])
    add('A20',3,['bakasun','north'],'נגישות','תפקיד dialog מוצמד לאלמנטים שאינם מתירים אותו',
        'axe מחזיר aria-allowed-role על form בדיאלוג המשותף ועל aside במגירת הסל. לכידת מיקוד תקינה אינה מתקנת את סמנטיקת האלמנט.',
        ['בדקו capture.json בסבב 02 עבור aria-allowed-role.', 'פתחו קריאה חדשה ואת הסל ובדקו את אלמנט הדיאלוג.'],
        'להשתמש ב־dialog או במעטפת div בעלת role=dialog, ולהשאיר form/aside בתפקיד HTML מתאים. לעדכן בעת התיקון בדיקות שתלויות בסמנטיקה הישנה.',
        'aria-allowed-role אינו מופיע ושם/aria-modal נשמרים יחד עם בדיקות המקלדת.',
        [('js/ui.js','<form class="modal-card"'),('north/index.html','<aside class="pane"')],['iterations/02/capture.json'])
    add('A21',3,['bakasun'],'נגישות','תוכן האפליקציה העסקית אינו בתוך main landmark',
        'בכל 52 ביקורי מסכי העסק axe החזיר landmark-one-main, משום שה־root הוא div. חלק גדול מתוכן המסכים נשאר מחוץ ל־landmarks.',
        ['בדקו landmark-one-main ו־region בסריקת 03.', 'בדקו את #app ב־index.html.'],
        'להגדיר main יחיד לתוכן הראשי ולספק מסלול דילוג לניווט חוזר; לשמור כותרות מסך ומיקוד גם לאחר redraw.',
        'main יחיד מופיע בכל מסך; ניווט וירטואלי יכול להגיע אליו; אזורי nav נשארים מסומנים.',
        [('index.html','<div id="app">')],['iterations/03/accessibility.json'], 'זהו כלל מבני/best-practice של axe; לא מוצג לבדו כהוכחה להפרת כל דרישות WCAG 2.4.1.')
    add('A22',2,['north'],'אמינות','כשל שמירת הזמנה עדיין מרוקן את הסל',
        'אחרי כשל רשת saveOrder מחזיר false, אך submitOrder ממשיך לדף תודה ומנקה את הסל. כשגם sessionStorage נכשל אין עותק עמיד של ההזמנה ואין קישור שחזור לקופה. יש הצעה לשליחה ידנית כשהעמוד עדיין פתוח.',
        ['הריצו checkout.py; כל פניות הרשת החיצוניות נחסמות.', 'בדקו failed-order-and-session-denied: cartCount=0, sessionOrderAvailable=false.'],
        'לשמור draft עמיד ולא לנקות סל עד אישור שמירה; בכשל להציע ניסיון חוזר ושיתוף ידני מתוך אותו draft. לא להתקדם למצב הצלחה כשאין קבלה מהשרת.',
        'כשל שרת/רשת/מכסת sessionStorage משמר סל ופרטי draft; רענון מאפשר להשלים בלי ליצור הזמנה כפולה.',
        [('north/js/app.js','await saveOrder(order)'),('north/js/app.js','cart = []; saveCart()')],['iterations/05/checkout.json'], 'נעשה שימוש בנתוני טופס סינתטיים בזיכרון בלבד; לא נשלחה הזמנה או הודעה.')
    add('A23',3,['north'],'אמינות','מספר הזמנה לא מוכר מוצג כהזמנה שנקלטה',
        'פתיחת thanks עם מספר שלא קיים במכשיר מציגה ״ההזמנה נקלטה״ בלי לקרוא מצב מאומת. אותו מצב מופיע אחרי כשל שמירת הזמנה ו־sessionStorage ורענון.',
        ['פתחו מקומית north/index.html#/thanks/audit-nonexistent.', 'בדקו north-fabricated-thanks-route ו־afterReloadClaimsReceived.'],
        'להציג ״לא ניתן לאמת את ההזמנה״ עם דרך התאוששות, או לאמת באמצעות יכולת גישה מוגבלת לסטטוס הזמנה; לא להשתמש בפרמטר URL כהוכחת קליטה.',
        'מספר שרירותי, session פגום ורענון אחרי כשל אינם מציגים אישור קליטה; הזמנה מאומתת כן.',
        [('north/js/app.js','if (!o || o.no !== no) return')],['iterations/05/reliability.json','iterations/05/checkout.json'])
    add('A24',2,['bakasun','workout','island'],'ביצועים','גרף טעינת הפתיחה כולל עשרות מודולים שאינם נדרשים למסך',
        'גרף static בלבד מונה 124 זהויות מודול בעסק, 69 באימון ו־107 באי, לפני imports דינמיים והרחבות. באימון כ־2.00MB קוד מפוענח; בעסק כ־1.60MB. ספריות משחקים/מצלמה ומסכים רבים מיובאים בפתיחה.',
        ['הריצו module_graph.mjs.', 'השוו ל־startup-performance.json: המדידות הן HTTP/1 מקומי ללא דחיסה, ולא מדידות אתר חי.'],
        'לטעון מסכים, משחקים ומצלמה בעצלות בנקודות השימוש, עם fallback מסודר; לשמור module singleton אחד למאגרים ולתורי רשת. אין צורך ב־build כדי להשתמש ב־import().',
        'פתיחת בית אינה מבקשת מודולי מצלמה/משחק שלא נפתחו; LCP/long tasks ותקציב bytes נבדקים על אותו פרופיל לפני/אחרי.',
        [('js/app.js',"import * as today"),('workout/js/app.js',"import { GAMES"),('workout/island/engine/load-data.mjs','extensionManifest.modules')],['evidence/module-graph.json','iterations/04/startup-performance.json'], 'משקל gzip בגרף הוא חישוב קובץ, לא תעבורת production. LCP ענן אינו LCP בטלפון פיזי.')
    add('A25',2,['island'],'ביצועים','שתי זהויות של מודול offline עוקפות איחוד הורדות',
        'ui/offline.mjs נטען עם תג גרסה ובלעדיו. לכל עותק running משלו: באותה זהות שתי קריאות הורידו פעם אחת; דרך שני העותקים אותו URL הורד פעמיים במקביל.',
        ['הריצו offline-identity.mjs.', 'בדקו control.fetchCount=1 לעומת reproduction.fetchCount=2 ו־uniqueUrls=1; הגרף מאשר שתי זהויות פעילות.'],
        'לקבע URL קנוני אחד לכל singleton במערכת התיוג המרכזית, או לשתף promise/תור לפי גרסה ו־origin בין עותקים. אין לשנות תגי גרסה במשימת audit זו.',
        'לחיצה על הורדה בזמן הורדה אוטומטית מצטרפת לאותו תור; כל קובץ יורד פעם אחת ומדדי התקדמות עקביים.',
        [('workout/island/app.mjs','registerOfflineWorker,startAutoDownload'),('workout/island/ui/offline.mjs','let running=null')],['evidence/module-graph.json','iterations/04/offline-identity.json'], 'ההורדה הכפולה שוחזרה עם manifest/Cache API מדומים של קובץ אחד, בלי תעבורה אמיתית.')
    add('A26',2,['island'],'ביצועים','דמויות הכדורסל חורגות מדרישות שלד 18 ואטלס אחד',
        'בדיקת startup של CSP אישרה characterVersion=4. גופי lod-v4 הפעילים מכילים skin של 52 עצמות. בדיקת createAvatarV1 ו־compactAvatar המקוריים על חמשת התפקידים יצרה שתי מפות לדמות: גוף 1024×512 ואלפא 1024×1024. כל מפה עומדת בגבול המידה, אך דרישות 18 העצמות ואטלס אחד אינן מתקיימות. נכסי v6 שמורים אינם הוכחה שחוברו.',
        ['בדקו hoops-v5-session-start-result בראיות ה־CSP ו־assets.json.', 'הריצו runtime_assets.py; חמשת התפקידים מדווחים 52 עצמות, textureCount=2 ו־drawCalls=2 באריזת הדמות.'],
        'לתכנן חיבור/retarget לנכס הקנוני בעל 18 עצמות ולבחון איחוד מפות הגוף והאלפא בתוך התקציב, תוך שימור קצוות השיער והצללה. לשמר אנימציות ובחירת שחקן ולמדוד לפני החלפת ברירת מחדל.',
        'כל דמות פעילה מדווחת 18 עצמות עם שמות קנוניים ומפת דמות אחת עד 1024; מיפוי אנימציה ו־LOD עוברים בדיקות מגע ותנועה; מצב fallback מוגדר ומדווח.',
        [('tests/island-browser-csp.test.mjs','live.m.characterVersion,4'),('workout/island/minigames/hoops-lod.mjs','const alpha=alphaGroup')],['evidence/assets.json','evidence/csp-summary.json','iterations/10/runtime-assets.json'], 'שש התמונות המקוריות ב־GLB אינן שש מפות runtime. בדיקת האריזה משתמשת בכרטיס/צבעים סינתטיים וללא אנימציות; אינה מדידת FPS. אטלס האלפא יכול להיות משותף בין מופעים.')
    add('A27',3,['island'],'ביצועים','חריגות תקציב בנכסים וכיסוי Draco חלקי',
        'assets/alpine-rush/athlete.glb הוא 1,674,140 bytes וללא Draco; זהו חריג גודל GLB היחיד מבין 236, ואינו דמות הסקי הראשית. שתי מפות חיצוניות של athlete fallback בכדורגל ותמונה בנכס הספרייה shop-corner הן 2048×2048. גם שני נכסי מסלול סקי פעילים שנתבקשו במבחנים, route-marker-sunset ו־safety-fence-sunset, אינם דחוסים ב־Draco; משקליהם קטנים, 11,648 ו־45,108 bytes. אין להסיק שכל חריג הוא עלות פתיחה גדולה.',
        ['הריצו inventory.py ו־constraints.py; בדקו allInventoryImagesOver1024 ואת חריג הגודל.', 'השוו לדמויות ברירת המחדל בכדורגל ובסקי, ולקוד בחירת athlete fallback ב־soccer-view.mjs.'],
        'להחיל תקציב על נכסים פעילים ו־fallback: להקטין מפות עד 1024, לדחוס GLB ולבדוק גודל כולל עם קבצים חיצוניים. לברר שימוש בנכסי ספרייה ישנים ולהוציא נכס לא נדרש מההפצה במסגרת שינוי נפרד.',
        'כל GLB בחבילת היעד עד 1,500,000 bytes, וכל מפה מוטמעת או חיצונית עד 1024. גם כשל טעינת הדמות הראשית מוביל ל־fallback העומד בתקציב תחת CSP.',
        [('workout/island/minigames/alpine-view.mjs','modelUrl = new URL'),('workout/island/minigames/soccer-view.mjs','const model=config.view.designCharacters')],['evidence/assets.json','evidence/platform-constraints.json','TEXTURES.md'], 'חריגות הטקסטורה אינן מפות דמויות ברירת המחדל בששת המבחנים. שני נכסי המסלול הלא דחוסים כן נתבקשו; אין מכאן הוכחה להאטת הסקי הנוכחי או לכך שנכס הספרייה מצויר בעיר.')
    add('A28',3,['workout','island','north'],'CI','פריסת Pages כוללת חומרי פיתוח ואימות רבים',
        'מודל כללי ההעתקה ב־workflow כולל 4,143 קבצים וכ־419MB. כ־196MB מסווגים בכלים, verification, previews וחומרי מקור/בדיקה; source יחיד מסונן אך תיקיות פיתוח אחרות נשארות.',
        ['הריצו deployment.py.', 'בדקו nonRuntimeArtifacts ולמשל דוחות viewer גדולים שנכללים בפריסה.'],
        'לבנות allowlist לנכסי runtime ודפי עזר שנבחרו במפורש; לארוז דוחות/מקור מחוץ לאתר המוצר ולבדוק manifest מול חבילת הפריסה.',
        'משחקים ו־offline עדיין נטענים, וחומרי המקור/האימות שאינם מיועדים לציבור אינם מופצים. למדוד artifact לפני/אחרי.',
        [('.github/workflows/pages.yml','cp -r workout'),('.github/workflows/pages.yml','-name source -prune')],['evidence/deployment.json'], '419MB הם bytes של קבצי ההפצה, לא טעינת פתיחה. הסיווג לפי נתיבים הוא אומדן ואינו טענה שכל דף עזר צריך להימחק.')
    add('A29',2,['bakasun','workout','island','north'],'CI','בדיקות דפדפן מרכזיות אינן שער CI רגיל',
        'ה־job הכללי מריץ Node ללא דגלי browser; ה־job הייעודי מריץ רק island-browser-csp. בדיקות מקלדת העסק, offline, motion/controls ושחזור טעינה נשארות opt-in. אין axe לכל ארבע האפליקציות ב־workflow.',
        ['קראו tests.yml והשוו לתנאי enabled בקבצי browser.', 'הרצה מלאה בתנאי הביקורת: 51 skipped; הפעלת CSP בנפרד: 3 passed.'],
        'להגדיר jobs ממוקדים עם runtime דפדפן מותקן, axe ומסלולי מקלדת/offline בשתי התנוחות. להבדיל tests שלא הופעלו מהצלחה ולהשאיר artifacts במקרה כשל.',
        'CI מפעיל במפורש את מסלולי הסיכון בכל האפליקציות; כשל נגישות/JS/offline מכשיל job; אין תלות ב־Playwright שמותקן במקרה במחשב.',
        [('.github/workflows/tests.yml','node --test tests/*.mjs'),('.github/workflows/tests.yml','tests/island-browser-csp.test.mjs'),('tests/bakasun-a11y-browser.mjs','const enabled')],['evidence/verification-summary.json'])
    add('A30',2,['bakasun','north'],'בדיקות','ירוק כולל שחזורי באגים ו־33 יעדי תיקון מדולגים',
        '33 מהדילוגים הם בדיקות B3 של ההתנהגות המתוקנת העתידית. במקביל current tests מאמתים שהבאג הקיים עדיין קורה, ולכן הצלחתם אינה עדות שהסיכון נפתר.',
        ['הריצו node --test tests/bakasun-*.mjs.', 'קראו שם current מול fix ו־skip reason במקרי תשלום, גיבוי, אחסון ו־CSV.'],
        'לקשר כל יעד תיקון לממצא פתוח ולשנות אותו לשער מחייב כאשר התיקון ממומש; לדווח CI על debt צפוי בנפרד ממעבר regressions. לא להסיר skips רק כדי לשפר מספר.',
        'לאחר תיקון ההתנהגות הרצויה נבדקת ללא skip, ושחזור הישן אינו מגדיר את הבאג כהצלחה נדרשת.',
        [('tests/bakasun-cloud.mjs','B3-C02 fix'),('tests/bakasun-store.mjs','B3-S01 fix')],['evidence/verification-summary.json'])
    add('A31',2,['bakasun','workout','island','north'],'CI','workflow הפריסה אינו תלוי בהצלחת בדיקות',
        'Publish app מופעל ישירות על push ל־main, בנפרד מ־Tests וללא needs או בדיקת תוצאות. לפי ה־YAML לבדו, בדיקות ופריסה יכולות לרוץ במקביל וגם קוד שנכשל יכול להתפרסם.',
        ['השוו triggers ו־jobs בשני קובצי workflow.', 'בדקו שאין שער בדיקות בתוך job הפריסה.'],
        'לקשור את הפריסה לאותן בדיקות של אותו SHA באמצעות job תלוי/workflow מאומת, ולהגדיר branch protection בצד GitHub לפי מדיניות הצוות.',
        'קומיט עם בדיקה נכשלת אינו נפרס; הארטיפקט והבדיקות קשורים לאותו SHA; פריסה ידנית כפופה לשער מוגדר.',
        [('.github/workflows/pages.yml','branches: [main]'),('.github/workflows/pages.yml','publish:')],['evidence/verification-summary.json'], 'הגנת main והגדרות repository חיות לא נבדקו. ה־connector החזיר רשימות ריקות ל־runs/statuses של SHA הבסיס; לא נטענת טענה שמיזוג בפועל אינו מוגן.')
    add('A32',3,['workout'],'בדיקות','כשל השקת דפדפן משאיר שרת בדיקה פתוח',
        'בדיקת workout-royiki מפעילה server ואז chromium.launch לפני try/finally. כש־Playwright קיים אך browser binary חסר, launch נכשל והשרת נשאר פתוח; הרצה ממוקדת נזקקה ל־timeout לאחר שכבר דיווחה not ok.',
        ['הריצו בדיקה ממוקדת בסביבה עם Playwright ללא browser ברירת המחדל.', 'בדקו timeout של 35 שניות מול כשל launch מיידי; נתיב Chromium תקין דרך adapter איפשר לסוויטה להשלים.'],
        'לעטוף את פתיחת השרת והדפדפן ב־try/finally מוקדם, לכבד CHROMIUM_PATH ולהגדיר runtime דטרמיניסטי/timeout ברמת job.',
        'כשל launch מסיים תהליך לא־אפס מיד ומשחרר שרת; מחשב ללא Playwright מדלג במפורש; runtime תקין מריץ את הבדיקה.',
        [('tests/workout-royiki.test.mjs','const srv = await serve()'),('tests/workout-royiki.test.mjs','const browser = await chromium.launch')],['evidence/verification-summary.json'], 'אומת כבעיית ניידות/ניקוי של כלי בדיקה מקומי; לא כשל מוצר ולא הוכחה שה־runner הנוכחי של GitHub נתקע.')
    add('A33',3,['island'],'בדיקות','מבחן CSP ל־worker מוסיף כותרת שאינה מוגדרת בפריסה',
        'מבחן worker-startup-eval מספק ל־worker כותרת CSP דרך route.fulfill. בשחזור אותה מדיניות במסמך בלבד לא חסמה eval ב־worker חיצוני; הכותרת הנוספת כן חסמה. serveIsland מוסיף גם CSP לכל HTML של כלי העזר, מעבר לתגי הקבצים עצמם.',
        ['הריצו worker_csp.py.', 'השוו workerResponseHasPolicy=false/true; קראו את fixture blocked-worker-startup-eval ואת headers ב־serveIsland.'],
        'להפריד מבחן של מנגנון ניטור ממבחן פריסת המדיניות: לאמת כותרות אמיתיות לכל worker/document שנדרש לו CSP, או להגדיר במפורש שההגנה ברמת קוד ולא מדיניות worker.',
        'מבחן deployment נכשל אם מדיניות נדרשת חסרה בתגובה; negative fixture שמוסיף header אינו מוצג כהוכחה שהאתר שולח אותה.',
        [('tests/island-browser-csp.test.mjs','blocked-worker-startup-eval'),('tests/helpers/island-browser.mjs',"headers['content-security-policy'] = csp")],['iterations/06/worker-csp-boundary.json'], 'ממצא בהסקה ובכיסוי הבדיקה, לא הוכחת תקיפה של decoder אמיתי. כותרות השרת החי לא נמדדו ואין טענה שה־worker הנוכחי מפעיל eval על קלט תוקף.')
    add('A34',3,['bakasun'],'בדיקות','fixture שמוגדר סינתטי כולל פרט קשר עסקי קיים',
        'בדיקת B3-A04 current מאמתת שמספר קשר ב־fixture זהה לברירת המחדל העסקית האמיתית שבקוד. המספר עצמו אינו מועתק לביקורת. הסריקה שומרת רק מיקומי קבצים ושורות.',
        ['הריצו tests/bakasun-security.mjs בלי להדפיס את ערכי ה־fixture.', 'בדקו B3-A04 current ואת source-scan.json.'],
        'להחליף פרטי קשר בחומרי בדיקה בערכים סינתטיים מובהקים, ולהוסיף guard שמונע העתקת פרטי מוצר/אנשים ל־fixtures. לא להסיק אוטומטית שפרט קשר עסקי ציבורי הוא סוד.',
        'ה־fixture אינו שווה לערך העסקי ואין בו פרטי לקוח/אדם אמיתי; בדיקות אינן יוזמות חיוג/הודעות.',
        [('tests/bakasun-security.mjs','B3-A04 current')],['evidence/verification-summary.json','evidence/source-scan.json'], 'לא נשמר בביקורת מספר טלפון או ערך מפתח. זהו ממצא היגיינת נתוני בדיקה; לא הוכחה לחשיפת נתוני לקוחות בענן.')
    add('A35',3,['bakasun','workout'],'ביצועים','מאזיני אירוע מצטברים בביקורים חוזרים במסכים',
        'ב־24 מחזורי ניווט באימון מספר המאזינים עלה מ־16 ל־40 וחזר ל־16 רק לאחר voiceschanged. בעסק עלה מ־21 ל־93 וחזר ל־21 לאחר bakasun:installable. once אינו מנקה מאזין אם האירוע אינו מגיע; render רושם callback חדש בכל פעם.',
        ['הריצו listener_retention.py ואת אותו כלי עם --bakasun.', 'השוו JSEventListeners ב־baseline, cycles-24 ואחרי האירוע. המדידה נעשית לאחר GC ובאותו מסך.'],
        'לרשום מאזיני lifecycle פעם אחת ברמת מודול או להסירם ביציאה/רינדור מחדש באמצעות cleanup או AbortController. לא לרשום שוב אם הקולות/מצב ההתקנה כבר ידועים.',
        'מספר המאזינים נשאר קבוע לאחר 24 מחזורי ניווט, ואירוע מאוחר אינו גורם לעשרות רינדורים כפולים.',
        [('js/screens/today.js',"document.addEventListener('bakasun:installable'"),('workout/js/app.js',"window.speechSynthesis?.addEventListener")],['iterations/06/listener-retention.json','iterations/06/bakasun-listener-retention.json','evidence/soak.json'], 'הוכחה להצטברות מאזינים; גידול heap שנמדד אינו מיוחס כולו למאזינים. אין מכאן קביעה על קצב קריסה או FPS בטלפון.')
    add('A36',2,['workout'],'אמינות','שינוי קוד משפחה עלול לאבד עדכון ענן עם אותו מזהה רשומה',
        'family_events משתמש ב־id כמפתח ראשי גלובלי. אחרי העלאת רשומת כדורסל לקוד A, שליחתה עם אותו id לקוד B אינה מעדכנת דבר בגלל תנאי הבעלות, אבל family_push מחזיר 1. cloud.push המקורי מחזיר true, מרוקן את התור וקובע pending=0, אף שלמשפחה החדשה אין רשומה. גם בתור ללא רשת, אותו id מחליף פריט ממשפחה אחרת. בקרה עם מזהה חדש נשמרה בהצלחה; הרשומה המקורית נשארה מוגנת.',
        ['הריצו node audit/2026-11-05/tools/family_sync.mjs עם PGlite ו־pgcrypto המקומיים.', 'בדקו same-session-after-family-code-change: newFamilyRows=0 לצד clientReportedSuccess=true ו־persistedQueueLength=0.', 'מסלול הממשק: העלאת רשומת כדורסל, יצירת קוד משפחה חדש בהגדרות, עריכת אותה רשומה ושמירה; בדקו במכשיר של המשפחה החדשה. השתמשו רק בשני קודים סינתטיים בסביבה מקומית.'],
        'להגדיר מפתח רשומה ותור המורכב מהמשפחה והמזהה, ולהחזיר מזהי שורות שאושרו בפועל ושגיאות התנגשות. להסיר מהתור רק רשומות שהשרת אישר שנשמרו, ולהציג עדכון שנותר מקומי.',
        'אותו id בשתי משפחות נשמר בנפרד או נדחה במפורש בלי להימחק מהתור; עדכון באותה משפחה עובד; אין אפשרות לשנות רשומה של משפחה אחרת.',
        [('supabase/family.sql','id text primary key'),('supabase/family.sql','n := n + 1'),('workout/js/cloud.js','queue = queue.filter(q => !rows.includes(q))'),('workout/js/parent.js',"cloud.push(store.profile.familyCode, 'basketball'")],['iterations/13/family-sync.json'], 'ה־SQL המקורי הורץ ללא שינוי עם pgcrypto אמיתי ב־Postgres מקומי, והלקוח המקורי השתמש בתשובת ה־RPC דרך fetch מדומה. לא נבדק מסד חי. הכשל הוא אישור שגוי לסנכרון; תנאי הבעלות עצמו לא נעקף.')
    add('A37',2,['workout'],'נגישות','כרטיסי קטלוג התרגילים אינם נגישים במקלדת',
        'בכל אחת משתי התנוחות נמצאו 50 כרטיסי תרגיל כ־div עם data-go, ללא תפקיד, tabindex או צאצא נגיש לפעולה. ניסיון focus לא מיקד את הכרטיס, ו־40 צעדי Tab לא הגיעו לאף כרטיס. קישורי הניווט הרגילים כן פעלו ב־Enter. הפעולה על הכרטיס מחוברת רק למאזין click מואצל.',
        ['פתחו workout/index.html#/exercises בפרופיל חדש.', 'נווטו ב־Tab: ניתן להגיע למסננים ולניווט, אך לא לכרטיסי התרגילים. בדקו שאין a/button בתוך הכרטיס.', 'הריצו keyboard_extra.py והשוו בין כרטיסי התרגיל לבין nativeLinkEnterWorks=true בשתי המידות.'],
        'להשתמש בקישור a עם href למסלול התרגיל עבור כל כרטיס ניווט, עם שם ומצב focus-visible ברורים. לשמר את כל הכרטיס כאזור מגע נוח ולבדוק חזרה לקטלוג.',
        'Tab ו־Shift+Tab מגיעים לכל כרטיס מוצג, Enter פותח את התרגיל, והמיקוד נראה. אין צורך בעכבר או בהקלדת URL ידנית.',
        [('workout/js/app.js','<div class="card tap excard'),('workout/js/app.js',"app.addEventListener('click'")],['iterations/15/keyboard-extra.json'], 'WCAG 2.1.1; שחזור מקלדת ידני בשתי תנוחות. axe לבדו אינו מגלה בהכרח פעולת click מואצלת על div, ולכן ממצא זה נפרד משמות השדות החסרים.')
    return sorted(rows,key=lambda f:(f['priority'],int(f['id'][1:])))

if __name__=='__main__':
    rows=findings();write_json(OUT/'findings.json',rows);print('verified findings:',len(rows))
