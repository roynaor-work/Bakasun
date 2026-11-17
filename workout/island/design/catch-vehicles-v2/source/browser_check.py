#!/usr/bin/env python3
"""Exercise the delivered bytes in Chromium, including all native glTF clips.
Run against an HTTP server, e.g. --url http://127.0.0.1:8765/workout/island/design/catch-vehicles-v2/
Requires the Python Playwright package and an installed Chromium browser.
"""
import argparse
import json
from pathlib import Path
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:8765/workout/island/design/catch-vehicles-v2/')
parser.add_argument('--chromium',default='/usr/bin/chromium')
args = parser.parse_args()
errors, failures, external = [], [], []
cases, rigs, effects, native = [], [], [], []
checks = 0


def check(condition, message):
    global checks
    checks += 1
    if not condition:
        failures.append(message)


PROJECT = """() => {
 const app=catchVehicles,v=app.vehicle,c=app.camera;
 v.root.updateMatrixWorld(true);c.updateMatrixWorld(true);
 const p=app.orbit.target.clone();
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,vertices=0;
 v.scenes.get(v.inspect().state).scene.traverseVisible(o=>{
  if(!o.isMesh)return;
  for(let i=0;i<o.geometry.attributes.position.count;i++){
   o.getVertexPosition(i,p);p.applyMatrix4(o.matrixWorld).project(c);
   minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
   minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);vertices++;
  }
 });
 return {minX,maxX,minY,maxY,vertices,visible:v.inspect().visibleStates};
}"""


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=args.chromium,headless=True,
        args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':844,'height':390},device_scale_factor=1)
    context.on('page',lambda page: page.on('pageerror',lambda error: errors.append(str(error))))
    context.on('requestfailed',lambda request: errors.append(request.url+': '+str(request.failure)))
    context.on('request',lambda request: external.append(request.url) if not request.url.startswith(args.url) and not request.url.startswith('data:') else None)
    page = context.new_page()
    page.goto(args.url+'preview.html')
    page.wait_for_function('window.catchVehicles?.vehicle && document.querySelector("#loading").hidden')
    page.evaluate('catchVehicles.renderer.setAnimationLoop(null)')
    assets = page.evaluate('catchVehicles.manifest.assets')
    started = time.monotonic()
    for width,height in [(844,390),(390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        for meta in assets:
            page.evaluate('(id)=>catchVehicles.select(id)',meta['id'])
            page.evaluate('catchVehicles.vehicle.reset();catchVehicles.vehicle.update(0)')
            layout = page.evaluate('({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight})')
            check(layout['w']==width and layout['h']==height,f"No overflow {meta['id']} {width}x{height}")
            for state in ['intact','damaged','crushed']:
                page.evaluate('(state)=>catchVehicles.vehicle.setDamage(state)',state)
                for yaw in [.65,2.2,3.8]:
                    page.evaluate('''yaw=>{
                      const a=catchVehicles;a.orbit.enableDamping=false;
                      a.camera.position.copy(a.orbit.target).add({x:8*Math.sin(yaw),y:4.3,z:8*Math.cos(yaw)});
                      a.orbit.update();a.render();
                    }''',yaw)
                    projected = page.evaluate(PROJECT)
                    check(projected['visible']==[state],f"Only requested native state visible {meta['id']} {state}")
                    check(all(-.985 <= projected[key] <= .985 for key in ['minX','maxX','minY','maxY']),
                          f"Vehicle inside frame {meta['id']} {state} {width} {yaw}: {projected}")
                    cases.append(dict(id=meta['id'],state=state,viewport=[width,height],yaw=yaw,projected=projected))
            if width!=844:
                continue
            # A full physical revolution uses the radius in the GLB node metadata.
            result = page.evaluate('''()=>{
              const v=catchVehicles.vehicle;v.reset();const before=v.inspect();v.update(.1,2,.25);
              const after=v.inspect();
              const steer=[...v.scenes.get('intact').parts.values()].filter(o=>o.userData.role==='wheel_steer').map(o=>({front:o.userData.front,angle:o.rotation.y}));
              v.setColor('#d056a6');const colors=[];
              v.root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='paint')colors.push(m.color.getHexString());});
              return {before,after,steer,colors};
            }''')
            for wheel in result['after']['wheels']:
                check(abs(wheel['angle']-.2/wheel['radius'])<1e-5,f"Physical roll {meta['id']} {wheel['id']}")
            for wheel in result['steer']:
                check(abs(wheel['angle']-(.25 if wheel['front'] else 0))<1e-6,f"Front-only steering {meta['id']}")
            check(len(result['colors'])>0 and set(result['colors'])=={'d056a6'},f"Real paint recolor {meta['id']}")
            rigs.append(dict(id=meta['id'],result=result))
            for wheel in [w for w in meta['wheels'] if not w.get('spare')]:
                result=page.evaluate('''key=>{
                  const v=catchVehicles.vehicle;v.reset();v.burstTire(key);v.update(.1);v.update(.03);
                  const states=[];
                  for(const state of ['intact','damaged','crushed']){
                    v.setDamage(state);
                    states.push({state,tires:[...v.scenes.get(state).parts.values()].filter(o=>o.userData.role==='tire'&&o.userData.wheel!=='spare').map(o=>({id:o.userData.wheel,weight:o.morphTargetInfluences[0]}))});
                  }
                  return {states,snapshot:v.inspect()};
                }''',wheel['id'])
                for state in result['states']:
                    for tire in state['tires']:
                        check(abs(tire['weight']-(1 if tire['id']==wheel['id'] else 0))<1e-6,
                              f"Isolated tire puncture {meta['id']} {wheel['id']} {state['state']}")
                check(result['snapshot']['particles']['shards']==16,f"Rubber burst pool {meta['id']} {wheel['id']}")
                effects.append(dict(id=meta['id'],wheel=wheel['id'],states=result['states']))
            smoke=page.evaluate('''()=>{
              const v=catchVehicles.vehicle;v.reset();v.setDamage('damaged');v.setEngineSmoke(true);
              for(let i=0;i<36;i++)v.update(.08,2);
              return v.inspect();
            }''')
            check(8<=smoke['particles']['smoke']<=24,f"Bounded live engine smoke {meta['id']}")
            check(smoke['poolCapacity']=={'smoke':24,'shards':16},f"Fixed effect allocations {meta['id']}")
            flashes=page.evaluate('''()=>{
              const v=catchVehicles.vehicle;v.reset();const out=[];
              for(let i=0;i<40;i++){v.update(.02);out.push(v.inspect().beaconIntensities.map(b=>b.intensity));}
              v.setLights(false);v.update(.02);
              return {samples:out,off:v.inspect()};
            }''')
            if meta['team']=='police':
                check(any(a[0]>0 and a[1]==0 for a in flashes['samples']),f"Red flash {meta['id']}")
                check(any(a[0]==0 and a[1]>0 for a in flashes['samples']),f"Blue flash {meta['id']}")
                check(any(a==[0,0] for a in flashes['samples']),f"Flash dark intervals {meta['id']}")
                check(not any(a[0]>0 and a[1]>0 for a in flashes['samples']),f"Alternating flash {meta['id']}")
                check(all(b['intensity']==0 for b in flashes['off']['beaconIntensities']),f"Lights off {meta['id']}")
            # Play the actual exported glTF animation clips through AnimationMixer.
            clips=page.evaluate('''async()=>{
              const T=await import('./vendor/engine.mjs'),v=catchVehicles.vehicle;
              v.reset();let mixer=new T.AnimationMixer(v.root);
              const roll=v.animations.find(a=>a.name==='wheels_roll');
              mixer.clipAction(roll).play();mixer.update(.25);
              const rolling=[...v.scenes].map(([state,entry])=>({state,angles:[...entry.parts.values()].filter(o=>o.userData.role==='wheel_spin').map(o=>o.rotation.x)}));
              mixer.stopAllAction();mixer.uncacheRoot(v.root);v.reset();mixer=new T.AnimationMixer(v.root);
              const clip=v.animations.find(a=>a.name.startsWith('tire_burst_'));
              const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.update(.15);
              const key=clip.name.replace('tire_burst_','');
              const punctures=[...v.scenes].map(([state,entry])=>({state,value:entry.parts.get('wheel_'+key+'_tire').morphTargetInfluences[0]}));
              mixer.stopAllAction();mixer.uncacheRoot(v.root);v.reset();
              const flash=v.animations.find(a=>a.name==='beacons_flash');let nativeFlash=[];
              if(flash){mixer=new T.AnimationMixer(v.root);mixer.clipAction(flash).play();mixer.update(.45);
                nativeFlash=[...v.scenes].map(([state,entry])=>({state,red:entry.parts.get('beacon_red_glow').scale.x,blue:entry.parts.get('beacon_blue_glow').scale.x}));
                mixer.stopAllAction();mixer.uncacheRoot(v.root);}
              v.reset();v.update(0);return {rolling,punctures,nativeFlash};
            }''')
            for state in clips['rolling']:
                check(all(abs(angle-1.57079632679)<1e-5 for angle in state['angles']),f"Native roll clip {meta['id']} {state['state']}")
            check(all(abs(s['value']-1)<1e-6 for s in clips['punctures']),f"Native puncture clip {meta['id']}")
            check(len(clips['nativeFlash'])==(3 if meta['team']=='police' else 0),f"Native flash availability {meta['id']}")
            for state in clips['nativeFlash']:
                check(state['red']<.002 and state['blue']==1,f"Native alternating flash {meta['id']} {state['state']}")
            native.append(dict(id=meta['id'],clips=clips))
        print(f'Completed {width}x{height}',flush=True)

    # UI checks use the real animation loop and actual pointer/button events.
    live=context.new_page()
    live.goto(args.url+'preview.html')
    live.wait_for_function('window.catchVehicles?.vehicle && document.querySelector("#loading").hidden')
    live.click('#rolling')
    angle=live.evaluate('catchVehicles.vehicle.inspect().wheels[0].angle')
    live.wait_for_timeout(150)
    check(abs(live.evaluate('catchVehicles.vehicle.inspect().wheels[0].angle')-angle)<1e-6,'Pause wheel UI')
    live.click('#rolling')
    live.wait_for_function('angle=>Math.abs(catchVehicles.vehicle.inspect().wheels[0].angle-angle)>.01',arg=angle)
    live.click('[data-damage="crushed"]')
    check(live.evaluate('catchVehicles.vehicle.inspect().state')=='crushed','Damage button UI')
    live.wait_for_function('catchVehicles.vehicle.inspect().particles.smoke>0')
    live.select_option('#wheel','FR')
    live.click('#burst')
    live.wait_for_function('catchVehicles.vehicle.inspect().wheels.find(w=>w.id==="FR").puncture>.95')
    check(live.evaluate('catchVehicles.vehicle.inspect().wheels.find(w=>w.id==="FL").puncture')==0,'Wheel selector UI')
    live.click('#lights')
    check(live.evaluate('catchVehicles.vehicle.inspect().lights') is False,'Lights button UI')
    live.click('#colors button:nth-child(3)')
    check(live.evaluate('catchVehicles.vehicle.inspect().paint')==assets[0]['colors'][2],'Color swatch UI')
    live.click('#wireframe')
    check(live.get_attribute('#wireframe','aria-pressed')=='true','Wireframe button UI')
    live.click('#reset')
    check(live.evaluate('catchVehicles.vehicle.inspect().state')=='intact','Reset restores intact state')
    check(live.evaluate('catchVehicles.vehicle.inspect().particles.smoke')==0,'Reset clears smoke')
    before=live.evaluate('catchVehicles.camera.position.toArray()')
    box=live.locator('#stage').bounding_box()
    live.mouse.move(box['x']+box['width']*.45,box['y']+box['height']*.45)
    live.mouse.down();live.mouse.move(box['x']+box['width']*.65,box['y']+box['height']*.48,steps=9);live.mouse.up()
    after=live.evaluate('catchVehicles.camera.position.toArray()')
    check(sum(abs(a-b) for a,b in zip(before,after))>.2,'Pointer orbit UI')
    live.click('#fugitive-tab')
    live.wait_for_function('catchVehicles.vehicle.meta.id==="fugitive-sport"')
    live.click('[data-id="fugitive-classic"]')
    live.wait_for_function('catchVehicles.vehicle.meta.id==="fugitive-classic"')
    check(live.get_attribute('[data-id="fugitive-classic"]','aria-pressed')=='true','Catalog last item reachable')
    live.click('#police-tab');live.wait_for_function('catchVehicles.vehicle.meta.id==="police-sedan"')
    live.click('#reset')
    live.screenshot(path=str(ROOT/'verification'/'preview-844x390.webp'),type='webp',quality=88)
    live.click('[data-damage="crushed"]')
    live.wait_for_function('catchVehicles.vehicle.inspect().particles.smoke>=20')
    live.click('#burst')
    live.screenshot(path=str(ROOT/'verification'/'effects-844x390.webp'),type='webp',quality=88)
    live.set_viewport_size({'width':390,'height':844});live.click('#reset')
    live.screenshot(path=str(ROOT/'verification'/'preview-390x844.webp'),type='webp',quality=88)
    live.close()

    # Three full catalog cycles catch accumulation of GLTF geometry and FX textures.
    page.set_viewport_size({'width':844,'height':390})
    memory=[]
    for cycle in range(3):
        for meta in assets:
            page.evaluate('(id)=>catchVehicles.select(id)',meta['id'])
            page.evaluate('catchVehicles.vehicle.update(.02);catchVehicles.render()')
        page.evaluate('catchVehicles.select("police-sedan")')
        page.evaluate('catchVehicles.vehicle.update(.02);catchVehicles.render()')
        memory.append(page.evaluate('({...catchVehicles.renderer.info.memory})'))
    check(memory[0]==memory[1]==memory[2],'GPU resource counts stable across three full catalog cycles')

    page.set_viewport_size({'width':1688,'height':780})
    page.goto(args.url+'gallery.html');page.wait_for_function('window.galleryReady',timeout=60000)
    page.screenshot(path=str(ROOT/'verification'/'fleet-14.webp'),type='webp',quality=90,full_page=True)
    page.set_viewport_size({'width':1266,'height':520})
    page.goto(args.url+'gallery.html?states=police-sedan');page.wait_for_function('window.galleryReady',timeout=60000)
    page.screenshot(path=str(ROOT/'verification'/'damage-states.webp'),type='webp',quality=90,full_page=True)
    check(not errors,'No browser errors or failed requests')
    check(not external,'All requests stay inside the new folder')
    result=dict(browser=browser.version,renderer='Chromium / ANGLE SwiftShader',checks=checks,
        projectionCases=len(cases),tireBurstCases=len(effects),nativeAnimationVehicles=len(native),
        durationSeconds=round(time.monotonic()-started,2),failures=failures,errors=errors,
        externalRequests=external,resourceCycles=memory,cases=cases,rigs=rigs,tireBursts=effects,nativeClips=native)
    (ROOT/'verification'/'browser.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    browser.close()
    print(json.dumps({key:result[key] for key in ['checks','projectionCases','tireBurstCases','nativeAnimationVehicles','durationSeconds','failures','errors','externalRequests','resourceCycles']},ensure_ascii=False))
    if failures or errors or external:
        raise SystemExit(1)
