"""Browser validation (development only): Python Playwright + Chromium. CC0-1.0.

Run from anywhere; starts its own loopback server. --output writes measured JSON;
--screenshots writes review images outside the kit by default. No npm changes.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

# Avoid importing verify.py and creating bytecode inside the kit.
namespace = {'__file__': str(Path(__file__).with_name('verify.py')), '__name__': 'kit_verify'}
exec(compile(Path(__file__).with_name('verify.py').read_text(), 'verify.py', 'exec'), namespace)
ROOT = Path(__file__).resolve().parent


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run(chrome, screenshots):
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    errors, external = [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=chrome, headless=True, args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

            def route(request):
                if urlparse(request.request.url).netloc != urlparse(origin).netloc:
                    external.append(request.request.url); request.abort()
                else:
                    request.continue_()
            page.route('**/*', route)
            page.goto(origin + '/preview.html')
            page.wait_for_function('document.querySelectorAll(".icon-sample").length === 22')
            page.evaluate('Promise.all([...document.images].map(img => img.decode()))')
            assert page.locator('.icon-strip img').count() == 132
            assert page.locator('.uo-card[data-state="ready"]').count() == 1
            assert page.locator('.uo-card[data-state="short"]').count() == 1
            assert page.locator('.uo-card[data-state="locked"]').count() == 1
            assert page.locator('.uo-primary:disabled').count() == 2
            # All kit files, not just runtime assets, must also load over HTTP.
            loaded = []
            for path in namespace['files']():
                relative = str(path.relative_to(ROOT))
                response = page.request.get(origin + '/' + relative)
                assert response.status == 200, relative
                response.body().decode('utf-8'); loaded.append(relative)

            # Rasterize every icon in both modes. Check real theme colors and clear
            # edges; this catches broken SVG paths, blank images and clipped strokes.
            raster = page.evaluate('''() => [...document.querySelectorAll('.icon-strip img[width="72"]')].map(img => {
              const c = document.createElement('canvas'); c.width = c.height = 72;
              const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 72, 72);
              const d = ctx.getImageData(0, 0, 72, 72).data;
              const colors = new Set(); let edge = 0, painted = 0;
              for (let y=0; y<72; y++) for (let x=0; x<72; x++) {
                const i = (y*72+x)*4;
                if(d[i+3]) { painted++; if(x===0||y===0||x===71||y===71) edge++; }
                if(d[i+3]===255) colors.add('#'+[d[i],d[i+1],d[i+2]].map(v=>v.toString(16).padStart(2,'0')).join(''));
              }
              return { file: img.getAttribute('src').split('/').pop(), mode: img.parentElement.dataset.mode,
                colors: [...colors], edge, painted };
            })''')
            for item in raster:
                expected = ['#f5f8fa', '#ffd16a'] if item['mode'] == 'dark' else ['#102b41', '#805000']
                assert all(c in item['colors'] for c in expected), item
                assert item['edge'] == 0 and item['painted'] > 50, item

            page.locator('#replay').click()
            animations = page.evaluate('document.getAnimations().map(a => a.effect.getTiming())')
            assert animations and all(a['duration'] + a['delay'] <= 600 and a['iterations'] == 1 for a in animations)
            page.wait_for_timeout(620)
            if screenshots:
                screenshots.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(screenshots / 'desktop.png'), full_page=True)
            sizes = []
            for width, height in [(1440, 1000), (900, 700), (844, 390), (390, 844), (375, 812), (320, 640)]:
                page.set_viewport_size({'width': width, 'height': height})
                metrics = page.evaluate('''() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
                  buttons: [...document.querySelectorAll('button')].map(e => ({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})) })''')
                assert not metrics['overflow'], (width, metrics)
                assert all(b['width'] >= 48 and b['height'] >= 48 for b in metrics['buttons']), (width, metrics)
                sizes.append({'width': width, 'height': height, 'minimum_touch': min(min(b.values()) for b in metrics['buttons'])})
                if screenshots and width == 390:
                    page.screenshot(path=str(screenshots / 'mobile.png'), full_page=True)
            primary = page.locator('.uo-primary').first
            primary.focus(); page.keyboard.press('Tab')
            assert page.locator('.uo-later').first.evaluate('(el) => el === document.activeElement')
            outline = page.locator('.uo-later').first.evaluate('(el) => getComputedStyle(el).outlineWidth')
            assert outline == '3px'
            primary.focus(); page.keyboard.press('Enter')
            assert primary.inner_text() == 'שודרג!' and primary.is_disabled()
            assert page.locator('.uo-card').first.locator('.uo-budget > div').nth(1).inner_text().find('20') >= 0
            page.locator('.uo-later').first.click()
            assert 'ממשיכים לשחק' in page.locator('#demo-feedback').inner_text()
            page.locator('#replay').click()
            assert primary.is_enabled()

            # Public API: light palette, category labels, untrusted text, zero/invalid
            # prices, updates, hidden state, independent lifetimes, safe icon fallback.
            api = page.evaluate('''async () => {
              const { create } = await import('./offer.mjs');
              const host = document.createElement('div'); document.body.append(host);
              let upgraded=0, later=0;
              const first=create(host,{initial:{price:100,balance:120,mode:'light'},onUpgrade:()=>upgraded++,onLater:()=>later++});
              const second=create(host,{initial:{price:100,balance:80}});
              const [a,b]=host.querySelectorAll('.uo-card');
              a.querySelector('.uo-primary').click();
              const light = getComputedStyle(a).getPropertyValue('--uo-panel').trim() === '#ffffff';
              first.update({price:100,balance:99,locked:true,lockReason:'נפתח בשלב 3',name:'<img src=x onerror=alert(1)>',icon:'../outside'});
              a.querySelector('.uo-primary').click(); a.querySelector('.uo-later').click();
              const safe = !a.querySelector('h3 img') && a.querySelector('.uo-primary').disabled;
              first.update({price:100,balance:100,icon:'../outside'});
              const fallback = a.querySelector('.uo-main-icon').src.endsWith('/upgrade.svg');
              for (const price of [0,-1,NaN,Infinity,'100',undefined]) {
                first.update({price,balance:999}); if(!a.querySelector('.uo-primary').disabled) throw Error('invalid price enabled');
              }
              first.update({price:100,balance:Infinity});
              const invalidBalance = a.querySelector('.uo-primary').disabled;
              first.update({visible:false}); const hidden = a.hidden;
              first.update(); const reset = !a.hidden && a.dataset.state==='short' && a.querySelector('.uo-number').textContent==='0';
              const detached = a.querySelector('.uo-later'); first.destroy(); first.destroy(); first.update({balance:200,price:100}); detached.click();
              const independent = b.isConnected && !a.isConnected;
              second.destroy(); host.remove();
              return {light,safe,fallback,invalidBalance,hidden,reset,independent,upgraded,later};
            }''')
            assert all(api[k] for k in ['light','safe','fallback','invalidBalance','hidden','reset','independent']), api
            assert api['upgraded'] == 1 and api['later'] == 1, api
            page.emulate_media(reduced_motion='reduce')
            page.locator('#replay').click()
            assert page.evaluate('document.getAnimations().length') == 0
            assert not errors and not external, (errors, external)
            result = dict(browser=browser.version, loaded_files=len(loaded), icons=22,
                          rendered_icon_variants=132, raster_theme_checks=len(raster),
                          viewport_checks=sizes, contrast=namespace['contrast_rows'](),
                          animation_total_ms=max(a['duration'] + a['delay'] for a in animations),
                          reduced_motion_animations=0, api=api, errors=errors, external_requests=external)
            browser.close()
            return result
    finally:
        server.shutdown(); server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--chrome', default='/usr/bin/chromium')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    result = run(args.chrome, args.screenshots)
    if args.output:
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
