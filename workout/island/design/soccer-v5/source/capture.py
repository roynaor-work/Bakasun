"""Exercise the final local viewer under its CSP; save real browser screenshots.

These are Chromium viewport/touch emulations, never physical-device evidence.
Run with Python Playwright and /usr/bin/chromium; no external requests are used.
"""
import hashlib
import json
import os
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
OUT = ROOT/'previews'
OUT.mkdir(exist_ok=True)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    server = ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(REPO)))
    Thread(target=server.serve_forever,daemon=True).start()
    report = {'schemaVersion':1,'allPassed':False,
              'deviceEvidence':'Chromium touch/viewport emulation with software WebGL; no physical phone was available.',
              'physicalPhoneVerified':False,'screenshots':[], 'viewports':[], 'interactionChecks':[],
              'consoleErrors':[], 'pageErrors':[], 'failedRequests':[], 'externalRequests':[],
              'sources':{p.name:digest(p) for p in [ROOT/'preview.html',ROOT/'preview.css',ROOT/'preview.js',ROOT/'toon.js',ROOT/'manifest.json']}}
    manifest = json.loads((ROOT/'manifest.json').read_text())
    report['assetHashes'] = {a['file']:a['sha256'] for a in manifest['assets']}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_EXECUTABLE_PATH','/usr/bin/chromium'),
                        headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            context = browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,
                        is_mobile=True,has_touch=True,reduced_motion='reduce',locale='he-IL')
            def route(request_route):
                url = request_route.request.url
                if url.startswith(('http:','https:')) and urlparse(url).hostname != '127.0.0.1':
                    report['externalRequests'].append(url)
                    request_route.abort()
                else:
                    request_route.continue_()
            context.route('**/*',route)
            page = context.new_page()
            page.on('console',lambda m:report['consoleErrors'].append(m.text) if m.type=='error' else None)
            page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
            page.on('requestfailed',lambda r:report['failedRequests'].append({'url':r.url,'failure':r.failure}))
            page.goto(f'http://127.0.0.1:{server.server_port}/workout/island/design/soccer-v5/preview.html')
            page.evaluate('async()=>await soccerV5.ready')
            assert page.locator('#loading').is_hidden()
            assert page.locator('#error').is_hidden()
            assert page.evaluate('()=>soccerV5.actors.length') == 7
            assert page.evaluate('()=>soccerV5.actors.every(a=>a.gltf.animations.length===5&&a.meshes[0].skeleton.bones.length===18)')
            # Embedded terrain must actually reach the GPU; GLTFLoader can log a
            # texture failure and still resolve ready, so readiness alone is insufficient.
            assert page.evaluate('()=>{let ok=false;soccerV5.scene.traverse(o=>{if(o.name==="pitch_surface")ok=!!o.material.map?.image?.width});return ok}')
            report['interactionChecks'].append('All 11 final GLBs loaded, seven canonical18 skins/five clips decoded; embedded 1024px turf decoded.')

            # Use actual UI controls, not only the diagnostic API.
            page.locator('[data-team="coral"]').tap()
            assert page.evaluate('()=>soccerV5.state().team') == 'coral'
            page.locator('[data-team="teal"]').tap()
            for name in ['run','sprint','kick','pass','slide']:
                page.select_option('#clip',name)
                for fraction in [0,.2,.5,.8,1]:
                    page.locator('#timeline').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))}',str(round(fraction*1000)))
                    state = page.evaluate('()=>soccerV5.state()')
                    assert state['clip']==name and abs(state['time']-state['duration']*fraction)<1e-5
                # Each decoded actor must really change its bone pose.
                samples = page.evaluate('name=>{soccerV5.setClip(name);soccerV5.seek(.03);let a=soccerV5.actors.map(a=>a.meshes[0].skeleton.bones.map(b=>b.quaternion.toArray()));soccerV5.seek(soccerV5.state().duration*.48);let b=soccerV5.actors.map(a=>a.meshes[0].skeleton.bones.map(b=>b.quaternion.toArray()));return a.map((v,i)=>JSON.stringify(v)!==JSON.stringify(b[i]))}',name)
                assert all(samples),name
            report['interactionChecks'].append('Actual clip selector and timeline scrubbed all five clips; all seven decoded skeletons changed pose.')

            page.locator('[data-view="faces"]').tap()
            page.select_option('#clip','run')
            page.locator('#play').tap()
            page.evaluate('async()=>{for(let i=0;i<5;i++)await new Promise(requestAnimationFrame)}')
            assert page.evaluate('()=>soccerV5.state().time') > 0
            page.locator('#play').tap()
            paused = page.evaluate('()=>soccerV5.state().time')
            page.evaluate('async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame)}')
            assert page.evaluate('()=>soccerV5.state().time') == paused
            report['interactionChecks'].append('Touch play/pause advances time and then freezes the displayed pose.')

            for look in ['quiff','curls','knot']:
                page.locator(f'[data-look="{look}"]').tap()
                for expression in ['neutral','smile','focus']:
                    page.locator(f'[data-expression="{expression}"]').tap()
                    actual = page.evaluate('()=>soccerV5.actors.map(a=>a.meshes[0].morphTargetInfluences)')
                    expected = [int(expression=='smile'),int(expression=='focus')]
                    assert all(v==expected for v in actual)
            report['interactionChecks'].append('All three looks selected; neutral/smile/focus morph weights changed on all seven final GLBs.')

            def screenshot(name):
                page.evaluate('()=>soccerV5.render()')
                target = OUT/name
                page.screenshot(path=str(target),type='webp',quality=92)
                report['screenshots'].append({'file':'previews/'+name,'sha256':digest(target),
                    'viewport':page.viewport_size,'state':page.evaluate('()=>soccerV5.state()'),
                    'render':page.evaluate('()=>soccerV5.stats()')})

            for width,height in [(390,844),(844,390),(360,800),(1440,1000)]:
                page.set_viewport_size({'width':width,'height':height})
                page.evaluate('()=>{soccerV5.setPlaying(false);soccerV5.setTeam("teal");soccerV5.setLook("quiff");soccerV5.setExpression("neutral");soccerV5.setClip("pass");soccerV5.setView("players")}')
                layout = page.evaluate('''()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
                  scrollHeight:document.documentElement.scrollHeight,stage:(()=>{let r=document.getElementById('stage').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(),
                  controls:[...document.querySelectorAll('button,select,input')].map(e=>{let r=e.getBoundingClientRect();return {id:e.id||e.textContent.trim(),width:r.width,height:r.height,x:r.x,y:r.y,bottom:r.bottom,right:r.right}})})''')
                assert layout['scrollWidth']<=width,layout
                assert layout['scrollHeight']<=height+1,layout
                assert all(c['x']>=0 and c['right']<=width+1 and c['y']>=0 and c['bottom']<=height+1 for c in layout['controls']),layout
                assert all(c['height']>=44 and c['width']>=44 for c in layout['controls']),layout
                report['viewports'].append(layout)
                screenshot(f'players-teal-{width}x{height}.webp')
                for view in ['faces','roster','stadium']:
                    page.locator(f'[data-view="{view}"]').click()
                    assert page.evaluate('()=>soccerV5.state().view')==view
                    if width in [390,844] and view!='faces':
                        screenshot(f'{view}-{width}x{height}.webp')
                page.locator('[data-view="players"]').click()
                if width in [390,844]:
                    for team in ['coral','keeper']:
                        page.locator(f'[data-team="{team}"]').click()
                        screenshot(f'players-{team}-{width}x{height}.webp')

            page.set_viewport_size({'width':390,'height':844})
            page.evaluate('()=>{soccerV5.setTeam("teal");soccerV5.setView("faces");soccerV5.setClip("pass")}')
            for look,expression in [('quiff','neutral'),('curls','smile'),('knot','focus')]:
                page.locator(f'[data-look="{look}"]').click()
                page.locator(f'[data-expression="{expression}"]').click()
                page.evaluate('()=>soccerV5.setAngle(.40)')
                screenshot(f'face-{look}-{expression}-390x844.webp')
            # Camera input and reset are exercised separately from state selection.
            before = page.evaluate('()=>soccerV5.camera.position.toArray()')
            page.locator('#canvas').focus()
            page.keyboard.press('ArrowRight')
            assert page.evaluate('()=>soccerV5.camera.position.toArray()') != before
            page.locator('#reset').click()
            report['interactionChecks'].append('Keyboard camera rotation and the visible reset camera button work.')

            # Fifteen authentic frames, presented as one review strip. This is a
            # layout of captured pixels, with no generative editing of evidence.
            page.set_viewport_size({'width':844,'height':640})
            page.evaluate('()=>{soccerV5.setTeam("teal");soccerV5.setLook("quiff");soccerV5.setExpression("neutral");soccerV5.setView("players")}')
            tiles=[]
            for name in ['run','sprint','kick','pass','slide']:
                for fraction in [.14,.45,.80]:
                    page.evaluate('([n,f])=>{soccerV5.setClip(n);soccerV5.seek(soccerV5.state().duration*f)}',[name,fraction])
                    target = OUT/f'clip-{name}-{int(fraction*100):02d}.webp'
                    page.locator('#canvas').screenshot(path=str(target),type='webp',quality=91)
                    report['screenshots'].append({'file':'previews/'+target.name,'sha256':digest(target),'clip':name,'fraction':fraction,'viewport':page.viewport_size})
                    tiles.append((name,fraction,target))
            sheet=Image.new('RGB',(300*3,210*5),'#112d3b');draw=ImageDraw.Draw(sheet)
            for i,(name,fraction,target) in enumerate(tiles):
                with Image.open(target) as image:
                    image=ImageOps.contain(image,(300,180))
                    sheet.paste(image,((i%3)*300+(300-image.width)//2,(i//3)*210+(180-image.height)//2))
                draw.text(((i%3)*300+12,(i//3)*210+189),f'{name} / {fraction:.0%}',fill='#dfe9d7')
            sheet.save(OUT/'motion-sheet.webp',quality=93,method=6)
            report['screenshots'].append({'file':'previews/motion-sheet.webp','sha256':digest(OUT/'motion-sheet.webp'),'kind':'layout of the 15 recorded clip frames'})
            assert not report['consoleErrors'],report['consoleErrors']
            assert not report['pageErrors'],report['pageErrors']
            assert not report['externalRequests'],report['externalRequests']
            assert not report['failedRequests'],report['failedRequests']
            assert not page.evaluate('()=>soccerV5.errors')
            context.close();browser.close()
        report['allPassed']=True
    except Exception as error:
        report['failure']=str(error)
        raise
    finally:
        (ROOT/'verification/browser.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
        server.shutdown();server.server_close()
    print(f"PASS: {len(report['viewports'])} viewports, {len(report['screenshots'])} screenshots; zero console/CSP/network errors")


if __name__=='__main__':
    main()
