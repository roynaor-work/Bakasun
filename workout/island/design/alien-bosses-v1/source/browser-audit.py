"""Run with preview served on localhost:8765; tests real GLBs and DOM controls."""
import json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL='http://127.0.0.1:8765/workout/island/design/alien-bosses-v1/preview.html'
result={'viewport':[844,390],'checks':[],'screenshots':[],'errors':[],'externalRequests':[]}
def check(name, value):
    result['checks'].append({'name':name,'passed':bool(value)})
    assert value,name

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'])
    page=browser.new_page(viewport={'width':844,'height':390},device_scale_factor=2)
    page.on('pageerror',lambda e:result['errors'].append(str(e)))
    page.on('request',lambda r:result['externalRequests'].append(r.url) if not r.url.startswith('http://127.0.0.1:8765/') and not r.url.startswith(('data:','blob:')) else None)
    page.goto(URL);page.locator('#loading').wait_for(state='hidden');page.wait_for_function('()=>window.bossPreview?.snapshot().bosses.every(b=>b.status==="active")',timeout=30000)
    check('three bosses render real GLB mesh geometry',page.evaluate('()=>bossPreview.bosses.every(b=>b.asset.animations.length===6 && b.model.getObjectByName(b.spec.targets[0].node).children.some(c=>c.isMesh))'))
    check('all encounters enter active state',page.evaluate('()=>bossPreview.snapshot().bosses.every(b=>b.status==="active")'))
    check('no horizontal or vertical scroll at requested viewport',page.evaluate('()=>document.documentElement.scrollWidth===844 && document.documentElement.scrollHeight===390'))
    check('all control buttons fit viewport',page.evaluate('()=>[...document.querySelectorAll("button,select")].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=844&&r.top>=0&&r.bottom<=390})'))
    for i,boss in enumerate(['mothership','cosmic-guardian','space-crawler']):
        page.locator(f'[data-boss="{boss}"]').click()
        for state in ['intact','damaged','critical']:
            page.locator('#state').select_option(state);page.wait_for_timeout(120)
            check(f'{boss}: {state} applies independent morph targets',page.evaluate('''([i,state])=>{
                const b=bossPreview.bosses[i];return Object.keys(b.encounter.targets).every(name=>{
                    const p=b.model.getObjectByName(name);let ok=true;p.traverse(o=>{if(o.morphTargetInfluences)ok&&=o.morphTargetInfluences[0]===(state==='damaged'?1:0)&&o.morphTargetInfluences[1]===(state==='critical'?1:0)});return ok;});}''',[i,state]))
            file=f'{boss}-{state}-844x390.png';page.screenshot(path=str(ROOT/'verification'/file));result['screenshots'].append(file)
        page.locator('#state').select_option('intact')
    # Play every GLB clip on its actual AnimationMixer, separate from the demo controller.
    clip_check=page.evaluate('''async()=>{
        const T=await import('./vendor/three.module.js');const out=[];
        for(const b of bossPreview.bosses){
          const clone=b.asset.scene.clone(true),mixer=new T.AnimationMixer(clone);
          for(const clip of b.asset.animations){
            mixer.stopAllAction();const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.update(clip.duration+.01);
            let finite=true;clone.traverse(o=>{finite&&=o.position.toArray().every(Number.isFinite)&&o.scale.toArray().every(Number.isFinite)});
            let expected=true;
            if(clip.name.startsWith('Damage_')){
              const weights=clip.name==='Damage_Intact'?[0,0]:clip.name==='Damage_Damaged'?[1,0]:[0,1];
              clone.traverse(o=>{if(o.morphTargetInfluences)expected&&=o.morphTargetInfluences.every((v,i)=>v===weights[i]);});
            }
            const node=clone.getObjectByName('boss_root');
            if(clip.name==='Entrance')expected&&=Math.abs(node.position.z)<.0001&&Math.abs(node.scale.x-1)<.0001;
            if(clip.name==='Retreat')expected&&=Math.abs(node.position.z+6)<.0001&&Math.abs(node.scale.x-.25)<.0001;
            out.push({boss:b.spec.id,clip:clip.name,finite,expected});
          }
          mixer.uncacheRoot(clone);
        }return out;
    }''')
    check('all 18 embedded clips produce expected states and transforms',len(clip_check)==18 and all(x['finite'] and x['expected'] for x in clip_check));result['clips']=clip_check
    # Generator gate and disappearing shield, using only visible controls.
    page.locator('[data-boss="cosmic-guardian"]').click();page.locator('#target').select_option('hull');page.locator('#hit').click()
    check('shield blocks core damage',page.evaluate('()=>bossPreview.bosses[1].encounter.targets.hull.hp===12'))
    page.locator('#target').select_option('generator')
    for _ in range(6):page.locator('#hit').click()
    check('generator explodes and shield disappears',page.evaluate('()=>!bossPreview.bosses[1].model.getObjectByName("shield").visible&&!bossPreview.bosses[1].model.getObjectByName("generator").visible'))
    page.screenshot(path=str(ROOT/'verification'/'guardian-shield-down-844x390.png'))
    page.locator('#target').select_option('hull');page.locator('#hit').click()
    check('core now accepts damage',page.evaluate('()=>bossPreview.bosses[1].encounter.targets.hull.hp===11'))
    # Independent segment damage and destruction.
    page.locator('[data-boss="space-crawler"]').click();page.locator('#target').select_option('segment_03')
    for _ in range(5):page.locator('#hit').click()
    check('only selected segment disappears',page.evaluate('()=>bossPreview.bosses[2].spec.targets.every(t=>bossPreview.bosses[2].model.getObjectByName(t.node).visible===(t.node!=="segment_03"))'))
    check('remaining segments keep their health',page.evaluate('()=>bossPreview.bosses[2].encounter.targets.segment_02.hp===5'))
    page.screenshot(path=str(ROOT/'verification'/'crawler-segment-destroyed-844x390.png'))
    # Distinct live attacks; record their draw telemetry and enforce finite bounded buffers.
    attacks=[]
    for i,boss in enumerate(['mothership','cosmic-guardian','space-crawler']):
        page.locator(f'[data-boss="{boss}"]').click();page.locator('#entrance').click();page.wait_for_function(f'()=>bossPreview.bosses[{i}].encounter.status==="active"')
        page.locator('#attack').click();page.wait_for_function('()=>bossPreview.snapshot().shots>0')
        snap=page.evaluate('()=>bossPreview.snapshot()');attacks.append({'id':boss,'snapshot':snap})
        check(f'{boss} emits visible projectiles',snap['shots']>0 and snap['shots']<=12)
        page.screenshot(path=str(ROOT/'verification'/f'{boss}-attack-844x390.png'))
        page.locator('#attack').click()
    result['attackSnapshots']=attacks
    # Pause freezes the simulation, not just UI labeling.
    page.locator('#pause').click();before=page.evaluate('()=>bossPreview.bosses[2].encounter.time');page.wait_for_timeout(250)
    check('pause freezes simulation clock',page.evaluate('()=>bossPreview.bosses[2].encounter.time')==before);page.locator('#pause').click()
    page.locator('#retreat').click();page.wait_for_function('()=>bossPreview.bosses[2].encounter.status==="gone"')
    check('retreat removes boss and disables combat',page.evaluate('()=>!bossPreview.bosses[2].model.visible&&bossPreview.bosses[2].encounter.status==="gone"'))
    page.locator('#entrance').click();page.wait_for_function('()=>bossPreview.bosses[2].encounter.status==="active"')
    check('entrance restores all five parts',page.evaluate('()=>bossPreview.bosses[2].spec.targets.every(t=>bossPreview.bosses[2].model.getObjectByName(t.node).visible)'))
    # Decode all codecs through real HTMLMediaElement; verify finite positive durations.
    sounds=page.evaluate('''async()=>{
      const out=[];
      for(const b of bossPreview.manifest.bosses)for(const [cue,formats] of Object.entries(b.audio))for(const ext of ['ogg','mp3']){
        const a=new Audio();a.preload='auto';const info=await new Promise(resolve=>{a.onloadedmetadata=()=>resolve({boss:b.id,cue,ext,duration:a.duration});a.onerror=()=>resolve({boss:b.id,cue,ext,error:true});a.src=formats[ext];});out.push(info);a.removeAttribute('src');a.load();
      }return out;
    }''')
    check('all 24 OGG/MP3 files decode in Chromium',len(sounds)==24 and all(0<x.get('duration',0)<2 for x in sounds));result['audioDecode']=sounds
    page.locator('#sound').click();page.wait_for_timeout(200);check('audio opt-in control works',page.evaluate('()=>bossPreview.snapshot().sound'));page.locator('#sound').click()
    for boss in ['mothership','cosmic-guardian','space-crawler']:
        page.locator(f'[data-boss="{boss}"]').click();page.locator('#state').select_option('intact')
    page.locator('[data-boss="mothership"]').click();page.wait_for_timeout(150)
    page.screenshot(path=str(ROOT/'verification'/'preview-844x390.png'))
    for viewport in [{'width':740,'height':390},{'width':390,'height':844}]:
        page.set_viewport_size(viewport);page.wait_for_timeout(150)
        check(f'controls fit {viewport}',page.evaluate('()=>[...document.querySelectorAll("button,select")].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})'))
    page.emulate_media(reduced_motion='reduce');page.reload();page.locator('#loading').wait_for(state='hidden');page.wait_for_timeout(100)
    check('reduced motion starts paused with fully visible bosses',page.evaluate('()=>bossPreview.snapshot().paused&&bossPreview.bosses.every(b=>b.model.visible&&b.encounter.status==="active")'))
    check('zero runtime errors',not result['errors']);check('zero external requests',not result['externalRequests'])
    result['browser']=browser.version;browser.close()

(ROOT/'verification'/'browser-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'checks':len(result['checks']),'errors':result['errors'],'externalRequests':result['externalRequests']}))
