import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat, realpath, access } from 'node:fs/promises';
import { dirname, extname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = dirname(fileURLToPath(import.meta.url));
const shots = resolve(root, 'shots');
const scratch = resolve(root, 'work');
const views = ['front', 'side', 'back', 'threeQuarter', 'top', 'bottom'];
const labels = { front: 'חזית', side: 'צד', back: 'גב', threeQuarter: 'שלושה רבעים', top: 'מלמעלה', bottom: 'מלמטה' };
const desktop = { viewport: { width: 1440, height: 1180 }, deviceScaleFactor: 1 };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const fpsDurationMs = 5000;
const runCount = 5;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8', '.ico': 'image/x-icon' };
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function inside(base, path) {
  const rel = relative(base, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep));
}

// The local server only exposes this lab, including its own comparison assets.
// Realpath checks also prevent a symlink from exposing another project directory.
export async function serve(port = 0) {
  const canonicalRoot = await realpath(root);
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405); response.end(); return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const path = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
      const parts = relative(root, path).split(sep);
      if (!inside(root, path) || parts.some(part => part.startsWith('.') || part === 'node_modules' || part === 'npm-cache')) {
        response.writeHead(403); response.end('Outside lab'); return;
      }
      const canonical = await realpath(path);
      if (!inside(canonicalRoot, canonical)) { response.writeHead(403); response.end('Outside lab'); return; }
      if (!(await stat(canonical)).isFile()) { response.writeHead(404); response.end('Not found'); return; }
      const body = await readFile(canonical);
      response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 400);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Invalid request');
    }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  return server;
}

async function guardedContext(browser, origin, options, issues) {
  const context = await browser.newContext({ ...options, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    issues.outbound.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    if (url.origin.replace(/^ws/, 'http') === origin) socket.connectToServer();
    else { issues.outbound.push(socket.url()); socket.close(); }
  });
  context.on('page', page => {
    page.on('pageerror', error => issues.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) issues.httpErrors.push({ url: response.url(), status: response.status() }); });
  });
  return context;
}

