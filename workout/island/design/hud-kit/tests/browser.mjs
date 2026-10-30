// Real browser checks; only the test runner requires Playwright.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const out = resolve(process.env.HUD_TEST_OUT ?? resolve(root, 'verification'));
let pw;
try { pw = await import('playwright'); }
catch { pw = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE ?? resolve(dirname(process.execPath), '../node_modules/playwright'), 'index.mjs')).href); }
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const rel = relative(root, path);
    if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('Outside test root');
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' })[extname(path)] ?? 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
const launch = { headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] };
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launch.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
else if (process.argv.includes('--chrome')) launch.channel = 'chrome';
let browser;
const report = { args: launch.args, cases: [], checks: [] };
try {
  browser = await pw.chromium.launch(launch);
  report.browser = browser.version();
  await mkdir(out, { recursive: true });
  const errors = [], remote = [];
  const context = await browser.newContext({ hasTouch: true, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { remote.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(r.status() + ' ' + r.url()); });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const dir of ['rtl', 'ltr']) for (const safe of [0, 24]) for (const theme of ['soccer', 'hoops', 'alpine']) {
      await page.goto(origin + '/demo.html?static');
      await page.waitForFunction(() => document.querySelector('.ih-score'));
      await page.evaluate(({ dir, safe }) => {
        document.documentElement.dir = dir;
        for (const edge of ['top', 'right', 'bottom', 'left']) document.body.style.setProperty('--ih-safe-' + edge, safe + 'px');
      }, { dir, safe });
      await page.selectOption('#theme', theme);
      // Reserve space for the power meter while charging, the largest live layout.
      await page.evaluate(async () => { const d = await import('./demo.mjs'); d.states.power.visible = true; d.states.power.value = .68; d.states.primary.loading = true; d.states.primary.charge = .68; d.render(); });
      for (const event of ['goal', 'basket', 'fall']) {
        await page.selectOption('#event', event);
        await checkLayout('live', `${viewport.width}x${viewport.height} ${dir} safe=${safe} ${theme}/${event}`);
      }
      if (dir === 'rtl' && safe === 24) await page.screenshot({ path: resolve(out, `${theme}-${viewport.width}x${viewport.height}.png`) });
      for (const mode of ['pause', 'result']) {
        await page.selectOption('#screen', mode);
        await checkLayout(mode, `${viewport.width}x${viewport.height} ${dir} safe=${safe} ${theme}`);
        if (dir === 'rtl' && safe === 24 && theme === 'soccer') await page.screenshot({ path: resolve(out, `${mode}-${viewport.width}x${viewport.height}.png`) });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog[open]').count(), 0, 'Escape routes through callback');
      }
      report.cases.push({ ...viewport, dir, safe, theme });
    }
  }
  async function checkLayout(mode, label) {
    const issues = await page.evaluate(mode => {
      const issues = [], w = innerWidth, h = innerHeight;
      if (document.documentElement.scrollWidth > w || document.documentElement.scrollHeight > h) issues.push('document overflow');
      const selectors = mode === 'live'
        ? ['.ih-scoreboard', '.ih-pause', '.ih-event', '.ih-stick', '.ih-power', '.ih-speed', '.ih-action', '.demo-note']
        : ['dialog[open] h2', 'dialog[open] .ih-result-value', 'dialog[open] .ih-stars', 'dialog[open] .ih-dialog-subtitle', 'dialog[open] .ih-result-stats', 'dialog[open] button'];
      const rects = [...document.querySelectorAll(selectors.join(','))].filter(el => el.checkVisibility()).map(el => ({ name: el.className, rect: el.getBoundingClientRect() }));
      for (let i = 0; i < rects.length; i++) {
        const a = rects[i], r = a.rect;
        if (r.left < -.5 || r.top < -.5 || r.right > w + .5 || r.bottom > h + .5) issues.push('outside: ' + a.name);
        for (let j = i + 1; j < rects.length; j++) {
          const b = rects[j], s = b.rect;
          if (Math.min(r.right, s.right) - Math.max(r.left, s.left) > .5 && Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > .5) issues.push('overlap: ' + a.name + '/' + b.name);
        }
      }
      const buttons = mode === 'live' ? document.querySelectorAll('button,select') : document.querySelectorAll('dialog[open] button');
      for (const el of buttons) if (el.checkVisibility() && !el.closest('dialog:not([open])')) {
        const r = el.getBoundingClientRect(); if (r.width < 44 || r.height < 44) issues.push('touch target: ' + el.className);
      }
      for (const el of document.querySelectorAll('.ih-numeric')) if (getComputedStyle(el).direction !== 'ltr' || !getComputedStyle(el).fontVariantNumeric.includes('tabular-nums')) issues.push('numeric direction/font');
      return issues;
    }, mode);
    assert.deepEqual(issues, [], label + ' ' + mode);
  }
  // Detailed behavioral and allocation-sensitive DOM checks in one stable page.
  await page.goto(origin + '/demo.html?static');
  await page.waitForFunction(() => document.querySelector('.ih-score'));
  const result = await page.evaluate(async () => {
    const HUD = await import('./index.mjs'), demo = await import('./demo.mjs');
    const checks = [];
    function ok(value, label) { if (!value) throw new Error(label); checks.push(label); }
    let records = 0;
    const observer = new MutationObserver(list => { records += list.length; });
    observer.observe(document.body, { subtree: true, attributes: true, characterData: true, childList: true });
    for (let i = 0; i < 1000; i++) demo.render();
    records += observer.takeRecords().length; observer.disconnect();
    ok(records === 0, '1000 identical updates produce zero DOM mutations');
    const oldRect = document.querySelector('.ih-action').getBoundingClientRect();
    demo.states.primary.label = 'חסימה'; demo.states.primary.icon = 'block'; demo.render();
    const rect = document.querySelector('.ih-action').getBoundingClientRect();
    ok(rect.x === oldRect.x && rect.y === oldRect.y && rect.width === oldRect.width && rect.height === oldRect.height, 'label/icon swap preserves action target');
    ok(getComputedStyle(document.querySelector('.ih-action .ih-icon')).transitionDuration === '0s', 'reduced motion removes press transitions');
    demo.states.score.shotSeconds = 0; demo.render(); ok(!document.querySelector('.ih-shot-clock').hidden, 'zero shot clock remains visible');
    demo.states.score.shotSeconds = null; demo.render(); ok(document.querySelector('.ih-shot-clock').hidden, 'missing shot clock is hidden');
    const host = document.createElement('div'); host.className = 'test-host'; document.body.append(host);
    let pressed = 0, released = 0, activated = 0, cancelled = false;
    const action = HUD.actionButton.create(host, { onPress() { pressed++; }, onRelease(c) { released++; cancelled = c; }, onActivate() { activated++; } });
    const b = host.querySelector('button');
    b.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    action.update({ disabled: true }); ok(pressed === 1 && released === 1 && cancelled, 'disable cancels held action');
    action.update({}); b.click(); ok(activated === 1, 'native click activates once');
    action.destroy(); action.destroy(); b.click(); action.update({}); ok(activated === 1 && !host.children.length, 'destroy is idempotent and listeners are removed');
    let x = 0, y = 0, active = false;
    const stick = HUD.joystick.create(host, { onChange(a, b, c) { x = a; y = b; active = c; } });
    const s = host.querySelector('button');
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    ok(x > 0 && y < 0 && Math.hypot(x, y) < 1.001, 'keyboard diagonal normalized without RTL mirroring');
    window.dispatchEvent(new Event('blur')); ok(x === 0 && y === 0 && !active, 'blur releases stick');
    stick.destroy();
    const screen = HUD.resultScreen.create(host);
    screen.update({ visible: true, outcome: 'loss', value: '1 : 3', stars: 8 });
    ok(host.querySelector('h2').textContent === 'עוד ניסיון?', 'loss has appropriate heading');
    ok(host.querySelectorAll('[data-earned="true"]').length === 3, 'stars clamp to three');
    screen.update({ visible: true, outcome: 'incomplete', value: '00:42.18' });
    ok(host.querySelector('h2').textContent === 'ננסה שוב', 'incomplete has appropriate heading');
    screen.destroy(); host.remove();
    for (const name of Object.keys(HUD)) {
      const h = document.createElement('div'); document.body.append(h);
      const a = HUD[name].create(h), b = HUD[name].create(h);
      a.destroy(); b.update({}); ok(h.children.length === 1, name + ' instances have independent lifetimes');
      b.destroy(); b.update({}); ok(h.children.length === 0, name + ' updates after destroy are inert'); h.remove();
    }
    return checks;
  });
  report.checks.push(...result);
  // Real pointer capture, pointercancel and keyboard focus in native modals.
  const stick = page.locator('.ih-stick'), r = await stick.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width + 30, r.y + r.height / 2);
  assert.match(await page.locator('#input-note').textContent(), /1, 0/);
  await page.dispatchEvent('.ih-stick', 'pointercancel', { pointerId: 1 });
  assert.match(await page.locator('#input-note').textContent(), /שוחרר/); await page.mouse.up();
  const actionRect = await page.locator('.ih-primary').boundingBox();
  await page.mouse.move(actionRect.x + 20, actionRect.y + 20); await page.mouse.down();
  assert.equal(await page.locator('.ih-primary').getAttribute('data-held'), 'true');
  await page.dispatchEvent('.ih-primary', 'pointercancel', { pointerId: 1 });
  assert.equal(await page.locator('.ih-primary').getAttribute('data-held'), 'false'); await page.mouse.up();
  await page.locator('.ih-pause').click();
  assert.equal(await page.evaluate(() => document.activeElement.closest('dialog') !== null), true);
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog')), true); }
  await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.activeElement.classList.contains('ih-pause')), true);
  report.checks.push('real pointer drag and pointercancel release stick/action', 'modal traps focus and restores pause button');
  assert.deepEqual(remote, [], 'no external network requests'); assert.deepEqual(errors, [], 'no browser errors');
  report.checks.push('no external network requests or browser errors');
  await context.close();
  report.passed = true;
  await writeFile(resolve(out, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, layouts: report.cases.length * 5, behaviorChecks: report.checks.length, out }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
