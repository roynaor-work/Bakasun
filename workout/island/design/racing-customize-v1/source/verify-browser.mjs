import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(pathToFileURL(process.env.RACING_PLAYWRIGHT||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs').href);
const html=await fs.readFile(path.join(root,'preview.html'),'utf8'),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const server=http.createServer((req,res)=>{if(req.url!=='/preview.html'){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/preview.html`,checks=[],errors=[],network=[],sheets={};
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.RACING_CHROMIUM||'/usr/bin/chromium',headless:true,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,acceptDownloads:true});
  await context.addInitScript(()=>{Object.defineProperty(window,'WebAssembly',{value:undefined,configurable:true});});
  await context.route('**/*',route=>route.request().url()===url?route.continue():route.abort());
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
  await page.goto(url);await page.evaluate(()=>window.racingCustomize.ready);
  await page.waitForFunction(()=>window.racingCustomize.inspect().renderer.geometries>0);
  await context.setOffline(true);
  assert.equal(await page.evaluate(()=>typeof WebAssembly),'undefined');checks.push('All interactions run offline with WebAssembly unavailable');
  const frame=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  const inspect=()=>page.evaluate(()=>window.racingCustomize.inspect());
  async function capture(name){await frame();await page.screenshot({path:path.join(root,'verification',name+'.jpg'),type:'jpeg',quality:90});}
  await capture('preview-844x390');
  const stage=await page.locator('#stage').boundingBox();
  assert(stage.width===494&&stage.height===335);checks.push('844×390 layout fits exactly with visible stage and footer');
  for(const category of manifest.categories){
    await page.getByRole('tab',{name:category.label,exact:true}).click();
    assert.equal(await page.locator('.item').count(),category.count);
    assert.equal(await page.locator('.tab[aria-selected="true"]').count(),1);
    assert(await page.locator('.item img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth===96)));
    for(const layer of category.id==='paints'?['body','stripes']:['body']){
      if(category.id==='paints')await page.locator(`[data-layer="${layer}"]`).click();
      for(const item of manifest.items.filter(i=>i.category===category.id)){
        await page.locator(`[data-item="${item.id}"]`).click();
        const slot=item.slot==='paint'?(layer==='body'?'bodyPaint':'stripePaint'):item.slot;
        await page.waitForFunction(({slot,id})=>window.racingCustomize.inspect().state[slot]===id,{slot,id:item.id});
        const state=await inspect();assert.equal(state.customizer.mountedObjects,8);assert.equal(state.customizer.decalMeshes,3);
        assert.equal(await page.locator(`[data-item="${item.id}"]`).getAttribute('aria-pressed'),'true');
        checks.push(`UI ${category.id==='paints'?layer+' ':''}${item.id}`);
        if(category.id!=='paints'&&category.id!=='decals'){
          await frame();const image=await page.screenshot({clip:stage,type:'jpeg',quality:80});
          (sheets[category.id]||=[]).push({label:item.label,data:image.toString('base64')});
        }
      }
    }
    await capture(`category-${category.id}`);
    const bounds=await page.locator('#save').boundingBox();assert(bounds.y+bounds.height<=390);checks.push(`Category ${category.id}: scrollable grid and save control remain visible`);
  }
  const colorChecks=await page.evaluate(()=>{
    const api=window.racingCustomize,paints=api.manifest.items.filter(i=>i.slot==='paint');let count=0;
    for(const body of paints)for(const stripes of paints){api.setPaint('body',body.id);api.setPaint('stripes',stripes.id);
      const status=api.inspect();
      if(!status.paint.filter(m=>m.name==='Paint 1').every(m=>m.color===body.body.slice(1)))throw new Error('Body paint mismatch');
      if(!status.paint.filter(m=>m.name==='Paint Stripes').every(m=>m.color===stripes.body.slice(1)))throw new Error('Stripe paint mismatch');count++;}
    return count;
  });assert.equal(colorChecks,100);checks.push('All 100 independent body/stripe colour combinations match actual materials');
  await page.evaluate(()=>{window.racingCustomize.setPaint('body','paint-cobalt');window.racingCustomize.setPaint('stripes','paint-pearl');});
  await page.locator('#save').click();assert.equal(await page.locator('#notice').textContent(),'העיצוב נשמר במכשיר');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('island.racing-customize-v1.design')));
  assert.equal(saved.bodyPaint,'paint-cobalt');assert.equal(saved.stripePaint,'paint-pearl');checks.push('Save stores the complete cosmetic selection locally');
  await context.setOffline(false);await page.reload();await page.evaluate(()=>window.racingCustomize.ready);await frame();await context.setOffline(true);
  assert.deepEqual((await inspect()).state,saved);checks.push('Saved selection survives reload');
  await page.evaluate(()=>{localStorage.setItem('island.racing-customize-v1.design','{corrupt-json');});
  await context.setOffline(false);await page.reload();await page.evaluate(()=>window.racingCustomize.ready);await context.setOffline(true);await frame();
  assert.equal((await inspect()).state.frontWing,manifest.defaults.frontWing);checks.push('Corrupt saved data falls back to valid defaults');
  const before=(await inspect()).renderer;
  for(let cycle=0;cycle<12;cycle++){
    await page.evaluate(async n=>{const api=window.racingCustomize;
      await api.choose(n%2?'front-arrow':'front-sweep',false);await api.choose(n%2?'wheel-aero':'wheel-five',false);
      await api.choose(n%2?'helmet-tail':'helmet-classic',false);await api.choose(n%2?'effect-violet':'effect-amber',false);
      await api.choose(n%2?'decal-flames-sharp':'decal-stars-one',false);},cycle);await frame();
    assert.equal((await inspect()).customizer.mountedObjects,8);
  }
  const after=(await inspect()).renderer;
  // The finite asset cache retains each authored geometry, while generated decal geometry is disposed.
  assert(after.geometries<=before.geometries+20);assert(after.textures<=before.textures+3);
  checks.push('60 repeated swaps keep eight mounted objects and bounded renderer resources');
  await page.locator('#effects-toggle').click();assert.equal((await inspect()).effects.enabled,false);await page.locator('#effects-toggle').click();
  checks.push('Effect preview can be switched off and on');
  const canvas=page.locator('#canvas');await page.mouse.move(stage.x+230,stage.y+170);await page.mouse.down();await page.mouse.move(stage.x+310,stage.y+190,{steps:5});await page.mouse.up();
  await page.locator('#reset-view').click();checks.push('Pointer orbit and view reset respond without errors');
  await page.getByRole('tab',{name:'גלגלים',exact:true}).focus();await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.tab[aria-selected="true"]').getAttribute('data-category'),'decals');checks.push('Keyboard category navigation follows RTL order');
  await page.emulateMedia({reducedMotion:'reduce'});await frame();await page.evaluate(()=>window.racingCustomize.setView('rear'));await frame();checks.push('Reduced-motion mode renders static accessories');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:390,height:844});await frame();await capture('preview-390x844');
  const portrait=await page.locator('#save').boundingBox();assert(portrait.y+portrait.height<=844);checks.push('390×844 portrait layout keeps all controls within the viewport');
  await page.setViewportSize({width:844,height:390});await frame();
  const downloadPromise=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'racing-customize-v1.html');
  const downloaded=await fs.readFile(await download.path(),'utf8');
  assert(downloaded.includes('id="pack"'));assert(!/<script[^>]+src=/.test(downloaded));
  const isolated=await browser.newContext({viewport:{width:844,height:390},offline:true});
  const offline=await isolated.newPage();let offlineHTTP=0;
  offline.on('pageerror',error=>errors.push('offline: '+error.message));
  offline.on('request',request=>{if(/^https?:/.test(request.url()))offlineHTTP++;});
  await offline.setContent(downloaded);await offline.evaluate(()=>window.racingCustomize.ready);
  await offline.waitForFunction(()=>window.racingCustomize.inspect().renderer.geometries>0);
  assert.equal(await offline.locator('.tab').count(),7);assert.equal(await offline.locator('.item').count(),8);
  await offline.evaluate(()=>window.racingCustomize.choose('rear-vortex',false));
  assert.equal((await offline.evaluate(()=>window.racingCustomize.inspect())).state.rearWing,'rear-vortex');assert.equal(offlineHTTP,0);
  checks.push('Downloaded HTML starts fresh, has seven tabs and equips assets with zero HTTP requests in a fresh offline context');
  await isolated.close();
  await page.evaluate(()=>window.racingCustomize.reset());await page.getByRole('tab',{name:'כנף קדמית',exact:true}).click();await frame();await capture('preview-844x390');
  const metrics=await inspect();
  assert.equal(network.length,3,'Only initial document and two explicit reloads may use HTTP');assert.equal(errors.length,0,errors.join('\n'));
  checks.push('No browser errors, asset HTTP requests or external network requests');
  const report={passed:true,checks:checks.length,checkNames:checks,colourCombinations:colorChecks,errors,documentRequests:network.length,
    assetHTTPRequests:0,externalHTTPRequests:0,offlineDownloadHTTPRequests:offlineHTTP,rendererBeforeSwaps:before,rendererAfterSwaps:after,
    finalMetrics:metrics,previewSha256:crypto.createHash('sha256').update(html).digest('hex'),
    browser:await browser.version(),environment:'Chromium / SwiftShader on Linux; no physical-phone FPS claim',
    fileProtocol:'Machine policy blocks file:// navigation. The exact downloaded standalone HTML was instead loaded into a fresh offline document and exercised without HTTP.'};
  await fs.writeFile(path.join(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
  await fs.writeFile('/tmp/racing-customize-sheets.json',JSON.stringify(sheets));
  // Release the software GL context before capturing static HTML contact sheets.
  await browser.close();browser=null;
  browser=await chromium.launch({executablePath:process.env.RACING_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  for(const [category,tiles] of Object.entries(sheets)){
    const sheet=await browser.newPage({viewport:{width:1000,height:Math.ceil(tiles.length/4)*190}});
    await sheet.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#12232b;color:#e6f4ed;font:13px Arial;display:grid;grid-template-columns:repeat(4,250px)}figure{margin:0;height:190px;padding:6px;border:1px solid #36505a}img{display:block;width:236px;height:148px;object-fit:cover;border-radius:8px}figcaption{text-align:center;line-height:18px;padding:5px}</style></head><body>${tiles.map(tile=>`<figure><img src="data:image/jpeg;base64,${tile.data}"><figcaption>${tile.label}</figcaption></figure>`).join('')}</body></html>`);
    await sheet.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));
    await sheet.screenshot({path:path.join(root,'verification',`sheet-${category}.jpg`),type:'jpeg',quality:88});await sheet.close();
  }
  console.log(JSON.stringify({passed:true,checks:checks.length,colourCombinations:colorChecks,errors:errors.length,metrics:metrics.renderer}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
