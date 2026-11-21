import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {browserCleanup,serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';
import {isManagedPath,OFFLINE_GAMES} from '../workout/island/ui/offline.mjs';

/** Real browser checks for the one download button, the automatic download, the offline
 * start and the "game asks for a file that is not on the list" guard. Opt in with
 * ISLAND_CSP_BROWSER=1 (or ISLAND_OFFLINE_BROWSER=1), same as the other browser suites. */
const enabled=process.env.ISLAND_CSP_BROWSER==='1'||process.env.ISLAND_OFFLINE_BROWSER==='1';
const manifest=JSON.parse(await readFile(new URL('../workout/island/offline-manifest.json',import.meta.url),'utf8'));
const listed=new Set([...manifest.core,...manifest.shell,...Object.values(manifest.games).flat()].map(p=>'/workout/island/'+p));
const GAMES={soccer:'soccer',hoops:'streetSlam',alpine:'alpineRush',racing:'islandRacing'};
// Racing has no load-report writer. Its rendered model is the readiness evidence.
const reportedGames=['soccer','hoops','alpine'];
const gpuArgs=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];

async function setup(t){
 const defer=browserCleanup(t);
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
 defer(()=>server.close());
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:gpuArgs});
 defer(()=>browser.close());
 return {server,browser,defer};
}

async function open({browser,server,defer},{saveData=false,contextOptions={}}={}){
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1,...contextOptions});
 defer(()=>context.close());
 if(saveData)await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}));
 const csp=await installIslandCspMonitor(context);
 defer(()=>csp.dispose());
 const page=await context.newPage();page.setDefaultTimeout(120000);await csp.attachPage(page);
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 return {context,page,csp,errors,requests,server};
}
async function boot(page,server){
 await page.goto(server.url+'?dev=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
 if(await page.locator('[data-action=avatar-start]').count())await page.locator('[data-action=avatar-start]').click();
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;
  for(const t of ['basketball','soccer']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size;x++)if(e.place(t,x,z).ok){done=true;break;}}});
}
async function play(page,name,id){
 const report=reportedGames.includes(name)?`island.${name}.lastLoadReport`:null;
 await page.evaluate(({id,report})=>{
  const e=window.__island.engine;
  if(report)localStorage.removeItem(report);
  if(!e.state.instructionsSeen.includes(id))e.state.instructionsSeen.push(id);
  window.__island.ui.activityInterface.launch(id,undefined,1);
 },{id,report});
 const status=await page.waitForFunction(({name,report})=>{
  const session=window.__island?.games.current?.session,s=session?.snapshot,m=s?.renderMetrics;
  const error=s?.error||session?.loadFailed;
  if(error)return {status:'failed',error};
  if(session?.ready!==true||!(m?.calls>0||m?.drawCalls>0))return false;
  if(name==='racing')return m.mode==='webgl'&&m.modelLoaded?{status:'ready'}:false;
  const reportText=localStorage.getItem(report);
  if(!reportText)return false;
  const observed=name==='soccer'?m.assetStatus:/^status (\w+)/m.exec(reportText)?.[1];
  return observed?{status:observed}:false;
 },{name,report},{timeout:200000}).catch(error=>{
  throw new Error(name+' did not reach a rendered frame with a fresh load result',{cause:error});
 });
 const result=await status.jsonValue();
 assert.equal(result.status,'ready',name+' did not load: '+JSON.stringify(result));
}
const leave=page=>page.evaluate(()=>{window.__island.games.cleanup?.();window.__island.ui.closeModal?.();});