async function ready(page, origin) {
  await page.goto(`${origin}/?capture=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.lab), null, { timeout: 60000 });
  await page.evaluate(async () => {
    if (window.lab.ready?.then) await window.lab.ready;
  });
  await page.waitForFunction(() => window.lab.ready === true || Boolean(window.lab.ready?.then), null, { timeout: 60000 });
  const api = await page.evaluate(() => ({ setView: typeof window.lab.setView, setRevision: typeof window.lab.setRevision, metrics: typeof window.lab.metrics, measureFPS: typeof window.lab.measureFPS }));
  for (const [name, type] of Object.entries(api)) assert.equal(type, 'function', `Missing window.lab.${name}()`);
  await settle(page);
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function configure(page, view, revision = 'final') {
  await page.evaluate(async ({ view, revision }) => { await window.lab.setRevision(revision); await window.lab.setView(view); }, { view, revision });
  await settle(page);
}

async function checkedMetrics(page) {
  const metrics = await page.evaluate(() => window.lab.metrics());
  assert(Array.isArray(metrics.objects) && metrics.objects.length >= 4, 'metrics.objects must contain the three hands and the shoe');
  for (const item of metrics.objects) {
    assert.equal(typeof item.name, 'string', 'Every measured object needs a name');
    assert(Number.isInteger(item.triangles) && item.triangles > 0, `${item.name}: invalid triangle count`);
    assert(Number.isFinite(item.buildMs) && item.buildMs >= 0, `${item.name}: invalid build time`);
    if (metrics.revision === 'final' && item.name.startsWith('hand-')) {
      assert.equal(item.validation?.continuousSurface, true, `${item.name}: final hand must have one closed manifold surface`);
    }
  }
  assert(metrics.displayedTriangles > 0, 'Renderer reports no drawn triangles');
  return metrics;
}

async function browserInfo(page, browser) {
  return page.evaluate(version => ({
    browser: 'Chromium', version, userAgent: navigator.userAgent, platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory ?? null,
    viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio,
    screen: { width: screen.width, height: screen.height },
    renderer: Array.from(document.querySelectorAll('#hands-viewport canvas, #shoe-viewport canvas'), canvas => {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return { canvas: { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight },
        vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
        version: gl ? gl.getParameter(gl.VERSION) : null };
    })
  }), browser.version());
}

async function verifyCanvas(page) {
  for (const selector of ['#hands-viewport', '#shoe-viewport']) {
    const element = page.locator(selector);
    assert.equal(await element.locator('canvas').count(), 1, `${selector} needs one visible canvas`);
    const box = await element.boundingBox();
    assert(box && box.width > 100 && box.height > 100, `${selector} has zero or tiny size`);
    const canvasBox = await element.locator('canvas').boundingBox();
    for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(canvasBox[key] - box[key]) < 1, `${selector}: canvas CSS ${key} does not match its container`);
    const result = await page.evaluate(async selector => {
      window.lab.render?.();
      const source = document.querySelector(`${selector} canvas`);
      const image = new Image(); image.src = source.toDataURL('image/png'); await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set(); let luminanceMin = 255, luminanceMax = 0, visibleSamples = 0;
      for (let i = 0; i < pixels.length; i += 64) {
        if (pixels[i + 3] < 20) continue;
        visibleSamples++;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
        const luminance = (r + g + b) / 3; luminanceMin = Math.min(luminanceMin, luminance); luminanceMax = Math.max(luminanceMax, luminance);
      }
      return { sampledColors: colors.size, visibleSamples, luminanceRange: luminanceMax - luminanceMin, width: image.width, height: image.height };
    }, selector);
    assert(result.visibleSamples >= 100 && result.sampledColors >= 12 && result.luminanceRange >= 40, `${selector} canvas appears blank: ${JSON.stringify(result)}`);
  }
}

// Read the transparent WebGL output rather than inferring fit from DOM overflow.
// A model that reaches a scissor edge can be cropped while the layout still fits.
export async function verifyModelMargins(page) {
  const models = await page.evaluate(async () => {
    window.lab.render();
    const results = [];
    for (const selector of ['#hands-viewport', '#shoe-viewport']) {
      const source = document.querySelector(`${selector} canvas`), base = source.getBoundingClientRect();
      const image = new Image(); image.src = source.toDataURL(); await image.decode();
      const copy = document.createElement('canvas'); copy.width = image.width; copy.height = image.height;
      const context = copy.getContext('2d'); context.drawImage(image, 0, 0);
      const scale = image.width / base.width;
      for (const element of document.querySelectorAll(`${selector} .model-window`)) {
        const rect = element.getBoundingClientRect();
        const width = Math.floor(rect.width * scale), height = Math.floor(rect.height * scale);
        const pixels = context.getImageData(Math.round((rect.left - base.left) * scale), Math.round((rect.top - base.top) * scale), width, height).data;
        let minX = width, maxX = -1, minY = height, maxY = -1;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (pixels[(y * width + x) * 4 + 3] <= 16) continue;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        results.push({ name: element.dataset.hand || element.dataset.shoe,
          window: { width: rect.width, height: rect.height }, containsModel: maxX >= 0,
          marginsPixels: { left: minX, right: width - 1 - maxX, top: minY, bottom: height - 1 - maxY } });
      }
    }
    return results;
  });
  for (const model of models) {
    assert(model.containsModel, `${model.name}: model window is empty`);
    assert(Object.values(model.marginsPixels).every(margin => margin >= 2), `${model.name}: rendered model reaches a scissor edge: ${JSON.stringify(model.marginsPixels)}`);
  }
  return models;
}

async function verifyInteractions(page) {
  for (const view of views) {
    const button = page.locator(`[data-view="${view}"]`);
    await button.click(); await settle(page);
    assert.equal(await button.getAttribute('aria-pressed'), 'true', `${view}: pressed state not updated`);
    assert.equal(await page.locator('[data-view][aria-pressed="true"]').count(), 1, 'Exactly one selected view expected');
    assert.equal((await checkedMetrics(page)).view, view, 'Button does not update camera state');
  }
  for (const revision of ['baseline', 'final']) {
    const button = page.locator(`[data-revision="${revision}"]`);
    await button.click(); await settle(page);
    assert.equal(await button.getAttribute('aria-pressed'), 'true', 'Revision pressed state not updated');
    assert.equal((await checkedMetrics(page)).revision, revision, 'Revision button does not change model');
  }
  await configure(page, 'threeQuarter');
  const solid = hash(await page.locator('#hands-viewport').screenshot());
  await page.locator('#wireframe').click(); await settle(page);
  assert.equal(await page.locator('#wireframe').getAttribute('aria-pressed'), 'true', 'Wireframe pressed state not updated');
  assert.notEqual(hash(await page.locator('#hands-viewport').screenshot()), solid, 'Wireframe button has no visual effect');
  await page.locator('#wireframe').click(); await settle(page);
  assert.equal(await page.locator('#wireframe').getAttribute('aria-pressed'), 'false');
  assert.equal(hash(await page.locator('#hands-viewport').screenshot()), solid, 'Wireframe toggle did not restore solid shading');
}

async function snapshots(page, view, revision) {
  await configure(page, view, revision);
  const result = {};
  for (const [name, selector] of [['hands', '#hands-viewport'], ['shoe', '#shoe-viewport']]) {
    const path = `work/${revision}-${view}-${name}.png`;
    await page.locator(selector).screenshot({ path: resolve(root, path) });
    result[name] = `/${path}`;
  }
  return result;
}

async function references() {
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(root, 'references/manifest.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { source: null, availableViews: [], entries: {} }; throw error; }
  const entries = {}, mapping = manifest.views ?? manifest;
  for (const view of views) {
    if (!mapping[view]) continue;
    const entry = typeof mapping[view] === 'string' ? { path: mapping[view] } : mapping[view];
    assert(typeof entry.path === 'string' && !/^(https?:|data:|\/)/i.test(entry.path), `${view}: references must use local paths`);
    const path = resolve(root, 'references', entry.path);
    assert(inside(resolve(root, 'references'), path), `${view}: reference must stay inside references/`);
    await access(path);
    assert(inside(await realpath(resolve(root, 'references')), await realpath(path)), `${view}: reference symlink escapes references/`);
    if (entry.crop) assert(Array.isArray(entry.crop) && entry.crop.length === 4 && entry.crop.every(Number.isFinite) && entry.crop[0] >= 0 && entry.crop[1] >= 0 && entry.crop[2] > 0 && entry.crop[3] > 0, `${view}: crop must be [x,y,width,height] pixels`);
    entries[view] = { path: `/${relative(root, path).split(sep).join('/')}`, crop: entry.crop ?? null };
  }
  return { source: manifest.source ?? null, availableViews: Object.keys(entries), entries };
}

const sheetStyle = `*{box-sizing:border-box}body{margin:0;padding:36px;background:#eef0f5;color:#1b2842;font:18px Arial,sans-serif}h1{font-size:34px;margin:0 0 12px}p{line-height:1.5;margin:0 0 24px}main{display:grid;gap:22px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:22px;direction:ltr}.card{background:#fff;border:1px solid #d3dbea;border-radius:16px;padding:16px;direction:rtl}h2{margin:0 0 10px;font-size:22px}.models{display:grid;gap:10px;height:348px}.models img{display:block;width:100%;height:169px;object-fit:contain;background:#f6f7fa}.reference{width:100%;height:348px;object-fit:contain;background:#f6f7fa}.missing{display:flex;flex-direction:column;align-items:center;justify-content:center;height:348px;border:2px dashed #bd7281;background:#fff4f5;color:#803944;gap:12px;font-size:25px}.missing small{font-size:17px}footer{margin-top:25px;color:#576781;font-size:16px}`;
const modelImages = data => `<div class="models"><img src="${escape(data.hands)}" alt="שלוש תנוחות יד"><img src="${escape(data.shoe)}" alt="נעל כדורגל"></div>`;

async function sheet(page, origin, filename, body) {
  const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>מעבדת ידיים ונעליים</title><style>${sheetStyle}</style><body>${body}<script>
    window.sheetReady = Promise.all(Array.from(document.images, async image => {
      await image.decode();
      if (!image.dataset.crop) return;
      const [x,y,w,h] = JSON.parse(image.dataset.crop);
      if (x+w > image.naturalWidth || y+h > image.naturalHeight) throw new Error('Reference crop exceeds image bounds');
      const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h); image.src=canvas.toDataURL(); delete image.dataset.crop; await image.decode();
    }));
  </script></body></html>`;
  await writeFile(resolve(scratch, `${filename}.html`), html);
  await page.goto(`${origin}/work/${filename}.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.sheetReady);
  await page.screenshot({ path: resolve(shots, `${filename}.png`), fullPage: true });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summary(runs) {
  const values = runs.map(run => typeof run.fps === 'number' ? run.fps : run.fps.fps);
  assert(values.every(value => Number.isFinite(value) && value > 0), 'measureFPS must return fps > 0 (number or {fps,...})');
  const objectNames = runs[0].metrics.objects.map(item => item.name);
  const totalBuildTimes = runs.map(run => run.metrics.totalBuildMs);
  assert(totalBuildTimes.every(value => Number.isFinite(value) && value >= 0), 'Total build timings must be finite');
  return {
    runs: runs.length, fps: { p50: percentile(values, 0.5), min: Math.min(...values), max: Math.max(...values) },
    modelTriangles: runs[0].metrics.modelTriangles, displayedTriangles: runs[0].metrics.displayedTriangles,
    totalBuildMs: { p50: percentile(totalBuildTimes, 0.5), min: Math.min(...totalBuildTimes), max: Math.max(...totalBuildTimes) },
    objects: objectNames.map(name => {
      const samples = runs.map(run => run.metrics.objects.find(item => item.name === name));
      assert(samples.every(Boolean), `Object ${name} missing in one performance run`);
      assert(samples.every(sample => sample.triangles === samples[0].triangles), `Triangle count changed across identical final builds: ${name}`);
      const times = samples.map(sample => sample.buildMs);
      return { name, triangles: samples[0].triangles, buildMs: { p50: percentile(times, 0.5), min: Math.min(...times), max: Math.max(...times) } };
    })
  };
}

async function pipeline(testOnly) {
  await mkdir(scratch, { recursive: true });
  if (!testOnly) await mkdir(shots, { recursive: true });
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const issues = { outbound: [], pageErrors: [], consoleErrors: [], httpErrors: [] };
  let browser;
  try {
    const launchOptions = { headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking', '--disable-component-update'] };
    if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
    else { try { await access('/usr/bin/chromium'); launchOptions.executablePath = '/usr/bin/chromium'; } catch {} }
    browser = await chromium.launch(launchOptions);
    const context = await guardedContext(browser, origin, desktop, issues);
    const page = await context.newPage();
    await ready(page, origin);
    await verifyCanvas(page);
    await verifyInteractions(page);
    await page.screenshot({ path: resolve(scratch, 'preview.png'), fullPage: true });
    console.log('Preview ready: work/preview.png');
    const finalMetrics = await checkedMetrics(page);
    const info = await browserInfo(page, browser);
    const cameraChecks = {};
    const captures = {}, baseline = {};
    for (const view of views) {
      await configure(page, view);
      await verifyCanvas(page);
      const first = await page.locator('#hands-viewport').screenshot();
      const firstShoe = await page.locator('#shoe-viewport').screenshot();
      await configure(page, view);
      assert.equal(hash(await page.locator('#hands-viewport').screenshot()), hash(first), `${view}: hand camera or lighting is not deterministic`);
      assert.equal(hash(await page.locator('#shoe-viewport').screenshot()), hash(firstShoe), `${view}: shoe camera or lighting is not deterministic`);
      cameraChecks[view] = 'identical pixels after resetting the same view';
      if (!testOnly) {
        await page.screenshot({ path: resolve(shots, `${view}.png`), fullPage: true });
        captures[view] = await snapshots(page, view, 'final');
      }
    }
    await configure(page, 'front', 'baseline');
    const baselineMetrics = await checkedMetrics(page);
    const baselineHash = hash(await page.locator('#hands-viewport').screenshot());
    await configure(page, 'front', 'final');
    assert.notEqual(hash(await page.locator('#hands-viewport').screenshot()), baselineHash, 'Baseline/final hand images must show an actual technique change');
    let referenceInfo = { source: null, availableViews: [], entries: {} };
    if (!testOnly) {
      for (const view of ['front', 'side']) baseline[view] = await snapshots(page, view, 'baseline');
      referenceInfo = await references();
      const sheetPage = await context.newPage();
      await sheetPage.setViewportSize({ width: 1400, height: 1180 });
      await sheet(sheetPage, origin, 'comparison', `<h1>ידיים ונעלי כדורגל · מבטים קבועים</h1><p>בכל זוג: ההדמיה משמאל ותמונת היעד מימין. ${referenceInfo.availableViews.length ? 'היעדים נלקחו מקבצי references/ המקומיים.' : 'לא התקבלו קובצי תמונות היעד; המקומות נשמרו ומסומנים במפורש. אי אפשר לאמת התאמה לתמונה בלי המקור.'}</p><main>${views.map(view => {
        const entry = referenceInfo.entries[view];
        return `<div class="pair"><section class="card"><h2>${labels[view]} · ההדמיה</h2>${modelImages(captures[view])}</section><section class="card"><h2>${labels[view]} · יעד</h2>${entry ? `<img class="reference" src="${escape(entry.path)}" ${entry.crop ? `data-crop="${escape(JSON.stringify(entry.crop))}"` : ''} alt="תמונת היעד במבט ${labels[view]}">` : `<div class="missing">תמונת יעד לא צורפה<small>המקום מיועד למבט ${labels[view]}</small></div>`}</section></div>`;
      }).join('')}</main><footer>רינדור מקור 1440×1180 · גיליון ברוחב 1400 · מצלמה ותאורת עולם קבועות · ללא תיקון תמונה לאחר הרינדור</footer>`);
      await sheet(sheetPage, origin, 'before-after', `<h1>לפני ואחרי · אותו מבט ואותה תאורה</h1><p>לפני: חיבור חלקים ופרטים בסיסיים. אחרי: המשטח הרציף והפרטים הסופיים. כל תמונה היא רינדור אמיתי של אותה מעבדה.</p><main>${['front', 'side'].map(view => `<div class="pair"><section class="card"><h2>${labels[view]} · לפני</h2>${modelImages(baseline[view])}</section><section class="card"><h2>${labels[view]} · אחרי</h2>${modelImages(captures[view])}</section></div>`).join('')}</main>`);
      await sheetPage.close();
    }
    await context.close();
    const responsive = [];
    for (const width of [320, 360]) {
      const responsiveContext = await guardedContext(browser, origin, { ...phone, viewport: { width, height: 844 } }, issues);
      const responsivePage = await responsiveContext.newPage();
      await ready(responsivePage, origin);
      await verifyCanvas(responsivePage);
      const layout = await responsivePage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert(layout.scrollWidth <= layout.width + 1, `${width}px layout overflows horizontally`);
      responsive.push({ ...layout, canvasMatchesContainer: true, noModelClipping: true, models: await verifyModelMargins(responsivePage) });
      if (!testOnly) await responsivePage.screenshot({ path: resolve(shots, `phone-${width}.png`), fullPage: true });
      await responsiveContext.close();
    }
    const runs = [];
    for (let i = 0; i < (testOnly ? 1 : runCount); i++) {
      const phoneContext = await guardedContext(browser, origin, phone, issues);
      const phonePage = await phoneContext.newPage();
      await ready(phonePage, origin);
      await configure(phonePage, 'threeQuarter');
      await phonePage.evaluate(() => scrollTo(0, 0));
      await verifyCanvas(phonePage);
      await phonePage.evaluate(() => scrollTo(0, 0));
      const layout = await phonePage.evaluate(() => ({ horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.equal(layout.horizontalOverflow, false, `Phone layout overflows horizontally: ${JSON.stringify(layout)}`);
      const before = await checkedMetrics(phonePage);
      const fps = await phonePage.evaluate(duration => window.lab.measureFPS(duration), testOnly ? 1500 : fpsDurationMs);
      const fpsValue = typeof fps === 'number' ? fps : fps.fps;
      assert(Number.isFinite(fpsValue) && fpsValue > 0, 'FPS measurement must contain actual nonzero frames');
      runs.push({ run: i + 1, metrics: before, fps, environment: await browserInfo(phonePage, browser), layout });
      if (!testOnly && i === 0) await phonePage.screenshot({ path: resolve(shots, 'phone.png'), fullPage: true });
      await phoneContext.close();
      console.log(`Phone run ${i + 1}/${testOnly ? 1 : runCount}: ${fpsValue.toFixed(2)} FPS`);
    }
    assert.deepEqual(issues.outbound, [], 'The lab attempted outbound network requests');
    assert.deepEqual(issues.pageErrors, [], 'Uncaught browser errors');
    assert.deepEqual(issues.consoleErrors, [], 'Browser console errors');
    assert.deepEqual(issues.httpErrors, [], 'Missing local assets');
    const measurement = {
      capturedAt: new Date().toISOString(), protocol: { desktop, phone, view: 'threeQuarter', fpsDurationMs: testOnly ? 1500 : fpsDurationMs, repetitions: runs.length, startup: 'fresh browser context per run, cache disabled by local HTTP server', buildTime: 'Per-model buildMs uses performance.now() inside procedural geometry builders; excludes HTTP loading and shader compilation. totalBuildMs also includes geometric validation and scene inventory.', fpsMethod: 'window.lab.measureFPS(): actual requestAnimationFrame timestamps while rendering, with no throttling override', runtimeNetwork: 'only exact local lab origin allowed; external requests abort and fail the run' },
      desktop: { environment: info, metrics: finalMetrics }, baseline: baselineMetrics,
      phone: { runs, summary: summary(runs) },
      checks: { cameraChecks, interactions: 'six view buttons, baseline/final and reversible wireframe verified through DOM state, metrics and rendered pixels', responsive, baselineDiffersFromFinal: true, phoneNoHorizontalOverflow: true, canvasMatchesContainerAtDpr2: true, canvasesContainVisibleColorVariation: true, ...issues },
      references: referenceInfo,
      limitations: [
        'Chromium is headless on the cloud execution host. The renderer string records whether ANGLE/SwiftShader software rendering is used.',
        '390×844 at DPR 2 emulates phone viewport, touch and mobile layout; it does not emulate a physical phone CPU, GPU, thermal limits or display refresh rate.',
        'All three hand poses and the shoe are displayed together. FPS measures the full laboratory page, not a single model in isolation.',
        'Build times are JavaScript geometry generation timings, not artist working time.',
        ...(referenceInfo.availableViews.length === views.length ? [] : ['Original target pixels are unavailable for some or all views. Missing targets remain explicitly labeled; no image similarity score or reference fidelity claim is made.'])
      ]
    };
    if (!testOnly) await writeFile(resolve(shots, 'metrics.json'), `${JSON.stringify(measurement, null, 2)}\n`);
    console.log(testOnly ? 'PASS: deterministic cameras, visible canvases, baseline/final difference, phone layout, measured FPS, local assets and zero outbound/error events.' : `Saved screenshots and actual measurements to ${relative(root, shots)}/`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--serve')) {
    const server = await serve(Number(process.env.PORT ?? 8765));
    console.log(`http://127.0.0.1:${server.address().port}/`);
  } else {
    await pipeline(process.argv.includes('--test'));
  }
}
