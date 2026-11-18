"""Browser checks and patch rehearsal with synthetic data.

Run with Python Playwright and Chromium. Only temporary copies receive the patch.
"""

from contextlib import contextmanager
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import os
import re
import shutil
import subprocess

from playwright.sync_api import expect, sync_playwright


FEATURE = Path(__file__).resolve().parent.parent
REPO = FEATURE.parents[3]
FEATURE_PATH = FEATURE.relative_to(REPO).as_posix()
STORE_PATH = f'/{FEATURE_PATH}/src/store.mjs'
DB_NAME = 'bakasun-progress-board-v1'
PATCH = FEATURE / 'patches/0001-connect-progress-board.patch'
SCREENSHOTS = os.environ.get('PB_SCREENSHOT_DIR')
CLOCK = datetime(2026, 11, 18, 10, tzinfo=timezone.utc)


@contextmanager
def patched_server():
    with TemporaryDirectory(prefix='bakasun-progress-test-') as temp:
        isolated = Path(temp)
        subprocess.run(['git', 'init', '--quiet', temp], check=True)
        paths = re.findall(r'^\+\+\+ b/(.+)$', PATCH.read_text(), re.M)
        originals = {name: (REPO / name).read_bytes() for name in paths}
        for name, content in originals.items():
            target = isolated / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        package = isolated / FEATURE_PATH
        (package / 'patches').mkdir(parents=True)
        shutil.copy2(FEATURE / 'apply.sh', package)
        shutil.copy2(PATCH, package / 'patches')

        def apply(mode):
            subprocess.run([package / 'apply.sh', mode], check=True, cwd=isolated, stdout=subprocess.DEVNULL)

        apply('--check')
        apply('--apply')
        assert all((isolated / name).read_bytes() != original for name, original in originals.items())
        apply('--reverse')
        assert all((isolated / name).read_bytes() == original for name, original in originals.items())
        apply('--apply')

        class Handler(SimpleHTTPRequestHandler):
            def translate_path(self, path):
                resolved = Path(super().translate_path(path))
                rel = resolved.relative_to(REPO).as_posix()
                return str(isolated / rel if rel in originals else resolved)

            def log_message(self, *_):
                pass

        with ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=REPO)) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                yield f'http://127.0.0.1:{server.server_port}'
            finally:
                server.shutdown()
                thread.join()


def context(browser, **extra):
    return browser.new_context(
        viewport={'width': 844, 'height': 390}, locale='he-IL', has_touch=True,
        timezone_id='Asia/Jerusalem', service_workers='block', **extra,
    )


def assert_fit(page, width, height=None):
    size = page.evaluate('''() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      ribbonBottom: document.querySelector('.pb-ribbon')?.getBoundingClientRect().bottom
    })''')
    assert size['width'] <= width, size
    if height is not None:
        assert size['height'] <= height and size['ribbonBottom'] <= height, size


def screenshot(page, name):
    if SCREENSHOTS:
        out = Path(SCREENSHOTS)
        out.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(out / name))


