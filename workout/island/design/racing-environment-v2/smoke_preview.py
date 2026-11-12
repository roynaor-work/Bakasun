#!/usr/bin/env python3
"""Render the actual pack with Chromium, no WebAssembly. Pillow + Playwright.

Run from any directory: PYTHONDONTWRITEBYTECODE=1 python smoke_preview.py
Uses a temporary localhost server; updates only evidence/ beside this file.
"""
from __future__ import annotations

import hashlib
import io
import json
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
MODELS = ('grandstand', 'pit-building', 'start-gantry', 'control-tower',
          'tire-barrier', 'chainlink-fence', 'sponsor-board')
CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' blob:; worker-src 'none'; object-src 'none'; base-uri 'none'"


def wait_for(page, expression, timeout=45):
    # Playwright wait_for_function internally evals strings, forbidden by this CSP.
    # CDP evaluate does not weaken the page policy; application scripts still obey it.
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if page.evaluate(expression):
            return
        time.sleep(.04)
    raise AssertionError(f'Timed out: {expression}')


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        super().end_headers()


def main():
    output = HERE / 'evidence'
    output.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    result = {'result': 'PASS', 'browser': 'Chromium / SwiftShader (software WebGL)',
              'csp': CSP, 'webAssembly': 'unavailable before module startup',
              'models': [], 'textureCount': 0, 'errors': [],
              'physicalPhoneTested': False}
    path = HERE.relative_to(ROOT).as_posix() + '/preview.html'
    url = f'http://127.0.0.1:{server.server_port}/{path}'
    errors = result['errors']
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
                      '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'])
            context = browser.new_context(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
            context.add_init_script("Object.defineProperty(window, 'WebAssembly', {value:undefined, configurable:false});")
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            page.on('requestfailed', lambda r: errors.append(f'{r.url}: {r.failure}'))
            page.on('response', lambda r: errors.append(f'HTTP {r.status}: {r.url}') if r.status >= 400 and not r.url.endswith('favicon.ico') else None)
            page.goto(url, wait_until='networkidle')
            wait_for(page, 'window.__racingPreview?.ready === true')
            wait_for(page, 'window.__racingPreview.renderCount > 0')
            assert page.evaluate('typeof WebAssembly') == 'undefined'
            state = page.evaluate('({models:__racingPreview.loadedModels,textures:__racingPreview.loadedTextures,errors:__racingPreview.errors})')
            assert set(state['models']) == set(MODELS), state
            assert len(state['textures']) == 15, state
            assert not state['errors'], state
            result['textureCount'] = len(state['textures'])
            result['textureNames'] = sorted(state['textures'])
            result['overviewStats'] = page.evaluate('__racingPreview.drawStats || null')
            page.locator('#viewport').screenshot(path=str(output / 'overview.jpg'), type='jpeg', quality=85)

            def wait_render(action):
                before = page.evaluate('__racingPreview.renderCount')
                page.evaluate(action)
                wait_for(page, f'__racingPreview.renderCount > {before}')

            hashes = []
            for name in MODELS:
                wait_render(f"__racingPreview.focus({json.dumps(name)})")
                assert page.evaluate('__racingPreview.selectedModel') == name
                screenshot = page.locator('#viewport').screenshot(type='jpeg', quality=82)
                with Image.open(io.BytesIO(screenshot)) as image:
                    assert max(ImageStat.Stat(image).stddev) > 8, f'Blank render: {name}'
                digest = hashlib.sha256(screenshot).hexdigest()
                hashes.append(digest)
                stats = page.evaluate('__racingPreview.drawStats || null')
                if stats:
                    assert stats['triangles'] > 100 and stats['calls'] > 0
                result['models'].append({'name': name, 'rendered': True, 'captureSha256': digest, 'drawStats': stats})
                if name in ('grandstand', 'start-gantry', 'pit-building'):
                    (output / (name + '.jpg')).write_bytes(screenshot)
            assert len(set(hashes)) == 7, 'Focus modes did not render distinct scenes'
            wait_render("__racingPreview.setLighting('dusk')")
            assert page.evaluate('__racingPreview.lighting') == 'dusk'
            wait_render("__racingPreview.focus('start-gantry')")
            page.locator('#viewport').screenshot(path=str(output / 'gantry-dusk.jpg'), type='jpeg', quality=82)
            wait_render("__racingPreview.setLighting('day')")
            wait_render("__racingPreview.inspectTexture('asphalt-clean')")
            assert page.evaluate('__racingPreview.mode') == 'seams'
            page.locator('#viewport').screenshot(path=str(output / 'seams.jpg'), type='jpeg', quality=88)
            wait_render("__racingPreview.inspectTexture('kerb-red-white')")
            for name in state['textures']:
                wait_render(f'__racingPreview.inspectTexture({json.dumps(name)})')
            result['allTextureViewsRendered'] = True
            wait_render("__racingPreview.setMode('overview')")
            page.set_viewport_size({'width': 390, 'height': 844})
            page.wait_for_timeout(250)
            layout = page.evaluate('({scroll:document.documentElement.scrollWidth,width:innerWidth,canvas:document.querySelector("#scene").getBoundingClientRect().toJSON()})')
            assert layout['scroll'] <= layout['width'], layout
            assert layout['canvas']['width'] > 250 and layout['canvas']['height'] > 200, layout
            result['mobileLayout'] = layout
            page.screenshot(path=str(output / 'mobile.jpg'), type='jpeg', quality=82)
            # Exercise actual input and toolbar handlers, beyond the helper API.
            page.locator('#seams').click()
            assert page.evaluate('__racingPreview.mode') == 'seams'
            page.locator('#day').click()
            page.locator('#overview').click()
            viewport = page.locator('#viewport').bounding_box()
            page.mouse.move(viewport['x'] + viewport['width'] / 2, viewport['y'] + viewport['height'] / 2)
            page.mouse.down()
            page.mouse.move(viewport['x'] + viewport['width'] / 2 + 35, viewport['y'] + viewport['height'] / 2 + 15)
            page.mouse.up()
            result['errors'].extend(page.evaluate('__racingPreview.errors'))
            assert not errors, errors
            # Context-loss teardown is expected and happens after error collection.
            page.evaluate('__racingPreview.dispose()')
            page.wait_for_timeout(80)
            assert not errors, errors
            browser.close()
    except Exception:
        result['result'] = 'FAIL'
        raise
    finally:
        server.shutdown()
        (output / 'browser.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'result': result['result'], 'models': len(result['models']),
                      'textures': result['textureCount'], 'errors': result['errors']}, indent=2))


if __name__ == '__main__':
    main()
