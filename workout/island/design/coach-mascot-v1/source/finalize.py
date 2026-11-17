"""Write the delivery manifest/report and a deterministic, self-contained ZIP."""
from pathlib import Path
import json,hashlib,zipfile
ROOT=Path(__file__).resolve().parents[1]
ZIP='coach-mascot-v1-offline.zip'
def read(p):return json.loads((ROOT/p).read_text())
def sha(p):return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
def files():return sorted(p for p in ROOT.rglob('*') if p.is_file() and p.name!=ZIP and '__pycache__' not in p.parts and 'node_modules' not in p.parts and p.suffix!='.pyc')
def size():return sum(p.stat().st_size for p in files())+((ROOT/ZIP).stat().st_size if (ROOT/ZIP).exists() else 0)
summary=read('source/build-summary.json');qa=read('verification/motion-qa-provenance.json');browser=read('verification/browser.json');assets=read('verification/asset-validation.json')
assert qa['model']['sha256']==sha('coach.glb')==assets['sha256']
assert browser['htmlSha256']==sha('preview.html') and browser['pass'] and assets['pass']
assert qa['minimum']>88 and qa['minCoverage']==1 and not qa['insufficientData']
scores={c['id']:c['score'] for c in read('verification/motion-qa.json')['libraries'][0]['clips']}
labels=['עמידה','הנפת יד','הצבעה ימינה','הצבעה שמאלה','הצבעה למעלה','הצבעה למטה','כיווץ אגרוף','מחיאות כפיים','קפיצה בשמחה','כתפיים מורמות','הנהון','ניעור ראש','חיבוק אוויר','תיגש לשם','כל הכבוד','עוד פעם','מוכן להתחיל','עמידה במנוחה']
expression_labels=['שמח','מופתע','מעודד','מהרהר','גאה','מאוכזב בעדינות','צוחק','קורץ']
clips=[dict(id=c['name'],labelHe=label,durationSeconds=c['duration'],sampleRateHz=30,loop=c['loop'],motionQaScore=scores[c['name']]) for c,label in zip(summary['clips'],labels)]
manifest={
 'schemaVersion':1,'id':'coach-mascot-v1','createdDate':'2026-11-17','branch':'codex/coach-mascot-v1',
 'role':'Friendly original coach for a seven-year-old; introduction and encouragement for workout/island.',
 'entrypoint':'preview.html','model':'coach.glb','rig':'rig.json','licenses':'LICENSES.md','report':'REPORT.md',
 'geometry':{'triangles':1500,'vertices':summary['vertices'],'skins':1,'skinJoints':18,'drawPrimitives':1,'heightMeters':summary['heightMeters'],'textures':0,'material':'vertex colors, rough nonmetallic'},
 'rigContract':{'source':'workout/island/design/motion2/soccer.json#skeleton','units':'meters','up':'+Y','forward':'+Z','anatomicalLeft':'+X','bindRotations':'identity','restTranslations':'exact canonical18'},
 'expressions':[{'id':name,'labelHe':label,'targetIndex':i} for i,(name,label) in enumerate(zip(summary['expressions'],expression_labels))],
 'handControls':[{'id':name,'targetIndex':i+8} for i,name in enumerate(summary['handControls'])],
 'clips':clips,
 'playback':{'sampleRateHz':30,'interpolation':'LINEAR on densely baked smooth poses','horizontalRootMotion':False,'jumpRootY':{'takeoffSeconds':.9,'landSeconds':1.7,'peakMeters':.18},'directions':'point_right and point_left mean viewer screen directions from the front camera','defaultExpression':'happy','suggestedGameCrossfadeSeconds':.25,'extraEighteenthClip':'ready'},
 'offline':{'archive':ZIP,'open':'Extract the whole ZIP and open preview.html; the HTML embeds its model and renderer.','runtimeNetworkRequests':0,'wasm':False,'compressionExtensions':[],'brandMarksOrSymbolsOnCharacter':False,'packageBudgetBytes':6000000,'budgetScope':'all delivered files, including the ZIP'},
 'qa':{'tool':'motion-qa-v1','upstreamCommit':qa['upstreamCommit'],'sampleRateHz':60,'average':qa['average'],'minimum':qa['minimum'],'allClipsAbove88':True,'coverage':1,'khronosErrors':0,'khronosWarnings':0,'browserViewport':[844,390],'browserNetworkBlocked':True,'evidence':['verification/motion-qa.json','verification/motion-qa-provenance.json','verification/asset-validation.json','verification/khronos.json','verification/browser.json']},
 'resources':[{'path':p,'bytes':(ROOT/p).stat().st_size,'sha256':sha(p)} for p in ['coach.glb','preview.html','rig.json']],
 'integrationScope':'Asset review package only. Existing game files are unchanged.'}
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
rows='\n'.join(f"| `{c['id']}` | {c['labelHe']} | {c['durationSeconds']:.1f} | {c['motionQaScore']:.1f} |" for c in clips)
def report(total,archive):return f'''# דוח מסירה — מאמן האי v1

נוצרה דמות מאמן מקורית, ידידותית וצוחקת, עם פתיח קצר לילד: שלום, הכוונה ועידוד. הענף הוא `codex/coach-mascot-v1`. כל השינויים נמצאים בתיקייה חדשה זו בלבד; חיבור למשחק לא נכלל במסירת הנכסים.

| דרישה | תוצאה מאומתת |
|---|---|
| GLB על השלד הקנוני | 18 עצמות, סדר/הורים/תרגומי מנוחה זהים לחוזה motion2; מטרים, Y למעלה, Z קדימה |
| תקציב גאומטריה | בדיוק 1,500 משולשים, {summary['vertices']} קודקודים, primitive וחומר אחד |
| הבעות | 8 הבעות גאומטריות של עיניים, גבות, לחיים ופה; עוד 4 morphs לאחיזה ולהצבעה בידיים |
| אנימציה | 18 קליפים מלאים, כל ערוצי השלד ומשקלי morphs נדגמים ב־30Hz |
| Khronos glTF Validator | 0 שגיאות, 0 אזהרות, 0 הודעות מידע |
| motion-qa-v1 | ממוצע **{qa['average']:.1f}**, מינימום **{qa['minimum']:.1f}**, כל קליפ מעל 88; כיסוי מדדים רלוונטיים 100% |
| גודל GLB | {summary['bytes']:,} בתים ({summary['bytes']/1e6:.3f} MB) |
| כל התיקייה, כולל ZIP | {total/1e6:.2f} MB מתוך תקציב 6 MB עשרוני |
| ZIP להורדה | {archive/1e6:.2f} MB |
| ריצה מקומית | המודל והמנוע מוטמעים ב־HTML; 0 בקשות רשת בבדיקה עם רשת חסומה |
| מסך היעד | 844×390, ללא גלילה או חיתוך; גם רוחב 390 ללא גלילה אופקית |

## פתיחה ובדיקה

1. להוריד את [חבילת האופליין]({ZIP}) ולחלץ את כולה לתיקייה.
2. לפתוח את [preview.html](preview.html). הדמות, התאורה והמנוע כלולים בו; אין התקנה או CDN.
3. לבחור תנועה והבעה. אפשר לעצור, לגרור בזמן, לשנות מהירות, לעבור למבט צד ולנגן שוב את ההיכרות. ״לפי התנועה״ מחזיר את הבעות הקליפ; בחירה ידנית נשמרת בזמן התנועה.
4. תוצאה רצויה: דמות שלמה במרכז הסצנה, כל 18 הבחירות פעילות, 8 הבעות שונות וחיוך גם אחרי חזרה למנוחה. [לוח הבעות](verification/expressions.webp) ו[לוח מחוות](verification/gestures.webp) מציגים פריימים שרונדרו מהקובץ שנמסר.

אפשר להוריד את [coach.glb](coach.glb) בנפרד. כפתור הורדת הדמות בתצוגה מפיק את ה־GLB המוטמע גם כאשר קובץ HTML עומד בפני עצמו. הרישיונות נמצאים ב־[LICENSES.md](LICENSES.md); הגאומטריה והתנועות מקוריות, ללא מותגים, סמלים, טקסטורות חיצוניות או motion capture.

## 18 הקליפים

| מזהה GLB | מחווה | שניות | motion-qa-v1 |
|---|---|---:|---:|
{rows}

הרשימה המילולית בבקשה כוללת 17 מחוות כאשר סופרים את ארבע ההצבעות בנפרד. `ready` נוסף כקליפ השמונה־עשר. ימינה ושמאלה הן מנקודת מבטו של הצופה מלפנים. `fist_pump` כולל כיווץ אצבעות לאגרוף ועידוד בהרמת היד. `shrug` מרים את שני מפרקי הכתף ב־3.5 ס״מ. בקפיצה שתי הסוליות באוויר רק בין 0.9 ל־1.7 שניות, עד גובה 18 ס״מ, ללא תזוזת שורש אופקית.

## הבעות ושילוב

ההבעות: שמח, מופתע, מעודד, מהרהר, גאה, מאוכזב בעדינות, צוחק וקורץ. שמותיהן והאינדקסים מפורטים ב־[manifest.json](manifest.json). `happy` הוא גם בסיס הגאומטריה, ולכן יעדו אינו משנה את צורת הבסיס. יש 12 יעדי morph בסך הכול: 8 הבעות ועוד `grip_left`, `grip_right`, `point_left`, `point_right`. בקרות הידיים משתמשות בגאומטריית אצבעות, ללא הוספת עצמות לשלד הקנוני.

גובה הדמות {summary['heightMeters']:.3f} מ׳; כפות הרגליים במנוחה על Y=0, מפרקי הקרסול ב־Y=0.08. [rig.json](rig.json) הוא עותק מדויק של חוזה השלד. כל הקליפים נכנסים ויוצאים לאותה תנוחת מנוחה ומשקלי הבעה. במנוע המשחק מומלץ crossfade של כ־0.25 שניות; המעברים של המנוע הקיים לא נבדקו או שונו במסגרת מסירה זו.

## ראיות ומגבלות המדידה

- [motion-qa.json](verification/motion-qa.json) הופק ב־60Hz מהבתים של ה־GLB, עם זמני תמיכה מפורשים וארבע פינות סוליה לכל כף רגל. כלי `motion-qa-v1` נלקח מ־commit `{qa['upstreamCommit']}` ללא שינוי; ה־SHA של ששת קובצי המקור, המתאם והנכס מופיעים ב־[provenance](verification/motion-qa-provenance.json). כל הספים והמשקלים נשמרו.
- מגע בכדור ומהירות גוף מול צעדים אינם רלוונטיים למחוות נייחות ללא כדור, ולכן הוחרגו בידי הכלי. אין מדד רלוונטי שסומן ״אין מספיק נתונים״. הציון הוא אבחון חישובי של תנועה, ולא דירוג אמנותי או מדידת תחושה של ילד.
- [אימות הנכס](verification/asset-validation.json) מפענח בפועל גאומטריה, אינדקסים, משקלים, נורמלים, מטריצות inverse bind, הבעות וערוצי אנימציה; אין משולשים מנוונים. [דוח Khronos](verification/khronos.json) נקי. כלי התנועה עצמו בודק שלד ונקודות סוליה, ולא התנגשויות בין כל קודקודי הגוף.
- [בדיקת הדפדפן](verification/browser.json) מפעילה את ה־HTML במסמך עצמאי עם חסימת כל בקשות הרשת, עוברת על 18 קליפים ו־8 הבעות, ובודקת מסגור. סביבת Chromium חוסמת ניווט `file://`, ולכן לחיצה כפולה לא נבדקה בה ישירות; ה־HTML מכיל את כל תלויות הריצה ואינו מבצע טעינת משאבים.
- קצב 30Hz מתייחס לדגימת האנימציה. לא בוצעה מדידת FPS במכשיר טלפון פיזי.
- [בדיקות הריפו](verification/repository-tests.json): `npm test` בדק 4,326 מקרים: 4,261 עברו, 64 דולגו, ומקרה דפדפן קיים נכשל כי בינרי ה־Chromium ברירת המחדל של Playwright חסר בסביבה. לאחר מכן כל חמש הבדיקות בקובץ `tests/workout-royiki.test.mjs` עברו בהרצה חוזרת עם Chromium המקומי, דרך מתאם זמני מחוץ לריפו. לא שונו קבצים קיימים כדי להריץ אותן.

מקורות הבנייה והבדיקות נמצאים ב־[source/README.md](source/README.md). חבילת ZIP כוללת גם אותם, את מקור כלי הבדיקה ואת עותק three.js המקומי הנדרש ל־motion QA. אין WASM או הרחבות Draco, meshopt או KTX2 בנכס או בתלויות הריצה.
'''
def archive():
    with zipfile.ZipFile(ROOT/ZIP,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in files():
            info=zipfile.ZipInfo(str(p.relative_to(ROOT)),date_time=(2026,11,17,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
            z.writestr(info,p.read_bytes(),compresslevel=9)
    with zipfile.ZipFile(ROOT/ZIP) as z:
        assert z.testzip() is None
        assert set(z.namelist())=={str(p.relative_to(ROOT)) for p in files()}
# Reported MB values converge at two decimal places without self-hashing the archive.
for _ in range(3):
    (ROOT/'REPORT.md').write_text(report(size(),(ROOT/ZIP).stat().st_size if (ROOT/ZIP).exists() else 0))
    archive()
assert size()<=6_000_000,f'Package over budget: {size()}'
print(json.dumps({'fileCount':len(files())+1,'folderBytesIncludingArchive':size(),'archiveBytes':(ROOT/ZIP).stat().st_size,'archiveSha256':sha(ZIP),'pass':True},indent=2))
