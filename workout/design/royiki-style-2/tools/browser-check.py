"""Native SVG, gallery, offline and accessibility checks. No external requests.

Run from any directory: python3 path/to/tools/browser-check.py
Requires the existing Python Playwright and Pillow, plus system Chromium.
The script starts its own loopback-only server and writes review artifacts.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from threading import Thread
import json
import os
import mimetypes
from urllib.parse import urlparse, unquote
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops, ImageDraw, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
OUTPUT = ROOT / 'verification'
MANIFEST = json.loads((ROOT / 'manifest.json').read_text())
OUTPUT.mkdir(exist_ok=True)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def native_state(page):
    return page.evaluate("""() => [...document.querySelectorAll('.card-stage > svg')].map(s => ({
      id: s.dataset.exercise, paused: s.animationsPaused(), time: s.getCurrentTime()
    }))""")


def snapshot(svg):
    return Image.open(BytesIO(svg.screenshot())).convert('RGB')


def difference(a, b):
    return max(ImageStat.Stat(ImageChops.difference(a, b)).mean)


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(REPO)))
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/workout/design/royiki-style-2/'
report = {'nativeSvg': [], 'gallery': {}, 'errors': [], 'externalRequests': []}
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('BAKASUN_BROWSER', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1100}, device_scale_factor=1)
        page = context.new_page()
        page.on('pageerror', lambda error: report['errors'].append(str(error)))
        page.on('request', lambda request: report['externalRequests'].append(request.url) if not request.url.startswith(('http://127.0.0.1:', 'file:', 'data:')) else None)
        page.goto(base)
        assert page.locator('.exercise-card').count() == 38
        assert not any(s['paused'] for s in native_state(page))
        first = native_state(page)
        page.wait_for_timeout(180)
        assert all(b['time'] > a['time'] for a, b in zip(first, native_state(page))), 'all 38 timelines advance'
        page.locator('#toggle-all').click()
        stopped = native_state(page)
        page.wait_for_timeout(100)
        assert all(s['paused'] for s in stopped)
        assert all(abs(a['time'] - b['time']) < .002 for a, b in zip(stopped, native_state(page)))
        page.locator('.card-toggle').first.click()
        assert sum(not s['paused'] for s in native_state(page)) == 1
        page.locator('[data-category="core"]').click()
        assert page.locator('.exercise-card:visible').count() == 9
        assert all(s['paused'] for s in native_state(page)), 'hidden SVGs pause'
        page.locator('[data-category="all"]').click()
        assert sum(not s['paused'] for s in native_state(page)) == 1
        page.locator('.enlarge').first.click()
        assert page.locator('#focus-dialog').evaluate('(d) => d.open')
        assert all(s['paused'] for s in native_state(page)), 'background pauses in focus view'
        assert page.evaluate('() => {const ids=[...document.querySelectorAll("[id]")].map(e=>e.id);return ids.length===new Set(ids).size}'), 'inline SVG IDs remain unique in the dialog'
        page.locator('#seek').evaluate('(r) => {r.value="500";r.dispatchEvent(new Event("input",{bubbles:true}))}')
        assert page.locator('#focus-stage > svg').evaluate('(s) => s.animationsPaused()')
        assert abs(page.locator('#focus-stage > svg').evaluate('(s) => s.getCurrentTime()') - MANIFEST['exercises'][0]['durationMs'] / 2000) < .002
        with page.expect_download() as download_event:
            page.locator('#focus-download').click()
        assert download_event.value.suggested_filename == 'jog.svg'
        page.keyboard.press('Escape')
        assert not page.locator('#focus-dialog').evaluate('(d) => d.open')
        page.wait_for_function("[...document.querySelectorAll('.card-stage > svg')].filter(s=>!s.animationsPaused()).length===1")
        assert sum(not s['paused'] for s in native_state(page)) == 1, 'individual playback state is restored'
        page.locator('#toggle-all').click()
        page.locator('#restart-all').click()
        assert all(s['time'] < .03 for s in native_state(page))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        # Freeze readable but distinct representative poses for the gallery artifacts.
        page.evaluate("document.querySelectorAll('.card-stage > svg').forEach(s=>{s.pauseAnimations();s.setCurrentTime(Number(s.dataset.duration)*.38)})")
        page.screenshot(path=str(OUTPUT / 'gallery-desktop.png'), full_page=True)
        Image.open(OUTPUT / 'gallery-desktop.png').crop((0, 0, 1440, 1180)).save(OUTPUT / 'preview.png')
        for width in [320, 390, 768]:
            page.set_viewport_size({'width': width, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'no horizontal scroll at {width}px'
            if width == 390:
                page.screenshot(path=str(OUTPUT / 'gallery-mobile.png'), full_page=True)
        page.locator('[data-batch="1"]').click()
        assert page.locator('.exercise-card:visible').count() == 19
        page.locator('[data-category="core"]').click()
        assert page.locator('.exercise-card:visible').count() == 0
        page.locator('[data-batch="2"]').click()
        assert page.locator('.exercise-card:visible').count() == 9
        page.locator('[data-category="all"]').click()
        assert page.locator('.exercise-card:visible').count() == 19
        page.locator('[data-batch="all"]').click()
        assert page.locator('.exercise-card:visible').count() == 38
        assert page.locator('#mapping-rows tr').count() == 38
        report['gallery']['http'] = '38 advancing loops; global/individual playback, filters, restart, dialog, seek, Escape, download, unique IDs and responsive layouts passed'
        try:
            page.goto(ROOT.joinpath('index.html').as_uri())
            assert page.locator('.exercise-card').count() == 38
            assert not any(s['paused'] for s in native_state(page))
            page.locator('#toggle-all').click()
            assert all(s['paused'] for s in native_state(page))
            report['gallery']['file'] = 'file:// gallery and playback controls passed'
        except Exception as error:
            if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):
                raise
            report['gallery']['file'] = 'Direct file:// navigation is blocked by the managed Chromium policy; this mode could not be tested in this environment.'
        # Test a disconnected browser using the exact on-disk files as responses.
        # No policy changes, file-navigation bypass, remote hosts or network access.
        offline = browser.new_context(offline=True)
        def local_response(route):
            path = (REPO / unquote(urlparse(route.request.url).path).lstrip('/')).resolve()
            assert path.is_relative_to(ROOT)
            route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
        offline.route('**/*', local_response)
        offline_page = offline.new_page()
        offline_page.goto(base + 'index.html')
        assert offline_page.locator('.exercise-card').count() == 38
        assert not any(s['paused'] for s in native_state(offline_page))
        offline_page.locator('#toggle-all').click()
        assert all(s['paused'] for s in native_state(offline_page))
        offline_page.locator('.enlarge').first.click()
        assert offline_page.locator('#focus-stage > svg').count() == 1
        offline_page.keyboard.press('Escape')
        offline.close()
        report['gallery']['offline'] = 'Disconnected browser passed with exact local HTML/CSS/JS files supplied as response fixtures; gallery, playback and focus controls passed'
        reduced = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        reduced_page = reduced.new_page()
        reduced_page.goto(base)
        assert reduced_page.locator('#motion-note').is_visible()
        assert all(s['paused'] for s in native_state(reduced_page))
        reduced_page.locator('#toggle-all').click()
        assert not any(s['paused'] for s in native_state(reduced_page)), 'explicit playback overrides reduced motion'
        reduced_page.emulate_media(reduced_motion='no-preference')
        reduced_page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        reduced_page.emulate_media(reduced_motion='reduce')
        reduced_page.wait_for_function("[...document.querySelectorAll('.card-stage > svg')].every(s=>s.animationsPaused())")
        assert all(s['paused'] for s in native_state(reduced_page))
        report['gallery']['reducedMotion'] = 'initial static state, explicit playback and live preference changes passed'
        reduced.close()

        page.set_viewport_size({'width': 220, 'height': 220})
        sheet = Image.new('RGB', (8 * 220, 38 * 238), '#f6f4ef')
        draw = ImageDraw.Draw(sheet)
        for row, item in enumerate(MANIFEST['exercises']):
            parsed = ET.fromstring((ROOT / item['src']).read_text())
            assert parsed.tag == '{http://www.w3.org/2000/svg}svg'
            page.goto(base + item['src'])
            page.evaluate("""() => {
                const s=document.documentElement;s.style.width='220px';s.style.height='210px';s.pauseAnimations();s.setCurrentTime(0);
            }""")
            svg = page.locator('svg')
            start = snapshot(svg)
            duration = item['durationMs'] / 1000
            page.evaluate('(t)=>document.documentElement.setCurrentTime(t)', duration)
            end = snapshot(svg)
            seam = difference(start, end)
            seam_max = max(channel[1] for channel in ImageChops.difference(start, end).getextrema())
            # Chromium quantizes setCurrentTime to microseconds; path-edge
            # antialiasing can differ at an otherwise identical cycle boundary.
            assert seam < .05 and seam_max <= 64, f"{item['id']}: native loop seam ({seam}, max {seam_max})"
            maximum_motion = 0
            for col in range(8):
                page.evaluate('(t)=>document.documentElement.setCurrentTime(t)', duration * col / 8)
                image = snapshot(svg)
                maximum_motion = max(maximum_motion, difference(start, image))
                sheet.paste(image, (col * 220, row * 238 + 24))
                draw.text((col * 220 + 8, row * 238 + 4), f"{item['id']}  {col}/8", fill='#2b2441')
            assert maximum_motion > .05, f"{item['id']}: actual rendered movement"
            bounds = page.evaluate("""async (duration) => {
                const s=document.documentElement, box=s.viewBox.baseVal, violations=[];
                for(let i=0;i<32;i++){
                    s.setCurrentTime(duration*i/32);
                    await new Promise(requestAnimationFrame);
                    const b=document.getElementById('character').getBBox();
                    if(b.x < box.x+1 || b.y < box.y+1 || b.x+b.width > box.x+box.width-1 || b.y+b.height > box.y+box.height-1)
                      violations.push({sample:i,x:b.x,y:b.y,width:b.width,height:b.height});
                }return violations;
            }""", duration)
            assert not bounds, f"{item['id']}: camera clipping: {bounds}"
            # Verify native <img> embedding independently of the gallery's inline SVGs.
            result = page.evaluate("""async (src) => {
                const image=new Image();image.src=src;await image.decode();
                return {width:image.naturalWidth,height:image.naturalHeight};
            }""", base + item['src'])
            assert result == {'width': 440, 'height': 420}
            print(f"Verified {row + 1}/38: {item['id']}", flush=True)
            report['nativeSvg'].append({'id': item['id'], 'bytes': item['bytes'], 'seamMeanPixelDifference': seam, 'seamMaxChannelDifference': seam_max, 'seamTolerance': 'mean < 0.05/255 and max <= 64/255, allowing Chromium microsecond timing and edge antialiasing', 'maximumMotionMeanPixelDifference': round(maximum_motion, 5), 'boundsSamples': 32, 'imgEmbedding': True})
        for batch in range(2):
            sheet.crop((0, batch * 19 * 238, 8 * 220, (batch + 1) * 19 * 238)).save(OUTPUT / f'keyframes-batch-{batch + 1}.png')
        assert not report['errors'], report['errors']
        assert not report['externalRequests'], report['externalRequests']
        browser.close()
    (OUTPUT / 'browser-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print('PASS: 38 native SVG loops, 304 rendered keyframes, 1216 camera bounds checks, desktop/mobile/offline galleries and reduced-motion behavior. See report for file:// policy limitation.')
finally:
    server.shutdown()
    server.server_close()
