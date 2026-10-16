import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=fileURLToPath(new URL('../verification/g2g/',import.meta.url)),target=process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/?dev=1';await mkdir(directory,{recursive:true});
const truckExists=await access(new URL('../assets/models/fire-truck-512.glb',import.meta.url)).then(()=>true,()=>false);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[];
try{for(const width of [390,360]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:740},hasTouch:true,deviceScaleFactor:1}),page=await context.newPage(),errors=[],outside=[],requests=[],events=[],shots=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&!( !truckExists&&message.location().url.includes('fire-truck-512.glb')))errors.push(message.text());});
 page.on('request',request=>{const u=new URL(request.url());if(u.protocol.startsWith('http')){if(!u.pathname.includes('/workout/island/'))outside.push(u.href);else requests.push(u.href);}});
 const cdp=await context.newCDPSession(page),tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot),tap=selector=>page.locator(selector).tap();
 async function touch(type,point){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{...point,id:1}]});}
 async function point(x,y){return page.locator('.minigame-canvas').evaluate((canvas,{x,y})=>{const r=canvas.getBoundingClientRect(),c=window.__island.data.config.minigames,scale=Math.min(r.width/c.width,r.height/c.height);return {x:r.x+(r.width-c.width*scale)/2+x*scale,y:r.y+(r.height-c.height*scale)/2+y*scale};},{x,y});}
 async function aim(screen){const p=await point(screen.x,screen.y);await touch('touchStart',p);await tick(20);await touch('touchEnd');await tick(20);}
 async function hold(selector,ms){const b=await page.locator(selector).boundingBox();await touch('touchStart',{x:b.x+b.width/2,y:b.y+b.height/2});await tick(ms);await touch('touchEnd');await tick(30);}
 async function start(id,stage=1){await page.evaluate(({id,stage})=>window.__island.games.start(id,undefined,stage),{id,stage});if(await page.locator('[data-action=game-understood]').count())await tap('[data-action=game-understood]');await tick(100);assert.ok(await snap());}
 async function exit(){await tap('[data-action=game-exit]');assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);}
 async function screenshot(name){if(width===390){await page.screenshot({path:directory+name+'.png'});shots.push(name+'.png');}}
 async function layout(){const measured=await page.locator('[data-game-control]').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));for(const r of measured){assert.ok(r.width>=56,JSON.stringify(r));assert.ok(r.height>=56,JSON.stringify(r));}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 try{
  await page.clock.install();await page.goto(target,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await tap('[data-action=avatar-start]');
  await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.skipTutorial();data.featureFlags.events=false;data.config.minigames.slowFrameMs=10000;data.config.minigames.fireRescue.render.fallbackFrameMs=10000;const save=JSON.parse(engine.exportJSON());for(const id of ['fireRescue','alienDefense'])save.minigameProgress[id]={stage:10,stars:Array(10).fill(1)};if(!engine.importJSON(save).ok)throw Error('fixture import');const play=games.sound.play;window.__g2gEvents=[];window.__g2gRewards=[];engine.subscribe((_state,event)=>{if(event.type==='minigame')window.__g2gRewards.push(event.result);});games.sound.play=event=>{window.__g2gEvents.push(event);play(event);};});
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));console.log('G2g',width,'scene and controls');
  const prizesBefore=await page.evaluate(()=>window.__g2gRewards.length);await start('fireRescue');await layout();
  await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics.avatarLoaded,{},{polling:100});
  if(truckExists)await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics.truck.loaded,{},{polling:100});await tick(50);
  let m=await snap();assert.equal(m.renderMode,'three');assert.equal(m.rescues.length,0);assert.ok(m.renderMetrics.triangles<=60000);assert.ok(m.renderMetrics.drawCalls<=40);const metrics=m.renderMetrics;await screenshot('fire-stage-1');
  const truck=m.truck,truckPoint=await point(m.truckScreen.x,m.truckScreen.y);await touch('touchStart',truckPoint);await touch('touchMove',{x:truckPoint.x+35,y:truckPoint.y+5});await tick(1000);await touch('touchEnd');m=await snap();assert.ok(Math.abs(m.truck.x-truck.x)>.3);assert.equal(m.spraying,false);
  const yaw=m.renderMetrics.truck.yaw;await aim(m.flameScreens[0]);await hold('[data-game-control=fire]',500);m=await snap();assert.ok(m.flames[0].heat<1);assert.notEqual(m.renderMetrics.truck.yaw,yaw);assert.ok(Math.hypot(m.renderMetrics.truck.muzzle.x-m.truck.x,m.renderMetrics.truck.muzzle.z-m.truck.z)>.5);
  await aim({x:350,y:0});await hold('[data-game-control=fire]',5600);assert.equal((await snap()).pressure,0);assert.match(await page.locator('.game-warning').innerText(),/חסר לחץ/);await hold('[data-game-control=charge]',1400);assert.ok((await snap()).pressure>.6);const water=(await snap()).water;await hold('[data-game-control=refill]',1500);assert.ok((await snap()).water>water);await exit();assert.equal(await page.evaluate(()=>window.__g2gRewards.length),prizesBefore);
  console.log('G2g',width,'rescue and result');await start('fireRescue',5);await layout();m=await snap();assert.equal(m.rescues.length,1);await aim(m.rescueScreens[0]);
  const rescueButton=await page.locator('[data-game-control=rescue]').boundingBox();await touch('touchStart',{x:rescueButton.x+rescueButton.width/2,y:rescueButton.y+rescueButton.height/2});await tick(650);assert.ok((await snap()).rescues[0].progress>0);await screenshot('rescue-stage-5');await tick(800);await touch('touchEnd');m=await snap();assert.equal(m.rescues[0].rescued,true);await tick(2200);assert.equal((await snap()).rescues[0].descent,1);
  for(let i=0;i<180&&await page.locator('[data-game=fireRescue]').count();i++){
   m=await snap();if(!m)break;
   if(m.water<12&&m.reserve>0){await hold('[data-game-control=refill]',3500);continue;}
   if(m.pressure<.5){await hold('[data-game-control=charge]',1500);continue;}
   const index=m.flames.findIndex(f=>f.active&&f.heat>0&&!f.warning);if(index<0){await tick(300);continue;}
   await aim(m.flameScreens[index]);await hold('[data-game-control=fire]',650);
  }
  assert.equal(await page.locator('[data-result=fireRescue]').count(),1);assert.equal(await page.locator('[data-fire-summary=rescued] bdi').innerText(),'1');assert.ok(Number(await page.locator('[data-fire-summary=out] bdi').innerText())>=8);assert.equal(await page.locator('[data-action=game-next-stage]').isEnabled(),true);await screenshot('fire-result');
  await tap('[data-action=game-next-stage]');await tick(100);assert.equal((await snap()).rescues.length,2);await exit();
  console.log('G2g',width,'timeout and fallback');
  await page.evaluate(()=>window.__island.data.config.minigames.fireRescue.rescue.timeoutSeconds=.5);await start('fireRescue',3);await tick(800);assert.equal((await snap()).rescues[0].expired,true);assert.equal((await snap()).result,undefined);await exit();await page.evaluate(()=>window.__island.data.config.minigames.fireRescue.rescue.timeoutSeconds=20);
  await page.evaluate(()=>{const r=window.__island.data.config.minigames.fireRescue.render;r.fallbackSampleFrames=3;r.fallbackFrameMs=0;});await start('fireRescue',3);await tick(220);m=await snap();assert.equal(m.renderMode,'canvas');assert.equal(m.renderMetrics.disposed,true);const fallbackScore=m.score;await aim(m.flameScreens[0]);await hold('[data-game-control=fire]',500);m=await snap();assert.ok(m.water<m.maxWater);assert.ok(m.score>=fallbackScore);await exit();await page.evaluate(()=>{const r=window.__island.data.config.minigames.fireRescue.render;r.fallbackSampleFrames=90;r.fallbackFrameMs=10000;});
  console.log('G2g',width,'baked models');await start('alienDefense',10);await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.artModels?.loaded===5,{},{polling:100});await tick(50);assert.deepEqual((await snap()).artModels,{requested:5,loaded:5,failed:0});await screenshot('aliens-models');await exit();
  events.push(...await page.evaluate(()=>[...new Set(window.__g2gEvents)]));for(const event of ['ladder','rescue','timeout','spray','crackle','refill'])assert.ok(events.includes(event),event);
  for(const url of requests){assert.ok(!url.includes('boat-patrol-512.glb'));const u=new URL(url);if(/\.(json|mjs)$/.test(u.pathname)&&!u.pathname.includes('/vendor/'))assert.equal(u.searchParams.get('v'),'g3b-20261016-1',url);}
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);reports.push({width,touch:true,scene:'three',metrics,truckGLBLoaded:truckExists,truckDrag:true,cannonTracksAim:true,waterAndPressure:true,rescueComplete:true,timeoutWithoutDamage:true,resultSummary:true,continueImmediately:true,fallbackAfterInjectedSlowFrames:true,exitWithoutReward:true,bakedModels:5,outsideRequests:outside,errors,events,shots});
 }finally{await context.close();}
}
 await writeFile(directory+'verification.json',JSON.stringify({release:'g3b-20261016-1',browser:'Chromium / ANGLE SwiftShader',truckFilePresent:truckExists,physicalPhone:false,realFPS:false,reports},null,2)+'\n');
}finally{await browser.close();}
console.log(JSON.stringify(reports));
