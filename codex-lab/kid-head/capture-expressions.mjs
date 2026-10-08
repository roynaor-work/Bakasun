import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {serve} from './serve.mjs';
import {EXPRESSION_LIST} from './expressions.mjs';
import {segment, normalize, iou} from './silhouette.mjs';

const base = new URL('.', import.meta.url);
const out = new URL('shots/faces/', base);
const views = ['front', 'side', 'back', 'threeQuarter'];
const server = await serve(0);
let browser;
const errors = [], externalRequests = [];
const report = {
  viewport: [1024, 1024],
  camera: 'Orthographic vertical span 4.5; elevation 0.08; target (0,.13,0); model translation y=.25',
  lighting: 'Hemisphere 2; key 3 at (-3,6,5); fill 1 at (4,2,-3), fixed in world',
  comparison: 'Visual review against preserved round 9. Silhouette IoU below is against round 9, NOT against the unavailable expression reference.',
  views, expressions: [], mobile: {}, errors, externalRequests,
};

function watch(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('response', r => {if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);});
  page.on('request', r => {if (!r.url().startsWith('http://127.0.0.1:')) externalRequests.push(r.url());});
}

async function benchmark(page, expression, transition = false) {
  return page.evaluate(async ({expression, transition}) => {
    window.faces.setExpression(expression);
    const frames = [], cpu = [];
    const start = performance.now();
    let previous, sampleStart;
    await new Promise(resolve => {
      function frame(now) {
        const before = performance.now();
        if (transition) {
          const t = (1 - Math.cos((now - start) / 1800 * Math.PI)) / 2;
          window.faces.setBlend('happy', 'surprised', t);
        } else window.faces.render();
        const after = performance.now();
        // Include renderer completion, not only JavaScript submission time.
        window.faces.renderer.getContext().finish();
        if (now - start >= 700) {
          sampleStart ??= now;
          if (previous !== undefined) frames.push(now - previous);
          cpu.push(after - before);
          previous = now;
        }
        if (sampleStart !== undefined && now - sampleStart >= 3000 && frames.length >= 12) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const sorted = [...frames].sort((a,b) => a-b);
    const durationMs = frames.reduce((a,b) => a+b, 0);
    return {
      ...window.faces.getStats(), frames: frames.length, durationMs,
      fps: frames.length * 1000 / durationMs,
      medianFrameMs: sorted[Math.floor(sorted.length / 2)],
      p95FrameMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))],
      meanSubmitMs: cpu.reduce((a,b) => a+b, 0) / cpu.length,
      transition,
    };
  }, {expression, transition});
}

