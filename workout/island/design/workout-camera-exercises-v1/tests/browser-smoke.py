#!/usr/bin/env python3
"""Local Chromium smoke test. Run after applying the bundle's patches."""
from contextlib import contextmanager
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from playwright.sync_api import expect, sync_playwright


BUNDLE = Path(__file__).resolve().parents[1]
AWAIT = 45_000
ZERO = re.compile(r"\b0\b")
NONZERO = re.compile(r"^\s*[1-9]\d*\b")

# Check request signatures and lifecycle without retaining any body, pixel, or
# pose. Tests use Chromium's fake camera and a canvas of synthetic gray pixels.
AUDIT = """
(() => {
  const audit = window.localAudit = {consentRequests: [], tracks: [], workerMessages: [],
    workerCapture: false, forbidden: [], csp: [], canvasSource: false, deny: false};
  addEventListener('securitypolicyviolation', event => audit.csp.push(event.violatedDirective));
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async options => {
    audit.consentRequests.push({audio: !!options.audio, video: !!options.video});
    if (audit.deny) throw new DOMException('Camera denied in test', 'NotAllowedError');
    let stream;
    if (audit.canvasSource) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      const repaint = () => {
        const gray = audit.dark ? 7 : 162;
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        ctx.fillRect(0, 0, 320, 240);
      };
      repaint();
      const timer = setInterval(repaint, 60);
      stream = canvas.captureStream(16);
      const track = stream.getVideoTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); };
    } else stream = await getUserMedia(options);
    audit.tracks.push(...stream.getTracks());
    return stream;
  };
  const WorkerBase = window.Worker;
  window.Worker = class extends WorkerBase {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', ({data}) => {
        if (data?.type) audit.workerMessages.push(data.type);
        if (data?.fixtureEnd) audit.fixtureEnd = true;
      });
    }
    postMessage(value, ...args) {
      if (value?.keepFrame || value?.record) audit.workerCapture = true;
      return super.postMessage(value, ...args);
    }
  };
  const forbid = label => () => {
    audit.forbidden.push(label);
    throw new Error(`Private workout called ${label}`);
  };
  for (const api of ['MediaRecorder', 'SpeechRecognition', 'webkitSpeechRecognition', 'WebSocket']) {
    Object.defineProperty(window, api, {value: forbid(api), configurable: true});
  }
  navigator.sendBeacon = forbid('sendBeacon');
  navigator.serviceWorker.register = forbid('ServiceWorker.register');
  indexedDB.open = forbid('IndexedDB.open');
  const consent = 'camlab.upload';
  localStorage.setItem(consent, JSON.stringify({endpoint: 'https://example.invalid', secret: 'fixture-value', consentId: 'fixture-consent'}));
  for (const method of ['setItem', 'removeItem', 'clear']) {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function(...args) {
      audit.forbidden.push(`Storage.${method}`);
      return original.apply(this, args);
    };
  }
  const readValue = Storage.prototype.getItem;
  Storage.prototype.getItem = function(key) {
    if (key === consent) audit.forbidden.push('reading legacy consent');
    return readValue.call(this, key);
  };
})();
"""


@contextmanager
def local_server():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryFile(mode="w+b") as logs, subprocess.Popen(
        ["node", str(BUNDLE / "serve.mjs"), "--port", str(port)],
        stdout=logs, stderr=subprocess.STDOUT,
    ) as server:
        try:
            for _ in range(80):
                if server.poll() is not None:
                    break
                try:
                    with urlopen(f"{origin}/workout/", timeout=1) as response:
                        if response.status == 200:
                            break
                except (OSError, URLError):
                    time.sleep(.1)
            else:
                raise RuntimeError(f"Local workout server did not start on {port}")
            if server.poll() is not None:
                logs.seek(0)
                raise RuntimeError(logs.read().decode())
            yield origin
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()


class ObservedBrowser:
    def __init__(self, browser, origin, *, legacy_stub=False):
        self.origin = origin
        self.context = browser.new_context(permissions=["camera"], service_workers="block")
        self.context.add_init_script(AUDIT)
        self.requests = []
        self.remote = []
        self.errors = []

        def route_local(route):
            request = route.request
            url = urlsplit(request.url)
            if f"{url.scheme}://{url.netloc}" != origin:
                self.remote.append(request.url)
                route.abort()
                return
            if legacy_stub and url.path == "/workout/js/app.js":
                route.fulfill(content_type="text/javascript", body="window.legacyAppBoot = true;")
                return
            route.continue_()

        self.context.route("**/*", route_local)
        self.context.on("request", lambda request: self.requests.append((request.method, request.url)))
        self.page = self.context.new_page()
        self.page.set_default_timeout(AWAIT)
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def verify_private(self):
        assert not self.errors, self.errors
        assert not self.remote, self.remote
        assert all(method in ("GET", "HEAD") for method, _ in self.requests), self.requests
        private = self.page.evaluate("""() => ({ forbidden: localAudit.forbidden, csp: localAudit.csp,
            workerCapture: localAudit.workerCapture, consentRequests: localAudit.consentRequests })""")
        assert not private["forbidden"], private
        assert not private["csp"], private
        assert not private["workerCapture"], private
        assert all(request["video"] and not request["audio"] for request in private["consentRequests"]), private
        paths = [urlsplit(url).path for _, url in self.requests]
        assert not any(path.endswith(("/upload-sw.js", "/workout/js/app.js", "/cam-lab/app.mjs")) for path in paths), paths

    def close(self):
        self.context.close()


