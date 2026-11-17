import nodeTest from 'node:test';
// Browser suite (Chromium + Playwright), like the other island browser tests: runs with
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chrome>
const test=process.env.ISLAND_CSP_BROWSER==='1'?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.REVIEW_FIX_ROOT||process.cwd());
const fixture=`<!doctype html><meta charset="utf-8"><script type="module">
import * as T from '/workout/island/vendor/three.module.js';
import {GLTFLoader} from '/workout/island/vendor/GLTFLoader.js';
import {createTennisV12Stadium} from '/workout/island/minigames/tennis-v12-stadium.mjs';
window.__unhandled=[];
window.addEventListener('unhandledrejection',e=>{__unhandled.push(String(e.reason));e.preventDefault();});
const config=(await (await fetch('/workout/island/data/config.json')).json()).minigames.tennis;
window.__scene=new T.Scene();window.__restored=0;
window.__stadium=await createTennisV12Stadium({T,scene:__scene,renderer:{},hemi:new T.HemisphereLight(),sun:new T.DirectionalLight(),v7:{hideVenue(){},showVenue(){__restored++;}},params:new URLSearchParams(location.search),config,GLTFLoader,base:new URL('/workout/island/minigames/tennis-view.mjs',location.origin).href,camera:new T.PerspectiveCamera(),lateCrowd:true});
</script>`;

async function playwright(){
 const spec=process.env.ISLAND_PLAYWRIGHT||process.env.PLAYWRIGHT_MODULE;
 if(spec)return import(spec.startsWith('/')?pathToFileURL(spec).href:spec);
 try{return await import('playwright');}catch(error){
  const bundled='/opt/codex/runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages/playwright/driver/package/index.mjs';
  try{return await import(pathToFileURL(bundled).href);}catch{throw error;}
 }
}

async function run(t,{flag='',failure=true,dispose=false}={}){
 const types={'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary'};
 const server=createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(pathname==='/_v241-015.html'){res.writeHead(200,{'content-type':'text/html'});res.end(fixture);return;}
   const file=resolve(root,'.'+pathname);
   if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
   const bytes=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
 t.after(()=>new Promise(ok=>server.close(ok)));
 const {chromium}=await playwright();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 t.after(()=>browser.close());
 const page=await browser.newPage();
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 let release=()=>{},during=[];
 if(failure){
  const gate=new Promise(ok=>{release=ok;});
  let signalFailure;const failed=new Promise(ok=>{signalFailure=ok;});
  await page.route('**/tennis-crowd-v22/runtime/lod0/fan-01.glb',async route=>{await gate;await route.continue();});
  await page.route('**/tennis-crowd-v22/runtime/lod2/fan-12.glb',async route=>{await route.fulfill({status:503,body:'optional crowd fixture unavailable'});signalFailure();});
  t.after(release);
  await page.goto(`http://127.0.0.1:${server.address().port}/_v241-015.html${flag}`);
  await page.waitForFunction(()=>window.__stadium?.metrics.crowdLate==='loading');
  await failed;
  // A later request has rejected, while the sequential consumer is still awaiting fan-01.
  await page.waitForTimeout(100);
  during=await page.evaluate(()=>({unhandled:[...__unhandled],crowd:__stadium.metrics.crowd,crowdLate:__stadium.metrics.crowdLate}));
  if(dispose)await page.evaluate(()=>__stadium.dispose());
  release();
  await page.waitForFunction(()=>window.__stadium?.metrics.crowdLate==='failed');
 }else{
  await page.goto(`http://127.0.0.1:${server.address().port}/_v241-015.html${flag}`);
  await page.waitForFunction(()=>window.__stadium?.metrics.crowdLate==='ready');
 }
 const after=await page.evaluate(()=>({unhandled:[...__unhandled],metrics:{...__stadium.metrics},billboard:__stadium.group.getObjectByName('Crowd_v12')?.visible,attached:__scene.children.includes(__stadium.group),restored:__restored}));
 return {during,after,pageErrors};
}

test('V241-015: late optional failure is observed immediately and the billboard fallback survives',{timeout:30000},async t=>{
 const {during,after,pageErrors}=await run(t);
 assert.equal(during.crowdLate,'loading','the first sequential load was still blocked when the late request failed');
 assert.deepEqual(during.unhandled,[],'prefetch rejection must already have a handler while fan-01 is pending');
 assert.deepEqual(after.unhandled,[]);
 assert.equal(after.metrics.crowdLate,'failed','the consumer still receives the rejection');
 assert.equal(after.metrics.crowd,'billboard');assert.equal(after.billboard,true);assert.equal(after.attached,true);
 assert.deepEqual(pageErrors,[]);
});

test('V241-015: the explicit rollback preserves the old late-rejection timing',{timeout:30000},async t=>{
 const {during,after}=await run(t,{flag:'?tennisCrowdPrefetchSafe=0'});
 assert.equal(during.unhandled.length,1,'the disabled fix retains the measured legacy behavior');
 assert.match(during.unhandled[0],/fan-12\.glb 503/);
 assert.equal(after.metrics.crowdLate,'failed');assert.equal(after.metrics.crowd,'billboard');
});

test('V241-015: disposal during the blocked load cannot attach a late crowd or emit an unhandled rejection',{timeout:30000},async t=>{
 const {during,after,pageErrors}=await run(t,{dispose:true});
 assert.deepEqual(during.unhandled,[]);assert.deepEqual(after.unhandled,[]);
 assert.equal(after.attached,false);assert.equal(after.restored,1);assert.equal(after.metrics.crowdLate,'failed');
 assert.deepEqual(pageErrors,[]);
});

test('V241-015: successful prefetch still builds and swaps the real 600-fan crowd',{timeout:30000},async t=>{
 const {after,pageErrors}=await run(t,{failure:false});
 assert.deepEqual(after.unhandled,[]);assert.deepEqual(pageErrors,[]);
 assert.equal(after.metrics.crowdLate,'ready');assert.equal(after.metrics.crowd,'3d-lod');
 assert.equal(after.metrics.crowd3d.instances,600);assert.equal(after.billboard,false);
});
