"""Synthetic camera + local HTTPS redirect server. Run: python3 tests/e2e/cam_lab.py."""
import base64
import functools
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
fail_skeleton = False


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        global fail_skeleton
        assert self.path == '/receive'
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.headers['Content-Type'] == 'text/plain'
        assert data['secret'] == 'test'
        parts.append({'session': data['session'], 'part': data['part'], 'mime': data['mime'],
                      'data': base64.b64decode(data['data'], validate=True)})
        reject = fail_skeleton and data['part'] == 'skeleton'
        if reject:
            fail_skeleton = False
        responses.append(not reject)
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
        body = b'{"ok":true}' if responses[index] else b'{"ok":false,"error":"synthetic failure"}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


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
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def wait_sent(page):
    page.wait_for_function("() => document.querySelector('#upload-status').textContent==='נשלח לבדיקה'", timeout=30000)
    page.locator('#again').wait_for(state='visible')
    page.wait_for_function("() => !document.querySelector('#again').disabled")
    hidden_manual_controls(page)
    assert page.evaluate("document.querySelector('#video').srcObject===null")


def check_attempt(offset, end_reason):
    attempt = parts[offset:]
    assert [v['part'] for v in attempt] == ['video', 'skeleton', 'diagnostics']
    assert len({v['session'] for v in attempt}) == 1
    assert attempt[0]['mime'] in ['video/webm', 'video/mp4'] and attempt[0]['data']
    assert all(v['mime'] == 'application/json' for v in attempt[1:])
    skeleton, diagnostics = json.loads(attempt[1]['data']), json.loads(attempt[2]['data'])
    assert skeleton['version'] == 2 and len(skeleton['frames']) > 0
    assert diagnostics['labVersion'] == '4.0.0' and diagnostics['model'] in ['full', 'lite']
    assert diagnostics['session'] == attempt[0]['session'] and diagnostics['endReason'] == end_reason
    assert diagnostics['attempts'][0]['preparation']['frames'] > 0
    assert diagnostics['countStarted'] == (skeleton['countStartMs'] is not None)
    if skeleton['countStartMs'] is None:
        assert diagnostics['countNotStartedReason'] == 'no-count-start'
    ptz = diagnostics['camera']['ptz']
    assert set(['requested', 'supported', 'granted', 'state', 'fallback', 'actualZoom']).issubset(ptz)
    assert ptz['granted'] in [True, False, None]
    return {'session': attempt[0]['session'], 'frames': len(skeleton['frames']),
            'videoBytes': len(attempt[0]['data']), 'mime': attempt[0]['mime'], 'endReason': end_reason}


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
            context = browser.new_context(viewport={'width': 390, 'height': 844}, ignore_https_errors=True)
            page = context.new_page()
            errors, reports = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            url = origin + '/workout/cam-lab/'
            page.goto(url + '#upload=' + quote(origin + '/receive', safe='') + '&key=test')
            assert page.evaluate('location.hash') == ''
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

            # Failed skeleton persists through IndexedDB and reload; acked video is not repeated.
            offset = len(parts)
            fail_skeleton = True
            open_camera(page)
            page.wait_for_timeout(500)
            page.locator('#stop').click()
            page.wait_for_function("() => !document.querySelector('#upload-retry').hidden", timeout=30000)
            assert [v['part'] for v in parts[offset:]] == ['video', 'skeleton']
            page.reload()
            page.wait_for_function("() => document.querySelector('#upload-status').textContent==='נשלח לבדיקה'", timeout=30000)
            assert [v['part'] for v in parts[offset:]] == ['video', 'skeleton', 'skeleton', 'diagnostics']
            assert len({v['session'] for v in parts[offset:]}) == 1
            assert len(acknowledgements) == len(parts)
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
                              'redirect302': True, 'retryAfterReload': True, 'privateNoUpload': True,
                              'mobileWidth': 390, 'errors': errors}))
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
