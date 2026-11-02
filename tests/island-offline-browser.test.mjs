import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';
import {isManagedPath} from '../workout/island/ui/offline.mjs';

/** Real browser checks for the one download button, the automatic download, the offline
 * start and the "game asks for a file that is not on the list" guard. Opt in with
 * ISLAND_CSP_BROWSER=1 (or ISLAND_OFFLINE_BROWSER=1), same as the other browser suites. */
const enabled=process.env.ISLAND_CSP_BROWSER==='1'||process.env.ISLAND_OFFLINE_BROWSER==='1';
const manifest=JSON.parse(await readFile(new URL('../workout/island/offline-manifest.json',import.meta.url),'utf8'));
const listed=new Set([...manifest.core,...manifest.shell,...Object.values(manifest.games).flat()].map(p=>'/workout/island/'+p));
const GAMES={soccer:'soccer',hoops:'streetSlam',alpine:'alpineRush'};
const gpuArgs=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];

async function open(browser,server,{saveData=false,contextOptions={}}={}){
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1,...contextOptions});
 if(saveData)await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}));
 const csp=await installIslandCspMonitor(context),page=await context.newPage();page.setDefaultTimeout(120000);await csp.attachPage(page);
 const errors=[],requests=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('requestfailed',r=>failed.push(r.url()+' '+r.failure()?.errorText));
 return {context,page,csp,errors,requests,failed,server};
}
async function boot(page,server){
 await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
 if(await page.locator('[data-action=avatar-start]').count())await page.locator('[data-action=avatar-start]').click();
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;
  for(const t of ['basketball','soccer']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size;x++)if(e.place(t,x,z).ok){done=true;break;}}});
}
async function play(page,id){
 await page.evaluate(id=>{const e=window.__island.engine;if(!e.state.instructionsSeen.includes(id))e.state.instructionsSeen.push(id);window.__island.ui.activityInterface.launch(id,undefined,1);},id);
 await page.waitForTimeout(500);
 if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>{const s=window.__island.games?.current?.session?.snapshot;return s&&(s.renderMetrics?.calls>0||s.loaded||s.renderMetrics?.assetStatus==='ready');},null,{timeout:200000});
 await page.waitForTimeout(3000);
 return page.evaluate(()=>{const s=window.__island.games.current.session.snapshot;return {status:s.renderMetrics?.assetStatus||(s.loaded||s.renderMetrics?.calls>0?'ready':'?'),error:s.error||null};});
}
const leave=page=>page.evaluate(()=>{window.__island.games.cleanup?.();window.__island.ui.closeModal?.();});

test('one button downloads soccer, basketball and ski; status counts the real cache; saves stay untouched; then the island opens offline with all three games',{skip:!enabled,timeout:900000},async()=>{
 const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:gpuArgs});
 const t=await open(browser,server,{saveData:true});
 try{
  await boot(t.page,server);
  await t.page.evaluate(()=>{localStorage.setItem('island.test.marker','keep');});
  const savedBefore=await t.page.evaluate(()=>Object.keys(localStorage).filter(k=>!k.startsWith('island.offline')).sort());
  await t.page.evaluate(()=>window.__island.ui.activityInterface.menu());
  const seen=await t.page.evaluate(()=>{const texts=new Set(),panel=document.querySelector('[data-offline-panel]');new MutationObserver(()=>texts.add(panel.querySelector('.offline-status').textContent)).observe(panel,{subtree:true,childList:true,characterData:true});window.__texts=texts;return panel.querySelector('.offline-status').textContent;});
  await t.page.locator('[data-action=offline-download-all]').click();
  await t.page.waitForFunction(()=>document.querySelector('.offline-status')?.textContent.includes('שמור לגרסה הזו'),null,{timeout:600000});
  const texts=await t.page.evaluate(()=>[...window.__texts]);
  assert.ok(texts.some(x=>/^מוריד \d+ מתוך \d+ · \d+%$/.test(x)),'progress shows X of Y and percent: '+texts.slice(0,5));
  const state=await t.page.evaluate(async()=>({games:[...document.querySelectorAll('.offline-games li')].map(li=>[li.dataset.game,li.dataset.complete]),keys:await caches.keys(),after:Object.keys(localStorage).filter(k=>!k.startsWith('island.offline')).sort(),marker:localStorage.getItem('island.test.marker'),status:JSON.parse(localStorage.getItem('island.offline.status'))}));
  assert.deepEqual(state.games,[['soccer','true'],['hoops','true'],['alpine','true']]);
  assert.equal(state.keys.length,1);assert.match(state.keys[0],/^island-assets-/);
  assert.equal(state.marker,'keep');assert.deepEqual(state.after,savedBefore,'no save key was removed');
  assert.deepEqual(state.status.failed,[]);
  // Online, the three games asked only for listed files.
  const beforeGames=t.requests.length;
  for(const id of Object.values(GAMES)){await play(t.page,id);await leave(t.page);}
  const unlisted=[...new Set(t.requests.slice(beforeGames).map(u=>new URL(u)).filter(u=>u.origin===new URL(server.url).origin&&isManagedPath(u.pathname)&&!listed.has(u.pathname)).map(u=>u.pathname))];
  assert.deepEqual(unlisted,[],'a game requested files that are not in offline-manifest.json');
  // Offline start: reload with no network at all.
  await t.page.waitForFunction(()=>navigator.serviceWorker.controller);
  await t.context.setOffline(true);
  const offlinePage=await t.context.newPage();offlinePage.setDefaultTimeout(180000);const errors=[];offlinePage.on('pageerror',e=>errors.push(e.message));
  const failed=[];offlinePage.on('requestfailed',r=>failed.push(r.url()));
  await offlinePage.goto(server.url+'?dev=1',{waitUntil:'domcontentloaded'});
  await offlinePage.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:180000});
  await offlinePage.evaluate(()=>{window.__island.engine.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;});
  for(const [name,id] of Object.entries(GAMES)){
   const result=await play(offlinePage,id);assert.equal(result.status,'ready',name+' offline: '+JSON.stringify(result));await leave(offlinePage);
  }
  assert.deepEqual(failed.filter(u=>u.startsWith(server.url)&&!/release\.json/.test(u)),[],'nothing the app needs failed offline');
  assert.deepEqual(errors,[]);
  for(const id of ['soccer','hoops','alpine'])assert.ok(await offlinePage.evaluate(id=>localStorage.getItem(`island.${id}.lastLoadReport`),id),id+' wrote a load report');
  await t.csp.assertClean();
 }finally{await t.csp.dispose();await t.context.close();await browser.close();await server.close();}
});

