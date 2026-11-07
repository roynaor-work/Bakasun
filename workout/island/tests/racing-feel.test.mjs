import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacing} from '../minigames/racing-physics.mjs';

function yawAt(speed,steer,feel){
  const race=createRacing({stage:1,seed:1,config:{countdown:0,walls:false,feel,steeringAssist:false,stage:{opponents:0}}}),p=race.state.player,pt=race.track.sample(30);
  Object.assign(p,{x:pt.x,y:pt.y,z:pt.z,heading:pt.heading,speed,s:pt.s,routeS:30,previousS:30,progress:30,lateral:0});
  let last=p.heading,yaw=0,t63=null;const series=[];
  for(let n=0;n<72;n++){race.step(1/60,{autoAccelerate:true,steer:-steer});p.speed=speed;yaw=Math.abs(Math.atan2(Math.sin(p.heading-last),Math.cos(p.heading-last)))*60;last=p.heading;series.push(yaw);}
  const steady=series.slice(-10).reduce((a,b)=>a+b)/10;t63=(series.findIndex(v=>v>=.63*steady)+1)/60;race.dispose();return {steady,t63};
}
test('steering responds within 100 ms to 63% of its steady turn (was 117 ms)',()=>{
  for(const v of [20,40])assert.ok(yawAt(v,1,true).t63<=.1,'t63 at '+v+': '+yawAt(v,1,true).t63);
  assert.ok(yawAt(40,1,false).t63>=.1,'the old model is slower');
});
test('full lock at 45 m/s stays under about 4 g, full authority kept at low speed',()=>{
  const fast=yawAt(45,1,true).steady*45,old=yawAt(45,1,false).steady*45;
  assert.ok(fast<=45,'lateral acceleration '+fast);assert.ok(old>55,'previous ~6 g '+old);
  assert.ok(yawAt(15,1,true).steady>=yawAt(15,1,false).steady*.88,'low speed turning stays within 12%');
});
