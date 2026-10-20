import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTennis} from '../workout/island/minigames/tennis.mjs';
import {synthesizeApplause} from '../workout/island/assets/audio/g4e/applause-source.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames.tennis,dt=config.simulation.step;
const advance=(m,t,input={})=>{for(let n=0;n<Math.round(t/dt);n++)m.update(dt,input);};
const press=(m,key,input={})=>{m.update(0,{...input,[key]:true});m.update(0,{});};
function incoming(difficulty='normal',z=6){const m=createTennis({config,difficulty}),s=m.getState();s.phase='rally';s.shot={serving:false,side:1};s.players[0].x=0;s.players[0].z=z;s.contact={side:0,at:0};Object.assign(s.ball,{x:0,z,y:config.ball.hitHeight,lastHitter:1,bounces:1});return m;}
function charge(m,value,extra={}){const s=m.getState();s.ball.y=500;advance(m,value*config.player.chargeSeconds,{prepare:true,...extra});s.ball.y=config.ball.hitHeight;s.ball.vy=0;s.contact.at=s.elapsed;}
function landing(m){const s=m.getState();for(let n=0;n<600&&s.phase==='rally'&&s.ball.bounces===0;n++)m.update(dt);return s;}
test('G4f computer serves physically enter the service box at 92/85/80 percent across stages and both service sides',()=>{
 const report=[];
 for(const difficulty of ['easy','normal','hard']){
  let entered=0,net=0,out=0;
  for(const stage of [1,5,10])for(let seed=1;seed<=1200;seed++){
   const m=createTennis({config,difficulty,stage,seed:seed+stage*10000}),s=m.getState();s.server=1;s.score.points=[seed%2,0];s.phase='point';advance(m,config.rules.pointPause+dt);
   for(let n=0;n<200&&!s.shot;n++)m.update(dt);
   assert.ok(s.shot?.serving);const shot={...s.shot};const result=landing(m);
   if(result.event.type==='bounce'){
    entered++;assert.equal(s.faults,0);assert.ok(Math.abs(s.ball.z)<=config.court.serviceLength+config.court.lineTolerance);assert.ok(s.ball.x*shot.serviceSign<=config.court.lineTolerance);
   }else if(s.faultMark.reason==='net'){net++;assert.equal(s.faultMark.z,0);}
   else{out++;const mark=s.faultMark;assert.ok(Math.abs(mark.z)<=config.court.serviceLength+.65&&Math.abs(mark.x)<=config.court.halfWidth+.65,JSON.stringify(mark));}
  }
  const rate=entered/3600;assert.ok(Math.abs(rate-config.serve.computerInRate[difficulty])<.025,`${difficulty}: ${rate}`);assert.ok(net>20&&out>20);report.push({difficulty,attempts:3600,entered,rate,net,out});
 }
 console.log('G4f serve rates',JSON.stringify(report));
});
test('G4f service-box side stays fixed while the computer crosses the centre line',()=>{
 const m=createTennis({config,seed:1}),s=m.getState();s.server=1;s.phase='point';advance(m,config.rules.pointPause+dt);advance(m,config.rules.serveWait+dt);assert.equal(s.shot.serviceSign,-1);s.players[1].x=2;landing(m);assert.equal(s.event.type,'bounce');assert.equal(s.faults,0);
});
test('G4f drop shots from the baseline and net land near the net and rebound low',()=>{
 for(const z of [1,4,9.5]){
  const m=incoming('normal',z),s=m.getState();press(m,'swing',{drop:true});assert.equal(s.shot.drop,true);assert.equal(s.shot.lob,false);assert.ok(s.landing.z<-.8&&s.landing.z>-1.8);landing(m);assert.equal(s.event.type,'bounce');assert.ok(s.ball.z<0&&s.ball.z>-1.8);const apex=s.ball.y+s.ball.vy**2/(2*config.ball.gravity);assert.ok(apex<.5,`${z}: ${apex}`);assert.equal(s.ball.vz,(s.shot.targetZ-z)/s.shot.flight*config.drop.horizontalBounce);
 }
});
test('G4f hold charges power; exceeding the difficulty threshold physically goes out',()=>{
 assert.ok(config.shotPower.safeMax.easy>config.shotPower.safeMax.normal&&config.shotPower.safeMax.normal>config.shotPower.safeMax.hard);
 for(const difficulty of ['easy','normal','hard'])for(const over of [false,true]){
  const m=incoming(difficulty),s=m.getState();charge(m,config.shotPower.safeMax[difficulty]+(over?.05:-.05));const held=s.charge;assert.ok(held>0);press(m,'swing');assert.equal(s.shot.overpowered,over);assert.ok(Math.abs(s.shot.charge-held)<1e-8);landing(m);
  assert.equal(s.event.reason==='out',over);if(over)assert.ok(Math.abs(s.ball.z)>config.court.halfLength+config.court.lineTolerance);else assert.equal(s.event.type,'bounce');
 }
});
test('G4f release samples the latest joystick direction and keeps early-shot power and aim',()=>{
 const m=incoming(),s=m.getState();charge(m,.65,{aim:{x:1,z:0,manual:true}});const held=s.charge;s.contact.at=s.elapsed+.1;press(m,'swing',{aim:{x:-1,z:-.5,manual:true}});advance(m,.11,{aim:{x:1,z:1,manual:true}});assert.equal(s.shot.side,0);assert.ok(s.shot.targetX<0);assert.ok(s.shot.charge===held);assert.ok(Math.abs(s.shot.targetZ)>config.ball.depth);
 const cancelled=incoming();charge(cancelled,.8);cancelled.update(0,{cancelCharge:true});assert.equal(cancelled.getState().charge,0);press(cancelled,'swing');assert.equal(cancelled.getState().shot.charge,0);
});
test('G4f centre band gives a faster, accurate serve; all outer green releases stay legal on either meter direction',()=>{
 for(const difficulty of ['easy','normal','hard'])for(const rank of [1,5]){
  const shots=[];
  for(const meter of [.5,.5-config.serve.perfectWidth/2,.5+config.serve.perfectWidth/2,.5+config.serve.perfectWidth/2+.025]){
   const m=createTennis({config,difficulty,ranks:{speed:1,hit:1,serve:rank}}),s=m.getState();press(m,'serve');s.serveMeter=meter;s.serveZone='green';s.serveMeterDirection=-1;press(m,'serve',{aim:{x:1,manual:true}});shots.push({...s.shot,speed:Math.hypot(s.ball.vx,s.ball.vz)});landing(m);assert.equal(s.event.type,'bounce');assert.equal(s.faults,0);
  }
  assert.ok(shots.slice(0,3).every(s=>s.perfect));assert.equal(shots[3].perfect,false);assert.ok(shots[0].speed>shots[3].speed*1.15);assert.ok(shots[0].flight<shots[3].flight);assert.equal(Math.abs(shots[0].targetX),config.court.halfWidth/2);
 }
});
test('G4f original crowd synthesis is stereo, transient and high-passed rather than bass impacts',()=>{
 const {rate,channels}=synthesizeApplause();assert.equal(channels.length,2);assert.equal(channels[0].length,Math.ceil(2.8*rate));assert.notDeepEqual(channels[0],channels[1]);
 let lowEnergy=0,total=0,low=0;const alpha=1-Math.exp(-2*Math.PI*400/rate);
 for(const value of channels[0]){low+=alpha*(value-low);lowEnergy+=low*low;total+=value*value;assert.ok(Math.abs(value)<1);}
 assert.ok(lowEnergy/total<.035,`${lowEnergy/total}`);assert.ok(total/channels[0].length>.001);
});
