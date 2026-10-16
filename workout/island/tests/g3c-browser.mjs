import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=fileURLToPath(new URL('../verification/g3c/',import.meta.url));await mkdir(directory,{recursive:true});
const legacy=JSON.parse(await readFile(new URL('./fixtures/save-v9.json',import.meta.url),'utf8'));
const viewports=process.env.G3C_WIDTH?[{width:Number(process.env.G3C_WIDTH),height:Number(process.env.G3C_HEIGHT)||844}]:[{width:390,height:844},{width:360,height:740},{width:844,height:390},{width:1440,height:1000}];
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[];
try{for(const viewport of viewports){
 const {width,height}=viewport,context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const page=await context.newPage(),errors=[],outside=[],shots=[];let requestCount=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')){requestCount++;if(!u.pathname.startsWith('/workout/island/'))outside.push(u.href);}});
 if(width===360)await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=()=>Promise.reject(Error('test fallback'));});
 if(width===844)await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;});
 const tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot),tap=selector=>page.locator(selector).tap();
 async function nav(){await page.waitForFunction(()=>!window.__island.games.navigation.traversing);}
 async function shot(name){if(width===390&&name==='scoreboard')return;if(width!==390&&!(width===844&&name==='landscape')&&!(width===1440&&name==='scoreboard'))return;const file=`${width}x${height}-${name}.jpg`;await page.screenshot({path:directory+file,type:'jpeg',quality:68});shots.push(file);}
 async function scenario(defense=false){await page.evaluate(defense=>{
  const s=window.__island.games.current.session.debug.model.getState();s.phase='playing';s.controlled=0;s.charge=0;s.charging=false;s.sprint.value=s.sprint.capacity;s.sprint.locked=false;s.sprint.regenDelay=0;
  for(const p of s.players){Object.assign(p,{x:p.team?12:-12,z:p.id%2?7:-7,vx:0,vz:0,cooldown:0,think:100,slideTime:0,recover:0,slideCooldown:0,stealCooldown:0});}
  Object.assign(s.players[0],{x:0,z:0,fx:0,fz:1});
  if(defense)Object.assign(s.players[3],{x:.5,z:0,fx:1,fz:0});
  Object.assign(s.ball,{owner:defense?3:0,x:defense?.6:0,z:defense?0:.62,y:.22,vx:0,vz:0,vy:0,grace:0});
 },defense);await tick(130);}
 async function controlsFit(){return page.evaluate(()=>{
  const root=document.querySelector('.game-screen'),controls=root.querySelector('.soccer-controls'),header=root.querySelector('.game-header'),board=root.querySelector('.soccer-scoreboard'),rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const actions=[...controls.querySelectorAll('[data-game-control]')].map(n=>({id:n.id,...rect(n)}));return {actions,header:rect(header),board:rect(board),controls:rect(controls),scroll:controls.scrollHeight>controls.clientHeight+1,bodyScroll:document.documentElement.scrollWidth>innerWidth};
 });}
 try{
  assert.equal((await context.request.get(server.url.replace('/workout/island/','/codex-lab/island-soccer/'))).status(),404);
  await page.clock.install();await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await tap('[data-action=avatar-start]');
  await page.evaluate(()=>{const {engine,data}=window.__island;engine.skipTutorial();engine.tick=()=>({ok:true});data.featureFlags.events=false;data.config.minigames.soccer.view.slowFrameMs=10000;});await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  await page.evaluate(()=>window.__island.games.menu());const locked=page.locator('.game-card[data-game=soccer]');assert.equal(await locked.getAttribute('data-locked'),'true');assert.match(await locked.innerText(),/יש לבנות מגרש כדורגל/);await locked.locator('[data-action=game-play]').tap();assert.equal(await page.locator('.required-building[data-building=soccer]').count(),1);await page.evaluate(()=>window.__island.ui.closeModal());await nav();
  const pitch=await page.evaluate(()=>{const e=window.__island.engine,r=e.place('soccer',4,8);if(!r.ok)throw Error(JSON.stringify(r));return r.id;});
  // The authentic G5 file seeds earned map stars via the production additive importer.
  assert.ok(await page.evaluate(save=>window.__island.engine.importJSON(save).ok,legacy));
  await page.evaluate(()=>window.__island.games.menu());await page.locator('.game-card[data-game=soccer] [data-action=soccer-training]').tap();assert.equal(await page.locator('[data-soccer-training] .soccer-player-card').count(),1);assert.match(await page.locator('.soccer-wallet').innerText(),/6/);await shot('card');
  await tap('[data-attribute=power]');assert.equal(await page.evaluate(()=>window.__island.engine.state.soccerCard.attributes.power),53);assert.equal(await page.locator('[data-attribute=pace]').isDisabled(),true);assert.match(await page.locator('.soccer-training-countdown').innerText(),/60 דקות/);await shot('training-locked');
  await page.clock.fastForward(3600_000);await tick(1100);assert.equal(await page.locator('[data-attribute=pace]').isEnabled(),true);await tap('[data-attribute=pace]');assert.equal(await page.evaluate(()=>window.__island.engine.state.soccerCard.attributes.pace),53);
  await page.evaluate(()=>window.__island.ui.closeModal());await nav();await page.evaluate(id=>window.__island.ui.showInfo(id),pitch);await tap('[data-action=soccer-training]');assert.equal(await page.locator('[data-soccer-training]').count(),1);await tap('[data-action=training-stages]');
  await tap('[data-difficulty=hard]');assert.equal(await page.locator('[data-difficulty=hard]').getAttribute('aria-pressed'),'true');await shot('difficulty');await tap('[data-stage="1"]');if(await page.locator('[data-action=game-understood]').count())await tap('[data-action=game-understood]');
  await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.renderMetrics?.assetStatus==='ready');await tick(150);await nav();assert.equal((await snap()).difficulty,'hard');
  // Actual keyboard movement, followed by a weak shot facing away from the goal.
  await scenario();const initial=(await snap()).players[0];await page.keyboard.down('ArrowRight');await tick(250);await page.keyboard.up('ArrowRight');const moved=(await snap()).players[0];assert.ok(Math.hypot(moved.x-initial.x,moved.z-initial.z)>.2);
  await scenario();await page.keyboard.down('Space');await tick(80);await page.keyboard.up('Space');await tick(40);let s=await snap();assert.ok(s.ball.vz>0&&Math.abs(s.ball.vx)<.001);assert.equal(s.event.assisted,false);
  await scenario();await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();Object.assign(s.players[1],{x:0,z:4});});await page.keyboard.press('KeyX');await tick(40);assert.equal((await snap()).event.type,'pass');
  // Three independent real touch contacts: direction, sprint and charged shot.
  await scenario();const cdp=await context.newCDPSession(page),stick=await page.locator('#joystick').boundingBox(),shoot=await page.locator('#shoot').boundingBox(),sprint=await page.locator('#sprint').boundingBox();
  const touches=[{id:1,x:stick.x+stick.width/2+30,y:stick.y+stick.height/2},{id:2,x:shoot.x+shoot.width/2,y:shoot.y+shoot.height/2},{id:3,x:sprint.x+sprint.width/2,y:sprint.y+sprint.height/2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});await tick(400);s=await snap();assert.ok(s.charge>0);assert.ok(s.sprint.value<s.sprint.capacity);assert.ok(s.sprint.active);assert.ok(Number(await page.locator('.soccer-sprint-ring').getAttribute('aria-valuenow'))<100);assert.equal(await page.locator('.soccer-controls').getAttribute('data-mode'),'attack');await shot('attack');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tick(80);
  // The shared shell freezes the complete simulation and clears all held input.
  await scenario();await page.keyboard.down('Space');await page.keyboard.down('ShiftLeft');await tick(100);await tap('[data-action=game-pause]');s=await snap();assert.equal(s.charging,false);assert.equal(s.sprint.active,false);await tick(1000);const paused=await snap();for(const key of ['elapsed','halfElapsed','charge','sprint','players'])assert.deepEqual(paused[key],s[key]);await page.keyboard.up('Space');await page.keyboard.up('ShiftLeft');await tap('[data-action=game-resume]');await tick(100);
  await scenario(true);assert.match(await page.locator('#shoot').innerText(),/גלישה/);assert.match(await page.locator('#pass').getAttribute('aria-label'),/חטיפה/);await shot('defense');await page.keyboard.press('KeyX');await tick(40);assert.ok((await snap()).players[0].stealCooldown>0);
  await scenario(true);await page.keyboard.down('Space');await tick(80);await page.keyboard.up('Space');assert.ok((await snap()).players[0].slideCooldown>0);await tick(150);
  await tap('[data-action=soccer-hand]');assert.equal(await page.locator('.soccer-controls.left-handed').count(),1);await tap('[data-action=soccer-hand]');
  const layout=await controlsFit();assert.equal(layout.scroll,false);assert.equal(layout.bodyScroll,false);assert.ok(layout.board.y>=layout.header.bottom-1);assert.ok(layout.board.bottom<=layout.controls.y||layout.board.right<=layout.controls.x);
  for(const action of layout.actions){assert.ok(action.width>=56&&action.height>=56,JSON.stringify(action));assert.ok(action.x>=0&&action.y>=layout.header.bottom&&action.right<=width&&action.bottom<=height,JSON.stringify(action));}
  for(let i=0;i<layout.actions.length;i++)for(let j=i+1;j<layout.actions.length;j++){const a=layout.actions[i],b=layout.actions[j];assert.ok(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1);}
  const metrics=(await snap()).renderMetrics;assert.ok(metrics.triangles<=80000,JSON.stringify(metrics));assert.ok(metrics.drawCalls<=60,JSON.stringify(metrics));if(height>width)assert.ok(metrics.pitchBounds.height>=metrics.height*.5,JSON.stringify(metrics));
  const live=await page.locator('.soccer-live-status').innerText();await tick(500);assert.equal(await page.locator('.soccer-live-status').innerText(),live);assert.match(await page.locator('.soccer-clock').innerText(),/^\d\d:\d\d$/);assert.ok(await page.locator('.soccer-score').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=28));await shot(width===844?'landscape':'scoreboard');
  const before=await page.evaluate(()=>window.__island.engine.state.soccerCard.stars);
  await page.evaluate(()=>{const {model}=window.__island.games.current.session.debug,s=model.getState();model.clearInput();s.phase='playing';s.half=2;s.halfElapsed=74.95;s.elapsed=149.95;s.score=[2,0];});await tick(170);assert.equal(await page.locator('[data-result=soccer]').count(),1);assert.equal(await page.locator('.soccer-stars-added').innerText(),'נוספו לארנק ★ 4');assert.equal(await page.locator('[data-result=soccer] [data-action=soccer-train]').count(),0);await shot('result');
  const saved=await page.evaluate(()=>structuredClone(window.__island.engine.state.soccerCard));assert.equal(saved.stars,before+4);await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);assert.deepEqual(await page.evaluate(()=>window.__island.engine.state.soccerCard),saved);
  await page.evaluate(()=>{window.__island.data.featureFlags.events=false;window.__island.engine.tick=()=>({ok:true});});
  // Repeated game entry/exit retains the G5 history bound, then map exit confirms twice.
  await page.evaluate(()=>window.__island.games.menu());await nav();const historyLength=await page.evaluate(()=>history.length);await page.evaluate(()=>history.back());await page.waitForFunction(()=>window.__island.games.navigation.desired===0);await nav();
  for(let i=0;i<3;i++){await page.evaluate(()=>window.__island.games.menu());await nav();assert.ok(await page.evaluate(()=>history.length)<=historyLength);await page.evaluate(()=>window.__island.ui.closeModal());await nav();}
  await page.evaluate(()=>history.back());await page.waitForSelector('[data-map-exit]');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'map-stay');await tap('[data-action=map-stay]');await nav();await page.evaluate(()=>history.back());await page.waitForSelector('[data-map-exit]');await tap('[data-action=map-exit]');await page.waitForURL('about:blank');
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);reports.push({width,height,checks:{lockedBeforeConstruction:true,authenticV9Migration:true,trainingTwiceWithClock:true,difficultySaved:true,keyboard:true,threeTouchContacts:true,directionalShot:true,pass:true,sprint:true,defense:true,slideAndSteal:true,shellPause:true,handedness:true,layout:true,liveStatusThrottled:true,resultWallet:true,reload:true,mapBackStayBackExit:true,historyBound:true,lab404:true},renderMetrics:metrics,layout,consoleErrors:errors,outsideRequests:outside,requestCount,shots});console.log('G3c verified',width,height);
 }catch(error){console.error('G3c failed',viewport,await snap().catch(()=>null));throw error;}finally{await context.close();}
}
 await writeFile(directory+'verification.json',JSON.stringify({release:'g3c-20261016-1',saveVersion:10,browser:'Chromium / ANGLE SwiftShader',physicalPhone:false,realFPS:false,reports},null,2)+'\n');
}finally{await browser.close();await server.close();}
