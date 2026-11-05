"""Build the local review and REPORT from evidence; no application files touched."""
from collections import Counter
from zoneinfo import ZoneInfo
from common import *
from findings import findings

NAMES={'bakasun':'באקה סאן','workout':'האימון','island':'האי','north':'החנות'}
LABELS={'01':'בסיס ומיפוי','02':'אבטחה וגיבוי עוין','03':'נגישות ומקלדת','04':'ביצועים ומשקל','05':'אמינות וללא רשת','06':'אימות המסירה ושלילת ממצאי שווא','07':'תיקון ובדיקה חוזרת של המסירה','08':'אימות מסירה נוסף','09':'כיסוי גלריה וקישורים','10':'תנאי פלטפורמה וגיבוי עוין באי','11':'סינון, כיווניות ואימות חוזר','12':'מקורות חיצוניים ותלות בזמני בדיקה','13':'סנכרון משפחתי ובדיקת קישורים','14':'מקלדת וגרסאות runtime','15':'אימות מסירה וכיסוי מקלדת מלא'}
def read(rel,default=None):
    p=OUT/rel
    return json.loads(p.read_text()) if p.exists() else (default if default is not None else {})
def game_rows():
    rows=[]
    for x in read('iterations/04/game-performance.json',{'runs':[]})['runs']:
        q=x.get('result',{});q=q.get('result',q) or {};render=q.get('render',q.get('quality',{}));render=render or {}
        rows.append({'name':{'soccer':'כדורגל','hoops':'כדורסל','alpine':'סקי'}[x['game']],'size':'×'.join(map(str,x['size'])),'fps':q.get('fps',q.get('avgFps')),'p95':q.get('frameMs',{}).get('p95'),'triangles':render.get('triangles'),'note':x.get('harnessError') or ('שגיאת משחק' if q.get('error') else 'SwiftShader בענן; לא אישור טלפון')})
    return rows
def platform_rows():
    return [
      {'item':'three.js r160 מקומי וללא build','status':'אומת','detail':'REVISION=160 בייבוא המקורי; דפי המוצר משתמשים במודולים מקומיים. דף הביקורת אינו דורש three.js.'},
      {'item':'GLB עד 1.5MB עם Draco','status':'חלקי במאגר ובנכסי מסלול פעילים','detail':'155 מתוך 236 GLB דחוסים בכל primitives. שמונה דמויות שנבחרו עומדות בגודל וב־Draco. שני נכסי מסלול סקי שנמדדו אינם דחוסים, ומשקלם 11.6/45.1KB. athlete.glb הישן חורג מ־1.5MB ואינו דמות הסקי הפעילה.'},
      {'item':'טקסטורות עד 1024','status':'מדגם ברירת המחדל עומד; legacy חורג','detail':'38 GLB שתועדו במשחקים ומפות הדמות שנוצרו בקוד עד 1024. שתי מפות חיצוניות של athlete fallback ותמונת ספרייה אחת הן 2048. רקעי 1280 מסומנים בנפרד מטקסטורות חומר. ראו A27.'},
      {'item':'אטלס אחד לדמות','status':'לא עומד בכדורסל','detail':'חמש דמויות lod-v4 יוצרות אטלס גוף ואטלס אלפא נפרדים. שש תמונות הקובץ אינן שש מפות runtime. ראו A26 ו־TEXTURES.md.'},
      {'item':'שלד קנוני 18 מ־motion2','status':'לא עומד בכדורסל','detail':'שלושת חוזי motion2 זהים ובעלי 18 עצמות. שמות כדורגל/סקי שנבחרו תואמים; הכדורסל הפעיל הוא 52. rig.json הישן בעל 20 עצמות אינו החוזה הקנוני.'},
      {'item':'LOD','status':'קיים, לא אישור יעד FPS','detail':'כדורגל מפעיל רמות דמות ואיכות; כדורסל מפעיל דילול קהל לפי frame time; סקי מחליף איכות ומקטעים נראים. המדדים והשינויים נשמרו בהרצות המשחק.'},
      {'item':'instancing לקהל','status':'קיים בכדורגל; כדורסל ממוזג','detail':'קהל הכדורגל בנוי מחמש קבוצות InstancedMesh. זירת v5 בכדורסל משתמשת ב־mesh כרטיסים ממוזג עם LOD של אינדקסים; אין להציגו כ־InstancedMesh.'},
      {'item':'30fps בטלפון בינוני','status':'לא אומת','detail':'SwiftShader בענן אינו GPU של טלפון. נדרש מכשיר פיזי; הציון העצמי נשאר 6 עם החוסר המפורש.'},
    ]
