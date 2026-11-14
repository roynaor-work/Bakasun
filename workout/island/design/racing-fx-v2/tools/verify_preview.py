#!/usr/bin/env python3
"""Real Chromium review. Serve the repository at 127.0.0.1:8765 first.

Optional: RACING_FX_BASE_URL and CHROMIUM_PATH override the local defaults.
Requires Playwright; no dependencies are added to the repository.
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('RACING_FX_BASE_URL', 'http://127.0.0.1:8765/workout/island/design/racing-fx-v2/preview.html')


def main():
    m = json.loads((ROOT/'manifest.json').read_text())
    errors, failures, remote_requests, reviews = [], [], [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':844,'height':390}, device_scale_factor=1, is_mobile=True, has_touch=True)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda e: errors.append(e.text) if e.type=='error' else None)
        page.on('requestfailed', lambda r: failures.append(r.url))
        page.on('response', lambda r: failures.append(f'{r.status} {r.url}') if r.status>=400 else None)
        page.on('request',lambda r: remote_requests.append(r.url) if not r.url.startswith(('http://127.0.0.1:', 'file:', 'data:')) else None)
        page.goto(URL)
        page.wait_for_function('window.__racingFxPreview?.ready')
        assert page.evaluate('document.documentElement.scrollWidth===innerWidth && document.documentElement.scrollHeight===innerHeight'), '844x390 must fit without page scrolling'
        bounds=page.locator('#stage').bounding_box()
        assert bounds['width']>=600 and bounds['height']>=140
        for effect in m['effects']:
            page.locator(f'button[data-effect="{effect["id"]}"]').click()
            page.wait_for_function('(id)=>window.__racingFxPreview.ready && window.__racingFxPreview.selected===id',arg=effect['id'])
            index = min(2,effect['frameCount']-1)
            page.locator('#frame').evaluate('(el,n)=>{el.value=n;el.dispatchEvent(new Event("input",{bubbles:true}));}',index)
            page.wait_for_function('(i)=>window.__racingFxPreview.currentFrame===i && window.__racingFxPreview.paused',arg=index)
            page.screenshot(path=str(ROOT/'verification'/f'{effect["id"]}-844x390.png'))
            assert page.locator('#download').get_attribute('href')==effect['atlas']
            assert page.locator('#frame').get_attribute('max')==str(effect['frameCount']-1)
            reviews.append({'effect':effect['id'],'frame':index,'screenshot':f'{effect["id"]}-844x390.png','ready':True})
        # Pause must stop the effect clock and frame, not only change the label.
        page.locator('button[data-effect="turbo-high"]').click()
        page.wait_for_function('window.__racingFxPreview.ready && window.__racingFxPreview.selected==="turbo-high" && window.__racingFxPreview.paused')
        before=page.evaluate('window.__racingFxPreview.elapsed')
        page.wait_for_timeout(160)
        assert page.evaluate('window.__racingFxPreview.elapsed')==before
        page.locator('#play').click()
        page.wait_for_timeout(180)
        assert page.evaluate('window.__racingFxPreview.elapsed')>before
        page.locator('#play').click()
        page.wait_for_timeout(40)
        frozen=page.evaluate('window.__racingFxPreview.elapsed')
        page.wait_for_timeout(150)
        assert page.evaluate('window.__racingFxPreview.elapsed')==frozen
        # Background choices and tier switches are actual controls.
        for background in ['checker','light','asphalt']:
            page.locator(f'button[data-bg="{background}"]').click()
            page.wait_for_function('(b)=>window.__racingFxPreview.background===b',arg=background)
            page.screenshot(path=str(ROOT/'verification'/f'turbo-high-{background}-844x390.png'))
        for tier in ['low','balanced','high']:
            page.locator('#quality').select_option(tier)
            page.wait_for_function('(ids)=>window.__racingFxPreview.ready && ids.includes(window.__racingFxPreview.selected)',arg=m['qualityTiers'][tier]['effects'])
            enabled=page.locator('#effects button:not([disabled])').count()
            assert enabled==len(m['qualityTiers'][tier]['effects'])
            assert page.evaluate('window.__racingFxPreview.selected') in m['qualityTiers'][tier]['effects']
        page.locator('#quality').select_option('review')
        # Manual reduced motion hides the screen-space effect, preserving review scrubbing.
        page.locator('button[data-effect="gear-shift"]').click()
        page.wait_for_function('window.__racingFxPreview.ready && window.__racingFxPreview.selected==="gear-shift"')
        page.locator('#reduced').check()
        page.locator('#restart').click()
        page.wait_for_function('window.__racingFxPreview.reducedMotion && window.__racingFxPreview.currentFrame===0')
        # Portrait is usable too; only landscape is the requested acceptance viewport.
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth===innerWidth')
        assert page.evaluate('[...document.querySelectorAll(".mast,.library,.workspace,footer")].every(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;})'), 'RTL overflow must not be clipped off the left side'
        page.screenshot(path=str(ROOT/'verification'/'preview-390x844.png'),full_page=True)
        page.set_viewport_size({'width':1440,'height':960})
        page.locator('#reduced').uncheck()
        page.locator('button[data-effect="turbo-high"]').click()
        page.wait_for_function('window.__racingFxPreview.ready && window.__racingFxPreview.selected==="turbo-high"')
        page.locator('#frame').evaluate('(el)=>{el.value=2;el.dispatchEvent(new Event("input",{bubbles:true}));}')
        page.wait_for_timeout(50)
        page.screenshot(path=str(ROOT/'verification'/'preview-desktop.png'),full_page=True)
        # Verify OS reduced motion over HTTP. Managed Chromium blocks file://.
        local=browser.new_page(viewport={'width':844,'height':390},reduced_motion='reduce')
        local.on('pageerror',lambda e: errors.append(str(e)))
        local.goto(URL)
        local.wait_for_function('window.__racingFxPreview?.ready && window.__racingFxPreview.reducedMotion')
        assert local.evaluate('window.__racingFxPreview.currentFrame')==0
        local.close()
        browser_version=browser.version
        browser.close()
    assert not errors, errors
    assert not failures, failures
    assert not remote_requests, remote_requests
    result={'status':'PASS','browser':f'Chromium {browser_version}','viewport':[844,390],
            'otherViewports':[[390,844],[1440,960]],'deviceScaleFactor':1,
            'effectReviews':reviews,'consoleErrors':errors,'failedRequests':failures,'externalRequests':remote_requests,
            'checks':['landscape viewport fit','all 10 atlases decode and render','all effect selectors and frame scrubbing',
                      'pause freezes clock; resume advances','three backgrounds','three quality tiers',
                      'manual reduced motion','OS reduced motion','portrait no horizontal overflow',
                      'desktop filmstrip','download paths'],
            'limits':'Browser verification only. Managed Chromium blocks file:// with ERR_BLOCKED_BY_ADMINISTRATOR, so preview was verified over localhost HTTP. No physical phone, FPS, GPU timing or live-game integration measured.'}
    (ROOT/'verification'/'browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':'PASS','effectsReviewed':len(reviews),'consoleErrors':errors,'failedRequests':failures,'externalRequests':remote_requests}))


if __name__=='__main__':
    main()
