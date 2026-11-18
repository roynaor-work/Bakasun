// Runs tools/catch-audio-probe.html in Chromium twice and writes the numbers next to this file:
//   probe-autoplay.json  autoplay allowed (the harness path)
//   probe-gesture.json   autoplay blocked: the context starts suspended and the first tap must unlock it (the phone path)
// Usage: node workout/island/verification/catch-deep-fable/audio/probe-run.mjs   (static server on http://127.0.0.1:8765/)
import {chromium} from '/opt/node-tools/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const here = new URL('./', import.meta.url);
const BASE = 'http://127.0.0.1:8765/workout/island/tools/catch-audio-probe.html';
async function run(name, policy, auto) {
  const browser = await chromium.launch({args: ['--no-sandbox', '--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=' + policy]});
  const page = await browser.newPage({viewport: {width: 844, height: 390}, hasTouch: true});
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + (auto ? '?auto=1' : ''));
  let before = null;
  if (!auto) { await page.waitForTimeout(600); before = await page.evaluate(() => window.audio.status()); await page.tap('#run'); }
  await page.waitForFunction(() => window.done, null, {timeout: 90000});
  const report = await page.evaluate(() => window.report);
  report.before = before; report.errors = errors; report.policy = policy;
  await writeFile(new URL(name + '.json', here), JSON.stringify(report, null, 1));
  await browser.close(); return report;
}
const a = await run('probe-autoplay', 'no-user-gesture-required', true);
const g = await run('probe-gesture', 'user-gesture-required', false);
const row = (n, r) => `${n.padEnd(22)} ${String(r.cues[n]?.peak ?? '-').padEnd(8)} ${String(r.cues[n]?.mean ?? '-')}`;
console.log('autoplay: state', a.status.afterGesture.state, 'decoded', JSON.stringify(a.status.decoded.sirenDecoded), 'sirenLive', a.status.sirenLoop.sirenLive, a.status.sirenLoop.sirenBuffer, 'afterHold', a.status.sirenAfterHold.sirenLive, 'errors', a.errors);
console.log('gesture : before', JSON.stringify(g.before), '→ after', g.status.afterGesture.state, 'sirenLive', g.status.sirenLoop.sirenLive, g.status.sirenLoop.sirenBuffer, 'errors', g.errors);
console.log('cue                    peak     mean   (autoplay run)');
for (const n of Object.keys(a.cues)) console.log(row(n, a));
