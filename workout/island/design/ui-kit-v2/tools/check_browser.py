#!/usr/bin/env python3
"""Exercise the standalone kit in Chromium; emit compact evidence, not game tests."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
import os
import shutil
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'verification'
SIZES = [(1440,1000),(844,390),(768,1024),(390,844),(360,740),(320,740)]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def screenshot(page, name, selector=None):
    page.wait_for_timeout(450)
    raw = page.locator(selector).screenshot() if selector else page.screenshot()
    picture = Image.open(BytesIO(raw)).convert('RGB')
    path = OUT/name
    for quality in (84,76,68,60,52):
        picture.save(path,format='WEBP',quality=quality,method=6)
        if path.stat().st_size <= 100000:
            return dict(path=str(path.relative_to(ROOT)),width=picture.width,height=picture.height,bytes=path.stat().st_size)
    raise AssertionError(f'WebP budget exceeded: {path}')


def main():
    OUT.mkdir(exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/index.html'
    problems=[]
    snapshots=[]
    layouts=[]
    manifest=json.loads((ROOT/'manifest.json').read_text())
    browser_path=os.environ.get('ISLAND_KIT_CHROMIUM') or shutil.which('chromium') or shutil.which('google-chrome')
    try:
        with sync_playwright() as p:
            launch={'headless':True,'args':['--no-sandbox']}
            if browser_path:
                launch['executable_path']=browser_path
            browser=p.chromium.launch(**launch)
            version=browser.version
            for width,height in SIZES:
                context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1)
                page=context.new_page()
                page.on('pageerror',lambda error:problems.append(str(error)))
                page.on('console',lambda msg:problems.append(msg.text) if msg.type=='error' else None)
                page.on('request',lambda req:problems.append(f'External request: {req.url}') if not req.url.startswith(f'http://127.0.0.1:{server.server_port}/') else None)
                page.on('response',lambda response:problems.append(f'HTTP {response.status}: {response.url}') if response.status>=400 else None)
                page.goto(url)
                page.wait_for_timeout(650)
                assert page.locator('[data-game]').count()==9
                assert page.locator('.icon-tile').count()==36
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Page overflow at {width}'
                # Load the full gallery to check every image, including those below the fold.
                page.locator('img[loading]').evaluate_all("images => images.forEach(img => img.loading = 'eager')")
                page.wait_for_function('() => Array.from(document.images).every(img => img.complete && img.naturalWidth > 0)', timeout=10000)
                small=page.locator('a,button,select').evaluate_all('''nodes => nodes.filter(node => {
                  const r=node.getBoundingClientRect(); return r.width>0 && r.height>0 && (r.width<47.5 || r.height<47.5);
                }).map(n=>({tag:n.tagName,text:n.textContent.trim(),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))''')
                assert not small, f'Small touch targets at {width}: {small}'
                if width==1440:
                    snapshots.append(screenshot(page,'overview-desktop.webp'))
                    snapshots.append(screenshot(page,'all-games.webp','.game-grid'))
                    snapshots.append(screenshot(page,'button-states.webp','.button-board'))
                if width==390:
                    page.evaluate('window.scrollTo(0,0)')
                    snapshots.append(screenshot(page,'overview-phone.webp'))
                for game in manifest['games']:
                    trigger=page.locator(f'[data-game="{game["id"]}"]')
                    trigger.click()
                    assert page.locator('#game-dialog').evaluate('node=>node.open')
                    assert page.locator('#dialog-title').inner_text()==game['name']
                    assert page.locator('#dialog-art').get_attribute('src')==game['intro']
                    assert page.locator('#game-dialog').evaluate('n=>n.scrollWidth<=n.clientWidth'), f'Dialog overflow: {width}, {game["id"]}'
                    assert page.locator('#game-dialog').evaluate('n=>{const r=n.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight}')
                    page.keyboard.press('Shift+Tab')
                    assert page.locator('#game-dialog').evaluate('n=>n.contains(document.activeElement)'), 'Focus escaped dialog'
                    if width==390 and game['id']=='soccer':
                        page.locator('#dialog-close').focus()
                        snapshots.append(screenshot(page,'intro-phone.webp'))
                    page.locator('#dialog-start').click()
                    assert page.locator('#dialog-result').is_visible()
                    assert page.locator('#game-dialog').get_attribute('aria-labelledby')=='dialog-result-title'
                    assert page.locator('#dialog-result-title').evaluate('n=>n===document.activeElement')
                    if width==390 and game['id']=='soccer':
                        page.wait_for_timeout(450)
                        snapshots.append(screenshot(page,'result-phone.webp'))
                    page.locator('#dialog-again').click()
                    assert page.locator('#dialog-intro').is_visible()
                    assert page.locator('#dialog-start').evaluate('n=>n===document.activeElement')
                    page.keyboard.press('Escape')
                    assert not page.locator('#game-dialog').evaluate('n=>n.open')
                    assert trigger.evaluate('n=>n===document.activeElement'), 'Opener focus not restored'
                # Explicit close, back and result-menu paths in addition to Escape.
                for close_id,via_result in [('dialog-close',False),('dialog-back',False),('dialog-menu',True)]:
                    page.locator('[data-game="tennis"]').click()
                    if via_result:
                        page.locator('#dialog-start').click()
                    page.locator('#'+close_id).click()
                    assert not page.locator('#game-dialog').evaluate('n=>n.open')
                for stars in range(4):
                    page.locator('#rating-count').select_option(str(stars))
                    rating=page.locator('[data-rating]')
                    assert rating.get_attribute('aria-label')==f'{stars} מתוך 3 כוכבים'
                    assert rating.locator('img[src="rewards/star-filled.svg"]').count()==stars
                    assert rating.locator('img[src="rewards/star-empty.svg"]').count()==3-stars
                page.locator('.button-board .sample-default.ik-primary').click()
                assert 'מתחילים' in page.locator('#button-status').inner_text()
                assert page.locator('.button-board button:disabled').count()==3
                assert page.locator('.button-board button:disabled').evaluate_all('nodes=>nodes.every(n=>n.matches(":disabled"))')
                page.locator('#motion-replay').click()
                assert page.locator('#motion-sample').evaluate('n=>getComputedStyle(n).animationDuration')=='0.24s'
                assert page.locator('#motion-stars img').first.evaluate('n=>getComputedStyle(n).animationIterationCount')=='1'
                page.emulate_media(reduced_motion='reduce')
                page.locator('#motion-replay').click()
                animated=page.locator('.ik-enter,.ik-card-enter,.ik-stars-enter > img').evaluate_all('nodes=>nodes.filter(n=>getComputedStyle(n).animationName!=="none").length')
                assert animated==0, f'Reduced motion failed: {width}'
                assert 'תנועה מופחתת' in page.locator('#motion-preference').inner_text()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                layouts.append(dict(width=width,height=height,gamesExercised=9,overflow=False,minTouchPx=48,ratings=[0,1,2,3],keyboardFocus=True,reducedMotion=True))
                context.close()
            # All asset links and illustrations remain available without JS.
            context=browser.new_context(java_script_enabled=False,viewport={'width':390,'height':844})
            page=context.new_page()
            page.goto(url)
            assert page.locator('.no-script-note').is_visible()
            assert page.locator('.game-art-link').count()==9
            assert page.locator('.icon-tile').count()==36
            context.close()
            browser.close()
        assert not problems, problems
        report=dict(status='passed',browser=f'Chromium {version}',date='2026-11-04',layouts=layouts,dialogGameFlows=54,additionalCloseFlows=18,ratingChanges=24,externalRequests=0,pageErrors=0,httpErrors=0,csp='local-only meta policy; inline styles allowed, external scripts and connect-src blocked',withoutJavaScript=True,fileScheme='Blocked by managed Chromium policy; exercised through loopback HTTP.',screenshots=snapshots)
        (OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(dict(status=report['status'],layouts=len(layouts),gameFlows=54,webpFiles=len(snapshots),largestWebpBytes=max(x['bytes'] for x in snapshots),errors=len(problems)),indent=2))
    finally:
        server.shutdown()
        server.server_close()


if __name__=='__main__':
    main()
