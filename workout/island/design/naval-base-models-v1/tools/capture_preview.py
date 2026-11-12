#!/usr/bin/env python3
"""Exercise the actual local three.js preview and save reproducible screenshots.

Requires Python Playwright and Chromium. Serve the repository root over HTTP.
python tools/capture_preview.py --url http://127.0.0.1:8765/workout/island/design/naval-base-models-v1/preview.html
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STYLES = ('coastal', 'palace', 'submarine')
STATES = ('intact', 'damaged', 'ruined')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8765/workout/island/design/naval-base-models-v1/preview.html')
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    report = dict(browser='Chromium / software WebGL (SwiftShader)', viewport=[1536, 1100],
                  page_errors=[], console_errors=[], http_errors=[], failed_requests=[], external_requests=[],
                  state_checks=[], screenshots=[], interactions={})
    origin = urlparse(args.url).netloc
    (ROOT / 'screenshots').mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=[
            '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width':1536, 'height':1100}, device_scale_factor=1)
        page.on('pageerror', lambda error: report['page_errors'].append(str(error)))
        page.on('console', lambda message: report['console_errors'].append(message.text) if message.type == 'error' else None)
        page.on('requestfailed', lambda request: report['failed_requests'].append({'url':request.url, 'failure':request.failure}))
        page.on('response', lambda response: report['http_errors'].append({'url':response.url, 'status':response.status})
                if response.status >= 400 else None)
        page.on('request', lambda request: report['external_requests'].append(request.url)
                if urlparse(request.url).scheme in ('http', 'https') and urlparse(request.url).netloc != origin else None)

        def ready():
            page.wait_for_function('window.__navalPreview?.ready === true')
            page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')

        def api(code, arg=None):
            result = page.evaluate(code, arg)
            ready()
            return result

        def shot(name, full=False):
            page.evaluate('window.__navalPreview.render()')
            ready()
            target = ROOT / 'screenshots' / (name + '.png')
            if full:
                page.screenshot(path=str(target), full_page=True)
            else:
                page.locator('.stage-column').screenshot(path=str(target))
            report['screenshots'].append({'file':str(target.relative_to(ROOT)), 'bytes':target.stat().st_size,
                                          'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})

        page.goto(args.url)
        ready()
        assert api('window.__navalPreview.snapshot().assetCount') == 13
        for style in STYLES:
            # Use the actual user controls when changing styles.
            page.locator(f'button[data-style="{style}"]').click()
            ready()
            for state in STATES:
                page.locator(f'[data-state="{state}"]').click()
                ready()
                snapshot = api('window.__navalPreview.snapshot()')
                expected = [a for a in manifest['assets'] if a['style'] == style]
                assert snapshot['displayCount'] == len(expected)
                assert snapshot['triangles'] == sum(a['triangles'][state] for a in expected)
                shot(f'{style}-{state}')
            for asset in [a for a in manifest['assets'] if a['style'] == style]:
                page.select_option('#model-select', asset['id'])
                ready()
                for state in STATES:
                    page.locator(f'[data-state="{state}"]').click()
                    snapshot = api('window.__navalPreview.snapshot()')
                    assert snapshot['displayCount'] == 1
                    assert snapshot['models'][0]['triangles'] == asset['triangles'][state]
                    report['state_checks'].append({'id':asset['id'], 'state':state,
                                                   'triangles':snapshot['triangles'], 'bounds':snapshot['models'][0]['bounds']})
            api("window.__navalPreview.selectAsset('coastal-gun')")
            api("window.__navalPreview.setState('intact')")
            page.locator('#compare').click()
            ready()
            assert api('window.__navalPreview.snapshot().displayCount') == 3
            shot(f'{style}-gun-states')
            if style == 'palace':
                api("window.__navalPreview.selectAsset('gate')")
                api("window.__navalPreview.setCamera('front')")
                shot('palace-gate-front')

        api("window.__navalPreview.selectAsset('submarine-pen')")
        api("window.__navalPreview.setState('intact')")
        shot('submarine-pen-detail')
        api("window.__navalPreview.selectAsset('coastal-gun')")
        before = api('window.__navalPreview.snapshot().camera')
        page.locator('#stage').focus()
        page.keyboard.press('ArrowLeft')
        after = api('window.__navalPreview.snapshot().camera')
        assert before != after
        report['interactions']['keyboard_orbit'] = True
        page.keyboard.press('Home')
        api('window.__navalPreview.setArticulation(35, 25)')
        articulation = api('''() => {
            const result=[];
            window.__navalPreview.scene.traverse(node => {
                if (/^(turret|barrel)(?:_|$)/.test(node.name)) result.push({name:node.name, rotation:node.rotation.toArray().slice(0,3)});
            });
            return result;
        }''')
        assert any(n['name'] == 'turret' and abs(n['rotation'][1] - 35 * 3.141592653589793 / 180) < 1e-6 for n in articulation)
        assert any(n['name'] == 'barrel' and abs(n['rotation'][0] + 25 * 3.141592653589793 / 180) < 1e-6 for n in articulation)
        report['interactions']['gun_articulation'] = articulation
        shot('submarine-gun-articulated')
        api('window.__navalPreview.setArticulation(0, 0)')
        page.check('#grid')
        page.check('#wireframe')
        api('window.__navalPreview.render()')
        report['interactions']['grid_and_wireframe'] = True
        page.uncheck('#wireframe')
        page.uncheck('#grid')

        api("window.__navalPreview.setStyle('palace')")
        api("window.__navalPreview.setState('intact')")
        page.locator('#stage').blur()
        shot('desktop-palace', full=True)
        page.set_viewport_size({'width':390, 'height':844})
        ready()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        report['interactions']['mobile_no_horizontal_overflow'] = True
        shot('mobile-palace', full=True)
        page.set_viewport_size({'width':844, 'height':390})
        ready()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        report['interactions']['landscape_no_horizontal_overflow'] = True
        # A saved view must survive navigation and retain its three state copies.
        page.goto(args.url + '?style=submarine&state=damaged&view=compare&model=submarine-pen')
        ready()
        saved = api('window.__navalPreview.snapshot()')
        assert saved['style'] == 'submarine' and saved['view'] == 'compare' and saved['displayCount'] == 3
        report['interactions']['saved_view_url'] = True
        browser.close()
    report['checks'] = len(report['state_checks'])
    report['passed'] = not any(report[key] for key in ('page_errors','console_errors','http_errors','failed_requests','external_requests'))
    (ROOT / 'verification/browser.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key:report[key] for key in ('checks','passed','page_errors','console_errors','http_errors','failed_requests','external_requests')}, ensure_ascii=False))
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
