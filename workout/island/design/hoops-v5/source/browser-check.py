"""Real WebGL / local Draco / strict script CSP checks, with phone screenshots.
Requires Python Playwright, Pillow, Chromium. Serves only the preview allowlist.
"""
from pathlib import Path
from threading import Thread
from io import BytesIO
import hashlib, json, time
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright
from serve import server

ROOT=Path(__file__).resolve().parents[1]
report={'allPassed':False,'renderer':'Chromium WebGL / SwiftShader; emulated phone viewports, not a physical device',
        'scriptCSP':"script-src 'self'; static same-origin Draco worker",'results':[],'errors':[],'externalRequests':[]}
httpd=server(0)
thread=Thread(target=httpd.serve_forever,daemon=True);thread.start()
base=f'http://127.0.0.1:{httpd.server_port}/workout/island/design/hoops-v5/preview.html'

def wait_frame(page,view):
    page.wait_for_function('(v) => window.previewMetrics?.view===v',arg=view,timeout=30000)

def check_buttons(page):
    rects=page.locator('nav button,.tools button').evaluate_all("els => els.map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,w:r.width,h:r.height}})")
    for a in rects:
        assert a['w']>=44 and a['h']>=44,('small touch target',a)
        assert a['x']>=0 and a['y']>=0 and a['x']+a['w']<=page.viewport_size['width']+1,('offscreen',a)
        for b in rects:
            if a is b:continue
            overlap=min(a['x']+a['w'],b['x']+b['w'])>max(a['x'],b['x']) and min(a['y']+a['h'],b['y']+b['h'])>max(a['y'],b['y'])
            assert not overlap,('overlapping targets',a,b)
    return rects

def attach_logs(page):
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda e:report['errors'].append(e.type+': '+e.text) if e.type in ['error','warning'] else None)
    page.on('requestfailed',lambda r:report['errors'].append(r.url+': '+r.failure))
    page.on('response',lambda r:report['errors'].append(str(r.status)+' '+r.url) if r.status>=400 else None)
    page.on('request',lambda r:report['externalRequests'].append(r.url) if not r.url.startswith((base.split('/workout')[0], 'blob:', 'data:')) else None)

