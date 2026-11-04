"""Compare optimized visible-tree updates with Three's complete scene update.

At a fixed pose the canvas must be pixel-identical. This independently catches
matrix/bind mistakes introduced by skipping hidden LOD trees.
"""
from pathlib import Path
from datetime import datetime,timezone
import json,time,hashlib
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
rows=[];errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,offline=True)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'offline.html').read_text(),wait_until='load')
 deadline=time.monotonic()+90
 while not page.evaluate('Boolean(window.defense?.state.ready)'):
  if time.monotonic()>deadline:raise TimeoutError('Viewer')
  page.wait_for_timeout(100)
 compare='''()=>{const d=window.defense;d.renderFrame();const gl=d.renderer.getContext(),c=d.renderer.domElement,w=c.width,h=c.height;
  const a=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
  d.scene.matrixWorldAutoUpdate=true;d.scene.updateMatrixWorld(true);d.renderer.render(d.scene,d.camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);d.scene.matrixWorldAutoUpdate=false;
  let changed=0,max=0,sum=0;for(let i=0;i<a.length;i++){const e=Math.abs(a[i]-b[i]);if(e)changed++;max=Math.max(max,e);sum+=e*e;}
  return {width:w,height:h,changedChannels:changed,maxChannelError:max,rms:Math.sqrt(sum/a.length),pass:changed===0};}'''
 for width,height in [(390,844),(844,390)]:
  page.set_viewport_size({'width':width,'height':height})
  for scene in ['space','farm']:
   for close in [False,True]:
    page.evaluate('(o)=>window.defense.configure(o)',{'scene':scene,'selected':None,'playing':False,'quality':'high','close':close,'night':False,'time':.42})
    rows.append({'scene':scene,'close':close,'viewport':[width,height],**page.evaluate(compare)})
  for asset in ['guard-ranger','guard-lookout','guard-keeper']:
   page.evaluate('(id)=>window.defense.inspect(id)',asset);page.evaluate('window.defense.configure({playing:false,time:.42,close:true})')
   rows.append({'asset':asset,'viewport':[width,height],**page.evaluate(compare)})
 context.close();browser.close()
result={'generatedUTC':datetime.now(timezone.utc).isoformat(),'offlineSHA256':hashlib.sha256((ROOT/'offline.html').read_bytes()).hexdigest(),'method':'Default framebuffer RGBA byte comparison, fixed pose, optimized visible update then original Three complete update.','rows':rows,'errors':errors,'pass':all(r['pass'] for r in rows) and not errors}
(ROOT/'verification/transforms.json').write_text(json.dumps(result,indent=2));print(json.dumps({'pass':result['pass'],'cases':len(rows),'failures':[r for r in rows if not r['pass']],'errors':errors}))
if not result['pass']:raise SystemExit(1)
