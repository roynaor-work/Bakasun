/** Capture actual supported transitions from an immutable packaged local viewer. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const sharp = require('sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.resolve(process.env.MOTION_RECOVERY_CAPTURE_DIR || path.join(root, 'source/motion-supported-recovery-review'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await fs.readFile(path.join(root, 'asset-manifest.json'));
const manifest = JSON.parse(manifestBytes);
const modelPaths = [...new Set(manifest.characters.flatMap(c => (c.kits || [c]).flatMap(k => [k.lod0, k.lod1])))];
const files = ['preview.html', 'preview.css', 'vendor/viewer-runtime.js', 'vendor/data.js', ...modelPaths.map(p => 'offline/' + path.basename(p, '.glb') + '.js')];
const results = await Promise.allSettled(files.map(async file => [file, await fs.readFile(path.join(root, file))]));
const resources = new Map();
for (let i = 0; i < results.length; i++) {
  const result = results[i];
  if (result.status !== 'fulfilled') throw Error('Cannot freeze ' + files[i] + ': ' + result.reason);
  resources.set(...result.value);
}
await fs.mkdir(destination, {recursive: true});
const inputs = Object.fromEntries([...resources].map(([file, bytes]) => [file, {bytes: bytes.length, sha256: hash(bytes)}]));
const server = http.createServer((request, response) => {
  const relative = new URL(request.url, 'http://localhost').pathname.slice(1);
  const bytes = resources.get(relative);
  if (!bytes) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, {'Content-Type': relative.endsWith('.html') ? 'text/html' : relative.endsWith('.css') ? 'text/css' : 'text/javascript'});
  response.end(bytes);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']});
const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 1.5});
const errors = [], remoteRequests = [], captures = [];
page.on('pageerror', error => errors.push(String(error)));
await page.route(/^https?:/, route => {
  if (route.request().url().startsWith(origin + '/')) return route.continue();
  remoteRequests.push(route.request().url()); return route.abort();
});
await page.addInitScript(() => { requestAnimationFrame = () => 0; cancelAnimationFrame = () => {}; });
const cases = [
  {id: 'keeper-left', character: 'goalkeeper', start: 'keeper_dive_left', phase: .75, requests: [{time: .1, id: 'keeper_catch'}, {time: .45, id: 'keeper_throw'}], shots: [.6, 1.05, 1.6, 2.0, 2.8, 3.6]},
  {id: 'keeper-right', character: 'goalkeeper', start: 'keeper_dive_right', phase: .75, requests: [{time: .1, id: 'keeper_catch'}, {time: .45, id: 'keeper_throw'}], shots: [.6, 1.05, 1.6, 2.0, 2.8, 3.6]},
  {id: 'fall-kick', character: 'player-01', start: 'fall', phase: .7, requests: [{time: .1, id: 'kick'}], shots: [.35, .8, 1.35, 1.75, 2.3, 2.9]},
  {id: 'seated-run', character: 'player-01', start: 'slide_tackle', phase: .85, requests: [{time: .1, id: 'run_2'}], shots: [.25, .65, 1.1, 1.55, 2.1, 2.7]},
];
try {
  await page.goto(origin + '/preview.html?paused&clean', {waitUntil: 'domcontentloaded', timeout: 60000});
  await page.waitForFunction(() => globalThis.soccerV7?.ready, {timeout: 60000});
  await page.evaluate(() => soccerV7.ready);
  const declaredHashes = await page.evaluate(() => soccerV7.inspect().data.hashes);
  if (declaredHashes.manifest !== hash(manifestBytes)) throw Error('Packaged manifest does not match the frozen authoring manifest');
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({width, height});
    for (const scenario of cases) {
      await page.evaluate(async scenario => {
        const api = soccerV7; api.setPlaying(false); await api.setView('body'); await api.setLOD(0); await api.setCharacter(scenario.character);
        api.setClip(scenario.start); api.seek(scenario.phase); api.setPlaying(true);
        const renderer = api.inspect().renderer; window.__recoveryCaptureRender = renderer.render; renderer.render = () => {};
      }, scenario);
      let elapsed = 0, commandIndex = 0;
      for (const seconds of scenario.shots) {
        while (elapsed < seconds - 1e-9) {
          const nextCommand = scenario.requests[commandIndex];
          const stop = Math.min(seconds, nextCommand?.time ?? seconds);
          if (elapsed < stop - 1e-9) {
            const dt = Math.min(1 / 30, stop - elapsed); await page.evaluate(dt => soccerV7.step(dt), dt); elapsed += dt;
          }
          if (nextCommand && elapsed >= nextCommand.time - 1e-9) { await page.evaluate(id => soccerV7.setClip(id), nextCommand.id); commandIndex++; }
        }
        const pose = await page.evaluate(() => {
          const api = soccerV7, a = api.inspect().actors[0];
          const {events, requests, ...recovery} = a.recoveryDescriptor();
          return {characterID: a.identity, modelPath: a.path, recovery, minimumY: a.minimumYReference(), worldPosition: a.world.toArray(), modelPosition: a.model.position.toArray(), rigidBootMinimumY: Object.fromEntries(['LeftFoot', 'RightFoot'].map(name => [name, a.rigidBootMinimumY(name)]))};
        });
        for (const [angle, yaw] of [['front', .16], ['side', 1.35]]) {
          const file = `${scenario.id}-${seconds.toFixed(2)}-${width}x${height}-${angle}.webp`;
          await page.evaluate(yaw => { const api = soccerV7, renderer = api.inspect().renderer; renderer.render = window.__recoveryCaptureRender; api.setOrbit(yaw, 0, .98); }, yaw);
          const png = await page.screenshot({type: 'png', scale: 'css'});
          const bytes = await sharp(png).webp({quality: 90}).toBuffer(); await fs.writeFile(path.join(destination, file), bytes);
          await page.evaluate(() => { soccerV7.inspect().renderer.render = () => {}; });
          captures.push({file, viewport: {width, height}, angle, case: scenario.id, elapsedSeconds: seconds, bytes: bytes.length, sha256: hash(bytes), ...pose});
        }
      }
      await page.evaluate(() => { const api = soccerV7; api.setPlaying(false); api.inspect().renderer.render = window.__recoveryCaptureRender; });
      process.stdout.write(JSON.stringify({case: scenario.id, width, height, captures: captures.length}) + '\n');
    }
  }
  for (const [file, bytes] of resources) if (hash(await fs.readFile(path.join(root, file))) !== hash(bytes)) throw Error('Input changed during capture: ' + file);
  const report = {kind: 'actual-supported-recovery-phone-capture', manifestSha256: hash(manifestBytes), inputs, declaredHashes, captures, errors, remoteRequests, complete: captures.length === 96, pass: captures.length === 96 && errors.length === 0 && remoteRequests.length === 0, limits: ['Deterministic rendered transition evidence, not a physical phone performance benchmark.', 'The independent numeric observer supplies velocity, contact, continuity and fulfillment verification.']};
  await fs.writeFile(path.join(destination, 'capture.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({destination, captures: captures.length, pass: report.pass}) + '\n');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