def check_preview(browser, base):
    with context(browser) as session:
        page = session.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script('''(() => {
          window.praiseSpoken = [];
          Object.defineProperty(window, 'speechSynthesis', {value: {
            getVoices: () => [{lang: 'he-IL', localService: true}],
            speak: line => window.praiseSpoken.push({text: line.text, lang: line.lang}),
          }});
          window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        })()''')
        url = f'{base}/{FEATURE_PATH}/preview.html'
        page.goto(url)
        expect(page.locator('.pb-stat-stars .pb-stat-value')).to_have_text('17')
        expect(page.locator('.pb-stat-streak .pb-stat-value')).to_have_text('7')
        expect(page.locator('.pb-stat-level .pb-stat-value')).to_have_text('3')
        expect(page.locator('.pb-plot')).to_be_visible()
        assert_fit(page, 844, 390)
        screenshot(page, 'preview-844x390.png')
        assert page.evaluate('praiseSpoken.length') == 0

        page.get_by_role('button', name='לשמוע').click()
        spoken = page.evaluate('praiseSpoken.at(-1)')
        assert spoken['lang'] == 'he-IL' and 'תְּ' in spoken['text'], spoken
        assert '!' not in spoken['text']

        page.get_by_role('button', name='הגדרות המחמאות').click()
        expect(page.locator('.pb-title')).to_be_focused()
        page.get_by_label('גיל', exact=True).select_option('9-12')
        page.get_by_label('לשון פנייה להקראה').select_option('masculine')
        page.get_by_role('button', name='שמירה').click()
        expect(page.get_by_role('button', name='הגדרות המחמאות')).to_be_focused()
        page.get_by_role('button', name='לשמוע').click()
        spoken = page.evaluate('praiseSpoken.at(-1).text')
        assert 'תָּ' in spoken and spoken != page.locator('.pb-ribbon-copy p').inner_text(), spoken

        page.get_by_label('פעילות לגרף').select_option(index=1)
        expect(page.locator('.pb-chart-title .pb-unit')).to_have_text('תרגילים שהושלמו')
        page.get_by_role('button', name='כל התגים').click()
        expect(page.locator('.pb-title')).to_be_focused()
        expect(page.locator('.pb-badge-group')).to_have_count(6)
        expect(page.locator('.pb-badge-row')).to_have_count(20)
        page.wait_for_function('''() => [...document.querySelectorAll('.pb-badge-row img')]
          .every(image => image.naturalWidth === 128)''')
        text = page.locator('.pb-board').inner_text()
        assert not re.search(r'[!\u0600-\u06ff]', text)
        page.get_by_role('button', name='חזרה ללוח').click()
        expect(page.get_by_role('button', name='כל התגים')).to_be_focused()

        page.get_by_role('button', name='הדגמת קבלת תג').click()
        frames = page.locator('[data-pb-frame]')
        expect(frames).to_have_count(8)
        assert frames.evaluate_all('frames => frames.map(frame => frame.dataset.pbFrame)') == list('12345678')
        expect(page.locator('.pb-ribbon')).to_contain_text('יד לעזרה')
        assert set(frames.evaluate_all('frames => frames.map(frame => getComputedStyle(frame).animationName)')) == {'pb-frame'}
        screenshot(page, 'badge-award-844x390.png')

        page.emulate_media(reduced_motion='reduce')
        page.get_by_role('button', name='הדגמת קבלת תג').click()
        expect(page.locator('.pb-ribbon')).to_contain_text('יד לעזרה')
        expect(frames).to_have_count(0)
        for width in (390, 320):
            page.set_viewport_size({'width': width, 'height': 844})
            assert_fit(page, width)
        screenshot(page, 'preview-320.png')
        assert DB_NAME not in page.evaluate('indexedDB.databases().then(rows => rows.map(row => row.name))')
        page.goto(url + '?progressBoard=0')
        expect(page.locator('.pb-preview-disabled')).to_have_text('לוח ההתקדמות כבוי.')
        expect(page.locator('[data-progress-board]')).to_have_count(0)
        assert not errors, errors
    print('preview, badges, speech requests and reduced motion')


def check_storage(browser, base):
    with context(browser) as session:
        page = session.new_page()
        page.goto(f'{base}/{FEATURE_PATH}/preview.html?progressBoard=0')
        result = page.evaluate('''async path => {
          const {createStore} = await import(path);
          const [one, two] = await Promise.all([createStore(), createStore()]);
          const event = {id: 'exercise-one', activity: 'strength', kind: 'workout', source: 'workout',
            at: Date.now(), stars: 3, fullWorkout: true, hardFeedback: true};
          const results = await Promise.all([one.record(event), two.record(event), two.record({...event, id: 'exercise-two'})]);
          return {accepted: results.filter(Boolean).length, praise: results.filter(row => row?.praise).length};
        }''', STORE_PATH)
        assert result == {'accepted': 2, 'praise': 1}, result
        other = session.new_page()
        other.goto(f'{base}/{FEATURE_PATH}/preview.html?progressBoard=0')
        assert other.evaluate('''async path => {
          const {createStore} = await import(path);
          const store = await createStore();
          return (await store.read()).stars;
        }''', STORE_PATH) == 6
    print('shared IndexedDB transactions and persistent deduplication')


