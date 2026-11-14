#!/usr/bin/env python3
"""Audit real decoded audio, native loops, intensity controls and preview lifecycle.

Run after synthesis: python3 verify_browser.py
Requires Python Playwright and Chromium. Override executable with MUSIC_BROWSER.
Starts a temporary localhost server; writes browser-validation.json and small PNGs.
"""
from __future__ import annotations

import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


DECODE_AUDIT = r"""async () => {
  const {makeVoice} = await import('./player.mjs');
  const manifest = window.musicPreview.manifest;
  const decodeContext = new AudioContext({sampleRate: 32000});
  const results = [];
  const errors = [];
  const toDB = x => 20*Math.log10(Math.max(x, 1e-15));
  for (const track of manifest.tracks) {
    for (const [format, file] of Object.entries(track.files)) {
      const bytes = await (await fetch(file.path)).arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(x => x.toString(16).padStart(2, '0')).join('');
      if (hash !== file.sha256) errors.push(`${file.path}: checksum`);
      const buffer = await decodeContext.decodeAudioData(bytes);
      const record = {id: track.id, format, frames: buffer.length,
        sample_rate_hz: buffer.sampleRate, channels: buffer.numberOfChannels, loops: []};
      if (buffer.length !== track.frames || buffer.sampleRate !== 32000 || buffer.numberOfChannels !== 1)
        errors.push(`${file.path}: decoded layout`);
      if (track.kind === 'gameplay') {
        const regions = [{id: 'full', ...track.loop}, ...track.intensity_regions.map(r => ({...r, enabled:true}))];
        for (const region of regions) {
          const context = new OfflineAudioContext(1, 22400, 32000);
          makeVoice(context, buffer, context.destination, region, region.end_seconds-.35, 0);
          const render = await context.startRendering();
          const samples = render.getChannelData(0);
          const k = 11200;
          const step = Math.abs(samples[k]-samples[k-1]);
          let energyBefore=0, energyAfter=0;
          for (let i=0;i<1600;i++) {energyBefore+=samples[k-1600+i]**2; energyAfter+=samples[k+i]**2;}
          const before = toDB(Math.sqrt(energyBefore/1600)), after = toDB(Math.sqrt(energyAfter/1600));
          record.loops.push({id:region.id, seam_step_dbfs:toDB(step), before_dbfs:before, after_dbfs:after});
          if (toDB(step)>-35 || Math.min(before,after)<-45) errors.push(`${file.path}: native loop ${region.id}`);
        }
        // Render the same 20 ms linear crossfade used by the interactive player.
        const context = new OfflineAudioContext(1, 25600, 32000);
        const old = makeVoice(context, buffer, context.destination, regions[1], regions[1].end_seconds-.4, 0);
        old.gain.gain.setValueAtTime(1,.4);
        old.gain.gain.linearRampToValueAtTime(0,.42);
        old.source.stop(.421);
        makeVoice(context,buffer,context.destination,regions[3],regions[3].start_seconds,.4);
        const rendered=(await context.startRendering()).getChannelData(0);
        let maxStep=0, peak=0;
        for(let i=12700;i<13600;i++) {
          maxStep=Math.max(maxStep,Math.abs(rendered[i]-rendered[i-1]));
          peak=Math.max(peak,Math.abs(rendered[i]));
        }
        record.intensity_crossfade={peak_dbfs:toDB(peak),max_sample_step_dbfs:toDB(maxStep)};
        if (peak>=1) errors.push(`${file.path}: transition clipped`);
      } else {
        const context=new OfflineAudioContext(1,208000,32000);
        makeVoice(context,buffer,context.destination,{id:'full',...track.loop},0,0);
        const rendered=(await context.startRendering()).getChannelData(0);
        let tailPeak=0;
        for(let i=192000;i<rendered.length;i++) tailPeak=Math.max(tailPeak,Math.abs(rendered[i]));
        record.after_six_seconds_peak_dbfs=toDB(tailPeak);
        if(tailPeak>1e-7) errors.push(`${file.path}: victory repeated`);
      }
      results.push(record);
    }
  }
  await decodeContext.close();
  return {files: results, errors};
}"""


