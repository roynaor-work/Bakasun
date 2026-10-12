"""Real synthetic camera/MediaRecorder + local HTTPS POST→302→JSON server.

Run from the repository root: python3 tests/e2e/workout_camera.py
No real endpoint, key, person, or recording is used. Certificates live in tmp.
"""
import base64
import functools
import http.server
import json
import os
import shutil
import ssl
import subprocess
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
PARTS, REDIRECTS, RESPONSES = [], [], []
CHUNKS = {}
FAIL_SKELETON = 0


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            pass  # The browser cancels optional speech-file probes on navigation.

    def do_POST(self):
        global FAIL_SKELETON
        assert self.path == '/receive'
        assert self.headers['Content-Type'] == 'text/plain'
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert data['secret'] == 'synthetic-browser-key'
        decoded = base64.b64decode(data['data'], validate=True)
        PARTS.append({**data, 'data': decoded})
        reject = FAIL_SKELETON and data['part'] == 'skeleton'
        if reject:
            FAIL_SKELETON -= 1
        result = {'ok': not bool(reject)}
        if data['part'] == 'video':
            chunk, count, total = data['chunk'], data['chunks'], data['totalBytes']
            assert 0 <= chunk < count and count == max(1, (total + 1572863) // 1572864)
            assert len(decoded) == min(1572864, max(0, total - chunk * 1572864))
            saved = CHUNKS.setdefault(data['session'], {})
            saved[chunk] = decoded
            assembled = len(saved) == count
            result['assembled'] = assembled
            if assembled:
                merged = b''.join(saved[i] for i in range(count))
                assert len(merged) == total
                result['bytes'] = len(merged)
        RESPONSES.append(result)
        self.send_response(302)
        self.send_header('Location', f'/receipt/{len(RESPONSES) - 1}')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/receipt'):
            assert not self.headers.get('Content-Length')
            REDIRECTS.append(self.path)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(RESPONSES[int(self.path.rsplit('/', 1)[1])]).encode())
        else:
            super().do_GET()


def setup(browser, origin, consent=True, stage3d=False):
    context = browser.new_context(ignore_https_errors=True, viewport={'width': 390, 'height': 844},
                                  is_mobile=True, has_touch=True)
    context.add_init_script("""
      if (!localStorage.getItem('kidfit.v1')) localStorage.setItem('kidfit.v1', JSON.stringify({
        profile: {intro:false, voice:false, sound:false, stage3d:%s, level:'easy', rest:0,
          ratioV2:true, noTimerV1:true}, sessions:[], games:{resetV:2}
      }));
    """ % ('true' if stage3d else 'false'))
    if consent:
        context.add_init_script("""
          if (!localStorage.getItem('camlab.upload')) localStorage.setItem('camlab.upload', JSON.stringify(%s));
        """ % json.dumps({'endpoint': origin + '/receive', 'secret': 'synthetic-browser-key', 'consentId': 'synthetic-browser-consent'}))
    page = context.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('Page error:', str(e), flush=True)))
    page.on('request', lambda r: requests.append(r))
    page.goto(origin + '/workout/#/settings')
    expect(page.locator('#workout-camera-setting')).not_to_be_checked()
    expect(page.locator('#workout-camera-info')).to_contain_text(
        'הסרטון נשלח לבדיקה בסיום' if consent else 'הסרטון לא נשמר ולא יוצא מהטלפון')
    page.locator('#workout-camera-setting').check()
    return context, page, errors, requests


def open_camera(page, origin):
    page.goto(origin + '/workout/#/exercise/squats')
    page.get_by_role('button', name='מצלמה', exact=True).click()
    expect(page.locator('#camera-demo')).to_have_attribute('data-mode', 'intro')
    page.wait_for_function("document.querySelector('#camera-video')?.srcObject?.active", timeout=15000)
    assert page.get_by_role('button', name='הקלטה', exact=True).count() == 0
    assert page.get_by_role('button', name='הורדה', exact=True).count() == 0


def verify_parts(start, reason):
    received = PARTS[start:]
    assert [part['part'] for part in received] == ['diagnostics', 'skeleton', 'video'], received
    assert len({part['session'] for part in received}) == 1
    assert all(part['session'].startswith('app-') for part in received)
    assert received[2]['mime'] == 'video/webm' and len(received[2]['data']) > 0
    skeleton, diagnostics = json.loads(received[1]['data']), json.loads(received[0]['data'])
    assert skeleton['version'] == 2 and skeleton['exercise'] == 'squats'
    assert diagnostics['endReason'] == reason and diagnostics['exercise'] == 'squats'
    assert diagnostics['appVersion'] == '20261010-camera-1' and diagnostics['target'] == 11
    assert 'ptz' in diagnostics['camera']
    assert diagnostics['videoError'] is None
    assert 'synthetic-browser-key' not in json.dumps(diagnostics)
    return len(skeleton['frames'])


