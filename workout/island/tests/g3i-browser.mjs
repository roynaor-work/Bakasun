import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {waitForGameStart,waitForGameNavigation} from './shell-ready.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function verify(part,viewports,scenario){
 const directory=fileURLToPath(new URL(`../verification/${part}/`,import.meta.url));await mkdir(directory,{recursive:true});
 const prefix=part.toUpperCase(),width=Number(process.env[prefix+'_WIDTH']);if(width)viewports=[{width,height:Number(process.env[prefix+'_HEIGHT'])||390}];
 const target=new URL(process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/');target.searchParams.set('dev','1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});const reports=[];
 try{for(const viewport of viewports){const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);const page=await context.newPage(),errors=[],outside=[],shots=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);});
  await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
  const tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot),tap=s=>page.locator(s).tap(),nav=()=>waitForGameNavigation(page),ready=()=>waitForGameStart(page);
  const start=async(id,stage=1)=>{await page.evaluate(({id,stage})=>window.__island.games.start(id,undefined,stage),{id,stage});if(await page.locator('[data-action=game-understood]').count()){await page.clock.runFor(32);await tap('[data-action=game-understood]');}await ready();await tick(100);await nav();assert.ok(await snap(),id+' did not start');};
  const exit=async()=>{if(!await page.locator('.game-pause-sheet').count())await tap('[data-action=game-pause]');await tap('[data-action=game-exit]');await nav();};
  const shot=async(name,at=844)=>{if(viewport.width!==at)return;await page.screenshot({path:directory+name+'.png',type:'png'});shots.push(name+'.png');};
  try{await page.clock.install();await page.goto(target.href,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await tap('[data-action=avatar-start]');await tick(32);
   await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;for(const type of ['soccer']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}data.config.minigames.soccer.view.slowFrameMs=10000;});
   const result=await scenario({page,context,viewport,tick,snap,tap,start,exit,shot,nav,ready,assert});assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);reports.push({...viewport,...result,errors,outside,shots});console.log(part,'verified',viewport);
  }catch(e){console.error(part,'failed',viewport,errors,await snap().catch(()=>null));throw e;}finally{await context.close();}
 }await writeFile(directory+(width?`${width}-verification.json`:'verification.json'),JSON.stringify({part,browser:'Chromium / SwiftShader',browserVersion:browser.version(),physicalPhone:false,iPhone:false,phoneFPS:false,reports})+'\n');}finally{await browser.close();}
}

