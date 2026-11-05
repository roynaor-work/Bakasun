"""Isolated software-browser frame pacing at mobile CSS sizes and DPR 3.

The soak yields when /tmp/defense-v7-profile.lock exists. Pause CPU studio work
before running this. No physical-phone result is inferred from CPU throttling.
"""
import json,time,hashlib,statistics
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
LOCK=Path('/tmp/defense-v7-profile.lock');LOCK.touch()
report={'startedUTC':datetime.now(timezone.utc).isoformat(),'offlineSHA256':hashlib.sha256((ROOT/'offline.html').read_bytes()).hexdigest(),
 'environment':'Chromium / ANGLE SwiftShader software GPU; mobile emulation DPR 3; CPU 1× and 4×. Other task renderers paused. Not a physical phone.','scenarios':[],'errors':[]}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True,offline=True)
  page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.set_content((ROOT/'offline.html').read_text(),wait_until='load')
  deadline=time.monotonic()+90
  while not page.evaluate('Boolean(window.defense?.state.ready)'):
   if time.monotonic()>deadline:raise TimeoutError('Viewer startup')
   page.wait_for_timeout(100)
  cdp=context.new_cdp_session(page)
  for rate in [1,4]:
   cdp.send('Emulation.setCPUThrottlingRate',{'rate':rate})
   for width,height in [(390,844),(844,390)]:
    page.set_viewport_size({'width':width,'height':height})
    for scene,night in [('space',False),('farm',True)]:
     page.evaluate('(o)=>window.defense.configure(o)',{'scene':scene,'selected':None,'night':night,'close':True,'quality':'auto','playing':True,'yaw':0,'zoom':1})
     page.wait_for_timeout(10000)
     page.evaluate('window.defense.state.samples=[]')
     page.wait_for_timeout(6500)
     snap=page.evaluate('window.defense.snapshot()');samples=snap.pop('samples');ordered=sorted(samples);mean=statistics.mean(samples)
     row={'cpuThrottle':rate,'viewport':[width,height],**snap,'frames':len(samples),'meanMS':mean,'meanFPS':1000/mean,'p50MS':statistics.median(samples),'p95MS':ordered[int((len(ordered)-1)*.95)],'over50MS':sum(s>50 for s in samples),'rawFrameMS':samples}
     report['scenarios'].append(row)
     print(json.dumps({k:row[k] for k in ['cpuThrottle','viewport','scene','meanFPS','p50MS','p95MS','dpr','triangles','calls']}),flush=True)
  context.close();browser.close()
finally:
 LOCK.unlink(missing_ok=True)
 report['finishedUTC']=datetime.now(timezone.utc).isoformat()
 (ROOT/'verification/performance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