def simulation(browser, origin):
    # Replace only pose inference. Camera, 3D renderer, counter, recorder,
    # app routing/storage and upload queue remain the real implementations.
    samples = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {pose} from './tests/cam-lab-fixtures.js'; "
        "console.log(JSON.stringify(Object.fromEntries([180,145,140,90].map(a=>[a,pose({angle:a})]))));"], cwd=ROOT))
    context, page, errors, requests = setup(browser, origin, stage3d=True)
    context.add_init_script("""
      window.cameraPose = %s;
      window.spoken = [];
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text=text; } };
      Object.defineProperty(window, 'speechSynthesis', {value: {
        getVoices:()=>[{name:'synthetic-hebrew',lang:'he-IL',localService:true}],
        addEventListener(){},cancel(){},
        speak(utterance){window.spoken.push(utterance.text);queueMicrotask(()=>utterance.onend?.());}
      }});
      const saved = JSON.parse(localStorage.getItem('kidfit.v1'));
      if (saved) { saved.profile.voice=true; localStorage.setItem('kidfit.v1',JSON.stringify(saved)); }
      window.cameraNow = performance.now(); performance.now = () => window.cameraNow;
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        postMessage(data, transfer) {
          if (data.type === 'frame') {
            data.sample = window.cameraPose; window.cameraNow += 100; data.timestamp = window.cameraNow;
          }
          super.postMessage(data, transfer);
        }
      };
      window.liveGL = new Set(); window.maxLiveGL = 0;
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        const gl = getContext.call(this, type, ...args);
        if (/^webgl/.test(type) && gl && !window.liveGL.has(gl)) {
          window.liveGL.add(gl); window.maxLiveGL = Math.max(window.maxLiveGL, window.liveGL.size);
          const getExtension = gl.getExtension.bind(gl);
          gl.getExtension = name => {
            const extension = getExtension(name);
            if (name === 'WEBGL_lose_context' && extension) {
              const lose = extension.loseContext.bind(extension);
              extension.loseContext = () => { window.liveGL.delete(gl); lose(); };
            }
            return extension;
          };
        }
        return gl;
      };
    """ % json.dumps(samples['180']))
    context.route('**/cam-lab/pose-worker.js?*', lambda route: route.fulfill(
        content_type='application/javascript', body="""
          onmessage = ({data}) => {
            if (data.type === 'init') postMessage({type:'ready', model:'full'});
            if (data.type === 'frame') {
              data.bitmap.close();
              postMessage({type:'pose', timestamp:data.timestamp, inferenceMs:1, model:'full',
                poses:[{landmarks:data.sample.p, world:data.sample.world}]});
            }
          };
        """))
    page.goto(origin + '/workout/#/home')
    page.reload()  # Apply the worker fixture and WebGL instrumentation before boot.
    page.evaluate("""() => localStorage.setItem('kidfit.activeWorkout', JSON.stringify({
      program:{id:'solo',name:'בדיקת מצלמה',emoji:'💥'}, idx:0,phase:'exercise',saved:false,
      startedAt:Date.now(),savedAt:Date.now(), mainDone:0,gift:null,gamesPlayed:0,
      items:[{exId:'squats',name:'סקוואט',type:'reps',target:2,done:0,secs:0,skipped:false,
        block:'האימון',round:1,rounds:1}]
    }))""")
    start = len(PARTS)
    page.goto(origin + '/workout/#/workout')
    page.evaluate("""() => {
      window.demoModes=[];
      new MutationObserver(() => {
        const demo=document.querySelector('#camera-demo'); if (!demo) return;
        const mode=demo.dataset.mode;
        if (window.demoModes.at(-1)?.mode !== mode) window.demoModes.push({mode,
          height:demo.getBoundingClientRect().height,renderers:document.querySelectorAll('.stage3d-canvas').length});
      }).observe(document.querySelector('#app'),{subtree:true,attributes:true,attributeFilter:['data-mode'],childList:true});
    }""")
    page.locator('#workout-camera').click()
    expect(page.locator('#camera-demo')).to_have_attribute('data-mode', 'intro')
    expect(page.locator('#camera-demo .stage3d-canvas')).to_be_visible(timeout=20000)
    intro_width = page.locator('#camera-demo').bounding_box()['width']
    (ROOT / 'work').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT / 'work/camera-intro-phone.png'))
    # Calibration + intro trigger spoken 3-2-1, without a start button.
    for cue in ['3', '2', '1']:
        expect(page.locator('#camera-count')).to_have_text(cue, timeout=15000)
    expect(page.locator('#camera-demo')).to_have_attribute('data-mode', 'corner', timeout=20000)
    expect(page.locator('#camera-count')).to_have_text('0')
    spoken = page.evaluate('window.spoken')
    assert all(word in spoken for word in ['שָׁלוֹשׁ', 'שְׁתַּיִם', 'אַחַת']), spoken
    page.wait_for_timeout(250)
    corner_width = page.locator('#camera-demo').bounding_box()['width']
    corner_height = page.locator('#camera-demo').bounding_box()['height']
    assert corner_width < intro_width
    for width in [320, 390]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        finish = page.locator('#camera-finish').bounding_box()
        assert finish['y'] + finish['height'] <= 844, finish
    page.screenshot(path=str(ROOT / 'work/camera-count-phone.png'))
    assert page.evaluate('window.maxLiveGL') == 1

    def hold(angle, frames=8):
        before = int(page.locator('#camera-view').get_attribute('data-frames'))
        page.evaluate('(sample) => { window.cameraPose = sample; }', samples[str(angle)])
        page.wait_for_function("goal => !document.querySelector('#camera-view') || Number(document.querySelector('#camera-view').dataset.frames)>=goal",
                               arg=before + frames, timeout=20000)

    # Fullscreen help pauses the real counter while movement continues.
    page.locator('#camera-help').click()
    expect(page.locator('#camera-demo')).to_have_attribute('data-mode', 'help')
    assert page.locator('#camera-demo').bounding_box()['height'] > 750
    hold(145); hold(90); hold(180)
    expect(page.locator('#camera-count')).to_have_text('0')
    assert page.locator('.stage3d-canvas').count() == 1
    page.locator('#camera-help-close').click()
    hold(180, 10)
    # An insufficient descent actually passes through the lab rejection.
    hold(145, 5); hold(140); hold(180, 10)
    page.wait_for_function("window.demoModes.some(entry=>entry.mode==='correction')", timeout=3000)
    correction = page.evaluate("window.demoModes.find(entry=>entry.mode==='correction')")
    assert correction['height'] > corner_height and correction['renderers'] == 1, correction
    expect(page.locator('#camera-count')).to_have_text('0')
    expect(page.locator('#camera-demo')).to_have_attribute('data-mode', 'corner', timeout=3500)
    # Two valid repetitions finish the workout automatically and retain time.
    hold(180); hold(145, 5); hold(90); hold(180, 6)
    expect(page.locator('#camera-count')).to_have_text('1')
    hold(145, 5); hold(90); hold(180, 6)
    expect(page.locator('#camera-upload')).to_contain_text('נשלח לבדיקה', timeout=30000)
    assert [p['part'] for p in PARTS[start:]] == ['diagnostics', 'skeleton', 'video']
    diagnostics = json.loads(PARTS[start]['data'])
    assert diagnostics['endReason'] == 'target' and diagnostics['counted'] == 2
    session = page.evaluate("JSON.parse(localStorage.getItem('kidfit.v1')).sessions.at(-1)")
    assert session['items'][0]['done'] == 2 and session['items'][0]['secs'] > 4
    assert session['honestSeconds'] > 0
    assert page.locator('.stage3d-canvas').count() == 0
    assert page.evaluate('window.liveGL.size') == 0
    assert not errors, errors
    context.close()
    print('Simulation passed: one disposed renderer, intro/3-2-1, correction, fullscreen pause, target and honestTime.')


