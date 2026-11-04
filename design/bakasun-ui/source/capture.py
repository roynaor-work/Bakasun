"""Offline visual review. Requires Playwright, Pillow and local Chromium.

All HTML responses are fulfilled from disk; browser networking is offline.
Run: python3 design/bakasun-ui/source/capture.py
"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'screenshots'
PAGES = ['index', 'events', 'event', 'invoices']
WIDTHS = [320, 360, 390, 430, 768, 1440]
ORIGIN = 'http://127.0.0.1:8765/'


def run():
    SHOTS.mkdir(exist_ok=True)
    errors, requests, checks = [], [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=os.environ.get('BAKASUN_BROWSER', '/usr/bin/chromium'),
            args=['--no-sandbox', '--disable-crash-reporter', '--disable-breakpad'])
        context = browser.new_context(viewport={'width':390,'height':844},
                                      device_scale_factor=1, is_mobile=True, has_touch=True)
        context.set_offline(True)

        def respond(route):
            name = route.request.url.removeprefix(ORIGIN).split('?')[0]
            path = ROOT / name
            if name not in [p + '.html' for p in PAGES]:
                errors.append('Unexpected dependency: ' + route.request.url)
                route.abort()
            else:
                route.fulfill(status=200, content_type='text/html; charset=utf-8', body=path.read_bytes())

        context.route(ORIGIN + '**', respond)
        context.on('request', lambda request: requests.append(request.url))
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)

        for width in WIDTHS:
            page.set_viewport_size({'width':width,'height':844 if width < 761 else 1000})
            for theme in ['light', 'dark']:
                for name in PAGES:
                    page.goto(ORIGIN + name + '.html?theme=' + theme)
                    page.evaluate('document.fonts.ready')
                    assert page.locator('html').get_attribute('dir') == 'rtl'
                    assert page.locator('html').get_attribute('lang') == 'he'
                    assert page.locator('html').get_attribute('data-theme') == theme
                    assert page.locator('h1').count() == 1
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (name, width, theme, 'overflow')
                    assert page.evaluate("document.fonts.check('14px \"Baka Noto\"')"), 'Embedded font unavailable'
                    # Visible controls must stay inside the layout and have useful tap height.
                    bad = page.locator('button,a,input,select').evaluate_all('''els => els.filter(e => {
                      const r=e.getBoundingClientRect();
                      if (!r.width || !r.height || e.classList.contains('skip')) return false;
                      return r.left < -1 || r.right > innerWidth+1 || r.height < 43;
                    }).map(e => ({text:e.textContent.trim(),label:e.getAttribute('aria-label'),height:e.getBoundingClientRect().height}))''')
                    assert not bad, (name, width, theme, 'control bounds', bad)
                    checks.append({'page':name,'width':width,'theme':theme,'overflow':False})
                    if width == 390:
                        page.screenshot(path=str(SHOTS/f'{name}-mobile-{theme}.png'))
                        page.screenshot(path=str(SHOTS/f'{name}-mobile-{theme}-full.png'),full_page=True)
                    if width == 1440 and theme == 'light':
                        page.screenshot(path=str(SHOTS/f'{name}-desktop-light.png'),full_page=True)

        page.set_viewport_size({'width':390,'height':844})
        page.goto(ORIGIN+'index.html?theme=light')
        page.locator('[data-theme-toggle]').click()
        expect(page.locator('html')).to_have_attribute('data-theme','dark')
        expect(page.locator('[data-theme-toggle]')).to_have_attribute('aria-label','מעבר למצב בהיר')
        page.locator('.bottom-nav a').nth(1).click()
        expect(page.locator('html')).to_have_attribute('data-theme','dark')
        assert page.locator('[data-column="won"]').is_visible()
        assert not page.locator('[data-column="lead"]').is_visible()
        page.locator('[data-filter="all"]').click()
        assert page.locator('[data-column]:visible').count() == 5
        page.locator('[data-filter="quoted"]').click()
        assert page.locator('[data-column]:visible').count() == 1
        assert page.locator('[data-column="quoted"] [data-item]:visible').count() == 2
        page.locator('[data-search]').fill('לא קיים')
        expect(page.locator('[data-column="quoted"] [data-column-empty]')).to_be_visible()
        page.locator('[data-search]').fill('')
        page.locator('select[data-kind]').select_option('כנס')
        assert page.locator('[data-column="quoted"] [data-item]:visible').count() == 1
        page.locator('select[data-kind]').select_option('all')

        page.goto(ORIGIN+'event.html?theme=light')
        for key in ['suppliers','schedule','files','overview']:
            page.locator('#tab-'+key).click()
            expect(page.locator('#panel-'+key)).to_be_visible()
            assert page.locator('[role="tabpanel"]:visible').count() == 1
        page.locator('#tab-overview').focus()
        page.keyboard.press('ArrowLeft')
        expect(page.locator('#tab-suppliers')).to_be_focused()
        expect(page.locator('#panel-suppliers')).to_be_visible()

        page.goto(ORIGIN+'invoices.html?theme=light')
        for state in ['late','open','draft','paid']:
            page.locator('[data-filter="'+state+'"]').click()
            assert page.locator('.invoice-row:visible').count() == 1
        page.locator('[data-filter="all"]').click()
        page.locator('[data-search]').fill('D-2602')
        assert page.locator('.invoice-row:visible').count() == 1
        page.locator('[data-search]').fill('לא קיים')
        expect(page.locator('[data-empty]')).to_be_visible()
        page.locator('[data-search]').fill('')
        button=page.locator('[data-preview]').first
        button.click()
        expect(page.locator('dialog')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('dialog')).not_to_be_visible()
        expect(button).to_be_focused()

        page.goto(ORIGIN+'index.html?theme=light')
        check=page.locator('[data-check]').first
        check.click()
        expect(check).to_have_attribute('aria-pressed','true')
        check.click()
        expect(check).to_have_attribute('aria-pressed','false')
        # System preference applies when no explicit selection exists.
        page.evaluate("localStorage.removeItem('bakasun-design-theme')")
        page.emulate_media(color_scheme='dark')
        page.goto(ORIGIN+'index.html')
        expect(page.locator('html')).to_have_attribute('data-theme','dark')

        # Standalone proof: each HTML renders with no sibling files served.
        assert all(url.startswith(ORIGIN) and '.html' in url for url in requests), requests
        assert not errors, errors
        browser.close()

    for theme in ['light','dark']:
        background='#f7f5f0' if theme=='light' else '#181d1a'
        sheet=Image.new('RGB',(4*390+5*24,844+48),background)
        # RTL reading order: Today on the right, invoices on the left.
        for i,name in enumerate(reversed(PAGES)):
            shot=Image.open(SHOTS/f'{name}-mobile-{theme}.png').convert('RGB')
            sheet.paste(shot,(24+i*414,24))
        sheet.save(SHOTS/f'overview-{theme}.png',optimize=True)

    report={'render_checks':len(checks),'widths':WIDTHS,'themes':['light','dark'],
            'browser':'Chromium','network':'offline; HTML fulfilled from local disk only',
            'console_errors':errors,'external_requests':0,
            'interactions':['theme toggle and navigation persistence','system dark preference',
                            'board status + search + kind + empty state','four case tabs + RTL keyboard',
                            'invoice status + search + empty state','dialog Escape + focus return',
                            'task completion preview'],
            'capture_viewport':{'width':390,'height':844,'device_scale_factor':1},
            'physical_phone_test':False,'renders':checks}
    (ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(f'PASS: {len(checks)} renders; offline; no overflow, control clipping, or console errors. Interactions passed.')


if __name__ == '__main__':
    run()
