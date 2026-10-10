"""Real MediaRecorder/worker + synthetic pose UI; only ephemeral localhost uploads.
Run from the repository root: python3 tests/e2e/workout_camera.py.
"""
import base64
import functools
import http.server
import json
import shutil
import ssl
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[2]
parts, responses = [], []
fail_skeleton = False


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        global fail_skeleton
        assert self.path == '/receive'
        value = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert value['secret'] == 'synthetic-test'
        assert self.headers['Content-Type'] == 'text/plain'
        parts.append({**value, 'bytes': base64.b64decode(value['data'], validate=True)})
        reject = fail_skeleton and value['part'] == 'skeleton'
        if reject:
            fail_skeleton = False
        responses.append(not reject)
        self.send_response(302)
        self.send_header('Location', f'/ack/{len(responses) - 1}')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if not self.path.startswith('/ack/'):
            try:
                return super().do_GET()
            except (BrokenPipeError, ConnectionResetError):
                return  # Page navigation may cancel optional recording preload requests.
        body = json.dumps({'ok': responses[int(self.path.split('/')[-1])]}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def context(browser, consent=True, stage3d=True):
    ctx = browser.new_context(ignore_https_errors=True, viewport={'width': 390, 'height': 844})
    ctx.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    ctx.route('https://fonts.gstatic.com/**', lambda route: route.abort())
    ctx.add_init_script("""(() => {
      if (!localStorage.getItem('kidfit.v1')) localStorage.setItem('kidfit.v1', JSON.stringify({
        profile: { intro:false, stage3d:%s, voice:false, sound:false, rest:0,
          ratioV2:true, noTimerV1:true, level:'easy' }, sessions:[], tokens:0 }));
      window.recordingsStarted = 0;
      window.cameraLimits = [];
      const setTimer = window.setTimeout;
      window.setTimeout = (callback, ms, ...args) => {
        if (ms === 240000) window.cameraLimits.push(callback);
        return setTimer(callback, ms, ...args);
      };
      const Recorder = window.MediaRecorder;
      window.MediaRecorder = class extends Recorder {
        start(...args) { window.recordingsStarted++; return super.start(...args); }
      };
    })();""" % ('true' if stage3d else 'false'))
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda error: (errors.append(str(error)), print('PAGE ERROR:', str(error), flush=True)))
    page.goto(origin + '/workout/#/settings')
    expect(page.locator('#cameraWorkout')).not_to_be_checked()
    expect(page.locator('#camera-explanation')).to_contain_text('הסרטון לא נשמר ולא יוצא מהטלפון')
    if consent:
        page.evaluate('(endpoint) => localStorage.setItem("camlab.upload", JSON.stringify({endpoint,secret:"synthetic-test",consentId:"synthetic-consent"}))', origin + '/receive')
        page.reload()
        expect(page.locator('#camera-explanation')).to_contain_text('הסרטון נשלח לבדיקה בסיום')
    page.locator('#cameraWorkout').check()
    return ctx, page, errors


def open_camera(page, real_model=True):
    page.evaluate("location.hash='#/exercise/squats'")
    page.locator('#workout-camera').click()
    expect(page.locator('#camera-demo')).to_have_class('camera-demo intro')
    if real_model:
        page.wait_for_function("Number(document.querySelector('#camera-view')?.dataset.frames) > 0 || location.hash==='#/workout'", timeout=90000)
        assert page.locator('#camera-view').count(), [json.loads(p['bytes']) for p in parts if p['part'] == 'diagnostics']
    else:
        page.wait_for_function("document.querySelector('#camera-video')?.srcObject != null")
    assert page.locator('button').filter(has_text='הקלט').count() == 0
    assert page.locator('button').filter(has_text='הורד').count() == 0
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.evaluate("document.querySelector('#camera-finish').getBoundingClientRect().bottom <= innerHeight")


def wait_sent(page, offset=None):
    if offset is not None:
        deadline = time.monotonic() + 45
        while len(parts) < offset + 3 and time.monotonic() < deadline:
            page.wait_for_timeout(100)
        assert len(parts) >= offset + 3
    expect(page.locator('#camera-upload-status')).to_have_text('נשלח לבדיקה', timeout=45000)


