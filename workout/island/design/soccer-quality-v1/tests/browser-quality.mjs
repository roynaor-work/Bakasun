#!/usr/bin/env node
/** Native browser evidence, with the shipped island CSP and real DOM controls.
 * Reproducible fixtures edit live dev=1 state, never repository/source files.
 * --root must be an unmodified baseline or an independently patched copy.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

const argv=process.argv.slice(2),arg=(key,fallback)=>{const at=argv.indexOf('--'+key);return at<0?fallback:argv[at+1];};
const root=path.resolve(arg('root',fileURLToPath(new URL('../../../../..',import.meta.url))));
const label=arg('label','baseline'),query=arg('query',''),out=path.resolve(arg('output',fileURLToPath(new URL('../sim/browser/',import.meta.url))));
const viewports=arg('viewport','both')==='portrait'?[{width:390,height:844}]:arg('viewport','both')==='landscape'?[{width:844,height:390}]:[{width:390,height:844},{width:844,height:390}];
const {serveIsland,islandChromium,installIslandCspMonitor}=await import(pathToFileURL(path.join(root,'tests/helpers/island-browser.mjs')));
const {waitForGameStart}=await import(pathToFileURL(path.join(root,'workout/island/tests/shell-ready.mjs')));
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.ISLAND_CHROME||'/usr/bin/chromium',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={schema:1,label,query,sourceRoot:root,created:new Date().toISOString(),browserVersion:browser.version(),renderer:'headless Chromium, ANGLE SwiftShader (software GPU)',method:'Native island UI; deterministic live-state fixtures; trusted DOM keyboard actions; model advanced through production RAF. Landing physics stepped at the production fixed step in the loaded browser model after trusted input. Performance is in browser-performance.mjs without a fake clock.',targets:{consoleErrors:0,cspViolations:0,rosterPlayers:22,actionsPerPress:1,postLandingRollM:{min:.5,max:5},frameP95Ms:33.34},viewports:[]};
await mkdir(out,{recursive:true});
if(argv.includes('--merge')){const existing=JSON.parse(await readFile(path.join(out,label+'.json'),'utf8'));assert.equal(existing.sourceRoot,root);assert.equal(existing.query,query);report.viewports=existing.viewports.filter(old=>!viewports.some(v=>v.width===old.viewport.width&&v.height===old.viewport.height)).map(old=>({...old,originRunCreatedAt:old.originRunCreatedAt||existing.created}));}
try{
 for(const viewport of viewports){
  const tag=`${label}-${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),csp=await installIslandCspMonitor(context),page=await context.newPage();
  const errors=[],requests=[],failed=[];let result={viewport,created:new Date().toISOString(),errors,failed};report.viewports.push(result);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));page.on('requestfailed',r=>failed.push({url:r.url(),failure:r.failure()}));
  try{
   await context.addInitScript(()=>{window.__qualityWasmCalls=[];for(const name of ['compile','compileStreaming','instantiate','instantiateStreaming'])if(typeof WebAssembly?.[name]==='function'){const original=WebAssembly[name];WebAssembly[name]=function(...args){window.__qualityWasmCalls.push(name);return original.apply(this,args);};}});
   await csp.attachPage(page);await page.clock.install();
   console.log(tag+': loading native island');await page.goto(server.url+'?dev=1'+(query?'&'+query:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
   await page.evaluate(()=>{
    const {engine,ui,games}=window.__island;engine.setAvatar({name:'בדיקת כדורגל',created:true});engine.skipTutorial();engine.state.money=100000;engine.state.learning.required=false;
    if(!engine.state.buildings.some(b=>b.typeId==='soccer')){engine.enableReadyBuilding();const plot=engine.readyPlotForType('soccer');if(!plot.ok)throw Error(JSON.stringify(plot));engine.buildReadyPlot(plot.id);}
    engine.setSoccerDifficulty('normal');engine.save();ui.closeModal();games.menu();
   });
   await page.locator('[data-action="game-enter"][data-game-id="soccer"]').click();await page.locator('[data-action="game-play"]').click();await page.locator('[data-stage="1"]').click();
   if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
   await waitForGameStart(page);console.log(tag+': game started, loading native assets');await page.waitForLoadState('networkidle');await page.clock.runFor(160);
   await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.renderMetrics?.assetStatus==='ready'&&s.contractsStatus==='ready';},{},{timeout:120000});
   await page.clock.runFor(64);await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+32));
   console.log(tag+': assets ready');result.ready=await page.evaluate(()=>{const s=window.__island.games.current.session.snapshot;return {players:s.players.length,teamCounts:[0,1].map(t=>s.players.filter(p=>p.team===t).length),modelCount:s.renderMetrics.modelCount,renderMetrics:s.renderMetrics,quality:s.quality,full:s.full,contracts:s.contractsStatus};});
   assert.equal(result.ready.players,22);assert.deepEqual(result.ready.teamCounts,[11,11]);
   await page.evaluate(()=>{const model=window.__island.games.current.session.debug.model,drain=model.drainEvents;window.__qualityEvents=[];window.__qualityInputTrace=[];addEventListener('pointerdown',e=>window.__qualityInputTrace.push({trusted:e.isTrusted,type:e.pointerType,target:e.target.closest('button')?.id}),true);model.drainEvents=function(){const events=drain.call(this);window.__qualityEvents.push(...events);return events;};});
   const setup=async({moving=false}={})=>page.evaluate(({moving})=>{
    const session=window.__island.games.current.session,model=session.debug.model,s=model.getState();session.setPaused(false);model.clearInput();
    Object.assign(s,{phase:'playing',restart:null,phaseTime:0,attackDir:1,controlled:0,switchCooldown:100,passTarget:null,mode:'attack',role:'field',charging:false,charge:0,chargeKind:null,aim:{x:1,z:0},passAim:null,kickAim:null,moving:false,headerArm:null,airOptions:null});
    for(const p of s.players)Object.assign(p,{recover:1000,cooldown:0,slideTime:0,headerTime:0,kickTime:0,stealTime:0,vx:0,vz:0,fx:p.team===0?1:-1,fz:0,hands:false,restartMotion:null,think:100});
    if(moving)for(const p of s.players)Object.assign(p,{x:-35,z:p.team===0?25:-25});
    const p=s.players[0];Object.assign(p,{x:0,z:0,recover:0,fx:1,fz:0});
    const mate=s.players.find(p=>p.team===0&&p.id!==0&&(moving?p.role==='striker':p.role!=='keeper'));Object.assign(mate,{x:moving?2:18,z:moving?6.7:4,vx:moving?6:0,vz:0,recover:0,cooldown:1000});if(moving){const len=Math.hypot(mate.x,mate.z);p.fx=mate.x/len;p.fz=mate.z/len;s.aim={x:p.fx,z:p.fz};}
    Object.assign(s.ball,{owner:0,x:.58,z:0,y:.11,vx:0,vz:0,vy:0,grace:100,lastTeam:0,lastPlayer:0,flight:null,shot:null,thrower:null});window.__qualityEvents.length=0;return {receiverId:mate.id,receiver:{x:mate.x,z:mate.z},carrierId:p.id,tacticalTarget:model.tacticalTarget(mate)};
   },{moving});
   const press=async(selector,holdMs)=>{await page.locator(selector).focus();await page.keyboard.down('Space');await page.clock.runFor(holdMs);await page.keyboard.up('Space');await page.clock.runFor(32);};
   const events=()=>page.evaluate(()=>window.__qualityEvents);
   const tests=[];result.tests=tests;
   // One actual native quick-pass press. An oblique stationary teammate provides
   // an observable receiver-choice/aim error case, without an opponent collision.
   const quickFixture=await setup();await page.clock.runFor(32);await press('#pass',80);
   const quick=await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();return {events:window.__qualityEvents,ball:{...s.ball},target:s.passTarget,charge:s.chargeKind,receiver:s.players.find(p=>p.id===window.__qualityEvents.find(e=>e.type==='pass'&&e.player===0)?.target)};});
   const quickEvents=quick.events.filter(e=>e.type==='pass'&&e.player===0);assert.equal(quickEvents.length,1,'one quick pass per DOM press');
   tests.push({kind:'quick-pass',fixture:quickFixture,event:quickEvents[0],releaseSpeed:Math.hypot(quick.ball.vx,quick.ball.vz),receiverSelected:quickEvents[0].target===quickFixture.receiverId,initialReceiverDistanceM:Math.hypot(quickEvents[0].x-quickFixture.receiver.x,quickEvents[0].z-quickFixture.receiver.z),receiverAtRelease:quick.receiver?{x:quick.receiver.x,z:quick.receiver.z}:null,releaseTargetDistanceM:quick.receiver?Math.hypot(quickEvents[0].x-quick.receiver.x,quickEvents[0].z-quick.receiver.z):null});
   const throughFixture=await setup({moving:true});await page.clock.runFor(32);await page.locator('#pass').focus();await page.keyboard.down('ShiftLeft');await page.keyboard.down('Space');await page.clock.runFor(80);const preRelease=await page.evaluate(id=>{const s=window.__island.games.current.session.debug.model.getState(),p=s.players[id];return {x:p.x,z:p.z,vx:p.vx,vz:p.vz,aim:s.aim,charging:s.charging};},throughFixture.receiverId);await page.keyboard.up('Space');await page.clock.runFor(32);await page.keyboard.up('ShiftLeft');const throughDiagnostics=await page.evaluate(id=>{const s=window.__island.games.current.session.debug.model.getState(),p=s.players[id];return {throughPass:s.throughPass,aim:s.aim,passAim:s.passAim,runner:{id:p.id,x:p.x,z:p.z,vx:p.vx,vz:p.vz},input:window.__island.games.current.session.snapshot.controlsState};},throughFixture.receiverId);const throughEvents=(await events()).filter(e=>e.type==='pass'&&e.player===0);assert.equal(throughEvents.length,1,'one sprint plus pass action');tests.push({kind:'sprint-through-pass',fixture:throughFixture,preRelease,diagnostics:throughDiagnostics,event:throughEvents[0],through:throughEvents[0].kind==='through'});
   // Held native pass gives a physical loft. Freeze all bodies only after release
   // to isolate actual landing carry instead of a teammate's first touch.
   const loftFixture=await setup();await page.clock.runFor(32);await press('#pass',520);
   const loft=await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState(),event=window.__qualityEvents.find(e=>e.type==='loft'&&e.player===0);for(const p of s.players)p.recover=1000;return {event,receiver:s.players.find(p=>p.id===event?.target),flight:s.ball.flight,ball:{x:s.ball.x,y:s.ball.y,z:s.ball.z,vx:s.ball.vx,vz:s.ball.vz}};});
   assert.ok(loft.event,'held DOM pass emits a loft');assert.equal(loft.flight?.kind,'physical-loft');
   const landed=await page.evaluate(()=>{const session=window.__island.games.current.session,model=session.debug.model,s=model.getState();session.setPaused(true);let firstLanding=null,peak=s.ball.y;for(let i=0;i<400;i++){model.update(1/60,{});peak=Math.max(peak,s.ball.y);if(!s.ball.flight){firstLanding={x:s.ball.x,y:s.ball.y,z:s.ball.z,vx:s.ball.vx,vz:s.ball.vz,phase:s.phase};break;}}if(!firstLanding)throw Error('physical loft must land');for(let i=0;i<90;i++)model.update(1/60,{});return {firstLanding,peak,settled:{x:s.ball.x,y:s.ball.y,z:s.ball.z,vx:s.ball.vx,vz:s.ball.vz,phase:s.phase}};});
   const {firstLanding,peak,settled}=landed;
   tests.push({kind:'held-loft',fixture:loftFixture,event:loft.event,peakM:peak,firstLanding,settled,initialReceiverDistanceM:Math.hypot(loft.event.x-loftFixture.receiver.x,loft.event.z-loftFixture.receiver.z),receiverAtRelease:loft.receiver?{x:loft.receiver.x,z:loft.receiver.z}:null,releaseTargetDistanceM:loft.receiver?Math.hypot(loft.event.x-loft.receiver.x,loft.event.z-loft.receiver.z):null,postLandingRollM:Math.hypot(settled.x-firstLanding.x,settled.z-firstLanding.z)});
   // The dedicated fourth control is the product's easy lob. This additionally
   // covers the soccer-v23 path (which does not use held-pass charging).
   const lobFixture=await setup();await page.clock.runFor(32);assert.equal(await page.locator('#soccer-switch').getAttribute('data-air'),'lob');
   const touchSession=await context.newCDPSession(page),lobBox=await page.locator('#soccer-switch').boundingBox();await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:9,x:lobBox.x+lobBox.width/2,y:lobBox.y+lobBox.height/2,radiusX:6,radiusY:6,force:1}]});await page.clock.runFor(80);await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.clock.runFor(32);await touchSession.detach();assert.ok(await page.evaluate(()=>window.__qualityInputTrace.some(e=>e.trusted&&e.type==='touch'&&e.target==='soccer-switch')),'native lob receives a trusted touch');const lobEvents=(await events()).filter(e=>e.type==='loft'&&e.player===0);assert.equal(lobEvents.length,1,'one dedicated lob per DOM press');tests.push({kind:'dedicated-lob',trustedTouch:true,fixture:lobFixture,event:lobEvents[0],initialReceiverDistanceM:Math.hypot(lobEvents[0].x-lobFixture.receiver.x,lobEvents[0].z-lobFixture.receiver.z)});
   // Native pause must stop model time and release charged inputs.
   await setup();await page.clock.runFor(32);await page.locator('[data-action="game-pause"]').click({force:true});await page.clock.runFor(32);const beforePause=await page.evaluate(()=>window.__island.games.current.session.snapshot.elapsed);await page.clock.runFor(300);const afterPause=await page.evaluate(()=>window.__island.games.current.session.snapshot.elapsed);assert.equal(afterPause,beforePause);await page.locator('[data-action="game-resume"]').click({force:true});await page.clock.runFor(32);tests.push({kind:'pause',elapsedStable:true});
   await setup();await page.clock.runFor(32);await page.screenshot({path:path.join(out,tag+'-native.png'),timeout:120000});
   result.tests=tests;
   if(query.includes('soccerQuality=v1')){assert.equal(tests.find(t=>t.kind==='quick-pass').receiverSelected,true,'quality quick pass selects intended teammate');const loftTest=tests.find(t=>t.kind==='held-loft');assert.ok(loftTest.postLandingRollM>=.5&&loftTest.postLandingRollM<=3,'quality loft rolls0.5..3m after landing');assert.equal(tests.find(t=>t.kind==='sprint-through-pass').through,true,'sprint plus pass leads a runner');}
   result.scenarios=await page.evaluate(async quality=>{const {runBrowserScenarios}=await import('./design/soccer-quality-v1/sim/browser-scenarios.mjs');return runBrowserScenarios({quality});},query.includes('soccerQuality=v1'));
   result.tests=tests;result.wasmRequests=requests.filter(url=>/\.wasm(?:\?|$)|draco_wasm_wrapper/.test(url));result.wasmCalls=await page.evaluate(()=>window.__qualityWasmCalls);if(query.includes('soccerQuality=v1')){assert.deepEqual(result.wasmRequests,[],'quality renderer must not request WASM');assert.deepEqual(result.wasmCalls,[],'quality page must not compile or instantiate WASM');}result.requestCount=requests.length;await csp.assertClean();result.csp={htmlResponses:csp.snapshot().htmlResponsesSeen,violations:csp.snapshot().violations,policyErrors:csp.snapshot().policyErrors};assert.deepEqual(errors,[]);result.passed=true;
   console.log(JSON.stringify({label,viewport,passed:true,players:result.ready.players,tests}));
  }catch(error){result.passed=false;result.error=error.stack||String(error);result.csp=csp.snapshot();await page.screenshot({path:path.join(out,tag+'-failure.png')}).catch(()=>{});console.error(result.error);}
  finally{await context.close();await csp.dispose();await writeFile(path.join(out,label+'.json'),JSON.stringify(report,null,2)+'\n');}
 }
}finally{await browser.close();await server.close();}
if(report.viewports.some(v=>!v.passed))process.exitCode=1;
