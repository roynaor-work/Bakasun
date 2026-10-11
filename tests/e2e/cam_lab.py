"""Synthetic camera + local HTTPS redirect server. Run: python3 tests/e2e/cam_lab.py."""
import base64
import functools
import hashlib
import time
import http.server
import json
import shutil
import ssl
import subprocess
import tempfile
import threading
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright

parts, acknowledgements, responses = [], [], []
fail_skeleton = 0
fail_video_chunk_once = None
chunk_files, assembled_files = {}, {}


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        global fail_skeleton, fail_video_chunk_once
        assert self.path == '/receive'
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.headers['Content-Type'] == 'text/plain'
        assert data['secret'] == 'test'
        raw = base64.b64decode(data['data'], validate=True)
        parts.append({'session': data['session'], 'part': data['part'], 'mime': data['mime'],
                      'chunk': data.get('chunk'), 'chunks': data.get('chunks'), 'data': raw})
        result = {'ok': True}
        key = (data['session'], data['part'])
        if fail_skeleton and data['part'] == 'skeleton':
            fail_skeleton -= 1
            result = {'ok': False, 'error': 'synthetic failure'}
        elif fail_video_chunk_once is not None and data['part'] == 'video' and data.get('chunk') == fail_video_chunk_once:
            fail_video_chunk_once = None
            result = {'ok': False, 'error': 'synthetic failure'}
        elif 'chunk' in data or 'chunks' in data:
            chunk, count, total = data.get('chunk'), data.get('chunks'), data.get('totalBytes')
            if not (all(type(n) is int for n in [chunk, count, total]) and 1 <= count <= 200 and 0 <= chunk < count and total >= 0):
                result = {'ok': False, 'error': 'chunk-fields'}
            elif chunk < count - 1 and ('=' in data['data'] or len(raw) % 3):
                result = {'ok': False, 'error': 'chunk-data'}
            elif key in assembled_files and len(assembled_files[key]) == total:
                result = {'ok': True, 'duplicate': True, 'assembled': True}
            else:
                saved = chunk_files.setdefault(key, {})
                saved[chunk] = data['data']
                if all(i in saved for i in range(count)):
                    blob = base64.b64decode(''.join(saved[i] for i in range(count)), validate=True)
                    if len(blob) != total:
                        chunk_files.pop(key, None)
                        result = {'ok': False, 'error': 'size-mismatch'}
                    else:
                        assembled_files[key] = blob
                        result = {'ok': True, 'assembled': True, 'bytes': len(blob)}
                else:
                    result = {'ok': True, 'assembled': False}
        else:
            assembled_files[key] = raw
        responses.append(result)
        # Like Apps Script: POST returns 302, JSON arrives on the redirected GET.
        self.send_response(302)
        self.send_header('Location', f'/ack/{len(responses) - 1}')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if not self.path.startswith('/ack/'):
            return super().do_GET()
        index = int(self.path.removeprefix('/ack/'))
        acknowledgements.append(index)
        body = json.dumps(responses[index]).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def check_banner(page, enabled):
    assert page.locator('#upload-on-banner').is_visible() == enabled
    assert page.locator('#upload-off-banner').is_visible() == (not enabled)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.evaluate('scrollTo(0, document.body.scrollHeight)')
    box = page.locator('#upload-banner').bounding_box()
    assert box['y'] == 0 and box['x'] == 0 and box['width'] == 360
    page.evaluate('scrollTo(0, 0)')


def hidden_manual_controls(page):
    for selector in ['#record-option', '#record', '#recording-panel', '#record-toggle',
                     '#record-download', '#export-panel', '#export']:
        assert page.locator(selector).is_hidden(), selector


