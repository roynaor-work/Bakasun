// The siren before and after v7 in a real browser: tools/catch-audio-probe.html three times — v6 (the v6 siren loop at the v6 level),
// v7s (?siren=v7: the same loop at SIREN7 .55, the v7 level without the Codex sound pack, ?catchAssets=0) and v7 (?pack=v7: the Codex
// pack, PACK7 in catch-audio.mjs, as the game plays by default) — RMS of each cue tapped before the limiter, the change in dB against
// v6 for the sirens, against the engine, and for the cues the pack replaces.
//   node workout/island/tools/catch-siren7.mjs [baseUrl=http://127.0.0.1:8765/workout/island/] [out.json]
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const [,, base = 'http://127.0.0.1:8765/workout/island/', out = ''] = process.argv;
const {chromium} = await import(process.env.ISLAND_PLAYWRIGHT ? pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href : '/opt/node-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--no-proxy-server']});
const VERSIONS = {v6: '', v7s: '&siren=v7', v7: '&pack=v7'}, runs = {};
for (const [v, q] of Object.entries(VERSIONS)) {
  const page = await browser.newPage(), errors = [], failed = []; page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', r => failed.push(r.url()));
  await page.goto(`${base}tools/catch-audio-probe.html?auto=1${q}`);
  await page.waitForFunction('window.done===true', null, {timeout: 300000});
  runs[v] = {report: await page.evaluate(() => window.report), errors, failed}; await page.close();
}
await browser.close();
const db = (a, b) => +(20 * Math.log10(a / b)).toFixed(1), c = v => runs[v].report.cues, pct = d => Math.round((1 - 10 ** (d / 20)) * 100);
const siren = v => Math.max(c(v)['siren-loop-0'].mean, c(v)['siren-loop-1'].mean, c(v)['siren-loop-2'].mean);
const KEYS = ['siren-first-call', 'siren-loop-1', 'siren-near', 'siren-far', 'siren-crew', 'engine-20', 'engine-31-boost', 'engine+siren', 'shot', 'shotHit', 'flat', 'spikes', 'sticky', 'nitroPickup', 'barrier', 'brake', 'skid', 'catch'];
const rows = KEYS.filter(k => c('v6')[k]).map(k => ({cue: k, v6: c('v6')[k], v7s: c('v7s')[k], v7: c('v7')[k], v7sDbMean: db(c('v7s')[k].mean, c('v6')[k].mean), v7DbMean: db(c('v7')[k].mean, c('v6')[k].mean), v7DbPeak: db(c('v7')[k].peak, c('v6')[k].peak)}));
const summary = {
  sirenMean: {v6: siren('v6'), v7s: siren('v7s'), v7: siren('v7')},
  sirenChangeDb: {v7s: db(siren('v7s'), siren('v6')), v7: db(siren('v7'), siren('v6'))},
  sirenChangePct: {v7s: pct(db(siren('v7s'), siren('v6'))), v7: pct(db(siren('v7'), siren('v6')))},
  nearChangeDb: db(c('v7')['siren-near'].mean, c('v6')['siren-near'].mean), crewChangeDb: db(c('v7')['siren-crew'].mean, c('v6')['siren-crew'].mean),
  sirenOverEngineDb: {v6: db(siren('v6'), c('v6')['engine-20'].mean), v7s: db(siren('v7s'), c('v7s')['engine-20'].mean), v7: db(siren('v7'), c('v7')['engine-20'].mean)},
  live: {v6: runs.v6.report.status.sirenLoop, v7s: runs.v7s.report.status.sirenLoop, v7: runs.v7.report.status.sirenLoop, v7near: runs.v7.report.status.sirenNear},
  errors: Object.fromEntries(Object.entries(runs).map(([v, r]) => [v, r.errors])), failed: Object.fromEntries(Object.entries(runs).map(([v, r]) => [v, r.failed])),
};
console.log('cue                   v6 peak/mean      v7s peak/mean     v7 peak/mean    v7s dB  v7 dB mean/peak');
for (const r of rows) console.log(r.cue.padEnd(20), `${r.v6.peak.toFixed(3)}/${r.v6.mean.toFixed(3)}`.padStart(14), `${r.v7s.peak.toFixed(3)}/${r.v7s.mean.toFixed(3)}`.padStart(16), `${r.v7.peak.toFixed(3)}/${r.v7.mean.toFixed(3)}`.padStart(16), String(r.v7sDbMean).padStart(7), `${r.v7DbMean}/${r.v7DbPeak}`.padStart(12));
console.log(JSON.stringify(summary));
if (out) await writeFile(out, JSON.stringify({summary, rows, runs}, null, 1));
