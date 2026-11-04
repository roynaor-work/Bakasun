import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { ROYIKI, ROYIKI_SPEED } from '../workout/js/royiki-data.js';
import { ROYIKI_IDS, hasRoyiki, uniqueIds } from '../workout/js/royiki.js';
import { EXERCISES } from '../workout/js/exercises.js';
import { cycleMs } from '../workout/js/figure.js';
import { islandChromium } from './helpers/island-browser.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const W = path.join(root, 'workout');
const FIRST = ['push-ups', 'crunches', 'plank', 'bicycle', 'jumping-jacks', 'squat-jumps', 'high-knees', 'side-hops', 'leg-raises', 'squats', 'jump-rope', 'burpees'];
const WANTED = EXERCISES.map(e => e.id); // כל הקטלוג: 12 מ-royiki-style + 38 מ-royiki-style-2
const SOURCES = ['design/royiki-style', 'design/royiki-style-2'];
const sourceOf = async id => { for (const d of SOURCES) { try { return await readFile(path.join(W, d, 'animations', id + '.svg'), 'utf8'); } catch { /* */ } } throw new Error(id + ' has no design source'); };

test('all 50 exercises have a royiki animation, each matching a real exercise', () => {
  assert.equal(WANTED.length, 50);
  assert.deepEqual([...ROYIKI_IDS].sort(), [...WANTED].sort());
  assert.ok(FIRST.every(hasRoyiki));
  for (const id of WANTED) {
    const ex = EXERCISES.find(e => e.id === id);
    assert.ok(ex, id + ' missing from the exercise catalog');
    assert.ok(hasRoyiki(id));
    // מחזור ה-SVG הוא מחזור התרגיל בקצב ROYIKI_SPEED (עד עיגול), כדי שספירת החזרות תתאים לסיבוב
    assert.ok(Math.abs(ROYIKI[id].src - cycleMs(ex.frames)) <= 2, `${id}: source cycle ${ROYIKI[id].src} vs frames ${cycleMs(ex.frames)}`);
    assert.ok(Math.abs(ROYIKI[id].ms - ROYIKI[id].src / ROYIKI_SPEED) <= 2, id + ' svg duration');
  }
  assert.equal(hasRoyiki('toString'), false);
  assert.equal(hasRoyiki('lunges-xyz'), false);
});

