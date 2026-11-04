"""Offline, interaction, effect timing, LOD, accessibility and context recovery audit."""
from pathlib import Path
from datetime import datetime,timezone
import json, math, time, hashlib
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'verification'
DEST.mkdir(exist_ok=True)
result={'startedUTC':datetime.now(timezone.utc).isoformat(),'offlineSHA256':hashlib.sha256((ROOT/'offline.html').read_bytes()).hexdigest(),'checks':[],'errors':[],'requests':[],'effects':[],
  'transport':'HTML read from local disk and injected into about:blank with browser offline. Managed Chromium blocks direct file:// navigation with ERR_BLOCKED_BY_ADMINISTRATOR; direct file open is not claimed.'}
def check(name,condition,detail=None):
    result['checks'].append({'name':name,'pass':bool(condition),'detail':detail})
def wait_ready(page):
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        state=page.evaluate('() => ({ready:window.defense?.state.ready,errors:window.defense?.state.errors})')
        if state.get('ready'):return
        if state.get('errors'):raise RuntimeError(state['errors'])
        page.wait_for_timeout(100)
    raise TimeoutError('Offline viewer did not become ready')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1,offline=True)
    page=context.new_page()
    page.on('request',lambda r:result['requests'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    page.on('pageerror',lambda e:result['errors'].append(e.stack or str(e)))
    page.on('console',lambda m:result['errors'].append(m.text) if m.type=='error' else None)
    page.set_content((ROOT/'offline.html').read_text(),wait_until='load',timeout=90000)
    wait_ready(page)
    check('Self-contained local HTML loads with browser offline',page.evaluate('window.defense.state.ready'))
    check('Three r160',page.evaluate('window.defense.snapshot().revision')=='160')
    check('No HTTP/HTTPS requests',not result['requests'])
    page.click('[data-scene="farm"]');check('Scene tab',page.evaluate('window.defense.state.scene')=='farm')
    page.click('#night');check('Night control',page.evaluate('window.defense.state.night'))
    page.click('#day');check('Day control',not page.evaluate('window.defense.state.night'))
    page.evaluate('window.defense.configure({playing:true});window.defense.renderer.setPixelRatio(.5)');page.click('#play');check('Pause restores sharp DPR',page.evaluate('window.defense.snapshot().dpr')==1)
    t1=page.evaluate('window.defense.state.time');page.wait_for_timeout(400);t2=page.evaluate('window.defense.state.time');check('Pause freezes simulation',t1==t2,[t1,t2])
    page.click('#play');page.wait_for_timeout(300);check('Play resumes',page.evaluate('window.defense.state.time')>t2)
    page.click('#library-open');check('Catalog modal',page.locator('#library').evaluate('(e)=>e.open'))
    page.evaluate('window.defense.renderer.setPixelRatio(.5)')
    page.click('[data-asset="boar-striped"]');check('Catalog selection',page.evaluate('window.defense.state.selected')=='boar-striped')
    check('Inspector restores sharp DPR',page.evaluate('window.defense.snapshot().dpr')==1)
    a=page.evaluate('window.defense.camera.position.toArray()');page.click('#far');b=page.evaluate('window.defense.camera.position.toArray()');check('Inspector near/far changes camera',math.dist(a,b)>.5,[a,b])
    page.locator('#canvas').focus();page.keyboard.press('ArrowLeft');check('Keyboard orbit',abs(page.evaluate('window.defense.state.yaw'))>.05)
    page.click('#reset');check('Reset view',page.evaluate('window.defense.state.yaw')==0)
    page.evaluate('window.defense.configure({selected:null,scene:"farm",quality:"high",playing:false})');page.wait_for_timeout(200);high=page.evaluate('window.defense.renderFrame()')
    page.evaluate('window.defense.configure({quality:"low"})');page.wait_for_timeout(200);low=page.evaluate('window.defense.renderFrame()')
    check('True geometry LOD',low['triangles']<high['triangles']*.65,{'high':high['triangles'],'low':low['triangles']})
    check('Instanced crowd and props',low['instancedMeshes']>=3,low['instancedMeshes'])
    for width,height in [(390,844),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('window.defense.configure({scene:"space",selected:null,night:true,close:true,playing:false,quality:"auto"})')
        for seconds in [0,.07,.20,.45,.80,1.20]:
            page.evaluate('(t)=>window.defense.effectFrame(t)',seconds)
            page.screenshot(path=str(DEST/f'effect-{width}x{height}-{seconds:.2f}.png'))
            result['effects'].append({'viewport':[width,height],'seconds':seconds,**page.evaluate('window.defense.snapshot()')})
            if seconds==.07:
                rays=page.evaluate('window.defense.effectDebug()')
                check(f'Laser emitter anchors {width}x{height}',all(r['emitter'] and math.dist(r['emitter'],r['laserFrom'])<1e-5 for r in rays),rays)
            if seconds==1.20:check(f'Effects expire {width}x{height}',not page.evaluate('window.defense.effectSnapshot().active'))
        page.evaluate('window.defense.configure({scene:"farm",night:true,quality:"low"});window.defense.effect()')
        page.wait_for_timeout(100)
        guard_levels=page.evaluate('''()=>{let levels=[];window.defense.scene.traverse(o=>{if(o.isLOD&&o.userData.assetId==='guard-ranger')levels=o.levels.map(l=>l.object.visible);});return levels;}''')
        check(f'Alert stays animated in low LOD {width}x{height}',guard_levels==[False,True,False],guard_levels)
        page.screenshot(path=str(DEST/f'alarm-{width}x{height}.png'))
        controls=page.evaluate('''()=>[...document.querySelectorAll('.controls button,.scene-tabs button,.masthead button')].map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height}})''')
        check(f'Controls within {width}x{height}',all(c['x']>=-1 and c['y']>=-1 and c['x']+c['w']<=width+1 and c['y']+c['h']<=height+1 for c in controls),controls)
    page.evaluate('window.defense.configure({playing:true,quality:"auto"})')
    page.evaluate('window.auditLoseContext=window.defense.renderer.getContext().getExtension("WEBGL_lose_context");window.auditLoseContext.loseContext()');page.wait_for_timeout(300)
    page.evaluate('window.auditLoseContext.restoreContext()');page.wait_for_timeout(1200)
    check('Context restored',not page.evaluate('window.defense.renderer.getContext().isContextLost()'))
    check('Context restore resumes playback',page.evaluate('window.defense.state.playing'))
    page.screenshot(path=str(DEST/'context-restored.png'))
    result['final']=page.evaluate('window.defense.snapshot()')
    context.close()
    reduced=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce',offline=True)
    reduced_page=reduced.new_page();reduced_page.set_content((ROOT/'offline.html').read_text(),wait_until='load',timeout=90000);wait_ready(reduced_page)
    check('Reduced motion defaults to paused',not reduced_page.evaluate('window.defense.state.playing'))
    reduced.close();browser.close()
result['finishedUTC']=datetime.now(timezone.utc).isoformat()
result['pass']=all(c['pass'] for c in result['checks']) and not result['errors'] and not result['requests']
(DEST/'browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'pass':result['pass'],'checks':len(result['checks']),'failures':[c for c in result['checks'] if not c['pass']],'errors':result['errors'],'external':result['requests']},ensure_ascii=False))
if not result['pass']:raise SystemExit(1)