def check_server(origin):
    with urlopen(f"{origin}/workout/camera-v1/") as response:
        assert "connect-src 'self'" in response.headers["Content-Security-Policy"]
        assert "wasm-unsafe-eval" in response.headers["Content-Security-Policy"]
        assert "microphone=()" in response.headers["Permissions-Policy"]
    for path, method, status in (
        ("/workout/upload-sw.js", "GET", 404),
        ("/workout/cam-lab/index.html", "GET", 404),
        ("/workout/camera-v1/", "POST", 405),
    ):
        try:
            with urlopen(Request(f"{origin}{path}", method=method)):
                raise AssertionError(f"Unexpectedly allowed {method} {path}")
        except HTTPError as error:
            assert error.code == status, (error.code, path, method)
    print("PASS local server is read-only and excludes legacy upload endpoints")


def check_entry(browser, origin):
    legacy = ObservedBrowser(browser, origin, legacy_stub=True)
    try:
        for query in ("", "?cameraV1=0"):
            legacy.page.goto(f"{origin}/workout/{query}")
            legacy.page.wait_for_function("() => window.legacyAppBoot === true")
            assert urlsplit(legacy.page.url).path == "/workout/", legacy.page.url
        assert not legacy.errors and not legacy.remote, (legacy.errors, legacy.remote)
    finally:
        legacy.close()
    print("PASS default and rollback load the legacy entry")


def check_trust(browser, origin):
    run = ObservedBrowser(browser, origin)
    page = run.page
    try:
        page.goto(f"{origin}/workout/?cameraV1=1&ex=squats")
        expect(page).to_have_url(re.compile(r"/workout/camera-v1/"))
        expect(page.locator("#exercise")).to_have_value("squats")
        page.locator("#trust-start").click()
        expect(page.locator("#progress")).to_contain_text(ZERO)
        page.locator("#trust-add").click()
        expect(page.locator("#progress")).to_contain_text(re.compile(r"\b1\b"))
        expect(page.locator("#finish")).to_be_disabled()
        page.locator("#attest").check()
        page.locator("#finish").click()
        expect(page.locator("#summary")).to_be_visible()
        expect(page.locator("#summary")).to_contain_text(re.compile("אמון|דיווח|לפי מה שסימנת"))
        assert page.evaluate("localAudit.consentRequests.length") == 0
        run.verify_private()
        page.goto(f"{origin}/workout/camera-v1/?ex=plank")
        page.locator("#exercise").select_option("plank")
        page.locator("#trust-start").click()
        page.locator("#trust-timer").click()
        expect(page.locator("#progress")).to_contain_text(NONZERO, timeout=6_000)
        assert page.evaluate("localAudit.consentRequests.length") == 0
        run.verify_private()
    finally:
        run.close()
    print("PASS opt-in, manual count, attestation, timer, no camera permission in trust")


def check_permission_denied(browser, origin):
    run = ObservedBrowser(browser, origin)
    page = run.page
    try:
        page.goto(f"{origin}/workout/camera-v1/")
        page.evaluate("localAudit.deny = true")
        page.locator("#camera-start").click()
        expect(page.locator("#status")).to_have_attribute("data-state", "blocked")
        expect(page.locator("#status")).to_contain_text(re.compile("מצלמה|אישור"))
        page.locator("#switch-trust").or_(page.locator("#trust-start")).filter(visible=True).click()
        expect(page.locator("#attest")).to_be_visible()
        assert page.evaluate("localAudit.consentRequests.length") == 1
        run.verify_private()
    finally:
        run.close()
    print("PASS denied camera offers trust without loading the legacy app")


