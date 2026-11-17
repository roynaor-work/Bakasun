#!/usr/bin/env python3
"""Headless Chromium checks of the actual delivered preview.

Requires Python Playwright and Chromium. Serves this folder on loopback only,
creates compact evidence and screenshots inside verification/, and exits.
"""
import functools
import hashlib
import html
import http.server
import json
import mimetypes
import os
from pathlib import Path
import shutil
import threading
from urllib.parse import unquote, urlsplit
from playwright.sync_api import Error as PlaywrightError, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def snapshot(page):
    return page.evaluate("window.alienPreview.snapshot()")


def choose(page, enemy_id):
    page.locator(f'[data-enemy="{enemy_id}"]').click()
    page.wait_for_function("id => window.alienPreview.snapshot().id === id && document.querySelector('#app').dataset.ready === 'true'", arg=enemy_id)


def step(page, ms):
    page.evaluate("ms => window.alienPreview.step(ms)", ms)


def pixels(page):
    return page.locator("canvas").screenshot()


def main():
    OUT.mkdir(exist_ok=True)
    catalog = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    table = json.loads((ROOT / "patterns.json").read_text(encoding="utf-8"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/preview.html?paused=1"
    browser_path = os.environ.get("ALIEN_CHROMIUM_PATH") or shutil.which("chromium") or shutil.which("chromium-browser")
    errors, network_errors, external_requests, enemy_results = [], [], [], []
    try:
        with sync_playwright() as pw:
            options = {"headless":True,"args":["--no-sandbox","--disable-dev-shm-usage"]}
            if browser_path:
                options["executable_path"] = browser_path
            browser = pw.chromium.launch(**options)
            page = browser.new_page(viewport={"width":844,"height":390}, device_scale_factor=1)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
            page.on("response", lambda response: network_errors.append(f"{response.status} {response.url}") if response.status >= 400 else None)
            page.on("request", lambda request: external_requests.append(request.url) if request.url.startswith("http") and not request.url.startswith(f"http://127.0.0.1:{server.server_port}/") else None)
            page.goto(url)
            page.wait_for_function("window.alienPreview && document.querySelector('#app').dataset.ready === 'true'")
            require(page.locator("[data-enemy]").count() == 12, "Twelve roster buttons")
            require(page.evaluate("document.documentElement.scrollWidth === 844 && document.documentElement.scrollHeight === 390"), "844x390 overflow")
            bounds = page.locator("button, .top-actions a").evaluate_all("items => items.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})")
            require(all(b["x"] >= 0 and b["y"] >= 0 and b["x"]+b["w"] <= 844.5 and b["y"]+b["h"] <= 390.5 for b in bounds), "Controls outside viewport")
            require(all(b["h"] >= 40 for b in bounds), "Touch targets below 40px")
            for enemy in catalog["enemies"]:
                enemy_id = enemy["id"]
                choose(page, enemy_id)
                p = table["enemies"][enemy_id]
                row_hashes = []
                for row, state in enumerate(("healthy","scuffed","patched")):
                    page.locator(f'[data-state="{state}"]').click()
                    require(snapshot(page)["frameIndex"] == row*6, f"{enemy_id} state row")
                    row_hashes.append(hashlib.sha256(pixels(page)).hexdigest())
                require(len(set(row_hashes)) == 3, f"{enemy_id} damage pixels do not change")
                page.locator('[data-state="healthy"]').click()
                before = snapshot(page)
                page.wait_for_timeout(90)
                require(snapshot(page)["timeMs"] == before["timeMs"], f"{enemy_id} pause advances")
                # Exercise every motion frame at 6fps; endpoint 1000ms wraps to 0.
                frames = []
                for i in range(6):
                    frames.append(snapshot(page)["frameIndex"])
                    step(page, 1000/6)
                require(frames == list(range(6)), f"{enemy_id} motion sequence: {frames}")
                # Check all interpolated paths, including the loop seam.
                path_check = page.evaluate("m => {const p=[];for(let i=0;i<=1000;i++)p.push(window.alienPreview.sampleMovement(m,m.durationMs*i/1000));return {inside:p.every(v=>v.x>.08&&v.x<.92&&v.y>.08&&v.y<.75),start:p[0],end:p[p.length-1]}}",p["movement"])
                require(path_check["inside"] and path_check["start"] == path_check["end"], f"{enemy_id} path bounds/loop")
                # Fresh entity: start attack via real UI, then move the target.
                choose(page, enemy_id)
                page.locator("#attack").click()
                locked = snapshot(page)["lockedTarget"]
                stage = page.locator("canvas").bounding_box()
                page.mouse.click(stage["x"]+stage["width"]*.78,stage["y"]+stage["height"]-20)
                require(snapshot(page)["lockedTarget"] == locked, f"{enemy_id} retargeted during warning")
                step(page, p["attack"]["windupMs"]-10)
                snap = snapshot(page)
                require(snap["phase"] == "windup" and snap["projectiles"] == 0 and not snap["beamActive"], f"{enemy_id} fired before warning")
                if enemy_id == "laser":
                    require(snap["moveTimeMs"] == 0, "Laser moves while aiming")
                step(page, 20)
                fired = snapshot(page)
                require(fired["phase"] == "active", f"{enemy_id} failed to fire")
                if p["attack"]["kind"] == "beam":
                    require(fired["beamActive"], "Beam absent")
                    page.screenshot(path=str(OUT / "laser-844x390.png"))
                    step(page, 400)
                    require(not snapshot(page)["beamActive"], "Beam exceeds 400ms")
                else:
                    require(fired["projectiles"] == p["attack"]["projectile"]["count"], f"{enemy_id} shot count")
                # All six death frames are used, then the sprite is removed.
                page.locator("#death").click()
                require(snapshot(page)["projectiles"] == 0 and not snapshot(page)["beamActive"] and snapshot(page)["children"] == 0, "Death retains hazards")
                death_frames = []
                for i in range(6):
                    death_frames.append(snapshot(page)["frameIndex"])
                    step(page, 125)
                require(death_frames == [18,19,20,21,22,23], f"{enemy_id} death sequence")
                require(snapshot(page)["mode"] == "gone" and snapshot(page)["frameIndex"] is None, f"{enemy_id} death loops")
                step(page, 1000)
                require(snapshot(page)["mode"] == "gone", f"{enemy_id} respawned without request")
                page.locator("#death").click()
                require(snapshot(page)["mode"] == "alive", f"{enemy_id} restore button")
                enemy_results.append({"id":enemy_id,"damageStates":3,"motionFrames":frames,"deathFrames":death_frames,
                                      "warningMs":p["attack"]["windupMs"],"aimLock":True,"removedAfterDeath":True})
                print(f"Browser OK: {enemy_id}", flush=True)
            choose(page,"split-blob")
            page.locator('[data-state="scuffed"]').click()
            require(snapshot(page)["children"] == 2, "Split did not create two children")
            page.locator('[data-state="patched"]').click()
            require(snapshot(page)["children"] == 2, "Recursive split")
            step(page,4800)
            require(snapshot(page)["children"] == 0, "Children lifetime")
            choose(page,"small-saucer")
            step(page,300)
            page.screenshot(path=str(OUT/"preview-844x390.png"))
            # Smaller portrait still exposes every control without horizontal overflow.
            page.set_viewport_size({"width":390,"height":844})
            page.wait_for_timeout(80)
            require(page.evaluate("document.documentElement.scrollWidth === 390"), "Portrait horizontal overflow")
            require(all(page.locator(f'[data-enemy="{e["id"]}"]').is_visible() for e in catalog["enemies"]), "Portrait roster hidden")
            page.screenshot(path=str(OUT/"preview-390x844.png"))
            gallery = browser.new_page(viewport={"width":844,"height":530},device_scale_factor=1)
            cards = ''.join('<figure><img alt="" src="'+f'http://127.0.0.1:{server.server_port}/'+e['assets']['states'][0]['path']+'"><figcaption>'+html.escape(e['nameHe'])+'</figcaption><small>'+html.escape(e['id'])+'</small></figure>' for e in catalog['enemies'])
            gallery.set_content('<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>12 אויבים ידידותיים</title><style>body{margin:0;padding:16px;background:#0c1829;color:#e8f3ff;font-family:Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;height:30px}h1{font-size:23px;margin:0}header span{font-size:12px;color:#a6d8cb}main{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}figure{margin:0;height:146px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #31485c;border-radius:13px;background:#162b40}img{width:106px;height:106px;object-fit:contain}figcaption{font-size:14px;line-height:18px}small{font-size:9px;color:#a8bdce;direction:ltr}</style><header><h1>חברים מהחלל</h1><span>12 אויבים מקוריים · v2</span></header><main>'+cards+'</main></html>')
            gallery.wait_for_function('Array.from(document.images).every(i=>i.complete && i.naturalWidth===256)')
            gallery.screenshot(path=str(OUT/'contact-sheet.png'))
            reduced = browser.new_page(viewport={"width":844,"height":390},reduced_motion="reduce")
            reduced.goto(url.replace("?paused=1",""))
            reduced.wait_for_function("window.alienPreview && document.querySelector('#app').dataset.ready === 'true'")
            require(snapshot(reduced)["playing"] is False, "Reduced motion ignored")
            # Some managed browsers forbid file navigation. Record that policy;
            # verify the identical local files in an explicitly offline context.
            local = browser.new_page(viewport={"width":844,"height":390})
            file_requests=[]
            local.on("request",lambda request:file_requests.append(request.url) if request.url.startswith("http") else None)
            file_verified = False
            file_limitation = None
            try:
                local.goto((ROOT/"preview.html").as_uri()+"?paused=1")
                local.wait_for_function("window.alienPreview && document.querySelector('#app').dataset.ready === 'true'")
                choose(local,"cloud")
                step(local,1500)
                file_verified = True
            except PlaywrightError as error:
                if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):
                    raise
                file_limitation = 'Managed Chromium blocks file:// navigation (ERR_BLOCKED_BY_ADMINISTRATOR)'
            require(not file_requests, "Offline preview requested HTTP")
            offline = browser.new_context(offline=True,viewport={"width":844,"height":390})
            fulfilled = []
            def serve_memory(route):
                path=(ROOT/unquote(urlsplit(route.request.url).path).lstrip('/')).resolve()
                require(path.is_relative_to(ROOT) and path.is_file(), 'Offline asset path')
                fulfilled.append(path.relative_to(ROOT).as_posix())
                route.fulfill(status=200,body=path.read_bytes(),content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
            offline.route(f'http://127.0.0.1:{server.server_port}/**',serve_memory)
            offline_page=offline.new_page()
            offline_page.on('pageerror',lambda error:errors.append(str(error)))
            offline_page.goto(url)
            offline_page.wait_for_function("window.alienPreview && document.querySelector('#app').dataset.ready === 'true'")
            choose(offline_page,'cloud')
            step(offline_page,1500)
            require(len(fulfilled)>=17 and snapshot(offline_page)['id']=='cloud','Offline asset loading')
            require(not errors and not network_errors and not external_requests, f"Browser errors: {errors}, {network_errors}, {external_requests}")
            result={"status":"pass","browser":browser.version,"viewports":[[844,390],[390,844]],
                    "enemyCount":12,"damageStateChecks":36,"motionFramesChecked":72,"deathFramesChecked":72,
                    "controlsWithin844x390":True,"minimumButtonHeightPx":40,"pausedClock":True,"reducedMotion":True,
                    "offline":True,"offlineMethod":"browser offline=true; identical local assets fulfilled from memory",
                    "offlineAssetRequestsFulfilled":len(fulfilled),"fileOpenVerified":file_verified,"fileOpenLimitation":file_limitation,
                    "externalRequests":0,"pageErrors":errors,"httpErrors":network_errors,
                    "checks":["UI selection of all 12 enemies", "three distinct rendered damage states",
                              "all movement frames", "interpolated path bounds and loop seams",
                              "windup before fire, locked aim, projectile counts", "laser hold and 400ms duration",
                              "six-frame one-shot death and hazard cleanup", "bounded split and child expiry",
                              "viewport bounds, touch targets, portrait layout", "reduced motion and offline local assets"],
                    "enemies":enemy_results}
            (OUT/"browser-checks.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
            print(json.dumps({k:v for k,v in result.items() if k!="enemies"},ensure_ascii=False))
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
