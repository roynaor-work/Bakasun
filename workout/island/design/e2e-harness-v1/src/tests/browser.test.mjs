import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, symlink, rm, readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {serveIsland} from '../server.mjs';
import {launchBrowser, until} from '../runtime.mjs';
import {TouchInput} from '../touch.mjs';
import {monitor, diagnosticChecks} from '../diagnostics.mjs';

test('static server preserves original CSP/bytes and denies traversal/symlink escapes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'island-server-'));
  const html = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">original';
  await writeFile(path.join(root, 'index.html'), html);
  await symlink('/etc/passwd', path.join(root, 'escape.txt'));
  const server = await serveIsland({root});
  try {
    const response = await fetch(server.url);
    assert.equal(await response.text(), html);
    assert.equal(response.headers.get('content-security-policy'), null, 'meta CSP must not be replaced by an invented header');
    assert.equal((await fetch(server.url + 'escape.txt')).status, 403);
    assert.ok((await fetch(server.url + '%2e%2e%2f%2e%2e%2fetc/passwd')).status >= 400);
  } finally { await server.close(); await rm(root, {recursive: true}); }
});

test('real Chromium: trusted CDP multitouch, touch scrolling, no WASM in frame/worker, and nonzero CSP detection', {timeout: 90000}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'island-browser-'));
  const policy = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; frame-src 'self'";
  await writeFile(path.join(root, 'index.html'), `<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="icon" href="icon.svg"><link rel="stylesheet" href="style.css"><div id="scroll"><button id="near">near</button><div class="spacer"></div><button id="far">far</button></div><iframe src="child.html"></iframe><script src="app.js"></script>`);
  await writeFile(path.join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(path.join(root, 'child.html'), `<meta http-equiv="Content-Security-Policy" content="${policy}"><p>child</p><script src="child.js"></script>`);
  await writeFile(path.join(root, 'child.js'), "addEventListener('message',()=>fetch('https://example.invalid/frame-csp').catch(()=>{}));");
  await writeFile(path.join(root, 'style.css'), '#scroll{height:210px;width:400px;overflow-y:auto;touch-action:pan-y}.spacer{height:900px}button{width:120px;height:50px}iframe{height:50px}');
  await writeFile(path.join(root, 'app.js'), `window.events=[];for(const type of ['touchstart','touchend','touchmove','click'])document.addEventListener(type,e=>events.push({type,trusted:e.isTrusted,touches:e.touches?.length,target:e.target.id}));const worker=new Worker('worker.js');worker.onmessage=e=>{window.workerWasm=e.data;};document.getElementById('near').onclick=()=>{worker.postMessage('violate');document.querySelector('iframe').contentWindow.postMessage('violate','*');const s=document.createElement('script');s.textContent='window.unsafeRan=true';document.body.append(s);};`);
  await writeFile(path.join(root, 'worker.js'), "postMessage(typeof WebAssembly);addEventListener('message',()=>fetch('https://example.invalid/csp-test').catch(()=>{}));");
  // This fixture deliberately gives the worker its own response CSP. A page's
  // meta CSP does not govern the inside of a same-origin static worker.
  const fixture = createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.split('/').at(-1) || 'index.html';
    try {
      const bytes = await readFile(path.join(root, name));
      res.writeHead(200, {'content-type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html', ...(name === 'worker.js' ? {'content-security-policy': policy} : {})});
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const server = {url: `http://127.0.0.1:${fixture.address().port}/`, async close() {fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve));}};
  const browser = await launchBrowser({noWasm: true});
  const context = await browser.newContext({viewport: {width: 844, height: 390}, isMobile: true, hasTouch: true, deviceScaleFactor: 1});
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  const audit = await monitor(context, page, cdp), journal = [], touch = new TouchInput(page, cdp, journal);
  try {
    await page.goto(server.url);
    await until(() => page.evaluate(() => window.workerWasm === 'undefined'), {timeoutMs: 10000});
    assert.equal(await page.evaluate(() => typeof WebAssembly), 'undefined');
    assert.equal(await page.frames()[1].evaluate(() => typeof WebAssembly), 'undefined');
    assert.ok(diagnosticChecks(audit.data).every(c => c.pass), JSON.stringify(audit.data));
    const a = await touch.down({x: 200, y: 100}), b = await touch.down({x: 250, y: 100});
    await touch.up(b); await touch.move(a, {x: 202, y: 103}); await touch.up(a);
    const ends = await page.evaluate(() => events.filter(e => e.type === 'touchend'));
    assert.ok(ends.some(e => e.touches === 1), 'partial release must preserve one contact');
    assert.equal(ends.at(-1).touches, 0, 'final release must end every contact');
    assert.ok(ends.every(e => e.trusted));
    await touch.tap(page.locator('#far'));
    assert.ok(await page.evaluate(() => events.some(e => e.type === 'click' && e.target === 'far' && e.trusted)), 'offscreen target must be reached by real touch scroll');
    await touch.tap(page.locator('#near'));
    await until(() => audit.data.cspViolations.length > 0, {timeoutMs: 10000});
    await until(() => audit.data.cspViolations.some(v => v.source === 'worker-event' && v.effectiveDirective === 'connect-src'), {timeoutMs: 10000, description: 'worker CSP captured before worker startup'});
    await until(() => audit.data.cspViolations.some(v => v.frame?.endsWith('/child.html') && v.effectiveDirective === 'connect-src'), {timeoutMs: 10000, description: 'iframe CSP captured'});
    assert.equal(await page.evaluate(() => window.unsafeRan), undefined);
    assert.ok(audit.data.consoleErrors.length > 0, 'CSP console error cannot be suppressed');
    assert.ok(journal.length > 10);
    assert.ok(journal.every(e => e.type.startsWith('touch')));
    assert.deepEqual(audit.data.monitorErrors, []);
  } finally {
    await context.close(); await browser.close(); await server.close(); await rm(root, {recursive: true});
  }
});
