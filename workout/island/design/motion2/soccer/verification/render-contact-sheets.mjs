// Visual evidence only. Captures authored poses through the unchanged viewer API.
// Does not run acceptance checks or change source files.
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packRoot = resolve(here, '..');
const island = resolve(packRoot, '../../..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const out = resolve(option('--out', here));
const executable = option('--executable', process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium');
await mkdir(out, { recursive: true });
const fixture = await mkdtemp(resolve(tmpdir(), 'bakasun-motion2-soccer-preview-'));
for (const directory of ['design/viewer', 'design/characters', 'design/motion', 'vendor']) await cp(resolve(island, directory), resolve(fixture, directory), { recursive: true, filter: path => !path.split('/').includes('verification') });
const data = JSON.parse(await readFile(resolve(island, 'design/motion/soccer.json'), 'utf8'));
const packs = [];
for (const file of (await readdir(packRoot)).filter(file => file.endsWith('.json') && (!option('--pack', null) || file === option('--pack'))).sort()) {
  const raw = await readFile(resolve(packRoot, file), 'utf8');
  const pack = JSON.parse(raw);
  if (!pack.states) continue;
  Object.assign(data.states, pack.states);
  packs.push({ file, sha256: createHash('sha256').update(raw).digest('hex'), states: pack.states });
}
await writeFile(resolve(fixture, 'design/motion/soccer.json'), JSON.stringify(data));
const server = spawn(process.execPath, [resolve(fixture, 'design/viewer/test-viewer.mjs'), '--serve', '--out', resolve(fixture, 'serve-output')], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const origin = await new Promise((accept, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(Error('Preview server did not start')), 10000);
    server.on('error', reject);
    server.on('exit', code => reject(Error(`Preview server exited ${code}`)));
    server.stdout.on('data', chunk => { output += chunk; const match = output.match(/Viewer: (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timeout); accept(match[1]); } });
    server.stderr.on('data', chunk => process.stderr.write(chunk));
  });
  let playwright;
  if (process.env.PLAYWRIGHT_MODULE) {
    let path = resolve(process.env.PLAYWRIGHT_MODULE);
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.mjs');
    playwright = await import(pathToFileURL(path).href);
  }
  else {
    try { playwright = await import('playwright'); }
    catch { playwright = await import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href); }
  }
  browser = await playwright.chromium.launch({ headless: true, executablePath: executable, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 320, height: 320 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(`${origin}/design/viewer/viewer.html`);
  await page.waitForFunction(() => Boolean(window.viewerTest));
  await page.evaluate(async () => { await window.viewerTest.ready; window.viewerTest.pause(); });
  await page.addStyleTag({ content: 'header,aside,.overlay,.bottom{display:none!important}.layout{display:block!important;height:100vh!important;min-height:0!important}.stage{height:100vh!important;min-height:0!important;width:100vw!important}' });
  const manifest = { schemaVersion: 1, scope: 'Supplemental visual evidence only; each cell is a screenshot of the existing viewer at the recorded source clip time. UI chrome hidden in browser only. No ball or gameplay simulation is added.', packs: [] };
  for (const pack of packs) {
    const character = pack.file.includes('throws') ? 'goalkeeper' : 'soccer-player';
    await page.evaluate(character => window.viewerTest.selectCharacter(character), character);
    const cells = [], poses = [];
    for (const [name, clip] of Object.entries(pack.states)) {
      const events = [...new Set(clip.events.map(event => event.time).filter(t => t > 0 && t < 1))];
      const phases = events.length >= 2 ? [0, events[0], events[1], 1] : events.length === 1 ? [0, Math.min(events[0] / 2, .33), events[0], 1] : [0, 1 / 3, 2 / 3, 1];
      for (const time of phases) {
        const seconds = time * clip.durationSeconds;
        await page.evaluate(({ name, seconds }) => { window.viewerTest.selectClip(name); window.viewerTest.seek(seconds); }, { name, seconds });
        const png = await page.locator('#stage').screenshot();
        poses.push({ clip: name, normalizedTime: time, seconds });
        cells.push({ clip: name, seconds, image: `data:image/png;base64,${png.toString('base64')}` });
      }
    }
    const sheet = await context.newPage();
    await sheet.setViewportSize({ width: 960, height: 320 });
    await sheet.setContent('<!doctype html><html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#0c1820;color:#e9f2f5;font:12px system-ui,sans-serif}h1{font-size:17px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}figure{margin:0;overflow:hidden;background:#162833;border:1px solid #314957;border-radius:6px}img{width:100%;display:block}figcaption{height:42px;padding:4px 7px;overflow-wrap:anywhere}</style><h1></h1><main></main>');
    await sheet.evaluate(({ title, cells }) => {
      document.querySelector('h1').textContent = title;
      for (const cell of cells) {
        const figure = document.createElement('figure');
        const img = document.createElement('img'); img.src = cell.image;
        const caption = document.createElement('figcaption'); caption.textContent = `${cell.clip} · ${cell.seconds.toFixed(3)} s`;
        figure.append(img, caption); document.querySelector('main').append(figure);
      }
    }, { title: `${pack.file} · ${character} · key presentation poses`, cells });
    await sheet.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    const screenshot = pack.file.replace(/\.json$/, '-contact-sheet.png');
    await sheet.screenshot({ path: resolve(out, screenshot), fullPage: true });
    await sheet.close();
    manifest.packs.push({ file: pack.file, sha256: pack.sha256, character, screenshot, poses });
    console.log(`Captured ${screenshot} (${poses.length} poses)`);
  }
  await writeFile(resolve(out, 'contact-sheets.json'), JSON.stringify(manifest, null, 2) + '\n');
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
