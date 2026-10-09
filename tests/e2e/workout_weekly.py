"""Parent weekly planning/report checks with synthetic data at phone sizes.

Run a local server, then python3 tests/e2e/workout_weekly.py.
"""
import os
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('WORKOUT_TEST_URL', 'http://127.0.0.1:8765/workout/')
VERSION = '20261009-companion-1'


def stored(page):
    return page.evaluate("JSON.parse(localStorage.getItem('kidfit.v1'))")


def parent(page, first=False):
    page.goto(BASE + '#/parent-week')
    expect(page.locator('#pin1')).to_be_visible()
    page.locator('#pin1').fill('1234')
    if first:
        page.locator('#pin2').fill('1234')
    page.locator('#enter').tap()
    expect(page.locator('#week-plan-save')).to_be_visible()


def setup(browser, cloud=False):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True,
        has_touch=True, timezone_id='Asia/Jerusalem')
    context.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    context.route('https://fonts.gstatic.com/**', lambda route: route.abort())
    context.add_init_script("""
      if (!localStorage.getItem('kidfit.v1')) {
        const item = done => ({ exId: 'squats', name: 'סקוואט', type: 'reps', target: 10, done });
        const session = (id, day, duration, items, feedback) => ({ id,
          date: new Date(2026, 9, day, 12).toISOString(), programId: 'quick', programName: 'אימון בדיקה',
          duration, items: items.map(item), feedback });
        localStorage.setItem('kidfit.v1', JSON.stringify({
          profile: { name: '', plan: { 0: 'quick', 1: '' }, level: 'easy', intro: false,
            stage3d: false, voice: false, sound: false, ratioV2: true, noTimerV1: true,
            familyCode: %s },
          sessions: [session('old', 1, 60, [10], 'easy'), session('same', 4, 120, [10], 'ok'),
            session('partial', 5, 120, [1, 0], 'hard'), session('future', 11, 600, [10], 'easy')],
          tokens: 4, games: { resetV: 2, bests: { snake: 42 }, played: {}, recent: [], count: 1 },
          parent: { together: { mode: 'workout', programId: 'full' } }
        }));
      }
    """ % ('"TESTABCD"' if cloud else '""'))
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
    page.goto(BASE + '#/settings')
    assert page.locator('[data-day]').count() == 0
    assert page.locator('#resetplan').count() == 0
    page.get_by_role('button', name='🔒 תכנון השבוע ודוח להורה').tap()
    expect(page.locator('#pin1')).to_be_visible()
    parent(page, first=True)
    expect(page.locator('[data-plan-day="0"]')).to_have_value('quick')
    expect(page.locator('[data-plan-day="1"]')).to_have_value('')
    expect(page.locator('[data-total="workouts"]')).to_have_text('2')
    expect(page.locator('[data-total="minutes"]')).to_have_text('4')
    expect(page.locator('[data-total="stars"]')).to_have_text('4 ⭐')
    assert page.locator('[data-report-day]').count() == 7
    assert page.get_by_role('button', name='שבוע הבא', exact=True).is_disabled()
    before = stored(page)
    page.locator('[data-plan-day="5"]').select_option('full')
    page.locator('[data-plan-day="6"]').select_option('')
    assert stored(page)['profile']['plan'] == before['profile']['plan']
    page.locator('#week-plan-save').tap()
    expect(page.locator('#week-plan-status')).to_contain_text('התוכנית נשמרה')
    after = stored(page)
    assert after['profile']['plan']['5'] == 'full'
    assert after['sessions'] == before['sessions']
    assert after['tokens'] == 4 and after['games']['bests']['snake'] == 42
    assert after['parent']['together'] == before['parent']['together']
    for width in [320, 390]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
    page.screenshot(path='/workspace/work/workout-weekly-phone.png', full_page=True)
    page.locator('#week-to-child').tap()
    expect(page.get_by_role('button', name='מתחילים את האימון של היום 🚀')).to_have_attribute('data-go', '#/start/full')
    assert page.evaluate("sessionStorage.getItem('kidfit.parent.ok')") is None
    parent(page)
    page.reload()
    expect(page.locator('[data-plan-day="5"]')).to_have_value('full')
    page.get_by_role('button', name='שבוע קודם', exact=True).tap()
    expect(page.locator('[data-total="workouts"]')).to_have_text('1')
    page.get_by_role('button', name='שבוע קודם', exact=True).tap()
    expect(page.locator('#week-empty')).to_be_visible()
    page.get_by_role('button', name='השבוע הנוכחי', exact=True).tap()
    expect(page).to_have_url(BASE + '#/parent-week')
    expect(page.locator('[data-total="workouts"]')).to_have_text('2')
    context.set_offline(True)
    page.locator('[data-plan-day="5"]').select_option('quick')
    expect(page.locator('#week-plan-status')).to_contain_text('עוד לא נשמרו')
    page.locator('#week-plan-save').tap()
    page.wait_for_function("JSON.parse(localStorage.getItem('kidfit.v1')).profile.plan['5'] === 'quick'")
    expect(page.locator('#week-plan-status')).to_contain_text('התוכנית נשמרה')
    page.locator('#week-refresh').tap()
    expect(page.locator('[data-total="workouts"]')).to_have_text('2')
    context.set_offline(False)
    # Recommended plan is a draft until saved; no history is removed.
    page.locator('#week-plan-default').tap()
    expect(page.locator('[data-plan-day="5"]')).to_have_value('jump-c')
    assert stored(page)['profile']['plan']['5'] == 'quick'
    page.locator('#week-plan-save').tap()
    assert stored(page)['profile']['plan']['5'] == 'jump-c'
    # A quota error must not claim that the plan was saved.
    page.evaluate("""() => { window.originalStorageSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'kidfit.v1') throw new DOMException('test quota', 'QuotaExceededError');
        return window.originalStorageSet.call(this, key, value);
      }; }""")
    page.locator('[data-plan-day="5"]').select_option('full')
    page.locator('#week-plan-save').tap()
    expect(page.locator('#week-plan-status')).to_contain_text('עוד לא נשמרה')
    assert stored(page)['profile']['plan']['5'] == 'jump-c'
    page.evaluate('() => { Storage.prototype.setItem = window.originalStorageSet; }')
    # Child navigation locks direct access to every parent planning route.
    page.locator('#week-lock').tap()
    page.goto(BASE + '#/parent-week/2026-09-27')
    expect(page.locator('#pin1')).to_be_visible()
    assert not errors, errors
    modules = [url for url in requests if '/workout/' in url and '.js' in url]
    assert modules and all(url.endswith('?v=' + VERSION) for url in modules), modules
    assert len({url for url in modules if '/logic.js' in url}) == 1
    context.close()

    context, page = setup(browser, cloud=True)
    page.on('pageerror', lambda error: errors.append(str(error)))
    cloud_rows = [
      {'id': 'same', 'payload': {'id': 'same', 'date': '2026-10-04T09:00:00Z', 'duration': 120,
        'items': [{'exId': 'squats', 'name': 'סקוואט', 'type': 'reps', 'target': 10, 'done': 10}], 'feedback': 'easy'}},
      {'id': 'remote', 'payload': {'id': 'remote', 'date': '2026-10-06T09:00:00Z', 'duration': 180,
        'programName': 'פעילות בדיקה משותפת', 'items': [{'exId': 'squats', 'name': 'סקוואט', 'type': 'reps', 'target': 10, 'done': 10}],
        'together': {'mode': 'workout', 'programId': 'full'}, 'feedback': 'ok'}}]
    context.route('**/rest/v1/rpc/family_list', lambda route: route.fulfill(json=cloud_rows))
    parent(page, first=True)
    expect(page.locator('[data-total="workouts"]')).to_have_text('3')
    expect(page.locator('[data-total="minutes"]')).to_have_text('7')
    expect(page.locator('[data-total="stars"]')).to_have_text('7 ⭐')
    expect(page.locator('#weekly-details')).to_contain_text('1 פעילויות של אבא ואני')
    context.unroute('**/rest/v1/rpc/family_list')
    context.route('**/rest/v1/rpc/family_list', lambda route: route.abort())
    page.locator('#week-refresh').tap()
    expect(page.get_by_text('לא הצלחנו לרענן מהענן כרגע.', exact=False)).to_be_visible()
    expect(page.locator('[data-total="workouts"]')).to_have_text('3')
    # A late cloud response must not replace the child's screen.
    context.unroute('**/rest/v1/rpc/family_list')
    pending = []
    context.route('**/rest/v1/rpc/family_list', lambda route: pending.append(route))
    page.locator('#week-refresh').tap()
    page.wait_for_timeout(100)
    assert pending
    page.locator('#week-to-child').tap()
    pending.pop().fulfill(json=cloud_rows)
    page.wait_for_timeout(100)
    assert page.locator('#week-plan-save').count() == 0
    expect(page.get_by_role('button', name='לפעילות עם אבא')).to_be_visible()
    assert not errors, errors
    context.close()
    browser.close()
    print('Passed: PIN protection, legacy/rest plan, explicit save/reload/offline/quota, child home, weekly totals/navigation/empty state, cloud dedup/cache/late response, 320/390px and one import version.')
