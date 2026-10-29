import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {waitForGameStart,waitForGameNavigation,prepareGameBuildings} from './shell-ready.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=fileURLToPath(new URL('../verification/g2o/',import.meta.url));await mkdir(directory,{recursive:true});
const target=process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/?dev=1';
const viewports=process.env.G2O_WIDTH?[{width:Number(process.env.G2O_WIDTH),height:Number(process.env.G2O_HEIGHT)||390}]:[{width:844,height:390},{width:390,height:844}];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[];
try{for(const viewport of viewports){
 const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1});context.setDefaultTimeout(120000);const page=await context.newPage(),errors=[],requests=[],shots=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
 const tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current.session.snapshot),tap=s=>page.locator(s).tap(),shot=async name=>{const file=`${viewport.width}-${name}.png`;await page.screenshot({path:directory+file,...(viewport.height>viewport.width?{style:'.soccer-rotate{visibility:hidden!important}.game-screen[data-orientation-blocked=true] .game-controls,.game-screen[data-orientation-blocked=true]>.game-header{visibility:visible!important}'}:{})});shots.push(file);};
 const client=await context.newCDPSession(page),touch=(type,point)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{...point,id:1}]});
 try{
  await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
  await page.clock.install();await page.goto(target,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await tap('[data-action=avatar-start]');await tick(32);await prepareGameBuildings(page);
  await page.evaluate(()=>{const {engine,data}=window.__island;engine.skipTutorial();engine.tick=()=>({ok:true});data.featureFlags.events=false;const p=engine.state.minigameProgress.fireRescue;p.stage=10;p.stars.fill(1,0,9);data.config.minigames.fireRescue.render.fallbackFrameMs=10000;window.__g2oFrames=[];});
  await page.evaluate(()=>window.__island.games.start('fireRescue',undefined,10));if(await page.locator('[data-action=game-understood]').count()){await tick(32);await tap('[data-action=game-understood]');}await waitForGameStart(page);await waitForGameNavigation(page);
  await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.truck.loaded);await tick(100);
  const box=await page.locator('#joystick').boundingBox(),center={x:box.x+box.width/2,y:box.y+box.height/2};assert.equal(box.width,140);assert.equal(box.height,140);assert.ok(box.x>=0&&box.y>=0&&box.x+140<=viewport.width&&box.y+140<=viewport.height);
  await shot('joystick');let turnSeconds=null;
  if(viewport.width>viewport.height){
   await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,update=m.update;m.update=function(dt,input){update.call(this,dt,input);if(dt>0)window.__g2oFrames.push({time:this.time,...this.truck,camera:{...this.camera}});};});
   await touch('touchStart',center);await touch('touchMove',{x:center.x,y:center.y-8});await tick(100);assert.equal((await snap()).truck.speed,0);
   await touch('touchMove',{x:center.x,y:center.y-40.25});await tick(350);const half=(await snap()).truck.speed;assert.ok(Math.abs(half-4.5)<.15,String(half));
   await touch('touchMove',{x:center.x,y:center.y-70});await tick(350);assert.equal((await snap()).truck.speed,18);
   const turnStart=(await snap()).time;await touch('touchMove',{x:center.x+70,y:center.y});await tick(300);assert.ok((await snap()).truck.turning);await shot('driving-turn');await tick(600);
   const frames=await page.evaluate(()=>window.__g2oFrames),reached=frames.find(f=>f.time>turnStart&&Math.abs(f.yaw+Math.PI/2)<.025);turnSeconds=reached.time-turnStart;assert.ok(turnSeconds>=.6&&turnSeconds<=.9,String(turnSeconds));
   for(let i=1;i<frames.length;i++){const a=frames[i-1],b=frames[i];assert.ok(Math.abs(b.yaw-a.yaw)<=2.5*(b.time-a.time)+1e-7);}
   await touch('touchEnd');await tick(320);assert.equal((await snap()).truck.speed,0);assert.equal(await page.locator('#knob').evaluate(n=>n.style.transform),'translate(0px, 0px)');assert.deepEqual(await page.locator('#joystick').boundingBox(),box);
   await page.evaluate(()=>{const s=window.__island.games.current.session;s.setPaused(true);});
  }else{assert.ok((await snap()).paused,'portrait retains the shared orientation guard');}
  // Fixed fixture at a real street intersection puts several real objectives
  // outside either viewport; the same projection drives rendering and the audit.
  await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;Object.assign(m.truck,{x:18,z:18,speed:0,driving:false});Object.assign(m.camera,{x:18,z:18});});await tick(32);
  const arrows=await snap(),visible=p=>p.x>=0&&p.x<=viewport.width&&p.y>=0&&p.y<=viewport.height;
  for(let i=0;i<arrows.flames.length;i++){const f=arrows.flames[i],has=arrows.indicators.some(a=>a.kind==='fire'&&a.index===i);assert.equal(has,Boolean(f.active&&(f.heat>0||f.warning>0)&&!visible(arrows.flameScreens[i])));}
  for(let i=0;i<arrows.rescues.length;i++){const r=arrows.rescues[i],has=arrows.indicators.some(a=>a.kind==='rescue'&&a.index===i);assert.equal(has,!r.rescued&&!r.expired&&!visible(arrows.rescueScreens[i]));}
  for(let i=0;i<arrows.indicators.length;i++){const a=arrows.indicators[i];assert.ok(a.y===76||a.x===36||a.x===viewport.width-36);for(let j=0;j<i;j++){const b=arrows.indicators[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.size+b.size+6);}}
  assert.ok(arrows.indicators.some(a=>a.kind==='fire'));assert.ok(arrows.indicators.some(a=>a.kind==='rescue'));
  await shot(viewport.width===844?'fire-arrows':'fire-and-rescue-arrows');
  if(viewport.width===844){await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.flames.forEach(f=>{f.heat=0;f.warning=0;});});await tick(32);assert.ok((await snap()).indicators.every(a=>a.kind==='rescue'));await shot('rescue-arrow');}
  assert.equal((await page.locator('.game-screen').innerText()).replace(/[\d\s]/g,''),'');
  await page.evaluate(()=>window.__island.games.current.session.debug.view.degrade(true));await tick(32);const fallback=await snap();assert.equal(fallback.renderMode,'canvas');assert.ok(fallback.indicators.some(a=>a.kind==='rescue'));
  assert.deepEqual(errors,[]);assert.ok(requests.some(u=>u.includes('/fire-navigation.mjs?v=island-boar-20261029-2')));assert.ok(requests.some(u=>u.includes('/g2o-fire.css?v=island-boar-20261029-2')));
  reports.push({...viewport,turnSeconds,portraitGuard:viewport.width<viewport.height,portraitCapture:viewport.width<viewport.height?'rotation overlay hidden for paused layout inspection':'live touch',indicators:arrows.indicators,shots,errors,touchChecks:viewport.width>viewport.height?{deadzone:true,quadraticThrottle:true,gradualTurn:true,releaseCenters:true}:null,checks:{fixed140pxBase:true,everyOffscreenObjective:true,noVisibleObjectiveArrow:true,canvasFallback:true,noGameText:true}});console.log('G2o verified',viewport);
 }finally{await context.close();}
}await writeFile(directory+(process.env.G2O_WIDTH?'844-verification.json':'verification.json'),JSON.stringify({browser:'Chromium / SwiftShader',pythonServer:target,physicalPhone:false,reports},null,2)+'\n');}finally{await browser.close();}