def main():
    rows=findings();write_json(OUT/'findings.json',rows)
    inv=read('evidence/assets.json',{'files':[]})['files'];glbs=[x for x in inv if 'glb' in x]
    tests=read('evidence/verification-summary.json');perf=read('iterations/04/startup-performance.json');deployment=read('evidence/deployment.json');soak=read('evidence/soak.json')
    now=datetime.datetime.now(datetime.timezone.utc);local=now.astimezone(ZoneInfo('Asia/Jerusalem'))
    iterations=[]
    for folder in sorted((OUT/'iterations').iterdir()):
        if not folder.is_dir() or not (folder/'CRITIQUE.md').exists():continue
        shots=[]
        for app in NAMES:
            for size in ['390x844','844x390']:
                near=folder/f'{app}-{size}-near.jpg';far=folder/f'{app}-{size}-far.jpg'
                if near.exists() and far.exists():shots.append({'app':app,'size':size,'near':str(near.relative_to(OUT)),'far':str(far.relative_to(OUT))})
        for view,label in [('findings','ממצאים'),('gallery','גלריה'),('weights','משקלים'),('coverage','כיסוי')]:
            for size in ['390x844','844x390']:
                near=folder/f'review-{view}-{size}-near.jpg';far=folder/f'review-{view}-{size}-far.jpg'
                if near.exists() and far.exists():shots.append({'app':'review','label':label,'size':size,'near':str(near.relative_to(OUT)),'far':str(far.relative_to(OUT))})
        for prefix,app,label in [('bakasun-poison','bakasun','גיבוי עוין'),('bakasun-error-cache','bakasun','מטמון 503'),('workout-exercises','workout','קטלוג תרגילים'),('island-parent','island','חלון הורה')]:
            for size in ['390x844','844x390']:
                near=folder/f'{prefix}-{size}-near.jpg';far=folder/f'{prefix}-{size}-far.jpg'
                if near.exists() and far.exists():shots.append({'app':app,'label':label,'size':size,'near':str(near.relative_to(OUT)),'far':str(far.relative_to(OUT))})
        iterations.append({'id':folder.name,'label':LABELS.get(folder.name,'אימות חוזר'),'shots':shots})
    complete=bool(soak.get('finished'))
    scores=[
      {'item':'היקף ופרטיות','score':9,'detail':'ארבע אפליקציות, main קפוא, נתונים סינתטיים וחסימת רשת; לא נבדק מסד ייצור.'},
      {'item':'אבטחה: XSS, CSP, סודות ואחסון','score':9,'detail':'שחזורי דפדפן/handler/SQL וסריקת 11,988 גרסאות קבצים; אין טענה שלא ייתכן סוד בפורמט אחר.'},
      {'item':'נגישות: axe ומקלדת','score':8,'detail':'72 מצבי מסך, משטחים נוספים, דיאלוגים ושלוש שפות. קורא מסך פיזי לא נבדק.'},
      {'item':'ביצועים ומשקלים','score':8,'detail':'שלוש דגימות startup מואטות, שש מדידות משחק וסקירת GLB/מודולים; מדידות ענן ללא דחיסת HTTP אינן production RUM.'},
      {'item':'אמינות וגיבויים עוינים','score':9,'detail':'Cache API אמיתי, שגיאות רשת/מכסה/JSON, offline ושלושת המשחקים אחרי הורדה.'},
      {'item':'בדיקות ו־CI','score':9,'detail':'שלוש הרצות מלאות זהות; 33 יעדי תיקון מדולגים זוהו. מבחן auto-download כשל וחזר ונכשל, ומדווח כלא פתור.'},
      {'item':'יעד 30fps בטלפון בינוני','score':6,'detail':'חסר מכשיר פיזי עם GPU אמיתי. לא ניתן להסיק עמידה ביעד מ־SwiftShader; יש להשלים בדיקת טלפון. זו אינה תעודת ביצועים.'},
      {'item':'סבבים וצילומים','score':9 if len(iterations)>=6 else 5,'detail':f'{len(iterations)} סבבים מתועדים כרגע; שיטות zoom/camera מתוארות, וכל מידה בשם הקובץ נבדקת.'},
      {'item':'בדיקת יציבות ממושכת','score':9 if complete else 5,'detail':f'{round(soak.get("elapsedSeconds",soak.get("samples",[{}])[-1].get("elapsedSeconds",0))/60,1)} דקות; '+('ההרצה הסתיימה.' if complete else 'עדיין בריצה; אין מסקנה סופית.')},
      {'item':'HTML מקומי ודוח בר־שחזור','score':8,'detail':'קבצים מקומיים בלבד, ללא build/CDN/fetch. תוצאות אימות הדף נשמרות בסבב המסירה.'}
    ]
    assets=[]
    for x in glbs:
        g=x['glb'];assets.append({'path':x['path'],'bytes':x['bytes'],'triangles':g.get('trianglesUniqueMeshes'),'bones':g.get('skinJoints',[]),'images':g.get('imageCount',0),'draco':f'{g.get("dracoPrimitives",0)}/{g.get("primitives",0)}'})
    data={'meta':{'base':'5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275','updatedLocal':local.strftime('%d.%m.%Y %H:%M'),'state':'מבחן היציבות הושלם; ממצאים פתוחים' if complete else 'מבחן יציבות ממושך עדיין רץ','rounds':len(iterations),'unitPass':3227},
      'findings':rows,'iterations':iterations,'scores':scores,'assets':assets,'startup':perf.get('summary',{}),'games':game_rows(),'platform':platform_rows(),
      'distribution':{'publishedBytes':deployment.get('publishedBytes',0),'publishedFiles':deployment.get('publishedFiles',0),'offlineBytes':deployment.get('offline',{}).get('bytes',0)},
      'coverageSummary':f'{len(rows)} ממצאים. שלוש הרצות מלאות: 3,227 עברו ו־51 דולגו בכל הרצה. CSP: שלוש בדיקות עברו. Offline: שתיים עברו ואחת נכשלה; חזרה ממוקדת נכשלה גם היא. לא בוצע תשלום או שינוי ענן.',
      'conditions':['בסיס main קבוע; רק קבצים חדשים בתיקיית הביקורת.','פרופילי דפדפן חדשים, נתונים סינתטיים, חסימת רשת חיצונית.','סריקת סודות: חתימות בלבד, ללא העתקת ערכים; אין גישה למסד/אחסון חיים.','axe ומקלדת אינם אישור נגישות מלא.','טבלת נכסים כוללת גם preview/fallback; אין חיבור נכסים חדש.','ציונים נמוכים מ־8 מסבירים מה חסר ואינם מוצגים כעבר.']}
    (OUT/'data.js').write_text('window.AUDIT='+json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')+';\n')
    write_json(OUT/'evidence/review-summary.json',{'generated':stamp(),'scores':scores,'findingCount':len(rows),'rounds':len(iterations),'soakComplete':complete})
    build_markdown(data,inv,tests,perf,deployment,soak,now)
    print('review built:',len(rows),'findings;',len(iterations),'rounds; soak complete:',complete)

def build_markdown(data,inventory,tests,perf,deployment,soak,now):
    local=now.astimezone(ZoneInfo('Asia/Jerusalem'));rows=data['findings'];priorities=Counter(f['priority'] for f in rows)
    lines=['# ביקורת ארבע האפליקציות — 05.11.2026','',
      f'עודכן בפועל: {local:%d.%m.%Y %H:%M} בישראל ({now:%Y-%m-%dT%H:%M:%SZ}). שם התיקייה והתאריך בכותרת נקבעו בבקשה.',
      '',f'**{len(rows)} ממצאים: {priorities[1]} בעדיפות P1, {priorities[2]} בעדיפות P2 ו־{priorities[3]} בעדיפות P3.** הסיכונים הראשונים לטיפול הם הרשאת יצירת תשלום, חברות ארגון אוטומטית ומחיקת מטמונים/קבצי שיתוף בעדכון. קוד המוצר לא שונה; הממצאים אינם מסומנים כמתוקנים.',
      '',f'בסיס הבדיקה הוא `main` בקומיט `{data["meta"]["base"]}`, שנשלף בתחילת העבודה. הענף המבוקש: `codex/audit-2026-11-05-20261105`. כל המסירה תחת `audit/2026-11-05/`; לא נערכו קבצים קיימים, `release.json`, `release.mjs`, תגי גרסה, `CLAUDE.md`, `ops/CONTROL.md` או בדיקות.',
      '', '## מה נבדק', '',
      '| אפליקציה | גבולות שנבדקו |','|---|---|',
      '| באקה סאן | shell, מסכי עסק, גיבוי/מיזוג/קבצים, סנכרון מקומי עם mocks, CSP, service worker, CSV ו־SQL הרשאות |',
      '| האימון | בית, תרגילים, הגדרות, הורים, מעקב; אחסון ומדיה, משטחי מצלמה/הקלטה, מקלדת ופתיחה ללא רשת |',
      '| האי | יצירת דמות, עיר, תפריט, כדורגל/כדורסל/סקי, CSP/Draco, offline, נכסים, מודולים, LOD ו־instancing |',
      '| החנות | גיל, קטלוג, מוצר, סל, קופה, תודה, טופס/תקנון, תשלום מדומה, אחסון ו־SQL |',
      '', 'לא צורף רפרנס חזותי חיצוני. נקודת הייחוס היא ה־main הקפוא ורשימת הבדיקה. בקשת התלת־ממד פורשה כקריטריונים לבדיקת הנכסים הקיימים; לא נבנו או חוברו נכסי מוצר חדשים במסגרת audit בקריאה בלבד.',
      '', '## תוצאות הרצה והגבולות שלהן','',
      '- שלוש הרצות מלאות, בדיקות מקוריות ללא שינוי: **3,278 נרשמו; 3,227 עברו, 51 דולגו, אפס נכשלו בכל הרצה.** מתאם הביקורת בחר Chromium מקומי וחסם תעבורה חיצונית. מספרים זהים אינם הוכחה שאין flakiness מחוץ לשלוש ההרצות.',
      '- 33 מהדילוגים הם יעדי תיקון B3. שחזורי `current` שעברו מוכיחים שההתנהגות הבעייתית עדיין קיימת; הם אינם אישור לתיקון.',
      '- מבחני CSP/דיאלוג העסק שהופעלו במפורש: **3 עברו, אפס נכשלו או דולגו**. שתי בדיקות CSP של האי חזרו ועברו גם ב־Node Playwright 1.62.1 המוגדר ב־CI, עם אותו Chromium מערכת. helper מוסיף CSP ככותרת לדפי העזר; גבול ההסקה מתועד ב־A33.',
      '- בדיקת דפדפן ייעודית לתנועת כדורגל motion2: **6 עברו, אפס נכשלו או דולגו**, בשתי התנוחות. פלט restart הוגדר לתיקיית ביקורת זמנית ניתנת לכתיבה; קוד הבדיקה המקורי לא שונה.',
      '- סוויטת offline ייעודית: **2 עברו, 1 נכשל**. הורדת שלושת המשחקים ופתיחתם ללא רשת עברו; נכסים חסומים נפלו לגיבוי. מבחן auto-download כשל ב־avatarLoaded אחרי 120 שניות, וגם שתי חזרות ממוקדות ללא כלי האבחון נכשלו. אבחון מנוטר בתנאי המקור נכשל פעם ועבר בחזרה; אבחון שסגר את דף data saver לפני הדף האוטומטי עבר. כלי האבחון עצמם משנים תזמון, ולכן אינם מחליפים את שלושת הכשלים ואינם מוכיחים גורם סיבתי. כל התוצאות נשמרות; אין טענה שהכשל תוקן או שהופעל בטלפון.',
      '- נגישות: **72 מצבי מסך** בשתי התנוחות, מסלולי Tab/Escape ובקרות חיוביות, שלוש שפות בעסק וחמישה משטחי HTML נוספים. axe 4.11.0, selectors ויחסי צבע מחושבים נשמרו; HTML של nodes ופרטי קשר לא הועתקו.',
      '- גיבוי עוין באי: **42 מקרים עברו**, כולל גרסאות עתידיות, טיפוסים פגומים, רשומות כפולות, מספר לא סופי, מפתחות שמורים וכשל מכסת כתיבה. דחייה לא שינתה את המצב או האחסון. באימון ובחנות לא נמצא ממשק יבוא JSON; אין להציג הזרקת localStorage כפעולת יבוא משתמש.',
      '- סנכרון משפחתי: ה־SQL המקורי עם pgcrypto והלקוח המקורי אומתו מול Postgres מקומי. A36 משחזר אישור סנכרון שגוי ומחיקת פריט מתור מקומי בעת שינוי קוד משפחה; בקרה עם מזהה חדש עברה, וגבול הבעלות נשמר.',
      '- גרסאות הבדיקה: שלוש ההרצות המלאות השתמשו ב־Node 24.19.0, ב־Node Playwright 1.57.0 וב־Chromium 151. בדיקות Python השתמשו ב־Playwright 1.62.0. מבחן auto-download חזר ונכשל גם בהשוואה נפרדת ל־Node Playwright 1.62.1; ההשוואה אינה runner ה־CI המלא המוגדר ל־Node 22. כל הגרסאות מתועדות ב־[environment.json](evidence/environment.json).',
      '- מקלדת באימון ובאי: כרטיסי קטלוג האימון לא קיבלו מיקוד בשתי התנוחות, אף שקישורי הניווט פעלו ב־Enter (A37). חלון ההורה באי נבדק עם Tab/Shift+Tab, Escape והחזרת מיקוד כבקרה חיובית.',
      '- מקור ונכסים: **6,103 קבצים**, 2,441 קובצי טקסט ו־236 GLB. בנוסף נסרקו **11,988 blobs טקסטואליים בהיסטוריית main**, כ־241.5MB, במאגר שאינו shallow. חתימות המפתחות שנבדקו לא מצאו private key, token שירות או מפתח שרת; עשרת מופעי JWT בהיסטוריה סווגו `anon`. הסריקה חתימתית ואינה הוכחה שאין סוד בפורמט אחר.',
      '- כל פעולות הרשת העסקיות/תשלום היו mocks או נחסמו. ניסיון לקרוא כותרות משבעה קבצים סטטיים ב־GitHub Pages נחסם בפרוקסי הסביבה לפני השרת; אין להסיק מכך תגובת 403 של האתר. לא נבדקו מסד/Storage פרוסים, תשלום אמיתי, דואר/וואטסאפ או טלפון פיזי. רשימות CI/status שה־connector החזיר ל־SHA היו ריקות; אין אישור למצב CI או להגנת main החיה.',
      '', '### יציבות ממושכת','']
    samples=soak.get('samples',[]);elapsed=soak.get('elapsedSeconds',samples[-1].get('elapsedSeconds',0) if samples else 0)
    lines += [f'מבחן 7,200 שניות, במקטעים של 600 שניות, מתועד ב־[soak.json](evidence/soak.json). כעת נמדדו {elapsed/60:.1f} דקות ו־{len(samples)} דגימות. מצב: '+('הסתיים.' if soak.get('finished') else '**עדיין רץ; נתון ביניים בלבד.**'),
      '', 'כל אפליקציה מקבלת שלושה מקטעים עם פרופיל חדש לכל מקטע; אין טענה שכל אפליקציה נבדקה שעתיים רצופות באותו context. מדידות heap נאספו אחרי GC, אך אינן מדידת זיכרון GPU. הצטברות מאזינים אומתה בנפרד ב־A35; אין לייחס לה אוטומטית את כל גידול ה־heap.',
      '', 'סיכום מקטעים ומדדי זיכרון באותו מסלול: [soak-summary.json](evidence/soak-summary.json). היעדר שגיאת JavaScript מדווחת אינו הוכחה נגד קיפאון רינדור שקט.',
      '', '### בקרות חיוביות ושלילת ממצאי שווא','',
      '- נתיבי ההזרקה הישנים בשיחות ובפתקים לא הריצו marker. אין להציגם שוב כ־XSS פתוח.',
      '- הדיאלוג המשותף בעסק לכד מיקוד, סגר ב־Escape והחזירו; הכשל הוא בחלונות מותאמים ובסמנטיקה, לפי הממצא הספציפי.',
      '- האי שומר גיבוי corrupt ואינו דורס את המקור. worker האי מגביל מחיקת caches ל־namespace שלו.',
      '- הורדת offline מלאה אפשרה לפתוח שלושה משחקים בלי רשת. ביקור ראשון עם data saver, או אפליקציה ללא shell worker, אינו אותה הבטחה.',
      '- three.js r160 מקומי, decoder מקומי, LOD ו־instancing לקהל קיימים. נכס שהגיע ל־main אך לא נטען במשחק אינו ״מחובר״.',
      '', '## ממצאים מדורגים','',
      'P1 = קדימות מיידית בגלל גבול הרשאה/תשלום או אובדן קובץ ממתין. P2 = תיקון נדרש לאמינות, אבטחה, נגישות או תקציב היעד. P3 = הקשחה, איכות/תחזוקת בדיקות או פער עם השפעה מוגבלת. אין דירוג CVSS או טענה לניצול בייצור. קובצי כלי שחזור ששמם מקוצר נמצאים ב־audit/2026-11-05/tools/; הפקודות המלאות והתלויות מופיעות ב־README.',
      '', '| מזהה | קדימות | אפליקציות | תחום | ממצא |','|---|---|---|---|---|']
    for f in rows:lines.append(f'| [{f["id"]}](#{f["id"].lower()}) | P{f["priority"]} | {" / ".join(NAMES[a] for a in f["apps"])} | {f["area"]} | {f["title"]} |')
    for f in rows:
        lines += ['',f'<a id="{f["id"].lower()}"></a>',f'### {f["id"]} — P{f["priority"]}: {f["title"]}','',f['observed'],'','**שחזור:**']
        lines += [f'{i+1}. {s}' for i,s in enumerate(f['reproduction'])]
        lines += ['',f'**תיקון מוצע:** {f["proposedFix"]}','',f'**אימות תיקון:** {f["verification"]}','',f'**גבול הראיה:** {f["limits"]}','']
        refs=[f'[{s["file"]}:{s["line"]}](https://github.com/roynaor-work/Bakasun/blob/{data["meta"]["base"]}/{s["file"]}#L{s["line"]})' for s in f['sources']]
        lines += ['מקור: '+', '.join(refs)+'.','', 'ראיות: '+', '.join(f'[{p}]({p})' for p in f['evidence'])+'.']
    append_tables(lines,data,inventory,perf,deployment)
    (OUT/'REPORT.md').write_text('\n'.join(lines)+'\n')

def append_tables(lines,data,inventory,perf,deployment):
    lines += ['', '## משקלים וביצועים','',
      'MB בטבלאות = 1,000,000 bytes. משקל gzip הוא חישוב מקומי, לא טענה ששרת הייצור משתמש באותו encoding. [WEIGHTS.md](WEIGHTS.md) מפרט את כל 236 קובצי ה־GLB; ה־HTML מאפשר סינון לכל קובץ. אין GLB חדש בחבילת הביקורת.',
      '', '### תנאי הפלטפורמה','', '| דרישה | מצב המוצר שנמצא | ראיות ומגבלות |','|---|---|---|']
    for row in data['platform']:lines.append(f'| {row["item"]} | {row["status"]} | {row["detail"]} |')
    lines += ['', 'מקור: [platform-constraints.json](evidence/platform-constraints.json), [runtime-assets.json](iterations/10/runtime-assets.json) ו־[TEXTURES.md](TEXTURES.md). זוהי בדיקת המוצר הקיים; אי־עמידה אינה מוסתרת באמצעות ציוני איכות הביקורת.',
      '', '### גרף מודולים static','', '| אפליקציה | זהויות מודול | bytes מפוענחים | gzip מחושב MB |','|---|---:|---:|---:|']
    graph=read('evidence/module-graph.json',{'apps':{}})
    for app,g in graph['apps'].items():lines.append(f'| {NAMES[app]} | {g["staticModuleIdentities"]} | {g["totalDecodedBytes"]:,} | {g["totalGzipBytes"]/1e6:.3f} |')
    lines += ['', 'הגרף אינו כולל imports דינמיים שלא ניתן להכריע סטטית. זהות מודול כוללת query string; הקבצים הכפולים מפורטים ב־module-graph.json.',
      '', '### LCP בפרופיל מואט','',
      'CPU ×4, viewport 390×844, DPR 2, latency 150ms והורדה 1.6Mbps. שרת HTTP/1 מקומי **ללא דחיסה**, cache רשת מבוטל, service workers חסומים ו־webfonts חיצוניים חסומים. שלוש דגימות לכל אפליקציה. באי ההמתנה כוללת עיר ודמות מוכנות, לאחר שנפסלה מדידה חלקית של loading.',
      '', '| אפליקציה | דגימות | חציון LCP ms | טווח ms | תעבורה מקומית מרבית MB |','|---|---:|---:|---|---:|']
    for app,s in perf.get('summary',{}).items():
        limits=s.get('lcpRangeMs');rg='—' if not limits else f'{limits[0]:,.0f}–{limits[1]:,.0f}'
        med=s.get('medianLcpMs');size=s.get('maxTransferBytes')
        lines.append(f'| {NAMES[app]} | {s["validLcpSamples"]} | {med:,.0f} | {rg} | {size/1e6:.3f} |' if med is not None and size is not None else f'| {NAMES[app]} | {s["validLcpSamples"]} | — | {rg} | — |')
    lines += ['', '**הטבלה אינה LCP של האתר החי או טלפון.** דחיסת hosting, HTTP/2/GPU ואיכות הרשת שונים. נרשמו מדידות ה־lab עצמן, בלי להפוך אותן לציון production. יש לאמת בשרת היעד ובטלפון לאחר שינוי טעינה.',
      '', '### ששת מבחני המשחקים','',
      'הסשנים והנכסים האמיתיים הורצו 30 שניות בכוונת כל bench; מדדי FPS להלן הם **SwiftShader בענן משותף תחת עומס**. אין להסיק מהם שהמשחק בטלפון רץ באותו FPS, או שאושר יעד 30fps. זמני אמת, warmup, LOD ו־frame tails נשמרו ב־game-performance.json.',
      '', '| משחק | viewport | FPS בענן | p95 frame ms | משולשים ב־frame שנדגם |','|---|---|---:|---:|---:|']
    for g in data['games']:lines.append(f'| {g["name"]} | {g["size"]} | {g["fps"]} | {g["p95"]} | {g["triangles"]} |')
    lines += ['', 'משולשי GLB להלן הם סכום meshes ייחודיים מתוך accessor counts, גם עם Draco; הם אינם הכפלת instances, מספר שחקנים או מעברי צל. מספר תמונות בקובץ אינו מספר אטלסי UV או טקסטורות GPU.',
      '', '### דוגמאות לנכסי runtime וחלופות','', '| קובץ | MB | משולשים ייחודיים | עצמות skins | תמונות משובצות |','|---|---:|---:|---|---:|']
    keys=['workout/island/assets/kid-full.glb','workout/island/assets/soccer-v5/teal-quiff.glb','workout/island/assets/soccer-v5/goalkeeper.glb','workout/island/design/hoops/lod-v4/hoops-v4-pg-lod.glb','workout/island/design/hoops-v5/models/crowd.glb','workout/island/design/skier3/skier.glb','workout/island/assets/alpine-rush/athlete.glb']
    by={x['path']:x for x in inventory}
    for key in keys:
        if key not in by:continue
        x=by[key];g=x['glb'];lines.append(f'| `{key}` | {x["bytes"]/1e6:.6f} | {g.get("trianglesUniqueMeshes")} | {g.get("skinJoints")} | {g.get("imageCount",0)} |')
    lines += ['', 'הנכס האחרון הוא חריג ישן ואינו דמות הסקי הראשית. שלד הכדורגל/סקי הקנוני הוא 18, אבל מסלול הכדורסל הפעיל עדיין משתמש ב־52. תמונות preview גדולות אינן נספרות אוטומטית כטקסטורות חומר פעילות.',
      '', '### הפצה ו־offline','',
      f'לפי מודל `.github/workflows/pages.yml`: {deployment.get("publishedFiles",0):,} קבצים, {deployment.get("publishedBytes",0)/1e6:.3f}MB. חומרי כלים/אימות שסווגו לפי הנתיב: {deployment.get("nonRuntimeArtifacts",{}).get("bytes",0)/1e6:.3f}MB. זהו משקל artifact ולא משקל startup.',
      '', '| חבילת אי | קבצים | MB גולמיים |','|---|---:|---:|']
    for game,g in deployment.get('offline',{}).get('games',{}).items():lines.append(f'| {game} | {g["files"]} | {g["bytes"]/1e6:.3f} |')
    offline=deployment.get('offline',{});lines += [f'| כלל URLs ייחודיים, כולל shell | {offline.get("uniqueFiles",0)} | {offline.get("bytes",0)/1e6:.3f} |',
      '', 'סכומי המשחקים עשויים לכלול קבצים משותפים. alias השורש הריק ב־manifest אינו קובץ חסר. משקל התוכן מחושב מקבצים, לא מתעבורת headers או aliases. אין קובץ manifest חסר במודל חבילת הפריסה שנבדק.',
      '', '## רשימת בדיקה וציון עצמי','',
      'הציונים מתייחסים לאיכות הביקורת, לא לבריאות המוצר. ממצא פתוח אינו ״עבר״. פריט מתחת ל־8 נשאר גלוי עם הסבר החוסר, ולא מקבל ציון מלאכותי כדי לסיים.',
      '', '| פריט | ציון / 10 | ראיות ומה חסר |','|---|---:|---|']
    for s in data['scores']:lines.append(f'| {s["item"]} | {s["score"]} | {s["detail"]} |')
    lines += ['', '## סבבי עבודה','', '| סבב | תוכן | ביקורת עצמית וצילומים |','|---|---|---|']
    for i in data['iterations']:lines.append(f'| {i["id"]} | {i["label"]} | [ביקורת](iterations/{i["id"]}/CRITIQUE.md), {len(i["shots"])*2} צילומים + ראיות משלימות בתיקייה |')
    lines += ['', 'כל צילומי המכשיר הם 390×844 או 844×390. קרוב=100%; רחוק=67% zoom במסכי HTML, או camera overview באי כאשר dev view זמין. המדידות נעשו לפני zoom; צילום רחוק אינו בדיקת reflow. דף המסירה עצמו נבדק גם הוא בשתי המידות וללא רשת. ניווט file:// נחסם במדיניות הדפדפן המנוהל; האימות החלופי סיפק כל קובץ מקומית בזיכרון עם offline=true וללא שרת או תעבורת רשת. פתיחה ישירה של file:// מחוץ לסביבה זו לא אומתה.',
      '', '## סדר תיקון מוצע','',
      '1. לסגור את גבולות הרשאת התשלום וחברות הארגון (A01–A02), ולשמר מטמונים/תור שיתוף בעדכון (A03).',
      '2. להקשיח אימות סכום והתקנת SQL, יבוא ואחסון (A04–A12), ואז לטפל בזרימת כשל הקופה.',
      '3. לתקן שמות, ניגודיות ומודאלים עם בדיקת מקלדת/axe חוזרת; לחבר שלד קנוני בעבודה נפרדת, בלי לשנות מדדי משחק.',
      '4. לחייב כיסוי דפדפן ושער פריסה; להפוך יעדי תיקון מדולגים לבדיקות מחייבות עם כל תיקון, ולמדוד שוב בטלפון פיזי.',
      '', '## שחזור ומסירה','',
      '[README.md](README.md) מפרט הרצות ותלויות. [index.html](index.html) הוא דף מקומי ללא רשת או build. [SESSION.md](SESSION.md) מתעד את ההיקף והוראת קבצים חדשים בלבד. [evidence/verification-summary.json](evidence/verification-summary.json) שומר תוצאות ולא ערכי סודות. [DELIVERY.json](DELIVERY.json), [FILE-WEIGHTS.md](FILE-WEIGHTS.md) ו־[SHA256SUMS](SHA256SUMS) מתעדים את החבילה הסופית, משקליה וחתימותיה.',
      '', 'לא נשלחו הודעות, לא בוצעה פריסה או פעולת תשלום, ולא מוזג PR. תיקונים הם הצעות בלבד.']
    glbs=[x for x in inventory if 'glb' in x]
    weights=['# טבלת כל קובצי GLB בבסיס הביקורת','','מקור: evidence/assets.json. MB עשרוניים; משולשים ייחודיים, ללא הכפלת instances. כולל runtime, preview ו־fallback. אין נכס GLB חדש במסירה.','',
      '| קובץ | bytes | MB | משולשים | עצמות | מידות תמונות, כולל חיצוניות מקומיות | Draco primitives |','|---|---:|---:|---:|---|---|---|']
    for x in glbs:
        g=x['glb'];dims=Counter(('חיצוני ' if t.get('external') else '')+f'{t.get("width","?")}×{t.get("height","?")}' for t in g.get('textures',[]));tex=', '.join(f'{k} × {v}' for k,v in dims.items()) or '0 תמונות'
        weights.append(f'| `{x["path"]}` | {x["bytes"]} | {x["bytes"]/1e6:.6f} | {g.get("trianglesUniqueMeshes","?")} | {g.get("skinJoints",[])} | {tex} | {g.get("dracoPrimitives",0)}/{g.get("primitives",0)} |')
    (OUT/'WEIGHTS.md').write_text('\n'.join(weights)+'\n')

if __name__=='__main__':main()
