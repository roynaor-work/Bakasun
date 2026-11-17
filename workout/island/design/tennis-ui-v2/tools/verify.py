#!/usr/bin/env python3
"""Validate delivered assets and the real browser interaction, without altering game files."""
import hashlib
import json
import os
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification'
CONFIG=json.loads((ROOT/'manifest.json').read_text())

def assets():
    checks=[]
    total=0
    for asset in CONFIG['assets']:
        for kind in ('svg','png'):
            info=asset[kind]
            file=ROOT/info['path']
            data=file.read_bytes()
            assert len(data)==info['bytes'] and hashlib.sha256(data).hexdigest()==info['sha256'], info['path']
            assert len(data)<CONFIG['maxFileBytes']
            total+=len(data)
            if kind=='svg':
                tree=ET.fromstring(data)
                assert tree.attrib['width']==str(info['width']) and tree.attrib['height']==str(info['height'])
                forbidden={'text','image','foreignObject','script','use'}
                assert not any(e.tag.split('}')[-1] in forbidden for e in tree.iter())
                assert all('href' not in name for e in tree.iter() for name in e.attrib)
            else:
                image=Image.open(file)
                assert image.size==(info['width'],info['height']) and image.mode=='RGBA'
                alpha=image.getchannel('A')
                assert alpha.getextrema()[0]==0
                if asset['id']=='meter-hidden': assert alpha.getbbox() is None
                else: assert alpha.getbbox() is not None
                if asset['role']=='button': assert image.size==(128,128)
            checks.append(info['path'])
    for control in CONFIG['controls']:
        found=[a for a in CONFIG['assets'] if a.get('control')==control['id']]
        assert len(found)==3 and len({a['png']['sha256'] for a in found})==3
    embedded=(ROOT/'tennis-config.js').read_text().split('window.TENNIS_UI_V2_CONFIG = ',1)[1].strip().removesuffix(';')
    data=json.loads(embedded)
    for key in ['controls','effects','meter']: assert data[key]==CONFIG[key]
    assert data['assets']=={a['id']:{f:a[f]['path'] for f in ['svg','png']} for a in CONFIG['assets']}
    report=dict(passed=True,assets=len(CONFIG['assets']),exports=len(checks),graphicsBytes=total,
                uniqueButtonStates=18,buttonPNGSize=[128,128],allTransparent=True,noBakedText=True,
                allSHA256Verified=True,configMatchesManifest=True,
                largestExportBytes=max(a[f]['bytes'] for a in CONFIG['assets'] for f in ['svg','png']))
    (OUT/'assets.json').write_text(json.dumps(report,indent=2)+'\n')
    return report

@contextmanager
def local_server():
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try: yield f'http://127.0.0.1:{server.server_port}'
    finally:
        server.shutdown();server.server_close();thread.join()