def setup_workout(session):
    session.add_init_script('''(() => {
      if (!location.pathname.startsWith('/workout/') || localStorage.getItem('kidfit.v1')) return;
      localStorage.setItem('kidfit.v1', JSON.stringify({
        profile: {name: '', age: 10, level: 'easy', voice: false, sound: false, music: false, intro: false,
          rest: 0, animStyle: 'stick', gameSeconds: 2},
        sessions: [], tokens: 3, parent: {outdoorEnabled: false},
      }));
    })()''')


def workout_flow(page, base, disabled=False):
    flag = '?progressBoard=0' if disabled else ''
    path = f'{base}/workout/{flag}'
    requests = []
    page.on('request', lambda request: requests.append(request.url))
    page.clock.set_fixed_time(CLOCK)
    page.goto(path + '#/history')
    if disabled:
        expect(page.get_by_role('heading', name='המעקב שלי 📈')).to_be_visible()
        expect(page.get_by_role('button', name='ההתקדמות שלי')).to_have_count(0)
    else:
        page.get_by_role('button', name='ההתקדמות שלי').tap()
        expect(page.locator('.pb-stat-stars .pb-stat-value')).to_have_text('0')
        expect(page.locator('.pb-chart')).to_contain_text('אחרי שתי תוצאות באותה פעילות')
        page.get_by_role('button', name='הגדרות המחמאות').tap()
        expect(page.get_by_label('גיל', exact=True)).to_have_value('9-12')
    page.goto(path + '#/free')
    page.locator('[data-pick="squats"]').tap()
    page.locator('#begin').tap()
    target = int(page.locator('#repcard .target').inner_text().split()[0])
    for _ in range(target):
        page.locator('#count').tap()
    page.locator('#did').tap()
    page.locator('[data-fb="hard"]').tap()
    expect(page.locator('#session-stars')).to_have_attribute('aria-label', '3 כוכבים על מאמץ והשלמה')
    if disabled:
        expect(page.locator('.pb-ribbon')).to_have_count(0)
        assert not any(FEATURE_PATH in url for url in requests)
        return

    expect(page.locator('.pb-ribbon')).to_contain_text('מילה כנה')
    expect(page.locator('.pb-ribbon')).to_contain_text('דיווחת שהאימון היה קשה')
    expect(page.locator('.pb-ribbon .pb-listen')).to_have_count(0)
    page.clock.set_fixed_time(CLOCK.replace(minute=30))
    page.goto(path + '#/arcade')
    page.locator('[data-game="moles"] b').tap()
    page.locator('#gstart').tap()
    page.locator('#gcv').tap()
    expect(page.locator('#gover .pb-ribbon')).to_contain_text('משחק חדש בלוח', timeout=12_000)
    page.locator('#gback').tap()
    page.goto(path + '#/progress')
    expect(page.locator('.pb-stat-stars .pb-stat-value')).to_have_text('5')
    page.reload()
    expect(page.locator('.pb-stat-stars .pb-stat-value')).to_have_text('5')