def failures(browser, origin):
    start = len(PARTS)
    context, page, errors, _ = setup(browser, origin)
    context.add_init_script("navigator.mediaDevices.getUserMedia = async () => {throw new DOMException('synthetic denial','NotAllowedError');};")
    page.reload()
    page.goto(origin + '/workout/#/exercise/squats')
    page.locator('#workout-camera').click()
    expect(page.locator('#did')).to_be_visible(timeout=15000)
    assert page.locator('.camera-screen').count() == 0 and page.locator('#workout-camera').count() == 0
    assert len(PARTS) == start and not errors, errors
    context.close()

    context, page, errors, _ = setup(browser, origin)
    context.route('**/cam-lab/pose-worker.js?*', lambda route: route.fulfill(content_type='application/javascript', body="""
      onmessage = ({data}) => {
        if (data.type === 'init') {postMessage({type:'ready'});setTimeout(()=>postMessage({type:'error'}),2000);}
        else {data.bitmap.close();postMessage({type:'pose',timestamp:data.timestamp,poses:[]});}
      };
    """))
    open_camera(page, origin)
    expect(page.locator('#did')).to_be_visible(timeout=15000)
    assert page.locator('.camera-screen').count() == 0 and page.locator('#workout-camera').count() == 0
    expect(page.locator('#camera-upload')).to_contain_text('נשלח לבדיקה', timeout=30000)
    verify_parts(start, 'error')
    assert not errors, errors
    context.close()
    print('Fallback passed: permission/model failures return to the ordinary exercise; opened capture still sends once.')


