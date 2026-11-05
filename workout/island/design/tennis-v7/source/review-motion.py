"""Sustained real-browser review of all four athletes and all nine motions.

Each case plays complete cycles in both orientations and both lighting setups.
Pose sheets preserve actual rendered frames; JSON preserves timing and floor
samples. Intermediates stay in /tmp, not the repository.
"""
import argparse,json,time,hashlib,io
from pathlib import Path
from datetime import datetime,timezone
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--iteration',required=True);p.add_argument('--cycles',type=int,default=3);p.add_argument('--actor-start',type=int,default=0);args=p.parse_args()
OUT=ROOT/'iterations'/args.iteration;OUT.mkdir(parents=True,exist_ok=True)
motions=json.loads((ROOT/'motions.json').read_text())['clips'];records=[];errors=[];external=[]
start=datetime.now(timezone.utc).isoformat();hashes={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['preview.js','preview.css','manifest.json']}
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
def save():
 (OUT/'motion-review.json').write_text(json.dumps({'started':start,'updated':datetime.now(timezone.utc).isoformat(),'cyclesPerCase':args.cycles,'sourceHashesAtLoad':hashes,'externalRequestsBlocked':external,'consoleErrors':errors,'cases':records},indent=2,ensure_ascii=False)+'\n')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1)
 def route(r):
  if r.request.url.startswith(('https://','http://')) and not r.request.url.startswith('http://127.0.0.1:8765/'):external.append(r.request.url);r.abort()
  else:r.continue_()
 context.route('**/*',route)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8765/preview.html?time=0',wait_until='load');page.wait_for_function('window.tennis && window.tennis.ready',timeout=120000)
 for actor in range(args.actor_start,4):
  sheet=Image.new('RGB',(5*156,9*232),(237,234,222));draw=ImageDraw.Draw(sheet)
  for row,motion in enumerate(motions):
   for portrait in [True,False]:
    size={'width':390,'height':844} if portrait else {'width':844,'height':390};page.set_viewport_size(size)
    for lighting in ['day','evening']:
     settings={'view':'close','focus':'body','actor':actor,'motion':motion['id'],'light':lighting,'surface':'clay' if motion['id']=='slide' else 'hard','playing':False,'quality':'balanced','autoQuality':False}
     page.evaluate('(s)=>window.tennis.setState(s)',settings)
     frame_records=[]
     for col,t in enumerate([0,.28,.48,.64,.86] if motion['id']=='serve' else [0,.25,.50,.75,.995]):
      page.evaluate('(t)=>window.tennis.seek(t)',t*motion['duration'])
      floor=page.evaluate('''()=>{let min=Infinity,vertices=0;const actor=tennis.actors[tennis.diagnostics().state.actor];actor.group.updateMatrixWorld(true);const p=new TennisEngine.THREE.Vector3();actor.group.traverse(o=>{if(o.isSkinnedMesh&&o.visible){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,p);p.applyMatrix4(o.matrixWorld);min=Math.min(min,p.y);vertices++;}}});return {minimumY:min,vertices};}''')
      frame_records.append({'normalizedTime':t,**floor})
      if portrait and lighting=='day':
       png=page.locator('.stage').screenshot();im=Image.open(io.BytesIO(png)).convert('RGB');im.thumbnail((154,208))
       x=col*156+(156-im.width)//2;y=row*232+21;sheet.paste(im,(x,y));draw.text((col*156+5,row*232+3),motion['id']+' '+str(round(t,2)),fill=(56,77,59),font=font)
     page.evaluate('(s)=>window.tennis.setState({...s,playing:true,time:0})',settings)
     measure=page.evaluate('(s)=>window.tennis.measure(s)',motion['duration']*args.cycles)
     record={'actor':actor,'motion':motion['id'],'viewport':size,'light':lighting,'samples':frame_records,'performance':measure}
     records.append(record);save()
     print(f"actor {actor} {motion['id']} {size['width']} {lighting}: {measure['fps']:.1f} fps; floor {min(f['minimumY'] for f in frame_records):.4f}",flush=True)
  sheet.save(OUT/f'actor-{actor+1:02d}-motion-sheet.webp',quality=91,method=6)
 browser.close()
save();print('Sustained motion review complete',len(records),'cases',flush=True)
