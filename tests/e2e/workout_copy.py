"""Synthetic local phone layout and speech capture: python3 tests/e2e/workout_copy.py."""
import functools
import http.server
import json
import re
import shutil
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
approved = json.loads((root / 'tests/fixtures/workout-approved-copy.json').read_text())


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def plain(text):
    assert not re.search('[\u0591-\u05c7]', text), text
    assert not re.search('סמיכה|שימו לב|ניתור|פלאנק|מכרעים|קואורדינציה', text.replace('שכיבות סמיכה', '')), text


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/snd/voice/*.wav*', lambda route: route.fulfill(status=404, body='missing synthetic recording'))
        page.add_init_script("""
          localStorage.setItem('kidfit.v1', JSON.stringify({
            profile: {stage3d:false, sound:false, intro:false, listen:false, voice:true},
            sessions: [{id:'synthetic-workout', date:new Date().toISOString(), duration:60,
              programId:'jump-a', programName:'ניתור א׳: הבסיס', items:[
                {exId:'plank', name:'פלאנק', type:'time', target:30, done:30}]}]
          }));
          window.spoken = [];
          window.SpeechSynthesisUtterance = class { constructor(text) {this.text=text;} };
          Object.defineProperty(window, 'speechSynthesis', {value: {
            getVoices:()=>[{name:'synthetic-hebrew', lang:'he-IL', localService:true}],
            addEventListener(){}, cancel(){},
            speak(utterance){window.spoken.push(utterance.text); queueMicrotask(()=>utterance.onend?.());}
          }});
        """)
        page.goto(origin + '/workout/')
        page.locator('h1').wait_for()
        for exercise_id, expected in approved.items():
            page.evaluate('(id)=>location.hash="/exercise/"+id', exercise_id)
            page.wait_for_function('(id)=>document.querySelector("svg[data-ex]")?.dataset.ex === id', arg=exercise_id)
            before = page.evaluate('spoken.length')
            page.locator('#help').click()
            page.wait_for_function('(n)=>spoken.length>n', arg=before)
            steps = page.locator('#helpbox .steps li').all_text_contents()
            assert ' '.join(steps) == expected, exercise_id
            assert page.locator('#helpbox .tip').count() == 0
            plain(page.locator('#app').inner_text())
            pointed = page.evaluate("async (id)=>(await import('./js/say.js?v=20261010-child-copy-1')).SAY_TTS[id]", exercise_id)
            assert page.evaluate('spoken.at(-1)') == pointed, exercise_id
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), exercise_id
            page.locator('#help').click()
            assert page.locator('#helpbox').is_hidden()

        for route in ['home', 'exercises', 'free', 'start/speed', 'history', 'settings']:
            page.evaluate('(route)=>location.hash="/"+route', route)
            page.wait_for_timeout(100)
            plain(page.locator('#app').inner_text())
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), route
            if route == 'history':
                assert 'קפיצות א׳: הבסיס' in page.locator('#app').inner_text()
                page.locator('[data-toggle]').click()
                assert 'קרש' in page.locator('#app').inner_text()

        page.goto(origin + '/workout/voice-rec/')
        page.locator('#line').wait_for()
        lines = page.evaluate("async ()=>(await import('../js/voice-lines.js?v=20261010-child-copy-1')).VOICE_LINES.map(l=>l.text)")
        assert len(lines) == 202
        for index, text in enumerate(lines):
            assert page.locator('#line').inner_text() == text
            plain(text)
            if index + 1 < len(lines):
                page.locator('#next').click()
        assert not errors, errors
        print(json.dumps({'explanations': 50, 'recordingLines': 202, 'phoneWidth': 390,
                          'pointedFallback': True, 'savedNames': True, 'pageErrors': errors}))
        browser.close()
finally:
    server.shutdown()
