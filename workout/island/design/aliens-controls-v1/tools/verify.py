#!/usr/bin/env python3
"""Verify assets, layout, offline preview and actual browser interactions.

Requires Pillow, Playwright Python and Chromium. Starts its own loopback-only
HTTP server; screenshots/results are written only into this package.
"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import hashlib
import json
import shutil
import xml.etree.ElementTree as ET
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification'
SVG = '{http://www.w3.org/2000/svg}'
checks = []
skipped = []


def check(name, value, detail=None):
    checks.append({'name': name, 'passed': bool(value), 'detail': detail})
    if not value:
        raise AssertionError(f'{name}: {detail}')


def rgb(hex_color):
    return tuple(int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))


def luminance(color):
    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in color]
    return sum(c * w for c, w in zip(linear, (.2126, .7152, .0722)))


def ratio(a, b):
    light, dark = sorted([luminance(a), luminance(b)], reverse=True)
    return (light + .05) / (dark + .05)


def assets():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    check('six components, three states, two formats', len(manifest['components']) == 6 and
          all(set(c['states']) == {'normal', 'pressed', 'disabled'} and
              all(set(s) == {'svg', 'png'} for s in c['states'].values()) for c in manifest['components']))
    contrasts = []
    for component in manifest['components']:
        hashes = []
        for state, files in component['states'].items():
            for fmt, entry in files.items():
                path = ROOT / entry['path']
                actual = hashlib.sha256(path.read_bytes()).hexdigest()
                check(f'{path.name}: bytes/hash', actual == entry['sha256'] and path.stat().st_size == entry['bytes'])
            source = ROOT / files['svg']['path']
            root = ET.parse(source).getroot()
            check(f'{source.name}: geometry', root.get('viewBox') == '0 0 128 128' and root.get('width') == '128' and root.get('height') == '128')
            check(f'{source.name}: standalone vector', not any(root.iter(SVG + 'image')) and not any(root.iter(SVG + 'script')) and not any(root.iter(SVG + 'text')))
            hashes.append(files['png']['sha256'])
            with Image.open(ROOT / files['png']['path']) as im:
                check(f'{source.name}: PNG size, RGBA, transparent padding', im.size == (128, 128) and im.mode == 'RGBA' and
                      im.getchannel('A').getextrema() == (0, 255) and im.getpixel((0, 0))[3] == 0)
            surface = root.find(SVG + 'g').find(SVG + 'rect')
            alpha = float(surface.get('fill-opacity'))
            # White behind the translucent surface is the brightest possible
            # sRGB backdrop. Include the pressed state's extra tinted surface.
            inner = tuple(c * alpha + (1 - alpha) for c in rgb(surface.get('fill')))
            if state == 'pressed':
                inner = tuple(c * .07 + b * .93 for c, b in zip(rgb(component['accent']), inner))
            glyph = root.find(f'.//{SVG}g[@id="glyph"]')
            icon_ratio = ratio(rgb(glyph.get('stroke')), inner)
            edge_ratio = ratio(rgb(surface.get('stroke')), inner)
            check(f'{source.name}: icon contrast ≥4.5, edge ≥3 against inner surface', icon_ratio >= 4.5 and edge_ratio >= 3,
                  {'icon': round(icon_ratio, 2), 'edge': round(edge_ratio, 2)})
            contrasts.append({'asset': source.name, 'icon': round(icon_ratio, 2), 'edge': round(edge_ratio, 2)})
        check(f'{component["id"]}: three visually distinct PNG states', len(set(hashes)) == 3)
    check('exact asset counts', len(list((ROOT / 'svg').glob('*.svg'))) == 18 and len(list((ROOT / 'png').glob('*.png'))) == 18)
    return manifest, contrasts


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextmanager
def server():
    http = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{http.server_port}/preview.html'
    finally:
        http.shutdown()
        http.server_close()


def browser(manifest):
    errors, external, failed_requests, layouts = [], [], [], []
    with server() as url, sync_playwright() as p:
        chromium = shutil.which('chromium') or shutil.which('chromium-browser')
        launch = {'args': ['--no-sandbox']}
        if chromium:
            launch['executable_path'] = chromium
        browser = p.chromium.launch(**launch)
        context = browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=1, has_touch=True)
        page = context.new_page()
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.on('request', lambda request: external.append(request.url) if not request.url.startswith(url.split('/preview')[0]) else None)
        page.on('response', lambda response: failed_requests.append([response.status, response.url]) if response.status >= 400 else None)
        page.goto(url)
        page.wait_for_function("[...document.images].every(i => i.complete && i.naturalWidth > 0)")
        for width, height in [(844, 390), (390, 844), (1100, 900)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_timeout(70)
            layout = page.evaluate('''() => {
              const rect = e => {const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};};
              return {stage:rect(document.querySelector('.stage')), buttons:[...document.querySelectorAll('.control')].map(e=>({id:e.dataset.action,...rect(e)})), meters:[...document.querySelectorAll('.resource-art')].map(e=>({id:e.parentElement.dataset.resource,...rect(e)})), overflow:document.documentElement.scrollWidth>innerWidth};
            }''')
            layouts.append({'viewport': [width, height], **layout})
            check(f'{width}×{height}: no horizontal overflow', not layout['overflow'])
            for b in layout['buttons']:
                s = layout['stage']
                check(f'{width}×{height}: {b["id"]} target/edge placement', b['width'] == 56 and b['height'] == 56 and
                      abs(b['x'] - s['x'] - (s['width'] - 72)) < .1 and b['y'] >= s['y'] and b['y'] + 56 <= s['y'] + s['height'])
            if width == 844:
                check('844×390: manifest and browser target rectangles match', all(
                    all(abs(b[k] - manifest['layout']['buttons'][b['id']][k]) < .1 for k in ['x', 'y', 'width', 'height'])
                    for b in layout['buttons']))
                check('844×390: manifest and browser meter rectangles match', all(
                    all(abs(b[k] - manifest['layout']['meters'][b['id']][k]) < .1 for k in ['x', 'y', 'width', 'height'])
                    for b in layout['meters']))
                page.screenshot(path=str(OUT / 'preview-844x390.png'))
            if width == 390:
                page.screenshot(path=str(OUT / 'preview-390x844.png'))
            if width == 1100:
                check('desktop: scene is exactly 844×390', layout['stage']['width'] == 844 and layout['stage']['height'] == 390)
                page.screenshot(path=str(OUT / 'preview-desktop.png'), full_page=True)
        page.set_viewport_size({'width': 844, 'height': 390})
        page.locator('#safe-area').check()
        safe = page.locator('[data-action=fire]').bounding_box()
        check('safe area: targets retain size and shift inward 28px', safe['x'] == 744 and safe['width'] == 56)
        page.locator('#safe-area').uncheck()
        page.locator('#bright').check()
        page.locator('.stage').scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / 'preview-bright-844x390.png'))
        page.locator('#bright').uncheck()

        # Real keyboard input: states, heat, independent regular fire, cancellation.
        page.locator('.stage').focus()
        page.keyboard.down('Space')
        check('regular fire: pressed state from keyboard', page.locator('[data-action=fire] .control-art').get_attribute('data-state') == 'pressed')
        page.keyboard.up('Space')
        check('regular fire: release clears pressed state', page.locator('[data-action=fire] .control-art').get_attribute('data-state') == 'normal')
        page.locator('#heat').evaluate("e=>{e.value=98;e.dispatchEvent(new Event('input',{bubbles:true}));}")
        page.locator('.stage').focus()
        page.keyboard.down('z')
        page.wait_for_function("document.querySelector('[data-action=vulcan]').disabled")
        check('vulcan: overheat disables only vulcan', not page.locator('[data-action=fire]').is_disabled())
        page.keyboard.up('z')
        check('vulcan: heat remains visible while cooling', page.locator('[data-action=vulcan] [data-part=value-ring]').get_attribute('stroke-dasharray') != '0 100')
        page.wait_for_function("!document.querySelector('[data-action=vulcan]').disabled", timeout=8000)
        check('vulcan: unlocks at zero without automatic firing', page.locator('[data-action=vulcan] .control-art').get_attribute('data-state') == 'normal')
        page.locator('#reset').click()
        page.locator('.stage').focus()
        for remaining in (2, 1, 0):
            page.keyboard.press('m')
            check(f'missile: one activation consumes one charge ({remaining})', page.locator('#ammo').text_content() == str(remaining))
        page.keyboard.press('m')
        check('empty missile: blocked, no negative ammo', page.locator('[data-action=missile]').is_disabled() and page.locator('#ammo').text_content() == '0')
        page.keyboard.press('b')
        check('bomb: enters cooldown', page.locator('[data-action=bomb]').is_disabled())
        page.wait_for_function("!document.querySelector('[data-action=bomb]').disabled", timeout=8000)
        check('bomb: cooldown restores availability', not page.locator('[data-action=bomb]').is_disabled())

        # CDP supplies real independent touch contacts, not simulated mouse clicks.
        page.locator('#reset').click()
        page.locator('.stage').scroll_into_view_if_needed()
        session = context.new_cdp_session(page)
        fire = page.locator('[data-action=fire]').bounding_box()
        vulcan = page.locator('[data-action=vulcan]').bounding_box()
        contacts = [{'x': r['x'] + 28, 'y': r['y'] + 28, 'id': i + 1} for i, r in enumerate([fire, vulcan])]
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': contacts})
        check('two contacts: regular fire and vulcan held independently', all(page.locator(f'[data-action={key}]').get_attribute('data-held') == 'true' for key in ['fire', 'vulcan']))
        session.send('Input.dispatchTouchEvent', {'type': 'touchCancel', 'touchPoints': []})
        check('pointercancel: every contact clears', page.locator('.control[data-held=true]').count() == 0)
        page.locator('.stage').focus()
        page.keyboard.down('Space')
        page.evaluate("window.dispatchEvent(new Event('blur'))")
        check('blur: held fire clears', page.locator('.control[data-held=true]').count() == 0)
        page.keyboard.up('Space')
        page.locator('.stage').focus()
        page.keyboard.down('z')
        page.set_viewport_size({'width': 845, 'height': 390})
        page.wait_for_timeout(80)
        check('resize: held input clears', page.locator('.control[data-held=true]').count() == 0)
        page.keyboard.up('z')
        page.locator('#offline').check()
        check('disable: all four actions blocked', all(b.is_disabled() for b in page.locator('.control').all()))
        page.locator('#offline').uncheck()
        page.locator('#energy').evaluate("e=>{e.value=25;e.dispatchEvent(new Event('input',{bubbles:true}));}")
        check('energy: live meter and accessible value update', page.locator('[data-resource=energy] .resource-art').get_attribute('aria-valuenow') == '25' and page.locator('[data-resource=energy] [data-part=value-ring]').get_attribute('stroke-dasharray') == '25 100')
        page.locator('[data-format=png]').click()
        page.wait_for_function("[...document.images].every(i=>i.complete&&i.naturalWidth===128)")
        check('PNG gallery: all eighteen exports load', page.locator('#asset-rows img').count() == 18)
        page.locator('[data-format=svg]').click()
        page.emulate_media(reduced_motion='reduce')
        page.locator('#reset').click()
        page.locator('.stage').focus()
        page.keyboard.down('z')
        page.wait_for_timeout(200)
        check('reduced motion: state feedback remains available', page.locator('[data-action=vulcan] .control-art').get_attribute('data-state') == 'pressed')
        page.keyboard.up('z')
        # Tab focus uses the native button; indicators are CSS, not baked assets.
        page.locator('[data-action=fire]').focus()
        page.keyboard.press('Tab')
        check('keyboard order: fire → vulcan', page.locator('[data-action=vulcan]').evaluate('e=>e===document.activeElement'))
        check('focus-visible: outline is 3px', page.locator('[data-action=vulcan]').evaluate("e=>getComputedStyle(e).outlineWidth") == '3px')
        check('inline SVG and page IDs are unique', page.evaluate("()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size;}"))
        check('no page errors / HTTP errors / external requests', not errors and not failed_requests and not external,
              {'errors': errors, 'http': failed_requests, 'external': external})
        context.close()

        # The design can be reviewed by opening preview.html directly, offline.
        offline = browser.new_context(viewport={'width': 844, 'height': 390}, offline=True)
        local = offline.new_page()
        local_errors = []
        local.on('pageerror', lambda error: local_errors.append(str(error)))
        try:
            local.goto((ROOT / 'preview.html').as_uri())
        except Exception as error:
            if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):
                raise
            skipped.append({'name': 'file:// direct opening', 'reason': 'Managed Chromium policy blocks file:// navigation. Use a local HTTP server; this policy was not changed.'})
        else:
            local.wait_for_function("document.querySelectorAll('.control-art svg').length===4 && [...document.images].every(i=>i.complete&&i.naturalWidth>0)")
            check('file:// offline: all assets load, no JavaScript errors', not local_errors)
        offline.close()
        isolated = browser.new_context(service_workers='block')
        isolated.route('**/*', lambda route: route.continue_() if route.request.url.startswith(url.split('/preview')[0]) else route.abort())
        isolated_page = isolated.new_page()
        isolated_page.goto(url)
        isolated_page.wait_for_function("document.querySelectorAll('.control-art svg').length===4 && [...document.images].every(i=>i.complete&&i.naturalWidth>0)")
        check('local HTTP preview loads with all non-loopback requests blocked', isolated_page.locator('#asset-rows img').count() == 18)
        isolated.close()
        browser.close()
    return layouts


def main():
    OUT.mkdir(exist_ok=True)
    manifest, contrasts = assets()
    layouts = browser(manifest)
    result = {'status': 'passed', 'date': '2026-11-14', 'checksPassed': len(checks),
              'assetCount': {'svg': 18, 'png': 18}, 'checks': checks, 'skipped': skipped,
              'contrastMethod': 'WCAG sRGB luminance, white backdrop behind translucent surface; extra pressed tint included. Icon/edge against the inner surface, not an arbitrary outer backdrop. Antialiasing and physical hardware not measured.',
              'contrasts': contrasts, 'layouts': layouts}
    (OUT / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'PASS: {len(checks)} checks. Screenshots and results.json saved in {OUT}')


if __name__ == '__main__':
    main()
