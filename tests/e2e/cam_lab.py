"""Synthetic camera only. Run from repository root: python3 tests/e2e/cam_lab.py."""
import base64
import functools
import http.server
import json
import shutil
import threading
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright

parts = []
fail_skeleton = False

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        global fail_skeleton
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.headers['Content-Type'] == 'text/plain'
        assert data['secret'] == 'synthetic-browser-key'
        parts.append({'part': data['part'], 'mime': data['mime'], 'data': base64.b64decode(data['data'])})
        reject = fail_skeleton and data['part'] == 'skeleton'
        if reject:
            fail_skeleton = False
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok":false,"error":"synthetic failure"}' if reject else b'{"ok":true}')

root = Path(__file__).resolve().parents[2]
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=[
            '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            '--use-gl=angle', '--use-angle=swiftshader'])
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        url = origin + '/workout/cam-lab/'
        page.goto(url + '#upload=' + quote(origin + '/receive', safe='') + '&key=synthetic-browser-key')
        assert page.evaluate('location.hash') == ''
        assert page.locator('#upload-config-status').inner_text() == 'שליחה לבדיקה: פעילה'
        page.locator('#camera').click()
        page.wait_for_function("() => document.querySelector('#metrics').textContent.includes('inference')", timeout=60000)
        assert page.locator('#zoom-status').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        # Exercise the five-second performance window and real model replacement.
        page.wait_for_timeout(6500)
        page.locator('#stop').click()
        page.wait_for_function("() => document.querySelector('#upload-status').textContent==='נשלח לבדיקה'", timeout=30000)
        assert [v['part'] for v in parts] == ['video', 'skeleton', 'diagnostics']
        assert len(parts[0]['data']) > 0
        skeleton, diagnostics = json.loads(parts[1]['data']), json.loads(parts[2]['data'])
        assert skeleton['version'] == 2 and len(skeleton['frames']) > 0
        assert diagnostics['labVersion'] == '3.0.0' and diagnostics['model'] in ['full', 'lite']
        assert diagnostics['attempts'][0]['preparation']['frames'] > 0
        assert page.evaluate("document.querySelector('#video').srcObject===null")
        first_report = {'model': diagnostics['model'], 'modelHistory': diagnostics['modelHistory'],
                        'frames': len(skeleton['frames']), 'videoBytes': len(parts[0]['data']), 'mime': parts[0]['mime']}

        # A failed part survives the real IndexedDB store and a page reload.
        fail_skeleton = True
        page.locator('#again').click()
        page.locator('#camera').click()
        page.wait_for_function("() => document.querySelector('#metrics').textContent.includes('inference')", timeout=60000)
        page.wait_for_timeout(500)
        page.locator('#stop').click()
        page.wait_for_function("() => !document.querySelector('#upload-retry').hidden", timeout=30000)
        assert [v['part'] for v in parts[3:]] == ['video', 'skeleton']
        page.reload()
        page.wait_for_function("() => document.querySelector('#upload-status').textContent==='נשלח לבדיקה'", timeout=30000)
        assert [v['part'] for v in parts[5:]] == ['skeleton', 'diagnostics']
        page.locator('#upload-disable').click()
        page.wait_for_function("() => document.querySelector('#upload-status').textContent==='שליחה לבדיקה: כבויה'", timeout=10000)
        assert page.evaluate("localStorage.getItem('camlab.upload')") is None
        assert not errors, errors
        print(json.dumps({'browser': 'Chromium synthetic camera', **first_report,
                          'threeParts': True, 'retryAfterReload': True, 'mobileWidth': 390, 'errors': errors}))
        browser.close()
finally:
    server.shutdown()
