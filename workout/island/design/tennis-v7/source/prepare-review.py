"""Make local before/after browsing and a complete byte inventory for review."""
import json,hashlib
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
iterations=sorted(p.name for p in (ROOT/'iterations').iterdir() if p.is_dir() and (p/'390x844-far.png').exists())
template='''<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>טניס — סבבי ביקורת</title><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#eeeade;color:#254438;font:14px Arial,sans-serif}main{max-width:1120px;margin:auto}h1{font:32px Georgia,serif;margin:6px 0 12px}p{line-height:1.7;color:#61715a}nav,form{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:18px 0}a{color:#315c48}button,select{font:inherit;min-height:44px;border:1px solid #b8c5ae;border-radius:3px;padding:0 12px;background:#f9f5e8;color:#254438}label{display:flex;align-items:center;gap:8px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.card{margin:0;background:#f9f5e8;padding:12px;border:1px solid #cbd2bd}figcaption{padding:5px 0 12px;display:flex;justify-content:space-between;gap:12px}img{display:block;max-width:100%;max-height:78vh;width:auto;margin:auto}.links{font-size:12px;line-height:2}.all{display:flex;flex-wrap:wrap;gap:8px;padding:16px 0}.all a{padding:8px;background:#dde4cf}@media(max-width:650px){body{padding:14px}.pair{grid-template-columns:1fr}img{max-height:none;width:100%}}
</style><main><p>TENNIS V7 / DESIGN REVIEW</p><h1>בונים. בודקים. מתקנים.</h1><p>צילומי Chromium אמיתיים במידות המבוקשות, לצד ביקורת לכל סבב. התצוגה המקומית ניתנת לפתיחה בקובץ יחיד. מדידות תוכנה ומגבלת אימות טלפון מפורטות בדוח.</p><nav><a href="standalone.html">תצוגה תלת־ממדית</a><a href="REPORT.md">דוח וציונים</a><a href="WEIGHTS.md">משקלים</a><a href="REFERENCE.md">רפרנס ורשימת בדיקה</a></nav><form><label>סבב <select id="iteration"></select></label><label>מסך <select id="size"><option value="390x844">390×844</option><option value="844x390">844×390</option></select></label><label>מבט <select id="view"><option value="far">רחוק</option><option value="close">קרוב</option></select></label></form><div class="pair"><figure class="card"><figcaption><span>סבב 01</span><a href="iterations/01/CRITIQUE.md">ביקורת</a></figcaption><img id="first" alt="צילום הסבב הראשון"></figure><figure class="card"><figcaption><span id="caption"></span><a id="critique">ביקורת</a></figcaption><img id="chosen" alt="צילום הסבב שנבחר"></figure></div><div class="all" id="all"></div><p class="links">השוואה זו משתמשת בקובצי PNG המקומיים. כל תמונה נשמרה גם בתיקיית הסבב במידות המקוריות. נתוני ההגדרות וה־hashes ב־capture.json.</p></main><script>
const rounds=__ITERATIONS__,iter=document.getElementById('iteration'),size=document.getElementById('size'),view=document.getElementById('view');
for(const n of rounds){const o=document.createElement('option');o.value=n;o.textContent=n;iter.append(o);const a=document.createElement('a');a.href='iterations/'+n+'/CRITIQUE.md';a.textContent='ביקורת '+n;document.getElementById('all').append(a);}iter.value=rounds.at(-1);
function render(){const file=size.value+'-'+view.value+'.png';document.getElementById('first').src='iterations/01/'+file;document.getElementById('chosen').src='iterations/'+iter.value+'/'+file;document.getElementById('caption').textContent='סבב '+iter.value;document.getElementById('critique').href='iterations/'+iter.value+'/CRITIQUE.md';}for(const el of [iter,size,view])el.addEventListener('change',render);render();
</script></html>'''
(ROOT/'review.html').write_text(template.replace('__ITERATIONS__',json.dumps(iterations)))
assets=json.loads((ROOT/'verification/assets.json').read_text())
rows=['# משקלי מסירה','', '| קובץ | bytes | MB | משולשים בכל ה־LOD | טקסטורות |','|---|---:|---:|---:|---|']
for a in assets['assets']:
 images=', '.join(str(i['width'])+'×'+str(i['height']) for i in a['images']) or 'ללא תמונות'
 rows.append(f"| [{Path(a['file']).name}]({a['file']}) | {a['bytes']:,} | {a['MB']:.6f} | {a['triangles']:,} | {images} |")
rows+=['',f"סך GLB: {assets['totalGLBBytes']:,} bytes. ספירת משולשי הקובץ כוללת רמות פירוט חלופיות; רק רמה אחת מוצגת בכל רגע. פירוט הרמות הפעילות ב־REPORT.md.",'', '| קובץ תצוגה | bytes | MB |','|---|---:|---:|']
for name in ['standalone.html','phone-check.html','vendor/three-r160-loaders.js','vendor/draco-source.js']:
 b=(ROOT/name).stat().st_size;rows.append(f'| [{name}]({name}) | {b:,} | {b/1e6:.6f} |')
rows+=['','ה־HTML העצמאי כולל עותקי base64 של כל הנכסים, המנוע והמפענח. בטעינת משחק משתמשים בקובצי GLB הנבחרים; עותקי התצוגה אינם טעינה נוספת שנדרשת למשחק.']
(ROOT/'WEIGHTS.md').write_text('\n'.join(rows)+'\n')
inventory=[]
for p in sorted(ROOT.rglob('*')):
 if not p.is_file() or p.name=='FILE-SIZES.json':continue
 b=p.read_bytes();inventory.append({'file':str(p.relative_to(ROOT)),'bytes':len(b),'MB':len(b)/1e6,'sha256':hashlib.sha256(b).hexdigest()})
(ROOT/'FILE-SIZES.json').write_text(json.dumps({'generated':datetime.now(timezone.utc).isoformat(),'totalBytes':sum(a['bytes'] for a in inventory),'files':inventory},indent=2)+'\n')
print('Review index:',len(iterations),'rounds. Largest files:')
for a in sorted(inventory,key=lambda a:a['bytes'],reverse=True)[:5]:print(a['file'],a['bytes'])
