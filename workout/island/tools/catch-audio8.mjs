// "תפוס את הפושע" v8 sounds against v7 in a real browser: tools/catch-audio-probe8.html twice (?v=7: the game as v23 plays it, the Codex pack
// and SIREN7; ?v=8: the v8 flags, catch-audio8.mjs). Prints per sound the RMS (peak / mean, before the limiter), the change in dB, the energy
// share in 2-5 kHz and the strongest line there; writes everything as JSON when a path is given.
//   node workout/island/tools/catch-audio8.mjs [out.json]
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = process.argv[2] || '';
const types = {'.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg'};
// a plain static server for the island folder (the probe is a tool page: no island CSP, as with tools/catch-siren7.mjs and a python server)
const server = createServer(async (req, res) => {
  try { const p = path.resolve(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '')); if (!p.startsWith(root)) throw 0; res.writeHead(200, {'content-type': types[path.extname(p)] || 'application/octet-stream'}); res.end(await readFile(p)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const {chromium} = await import(process.env.ISLAND_PLAYWRIGHT ? pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href : '/opt/node-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
const runs = {};
for (const v of ['7', '8', '8s']) {
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}tools/catch-audio-probe8.html?v=${v}`); await page.waitForFunction('window.done===true', null, {timeout: 300000});
  runs['v' + v] = {report: await page.evaluate(() => window.report), errors}; await page.close();
}
await browser.close(); server.close();
const c = v => runs[v].report.cues, db = (a, b) => +(20 * Math.log10(a / b)).toFixed(1);
const rows = Object.keys(c('v7')).map(k => ({cue: k, v7: c('v7')[k], v8: c('v8')[k], dbMean: db(c('v8')[k].mean, c('v7')[k].mean), dbPeak: db(c('v8')[k].peak, c('v7')[k].peak), dbPhone: db(c('v8')[k].phoneMean, c('v7')[k].phoneMean)}));
console.log('sound                    v7 peak/mean   v8 peak/mean   dB mean  dB >250Hz  2-5kHz% v7/v8   line in 1.5-5k v7/v8 (dB proud @ Hz)');
for (const r of rows) console.log(r.cue.padEnd(24), `${r.v7.peak.toFixed(3)}/${r.v7.mean.toFixed(3)}`.padStart(13), `${r.v8.peak.toFixed(3)}/${r.v8.mean.toFixed(3)}`.padStart(14), String(r.dbMean).padStart(7), String(r.dbPhone).padStart(9), `${r.v7.band['2000-5000']}/${r.v8.band['2000-5000']}`.padStart(14), `  ${r.v7.linePromMax}@${r.v7.linePromHz} / ${r.v8.linePromMax}@${r.v8.linePromHz}`);
const summary = {
  sirenDb: db(c('v8').siren.mean, c('v7').siren.mean), sirenNearDb: db(c('v8')['siren-near'].mean, c('v7')['siren-near'].mean), sirenCrewDb: db(c('v8')['siren-crew'].mean, c('v7')['siren-crew'].mean),
  sirenOverEngine: {v7: db(c('v7').siren.mean, c('v7')['engine-cruise'].mean), v8: db(c('v8').siren.mean, c('v8')['engine-cruise'].mean)},
  sirenOverEnginePhone: {v7: db(c('v7').siren.phoneMean, c('v7')['engine-cruise'].phoneMean), v8: db(c('v8').siren.phoneMean, c('v8')['engine-cruise'].phoneMean)},
  burstOverSiren: {v7: db(c('v7').shot.peak, c('v7').siren.peak), v8: db(c('v8').shot.peak, c('v8').siren.peak)},
  engine25: {v7: c('v7')['engine-boost'].band['2000-5000'], v8: c('v8')['engine-boost'].band['2000-5000']}, engineLine: {v7: c('v7')['engine-boost'].linePromMax, v8: c('v8')['engine-boost'].linePromMax},
  // the v8 synthesis alone (?catchSound8=synth, and the stand-in until the pack decodes): the same figures for the engine and the opening
  synth: Object.fromEntries(['opening', 'opening-first2s', 'engine-cruise', 'engine-boost', 'engine-slow'].map(k => [k, {v8s: c('v8s')[k], dbVsV7: db(c('v8s')[k].mean, c('v7')[k].mean), dbVsPack: db(c('v8s')[k].mean, c('v8')[k].mean)}])),
  sirenOverEngineSynth: {all: db(c('v8s').siren.mean, c('v8s')['engine-cruise'].mean), phone: db(c('v8s').siren.phoneMean, c('v8s')['engine-cruise'].phoneMean)},
  status: {v7: runs.v7.report.status, v8: runs.v8.report.status, v8s: runs.v8s.report.status}, errors: {v7: runs.v7.errors, v8: runs.v8.errors, v8s: runs.v8s.errors},
};
console.log(JSON.stringify(summary));
if (out) await writeFile(out, JSON.stringify({summary, rows}, null, 1) + '\n');
