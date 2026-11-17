// Full island -> embedded boar campaign. Real trusted touch starts every shot and buys each upgrade.
// QA hooks only create repeatable fresh saves / empty practice waves and step the shipped battle loop.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const root=path.resolve(process.env.PHONE_FIX_ROOT||fileURLToPath(new URL('../../../../../',import.meta.url)));
const output=path.resolve(process.env.PHONE_FIX_OUTPUT||fileURLToPath(new URL('../evidence/',import.meta.url)));
const mode=process.env.PHONE_FIX_MODE||'after';await mkdir(output,{recursive:true});
const {serveIsland,islandChromium,installIslandCspMonitor}=await import(pathToFileURL(path.join(root,'tests/helpers/island-browser.mjs')));
process.env.ISLAND_PLAYWRIGHT||='/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.ISLAND_BROWSER||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={mode,root,viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1,cases:[],assertions:[]};
function check(name,fn){try{fn();report.assertions.push({name,pass:true});}catch(error){report.assertions.push({name,pass:false,message:error.message});}}
async function scenario(name,query=''){
 const context=await browser.newContext({viewport:report.viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'});
 const csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
 page.setDefaultTimeout(120000);console.error('F scenario',name,'start');const errors=[],wasm=[],failed=[];page.on('pageerror',e=>{errors.push(e.message);console.error('F pageerror',e.message);});page.on('console',m=>{if(m.type()==='error')console.error('F console',m.text());});page.on('request',r=>{if(/\.wasm(?:\?|$)/.test(r.url()))wasm.push(r.url());});page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 await context.addInitScript(()=>{Object.defineProperty(globalThis,'WebAssembly',{value:undefined,configurable:false});localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');});
 const result={name,query,errors,wasm,failed};report.cases.push(result);
 try{
  await page.goto(server.url+'?dev=1'+query,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island,{timeout:120000});
  await page.evaluate(()=>{const {engine:e,ui,data}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.learning.required=false;e.tick=()=>({ok:true});data.featureFlags.events=false;ui.closeModal();});
  console.error('F island ready',name);await page.evaluate(()=>window.__island.games.start('boarDefense'));
  const understood=page.locator('[data-action=game-understood]');if(await understood.count())await understood.tap();
  const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor({timeout:120000});const frame=await(await frameEl.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready,{timeout:120000});
  result.frameURL=frame.url();result.touch=await frame.evaluate(()=>({width:innerWidth,height:innerHeight,maxTouchPoints:navigator.maxTouchPoints,wasmType:typeof WebAssembly}));
  await frame.evaluate(()=>{window.__trusted=[];document.addEventListener('pointerdown',e=>window.__trusted.push({trusted:e.isTrusted,type:e.pointerType,target:e.target.id||e.target.closest('button')?.textContent}));window.__boar.hold(true);});
  async function tap(selector){await frame.locator(selector).scrollIntoViewIfNeeded();const box=await frame.locator(selector).boundingBox();assert.ok(box,selector);await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);}
  await tap('#garage');result.initialPrice=await frame.evaluate(()=>window.__boar.prices().w.mg);
  result.walletBefore=await frame.evaluate(()=>window.__boar.state.coins);
  const mgButton='#weapon-grid .weapon-card:first-child button';
  await tap(mgButton);result.afterFirstPurchase=await frame.evaluate(()=>({level:window.__boar.state.save.weapons.mg,coins:window.__boar.state.coins,next:window.__boar.prices().w.mg,button:document.querySelector('#weapon-grid .weapon-card:first-child button').textContent,disabled:document.querySelector('#weapon-grid .weapon-card:first-child button').disabled}));
  if(!result.afterFirstPurchase.disabled)await tap(mgButton);
  result.afterSecondPurchase=await frame.evaluate(()=>({level:window.__boar.state.save.weapons.mg,coins:window.__boar.state.coins,next:window.__boar.prices().w.mg,description:document.querySelector('#weapon-grid .weapon-card:first-child p').textContent}));
  await page.screenshot({path:path.join(output,`F-${mode}-${name}-shop.png`)});
  // Check active heat in the actual loop. Touch dispatch sets FIRE_V21's held pointer; no QA fire() shortcut is used.
  const cdp=await context.newCDPSession(page);
  async function fireSample(level=1,cooling=0){
   await frame.evaluate(({level,cooling})=>{const s=window.__boar.state.save;s.weapons.mg=level;s.upgrades.cooling=cooling;window.__boar.setSave(s);window.__boar.sandbox(1);window.__boar.hold(true);},{level,cooling});
   const box=await frame.locator('#fire-btn').boundingBox();assert.ok(box,'fire button');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1,radiusX:5,radiusY:5,force:1}]});
   const sample=await frame.evaluate(()=>{const q=window.__boar;let steps=0;while(!q.state.overheated&&steps<1000){q.step(1,.01);steps++;}const s=q.state;return {seconds:steps*.01,heat:s.heat,shots:s.shots,source:s.fireSource,shotsBy:s.shotsBy,level:s.save.weapons.mg,cooling:s.save.upgrades.cooling};});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return sample;
  }
  result.stock=await fireSample();result.level3=await fireSample(3);result.cooling1=await fireSample(1,1);
  await frame.evaluate(()=>window.__boar.hold(false));await page.waitForTimeout(200);await frame.evaluate(()=>window.__boar.hold(true));
  await page.screenshot({path:path.join(output,`F-${mode}-${name}-fire.png`)});
  // Purchase cooling through its real shop button and verify UI copy states the new benefit.
  await frame.evaluate(()=>{window.__boar.menu();const s=window.__boar.state.save;s.coins=250;s.upgrades.cooling=0;window.__boar.setSave(s);window.__boar.shop();});
  await tap('#tab-upgrades');result.coolingDescription=await frame.locator('#upgrade-grid .upgrade-card:nth-child(2) p').textContent();await tap('#upgrade-grid .upgrade-card:nth-child(2) button');
  result.coolingPurchase=await frame.evaluate(()=>({coins:window.__boar.state.coins,level:window.__boar.state.save.upgrades.cooling}));
  result.trusted=await frame.evaluate(()=>window.__trusted);await csp.assertClean();result.csp=csp.snapshot();
 }catch(error){result.setupError=error.message;await page.screenshot({path:path.join(output,`F-${mode}-${name}-error.png`)}).catch(()=>{});throw error;}finally{await context.close();await csp.dispose();}
 console.error('F scenario',name,'done');return result;
}
try{
 const r=await scenario('default');
 check('stock firing >=4.7 seconds',()=>assert.ok(r.stock.seconds>=4.7,JSON.stringify(r.stock)));
 check('starter wallet buys two Vulcan upgrades',()=>assert.deepEqual({price:r.initialPrice,level:r.afterSecondPurchase.level,coins:r.afterSecondPurchase.coins},{price:80,level:3,coins:50}));
 check('weapon upgrade reduces active heat',()=>assert.ok(r.level3.seconds>r.stock.seconds*1.07));
 check('cooling upgrade reduces active heat',()=>assert.ok(r.cooling1.seconds>r.stock.seconds*1.04));
 check('trusted touch fires and buys upgrades',()=>assert.ok(r.stock.shotsBy.button>0&&r.stock.source==='button'&&r.trusted.filter(e=>e.trusted&&e.type==='touch').length>=4));
 check('cooling purchase is honest and accessible',()=>{assert.deepEqual(r.coolingPurchase,{coins:170,level:1});assert.match(r.coolingDescription,/5%/);});
 if(process.env.PHONE_FIX_ROLLBACK==='1')for(const [name,query] of [['individual','&phoneFixF=0'],['global','&phoneFixes=0']]){
  const old=await scenario(name,query);
  check(name+' URL reaches iframe and restores legacy economy/heat',()=>{assert.equal(new URL(old.frameURL).searchParams.get(name==='global'?'phoneFixes':'phoneFixF'),'0');assert.equal(old.initialPrice,110);assert.equal(old.afterSecondPurchase.level,2);assert.ok(old.stock.seconds>=3.58&&old.stock.seconds<=3.6);assert.ok(old.cooling1.seconds<=old.stock.seconds+.01);});
 }
 for(const r of report.cases)check(r.name+' clean browser/JavaScript only',()=>{assert.deepEqual(r.errors,[]);assert.deepEqual(r.wasm,[]);assert.equal(r.touch.wasmType,'undefined');assert.ok(r.touch.maxTouchPoints>0);assert.equal(r.touch.width,844);assert.equal(r.touch.height,390);});
}finally{await browser.close();await server.close();await writeFile(path.join(output,`F-${mode}-browser.json`),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({mode,cases:report.cases.length,assertions:report.assertions},null,2));
if(report.assertions.some(a=>!a.pass))process.exitCode=1;
