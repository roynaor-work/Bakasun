/* Camera workout v1 in a real Chromium at 390x844 with Chromium's fake camera.
   Runs with ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chromium>, like the other browser suites.
   1. The real pose model (vendored WASM, CPU) loads under the page policy and answers frames of the fake camera;
      the fake picture holds no person, so the page must say where to stand, in text and through the device voice.
   2. A scripted skeleton replaces the pose worker: off to the side, feet cut, then two squats in the middle.
   3. The flag: opt-in. No entry link by default, the settings link stays, ?cameraV1=1 shows the entry link, ?cameraV1=0 hides all.
   Nothing here measures accuracy on a real child. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { recording } from '../workout/island/design/workout-camera-exercises-v1/fixtures/geometry.mjs';
import { strengthClips } from '../workout/island/design/workout-camera-exercises-v1/fixtures/strength.mjs';
import { GUIDE_COPY } from '../workout/js/camera-v1/guide.mjs';

const enabled = process.env.ISLAND_CSP_BROWSER === '1' && !!process.env.ISLAND_PLAYWRIGHT;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.CAMERA_V1_SHOTS || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

function serve(sizes) {
  return new Promise(res => {
    const srv = http.createServer((q, s) => {
      let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
      const b = fs.readFileSync(f); sizes.set(u, b.length);
      s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); s.end(b);
    }).listen(0, '127.0.0.1', () => res({ srv, base: `http://127.0.0.1:${srv.address().port}/workout/` }));
  });
}

// Runs in the page before its scripts: counts camera requests, keeps track handles, records what the device voice is
// asked to read (a stand-in Hebrew device voice), and fails loudly on anything that records, stores or sends.
const AUDIT = () => {
  if (!navigator.mediaDevices) return; // the blank page before navigation
  const audit = window.audit = { asks: [], tracks: [], said: [], forbidden: [], csp: [], poses: 0, firstPose: 0, ready: 0, start: 0 };
  addEventListener('securitypolicyviolation', e => audit.csp.push(e.violatedDirective + ' ' + e.blockedURI));
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async options => {
    audit.asks.push({ audio: !!options.audio, video: !!options.video, gesture: navigator.userActivation?.isActive === true });
    audit.start = performance.now();
    const stream = await real(options); audit.tracks.push(...stream.getTracks()); return stream;
  };
  const Base = window.Worker;
  window.Worker = class extends Base {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', ({ data }) => {
        if (data?.type === 'ready') audit.ready = performance.now();
        if (data?.type === 'pose') { audit.poses++; audit.firstPose ||= performance.now(); audit.lastPose = performance.now(); }
      });
    }
  };
  const forbid = name => function () { audit.forbidden.push(name); throw new Error(name + ' is not allowed here'); };
  for (const name of ['MediaRecorder', 'SpeechRecognition', 'webkitSpeechRecognition', 'WebSocket', 'XMLHttpRequest']) Object.defineProperty(window, name, { value: forbid(name), configurable: true });
  navigator.sendBeacon = forbid('sendBeacon');
  try { navigator.serviceWorker.register = forbid('serviceWorker.register'); } catch { /* */ }
  indexedDB.open = forbid('indexedDB.open');
  for (const method of ['setItem', 'removeItem', 'clear']) Storage.prototype[method] = forbid('Storage.' + method);
  HTMLCanvasElement.prototype.toDataURL = forbid('toDataURL'); HTMLCanvasElement.prototype.toBlob = forbid('toBlob');
  const voice = { name: 'Device Hebrew', lang: 'he-IL', localService: true, default: true, voiceURI: 'device-he' };
  const synth = { getVoices: () => [voice], speak: u => { audit.said.push(u.text); setTimeout(() => u.onend?.(), 30); }, cancel() {}, addEventListener() {}, pending: false, speaking: false };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
};

const hasMarks = text => /[ְ-ּ]/.test(text);
const strip = text => text.replace(/[֑-ׇ]/g, '');

async function open(browser, base, sizes) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'he-IL', deviceScaleFactor: 2 });
  await context.addInitScript(AUDIT);
  const log = { errors: [], outside: [] };
  context.on('page', p => { p.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); }); p.on('pageerror', e => log.errors.push('pageerror ' + e.message)); });
  await context.route(/^(?:https?|wss?):\/\/(?!127\.0\.0\.1)/, r => { log.outside.push(r.request().url()); return r.abort(); });
  return { context, page: await context.newPage(), log };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
