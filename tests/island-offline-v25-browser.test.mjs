import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';
import {pathsFor,hrefOf,cacheName,megabytes} from '../workout/island/ui/offline.mjs';
import {DATA_VERSION} from '../workout/island/release.mjs';

/** Offline v25 in a real browser (ISLAND_CSP_BROWSER=1 or ISLAND_OFFLINE_BROWSER=1): the background
 * download keeps only the shell and the packages of the games played (default: the main games), the
 * panel downloads and deletes one package, storage and install lines are shown, the island then opens
 * with no network and plays from the device; a next release is prepared by copying unchanged files
 * and downloading the changed ones only, and its worker drops the old cache. Nothing in a save moves. */
const enabled=process.env.ISLAND_CSP_BROWSER==='1'||process.env.ISLAND_OFFLINE_BROWSER==='1';
const island=new URL('../workout/island/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('offline-manifest.json',island),'utf8'));
const gpuArgs=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const GAMES={soccer:'soccer',hoops:'streetSlam'};
/** The size a package row must show: the manifest's bytes for that package, so a release that adds files to a package
 * (v24.7: tennis callouts and crowd recordings, 4.7 -> 4.9 MB) does not need a new literal here. */
const packSize=game=>megabytes(pathsFor(manifest,[game]).reduce((sum,p)=>sum+(manifest.files?.[p]?.[1]||0),0))+' MB';

async function open(browser,server,{saveData=false,contextOptions={}}={}){
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,...contextOptions});
 if(saveData)await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}));
 const csp=await installIslandCspMonitor(context),page=await context.newPage();page.setDefaultTimeout(120000);await csp.attachPage(page);
 const errors=[],requests=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('requestfailed',r=>failed.push(r.url()+' '+r.failure()?.errorText));
 return {context,page,csp,errors,requests,failed,server};
}
async function boot(page,server,query='?dev=1'){
 await page.goto(server.url+query,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
 if(await page.locator('[data-action=avatar-start]').count())await page.locator('[data-action=avatar-start]').click();
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;
  for(const t of ['basketball','soccer']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size;x++)if(e.place(t,x,z).ok){done=true;break;}}});
}
async function play(page,id){
 await page.evaluate(id=>{const e=window.__island.engine;if(!e.state.instructionsSeen.includes(id))e.state.instructionsSeen.push(id);window.__island.ui.activityInterface.launch(id,undefined,1);},id);
 await page.waitForTimeout(500);
 if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 const started=Date.now();
 await page.waitForFunction(()=>{const s=window.__island.games?.current?.session?.snapshot;return s&&(s.renderMetrics?.calls>0||s.renderMetrics?.drawCalls>0||s.loaded||s.renderMetrics?.assetStatus==='ready');},null,{timeout:300000});
 const ms=Date.now()-started;await page.waitForTimeout(2000);
 const status=await page.evaluate(id=>{const s=window.__island.games.current.session.snapshot,key=({soccer:'soccer',streetSlam:'hoops',alpineRush:'alpine'})[id];return s.renderMetrics?.assetStatus||(s.loaded||(s.renderMetrics?.mode==='webgl'&&s.renderMetrics.modelLoaded)?'ready':(/status (\w+)/.exec(localStorage.getItem(`island.${key}.lastLoadReport`)||'')||[])[1]||'?');},id);
 return {status,ms};
}
const leave=page=>page.evaluate(()=>{window.__island.games.cleanup?.();window.__island.ui.closeModal?.();});
/** The page's own view of the cache, through the same module the app uses. */
const status=(page,version)=>page.evaluate(async version=>{const m=await import(new URL('./ui/offline.mjs',location.href).href);const s=await m.offlineStatus(version);return {complete:s.complete,shell:s.shell.complete,have:s.have,total:s.total,games:Object.fromEntries(Object.entries(s.games).map(([g,v])=>[g,v.complete]))};},version);

