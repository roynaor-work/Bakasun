"""Shared activity checks at phone sizes, with synthetic local data only.

Run a local server, then python3 tests/e2e/workout_together.py.
"""
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('WORKOUT_TEST_URL', 'http://127.0.0.1:8765/workout/')


def data(page):
    return page.evaluate("JSON.parse(localStorage.getItem('kidfit.v1'))")


def enter_parent(page, first=False):
    page.goto(BASE + '#/parent-together')
    expect(page.locator('#pin1')).to_be_visible()
    page.locator('#pin1').fill('1234')
    if first:
        page.locator('#pin2').fill('1234')
    page.locator('#enter').click()
    expect(page.locator('#together-mode')).to_be_visible()


def ready(page):
    expect(page.locator('#together-begin')).to_be_disabled()
    page.locator('#child-ready').tap()
    expect(page.locator('#together-begin')).to_be_disabled()
    page.locator('#dad-ready').tap()
    expect(page.locator('#together-begin')).to_be_enabled()
    page.locator('#dad-ready').tap()
    expect(page.locator('#together-begin')).to_be_disabled()
    page.locator('#dad-ready').tap()
    page.locator('#together-begin').tap()


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('BAKASUN_BROWSER', '/usr/bin/chromium'),
        headless=True, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    context.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    context.route('https://fonts.gstatic.com/**', lambda route: route.abort())
    context.add_init_script("""
      if (!localStorage.getItem('kidfit.v1')) localStorage.setItem('kidfit.v1', JSON.stringify({
        profile: { name: '', intro: true, stage3d: false, voice: false, sound: false, rest: 0,
                   ratioV2: true, noTimerV1: true },
        sessions: [], tokens: 7, games: { bests: { snake: 42 }, resetV: 2 }
      }));
    """)
    page = context.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    page.goto(BASE)
    page.get_by_role('button', name='לפעילות עם אבא').tap()
    expect(page.get_by_text('אבא יבחר לנו אימון או אתגר שנעשה יחד.')).to_be_visible()
    enter_parent(page, first=True)  # Parent mode works without a cloud family code.
    page.locator('#together-mode').select_option('challenge')
    page.locator('#together-ex').select_option('squats')
    page.locator('#together-target').fill('0')
    page.locator('#together-save').tap()
    expect(page.locator('#together-error')).to_contain_text('בוחרים מספר שלם')
    assert data(page)['parent']['together'] is None
    page.locator('#together-target').fill('5')
    page.locator('#together-save').tap()
    expect(page.get_by_text('אבא ואני · אתגר משותף', exact=True)).to_be_visible()
    assert page.evaluate("sessionStorage.getItem('kidfit.parent.ok')") is None
    page.reload()
    expect(page.get_by_text('אבא ואני: סקוואט', exact=True)).to_be_visible()
    for width in [320, 390]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/workspace/work/workout-together-phone.png', full_page=True)
    ready(page)
    expect(page.locator('#count')).to_have_text('0')  # Shared mode skips the competitive intro.
    page.locator('#count').tap()
    page.locator('#did').tap()
    page.locator('[data-fb="ok"]').tap()
    expect(page.get_by_text('👨‍👦 אבא ואני · אתגר משותף. היה נעים לזוז יחד!')).to_be_visible()
    saved = data(page)
    assert len(saved['sessions']) == 1
    assert saved['sessions'][0]['together'] == {'mode': 'challenge', 'exId': 'squats', 'target': 5}
    assert saved['sessions'][0]['items'][0]['done'] == 1
    assert saved['tokens'] == 7 and saved['games']['bests']['snake'] == 42
    # Protected choice remains locked after returning to the child.
    enter_parent(page)
    page.locator('#together-mode').select_option('workout')
    page.locator('#together-program').select_option('full')
    page.locator('#together-save').tap()
    ready(page)
    expect(page.get_by_text('1 מתוך 18 · אבא ואני: גוף מלא', exact=True)).to_be_visible()
    # Complete warm-up, leave, reload and resume the shared snapshot.
    page.locator('#early').tap()
    expect(page.get_by_text('2 מתוך 18 · אבא ואני: גוף מלא', exact=True)).to_be_visible()
    page.goto(BASE + '#/home')
    page.reload()
    page.get_by_role('button', name='לפעילות עם אבא').tap()
    expect(page.locator('#together-resume')).to_be_visible()
    assert page.locator('#together-begin').count() == 0
    page.locator('#together-resume').tap()
    expect(page.get_by_text('2 מתוך 18 · אבא ואני: גוף מלא', exact=True)).to_be_visible()
    # Finish with one child repetition and remaining items skipped, offline.
    context.set_offline(True)
    page.locator('#early').tap()
    while not page.locator('#count').count():
        page.locator('#skip').tap()
    page.locator('#count').tap()
    page.locator('#did').tap()
    while page.locator('#skip').count():
        page.locator('#skip').tap()
    page.locator('[data-fb="ok"]').tap()
    expect(page.get_by_text('👨‍👦 אבא ואני · אימון משותף. היה נעים לזוז יחד!')).to_be_visible()
    assert len(data(page)['sessions']) == 2
    assert data(page)['sessions'][-1]['together'] == {'mode': 'workout', 'programId': 'full'}
    context.set_offline(False)
    page.goto(BASE + '#/history')
    page.locator('[data-toggle]').first.tap()
    expect(page.get_by_text('👨‍👦 אבא ואני · אימון משותף', exact=True)).to_be_visible()
    page.goto(BASE + '#/parent')
    page.locator('#pin1').fill('1234')
    page.locator('#enter').tap()
    expect(page.locator('[data-toggle]').first).to_contain_text('אבא ואני: גוף מלא')
    page.locator('[data-toggle]').first.tap()
    expect(page.get_by_text('👨‍👦 אבא ואני · אימון משותף', exact=True)).to_be_visible()
    # A time-based joint challenge runs through the ordinary timer.
    page.goto(BASE + '#/parent-together')
    page.locator('#together-mode').select_option('challenge')
    page.locator('#together-ex').select_option('plank')
    page.locator('#together-target').fill('2')
    page.locator('#together-save').tap()
    ready(page)
    page.clock.install()
    page.locator('#startstop').tap()
    page.clock.fast_forward(2000)
    expect(page.locator('[data-fb="ok"]')).to_be_visible()
    page.locator('[data-fb="ok"]').tap()
    assert data(page)['sessions'][-1]['items'][0]['done'] == 2
    assert data(page)['sessions'][-1]['together'] == {'mode': 'challenge', 'exId': 'plank', 'target': 2}
    # Each navigation loads one canonical version of logic.js.
    logic_urls = {url for url in requests if '/workout/js/logic.js' in url}
    assert len(logic_urls) == 1, logic_urls
    assert not errors, errors
    print('Passed: protected parent choice, both modes, reps/time, readiness, partial effort, offline completion, reload/resume, history/parent labels, 320/390px, one logic.js URL; no page errors.')
    browser.close()
