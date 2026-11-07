#!/usr/bin/env python3
"""Real Chromium decode, offline audio rendering, controls and responsive UI. CC0."""
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent


def set_range(page, selector, value):
    page.locator(selector).evaluate('(el, value) => {el.value = value; el.dispatchEvent(new Event("input", {bubbles: true}));}', str(value))


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    results = {'browser': 'Chromium', 'formats': {}, 'errors': []}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium',
                                       args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
            page = browser.new_page(viewport={'width': 1280, 'height': 1000})
            page.on('pageerror', lambda error: results['errors'].append(str(error)))
            page.goto(origin + '/preview.html')
            page.wait_for_function('window.audioPreview && document.querySelectorAll("[data-asset]").length === 16')
            for ext in ('ogg', 'mp3'):
                page.select_option('#format', ext)
                page.click('#start')
                page.wait_for_function('window.audioPreview.snapshot().running')
                snap = page.evaluate('audioPreview.snapshot()')
                assert snap['loaded'] == 16 and snap['loops'] == 7 and snap['state'] == 'running', snap
                data = page.evaluate('''async ext => {
                  const {engineIds, engineWeights, smooth, loopSource} = await import('./preview.mjs');
                  const manifest = await (await fetch('manifest.json')).json();
                  const decoder = new OfflineAudioContext(1, 44100, 44100);
                  const buffers = new Map(); const loops = [];
                  for (const a of manifest.assets) {
                    const b = await decoder.decodeAudioData(await (await fetch(a.files[ext].path)).arrayBuffer());
                    if (b.numberOfChannels !== 1 || b.sampleRate !== 44100) throw Error(a.id + ': format');
                    buffers.set(a.id, b);
                    if (!a.loop) continue;
                    const offline = new OfflineAudioContext(1, 9 * 44100, 44100);
                    const src = loopSource(offline, b, a, offline.destination);
                    src.start(0, a.loop.startSeconds);
                    const x = (await offline.startRendering()).getChannelData(0);
                    const jumps = [3, 6].map(t => Math.abs(x[t * 44100] - x[t * 44100 - 1]));
                    if (Math.max(...jumps) > .04) throw Error(a.id + ': rendered seam ' + jumps);
                    loops.push({id: a.id, decodedSamples: b.length, renderedSeamJumps: jumps});
                  }
                  const offline = new OfflineAudioContext(1, 10 * 44100, 44100);
                  const gains = engineIds.map((id, i) => {
                    const gain = offline.createGain(); gain.gain.value = i === 0 ? 1 : 0;
                    gain.connect(offline.destination);
                    const a = manifest.assets.find(a => a.id === id);
                    const src = loopSource(offline, buffers.get(id), a, gain);
                    src.start(0, a.loop.startSeconds); return {gain, src};
                  });
                  // Sweep through every adjacent pair in both directions, then
                  // abrupt endpoints and rapidly interrupted automation ramps.
                  const events = [];
                  for (let i = 0; i <= 70; i++) {
                    const at = .1 + i * .12;
                    const rpm = i <= 30 ? 4000 + i / 30 * 11000
                      : i <= 60 ? 15000 - (i - 30) / 30 * 11000 : i % 2 ? 15000 : 4000;
                    const weights = engineWeights(rpm);
                    if (Math.abs(weights.reduce((s, x) => s + x*x, 0) - 1) > 1e-8) throw Error('power weights');
                    gains.forEach(({gain, src}, n) => {
                      smooth(gain.gain, weights[n], at);
                      smooth(src.playbackRate, Math.max(.8, Math.min(1.25, rpm / manifest.assets[n].rpm)), at);
                    }); events.push(at);
                  }
                  const x = (await offline.startRendering()).getChannelData(0);
                  let peak = 0, maxStep = 0, minRms = Infinity, maxRms = 0;
                  for (let i = 1; i < x.length; i++) {peak = Math.max(peak, Math.abs(x[i])); maxStep = Math.max(maxStep, Math.abs(x[i]-x[i-1]));}
                  for (let i = 4410; i < x.length - 882; i += 882) {
                    let power = 0; for (let j = i; j < i + 882; j++) power += x[j] * x[j];
                    const rms = Math.sqrt(power / 882); minRms = Math.min(minRms, rms); maxRms = Math.max(maxRms, rms);
                  }
                  if (peak >= 1 || minRms < .025 || maxRms/minRms > 3) throw Error('crossfade dropout or clipping');
                  const eventJumps = events.map(t => { const i = Math.round(t*44100); return Math.abs(x[i]-x[i-1]); });
                  return {decodedFiles: buffers.size, loops, crossfade: {seconds: 10, automationEvents: events.length,
                    peak, min20msRms: minRms, max20msRms: maxRms, maxAdjacentStep: maxStep,
                    maxControlBoundaryStep: Math.max(...eventJumps)}};
                }''', ext)
                for rpm in [4000, 5000, 6000, 7500, 9000, 10500, 12000, 13500, 15000, 4000]:
                    set_range(page, '#rpm', rpm)
                    assert page.evaluate('audioPreview.snapshot().rpm') == rpm
                before = len(page.evaluate('audioPreview.snapshot().played'))
                for gear in list(range(2, 8)) + list(range(6, 0, -1)):
                    set_range(page, '#gear', gear)
                    page.wait_for_timeout(190)
                    assert page.evaluate('audioPreview.snapshot().gear') == gear
                shifts = page.evaluate('audioPreview.snapshot().played')[before:]
                assert shifts == ['shift-up'] * 6 + ['shift-down'] * 6, shifts
                if page.get_attribute('#wind', 'aria-pressed') == 'false':
                    page.click('#wind')
                if page.get_attribute('#tyre', 'aria-pressed') == 'false':
                    page.click('#tyre')
                set_range(page, '#speed', 320)
                assert page.get_attribute('#wind', 'aria-pressed') == 'true'
                page.wait_for_timeout(700)
                page.click('#stop')
                for button in page.locator('[data-asset]').all():
                    asset_id = button.get_attribute('data-asset')
                    button.click()
                    page.wait_for_function('(id) => audioPreview.snapshot().played.at(-1) === id', arg=asset_id)
                    page.click('#stop')
                data['gearShifts'] = len(shifts)
                data['auditionButtons'] = 16
                results['formats'][ext] = data
                page.click('#resetFormat')
            page.set_viewport_size({'width': 390, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow'
            page.screenshot(path='/tmp/racing-audio-preview-mobile.png', full_page=True)
            page.set_viewport_size({'width': 1280, 'height': 1000})
            page.screenshot(path='/tmp/racing-audio-preview.png', full_page=True)
            results['responsiveWidths'] = [390, 1280]
            assert not results['errors'], results['errors']
            browser.close()
    finally:
        server.shutdown(); server.server_close()
    results['status'] = 'PASS'
    (ROOT / 'browser-checks.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
