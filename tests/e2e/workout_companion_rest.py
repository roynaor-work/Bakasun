"""Character progression and rest-day protection, with synthetic phone data.

Run a local server, then python3 tests/e2e/workout_companion_rest.py.
"""
import os
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('WORKOUT_TEST_URL', 'http://127.0.0.1:8765/workout/')
OUTPUT = Path('/workspace/work')
OUTPUT.mkdir(parents=True, exist_ok=True)


def data(page):
    return page.evaluate("JSON.parse(localStorage.getItem('kidfit.v1'))")


def setup(browser, stage3d=True, theme='light'):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True,
        has_touch=True, device_scale_factor=2, timezone_id='Asia/Jerusalem', color_scheme=theme)
    context.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    context.route('https://fonts.gstatic.com/**', lambda route: route.abort())
    context.add_init_script("""
      if (!localStorage.getItem('kidfit.v1')) {
        localStorage.setItem('kidfit.v1', JSON.stringify({
          profile: { name: '', voice: false, sound: false, intro: false, stage3d: %s,
            ratioV2: true, noTimerV1: true, rest: 0, level: 'easy' },
          sessions: [4, 5, 6, 7].map(day => ({ id: 'test-' + day,
            date: new Date(2026, 9, day, 12).toISOString(), programName: 'אימון בדיקה',
            duration: 30, items: [{exId:'squats', name:'סקוואט', type:'reps', target:10, done:1}],
            feedback: 'hard' })),
          tokens: 2, games: { resetV: 2, bests: { snake: 42 }, played: {}, recent: [], count: 0 },
          parent: { together: { mode: 'challenge', exId: 'squats', target: 3 } }
        }));
        localStorage.setItem('kidfit.minuteRecords.v1', JSON.stringify({squats:{best:12,last:8,attempts:2}}));
      }
    """ % ('true' if stage3d else 'false'))
    page = context.new_page()
    page.clock.set_fixed_time(datetime(2026, 10, 9, 12, tzinfo=timezone.utc))
    return context, page


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('BAKASUN_BROWSER', '/usr/bin/chromium'),
        headless=True, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'])
    context, page = setup(browser)
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    page.goto(BASE)
    expect(page.locator('[data-companion]')).to_have_attribute('data-companion', '4')
    expect(page.locator('.rest-card')).to_contain_text('4 ימי אימון ברצף')
    expect(page.locator('.rest-card')).to_contain_text('נחת יום אחד')
    # Wait for the actual model, rather than only for the canvas element.
    expect(page.locator('[data-companion-portrait] canvas')).to_be_visible()
    expect(page.locator('[data-companion-portrait]')).to_have_attribute('data-companion-ready', 'true')
    before = data(page)
    page.goto(BASE + '#/free')
    page.locator('[data-pick="squats"]').tap()
    page.locator('#begin').tap()
    expect(page.locator('#count')).to_be_visible()
    # An unfinished workout and its reload/resume must not improve the character.
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('#quit').tap()
    expect(page.locator('#resume')).to_be_visible()
    expect(page.locator('[data-companion]')).to_have_attribute('data-companion', '4')
    page.reload()
    expect(page.locator('[data-companion]')).to_have_attribute('data-companion', '4')
    assert len(data(page)['sessions']) == 4
    page.locator('#resume').tap()
    expect(page.locator('#count')).to_be_visible()
    page.locator('#count').tap()
    page.locator('#did').tap()
    expect(page.locator('[data-fb="hard"]')).to_be_visible()
    page.locator('[data-fb="hard"]').tap()
    expect(page.locator('[data-companion]')).to_have_attribute('data-companion', '5')
    expect(page.locator('.companion-card')).to_contain_text('הדמות שלך השתפרה!')
    expect(page.locator('.companion-card')).to_contain_text('שלב 2')
    expect(page.locator('.rest-card')).to_contain_text('5 ימי אימון ברצף')
    after = data(page)
    assert len(after['sessions']) == 5
    assert after['sessions'][:4] == before['sessions']
    assert after['sessions'][-1]['feedback'] == 'hard'
    assert after['tokens'] == 2
    assert after['games']['bests']['snake'] == 42
    assert after['parent']['together'] == before['parent']['together']
    assert page.evaluate("JSON.parse(localStorage.getItem('kidfit.minuteRecords.v1')).squats.best") == 12
    page.get_by_role('button', name='לדף הבית 🏠', exact=True).tap()
    page.reload()
    expect(page.locator('[data-companion]')).to_have_attribute('data-companion', '5')
    expect(page.locator('.companion-card')).to_contain_text('שלב 2')
    assert len(data(page)['sessions']) == 5
    for width in [320, 390]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
    expect(page.locator('[data-companion-portrait] canvas')).to_be_visible()
    expect(page.locator('[data-companion-portrait]')).to_have_attribute('data-companion-ready', 'true')
    page.locator('.companion-card').screenshot(path=str(OUTPUT / 'workout-companion-5.png'))
    page.goto(BASE + '#/history')
    expect(page.locator('.companion-card')).to_contain_text('5 אימונים')
    expect(page.locator('.badge').filter(has_text='שלישייה')).not_to_have_class('badge off')
    expect(page.locator('.rest-card')).to_contain_text('5 ימי אימון ברצף')
    # A later, longer break preserves the best run and the character.
    page.clock.set_fixed_time(datetime(2026, 10, 13, 12, tzinfo=timezone.utc))
    page.reload()
    expect(page.locator('.rest-card')).to_contain_text('0 ימי אימון ברצף')
    expect(page.locator('.rest-card')).to_contain_text('הכי הרבה: 5')
    expect(page.locator('.companion-card')).to_contain_text('5 אימונים')
    assert data(page)['sessions'] == after['sessions']
    modules = [url for url in requests if '.js?' in url and url.startswith(BASE)]
    assert modules and all(url.endswith('?v=20261009-companion-1') for url in modules), modules
    assert not errors, errors
    context.close()

    # The SVG fallback is usable without WebGL, at a narrow width and in dark mode.
    context, page = setup(browser, stage3d=False, theme='dark')
    page.set_viewport_size({'width': 320, 'height': 844})
    page.goto(BASE)
    expect(page.locator('.companion-fallback')).to_be_visible()
    expect(page.locator('.companion-patch')).to_have_text('4')
    assert page.locator('[data-companion-portrait] canvas').count() == 0
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('.companion-card').screenshot(path=str(OUTPUT / 'workout-companion-fallback-dark.png'))
    context.close()

    # A failed 3D import must also leave a visible, stable fallback.
    context, page = setup(browser)
    context.route('**/js/stage3d.js?*', lambda route: route.abort())
    page.goto(BASE)
    expect(page.locator('.companion-fallback')).to_be_visible()
    expect(page.locator('.companion-patch')).to_have_text('4')
    page.goto(BASE + '#/minute')
    expect(page.get_by_role('heading', name='הדקה שלי ⏱️')).to_be_visible()
    context.close()
    browser.close()
    print('PASS: character, saved history, rest protection, narrow/dark/fallback UI, uniform versions')