try:
  with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=[
      '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for label,w,h in [('portrait',390,844),('landscape',844,390)]:
      context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,has_touch=True,is_mobile=True)
      page=context.new_page();attach_logs(page)
      workers=[];page.on('worker',lambda worker:workers.append(worker.url))
      page.goto(base+'?capture=1',wait_until='networkidle')
      page.wait_for_function('() => window.previewReady || window.previewError',timeout=60000)
      assert page.evaluate('() => !!window.previewReady && !window.previewError')
      assert page.evaluate('() => document.documentElement.scrollWidth===innerWidth && document.documentElement.scrollHeight===innerHeight')
      diagnostics=page.evaluate('() => window.hoopsV5.getDiagnostics()')
      assert len(diagnostics['models'])==6,diagnostics
      assert diagnostics['models']['arena']['mapped']>=5 and diagnostics['models']['uniforms']['mapped']==2
      assert diagnostics['models']['crowd']['mapped']==1 and diagnostics['models']['ball']['mapped']==1
      assert all(t.get('width') and max(t['width'],t['height'])<=1024 for t in diagnostics['textures']),diagnostics
      assert workers and all('hoops-draco-worker.mjs' in worker for worker in workers),workers
      page.wait_for_function('() => window.hoopsV5.getState().elapsed>.05',timeout=60000)
      live=page.evaluate('() => window.hoopsV5.getState()')
      assert live['morphs']!=[1,0],live
      page.evaluate('() => window.hoopsV5.setPaused(true)')
      frozen=page.evaluate('() => window.hoopsV5.getState()')
      page.wait_for_timeout(300)
      assert page.evaluate('() => window.hoopsV5.getState().elapsed')==frozen['elapsed']
      targets=check_buttons(page)
      states=[]
      for view in ['arena','floor','crowd','materials']:
        page.locator(f'[data-view="{view}"]').click();wait_frame(page,view)
        page.screenshot(path=str(ROOT/'previews'/f'{view}-{label}.png'))
        state=page.evaluate('() => window.previewMetrics')
        assert state['triangles']>1000 and state['drawCalls']>1
        states.append(state)
      # Drag and keyboard must move a frozen scene, not depend on animation.
      page.locator('[data-view="arena"]').click();wait_frame(page,'arena')
      before=page.evaluate('() => window.hoopsV5.getState().camera')
      page.mouse.move(w*.42,h*.44);page.mouse.down();page.mouse.move(w*.57,h*.48,steps=5);page.mouse.up()
      assert page.evaluate('() => window.hoopsV5.getState().camera')!=before
      page.locator('#arena').focus();page.keyboard.press('Home');page.keyboard.press('ArrowLeft')
      assert page.evaluate('() => window.hoopsV5.getState().camera')!=before
      page.locator('[data-view="floor"]').click();wait_frame(page,'floor')
      # Compare a canvas centre crop so changing button text cannot fake a reflection change.
      before_image=Image.open(BytesIO(page.screenshot())).convert('RGB')
      page.locator('#economy').click()
      page.wait_for_function('() => window.previewMetrics?.economy && !window.previewMetrics.reflection',timeout=30000)
      after_image=Image.open(BytesIO(page.screenshot())).convert('RGB')
      crop=(int(w*.25),int(h*.30),int(w*.75),int(h*.67))
      delta=ImageStat.Stat(ImageChops.difference(before_image.crop(crop),after_image.crop(crop))).mean
      assert max(delta)>.1,('reflection has no pixel effect',delta)
      assert page.evaluate('() => window.previewMetrics.drawCalls')<next(s['drawCalls'] for s in states if s['view']=='floor')
      page.locator('#economy').click()
      page.set_viewport_size({'width':h,'height':w})
      page.wait_for_function('(w) => window.previewMetrics?.canvas[0]===w',arg=h,timeout=30000)
      assert page.evaluate('() => document.documentElement.scrollWidth===innerWidth')
      report['results'].append({'viewport':[w,h],'touchTargets':targets,'states':states,'diagnostics':diagnostics,
        'crowdMorphsChanged':True,'pauseFrozen':True,'orbitAndKeyboard':True,'orientationResize':True,
        'reflectionPixelDelta':delta,'economyReducesDrawCalls':True,'staticDracoWorkers':len(workers)})
      context.close()
      print('PASS phone',label,flush=True)
    context=browser.new_context(viewport={'width':1280,'height':800},device_scale_factor=1)
    page=context.new_page();attach_logs(page);page.goto(base+'?capture=1',wait_until='networkidle')
    page.wait_for_function('() => window.previewReady || window.previewError',timeout=60000)
    assert page.evaluate('() => !!window.previewReady && !window.previewError')
    page.evaluate('() => window.hoopsV5.setPaused(true)')
    for view in ['arena','materials']:
      page.evaluate('(v) => window.hoopsV5.setView(v)',view);wait_frame(page,view)
      page.screenshot(path=str(ROOT/'previews'/f'{view}-desktop.png'))
    report['desktopScreenshots']=['arena-desktop.png','materials-desktop.png']
    context.close()
    # A denser phone viewport exercises the actual DPR cap (capture mode is off).
    context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,reduced_motion='reduce')
    page=context.new_page();attach_logs(page);page.goto(base,wait_until='networkidle')
    page.wait_for_function('() => window.previewMetrics || window.previewError',timeout=60000)
    assert page.evaluate('() => window.previewMetrics.paused && window.previewMetrics.canvas[0]===585')
    report['reducedMotionAndDPR2']={'pausedOnLoad':True,'canvas':page.evaluate('() => window.previewMetrics.canvas'),'effectiveDPR':1.5}
    context.close()
    # Expected network failure must show a retry control, not a black screen.
    context=browser.new_context(viewport={'width':390,'height':844})
    page=context.new_page();page.route('**/models/ball.glb',lambda route:route.fulfill(status=404,body='missing'))
    page.goto(base+'?capture=1',wait_until='networkidle')
    page.wait_for_function('() => !!window.previewError',timeout=60000)
    assert page.locator('#retry').is_visible() and not page.evaluate('() => !!window.previewReady')
    report['missingAssetShowsRetry']=True
    context.close();browser.close()
    report['allPassed']=not report['errors'] and not report['externalRequests']
    assert report['allPassed'],report['errors']
except Exception as e:
    report['failure']=str(e)
    raise
finally:
    (ROOT/'verification/browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    httpd.shutdown();httpd.server_close()
print('PASS all browser checks',flush=True)
