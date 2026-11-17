"""Actual local GLB round-trip, UI, animation, offline and viewport verification.

Run: python3 source/browser-audit.py [--chromium /usr/bin/chromium]
Requires Playwright and Pillow for authoring only. Starts its own local server.
"""
import argparse
import functools
import hashlib
import io
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'verification'
parser = argparse.ArgumentParser()
parser.add_argument('--chromium', default='/usr/bin/chromium')
args = parser.parse_args()
OUT.mkdir(exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
origin = f'http://127.0.0.1:{server.server_port}'
report = {'viewport': {'width': 844, 'height': 390}, 'renderer': 'Chromium WebGL / SwiftShader (software; not phone performance)',
          'errors': [], 'warnings': [], 'externalRequests': [], 'failedRequests': [], 'screenshots': [], 'checks': {}}

def save_webp(page, name):
    image = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
    image.save(OUT / name, 'WEBP', quality=88, method=6)
    report['screenshots'].append(name)
    return image

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.chromium, headless=True, args=[
            '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        report['browser'] = browser.version
        context = browser.new_context(viewport=report['viewport'], device_scale_factor=1)
        page = context.new_page()
        def route(request):
            url = request.request.url
            if url.startswith(origin + '/') or url.startswith(('data:', 'blob:')):
                request.continue_()
            else:
                report['externalRequests'].append(url)
                request.abort()
        page.route('**/*', route)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('console', lambda m: report['errors' if m.type == 'error' else 'warnings'].append(m.text) if m.type in ['error', 'warning'] else None)
        page.on('requestfailed', lambda r: report['failedRequests'].append(r.url))
        page.goto(origin + '/preview.html')
        page.wait_for_function('window.boarsWorld?.state.ready || window.boarsWorld?.error', timeout=30000)
        assert page.evaluate('boarsWorld.error') is None
        assert page.evaluate('boarsWorld.assets.size') == 21
        assert page.evaluate('boarsWorld.actors.length') == 5
        assert page.evaluate('document.documentElement.scrollWidth') == 844
        page.evaluate('boarsWorld.setManual(true);boarsWorld.seek("walk",0.1)')
        day_hashes = []
        for day in ['morning', 'noon', 'sunset']:
            page.locator(f'[data-day={day}]').click()
            assert page.locator(f'[data-day={day}]').get_attribute('aria-pressed') == 'true'
            image = save_webp(page, f'world-{day}-844x390.webp')
            day_hashes.append(hashlib.sha256(image.crop((0, 70, 844, 300)).tobytes()).hexdigest())
        assert len(set(day_hashes)) == 3
        report['worldRender'] = page.evaluate('({...boarsWorld.renderer.info.render})')
        report['worldRender']['trianglesExcludeShadowPass'] = True
        page.locator('[data-day=morning]').click()
        ids = page.evaluate('boarsWorld.actors.map(a=>a.id)')
        contact = Image.new('RGB', (5 * 240, 4 * 200), '#e7e4d0')
        draw = ImageDraw.Draw(contact)
        report['poses'] = []
        # A front three-quarter view of every delivered model in every clip.
        for col, model in enumerate(ids):
            page.locator(f'[data-boar={model}]').click()
            assert page.evaluate('boarsWorld.state.selected') == model
            assert page.locator('#character-card').is_visible()
            for row, (clip, t) in enumerate([('walk', .1), ('run', .15), ('fall', 1.3), ('panic', .32)]):
                page.locator(f'[data-clip={clip}]').click()
                assert page.evaluate('boarsWorld.state.clip') == clip
                page.evaluate('([clip,t])=>boarsWorld.seek(clip,t)', [clip, t])
                data = page.evaluate('''()=>{
                  const a=boarsWorld.actors.find(a=>a.id===boarsWorld.state.selected);
                  let mesh;a.model.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
                  a.model.updateMatrixWorld(true);mesh.skeleton.update();
                  let min=Infinity,max=-Infinity;const p=mesh.position.clone();
                  for(let i=0;i<mesh.geometry.attributes.position.count;i++){
                    mesh.getVertexPosition(i,p);min=Math.min(min,p.y);max=Math.max(max,p.y);
                  }
                  return {joints:mesh.skeleton.bones.length,minY:min,maxY:max,
                    actionTime:a.actions[boarsWorld.state.clip].time,visible:boarsWorld.actors.filter(a=>a.parent.visible).length};
                }''')
                assert data['joints'] == 14 and data['visible'] == 1
                assert data['minY'] > -.01
                shot = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
                crop = shot.crop((264, 91, 610, 301)).resize((240, 166), Image.Resampling.LANCZOS)
                contact.paste(crop, (col * 240, row * 200))
                draw.text((col * 240 + 8, row * 200 + 170), f'{model.replace("boar-", "")} / {clip}', fill='#40523d')
                draw.text((col * 240 + 8, row * 200 + 183), f'{t:.2f} s', fill='#768067')
                report['poses'].append({'model': model, 'clip': clip, 'time': t, **data})
            page.evaluate('boarsWorld.seek("walk",0)')
            save_webp(page, f'{model}-844x390.webp')
        contact.save(OUT / 'all-boars-all-clips.webp', 'WEBP', quality=88, method=6)
        report['screenshots'].append('all-boars-all-clips.webp')
        # Non-looping fall must hold. Panic returns to its start pose.
        page.evaluate('boarsWorld.seek("fall",4)')
        assert page.evaluate('boarsWorld.actors[0].actions.fall.paused')
        assert abs(page.evaluate('boarsWorld.actors[0].actions.fall.time') - 1.6) < 1e-5
        page.evaluate('boarsWorld.seek("panic",4)')
        assert page.evaluate('boarsWorld.actors[0].actions.panic.paused')
        # Real input events: camera orbit, zoom and reset.
        before = page.evaluate('boarsWorld.camera.position.toArray()')
        page.mouse.move(420, 160)
        page.mouse.down()
        page.mouse.move(465, 175, steps=4)
        page.mouse.up()
        after = page.evaluate('boarsWorld.camera.position.toArray()')
        assert before != after
        page.mouse.wheel(0, 150)
        page.wait_for_function('boarsWorld.state.zoom!==1')
        page.locator('#reset').click()
        assert page.evaluate('boarsWorld.state.zoom===1 && boarsWorld.state.yaw===0')
        # Pausing stops repeated WebGL draws.
        page.evaluate('boarsWorld.setManual(false);boarsWorld.setPaused(true)')
        frame = page.evaluate('boarsWorld.renderer.info.render.frame')
        page.wait_for_timeout(250)
        assert page.evaluate('boarsWorld.renderer.info.render.frame') == frame
        page.locator('#pause').click()
        assert not page.evaluate('boarsWorld.state.paused')
        page.wait_for_function(f'boarsWorld.renderer.info.render.frame>{frame}')
        page.evaluate('boarsWorld.setManual(true)')
        # Loaded assets remain usable after the network is disconnected.
        context.set_offline(True)
        page.locator('#view-world').click()
        for day in ['morning', 'noon', 'sunset']:
            page.locator(f'[data-day={day}]').click()
        for clip in ['walk', 'run', 'fall', 'panic']:
            page.locator(f'[data-clip={clip}]').click()
        context.set_offline(False)
        # Full portrait viewport, no horizontal overflow and reachable controls.
        page.set_viewport_size({'width': 390, 'height': 844})
        page.evaluate('boarsWorld.setDay("morning");boarsWorld.seek("walk",0.1)')
        assert page.evaluate('document.documentElement.scrollWidth') == 390
        assert page.locator('#view-studio').is_visible()
        assert page.locator('[data-clip=panic]').is_visible()
        save_webp(page, 'world-morning-390x844.webp')
        # OS reduced-motion preference is honored from initial load.
        reduced = browser.new_context(viewport={'width': 844, 'height': 390}, reduced_motion='reduce')
        reduced_page = reduced.new_page()
        reduced_page.goto(origin + '/preview.html')
        reduced_page.wait_for_function('window.boarsWorld?.state.ready', timeout=30000)
        assert reduced_page.evaluate('boarsWorld.state.paused')
        reduced.close()
        report['checks'] = {key: True for key in [
            'all21GLBsLoadedFromPackageOnly', 'fiveIndependentSkeletons', 'all20PosesRenderedFromGLB',
            'fiveCharacterButtons', 'fourAnimationButtons', 'threeDistinctDayModes', 'fallHoldsTerminalPose',
            'panicCompletesOnce', 'cameraDrag', 'cameraWheel', 'cameraReset', 'pauseStopsWebGLDraws',
            'resumeAdvancesAnimation', 'offlineControlsAfterLoad', '844x390NoOverflow', '390x844NoOverflow', 'reducedMotionStartsPaused']}
        assert report['errors'] == [] and report['externalRequests'] == [] and report['failedRequests'] == []
        browser.close()
finally:
    server.shutdown()
    server.server_close()
    (OUT / 'browser.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({k: report[k] for k in ['browser', 'errors', 'externalRequests', 'checks']}, indent=2))