try {
  await mkdir(out, {recursive: true});
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({viewport: {width: 1024, height: 1024}, deviceScaleFactor: 1});
  watch(page);
  await page.goto(`http://127.0.0.1:${server.address().port}/expressions.html?capture=1`);
  await page.waitForFunction(() => window.faces?.ready);
  for (const expression of EXPRESSION_LIST) {
    const dir = new URL(`${expression.id}/`, out);
    await mkdir(dir, {recursive: true});
    await page.evaluate(id => window.faces.setExpression(id), expression.id);
    const row = {id: expression.id, label: expression.label, parameters: expression.parameters, silhouetteVsR9: {}};
    for (const view of views) {
      await page.evaluate(v => window.faces.setView(v), view);
      await page.screenshot({path: new URL(`${view}.png`, dir).pathname});
      await page.evaluate(() => window.faces.headOnly(true));
      await page.screenshot({path: new URL(`${view}-head.png`, dir).pathname});
      await page.evaluate(() => window.faces.headOnly(false));
      const fresh = PNG.sync.read(await readFile(new URL(`${view}-head.png`, dir)));
      const old = PNG.sync.read(await readFile(new URL(`shots/faces/baseline-r9/original/${view}-head.png`, base)));
      const raw = segment(fresh, [0,0,fresh.width,fresh.height], 30, true);
      row.silhouetteVsR9[view] = {
        iou: iou(normalize(raw), normalize(segment(old, [0,0,old.width,old.height], 30, true))),
        aspect: normalize(raw).aspect, disconnectedPixels: raw.disconnectedPixels,
      };
    }
    row.render = await page.evaluate(() => window.faces.getStats());
    report.expressions.push(row);
    await writeFile(new URL('parameters.json', dir), JSON.stringify(expression, null, 2) + '\n');
    console.log(`${expression.id}: front, side, back, threeQuarter + head-only`);
  }

  const transitionDir = new URL('transition/', out);
  await mkdir(transitionDir, {recursive: true});
  await page.evaluate(() => window.faces.setView('front'));
  for (const t of [0,.25,.5,.75,1]) {
    await page.evaluate(t => window.faces.setBlend('happy', 'surprised', t), t);
    await page.screenshot({path: new URL(`happy-surprised-${t * 100}.png`, transitionDir).pathname});
  }

  const mobile = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 1});
  watch(mobile);
  await mobile.goto(`http://127.0.0.1:${server.address().port}/expressions.html?capture=1`);
  await mobile.waitForFunction(() => window.faces?.ready);
  report.mobile = {
    viewport: [390,844], deviceScaleFactor: 1, browser: await browser.version(),
    environment: await mobile.evaluate(() => {
      const gl = window.faces.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {userAgent: navigator.userAgent, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)};
    }),
    method: 'requestAnimationFrame intervals after 700ms warm-up, at least 3000ms and 12 measured intervals; gl.finish after render; local headless Chromium SwiftShader, phone-sized viewport, NOT physical-phone FPS',
    expressions: [],
  };
  await mobile.evaluate(() => window.faces.setView('front'));
  for (const e of EXPRESSION_LIST) report.mobile.expressions.push({id:e.id, ...await benchmark(mobile,e.id)});
  report.mobile.transition = await benchmark(mobile, 'happy', true);
  await mobile.screenshot({path:new URL('mobile-capture.png',out).pathname});
  await writeFile(new URL('capture.json',out),JSON.stringify(report,null,2)+'\n');

  // Check actual user controls and page layout independently of capture mode.
  await page.goto(`http://127.0.0.1:${server.address().port}/expressions.html`);
  await page.waitForFunction(() => window.faces?.ready);
  await page.waitForFunction(() => [...document.images].filter(i => !i.hidden).every(i => i.complete && i.naturalWidth > 0));
  await page.screenshot({path:new URL('gallery-desktop.png',out).pathname,fullPage:true});
  await mobile.goto(`http://127.0.0.1:${server.address().port}/expressions.html`);
  await mobile.waitForFunction(() => window.faces?.ready);
  await mobile.waitForFunction(() => [...document.images].filter(i => !i.hidden).every(i => i.complete && i.naturalWidth > 0));
  report.mobile.layout = await mobile.evaluate(() => ({scrollWidth:document.documentElement.scrollWidth,innerWidth,canvases:document.querySelectorAll('canvas').length}));
  assert(report.mobile.layout.scrollWidth <= report.mobile.layout.innerWidth, 'Mobile page has horizontal overflow');
  assert.equal(report.mobile.layout.canvases, 1, 'Gallery should use a single live WebGL canvas');
  assert.equal(await mobile.locator('.expression-card').count(), 6, 'All six expression cards must be present');
  await mobile.locator('.expression-card[data-expression="thinking"]').click();
  assert.equal((await mobile.evaluate(() => window.faces.getStats())).expression, 'thinking');
  await mobile.locator('[data-view="side"]').click();
  assert.equal((await mobile.evaluate(() => window.faces.getStats())).view, 'side');
  await mobile.locator('[data-view="front"]').click();
  await mobile.locator('#from').selectOption('happy');
  await mobile.locator('#to').selectOption('surprised');
  await mobile.locator('#blend').focus();
  await mobile.locator('#blend').press('Home');
  await mobile.locator('#blend').press('ArrowRight');
  assert((await mobile.evaluate(() => window.faces.getStats())).blend > 0, 'Keyboard slider should update the rig');
  await mobile.locator('#play').click();
  await mobile.waitForFunction(() => window.faces.getStats().blend > .04);
  assert.equal(await mobile.locator('#play').getAttribute('aria-pressed'), 'true');
  await mobile.locator('#play').click();
  assert.equal((await mobile.evaluate(() => window.faces.getStats())).playing, false, 'Play button must pause');
  await mobile.locator('#play').click();
  assert.equal((await mobile.evaluate(() => window.faces.getStats())).playing, true);
  await mobile.emulateMedia({reducedMotion: 'reduce'});
  await mobile.waitForFunction(() => !window.faces.getStats().playing);
  await mobile.locator('.expression-card[data-expression="happy"]').click();
  report.mobile.controls = {expressionSelection:true,viewSelection:true,keyboardBlend:true,playPause:true,reducedMotionStopsPlayback:true};
  await mobile.screenshot({path:new URL('gallery-mobile.png',out).pathname,fullPage:true});
  await writeFile(new URL('capture.json',out),JSON.stringify(report,null,2)+'\n');
  assert.deepEqual(errors, [], 'Browser console/page errors');
  assert.deepEqual(externalRequests, [], 'Runtime must stay local');
  console.log('Mobile FPS and triangle counts:', report.mobile.expressions.map(e=>`${e.id} ${e.fps.toFixed(1)} FPS / ${e.triangles}`).join('; '));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
