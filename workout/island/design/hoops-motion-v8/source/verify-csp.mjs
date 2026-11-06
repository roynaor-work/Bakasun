#!/usr/bin/env node
/** Actual island CSP compatibility, with a deliberate missing-worker control.
 * Uses unmodified delivered GLBs, gzip files, loaders, decoder and static worker.
 */
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, extname, dirname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const args = process.argv.slice(2), option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const rounds = Number(option('--rounds', '8'));
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 30) throw new Error('--rounds must be 1..30');
const output = resolve(option('--output', resolve(root, 'verification/CSP.md')));
const islandPath = fileURLToPath(new URL('../../../index.html', import.meta.url));
const island = await readFile(islandPath, 'utf8');
const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(island)?.[1];
if (!policy || !policy.includes("script-src 'self'")) throw new Error('Actual island CSP was not found');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const librarySha256 = hash(await readFile(resolve(root, 'runtime/library.mjs')));
const workerSha256 = hash(await readFile(resolve(root, 'runtime/vendor/draco/draco-worker.js')));
const {chromium} = await import(pathToFileURL(process.env.HOOPS_PLAYWRIGHT_PATH || '/tmp/hoops-motion-v8-browser/node_modules/playwright/index.mjs'));
const mime = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.glb': 'model/gltf-binary'};
const harness = `import {loadClip,disposeClip,disposeRuntime,CLIP_IDS} from '/runtime/library.mjs';
window.__cspResult={status:'loading'};
const started=performance.now();
Promise.race([(async()=>{
 const clips=[];
 for(const id of CLIP_IDS){const loaded=await loadClip(id,{format:'glb'});clips.push({id,tracks:loaded.animation.tracks.length});disposeClip(loaded);}
 await disposeRuntime();return clips;
})(),new Promise((_,reject)=>setTimeout(()=>reject(Error('decoder deadline exceeded')),20000))])
.then(clips=>{window.__cspResult={status:'success',clips,elapsedMilliseconds:performance.now()-started};})
.catch(error=>{window.__cspResult={status:'failure',message:error.message,elapsedMilliseconds:performance.now()-started};});`;
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path === '/probe.html') {
      response.writeHead(200, {'Content-Type': 'text/html', 'Content-Security-Policy': policy});
      response.end('<!doctype html><title>Island CSP test</title><script type="module" src="/probe.mjs"></script>'); return;
    }
    if (path === '/probe.mjs') {response.writeHead(200, {'Content-Type': 'text/javascript'}); response.end(harness); return;}
    if (path === '/favicon.ico') {response.writeHead(204); response.end(); return;}
    const filename = resolve(root, '.' + path);
    if (!filename.startsWith(root + sep)) throw new Error('Outside package');
    const bytes = await readFile(filename);
    // Exactly as GitHub Pages: the game document has a CSP; a separately served
    // static worker has its own response policy. No game policy is modified.
    response.writeHead(200, {'Content-Type': mime[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    response.end(bytes);
  } catch {response.writeHead(404); response.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({executablePath: process.env.HOOPS_CHROMIUM || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  for (let round = 0; round <= rounds; round++) {
    const missingWorker = round === rounds;
    const context = await browser.newContext(), page = await context.newPage();
    const errors = [], failedRequests = [], requests = [], workers = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
    page.on('requestfailed', request => failedRequests.push({url: request.url().replace(origin, ''), error: request.failure()?.errorText}));
    page.on('request', request => requests.push(request.url().replace(origin, '')));
    page.on('worker', worker => workers.push(worker.url().replace(origin, '')));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (!(url.startsWith(origin + '/') || url.startsWith('blob:') || url.startsWith('data:'))) return route.abort();
      if (missingWorker && url.endsWith('/draco-worker.js')) return route.fulfill({status: 404, contentType: 'text/javascript', body: 'Missing worker negative control'});
      return route.continue();
    });
    await page.goto(origin + '/probe.html');
    await page.waitForFunction(() => window.__cspResult && window.__cspResult.status !== 'loading', null, {timeout: 25_000});
    const outcome = await page.evaluate(() => window.__cspResult);
    await page.waitForLoadState('networkidle');
    const pass = missingWorker
      ? outcome.status === 'failure' && outcome.message.startsWith('Basketball Draco worker:') && outcome.elapsedMilliseconds < 10_000
      : outcome.status === 'success' && outcome.clips.length === 15 && outcome.clips.every(clip => clip.tracks === 21) &&
        errors.length === 0 && failedRequests.length === 0 && workers.length === 2 && workers.every(url => url === '/runtime/vendor/draco/draco-worker.js');
    results.push({round: round + 1, missingWorker, pass, outcome, workers, errors, failedRequests, requests});
    console.log(`${pass ? 'PASS' : 'FAIL'} ${missingWorker ? 'missing-worker rejection control' : `exact CSP context ${round + 1}`}: ${outcome.status}, ${outcome.clips?.length || 0} clips, ${workers.length} static workers`);
    await context.close();
  }
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
const pass = results.every(result => result.pass), testedAtUTC = new Date().toISOString();
const report = `# התאמה ל־CSP של המשחק\n\nתוצאה: **${pass ? 'PASS' : 'FAIL'}** · ${testedAtUTC}.\n\n` +
  `מדיניות המשחק נקראה ללא שינוי מתוך workout/island/index.html והוגשה ככותרת HTTP למסמך הבדיקה. לא נוספו blob:, eval או wasm-unsafe-eval ל־script-src.\n\n\`\`\`text\n${policy}\n\`\`\`\n\n` +
  `${rounds} הקשרים חדשים × 15 קליפים נמסרים, עם פענוח Draco ו־WebP מקומי, 21 ערוצי אנימציה ושני Workers סטטיים מאותו מקור בכל הקשר. כל כשל בקשה או שגיאת CSP מכשילים את המקרים החיוביים.\n\n` +
  `| מקרה | תוצאה | קליפים | Workers סטטיים | כשלים בבקשות | זמן, ms |\n|---|---|---:|---:|---:|---:|\n` +
  results.map(result => `| ${result.missingWorker ? '404 של Worker — ביקורת שלילית' : result.round} | ${result.pass ? 'PASS' : 'FAIL'} | ${result.outcome.clips?.length || 0} | ${result.workers.length} | ${result.failedRequests.length} | ${result.outcome.elapsedMilliseconds.toFixed(1)} |`).join('\n') +
  `\n\nהביקורת השלילית מחזירה 404 רק לקובץ ה־Worker במכוון. הטעינה חייבת להידחות עם הודעת Worker בתוך 10 שניות; deadline אינו נחשב לתוצאה תקינה.\n\n` +
  `ה־Worker הסטטי מבוסס על minigames/hoops-draco-worker.mjs הקיים; גוף פרוטוקול r160 הועתק ללא שינוי, ורק נתיב importScripts הותאם. המתאם שומר קריאה ישירה של Response עבור קובץ WASM ואת מגבלת שני ה־Workers.\n\n` +
  `SHA-256 ספרייה: \`${librarySha256}\`.\n\nSHA-256 Worker: \`${workerSha256}\`.\n\n` +
  `תוצאות מלאות, מדיניות, כתובות Worker ושגיאות הביקורת השלילית נמצאות בקובץ JSON הדחוס שליד דוח זה.\n\nשחזור:\n\n\`\`\`sh\nnode workout/island/design/hoops-motion-v8/source/verify-csp.mjs --rounds 8\n\`\`\`\n`;
await mkdir(dirname(output), {recursive: true});
await writeFile(output, report);
await writeFile(output.replace(/\.md$/i, '') + '.json.gz', gzipSync(JSON.stringify({testedAtUTC, policy, librarySha256, workerSha256, results}), {level: 9}));
if (!pass) process.exitCode = 1;