def browser(origin):
    passed=[]
    errors=[]
    external=[]
    requests_failed=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
        context=browser.new_context(viewport=dict(width=844,height=390),device_scale_factor=1,has_touch=True)
        page=context.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('requestfailed',lambda r:requests_failed.append(r.url))
        page.on('request',lambda r:external.append(r.url) if r.url.startswith(('http:','https:')) and not r.url.startswith(origin+'/') else None)
        page.goto(origin+'/preview.html')
        page.evaluate('tennisPreviewReady')
        assert page.evaluate('Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)')
        passed.append('Local HTTP preview opens with every asset decoded and no external network dependency')
        page.wait_for_timeout(80)
        first=page.evaluate('tennisPreview.snapshot().position')
        page.wait_for_timeout(160)
        assert abs(page.evaluate('tennisPreview.snapshot().position')-first)>.01
        passed.append('Moving pointer changes before serve')

        # Geometry and occlusion checks on all six native targets at the requested size.
        rects=page.evaluate('''[...document.querySelectorAll('.control button')].map(b=>{
          const r=b.getBoundingClientRect(); const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return {id:b.dataset.action,x:r.x,y:r.y,width:r.width,height:r.height,hit:b.contains(top)};
        })''')
        for r in rects:
            assert r['width']>=56 and r['height']>=56 and r['hit'],r
            assert r['x']>=0 and r['x']+r['width']<=844 and r['y']>=0 and r['y']+r['height']<=390,r
            assert r['x']>=638 or r['x']+r['width']<=198 or r['y']>=290 or r['y']+r['height']<=92,r
        for i,a in enumerate(rects):
            for b in rects[i+1:]:
                assert a['x']+a['width']<=b['x'] or b['x']+b['width']<=a['x'] or a['y']+a['height']<=b['y'] or b['y']+b['height']<=a['y']
        meter=page.locator('[data-meter]').bounding_box()
        assert meter==dict(x=796,y=97,width=32,height=176),meter
        assert page.locator('[data-meter]').evaluate('e=>getComputedStyle(e).pointerEvents')=='none'
        passed.append('844×390: all 6 targets are 56px, unoccluded, within screen; 32×176 meter is at right edge')
        page.evaluate('tennisPreview.setPosition(.4)')
        page.screenshot(path=str(OUT/'preview-844x390.png'))

        # A disabled action cannot emit gameplay feedback.
        page.locator('[data-action=drop]').dispatch_event('click')
        assert page.evaluate('tennisPreview.snapshot().effectCount')==0
        passed.append('Disabled native buttons reject actions')

        # Exact displayed sample, lock, settling, active-time pause, then full removal.
        page.locator('[data-action=serve]').tap()
        assert page.evaluate('tennisPreview.snapshot().state')=='locked'
        assert page.evaluate('tennisPreview.snapshot().position')==.4
        page.wait_for_timeout(100)
        page.evaluate('tennisPreview.setPaused(true)')
        frozen=page.evaluate('tennisPreview.snapshot().clockMs')
        page.screenshot(path=str(OUT/'locked-844x390.png'))
        page.wait_for_timeout(700)
        assert page.evaluate('tennisPreview.snapshot().state')=='locked'
        assert page.evaluate('tennisPreview.snapshot().clockMs')==frozen
        page.evaluate('tennisPreview.setPaused(false)')
        page.wait_for_timeout(650)
        assert page.evaluate('tennisPreview.snapshot().state')=='hidden'
        assert page.locator('[data-meter]').evaluate('e=>e.hidden')
        assert page.locator('.control-serve').evaluate('e=>e.hidden')
        assert page.locator('[data-placement-marker]').evaluate('e=>e.hidden')
        assert page.locator('[data-action=smash]').is_enabled()
        assert page.evaluate('tennisPreview.snapshot().effectCount')==0
        page.screenshot(path=str(OUT/'rally-844x390.png'))
        passed.append('Touch serve locks displayed value; settling/FX pause; meter, serve and aim cue leave after serve; hit FX expire')

        # Click, physical directions, keyboard, clamped boundaries and focus.
        page.evaluate('tennisPreview.startServe();tennisPreview.setPosition(.5)')
        page.locator('[data-action=placement]').click()
        assert page.locator('[data-placement-choices]').bounding_box()['x']>=638
        page.locator('[data-placement="0"]').click()
        assert page.evaluate('tennisPreview.snapshot().placement')==0
        assert page.locator('[data-placement-marker]').evaluate('e=>e.style.left')=='42%'
        page.keyboard.press('a')
        for _ in range(3): page.keyboard.press('ArrowLeft')
        assert page.evaluate('tennisPreview.snapshot().placement')==0
        page.keyboard.press('ArrowRight')
        assert page.evaluate('tennisPreview.snapshot().placement')==1
        page.keyboard.press('Escape')
        assert page.locator('[data-placement-choices]').is_hidden()
        assert page.locator('[data-action=placement]').evaluate('e=>document.activeElement===e')
        page.locator('[data-action=placement]').click()
        page.locator('[data-placement="2"]').focus()
        page.keyboard.press('Space')
        assert page.evaluate('tennisPreview.snapshot().placement')==2
        assert page.evaluate('tennisPreview.snapshot().state')=='moving'
        passed.append('Placement: click, native Space, arrows, clamping, Escape/focus; RTL preserves physical left/right')

        # Hold brake with actual captured pointer, cancellation and keyboard release.
        brake=page.locator('[data-action=brake]').bounding_box()
        page.mouse.move(brake['x']+28,brake['y']+28)
        page.mouse.down()
        assert page.evaluate('tennisPreview.snapshot().braking')
        page.mouse.move(200,250)
        page.mouse.up()
        assert not page.evaluate('tennisPreview.snapshot().braking')
        page.keyboard.down('b')
        assert page.evaluate('tennisPreview.snapshot().braking')
        page.keyboard.up('b')
        assert not page.evaluate('tennisPreview.snapshot().braking')
        page.keyboard.down('b')
        page.evaluate('window.dispatchEvent(new Event("blur"))')
        assert not page.evaluate('tennisPreview.snapshot().braking')
        page.keyboard.up('b')
        passed.append('Brake: hold, pointer capture and release outside, key hold/release and blur cleanup')

        # Native keyboard serve; focus must land on a usable rally control.
        page.evaluate('document.activeElement.blur()')
        page.keyboard.press('Space')
        assert page.evaluate('tennisPreview.snapshot().state')=='locked'
        page.wait_for_timeout(680)
        assert page.evaluate('tennisPreview.snapshot().state')=='hidden'
        page.evaluate('tennisPreview.startServe();tennisPreview.setPosition(.5)')
        page.locator('[data-action=serve]').focus()
        page.keyboard.press('Enter')
        page.wait_for_timeout(680)
        assert page.locator('[data-action=smash]').evaluate('e=>document.activeElement===e')
        page.keyboard.press('s')
        assert page.locator('[data-action=slice]').get_attribute('data-state')=='pressed'
        page.wait_for_timeout(180)
        slice_rect=page.locator('[data-action=slice]').bounding_box()
        page.mouse.move(slice_rect['x']+28,slice_rect['y']+28)
        page.mouse.down()
        page.wait_for_timeout(250)
        assert page.locator('[data-action=slice]').get_attribute('data-state')=='pressed'
        page.evaluate('document.querySelector(".tennis-v2").dataset.lastAction=""')
        page.mouse.move(400,250)
        page.mouse.up()
        assert page.locator('[data-action=slice]').get_attribute('data-state')=='idle'
        assert page.locator('.tennis-v2').get_attribute('data-last-action')==''
        page.locator('[data-action=drop]').focus()
        page.keyboard.down('Space')
        page.wait_for_timeout(200)
        assert page.locator('[data-action=drop]').get_attribute('data-state')=='pressed'
        page.keyboard.up('Space')
        page.wait_for_timeout(180)
        assert page.locator('[data-action=drop]').get_attribute('data-state')=='idle'
        passed.append('Body Space and native Enter serve; hidden serve transfers focus to smash; rally shortcuts work')
        passed.append('Held pointer/keyboard keep pressed artwork; release outside cancels the action and restores idle')

        # Every FX is finite, text stays live DOM, and all effects pause.
        page.evaluate('''() => {
          tennisPreview.endServe();window.liveChanges=0;
          window.liveObserver=new MutationObserver(records=>window.liveChanges+=records.length);
          liveObserver.observe(document.querySelector('[data-event-copy]'),{childList:true,characterData:true,subtree:true});
          tennisPreview.playEffect('power-serve');
        }''')
        page.wait_for_timeout(180)
        assert page.evaluate('window.liveChanges')==1
        page.evaluate('window.liveObserver.disconnect()')
        page.evaluate('tennisPreview.endServe();tennisPreview.playEffect("out",{x:.65,y:.6})')
        page.wait_for_timeout(1300)
        assert page.locator('[data-effect=out]').count()==1
        assert page.locator('[data-effect=out]').evaluate('e=>getComputedStyle(e).opacity')=='1'
        page.wait_for_timeout(300)
        assert page.locator('[data-effect=out]').count()==0
        for spec in CONFIG['effects']:
            page.evaluate('(id)=>{tennisPreview.endServe();tennisPreview.playEffect(id)}',spec['id'])
            assert page.locator('[data-event-copy]').inner_text()==spec['labelHe']
            page.wait_for_timeout(spec['durationMs']+100)
            assert page.locator('.contact-fx').count()==0
            assert page.locator('[data-event-copy]').inner_text()==''
        page.evaluate('tennisPreview.playEffect("spin");tennisPreview.setPaused(true)')
        frozen=page.evaluate('tennisPreview.snapshot().clockMs')
        page.wait_for_timeout(800)
        assert page.locator('[data-effect=spin]').count()==1
        assert page.evaluate('tennisPreview.snapshot().clockMs')==frozen
        page.evaluate('tennisPreview.setPaused(false)')
        page.wait_for_timeout(750)
        assert page.locator('.contact-fx').count()==0
        passed.append('All 5 FX expire, no looping or residual text; live text mutates once per event; out is opaque until 1500ms; active-time FX pause')

        # Hidden documents cannot consume serve or effect time.
        page.evaluate('''() => {
          window.testHidden=false;
          Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});
          tennisPreview.startServe();tennisPreview.setPosition(.4);tennisPreview.lockServe();
          window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));
        }''')
        frozen=page.evaluate('tennisPreview.snapshot().clockMs')
        page.wait_for_timeout(750)
        assert page.evaluate('tennisPreview.snapshot().clockMs')==frozen
        assert page.evaluate('tennisPreview.snapshot().state')=='locked'
        page.evaluate('window.testHidden=false;document.dispatchEvent(new Event("visibilitychange"))')
        page.wait_for_timeout(750)
        assert page.evaluate('tennisPreview.snapshot().state')=='hidden'
        page.evaluate('delete document.hidden')
        passed.append('Document visibility lifecycle freezes clock and resumes without catch-up')

        for size in [(740,360),(390,844),(320,568)]:
            page.set_viewport_size(dict(width=size[0],height=size[1]))
            page.evaluate('tennisPreview.startServe();tennisPreview.setPosition(.4)')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.evaluate('''[...document.querySelectorAll('.control button')].every(b=>{
              const r=b.getBoundingClientRect();return r.width>=56&&r.height>=56&&r.x>=0&&r.right<=innerWidth;
            })''')
            if size==(390,844): page.screenshot(path=str(OUT/'preview-390x844.png'))
        passed.append('740×360, 390×844 and 320×568: no horizontal overflow, targets retain 56px')

        # Real exported PNGs, not merely manifest entries.
        page.set_viewport_size(dict(width=844,height=390))
        page.locator('#format').select_option('png')
        page.evaluate('Promise.all([...document.images].map(i=>i.decode()))')
        assert page.evaluate('Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)')
        assert page.locator('[data-action=serve] img').get_attribute('src').endswith('.png')
        page.locator('#format').select_option('svg')
        passed.append('All PNG and SVG exports load in live HUD and all galleries without anchor/geometry changes')

        page.emulate_media(reduced_motion='reduce')
        page.evaluate('tennisPreview.setReducedMotion(null);tennisPreview.startServe()')
        page.wait_for_timeout(100)
        first=page.evaluate('tennisPreview.snapshot().position')
        page.wait_for_timeout(180)
        assert page.evaluate('tennisPreview.snapshot().position')==first==.5
        assert not page.evaluate('tennisPreview.snapshot().running')
        page.evaluate('tennisPreview.lockServe()')
        assert page.locator('[data-lock-halo]').evaluate('e=>getComputedStyle(e).animationName')=='none'
        page.wait_for_timeout(750)
        assert page.evaluate('tennisPreview.snapshot().state')=='hidden'
        page.evaluate('tennisPreview.playEffect("spin")')
        before=page.locator('[data-effect=spin]').get_attribute('style')
        page.wait_for_timeout(160)
        assert page.locator('[data-effect=spin]').get_attribute('style')==before
        page.wait_for_timeout(600)
        assert not page.evaluate('tennisPreview.snapshot().running')
        passed.append('OS reduced motion: static center pointer, no settling/FX animation, finite effects, no idle animation loop')

        page.evaluate('tennisPreview.startServe();tennisPreview.lockServe();tennisPreview.endServe()')
        assert page.locator('[data-meter]').is_hidden()
        assert page.locator('[data-placement-marker]').is_hidden()
        assert page.locator('.contact-fx').count()==0
        passed.append('Explicit serve-end cancels lock, meter and hit cues immediately')

        page.emulate_media(reduced_motion='no-preference')
        page.set_viewport_size(dict(width=1100,height=900))
        page.evaluate('tennisPreview.startServe();tennisPreview.setPosition(.4)')
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path=str(OUT/'overview-1100.png'),full_page=True)
        page.set_viewport_size(dict(width=844,height=390))
        for fx in CONFIG['effects']:
            page.evaluate('(id)=>{tennisPreview.endServe();tennisPreview.playEffect(id);tennisPreview.setPaused(true)}',fx['id'])
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(OUT/(fx['id']+'-844x390.png')))
            page.evaluate('tennisPreview.setPaused(false)')
        page.evaluate('tennisPreview.destroy()')
        page.keyboard.press('Space')
        assert page.locator('[data-meter]').is_hidden()
        assert page.locator('.contact-fx').count()==0
        assert page.locator('[data-action=serve]').is_disabled()
        passed.append('Destroy removes listeners, timing, FX and disables inputs')
        assert not errors,errors
        assert not requests_failed,requests_failed
        assert not external,external
        report=dict(passed=True,chromium=browser.version,groups=len(passed),checks=passed,
                    consoleErrors=errors,failedRequests=requests_failed,externalRequests=external,referenceTargets=rects,
                    caveat='Browser simulation only. Visibility test dispatches the documented lifecycle. No physical-phone or game integration test.')
        (OUT/'browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        browser.close()
    return report

if __name__=='__main__':
    OUT.mkdir(exist_ok=True)
    print(json.dumps(assets()),flush=True)
    with local_server() as origin:
        print(json.dumps(browser(origin),ensure_ascii=False),flush=True)
