import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium} from './helpers/island-browser.mjs';
import {waitForGameStart} from '../workout/island/tests/shell-ready.mjs';

const enabled=process.env.ISLAND_SOCCER_BROWSER==='1';
const index=await readFile(new URL('../workout/island/index.html',import.meta.url),'utf8');
const nativeCSP=index.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
const output=process.env.SOCCER_RESTART_SCREENSHOT_DIR||process.env.SOCCER_SCREENSHOT_DIR?path.resolve(process.env.SOCCER_RESTART_SCREENSHOT_DIR||process.env.SOCCER_SCREENSHOT_DIR):fileURLToPath(new URL('../../../outputs/gameplay-20261031/restarts-browser/',import.meta.url));
const executablePath=process.env.ISLAND_CHROME||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);

test('soccer native restart actions and authored poses under the exact index CSP in both phone orientations',{skip:!enabled,timeout:600000},async t=>{
 assert.ok(nativeCSP?.includes("script-src 'self'"));
 const server=await serveIsland('/workout/island/'),reports=[];let browser;
 try{
  browser=await(await islandChromium()).launch({executablePath,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});await mkdir(output,{recursive:true});
  for(const viewport of [{width:844,height:390},{width:390,height:844}])for(const role of ['field','keeper'])await t.test(`${viewport.width}x${viewport.height} ${role}`,async()=>{
   const tag=`${viewport.width}x${viewport.height}`,context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[],report={viewport,role,csp:nativeCSP,scenarios:[]};reports.push(report);
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   const snapshot=()=>page.evaluate(()=>window.__island.games.current.session.snapshot);
   const events=()=>page.evaluate(()=>window.__restartsEvents);
   const shot=async suffix=>{const before=await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();return JSON.stringify({elapsed:s.elapsed,restart:s.restart,players:s.players,ball:s.ball});});await page.screenshot({path:path.join(output,`${tag}-${suffix}.png`)});assert.equal(await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();return JSON.stringify({elapsed:s.elapsed,restart:s.restart,players:s.players,ball:s.ball});}),before,'a screenshot cannot advance the paused test clock');};
   const until=async(predicate,label,ms=100,attempts=130)=>{for(let i=0;i<attempts;i++){const s=await snapshot();if(predicate(s))return s;await page.clock.runFor(ms);}assert.fail(label);};
   const tapButton=async selector=>{await page.locator(selector).focus();await page.keyboard.down('Space');await page.clock.runFor(34);await page.keyboard.up('Space');await page.clock.runFor(17);};
   try{
    await page.clock.install();await page.addInitScript(()=>{window.__restartCSP=[];document.addEventListener('securitypolicyviolation',e=>window.__restartCSP.push({directive:e.effectiveDirective,blocked:e.blockedURI}));});
    await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
    assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),nativeCSP);
    await page.evaluate(()=>{window.__restartInlineRan=false;const s=document.createElement('script');s.textContent='window.__restartInlineRan=true';document.head.append(s);s.remove();});await page.clock.runFor(32);
    const probe=await page.evaluate(()=>({ran:window.__restartInlineRan,violations:window.__restartCSP}));assert.equal(probe.ran,false);assert.ok(probe.violations.some(v=>v.blocked==='inline'&&v.directive==='script-src-elem'));
    assert.ok(errors.every(e=>/inline script.*Content Security Policy|Content Security Policy.*inline script/i.test(e)),errors.join('\n'));errors.length=0;await page.evaluate(()=>{window.__restartCSP.length=0;});
    await page.evaluate(role=>{const {engine:e,ui,games}=window.__island;e.setAvatar({name:'בדיקת כדורגל',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer')){e.enableReadyBuilding();const lot=e.readyPlotForType('soccer');if(!lot.ok)throw Error(JSON.stringify(lot));e.buildReadyPlot(lot.id);}e.setSoccerDifficulty('normal');if(!e.setSoccerRole(role).ok)throw Error('could not configure soccer role before launch');e.save();ui.closeModal();games.menu();},role);
    await page.locator('[data-action="game-enter"][data-game-id="soccer"]').click();await page.locator('[data-action="game-play"]').click();await page.locator('[data-stage="1"]').click();
    if(await page.locator('[data-action="game-understood"]').count()){await page.clock.runFor(32);await page.locator('[data-action="game-understood"]').click();}
    await waitForGameStart(page);await page.waitForLoadState('networkidle');await page.clock.runFor(1200);await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.renderMetrics?.assetStatus==='ready');
    // Pause before scenario setup, leaving headroom for a busy software-GPU CI
    // host to deliver the command. Scenario time is advanced explicitly below.
    await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+10000));
    if(role==='keeper'&&(await snapshot()).role!=='keeper'){
     // The league intentionally exposes field play only. Exercise the existing
     // keeper session explicitly on the same native shell/controls, under its
     // unchanged CSP. This is labeled as a session fixture, not a league option.
     await page.evaluate(async()=>{
      const {engine,games}=window.__island,{startSoccer}=await import(new URL('./minigames/soccer-session.mjs',location.href));
      const dialog=document.querySelector('.game-screen'),oldCanvas=dialog.querySelector('canvas'),canvas=oldCanvas.cloneNode(false),controls=dialog.querySelector('.game-controls'),status=dialog.querySelector('.game-status');
      games.current.session.dispose();oldCanvas.replaceWith(canvas);canvas.width=innerWidth;canvas.height=innerHeight;controls.replaceChildren();
      for(const node of dialog.querySelectorAll('.soccer-scoreboard,.soccer-goal-banner,.soccer-phase-banner,.soccer-loading,.soccer-fixture,.soccer-action-feedback,.soccer-edge-arrow'))node.remove();
      const session=startSoccer({engine,state:engine.state,balance:engine.data.config.minigames.soccer,canvas,controls,status,t:games.t,role:'keeper',soccerCard:engine.state.soccerCard,difficulty:'normal',level:1,seed:57,finish(){},cancel(){},onError(id){throw Error(id);}});
      games.current.session=session;games.shell.bind(session);
     });
     await page.waitForLoadState('networkidle');await page.clock.runFor(200);await until(s=>s.renderMetrics?.assetStatus==='ready','native keeper fixture assets must finish',50,100);report.keeperSessionFixture=true;
    }
    const natural=await snapshot();assert.equal(natural.role,role);assert.equal(natural.renderMetrics.assetStats.kind,'athlete');assert.ok(natural.renderMetrics.assetStats.clips.includes('restart-throwIn'));assert.equal(await page.locator('html').getAttribute('dir'),'rtl');assert.notEqual(await page.locator('.game-screen').getAttribute('data-orientation-blocked'),'true');
    await shot(role==='field'?'natural-playing':'keeper-session-fixture-playing');report.natural={phase:natural.phase,elapsed:natural.elapsed,positions:natural.players.map(p=>({id:p.id,x:p.x,z:p.z,duty:p.duty,recover:p.recover})),fixture:role==='keeper'};
    await page.evaluate(()=>{window.__restartsEvents=[];const m=window.__island.games.current.session.debug.model,drain=m.drainEvents;m.drainEvents=function(){const e=drain.call(this);window.__restartsEvents.push(...e);return e;};});
    const fixture=async(type)=>page.evaluate(type=>{
     const q=window.__island.games.current.session,m=q.debug.model,s=m.getState(),c=window.__island.data.config.minigames.soccer,hx=c.pitch.length/2,hz=c.pitch.width/2;
     m.clearInput();q.debug.poseCamera(null);Object.assign(s,{phase:'playing',phaseTime:0,attackDir:1,controlled:s.role==='keeper'?2:0,switchCooldown:100,passTarget:null,restart:null,charging:false,charge:0,chargeKind:null,mode:'attack'});
     const positions=type==='corner'?[[14,7],[10,-4],[-16,0],[15,2],[13,-4],[16,0],[9,7],[15,6]]:type==='goalKick'?[[-3,0],[-9,-6],[-16,0],[0,2],[3,-5],[16,0],[-7,7],[2,7]]:[[2,6],[2,3],[-16,0],[7,2],[5,-6],[16,0],[0,-6],[8,6]];
     for(const p of s.players)Object.assign(p,{x:positions[p.id][0],z:positions[p.id][1],shapeX:positions[p.id][0],shapeZ:positions[p.id][1],vx:0,vz:0,fx:p.team?-1:1,fz:0,cooldown:100,think:100,recover:0,slideTime:0,headerTime:0,kickTime:0,stealTime:0,throwTime:0,diveTime:0,catchTime:0,hands:false,restartMotion:null,distribution:null});
     Object.assign(s.ball,{owner:null,x:type==='corner'?hx-.05:type==='goalKick'?-hx+.05:3,z:type==='throwIn'?hz-.05:6,y:c.physics.ballRadius,vx:type==='corner'?30:type==='goalKick'?-30:0,vz:type==='throwIn'?30:0,vy:0,curve:0,grace:0,lastTeam:1,lastPlayer:3,flight:null,shot:null,thrower:null});
     if(type==='keeperThrow'||type==='keeperPunt'){const p=s.players[2];Object.assign(p,{x:-15,z:0,shapeX:-15,shapeZ:0,cooldown:0,hands:true,hold:0});Object.assign(s.ball,{owner:2,x:-15+c.goalkeeping.holdForward,z:0,y:c.goalkeeping.holdHeight,vx:0,vz:0,vy:0,lastTeam:0,lastPlayer:2});}
     window.__restartsEvents.length=0;
    },type);
    for(const kind of role==='field'?['throwIn','corner','goalKick']:['keeperThrow','keeperPunt']){
     await fixture(kind);await page.clock.runFor(50);let s=await snapshot(),taker;
     if(role==='field'){
      assert.equal(s.restart?.type,kind);await until(s=>s.phase==='restartReady',`${kind} preparation must complete`);s=await snapshot();taker=s.restart.player;
      if(s.restart.age<.55)await page.clock.runFor(Math.ceil((.55-s.restart.age)*1000));
     }else taker=2;
     await tapButton(kind==='corner'||kind==='keeperPunt'?'#shoot':'#pass');
     s=await until(s=>s.players[taker].restartMotion?.kind===kind,`${kind} UI release must start authored wind-up`,17,25);assert.equal(s.ball.owner,taker,'physical ball remains held until authored contact');
     const target=kind==='throwIn'?.23:kind==='corner'?.12:.23,current=s.players[taker].restartMotion.elapsed;if(target>current)await page.clock.runFor(Math.floor((target-current)*1000));s=await snapshot();
     assert.ok(s.players[taker].restartMotion.elapsed<s.players[taker].restartMotion.contact);assert.equal(s.ball.owner,taker);assert.equal((await events()).filter(e=>['throw','pass','loft','shot'].includes(e.type)&&e.player===taker).length,0);
     assert.equal(s.renderMetrics.poses[taker].clip,'restart-'+kind,'the displayed rig consumes the authoritative restart clock');
     await shot(`${kind}-fixture-native`);
     await page.evaluate(id=>{const q=window.__island.games.current.session;q.debug.poseCamera(id);q.debug.view.render(q.debug.model.renderState(),0);},taker);await shot(`${kind}-fixture-close`);
     const atContact=await until(s=>!s.players[taker].distribution&&(role==='field'?!s.restart:s.ball.owner!==taker),`${kind} must physically release once`,17,50);
     const physical=(await events()).filter(e=>['throw','pass','loft','shot'].includes(e.type)&&e.player===taker);assert.equal(physical.length,1);assert.ok(atContact.players[taker].restartMotion.elapsed+1e-8>=atContact.players[taker].restartMotion.contact);await page.clock.runFor(100);assert.equal((await events()).filter(e=>['throw','pass','loft','shot'].includes(e.type)&&e.player===taker).length,1);
     report.scenarios.push({kind,fixture:true,taker,clip:s.renderMetrics.poses[taker].clip,windupElapsed:s.players[taker].restartMotion.elapsed,contact:s.players[taker].restartMotion.contact,ownerBeforeContact:s.ball.owner,physicalEvent:physical[0],nativeCamera:true,closeCamera:'existing poseCamera debug focus',screenshotClockFrozen:true});
    }
    report.inlineProbeBlocked=true;report.violations=await page.evaluate(()=>window.__restartCSP);report.errors=errors;assert.deepEqual(report.violations,[]);assert.deepEqual(errors,[]);
   }catch(error){report.error=String(error);report.errors=errors;report.snapshot=await snapshot().catch(()=>null);await page.screenshot({path:path.join(output,`${tag}-${role}-failure.png`)}).catch(()=>{});throw error;}
   finally{await writeFile(path.join(output,`${tag}-${role}-report.json`),JSON.stringify(report,null,2));await context.close();}
  });
 }finally{await writeFile(path.join(output,'soccer-restarts-browser.json'),JSON.stringify(reports,null,2));await browser?.close();await server.close();}
});
