// SPDX-License-Identifier: CC0-1.0
// Optional visual measurement, using Playwright installed outside the repository.
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs');
const base=new URL('../',import.meta.url),out=new URL('verification/',base);
const catalog=JSON.parse(await fs.readFile(new URL('runtime/catalog.json',base)));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/lib/chromium/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],requests=[];
await page.addInitScript(()=>{
  for(const key of ['compile','compileStreaming','instantiate','instantiateStreaming'])WebAssembly[key]=()=>{throw new Error('WebAssembly intentionally disabled for no-compression visual verification');};
});
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>requests.push(r.url()));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
await page.goto(process.env.SOCCER_HEADER_PREVIEW_URL??'http://127.0.0.1:8765/workout/island/design/soccer-header-v1/preview.html');
await page.waitForFunction(()=>document.querySelectorAll('.clip-button').length===6&&document.querySelector('#phase').textContent!=='טוען…');
await page.locator('#play').click();
const captures=[];
for(const clip of catalog.clips){
  await page.locator(`[data-clip="${clip.id}"]`).click();
  await page.waitForFunction(()=>document.querySelector('#phase').textContent!=='טוען…');
  await page.locator('#events button').filter({hasText:'מגע'}).click();
  await page.locator('[data-view="side"]').click();
  await page.waitForTimeout(70);
  const name=`${clip.id}-contact.png`;
  await page.locator('#stage').screenshot({path:new URL(name,out).pathname});captures.push(name);
  if(clip.id==='header_dive'){
    await page.locator('#events button').filter({hasText:'נחיתה'}).click();
    await page.waitForTimeout(70);
    await page.locator('#stage').screenshot({path:new URL('header_dive-land.png',out).pathname});captures.push('header_dive-land.png');
  }
}
await page.locator('[data-view="three"]').click();
await page.screenshot({path:new URL('preview-desktop.png',out).pathname});captures.push('preview-desktop.png');
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:new URL('preview-mobile.png',out).pathname,fullPage:true});captures.push('preview-mobile.png');
const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
const wasmRequests=requests.filter(url=>/\.wasm|draco/i.test(url));
const evidence={clipsLoaded:catalog.clips.map(c=>c.id),viewports:[{width:1280,height:900},{width:390,height:844}],captures,errors,mobileOverflow,webAssemblyBlocked:true,wasmRequests,networkOrigins:[...new Set(requests.map(url=>new URL(url).origin))],passed:!errors.length&&!mobileOverflow&&!wasmRequests.length};
await fs.writeFile(new URL('browser.json',out),JSON.stringify(evidence,null,2)+'\n');
await browser.close();console.log(JSON.stringify(evidence,null,2));
if(!evidence.passed)process.exitCode=1;