with tempfile.TemporaryDirectory(prefix='workout-camera-') as temp:
    certificate, key = Path(temp) / 'cert.pem', Path(temp) / 'key.pem'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                    '-subj', '/CN=localhost', '-keyout', str(key), '-out', str(certificate)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(certificate, key)
    server.socket = tls.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'https://localhost:{server.server_port}'
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=[
                '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                '--use-gl=angle', '--use-angle=swiftshader', '--ignore-certificate-errors'])
            if os.environ.get('WORKOUT_CAMERA_SIM_ONLY') == '1':
                simulation(browser, origin)
                browser.close()
                raise SystemExit(0)
            context, page, errors, requests = setup(browser, origin)
            supported = ['squats', 'jumping-jacks', 'high-knees', 'lunges', 'push-ups', 'knee-push-ups', 'glute-bridge']
            for exercise in supported + ['plank', 'crunches', 'squat-jumps', 'jog']:
                page.goto(origin + '/workout/#/exercise/' + exercise)
                assert page.locator('#workout-camera').count() == (1 if exercise in supported else 0)
            # Real worker, local full/lite model, WASM, MediaRecorder and redirect.
            start = len(PARTS)
            open_camera(page, origin)
            page.wait_for_function("Number(document.querySelector('#camera-view')?.dataset.frames)>3", timeout=60000)
            page.wait_for_timeout(2200)
            page.get_by_role('button', name='סיום', exact=True).click()
            expect(page.locator('#camera-upload')).to_contain_text('נשלח לבדיקה', timeout=30000)
            assert verify_parts(start, 'finish') > 0
            page.wait_for_timeout(500)
            assert len(PARTS) == start + 3
            # A retry opens and records a fresh attempt without any record button.
            start = len(PARTS)
            page.locator('#camera-again').click()
            page.wait_for_function("Number(document.querySelector('#camera-view')?.dataset.frames)>1", timeout=60000)
            page.wait_for_timeout(1200)
            page.evaluate("location.hash = '#/exercises'")
            expect(page.get_by_role('heading', name='כל התרגילים', exact=True)).to_be_visible()
            expect(page.locator('#camera-upload')).to_contain_text('נשלח לבדיקה', timeout=30000)
            assert verify_parts(start, 'exit') > 0
            assert page.locator('#camera-video').count() == 0
            # An acknowledged diagnostic is not sent again after skeleton retries fail.
            start = len(PARTS)
            FAIL_SKELETON = 4
            open_camera(page, origin)
            page.wait_for_timeout(2000)
            page.locator('#camera-finish').click()
            expect(page.locator('#camera-upload')).to_contain_text('השליחה נעצרה', timeout=40000)
            assert [part['part'] for part in PARTS[start:]] == ['diagnostics'] + ['skeleton'] * 4
            page.goto(origin + '/workout/#/home')
            page.reload()
            expect(page.locator('#camera-upload')).to_contain_text('נשלח לבדיקה', timeout=30000)
            assert [part['part'] for part in PARTS[start:]] == ['diagnostics'] + ['skeleton'] * 5 + ['video']
            assert not errors, errors
            assert all(r.url.startswith(origin) for r in requests), [r.url for r in requests if not r.url.startswith(origin)]
            assert len(REDIRECTS) == len(PARTS)
            context.close()

            # Private mode still tracks locally, with no recorder, POST or IDB queue.
            start = len(PARTS)
            private, page, errors, requests = setup(browser, origin, consent=False)
            private.add_init_script("""
              window.recorderStarts=0;
              window.MediaRecorder=new Proxy(window.MediaRecorder,{construct(){window.recorderStarts++;throw Error('private capture');}});
            """)
            page.reload()
            open_camera(page, origin)
            page.wait_for_function("Number(document.querySelector('#camera-view')?.dataset.frames)>1", timeout=60000)
            page.wait_for_timeout(1500)
            page.locator('#camera-finish').click()
            expect(page.locator('.camera-result')).to_be_visible()
            page.wait_for_timeout(700)
            assert len(PARTS) == start
            assert not [r for r in requests if r.method == 'POST']
            assert not any(db['name'] == 'camlab.upload.queue' for db in page.evaluate('indexedDB.databases()'))
            assert not errors, errors
            assert page.evaluate('window.recorderStarts') == 0
            private.close()
            print('Real camera passed: three parts via HTTPS 302, finish/exit, retry/reload, app- session, private mode, local assets.')
            simulation(browser, origin)
            failures(browser, origin)
            browser.close()
    finally:
        server.shutdown()
