"""Phone-sized browser checks. Run a local server, then python3 tests/e2e/workout_minute.py.

Uses a controlled monotonic clock to check the exact deadline without waiting.
Set WORKOUT_REAL_MINUTE=1 to also run a full sixty-second minute with the real clock.
"""
import json
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('WORKOUT_TEST_URL', 'http://127.0.0.1:8765/workout/')
KEY = 'kidfit.minuteRecords.v1'
PROFILE = {'name': '', 'intro': False, 'stage3d': False, 'voice': False, 'sound': False,
           'ratioV2': True, 'noTimerV1': True}


def boot(context, virtual=True):
    context.add_init_script("""
      if (!localStorage.getItem('kidfit.v1')) localStorage.setItem('kidfit.v1', JSON.stringify({
        profile: %s, sessions: [], tokens: 2,
        games: { bests: { snake: 42 }, played: {}, recent: [], count: 0, resetV: 2 }
      }));
    """ % json.dumps(PROFILE))
    if virtual:
        context.add_init_script("window.minuteNow = 0; performance.now = () => window.minuteNow;")
    context.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    context.route('https://fonts.gstatic.com/**', lambda route: route.abort())


def forward(page, ms):
    page.evaluate('(ms) => { window.minuteNow += ms; }', ms)


def records(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key) || "{}")', KEY)


def open_test(page, ex='squats'):
    page.goto(BASE + '#/minute/' + ex)
    if page.locator('#minute-again').count():
        page.locator('#minute-again').click()


