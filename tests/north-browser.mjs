import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';

/* חנות המארזים (north/): מסלול קנייה מלא בדפדפן אמיתי בשני גדלים, מסנני כשר, אזור משלוח, נגישות (axe, אם זמין) וביצועים בטלפון איטי.
   רץ עם ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chromium>, כמו שאר חבילות הדפדפן.
   אופציונלי: AXE_CORE=<נתיב axe.min.js>. NORTH_PERF_OUT=<קובץ JSON> כותב את טבלת הביצועים.
   בלי הזמנות אמיתיות: כל קריאה ל-Supabase מיורטת ומוחזרת כתשובה מדומה; כל בקשה חיצונית אחרת נספרת. */
const enabled = process.env.ISLAND_CSP_BROWSER === '1' && !!process.env.ISLAND_PLAYWRIGHT;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, s) => {
      let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
      const h = { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }; let b = fs.readFileSync(f);
      if (/html|javascript|css|json|svg/.test(h['Content-Type']) && /gzip/.test(q.headers['accept-encoding'] || '')) { b = zlib.gzipSync(b); h['Content-Encoding'] = 'gzip'; }
      s.writeHead(200, h); s.end(b);
    }).listen(0, '127.0.0.1', () => res({ srv, base: `http://127.0.0.1:${srv.address().port}/north/` }));
  });
}
async function newCtx(browser, size, { adult = true } = {}) {
  const c = await browser.newContext({ viewport: size === 'm' ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: size === 'm', hasTouch: size === 'm', locale: 'he-IL' });
  if (adult) await c.addInitScript(() => { try { localStorage.setItem('north.adult', '1'); } catch { /* */ } });
  const log = { console: [], external: [], posts: [] };
  c.on('page', p => { p.on('console', m => { if (['error', 'warning'].includes(m.type())) log.console.push(m.text()); }); p.on('pageerror', e => log.console.push('pageerror ' + e.message)); });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (/supabase\.co/.test(u)) { log.posts.push(r.request().method() + ' ' + u); return r.fulfill({ status: /grow-pay/.test(u) ? 500 : 201, body: '{}', contentType: 'application/json' }); }
    log.external.push(u); return r.abort();
  });
  return { c, log };
}

