"""Scheduled full test countdown and a success summary with zero/partial reps."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from workout_finish_helpers import BASE, setup, data, enter_parent, fixed_day, check_versions

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('BAKASUN_BROWSER', '/usr/bin/chromium'),
        headless=True, args=['--no-sandbox'])
    context, page, errors, requests = setup(browser)
    enter_parent(page, first=True)
    page.locator('#outdoor-enabled').uncheck()
    page.locator('#dad-test-date').fill('2026-10-18')
    page.locator('#dad-test-save').tap()
    expect(page.locator('#dad-test-status')).to_contain_text('נשמר')
    page.get_by_role('button', name='🔒 יציאה ממצב הורים').tap()
    assert page.locator('.dad-test-reminder').count() == 0
    for day, days in [(15, 3), (16, 2), (17, 1), (18, 0)]:
        fixed_day(page, day)
        page.reload()
        expect(page.locator('[data-dad-test-days]')).to_have_attribute('data-dad-test-days', str(days))
        expect(page.locator('.dad-test-reminder .companion-fallback')).to_be_visible()
        page.wait_for_function("spoken.some(t=>t.includes('מִבְחָן עִם אַבָּא'))")
        before = page.evaluate('spoken.length')
        page.goto(BASE + '#/history')
        page.goto(BASE + '#/home')
        assert page.evaluate('spoken.length') == before  # No repeated reminder on ordinary navigation.
    # Reopening a saved child route also announces the countdown.
    page.goto(BASE + '#/history')
    page.reload()
    page.wait_for_function("spoken.some(t=>t.includes('מִבְחָן עִם אַבָּא'))")
    page.goto(BASE + '#/home')
    for partial in [False, True]:
        page.get_by_role('button', name='למבחן עם אבא', exact=True).tap()
        expect(page.locator('#together-begin')).to_be_disabled()
        expect(page.get_by_text('אבא ואני: גוף מלא', exact=True)).to_be_visible()
        page.locator('#child-ready').tap()
        page.locator('#dad-ready').tap()
        page.locator('#together-begin').tap()
        page.locator('#skip').tap()
        page.once('dialog', lambda dialog: dialog.accept())
        page.locator('#quit').tap()
        page.reload()
        assert page.evaluate("JSON.parse(localStorage.getItem('kidfit.activeWorkout')).dadTestDate") == '2026-10-18'
        page.locator('#resume').tap()
        counted = False
        while page.locator('#skip').count():
            if partial and not counted and page.locator('#count').count():
                page.locator('#count').tap()
                page.locator('#did').tap()
                counted = True
            else:
                page.locator('#skip').tap()
        page.locator('[data-fb="hard"]').tap()
        expect(page.get_by_role('heading', name='הצלחת במבחן עם אבא!')).to_be_visible()
        assert page.locator('#session-stars .off').count() == 0
        expect(page.get_by_text('עשינו את זה יחד, בקצב שלך.', exact=True)).to_be_visible()
        text = page.locator('#app').inner_text()
        for forbidden in ['דילוג', 'מתוך', 'לא נספרו', 'אפשר לנוח. האימון יחכה', 'הורדתי', 'כישלון']:
            assert forbidden not in text, forbidden
        page.wait_for_function("spoken.some(t=>t.includes('הִצְלַחְתָּ'))")
        session = data(page)['sessions'][-1]
        assert session['dadTestDate'] == '2026-10-18'
        assert session['together'] == {'mode': 'workout', 'programId': 'full'}
        assert len(session['items']) == 18
        assert sum(item['done'] for item in session['items']) == (1 if partial else 0)
        assert data(page)['tokens'] == 7
        assert data(page)['parent']['together']['mode'] == 'challenge'
        for width in [320, 390]:
            page.set_viewport_size({'width': width, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        Path('/workspace/work').mkdir(exist_ok=True)
        page.screenshot(path='/workspace/work/workout-dad-test-success.png', full_page=True)
        page.get_by_role('button', name='לדף הבית 🏠', exact=True).tap()
    fixed_day(page, 19)
    page.reload()
    assert page.locator('.dad-test-reminder').count() == 0
    enter_parent(page)
    page.locator('#dad-test-clear').tap()
    assert data(page)['parent']['dadTestDate'] == ''
    page.reload()
    expect(page.locator('#dad-test-date')).to_have_value('')
    check_versions(requests)
    assert not errors, errors
    browser.close()
    print('PASS: protected persisted schedule, 3/2/1/today voice countdown, full test readiness/resume, zero/partial success, cancellation')
