import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const url = process.env.FX_PREVIEW_URL || 'http://127.0.0.1:8765/workout/island/design/naval-base-fx-v1/';
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox']});
const report = {viewports:[], audio:[]};
const scrub = (page, time) => page.locator('#timeline').evaluate((input, value) => {
  input.value = String(value); input.dispatchEvent(new Event('input', {bubbles:true}));
}, time);
try {
  for (const viewport of [{width:1440,height:1080},{width:390,height:844}]) {
    const page = await browser.newPage({viewport, reducedMotion:'reduce'});
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);});
    page.on('request', request => requests.push(request.url()));
    await page.goto(url);
    await page.waitForFunction(() => !document.getElementById('replay').disabled);
    assert.match(await page.locator('#status').innerText(), /הפחתת תנועה/);
    const frozen = await page.locator('#clock').innerText();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#clock').innerText(), frozen, 'reduced motion starts paused');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    await page.locator('#background').selectOption('checker');
    await scrub(page, .30);
    const visible = await page.locator('#scene').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      return data.reduce((n,value,i) => n + (i % 4 === 3 && value > 0 ? 1 : 0), 0);
    });
    assert.ok(visible > 100, 'sprite draws over transparency');
    for (const layer of ['explosion','smoke','sparks']) await page.locator(`#layer-${layer}`).uncheck();
    const empty = await page.locator('#scene').evaluate(canvas => canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.every(value => value === 0));
    assert.ok(empty, 'layers turn off completely');
    for (const layer of ['explosion','smoke','sparks']) await page.locator(`#layer-${layer}`).check();
    await page.locator('#replay').click();
    await page.waitForTimeout(200);
    assert.notEqual(await page.locator('#clock').innerText(), '00.00 s');
    assert.ok(await page.locator('#audio').evaluate(audio => audio.paused), 'replay starts silent');
    await page.locator('#pause').click();
    const paused = await page.locator('#clock').innerText();
    await page.waitForTimeout(120);
    assert.equal(await page.locator('#clock').innerText(), paused, 'pause freezes timeline');
    await scrub(page, 1.90);
    await page.locator('#pause').click();
    await page.waitForTimeout(110);
    await page.locator('#pause').click();
    assert.ok(Number((await page.locator('#clock').innerText()).split(' ')[0]) > 1.9, 'cross explosion end without throwing');
    await scrub(page, 6.39);
    await page.locator('#repeat').uncheck();
    await page.locator('#pause').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#clock').innerText(), '06.40 s', 'one-shot timeline stops');
    await page.locator('#repeat').check();
    await scrub(page, 6.39);
    await page.locator('#pause').click();
    await page.waitForTimeout(150);
    assert.ok(Number((await page.locator('#clock').innerText()).split(' ')[0]) < 1, 'visual loop wraps');
    await page.locator('#pause').click();
    for (const format of ['ogg','mp3']) {
      await page.locator('#audio-format').selectOption(format);
      await page.waitForFunction(() => document.getElementById('audio').readyState >= 2);
      await page.locator('#sound').check();
      await page.locator('#replay').click();
      await page.waitForTimeout(160);
      const result = await page.locator('#audio').evaluate(audio => ({source:audio.currentSrc, time:audio.currentTime, paused:audio.paused, duration:audio.duration, error:audio.error?.code || null}));
      assert.ok(result.time > 0 && !result.paused && !result.error, JSON.stringify(result));
      assert.ok(result.source.endsWith(`.${format}`));
      assert.ok(Math.abs(result.duration - 4.2) < .06);
      report.audio.push({viewport:viewport.width, format, ...result});
      await page.locator('#pause').click();
      assert.ok(await page.locator('#audio').evaluate(audio => audio.paused));
    }
    await page.locator('#audio-format').selectOption('auto');
    await page.locator('#sound').uncheck();
    await page.locator('#background').selectOption('sea');
    await scrub(page, .30);
    await page.screenshot({path:new URL(`verification/preview-${viewport.width}.png`,root).pathname,fullPage:true});
    assert.deepEqual(errors, []);
    assert.ok(requests.every(request => new URL(request).origin === new URL(url).origin), 'preview must use only local resources');
    report.viewports.push({viewport, noOverflow:true, errors, requestCount:requests.length, reducedMotion:true, pause:true, scrub:true, layers:true, loop:true});
    await page.close();
  }
  // Normal-motion path must animate without triggering sound on load.
  const page = await browser.newPage({reducedMotion:'no-preference'});
  await page.goto(url); await page.waitForFunction(() => !document.getElementById('replay').disabled);
  const before = await page.locator('#clock').innerText();
  await page.waitForTimeout(150);
  assert.notEqual(await page.locator('#clock').innerText(), before);
  assert.ok(await page.locator('#audio').evaluate(audio => audio.paused));
  report.autoplayVisualsOnly = true;
  await page.close();
  await writeFile(new URL('verification/browser.json',root), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