test('one button downloads soccer, basketball, ski and racing; status counts the real cache; saves stay untouched; then the island opens offline with all four games',{skip:!enabled,timeout:900000},async testContext=>{
 const fixture=await setup(testContext),{server}=fixture;
 const t=await open(fixture,{saveData:true});
  await boot(t.page,server);
  await t.page.evaluate(()=>{localStorage.setItem('island.test.marker','keep');});
  const savedBefore=await t.page.evaluate(()=>Object.keys(localStorage).filter(k=>!k.startsWith('island.offline')).sort());
  await t.page.evaluate(()=>window.__island.ui.activityInterface.menu());
  await t.page.evaluate(()=>{const texts=new Set(),panel=document.querySelector('[data-offline-panel]');new MutationObserver(()=>texts.add(panel.querySelector('.offline-status').textContent)).observe(panel,{subtree:true,childList:true,characterData:true});window.__texts=texts;return panel.querySelector('.offline-status').textContent;});
  await t.page.locator('[data-action=offline-download-all]').click();
  await t.page.waitForFunction(()=>document.querySelector('.offline-status')?.textContent.includes('שמור לגרסה הזו'),null,{timeout:600000});
  const texts=await t.page.evaluate(()=>[...window.__texts]);
  assert.ok(texts.some(x=>/^מוריד \d+ מתוך \d+ · \d+%$/.test(x)),'progress shows X of Y and percent: '+texts.slice(0,5));
  const state=await t.page.evaluate(async()=>({games:[...document.querySelectorAll('.offline-games li')].map(li=>[li.dataset.game,li.dataset.complete]),keys:await caches.keys(),after:Object.keys(localStorage).filter(k=>!k.startsWith('island.offline')).sort(),marker:localStorage.getItem('island.test.marker'),status:JSON.parse(localStorage.getItem('island.offline.status'))}));
  const packs=Object.keys(OFFLINE_GAMES).sort((a,b)=>a.localeCompare(b));
  assert.deepEqual(Object.keys(manifest.games).sort((a,b)=>a.localeCompare(b)),packs,'the UI catalogue and manifest have the same packs');
  for(const name of Object.keys(GAMES))assert.ok(manifest.games[name]?.length,name+' has an offline pack');
  assert.deepEqual(state.games.sort(([a],[b])=>a.localeCompare(b)),packs.map(name=>[name,'true']),
   'every configured pack has exactly one completed row');
  assert.equal(state.keys.length,1);assert.match(state.keys[0],/^island-assets-/);
  assert.equal(state.marker,'keep');assert.deepEqual(state.after,savedBefore,'no save key was removed');
  assert.deepEqual(state.status.failed,[]);
  // Each online game may request only cached assets.
  for(const [name,id] of Object.entries(GAMES)){await play(t.page,name,id);await leave(t.page);}
  const unlisted=[...new Set(t.requests.map(u=>new URL(u)).filter(u=>u.origin===new URL(server.url).origin&&isManagedPath(u.pathname)&&!listed.has(u.pathname)).map(u=>u.pathname))];
  assert.deepEqual(unlisted,[],'a game requested files that are not in offline-manifest.json');
  // Offline start: reload with no network at all.
  await t.page.waitForFunction(()=>navigator.serviceWorker.controller);
  await t.page.close();
  await t.context.setOffline(true);
  const offlinePage=await t.context.newPage();offlinePage.setDefaultTimeout(180000);const errors=[];offlinePage.on('pageerror',e=>errors.push(e.message));
  const failed=[];offlinePage.on('requestfailed',r=>{if(!/ERR_ABORTED/.test(r.failure()?.errorText||''))failed.push(r.url()+' '+r.failure()?.errorText);});/* a request cut short when the game closes is not a missing file */
  await offlinePage.goto(server.url+'?dev=1',{waitUntil:'domcontentloaded'});
  await offlinePage.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:180000});
  await offlinePage.evaluate(()=>{window.__island.engine.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;});
  for(const [name,id] of Object.entries(GAMES)){
   await play(offlinePage,name,id);
   await leave(offlinePage);
  }
  assert.deepEqual(failed.filter(u=>u.startsWith(server.url)&&!/release\.json/.test(u)),[],'nothing the app needs failed offline');
  assert.deepEqual(errors,[]);
  for(const id of reportedGames)assert.ok(await offlinePage.evaluate(id=>localStorage.getItem(`island.${id}.lastLoadReport`),id),id+' wrote a load report');
  await t.csp.assertClean();
});

test('automatic download fills the device cache after open, and a data saver skips it',{skip:!enabled,timeout:1500000},async testContext=>{
 // The scheduled background download has a deliberate delay between files.
 const fixture=await setup(testContext),{server}=fixture;
 const saver=await open(fixture,{saveData:true});
  await saver.page.goto(server.url,{waitUntil:'networkidle'});await saver.page.waitForFunction(()=>window.__offlineState?.state==='save-data',null,{timeout:60000});
  assert.deepEqual(await saver.page.evaluate(async()=>(await caches.keys()).length?await (await caches.open((await caches.keys())[0])).keys().then(k=>k.length):0),0,'a data saver downloads nothing in the background');
  await saver.csp.assertClean();
  await saver.context.close();
  const auto=await open(fixture);
  await auto.page.goto(server.url+'?dev=1&quality=high&autoIdleMs=2000',{waitUntil:'networkidle'});
  // A fresh profile opens the avatar dialog; the background download waits until it is closed (by design).
  await auto.page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded,null,{timeout:120000});if(await auto.page.locator('[data-action=avatar-start]').count())await auto.page.locator('[data-action=avatar-start]').click();
  await auto.page.waitForFunction(()=>window.__offlineState?.state==='ready'||window.__offlineState?.state==='partial',null,{timeout:1200000});
  const state=await auto.page.evaluate(()=>window.__offlineState);assert.equal(state.state,'ready',JSON.stringify(state.result?.failed));
  const key=(await auto.page.evaluate(()=>caches.keys()))[0];assert.match(key,/^island-assets-/);
  await auto.csp.assertClean();
});

test('each game renders after a requested asset is blocked by the browser',{skip:!enabled,timeout:600000},async testContext=>{
 const fixture=await setup(testContext),{server}=fixture;
 const t=await open(fixture,{saveData:true,contextOptions:{serviceWorkers:'block'}});
 const blocked={
  soccer:/\/atlases\/goal-burst\.webp$/,
  hoops:/\/atlases\/net-spark\.webp$/,
  alpine:/\/atlases\/ski-scrape\.webp$/,
  racing:/\/racing-v7\/textures\/asphalt-orm\.webp$/,
 };
 let current;
 const intercepted=new Map();
 await t.context.route('**/*',async route=>{
  const name=current,url=new URL(route.request().url());
  if(!name||!blocked[name].test(url.pathname))return route.continue();
  await route.abort('failed');
  intercepted.set(name,url.pathname);
 });
 await boot(t.page,server);
 for(const [name,id] of Object.entries(GAMES)){
  current=name;
  await play(t.page,name,id);
  assert.ok(intercepted.has(name),name+' never requested '+blocked[name]);
  await leave(t.page);
 }
 assert.deepEqual(t.errors.filter(error=>!/Failed to load resource|net::/.test(error)),[]);
 await t.csp.assertClean();
});
