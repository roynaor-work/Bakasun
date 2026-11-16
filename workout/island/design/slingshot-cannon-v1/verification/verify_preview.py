#!/usr/bin/env python3
"""Exercise real atlas animation, all impacts, sound playback and MP3 fallback.

Requires Python Playwright + Chromium. Starts its own loopback HTTP server.
Writes evidence only inside this new design package.
"""
import functools
import io
import json
from pathlib import Path
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification"
manifest = json.loads((ROOT / "manifest.json").read_text())


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def screenshot(page, name):
    data = page.screenshot(animations="disabled")
    Image.open(io.BytesIO(data)).convert("RGB").save(OUT / f"{name}.webp", quality=86, method=6)


def until(page, expression, arg=None):
    page.wait_for_function(expression, arg=arg, timeout=6000)


def exercise(page, fallback=False):
    errors, failed, requests, playback = [], [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("requestfailed", lambda request: failed.append({"url": request.url, "error": request.failure}))
    page.on("request", lambda request: requests.append(request.url))
    page.add_init_script("""window.__played=[];
      const start=AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start=function(...args){
        window.__played.push({duration:this.buffer.duration,channels:this.buffer.numberOfChannels,sampleRate:this.buffer.sampleRate});
        return start.apply(this,args);
      };""")
    if fallback:
        # Exercise an OGG decode failure, rather than merely selecting MP3 by MIME.
        page.route("**/audio/**/*.ogg", lambda route: route.fulfill(status=200, content_type="audio/ogg", body=b"invalid OGG fixture"))
    page.goto(URL, wait_until="networkidle")
    until(page, "window.previewState?.ready === true")
    assert page.evaluate("document.documentElement.scrollWidth") == 844
    assert page.locator("#app").bounding_box()["height"] == 390
    assert page.evaluate("document.documentElement.scrollHeight") == 390
    assert page.get_by_role("button", name="קלע צבעוני", exact=True).get_attribute("aria-pressed") == "true"
    assert page.evaluate("window.previewState.shots") == 0, "Reduced-motion preference must suppress the initial demo"
    if not fallback:
        screenshot(page, "preview-844x390")
    page.locator("#sound").click()
    until(page, "window.previewState.sound && window.previewState.shots === 1")
    total=0
    for index, weapon in enumerate(manifest["weapons"]):
        if index:
            page.get_by_role("button", name=weapon["nameHe"], exact=True).click()
            until(page, "id => window.previewState.weapon === id && !document.querySelector('#fire').disabled", weapon["id"])
        if not fallback and index:
            screenshot(page, f"{weapon['id']}-idle")
        for variant in range(4):
            page.locator("#variation").select_option(str(variant))
            before=page.evaluate("({...window.previewState})")
            # Sound-enable starts the first slingshot shot as a user action.
            already_started = index == 0 and variant == 0
            expected_release=total+1
            if not already_started:
                page.locator("#fire").click()
            until(page, "n => window.previewState.releases === n", expected_release)
            assert page.evaluate("window.previewState.activeAudio") > 0, f"No firing source for {weapon['id']}"
            if not fallback and variant == 0:
                page.wait_for_timeout(150)
                screenshot(page, f"{weapon['id']}-flight")
            until(page, "n => window.previewState.impacts === n", total+1)
            assert page.evaluate("window.previewState.impactVariant") == variant
            if not fallback and variant == 0:
                screenshot(page, f"{weapon['id']}-impact")
            page.wait_for_timeout(weapon["impacts"][variant]["durationMs"]+160)
            total+=1
        if not fallback:
            page.locator("#showAssets").click()
            assert page.locator(".tile").count() == (15 if weapon["id"] in ("cannon","slingshot") else 13)
            screenshot(page, f"{weapon['id']}-frames")
            page.get_by_role("button", name="חזרה להדגמה").click()
            assert page.locator("#showAssets").evaluate("el=>el===document.activeElement")
    assert page.evaluate("window.previewState.shots") == 20
    assert page.evaluate("window.previewState.releases") == 20
    assert page.evaluate("window.previewState.impacts") == 20
    playback=page.evaluate("window.__played")
    assert len(playback)==40, f"Expected 20 fire + 20 impact sounds, got {len(playback)}"
    assert all(v["channels"]==1 and v["sampleRate"] in (44100,48000) for v in playback)
    # Animation and audio must cancel when the preview is hidden mid-flight.
    page.locator("#fire").click()
    until(page, "window.previewState.releases === 21")
    page.evaluate("""Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));""")
    assert page.evaluate("window.previewState.activeAudio") == 0
    hit_count=page.evaluate("window.previewState.impacts")
    page.wait_for_timeout(900)
    assert page.evaluate("window.previewState.impacts") == hit_count
    page.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))")
    # Muting stops active sound. Repeated weapon switches must not leak sources.
    page.locator("#sound").click()
    assert page.evaluate("window.previewState.activeAudio") == 0
    page.locator("#fire").click()
    for weapon in reversed(manifest["weapons"]):
        page.get_by_role("button", name=weapon["nameHe"], exact=True).click()
    assert page.evaluate("window.previewState.activeAudio") == 0
    page.locator("#loop").click()
    before=page.evaluate("window.previewState.impacts")
    until(page,"n=>window.previewState.impacts>n",before)
    page.locator("#loop").click()
    assert page.locator("#loop").get_attribute("aria-pressed") == "false"
    assert not errors, errors
    assert not failed, failed
    assert all(url.startswith(ORIGIN) for url in requests), "Unexpected external asset request"
    media_requests=[u.removeprefix(ORIGIN+"/") for u in requests if "/audio/" in u]
    assert len({u for u in media_requests if u.endswith('.ogg')})==25
    if fallback:
        assert len({u for u in media_requests if u.endswith('.mp3')})==25
    else:
        assert not any(u.endswith('.mp3') for u in media_requests)
    return {"codec":"mp3 fallback after invalid OGG" if fallback else "ogg/vorbis",
            "viewport":{"width":844,"height":390},"weapons":5,"completeShots":20,"soundSourcesStarted":len(playback),
            "fourImpactsPerWeapon":True,"galleryTiles":69,"hiddenCancellation":True,"muteStopsSources":True,
            "rapidSelection":True,"loopToggle":True,"reducedMotion":True,"externalRequests":0,
            "errors":errors,"failedRequests":failed,"audioRequests":media_requests}