def check_parts(offset, reason):
    attempt = parts[offset:]
    assert [part['part'] for part in attempt] == ['video', 'skeleton', 'diagnostics'], [p['part'] for p in attempt]
    assert len({p['session'] for p in attempt}) == 1
    assert attempt[0]['session'].startswith('app-')
    assert attempt[0]['bytes'] and attempt[0]['mime'] in ['video/webm', 'video/mp4']
    skeleton = json.loads(attempt[1]['bytes'])
    diagnostics = json.loads(attempt[2]['bytes'])
    assert skeleton['frames'] and skeleton['version'] == 2
    assert diagnostics['session'] == attempt[0]['session']
    assert diagnostics['exercise'] == 'squats' and diagnostics['target'] == 11
    assert diagnostics['endReason'] == reason and diagnostics['appVersion'] == '20261010-camera-1'
    assert diagnostics['camera']['ptz']['requested'] in [True, False]
    assert diagnostics['totalFrames'] > 0
    return {'reason': reason, 'videoBytes': len(attempt[0]['bytes']), 'frames': len(skeleton['frames'])}


with tempfile.TemporaryDirectory(prefix='workout-camera-e2e-') as temp:
    cert, key = Path(temp) / 'cert.pem', Path(temp) / 'key.pem'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
                    '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root)))
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(cert, key)
    server.socket = tls.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'https://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=[
                '--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
                '--use-gl=angle', '--use-angle=swiftshader'])
            ctx, page, errors = context(browser)
            reports = []
            # Actual local model, actual recorder, 302 followed by JSON, no manual capture.
            for action, reason in [('finish', 'finish'), ('navigate', 'navigation'), ('exit', 'exit'), ('limit', 'duration-limit')]:
                offset = len(parts)
                open_camera(page)
                page.wait_for_timeout(1600)
                if not reports:
                    page.screenshot(path=str(Path(temp) / 'camera-preview.png'), full_page=True)
                assert page.evaluate('recordingsStarted') == len(reports) + 1
                if action == 'navigate':
                    page.evaluate("location.hash='#/home'")
                    expect(page.locator('.camera-screen')).to_have_count(0)
                elif action == 'limit':
                    # Fire both real four-minute callbacks together, without waiting four minutes.
                    assert page.evaluate('cameraLimits.length') >= 2
                    page.evaluate('cameraLimits.splice(0).forEach(callback => callback())')
                else:
                    page.locator('#camera-' + action).click()
                wait_sent(page, offset)
                reports.append(check_parts(offset, reason))
            assert len({p['session'] for p in parts}) == 4

            # Real IndexedDB acknowledgement: retry after reopening sends no second video.
            fail_skeleton = True
            offset = len(parts)
            open_camera(page)
            page.wait_for_timeout(800)
            page.locator('#camera-finish').click()
            expect(page.locator('#camera-upload-retry')).to_be_visible(timeout=45000)
            assert [p['part'] for p in parts[offset:]] == ['video', 'skeleton'], [p['part'] for p in parts[offset:]]
            page.reload()
            wait_sent(page)
            assert [p['part'] for p in parts[offset:]] == ['video', 'skeleton', 'skeleton', 'diagnostics']

            # A model failure quietly restores the exercise and finalizes its automatic capture.
            ctx.route('**/cam-lab/pose-worker.js*', lambda route: route.fulfill(
                body="onmessage=()=>setTimeout(()=>postMessage({type:'error'}),500)", content_type='text/javascript'))
            offset = len(parts)
            page.evaluate("location.hash='#/exercise/squats'")
            page.locator('#workout-camera').click()
            expect(page.locator('.camera-screen')).to_have_count(0, timeout=15000)
            expect(page.locator('#workout-camera')).to_be_visible()
            wait_sent(page, offset)
            assert [p['part'] for p in parts[offset:]] == ['video', 'skeleton', 'diagnostics']
            assert json.loads(parts[-1]['bytes'])['endReason'] == 'failure'
            # Unsupported capture also falls back; an empty artifact is flagged, never shown as sent.
            page.evaluate('window.MediaRecorder=undefined')
            offset = len(parts)
            page.evaluate("location.hash='#/exercise/squats'")
            page.locator('#workout-camera').click()
            expect(page.locator('.camera-screen')).to_have_count(0, timeout=15000)
            expect(page.locator('#camera-upload-status')).to_have_text('הסרטון לא הוקלט. נסה שוב', timeout=45000)
            assert [p['part'] for p in parts[offset:]] == ['video', 'skeleton', 'diagnostics']
            assert json.loads(parts[-1]['bytes'])['videoError'] == 'video-recording-unavailable'
            assert not errors, errors
            ctx.close()

            # No upload consent: no MediaRecorder, no POST and no off-origin requests.
            private, page, errors = context(browser, consent=False, stage3d=False)
            offset = len(parts)
            outgoing = []
            page.on('request', lambda request: outgoing.append(request.url) if not request.url.startswith(origin) else None)
            for exercise in ['squats', 'jumping-jacks', 'high-knees', 'lunges', 'push-ups', 'knee-push-ups', 'glute-bridge']:
                page.evaluate('(id) => location.hash="#/exercise/"+id', exercise)
                expect(page.locator('#workout-camera')).to_be_visible()
            for exercise in ['crunches', 'plank', 'squat-jumps']:
                page.evaluate('(id) => location.hash="#/exercise/"+id', exercise)
                expect(page.locator('#workout-camera')).to_have_count(0)
            open_camera(page)
            page.wait_for_timeout(1500)
            page.locator('#camera-finish').click()
            page.locator('#count').click()
            page.locator('#workout-camera').click()
            expect(page.locator('#camera-count')).to_have_text('1')
            page.wait_for_function("document.querySelector('#camera-video')?.srcObject != null")
            page.locator('#camera-finish').click()
            expect(page.locator('#count')).to_have_text('1')
            assert page.evaluate('recordingsStarted') == 0
            assert len(parts) == offset
            assert not outgoing, outgoing
            assert not errors, errors
            # Consent configured while the app is open applies on the next camera entry.
            page.evaluate('(endpoint)=>localStorage.setItem("camlab.upload",JSON.stringify({endpoint,secret:"synthetic-test",consentId:"late-consent"}))', origin+'/receive')
            page.locator('#workout-camera').click()
            page.wait_for_function("Number(document.querySelector('#camera-view')?.dataset.frames)>0", timeout=90000)
            page.wait_for_timeout(800)
            page.locator('#camera-finish').click()
            wait_sent(page, offset)
            assert [p['part'] for p in parts[offset:]] == ['video', 'skeleton', 'diagnostics']
            assert page.evaluate('recordingsStarted') == 1
            private.close()

            # Synthetic pose worker exercises app-level counting and demonstration states.
            synthetic, page, errors = context(browser)
            offset = len(parts)
            synthetic.add_init_script("""(() => {
              const data=JSON.parse(localStorage.getItem('kidfit.v1')); data.profile.voice=true;
              localStorage.setItem('kidfit.v1',JSON.stringify(data)); window.coachingSpoken=[];
              window.SpeechSynthesisUtterance=class { constructor(text){this.text=text;} };
              Object.defineProperty(window,'speechSynthesis',{value:{
                getVoices:()=>[{localService:true,lang:'he-IL',name:'synthetic'}],
                addEventListener(){},cancel(){},
                speak(utterance){coachingSpoken.push(utterance.text);queueMicrotask(()=>utterance.onend?.());}
              }});
            })()""")
            page.reload()
            fixtures = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
                "import {pose} from './tests/cam-lab-fixtures.js'; console.log(JSON.stringify([pose(),pose({angle:140}),pose({angle:110})]));"], cwd=root))
            worker = """const samples=%s; let index=0;
              onmessage=({data})=>{
                if(data.type==='init') return postMessage({type:'ready',model:'synthetic'});
                if(data.type==='sample') { index=data.index; return; }
                if(data.type==='frame'){
                  const s=samples[index]; data.bitmap.close();
                  postMessage({type:'pose',timestamp:data.timestamp,id:data.id,inferenceMs:5,model:'synthetic',poses:[{landmarks:s.p,world:s.world}]});
                }
              };""" % json.dumps(fixtures)
            synthetic.route('**/cam-lab/pose-worker.js*', lambda route: route.fulfill(body=worker, content_type='text/javascript'))
            page.evaluate("""(() => { const OriginalWorker=window.Worker;
              window.Worker=class extends OriginalWorker { constructor(...args) {
                super(...args); window.syntheticPoseWorker=this;
              }};
            })()""")
            page.evaluate("localStorage.setItem('kidfit.activeWorkout', JSON.stringify({ program:{id:'solo',name:'סקוואט',emoji:'💥'}, items:[{exId:'squats',type:'reps',target:3,done:0,block:'האימון'}], idx:0,phase:'exercise',startedAt:Date.now(),savedAt:Date.now(),mainDone:0,gamesPlayed:0 }))")
            page.evaluate("location.hash='#/camera'")
            expect(page.locator('#camera-demo')).to_have_class('camera-demo intro')
            page.wait_for_function("document.querySelector('#camera-demo').classList.contains('corner')", timeout=20000)
            try:
                page.wait_for_function("document.querySelector('#camera-view').dataset.counting==='true'", timeout=20000)
            except Exception:
                page.locator('#camera-finish').click()
                wait_sent(page, offset)
                diagnostic = json.loads(parts[-1]['bytes'])
                print('START DEBUG:', diagnostic['preparation'], diagnostic['performance'][-20:], flush=True)
                raise
            assert page.locator('.stage3d-canvas').count() == 1
            page.locator('#camera-help').click()
            expect(page.locator('#camera-demo')).to_have_class('camera-demo help')
            before = page.locator('#camera-count').inner_text()
            page.wait_for_timeout(500)
            assert page.locator('#camera-count').inner_text() == before
            page.locator('#camera-help-close').click()
            expect(page.locator('#camera-demo')).to_have_class('camera-demo corner')
            expect(page.locator('#camera-status')).to_have_text('מוכן, בקצב שלך', timeout=15000)
            page.evaluate("syntheticPoseWorker.postMessage({type:'sample',index:1})")
            expect(page.locator('#camera-status')).to_have_text('יפה, ממשיכים בתנועה', timeout=15000)
            page.wait_for_timeout(700)
            page.evaluate("syntheticPoseWorker.postMessage({type:'sample',index:0})")
            try:
                page.wait_for_function("document.querySelector('#camera-demo')?.classList.contains('correction')", timeout=15000)
            except Exception:
                page.locator('#camera-finish').click()
                wait_sent(page, offset)
                diagnostic = json.loads(parts[-1]['bytes'])
                print('POSE DEBUG:', diagnostic['attempts'], diagnostic['performance'][-10:], flush=True)
                raise
            expect(page.locator('#camera-demo-caption')).to_have_text('ננסה תנועה שלמה, כמו הדמות.')
            page.wait_for_function("document.querySelector('#camera-demo')?.classList.contains('corner')", timeout=10000)
            for count in range(1, 4):
                # After the enlarged demo, return to rest until the real counter is armed again.
                frames = int(page.locator('#camera-view').get_attribute('data-frames'))
                page.wait_for_function('(before)=>Number(document.querySelector("#camera-view")?.dataset.frames)>=before+8', arg=frames, timeout=15000)
                expect(page.locator('#camera-status')).to_have_text('מוכן, בקצב שלך', timeout=15000)
                page.evaluate("syntheticPoseWorker.postMessage({type:'sample',index:2})")
                expect(page.locator('#camera-status')).to_have_text('יפה, ממשיכים בתנועה', timeout=15000)
                page.wait_for_timeout(700)
                page.evaluate("syntheticPoseWorker.postMessage({type:'sample',index:0})")
                if count < 3:
                    try:
                        expect(page.locator('#camera-count')).to_have_text(str(count), timeout=10000)
                    except Exception:
                        page.locator('#camera-finish').click()
                        wait_sent(page, offset)
                        diagnostic = json.loads(parts[-1]['bytes'])
                        print('COUNT DEBUG:', diagnostic['attempts'], diagnostic['performance'][-20:], flush=True)
                        raise
                    page.wait_for_timeout(700)
            expect(page.locator('#feedback')).to_be_visible(timeout=30000)
            saved = page.evaluate("JSON.parse(localStorage.getItem('kidfit.v1')).sessions.at(-1)")
            assert saved['items'][0]['done'] == 3
            assert saved['items'][0]['secs'] > 4.5 and saved['honestSeconds'] > 0
            wait_sent(page, offset)
            assert [p['part'] for p in parts[offset:]] == ['video', 'skeleton', 'diagnostics']
            diagnostics = json.loads(parts[-1]['bytes'])
            assert diagnostics['endReason'] == 'target' and diagnostics['counted'] == diagnostics['target'] == 3
            spoken = page.evaluate("coachingSpoken.map(text=>text.replace(/[֑-ׇ]/g,''))")
            assert [text for text in spoken if text in ['שלוש', 'שתים', 'אחת']][-3:] == ['שלוש', 'שתים', 'אחת'], spoken
            assert 'ננסה תנועה שלמה, כמו הדמות.' in spoken, spoken
            assert page.locator('#camera-video').count() == 0
            assert page.locator('.stage3d-canvas').count() <= 1
            assert not errors, errors
            synthetic.close()
            browser.close()
            print(json.dumps({'threePartsVia302': reports, 'retryAfterReload': True,
                'privateNoRecordingOrUpload': True, 'demoAndCounting': True, 'errors': []}))
    finally:
        server.shutdown()
