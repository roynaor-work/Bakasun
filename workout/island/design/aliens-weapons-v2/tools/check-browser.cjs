// Run: node tools/check-browser.cjs. Uses a temporary loopback HTTP server.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ogg':'audio/ogg', '.mp3':'audio/mpeg' };

(async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
      const bytes = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream' }); res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const executablePath = process.env.ALIEN_CHROMIUM || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath());
    browser = await chromium.launch({ executablePath, headless:true, args:['--no-sandbox'] });
    const page = await browser.newPage({ viewport:{width:844,height:390}, deviceScaleFactor:1 });
    const errors = [], failed = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type()==='error') errors.push(msg.text()); });
    page.on('response', response => { if (!response.ok()) failed.push(response.url()); });
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:')) external.push(req.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/preview.html`);
    await page.waitForFunction(() => window.__armory);
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth>0));
    const manifest = await page.evaluate(() => __armory.manifest);
    const size = await page.evaluate(() => ({ width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,bottom:document.querySelector('footer').getBoundingClientRect().bottom }));
    assert.equal(size.width,844); assert.equal(size.height,390); assert.ok(size.bottom<=390);
    assert.equal(await page.locator('#weapons button').count(),6);

    // Automatic animation advances; pausing freezes the actual rendered pixels.
    const pixels = () => page.evaluate(() => document.getElementById('range').toDataURL());
    const movingA = await pixels(); await page.waitForTimeout(180); assert.notEqual(await pixels(),movingA);
    await page.click('#pause'); const still = await pixels(); await page.waitForTimeout(160); assert.equal(await pixels(),still);
    await page.click('#pause'); await page.waitForTimeout(180); assert.notEqual(await pixels(),still);
    const samples = [];
    for (let i=0;i<manifest.weapons.length;i++) {
      const w = manifest.weapons[i];
      await page.locator('#weapons button').nth(i).click();
      await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth>0));
      assert.equal(await page.locator('#weapon-name').textContent(), w.nameHe);
      assert.equal(await page.locator('#weapons button[aria-pressed=true]').count(),1);
      await page.evaluate(() => __armory.render(220));
      const firing = await pixels();
      await page.screenshot({ path:path.join(root,'verification',w.id+'-844x390.webp'),type:'webp',quality:90 });
      const end = w.id==='piercing-laser' ? 450 : w.id==='shield' ? 600 : 700;
      await page.evaluate(age => __armory.render(age), end+120);
      assert.notEqual(await pixels(),firing);
      await page.screenshot({ path:path.join(root,'verification',w.id+'-impact-844x390.webp'),type:'webp',quality:90 });
      for (let shot=0;shot<3;shot++) await page.click('#fire');
      assert.equal(await page.locator('#ammo').textContent(),'0');
      assert.equal(await page.locator('#fire').isDisabled(),true);
      assert.ok((await page.locator('#state-ready').getAttribute('src')).endsWith('-disabled.svg'));
      await page.click('#refill');
      assert.equal(await page.locator('#ammo').textContent(),'3'); assert.equal(await page.locator('#fire').isEnabled(),true);
      samples.push({ id:w.id, selection:true, firing:true, impact:true, threeShots:true, emptyDisables:true, refill:true });
    }
    // Browser decoding and actual HTMLAudio playback for both delivery codecs.
    const audio = await page.evaluate(async () => {
      const context = new AudioContext(); await context.resume(); const result=[];
      for (const w of __armory.manifest.weapons) for (const [event,paths] of Object.entries(w.audio)) for (const ext of ['ogg','mp3']) {
        const file=paths[ext], response=await fetch(file), data=await response.arrayBuffer();
        const decoded=await context.decodeAudioData(data.slice(0));
        const player=new Audio(file);player.volume=0.01;
        await player.play();await new Promise(resolve => setTimeout(resolve,35));
        const advanced=player.currentTime>0;player.pause();
        result.push({file,decoded:true,channels:decoded.numberOfChannels,duration:decoded.duration,playbackAdvanced:advanced});
      }
      await context.close(); return result;
    });
    assert.equal(audio.length,24); assert.ok(audio.every(a=>a.decoded && a.channels===1 && a.playbackAdvanced));
    await page.click('#pause'); // leave inspection pause before exercising sound controls
    await page.click('#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
    for (const event of ['fire','impact']) await page.click(`[data-audition=${event}]`);
    await page.click('#sound'); assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
    await page.click('#auto'); assert.equal((await page.evaluate(()=>__armory.snapshot())).auto,false);
    await page.locator('h1').click(); await page.keyboard.press('2');
    assert.equal((await page.evaluate(()=>__armory.snapshot())).selected,1);
    await page.keyboard.press('Space'); assert.equal((await page.evaluate(()=>__armory.snapshot())).ammo,2);
    await page.setViewportSize({width:390,height:844});
    const phone = await page.evaluate(() => ({width:document.documentElement.scrollWidth,main:document.querySelector('.armory').getBoundingClientRect().width}));
    assert.equal(phone.width,390); assert.ok(phone.main<=390.1);
    await page.setViewportSize({width:844,height:390});
    // Reduced motion starts without an automatic loop.
    await page.emulateMedia({reducedMotion:'reduce'}); await page.reload(); await page.waitForFunction(()=>window.__armory);
    assert.equal((await page.evaluate(()=>__armory.snapshot())).auto,false);
    assert.deepEqual(errors,[]); assert.deepEqual(failed,[]); assert.deepEqual(external,[]);
    const report={passed:true,browser:await browser.version(),viewport:{width:844,height:390},layout:size,animationAdvances:true,pauseFreezesPixels:true,samples,audio,soundControls:true,keyboard:true,reducedMotion:true,phoneNoOverflow:true,consoleErrors:errors,failedRequests:failed,externalRequests:external};
    await fs.writeFile(path.join(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({passed:true,weapons:samples.length,audio:audio.length,browser:report.browser}));
  } finally {
    if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode=1; });
