import test from 'node:test';
import assert from 'node:assert/strict';
import {browserCleanup,serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

/** Real browser checks for "stuck while loading? restart the game" in soccer, basketball and ski.
 * A file the game needs is held (never answered) so the load cannot finish; the threshold is lowered
 * with ?loadStuckMs. Opt in with ISLAND_CSP_BROWSER=1, like the other island browser suites. */
const enabled=process.env.ISLAND_CSP_BROWSER==='1'||process.env.ISLAND_LOAD_RESCUE_BROWSER==='1';
const gpuArgs=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const GAMES={soccer:{id:'soccer',hold:/design\/tactics\/soccer\.json/,key:'soccer'},hoops:{id:'streetSlam',hold:/minigames\/hoops-view\.mjs/,key:'hoops'},alpine:{id:'alpineRush',hold:/minigames\/alpine-view\.mjs/,key:'alpine'}};
const STUCK=5000;

async function setup(testContext,hold){
 const defer=browserCleanup(testContext);
 const chromium=await islandChromium();
 const server=await serveIsland('/workout/island/');
 defer(()=>server.close());
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:gpuArgs});
 defer(()=>browser.close());
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
 defer(()=>context.close());
 const csp=await installIslandCspMonitor(context);
 defer(()=>csp.dispose());
 const page=await context.newPage();page.setDefaultTimeout(120000);await csp.attachPage(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state={holding:true,held:[],intercepted:0};
 await context.route('**/*',route=>{if(state.holding&&hold.test(route.request().url())){state.held.push(route);state.intercepted++;return;}return route.continue();});
 state.release=async()=>{state.holding=false;const list=state.held.splice(0);for(const r of list)await r.continue().catch(()=>{});};
 defer(state.release);
 await page.goto(server.url+`?dev=1&loadStuckMs=${STUCK}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
 if(await page.locator('[data-action=avatar-start]').count())await page.locator('[data-action=avatar-start]').click();
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=50000;e.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;
  for(const t of ['basketball','soccer']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size;x++)if(e.place(t,x,z).ok){done=true;break;}}});
 return {server,page,csp,errors,state};
}
async function launch(page,id){
 return page.evaluate(id=>{
  const e=window.__island.engine;
  if(!e.state.instructionsSeen.includes(id))e.state.instructionsSeen.push(id);
  const started=Date.now();
  window.__rescueDelay=null;
  const observer=new MutationObserver(()=>{
   if(!document.querySelector('[data-load-rescue]'))return;
   window.__rescueDelay=Date.now()-started;
   observer.disconnect();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  window.__island.ui.activityInterface.launch(id,undefined,1);
  return document.querySelectorAll('[data-load-rescue]').length;
 },id);
}
async function ready(page){
 const state=await page.waitForFunction(()=>{
  const session=window.__island.games?.current?.session;
  if(session?.loadFailed)return {error:session.loadFailed};
  return session?.ready===true&&!document.querySelector('[data-load-rescue]')?{ready:true}:false;
 },null,{timeout:240000});
 assert.deepEqual(await state.jsonValue(),{ready:true},'the restarted session rendered and dismissed rescue');
}
const saveKeys=page=>page.evaluate(()=>Object.keys(localStorage).filter(k=>!/lastLoadReport$/.test(k)).sort());

for(const [name,g] of Object.entries(GAMES)){
 test(`${name}: a stuck load shows the restart button after the threshold; pressing it plays the game again and keeps every save key`,{skip:!enabled,timeout:600000},async tctx=>{
  const t=await setup(tctx,g.hold);
   await t.page.evaluate(()=>localStorage.setItem('island.test.marker','keep'));
   const before=await saveKeys(t.page);
   assert.equal(await launch(t.page,g.id),0,'no rescue box at launch');
   await t.page.waitForSelector('[data-load-rescue] [data-action=rescue-restart]',{timeout:30000});
   assert.ok(t.state.intercepted>0,'the expected load request was held');
   const delay=await t.page.evaluate(()=>window.__rescueDelay);
   assert.ok(delay>=STUCK,`the rescue UI first appeared after ${delay} ms, expected at least ${STUCK}`);
   const box=await t.page.locator('[data-action=rescue-restart]').first().boundingBox();
   assert.ok(box.height>=44&&box.width>=44,'touch target 44px+: '+JSON.stringify(box));
   assert.ok(await t.page.locator('[data-action=rescue-back]').count(),'back to menu is offered');
   const text=await t.page.locator('[data-load-rescue]').innerText();
   assert.ok(!text.includes('!'),'no exclamation marks');
   assert.match(text,/נתקע\? אתחול המשחק/);
   await t.page.locator('[data-action=rescue-restart]').first().click();
   await t.state.release();
   await ready(t.page);
   const after=await t.page.evaluate(key=>({keys:Object.keys(localStorage).filter(k=>!/lastLoadReport$/.test(k)).sort(),marker:localStorage.getItem('island.test.marker'),report:localStorage.getItem(`island.${key}.lastLoadReport`)}),g.key);
   assert.deepEqual(after.keys,before,'no save key was removed or added');
   assert.equal(after.marker,'keep');
   assert.match(after.report||'',/אתחול ידני 1/,'the manual restart is in the last load report');
   await t.csp.assertClean();
 });
}

test('ski: second stuck attempt offers the light version, third offers clearing only this game\'s asset cache; saves and other games\' files stay',{skip:!enabled,timeout:600000},async tctx=>{
 const g=GAMES.alpine,t=await setup(tctx,g.hold);
  await t.page.evaluate(()=>localStorage.setItem('island.test.marker','keep'));
  const before=await saveKeys(t.page);
  await launch(t.page,g.id);
  await t.page.waitForSelector('[data-load-rescue][data-step=restart]',{timeout:30000});
  assert.ok(t.state.intercepted>0,'the ski module request was held');
  await t.page.locator('[data-action=rescue-restart]').first().click();
  await t.page.waitForSelector('[data-load-rescue][data-step=lite]',{timeout:30000});
  assert.ok(await t.page.locator('[data-action=rescue-lite]').count(),'light version offered');
  await t.page.locator('[data-action=rescue-lite]').click();
  await t.page.waitForSelector('[data-load-rescue][data-step=clear]',{timeout:30000});
  // Seed a cache with one ski file and one soccer file; clearing must remove only the ski one.
  const manifest=await (await fetch(t.server.url+'offline-manifest.json')).json();
  const ski=manifest.games.alpine[0],soccer=manifest.games.soccer[0];
  await t.page.evaluate(async([a,b,base])=>{const c=await caches.open('island-assets-test');await c.put(new URL(a,base).href,new Response('x'));await c.put(new URL(b,base).href,new Response('y'));localStorage.setItem('island.test.sentinel','1');indexedDB.open('island-test-db');},[ski,soccer,t.server.url]);
  await t.page.locator('[data-action=rescue-clear]').click();
  await t.page.waitForFunction(async()=> (await (await caches.open('island-assets-test')).keys()).length===1,
   null,{polling:250,timeout:30000});
  const left=await t.page.evaluate(async()=>(await (await caches.open('island-assets-test')).keys()).map(r=>new URL(r.url).pathname));
  assert.equal(left.length,1);assert.ok(left[0].endsWith('/'+soccer),'the soccer file stayed: '+left);
  await t.state.release();
  await ready(t.page);
  const after=await t.page.evaluate(()=>({keys:Object.keys(localStorage).filter(k=>!/lastLoadReport$/.test(k)&&k!=='island.test.sentinel').sort(),sentinel:localStorage.getItem('island.test.sentinel'),report:localStorage.getItem('island.alpine.lastLoadReport')}));
  assert.deepEqual(after.keys,before);assert.equal(after.sentinel,'1');
  assert.match(after.report||'',/אתחול ידני 3 · ניקוי מטמון נכסים/);
  await t.csp.assertClean();
});
