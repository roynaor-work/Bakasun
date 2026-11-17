#!/usr/bin/env python3
"""Exercise real local preview UI in Chromium and save compact review evidence."""
import functools
import hashlib
import http.server
import json
import shutil
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
OUT = ROOT / 'verification'


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    OUT.mkdir(exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(REPO)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors, failed_requests, external, checks, metrics = [], [], [], [], []
    def check(name, ok, **extra):
        checks.append({'check': name, 'pass': bool(ok), **extra})
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path, headless=True, args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=1)
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
            page.on('requestfailed', lambda r: failed_requests.append({'url': r.url, 'failure': r.failure}))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith(('http:', 'https:')) and not r.url.startswith(f'http://127.0.0.1:{server.server_port}/') else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/workout/island/design/naval-sinking-v1/preview.html')
            page.wait_for_function('window.navalSinking?.ready', timeout=30000)
            check('default muted', page.evaluate('!navalSinking.metrics().audible && navalSinking.metrics().soundCount===0'))
            check('844x390 fits without scrolling', page.evaluate('document.documentElement.scrollWidth===844 && document.documentElement.scrollHeight===390'))
            manifest = json.loads((ROOT / 'manifest.json').read_text())
            for key in manifest['ships']:
                record = page.evaluate('(key)=>navalSinking.selectShip(key)', key)
                check(key + ': exactly three resident atlases', len(record['loadedAtlases']) == 3 and key in record['loadedAtlases'])
                check(key + ': decoded textures below 34 MB', record['decodedTextureBytes'] <= 34_000_000, decodedTextureBytes=record['decodedTextureBytes'])
                hashes = []
                for state in ('intact', 'damaged', 'burning', 'listing', 'sinking'):
                    record = page.evaluate('(state)=>navalSinking.snapshot({state,time:1.45})', state)
                    pixels = page.locator('#scene').screenshot()
                    hashes.append(hashlib.sha256(pixels).hexdigest())
                check(key + ': five visibly different rendered states', len(set(hashes)) == 5)
                for i in range(16):
                    record = page.evaluate('(time)=>navalSinking.snapshot({state:"sinking",time})', (i + .05) / manifest['ships'][key]['sinkingHull']['fps'])
                    check(key + f': browser sinking frame {i}', record['sinkingFrame'] == i)
                metrics.append(record)
            page.evaluate('navalSinking.selectShip("destroyer-tide")')
            for state in ('intact', 'damaged', 'burning', 'listing', 'sinking'):
                page.get_by_role('button', name='מצב הספינה: ' + {'intact': 'שלמה', 'damaged': 'פגועה', 'burning': 'בוערת', 'listing': 'נטויה', 'sinking': 'טובעת'}[state], exact=True).click()
                check('click state ' + state, page.evaluate('(state)=>navalSinking.metrics().state===state', state))
            for effect in ('shell', 'explosion', 'rockets', 'torpedo'):
                page.locator(f'[data-effect="{effect}"]').click()
                check('click effect ' + effect, page.evaluate('(effect)=>navalSinking.metrics().effect===effect && navalSinking.metrics().mode==="effect"', effect))
            page.locator('#sink').click()
            page.wait_for_timeout(4200)
            record = page.evaluate('navalSinking.metrics()')
            check('one-shot sinking stops at frame 15', record['sinkingFrame'] == 15 and record['playing'] is False)
            page.locator('#replay').click()
            page.wait_for_timeout(100)
            check('replay resets sinking', page.evaluate('navalSinking.metrics().sinkingFrame<2 && navalSinking.metrics().playing'))
            page.locator('#scrub').fill('500')
            page.locator('#scrub').dispatch_event('input')
            record = page.evaluate('navalSinking.metrics()')
            check('scrub pauses at requested time', not record['playing'] and abs(record['time'] - 1.85) < .01)
            # Layer switches must actually change the rendered output.
            page.evaluate('navalSinking.snapshot({state:"burning",time:1.2,smoke:true,water:true})')
            smoke = page.locator('#scene').screenshot()
            page.locator('#smoke').uncheck()
            no_smoke = page.locator('#scene').screenshot()
            check('smoke/fire layer switch changes pixels', smoke != no_smoke)
            page.locator('#smoke').check()
            page.evaluate('navalSinking.snapshot({state:"sinking",time:2.0,water:true})')
            water = page.locator('#scene').screenshot()
            page.locator('#water').uncheck()
            no_water = page.locator('#scene').screenshot()
            check('bubbles/oil layer switch changes pixels', water != no_water)
            page.locator('#water').check()
            # Genuine browser decoding and click-to-play; all three SFX.
            page.locator('#sound').click()
            page.wait_for_timeout(100)
            page.locator('[data-effect="explosion"]').click()
            page.wait_for_timeout(100)
            page.locator('#sink').click()
            page.wait_for_timeout(100)
            check('hit, explosion and sinking play after user gesture', page.evaluate('navalSinking.metrics().soundCount>=3'))
            page.locator('#sound').click()
            check('mute reflected in UI', page.locator('#sound').get_attribute('aria-pressed') == 'false')
            for name, options in [
                ('burning-844x390.png', {'state': 'burning', 'time': 1.2}),
                ('sinking-844x390.png', {'state': 'sinking', 'time': 1.9}),
                ('submerged-844x390.png', {'state': 'sinking', 'time': 3.7}),
                ('water-column-844x390.png', {'effect': 'shell', 'time': .85}),
                ('explosion-844x390.png', {'effect': 'explosion', 'time': .3}),
                ('rockets-844x390.png', {'effect': 'rockets', 'time': .38}),
                ('torpedo-844x390.png', {'effect': 'torpedo', 'time': 1.0}),
            ]:
                page.evaluate('(o)=>navalSinking.snapshot(o)', options)
                page.screenshot(path=str(OUT / name))
            page.set_viewport_size({'width': 390, 'height': 844})
            page.evaluate('navalSinking.snapshot({state:"burning",time:1.2})')
            check('390px portrait has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth===390'))
            page.screenshot(path=str(OUT / 'burning-390x844.png'))
            # Reduced motion starts paused, with manual controls still available.
            quiet = browser.new_page(viewport={'width': 844, 'height': 390}, reduced_motion='reduce')
            quiet.goto(page.url)
            quiet.wait_for_function('window.navalSinking?.ready')
            check('reduced motion starts paused', quiet.evaluate('!navalSinking.metrics().playing'))
            check('all buttons have accessible names', page.locator('button').evaluate_all('(buttons)=>buttons.every(b=>b.getAttribute("aria-label")||b.textContent.trim())'))
            browser.close()
    finally:
        server.shutdown()
    check('no browser exceptions or console errors', not errors, errors=errors)
    check('no failed requests', not failed_requests, requests=failed_requests)
    check('no external network requests', not external, requests=external)
    report = {'pass': all(c['pass'] for c in checks), 'checkCount': len(checks), 'engine': 'Chromium', 'viewport': [844, 390], 'checks': checks, 'modelMetrics': metrics}
    (OUT / 'browser.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'pass': report['pass'], 'checks': len(checks), 'failed': [c for c in checks if not c['pass']]}, ensure_ascii=False, indent=2))
    if not report['pass']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
