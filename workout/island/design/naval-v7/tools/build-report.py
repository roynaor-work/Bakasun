"""Render a delivery report from measured evidence, never from invented FPS."""
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
import json,statistics,hashlib
ROOT=Path(__file__).resolve().parents[1]
def read(name,default=None):
    p=ROOT/name
    return json.loads(p.read_text()) if p.exists() else default
def local(t):
    return datetime.fromisoformat(t.replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Jerusalem')).strftime('%d.%m.%Y %H:%M:%S')
session=read('verification/session.json');assets=read('verification/asset-validation.json');browser=read('verification/browser-exercise.json',{})
resource=read('verification/resource-budget.json',{})
soak=read('verification/soak-report.json',{});reload=read('verification/reload-report.json',{});repo=read('verification/repository-checks.json',{});delivery=read('verification/delivery.json',{});scope=read('verification/delivery-validation.json',{});compat=read('verification/soak-compatibility.json',{})
captures=[]
for p in sorted((ROOT/'iterations').glob('*/capture.json')):captures.append((p.parent.name,json.loads(p.read_text())))
matrix_count=sum(len(r['screens']) for _,r in captures)
runtime_sha=hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest()
checks=len(assets['checks']);all_complete=bool(soak.get('pass') and reload.get('pass') and browser.get('pass') and browser.get('sourceSha256')==runtime_sha and scope.get('pass'))
now=datetime.now(timezone.utc).isoformat();end=delivery.get('completedAt',now);duration=(datetime.fromisoformat(end.replace('Z','+00:00'))-datetime.fromisoformat(session['startedAt'].replace('Z','+00:00'))).total_seconds()/3600
lines=['# naval-v7 · דוח מסירה','',
 'ארבע ספינות לוחמה מקוריות ובדיוניות, שני צבעי צי, ים מונפש, עולם חוף, שקיעה/סערה ואפקטים, עם תצוגת HTML מקומית עצמאית. כל התוספות תחת `workout/island/design/naval-v7/`; אין חיבור ללוגיקת המשחק הקיים.','',
 f'תחילת עבודה: **{local(session["startedAt"])}**. עדכון מסירה: **{local(end)}**, שעון ישראל. משך מתועד: **{duration:.2f} שעות**. חותמות UTC המקוריות נשמרות בנתוני הבדיקות.','',
 'סטטוס: **'+('הבדיקות הממוקדות והבדיקות הממושכות הושלמו.' if all_complete else 'בדיקות המסירה עדיין פעילות; אין כאן טענה שהריצה הממושכת הסתיימה.')+'**','',
 f'קוד הריצה שנבדק: `SHA-256 {runtime_sha}`.','',
 'לצפייה: [הסצנה המקומית](index.html), [השוואה אינטראקטיבית בין הסבבים](review.html), [הוראות חיבור](INTEGRATION.md), [מפת נכסים](manifest.json). אין build או בקשות לאינטרנט.','',
 '## מה נמסר','',
 '- קורבטה 32m, משחתת 50m, סיירת 66m ונושאת 82m. שלוש רמות לכל סוג, עם גופים שונים וציוד שונה, לא ארבע צביעות של אותו דגם.',
 '- שני אטלסי צי משותפים של 1024×1024. תותחים עם לוע, גשרים, חלונות, מעקות, מכ״ם, אנטנות, דגלים בדיוניים, חלודה וציוד סיפון. LOD0 כולל רכיבים נפרדים ו־anchors בקצות הקנים; LOD1/2 מאוחדים לקריאה אחת לכל ספינה.',
 '- displacement של גלים, שתי דגימות נורמל נעות, Fresnel, השתקפות שמיים ושמש אנליטית, קצף ושובל. אי בזלת, סלעים ב־instancing, עננים שכבתיים, שקיעה וגשם.',
 '- הבזק וקליע, עמוד מים רציף ורסס, אש, ניצוצות ועשן. מאגרים קבועים ללא יצירת geometry בכל ירייה.',
 '- צוות גנרי עם אטלס יחיד של 256 ושלד motion2 קנוני מדויק בן 18 עצמות; InstancedMesh יחיד לצוות.',
 '- בקרים פעילים לבחירת סוג/צי, קרוב/רחוק, סיבוב וקירוב, מזג אוויר, השהיה, אפקטים ואיכות. מקלדת, native dialog, יעדי מגע 44px ו־reduced-motion.','',
 '## רפרנס ותהליך','',
 'לא צורפה תמונת רפרנס מהמשתמש. המפרט שלו הוא רפרנס הקבלה; הכיוון האמנותי הוגדר ב־[ART-DIRECTION.md](references/ART-DIRECTION.md). נכסי הספינות הקודמים נבדקו ונרנדרו ב־[prior-fleet.png](references/prior-fleet.png). הספינות החדשות נוצרו בנפרד כדי לקבל צלליות צבאיות, פירוט והנעת רכיבים במסגרת התקציב.','',
 f'בוצעו **{len(captures)} סבבי בנייה–רינדור–ביקורת–תיקון**. נשמרו **{matrix_count} צילומי מטריצה**, ובהם **{len(captures)*4} צילומי החובה** ב־390×844 וב־844×390, קרוב ורחוק. יש גם זוג שחזור WebGL, שמונה צילומי בדיקת צי במצב אופליין וצילומי בדיקות הריצה.','',
 '| סבב | הביקורת שהובילה לתיקון | ראיות |','|---|---|---|']
notes={
 '01':'מים מפוספסים ומסגור חתוך; נבנו מסגור לפי FOV וטבעת מים ללא חפיפה.',
 '02':'גשם ארוך ועמוד רסס לא רציף; תוקנו מחזורי הטיפות ונוסף עמוד מים ממוחזר.',
 '03':'ערפל מחק ספינות רחוקות; הופחת וה־LOD הבינוני הוקל.',
 '04':'קריאות וכמות פירוט; נוספו מאקרו, קריאות טקסט ותאורת שמיים קטנה.',
 '05':'חריגה ב־320px ועלות noise; תוקנו grid, LUT, רשת מים והתאמת רזולוציה.',
 '06':'קריאות ציוד רחוק ועלות ציור השמיים; אוחדו LOD1/2 והופעלה פסילת עומק לפני עננים.',
 '07':'הבזק ממיקום משוער ו־GLSL לא מוגדר; נוספו muzzle anchors ותוקן smoothstep.',
 '08':'הוכחות פרטים וירי; בדיקת lifecycle מאוחרת חשפה אובדן תאורת שמיים ושתי טקסטורות שלא פונו.',
 '09':'נוצרו מחדש render targets בשחזור context, נוספו טקסטורות הסביבה לפינוי, ונבדק גם אובדן בזמן טעינה.',
 '10':'מטריצת כל הספינות חשפה חרטום קורבטה מתחת לבקרים; הונמכה נקודת המבט ב־1.5m לרוחב כדי להגביה את הדגם בפריים.'}
for number,c in captures:lines.append(f'| {number} | {notes.get(number,"")} | [ביקורת](iterations/{number}/REVIEW.md), [צילום](iterations/{number}/contact-sheet.jpg), {len(c["screens"])} פריימים |')
lines+=['','כל תיקיית סבב כוללת ארבע תמונות מקור בגודל הנדרש, תוספות, capture.json עם המצלמה והמקור, source.zip ו־asset-hashes.json. תוצאות שנכשלו נשמרו בנפרד; הריצה המקדמית של v8 שהופסקה אינה נספרת כבדיקה שהושלמה.','',
 '## ניקוד עצמי','',
 'הציון מתייחס לאיכות הנכסים ולמימוש שניתן לבדוק בחבילה. ציון תקציב הריצה אינו אישור FPS במכשיר שלא נמדד.','',
 '| מזהה | פריט | ציון 1–10 | ראיה או מגבלה מעשית |','|---|---|---:|---|']
scores=[
 ('V01','ארבע צלליות',9,'ארבע גאומטריות שונות; שמונה תקריבי סוג/צי.'),
 ('V02','שני ציים',9,'החלפת אטלס ללא שכפול GLB; נבדקו כל שמונת הצירופים.'),
 ('V03','תותחים, אנטנות, סיפון, דגלים וחלודה',8,'מאקרו וציוד ממשי; אין PBR ייחודי לכל בורג כדי לשמור על אטלס משותף.'),
 ('V04','מים',8,'גלים, קצף, sky reflection ונורמל פעילים; השתקפות אנליטית ולא מראת סצנה יקרה.'),
 ('V05','פיצוץ, אש ועשן',8,'אפקטים עם מחזור חיים ומאגר קבוע; הבזק יורש מיקום לוע אמיתי.'),
 ('V06','עמוד מים',8,'עמוד רציף ושלוש הקצאות ממוחזרות, רסס וטבעת קצף.'),
 ('V07','שקיעה, עננים וגשם',8,'שכבות ענן, שמש והשתקפותה, שני מצבי אווירה וטיפות ללא קפיצת מחזור.'),
 ('V08','אי וסלעים',8,'אי בעל שכבות גובה, שחיקה וגוון חוף; 16 מופעי סלע משותף.'),
 ('V09','צילום קרוב',9,'מסגור לפי FOV; הספינה בתוך הפריים בשתי המידות. מאקרו נוסף מיועד לפרטים.'),
 ('V10','צילום רחוק',8,'כל הצי והאי במסגרת; ארבע הצלליות נבדלות גם לאחר הפחתת LOD.'),
 ('U01','אינטראקציה',9,'בחירה, צי, מצלמה, מזג אוויר, מטח, pause/reset ואפשרויות נבדקו בפועל.'),
 ('U02','מגע, פריסה ונגישות',9,'יעדי 44px, ללא גלישה אופקית, מקלדת, reduced-motion ו־320px נוספים.'),
 ('P01','GLB ו־Draco',9,f'{len(assets["assets"])} קבצים פוענחו ללא שגיאות; אזהרת skin יחידה עם אב זהות מתועדת; כולם מתחת ל־1.5MB.'),
 ('P02','טקסטורות',10,'שש תמונות, כולן עד 1024; אטלס אחד לדמות; שני אטלסים משותפים לציים.'),
 ('P03','LOD ו־instancing',9,'מש אחד לכל ספינה רחוקה, instancing לצוות/סלעים/חלקיקים, היסטרזיס בספים.'),
 ('P04','תקציב ריצה ויעד 30fps',8,'DPR מוגבל ומותאם, מאגרי אפקטים חסומים וצללים ניתנים לכיבוי. חסרה מדידת 30fps בטלפון פיזי; מדידות התוכנה מפורטות להלן.'),
 ('P05','שלד קנוני',10,'18 שמות, הורים, תרגומי מנוחה וקווטרניונים תואמים; משקולות תקינות ומטרים.'),
 ('D01','HTML מקומי ואופליין',10,'r160, מפענח וכל נכסי התצוגה מוטבעים; טעינה עם network offline עברה.'),
 ('D02','סבבים, דוח ובדיקות ממושכות',9 if all_complete else None,'עשר ביקורות, צילומים ונתוני מקור; השלמת הבדיקות הממושכות נבדקת לפי JSON ולא לפי זמן משוער.'),
 ('R01','קבצים חדשים בלבד',10 if scope.get('scopePass') else None,'הבדיקה משווה ל־base commit ובודקת שכל נתיב חדש נשאר תחת naval-v7.'),
 ('R02','ענף ו־PR טיוטה',10 if delivery.get('draft') and delivery.get('prNumber') else None,'codex/naval-v7-20261105 מול main; ללא מיזוג.')]
for key,name,score,note in scores:lines.append(f'| {key} | {name} | {score if score is not None else "בהשלמה"} | {note} |')
lines+=['','## אימות ותקציב','',f'בדיקת נכסים: **{checks} קריטריונים**, pass={assets["pass"]}. משולשים נספרים לכל מופע node לאחר פענוח, ולא רק למשאבי mesh ייחודיים; כך גם צריחים משותפים נכללים בתקציב.','',
 '| תרחיש בצילום הסופי | משולשים ברנדר ראשי | קריאות ציור ראשיות | תוספת משולשי גוף לצללים |','|---|---:|---:|---:|']
for shot in captures[-1][1]['screens'][:4]:
    m=shot['metrics'];sel=next(x for x in m['lod'] if x['type']==m['state']['ship']);shadow=sel.get('triangles',0) if m['state']['quality']!='low' else 0
    lines.append(f'| {shot["file"]} | {m["triangles"]:,} | {m["drawCalls"]} | עד {shadow:,} |')
lines+=['','ל־glTF Validator יש אפס שגיאות בכל הקבצים. בדמות הצוות יש אזהרה אחת: `NODE_SKINNED_MESH_NON_ROOT`, מפני שהמש והשלד יושבים תחת קבוצת אריזה בעלת transform זהות. נבדק שכל אבות המש הם זהות. התצוגה משתמשת במטריצות שלד וב־instance transforms במפורש; אין טרנספורמציית אב שנעלמת. בחיבור חיצוני יש לשמור על קבוצת האריזה בזהות או להשתמש במימוש skin תואם. אין אזהרות בשאר 14 הקבצים.','',
 'המונים הם של `renderer.info.render` ברנדר הראשי ב־r160; צללים מוסיפים מעבר של הספינה הנבחרת בפרופיל רגיל/מלא. אין מראת סצנה או postprocessing. שתי בדיקות שמיים פרוצדורליות 336×256 ב־RGBA16F צורכות 688,128 bytes כל אחת; הן נוצרות פעם אחת ושוב לאחר שחזור context.','',
 f'בדיקת דפדפן ממוקדת: pass={browser.get("pass","טרם הסתיימה")}, {len(browser.get("checks",[]))} בדיקות. source SHA תואם לקוד הסופי: {browser.get("sourceSha256")==runtime_sha}.','',
 'בדיקת אובדן context: תמונת הגוף הקבועה חוזרת עם **0.0 הפרש פיקסלים**, מונה texture חוזר, והפינוי לאחר צפייה באי/סלעים מחזיר **0 geometry ו־0 textures**. נבדק גם אובדן במהלך פענוח Draco. מונה מערך תוכניות של המנוע מדווח בנפרד ואינו מוצג כאילו נמדדה בו אפס הקצאת GL.','',
 '## הרצה ממושכת ומדידות FPS','',
 '**30fps בטלפון בינוני הוא יעד שלא אומת על חומרה פיזית.** סביבת המדידה היא Chromium עם ANGLE/SwiftShader בתוכנה. אין המרה של תוצאות התוכנה למספרי FPS של טלפון.','']
if soak.get('pass'):
    ss=soak['summary'];lines +=[f'ריצה רציפה: **{soak["actualRenderMinutes"]:.2f} דקות**, {ss["phases"]} שלבי סצנה ו־{ss["samples"]} דגימות. שגיאות JS: {len(soak["errors"])}; בקשות חיצוניות: {len(soak["externalRequests"])}. כל מאגרי החלקיקים ו־2 ה־workers נשארו חסומים. שיאי משאבים: {ss["peakGeometries"]} geometry, {ss["peakTextures"]} textures, {ss["peakPrograms"]} תוכניות.','']
    lines +=[f'שיא הרנדר הראשי בדגימות הריצה: **{max(s["metrics"]["triangles"] for s in soak["samples"]):,} משולשים**, **{max(s["metrics"]["drawCalls"] for s in soak["samples"])} קריאות ציור**. JS heap בחמש הדקות האחרונות נע בין {ss["lastHeapMinBytes"]/1e6:.2f} ל־{ss["lastHeapMaxBytes"]/1e6:.2f}MB; זה אינו גודל תהליך הדפדפן או זיכרון GPU.','']
    if soak.get('sourceSha256')!=runtime_sha:
        lines +=['הריצה הארוכה בוצעה על קוד סבב 09. לאחר תחילתה השתנתה **שורה אחת של גובה יעד המצלמה לרוחב** בסבב 10. `soak-compatibility.json` משחזר את כל HTML הקודם ומוכיח SHA זהה לאחר החלפת אותה שורה בלבד: כל השיידרים, הנכסים, ניהול המשאבים והבקרים האחרים זהים. בדיקות הפריסה, השחזור, הבקרים ומחזורי הטעינה האחרונים רצות על המקור הסופי המדויק; אין טענה שריצת 75 הדקות עצמה השתמשה ב־SHA הסופי.','']
    groups={}
    for s in soak.get('samples',[]):
        m=s['metrics'];key=(m['state']['quality'],'גובה' if m['viewport']['width']<m['viewport']['height'] else 'רוחב');groups.setdefault(key,[]).append(m['cpuFrame']['fps'])
    lines+=['| פרופיל/כיוון בריצה הממושכת | דגימות | FPS מזערי | FPS חציוני | FPS מרבי |','|---|---:|---:|---:|---:|']
    for (profile,orientation),v in sorted(groups.items()):lines.append(f'| {profile} / {orientation} | {len(v)} | {min(v):.1f} | {statistics.median(v):.1f} | {max(v):.1f} |')
    lines+=['','נכללות כל דגימות הריצה, לרבות שינויי איכות, חימום ותנאים תחת עומס בדיקות נוספות בתחילת העבודה. לכן הטבלה אינה benchmark חומרה מבודד.','']
else:lines+=['בדיקת 75 הדקות עדיין לא הסתיימה; מספרי הסיום לא מולאו מראש.','']
if reload.get('pass'):
    rs=reload['summary'];lines+=[f'מחזורי טעינה מקומית ושחזור: **{reload["actualMinutes"]:.2f} דקות**, {rs["cycles"]} טעינות, {rs["contextLosses"]} אובדני context עם {rs["recoveries"]} שחזורים, {rs["lifecycleFreezes"]} הקפאות lifecycle. כל פינויים של geometry/texture הסתיימו באפס.','']
else:lines+=['בדיקת מחזורי הטעינה/שחזור עדיין בהשלמה.','']
if browser.get('performance') and browser.get('sourceSha256')==runtime_sha:
    lines+=['מדידה קצרה נפרדת של אותה גרסה:','', '| פרופיל | CSS | מרחק | DPR בסיום | FPS נמדד | p95 ms |','|---|---|---|---:|---:|---:|']
    for p in browser['performance']:
        lines.append(f'| {p["profile"]} | {p["viewport"][0]}×{p["viewport"][1]} | {p["view"]} | {p["metrics"]["viewport"]["dpr"]:.2f} | {p["frames"]/p["wallMs"]*1000:.1f} | {p["p95Ms"]:.1f} |')
    lines+=['']
lines+=['## משקל קבצים וטקסטורות','', (ROOT/'ASSET-WEIGHTS.md').read_text().split('\n',1)[1].strip(),'']
if resource:
    totals=resource['totals']
    lines+=['### אומדן נתונים לאחר טעינה','',
     'משקל Draco אינו גודל הנתונים המפוענחים. זהו חישוב סטטי לפי accessors וגדלי תמונות, ולא מדידת הקצאות GPU או זיכרון של טלפון. משאבי LOD ששותפים לאותה גאומטריה נספרים פעם אחת בזיכרון.','',
     '| רכיב | MB עשרוני משוער |','|---|---:|',
     f'| attributes ואינדקסים של כל 15 קובצי GLB לאחר פענוח | {totals["decodedAttributeAndIndexPayloadBytes"]/1e6:.3f} |',
     f'| תמונות RGBA8 עם mipmaps; שני מופעי בזלת נפרדים | {totals["estimatedResidentRgba8ImageBytes"]/1e6:.3f} |',
     f'| שתי בדיקות שמיים RGBA16F | {totals["twoPmremRgba16fTargetsBytes"]/1e6:.3f} |',
     f'| מפת צל 1024, צבע ועומק בהנחת 8 bytes לפיקסל | {totals["estimated1024ShadowColorAndDepthBytes"]/1e6:.3f} |','',
     'האומדן אינו כולל driver overhead, framebuffer, מחרוזות JavaScript, עותקי תמונות ב־CPU או תהליך הדפדפן. הצללים כבויים בפרופיל חסכוני ולאחר התאמת איכות בעומס. ההנחות ונתוני כל קובץ ב־`verification/resource-budget.json`.','']
lines+=['## בדיקות הריפו','',
 f'הרצת `npm test` בתנאי הסביבה המקוריים: {repo.get("fullRun",{}).get("pass","?")} עברו ו־{repo.get("fullRun",{}).get("fail","?")} קובצי בדיקה נכשלו. ארבעת הכשלים שוחזרו גם ב־base commit בעותק נקי ללא naval-v7. הבדיקה הממוקדת עם גישה לשרת מקומי ו־`--test-force-exit` החזירה אותה תוצאה בבסיס ובענף; הבדיקה שנותרה דרשה קובץ Chromium שלא הותקן בנתיב ברירת המחדל.','',
 'נבחר Chromium המותקן באמצעות selector זמני תחת /tmp, בלי לשנות קובץ בדיקה או משתנה מערכת של המשתמש. בדיקת הדפדפן הממוקדת עברה 5/5. ההרצה המלאה עם התאמת הסביבה מופיעה ב־repository-checks.json.','']
if repo.get('adaptedFullRun'):lines.append('הרצה מלאה מותאמת: `'+repo['adaptedFullRun']['command']+'`; '+json.dumps(repo['adaptedFullRun'].get('summary',{}),ensure_ascii=False)+'\n')
lines+=['## מגבלות וחיבור','',
 '- לא נבדק טלפון פיזי או חום/סוללה; בדיקת מכשיר לאחר החיבור עדיין נדרשת ליעד 30fps.',
 '- שיידר המים מחזיר שמיים ושמש אנליטיים, ללא רינדור השתקפות של כל כלי השיט.',
 '- אנשי צוות חולקים pose; LOD רחוק מקפיא ציוד. כל אלה בחירות תקציב מתועדות, לא נכסים חסרים.',
 '- הספינות קשיחות. רק דמות הצוות משתמשת בשלד ההומנואידי בן 18 העצמות. אין שינוי בקובצי motion2.',
 '- מדיניות הסביבה חוסמת file:// בדפדפן הבדיקה. אותו HTML מוטבע נבדק מ־setContent במקור אטום וגם עם browser offline. התצוגה מיועדת לפתיחה מקומית רגילה; שרת loopback הוא חלופה אם מדיניות דפדפן ארגונית חוסמת קבצים.',
 '- לתצוגה העצמאית CSP משלה. לחיבור במשחק יש להשתמש במודולים ובעובד Draco הסטטיים שכבר מותרים במדיניות הייצור, בלי לשנות אותה.','',
 '## שינוע','',f'ענף: `codex/naval-v7-20261105`. בסיס עבודה: `{session["baseCommit"]}`.']
if delivery.get('prNumber'):lines +=['',f'PR טיוטה: **[#{delivery["prNumber"]}]({delivery["prUrl"]})**, מול main. לא מוזג.']
else:lines+=['','ה־PR ייפתח כטיוטה לאחר השלמת המדידות ושמירת כל הממצאים.']
lines+=['','קבצים גדולים (MB עשרוני; מקורות, ראיות ונכסי ריצה נבדלים):','', '| קובץ | MB |','|---|---:|']
large=sorted((p for p in ROOT.rglob('*') if p.is_file() and p.name not in ['REPORT.md','delivery-validation.json']),key=lambda p:p.stat().st_size,reverse=True)[:5]
for p in large:lines.append(f'| {p.relative_to(ROOT)} | {p.stat().st_size/1e6:.4f} |')
(ROOT/'REPORT.md').write_text('\n'.join(lines)+'\n')
(ROOT/'verification/self-scores.json').write_text(json.dumps({'at':now,'scale':[1,10],'scores':[{'id':key,'item':name,'score':score,'evidenceOrLimitation':note} for key,name,score,note in scores],'physicalPhoneFpsMeasured':False},ensure_ascii=False,indent=2)+'\n')
print('Built REPORT.md; final evidence complete:',all_complete)