def check_camera(browser, origin, *, canvas=False):
    run = ObservedBrowser(browser, origin)
    page = run.page
    try:
        page.goto(f"{origin}/workout/camera-v1/?ex=squats")
        if canvas:
            page.evaluate("localAudit.canvasSource = true")
        page.locator("#camera-start").click()
        page.wait_for_function("() => document.querySelector('#camera')?.srcObject?.active")
        page.wait_for_function("() => localAudit.workerMessages.includes('ready')")
        expect(page.locator("#status")).to_have_attribute("data-state", "missing", timeout=AWAIT)
        expect(page.locator("#progress")).to_contain_text(ZERO)
        if canvas:
            page.evaluate("localAudit.dark = true")
            expect(page.locator("#status")).to_have_attribute("data-state", "dark", timeout=AWAIT)
        page.locator("#stop").click()
        page.wait_for_function("() => localAudit.tracks.length && localAudit.tracks.every(track => track.readyState === 'ended')")
        run.verify_private()
    finally:
        run.close()
    print("PASS local WASM, fake camera, missing subject, and track teardown" if not canvas
          else "PASS local low-light detection pauses zero-count workout")


def synthetic_squat_worker(rounds):
    frames = subprocess.check_output(["node", "--input-type=module", "-e", """
        import { recording } from './fixtures/geometry.mjs';
        import { strengthClips } from './fixtures/strength.mjs';
        const spec = strengthClips.find(clip => clip.id === 'squats');
        const replay = { ...spec, phases: Array.from({length: Number(process.argv[1])}, () => spec.phases).flat() };
        const frames = Array.from(recording(replay, { step: 100 }));
        process.stdout.write(JSON.stringify(frames));
    """, str(rounds)], cwd=BUNDLE, text=True)
    return "const frames = " + frames + ";" + """
        let index = 0;
        self.onmessage = ({data}) => {
          if (data.type === 'init') self.postMessage({ type: 'ready' });
          else if (data.type === 'frame') {
            data.bitmap.close();
            const frame = frames[Math.min(index, frames.length - 1)];
            const time = index++ * 100;
            self.postMessage({ ...frame, type: 'pose', time, fixtureEnd: index >= frames.length });
          }
        };
    """


def check_count_in_ui(browser, origin):
    run = ObservedBrowser(browser, origin)
    page = run.page
    worker = synthetic_squat_worker(1)
    run.context.route("**/workout/js/camera-v1/pose-worker.js",
                      lambda route: route.fulfill(content_type="text/javascript", body=worker))
    try:
        page.goto(f"{origin}/workout/camera-v1/?ex=squats")
        page.locator("#camera-start").click()
        expect(page.locator("#progress")).to_have_text("2", timeout=AWAIT)
        page.locator("#demo").click()
        expect(page.locator("#demo")).to_have_attribute("aria-expanded", "true")
        page.wait_for_function("() => localAudit.tracks.length && localAudit.tracks.every(track => track.readyState === 'ended')")
        page.locator("#demo").click()
        page.locator("#switch-trust").click()
        page.locator("#trust-add").click()
        expect(page.locator("#progress")).to_have_text("3")
        expect(page.locator("#finish")).to_be_disabled()
        page.locator("#attest").check()
        page.locator("#finish").click()
        expect(page.locator("#summary")).to_contain_text("2 חזרות לפי תנועה שנראתה")
        expect(page.locator("#summary")).to_contain_text(re.compile(r"1 (?:חזרה|חזרות) לפי מה שסימנת"))
        run.verify_private()
    finally:
        run.close()
    print("PASS synthetic squats through the browser, demo teardown, and distinct trust credits")


def check_camera_target_cap(browser, origin):
    run = ObservedBrowser(browser, origin)
    page = run.page
    worker = synthetic_squat_worker(7)
    run.context.route("**/workout/js/camera-v1/pose-worker.js",
                      lambda route: route.fulfill(content_type="text/javascript", body=worker))
    try:
        page.goto(f"{origin}/workout/camera-v1/?ex=squats")
        page.locator("#level").select_option("easy")
        page.locator("#camera-start").click()
        target = int(re.search(r"\d+", page.locator("#target").inner_text()).group())
        assert 0 < target < 14, target
        expect(page.locator("#progress")).to_have_text(str(target), timeout=AWAIT)
        page.wait_for_function("() => localAudit.fixtureEnd === true")
        expect(page.locator("#progress")).to_have_text(str(target))
        page.locator("#switch-trust").click()
        expect(page.locator("#trust-add")).to_be_disabled()
        expect(page.locator("#attest")).to_be_disabled()
        page.locator("#finish").click()
        expect(page.locator("#summary")).to_contain_text(f"{target} חזרות לפי תנועה שנראתה")
        run.verify_private()
    finally:
        run.close()
    print("PASS results are capped at the user's target")


def main():
    executable = os.getenv("CHROMIUM_BIN") or shutil.which("chromium")
    with local_server() as origin, sync_playwright() as playwright:
        check_server(origin)
        browser = playwright.chromium.launch(
            executable_path=executable,
            args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        )
        try:
            check_entry(browser, origin)
            check_trust(browser, origin)
            check_permission_denied(browser, origin)
            check_camera(browser, origin)
            check_camera(browser, origin, canvas=True)
            check_count_in_ui(browser, origin)
            check_camera_target_cap(browser, origin)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
