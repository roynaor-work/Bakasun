"""Isolated sustained software-GPU measurement, explicitly not a phone result.

Run after other render jobs finish. Matrix: two viewports, three camera modes,
two lights, two quality tiers, plus two automatic-quality cases. Each records
actual presented frames, simulated time, passes and JavaScript heap metrics.
"""
import json,os,argparse,time,hashlib
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification'
p=argparse.ArgumentParser();p.add_argument('--seconds',type=float,default=60);p.add_argument('--variant',default='reference');args=p.parse_args()
records=[];errors=[];requests=[];started=datetime.now(timezone.utc).isoformat()
hashes={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['preview.js','manifest.json','standalone.html']}
def save():
 (OUT/'performance.json').write_text(json.dumps({'started':started,'updated':datetime.now(timezone.utc).isoformat(),'variant':args.variant,'sourceHashesAtLoad':hashes,'environment':'Chromium headless, ANGLE SwiftShader software GPU, not a physical phone','cpuAffinityCount':len(os.sched_getaffinity(0)),'deviceScaleFactor':2,'secondsPerCase':args.seconds,'targetFPS':30,'consoleErrors':errors,'externalRequests':requests,'cases':records},indent=2,ensure_ascii=False)+'\n')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
 def route(r):
  if r.request.url.startswith(('http://','https://')) and not r.request.url.startswith('http://127.0.0.1:8765/'):requests.append(r.request.url);r.abort()
  else:r.continue_()
 context.route('**/*',route)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8765/preview.html?time=0',wait_until='load');page.wait_for_function('window.tennis&&tennis.ready',timeout=120000)
 cdp=context.new_cdp_session(page);cdp.send('Performance.enable')
 for w,h in [(390,844),(844,390)]:
  page.set_viewport_size({'width':w,'height':h})
  for view in ['wide','close','line']:
   for lighting in ['day','evening']:
    for quality in ['balanced','economy']:
     settings={'view':view,'focus':'body','actor':0,'motion':'serve','light':lighting,'surface':'hard','quality':quality,'autoQuality':False,'playing':True}
     page.evaluate('(s)=>tennis.setState(s)',settings);page.wait_for_timeout(1500)
     measurement=page.evaluate('(s)=>tennis.measure(s)',args.seconds)
     metrics={m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics'] if m['name'] in ['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents']}
     records.append({'viewport':{'width':w,'height':h},'settings':settings,'measurement':measurement,'heapAndDOM':metrics});save()
     print(w,view,lighting,quality,round(measurement['fps'],2),'fps',measurement['diagnostics']['render'],flush=True)
  settings={'view':'wide','focus':'body','actor':0,'motion':'serve','light':'evening','quality':'balanced','autoQuality':True,'playing':True}
  page.evaluate('(s)=>tennis.setState(s)',settings)
  measurement=page.evaluate('(s)=>tennis.measure(s)',args.seconds)
  records.append({'viewport':{'width':w,'height':h},'settings':settings,'measurement':measurement,'automaticQualityCase':True});save()
  print(w,'automatic',round(measurement['fps'],2),'fps','final quality',measurement['diagnostics']['state']['quality'],'DPR',measurement['diagnostics']['pixelRatio'],flush=True)
 browser.close()
save()
data=json.loads((OUT/'performance.json').read_text());data['completed']=True;(OUT/'performance.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
print('Completed',len(records),'sustained cases',flush=True)
