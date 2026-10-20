import {verify} from './night-browser.mjs';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('../verification/g3j/',import.meta.url));
await verify('g3j',[{width:844,height:390},{width:740,height:360}],async({page,viewport,tick,snap,tap,start,exit,assert})=>{
 // Observe actual scheduled AudioBufferSourceNodes, beyond requested cue counts.
 await page.evaluate(()=>{
  window.__g3jVoices=[];const original=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(at,...args){window.__g3jVoices.push({at,duration:this.buffer?.duration,loop:this.loop});return original.call(this,at,...args);};
 });
 await start('soccer');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics.assetStatus==='ready');
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.audio.loaded.length===4);await tick(100);
 const c=await page.evaluate(()=>window.__island.data.config.minigames.soccer),proof={};
 const capture=async(name,width=844)=>{if(viewport.width===width)await page.screenshot({path:directory+name+'.png'});};
 const scenario=async()=>{
  for(const key of ['Space','KeyX','ArrowRight','ArrowUp'])await page.keyboard.up(key);
  await page.evaluate(()=>{const q=window.__island.games.current.session,m=q.debug.model,s=m.getState(),c=window.__island.data.config.minigames.soccer;m.clearInput();m.drainEvents();q.setPaused(false);q.debug.poseCamera(null);
   Object.assign(s,{phase:'playing',phaseTime:0,half:1,halfElapsed:12,elapsed:12,score:[0,0],controlled:0,attackDir:1,passTarget:null,restart:null,event:null,mode:'attack',switchCooldown:0});
   for(const p of s.players)Object.assign(p,{x:p.team?12:-12,z:p.id%2?8:-8,vx:0,vz:0,recover:0,cooldown:100,think:100,kickTime:0,slideTime:0,stealTime:0,headerTime:0,autoHeadTime:0,diveTime:0,throwTime:0,catchTime:0,hands:false,fx:p.team?-1:1,fz:0});
   Object.assign(s.players[0],{x:2,z:0,recover:0,cooldown:0});Object.assign(s.players[1],{x:14,z:0,recover:0,cooldown:0});
   Object.assign(s.ball,{owner:0,x:2+c.physics.dribbleOffset,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,grace:100,lastPlayer:0,lastTeam:0,flight:null,thrower:null,curve:0});
  });await tick(32);
 };
 const press=async(id,pointerId)=>{const node=page.locator(id),b=await node.boundingBox(),point={pointerId,button:0,clientX:b.x+b.width/2,clientY:b.y+b.height/2};await node.dispatchEvent('pointerdown',point);return async()=>node.dispatchEvent('pointerup',point);};
 // Real phone pass button, held and released: no synthetic loft event.
 await scenario();let release=await press('#pass',31);await tick(450);let s=await snap();assert.equal(s.chargeKind,'pass');assert.equal(s.renderMetrics.arcDots,25);assert.ok(s.renderMetrics.landingVisible);await capture('01-cross-arc');
 await release();await tick(16);s=await snap();assert.ok(s.ball.flight);assert.equal(s.controlled,s.passTarget.player);proof.cross={receiver:s.controlled,endpoint:{x:s.ball.flight.x,z:s.ball.flight.z},dots:s.renderMetrics.arcDots};
 let heading=false;for(let i=0;i<100;i++){await tick(16);if(await page.locator('#shoot svg').getAttribute('data-soccer-icon')==='header'){heading=true;break;}}
 assert.ok(heading,'A real cross must present the head button before automatic contact');await capture('02-head-button');
 release=await press('#shoot',32);await tick(16);await release();s=await snap();assert.equal(s.event.type,'header');assert.ok(s.players[s.controlled].headerTime>0);assert.ok(s.ball.vx>0);proof.header={player:s.controlled,icon:'header',vx:s.ball.vx};
 // Same cross with no action must be headed by its receiver in the box.
 await scenario();release=await press('#pass',33);await tick(450);await release();await tick(16);let auto=false;
 for(let i=0;i<110;i++){await tick(16);s=await snap();if(s.event?.type==='header'){auto=true;break;}}assert.ok(auto);proof.autoHeader=true;
 // Goal kick: visually inspect both the small-area line and the exit side.
 await scenario();await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();Object.assign(s.ball,{owner:null,x:-17.95,z:6,y:.22,vx:-30,vz:0,vy:0,lastTeam:1});});await tick(520);s=await snap();assert.equal(s.restart.type,'goalKick');assert.equal(s.restart.x,-c.pitch.length/2+c.pitch.goalAreaDepth);assert.equal(s.restart.z,c.pitch.goalAreaWidth/2);await capture('03-goal-kick-five');proof.goalKick={x:s.ball.x,z:s.ball.z,taker:s.restart.player};
 // Two consecutive images demonstrate movement during the same throw-in.
 await scenario();await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();for(const p of s.players){p.recover=0;p.cooldown=0;}Object.assign(s.players[0],{x:0,z:6});Object.assign(s.players[1],{x:2,z:9});Object.assign(s.ball,{owner:null,x:2,z:10.95,y:.22,vx:0,vz:30,vy:0,lastTeam:1});});await tick(32);const before=await snap();assert.equal(before.restart.type,'throwIn');await capture('04-throw-in-before');
 const zone=page.locator('.soccer-stick-zone'),box=await zone.boundingBox(),point={pointerId:40,button:0,clientX:box.x+box.width*.5,clientY:box.y+box.height*.7};await zone.dispatchEvent('pointerdown',point);await zone.dispatchEvent('pointermove',{...point,clientX:point.clientX+35});await tick(550);const after=await snap();await capture('05-throw-in-moving');await zone.dispatchEvent('pointerup',point);
 assert.ok(after.phase.startsWith('restart'));assert.equal(after.elapsed,before.elapsed);assert.ok(after.players[after.controlled].x>before.players[after.controlled].x+.1);
 const moving=after.players.filter(p=>Math.hypot(p.x-before.players[p.id].x,p.z-before.players[p.id].z)>.1).map(p=>p.id);assert.ok(moving.length>=5);proof.throwIn={moving,controlled:after.controlled,deltaX:after.players[after.controlled].x-before.players[after.controlled].x};
 await tick(1300);assert.equal((await snap()).phase,'playing');
 // Automatic closest defender excludes even a goalkeeper directly on the ball.
 await scenario();await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();for(const p of s.players)p.recover=100;Object.assign(s.players[0],{x:-8,z:0});Object.assign(s.players[1],{x:-3,z:0});Object.assign(s.players[6],{x:-5,z:0});Object.assign(s.players[2],{x:0,z:0});Object.assign(s.ball,{owner:3,x:0,z:0,lastTeam:1});});await tick(550);assert.equal((await snap()).controlled,1);await tap('#soccer-switch');await tick(32);assert.equal((await snap()).controlled,6);await tick(900);assert.equal((await snap()).controlled,6);proof.switching={automatic:1,manual:6,excludesKeeper:true,stableMs:900};
 await scenario();release=await press('#pass',34);await tick(32);await release();await tick(16);s=await snap();assert.equal(s.controlled,s.event.target);assert.equal(s.ball.owner,null);proof.groundPassImmediate=true;
 // A real boundary-crossing goal produces sound sources and the scorer's pose.
 await scenario();const previous=(await snap()).audio.counts,voiceCount=await page.evaluate(()=>window.__g3jVoices.length);await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();Object.assign(s.players[0],{x:16,z:0});Object.assign(s.ball,{owner:null,x:17.95,z:0,y:.22,vx:30,vz:0,vy:0,lastPlayer:0,lastTeam:0});});await tick(640);s=await snap();assert.equal(s.phase,'goal');assert.equal(s.audio.contextState,'running');assert.deepEqual(s.score,[1,0]);for(const cue of ['whistle','net','cheer'])assert.equal(s.audio.counts[cue],(previous[cue]||0)+1);assert.equal(s.renderMetrics.animations[0],'celebrate');await capture('06-goal-celebration',740);
 const voices=await page.evaluate(count=>window.__g3jVoices.slice(count),voiceCount);assert.ok(voices.length>=3);assert.ok(voices.some(v=>v.duration>.27&&v.duration<.29));proof.goal={contextState:s.audio.contextState,counts:s.audio.counts,voices,animation:s.renderMetrics.animations[0]};
 for(const button of await page.locator('.soccer-actions button').all()){const b=await button.boundingBox();assert.ok(b.width>=48&&b.height>=48&&b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width&&b.y+b.height<=viewport.height);}
 assert.ok(s.renderMetrics.triangles<=130000&&s.renderMetrics.drawCalls<=90);proof.budget={triangles:s.renderMetrics.triangles,drawCalls:s.renderMetrics.drawCalls};
 const text=await page.locator('.game-screen').evaluate(n=>{const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT),out=[];while(w.nextNode()){const t=w.currentNode;if(!/[א-תa-z]/i.test(t.textContent))continue;const r=document.createRange();r.selectNodeContents(t);if(r.getBoundingClientRect().width&&getComputedStyle(t.parentElement).visibility!=='hidden')out.push(t.textContent.trim());}return out;});assert.deepEqual(text,[]);proof.noLiveText=true;
 await exit();return proof;
});