test('v25: the background download keeps the shell and the main games only; the panel downloads and deletes one package; the island opens and plays offline',{skip:!enabled,timeout:1500000},async()=>{
 const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:gpuArgs});
 const t=await open(browser,server);
 try{
  await boot(t.page,server,'?dev=1&quality=high&autoIdleMs=2000');
  await t.page.evaluate(()=>{localStorage.setItem('island.test.marker','keep');});
  const savedBefore=await t.page.evaluate(()=>Object.keys(localStorage).filter(k=>!k.startsWith('island.offline')).sort());
  const t0=Date.now();
  await t.page.waitForFunction(()=>window.__offlineState?.state==='ready'||window.__offlineState?.state==='partial',null,{timeout:900000});
  const auto=await t.page.evaluate(()=>window.__offlineState);
  console.log('v25 auto download',Math.round((Date.now()-t0)/1000),'s',JSON.stringify({state:auto.state,wanted:auto.wanted,failed:auto.result?.failed?.length,bytes:auto.result?.bytes}));
  assert.equal(auto.state,'ready',JSON.stringify(auto.result?.failed));
  assert.deepEqual(auto.wanted,['soccer','hoops','alpine','alpineLeague','city'],'nothing played yet: the three main games and the hub');
  let s=await status(t.page);
  assert.equal(s.shell,true);for(const g of ['soccer','hoops','alpine','alpineLeague','city'])assert.equal(s.games[g],true,g);
  for(const g of ['tennis','racing','naval','boar','fire','alien','catch'])assert.equal(s.games[g],false,g+' is not downloaded before it was played');
  assert.equal((await t.page.evaluate(()=>caches.keys())).length,1);
  // The panel: v25 rows with size and state, storage line, install button or hint.
  await t.page.evaluate(()=>window.__island.ui.activityInterface.menu());
  await t.page.waitForFunction(()=>document.querySelector('[data-offline-panel][data-v25] .offline-pack[data-game=soccer][data-state=ready]'));
  const rows=await t.page.evaluate(()=>[...document.querySelectorAll('.offline-pack')].map(li=>({game:li.dataset.game,state:li.dataset.state,size:li.querySelector('.offline-pack-size').textContent,action:li.querySelector('button')?.dataset.action})));
  assert.equal(rows.length,12);
  assert.deepEqual(rows.find(r=>r.game==='soccer'),{game:'soccer',state:'ready',size:packSize('soccer'),action:'offline-pack-delete'});
  const tennis=rows.find(r=>r.game==='tennis');assert.ok(['missing','partial'].includes(tennis.state),'tennis is not ready (files shared with the main games may already be there): '+JSON.stringify(tennis));
  assert.equal(tennis.size,packSize('tennis'));assert.match(tennis.size,/^[1-9][\d.]* MB$/);assert.equal(tennis.action,'offline-pack-download');
  const texts=await t.page.evaluate(()=>({status:document.querySelector('.offline-status').textContent,storage:document.querySelector('[data-offline-storage]').textContent,install:document.querySelector('[data-action=offline-install]').textContent,installState:document.querySelector('[data-offline-panel]').dataset.install}));
  assert.match(texts.status,/האפליקציה שמורה · 5 מתוך 12 משחקים מוכנים/);
  assert.match(texts.storage,/באחסון המכשיר: [\d.]+ MB/);assert.match(texts.storage,/שמירה קבועה: (כן|לא)/);
  assert.ok(['prompt','manual','ios','installed'].includes(texts.installState),texts.installState);
  if(texts.installState!=='installed'){await t.page.locator('[data-action=offline-install]').click();await t.page.waitForFunction(()=>!document.querySelector('[data-install-hint]').hidden);assert.match(await t.page.evaluate(()=>document.querySelector('[data-install-hint]').textContent),/הוספה למסך הבית|התקנת אפליקציה|מותקנת/);}
  // One package: download tennis, then delete it; soccer's shared files stay.
  await t.page.locator('.offline-pack[data-game=tennis] [data-action=offline-pack-download]').click();
  await t.page.waitForFunction(()=>document.querySelector('.offline-pack[data-game=tennis]')?.dataset.state==='ready',null,{timeout:300000});
  s=await status(t.page);assert.equal(s.games.tennis,true);
  await t.page.waitForTimeout(1000);/* the panel re-renders once more after asking for persistent storage */
  await t.page.locator('.offline-pack[data-game=tennis] [data-action=offline-pack-delete]').click();
  assert.equal(await t.page.evaluate(()=>document.querySelector('.offline-pack[data-game=tennis] button').textContent),'בטוח? מחיקה','a delete asks once');
  await t.page.locator('.offline-pack[data-game=tennis] [data-action=offline-pack-delete]').click();
  await t.page.waitForFunction(()=>/^(missing|partial)$/.test(document.querySelector('.offline-pack[data-game=tennis]')?.dataset.state),null,{timeout:60000});
  assert.match(await t.page.evaluate(()=>document.querySelector('.offline-status').textContent),/טניס נמחק מהמכשיר \(\d+ קבצים/);
  s=await status(t.page);assert.equal(s.games.tennis,false);assert.equal(s.games.soccer,true,'a shared file was not removed with tennis');
  const shared=pathsFor(manifest,['tennis']).filter(p=>manifest.games.soccer.includes(p));
  if(shared.length)assert.ok(await t.page.evaluate(async href=>Boolean(await (await caches.open((await caches.keys())[0])).match(href)),new URL(shared[0],server.url).href),'shared file kept: '+shared[0]);
  await t.page.evaluate(()=>window.__island.ui.closeModal?.());
  const state=await t.page.evaluate(()=>({after:Object.keys(localStorage).filter(k=>!k.startsWith('island.offline')).sort(),marker:localStorage.getItem('island.test.marker')}));
  assert.equal(state.marker,'keep');assert.deepEqual(state.after,savedBefore,'no save key was removed');
  // Offline: a new page with no network at all opens the island and plays the downloaded games from the device.
  await t.page.waitForFunction(()=>navigator.serviceWorker.controller);
  await t.context.setOffline(true);
  const offlinePage=await t.context.newPage();offlinePage.setDefaultTimeout(180000);const errors=[];offlinePage.on('pageerror',e=>errors.push(e.message));
  const failed=[],network=[];offlinePage.on('requestfailed',r=>{if(!/ERR_ABORTED/.test(r.failure()?.errorText||''))failed.push(r.url()+' '+r.failure()?.errorText);});
  offlinePage.on('response',r=>{if(!r.fromServiceWorker()&&r.url().startsWith(server.url))network.push(r.url());});
  const openStart=Date.now();
  await offlinePage.goto(server.url+'?dev=1',{waitUntil:'domcontentloaded'});
  await offlinePage.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:180000});
  console.log('v25 offline open',Date.now()-openStart,'ms');
  await offlinePage.evaluate(()=>{window.__island.engine.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;});
  for(const [name,id] of Object.entries(GAMES)){const r=await play(offlinePage,id);console.log('v25 offline first frame',name,r.ms,'ms');assert.equal(r.status,'ready',name+' offline');await leave(offlinePage);}
  assert.deepEqual(failed.filter(u=>u.startsWith(server.url)&&!/release\.json/.test(u)),[],'nothing the app needs failed offline');
  assert.deepEqual(network,[],'offline: every answer came from the worker');
  assert.deepEqual(errors,[]);
  await t.csp.assertClean();
 }finally{await t.csp.dispose();await t.context.close();await browser.close();await server.close();}
});

