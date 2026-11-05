"""Exercise every delivered low-detail skin through all nine actual GLB clips."""
import json,math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];records=[];errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':844,'height':390});page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8765/preview.html?time=0',wait_until='load');page.wait_for_function('window.tennis&&tennis.ready',timeout=120000)
 for motion in ['idle','run','serve','forehand','backhand','volley','smash','slide','celebrate']:
  page.evaluate('(m)=>tennis.setState({view:"roster",focus:"body",motion:m,quality:"economy",autoQuality:false,playing:false})',motion)
  duration=page.evaluate('tennis.config.motions.clips.find(c=>c.id===tennis.diagnostics().state.motion).duration')
  for u in [0,.25,.50,.75,.995]:
   page.evaluate('(t)=>tennis.seek(t)',u*duration)
   data=page.evaluate('''()=>{const V=TennisEngine.THREE.Vector3,p=new V();return tennis.actors.map(a=>{let min=Infinity,max=-Infinity,finite=true,n=0;a.group.updateMatrixWorld(true);for(const o of [a.lod2,a.racket1]){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,p);p.applyMatrix4(o.matrixWorld);min=Math.min(min,p.y);max=Math.max(max,p.y);finite=finite&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);n++;}}return {id:a.id,lod2Visible:a.lod2.visible,highHidden:!a.lod0.visible&&!a.lod1.visible,bones:a.lod2.skeleton.bones.length,minY:min,maxY:max,finite,vertices:n};});}''')
   records.append({'motion':motion,'u':u,'actors':data,'render':page.evaluate('tennis.diagnostics().render')})
  print(motion,'low LOD posed',flush=True)
 browser.close()
passed=not errors and all(a['lod2Visible'] and a['highHidden'] and a['bones']==18 and a['finite'] and a['minY']>=-.01 for r in records for a in r['actors'])
(ROOT/'verification/low-lod.json').write_text(json.dumps({'pass':passed,'poses':len(records)*4,'consoleErrors':errors,'records':records},indent=2)+'\n')
print('Low LOD:',len(records)*4,'poses, pass=',passed,flush=True)
if not passed:raise SystemExit(1)
