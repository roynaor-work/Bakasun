"""Additional real GLB viewpoints; does not construct substitute art."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
rows=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'])
    page=b.new_page(viewport={'width':844,'height':390},device_scale_factor=2)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8765/workout/island/design/alien-bosses-v1/preview.html');page.locator('#loading').wait_for(state='hidden');page.wait_for_function('()=>window.bossPreview?.snapshot().bosses.every(b=>b.status==="active")')
    page.locator('#pause').click()
    for label,angle in [('front',0),('quarter',.6),('rear',3.141592653589793),('side',1.5707963267948966)]:
        page.evaluate('(angle)=>{for(const b of bossPreview.bosses)b.group.rotation.y=angle;}',angle)
        page.wait_for_timeout(120)
        result=page.evaluate('''async()=>{
            const T=await import('./vendor/three.module.js');bossPreview.scene.updateMatrixWorld();
            return bossPreview.bosses.map(b=>{
              // Project actual deformed vertices, not impossible AABB corners.
              const points=[];
              b.model.traverse(o=>{
                if(!o.isMesh)return;let ancestor=o;while(ancestor){if(!ancestor.visible)return;ancestor=ancestor.parent;}
                const a=o.geometry.attributes.position,morphs=o.geometry.morphAttributes.position||[];
                for(let i=0;i<a.count;i++){
                  const v=new T.Vector3().fromBufferAttribute(a,i);
                  for(let j=0;j<morphs.length;j++)if(o.morphTargetInfluences[j])v.addScaledVector(new T.Vector3().fromBufferAttribute(morphs[j],i),o.morphTargetInfluences[j]);
                  v.applyMatrix4(o.matrixWorld).project(bossPreview.camera);points.push([v.x,v.y]);
                }
              });
              return {id:b.spec.id,inFrame:points.every(([x,y])=>Math.abs(x)<=1&&Math.abs(y)<=1),min:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],max:[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};
            });
        }''')
        assert all(x['inFrame'] for x in result),(label,result)
        file=f'models-{label}-844x390.png';page.screenshot(path=str(ROOT/'verification'/file));rows.append({'view':label,'image':file,'models':result})
    assert not errors,errors
    b.close()
(ROOT/'verification'/'model-views.json').write_text(json.dumps({'views':rows,'errors':errors},indent=2)+'\n')
print('Four real GLB viewpoints and 12 framing checks passed.')