async function clean(page, log) {
  const audit = await page.evaluate(() => ({ forbidden: audit.forbidden, csp: audit.csp, asks: audit.asks }));
  assert.deepEqual(audit.forbidden, [], 'nothing recorded, stored or sent');
  assert.deepEqual(audit.csp, [], 'no policy violation');
  assert.deepEqual(log.outside, [], 'no request leaves this device');
  // Optional voice recordings that are not installed answer 404, and the pose runtime logs one start-up notice.
  assert.deepEqual(log.errors.filter(e => !/404|^INFO: Created TensorFlow Lite/.test(e)), []);
  return audit;
}

test('camera v1: real on-device model with the fake camera, guidance when nobody is seen, teardown', { skip: !enabled, timeout: 240000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href);
  const sizes = new Map();
  const { srv, base } = await serve(sizes);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const { context, page, log } = await open(browser, base, sizes);
    await page.goto(base + 'camera-v1/?ex=squats');
    await page.locator('#camera-start').waitFor();
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => audit.asks.length), 0, 'no camera request before a tap');
    assert.equal(await page.locator('#exercise option').count(), 50);
    await shot(page, '1-setup');
    await page.locator('#camera-start').tap();
    await page.waitForFunction(() => audit.poses >= 5, null, { timeout: 120000 });
    const none = GUIDE_COPY.LINES.none;
    await page.waitForFunction(text => document.getElementById('status').textContent.includes(text), none.text, { timeout: 20000 });
    await page.waitForFunction(() => audit.said.length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(5000);
    const m = await page.evaluate(() => ({ ...audit, tracks: audit.tracks.map(t => t.kind + ':' + t.readyState), now: performance.now(),
      video: [document.getElementById('camera').videoWidth, document.getElementById('camera').videoHeight],
      wide: document.documentElement.scrollWidth, status: document.getElementById('status').textContent }));
    assert.deepEqual(m.asks, [{ audio: false, video: true, gesture: true }], 'one request, video only, on the tap');
    assert.deepEqual(m.tracks, ['video:live']);
    assert.ok(m.said.some(line => strip(line).includes(strip(none.say)) && hasMarks(line)), 'the vowel-marked line was read: ' + m.said.join(' | '));
    assert.ok(m.said.every(line => !/!/.test(line)));
    assert.ok(m.wide <= 390, 'no sideways scroll at 390');
    await shot(page, '2-nobody-seen');
    const fps = (m.poses - 1) / ((m.lastPose - m.firstPose) / 1000);
    console.log(`[camera-v1] model ready ${Math.round(m.ready - m.start)} ms after the tap, ${fps.toFixed(1)} pose answers per second (container CPU, lite model), video ${m.video.join('x')}`);
    const wasm = [...sizes.keys()].filter(u => /\.wasm$|\.task$|vision_bundle/.test(u));
    assert.ok(wasm.some(u => u.endsWith('.wasm')) && wasm.some(u => u.endsWith('.task')), 'the vendored runtime and model were served from this origin');
    const added = [...sizes].filter(([u]) => /camera-v1\//.test(u));
    console.log(`[camera-v1] new files loaded by the page: ${added.length}, ${added.reduce((n, [, b]) => n + b, 0)} bytes; runtime and model (already in the repo): ${wasm.map(u => path.basename(u) + ' ' + sizes.get(u)).join(', ')}`);
    await page.locator('#switch-trust').tap();
    await page.waitForFunction(() => audit.tracks.every(t => t.readyState === 'ended'));
    assert.equal(await page.locator('#camera-preview').isHidden(), true);
    await clean(page, log);
    await context.close();
  } finally { await browser.close(); srv.close(); }
});

