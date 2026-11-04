"""Render real local WebGL screenshots, preserving each review iteration.

No production tests are added or modified. This is a repeatable design capture
utility; every image is captured from Chromium at the requested CSS viewport.
"""
import json, sys, time, hashlib, argparse, tarfile
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--iteration',required=True);parser.add_argument('--extra',action='store_true');parser.add_argument('--file',action='store_true');parser.add_argument('--entry',default='preview.html');args=parser.parse_args()
out=ROOT/'iterations'/args.iteration;out.mkdir(parents=True,exist_ok=True)
fingerprints={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'preview.js',ROOT/'preview.css',ROOT/'manifest.json',ROOT/'source/motions.mjs']}
with tarfile.open(out/'source-snapshot.tar.gz','w:gz') as archive:
 for file in ['preview.html','preview.js','preview.css','icon.svg','presentation.json','rig.json','motions.json','manifest.json']:
  archive.add(ROOT/file,arcname=file)
 for file in (ROOT/'source').iterdir():
  if file.is_file():archive.add(file,arcname='source/'+file.name)
cases=[
 ('390x844-far',390,844,{'view':'wide','surface':'hard','light':'day','actor':0,'motion':'serve'},2.048),
 ('844x390-far',844,390,{'view':'wide','surface':'hard','light':'day','actor':0,'motion':'serve'},2.048),
 ('390x844-close',390,844,{'view':'close','surface':'hard','light':'day','actor':2,'motion':'forehand'},.624),
 ('844x390-close',844,390,{'view':'close','surface':'hard','light':'day','actor':0,'motion':'serve'},1.536),
 ('390x844-roster',390,844,{'view':'roster','surface':'grass','light':'day','actor':0,'motion':'idle'},.5),
 ('844x390-roster',844,390,{'view':'roster','surface':'hard','light':'day','actor':0,'motion':'idle'},.5),
 ('390x844-evening-clay',390,844,{'view':'wide','surface':'clay','light':'evening','actor':0,'motion':'slide'},.841),
 ('844x390-evening-clay',844,390,{'view':'wide','surface':'clay','light':'evening','actor':0,'motion':'slide'},.841),
 ('390x844-line',390,844,{'view':'line','surface':'grass','light':'day','actor':0,'motion':'serve'},3.17),
 ('844x390-net',844,390,{'view':'net','surface':'clay','light':'day','actor':0,'motion':'idle'},.5),
 ('390x844-face',390,844,{'view':'close','focus':'face','surface':'hard','light':'day','actor':2,'motion':'idle'},.5),
 ('844x390-grip',844,390,{'view':'close','focus':'grip','surface':'hard','light':'day','actor':0,'motion':'backhand'},.702),
 ('390x844-economy',390,844,{'view':'wide','focus':'body','surface':'hard','light':'day','actor':0,'motion':'serve','quality':'economy','autoQuality':False},2.048),
 ('844x390-economy',844,390,{'view':'wide','focus':'body','surface':'clay','light':'evening','actor':0,'motion':'slide','quality':'economy','autoQuality':False},.841),
]
records=[];console=[];external=[]
started=datetime.now(timezone.utc).isoformat()
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,has_touch=True)
 def block(route):
  if route.request.url.startswith(('http://','https://')) and not route.request.url.startswith('http://127.0.0.1:8765/'):external.append(route.request.url);route.abort()
  else:route.continue_()
 context.route('**/*',block)
 page=context.new_page()
 page.on('pageerror',lambda e:console.append(str(e)))
 page.on('console',lambda msg:console.append(msg.text) if msg.type=='error' else None)
 url=(ROOT/args.entry).as_uri() if args.file else 'http://127.0.0.1:8765/'+args.entry
 page.goto(url+'?time=1.536',wait_until='load')
 page.wait_for_function('window.tennis && window.tennis.ready',timeout=120000)
 page.wait_for_timeout(600)
 for name,w,h,settings,seconds in cases:
  page.set_viewport_size({'width':w,'height':h});page.evaluate('(s)=>window.tennis.setState({...s,playing:false})',settings)
  page.wait_for_timeout(180)
  diagnostics=page.evaluate('(t)=>window.tennis.seek(t)',seconds)
  page.wait_for_timeout(180)
  page.screenshot(path=str(out/(name+'.png')),animations='disabled')
  layout=page.evaluate('''()=>({overflow:document.documentElement.scrollWidth>innerWidth, stage:document.querySelector('.stage').getBoundingClientRect().toJSON(),dock:document.querySelector('.dock').getBoundingClientRect().toJSON(),controls:[...document.querySelectorAll('button,select,input')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))})''')
  records.append({'file':name+'.png','viewport':{'width':w,'height':h},'settings':settings,'seconds':seconds,'diagnostics':diagnostics,'layout':layout})
  print(name,diagnostics['render'],flush=True)
 browser.close()
(out/'capture.json').write_text(json.dumps({'started':started,'completed':datetime.now(timezone.utc).isoformat(),'transport':url,'externalRequestsBlocked':external,'consoleErrors':console,'sourceHashes':fingerprints,'captures':records},indent=2,ensure_ascii=False)+'\n')
print('saved',out,flush=True)