test('every SVG exists, is local-only, self-contained, and identical to the design source', async () => {
  const files = (await readdir(path.join(W, 'royiki'))).filter(f => f.endsWith('.svg')).sort();
  assert.deepEqual(files, WANTED.map(i => i + '.svg').sort());
  let total = 0;
  for (const id of WANTED) {
    const text = await readFile(path.join(W, 'royiki', id + '.svg'), 'utf8');
    assert.equal(text, await sourceOf(id), id + ' drifted from its design source (copy it again)');
    assert.match(text, /<svg[^>]+data-exercise="/);
    assert.match(text, new RegExp(`data-exercise="${id}"`));
    assert.doesNotMatch(text, /<script|<image|<foreignObject|https?:\/\/(?!www\.w3\.org)|xlink:href="(?!#)/i);
    assert.match(text, /<animate/);
    assert.ok((await stat(path.join(W, 'royiki', id + '.svg'))).size < 60000, id + ' over 60KB');
    total += (await stat(path.join(W, 'royiki', id + '.svg'))).size;
  }
  assert.ok(total < 2_000_000, 'total ' + total);
});

test('unique ids keep several copies in one DOM apart', () => {
  const svg = '<svg aria-labelledby="title desc"><defs><path id="neck"/></defs><use href="#neck"/><g fill="url(#neck)"/></svg>';
  const a = uniqueIds(svg, 'r1-'), b = uniqueIds(svg, 'r2-');
  assert.match(a, /id="r1-neck"/); assert.match(a, /href="#r1-neck"/); assert.match(a, /url\(#r1-neck\)/); assert.match(a, /aria-labelledby="r1-title r1-desc"/);
  assert.notEqual(a, b);
});

test('the two design catalogs together list the same 50 animations, with the same durations', async () => {
  const list = [];
  for (const d of SOURCES) {
    const sandbox = { window: {} };
    vm.runInNewContext(await readFile(path.join(W, d, 'catalog.js'), 'utf8'), sandbox);
    list.push(...sandbox.window.ROYIKI_CATALOG.exercises);
  }
  assert.deepEqual(Array.from(list, e => e.id).sort(), [...WANTED].sort());
  for (const e of list) { assert.equal(ROYIKI[e.id].ms, e.durationMs, e.id); assert.equal(ROYIKI[e.id].src, e.sourceCycleMs, e.id); }
});

// ---- דפדפן: מסך תרגיל ב-390×844 (דורש Playwright; בלעדיו מדלגים) ----
let chromium = null;
try { chromium = await islandChromium(); } catch { /* בלי Playwright */ }
const browserTest = chromium ? test : test.skip;

async function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
  const server = createServer(async (req, res) => {
    try {
      let file = path.resolve(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1));
      if (!file.startsWith(root)) throw 0;
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/workout/index.html`, close: () => new Promise(r => server.close(r)) };
}

browserTest('exercise screen shows the royiki animation, counts reps, falls back and the style choice persists', { timeout: 600000 }, async () => {
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-proxy-server'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(90000); // npm test מריץ קבצי דפדפן במקביל; swiftshader איטי בעומס
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    const external = []; page.on('request', r => { const u = new URL(r.url()); if (!['127.0.0.1', ''].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
    await page.goto(srv.url + '#/home');
    // כל 50: SVG נטען, מונפש (הפיקסלים משתנים) ו-onRep נקרא
    for (const id of WANTED) {
      await page.goto(srv.url + '#/exercise/' + id);
      await page.waitForSelector('.exmedia.royiki[data-royiki-ready="true"] svg.royiki-svg', { timeout: 15000 });
      const t = () => page.evaluate(() => document.querySelector('.exmedia.royiki svg').getCurrentTime());
      const a = await t(); let b = a;
      for (let i = 0; i < 25 && b === a; i++) { await page.waitForTimeout(200); b = await t(); } // בעומס (npm test במקביל) המסגרת הראשונה מתעכבת
      assert.notEqual(a, b, id + ' did not animate'); /* ציר הזמן של ה-SMIL מתקדם (צילום פיקסלים איטי מדי ב-swiftshader) */
    }
    assert.equal(await page.locator('.exmedia.stage3d').count(), 0);
    // ספירת חזרות: onRep לפי מחזור ה-SVG
    await page.goto(srv.url + '#/exercise/jump-rope');
    await page.waitForSelector('.exmedia.royiki[data-royiki-ready="true"]');
    const reps = await page.evaluate(async () => {
      const { RoyikiStage } = await import('./js/royiki.js?v=20261010-camera-1');
      const box = document.createElement('div'); document.body.appendChild(box);
      const ex = { id: 'jump-rope', frames: [[{}, 480]] };
      return await new Promise(res => { const s = new RoyikiStage(box, ex, { onReady: st => { let n = 0; const t0 = performance.now(); st.onRep = () => { n++; }; st.play(ex, 2); setTimeout(() => { st.dispose(); res({ n, ms: performance.now() - t0 }); }, 2300); } }); });
    });
    // מחזור = 480/(2*.7) ≈ 343ms → כ-6 חזרות ב-2.3 שניות
    assert.ok(reps.n >= 4 && reps.n <= 8, 'rep count ' + reps.n);
    // "איך עושים את זה": ההסבר פותח ואנימציה ממשיכה
    await page.goto(srv.url + '#/exercise/squats');
    await page.waitForSelector('.exmedia.royiki[data-royiki-ready="true"]');
    await page.click('#help'); await page.waitForSelector('#helpbox .helpcard');
    const h1 = await page.evaluate(() => document.querySelector('.exmedia.royiki svg').getCurrentTime()); await page.waitForTimeout(400);
    assert.notEqual(h1, await page.evaluate(() => document.querySelector('.exmedia.royiki svg').getCurrentTime()));
    // הגדרה: מעבר לתלת-ממד ולמקלות, נשמר אחרי טעינה מחדש
    await page.goto(srv.url + '#/settings');
    await page.selectOption('#animstyle', 'stick');
    await page.reload();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kidfit.v1')).profile.animStyle), 'stick');
    await page.goto(srv.url + '#/exercise/push-ups'); await page.reload();
    await page.waitForSelector('svg.figure'); assert.equal(await page.locator('.exmedia.royiki').count(), 0);
    await page.goto(srv.url + '#/settings'); await page.selectOption('#animstyle', '3d');
    await page.goto(srv.url + '#/exercise/push-ups'); await page.reload();
    await page.waitForSelector('.exmedia.stage3d'); assert.equal(await page.locator('.exmedia.royiki').count(), 0);
    await page.goto(srv.url + '#/settings'); await page.selectOption('#animstyle', 'royiki');
    await page.goto(srv.url + '#/exercise/push-ups'); await page.reload();
    await page.waitForSelector('.exmedia.royiki[data-royiki-ready="true"]');
    // כשל טעינה: נופלים לדמות הקיימת
    await page.evaluate(() => caches.delete('workout-royiki-v1')); /* אחרת הקובץ מגיע מהמטמון ולא מהרשת */
    await page.route('**/workout/royiki/burpees.svg', r => r.abort());
    await page.goto(srv.url + '#/exercise/burpees'); await page.reload();
    await page.waitForSelector('.exmedia.stage3d canvas, svg.figure', { timeout: 15000 });
    assert.equal(await page.locator('.exmedia.royiki').count(), 0);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.close(); }
});
