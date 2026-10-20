import {waitForGameStart,waitForGameNavigation} from './shell-ready.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=fileURLToPath(new URL('../verification/g5/',import.meta.url));await mkdir(directory,{recursive:true});
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[],games={soccer:['soccer','יש לבנות מגרש כדורגל'],navalDuel:['harbor','יש לבנות נמל ימי'],fireRescue:['fireStation','יש לבנות תחנת כיבוי'],alienDefense:['airbase','יש לבנות בסיס חיל אוויר']};
const viewports=process.env.G5_WIDTH?[{width:Number(process.env.G5_WIDTH),height:Number(process.env.G5_HEIGHT)||844}]:[{width:390,height:844},{width:360,height:740},{width:1440,height:1000},{width:844,height:390}];
try{for(const viewport of viewports){
 const {width,height}=viewport,context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1}),page=await context.newPage(),errors=[],outside=[],shots=[],checks=[];context.setDefaultTimeout(240000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);});
 // Exercise the denied-fullscreen path too, without changing the production fallback.
 if(width===844)await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;});
 if(width===360)await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=()=>Promise.reject(new Error('fullscreen denied for test'));});
 const tap=selector=>page.locator(selector).tap(),tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot);
 async function nav(){await waitForGameNavigation(page);}
 async function shot(name){const file=`${width}x${height}-${name}.png`;await page.screenshot({path:directory+file});shots.push(file);}
 const progress=()=>page.evaluate(()=>{const s=window.__island.engine.state;return JSON.stringify({money:s.money,parts:s.parts,wins:s.minigameWins,stars:s.minigameProgress,team:s.team});});
 const simulation=()=>page.evaluate(()=>{const s=window.__island.games.current.session.snapshot;return Object.fromEntries(['time','elapsed','remaining','phase','score','lives','water','pressure','charge','wave','aim','players','truck','charging'].filter(k=>k in s).map(k=>[k,s[k]]));});
 async function start(id){await page.evaluate(id=>window.__island.games.start(id,undefined,1),id);if(await page.locator('[data-action=game-understood]').count()){await page.clock.runFor(32);await tap('[data-action=game-understood]');}await waitForGameStart(page);await tick(120);await nav();assert.ok(await page.evaluate(()=>window.__island.engine.isMinigameActive()),id);}
 async function back(){await page.evaluate(()=>history.back());await page.waitForSelector('[data-pause-kind=exit]');await nav();}
 try{
  // The root Python server also serves sibling lab routes; the default
  // subtree server retains its isolation check.
  if(!process.env.ISLAND_URL)assert.equal((await context.request.get(server.url.replace('/workout/island/','/codex-lab/island-soccer/'))).status(),404);
  await page.clock.install();await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await tap('[data-action=avatar-start]');
  assert.match(await page.locator('.mission-strip').innerText(),/זו העירייה שלך/);await tap('[data-action=toggle-mission]');await tap('[data-action=tutorial-city-hall]');assert.equal(await page.locator('[data-action=city-hall-games]').count(),1);assert.equal(await page.evaluate(()=>window.__island.engine.state.tutorial.step),0);await page.evaluate(()=>window.__island.ui.closeInfo());
  await page.evaluate(()=>{const {engine,data}=window.__island;engine.skipTutorial();data.featureFlags.events=false;data.config.ui.economyTickMs=1000000;data.config.minigames.slowFrameMs=10000;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;data.config.minigames.fireRescue.render.fallbackFrameMs=10000;data.config.minigames.soccer.view.slowFrameMs=10000;});
  // Freeze only the city economy; keep the real adapters and their RAF/model updates.
  await page.evaluate(()=>{window.__island.engine.tick=()=>({ok:true});});
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));
  const baseDepth=await page.evaluate(()=>history.state.islandShell.depth),baseLength=await page.evaluate(()=>history.length);assert.equal(baseDepth,0);
  for(const [id,[building,label]]of Object.entries(games)){
   await page.evaluate(()=>window.__island.games.menu());await nav();const card=page.locator(`.game-card[data-game=${id}]`),play=card.locator('[data-action=game-play]');assert.equal(await play.innerText(),label);assert.equal(await play.isEnabled(),true);assert.equal(await card.getAttribute('data-locked'),'true');
   await play.tap();await nav();assert.equal(await page.locator('.modal').count(),0);assert.equal(await page.locator('.build-dock').getAttribute('data-open'),'true');assert.equal(await page.locator('.required-building').getAttribute('data-building'),building);checks.push({id,lockedLabel:label,catalogBuilding:building});
  }
  await shot('locked-catalog');
  if(width===390){
   await page.evaluate(()=>{const {engine:e,data,activity:a,ui}=window.__island;ui.setDockOpen(false);data.featureFlags.events=true;e.place('house',4,5);const r=a.prepare('fire');if(!r.ok)throw Error(JSON.stringify(r));e.state.events.active.warningUntil=Date.now();a.tick();});
   await tap('[data-action=toggle-event]');assert.equal(await page.locator('[data-action=event-play]').innerText(),'יש לבנות תחנת כיבוי');assert.equal(await page.locator('[data-action=event-auto]').isEnabled(),true);await tap('[data-action=event-play]');assert.equal(await page.locator('.required-building').getAttribute('data-building'),'fireStation');assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);
   await page.evaluate(()=>{const {activity:a,data,games}=window.__island;if(!a.choose('auto').ok)throw Error('self handling blocked');data.featureFlags.events=false;games.render();});checks.push({lockedEventBuildOrSelfHandle:true});
  }
  // Menu consumes exactly one Back; the map's next Back is ordinary browser navigation.
  await page.evaluate(()=>window.__island.games.menu());await nav();await page.evaluate(()=>history.back());await nav();assert.equal(await page.locator('.modal').count(),0);assert.equal(await page.evaluate(()=>history.state.islandShell.depth),0);
  const ids=await page.evaluate(()=>{const {engine:e,ui}=window.__island;ui.cancelPlacement();ui.setDockOpen(false);const placed={};for(const type of ['soccer','fireStation','airbase']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++){const r=e.place(type,x,z);if(r.ok){placed[type]=r.id;done=true;}}if(!done)throw Error('no place for '+type);}e.place('road',0,7);const harbor=e.place('harbor',0,8);if(!harbor.ok)throw Error(JSON.stringify(harbor));placed.harbor=harbor.id;return placed;});
  for(const [id,[building]]of Object.entries(games)){
   await page.evaluate(id=>window.__island.ui.showInfo(id),ids[building]);assert.equal(await page.locator(`[data-action=${building}-building-play]`).count(),1);await tap(`[data-action=${building}-building-play]`);assert.equal(await page.locator(`[data-stage-map=${id}]`).count(),1);await tap('[data-action=close-modal]');await nav();
   const before=await progress();await start(id);
   const canvas=await page.locator('.minigame-canvas').boundingBox(),size=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(Math.abs(canvas.width-size.width)<=1,JSON.stringify({canvas,size}));assert.ok(Math.abs(canvas.height-size.height)<=1,JSON.stringify({canvas,size}));assert.ok(canvas.x<=1&&canvas.y<=1);
   const pause=await page.locator('[data-action=game-pause]').boundingBox(),pauseMinimum=['alienDefense','fireRescue'].includes(id)?48:56;assert.ok(pause.width>=pauseMinimum&&pause.height>=pauseMinimum);assert.equal(await page.locator('[data-action=game-exit]').count(),0);if(width===360||width===844)assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),false);if(width===390&&id==='soccer')assert.equal(await page.evaluate(()=>document.fullscreenElement===document.documentElement),true);
   const initial=await snap();if(id!=='soccer'){const v=initial.viewport;assert.ok(v.offsetX>=0&&v.offsetY>=0);assert.ok(v.offsetX+v.modelWidth*v.scale<=canvas.width+1);assert.ok(v.offsetY+v.modelHeight*(v.scaleY??v.scale)<=canvas.height+1);}
   await shot(`${id}-play`);
   // Pause after held keyboard input; release while paused and prove the model is frozen.
   await page.locator('.minigame-canvas').focus();await page.keyboard.down(id==='soccer'?'Space':'ArrowRight');await tick(100);await tap('[data-action=game-pause]');await page.keyboard.up(id==='soccer'?'Space':'ArrowRight');
   assert.equal((await snap()).paused,true);assert.equal(await page.evaluate(()=>window.__island.games.sound.paused),true);const held=await simulation();await tick(1000);assert.deepEqual(await simulation(),held);if(id==='soccer')assert.equal((await snap()).charging,false);
   await tap('[data-action=game-resume]');await tick(200);assert.equal((await snap()).paused,false);assert.equal(await page.evaluate(()=>window.__island.games.sound.paused),false);
   // Visibility must remain paused until an explicit resume, including after returning to the tab.
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const hidden=await simulation();await tick(600);assert.deepEqual(await simulation(),hidden);await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await snap()).paused,true);await tap('[data-action=game-resume]');
   const guardedLength=await page.evaluate(()=>history.length);assert.ok(guardedLength<=baseLength+2);
   await back();assert.match(await page.locator('[data-pause-kind=exit]').getAttribute('aria-label'),/לצאת מהמשחק\?/);const paused=await simulation();await tick(600);assert.deepEqual(await simulation(),paused);await shot(`${id}-back`);await tap('[data-action=game-resume]');await tick(120);assert.equal((await snap()).paused,false);
   assert.equal(await page.evaluate(()=>history.length),guardedLength);await back();await tap('[data-action=game-exit]');await nav();assert.equal(await page.locator('.modal').count(),0);assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);assert.equal(await page.evaluate(()=>window.__island.view.paused),false);assert.equal(await page.evaluate(()=>history.state.islandShell.depth),0);assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),width!==360&&width!==844);assert.equal(await progress(),before);
   await start(id);await tap('[data-action=game-pause]');await tap('[data-action=game-exit]');await nav();assert.ok(await page.evaluate(()=>history.length)<=baseLength+2);assert.equal(await progress(),before);
   checks.push({id,canvas,viewport:size,pauseMinimum,pauseFreezesModel:true,visibilityPause:true,twoBackConfirmations:true,stayResumes:true,cancelWithoutReward:true,noHistoryGrowth:true});
  }
  if(width===390){
   // Reproduce the original finger drag through real CDP touch events, then confirm placement.
   const move=await page.evaluate(id=>{const {engine:e,view,ui}=window.__island,original={...e.state.buildings.find(b=>b.id===id)};let destination;for(let z=0;z<16&&!destination;z++)for(let x=0;x<16&&!destination;x++){if((x!==original.x||z!==original.z)&&e.validatePlacement('soccer',x,z,id).ok){const p=view.screenForCell(x,z);if(p.x>50&&p.x<320&&p.y>180&&p.y<650)destination={x,z};}}if(!destination)throw Error('no visible move destination');ui.showInfo(id);return {original,destination,angle:view.angle};},ids.soccer);
   await tap('[data-action=move]');const points=await page.evaluate(({original,destination})=>({a:window.__island.view.screenForCell(original.x,original.z),b:window.__island.view.screenForCell(destination.x,destination.z)}),move),cdp=await context.newCDPSession(page);
   const point=p=>[{id:1,x:p.x,y:p.y}];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(points.a)});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point({x:points.a.x+(points.b.x-points.a.x)*i/8,y:points.a.y+(points.b.y-points.a.y)*i/8})});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await page.evaluate(()=>window.__island.ui.currentGhost),move.destination);assert.equal(await page.evaluate(()=>window.__island.view.angle),move.angle);await tap('[data-action=place]');const moved=await page.evaluate(id=>window.__island.engine.state.buildings.find(b=>b.id===id),ids.soccer);assert.equal(moved.x,move.destination.x);assert.equal(moved.z,move.destination.z);await shot('soccer-moved');checks.push({touchMove390:true,from:move.original,to:moved});
  }
  // The hall has metrics, team and game entry and cannot expose removal.
  await page.evaluate(()=>{const {ui,engine}=window.__island;ui.showInfo(engine.state.buildings.find(b=>b.typeId==='cityHall').id);});assert.equal(await page.locator('[data-action=remove]').count(),0);assert.equal(await page.locator('[data-action=city-hall-games]').count(),1);assert.equal(await page.locator('.city-hall-metrics p').count(),await page.evaluate(()=>Object.keys(window.__island.engine.metrics()).length));assert.match(await page.locator('.info-card').innerText(),/כוכבי האי/);await shot('city-hall');
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);reports.push({width,height,fullscreenFallback:width===360?'denied':width===844?'unavailable':false,baseLength,checks,consoleErrors:errors,outsideRequests:outside,labBlocked:process.env.ISLAND_URL?null:true,shots});console.log('G5 verified',width,height);
 }catch(error){console.error(error,JSON.stringify({viewport,errors,outside}));try{await shot('failure');}catch(capture){console.error('failure screenshot:',capture.message);}throw error;}finally{await context.close();}
}
 await writeFile(directory+'verification.json',JSON.stringify({release:'g5-20261016-1',saveVersion:9,browser:'Chromium / ANGLE SwiftShader',physicalPhone:false,iOS:false,realFPS:false,reports},null,2)+'\n');
}finally{await browser.close();await server.close();}