def open_camera(page):
    page.locator('#camera').click()
    page.wait_for_function("() => document.querySelector('#metrics').textContent.includes('inference')", timeout=60000)
    hidden_manual_controls(page)
    assert page.locator('#finish').is_visible()
    assert page.locator('#upload-status').inner_text() == 'מקליט ושולח לבדיקה אוטומטית'
    assert page.locator('#zoom-status').is_visible()
    check_banner(page, True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def wait_sent(page, timeout=30000):
    page.wait_for_function("() => document.querySelector('#upload-status').textContent==='נשלח לבדיקה'", timeout=timeout)
    page.locator('#again').wait_for(state='visible')
    page.wait_for_function("() => !document.querySelector('#again').disabled")
    hidden_manual_controls(page)
    check_banner(page, True)
    assert page.locator('#result-upload-off').is_hidden()
    assert page.evaluate("document.querySelector('#video').srcObject===null")


def check_attempt(offset, end_reason):
    attempt = parts[offset:]
    assert [v['part'] for v in attempt[:2]] == ['diagnostics', 'skeleton']
    assert all(v['part'] == 'video' for v in attempt[2:])
    assert len({v['session'] for v in attempt}) == 1
    assert attempt[2]['mime'] in ['video/webm', 'video/mp4'] and attempt[2]['data']
    assert all(v['mime'] == 'application/json' for v in attempt[:2])
    skeleton, diagnostics = json.loads(attempt[1]['data']), json.loads(attempt[0]['data'])
    assert skeleton['version'] == 2 and len(skeleton['frames']) > 0
    assert diagnostics['labVersion'] == '4.0.0' and diagnostics['model'] in ['full', 'lite']
    assert diagnostics['session'] == attempt[0]['session'] and diagnostics['endReason'] == end_reason
    assert diagnostics['attempts'][0]['preparation']['frames'] > 0
    assert diagnostics['countStarted'] == (skeleton['countStartMs'] is not None)
    if skeleton['countStartMs'] is None:
        assert diagnostics['countNotStartedReason'] == 'no-count-start'
    assert diagnostics['wakeLock'] in ['granted', 'denied', 'unsupported']
    timeline = diagnostics['timeline']
    assert all(isinstance(timeline[name], (int, float)) for name in ['workerInitStart', 'modelReady', 'cameraStart', 'cameraReady', 'firstFrame', 'finish'])
    assert timeline['workerInitStart'] <= timeline['modelReady'] <= timeline['firstFrame'] <= timeline['finish']
    assert timeline['cameraStart'] <= timeline['cameraReady'] <= timeline['firstFrame']
    assert 'test' not in [v for e in diagnostics['uploadLog'] for v in e.values()]
    assert not any('secret' in e or 'endpoint' in e for e in diagnostics['uploadLog'])
    ptz = diagnostics['camera']['ptz']
    assert set(['requested', 'supported', 'granted', 'state', 'fallback', 'actualZoom']).issubset(ptz)
    assert ptz['granted'] in [True, False, None]
    return {'session': attempt[0]['session'], 'frames': len(skeleton['frames']),
            'videoBytes': len(assembled_files[(attempt[0]['session'], 'video')]), 'mime': attempt[2]['mime'], 'endReason': end_reason}


root = Path(__file__).resolve().parents[2]
# Ephemeral self-signed localhost certificate: preserve production's HTTPS redirect checks.
with tempfile.TemporaryDirectory(prefix='cam-lab-e2e-') as temp:
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
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=[
                '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
                '--use-gl=angle', '--use-angle=swiftshader'])
            context = browser.new_context(viewport={'width': 360, 'height': 844}, ignore_https_errors=True)
            page = context.new_page()
            errors, reports = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            url = origin + '/workout/cam-lab/'
            # Fresh context without a hash or inherited upload consent.
            private_context = browser.new_context(viewport={'width': 360, 'height': 844}, ignore_https_errors=True)
            private_page = private_context.new_page()
            private_errors, private_requests = [], []
            private_page.on('pageerror', lambda e: private_errors.append(str(e)))
            private_page.on('request', lambda r: private_requests.append(r.url) if r.url == origin + '/receive' else None)
            private_page.goto(url)
            assert private_page.evaluate("localStorage.getItem('camlab.upload')") is None
            check_banner(private_page, False)
            private_page.screenshot(path='/tmp/cam-lab-upload-off.png')
            private_page.locator('#record').check()
            private_page.locator('#camera').click()
            private_page.wait_for_function("() => document.querySelector('#metrics').textContent.includes('inference')", timeout=60000)
            assert private_page.locator('#session').is_visible()
            check_banner(private_page, False)
            # The synthetic camera is a pattern, not a person. Invoke the real
            # finish handler without claiming the private rep counter started.
            private_page.locator('#finish').evaluate('(button) => button.click()')
            assert private_page.locator('#result').is_visible()
            check_banner(private_page, False)
            assert private_page.locator('#result-upload-off').inner_text() == 'הניסיון לא נשלח, כי השליחה כבויה בטלפון הזה'
            assert private_page.locator('#record-download').is_enabled()
            private_page.locator('#export-panel').evaluate('(panel) => panel.open = true')
            assert private_page.locator('#export').is_visible()
            assert private_page.evaluate("document.querySelector('#video').srcObject===null")
            private_page.reload()
            check_banner(private_page, False)
            assert not private_requests, private_requests
            assert not parts, parts
            assert not private_errors, private_errors
            private_context.close()

            page.goto(url + '#upload=' + quote(origin + '/receive', safe='') + '&key=test')
            assert page.evaluate('location.hash') == ''
            check_banner(page, True)
            page.screenshot(path='/tmp/cam-lab-upload-on.png')
            assert page.locator('#upload-config-status').inner_text() == 'שליחה לבדיקה: פעילה'
            assert page.locator('#ptz-permission').is_visible()
            hidden_manual_controls(page)
            # Both exit buttons, twice each on the same page; no recording/Start/download clicks.
            for selector in ['#finish', '#stop', '#finish', '#stop']:
                offset = len(parts)
                open_camera(page)
                page.wait_for_timeout(6500 if not reports else 1800)
                page.locator(selector).click()
                wait_sent(page)
                reports.append(check_attempt(offset, 'finish' if selector == '#finish' else 'camera-stop'))
                assert len({r['session'] for r in reports}) == len(reports)
                assert len(acknowledgements) == len(parts) == 3 * len(reports)
                page.locator('#again').click()

            # Drive both four-minute callbacks without waiting four wall-clock minutes.
            # MediaRecorder and final data events remain real; only timer delivery is simulated.
            limit_page = context.new_page()
            limit_page.on('pageerror', lambda e: errors.append(str(e)))
            limit_page.add_init_script("""(() => {
              const nativeTimeout = window.setTimeout.bind(window);
              window.attemptLimits = [];
              window.setTimeout = (fn, delay, ...args) => {
                if (delay === 240000) window.attemptLimits.push(() => fn(...args));
                return nativeTimeout(fn, delay, ...args);
              };
            })();""")
            limit_page.goto(url)
            offset = len(parts)
            open_camera(limit_page)
            limit_page.wait_for_timeout(1500)
            limit_page.evaluate('() => { if (attemptLimits.length !== 2) throw Error("missing limit timers"); attemptLimits.forEach(fn => fn()); }')
            wait_sent(limit_page)
            reports.append(check_attempt(offset, 'duration-limit'))
            limit_page.evaluate('() => attemptLimits.forEach(fn => fn())')
            limit_page.wait_for_timeout(300)
            assert len(parts) == offset + 3
            limit_page.close()

            # Failed skeleton persists through IndexedDB and reload; diagnostics is not repeated.
            offset = len(parts)
            fail_skeleton = 4
            open_camera(page)
            page.wait_for_timeout(500)
            page.locator('#stop').click()
            page.wait_for_function("() => !document.querySelector('#upload-retry').hidden", timeout=40000)
            assert [v['part'] for v in parts[offset:]] == ['diagnostics', 'skeleton', 'skeleton', 'skeleton', 'skeleton']
            page.reload()
            page.wait_for_function("() => document.querySelector('#upload-status').textContent==='נשלח לבדיקה'", timeout=30000)
            assert [v['part'] for v in parts[offset:]] == ['diagnostics', 'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton', 'video']
            assert len({v['session'] for v in parts[offset:]}) == 1
            assert len(acknowledgements) == len(parts)
            # Real 60-second recording with CDP upload bandwidth capped at 200,000 B/s.
            # Collect recorder bytes independently, without replacing its encoder or stream.
            slow_page = context.new_page()
            slow_page.on('pageerror', lambda e: errors.append(str(e)))
            slow_page.add_init_script("""(() => {
              const NativeRecorder = window.MediaRecorder;
              window.MediaRecorder = class extends NativeRecorder {
                constructor(...args) {
                  super(...args);
                  const chunks = [];
                  this.addEventListener('start', () => { window.captureStarted = performance.now(); });
                  this.addEventListener('dataavailable', e => { if (e.data.size) chunks.push(e.data); });
                  this.addEventListener('stop', () => { window.capturedVideo = new Blob(chunks); });
                }
              };
            })();""")
            slow_page.goto(url)
            slow_page.wait_for_function("() => document.querySelector('#model-status').textContent==='מודל הזיהוי: מוכן'", timeout=60000)
            slow_offset = len(parts)
            open_camera(slow_page)
            slow_page.wait_for_function('() => performance.now() - window.captureStarted >= 60000', timeout=70000)
            cdp = context.new_cdp_session(slow_page)
            cdp.send('Network.enable')
            cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 0,
                     'downloadThroughput': -1, 'uploadThroughput': 200000})
            # Fail chunk 2 once during the long upload; chunk 1 must not be resent.
            fail_video_chunk_once = 1
            upload_start = time.monotonic()
            slow_page.locator('#finish').click()
            assert slow_page.locator('#upload-keep-open').is_visible()
            assert slow_page.locator('#result #upload-status').is_visible()
            wait_sent(slow_page, timeout=180000)
            upload_seconds = round(time.monotonic() - upload_start, 2)
            captured_b64 = slow_page.evaluate("""async () => {
              const bytes = new Uint8Array(await capturedVideo.arrayBuffer());
              const strings = [];
              for (let i = 0; i < bytes.length; i += 32768) strings.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
              return btoa(strings.join(''));
            }""")
            captured = base64.b64decode(captured_b64, validate=True)
            slow_requests = parts[slow_offset:]
            slow_session = slow_requests[0]['session']
            assert assembled_files[(slow_session, 'video')] == captured
            assert [v['part'] for v in slow_requests[:2]] == ['diagnostics', 'skeleton']
            chunk_numbers = [v['chunk'] for v in slow_requests if v['part'] == 'video']
            assert len(set(chunk_numbers)) >= 2, chunk_numbers
            assert chunk_numbers == [0, 1, 1] + list(range(2, max(chunk_numbers) + 1)), chunk_numbers
            assert slow_page.locator('#upload-keep-open').is_hidden()
            slow_report = {'recordingSeconds': 60, 'uploadBytesPerSecond': 200000, 'uploadSeconds': upload_seconds,
                           'videoBytes': len(captured), 'sha256': hashlib.sha256(captured).hexdigest(),
                           'identicalBytes': True, 'chunksRequested': chunk_numbers}
            print(json.dumps({'slowUpload': slow_report}), flush=True)
            cdp.detach()
            slow_page.close()

            # Insert the old video-first IndexedDB structure before importing app.mjs.
            legacy_page = context.new_page()
            legacy_page.on('pageerror', lambda e: errors.append(str(e)))
            # Use a plain same-origin document, so app startup cannot drain while seeding.
            legacy_page.goto(origin + '/tests/e2e/')
            legacy_bytes = bytes(i % 251 for i in range(1572864 * 2 + 11))
            legacy_offset = len(parts)
            legacy_page.evaluate("""async size => {
              const config = JSON.parse(localStorage.getItem('camlab.upload'));
              const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251);
              const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('camlab.upload.queue', 1);
                req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
              });
              await new Promise((resolve, reject) => {
                const tx = db.transaction('sessions', 'readwrite');
                tx.objectStore('sessions').put({ session: 'legacy-browser', consentId: config.consentId, createdAt: 1,
                  parts: ['video', 'skeleton', 'diagnostics'].map(part => ({ part, acked: false,
                    mime: part === 'video' ? 'video/webm;codecs=vp8' : 'application/json',
                    blob: part === 'video' ? new Blob([bytes], { type: 'video/webm;codecs=vp8' }) : new Blob(['{}'], { type: 'application/json' }) })) });
                tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
              }); db.close();
            }""", len(legacy_bytes))
            legacy_page.goto(url)
            legacy_page.wait_for_function("() => document.querySelector('#upload-status').textContent==='נשלח לבדיקה'", timeout=30000)
            assert [v['part'] for v in parts[legacy_offset:]] == ['diagnostics', 'skeleton', 'video', 'video', 'video']
            assert assembled_files[('legacy-browser', 'video')] == legacy_bytes
            legacy_page.close()

            # pagehide finishes once and saves without depending on a background network request.
            hide_page = context.new_page()
            hide_page.on('pageerror', lambda e: errors.append(str(e)))
            hide_page.goto(url)
            open_camera(hide_page)
            hide_page.wait_for_timeout(1500)
            hide_offset = len(parts)
            hide_page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
            hide_page.wait_for_function("() => !document.querySelector('#again').disabled")
            assert len(parts) == hide_offset
            hide_page.reload()
            hide_page.wait_for_function("() => document.querySelector('#upload-status').textContent==='נשלח לבדיקה'", timeout=30000)
            check_attempt(hide_offset, 'pagehide')
            hide_page.close()

            page.locator('#upload-disable').click()
            page.wait_for_function("() => document.querySelector('#upload-status').textContent==='שליחה לבדיקה: כבויה'", timeout=10000)
            assert page.evaluate("localStorage.getItem('camlab.upload')") is None
            assert page.locator('#record-option').is_visible()
            # Private camera: manual controls return and no upload occurs.
            private_offset = len(parts)
            page.locator('#camera').click()
            page.wait_for_function("() => document.querySelector('#metrics').textContent.includes('inference')", timeout=60000)
            assert page.locator('#record-toggle').is_visible()
            assert page.locator('#record-download').is_visible()
            assert page.locator('#record').is_checked() is False
            page.wait_for_timeout(1000)
            page.locator('#stop').click()
            assert len(parts) == private_offset
            assert not errors, errors
            print(json.dumps({'browser': 'Chromium synthetic camera', 'attempts': reports,
                              'slowUpload': slow_report, 'legacyAutoUpload': True, 'pagehideQueue': True,
                              'redirect302': True, 'retryAfterReload': True, 'privateNoUpload': True,
                              'privateNoRequests': True, 'bannersAllScreens': True, 'mobileWidth': 360, 'errors': errors}))
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
