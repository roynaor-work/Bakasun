"""Background upload scenarios, invoked by cam_lab.py with its HTTPS 302 server."""
import base64
import hashlib
import random
import shutil
import time
from pathlib import Path


def run_background_tests(playwright, origin, temp, parts, assembled):
    # A moving noise fixture avoids the built-in fake camera compressing an
    # entire minute below one chunk. Real Chromium MediaRecorder still encodes it.
    camera = Path(temp) / 'background-camera.y4m'
    rng = random.Random(12)
    with camera.open('wb') as output:
        output.write(b'YUV4MPEG2 W640 H480 F30:1 Ip A1:1 C420jpeg\n')
        for _ in range(30):
            output.write(b'FRAME\n')
            # Four-pixel grayscale blocks create motion and multiple chunks
            # without uncompressible full-resolution noise exceeding the 40MB cap.
            for _ in range(120):
                row = b''.join(bytes([value]) * 4 for value in rng.randbytes(160))
                output.write(row * 4)
            output.write(bytes([128]) * (640 * 480 // 2))
    browser = playwright.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=[
        '--no-sandbox', '--ignore-certificate-errors', '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={camera}',
        '--use-gl=angle', '--use-angle=swiftshader'])
    context = browser.new_context(ignore_https_errors=True, viewport={'width': 360, 'height': 844})
    observer = context.new_page()
    observer.goto(origin + '/tests/e2e/')  # Same origin, outside the worker scope; never starts a sender.
    observer.evaluate("""() => localStorage.setItem('camlab.upload', JSON.stringify({
      endpoint: location.origin + '/receive', secret: 'test', consentId: 'synthetic-background-consent'
    }))""")
    cdp = context.new_cdp_session(observer)
    versions = {}
    cdp.on('ServiceWorker.workerVersionUpdated', lambda event: versions.update({v['versionId']: v for v in event['versions']}))
    cdp.send('ServiceWorker.enable')
    errors = []

    def wait(check, timeout=180):
        until = time.monotonic() + timeout
        while not check():
            assert time.monotonic() < until, 'background upload timed out'
            observer.wait_for_timeout(100)

    def state(expression):
        return observer.evaluate('async () => { ' + expression + ' }')

    def dispatch():
        active = [v for v in versions.values() if '/workout/upload-sw.js?' in v['scriptURL'] and v['status'] == 'activated']
        assert active, versions
        cdp.send('ServiceWorker.dispatchSyncEvent', {'origin': origin, 'registrationId': active[-1]['registrationId'],
                                                   'tag': 'camlab-upload', 'lastChance': False})

    def assert_complete(session, expected):
        received = [part for part in parts if part['session'] == session]
        count = max(1, (len(expected) + 1572863) // 1572864)
        assert [part['part'] for part in received] == ['diagnostics', 'skeleton'] + ['video'] * count, [(p['part'], p['chunk']) for p in received]
        assert [part['chunk'] for part in received if part['part'] == 'video'] == list(range(count))
        assert assembled[(session, 'video')] == expected
        return count

    try:
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""(() => {
          const NativeRecorder = window.MediaRecorder;
          window.MediaRecorder = class extends NativeRecorder {
            constructor(...args) {
              super(...args); const chunks = [];
              this.addEventListener('start', () => { window.captureStarted = performance.now(); });
              this.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
              this.addEventListener('stop', () => { window.capturedVideo = new Blob(chunks); });
            }
          };
        })();""")
        page.goto(origin + '/workout/cam-lab/')
        page.locator('#camera').click()
        page.wait_for_function('() => performance.now() - window.captureStarted >= 60000', timeout=75000)
        state("const core = await import('/workout/cam-lab/upload.mjs?v=20261012-background-1'); window.store = new core.IndexedDBUploadStore();")
        wait(lambda: state("return navigator.serviceWorker.getRegistrations().then(rs => rs.some(r => r.active && r.scope === location.origin + '/workout/'));"))
        page_cdp = context.new_cdp_session(page)
        page_cdp.send('Network.enable')
        page_cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 0,
                      'downloadThroughput': -1, 'uploadThroughput': 200000})
        page.locator('#finish').click()
        page.wait_for_function('() => window.capturedVideo')
        captured_b64 = page.evaluate("""async () => {
          const bytes = new Uint8Array(await capturedVideo.arrayBuffer()), strings = [];
          for (let i = 0; i < bytes.length; i += 32768) strings.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
          return btoa(strings.join(''));
        }""")
        captured = base64.b64decode(captured_b64, validate=True)
        print(f'Background fixture: 60 seconds, {len(captured)} video bytes', flush=True)
        assert 1572864 * 2 < len(captured) <= 40000000, len(captured)
        wait(lambda: state("return store.list().then(rs => rs.some(r => r.parts.find(p => p.part === 'video').ackedChunks?.includes(0)));"))
        session = state("return store.list().then(rs => rs[0].session);")
        page.wait_for_function("() => document.querySelector('#upload-status').textContent.includes('חלק 2')")
        # Exercise the pagehide hook while the second request is in flight.
        # Wait for its durable diagnostic before actually destroying the page.
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
        wait(lambda: state("return store.readLog().then(log => log.some(e => e.event === 'sync' && e.registered && e.time > 0));"))
        page.wait_for_timeout(300)
        page.close()
        dispatch()
        wait(lambda: state("return store.list().then(rs => rs.length === 0);"))
        count = assert_complete(session, captured)
        log = state('return store.readLog();')
        video_log = [entry for entry in log if entry.get('session') == session and entry.get('part') == 'video' and 'result' in entry]
        assert all(entry['actor'] == 'sw' for entry in video_log), video_log
        assert not any('secret' in entry or 'endpoint' in entry for entry in log)

        # Queue the same actual 60-second video; reload a newly opened page
        # while the worker owns the lock and is posting its next chunk.
        observer.evaluate("""async encoded => {
          const { UploadQueue } = await import('/workout/cam-lab/upload.mjs?v=20261012-background-1');
          const queue = new UploadQueue({ config: await store.getConfig(), store, persistConfig: false });
          const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
          await queue.enqueue({ session: 'background-reload', video: new Blob([bytes], { type: 'video/webm' }), skeleton: '{}', diagnostics: '{}' });
        }""", captured_b64)
        dispatch()
        wait(lambda: state("return store.readLog().then(log => log.some(e => e.session === 'background-reload' && e.part === 'video' && e.chunk === 0 && e.actor === 'sw'));"))
        reloading = context.new_page()
        reloading.on('pageerror', lambda error: errors.append(str(error)))
        reloading.goto(origin + '/workout/cam-lab/')
        app_tab = context.new_page()
        app_tab.on('pageerror', lambda error: errors.append(str(error)))
        app_tab.goto(origin + '/workout/')
        reloading.reload()
        wait(lambda: state("return store.list().then(rs => rs.length === 0);"))
        assert_complete('background-reload', captured)
        log = state('return store.readLog();')
        assert all(entry['actor'] == 'sw' for entry in log if entry.get('session') == 'background-reload' and 'result' in entry)
        reloading.close()
        app_tab.close()

        fallback_context = browser.new_context(ignore_https_errors=True)
        fallback_context.add_init_script("""delete window.SyncManager;
          localStorage.setItem('camlab.upload', JSON.stringify({ endpoint: location.origin + '/receive',
            secret: 'test', consentId: 'synthetic-no-sync-consent' }));""")
        fallback = fallback_context.new_page()
        fallback.on('pageerror', lambda error: errors.append(str(error)))
        fallback.goto(origin + '/workout/cam-lab/')
        fallback.locator('#camera').click()
        fallback.wait_for_function("() => document.querySelector('#metrics').textContent.includes('inference')", timeout=60000)
        fallback.wait_for_timeout(1500)
        fallback.locator('#finish').click()
        assert fallback.locator('#upload-keep-open').inner_text() == 'השליחה תמשיך בפתיחה הבאה'
        assert fallback.locator('#upload-keep-open').is_visible()
        assert fallback.evaluate('navigator.serviceWorker.getRegistrations().then(rs => rs.length)') == 0
        fallback.wait_for_function("""() => {
          const status = document.querySelector('#upload-status').textContent;
          return status === 'נשלח לבדיקה' || status.startsWith('השלד והאבחון נשלחו');
        }""", timeout=30000)
        fallback_context.close()
        assert not errors, errors
        return {'recordingSeconds': 60, 'uploadBytesPerSecond': 200000, 'videoBytes': len(captured),
                'sha256': hashlib.sha256(captured).hexdigest(), 'chunks': count, 'identicalBytes': True,
                'closeDuringVideo': True, 'refreshDuringWorker': True, 'secondAppTab': True,
                'duplicateParts': 0, 'cdpSync': True, 'unsupportedNextOpenMessage': True}
    except Exception:
        print('Background state:', state("return store.list().then(rs => rs.map(r => ({session:r.session, parts:r.parts.map(p => ({part:p.part, bytes:p.blob.size, acked:p.acked, chunks:p.ackedChunks}))})));"), flush=True)
        print('Background journal:', state('return store.readLog();'), flush=True)
        if not page.is_closed():
            print('Background page status:', page.locator('#upload-status').inner_text(), flush=True)
        raise
    finally:
        context.close()
        browser.close()
