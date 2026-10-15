import assert from 'node:assert/strict';
import { islandChromium, serveIsland } from '../helpers/island-browser.mjs';

const browser = await (await islandChromium()).launch({ executablePath: process.env.ISLAND_BROWSER, headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  for (const prefix of ['/workout/island/','/Bakasun/workout/island/']) {
    const server = await serveIsland(prefix), page = await browser.newPage();
    try {
      const errors = [], outside = [];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{ const url = new URL(r.url()); if (['http:','https:'].includes(url.protocol) && !r.url().startsWith(server.url)) outside.push(r.url()); });
      await page.goto(server.url,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
      const lab = await page.request.get(new URL('/codex-lab/kid-full/kid-full.glb',server.url).href);
      assert.equal(lab.status(),404);
      const manifestUrl = await page.locator('link[rel="manifest"]').evaluate(n=>n.href);
      assert.equal(manifestUrl, new URL('manifest.webmanifest',server.url).href);
      const response = await page.request.get(manifestUrl);
      assert.equal(response.status(),200);
      assert.match(response.headers()['content-type'],/^application\/manifest\+json\b/);
      const manifest = await response.json();
      for (const key of ['start_url','scope','id']) assert.equal(new URL(manifest[key],manifestUrl).href,server.url);
      const cdp = await page.context().newCDPSession(page);
      const parsed = await cdp.send('Page.getAppManifest');
      assert.deepEqual(parsed.errors,[], 'Chromium parses the linked manifest without errors');
      for (const icon of [...manifest.icons,{src:await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),sizes:'180x180'}]) {
        const url = new URL(icon.src,manifestUrl).href;
        assert.ok(url.startsWith(server.url));
        const asset = await page.request.get(url);
        assert.equal(asset.status(),200); assert.match(asset.headers()['content-type'],/^image\/png\b/);
        const decoded = await page.evaluate(async url=>{
          const img = new Image(); img.src=url; await img.decode();
          const canvas=document.createElement('canvas'); canvas.width=img.width;canvas.height=img.height;
          const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
          const bytes=ctx.getImageData(0,0,img.width,img.height).data;
          return {size:`${img.naturalWidth}x${img.naturalHeight}`,opaque:bytes.every((v,i)=>i%4!==3||v===255)};
        },url);
        assert.equal(decoded.size,icon.sizes); assert.ok(decoded.opaque,'icons fill the complete background, including maskable edges');
      }
      const svg = await page.request.get(new URL('assets/icons/island.svg',server.url).href);
      assert.equal(svg.status(),200);assert.match(svg.headers()['content-type'],/^image\/svg\+xml\b/);
      assert.deepEqual(await page.evaluate(()=>navigator.serviceWorker.getRegistrations().then(r=>r.map(s=>s.scope))),[]);
      assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
      console.log(`${prefix}: manifest, relative scope, MIME types, decoded icons, isolated deployment passed`);
    } finally { await page.close();await server.close(); }
  }
} finally { await browser.close(); }
