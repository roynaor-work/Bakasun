#!/usr/bin/env python3
"""Exercise the standalone preview in Chromium, with SVG and PNG textures.

Serve the repository at 127.0.0.1:8765. Optional argument: a different preview URL.
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'verification'
OUT.mkdir(exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/workout/island/design/ui-rewards-v1/preview.html'


def loaded(page):
    page.wait_for_function('window.REWARD_KIT && [...document.images].every(i => i.complete && i.naturalWidth > 0)')


def touch_targets(page):
    small = page.evaluate('''() => [...document.querySelectorAll('button')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 56 || r.height < 56);
    }).map(el => ({label:el.textContent,width:el.offsetWidth,height:el.offsetHeight}))''')
    assert not small, small


def observe(page, selector):
    page.evaluate('''selector => {
      window.seenFrames = [];
      if (window.frameObserver) window.frameObserver.disconnect();
      window.frameObserver = new MutationObserver(records => records.forEach(r => window.seenFrames.push(r.target.dataset.asset)));
      window.frameObserver.observe(document.querySelector(selector), {attributes:true,attributeFilter:['data-asset']});
    }''', selector)


def check_frames(page, prefix):
    seen = page.evaluate('window.seenFrames')
    unique = list(dict.fromkeys(v for v in seen if v.startswith(prefix + '-')))
    assert unique == [f'{prefix}-{i:02}' for i in range(8)], unique
    return unique


errors = []
external = []
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda request: errors.append(request.url))
    page.on('request', lambda request: external.append(request.url) if request.url.startswith('http') and not request.url.startswith(('http://127.0.0.1:', 'http://localhost:')) else None)
    page.goto(URL)
    loaded(page)
    assert page.evaluate('document.documentElement.dir') == 'rtl'
    assert page.locator('.stage').bounding_box() == {'x': 0, 'y': 0, 'width': 844, 'height': 390}
    assert page.evaluate('[document.documentElement.scrollWidth,document.documentElement.scrollHeight]') == [844, 390]
    assert page.locator('.rating-star').count() == 3
    assert page.locator('#rating').get_attribute('aria-label') == 'שניים וחצי מתוך שלושה כוכבים'
    assert page.locator('#progress').get_attribute('aria-valuenow') == '75'
    missing_skins = page.evaluate('''() => [...document.querySelectorAll('[data-skin]')].filter(el => getComputedStyle(el).borderImageSource === 'none').map(el=>el.dataset.skin)''')
    assert not missing_skins, missing_skins
    touch_targets(page)
    page.screenshot(path=str(OUT / 'result-svg.png'))
    checks += ['844x390 no page overflow', 'three RTL rating slots', 'all exported skins rendered', 'minimum 56x56 targets', 'progress accessible value']

    page.locator('#replay').focus()
    assert page.locator('#replay').evaluate('el => getComputedStyle(el).outlineWidth') == '3px'
    page.keyboard.down(' ')
    assert page.locator('#replay').get_attribute('data-skin') == 'button-primary-pressed'
    page.keyboard.up(' ')
    assert page.locator('#replay').get_attribute('data-skin') == 'button-primary-default'
    page.wait_for_timeout(850)
    observe(page, '.rating-star')
    page.locator('#replay').click()
    page.wait_for_timeout(850)
    star_frames = check_frames(page, 'star-light')
    assert [el.get_attribute('data-asset') for el in page.locator('.rating-star').all()] == ['star-full', 'star-full', 'star-half']
    checks += ['visible keyboard focus', 'keyboard pressed/default skins', 'eight star frames and final 2.5 rating']

    observe(page, '#gift-image')
    page.locator('#gift').click()
    page.locator('#gift').click()
    page.wait_for_function('document.getElementById("gift").dataset.open === "true"')
    gift_frames = check_frames(page, 'gift-open')
    assert page.locator('#gift-image').get_attribute('data-asset') == 'gift-open'
    assert page.locator('#status').inner_text().startswith('המתנה נפתחה')
    page.screenshot(path=str(OUT / 'gift-open.png'))
    checks += ['eight gift frames', 'repeated gift input guarded', 'gift final pose and live announcement']

    page.locator('#replay').click()
    page.locator('#gift').click()
    page.wait_for_timeout(150)
    page.locator('#replay').click()
    page.wait_for_timeout(850)
    assert page.locator('#gift-image').get_attribute('data-asset') == 'gift-closed'
    assert page.locator('#gift').get_attribute('data-open') == 'false'
    page.locator('#gift').click()
    page.wait_for_timeout(100)
    page.locator('#format').click()
    page.wait_for_timeout(850)
    loaded(page)
    assert page.locator('#gift-image').get_attribute('data-asset') == 'gift-closed'
    assert page.locator('#format').get_attribute('aria-pressed') == 'true'
    assert page.evaluate('[...document.images].every(i => i.src.endsWith(".png"))')
    assert page.locator('#replay').evaluate('el => getComputedStyle(el).borderImageSource.includes(".png")')
    page.locator('#island').click()
    assert page.locator('#status').inner_text() == 'דוגמת עיצוב: כאן חוזרים לאי.'
    page.locator('#island').blur()
    page.screenshot(path=str(OUT / 'result-png.png'))
    checks += ['replay cancels gift', 'format switch cancels animation', 'PNG image and skin mode', 'secondary action']

    page.locator('#kit-tab').click()
    assert page.locator('#result-view').is_hidden()
    assert page.locator('.asset-card').count() == 39
    assert page.locator('.sample-surface:disabled').count() == 2
    touch_targets(page)
    page.screenshot(path=str(OUT / 'catalog.png'))
    page.locator('#kit-view').evaluate("el => { const heading = [...el.querySelectorAll('h2')].find(h => h.textContent.startsWith('כפתורים')); el.scrollTop = heading.offsetTop - el.offsetTop; }")
    page.screenshot(path=str(OUT / 'button-states.png'))
    page.locator('#kit-view').evaluate('el => el.scrollTop = el.scrollHeight')
    assert page.locator('#kit-view').evaluate('el => el.scrollTop > 0')
    page.screenshot(path=str(OUT / 'animation-frames.png'))
    checks += ['39 catalog entries', 'two disabled button samples', 'scrollable animation contact sheets']

    page.locator('#result-tab').click()
    page.emulate_media(reduced_motion='reduce')
    observe(page, '.rating-star')
    page.locator('#replay').click()
    page.wait_for_timeout(80)
    assert page.locator('.rating-star').first.get_attribute('data-asset') == 'star-full'
    assert not any(v.startswith('star-light-') for v in page.evaluate('window.seenFrames'))
    page.locator('#gift').click()
    page.wait_for_timeout(80)
    assert page.locator('#gift-image').get_attribute('data-asset') == 'gift-open'
    checks += ['reduced motion immediate final poses']

    page.set_viewport_size({'width': 390, 'height': 844})
    page.emulate_media(reduced_motion='no-preference')
    page.locator('#replay').click()
    page.wait_for_timeout(850)
    loaded(page)
    assert page.evaluate('document.documentElement.scrollWidth') == 390
    touch_targets(page)
    for selector in ['#replay', '#island', '#gift']:
        r = page.locator(selector).bounding_box()
        assert r['x'] >= 0 and r['x'] + r['width'] <= 390
        assert r['y'] >= 0 and r['y'] + r['height'] <= 844
    page.screenshot(path=str(OUT / 'portrait-390x844.png'))
    checks += ['390x844 portrait fallback without horizontal overflow']
    version = browser.version
    browser.close()

assert not errors, errors
assert not external, external
with Image.open(OUT / 'result-svg.png') as svg, Image.open(OUT / 'result-png.png') as png:
    difference = ImageChops.difference(svg.convert('RGB'), png.convert('RGB'))
    mean_difference = round(sum(ImageStat.Stat(difference).mean) / 3, 3)
    assert mean_difference < 8, mean_difference
checks += ['SVG/PNG visual consistency mean RGB difference < 8/255', 'no browser errors or external requests']
report = {'passed': True, 'browser': f'Chromium {version}', 'transport': 'file' if URL.startswith('file:') else 'http', 'viewport': [844, 390], 'portraitViewport': [390, 844], 'starFramesObserved': star_frames, 'giftFramesObserved': gift_frames, 'svgPngMeanRgbDifference': mean_difference, 'checks': checks, 'browserErrors': errors, 'externalRequests': external}
(OUT / 'browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
