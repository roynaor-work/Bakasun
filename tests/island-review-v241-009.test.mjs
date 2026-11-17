import nodeTest from 'node:test';
// Browser suite (Chromium + Playwright), like the other island browser tests: runs with
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chrome>
const test=process.env.ISLAND_CSP_BROWSER==='1'?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.REVIEW_FIX_ROOT||process.cwd());
async function browserModule(){
 const candidates=[process.env.ISLAND_PLAYWRIGHT,'playwright','/opt/codex/runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages/playwright/driver/package/index.mjs'].filter(Boolean);
 for(const specifier of candidates){try{return await import(specifier);}catch{}}
 throw Error('Playwright is required; install playwright or set ISLAND_PLAYWRIGHT to its index.mjs');
}
const pw=process.env.ISLAND_CSP_BROWSER==='1'?await browserModule():null;
const fixture=`<!doctype html><html><body><div id="controls"><button id="pass"><svg></svg></button></div><input id="edit"><script type="module">
import {createAlienSpecialSwitch} from '/workout/island/minigames/alien-v25-ui.mjs';
const controls=document.querySelector('#controls'),special=document.querySelector('#pass');window.gestures=0;
window.sw=createAlienSpecialSwitch({controls,special,missileIcon:special.querySelector('svg'),onGesture:()=>window.gestures++});
sw.setEnabled(true);sw.update({special:0,specialAmmo:[2,3,1]});
</script></body></html>`;
async function host(){const server=createServer(async(req,res)=>{try{if(req.url.startsWith('/__review009.html')){res.setHeader('Content-Type','text/html');res.end(fixture);return;}const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}res.setHeader('Content-Type',extname(file)==='.mjs'?'text/javascript':'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,url:`http://127.0.0.1:${server.address().port}`};}
test('V241-009: native Enter, Space and semantic click activate once; a pointer keeps one immediate edge',async()=>{
 const {server,url}=await host();let browser;
 try{
  browser=await pw.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto(url+'/__review009.html');await page.waitForFunction(()=>!!window.sw);
  const button=page.locator('#special-switch');
  await button.focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>sw.sample()),true,'Enter activates the native button');assert.equal(await page.evaluate(()=>sw.sample()),false);
  await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>sw.sample()),true,'Space activates the native button');
  await button.evaluate(el=>el.click());assert.equal(await page.evaluate(()=>sw.sample()),true,'assistive/programmatic semantic click');
  await page.evaluate(()=>{document.querySelector('#special-switch').addEventListener('pointerdown',()=>{window.pointerEdge=sw.sample();});window.beforePointer=gestures;});
  await button.click();assert.equal(await page.evaluate(()=>pointerEdge),true,'pointerdown is immediate');assert.equal(await page.evaluate(()=>sw.sample()),false,'the matching click does not queue a second edge');assert.equal(await page.evaluate(()=>gestures-beforePointer),1,'exactly one gesture for a pointer');
  await page.keyboard.press('KeyC');assert.equal(await page.evaluate(()=>sw.sample()),true,'C remains available');
  await page.locator('#edit').focus();await page.keyboard.press('KeyC');assert.equal(await page.evaluate(()=>sw.sample()),false,'typing is not game input');
  await page.evaluate(()=>sw.setEnabled(false));await button.evaluate(el=>el.click());assert.equal(await page.evaluate(()=>sw.sample()),false,'disabled controller ignores semantic activation');
  await page.evaluate(()=>{sw.setEnabled(true);sw.dispose();document.querySelector('#controls').append(sw.button);sw.button.click();});assert.equal(await page.evaluate(()=>sw.sample()),false,'dispose removes the semantic handler');
  // The existing arsenal rollback is authoritative even for this isolated fixture, which mounts the switch directly.
  await page.goto(url+'/__review009.html?alienArsenal=0');await page.waitForFunction(()=>!!window.sw);
  await page.locator('#special-switch').evaluate(el=>el.click());assert.equal(await page.evaluate(()=>sw.sample()),false,'arsenal rollback retains the old pointer-only controller');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
