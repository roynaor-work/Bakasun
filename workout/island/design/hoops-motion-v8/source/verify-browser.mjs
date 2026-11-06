#!/usr/bin/env node
// Browser verification uses the shipped files over HTTP, without build steps.
// Development-only dependency: playwright, installed outside this package.
import { createServer } from 'node:http';
import { readFile, writeFile, stat, mkdir, readdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
async function fingerprint() {
  async function files(dir) {
    const entries = await readdir(resolve(root, dir), { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const path = dir + '/' + entry.name;
      if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
    }
    return result;
  }
  const paths = ['index.html', 'preview.css', 'preview.mjs', ...await files('runtime')].sort();
  const digests = await Promise.all(paths.map(async path => path + ':' + createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')));
  return createHash('sha256').update(digests.join('\n')).digest('hex');
}
const initialFingerprint = await fingerprint();
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const minutes = Number(option('--minutes', '0'));
if (!Number.isFinite(minutes) || minutes < 0 || minutes > 120) throw new Error('--minutes must be 0..120');
const output = resolve(option('--out', resolve(root, 'verification/BROWSER.md')));
const modulePath = process.env.HOOPS_PLAYWRIGHT_PATH || '/tmp/hoops-motion-v8-browser/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath));
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let path = resolve(root, '.' + requestPath);
    if (!(path === root.replace(/\/$/, '') || path.startsWith(root.endsWith(sep) ? root : root + sep))) throw new Error('Outside package');
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const bytes = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [], requests = new Set(), failures = [], rows = [], soakRows = [];
const cspViolations = [], workerUrls = [];
let documentCsp = '';
let soak = null;
try {
  browser = await chromium.launch({ executablePath: option('--executable', '/usr/bin/chromium'), headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => requests.add(request.url()));
  page.on('worker', worker => workerUrls.push(worker.url()));
  await page.exposeFunction('__reportHoopsCsp', value => cspViolations.push(value));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    window.__reportHoopsCsp({ directive: event.effectiveDirective, blocked: event.blockedURI });
  }));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    errors.push(`External network request: ${url}`);
    return route.abort();
  });
  await page.goto(origin + '/?capture=1', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.evaluate(() => window.__hoops.ready);
  documentCsp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  if (!documentCsp?.includes("script-src 'self'")) errors.push('The preview must enforce the shipped Island CSP');
  const ids = await page.evaluate(() => window.__hoops.clips.map(c => c.id));
  if (ids.length < 14) throw new Error(`Only ${ids.length} clips`);
  console.log(`Loaded ${ids.length} shipped GLBs; beginning viewport/distance/angle sweeps`);
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const distance of ['near', 'far']) {
     for (const angle of ['front', 'side', 'back']) {
      for (const id of ids) {
        await page.evaluate(async ({ id, distance, angle }) => { await window.__hoops.select(id); window.__hoops.setDistance(distance); window.__hoops.setAngle(angle); }, { id, distance, angle });
        const result = await page.evaluate(() => {
          const result = { bodyClipped: 0, ballClipped: 0, overflow: 0, minBodyHeight: Infinity, bones: 0, tracks: 0, frames: document.querySelectorAll('.frame-button').length };
          const times = [...new Set([...Array.from({ length: 61 }, (_, i) => i / 60), ...window.__hoops.frameTimes])].sort((a, b) => a - b);
          for (const time of times) {
            const d = window.__hoops.seek(time);
            result.bones = d.boneCount; result.tracks = d.tracks;
            result.bodyClipped += !d.bodyInFrame; result.ballClipped += !d.ballInFrame;
            result.overflow += d.horizontalOverflow;
            if (d.body) result.minBodyHeight = Math.min(result.minBodyHeight, d.body.bottom - d.body.top);
          }
          return { ...result, samples: times.length, source: window.__hoops.diagnostics().source };
        });
        if (result.bones !== 18 || result.frames !== 8 || result.tracks < 21 || result.bodyClipped || result.overflow || (distance === 'far' && result.ballClipped)) errors.push(`${id} ${width}x${height} ${distance} ${angle}: ${JSON.stringify(result)}`);
        rows.push({ id, width, height, distance, angle, ...result });
      }
      console.log(`Checked ${width}x${height} ${distance} ${angle}: ${ids.length} clips, 61+ times per clip`);
     }
    }
  }
  // Basic interaction checks use actual buttons, including held final pose.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.selectOption('#clip-select', 'stop_two_feet');
  await page.waitForFunction(() => window.__hoops.currentId === 'stop_two_feet' && document.querySelector('#loading').hidden);
  await page.locator('#far').click();
  await page.locator('#restart').click();
  await page.locator('#play').click();
  await page.waitForFunction(() => !window.__hoops.playing && window.__hoops.diagnostics().normalized > .99, null, { timeout: 10_000 });
  const stoppedAtEnd = await page.evaluate(() => window.__hoops.diagnostics());
  await page.waitForTimeout(250);
  const stillAtEnd = await page.evaluate(() => window.__hoops.diagnostics());
  if (Math.abs(stoppedAtEnd.time - stillAtEnd.time) > .001) errors.push('Stop clip did not hold its final pose');
  await page.locator('#previous-frame').click();
  if (!(await page.evaluate(() => window.__hoops.diagnostics().normalized < 1))) errors.push('Previous frame control failed');
  await page.locator('#next-frame').click();
  if (minutes > 0) {
    // Repeated scene selection, texture decoding on first use, animation, seeking
    // and held endpoints expose retained mixers/materials and delayed failures.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const memory = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize')?.value || 0;
    await page.evaluate(() => {
      window.__hoopsPerf = { frames: 0, totalMs: 0, over34: 0, over50: 0, maxMs: 0, histogram: Array(1001).fill(0), last: performance.now() };
      function measure() {
        const now = performance.now();
        const p = window.__hoopsPerf, dt = now - p.last; p.last = now;
        if (window.__hoops.playing && dt > 0) {
          p.frames++; p.totalMs += dt; p.over34 += dt > 34; p.over50 += dt > 50; p.maxMs = Math.max(p.maxMs, dt);
          p.histogram[Math.min(1000, Math.round(dt))]++;
        }
        requestAnimationFrame(measure);
      }
      requestAnimationFrame(measure);
    });
    await cdp.send('HeapProfiler.collectGarbage');
    const startHeap = await memory(), startRenderMemory = await page.evaluate(() => window.__hoops.diagnostics().renderer);
    const start = performance.now(), deadline = start + minutes * 60_000;
    let cycles = 0, clipIndex = 0, lastStatus = 0;
    console.log(`Beginning ${minutes} minute animation/selection soak`);
    while (performance.now() < deadline) {
      const id = ids[clipIndex % ids.length];
      await page.evaluate(async ({ id, index }) => {
        await window.__hoops.select(id); window.__hoops.setDistance(index % 2 ? 'near' : 'far');
        window.__hoops.setAngle(['front', 'side', 'back'][index % 3]);
        window.__hoops.seek(0); window.__hoops.setSpeed(1); window.__hoops.play();
      }, { id, index: clipIndex });
      const loop = await page.evaluate(() => window.__hoops.diagnostics().loop);
      if (loop) {
        const duration = await page.evaluate(() => window.__hoops.diagnostics().duration);
        await page.waitForTimeout(Math.ceil(duration * 2.2 * 1000));
        await page.evaluate(() => window.__hoops.pause());
      } else await page.waitForFunction(() => !window.__hoops.playing, null, { timeout: 15_000 });
      const d = await page.evaluate(() => window.__hoops.diagnostics());
      if (d.horizontalOverflow || d.boneCount !== 18 || (!loop && d.normalized < .99)) errors.push(`Soak endpoint: ${id}`);
      clipIndex++;
      if (clipIndex % ids.length === 0) cycles++;
      if (performance.now() - lastStatus > 45_000) {
        const elapsed = (performance.now() - start) / 60_000, heap = await memory();
        const entry = { elapsed: Number(elapsed.toFixed(2)), selections: clipIndex, heap };
        soakRows.push(entry); console.log(`Soak ${entry.elapsed} min, ${entry.selections} selections, heap ${(heap / 1e6).toFixed(1)} MB`);
        lastStatus = performance.now();
      }
    }
    const perf = await page.evaluate(() => window.__hoopsPerf);
    await cdp.send('HeapProfiler.collectGarbage');
    let cumulative = 0, p95Ms = 0;
    for (let i = 0; i < perf.histogram.length; i++) {
      cumulative += perf.histogram[i];
      if (cumulative >= perf.frames * .95) { p95Ms = i; break; }
    }
    soak = { minutes: (performance.now() - start) / 60_000, cycles, selections: clipIndex, startHeap, endHeap: await memory(),
      startRenderMemory, endRenderMemory: await page.evaluate(() => window.__hoops.diagnostics().renderer), frames: perf.frames,
      fps: perf.frames / (perf.totalMs / 1000), p95Ms, over34: perf.over34, over50: perf.over50, maxMs: perf.maxMs };
    if (soak.endHeap - soak.startHeap > 12_000_000) errors.push(`Retained JS heap grew by ${soak.endHeap - soak.startHeap} bytes after GC`);
    for (const resource of ['geometries', 'textures']) if (soak.endRenderMemory[resource] > soak.startRenderMemory[resource] + 4) errors.push(`Retained renderer ${resource} grew from ${soak.startRenderMemory[resource]} to ${soak.endRenderMemory[resource]}`);
  }
  if (await fingerprint() !== initialFingerprint) errors.push('Runtime or preview bytes changed during browser verification');
  if (!workerUrls.length || workerUrls.some(url => url !== origin + '/runtime/vendor/draco/draco-worker.js')) errors.push('Draco must use same-origin static workers');
  if (cspViolations.length) errors.push(`CSP violations: ${JSON.stringify(cspViolations)}`);
  const report = `# בדיקת דפדפן\n\nתוצאה: ${errors.length || failures.length ? 'FAIL' : 'PASS'}. Chromium עם SwiftShader, נכסי החבילה המקוריים דרך HTTP מקומי.\n\n` +
    `נבדקו ${ids.length} קליפים × שני מסכים × שני מרחקים × שלוש זוויות, עם לפחות 61 נקודות זמן לכל שילוב. כל בדיקה משתמשת ב־GLB שנמסר וב־THREE.AnimationMixer, עם פענוח תמונה ו־Draco בדפדפן.\n\n` +
    `| קליפ | מסך | מרחק | זווית | דגימות | גובה דמות מינימלי בפיקסלים | חיתוך גוף | חיתוך כדור | עצמות / ערוצים / תמונות |\n|---|---|---|---|---:|---:|---:|---:|---|\n` +
    rows.map(r => `| ${r.id} | ${r.width}×${r.height} | ${r.distance} | ${r.angle} | ${r.samples} | ${r.minBodyHeight.toFixed(1)} | ${r.bodyClipped} | ${r.ballClipped} | ${r.bones} / ${r.tracks} / ${r.frames} |`).join('\n') +
    `\n\nבמבט קרוב נבחנים הגוף וכפות הידיים; כדור שכבר שוחרר עשוי לצאת מהצילום. במבט רחוק נדרש מסלול הכדור המלא. כפתורי הניגון, בחירת קליפ, החלפת מרחק וצעדי פריים נבדקו. עצירת הכדרור החזיקה את פריים הסיום.\n\n` +
    `בקשות חיצוניות: ${[...requests].filter(url => !url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:')).length}. כשלים בטעינה: ${failures.length}. שגיאות: ${errors.length}.\n\n` +
    `מדיניות CSP במסמך: \`${documentCsp}\`. הפרות: ${cspViolations.length}. נוצרו ${workerUrls.length} Workers סטטיים; כל כתובת נבדקה מול הקובץ המקומי runtime/vendor/draco/draco-worker.js.\n\n` +
    (soak ? `משך בדיקת רצף: ${soak.minutes.toFixed(2)} דקות, ${soak.selections} בחירות קליפ, ${soak.cycles} מחזורי ספרייה. ${soak.frames} פריימי ניגון נמדדו.\n\n` +
      `קצב RAF ממוצע: ${soak.fps.toFixed(2)} לשנייה; P95: ${soak.p95Ms.toFixed(2)}ms; מרווח מרבי: ${soak.maxMs.toFixed(2)}ms; מרווחי פריימים >34ms: ${soak.over34}, >50ms: ${soak.over50}.\n\n` +
      `זיכרון JS לאחר GC בתחילת/סוף: ${(soak.startHeap / 1e6).toFixed(2)} / ${(soak.endHeap / 1e6).toFixed(2)} MB. סף גידול לאחר חימום: 12MB. זו אינה מדידת זיכרון GPU.\n\n` +
      `משאבי renderer בתחילת/סוף: גאומטריות ${soak.startRenderMemory.geometries}/${soak.endRenderMemory.geometries}, טקסטורות ${soak.startRenderMemory.textures}/${soak.endRenderMemory.textures}. סף גידול לכל סוג: 4 לאחר חימום כל הקליפים.\n\n` +
      `| דקות | בחירות קליפ | JS heap, MB |\n|---:|---:|---:|\n${soakRows.map(r => `| ${r.elapsed} | ${r.selections} | ${(r.heap / 1e6).toFixed(2)} |`).join('\n')}\n\n` : '') +
    `טביעת SHA-256 של כל קובצי runtime ושל דף התצוגה בתחילת ובסוף הבדיקה: \`${initialFingerprint}\`. שינוי בתים במהלך הבדיקה גורם לכישלון.\n\n` +
    `גודל הפיקסל בבדיקה: deviceScaleFactor=1. מגבלת התצוגה בטלפון היא DPR 1.5; העלות במכשיר פיזי ובמשחק מלא עשויה להיות שונה.\n\n` +
    `המספרים מתארים דפדפן בענן עם GPU תוכנתי. אין בהם אישור ל־30fps בטלפון פיזי. יעד הטלפון מתועד בנפרד בתקציב האינטגרציה.\n` +
    (errors.length || failures.length ? `\nכשלים:\n\n${[...errors, ...failures].map(e => `- ${e}`).join('\n')}\n` : '');
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, report);
  console.log(`${errors.length || failures.length ? 'FAIL' : 'PASS'} browser verification: ${output}`);
  if (errors.length || failures.length) process.exitCode = 1;
} catch (error) {
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `# בדיקת דפדפן\n\n**FAIL** אחרי ${rows.length} שילובי צפייה שנבדקו.\n\n${String(error.stack || error)}\n\n${errors.concat(failures).map(message => '- ' + message).join('\n')}\n`);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
