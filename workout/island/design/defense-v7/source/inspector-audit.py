"""Check GPU ownership when repeatedly replacing an inspected skinned character."""
from pathlib import Path
from datetime import datetime,timezone
import json,time,argparse,hashlib
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--label',default='after');args=parser.parse_args()
rows=[];errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':390,'height':844},offline=True);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'offline.html').read_text(),wait_until='load')
 deadline=time.monotonic()+90
 while not page.evaluate('Boolean(window.defense?.state.ready)'):
  if time.monotonic()>deadline:raise TimeoutError('Viewer')
  page.wait_for_timeout(100)
 page.evaluate('window.defense.configure({scene:"farm",playing:false,quality:"high"});window.defense.renderFrame()')
 for i in range(24):
  asset=['guard-ranger','guard-lookout','guard-keeper'][i%3]
  page.evaluate('async(id)=>{await window.defense.inspect(id);window.defense.renderFrame();}',asset)
  snap=page.evaluate('window.defense.snapshot()');rows.append({'i':i,'asset':asset,'geometries':snap['geometries'],'textures':snap['textures']})
 context.close();browser.close()
span=max(r['textures'] for r in rows[3:])-min(r['textures'] for r in rows[3:])
result={'generatedUTC':datetime.now(timezone.utc).isoformat(),'offlineSHA256':hashlib.sha256((ROOT/'offline.html').read_bytes()).hexdigest(),'rows':rows,'textureRangeAfterWarmup':span,'errors':errors,'pass':span<=1 and not errors}
(ROOT/'verification'/('inspector-'+args.label+'.json')).write_text(json.dumps(result,indent=2));print(json.dumps(result))
if args.label!='before' and not result['pass']:raise SystemExit(1)
