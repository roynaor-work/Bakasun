"""Outdoor finish, age choice, voice, reload/offline and single persisted bonus."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from workout_finish_helpers import BASE, setup, data, enter_parent, one_workout, check_versions

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('BAKASUN_BROWSER', '/usr/bin/chromium'),
        headless=True, args=['--no-sandbox'])
    context, page, errors, requests = setup(browser)
    page.goto(BASE + '#/parent')
    expect(page.locator('#pin1')).to_be_visible()
    assert page.locator('#outdoor-enabled').count() == 0
    enter_parent(page, first=True)
    page.locator('#outdoor-age').select_option('8')
    assert data(page)['parent']['outdoorAge'] == 8
    one_workout(page)
    expect(page.locator('.outdoor-card')).to_contain_text('תבעט בכדור לקיר 10 פעמים.')
    assert page.evaluate("document.querySelector('#session-stars').compareDocumentPosition(document.querySelector('.outdoor-card')) & Node.DOCUMENT_POSITION_FOLLOWING")
    page.wait_for_function("spoken.some(t=>t.includes('לַקִּיר'))")
    saved = data(page)
    assert saved['sessions'][-1]['outdoor'] == {'taskId': 'wall-8', 'age': 8}
    assert 'completedAt' not in saved['sessions'][-1]['outdoor']
    page.get_by_role('button', name='לדף הבית 🏠', exact=True).tap()
    page.reload()
    expect(page.locator('.outdoor-card')).to_contain_text('תבעט בכדור לקיר 10 פעמים.')
    # A failed local write keeps the task actionable and awards no bonus.
    page.evaluate("() => { window.realSet=Storage.prototype.setItem; Storage.prototype.setItem=function(){throw new Error('synthetic quota');}; }")
    page.locator('#outdoor-done').tap()
    expect(page.locator('#outdoor-status')).to_contain_text('עוד לא נשמר')
    assert 'completedAt' not in data(page)['sessions'][-1]['outdoor']
    expect(page.locator('#outdoor-done')).to_be_enabled()
    page.evaluate('() => { Storage.prototype.setItem=window.realSet; }')
    context.set_offline(True)
    page.locator('#outdoor-done').tap()
    expect(page.locator('#outdoor-done')).to_be_disabled()
    expect(page.locator('#outdoor-status')).to_contain_text('עוד כוכב')
    claimed = data(page)
    assert claimed['tokens'] == 7 and claimed['games']['bests']['snake'] == 42
    assert claimed['sessions'][-1]['items'] == saved['sessions'][-1]['items']
    assert 'completedAt' in claimed['sessions'][-1]['outdoor']
    # Even a programmatic duplicate click cannot change the completion timestamp.
    page.evaluate("document.querySelector('#outdoor-done').dispatchEvent(new Event('click'))")
    assert data(page)['sessions'] == claimed['sessions']
    context.set_offline(False)
    page.reload()
    assert page.locator('.outdoor-card').count() == 0
    page.goto(BASE + '#/history')
    expect(page.locator('[data-toggle]').first).to_contain_text('★★★')
    enter_parent(page)
    page.locator('#outdoor-age').select_option('9')
    one_workout(page)
    expect(page.locator('.outdoor-card')).to_contain_text('12 פעמים')
    expect(page.locator('#session-stars')).to_have_attribute('aria-label', '2 כוכבים על מאמץ והשלמה')
    page.locator('#outdoor-done').tap()
    expect(page.locator('#session-stars')).to_have_attribute('aria-label', '3 כוכבים על מאמץ ומשחק בחוץ')
    for width in [320, 390]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    Path('/workspace/work').mkdir(exist_ok=True)
    page.screenshot(path='/workspace/work/workout-outdoors.png', full_page=True)
    enter_parent(page)
    page.locator('#outdoor-enabled').uncheck()
    page.reload()
    expect(page.locator('#outdoor-enabled')).not_to_be_checked()
    one_workout(page)
    assert page.locator('.outdoor-card').count() == 0
    assert 'outdoor' not in data(page)['sessions'][-1]
    assert len(data(page)['sessions']) == 3
    check_versions(requests)
    assert not errors, errors
    browser.close()
    print('PASS: age catalog, finish after stars, pointed voice, reload, offline/quota, one bonus, parent disable and narrow screen')
