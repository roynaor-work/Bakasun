import {verify} from './night-browser.mjs';
import {mkdir,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('../verification/g4e/',import.meta.url));await mkdir(directory,{recursive:true});
await verify('g4e',[{width:844,height:390},{width:740,height:360},{width:1440,height:1000}],async({page,viewport,tick,snap:readSnap,tap,start,exit,assert})=>{
 const peak={triangles:0,drawCalls:0},captures=[];
 const snap=async()=>{const s=await readSnap(),m=s?.renderMetrics;if(m&&m.mode!=='canvas'){peak.triangles=Math.max(peak.triangles,m.triangles);peak.drawCalls=Math.max(peak.drawCalls,m.drawCalls);assert.ok(m.triangles<=90000&&m.drawCalls<=70,JSON.stringify(m));}return s;};
 const capture=async name=>{if(viewport.width!==844)return;await page.screenshot({path:directory+name+'.png'});captures.push(name+'.png');};
 const camera=async(position,target)=>{await page.evaluate(({position,target})=>window.__island.games.current.session.debug.inspectCamera(position,target),{position,target});await tick(32);};
 const pause=async value=>page.evaluate(value=>window.__island.games.current.session.setPaused(value),value);
 // Keep quality adaptation deterministic under SwiftShader; explicitly exercise
 // both quality transitions below instead of treating its timings as phone FPS.
 await page.evaluate(()=>window.__island.data.config.minigames.tennis.render.slowFrameMs=10000);
 await start('tennis');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.characterLoaded);await tick(50);
 const initial=await snap(),metrics=initial.renderMetrics,balance=await page.evaluate(()=>window.__island.data.config.minigames.tennis);
 assert.deepEqual(metrics.missingModels,[]);assert.deepEqual(metrics.loadedModels,balance.environment.models.map(p=>p.split('/').at(-1)).sort());assert.equal(metrics.crowd,144);assert.deepEqual(metrics.crowdSides,[36,36,36,36]);assert.equal(metrics.fullCrowd,4);assert.equal(metrics.spriteCrowd,140);assert.deepEqual(metrics.crowdTrianglesPerModel,[5170,5224]);assert.ok(metrics.umpire&&metrics.atlasFromFullModels);
 for(const button of await page.locator('.soccer-actions button').all()){assert.equal(await button.innerText(),'');const b=await button.boundingBox();assert.ok(b.width>=48&&b.height>=48&&b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width&&b.y+b.height<=viewport.height);}
 await tick(2000);const idle=await snap();assert.deepEqual(idle.players[0],initial.players[0]);assert.deepEqual(idle.renderMetrics.rig[0].legs,initial.renderMetrics.rig[0].legs);await capture('01-court-crowd-idle');
 await camera([10,3.6,15],[12,2.1,9]);await capture('02-palm');
 await camera([-2,3.8,3],[-5.15,2.6,0]);await capture('04-umpire');
 await camera([0,4.4,20],[0,2,-7]);await capture('05-horizon');
 await camera(balance.render.cameraLandscape,balance.render.cameraTarget);
 for(const id of ['shoot','sprint']){await tap('#'+id);await tick(32);assert.equal((await snap()).phase,'serve');}
 await tap('#pass');await tick(32);assert.equal((await snap()).phase,'toss');
 const meterCycles=[];
 for(let cycle=0;cycle<3;cycle++){
  await tick(balance.serve.tossSeconds*350);const up=await snap();assert.equal(up.serveMeterDirection,1);assert.equal(up.phase,'toss');
  if(cycle===0){await camera([5,3.5,3],[1.65,1.7,9.7]);await capture('11-serve-toss-meter-up');}
  await tick(balance.serve.tossSeconds*1000);const down=await snap();assert.equal(down.serveMeterDirection,-1);assert.equal(down.phase,'toss');
  if(cycle===0)await capture('13-meter-down');
  await tick(balance.serve.tossSeconds*650);meterCycles.push({up:up.serveMeter,down:down.serveMeter});
 }
 assert.deepEqual((await snap()).score.points,[0,0]);assert.equal((await snap()).faults,0);
 // Use the real serve control at green, then freeze the contact keyframe.
 for(let i=0;i<300&&(await snap()).serveZone!=='green';i++)await tick(8);
 await pause(true);await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.update(0,{serve:true});m.update(0,{});});await tick(32);
 const serve=await snap();assert.equal(serve.phase,'rally');assert.equal(serve.shot.serveZone,'green');assert.ok(serve.ball.vy<0);assert.ok(serve.renderMetrics.rig[0].contactDistance<balance.animation.exactContactTolerance);assert.ok(serve.renderMetrics.rig[0].racketHead[1]>3);await capture('12-serve-strike');
 await pause(false);await camera(balance.render.cameraLandscape,balance.render.cameraTarget);console.log('g4e meter/serve verified',viewport);
 // Isolate movement, then drive the real floating stick through both axes.
 await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();s.phase='rally';s.contact={side:0,x:-4,z:2,at:s.elapsed+20};s.landing=null;Object.assign(s.ball,{x:-4,z:2,y:500,vx:0,vy:0,vz:1});});
 console.log('g4e movement start',viewport);const stationary=await snap();await tick(2000);const still=(await snap()).players[0];assert.equal(still.x,stationary.players[0].x);assert.equal(still.z,stationary.players[0].z);assert.equal(still.running,false);
 console.log('g4e stationary verified',viewport);const zone=await page.locator('.soccer-stick-zone').boundingBox(),sx=zone.x+90,sy=zone.y+zone.height-85;
 await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx,sy-48);await tick(3000);await page.mouse.up();await tick(60);const net=await snap();assert.ok(net.players[0].z<1);
 await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx,sy+48);await tick(3200);await page.mouse.up();await tick(60);const baseline=await snap();assert.ok(baseline.players[0].z>=balance.court.halfLength);
 await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx+48,sy);await tick(700);await page.mouse.up();await tick(60);const lateral=await snap();assert.ok(lateral.players[0].x>baseline.players[0].x+.5);
 console.log('g4e movement verified',viewport);async function incoming(backhand=false){await page.evaluate(backhand=>{const s=window.__island.games.current.session.debug.model.getState();s.phase='rally';s.phaseTime=0;s.shot={serving:false,side:1};s.players[0].x=0;s.players[0].z=6;s.players[0].vx=s.players[0].vz=0;s.players[0].swing=0;s.players[0].running=false;s.players[0].serving=false;s.players[0].lob=false;s.players[0].preparing=false;s.players[0].contactPoint=null;s.players[0].stroke=backhand?'backhand':'forehand';Object.assign(s.ball,{x:backhand?.5:-.5,z:5.55,y:.85,vx:0,vy:0,vz:0,bounces:1,lastHitter:1});s.contact={side:0,x:s.ball.x,z:5.55,at:s.elapsed,eta:0};},backhand);}
 // Prepared fixtures keep the real hit physics, bone IK, planted-foot pose and
 // renderer. Pausing only makes the exact phases repeatable for screenshots.
 await pause(true);await camera([4,3,0],[0,1.4,6]);const exactContacts=[],strokes=[];
 for(const [backhand,lob]of [[false,false],[true,false],[false,true]]){
  await incoming(backhand);
  await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.update(.25,{prepare:true});const s=m.getState();s.contact.at=s.elapsed;m.update(.1,{prepare:true});s.contact.at=s.elapsed;});await tick(32);const prep=await snap();
  if(!lob)await capture(backhand?'09-backhand-prepare':'06-forehand-prepare');
  await page.evaluate(lob=>{const m=window.__island.games.current.session.debug.model,s=m.getState();s.ball.y=.85;s.contact.at=s.elapsed;m.update(0,{});m.update(0,{swing:true,lob});m.update(0,{});},lob);await tick(32);
  const contact=await snap(),rig=contact.renderMetrics.rig[0];assert.equal(contact.shot.side,0);assert.equal(contact.players[0].stroke,backhand?'backhand':'forehand');assert.equal(contact.shot.lob,lob);assert.ok(rig.contactWeight>.99&&rig.contactDistance<balance.animation.exactContactTolerance,JSON.stringify(rig));assert.deepEqual(rig.hips,initial.renderMetrics.rig[0].hips);assert.ok(rig.step>0);exactContacts.push({backhand,lob,distance:rig.contactDistance});
  if(!backhand&&!lob)await capture('07-forehand-contact');
  await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.update(.25);});await tick(32);const follow=await snap();assert.notDeepEqual(prep.renderMetrics.rig[0].rightArm,follow.renderMetrics.rig[0].rightArm);assert.deepEqual(follow.renderMetrics.rig[0].hips,initial.renderMetrics.rig[0].hips);
  if(!lob)await capture(backhand?'10-backhand-follow':'08-forehand-follow');strokes.push({prep:prep.renderMetrics.rig[0],contact:rig,follow:follow.renderMetrics.rig[0],shot:contact.shot});
 }
 assert.ok(strokes[2].shot.flight>strokes[0].shot.flight);
 // A physical out serve retains the actual ground mark through the first retry.
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,s=m.getState();s.phase='rally';s.shot={serving:true,side:0};s.server=0;s.faults=0;s.contact=null;s.ball.lastHitter=0;Object.assign(s.ball,{x:-2,z:-6,y:.131,vx:0,vy:-1,vz:0,bounces:0});m.update(1/120);});await camera([0,6,-11],[-2,0,-6]);const fault=await snap();assert.equal(fault.faults,1);assert.deepEqual(fault.faultMark,{x:-2,z:-6,reason:'out'});await capture('14-fault-landing');
 // Award an actual point from a second bounce to activate all audience animation.
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,s=m.getState();s.phase='rally';s.shot={serving:false,side:0};s.contact=null;Object.assign(s.ball,{x:0,z:-4,y:.13,vx:0,vy:-1,vz:0,bounces:1,lastHitter:0});m.update(1/120);});await pause(false);await camera([-5.4,2.8,3],[-8,1,-.6]);await tick(100);await pause(true);const applause=await snap();assert.equal(applause.renderMetrics.applauding,true);await capture('03-crowd-applause');
 // Audio uses real Ogg buffers, responds to the common switch, and pauses.
 await pause(false);await tap('#pass');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.audioMetrics.loaded.length===4);await tick(32);const audio=await snap();assert.deepEqual(audio.audioMetrics.loaded,['applause','bounce','hit','net']);
 await page.evaluate(()=>localStorage.setItem('island.sound','off'));await tick(32);assert.equal((await snap()).audioMetrics.muted,true);await page.evaluate(()=>localStorage.setItem('island.sound','on'));await tick(32);assert.equal((await snap()).audioMetrics.muted,false);
 await camera(balance.render.cameraLandscape,balance.render.cameraTarget);await incoming();
 const held=await page.locator('#shoot').boundingBox();await page.mouse.move(held.x+held.width/2,held.y+held.height/2);await page.mouse.down();await tick(64);await tap('[data-action=game-pause]');const paused=await snap();await tick(500);assert.equal((await snap()).elapsed,paused.elapsed);assert.equal((await snap()).audioMetrics.paused,true);await page.mouse.up();await tap('[data-action=game-resume]');await tick(32);assert.equal((await snap()).shot.side,1);
 // Explicit slow samples exceed the test-only 10000ms threshold copied by the view.
 await page.evaluate(()=>{const {session}=window.__island.games.current,c=window.__island.data.config.minigames.tennis.render;c.slowFrameMs=25;for(let i=0;i<c.slowSamples;i++)session.debug.qualitySample(10050);});await tick(32);const low=(await snap()).renderMetrics;assert.equal(low.quality,1);assert.ok(low.triangles<metrics.triangles&&low.crowd>=120&&low.fullCrowd===0);
 await page.evaluate(()=>{const {session}=window.__island.games.current,c=window.__island.data.config.minigames.tennis.render;for(let i=0;i<c.slowSamples;i++)session.debug.qualitySample(10050);});await tick(32);assert.equal((await snap()).renderMetrics.mode,'canvas');await exit();
 return {metrics,low,peak,exactContacts,meterCycles,captures,serveShot:serve.shot,faultMark:fault.faultMark,movement:{net:net.players[0],baseline:baseline.players[0],lateral:lateral.players[0]},checks:{idleLegs:true,noAutonomousMovement:true,cyclingMeter:true,fullModelsAndBakedSprites:true,fourSides:true,umpire:true,plantedFoot:true,hipsFaceNet:true,applause:true,audio:true,pause:true,qualityReduction:true,fallback:true},strokes};
});

// Keep the requested screenshot directory at exactly fourteen image files.
const resultFile=process.env.G4E_WIDTH?`${Number(process.env.G4E_WIDTH)}-verification.json`:'verification.json';
await rename(directory+resultFile,fileURLToPath(new URL('../notes/g4e-browser-results.json',import.meta.url)));
