#!/usr/bin/env python3
"""Exercise the listening page and all 28 browser decoders with Playwright.

Optional verification dependency: Python playwright with installed Chromium.
Run from any directory: python3 check-listen.py
Results stay in this package. Screenshots are temporary review artifacts in /tmp.
"""
from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import threading

from playwright.sync_api import Error, sync_playwright

ROOT = Path(__file__).resolve().parent


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    result = {"browser": "Chromium", "files": [], "viewports": [], "errors": []}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=shutil.which("chromium"),
                                        args=["--no-sandbox"])
            result["browser_version"] = browser.version
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.on("pageerror", lambda e: result["errors"].append(str(e)))
            page.on("response", lambda r: result["errors"].append(f"HTTP {r.status}: {r.url}") if r.status >= 400 else None)
            page.goto(f"http://127.0.0.1:{server.server_port}/listen.html")
            assert page.locator("article").count() == 14
            assert page.locator("audio").count() == 14
            assert page.locator("a[download]").count() == 28
            assert page.evaluate("!active && [...document.querySelectorAll('audio')].every(a => a.paused)")
            result["no_autoplay"] = True
            specs = page.evaluate("manifest.sounds")
            for ext in ("ogg", "mp3"):
                page.select_option("#format", ext)
                for sound in specs:
                    page.locator(f'button[data-id="{sound["id"]}"]').click()
                    page.wait_for_function("id => activeId === id && active && context.state === 'running'", arg=sound["id"])
                    stats = page.evaluate("""() => ({
                        id: activeId, duration_seconds: active.buffer.duration,
                        sample_rate_hz: active.buffer.sampleRate, samples: active.buffer.length,
                        loop: active.loop, loop_end_seconds: active.loopEnd,
                        gain: gainNode.gain.value,
                        pressed: document.querySelector('button[aria-pressed="true"]').dataset.id
                    })""")
                    assert abs(stats["duration_seconds"] - sound["duration_seconds"]) <= .003, (ext, stats)
                    assert stats["loop"] == sound["loop"]
                    assert stats["pressed"] == sound["id"]
                    assert abs(stats["gain"] - .8 * sound["recommended_volume"]) < .0001
                    if sound["loop"]:
                        seam = page.evaluate("""async () => {
                            const b = active.buffer, sr = b.sampleRate;
                            const offline = new OfflineAudioContext(1, 16 * sr, sr);
                            const s = offline.createBufferSource();
                            s.buffer = b; s.loop = true; s.loopStart = 0; s.loopEnd = 8;
                            s.connect(offline.destination); s.start();
                            const rendered = await offline.startRendering();
                            const x = rendered.getChannelData(0), at = 8 * sr;
                            let energy = 0, steps = 0, local = 0;
                            for (let i = 1; i < at; i++) {
                                energy += x[i] ** 2; steps += (x[i] - x[i-1]) ** 2;
                            }
                            const n = Math.round(.05 * sr);
                            for (let i = at - n; i < at + n; i++) local += x[i] ** 2;
                            const stepRms = Math.sqrt(steps / (at - 1));
                            const jump = Math.abs(x[at] - x[at-1]);
                            const slope = Math.abs((x[at+1] - x[at]) - (x[at-1] - x[at-2]));
                            const ratio = Math.sqrt(local / (2*n)) / Math.sqrt(energy / (at-1));
                            return {jump, jump_limit: Math.max(.003, 4*stepRms),
                                slope_error: slope, slope_limit: Math.max(.006, 6*stepRms),
                                seam_rms_over_global_rms: ratio,
                                pass: jump <= Math.max(.003,4*stepRms) && slope <= Math.max(.006,6*stepRms)
                                    && ratio >= .65 && ratio <= 1.45};
                        }""")
                        assert seam["pass"], (ext, seam)
                        stats["rendered_loop_seam"] = seam
                    result["files"].append({"format": ext, **stats, "pass": True})
                    page.click("#stop")
                    assert page.evaluate("!active && !gainNode && activeId === null")
            result["all_28_decode_and_play"] = True
            result["web_audio_gapless_render_two_cycles_both_formats"] = True
            # User interactions, including switching format during playback.
            loop_button = page.locator('button[data-id="arena-ambience-loop"]')
            loop_button.click()
            page.wait_for_function("activeId === 'arena-ambience-loop'")
            page.check("#normalized")
            page.locator("#master").fill("0.5")
            page.wait_for_function("Math.abs(gainNode.gain.value - .5) < .001")
            page.select_option("#format", "ogg")
            assert page.evaluate("!active && !gainNode && activeId === null")
            page.uncheck("#normalized")
            page.locator("#master").fill("0.8")
            loop_button.click()
            page.wait_for_function("activeId === 'arena-ambience-loop'")
            loop_button.click()
            assert page.evaluate("!active")
            loop_button.click()
            page.wait_for_function("activeId === 'arena-ambience-loop'")
            page.keyboard.press("Escape")
            assert page.evaluate("!active")
            page.locator('button[data-id="net-swish"]').click()
            page.wait_for_function("activeId === 'net-swish'")
            page.wait_for_function("activeId === null && !active")
            result["stop_toggle_escape_format_volume_and_one_shot_end"] = True
            # Stop immediately while asynchronous loading is still pending.
            assert page.evaluate("async () => { const pending = play(manifest.sounds[0]); stopAll(); await pending; return !active && activeId === null; }")
            result["cancel_pending_load"] = True
            for width, height in ((390, 844), (844, 390), (1440, 900)):
                page.set_viewport_size({"width": width, "height": height})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                assert page.locator(".play").first.bounding_box()["height"] >= 44
                screenshot = f"/tmp/hoops-listen-{width}x{height}.png"
                page.screenshot(path=screenshot, full_page=True)
                result["viewports"].append({"width": width, "height": height, "no_horizontal_overflow": True,
                                            "play_button_min_44px": True})
            # Record managed-browser restrictions honestly; do not bypass them.
            local = browser.new_page()
            local.on("pageerror", lambda e: result["errors"].append(str(e)))
            try:
                local.goto((ROOT / "listen.html").as_uri())
                result["local_file_navigation"] = "passed"
            except Error as error:
                if "ERR_BLOCKED_BY_ADMINISTRATOR" not in str(error):
                    raise
                result["local_file_navigation"] = "not verified: blocked by managed Chromium policy"
            # Force fetch failure over HTTP to exercise the same native audio
            # fallback, without relying on a browser policy change.
            local.route("**/*", lambda route: route.abort() if route.request.resource_type == "fetch" else route.continue_())
            local.goto(f"http://127.0.0.1:{server.server_port}/listen.html")
            assert local.locator("article").count() == 14
            local.locator('button[data-id="crowd-miss-ooh"]').click()
            local.wait_for_function("activeId === 'crowd-miss-ooh' || !cards.get('crowd-miss-ooh').audio.paused")
            result["embedded_manifest_and_native_audio_fallback_on_fetch_failure"] = True
            local.click("#stop")
            assert local.evaluate("[...cards.values()].every(c => c.audio.paused)")
            local.close()
            assert not result["errors"], result["errors"]
            browser.close()
        result["pass"] = True
        (ROOT / "browser-check.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("PASS: 28 browser audio paths, two rendered 16-second loops, three viewport sizes, native audio fallback")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=1)


if __name__ == "__main__":
    main()
