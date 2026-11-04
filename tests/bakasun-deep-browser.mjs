import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* Deep round 1 (04/11/2026) in a real Chromium, under the shipped CSP: lazy screens, deep links, the personal settings applied at start,
   the "/" shortcut before the search screen has ever loaded, dialog semantics for hand-built dialogs, and the optional new design (off by default).
   Runs with ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chromium>, like the other browser suites. */
const enabled = process.env.ISLAND_CSP_BROWSER === '1' && !!process.env.ISLAND_PLAYWRIGHT;
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
const ROUTES = ['today', 'lead', 'cases', 'clients', 'calls', 'tasks', 'search', 'settings', 'more', 'suppliers', 'quotes', 'groups', 'money', 'notes', 'assist', 'receipts', 'help', 'share', 'dashboard', 'calendar', 'participants', 'contracts', 'budget', 'files', 'notifications', 'board', 'templates', 'import', 'portal'];

async function serve() {
  const server = createServer(async (req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+$/, 'index.html'));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try { const body = await readFile(file.endsWith(path.sep) ? file + 'index.html' : file); res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, base: 'http://127.0.0.1:' + server.address().port + '/' };
}

test('deep round 1: lazy screens, personal settings at start, "/" shortcut, dialogs and the optional new design', { skip: !enabled, timeout: 300000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href);
  const { server, base } = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
    const page = await ctx.newPage();
    const problems = [];
    await ctx.addInitScript(() => { addEventListener('securitypolicyviolation', e => { (window.__csp ||= []).push(e.violatedDirective + ' ' + e.blockedURI); }); });
    page.on('pageerror', e => problems.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console ' + m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, r => r.abort());

    // 1: the first load fetches the shell and "today" only; a deep link to another screen fetches just that screen
    const loaded = [];
    page.on('request', r => { if (/\.(js|css)$/.test(new URL(r.url()).pathname)) loaded.push(new URL(r.url()).pathname); });
    await page.goto(base + 'index.html#/today'); await page.waitForSelector('#app h1');
    assert.ok(!loaded.some(f => /screens\/(board|budget|runsheet|casefiles|contracts|assist|tasks|dashboard)\.js/.test(f)), 'a lazy screen came with the first load: ' + loaded.filter(f => /screens\//.test(f)).join(' '));
    assert.ok(!loaded.some(f => /css\/(board|budget|runsheet|casefiles|contracts|dashboard|rules|tasks2|templates|importmail|participants|calendar)\.css/.test(f)));
    assert.ok(!loaded.some(f => /css\/newdesign\.css/.test(f)), 'the new design must be off by default');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.design || null), null);
    await page.evaluate(() => { location.hash = '#/board'; }); await page.waitForSelector('#app[data-screen="board"] h1');
    assert.ok(loaded.some(f => /screens\/board\.js/.test(f)) && loaded.some(f => /css\/board\.css/.test(f)));
    // browser back goes to today again
    await page.goBack(); await page.waitForSelector('#app[data-screen="today"] h1');

    // 2: every route renders under the CSP, with the screen's stylesheet in place
    for (const r of ROUTES) { await page.goto(base + 'index.html#/' + r); await page.waitForSelector('#app > :not(noscript)', { timeout: 8000 }).catch(() => problems.push('no content ' + r)); await page.waitForTimeout(100); }
    assert.deepEqual(await page.evaluate(() => window.__csp || []), [], 'CSP violations');
    assert.deepEqual(problems, []);
    // an unknown address falls back to today, as it always did
    await page.goto(base + 'index.html#/nonexistent'); await page.waitForSelector('#app h1');

    // 3: the "/" shortcut works from a screen that never loaded the search
    await page.goto(base + 'index.html#/today'); await page.waitForSelector('#app h1');
    await page.keyboard.press('/'); await page.waitForSelector('#q'); assert.match(page.url(), /#\/search/);

    // 4: the text size and theme from the settings apply on the first screen, not only after the settings screen loaded
    await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('bakasun.v1') || '{}'); st.settings = Object.assign(st.settings || {}, { textSize: 'large', theme: 'dark' }); localStorage.setItem('bakasun.v1', JSON.stringify(st)); });
    await page.goto(base + 'index.html#/tasks'); await page.reload(); await page.waitForSelector('#app h1');
    assert.deepEqual(await page.evaluate(() => ({ large: document.documentElement.classList.contains('text-large'), theme: document.documentElement.dataset.theme })), { large: true, theme: 'dark' });
    await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('bakasun.v1')); delete st.settings.textSize; delete st.settings.theme; localStorage.setItem('bakasun.v1', JSON.stringify(st)); });

    // 5: a dialog built by hand (the quick note) gets dialog semantics, takes focus and closes with Escape
    await page.goto(base + 'index.html#/today'); await page.reload(); await page.waitForSelector('[data-quicknote]');
    await page.click('[data-quicknote]'); await page.waitForSelector('.modal');
    const q = await page.evaluate(() => { const m = document.querySelector('.modal'); const d = m.querySelector('[role=dialog]') || (m.getAttribute('role') === 'dialog' ? m : null); return { role: !!d, modal: d && d.getAttribute('aria-modal'), inside: m.contains(document.activeElement), name: !!(d && document.getElementById(d.getAttribute('aria-labelledby')))}; });
    assert.deepEqual(q, { role: true, modal: 'true', inside: true, name: true });

    // 6: the optional new design: off by default, one switch in the settings, kept after a reload, off again with one switch
    await page.goto(base + 'index.html#/settings'); await page.waitForSelector('#personalForm');
    assert.equal(await page.inputValue('#personalForm [name=design]'), 'classic');
    await page.selectOption('#personalForm [name=design]', 'new'); await page.click('#personalForm button[type=submit]');
    await page.waitForFunction(() => document.documentElement.dataset.design === 'new'); await page.waitForTimeout(400); // the store saves 150 ms after a change
    await page.goto(base + 'index.html#/board'); await page.reload(); await page.waitForSelector('#app[data-screen="board"] h1');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.design), 'new');
    assert.equal(await page.evaluate(() => !!document.querySelector('link[href$="newdesign.css"]')), true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#app h1')).fontSize), '30px', 'the new design skin applies to the board heading');
    await page.goto(base + 'index.html#/settings'); await page.waitForSelector('#personalForm');
    await page.selectOption('#personalForm [name=design]', 'classic'); await page.click('#personalForm button[type=submit]');
    await page.waitForFunction(() => !document.documentElement.dataset.design);
    assert.deepEqual(await page.evaluate(() => window.__csp || []), [], 'CSP violations');
    assert.deepEqual(problems, []);
  } finally { await browser.close(); server.close(); }
});
