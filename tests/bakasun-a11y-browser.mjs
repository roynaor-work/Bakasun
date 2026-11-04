import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* Audit 02/11/2026 findings 01-07, 16 in a real Chromium, under the shipped CSP (read from index.html, served unchanged).
   Runs with ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chromium>, like the other browser suites. */
const enabled = process.env.ISLAND_CSP_BROWSER === '1' && !!process.env.ISLAND_PLAYWRIGHT;
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const ROUTES = ['today', 'lead', 'cases', 'clients', 'calls', 'tasks', 'search', 'settings', 'more', 'suppliers', 'quotes', 'groups', 'money', 'notes', 'assist', 'receipts', 'help', 'share', 'dashboard', 'calendar', 'contracts', 'budget', 'files', 'notifications', 'board', 'templates', 'import'];

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

test('audit 01-07, 16: poisoned backup, CSP, dialog, labels, buttons, focus and title in Chromium', { skip: !enabled, timeout: 300000 }, async () => {
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
    // the shipped policy must be present, and the old inline theme script must be gone
    const html = await (await fetch(base + 'index.html')).text();
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.doesNotMatch(html, /<script>(?!\s*<\/script>)[^<]/);
    await page.goto(base + 'index.html#/today');
    await page.waitForSelector('#app h1');

    // 01: the audit's exact reproduction
    await page.evaluate(async () => {
      const { db } = await import('/js/store.js');
      db.importJson(JSON.stringify({
        calls: [{ id: 'audit-call', name: 'בדיקה', status: 'todo', attempts: '<img src=x onerror="window.__auditXss=1">', updated: '2999-01-01T00:00:00.000Z' }],
        notes: [{ id: 'audit-note', text: 'בדיקה', about: 'client', aboutLabel: 'לקוח', aboutId: 'audit" onclick="window.__auditNoteXss=1', updated: '2999-01-01T00:00:00.000Z' }]
      }));
    });
    for (const r of ['calls', 'notes']) {
      await page.goto(base + 'index.html#/' + r); await page.waitForSelector('#app h1'); await page.waitForTimeout(300);
      const found = await page.evaluate(() => ({ xss: window.__auditXss, noteXss: window.__auditNoteXss,
        handlers: [...document.querySelectorAll('#app *')].filter(e => [...e.attributes].some(a => /^on/i.test(a.name))).length, imgs: document.querySelectorAll('#app img[src="x"]').length }));
      assert.deepEqual(found, { xss: undefined, noteXss: undefined, handlers: 0, imgs: 0 }, r);
    }

    // 02: every screen opens under the CSP with no violations and no errors
    for (const r of ROUTES) { await page.goto(base + 'index.html#/' + r); await page.waitForSelector('#app > :not(noscript)', { timeout: 8000 }).catch(() => problems.push('no content ' + r)); await page.waitForTimeout(120); }
    assert.deepEqual(await page.evaluate(() => window.__csp || []), [], 'CSP violations');
    assert.deepEqual(problems, []);

    // 07: title, focus and live announcement after navigation
    await page.goto(base + 'index.html#/today'); await page.waitForSelector('#app h1');
    await page.evaluate(() => { location.hash = '#/notes'; }); await page.waitForTimeout(300);
    const nav = await page.evaluate(() => ({ title: document.title, tag: document.activeElement.tagName, h1: document.querySelector('#app h1').textContent.trim(), live: document.getElementById('route-live')?.textContent }));
    assert.equal(nav.tag, 'H1'); assert.ok(nav.title.startsWith(nav.h1) && nav.title !== 'באקה סאן'); assert.ok(nav.live.includes(nav.h1));

    // 03: dialog semantics, Tab trap, Escape, focus returns to the opener
    await page.goto(base + 'index.html#/calls'); await page.waitForSelector('#new');
    await page.focus('#new'); await page.keyboard.press('Enter');
    await page.waitForSelector('.modal [role=dialog]');
    const d = await page.evaluate(() => { const f = document.querySelector('.modal [role=dialog]'); return { modal: f.getAttribute('aria-modal'), label: document.getElementById(f.getAttribute('aria-labelledby'))?.tagName }; });
    assert.deepEqual(d, { modal: 'true', label: 'H2' });
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => !!document.activeElement.closest('.modal')), 'focus escaped the dialog'); }
    await page.keyboard.press('Shift+Tab'); assert.ok(await page.evaluate(() => !!document.activeElement.closest('.modal')));
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    assert.equal(await page.locator('.modal').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'new');

    // 05: accessible names
    await page.goto(base + 'index.html#/receipts'); await page.waitForSelector('#month');
    assert.ok((await page.getAttribute('#month', 'aria-label')).length > 0);
    await page.goto(base + 'index.html#/money'); await page.waitForSelector('#ym');
    assert.ok((await page.getAttribute('#ym', 'aria-label')).length > 0);
    await page.goto(base + 'index.html#/assist'); await page.waitForSelector('#dl', { state: 'attached' }).catch(() => {});
    if (await page.locator('#dl').count()) assert.ok((await page.getAttribute('#dl', 'aria-label')).length > 0);

    // 06: keyboard-operable receipt buttons that open the file chooser
    await page.goto(base + 'index.html#/receipts'); await page.waitForSelector('#snapBtn');
    assert.equal(await page.evaluate(() => [document.getElementById('snapBtn').tagName, document.getElementById('pickBtn').tagName]).then(x => x.join()), 'BUTTON,BUTTON');
    for (const id of ['snapBtn', 'pickBtn']) {
      let chooser = null; // the screen may re-render once while the page settles under load: refocus and retry
      for (let i = 0; i < 4 && !chooser; i++) {
        await page.waitForTimeout(300); await page.focus('#' + id);
        chooser = await Promise.all([page.waitForEvent('filechooser', { timeout: 4000 }), page.keyboard.press('Enter')]).then(r => r[0], () => null);
      }
      assert.ok(chooser, id);
    }

    // 16: the company details are a real description list
    await page.goto(base + 'index.html#/settings'); await page.waitForSelector('dl.kv');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('dt')].filter(e => e.parentElement.tagName !== 'DL').length), 0);

    // 04: computed contrast of the primary button in both themes
    const ratio = async theme => page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      const b = document.createElement('button'); b.className = 'btn primary'; document.body.appendChild(b);
      const cs = getComputedStyle(b); const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
      const L = c => { const [r, g, bl] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * bl; };
      const a = L(rgb(cs.backgroundColor)), f = L(rgb(cs.color)); b.remove();
      return (Math.max(a, f) + .05) / (Math.min(a, f) + .05);
    }, theme);
    assert.ok(await ratio('light') >= 4.5); assert.ok(await ratio('dark') >= 4.5);

    // phone screenshots for manual review (not asserted)
    if (process.env.BAKASUN_SHOTS) for (const [w, h] of [[390, 844], [320, 740]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const r of ['today', 'calls', 'receipts', 'settings', 'notes']) { await page.goto(base + 'index.html#/' + r); await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.BAKASUN_SHOTS}/${r}-${w}.png` }); }
    }
  } finally { await browser.close(); server.close(); }
});
