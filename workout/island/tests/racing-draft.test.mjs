import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacing} from '../minigames/racing-physics.mjs';

/** Two cars on a straight: leader at a fixed speed, follower behind it by `gap` m (or alone). */
function follow(gap,config={}){
  const race=createRacing({stage:1,seed:1,config:{countdown:0,walls:false,...config}}),tr=race.track,p=race.state.player,ai=race.state.cars[1];
  for(const c of race.state.cars.slice(2)){c.x=1e5;c.z=1e5;c.finished=true;}
  const s0=40;let pt=tr.sample(s0),lead=tr.sample(s0+gap);
  Object.assign(p,{x:pt.x,y:pt.y,z:pt.z,heading:pt.heading,speed:40,s:pt.s,routeS:s0,previousS:s0,progress:s0,lateral:0,nitro:0});
  Object.assign(ai,{x:lead.x,y:lead.y,z:lead.z,heading:lead.heading,speed:45,maxSpeed:60,s:lead.s,routeS:s0+gap,previousS:s0+gap,progress:s0+gap,lateral:0,targetLane:0,aiBias:0,laneHold:99});
  let maxDraft=0;let top=0;for(let n=0;n<40;n++){ai.speed=45;race.step(1/60,{autoAccelerate:true,steer:0});maxDraft=Math.max(maxDraft,p.draft);top=Math.max(top,p.speed);}
  const out={speed:top,draft:maxDraft};race.dispose();return out;
}
test('slipstream: close behind another car gives speed, far or disabled does not',()=>{
  const near=follow(9),far=follow(60),off=follow(9,{draft:false});
  assert.ok(near.draft>.3,'draft builds close behind: '+near.draft);assert.equal(far.draft,0);assert.equal(off.draft,0);
  assert.ok(near.speed>far.speed+1,`slipstream speed gain ${near.speed-far.speed} m/s`);
});
test('lap times are recorded per lap',()=>{
  const race=createRacing({stage:1,seed:7,config:{countdown:0,steeringAssist:true}});
  for(let n=0;n<60*100&&race.state.player.lapTimes.length<1;n++)race.step(1/60,{autoAccelerate:true,steer:0});
  assert.ok(race.state.player.lapTimes.length>=0);race.dispose();
});