def run_minute(page, count, ex='squats'):
    open_test(page, ex)
    page.locator('#minute-start').click()
    expect(page.locator('#minute-count')).to_be_disabled()
    forward(page, 3000)
    expect(page.locator('#minute-count')).to_be_enabled()
    for _ in range(count):
        page.locator('#minute-count').click()
    forward(page, 60_000)
    expect(page.get_by_role('heading', name='סיימת דקה! 💛')).to_be_visible()


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('BAKASUN_BROWSER', '/usr/bin/chromium'),
                                 headless=True, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    boot(context)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    existing = page.evaluate("localStorage.getItem('kidfit.v1')")
    page.get_by_role('button', name='למבחן הדקה שלי', exact=True).click()
    expect(page.get_by_role('heading', name='הדקה שלי ⏱️')).to_be_visible()
    page.get_by_role('button', name='סקוואט הדקה הראשונה שלי', exact=True).click()
    expect(page.locator('#minute-count')).to_have_text('0')
    page.locator('#minute-start').click()
    expect(page.locator('#minute-count')).to_be_disabled()
    forward(page, 3000)
    expect(page.locator('#minute-count')).to_be_enabled()
    for _ in range(3):
        page.locator('#minute-count').tap()
    page.locator('#minute-minus').tap()
    expect(page.locator('#minute-count')).to_have_text('2')
    # Leaving at 59.999 seconds still counts as stopping early.
    forward(page, 59_999)
    page.locator('#minute-count').tap()
    expect(page.locator('#minute-count')).to_have_text('3')
    forward(page, 1)
    # A click delivered before the next timer callback cannot extend the count.
    page.evaluate("document.querySelector('#minute-count')?.click()")
    expect(page.get_by_role('heading', name='סיימת דקה! 💛')).to_be_visible()
    assert records(page)['squats'] == {'best': 3, 'last': 3, 'attempts': 1}
    assert page.evaluate("localStorage.getItem('kidfit.v1')") == existing
    page.reload()
    expect(page.locator('#minute-best')).to_have_text('השיא האישי שלי בדקה: 3 חזרות')
    run_minute(page, 1)
    expect(page.get_by_text('השיא האישי שלך נשאר 3. כל יום מרגיש קצת אחרת.')).to_be_visible()
    run_minute(page, 3)
    expect(page.get_by_text('הגעת שוב לשיא האישי שלך. כל הכבוד על המאמץ!')).to_be_visible()
    run_minute(page, 4)
    expect(page.get_by_text('שיא אישי חדש! כיף לראות את הדרך שלך.')).to_be_visible()
    run_minute(page, 2, 'crunches')
    assert records(page)['squats'] == {'best': 4, 'last': 4, 'attempts': 4}
    assert records(page)['crunches'] == {'best': 2, 'last': 2, 'attempts': 1}
    before_cancel = records(page)
    for elapsed in [0, 3000, 62_999]:
        open_test(page)
        page.locator('#minute-start').click()
        forward(page, elapsed)
        # Use an immediate DOM click so the exact clock boundary is retained.
        page.evaluate("document.querySelector('#minute-stop').click()")
        expect(page.get_by_role('heading', name='זמן לנוח 💛')).to_be_visible()
        assert records(page) == before_cancel
    open_test(page)
    page.locator('#minute-start').click()
    forward(page, 3000)
    expect(page.locator('#minute-count')).to_be_enabled()
    page.evaluate("Object.defineProperty(document, 'hidden', {configurable: true, value: true}); document.dispatchEvent(new Event('visibilitychange'));")
    expect(page.get_by_role('heading', name='זמן לנוח 💛')).to_be_visible()
    assert records(page) == before_cancel
    page.reload()
    page.locator('#minute-start').click()
    page.goto(BASE + '#/home')
    forward(page, 90_000)
    assert records(page) == before_cancel
    # Time-based exercises do not offer a repetitions test.
    page.goto(BASE + '#/exercise/plank')
    assert page.get_by_role('button', name='⏱️ מבחן דקה בתרגיל הזה').count() == 0
    page.goto(BASE + '#/exercise/squats')
    page.get_by_role('button', name='⏱️ מבחן דקה בתרגיל הזה').click()
    expect(page.locator('#minute-start')).to_be_visible()
    # The ordinary workout counter is also tappable and starts at zero.
    page.goto(BASE + '#/exercise/squats')
    page.locator('#solo').click()
    expect(page.locator('#count')).to_have_text('0')
    page.locator('#count').tap()
    page.locator('#plus').tap()
    page.locator('#minus').tap()
    expect(page.locator('#count')).to_have_text('1')
    page.locator('#count').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#count')).to_have_text('2')
    for width in [320, 390]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.goto(BASE + '#/minute/squats')
    page.screenshot(path='/tmp/workout-minute-phone.png', full_page=True)
    # Simulate storage quota failure: show an honest status, retain old records.
    page.evaluate("() => { Storage.prototype.setItem = () => { throw new Error('full'); }; }")
    page.locator('#minute-start').click()
    forward(page, 3000)
    expect(page.locator('#minute-count')).to_be_enabled()
    forward(page, 60_000)
    expect(page.get_by_text('הדקה מוצגת כאן, אבל לא הצלחנו לשמור אותה בטלפון.')).to_be_visible()
    assert records(page) == before_cancel
    assert not errors, errors
    print('Phone UI passed: taps, exact deadline, reload, personal bests, cancellation, keyboard, 320/390px, quota failure; no page errors.')

    # Check the application's default three.js stage with the real clock.
    gl_context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    boot(gl_context, virtual=False)
    gp = gl_context.new_page()
    gp.on('pageerror', lambda error: errors.append(str(error)))
    gp.goto(BASE)
    gp.evaluate("() => { const data = JSON.parse(localStorage.getItem('kidfit.v1')); data.profile.stage3d = true; localStorage.setItem('kidfit.v1', JSON.stringify(data)); }")
    gp.goto(BASE + '#/minute/squats')
    gp.reload()
    expect(gp.locator('.stage3d-canvas')).to_be_visible(timeout=15_000)
    gp.locator('#minute-start').click()
    expect(gp.locator('#minute-count')).to_be_enabled(timeout=6000)
    gp.locator('#minute-count').tap()
    expect(gp.locator('#minute-count')).to_have_text('1')
    gp.locator('#minute-stop').click()
    expect(gp.get_by_role('heading', name='זמן לנוח 💛')).to_be_visible()
    assert records(gp) == {}
    assert not errors, errors
    gl_context.close()
    print('Default three.js stage passed: minute screen, touch count, stop; no page errors.')

    if os.environ.get('WORKOUT_REAL_MINUTE') == '1':
        real = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        boot(real, virtual=False)
        rp = real.new_page()
        rp.on('pageerror', lambda error: errors.append(str(error)))
        rp.goto(BASE + '#/minute/squats')
        rp.locator('#minute-start').click()
        expect(rp.locator('#minute-count')).to_be_enabled(timeout=6000)
        rp.locator('#minute-count').tap()
        expect(rp.get_by_role('heading', name='סיימת דקה! 💛')).to_be_visible(timeout=65_000)
        assert records(rp)['squats'] == {'best': 1, 'last': 1, 'attempts': 1}
        assert not errors, errors
        print('Real-clock minute passed: three preparation seconds and a full sixty-second test.')
    browser.close()
