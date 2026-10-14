"""Synthetic local workout fixtures and version checks; no family cloud or sends."""
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect

BASE = os.environ.get('WORKOUT_TEST_URL', 'http://127.0.0.1:8765/workout/')
FINISH_MODULES = {'app.js', 'belts.js', 'camera-demo.mjs', 'camera-screen.mjs',
    'dad-test.js', 'engine.js', 'logic.js', 'outdoors.js', 'parent.js', 'rest-days.js',
    'speech.js', 'store.js', 'together.js', 'voice-lines.js', 'voice-player.js', 'weekly.js'}
FRAME_MODULES = {'camera-session.mjs', 'keyframes.mjs', 'upload.mjs',
    'upload-background.mjs', 'video-recording.mjs'}


def check_versions(requests):
    modules = [url for url in requests if '.js?' in url or '.mjs?' in url]
    modules = [url for url in modules if url.startswith(BASE)]
    assert modules
    for url in modules:
        name = Path(urlparse(url).path).name
        expected = ('20261014-w2g-1' if name in FINISH_MODULES else
            '20261011-vids-signed-1' if name in {'vids.js', 'vids-cloud.js'} else
            '20261013-frames-1' if name in FRAME_MODULES else '20261010-camera-1')
        assert url.endswith('?v=' + expected), url
    assert len({url for url in modules if '/logic.js?' in url}) <= 1


def data(page):
    return page.evaluate("JSON.parse(localStorage.getItem('kidfit.v1'))")


def fixed_day(page, day):
    page.clock.set_fixed_time(datetime(2026, 10, day, 12, tzinfo=timezone.utc))


def setup(browser):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True,
        has_touch=True, timezone_id='Asia/Jerusalem')
    context.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    context.route('https://fonts.gstatic.com/**', lambda route: route.abort())
    context.route('**/snd/voice/*.wav*', lambda route: route.fulfill(status=404, body='missing test recording'))
    context.add_init_script("""
      if (!localStorage.getItem('kidfit.v1')) localStorage.setItem('kidfit.v1', JSON.stringify({
        profile: {name:'',voice:true,sound:false,intro:false,stage3d:false,listen:false,
          rest:0,ratioV2:true,noTimerV1:true}, sessions:[], tokens:7,
        games:{resetV:2,bests:{snake:42}},
        parent:{together:{mode:'challenge',exId:'squats',target:5}}
      }));
      window.spoken=[];
      window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
      Object.defineProperty(window,'speechSynthesis',{value:{
        getVoices(){return [{name:'synthetic',lang:'he-IL',localService:true}];},
        addEventListener(){},cancel(){},speak(u){spoken.push(u.text);queueMicrotask(()=>u.onend?.());}
      }});
    """)
    page = context.new_page()
    fixed_day(page, 14)
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    return context, page, errors, requests


def enter_parent(page, first=False):
    page.goto(BASE + '#/parent')
    expect(page.locator('#pin1')).to_be_visible()
    page.locator('#pin1').fill('1234')
    if first:
        page.locator('#pin2').fill('1234')
    page.locator('#enter').click()
    expect(page.locator('#outdoor-enabled')).to_be_visible()


def one_workout(page):
    page.goto(BASE + '#/free')
    page.locator('[data-pick="squats"]').tap()
    page.locator('#begin').tap()
    page.locator('#count').tap()
    page.locator('#did').tap()
    page.locator('[data-fb="ok"]').tap()
    expect(page.locator('#session-stars')).to_be_visible()
