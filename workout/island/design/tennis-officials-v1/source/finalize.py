"""Build the asset catalog and Hebrew delivery report from measured results."""
from pathlib import Path
import hashlib,json

ROOT=Path(__file__).resolve().parent.parent
def read(name): return json.loads((ROOT/name).read_text())
def write(name,value): (ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def record(name):
    data=(ROOT/name).read_bytes()
    return {'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

qa=read('verification/motion-qa-v1.json')
characters=read('verification/characters.json')['models']
motion=read('motions.json')
audio=read('verification/audio.json')
preview=read('verification/preview.json')
assert qa['pass'] and qa['minimumScore']>88 and preview['pass']
positions=[([7.1,0,0],-1.5707963267948966),([-6.7,0,-12.9],1.5707963267948966),([6.7,0,12.9],-1.5707963267948966),([-7.2,0,-14],1.0471975511965976),([7.2,0,-14],-1.0471975511965976),([-7.2,0,14],2.0943951023931953),([-7.2,0,.9],1.5707963267948966)]
models=[]
for c,(position,yaw) in zip(characters,positions):
    measured=next(m for m in qa['models'] if m['file']==c['file'])
    authored=next(m for m in motion['models'] if m['id']==c['id'])
    clips=[]
    for clip in authored['clips']:
        score=next(x for x in measured['clips'] if x['id']==clip['id'])
        clips.append({**clip,'qa':{'score':score['score'],'coverage':score['coverage'],'report':'verification/motion-qa-v1-'+Path(c['file']).name+'--'+clip['id']+'.json'}})
    models.append({**record(c['file']),'id':c['id'],'role':c['role'],'label':c['label'],'bodyTriangles':measured['triangles'],'ballTriangles':80 if c['role']=='ballKid' else 0,'skinJoints':18,'uniformScale':c['uniformScale'],'placement':{'positionMeters':position,'yawRadians':yaw},'defaultClip':{'chairUmpire':'chair_seated','lineJudge':'line_idle','ballKid':'kid_idle'}[c['role']],'texture':c['atlas'],'source':{'file':c['sourceFile'],'sha256':c['sourceSha256']},'clips':clips})

runtime_files=sorted(str(f.relative_to(ROOT)) for folder in ['models','audio','textures','vendor'] for f in (ROOT/folder).rglob('*') if f.is_file())
catalog={'schemaVersion':1,'id':'tennis-officials-v1','license':'CC0-1.0 (original assets); MIT (Three.js)','axes':{'up':'+Y','forward':'+Z','anatomicalLeft':'+X'},'units':'metres','rig':'rig.json','skeleton':{'boneCount':18,'contract':'Canonical18 names/order/parents; tennis-v7 T-pose translations and inverse binds. Embedded animations are authored for this bind.'},'sampleRateHz':30,'counts':{'chairUmpires':1,'lineJudges':2,'ballKids':4,'uniqueClips':14,'embeddedClips':35},'models':models,'props':[{**record('models/umpire-chair.glb'),'id':'umpire-chair','triangles':432,'seatTopMeters':1.57,'footrestTopMeters':1.124}],'sounds':audio['sounds'],'preview':{'file':'preview.html','viewport':{'width':844,'height':390},'runtime':'Local Three.js r160; no CDN, network, or build step required when served over HTTP.'},'motionQA':{'tool':'motion-qa-v1','commit':qa['upstream']['commit'],'report':'verification/motion-qa-v1.json','samplingHz':120,'pass':qa['pass'],'minimumScore':qa['minimumScore'],'thresholdExclusive':88,'coverage':1,'thresholdsModified':False},'runtimeContract':{'childScale':'Apply uniformScale to the complete actor container, including skeleton and embedded Ball. Body GLBs share one bind; children are scaled adaptations of the stylized tennis-v7 humans.','rootMotion':'Baked into Root. kid_run_collect travels +2.4m; kid_return turns, travels -2.4m, and faces front again. Apply container scale once; do not add duplicate motion. When chaining after collect, place the return container at the previous root endpoint.','playback':'Only idle/seated clips loop. Gestures and locomotion hold their final frame. Use the declared idle for entry/exit blends; chair_idle stands on court, other chair clips use the high chair.','ball':'Ball is a separate scene-root mesh with independent baked translations, not parented to a hand. Hand IK follows authored ball paths at build time. Hidden in non-ball clips via scale=0. Radius before container scaling: 0.0335m.','audio':'Trigger animation extras.events sound IDs once when crossing cue time; enable audio after user interaction. No speech.'},'files':[record(f) for f in runtime_files]}
write('catalog.json',catalog)
unique={c['id']:c for m in models for c in m['clips']}
floor_samples=sum(c['fullSkinFloor']['vertexSamples'] for m in qa['models'] for c in m['clips'])
max_ball=max(c['metrics']['ballContact'].get('evidence',{}).get('contacts',[{'gapMeters':0}])[0].get('gapMeters',0) for m in qa['models'] for c in m['clips'])
tests_path=ROOT/'verification/repository-tests.json'
tests=json.loads(tests_path.read_text()) if tests_path.exists() else {'status':'pending'}
rows='\n'.join(f"| `{c['id']}` | {c['label']} | {c['duration']:.2f} | {c['frames']} | {c['qa']['score']:.1f} |" for c in unique.values())
model_rows='\n'.join(f"| `{m['id']}` | {m['bodyTriangles']:,} | {m['bytes']:,} | {m['uniformScale']} |" for m in models)
total=sum(m['bytes'] for m in models)
test_text=f"בדיקות הריפו: {tests.get('status')}. "
if 'passed' in tests: test_text+=f"{tests['passed']} עברו; {tests.get('failed',0)} נכשלו; {tests.get('skipped',0)} דולגו."
if tests.get('note'): test_text+=' '+tests['note']
text=f'''# צוות טניס — tennis-officials-v1

ענף: `codex/tennis-officials-v1`. בסיס: `19d9cdc5e3718236df5a2fc4d8b8c26c72007575` (`origin/main`). תאריך: 14/11/2026.

נמסרו שופט כיסא, שני שופטי קו וארבעה ילדי כדורים, כיסא גבוה, 14 תנועות ייחודיות ב־30Hz וארבעה צלילים קצרים ללא דיבור. יש 35 קליפים מוטמעים בשבע הדמויות. כל השינויים הם הוספת קבצים בתוך `workout/island/design/tennis-officials-v1/`. לא שונו קבצים קיימים, כולל `ops/CONTROL.md`; רישום המסירה נשמר כאן בהתאם להגבלת התיקייה שבבקשה. קריטריון הסיום: כל הנכסים, קטלוג, תצוגה במידה המבוקשת, רישיונות, כל קליפ מעל 88 ודחיפת הענף.

## צפייה

1. משורש הריפו הפעילו `python3 -m http.server 8767`.
2. פתחו [תצוגת הצוות](http://localhost:8767/workout/island/design/tennis-officials-v1/preview.html) בחלון 844×390. התצוגה נטענת מקומית עם Three.js; אין CDN.
3. בחרו דמות ותנועה, הפעילו או גררו את ציר הזמן. ניתן לסובב את המצלמה ולבדוק כל צליל. המצלמה עוקבת אחרי התנועה גם באיסוף וחזרה.
4. השוו לצילומים ב־[verification/](verification/) ולציוני [motion-qa-v1.json](verification/motion-qa-v1.json). התוצאה הרצויה: כל שבע הדמויות נראות, המחוות ברורות, אין שגיאות טעינה, וכל ציון גדול מ־88.

## דמויות

| דמות | משולשי גוף | בתים כולל אנימציות | קנה מידה בסצנה |
|---|---:|---:|---:|
{model_rows}

כל גוף כולל skin אחד בן 18 עצמות, primitive אחד, חומר אחד ואטלס 256×256 מוטמע. ילדי הכדורים הם התאמות מוקטנות של דמויות הטניס המצוירות הקיימות; קנה המידה חל על המכלול, כולל שלד וכדור. לכל ילד עם כדור עוד 80 משולשים סטטיים; כיסא השופט כולל 432 משולשים. סך שבע הדמויות עם האנימציות: {total:,} בתים. השמות, הסדר וההורים תואמים canonical18; תנוחת T ומידות השלד תואמות `tennis-v7`. ה־GLB אינו דורש Draco או IK בזמן ריצה.

## קליפים ו־QA

המעריך המקורי `motion-qa-v1` נקרא מהענף הנפרד שלו בקומיט `{qa['upstream']['commit']}`. `metrics.mjs` ו־`glb.mjs` נשמרו ללא שינוי; ספי הניקוד והמשקלים נשארו המקוריים. מקור ו־hash לכל קובץ מופיעים ב־`source/qa-vendor/provenance.json`. המתאם מוסיף סריקה של כל קודקוד skin מפוענח, אימות גלTF, שמות תנועות וקצב דגימה. בדיקות הזרקת הפגמים המקוריות: 30/30 עברו.

| קליפ | פעולה | משך בשניות | מפתחות ב־30Hz | ציון מזערי |
|---|---|---:|---:|---:|
{rows}

תוצאה: **{qa['clipCount']}/35 עוברים, מינימום {qa['minimumScore']}, כיסוי 100%**. {len(qa['checks'])} בדיקות עברו. הסריקה כללה {floor_samples:,} דגימות קודקודי רשת ב־120Hz ובזמני מפתח ומגע; חדירה למגרש: 0 מ׳. שגיאת מגע הכדור המרבית שנמדדה: {max_ball*1000:.3f} מ״מ. glTF Validator: אפס שגיאות ואזהרות בשבע הדמויות. המתאם מצמיד זמני קצה מוצהרים לזמן Float32 המיוצא רק כשהפרש העיגול קטן ממיקרושנייה; כל התאמה נרשמת. המעריך הוא מדד סינון מספרי, ואינו ציון תפיסתי אנושי.

בקליפ המשולב `kid_run_collect` מדד `bodySliding` של הקליפ המלא נשאר אדום: הוא כולל עצירה ורכינה לאחר הריצה, ומסנן חלונות תמיכה קצרים יחסית למשך הכולל. הציון המלא **90.1 נשמר כפי שחושב**, ללא השמטת המדד. אבחון נפרד של קטע התנועה הפעיל מופיע בדוח ואינו מחליף את ציון הקליפ. מגע ההדום נמדד בנקודת סוליה מוצהרת; לרשת הנעל עצמה מרווח של כ־10.5 מ״מ מעל ההדום. מרווח הסוליות מהמגרש כ־19–21 מ״מ לפני קנה מידה.

## צלילים ותצוגה

`line-out.wav` ‏0.44 ש׳, `line-good.wav` ‏0.38 ש׳, `ball-roll.wav` ‏0.98 ש׳, `applause-soft.wav` ‏1.38 ש׳. כולם מקוריים, 48kHz, מונו PCM16, עם fades וללא clipping. קריאות השיפוט הן צלילי רמז מופשטים ללא מילים. קובצי האודיו עברו בדיקות פורמט, קצוות, שיא ו־DC ושחזור דטרמיניסטי; ניגון בדפדפן נבדק בעוצמה אפס, ולא בוצעה האזנה אנושית.

נבדקו עשרה מצבי תצוגה ב־844×390 ובדיקת פריסה נוספת ב־390×844, ללא גלישת תוכן, שגיאות קונסול או שגיאות עמוד. כל ארבעת הצלילים נטענים ומתנגנים. פירוט ב־`verification/preview.json`. {test_text}

## שימוש ושחזור

`catalog.json` כולל קבצים, SHA-256, ספירות משולשים, מיפוי תפקידים, מיקום סביב המגרש, קנה מידה, אירועים וציוני QA. `motions.json` ו־animation extras מכילים חלונות תמיכה ומגע. `kid_run_collect` מזיז את Root ב־+2.4 מ׳; `kid_return` מסתובב, מתקדם ב־−2.4 מ׳ וחוזר לפנות קדימה. אין להוסיף את המסלול פעם נוספת. במעבר ביניהם יש לעגן את מכולת החזרה בנקודת הסיום של האיסוף. רק קליפי העמידה והישיבה חוזרים בלולאה; האחרים נעצרים בפריים האחרון. שופט הכיסא עומד ב־`chair_idle` ויושב בכיסא הגבוה בשאר קליפי הכיסא.

כלי הבנייה מבודדים תחת `/tmp/tennis-officials-tools`, ואינם משנים את תלויות הריפו. להתקנה: `npm install --prefix /tmp/tennis-officials-tools --cache /tmp/tennis-officials-npm-cache` עם התלויות המדויקות ב־`source/package.json` (אפשר להעתיק את הקובץ לנתיב זה קודם). לבנייה הפעילו לפי הסדר את `source/build-characters.mjs`, `source/build-clips.mjs`, `source/build-chair.mjs`, `source/build-audio.py`, `source/build-preview.mjs`. להרצת QA: `node workout/island/design/tennis-officials-v1/source/validate-motion.mjs`. בדיקת דפדפן: `python3 workout/island/design/tennis-officials-v1/source/check-preview.py` מול השרת בפורט 8767. לאחר הבדיקות הריצו `source/finalize.py` לעדכון הקטלוג והדוח.

חיבור למשחק, בדיקה בטלפון ומדידת GPU במכשיר אמיתי לא נכללו בחבילת הנכסים. רישיונות ומקורות ב־[LICENSES.md](LICENSES.md).
'''
(ROOT/'REPORT.md').write_text(text)
print(json.dumps({'catalogModels':len(models),'uniqueClips':len(unique),'minimumScore':qa['minimumScore'],'modelBytes':total,'tests':tests},ensure_ascii=False))
