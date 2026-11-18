"""Smoke test the staged site locally with Chromium, using synthetic state."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
import tempfile
from threading import Thread
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    with tempfile.TemporaryDirectory(prefix="privacy-browser-") as temp:
        site = Path(temp) / "site"
        subprocess.run(["python3", ".github/scripts/stage-pages.py", site], check=True)
        with ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=site)) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                verify(f"http://127.0.0.1:{server.server_port}")
            finally:
                server.shutdown()
                thread.join()
    print("Chromium: app startup, declared CSP and closed camera setup verified.")


def verify(origin):
    endpoint = "https://upload.example.invalid/ingest"
    fragment = urlencode({"upload": endpoint, "key": "synthetic-test-value"})
    with sync_playwright() as playwright:
        executable = shutil.which("chromium")
        browser = playwright.chromium.launch(executable_path=executable)
        context = browser.new_context(service_workers="block")
        context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(origin + "/") else route.abort())
        page = context.new_page()
        posts = []
        page.on("request", lambda request: posts.append(request.method) if request.method == "POST" else None)
        for path, selector in (
            ("/", "#app > *"), ("/north/", "footer"), ("/workout/", "#app > *"),
            ("/workout/island/", "main"), ("/workout/island/minigames/boar-island/", "#game"),
        ):
            response = page.goto(origin + path, wait_until="domcontentloaded")
            assert response.ok, path
            page.locator(selector).first.wait_for(state="attached")
            if path.startswith("/workout/"):
                assert page.locator('meta[http-equiv="Content-Security-Policy"]').count() == 1, path

        page.goto(origin + "/workout/cam-lab/#" + fragment, wait_until="domcontentloaded")
        page.wait_for_function("document.querySelector('#upload-status').textContent.includes('היעד טרם אושר')")
        assert "#" not in page.url
        assert page.locator("#upload-off-banner").is_visible()
        assert page.evaluate("""() =>
          localStorage.getItem('camlab.upload.v2') === null &&
          localStorage.getItem('kidfit.cameraUpload.v2') === null
        """)
        assert not posts
        browser.close()


if __name__ == "__main__":
    main()
