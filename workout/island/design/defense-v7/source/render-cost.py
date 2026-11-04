"""Rejected timing probe: WebGL submission excludes Chromium compositing.

gl.finish can return before the deferred compositor completes the frame. The
sub-millisecond numbers from this probe are not completed render costs or FPS.
Use performance.py or tuning.py for actual playback measurements.
"""
import json,time,hashlib
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
LOCK=Path('/tmp/defense-v7-profile.lock');LOCK.touch()
report={'generatedUTC':datetime.now(timezone.utc).isoformat(),
 'offlineSHA256':hashlib.sha256((ROOT/'offline.html').read_bytes()).hexdigest(),
 'method':'Rejected diagnostic: paused command submission and gl.finish return times, excluding Chromium deferred compositing. These values cannot establish completed render time or FPS.',
 'rows':[],'errors':[]}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,offline=True)
  page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.set_content((ROOT/'offline.html').read_text(),wait_until='load')
  deadline=time.monotonic()+90
  while not page.evaluate('Boolean(window.defense?.state.ready)'):
   if time.monotonic()>deadline:raise TimeoutError('Startup')
   page.wait_for_timeout(100)
  page.evaluate('window.defense.configure({playing:false,scene:"farm",selected:null,close:true,night:true,shadowMode:"contact",quality:"auto",time:2.7});window.defense.setMaterialMode("matte")')
  for variant in ['baseline','half-dpr','no-water','no-clouds','no-crowd','no-lights','no-css-blur']:
   row=page.evaluate('''variant=>{
    const d=window.defense,r=d.renderer,gl=r.getContext(),farm=d.scene.children[1];
    const water=farm.children.find(o=>o.isMesh&&o.material?.isShaderMaterial),clouds=farm.children.filter(o=>o.isLOD&&o.levels[0]?.object?.children.some(m=>m.userData.assetId==='island-cloud')),crowd=farm.getObjectByName('crowd'),lights=farm.children.filter(o=>o.isPointLight);
    r.setPixelRatio(variant==='half-dpr'?.5:.75);const rect=document.getElementById('stage').getBoundingClientRect();r.setSize(rect.width,rect.height,false);
    if(variant==='no-water')water.visible=false;
    if(variant==='no-clouds')clouds.forEach(o=>o.visible=false);
    if(variant==='no-crowd')crowd.visible=false;
    const powers=lights.map(o=>o.intensity);if(variant==='no-lights')lights.forEach(o=>o.intensity=0);
    const style=document.createElement('style');if(variant==='no-css-blur'){style.textContent='*{backdrop-filter:none!important}';document.head.append(style);}
    const native=r.render.bind(r),samples=[];let submission=0,gpu=0;
    r.render=(s,c)=>{const a=performance.now();native(s,c);const b=performance.now();gl.finish();const z=performance.now();submission=b-a;gpu=z-b;};
    for(let i=0;i<24;i++){gl.finish();const a=performance.now();d.renderFrame();const b=performance.now();if(i>=4)samples.push({totalMS:b-a,submissionMS:submission,gpuWaitMS:gpu});}
    r.render=native;water.visible=true;clouds.forEach(o=>o.visible=true);crowd.visible=true;lights.forEach((o,i)=>o.intensity=powers[i]);style.remove();
    return {variant,samples,triangles:r.info.render.triangles,calls:r.info.render.calls};
   }''',variant)
   for field in ['totalMS','submissionMS','gpuWaitMS']:row['mean'+field[0].upper()+field[1:]]=sum(v[field] for v in row['samples'])/len(row['samples'])
   report['rows'].append(row);print(json.dumps({k:v for k,v in row.items() if k!='samples'}),flush=True)
  context.close();browser.close()
finally:
 LOCK.unlink(missing_ok=True)
 (ROOT/'verification/render-cost.json').write_text(json.dumps(report,indent=2))