test('automatic download fills the device cache after open, and a data saver skips it',{skip:!enabled,timeout:600000},async()=>{
 const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:gpuArgs});
 const saver=await open(browser,server,{saveData:true}),auto=await open(browser,server);
 try{
  await saver.page.goto(server.url,{waitUntil:'networkidle'});await saver.page.waitForFunction(()=>window.__offlineState?.state==='save-data',null,{timeout:60000});
  assert.deepEqual(await saver.page.evaluate(async()=>(await caches.keys()).length?await (await caches.open((await caches.keys())[0])).keys().then(k=>k.length):0),0,'a data saver downloads nothing in the background');
  await auto.page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});
  // Software WebGL keeps the page thread busy; a phone GPU does not. Pause the island view so the test measures the download.
  await auto.page.waitForFunction(()=>window.__island||true);await auto.page.evaluate(()=>{if(window.__island)window.__island.ui.view.paused=true;});
  await auto.page.waitForFunction(()=>window.__offlineState?.state==='ready'||window.__offlineState?.state==='partial',null,{timeout:480000});
  const state=await auto.page.evaluate(()=>window.__offlineState);assert.equal(state.state,'ready',JSON.stringify(state.result?.failed));
  const key=(await auto.page.evaluate(()=>caches.keys()))[0];assert.match(key,/^island-assets-/);
  await auto.csp.assertClean();
 }finally{for(const t of [saver,auto]){await t.csp.dispose();await t.context.close();}await browser.close();await server.close();}
});

test('a missing or blocked asset never hangs a game: soccer, basketball and ski still reach the playing screen',{skip:!enabled,timeout:600000},async()=>{
 const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:gpuArgs});
 const t=await open(browser,server,{saveData:true,contextOptions:{serviceWorkers:'block'}});
 const blocked={soccer:/crowd-dots\.webp|goal-burst\.webp/,hoops:/net-spark\.webp|burning-ball-glow\.webp/,alpine:/ski-scrape\.webp|snow-dust\.webp/};
 let current='soccer';await t.context.route('**/*',route=>{const url=route.request().url();if(blocked[current].test(url))return route.abort('failed');return route.continue();});
 try{
  await boot(t.page,server);
  for(const [name,id] of Object.entries(GAMES)){current=name;const result=await play(t.page,id);assert.equal(result.status,'ready',name+' with a blocked asset: '+JSON.stringify(result));await leave(t.page);}
  assert.deepEqual(t.errors.filter(e=>!/Failed to load resource|net::/.test(e)),[]);
 }finally{await t.csp.dispose();await t.context.close();await browser.close();await server.close();}
});
