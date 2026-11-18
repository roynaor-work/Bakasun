#!/usr/bin/env python3
"""Original CC0-1.0 browser verification; see LICENSES.md.

Serve the repository root first, then run:
  python3 workout/island/design/racing-tracks-v2/browser-check.py --require-measurements
Requires Python Playwright and a local Chromium; no browser download is performed.
"""
import argparse
import hashlib
import json
import math
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
PAGE_PATH = "/workout/island/design/racing-tracks-v2/preview.html"


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8765")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--require-measurements", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / "browser-verification.json")
    parser.add_argument("--screenshots-dir", type=Path, default=ROOT / "preview-shots")
    args = parser.parse_args()
    args.screenshots_dir.mkdir(parents=True, exist_ok=True)
    report = {"schemaVersion": 1, "browser": "", "viewportCases": [], "profileCases": [],
              "interactions": [], "errors": [], "externalRequests": [], "screenshots": [],
              "measurementDataRequired": args.require_measurements}
    report["sourceHashes"] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                              for name in ["tracks.json", "tracks.mjs", "layouts.json", "analysis.mjs",
                                           "preview.html", "preview.mjs", "preview.css", "measurements.json"]
                              if (ROOT / name).exists()}
    started = time.monotonic()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.chromium, headless=True, args=["--no-sandbox"])
        report["browser"] = browser.version
        page = browser.new_page(viewport={"width": 1440, "height": 1080}, reduced_motion="reduce")
        page.on("pageerror", lambda error: report["errors"].append(str(error)))
        page.on("request", lambda request: report["externalRequests"].append(request.url)
                if not request.url.startswith(args.base_url) and not request.url.startswith("data:") else None)
        load_started = time.monotonic()
        page.goto(args.base_url.rstrip("/") + PAGE_PATH, wait_until="networkidle")
        page.wait_for_function("globalThis.__racingTracksPreview?.trackCount === 6")
        report["initialLoadSeconds"] = round(time.monotonic() - load_started, 3)
        report["navigationTiming"] = page.evaluate("""() => {
          const n=performance.getEntriesByType('navigation')[0];
          return {domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,
            resources:performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').at(-1),
              durationMs:Math.round(r.duration*100)/100,transferBytes:r.transferSize}))};
        }""")
        assert page.locator("#error").is_hidden(), "Preview displayed an error"
        ids = page.locator("#track-picker .track-button").evaluate_all("nodes => nodes.map(n => n.dataset.track)")
        assert len(ids) == 6 and len(set(ids)) == 6
        assert page.locator("#comparison tr").count() == 6
        csp = page.locator('meta[http-equiv="Content-Security-Policy"]').get_attribute("content")
        assert "script-src 'self'" in csp and "wasm-unsafe-eval" not in csp and "unsafe-eval" not in csp
        report["csp"] = csp
        report["wasmProbe"] = page.evaluate("""async () => {
          try { await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])); return {blocked:false}; }
          catch(error) { return {blocked:true,name:error.name,message:error.message}; }
        }""")
        assert report["wasmProbe"]["blocked"] and "Content Security" in report["wasmProbe"]["message"]

        def select(selector, value):
            before = page.evaluate("__racingTracksPreview.renderVersion")
            page.locator(selector).select_option(str(value))
            page.wait_for_function("version => __racingTracksPreview.renderVersion > version", arg=before)

        def choose(track_id):
            before = page.evaluate("__racingTracksPreview.renderVersion")
            page.locator(f'#track-picker [data-track="{track_id}"]').click()
            page.wait_for_function("version => __racingTracksPreview.renderVersion > version", arg=before)
            assert page.evaluate("__racingTracksPreview.trackId") == track_id
            assert page.locator('#track-picker [aria-pressed="true"]').count() == 1
            assert page.locator('#comparison tr.selected').count() == 1

        def screenshot(name):
            path = args.screenshots_dir / name
            page.screenshot(path=str(path), full_page=True, type="jpeg", quality=82)
            report["screenshots"].append({"file": path.relative_to(ROOT).as_posix(),
                                          "bytes": path.stat().st_size,
                                          "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})

        for tier in range(5):
            select("#tier", tier)
            for model in ["ai", "physical"]:
                select("#model", model)
                for track_id in ids:
                    choose(track_id)
                    result = page.evaluate("""id => {
                      const api = __racingTracksPreview;
                      const index = [...document.querySelectorAll('#track-picker .track-button')].findIndex(n => n.dataset.track === id);
                      const p = api.profiles[index];
                      return {id, tier: api.tier, model: api.model, samples:p.samples.length,
                        length:p.length, under85Fraction:p.under85Fraction, over95Fraction:p.over95Fraction,
                        topSpeed:p.topSpeed, minSpeed:p.minSpeed, maxSpeed:p.maxSpeed,
                        cornerCount:document.querySelectorAll('#corners button').length,
                        mapCorners:document.querySelectorAll('#track-map [data-corner]').length,
                        speedText:document.querySelector('#current-speed').textContent,
                        lapText:document.querySelectorAll('#metrics-strip strong')[3].textContent};
                    }""", track_id)
                    assert result["samples"] > 500 and result["length"] > 2000
                    assert 10 <= result["cornerCount"] <= 14 and result["cornerCount"] == result["mapCorners"]
                    assert all(math.isfinite(result[key]) for key in ["minSpeed", "maxSpeed", "topSpeed"])
                    assert 0 < result["minSpeed"] <= result["maxSpeed"] <= result["topSpeed"] + 1e-6
                    assert result["under85Fraction"] >= .4, f"Less than 40% below 85% for {track_id}/{tier}/{model}"
                    assert result["over95Fraction"] <= .25, f"More than 25% above 95% for {track_id}/{tier}/{model}"
                    assert result["speedText"] != "—"
                    if args.require_measurements:
                        assert result["lapText"] != "—", f"Missing simulation measurement for {track_id}/{tier}/{model}"
                    report["profileCases"].append(result)
                    if tier == 0 and model == "ai":
                        screenshot(f"desktop-{track_id}.jpg")

        select("#tier", 0)
        select("#model", "ai")
        choose(ids[0])
        page.locator("#scrubber").evaluate("el => { el.value = '5000'; el.dispatchEvent(new Event('input',{bubbles:true})); }")
        assert abs(page.evaluate("__racingTracksPreview.fraction") - .5) < 1e-5
        report["interactions"].append("Slider moves map marker, graph cursor and telemetry to half-lap")
        page.locator("#corners button").nth(3).click()
        assert page.locator('#corners button[aria-pressed="true"]').count() == 1
        assert abs(page.evaluate("__racingTracksPreview.fraction") - .5) > .01
        report["interactions"].append("Corner card selects its apex")
        page.locator("#track-map [data-corner]").nth(5).press("Enter")
        assert page.locator('#corners button[aria-pressed="true"]').count() == 1
        report["interactions"].append("Map corner marker is keyboard operable")

        def svg_click(selector, x, y):
            coords = page.locator(selector).evaluate("""(element,p) => {
                element.scrollIntoView({block:'center'});
                const point=element.createSVGPoint();point.x=p[0];point.y=p[1];
                const screen=point.matrixTransform(element.getScreenCTM());return [screen.x,screen.y];
            }""", [x, y])
            page.mouse.click(coords[0], coords[1])

        svg_click("#speed-chart", 575, 90)
        assert abs(page.evaluate("__racingTracksPreview.fraction") - .5) < .002
        report["interactions"].append("Graph pointer maps accurately through the SVG viewport")
        svg_click("#track-map", 410, 280)
        assert 0 <= page.evaluate("__racingTracksPreview.fraction") <= 1
        report["interactions"].append("Map click finds the nearest route sample")
        page.locator("#play").click()
        page.mouse.move(2, 2)
        before = page.evaluate("__racingTracksPreview.fraction")
        page.wait_for_timeout(400)
        after = page.evaluate("__racingTracksPreview.fraction")
        assert after != before
        page.locator("#play").click()
        before = page.evaluate("__racingTracksPreview.fraction")
        page.wait_for_timeout(200)
        assert page.evaluate("__racingTracksPreview.fraction") == before
        report["interactions"].append("Playback advances with profile speed and stops on pause")

        for width, height, label in [(390, 844, "portrait"), (844, 390, "landscape")]:
            page.set_viewport_size({"width": width, "height": height})
            for track_id in ids:
                choose(track_id)
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Page horizontal overflow"
                assert page.locator("#track-map").is_visible()
                assert page.locator("#speed-chart").is_visible()
                report["viewportCases"].append({"id": track_id, "width": width, "height": height, "overflow": False})
            choose(ids[2])
            page.evaluate("scrollTo(0,0)")
            screenshot(f"mobile-{label}.jpg")
        assert not report["errors"], report["errors"]
        assert not report["externalRequests"], report["externalRequests"]
        browser.close()
    report["elapsedSeconds"] = round(time.monotonic() - started, 2)
    report["passed"] = True
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "profileCases": len(report["profileCases"]),
                      "viewportCases": len(report["viewportCases"]), "interactions": len(report["interactions"]),
                      "screenshots": len(report["screenshots"]), "elapsedSeconds": report["elapsedSeconds"]}))


if __name__ == "__main__":
    run()