if __name__=="__main__":
    server=ThreadingHTTPServer(("127.0.0.1",0),functools.partial(QuietHandler,directory=str(ROOT)))
    ORIGIN=f"http://127.0.0.1:{server.server_port}";URL=f"{ORIGIN}/preview.html"
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path="/usr/bin/chromium",args=["--no-sandbox","--disable-dev-shm-usage"])
            context=browser.new_context(viewport={"width":844,"height":390},reduced_motion="reduce",device_scale_factor=1)
            primary=exercise(context.new_page());context.close()
            fallback_context=browser.new_context(viewport={"width":844,"height":390},reduced_motion="reduce",device_scale_factor=1)
            fallback=exercise(fallback_context.new_page(),True);fallback_context.close()
            # A narrow screen must keep all five weapons and controls reachable.
            narrow=browser.new_context(viewport={"width":390,"height":844},reduced_motion="reduce")
            page=narrow.new_page();page.goto(URL);until(page,"window.previewState?.ready === true")
            assert page.evaluate("document.documentElement.scrollWidth")==390
            assert page.locator('.weapon').count()==5
            assert all(v['width']>=40 and v['height']>=40 for v in page.locator('.weapon').evaluate_all("els=>els.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height}})"))
            screenshot(page,"preview-390x844");narrow.close();browser.close()
        result={"passed":True,"primary":primary,"fallback":fallback,"narrow":{"width":390,"horizontalOverflow":False,"weaponsReachable":5}}
        (OUT/"browser.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
        print(json.dumps({"passed":True,"completeShots":40,"audioStarts":80,"weapons":5,"impactVariants":20,"codecPaths":["ogg","mp3 fallback"],"consoleErrors":0},indent=2))
    finally:
        server.shutdown();server.server_close()
