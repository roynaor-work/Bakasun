import nodeTest from 'node:test';
// Browser suite (Chromium + Playwright), like the other island browser tests: runs with
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chrome>
const test=process.env.ISLAND_CSP_BROWSER==='1'?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {repositoryRoot,serveRepository,launchBrowser} from './review-v241/helpers-hoops.mjs';

const bodies=['guard','wing','center'].map(id=>'assets/athlete-body-v22/models/'+id+'.glb');
test('V241-010: a complete cold cache preserves the v22 basketball rollback with a real offline worker', {timeout:300000}, async t=>{
 const server=await serveRepository(),browser=await launchBrowser();
 t.after(async()=>{await browser.close();await server.close();});
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
 const page=await context.newPage();
 await page.goto(server.url+'/workout/island/?dev=1&autodownload=0');
 await page.waitForFunction(()=>Boolean(window.__island?.data),null,{timeout:120000});
 await page.evaluate(()=>{window.__island.view.paused=true;});
 const download=await page.evaluate(async()=>{
  const m=await import('/workout/island/ui/offline.mjs');
  const result=await m.downloadGames({concurrency:8,attempts:1,timeoutMs:15000});
  await navigator.serviceWorker.ready;
  return {failed:result.failed,total:result.total,status:await m.offlineStatus()};
 });
 assert.equal(download.failed.length,0,JSON.stringify(download.failed));
 assert.equal(download.status.complete,true);
 const cached=await page.evaluate(async bodies=>{
  const {cacheName}=await import('/workout/island/ui/offline.mjs');
  const {DATA_VERSION}=await import('/workout/island/release.mjs');
  const cache=await caches.open(cacheName(DATA_VERSION));
  return Promise.all(bodies.map(async p=>Boolean(await cache.match(new URL(p,location.href),{ignoreSearch:true}))));
 },bodies);
 await context.setOffline(true);
 await page.reload({waitUntil:'load',timeout:120000});
 await page.waitForFunction(()=>Boolean(window.__island?.data),null,{timeout:120000});
 const versions=await page.evaluate(async()=>{
  window.__island.view.paused=true;
  const {loadAthleteHoops}=await import('/workout/island/minigames/hoops-athlete.mjs');
  const versions=[];
  for(const query of ['', 'hoopsV241=0','hoopsBodyV2=0']){
   const assets=await loadAthleteHoops(window.__island.data.config.minigames.streetSlam.assets,new URL('/workout/island/',location.href),null,{params:new URLSearchParams(query)});
   versions.push({query,version:assets.bodyVersion});assets.dispose();
  }
  return versions;
 });
 assert.deepEqual(versions.map(v=>v.version),['v2','v22','v22'],JSON.stringify(versions));
 assert.deepEqual(cached,[true,true,true],'all rollback bodies are in the complete cold cache');
 console.log(JSON.stringify({download,versions}));
});

test('V241-010: the rollback-offline kill switch restores the old download list',async()=>{
 const {pathToFileURL}=await import('node:url');
 const {loadManifest}=await import(pathToFileURL(path.join(repositoryRoot,'workout/island/ui/offline.mjs')).href);
 const manifest=JSON.parse(await readFile(path.join(repositoryRoot,'workout/island/offline-manifest.json'),'utf8'));
 const oldLocation=globalThis.location;
 try{
  globalThis.location={search:'?hoopsRollbackOffline=0'};
  const legacy=await loadManifest('test',async()=>({ok:true,json:async()=>structuredClone(manifest)}));
  assert.ok(bodies.every(p=>!legacy.games.hoops.includes(p)));
  globalThis.location={search:''};
  const fixed=await loadManifest('test',async()=>({ok:true,json:async()=>structuredClone(manifest)}));
  assert.ok(bodies.every(p=>fixed.games.hoops.includes(p)),'the fixed default includes every role');
 }finally{if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;}
});
