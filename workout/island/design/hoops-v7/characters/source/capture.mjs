#!/usr/bin/env node
// Render immutable evidence from the actual viewer; never invent comparison images.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const iteration = option('--iteration');
if (!/^\d{2}$/.test(iteration || '')) throw Error('Supply --iteration NN. Existing evidence is never overwritten.');
const output = path.join(root, 'iterations', iteration);
await fs.mkdir(output, { recursive: true });
try {
  await fs.access(path.join(output, 'capture.json'));
  throw Error('This iteration already has evidence. Use the next iteration number.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const require = createRequire('/tmp/hoops-v7-tools/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function snapshot(folder = root, base = root) {
  const files = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (['iterations', 'verification', '.DS_Store', 'standalone.html'].includes(entry.name)) continue;
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await snapshot(absolute, base));
    else {
      const bytes = await fs.readFile(absolute);
      files.push({ file: path.relative(base, absolute), bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}
const startedAtUtc = new Date().toISOString();
// Serve a frozen local copy. Concurrent authoring cannot change the evidence.
const frozen = await fs.mkdtemp('/tmp/hoops-v7-evidence-' + iteration + '-');
async function freeze(folder = root, relative = '') {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (['iterations', 'verification', '.DS_Store', 'standalone.html'].includes(entry.name)) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(path.join(frozen, next), { recursive: true });
      await freeze(path.join(folder, entry.name), next);
    } else await fs.copyFile(path.join(folder, entry.name), path.join(frozen, next));
  }
}
await freeze();
const before = await snapshot(frozen, frozen);
const contentTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
};
const server = http.createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (name === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const absolute = path.resolve(frozen, '.' + (name === '/' ? '/index.html' : name));
    if (!absolute.startsWith(frozen + path.sep)) { response.writeHead(403); response.end(); return; }
    const bytes = await fs.readFile(absolute);
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(absolute)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: option('--executable', '/usr/bin/chromium'),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [], externalRequests = [], screenshots = [], cases = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'he-IL' });
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
  externalRequests.push(url); return route.abort();
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
async function call(method, ...args) {
  return page.evaluate(async ({ method, args }) => {
    const api = window.__hoopsLab;
    if (typeof api[method] !== 'function') throw Error(`Missing viewer method ${method}`);
    const result = await api[method](...args);
    api.render();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return result;
  }, { method, args });
}
async function capture(name) {
  const png = await page.screenshot({ animations: 'disabled' });
  const bytes = await sharp(png).webp({ quality: 94, effort: 5 }).toBuffer();
  const file = name + '.webp';
  await fs.writeFile(path.join(output, file), bytes);
  screenshots.push({ file, viewport: page.viewportSize(), bytes: bytes.length, sha256: sha256(bytes), diagnostics: await call('diagnostics') });
}
try {
  await page.goto(origin + '/index.html?capture=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__hoopsLab, null, { timeout: 120000 });
  await page.evaluate(async () => { await window.__hoopsLab.ready; });
  await call('pause', true);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const size = `${viewport.width}x${viewport.height}`;
    await call('selectRole', 'pg');
    await call('selectAction', 'hold');
    await call('seek', .25);
    for (const view of ['near', 'far', 'face', 'hands', 'cloth']) {
      await call('setView', view);
      await capture(`${size}-${view}`);
    }
    await call('setCamera', {target: [.08, .92, .06], distance: .85, yaw: .55, pitch: 0});
    await capture(`${size}-cloth-lower`);
    await call('setView', 'cloth');
    await call('setCamera', {yaw: Math.PI});
    await capture(`${size}-cloth-back`);
    await call('setView', 'near');
    await call('setCamera', {yaw: Math.PI});
    await capture(`${size}-back-pg`);
    const layout = await page.evaluate(() => ({
      innerWidth, innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      buttons: [...document.querySelectorAll('button')].filter((element) => element.getBoundingClientRect().width > 0).map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent.trim(), width: rect.width, height: rect.height, x: rect.x, y: rect.y };
      }),
    }));
    cases.push({ name: `layout-${size}`, noHorizontalOverflow: layout.scrollWidth <= layout.innerWidth, details: layout });
    await call('setView', 'near');
    for (const role of ['sg', 'sf', 'pf', 'c', 'referee']) {
      await call('selectRole', role);
      await call('seek', .25);
      await capture(`${size}-role-${role}`);
      await call('setCamera', {yaw: Math.PI});
      await capture(`${size}-back-${role}`);
      await call('setView', 'face');
      await capture(`${size}-face-${role}`);
      await call('setView', 'hands');
      await capture(`${size}-hands-${role}`);
      await call('setView', 'near');
    }
    // Both color-only teams must also be inspected on final delivery rounds.
    await call('selectRole', 'pg');
    await call('setTeam', 'ivory');
    for (const view of ['near', 'far', 'cloth']) {
      await call('setView', view);
      await capture(`${size}-team-ivory-${view}`);
    }
    await call('setTeam', 'teal');
  }
  const diagnostics = await call('diagnostics');
  cases.push({ name: 'renderer', diagnostics });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
const after = await snapshot(frozen, frozen);
const changedDuringCapture = before.filter((a) => !after.some((b) => a.file === b.file && a.sha256 === b.sha256)).map((a) => a.file);
const result = {
  iteration, startedAtUtc, finishedAtUtc: new Date().toISOString(),
  renderer: 'Chromium WebGL ANGLE SwiftShader; software rendering, no physical-phone FPS inference',
  frozenSourceDirectory: frozen, inputs: before, changedDuringCapture, errors, externalRequests, cases, screenshots,
  pass: errors.length === 0 && externalRequests.length === 0 && changedDuringCapture.length === 0 && cases.every((item) => item.noHorizontalOverflow !== false),
};
await fs.writeFile(path.join(output, 'capture.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ iteration, pass: result.pass, screenshots: screenshots.length, errors, externalRequests, changedDuringCapture }));
if (!result.pass) process.exitCode = 1;