def island_flow(page, base, disabled=False):
    requests = []
    page.on('request', lambda request: requests.append(request.url))
    page.clock.set_fixed_time(CLOCK.replace(hour=11))
    page.goto(f'{base}/workout/island/?dev=1&quality=low' + ('&progressBoard=0' if disabled else ''))
    page.wait_for_function('() => Boolean(window.__island?.engine)')
    page.evaluate('() => { window.__island.view.paused = true; }')
    page.locator('[data-action="avatar-start"]').click()
    page.evaluate('''() => {
      const {engine, data} = window.__island;
      engine.skipTutorial();
      engine.tick = () => {};
      data.featureFlags.events = false;
    }''')
    shortcut = page.locator('[data-action="quick-scores"]')
    if disabled:
        expect(shortcut).to_have_attribute('aria-label', 'הדירוג שלי')
        shortcut.click()
        expect(page.locator('[data-personal-scores="true"]')).to_be_visible()
        assert not any(FEATURE_PATH in url for url in requests)
        return

    expect(shortcut).to_have_attribute('aria-label', 'ההתקדמות שלי')
    shortcut.click()
    expect(page.locator('.pb-stat-stars .pb-stat-value')).to_have_text('5', timeout=20_000)
    expect(page.get_by_role('button', name='תוצאות המשחקים באי')).to_be_visible()
    page.locator('[data-action="close-modal"]').click()

    # Use the live tennis result validator and engine finish callback. Only its
    # rendering session is replaced, to make the test independent of GPU timing.
    page.evaluate('''() => {
      const {engine, data} = window.__island;
      engine.state.money = 100000;
      const type = data.config.minigames.tennis.requiresBuilding;
      if (!engine.state.buildings.some(b => b.typeId === type)) {
        let placed = false;
        for (let z = 0; z < engine.state.world.size && !placed; z++) {
          for (let x = 0; x < engine.state.world.size && !placed; x++) placed = engine.place(type, x, z).ok;
        }
        if (!placed) throw new Error('tennis court unavailable');
      }
      const entry = engine.registry.minigames.get('tennis');
      engine.registry.minigames.set('tennis', {...entry, start(ctx) {
        window.finishTennis = outcome => {
          if (outcome === 'cancel') return ctx.cancel();
          const won = outcome === 'win';
          const score = won ? data.config.minigames.tennis.rules.gamesToWin : 0;
          return ctx.finish({outcome, score, tennis: {
            won, gamesFor: score, gamesAgainst: won ? 0 : data.config.minigames.tennis.rules.gamesToWin,
            stage: ctx.level, stars: won ? 3 : data.config.minigames.tennis.rules.lossStars,
            seed: ctx.seed >>> 0, durationSeconds: 20, difficulty: ctx.difficulty,
          }});
        };
        return {snapshot: {}, setPaused() {}, dispose() {}};
      }});
    }''')
    for outcome in ('cancel', 'lose', 'win'):
        page.evaluate("() => window.__island.games.launch('tennis', undefined, 1)")
        expect(page.locator('.game-screen')).to_be_visible()
        assert page.evaluate('outcome => finishTennis(outcome).ok', outcome)
        page.evaluate('() => { window.__island.view.paused = true; }')
        if outcome == 'lose':
            expect(page.locator('[data-result="tennis"]')).to_be_visible()
            expect(page.locator('.pb-ribbon')).to_have_count(0)
            page.locator('[data-action="close-modal"]').click()
        elif outcome == 'win':
            expect(page.locator('[data-result="tennis"] .pb-ribbon')).to_contain_text('שלושה כוכבים')
            page.locator('[data-action="close-modal"]').click()
    shortcut.click()
    expect(page.locator('.pb-stat-stars .pb-stat-value')).to_have_text('8')
    page.get_by_role('button', name='תוצאות המשחקים באי').click()
    expect(page.locator('[data-personal-scores="true"]')).to_be_visible()
    page.locator('[data-action="close-modal"]').click()
    page.clock.set_fixed_time(CLOCK.replace(day=19))
    # The league opens its results asynchronously. Supply a settled result to
    # that presentation entry point and verify that the ribbon waits for it.
    page.evaluate('''() => {
      const {games} = window.__island;
      const result = {score: 5, stars: 0, stage: 1, outcome: 'win', league: {
        race: 0, track: 'coast', laps: 2, place: 1, points: 10, coins: 8,
      }};
      const host = games.showResult('islandRacing', undefined, result);
      games.onProgressResult({runId: 'league-result', gameId: 'islandRacing', result, at: Date.now()}, host);
    }''')
    expect(page.locator('[data-racing-league-screen="result"] .pb-ribbon')).to_contain_text('סבב מלא ששיחקת')


def check_apps(browser, base):
    for disabled in (False, True):
        with context(browser, reduced_motion='reduce') as session:
            setup_workout(session)
            session.route('https://**/*', lambda route: route.abort())
            errors = []
            page = session.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            workout_flow(page, base, disabled)
            island = session.new_page()
            island.on('pageerror', lambda error: errors.append(str(error)))
            island_flow(island, base, disabled)
            dbs = island.evaluate('async () => (await indexedDB.databases()).map(row => row.name)')
            assert (DB_NAME in dbs) is not disabled
            assert not errors, errors
    print('patch, workouts, workout games, island finish and both rollback paths')


if __name__ == '__main__':
    with patched_server() as base, sync_playwright() as playwright:
        executable = os.environ.get('BAKASUN_BROWSER') or shutil.which('chromium')
        browser = playwright.chromium.launch(
            executable_path=executable, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        )
        check_preview(browser, base)
        check_storage(browser, base)
        check_apps(browser, base)
        browser.close()
