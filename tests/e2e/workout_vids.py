"""Two fictional phones; Storage/RPC requests are intercepted, with no remote writes."""
import functools
import http.server
import json
import shutil
import threading
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[2]
A, B = 'TESTAAAA', 'TESTBBBB'
files = {f'{A}/squats': b'legacy synthetic clip'}
calls = []


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def api(route):
    request = route.request
    path = urlparse(request.url).path
    calls.append((path, request.method, request.headers))
    if path.startswith('/rest/v1/rpc/'):
        data = request.post_data_json
        code = data.get('code')
        if code not in [A, B]:
            route.fulfill(status=401, json={'message': 'unknown family code'})
        elif path.endswith('kidfit_vids_catalog'):
            latest = {}
            for name in files:
                if not name.startswith(code + '/'):
                    continue
                item = name.split('/')[1].split('.')
                identifier, version = item[0], int(item[1]) if len(item) > 1 else 0
                if identifier not in latest or version > latest[identifier]['version']:
                    latest[identifier] = dict(id=identifier, path=name, updated=name, mime='video/mp4', version=version)
            route.fulfill(json=list(latest.values()))
        else:
            name, action = data['path'], data['action']
            if not name.startswith(code + '/'):
                route.fulfill(status=403, json={'message': 'invalid family path'})
            elif action == 'upload' and name in files:
                route.fulfill(status=409, json={'message': 'video already exists'})
            else:
                kind = 'upload/sign' if action == 'upload' else 'sign'
                route.fulfill(json=dict(path=f'/storage/v1/object/{kind}/kidfit-vids/{name}?token=synthetic', expires=int(time.time()) + 120))
    else:
        marker = '/kidfit-vids/'
        name = path.split(marker)[1] if marker in path else ''
        if request.method == 'PUT':
            assert name not in files
            files[name] = request.post_data_buffer
            route.fulfill(json={})
        else:
            route.fulfill(status=200, body=files[name], content_type='video/mp4')


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
        phones, errors = [], []
        for _ in range(2):
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            context.route('**/rest/v1/rpc/**', api)
            context.route('**/storage/v1/**', api)
            context.add_init_script("localStorage.setItem('kidfit.v1', JSON.stringify({profile:{familyCode:'TESTAAAA',stage3d:false,sound:false,voice:false,intro:false}}));")
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(origin + '/workout/#/settings')
            page.evaluate("async()=>{window.__vids=await import('./js/vids.js?v=20261011-vids-signed-1');}")
            page.wait_for_function("document.querySelector('#vidcloud')?.textContent.includes('בענן 1')")
            page.locator('details').filter(has=page.locator('[data-vid="squats"]')).locator('summary').click()
            phones.append(page)
        parent, child = phones
        child.locator('[data-playvid="squats"]').click()
        child.wait_for_function("document.querySelector('[data-prev=squats] video')?.src.startsWith('blob:')")
        first = child.evaluate("__vids.cloudVideos().squats.path")
        for content in [b'first new clip', b'second new clip']:
            previous = parent.evaluate("__vids.cloudVideos().squats.path")
            parent.locator('input[data-vid="squats"]').set_input_files({'name': 'synthetic.mp4', 'mimeType': 'video/mp4', 'buffer': content})
            parent.wait_for_function("previous=>!__vids.vidStatus.busy && __vids.cloudVideos().squats.path!==previous", arg=previous)
        latest = parent.evaluate("__vids.cloudVideos().squats.path")
        assert latest != first and len(files) == 3, (latest, first, list(files))
        child.locator('#vidrefresh').click()
        child.wait_for_function("path=>__vids.cloudVideos().squats.path===path", arg=latest)
        child.evaluate("document.querySelector('details:has(input[data-vid])').open=true")
        child.locator('[data-playvid="squats"]').click()
        child.wait_for_function("document.querySelector('[data-prev=squats] video')?.src.startsWith('blob:')")
        assert child.evaluate("async()=>await (await fetch(document.querySelector('[data-prev=squats] video').src)).text()") == 'second new clip'
        assert 'מחיקה מהענן נעשית בלוח הבקרה' in child.locator('#app').inner_text()
        parent.on('dialog', lambda dialog: dialog.accept())
        parent.evaluate("document.querySelector('details:has(input[data-vid])').open=true")
        parent.locator('[data-delvid="squats"]').click()
        parent.wait_for_function("!__vids.localVideos().has('squats')")
        assert len(files) == 3
        child.locator('#fam').fill(B)
        child.wait_for_function("document.querySelector('#vidcloud')?.textContent.includes('בענן 0')")
        child.evaluate("location.hash='/exercise/squats'")
        child.wait_for_function("!!document.querySelector('svg[data-ex=squats]')")
        assert child.locator('.exmedia video').count() == 0
        assert not errors, errors
        for path, method, headers in calls:
            assert '/object/list/' not in path and '/object/public/' not in path
            assert method != 'DELETE' and 'x-upsert' not in headers
        print(json.dumps({'phones': 2, 'retainedCloudFiles': len(files), 'latestVersion': True, 'localDelete': True, 'familySwitch': True, 'pageErrors': errors}))
        browser.close()
finally:
    server.shutdown()
