import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=fileURLToPath(new URL('../verification/g8/',import.meta.url));await mkdir(directory,{recursive:true});
const viewport={width:Number(process.env.G8_WIDTH)||844,height:Number(process.env.G8_HEIGHT)||390};
// Decimal, uncompressed response bodies plus HTTP response headers. Local server
// has no compression/cache: conservative for production, no warm-game discount.
const budgets={city:8_000_000,gameAdditional:6_000_000};
const ids=['soccer','navalDuel','tennis','fireRescue','alienDefense'];
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const report={viewport,budgets,browser:browser.version(),physicalPhone:false,cold:[],continuity:[],fallback:[],shots:[]};
async function setup(mode='native'){
 const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',...(mode==='ios'?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{})});context.setDefaultTimeout(240000);
 const page=await context.newPage(),errors=[],outside=[],downloads=[],pending=[],phases=new Map();let phase='city';
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')){if(!u.pathname.startsWith('/workout/island/'))outside.push(u.href);phases.set(r,phase);}});
 page.on('requestfinished',r=>{if(!phases.has(r))return;pending.push(r.sizes().then(s=>downloads.push({path:new URL(r.url()).pathname,phase:phases.get(r),bytes:s.responseBodySize+s.responseHeadersSize})));});
 await page.addInitScript(mode=>{
  window.g8={calls:[],locks:[],event:null,promptCalls:0};
  for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{window.g8.event={type,trusted:e.isTrusted,action:e.target.closest?.('button')?.dataset.action};},true);
  const native=Element.prototype.requestFullscreen;
  if(mode==='missing'||mode==='ios')Element.prototype.requestFullscreen=undefined;
  else Element.prototype.requestFullscreen=function(...args){window.g8.calls.push({event:window.g8.event,tag:this.tagName,activation:navigator.userActivation.isActive});if(mode==='denied')return Promise.reject(Error('test denial'));return native.apply(this,args);};
  const lock=screen.orientation.lock?.bind(screen.orientation);Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async value=>{window.g8.locks.push(value);if(lock)return lock(value);}});
  if(mode==='installed')Object.defineProperty(navigator,'standalone',{value:true});
 },mode);
 const tick=ms=>page.clock.runFor(ms),tap=s=>page.locator(s).tap(),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot),trace=()=>page.evaluate(()=>window.g8);
 // History callbacks are native tasks; RAF polling alone stalls under a paused
 // Playwright clock when restoring the guard on a later entry.
 const nav=async()=>{for(let i=0;i<100;i++){if(!await page.evaluate(()=>window.__island.games.navigation.traversing))return;await tick(16);}throw Error('history guard did not settle');};
 // Leave a fixed hour for real shader/model loading before freezing. A relative
 // Date.now()+1000 can already be in the past on a busy cloud renderer.
 await page.clock.install({time:new Date('2026-10-17T12:00:00Z')});await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(new Date('2026-10-17T13:00:00Z'));await tap('[data-action=avatar-start]');await tick(32);
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;for(const type of ['soccer','tennis','fireStation','airbase']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;assertFacility(done,type);}e.place('road',0,7);assertFacility(e.place('harbor',0,8).ok,'harbor');function assertFacility(ok,type){if(!ok)throw Error('fixture facility '+type);}for(const id of ['navalDuel','fireRescue','alienDefense']){const r=data.config.minigames[id].render;if(r)r.fallbackFrameMs=10000;}data.config.minigames.soccer.view.slowFrameMs=10000;});
 await tick(50);await page.waitForLoadState('networkidle');await Promise.all(pending);
 const cityBytes=downloads.reduce((n,r)=>n+r.bytes,0);assert.ok(cityBytes<=budgets.city,`city ${cityBytes}`);
 async function start(id,{first=false}={}){
  phase=id;await page.evaluate(id=>window.__island.games.stages(id),id);console.log('G8',viewport.width,id,'stage');await tap('[data-action=stage-play][data-stage="1"]');console.log('G8',viewport.width,id,'stage tapped');
  if(await page.locator('[data-action=game-understood]').count()){
   if(first)assert.equal((await trace()).calls.length,0,'no fullscreen before the final entry click');
   assert.ok(await page.locator('[data-action=shell-install]').isVisible()||mode==='installed');
   await tap('[data-action=game-understood]');
  }
  await page.locator('.game-screen[data-starting=true]').waitFor();console.log('G8',viewport.width,id,'countdown');await nav();
  assert.equal((await snap()).paused,true,'game paused during entry');
  const modelSnapshot=()=>page.evaluate(()=>window.__island.games.current.session.debug.model.snapshot()),before=await modelSnapshot();
  await page.clock.fastForward(900);assert.deepEqual(await modelSnapshot(),before,'countdown cannot advance the simulation');
  assert.equal(await page.locator('.shell-countdown').isVisible(),true);
  await page.clock.fastForward(100);await page.clock.fastForward(1000);await page.locator('.game-screen[data-starting=false]').waitFor();await tick(32);assert.equal((await snap()).paused,false);
 }
 async function exit(){await tap('[data-action=game-pause]');assert.ok(await page.locator('.game-pause-sheet').isVisible());await tap('[data-action=game-exit]');await nav();}
 async function rotate(size,blocked){await page.setViewportSize(size);for(let i=0;i<100;i++){await tick(32);if(await page.locator('.game-screen').getAttribute('data-orientation-blocked')===String(blocked))return;}throw Error('resize event did not reach the shell');}
 async function shot(name){if(viewport.width!==844)return;const filename=name+'.png';await page.screenshot({path:directory+filename});report.shots.push(filename);}
 async function check(){await Promise.all(pending);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);}
 return {page,context,tick,tap,snap,trace,nav,start,exit,rotate,shot,check,downloads,cityBytes};
}
try{
 for(const [index,id]of ids.entries()){
  const run=await setup();const {page,start,tap,tick,trace,exit,nav}=run;
  try{
   if(index===0){
    await page.evaluate(()=>window.__island.games.stages('soccer'));await page.locator('[data-action=shell-install]').waitFor();await run.shot('pregame-install');
    await tap('[data-action=shell-install]');assert.ok(await page.locator('.shell-install-help img').isVisible());await tap('[data-action=shell-install-close]');
    await page.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.g8.promptCalls++;};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e);});await tap('[data-action=shell-install]');assert.equal((await trace()).promptCalls,1);assert.equal(await page.locator('.shell-install-help').count(),0);assert.deepEqual((await trace()).event,{type:'click',trusted:true,action:'shell-install'});
   }
   await start(id,{first:true});console.log('G8',viewport.width,id,'started');const entry=await trace();assert.equal(entry.calls.length,1,id);assert.deepEqual(entry.calls[0].event,{type:'click',trusted:true,action:'game-understood'});assert.equal(entry.calls[0].tag,'HTML');assert.equal(entry.calls[0].activation,true);
   await page.waitForLoadState('networkidle');await tick(50);await run.check();console.log('G8',viewport.width,id,'downloads settled');
   const additional=run.downloads.filter(r=>r.phase!=='city').reduce((n,r)=>n+r.bytes,0);assert.ok(additional<=budgets.gameAdditional,`${id} additional ${additional}`);
   report.cold.push({id,cityBytes:run.cityBytes,additionalBytes:additional,requests:run.downloads});
   const control=id==='fireRescue'?'[data-game-control=charge]':'#shoot';await tap(control);await tick(32);assert.equal((await trace()).calls.length,1,'first touch cannot request fullscreen');console.log('G8',viewport.width,id,'first control tapped');
   assert.equal(await page.locator('.game-status').isVisible(),false);assert.equal(await page.locator('[data-action=game-pause]').evaluate(n=>getComputedStyle(n).fontSize),'0px');
   await run.shot(id+'-controls');
   await run.rotate({width:390,height:844},true);assert.equal((await run.snap()).paused,true);await run.rotate(viewport,false);assert.equal((await trace()).calls.length,1,'rotation cannot reenter fullscreen');console.log('G8',viewport.width,id,'rotated');
   await page.goBack();await nav();assert.ok(await page.locator('.game-pause-sheet').isVisible());await tap('[data-action=game-resume]');assert.equal((await trace()).calls.length,1);
   console.log('G8',viewport.width,id,'resumed');await exit();console.log('G8',viewport.width,id,'exited');assert.equal(await page.evaluate(()=>document.fullscreenElement?.tagName),'HTML','leaving a game retains page fullscreen');
   if(index===0){for(const other of ids){await start(other);console.log('G8',viewport.width,'continuity',other);await tap(other==='fireRescue'?'[data-game-control=charge]':'#shoot');assert.equal((await trace()).calls.length,1,'all five games share the initial request');await exit();report.continuity.push(other);}}
   await run.check();
  }finally{await run.context.close();}
 }
 if(viewport.width===844){
  for(const mode of ['denied','missing','installed','ios']){
   const run=await setup(mode);try{
    if(mode==='ios'){await run.page.evaluate(()=>window.__island.ui.showParent());await run.tap('[data-action=shell-install]');assert.match(await run.page.locator('.shell-install-help').innerText(),/שתף.*הוספה למסך הבית/);await run.shot('ios-install-guide');await run.tap('[data-action=close-modal]');await run.nav();}
    await run.start('tennis',{first:true});await run.tap('#shoot');const calls=(await run.trace()).calls.length;assert.equal(calls,mode==='denied'?1:0);await run.exit();await run.check();report.fallback.push({mode,calls});
   }finally{await run.context.close();}
  }
 }
 report.checks={trustedEntryClick:true,noFirstControlRequest:true,noRotationRequest:true,backAndResume:true,pausedCountdown:true,retainedFullscreenBetweenGames:true,coldDownloadBudgets:true,errors:[],outside:[]};
 await writeFile(directory+`${viewport.width}-verification.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({viewport,cold:report.cold.map(({id,cityBytes,additionalBytes})=>({id,cityBytes,additionalBytes})),continuity:report.continuity,fallback:report.fallback}));
}finally{await browser.close();await server.close();}
