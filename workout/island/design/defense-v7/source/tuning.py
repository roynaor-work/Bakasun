"""Controlled playback A/B probes. Some diagnostic variants hide scene elements.

Only measured variants that preserve the required appearance may be shipped.
"""
from pathlib import Path
from datetime import datetime,timezone
import json,time,hashlib,statistics,argparse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--cpu',type=int,choices=[1,4],default=1);parser.add_argument('--variants',default='baseline,analytic-water,no-point-lights,no-css-blur,lights-and-blur,half-dpr,no-contact-map,no-water');parser.add_argument('--output',default='tuning.json');args=parser.parse_args()
LOCK=Path('/tmp/defense-v7-profile.lock');LOCK.touch()
report={'generatedUTC':datetime.now(timezone.utc).isoformat(),'offlineSHA256':hashlib.sha256((ROOT/'offline.html').read_bytes()).hexdigest(),'cpuThrottle':args.cpu,'environment':'Isolated Chromium SwiftShader, portrait 390×844, mobile DPR3, fixed low geometry/matte/contact. Three-second warmup then six seconds playback per variant. Diagnostic variants are not all suitable for delivery.','rows':[],'errors':[]}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True,offline=True)
  page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.set_content((ROOT/'offline.html').read_text(),wait_until='load')
  deadline=time.monotonic()+90
  while not page.evaluate('Boolean(window.defense?.state.ready)'):
   if time.monotonic()>deadline:raise TimeoutError('Startup')
   page.wait_for_timeout(100)
  context.new_cdp_session(page).send('Emulation.setCPUThrottlingRate',{'rate':args.cpu})
  page.evaluate('''()=>{const d=window.defense;d.configure({scene:'farm',selected:null,close:true,night:true,quality:'low',shadowMode:'contact',playing:true,yaw:0,zoom:1});d.setMaterialMode('matte');window.probe={water:d.scene.children[1].children.find(o=>o.isMesh&&o.material?.isShaderMaterial),lights:d.scene.children[1].children.filter(o=>o.isPointLight),contact:d.scene.getObjectByName('Baked contact shadows'),crowd:d.scene.getObjectByName('crowd'),css:document.createElement('style')};probe.lightVisibility=probe.lights.map(o=>o.visible);probe.originalShader=probe.water.material.fragmentShader;document.head.append(probe.css);}''')
  variants=args.variants.split(',')
  for variant in variants:
   page.evaluate('''v=>{const d=window.defense,p=window.probe;d.renderer.setPixelRatio(v==='half-dpr'?.5:.75);const rect=document.getElementById('stage').getBoundingClientRect();d.renderer.setSize(rect.width,rect.height,false);p.water.visible=v!=='no-water';p.contact.visible=v!=='no-contact-map';p.lights.forEach((o,i)=>o.visible=!['no-point-lights','lights-and-blur'].includes(v)&&p.lightVisibility[i]);p.css.textContent=['no-css-blur','lights-and-blur'].includes(v)?'*{backdrop-filter:none!important}':'';
    p.water.material.fragmentShader=v==='analytic-water'?p.originalShader.replace('float highlight=texture2D(waves,phase).r;','float rip=sin(p.x*2.7+p.z*1.4+time*.7)*cos(p.z*3.2-time*.6);float highlight=smoothstep(.87,1.,rip);'):p.originalShader;p.water.material.needsUpdate=true;d.state.samples=[];}''',variant)
   page.wait_for_timeout(3000);page.evaluate('window.defense.state.samples=[]');page.wait_for_timeout(6000)
   snap=page.evaluate('window.defense.snapshot()');samples=snap.pop('samples');ordered=sorted(samples)
   row={'variant':variant,**snap,'meanFPS':1000/statistics.mean(samples),'p50MS':statistics.median(samples),'p95MS':ordered[int((len(ordered)-1)*.95)],'rawFrameMS':samples};report['rows'].append(row)
   print(json.dumps({k:row[k] for k in ['variant','meanFPS','p50MS','p95MS','dpr','triangles','calls']}),flush=True)
  context.close();browser.close()
finally:
 LOCK.unlink(missing_ok=True)
 (ROOT/'verification'/Path(args.output).name).write_text(json.dumps(report,indent=2))
