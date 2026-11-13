// The siren before and after v7 in a real browser: tools/catch-audio-probe.html twice (v6 level, then ?siren=v7), RMS of each cue
// tapped before the limiter, and the change in dB for the siren against the engine and the other cues.
//   node workout/island/tools/catch-siren7.mjs [baseUrl=http://127.0.0.1:8765/workout/island/] [out.json]
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const [,, base = 'http://127.0.0.1:8765/workout/island/', out = ''] = process.argv;
const {chromium} = await import(process.env.ISLAND_PLAYWRIGHT ? pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href : '/opt/node-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--no-proxy-server']});
const runs = {};
for (const v of ['v6', 'v7']) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}tools/catch-audio-probe.html?auto=1${v === 'v7' ? '&siren=v7' : ''}`);
  await page.waitForFunction('window.done===true', null, {timeout: 300000});
  runs[v] = {report: await page.evaluate(() => window.report), errors}; await page.close();
}
await browser.close();
const db = (a, b) => +(20 * Math.log10(a / b)).toFixed(1), c = v => runs[v].report.cues;
const siren = v => Math.max(c(v)['siren-loop-0'].mean, c(v)['siren-loop-1'].mean, c(v)['siren-loop-2'].mean);
const rows = ['siren-first-call', 'siren-loop-1', 'siren-far', 'siren-crew', 'engine-20', 'engine-31-boost', 'engine+siren', 'shot', 'shotHit', 'catch'].map(k => ({cue: k, v6: c('v6')[k], v7: c('v7')[k], dbPeak: db(c('v7')[k].peak, c('v6')[k].peak), dbMean: db(c('v7')[k].mean, c('v6')[k].mean)}));
const summary = {sirenMeanV6: siren('v6'), sirenMeanV7: siren('v7'), sirenChangeDb: db(siren('v7'), siren('v6')), sirenOverEngineDbV6: db(siren('v6'), c('v6')['engine-20'].mean), sirenOverEngineDbV7: db(siren('v7'), c('v7')['engine-20'].mean),
  live: {v6: runs.v6.report.status.sirenLoop, v7: runs.v7.report.status.sirenLoop}, errors: {v6: runs.v6.errors, v7: runs.v7.errors}};
console.log('cue                   v6 peak/mean      v7 peak/mean      dB peak  dB mean');
for (const r of rows) console.log(r.cue.padEnd(20), `${r.v6.peak.toFixed(3)}/${r.v6.mean.toFixed(3)}`.padStart(14), `${r.v7.peak.toFixed(3)}/${r.v7.mean.toFixed(3)}`.padStart(16), String(r.dbPeak).padStart(8), String(r.dbMean).padStart(8));
console.log(JSON.stringify(summary));
if (out) await writeFile(out, JSON.stringify({summary, rows, runs}, null, 1));