// Start Python on 127.0.0.1:8765 from the repository root before running.
await verify('g3i',[{width:844,height:390},{width:740,height:360}],async({page,viewport,tick,snap,start,shot,assert})=>{
 await start('soccer');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics.assetStatus==='ready');await tick(80);
 const scenario=async kind=>page.evaluate(kind=>{
  const q=window.__island.games.current.session,s=q.debug.model.getState(),c=window.__island.data.config.minigames.soccer;q.setPaused(false);q.debug.poseCamera(null);q.debug.model.clearInput();q.debug.model.drainEvents();
  Object.assign(s,{phase:'playing',phaseTime:0,half:1,halfElapsed:0,elapsed:0,score:[0,0],controlled:0,attackDir:1,passTarget:null,restart:null,event:null,mode:'attack',switchCooldown:100,idle:0});
  for(const p of s.players)Object.assign(p,{x:p.team?10:-10,z:p.id%2?9:-9,vx:0,vz:0,recover:0,cooldown:100,think:100,kickTime:0,slideTime:0,stealTime:0,headerTime:0,diveTime:0,throwTime:0,catchTime:0,hands:false,hold:0,stealCooldown:0,fx:p.team?-1:1,fz:0});
  Object.assign(s.players[0],{x:0,z:0,recover:0,cooldown:0});Object.assign(s.ball,{owner:0,x:c.physics.dribbleOffset,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,grace:100,lastPlayer:0,lastTeam:0,flight:null,thrower:null,curve:0});
  if(kind==='keeper'){
   Object.assign(s.players[0],{x:12.5,z:.2});Object.assign(s.players[5],{x:16.3,z:0,recover:0,cooldown:0,hands:true});Object.assign(s.ball,{owner:5,x:15.96,z:0,y:c.goalkeeping.holdHeight,lastTeam:1,lastPlayer:5});
  }else if(kind==='pass'){
   Object.assign(s.players[0],{x:0,z:0});Object.assign(s.players[6],{x:2,z:7});Object.assign(s.players[1],{x:-3,z:-7,recover:0,cooldown:0});Object.assign(s.players[4],{x:-3,z:-7,recover:0});Object.assign(s.players[3],{x:8,z:0,recover:0});Object.assign(s.players[7],{x:7,z:7,recover:0});
  }else{
   Object.assign(s.players[0],{x:3,z:0});Object.assign(s.players[3],{x:3.8,z:0,fx:-1,recover:0});Object.assign(s.ball,{owner:3,x:3.3,z:0,lastTeam:1,lastPlayer:3,grace:0});
   // Maxed defense makes this demonstration certain through the real input path.
   s.players[0].guard=5;s.players[0].card.defense=99;s.players[3].card.defense=1;
  }
 },kind);
 const point=async selector=>{const b=await page.locator(selector).boundingBox();return {clientX:b.x+b.width/2,clientY:b.y+b.height/2};};
 await scenario('keeper');const zone=page.locator('.soccer-stick-zone'),origin=await point('.soccer-stick-zone');
 await zone.dispatchEvent('pointerdown',{pointerId:31,button:0,...origin});await zone.dispatchEvent('pointermove',{pointerId:31,clientX:origin.clientX+34,clientY:origin.clientY});await tick(700);await zone.dispatchEvent('pointerup',{pointerId:31,...origin});await tick(32);
 const keeper=await snap();assert.ok(keeper.players[0].x>13.2);assert.ok(keeper.players[5].hands);assert.equal(keeper.ball.owner,5);const keeperStealDistance=Math.hypot(keeper.ball.x-keeper.players[0].x,keeper.ball.z-keeper.players[0].z);assert.ok(keeperStealDistance<=1.2);
 await page.locator('#pass').tap();await tick(32);assert.equal((await snap()).ball.owner,5);await shot(`${viewport.width}-keeper-area`,viewport.width);
 await tick(2600);assert.equal((await snap()).players[5].hands,false);
 await scenario('pass');await tick(1600);const opened=await snap(),mate=opened.players[1],defenders=opened.players.filter(p=>p.team===1),clearance=Math.min(...defenders.map(p=>Math.hypot(p.x-mate.x,p.z-mate.z)));
 assert.ok(Math.hypot(mate.x+3,mate.z+7)>1);assert.ok(mate.request);assert.ok(clearance>=5);await shot(`${viewport.width}-open-pass`,viewport.width);
 // Pass toward the teammate through the live pointer controls and receive it.
 const dx=mate.x-opened.players[0].x,dz=mate.z-opened.players[0].z;
 const passButton=page.locator('#pass'),passOrigin=await point('#pass'),length=Math.hypot(dx,dz),passEnd={clientX:passOrigin.clientX+dx/length*45,clientY:passOrigin.clientY+dz/length*45};
 await passButton.dispatchEvent('pointerdown',{pointerId:32,button:0,...passOrigin});await passButton.dispatchEvent('pointermove',{pointerId:32,...passEnd});await tick(32);await passButton.dispatchEvent('pointerup',{pointerId:32,...passEnd});await tick(32);
 const pass=await snap();assert.equal(pass.event.type,'pass');assert.equal(pass.event.target,mate.id);await tick(650);const received=await snap();assert.equal(received.ball.owner,mate.id);assert.equal(received.controlled,mate.id);
 await scenario('steal');await tick(32);await page.locator('#pass').tap();await tick(32);const stolen=await snap();assert.equal(stolen.ball.owner,0);assert.equal(stolen.event.type,'steal');assert.ok(stolen.event.won);assert.ok(stolen.players[0].stealTime>0);await shot(`${viewport.width}-successful-steal`,viewport.width);
 // Every level reaches its quota using unmodified simulation, no controller.
 const attack=await page.evaluate(async()=>{
  const {createSoccer}=await import('../island/minigames/soccer.mjs?v=island-naval-aim-20261027-2'),c=window.__island.data.config.minigames.soccer,rows=[];
  for(const [difficulty,target]of [['easy',2],['normal',4],['hard',6]]){const m=createSoccer({config:c,seed:9,difficulty});let shots=0;for(let i=0;i<5400;i++){m.update(1/60);shots+=m.drainEvents().filter(e=>e.type==='shot'&&e.team===1).length;}rows.push({difficulty,shots,target});}return rows;
 });for(const r of attack)assert.ok(r.shots>=r.target,JSON.stringify(r));
 const text=await page.locator('.game-screen').evaluate(n=>{const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT),found=[];while(w.nextNode()){const t=w.currentNode;if(!/[א-תa-z]/i.test(t.textContent))continue;const r=document.createRange();r.selectNodeContents(t);const s=getComputedStyle(t.parentElement);if(r.getBoundingClientRect().width>0&&s.visibility!=='hidden'&&s.display!=='none')found.push(t.textContent.trim());}return found;});assert.deepEqual(text,[]);
 return {keeperArea:{playerX:keeper.players[0].x,keeperHands:keeper.players[5].hands,stealDistance:keeperStealDistance,stealBlocked:true,maxHoldSeconds:3},openPass:{player:mate.id,x:mate.x,z:mate.z,clearance,receivedBy:received.ball.owner},steal:{won:stolen.event.won,owner:stolen.ball.owner},attack,noLiveText:true};
});