test('v25: a next release is prepared by copying unchanged files and downloading only the changed one; its worker takes over and drops the old cache; ?offlineV25=0 shows the v24 panel',{skip:!enabled,timeout:900000},async()=>{
 const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:gpuArgs});
 const t=await open(browser,server);/* ?autodownload=0 below: this test downloads one package itself */
 const NEXT='island-v2-test-next',changedPath=manifest.games.soccer.find(p=>/\.webp$/.test(p)&&manifest.files[p][1]<200000);
 const original=await readFile(new URL(changedPath,island)),modified=Buffer.concat([original,Buffer.from('v25-changed')]);
 const nextManifest=structuredClone(manifest);nextManifest.files[changedPath]=[createHash('sha256').update(modified).digest('hex').slice(0,16),modified.length];
 let served=0;
 try{
  await boot(t.page,server,'?dev=1&autodownload=0');
  await t.page.evaluate(()=>{localStorage.setItem('island.test.marker','keep');});
  const first=await t.page.evaluate(async()=>{const m=await import(new URL('./ui/offline.mjs',location.href).href);const t0=performance.now();const r=await m.downloadGames({games:['soccer']});return {ms:Math.round(performance.now()-t0),total:r.total,failed:r.failed,bytes:r.bytes};});
  assert.deepEqual(first.failed,[]);console.log('v25 soccer+shell download',first.ms,'ms',first.total,'files',Math.round(first.bytes/1048576*10)/10,'MB');
  // "Deploy" the next release: release.json, its manifest and the one changed asset.
  await t.context.route(u=>/release\.json/.test(u.pathname),route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:NEXT})}));
  await t.context.route(u=>/offline-manifest\.json$/.test(u.pathname)&&u.searchParams.get('v')===NEXT,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(nextManifest)}));
  await t.context.route(u=>u.pathname.endsWith('/'+changedPath),route=>{served++;return route.fulfill({status:200,contentType:'image/webp',body:modified});});
  const prefetch=await t.page.evaluate(async NEXT=>{const m=await import(new URL('./ui/offline.mjs',location.href).href);const t0=performance.now();const r=await m.prefetchRelease(NEXT);return {ms:Math.round(performance.now()-t0),copied:r.copied,copiedBytes:r.copiedBytes,total:r.total,games:r.games,downloaded:{total:r.downloaded.total,fresh:r.downloaded.fresh,failed:r.downloaded.failed,bytes:r.downloaded.bytes}};},NEXT);
  console.log('v25 partial update',JSON.stringify(prefetch));
  assert.deepEqual(prefetch.games,['soccer']);
  assert.deepEqual(prefetch.downloaded.failed,[]);
  assert.equal(prefetch.downloaded.total,2,'only the changed asset and the manifest itself are downloaded');
  assert.equal(prefetch.copied,prefetch.total-2,'everything else is copied from the current cache');
  assert.ok(prefetch.downloaded.bytes<first.bytes/50,'the update is a small fraction of the full download: '+prefetch.downloaded.bytes+' of '+first.bytes);
  assert.equal(served,1,'the changed file was fetched once');
  const keys=await t.page.evaluate(()=>caches.keys());assert.deepEqual(keys.sort(),[cacheName(NEXT),cacheName(DATA_VERSION)].sort(),'both caches exist until the new worker is live');
  // The new worker takes over; its activate drops the old cache; the new cache holds the new bytes.
  const switched=await t.page.evaluate(async NEXT=>{const m=await import(new URL('./ui/offline.mjs',location.href).href);let reloaded=null;const ok=await m.switchRelease(NEXT,{reload:u=>{reloaded=u;}});return {ok,reloaded,controller:navigator.serviceWorker.controller?.scriptURL};},NEXT);
  assert.equal(switched.ok,true,JSON.stringify(switched));assert.match(switched.reloaded,/release=island-v2-test-next/);assert.match(switched.controller,/v=island-v2-test-next&v25=1/);
  await t.page.waitForFunction(()=>caches.keys().then(k=>k.length===1),null,{timeout:30000});
  assert.deepEqual(await t.page.evaluate(()=>caches.keys()),['island-assets-'+NEXT],'the old cache is gone once the new release is live');
  const bytes=await t.page.evaluate(async href=>{const c=await caches.open((await caches.keys())[0]);const r=await c.match(href);return r?(await r.arrayBuffer()).byteLength:-1;},hrefOf(changedPath,new URL(server.url)));
  assert.equal(bytes,modified.length,'the new cache holds the changed file');
  const s=await status(t.page,NEXT);assert.equal(s.shell,true);assert.equal(s.games.soccer,true);
  assert.equal(await t.page.evaluate(()=>localStorage.getItem('island.test.marker')),'keep');
  // The flag restores the v24 panel. The fake release is withdrawn first: a v24 page would otherwise start a full prefetch of it.
  await t.context.unroute(u=>/release\.json/.test(u.pathname));await t.context.route(u=>/release\.json/.test(u.pathname),route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:DATA_VERSION})}));
  const legacy=await t.context.newPage();legacy.setDefaultTimeout(240000);await legacy.goto(server.url+'?dev=1&offlineV25=0&autodownload=0',{waitUntil:'domcontentloaded'});
  await legacy.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:240000});if(await legacy.locator('[data-action=avatar-start]').count())await legacy.locator('[data-action=avatar-start]').click();
  await legacy.evaluate(()=>{window.__island.engine.skipTutorial();window.__island.ui.activityInterface.menu();});
  await legacy.waitForSelector('[data-offline-panel]');
  assert.equal(await legacy.evaluate(()=>document.querySelector('[data-offline-panel]').hasAttribute('data-v25')),false,'v24 panel without the flag');
  assert.equal(await legacy.evaluate(()=>document.querySelectorAll('.offline-pack').length),0);
  assert.deepEqual(t.errors,[]);
  await t.csp.assertClean();
 }finally{await t.csp.dispose();await t.context.close();await browser.close();await server.close();}
});