test('north: מסלול קנייה מלא (סל, חריטה, בונה, קופה, תודה), מסנן כשר ואזור משלוח, בשני גדלים', { skip: !enabled, timeout: 300000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href);
  const { srv, base } = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    for (const size of ['m', 'd']) {
      const tag = m => `[${size}] ${m}`;
      const { c, log } = await newCtx(browser, size, { adult: false }); const p = await c.newPage();
      /* שער גיל: דיאלוג נגיש */
      await p.goto(base); await p.waitForSelector('#g-yes');
      assert.equal(await p.getAttribute('#gate .box', 'role'), 'alertdialog', tag('שער גיל כדיאלוג'));
      assert.equal(await p.evaluate(() => document.activeElement.id), 'g-yes', tag('מיקוד בכפתור הראשי'));
      await p.keyboard.press('Escape'); assert.equal(await p.locator('#gate .gate').count(), 1, tag('Escape לא סוגר'));
      for (let i = 0; i < 5; i++) await p.keyboard.press('Tab');
      assert.ok(await p.evaluate(() => !!document.activeElement.closest('#gate')), tag('המיקוד נשאר בשער'));
      await p.click('#g-yes'); assert.equal(await p.locator('#gate .gate').count(), 0);
      /* מסנן כשר */
      await p.waitForSelector('#grid .card'); const all = await p.locator('#grid .card').count();
      await p.click('#kosherchip'); const k = await p.locator('#grid .card').count();
      assert.ok(k < all && k > 0 && await p.locator('#grid .nk').count() === 0, tag(`מסנן כשר ${k}/${all}`));
      assert.equal(await p.getAttribute('#kosherchip', 'aria-pressed'), 'true'); await p.click('#kosherchip');
      /* חריטה: חובה לכתוב טקסט, תצוגה חיה */
      await p.goto(base + '#/p/flask'); await p.waitForSelector('#paddbtn');
      await p.click('#paddbtn'); assert.equal(await p.evaluate(() => document.activeElement.id), 'pengrave', tag('חריטה חובה'));
      await p.fill('#pengrave', 'לאבא 2026'); assert.match(await p.textContent('#engtxt'), /לאבא/);
      await p.fill('#pnote', 'מזל טוב'); assert.equal(await p.locator('#cardprev:not(.hide)').count(), 1);
      await p.click('#paddbtn'); await p.waitForSelector('#drawer.open');
      assert.ok(await p.evaluate(() => !!document.activeElement.closest('#drawer')), tag('מיקוד נכנס למגירה'));
      await p.keyboard.press('Escape'); assert.equal(await p.locator('#drawer.open').count(), 0);
      /* שמירה ברענון: סל ובונה */
      await p.reload(); assert.equal(await p.textContent('#cartn'), '1', tag('סל נשמר'));
      await p.goto(base + '#/#build'); await p.waitForSelector('#bsteps [data-bopt]');
      await p.click('#bsteps [data-bopt]:first-child'); await p.fill('#bnote', 'לחיים');
      await p.reload(); await p.waitForSelector('#bnote');
      assert.equal(await p.inputValue('#bnote'), 'לחיים', tag('ברכת בונה נשמרה')); assert.ok(await p.locator('#bsteps .opt.on').count() >= 1);
      assert.equal(await p.locator('#bcardprev:not(.hide)').count(), 1, tag('תצוגת כרטיס בבונה'));
      await p.click('#baddbtn'); await p.waitForSelector('#drawer.open'); await p.keyboard.press('Escape');
      /* קופה: שגיאות ליד שדות, חיווי התקדמות, מחוץ לאזור */
      await p.goto(base + '#/checkout'); await p.waitForSelector('#coform');
      assert.equal(await p.locator('#prog li').count(), 4);
      await p.click('#paybtn'); assert.ok(await p.locator('.ferr').count() >= 3, tag('שגיאות ליד שדות'));
      assert.equal(await p.evaluate(() => document.activeElement.id), 'errsum');
      await p.check('input[name=method][value=north]');
      await p.fill('#co-name', 'בדיקה בדיקה'); await p.fill('#co-phone', '050-1234567'); await p.fill('#co-city', 'תל אביב'); await p.fill('#co-street', 'הרצל 1');
      await p.evaluate(() => { for (const n of ['adult', 'terms', 'kosherOk']) { const e = document.querySelector(`input[name=${n}]`); if (e && !e.checked) e.click(); } });
      await p.click('#paybtn'); assert.match(await p.locator('.field:has(#co-city) .ferr').textContent(), /ברשימה/, tag('מחוץ לאזור נחסם'));
      assert.equal(log.posts.filter(x => /north_orders/.test(x)).length, 0, tag('לא נשלחה הזמנה מחוץ לאזור'));
      await p.check('input[name=method][value=pickup]'); await p.check('input[name=pay][value=cash]');
      await p.evaluate(() => { for (const n of ['adult', 'terms', 'kosherOk']) { const e = document.querySelector(`input[name=${n}]`); if (e && !e.checked) e.click(); } });
      assert.equal(await p.locator('#prog li.done').count(), 4, tag('כל השלבים מסומנים'));
      await p.click('#paybtn'); await p.waitForURL(/#\/thanks\//);
      assert.ok(log.posts.some(x => /north_orders/.test(x)), tag('הזמנה נשמרת (מדומה)'));
      assert.match(await p.textContent('.thanks'), /תודה/);
      /* טופס עסקים */
      await p.goto(base + '#/#biz'); await p.waitForSelector('#bizform');
      await p.click('#bizform button[type=submit]'); assert.equal(await p.locator('#bizform .ferr').count(), 2);
      await p.fill('#biz-name', 'בדיקה'); await p.fill('#biz-phone', '0501234567'); await p.click('#bizform button[type=submit]'); await p.waitForSelector('#bizok');
      assert.ok(log.posts.some(x => /north_survey/.test(x)));
      assert.deepEqual(log.console, [], tag('קונסול נקי')); assert.deepEqual(log.external, [], tag('אין בקשות חיצוניות'));
      await c.close();
    }
  } finally { await browser.close(); srv.close(); }
});