test('camera v1: scripted skeleton. Off to the side, feet cut, then two squats counted', { skip: !enabled, timeout: 180000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href);
  const sizes = new Map();
  const { srv, base } = await serve(sizes);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const spec = strengthClips.find(clip => clip.id === 'squats');
    const squats = [...recording(spec, { step: 100 })].map(({ poses, light, aspect }) => ({ poses, light, aspect }));
    const moved = (dx, dy) => ({ ...squats[0], poses: squats[0].poses.map(pose => ({ ...pose, landmarks: pose.landmarks.map(p => {
      const x = p.x + dx, y = p.y + dy, out = x < 0 || x > 1 || y < 0 || y > 1;
      return { ...p, x, y, visibility: out ? .03 : p.visibility, presence: out ? .03 : p.presence };
    }) })) });
    const script = [...Array(45).fill(moved(-.41, 0)), ...Array(45).fill(moved(0, .24)), ...squats];
    const worker = `const frames = ${JSON.stringify(script)}; let index = 0;
      self.onmessage = ({ data }) => {
        if (data.type === 'init') self.postMessage({ type: 'ready' });
        else if (data.type === 'frame') { data.bitmap.close(); const frame = frames[Math.min(index, frames.length - 1)];
          self.postMessage({ ...frame, type: 'pose', time: index++ * 100, index }); }
      };`;
    const { context, page, log } = await open(browser, base, sizes);
    await context.route('**/workout/js/camera-v1/pose-worker.js', r => r.fulfill({ contentType: 'text/javascript', body: worker }));
    await page.goto(base + 'camera-v1/?ex=squats');
    await page.locator('#camera-start').tap();
    const { MOVES, PARTS, LINES } = GUIDE_COPY;
    await page.waitForFunction(text => document.getElementById('status').textContent.includes(text), MOVES.left.text, { timeout: 30000 });
    assert.equal(await page.locator('#camera-preview').getAttribute('data-move'), 'left');
    assert.equal(await page.locator('.move').isVisible(), true);
    await shot(page, '3-move-left');
    await page.waitForFunction(text => document.getElementById('status').textContent.includes(text), PARTS.feet.text, { timeout: 30000 });
    assert.match(await page.locator('#status').textContent(), new RegExp(MOVES.back.text));
    assert.equal(await page.locator('#camera-preview').getAttribute('data-move'), 'back');
    assert.equal(await page.locator('#camera-preview').getAttribute('data-parts'), 'feet');
    assert.equal(await page.locator('#camera-preview').getAttribute('data-seen'), 'no');
    assert.equal(await page.locator('.body-map').isVisible(), true);
    assert.match(await page.locator('#big-status').textContent(), new RegExp(PARTS.feet.text));
    await shot(page, '4-feet-not-seen');
    await page.waitForFunction(() => document.getElementById('progress').textContent === '2', null, { timeout: 60000 });
    assert.equal(await page.locator('#camera-preview').getAttribute('data-move'), null);
    assert.equal(await page.locator('#camera-preview').getAttribute('data-parts'), null);
    assert.equal(await page.locator('#camera-preview').getAttribute('data-seen'), 'yes');
    assert.equal(await page.locator('#big-count').textContent(), '2');
    await shot(page, '5-two-squats');
    const said = (await page.evaluate(() => audit.said)).map(strip);
    const order = [MOVES.left.say, PARTS.feet.say, LINES.ok.say].map(line => said.findIndex(text => text.includes(strip(line))));
    assert.ok(order.every(i => i >= 0) && order[0] < order[1] && order[1] < order[2], 'left, then feet, then the confirmation: ' + said.join(' | '));
    assert.ok(said.length <= 8, 'the voice does not nag: ' + said.length);
    assert.ok(said.some(text => text === 'אחת') && said.some(text => /^שתיים|^שתים/.test(text)), 'each repetition is counted aloud: ' + said.join(' | '));
    await page.locator('#finish').tap();
    await page.waitForFunction(() => audit.tracks.every(t => t.readyState === 'ended'));
    assert.match(await page.locator('#summary').textContent(), /2 חזרות לפי תנועה שנראתה/);
    await shot(page, '6-summary');
    await clean(page, log);
    await context.close();
  } finally { await browser.close(); srv.close(); }
});

test('camera v1: the flag is opt-in. No entry link by default, ?cameraV1=1 shows it, ?cameraV1=0 hides everything', { skip: !enabled, timeout: 120000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href);
  const sizes = new Map();
  const { srv, base } = await serve(sizes);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'he-IL' });
    await context.route(/^(?:https?|wss?):\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page = await context.newPage();
    await page.goto(base + '#/exercise/squats');
    await page.locator('#solo').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#camera-v1-link').count(), 0, 'no entry link without the opt-in');
    await page.goto(base + '?cameraV1=1#/exercise/squats');
    const link = page.locator('#camera-v1-link');
    await link.waitFor({ timeout: 30000 });
    assert.equal(await link.getAttribute('href'), 'camera-v1/?ex=squats');
    if (SHOTS) { await link.scrollIntoViewIfNeeded(); await shot(page, '7-app-link'); }
    sizes.clear();
    await page.goto(base + '?cameraV1=0#/exercise/squats');
    await page.locator('#solo').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#camera-v1-link').count(), 0);
    assert.ok(![...sizes.keys()].some(u => /camera-v1\/(?!flag)/.test(u)), 'with the flag off the app loads nothing of v1 beyond the flag reader');
    await page.goto(base + 'camera-v1/?cameraV1=0');
    await page.waitForURL(url => url.pathname === '/workout/' && url.search === '?cameraV1=0');
    await page.goto(base + 'camera-v1/?ex=squats');
    await page.locator('#camera-start').waitFor();
    assert.equal(await page.locator('#exercise').inputValue(), 'squats');
    await page.locator('header a').tap();
    await page.waitForURL(url => url.pathname === '/workout/');
    await context.close();
  } finally { await browser.close(); srv.close(); }
});
