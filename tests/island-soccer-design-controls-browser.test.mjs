import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium,readIslandCsp,installIslandCspMonitor} from './helpers/island-browser.mjs';
import {waitForGameStart} from '../workout/island/tests/shell-ready.mjs';

const enabled=process.env.ISLAND_SOCCER_BROWSER==='1',output=process.env.ISLAND_SOCCER_AUDIT_DIR?path.resolve(process.env.ISLAND_SOCCER_AUDIT_DIR):null;
const contract=JSON.parse(await readFile(new URL('../workout/island/design/controls/soccer.json',import.meta.url),'utf8'));
const executablePath=process.env.ISLAND_CHROME||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
const selectors={stick:'#joystick',pause:'[data-action="game-pause"]',primary:'#shoot',secondary:'#pass',sprint:'#sprint',trick:'#soccer-switch'};

test('soccer supplied controls in the native game, with real CSP, both orientations and lifecycle cancellation',{skip:!enabled,timeout:600000},async t=>{
  const server=await serveIsland('/workout/island/'),chromium=await islandChromium(),reports=[];
  const browser=await chromium.launch({executablePath,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  if(output)await mkdir(output,{recursive:true});
  try{
    // Keep the intentional enforcement probe isolated. Production contexts must
    // pass the monitor without clearing or filtering any real game violation.
    await t.test('native index enforces its inline script prohibition',async()=>{
      const context=await browser.newContext({serviceWorkers:'block'}),csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
      try{
        await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await csp.assertClean();
        assert.equal(await page.evaluate(()=>{const node=document.createElement('script');node.textContent='window.__soccerInlineExecuted=true';document.head.append(node);return !!window.__soccerInlineExecuted;}),false);
        await assert.rejects(()=>csp.assertClean(),/Island CSP audit failed/);
        assert.ok(csp.violations.some(entry=>entry.kind==='event'&&entry.blockedURI==='inline'&&entry.disposition==='enforce'));
        reports.push({kind:'isolated-inline-probe',blocked:true,csp:csp.snapshot()});
      }finally{await context.close();await csp.dispose();}
    });
    for(const viewport of [{width:844,height:390},{width:390,height:844}])await t.test(`${viewport.width}x${viewport.height}`,async()=>{
      const tag=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
      const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',request=>requests.push(request.url()));
      let cdp;
      try{
        await page.clock.install();await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
        assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),await readIslandCsp());
        await page.evaluate(()=>{
          const {engine,ui,games}=window.__island;engine.setAvatar({name:'בדיקת שליטה',created:true});engine.skipTutorial();engine.state.money=100000;engine.state.learning.required=false;
          if(!engine.state.buildings.some(building=>building.typeId==='soccer')){engine.enableReadyBuilding();const plot=engine.readyPlotForType('soccer');if(!plot.ok)throw Error(JSON.stringify(plot));engine.buildReadyPlot(plot.id);}
          engine.setSoccerDifficulty('normal');engine.save();ui.closeModal();games.menu();
        });
        await page.locator('[data-action="game-enter"][data-game-id="soccer"]').click();await page.locator('[data-action="game-play"]').click();await page.locator('[data-stage="1"]').click();
        if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
        await waitForGameStart(page);await page.waitForLoadState('networkidle');
        await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.renderMetrics?.assetStatus==='ready'&&s.contractsStatus==='ready';},{},{timeout:120000});
        await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+10000));
        const snapshot=()=>page.evaluate(()=>window.__island.games.current.session.snapshot);
        const ready=await snapshot();assert.equal(ready.renderMetrics.assetStats.kind,'design-glb-v2');assert.equal(ready.renderMetrics.modelCount,12);assert.equal(ready.players.length,12);assert.equal(ready.contractsStatus,'ready');assert.equal(ready.renderMetrics.designScene.status,'ready');
        assert.equal(await page.locator('html').getAttribute('dir'),'rtl');assert.notEqual(await page.locator('.game-screen').getAttribute('data-orientation-blocked'),'true');
        for(const suffix of ['design/controls/soccer.json','design/controls/interaction.json','design/tactics/soccer.json','design/characters2/soccer-player.glb','design/models2/soccer-stadium.glb'])assert.ok(requests.some(url=>new URL(url).pathname.endsWith(suffix)),suffix+' must be consumed by the native game');
        await page.evaluate(()=>{window.__soccerControlEvents=[];window.__soccerPointerTrace=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','resize'])addEventListener(type,event=>window.__soccerPointerTrace.push({type,id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target?.id,trusted:event.isTrusted,time:performance.now(),width:innerWidth,height:innerHeight}),true);const model=window.__island.games.current.session.debug.model,original=model.drainEvents;model.drainEvents=function(){const events=original.call(this);window.__soccerControlEvents.push(...events);return events;};});
        const fixture=()=>page.evaluate(()=>{
          const session=window.__island.games.current.session,model=session.debug.model,s=model.getState(),config=window.__island.data.config.minigames.soccer;session.setPaused(false);model.clearInput();
          Object.assign(s,{phase:'playing',restart:null,attackDir:1,controlled:0,switchCooldown:100,passTarget:null,mode:'attack',role:'field'});
          for(const p of s.players)Object.assign(p,{recover:p.id===0?0:1000,cooldown:0,slideTime:0,headerTime:0,kickTime:0,stealTime:0,vx:0,vz:0,fx:p.team===0?1:-1,fz:0,hands:false,restartMotion:null});
          Object.assign(s.players[0],{x:0,z:0});Object.assign(s.ball,{owner:0,x:config.physics.dribbleOffset,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:100,lastTeam:0,lastPlayer:0,flight:null,shot:null,thrower:null});window.__soccerControlEvents.length=0;
        });
        const events=()=>page.evaluate(()=>window.__soccerControlEvents);
        const centre=async selector=>{const box=await page.locator(selector).boundingBox();assert.ok(box,selector);return {x:box.x+box.width/2,y:box.y+box.height/2};};
        const screenshot=async name=>{if(output)await page.screenshot({path:path.join(output,`${tag}-${name}.png`)});};
        cdp=await context.newCDPSession(page);const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(point=>({...point,radiusX:6,radiusY:6,force:1}))});

        await fixture();await page.clock.runFor(32);const start=await centre('#joystick'),shoot=await centre('#shoot'),left={id:11,...start},moving={...left,x:left.x+42},right={id:12,...shoot};
        await touch('touchStart',[left]);await touch('touchMove',[moving]);await page.clock.runFor(160);await touch('touchStart',[moving,right]);await page.clock.runFor(220);
        let current=await snapshot();assert.ok(current.players[0].x>.35);assert.equal(current.charging,true);assert.ok(current.charge>.15);
        const drag={...right,x:right.x+28,y:right.y-28};await touch('touchMove',[moving,drag]);
        // Chromium can coalesce native moves until its next compositor frame.
        // Require that trusted pointer delivery, rather than guessing its delay.
        let dragDelivered=false;
        for(let attempt=0;attempt<20;attempt++){await page.clock.runFor(16);dragDelivered=await page.evaluate(point=>window.__soccerPointerTrace.some(event=>event.type==='pointermove'&&event.target==='shoot'&&event.trusted&&Math.abs(event.x-point.x)<1&&Math.abs(event.y-point.y)<1),drag);if(dragDelivered)break;}
        assert.equal(dragDelivered,true,'the second native thumb must deliver a captured move');await page.clock.runFor(32);current=await snapshot();assert.equal(current.kickAim.manual,true);assert.ok(current.kickAim.x>0&&current.kickAim.z<0);await screenshot('two-touch-shot');
        await touch('touchEnd',[]);await page.clock.runFor(64);assert.equal((await events()).filter(event=>event.type==='shot'&&event.player===0).length,1);

        await fixture();await page.clock.runFor(32);const pass={id:22,...await centre('#pass')},stick={id:21,...await centre('#joystick')};await touch('touchStart',[stick]);await touch('touchMove',[{...stick,x:stick.x+42}]);await touch('touchStart',[{...stick,x:stick.x+42},pass]);await page.clock.runFor(400);
        assert.equal((await snapshot()).chargeKind,'pass');await screenshot('two-touch-loft');await touch('touchEnd',[]);await page.clock.runFor(64);assert.equal((await events()).filter(event=>event.type==='loft'&&event.player===0).length,1);

        await fixture();await page.clock.runFor(32);await touch('touchStart',[{id:31,...await centre('#shoot')}]);await page.clock.runFor(160);assert.equal((await snapshot()).charging,true);await touch('touchCancel',[]);await page.clock.runFor(64);assert.equal((await snapshot()).charging,false);assert.equal((await events()).some(event=>event.type==='shot'),false);

        await fixture();await page.clock.runFor(32);await page.locator('#pass').focus();await page.keyboard.down('Space');await page.keyboard.down('ArrowRight');await page.clock.runFor(180);current=await snapshot();assert.equal(current.chargeKind,'pass');assert.ok(current.players[0].x>0);await page.keyboard.up('Space');await page.keyboard.up('ArrowRight');await page.clock.runFor(64);assert.equal((await events()).filter(event=>event.type==='pass'&&event.player===0).length,1);assert.equal((await events()).some(event=>event.type==='shot'),false);

        await fixture();await page.clock.runFor(32);await page.locator('#shoot').focus();await page.keyboard.down('Space');await page.clock.runFor(160);assert.equal((await snapshot()).charging,true);await page.locator('[data-action="game-pause"]').click({force:true});await page.clock.runFor(32);const paused=await snapshot();await page.keyboard.up('Space');await page.clock.runFor(300);const still=await snapshot();assert.equal(still.elapsed,paused.elapsed);assert.deepEqual(still.players,paused.players);await page.locator('[data-action="game-resume"]').click({force:true});await page.clock.runFor(64);assert.equal((await events()).some(event=>event.type==='shot'),false);

        await fixture();await page.clock.runFor(32);await page.locator('#shoot').focus();await page.keyboard.down('Space');await page.clock.runFor(160);await page.setViewportSize({width:viewport.width+1,height:viewport.height});await page.clock.runFor(64);await page.keyboard.up('Space');await page.setViewportSize(viewport);await page.clock.runFor(64);assert.equal((await snapshot()).charging,false);assert.equal((await events()).some(event=>event.type==='shot'),false);

        // Geometry/state fixtures freeze only model time, after native actions
        // above proved the real running input path. All labels/slots are still
        // read and rendered by the production session's regular RAF.
        const layouts=[];
        for(const stateKey of Object.keys(contract.states)){
          await fixture();await page.evaluate(key=>{
            const session=window.__island.games.current.session,s=session.debug.model.getState();session.setPaused(true);
            s.role=key.startsWith('keeper')||key==='goalkeeper'?'keeper':'field';s.mode=key==='defense'?'defense':'attack';
            if(key==='goalkeeper')s.ball.owner=null;
            const type={throw_in:'throwIn',corner:'corner',goal_kick:'goalKick',free_kick:'freeKick',opponent_restart:'throwIn'}[key];
            if(type){s.phase='restart';s.phaseTime=1000;s.restart={type,team:key==='opponent_restart'?1:0,player:0,x:0,z:0,age:0,elapsed:0,walkSeconds:1000,from:{x:0,z:0}};}
          },stateKey);await page.clock.runFor(32);
          assert.equal(await page.locator('.soccer-controls').getAttribute('data-control-state'),stateKey);
          const visible=[];
          for(const slot of ['primary','secondary','sprint','trick']){
            const expected=contract.states[stateKey].controls.find(entry=>entry.slot===slot),node=page.locator(selectors[slot]);assert.equal(await node.isVisible(),Boolean(expected),stateKey+':'+slot);
            if(expected){assert.equal(await node.getAttribute('data-design-action'),expected.id);assert.equal(await node.getAttribute('aria-label'),contract.controls[expected.id].aria_label);const box=await node.boundingBox();assert.ok(box.width>=48&&box.height>=48);assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+.1&&box.y+box.height<=viewport.height+.1);visible.push({slot,id:expected.id,...box});}
          }
          layouts.push({state:stateKey,controls:visible});if(['attack','defense','throw_in','goalkeeper','keeper_ball'].includes(stateKey))await screenshot('state-'+stateKey);
        }
        const pauseBox=await page.locator(selectors.pause).boundingBox(),scoreBox=await page.locator('.soccer-scoreboard').boundingBox();assert.ok(pauseBox.x+pauseBox.width+8<=scoreBox.x||scoreBox.x+scoreBox.width+8<=pauseBox.x||pauseBox.y+pauseBox.height+8<=scoreBox.y||scoreBox.y+scoreBox.height+8<=pauseBox.y,'pause and score must not overlap');
        await fixture();await page.clock.runFor(32);await screenshot('playing');await csp.assertClean();assert.deepEqual(errors,[]);
        reports.push({viewport,contractsStatus:'ready',assets:ready.renderMetrics.assetStats.kind,modelCount:ready.renderMetrics.modelCount,requestedContracts:true,twoTouchShot:true,twoTouchLoft:true,pointerCancel:true,focusedKeyboardPass:true,pauseStable:true,resizeCancels:true,allDesignStates:layouts,pauseScoreNoOverlap:true,csp:csp.snapshot(),errors});
      }catch(error){reports.push({viewport,error:String(error),errors,csp:csp.snapshot(),snapshot:await page.evaluate(()=>window.__island?.games.current?.session.snapshot).catch(()=>null),trace:await page.evaluate(()=>({pointers:window.__soccerPointerTrace,events:window.__soccerControlEvents,rects:Object.fromEntries(['shoot','pass','joystick'].map(id=>{const r=document.getElementById(id)?.getBoundingClientRect();return [id,r?.toJSON()];}))})).catch(()=>null)});if(output)await page.screenshot({path:path.join(output,`${tag}-failure.png`)}).catch(()=>{});throw error;}
      finally{await cdp?.detach().catch(()=>{});await context.close();await csp.dispose();}
    });
  }finally{if(output)await writeFile(path.join(output,'soccer-design-controls-browser.json'),JSON.stringify(reports,null,2));await browser.close();await server.close();}
});