test('north: axe על כל מסך, בלי ליקוי קריטי/חמור/בינוני (אם axe זמין)', { skip: !enabled || !process.env.AXE_CORE, timeout: 300000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href);
  const axe = fs.readFileSync(process.env.AXE_CORE, 'utf8');
  const { srv, base } = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    for (const size of ['m', 'd']) {
      const { c } = await newCtx(browser, size); const p = await c.newPage(); const bad = [];
      for (const [name, url, pre] of [['home', ''], ['product', '#/p/flask'], ['drawer', '#/p/single-malt', '#paddbtn'], ['checkout', '#/checkout'], ['thanks', '#/thanks/NOPE'], ['legal', 'legal.html'], ['survey', 'survey.html']]) {
        await p.goto(base + url); await p.waitForTimeout(500); if (pre) { await p.click(pre); await p.waitForTimeout(300); }
        await p.addScriptTag({ content: axe });
        const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(x => `${x.id}(${x.impact}) ${x.nodes[0].target.join(' ')}`));
        if (v.length) bad.push(`${name}: ${v.join('; ')}`);
      }
      assert.deepEqual(bad, [], `[${size}] axe`); await c.close();
    }
    /* שער הגיל (כל התוכן מאחוריו inert) */
    const { c } = await newCtx(browser, 'm', { adult: false }); const p = await c.newPage(); await p.goto(base); await p.waitForSelector('#g-yes'); await p.addScriptTag({ content: axe });
    assert.deepEqual(await p.evaluate(async () => (await axe.run(document)).violations.map(x => x.id)), [], 'axe על שער הגיל');
  } finally { await browser.close(); srv.close(); }
});

test('north: טעינה בטלפון איטי (CPU x4, 200KB/s): LCP עד 3 שניות, בלי בקשות חיצוניות', { skip: !enabled, timeout: 300000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href);
  const { srv, base } = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const table = {};
  try {
    for (const [name, hash] of [['home', ''], ['product', '#/p/single-malt'], ['checkout', '#/checkout']]) {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'he-IL' });
        await c.addInitScript(() => { try { localStorage.setItem('north.adult', '1'); } catch { /* */ } window.__lcp = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); });
        await c.route(/supabase\.co/, r => r.fulfill({ status: 201, body: '{}' }));
        const p = await c.newPage(); let bytes = 0; const ext = new Set();
        const cdp = await c.newCDPSession(p); await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; });
        cdp.on('Network.responseReceived', e => { const u = new URL(e.response.url); if (u.hostname !== '127.0.0.1') ext.add(u.host); });
        await p.goto(base + hash, { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(2500);
        runs.push({ lcp: Math.round(await p.evaluate(() => window.__lcp)), kb: Math.round(bytes / 1024), ext: [...ext] }); await c.close();
      }
      runs.sort((a, b) => a.lcp - b.lcp); table[name] = runs[1];
      assert.deepEqual(runs[1].ext, [], `${name}: בקשות חיצוניות`);
      assert.ok(runs[1].lcp <= 3000, `${name}: LCP ${runs[1].lcp}ms מעל 3000`);
    }
    if (process.env.NORTH_PERF_OUT) fs.writeFileSync(process.env.NORTH_PERF_OUT, JSON.stringify(table, null, 1));
  } finally { await browser.close(); srv.close(); }
});

test('north: תמונות v4 שלא נטענות נופלות לתמונת v2 של אותו מארז, ובאנר אירוע בלי עותק מוסתר', { skip: !enabled, timeout: 120000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href);
  const { srv, base } = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const { c } = await newCtx(browser, 'm');
    await c.route(/\/img\/s\/v4\//, r => r.abort());
    const p = await c.newPage();
    await p.goto(base, { waitUntil: 'load' });
    for (let y = 0; y < 6; y++) { await p.evaluate(n => document.querySelector('#grid').scrollIntoView(), 0); await p.mouse.wheel(0, 700); await p.waitForTimeout(300); }
    await p.$$eval('#grid .card img', is => is.forEach(i => i.scrollIntoView()));
    await p.waitForFunction(() => [...document.querySelectorAll('#grid .card img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 20000 });
    const srcs = await p.$$eval('#grid .card img', is => is.map(i => i.currentSrc));
    assert.ok(srcs.length >= 12 && srcs.every(s => /\/img\/s\/v2\//.test(s)), 'כרטיסים חזרו ל-v2: ' + srcs.slice(0, 2));
    await p.click('[data-occ="work"]');
    await p.waitForFunction(() => document.querySelectorAll('#occslot .occban').length === 0, null, { timeout: 15000 });
    await p.goto(base + '#/p/flask', { waitUntil: 'load' });
    await p.waitForFunction(() => { const i = document.querySelector('#pmain'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
    assert.match(await p.$eval('#pmain', i => i.currentSrc), /\/img\/s\/v2\//);
    await c.close();
  } finally { await browser.close(); srv.close(); }
});