def main():
    evidence = dict(passed=False, browser="Chromium", errors=[], ui_checks=[], files=[])
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0),
        functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/listen.html"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=os.environ.get("MUSIC_BROWSER") or shutil.which("chromium"),
                headless=True, args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
            evidence["browser_version"] = browser.version
            page = browser.new_page(viewport=dict(width=390, height=844))
            page.set_default_timeout(15000)
            page.on("pageerror", lambda error: evidence["errors"].append(str(error)))
            page.on("request", lambda req: evidence["errors"].append("External request: "+req.url)
                    if req.url.startswith("http") and not req.url.startswith(f"http://127.0.0.1:{server.server_port}/") else None)
            page.goto(url)
            page.wait_for_function("window.musicPreview?.manifest?.tracks.length === 20")
            assert page.locator("article").count() == 10
            assert page.locator("a[download]").count() == 40
            evidence["ui_checks"].append("10 games, 20 tracks, 40 download links")
            for width, height in ((390, 844), (844, 390), (1280, 900)):
                page.set_viewport_size(dict(width=width, height=height))
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Horizontal overflow"
                evidence["ui_checks"].append(f"No horizontal overflow: {width}x{height}")
            page.set_viewport_size(dict(width=390, height=844))
            page.screenshot(path=str(ROOT/"preview-mobile.png"))
            page.set_viewport_size(dict(width=1280, height=900))
            page.screenshot(path=str(ROOT/"preview-desktop.png"))
            # Use every gameplay/victory button in the real UI, in both formats.
            ids = page.evaluate("musicPreview.manifest.tracks.filter(t=>t.kind==='gameplay').map(t=>t.game_id)")
            for fmt in ("ogg", "mp3"):
                page.select_option("#format", fmt)
                for game_id in ids:
                    for kind in ("gameplay", "victory"):
                        page.locator(f'article[data-game="{game_id}"] [data-action="{kind}"]').click()
                        page.wait_for_function("([id,kind,fmt])=>musicPreview.player.voice && musicPreview.player.track.game_id===id && musicPreview.player.track.kind===kind && musicPreview.player.actualFormat===fmt", arg=[game_id, kind, fmt])
                        assert page.evaluate("musicPreview.player.context.state") == "running"
                        page.click("#stop")
                evidence["ui_checks"].append(f"All 20 play buttons start and stop real {fmt.upper()} audio")
            page.locator('article[data-game="soccer"] [data-action="seam"]').click()
            page.wait_for_function("musicPreview.player.voice && musicPreview.player.startBar === 31")
            page.wait_for_function("musicPreview.player.position() < 1", timeout=6000)
            evidence["ui_checks"].append("End-to-start wrap plays through the real seam button")
            # Check beat-quantized transitions and rapid replacement of a pending switch.
            page.click('[data-level="low"]')
            page.wait_for_function("musicPreview.player.voice?.region.id === 'low'", timeout=6000)
            page.click('[data-level="high"]')
            page.click('[data-level="medium"]')
            page.wait_for_function("musicPreview.player.voice?.region.id === 'medium'", timeout=6000)
            page.click('[data-level="high"]')
            pending = page.evaluate("({at:musicPreview.player.pending.at,origin:musicPreview.player.origin,bar:musicPreview.player.track.duration_seconds/32})")
            alignment = (pending["at"]-pending["origin"])/pending["bar"]
            assert abs(alignment-round(alignment)) < 1e-6
            page.wait_for_function("musicPreview.player.voice?.region.id === 'high'", timeout=6000)
            page.click('[data-level="full"]')
            page.wait_for_function("musicPreview.player.voice?.region.id === 'full'", timeout=6000)
            page.locator("#volume").focus()
            page.keyboard.press("Home")
            assert page.evaluate("musicPreview.player.volume") == 0
            page.locator("#volume").evaluate("el=>{el.value=55;el.dispatchEvent(new Event('input',{bubbles:true}))}")
            evidence["ui_checks"].append("Low/medium/high/full: phase-preserving bar transitions, rapid replacement, volume")
            page.click("#stop")
            # Stop during a delayed fetch must not restart audio when the response arrives.
            page.evaluate("musicPreview.player.cache.clear()")
            def delayed(route):
                import time
                time.sleep(.25)
                route.continue_()
            page.route("**/soccer-gameplay.mp3", delayed)
            page.locator('article[data-game="soccer"] [data-action="gameplay"]').click()
            page.click("#stop")
            page.wait_for_timeout(500)
            assert not page.evaluate("Boolean(musicPreview.player.voice)")
            page.unroute("**/soccer-gameplay.mp3", delayed)
            evidence["ui_checks"].append("Stop during loading cancels playback")
            # Auto format falls back from a failed OGG request to a real MP3 decode.
            page.select_option("#format", "auto")
            page.route("**/*.ogg", lambda route: route.abort())
            page.evaluate("musicPreview.player.cache.clear()")
            page.locator('article[data-game="soccer"] [data-action="gameplay"]').click()
            page.wait_for_function("musicPreview.player.voice && musicPreview.player.actualFormat === 'mp3'")
            page.unroute("**/*.ogg")
            page.click("#stop")
            evidence["ui_checks"].append("Automatic OGG to MP3 fallback")
            # A six-second victory must actually end, leaving no active source.
            page.locator('article[data-game="soccer"] [data-action="victory"]').click()
            page.wait_for_function("musicPreview.player.voice !== null")
            page.wait_for_function("musicPreview.player.voice === null", timeout=8000)
            evidence["ui_checks"].append("Victory stops naturally after six seconds")
            print("UI checks passed; auditing all 40 decodes and 100 native loop seams…", flush=True)
            decoded = page.evaluate(DECODE_AUDIT)
            evidence["files"] = decoded["files"]
            evidence["errors"].extend(decoded["errors"])
            browser.close()
    except Exception as error:
        evidence["errors"].append(str(error))
    finally:
        server.shutdown()
        server.server_close()
    evidence["passed"] = not evidence["errors"]
    (ROOT/"browser-validation.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+"\n")
    if evidence["errors"]:
        raise SystemExit("\n".join(evidence["errors"]))
    print(f"PASS: {len(evidence['files'])} decoded files; {len(evidence['ui_checks'])} UI checks", flush=True)


if __name__ == "__main__":
    main()
