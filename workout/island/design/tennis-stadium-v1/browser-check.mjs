// CC0. Requires Playwright in the execution environment; no production dependency.
// Serve repository root on 8765 first. Run: node browser-check.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.env.TENNIS_PREVIEW_URL || 'http://127.0.0.1:8765/workout/island/design/tennis-stadium-v1/preview.html';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1120},deviceScaleFactor:1});
  const errors = [], failures = [], runtime = new Set();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('requestfailed',r=>failures.push(r.url()));
  page.on('response',r=>{
    if (r.status()>=400) failures.push(`${r.status()} ${r.url()}`);
    if(r.url().includes('/runtime/'))runtime.add(new URL(r.url()).pathname.split('/').pop());
  });
  const begin=performance.now();
  await page.goto(url);
  await page.waitForFunction(()=>window.stadiumPreview?.ready || window.stadiumPreview?.errors?.length,{timeout:60000});
  const state=await page.evaluate(()=>window.stadiumPreview);
  assert.equal(state.ready,true,JSON.stringify(state));
  assert.equal(state.triangles,24860);
  assert.equal(state.crowdInstances,600);
  assert.equal(state.crowdBatches,1);
  assert.equal(state.loaded,13);
  assert.equal(state.textureCount,5);
  assert.equal(runtime.size,13);
  assert.ok(state.totalBytes<=4_000_000);
  assert.equal(await page.locator('#files tr').count(),(await page.evaluate(()=>fetch('inventory.json').then(r=>r.json()))).files.length);
  const readyMs=Math.round(performance.now()-begin);
  await page.locator('#cheer').click();
  assert.equal(await page.locator('#cheer').textContent(),'ידיים למעלה');
  await page.locator('#cheer').click();
  assert.equal(await page.locator('#cheer').textContent(),'ידיים למטה');
  await page.locator('#cheer').click();
  await page.locator('[data-view="court"]').click();
  assert.equal(await page.locator('[data-view="court"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-view="stand"]').click();
  await page.locator('.stage').screenshot({path:'/tmp/tennis-stand.png'});
  await page.locator('#wire').click();
  assert.equal(await page.locator('#wire').getAttribute('aria-pressed'),'true');
  await page.locator('#wire').click();
  await page.locator('[data-view="overview"]').click();
  await page.locator('.stage').screenshot({path:'/tmp/tennis-scene.jpg',type:'jpeg',quality:88});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'/tmp/tennis-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/tennis-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  assert.deepEqual(failures,[]);
  // A concrete CSP probe: asset loading succeeded before this forbidden compile.
  const wasmBlocked=await page.evaluate(async()=>{
    try { await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])); return false; }
    catch(e){return e instanceof WebAssembly.CompileError;}
  });
  assert.equal(wasmBlocked,true);
  console.log(JSON.stringify({readyMs,triangles:state.triangles,visibleTriangles:state.visibleTriangles,drawCalls:state.drawCalls,assetsLoaded:runtime.size,
    crowdInstances:600,crowdBatches:1,wasmBlocked,errors,failures,desktop:[1440,1120],mobile:[390,844]},null,2));
} finally {
  await browser.close();
}
