"""Serve ONLY this folder and verify the real preview, controls and all 264 fits.
Requires Python Playwright + Pillow and Chromium. No browser downloads or npm.
"""
import functools
import hashlib
import http.server
import io
import json
import os
from pathlib import Path
import threading
import time

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'verification'
OUT.mkdir(exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/preview.html'
report = {'schemaVersion': 1, 'passed': False, 'viewport': {'width': 844, 'height': 390},
          'standaloneFolderServer': True, 'externalRequests': [], 'pageErrors': [], 'consoleErrors': [],
          'httpErrors': [], 'failedRequests': [], 'combinations': [], 'screenshots': []}


def screenshot(page, name):
    image = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
    assert image.size == (844, 390)
    path = OUT / name
    image.save(path, 'WEBP', quality=88, method=6)
    report['screenshots'].append({'file': str(path.relative_to(ROOT)), 'width': 844, 'height': 390,
                                  'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return image


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=1,
                                      service_workers='block', has_touch=True)

        def route(request_route):
            if request_route.request.url.startswith((f'http://127.0.0.1:{server.server_port}/', 'blob:', 'data:')):
                request_route.continue_()
            else:
                report['externalRequests'].append(request_route.request.url)
                request_route.abort()

        context.route('**/*', route)
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
        page.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
        page.on('response', lambda response: report['httpErrors'].append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
        page.on('requestfailed', lambda request: report['failedRequests'].append({'url': request.url, 'failure': request.failure}))
        page.add_init_script("window.__kitCsp=[];addEventListener('securitypolicyviolation',e=>window.__kitCsp.push({directive:e.effectiveDirective,uri:e.blockedURI}));")
        started = time.monotonic()
        page.goto(url, wait_until='networkidle')
        page.wait_for_function('() => window.__soccerKitLab?.ready || window.__soccerKitLab?.error', timeout=60000)
        assert page.evaluate('() => window.__soccerKitLab.ready'), page.evaluate('() => window.__soccerKitLab.error')
        report['initialLoadSeconds'] = round(time.monotonic() - started, 3)
        assert page.locator('.kit-card').count() == 8
        assert page.locator('[data-venue]').count() == 3
        assert page.locator('#number option').count() == 11
        layout = page.evaluate('''() => ({width:innerWidth,height:innerHeight,
          scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
          controlBottom:document.querySelector('.hint').getBoundingClientRect().bottom,
          mainBottom:document.querySelector('main').getBoundingClientRect().bottom})''')
        assert layout['scrollWidth'] == 844 and layout['scrollHeight'] == 390, layout
        assert layout['controlBottom'] <= layout['mainBottom'] + 1, layout
        report['layout'] = layout
        kit_images = []
        for venue in range(3):
            page.locator(f'[data-venue="{venue}"]').click()
            page.wait_for_function('(i) => window.__soccerKitLab.diagnostics().venue===i', arg=venue)
            page.locator('button[data-mode="kits"]').click()
            for kit in range(8):
                page.locator(f'[data-kit="{kit}"]').click()
                page.wait_for_function('(i) => window.__soccerKitLab.diagnostics().kit===i', arg=kit)
                heading = page.evaluate('''() => {
                  const h=document.getElementById('kit-title'),p=document.getElementById('palette');
                  return {titleBottom:h.getBoundingClientRect().bottom,paletteTop:p.getBoundingClientRect().top,
                    scrollWidth:h.scrollWidth,width:h.clientWidth};
                }''')
                assert heading['titleBottom'] <= heading['paletteTop'] and heading['scrollWidth'] <= heading['width'], heading
                results = page.evaluate('''() => {
                  const api=window.__soccerKitLab,result=[];
                  for(let n=1;n<=11;n++){
                    const select=document.getElementById('number');select.value=String(n);select.dispatchEvent(new Event('change',{bubbles:true}));
                    const d=api.diagnostics();
                    if(d.number!==n||d.actors.length!==2||d.actors.some(a=>a.number!==n||a.canonicalBones.length!==18||!a.numberUsesBodySkeleton))
                      throw Error('Number/skeleton mismatch at '+d.kitId+' '+n);
                    if(d.renderer.textures>2)throw Error('Bone textures leaked after a kit switch: '+d.renderer.textures);
                    result.push({kit:d.kitId,venue:d.venueId,number:n,canonical:true,sharedNumberSkin:true,triangles:d.renderer.triangles,drawCalls:d.renderer.drawCalls,boneTextures:d.renderer.textures});
                  }
                  return result;
                }''')
                report['combinations'].extend(results)
                if venue == 0:
                    page.evaluate('''() => {const a=window.__soccerKitLab;a.setNumber(a.kitData.kits[a.diagnostics().kit].defaultNumber);a.setView('pair');}''')
                    kit_id = page.evaluate('() => window.__soccerKitLab.diagnostics().kitId')
                    kit_images.append(screenshot(page, f'kit-{kit+1:02}-{kit_id}-844x390.webp'))
            # Venue mode must render the actual exported model, including all three tiers.
            page.locator('button[data-mode="venue"]').click()
            diag = page.evaluate('() => window.__soccerKitLab.diagnostics()')
            assert all(node['present'] for node in diag['venueNodes']), diag
            screenshot(page, f'venue-{venue+1:02}-{diag["venueId"]}-844x390.webp')
            print(f'verified venue {venue+1}/3, {len(report["combinations"])} kit/number/venue combinations', flush=True)
        assert len(report['combinations']) == 264
        # Contact sheet: actual renders, with no overpainting of the kit assets.
        sheet = Image.new('RGB', (1688, 390), '#10212b')
        for i, image in enumerate(kit_images):
            sheet.paste(image.resize((422, 195), Image.Resampling.LANCZOS), ((i % 4)*422, (i // 4)*195))
        sheet.save(OUT / 'kits-overview.webp', 'WEBP', quality=88, method=6)
        page.evaluate('''async () => {const a=window.__soccerKitLab;await a.setVenue(0);await a.setKit(5);a.setMode('kits');a.setView('back');}''')
        numbers = Image.new('RGB', (1020, 460), '#10212b')
        draw = ImageDraw.Draw(numbers)
        for n in range(1, 12):
            page.locator('#number').select_option(str(n))
            image = Image.open(io.BytesIO(page.screenshot())).convert('RGB').crop((247, 78, 417, 286))
            x, y = ((n-1) % 6)*170, ((n-1) // 6)*230
            numbers.paste(image, (x, y));draw.text((x+78, y+210), str(n), fill='#d3ed8b')
        numbers.save(OUT / 'numbers-01-11.webp', 'WEBP', quality=91, method=6)
        # Actual run playback changes bone-driven poses while keeping the shared skin.
        page.locator('[data-view="pair"]').click()
        page.locator('#motion').click()
        page.wait_for_function('() => window.__soccerKitLab.diagnostics().actors[0].animationTime>.2')
        moving = page.evaluate('() => window.__soccerKitLab.diagnostics()')
        assert moving['playing'] and all(a['numberUsesBodySkeleton'] for a in moving['actors'])
        page.locator('#motion').click()
        assert not page.evaluate('() => window.__soccerKitLab.diagnostics().playing')
        page.locator('[data-view="front"]').click()
        assert page.evaluate('() => window.__soccerKitLab.diagnostics().view') == 'front'
        page.locator('#canvas').focus()
        page.keyboard.press('ArrowRight')
        assert page.evaluate('() => window.__soccerKitLab.diagnostics().yaw') > 0
        page.keyboard.press('Home')
        assert page.evaluate('() => window.__soccerKitLab.diagnostics().yaw') == 0
        report['controls'] = {'kitAndVenueButtons': True, 'allNumberOptions': True, 'frontBackPair': True,
                              'runPlayback': True, 'keyboardRotationAndReset': True}
        report['invalidNumbersRejected'] = page.evaluate('''() => [-1,0,12,1.5,NaN].map(n=>{
          try{window.__soccerKitLab.setNumber(n);return false;}catch(e){return e instanceof RangeError;}
        }).every(Boolean)''')
        assert report['invalidNumbersRejected']
        report['cspViolations'] = page.evaluate('() => window.__kitCsp')
        # Supplemental portrait layout check; requested acceptance size remains 844x390.
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_function('() => document.getElementById("canvas").width>0')
        portrait = page.evaluate('() => ({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight})')
        assert portrait['scrollWidth'] == 390 and portrait['scrollHeight'] == 844, portrait
        report['portrait'] = portrait
        page.set_viewport_size({'width': 844, 'height': 390})
        page.evaluate('''async () => {const a=window.__soccerKitLab;await a.setKit(0);await a.setVenue(0);a.setNumber(7);a.setView('pair');}''')
        screenshot(page, 'preview-844x390.webp')
        for key in ['externalRequests', 'pageErrors', 'consoleErrors', 'httpErrors', 'failedRequests', 'cspViolations']:
            assert not report[key], (key, report[key])
        context.close()
        # Isolated negative fixture: a missing GLB gives a visible failure and a retry action.
        negative = browser.new_context(viewport={'width': 844, 'height': 390}, service_workers='block')
        negative.route('**/kits/ridge-red.glb', lambda route: route.fulfill(status=404, body='Deliberate missing-asset fixture'))
        failed = negative.new_page();failed.goto(url)
        failed.wait_for_function('() => !!window.__soccerKitLab?.error')
        assert failed.locator('#error').is_visible() and failed.locator('#retry').is_visible()
        report['missingAssetFixture'] = {'expectedFailure': True, 'visibleError': True, 'retryAvailable': True}
        negative.close();browser.close()
    report['passed'] = True
finally:
    server.shutdown();server.server_close()
    report['browser'] = 'Chromium / ANGLE SwiftShader; emulated viewport, not a physical phone or GPU performance result.'
    (OUT / 'browser.json').write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n')
print(json.dumps({'passed': report['passed'], 'combinations': len(report['combinations']), 'screenshots': len(report['screenshots'])}))
