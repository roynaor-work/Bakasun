"""Load only this package in Chromium; inspect actual skinned delivered GLBs.

Usage: python3 source/check-browser.py. Requires Playwright and /usr/bin/chromium.
No running development server, account, CDN or application installation is needed.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import json
import math
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/preview.html'
errors=[];warnings=[];external=[];bad_responses=[];records=[]
manifest=json.loads((ROOT/'manifest.json').read_text())
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=[
        '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=browser.new_context(viewport={'width':844,'height':390},device_scale_factor=1)
    def route(req):
        if req.request.url.startswith(f'http://127.0.0.1:{server.server_port}/'):
            req.continue_()
        else:
            external.append(req.request.url);req.abort()
    ctx.route('**/*',route)
    page=ctx.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' else warnings.append(m.text) if m.type=='warning' else None)
    page.on('response',lambda r:bad_responses.append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    page.goto(url)
    page.wait_for_function('window.crowdPreview?.getState().ready',timeout=60000)
    assert page.evaluate('crowdPreview.getState().loads')==14
    page.evaluate('crowdPreview.setPlaying(false)')
    # UI controls exercise the same files as inspection. Every LOD, every loop,
    # all 14 skinned bodies, four samples = 840 delivered pose/bounds samples.
    for lod in range(3):
        page.select_option('#lod',str(lod))
        for clip in manifest['clips']:
            page.select_option('#clip',clip['name'])
            for fraction in [0,.25,.5,.75]:
                page.evaluate('(t)=>crowdPreview.setTime(t)',clip['durationSeconds']*fraction)
                data=page.evaluate('crowdPreview.inspectDeformations()')
                for item in data:
                    assert item['triangles']==manifest['lodTriangles'][lod]
                    assert all(math.isfinite(x) for x in item['min']+item['max'])
                    assert item['min'][1]>-.06,(lod,clip['name'],item)
                    assert item['max'][1]<2.3,(lod,clip['name'],item)
                    assert item['max'][0]-item['min'][0]<1.8,(lod,clip['name'],item)
                records.append({'lod':lod,'clip':clip['name'],'fraction':fraction,
                                'minimumY':min(d['min'][1] for d in data),
                                'maximumY':max(d['max'][1] for d in data),'models':len(data)})
    # Pause/resume really freezes the animation clock and skinned bone transforms.
    page.evaluate("crowdPreview.setLOD(0);crowdPreview.setClip('track_ball');crowdPreview.setTime(.8)")
    before=page.evaluate('crowdPreview.inspectPose()')
    page.wait_for_timeout(180)
    assert page.evaluate('crowdPreview.inspectPose()')==before
    page.click('#pause');page.wait_for_timeout(220)
    assert page.evaluate('crowdPreview.inspectPose()')!=before
    page.click('#pause')
    # Native selectors and view buttons: all 14 identities selectable.
    page.click('#close')
    for i in range(14):
        page.select_option('#fan',str(i))
        state=page.evaluate('crowdPreview.getState()')
        assert state['selected']==i and state['visiblePeople']==1
        assert str(manifest['models'][i]['age']) in page.inner_text('#person-detail')
    page.click('#crowd')
    assert page.evaluate('crowdPreview.getState().visiblePeople')==14
    # Keyboard pause and resize must preserve selectable controls without overflow.
    page.locator('canvas').focus();page.keyboard.press('Space')
    assert page.evaluate('crowdPreview.getState().playing')
    page.keyboard.press('Space')
    for width,height in [(844,390),(390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(100)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        for selector in ['#pause','#clip','#fan','#crowd','#close','#lod']:
            box=page.locator(selector).bounding_box()
            assert box['x']>=0 and box['x']+box['width']<=width+.5,(selector,box)
            assert box['y']>=0 and box['y']+box['height']<=height+.5,(selector,box)
    page.set_viewport_size({'width':844,'height':390})
    page.evaluate("crowdPreview.selectFan(0);crowdPreview.setLOD(0);crowdPreview.setClip('seated_idle');crowdPreview.setTime(0);crowdPreview.setView('crowd')")
    page.screenshot(path=str(ROOT/'verification/crowd-844x390.jpg'),type='jpeg',quality=88)
    page.evaluate("crowdPreview.setView('close');crowdPreview.setClip('polite_applause');crowdPreview.setTime(.4)")
    page.screenshot(path=str(ROOT/'verification/applause-844x390.jpg'),type='jpeg',quality=88)
    page.evaluate("crowdPreview.setClip('stand_up');crowdPreview.setTime(3)")
    page.screenshot(path=str(ROOT/'verification/standing-844x390.jpg'),type='jpeg',quality=88)
    page.evaluate("crowdPreview.setView('crowd');crowdPreview.setLOD(2);crowdPreview.setClip('seated_idle');crowdPreview.setTime(0)")
    page.screenshot(path=str(ROOT/'verification/lod2-844x390.jpg'),type='jpeg',quality=85)
    # Reduced motion starts paused. A failed asset produces a visible error.
    reduced=browser.new_context(reduced_motion='reduce',viewport={'width':844,'height':390})
    quiet=reduced.new_page();quiet.goto(url)
    quiet.wait_for_function('window.crowdPreview?.getState().ready',timeout=60000)
    assert not quiet.evaluate('crowdPreview.getState().playing')
    reduced.close()
    failure=browser.new_context();failure.route('**/models/fan-01.glb',lambda route:route.fulfill(status=404,body='missing'))
    failed=failure.new_page();failed.goto(url);failed.wait_for_selector('#error:not([hidden])')
    assert not failed.evaluate('crowdPreview.getState().ready')
    failure.close()
    gpu=page.evaluate("(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})()")
    result={'browser':browser.version,'renderer':gpu,'viewport':[844,390],
        'modelLoads':14,'lods':3,'clips':5,'poseBoundsSamples':len(records)*14,
        'javascriptErrors':errors,'consoleWarnings':warnings,'externalRequests':external,
        'httpFailures':bad_responses,'pauseResume':True,'keyboardPause':True,
        'allIdentitySelectors':True,'portraitNoOverflow':True,'reducedMotion':True,
        'missingAssetMessage':True,'poseBounds':records,
        'limitation':'Software WebGL inspection, not a physical phone performance measurement.'}
    assert not errors and not warnings and not external and not bad_responses,result
    (ROOT/'verification/browser.json').write_text(json.dumps(result,indent=2)+'\n')
    browser.close()
server.shutdown();server.server_close()
print('Chromium: 840 poses, 42 LODs, five loops, controls, pause, reduced motion and missing asset checks passed.')
