import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';
import {waitForGameStart} from '../workout/island/tests/shell-ready.mjs';
import {SOCCER_RESTART_SEQUENCES} from '../workout/island/minigames/soccer-restart-motion.mjs';

const enabled=process.env.ISLAND_SOCCER_BROWSER==='1';
const output=process.env.ISLAND_SOCCER_RESTART_DIR||process.env.ISLAND_SOCCER_AUDIT_DIR||fileURLToPath(new URL('../../../outputs/soccer-fixes-20261101/final-restarts/',import.meta.url));
const executablePath=process.env.ISLAND_CHROME||process.env.CHROMIUM_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
const physicalTypes=['throw','pass','loft','shot'];

test('soccer motion2 native restart contacts and releases under shipped index CSP, both phone orientations',{skip:!enabled,timeout:900000},async t=>{
 const server=await serveIsland('/workout/island/'),browser=await(await islandChromium()).launch({executablePath,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),reports=[];
 await mkdir(output,{recursive:true});
 try{
  await t.test('separate context proves inline script prohibition is enforced',async()=>{
   const context=await browser.newContext({serviceWorkers:'block'}),audit=await installIslandCspMonitor(context),page=await context.newPage();await audit.attachPage(page);
   try{
    await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await audit.assertClean();
    assert.equal(await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.__soccerRestartInlineExecuted=true';document.head.append(script);return !!window.__soccerRestartInlineExecuted;}),false);
    await assert.rejects(()=>audit.assertClean(),/Island CSP audit failed/);assert.ok(audit.violations.some(v=>v.kind==='event'&&v.blockedURI==='inline'&&v.disposition==='enforce'));
    reports.push({kind:'isolated-inline-probe',blocked:true,csp:audit.snapshot()});
   }finally{await context.close();await audit.dispose();}
  });
  for(const viewport of [{width:844,height:390},{width:390,height:844}])for(const role of ['field','keeper'])await t.test(`${viewport.width}x${viewport.height} ${role}`,async()=>{
   const tag=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),audit=await installIslandCspMonitor(context),page=await context.newPage(),errors=[],resources={};await audit.attachPage(page);
   const report={viewport,role,scenarios:[]};reports.push(report);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/design/motion2/soccer/'))resources[new URL(r.url()).pathname.split('/').at(-1)]=r.status();});
   const snapshot=()=>page.evaluate(()=>window.__island.games.current.session.snapshot);
   const events=()=>page.evaluate(()=>window.__soccerRestartEvents||[]);
   const until=async(predicate,label,ms=34,attempts=500)=>{for(let i=0;i<attempts;i++){const s=await snapshot();if(predicate(s))return s;await page.clock.runFor(ms);}assert.fail(label);};
   const shot=async name=>{const before=await page.evaluate(()=>JSON.stringify(window.__island.games.current.session.debug.model.getState()));await page.screenshot({path:path.join(output,`${tag}-${name}.png`)});assert.equal(await page.evaluate(()=>JSON.stringify(window.__island.games.current.session.debug.model.getState())),before,'screenshots cannot advance simulation');};
   const advanceTo=async(taker,target)=>{const s=await snapshot(),elapsed=s.players[taker].restartMotion.elapsed;if(target>elapsed)await page.clock.runFor(Math.floor((target-elapsed)*1000));return snapshot();};
   try{
    await page.clock.install();await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
    assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),server.csp);
    await page.evaluate(()=>{const {engine:e,ui}=window.__island;e.setAvatar({name:'בדיקת הוצאות',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer')){e.enableReadyBuilding();const lot=e.readyPlotForType('soccer');if(!lot.ok)throw Error(JSON.stringify(lot));e.buildReadyPlot(lot.id);}e.setSoccerDifficulty('normal');e.save();ui.closeModal();window.__island.games.start('soccer',undefined,1);});
    if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
    await waitForGameStart(page);await page.waitForLoadState('networkidle');await page.clock.runFor(1200);await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.renderMetrics?.assetStatus==='ready');
    await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+10000));
    if(role==='keeper'){
     // The league exposes field play. This is an explicitly labeled goalkeeper
     // session fixture on the real shell, assets, RAF and controls, not a menu option.
     await page.evaluate(async()=>{const {engine,games}=window.__island,{startSoccer}=await import(new URL('./minigames/soccer-session.mjs',location.href));const dialog=document.querySelector('.game-screen'),old=dialog.querySelector('canvas'),canvas=old.cloneNode(false),controls=dialog.querySelector('.game-controls'),status=dialog.querySelector('.game-status');games.current.session.dispose();old.replaceWith(canvas);controls.replaceChildren();for(const node of dialog.querySelectorAll('.soccer-scoreboard,.soccer-goal-banner,.soccer-phase-banner,.soccer-loading,.soccer-fixture,.soccer-action-feedback,.soccer-edge-arrow'))node.remove();const session=startSoccer({engine,state:engine.state,balance:engine.data.config.minigames.soccer,canvas,controls,status,t:games.t,role:'keeper',soccerCard:engine.state.soccerCard,difficulty:'normal',level:1,seed:57,finish(){},cancel(){},onError(id){throw Error(id);}});games.current.session=session;games.shell.bind(session);});
     await page.waitForLoadState('networkidle');await until(s=>s.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready','keeper fixture assets and controls must complete',50,400);report.keeperSessionFixture=true;
    }
    let natural=await snapshot();assert.equal(natural.role,role);assert.equal(natural.renderMetrics.assetStats.kind,'design-glb-v2');assert.ok(natural.renderMetrics.assetStats.clips.includes('throwIn'));assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
    await shot(role==='field'?'natural-playing':'keeper-fixture-playing');report.natural={elapsed:natural.elapsed,players:natural.players.length,assetKind:natural.renderMetrics.assetStats.kind};
    await page.evaluate(()=>{window.__soccerRestartEvents=[];const m=window.__island.games.current.session.debug.model,drain=m.drainEvents;m.drainEvents=function(){const e=drain.call(this);window.__soccerRestartEvents.push(...e);return e;};});
    const fixture=async kind=>page.evaluate(kind=>{
     const q=window.__island.games.current.session,m=q.debug.model,s=m.getState(),c=window.__island.data.config.minigames.soccer,hx=c.pitch.length/2,hz=c.pitch.width/2;m.clearInput();q.debug.poseCamera(null);
     Object.assign(s,{phase:'playing',phaseTime:0,attackDir:1,controlled:s.role==='keeper'?2:0,switchCooldown:100,passTarget:null,restart:null,charging:false,charge:0,chargeKind:null,mode:'attack'});
     for(const p of s.players)Object.assign(p,{x:(p.team?1:-1)*hx*.45,z:(p.id%3-1)*hz*.55,vx:0,vz:0,fx:p.team?-1:1,fz:0,cooldown:100,think:100,recover:0,slideTime:0,headerTime:0,kickTime:0,stealTime:0,throwTime:0,diveTime:0,catchTime:0,hands:false,hold:0,restartMotion:null,distribution:null});
     Object.assign(s.players[2],{x:-hx+2,z:0});Object.assign(s.players[5],{x:hx-2,z:0});
     if(kind==='throwIn')Object.assign(s.players[1],{x:3,z:hz-2});
     if(kind==='corner'){Object.assign(s.players[6],{x:hx-1,z:hz-2});Object.assign(s.players[0],{x:hx-8,z:hz*.4});}
     if(kind==='goalKick'){Object.assign(s.players[0],{x:-hx+13,z:0});Object.assign(s.players[1],{x:-hx+8,z:-7});}
     Object.assign(s.ball,{owner:null,x:kind==='corner'?hx-.05:kind==='goalKick'?-hx+.05:3,z:kind==='throwIn'?hz-.05:6,y:c.physics.ballRadius,vx:kind==='corner'?30:kind==='goalKick'?-30:0,vz:kind==='throwIn'?30:0,vy:0,curve:0,grace:100,lastTeam:1,lastPlayer:3,flight:null,shot:null,thrower:null});
     if(kind.startsWith('keeper')){const p=s.players[2];Object.assign(p,{cooldown:0,hands:true});Object.assign(s.ball,{owner:2,x:p.x+c.goalkeeping.holdForward,z:0,y:c.goalkeeping.holdHeight,vx:0,vz:0,vy:0,lastTeam:0,lastPlayer:2});}
     window.__soccerRestartEvents.length=0;
    },kind);
    for(const kind of role==='field'?['throwIn','corner','goalKick']:['keeperThrow','keeperPunt']){
     const profile=SOCCER_RESTART_SEQUENCES[kind];await fixture(kind);await page.clock.runFor(34);let s=await snapshot(),taker;
     if(role==='field'){assert.equal(s.restart?.type,kind);s=await until(s=>s.phase==='restartReady',`${kind} walk/organization must finish`);taker=s.restart.player;}else taker=2;
     const button=kind==='corner'||kind==='keeperPunt'?'#shoot':'#pass';await page.locator(button).focus();await page.keyboard.down('Space');await page.clock.runFor(34);await page.keyboard.up('Space');await page.clock.runFor(17);
     s=await until(s=>s.players[taker].restartMotion?.kind===kind&&(role==='keeper'?!!s.players[taker].distribution:!!s.restart?.action),`${kind} native button starts/resumes authored action`,17,60);
     assert.equal(s.ball.owner,taker);assert.equal(s.players[taker].restartMotion.contact,profile.contact);
     if(kind==='keeperPunt'){
      const hold=await advanceTo(taker,.3),binding=hold.renderMetrics.restartAttachment;assert.equal(binding?.kind,kind);assert.ok(Math.abs(binding.leftDistance-binding.radius)<.02&&Math.abs(binding.rightDistance-binding.radius)<.02);report.scenarios.push({kind,phase:'hand-hold-before-drop',binding});await shot(`${kind}-hand-hold`);
      const step=await page.evaluate(()=>window.__island.data.config.minigames.soccer.match.fixedStep),beforeDropTick=Math.floor((profile.drop-1e-7)/step)*step;
      const beforeDrop=await until(s=>s.players[taker].restartMotion.elapsed+1e-8>=beforeDropTick,'last fixed tick before hand drop',4,60);assert.equal(beforeDrop.renderMetrics.restartAttachment?.kind,kind);
      const afterDrop=await until(s=>s.players[taker].restartMotion.elapsed>profile.drop,'first fixed tick after hand drop',4,30);assert.equal(afterDrop.renderMetrics.restartAttachment,null);
      const a=beforeDrop.renderMetrics.ballPosition,b=afterDrop.renderMetrics.ballPosition,travel=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);assert.ok(travel<.08,`punt hand drop must not jump: ${travel}m`);
      report.scenarios.push({kind,phase:'hand-drop',before:a,after:b,travelMetres:travel,elapsedBefore:beforeDrop.players[taker].restartMotion.elapsed,elapsedAfter:afterDrop.players[taker].restartMotion.elapsed});
     }
     const fixedStep=await page.evaluate(()=>window.__island.data.config.minigames.soccer.match.fixedStep),lastBeforeContact=Math.floor((profile.contact-1e-7)/fixedStep)*fixedStep;
     await advanceTo(taker,lastBeforeContact-fixedStep);
     s=await until(s=>s.players[taker].restartMotion.elapsed+1e-8>=lastBeforeContact,'last fixed sample before authored contact',4,30);assert.ok(s.players[taker].restartMotion.elapsed<profile.contact);assert.equal(s.ball.owner,taker);assert.equal((await events()).filter(e=>physicalTypes.includes(e.type)&&e.player===taker).length,0);assert.equal(s.renderMetrics.poses[taker].clip,kind);
     if(kind==='throwIn'||kind==='keeperThrow'){
      const binding=s.renderMetrics.restartAttachment;assert.equal(binding?.kind,kind);assert.ok(Math.abs(binding.rightDistance-binding.radius)<.02);if(kind==='throwIn')assert.ok(Math.abs(binding.leftDistance-binding.radius)<.02);
     }else{const strike=s.renderMetrics.restartStrike;assert.equal(strike?.kind,kind);assert.ok(strike.footDistance<=strike.radius+.1,`${kind} actual toe distance ${strike.footDistance}`);}
     await shot(`${kind}-fixture-native`);await page.evaluate(id=>{const q=window.__island.games.current.session;q.debug.poseCamera(id);q.debug.view.render(q.debug.model.renderState(),0);},taker);await shot(`${kind}-fixture-close`);
     const before=s.renderMetrics.ballPosition,contact=await until(s=>s.ball.owner!==taker,`${kind} physically releases at contact`,17,120);assert.ok(contact.players[taker].restartMotion.elapsed+1e-8>=profile.contact);
     const physical=(await events()).filter(e=>physicalTypes.includes(e.type)&&e.player===taker);assert.equal(physical.length,1);await page.clock.runFor(100);assert.equal((await events()).filter(e=>physicalTypes.includes(e.type)&&e.player===taker).length,1);
     const after=contact.renderMetrics.ballPosition,travel=Math.hypot(after.x-before.x,after.y-before.y,after.z-before.z);assert.ok(travel<(kind==='keeperPunt'?.45:.12),`${kind} release cannot teleport the visible ball: ${travel}m`);
     report.scenarios.push({kind,fixture:true,sourceClips:profile.clips,taker,clip:s.renderMetrics.poses[taker].clip,elapsedBefore:s.players[taker].restartMotion.elapsed,contact:profile.contact,ownerBefore:s.ball.owner,binding:s.renderMetrics.restartAttachment,strike:s.renderMetrics.restartStrike,visibleBallBefore:before,visibleBallAfter:after,releaseTravelMetres:travel,event:physical[0],nativeCamera:true,screenshotClockFrozen:true});
    }
    for(const name of ['throws-receives.json','kicks-locomotion.json','tackles-reactions.json'])assert.equal(resources[name],200,`new authored package loaded: ${name}`);
    assert.deepEqual(errors,[]);await audit.assertClean();report.resources=resources;report.errors=errors;report.csp=audit.snapshot();
   }catch(error){report.error=String(error);report.errors=errors;report.csp=audit.snapshot();report.snapshot=await snapshot().catch(()=>null);await page.screenshot({path:path.join(output,`${tag}-${role}-failure.png`)}).catch(()=>{});throw error;}
   finally{await writeFile(path.join(output,`${tag}-${role}-report.json`),JSON.stringify(report,null,2));await context.close();await audit.dispose();}
  });
 }finally{await writeFile(path.join(output,'soccer-motion2-browser.json'),JSON.stringify(reports,null,2));await browser.close();await server.close();}
});
