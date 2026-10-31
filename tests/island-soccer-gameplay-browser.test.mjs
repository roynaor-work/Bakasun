import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from './helpers/island-browser.mjs';
import {waitForGameStart} from '../workout/island/tests/shell-ready.mjs';

// Opt in because this exercises the published page, GPU renderer, local Draco
// worker, native touch delivery and audio. No route supplies a weaker test page.
const enabled=process.env.ISLAND_SOCCER_BROWSER==='1';
const index=await readFile(new URL('../workout/island/index.html',import.meta.url),'utf8');
const nativeCSP=index.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
const executablePath=process.env.ISLAND_CHROME||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
const output=process.env.SOCCER_SCREENSHOT_DIR?path.resolve(process.env.SOCCER_SCREENSHOT_DIR):null;

test('soccer native controls, real script-src self CSP and both phone orientations',{skip:!enabled,timeout:300000},async t=>{
 assert.ok(nativeCSP?.includes("script-src 'self'"));
 const server=await serveIsland('/workout/island/');
 let browser;const reports=[];
 try{
  const chromium=await islandChromium();
  browser=await chromium.launch({executablePath,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
  if(output)await mkdir(output,{recursive:true});
  for(const viewport of [{width:844,height:390},{width:390,height:844}])await t.test(`${viewport.width}x${viewport.height}`,async()=>{
   const tag=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
   try{
    await page.clock.install();
    await page.addInitScript(()=>{
     window.__soccerCSP=[];
     document.addEventListener('securitypolicyviolation',event=>window.__soccerCSP.push({directive:event.effectiveDirective,blocked:event.blockedURI}));
    });
    await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__island);
    assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),nativeCSP,'test must retain the exact production policy');
    assert.deepEqual(errors,[],'initial page must load cleanly before the deliberate CSP probe');
    await page.evaluate(()=>{
     window.__soccerInlineRan=false;
     const probe=document.createElement('script');probe.textContent='window.__soccerInlineRan=true';
     document.head.append(probe);probe.remove();
    });
    await page.clock.runFor(32);
    const blocked=await page.evaluate(()=>({ran:window.__soccerInlineRan,violations:window.__soccerCSP}));
    assert.equal(blocked.ran,false,'an injected inline script must actually be blocked');
    assert.ok(blocked.violations.some(v=>v.directive==='script-src-elem'&&v.blocked==='inline'),'CSP enforcement must emit the inline violation');
    assert.ok(errors.every(message=>/inline script.*Content Security Policy|Content Security Policy.*inline script/i.test(message)),`only the deliberate probe may fail: ${errors.join('\n')}`);
    errors.length=0;await page.evaluate(()=>{window.__soccerCSP.length=0;});
    await page.evaluate(()=>{
     const {engine,ui,games}=window.__island;
     engine.setAvatar({name:'בדיקת כדורגל',created:true});engine.skipTutorial();engine.state.money=100000;engine.state.learning.required=false;
     if(!engine.state.buildings.some(building=>building.typeId==='soccer')){
      engine.enableReadyBuilding();const lot=engine.readyPlotForType('soccer');if(!lot.ok)throw Error(JSON.stringify(lot));engine.buildReadyPlot(lot.id);
     }
     engine.setSoccerDifficulty('normal');engine.save();ui.closeModal();games.menu();
    });
    await page.locator('[data-action="game-enter"][data-game-id="soccer"]').click();
    await page.locator('[data-action="game-play"]').click();await page.locator('[data-stage="1"]').click();
    if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
    await waitForGameStart(page);await page.waitForLoadState('networkidle');await page.clock.runFor(1200);
    await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.renderMetrics?.assetStatus==='ready');
    // Rendering a software-GPU screenshot may take seconds of wall time. A
    // held thumb must last only the explicitly requested simulation interval.
    await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+1000));
    assert.notEqual(await page.locator('.game-screen').getAttribute('data-orientation-blocked'),'true');
    assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
    await page.evaluate(()=>{
     window.__soccerInputEvents=[];
     window.__soccerTouchLog=[];
     for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,event=>{window.__soccerTouchLog.push({type,id:event.pointerId,target:event.target.id,cls:event.target.className,x:event.clientX,y:event.clientY});},true);
     const model=window.__island.games.current.session.debug.model,drain=model.drainEvents;
     model.drainEvents=function(){const events=drain.call(this);window.__soccerInputEvents.push(...events);return events;};
    });
    const snapshot=()=>page.evaluate(()=>window.__island.games.current.session.snapshot);
    const fixture=()=>page.evaluate(()=>{
     // Position only: the production session still samples every real control.
     const {model}=window.__island.games.current.session.debug,s=model.getState(),c=window.__island.data.config.minigames.soccer;
     model.clearInput();s.phase='playing';s.restart=null;s.attackDir=1;s.controlled=0;s.switchCooldown=100;s.passTarget=null;s.mode='attack';
     for(const player of s.players)Object.assign(player,{recover:player.id===0?0:1000,cooldown:0,slideTime:0,vx:0,vz:0,fx:player.team===0?1:-1,fz:0,hands:false,kickTime:0});
     Object.assign(s.players[0],{x:0,z:0});
     Object.assign(s.ball,{owner:0,x:c.physics.dribbleOffset,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,grace:10,lastTeam:0,lastPlayer:0,flight:null,shot:null,thrower:null});
     window.__soccerInputEvents.length=0;
    });
    const events=()=>page.evaluate(()=>window.__soccerInputEvents);
    const centre=async selector=>{const box=await page.locator(selector).boundingBox();assert.ok(box,selector);return {x:box.x+box.width/2,y:box.y+box.height/2};};
    const cdp=await context.newCDPSession(page);
    const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(point=>({...point,radiusX:6,radiusY:6,force:1}))});
    const screenshot=async suffix=>{if(output)await page.screenshot({path:path.join(output,`${tag}-${suffix}.png`)});};

    // Two simultaneous native touches: movement keeps working while charging,
    // and dragging the action thumb sets the shot direction independently.
    await fixture();await page.clock.runFor(32);
    const start=await centre('.soccer-move-hint'),shoot=await centre('#shoot'),finger={id:11,...start};
    await touch('touchStart',[finger]);
    const moving={...finger,x:finger.x+45};await touch('touchMove',[moving]);await page.clock.runFor(160);
    const action={id:12,...shoot};await touch('touchStart',[moving,action]);await page.clock.runFor(220);
    let s=await snapshot();assert.ok(s.players[0].x>.35,'native joystick must move the controlled player');assert.ok(s.charging&&s.charge>.15,'second thumb must keep charging');
    const dragged={...action,x:action.x+30,y:action.y-35};await touch('touchMove',[moving,dragged]);await page.clock.runFor(32);
    s=await snapshot();assert.equal(s.kickAim?.manual,true);assert.ok(s.kickAim.x>0&&s.kickAim.z<0);
    await screenshot('controls-drag');await touch('touchEnd',[]);await page.clock.runFor(50);
    s=await snapshot();let physical=await events();
    assert.equal(physical.filter(event=>event.type==='shot'&&event.player===0).length,1,'one release produces one physical shot');
    assert.ok(s.ball.vx>0&&s.ball.vz<0,'manual drag must survive the release edge');assert.equal(s.charging,false);

    // A platform pointer cancellation clears the model charge, rather than
    // turning a lost touch into a shot on the following frame.
    await fixture();const cancelPoint={id:21,...await centre('#shoot')};await touch('touchStart',[cancelPoint]);await page.clock.runFor(180);
    assert.equal((await snapshot()).charging,true);await touch('touchCancel',[]);await page.clock.runFor(64);
    assert.equal((await snapshot()).charging,false);assert.equal((await events()).some(event=>event.type==='shot'),false);

    // Space on the focused pass button belongs to that button. Movement keys
    // still work, and its release produces a pass rather than a second shot.
    await fixture();await page.locator('#pass').focus();await page.keyboard.down('Space');await page.keyboard.down('ArrowRight');await page.clock.runFor(180);
    s=await snapshot();assert.equal(s.chargeKind,'pass');assert.ok(s.charge>.1);assert.ok(s.players[0].x>0);
    await page.keyboard.up('Space');await page.keyboard.up('ArrowRight');await page.clock.runFor(50);physical=await events();
    assert.equal(physical.filter(event=>event.type==='pass'&&event.player===0).length,1);assert.equal(physical.some(event=>event.type==='shot'),false);

    // Pause while holding a focused shot cancels the pending action and stops
    // simulation. Resuming after key-up cannot fire that stale charge.
    await fixture();await page.locator('#shoot').focus();await page.keyboard.down('Space');await page.clock.runFor(160);
    assert.equal((await snapshot()).charging,true);
    await page.locator('[data-action="game-pause"]').click({force:true});await page.clock.runFor(32);const paused=await snapshot();
    await page.keyboard.up('Space');await page.clock.runFor(400);const still=await snapshot();
    assert.equal(still.elapsed,paused.elapsed);assert.deepEqual(still.players,paused.players);assert.deepEqual(still.ball,paused.ball);
    await page.locator('[data-action="game-resume"]').click({force:true});await page.clock.runFor(80);
    assert.equal((await snapshot()).charging,false);assert.equal((await events()).some(event=>event.type==='shot'),false);
    await screenshot('playing');
    for(const selector of ['#shoot','#pass','#sprint','#soccer-switch']){
     const box=await page.locator(selector).boundingBox();assert.ok(box?.width>=48&&box?.height>=48,`${selector} must keep a phone touch target`);
    }
    const violations=await page.evaluate(()=>window.__soccerCSP);
    assert.deepEqual(violations,[],'the real game, worker and input handlers must operate under production CSP');assert.deepEqual(errors,[]);
    reports.push({viewport,csp:nativeCSP,inlineProbeBlocked:true,touchMovement:true,twoTouchCharge:true,manualDrag:true,pointerCancel:true,focusedKeyboardPass:true,pauseStable:true,errors,violations});
    await cdp.detach();
   }catch(error){
    reports.push({viewport,error:String(error),errors,debug:await page.evaluate(()=>({snapshot:window.__island?.games.current?.session.snapshot,touches:window.__soccerTouchLog,events:window.__soccerInputEvents})).catch(()=>null),violations:await page.evaluate(()=>window.__soccerCSP).catch(()=>null)});
    if(output)await page.screenshot({path:path.join(output,`${tag}-failure.png`)}).catch(()=>{});
    throw error;
   }finally{await context.close();}
  });
 }finally{
  if(output)await writeFile(path.join(output,'soccer-gameplay-browser.json'),JSON.stringify(reports,null,2));
  await browser?.close();await server.close();
 }
});
