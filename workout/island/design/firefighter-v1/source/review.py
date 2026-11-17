#!/usr/bin/env python3
"""SPDX-License-Identifier: CC0-1.0
Repeatable authoring review of this isolated preview; never changes game tests.
Start the repository HTTP server first. Requires the environment's Playwright.
"""
import argparse
import asyncio
import json
import math
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification'
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8765/workout/island/design/firefighter-v1/preview.html')
parser.add_argument('--chromium', default='/usr/bin/chromium')
args = parser.parse_args()


async def review():
    errors, failed, http_errors, decoder_requests, requests, checks = [], [], [], [], [], []
    cases = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=args.chromium, headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'])
        context = await browser.new_context(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
        await context.add_init_script('window.WebAssembly=undefined;')
        page = await context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('requestfailed', lambda r: failed.append(r.url))
        page.on('response', lambda r: http_errors.append({'url': r.url, 'status': r.status}) if r.status >= 400 else None)

        def observe(request):
            requests.append(request.url)
            if any(s in request.url.lower() for s in ['draco', '.wasm', 'meshopt']):
                decoder_requests.append(request.url)
        page.on('request', observe)
        await page.goto(args.url)
        await page.wait_for_function('window.firefighterPreview?.inspect().ready')
        await page.evaluate("firefighterPreview.select('idle_ready');firefighterPreview.seek(.4)")
        await page.screenshot(path=str(OUT / 'preview-desktop.png'), full_page=True)
        manifest = json.loads((ROOT / 'manifest.json').read_text())

        for body in ['soccer', 'guard', 'wing', 'center']:
            await page.locator('.options').evaluate('(d)=>d.open=true')
            await page.select_option('#body', body)
            await page.wait_for_function('(body)=>window.firefighterPreview.inspect().ready&&window.firefighterPreview.inspect().body===body', arg=body)
            await page.locator('.options').evaluate('(d)=>d.open=false')
            for clip in manifest['motions']['requiredClips']:
                entry = next(c for c in manifest['motions']['clips'] if c['id'] == clip)
                sample_times = sorted(set([0, entry['duration'] / 2, entry['duration'] - 1 / 30] + [e['time'] for e in entry['events']]))
                for time in sample_times:
                    await page.evaluate('([id,t])=>{firefighterPreview.select(id);firefighterPreview.seek(t)}', [clip, time])
                    state = await page.evaluate('firefighterPreview.inspect()')
                    assert state['ready'] and state['boneCount'] == 18
                    assert state['equipmentTriangles'] <= 1500
                    assert not state['optionalVisible'] or state['renderedTriangles'] <= state['budget']
                    assert state['renderedTriangles'] == state['renderTriangleCost']
                    assert state['stowed'] == (entry['nozzle'] == 'backpack')
                    expected = bool(entry.get('sprayWindow') and entry['sprayWindow'][0] <= time <= entry['sprayWindow'][1])
                    assert state['spraying'] == expected
                    assert all(math.isfinite(x) for x in state['emitter'])
                    assert max(state['hoseAttachmentErrorMeters'].values()) < 1e-5
                    assert state['vibrationMeters'] <= .001501
                    assert expected or state['vibrationMeters'] < 1e-9
                    cases.append({'body': body, 'clip': clip, 'time': time,
                                  'triangles': state['renderedTriangles'], 'subject': state['subject'],
                                  'spraying': state['spraying'], 'stowed': state['stowed']})
                if body == 'soccer':
                    sample = {'open_door': 31 / 30, 'spray_stand': 1.25, 'spray_crouch': 1.5,
                              'wave_victory': 1.6, 'rescued_handoff': 1.8}.get(clip, entry['duration'] / 2)
                    await page.evaluate('([id,t])=>{firefighterPreview.select(id);firefighterPreview.seek(t)}', [clip, sample])
                    await page.locator('.stage').screenshot(path=str(OUT / (clip + '.png')))
                    if clip == 'spray_stand':
                        await page.screenshot(path=str(OUT / 'spray-stand.png'), full_page=True)

        await page.locator('.options').evaluate('(d)=>d.open=true')
        await page.select_option('#body', 'soccer')
        await page.wait_for_function("firefighterPreview.inspect().ready&&firefighterPreview.inspect().body==='soccer'")
        await page.locator('.options').evaluate('(d)=>d.open=true')
        await page.locator('#mask').uncheck()
        assert not (await page.evaluate('firefighterPreview.inspect()'))['maskVisible']
        await page.locator('#mask').check()
        for budget, visible in [(7000, False), (12000, True)]:
            await page.locator('#budget').fill(str(budget))
            await page.evaluate("firefighterPreview.select('carry_child');firefighterPreview.seek(.5)")
            state = await page.evaluate('firefighterPreview.inspect()')
            assert state['optionalVisible'] == visible
            checks.append({'check': 'optional subject admission', 'budget': budget, 'visible': visible,
                           'triangles': state['renderedTriangles']})
        await page.locator('#reactions').uncheck()
        assert not (await page.evaluate('firefighterPreview.inspect()'))['optionalVisible']
        await page.locator('#reactions').check()
        await page.locator('#hose-line').check()
        await page.locator('#hose-line').uncheck()
        await page.locator('#coat-color').fill('#387faf')
        await page.locator('#coat-color').dispatch_event('input')
        await page.locator('#coat-color').fill('#e54935')
        await page.locator('#coat-color').dispatch_event('input')
        await page.locator('.options').evaluate('(d)=>d.open=false')

        for width, height in [(1440, 1100), (390, 844), (360, 740), (844, 390)]:
            await page.set_viewport_size({'width': width, 'height': height})
            for clip, time in [('idle_ready', .4), ('spray_crouch', 1.5), ('open_door', 31 / 30), ('carry_child', .6)]:
                await page.evaluate('([id,t])=>{firefighterPreview.select(id);firefighterPreview.seek(t)}', [clip, time])
                for view in ['three', 'front', 'side', 'back']:
                    await page.evaluate('(v)=>firefighterPreview.setView(v)', view)
                    state = await page.evaluate('firefighterPreview.inspect()')
                    assert all(abs(v[0]) < .99 and abs(v[1]) < .99 for v in state['framingCornersNDC'])
                await page.evaluate("firefighterPreview.setView('three')")
                assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                if width == 390 and clip in ['idle_ready', 'spray_crouch']:
                    await page.screenshot(path=str(OUT / ('preview-mobile.png' if clip == 'idle_ready' else 'preview-mobile-spray.png')), full_page=True)
            checks.append({'check': 'responsive framing and no page overflow', 'viewport': [width, height], 'views': 4, 'clips': 4})

        # Verify actual UI playback and keyboard scrubbing, not just its debug interface.
        await page.evaluate("firefighterPreview.select('walk');firefighterPreview.seek(.1)")
        await page.locator('#play').click()
        await page.wait_for_timeout(140)
        assert (await page.evaluate('firefighterPreview.inspect()'))['time'] > .1
        await page.locator('#play').click()
        await page.locator('#scrub').focus()
        before = await page.locator('#scrub').input_value()
        await page.keyboard.press('ArrowRight')
        assert await page.locator('#scrub').input_value() != before
        checks.append({'check': 'play/pause and keyboard timeline', 'passed': True})
        # Reports are local, independently readable HTML generated by the real QA CLI.
        await page.goto(args.url.rsplit('/', 1)[0] + '/verification/qa/report.html')
        await page.wait_for_load_state('networkidle')
        checks.append({'check': 'official QA HTML opens', 'passed': True})
        await browser.close()

    sprites = json.loads((ROOT / 'sprites/atlas.json').read_text())
    image = Image.open(ROOT / 'sprites/water-atlas.png')
    assert image.mode == 'RGBA' and image.size == (2048, 512)
    assert sprites['effects']['water_arc']['frameCount'] == 8
    assert sprites['effects']['steam']['frameCount'] == 6
    for effect in sprites['effects'].values():
        hashes = set()
        for f in effect['frames']:
            x, y, w, h = f['rect']
            cell = image.crop((x, y, x+w, y+h))
            alpha = cell.getchannel('A')
            assert alpha.getextrema() == (0, 255) or 0 == alpha.getextrema()[0] < alpha.getextrema()[1]
            assert max(alpha.crop((0, 0, w, 2)).getextrema()) == 0
            assert max(alpha.crop((0, h-2, w, h)).getextrema()) == 0
            assert max(alpha.crop((0, 0, 2, h)).getextrema()) == 0
            assert max(alpha.crop((w-2, 0, w, h)).getextrema()) == 0
            hashes.add(cell.tobytes())
        assert len(hashes) == effect['frameCount']
    if errors or failed or decoder_requests or http_errors:
        print(json.dumps({'pageErrors':errors,'failedRequests':failed,'decoderRequests':decoder_requests,'httpErrors':http_errors}))
    assert not errors and not failed and not decoder_requests and not http_errors
    result = {'schemaVersion': 1, 'passed': True, 'browser': 'Chromium, headless ANGLE SwiftShader',
              'wasmDisabled': True, 'cases': cases, 'checks': checks,
              'peakTriangles': max(c['triangles'] for c in cases), 'pageErrors': errors,
              'failedRequests': failed, 'httpErrors': http_errors, 'decoderRequests': decoder_requests,
              'externalRequests': [u for u in set(requests) if not u.startswith('http://127.0.0.1:8765/')],
              'spriteFrames': {k: v['frameCount'] for k,v in sprites['effects'].items()}}
    (OUT / 'browser.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': True, 'poseCases': len(cases), 'checks': len(checks), 'peakTriangles': result['peakTriangles']}))


asyncio.run(review())
