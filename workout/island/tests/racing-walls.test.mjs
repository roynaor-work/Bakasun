import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacing} from '../minigames/racing-physics.mjs';
import {TRACKS,RACING_STAGES} from '../minigames/racing-tracks.mjs';

function rng(seed){let v=seed>>>0;return()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}
/** One random hit: place the car at the fence aimed outward at a random angle and speed, drive 1.2 s with no input. */
function hit(stage,random,config={}){
  const race=createRacing({stage,seed:3,config:{countdown:0,stage:{opponents:0},steeringAssist:false,...config}}),p=race.state.player,tr=race.track;
  const s=random()*tr.length,pt=tr.sample(s),side=random()<.5?-1:1,limit=tr.width/2+.2;
  const outward=.15+random()*1.3,speed=10+random()*38;           // radians off the road direction, pointing at the fence
  Object.assign(p,{x:pt.x+pt.normal.x*side*(limit-.4),z:pt.z+pt.normal.z*side*(limit-.4),y:pt.y,heading:pt.heading+side*-outward*-1,speed,s:pt.s,routeS:s,previousS:s,progress:s,previousS_:s,lateral:side*(limit-.4),
    checkpoints:Math.floor(s/(tr.length/16)),nextCheckpoint:Math.floor(s/(tr.length/16))+1});
  // aim: positive lateral = +normal side; heading must move toward +side*normal
  const want=Math.atan2(pt.normal.x*side,pt.normal.z*side),road=pt.heading;
  let delta=Math.atan2(Math.sin(want-road),Math.cos(want-road));p.heading=road+Math.sign(delta)*outward;
  let first=null,worst=0,offroad=false;
  for(let n=0;n<72;n++){const before=p.speed;race.step(1/60,{autoAccelerate:true,steer:0});
    worst=Math.max(worst,Math.abs(tr.project(p.x,p.z).lateral));offroad=offroad||p.offroad;
    const e=race.state.events.find(x=>x.type==='wall'&&x.car==='player');if(e&&!first)first={loss:e.loss,intensity:e.intensity,speed:e.speed,before};}
  race.dispose();return {first,worst,offroad,limit};
}

test('1,000 random fence hits across every circuit never leave the road and cost 25-45% of speed',()=>{
  const random=rng(2026);let hits=0,min=1,max=0,maxLateral=0,off=0,straight=[],tangent=[];
  for(let i=0;i<1000;i++){
    const stage=1+Math.floor(random()*30),r=hit(stage,random);
    if(r.offroad)off++;maxLateral=Math.max(maxLateral,r.worst-r.limit);
    if(r.first){hits++;min=Math.min(min,r.first.loss);max=Math.max(max,r.first.loss);(r.first.intensity>.8?straight:r.first.intensity<.3?tangent:[]).push(r.first.loss);}
  }
  assert.equal(off,0,'zero off-road exits');assert.ok(maxLateral<.9,'the car never passes the fence: '+maxLateral);
  assert.ok(hits>900,'almost every aimed run hits: '+hits);assert.ok(min>=.25-1e-9&&max<=.45+1e-9,`loss range ${min}-${max}`);
  const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;assert.ok(avg(straight)>avg(tangent),'a straight hit costs more than a glancing one');
});
test('every circuit is fenced on both sides: a car driven at the fence from the grid bounces, loses speed and stays',()=>{
  for(const track of TRACKS)for(const side of [-1,1]){
    const stage=RACING_STAGES.find(s=>s.trackId===track.id).id,race=createRacing({stage,seed:1,config:{countdown:0,stage:{opponents:0}}}),p=race.state.player;
    for(let n=0;n<420;n++)race.step(1/60,{autoAccelerate:true,steer:side*(n>30?1:0)});   // full lock into the fence
    assert.ok(p.wallHits>0,track.id+' side '+side);assert.equal(p.offroad,false);assert.equal(p.recoveries,0);race.dispose();
  }
});
test('walls:false restores the old open shoulders',()=>{
  const race=createRacing({stage:1,seed:1,config:{countdown:0,walls:false,stage:{opponents:0}}}),p=race.state.player;
  for(let n=0;n<300;n++)race.step(1/60,{autoAccelerate:true,steer:-1});assert.equal(p.wallHits,0);
});
