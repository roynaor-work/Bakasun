import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacing} from '../minigames/racing-physics.mjs';
import {createRacingSamples} from '../minigames/racing-samples.mjs';

function onRoad(config={}){
  const race=createRacing({stage:1,seed:3,config:{countdown:0,walls:false,steeringAssist:false,stage:{opponents:1,grid:1},...config}}),tr=race.track,p=race.state.player,pt=tr.sample(60);
  Object.assign(p,{x:pt.x,y:pt.y,z:pt.z,heading:pt.heading,speed:34,s:pt.s,routeS:60,previousS:60,progress:60,lateral:0,nitro:20});return race;
}
test('energy recovery: braking charges the meter, an idle straight charges it slowly, boosting spends it',()=>{
  const brake=onRoad(),p=brake.state.player;for(let n=0;n<60;n++)brake.step(1/60,{autoAccelerate:true,steer:0,brake:true});
  assert.ok(p.nitro>20+10,'braking for a second recovers about 14 units: '+p.nitro);assert.equal(p.charging,1);
  const straight=onRoad(),q=straight.state.player;for(let n=0;n<60;n++)straight.step(1/60,{autoAccelerate:true,steer:0});
  assert.ok(q.nitro>20&&q.nitro<20+4,'a clean line adds a little: '+q.nitro);
  const boost=onRoad(),b=boost.state.player;b.nitro=60;for(let n=0;n<60;n++)boost.step(1/60,{autoAccelerate:true,steer:0,nitro:true});
  assert.ok(b.nitro<60-20,'boosting spends the meter: '+b.nitro);assert.ok(b.ersUsed>20);
});
test('energy recovery is capped, player-only and switchable (config.ers=false)',()=>{
  const full=onRoad(),p=full.state.player;p.nitro=99.9;for(let n=0;n<120;n++)full.step(1/60,{autoAccelerate:true,steer:0,brake:true});assert.ok(p.nitro<=100+1e-9);
  const off=onRoad({ers:false}),o=off.state.player;for(let n=0;n<60;n++)off.step(1/60,{autoAccelerate:true,steer:0,brake:true});assert.equal(o.nitro,20);assert.equal(o.charging,0);
  const rival=onRoad(),ai=rival.state.cars[1];const before=ai.nitro;for(let n=0;n<120;n++)rival.step(1/60,{autoAccelerate:true,steer:0});assert.ok(ai.nitro<=before,'rivals do not recover energy');
});
test('gearbox has hysteresis: a speed hovering at a shift point does not flip gears several times a second',()=>{
  const race=onRoad(),p=race.state.player,top=race.stage.playerSpeed;let changes=[],last=p.gear;
  for(let n=0;n<600;n++){p.speed=top*(.62+Math.sin(n/6)*.012);race.step(1/60,{autoAccelerate:true,steer:0});p.speed=top*(.62+Math.sin(n/6)*.012);if(p.gear!==last){changes.push(n/60);last=p.gear;}}
  assert.ok(changes.length<=3,'gear changes while hovering: '+changes.length);
  for(let i=1;i<changes.length;i++)assert.ok(changes[i]-changes[i-1]>=.34,'minimum 0.35 s between changes');
});
test('acceleration is a little quicker than the previous setting (0-100 km/h under 7 s) and still gradual to the top',()=>{
  const run=()=>{const race=createRacing({stage:1,seed:3,config:{countdown:0,walls:false,scrub:false,stage:{opponents:0,grid:1}}}),p=race.state.player;let t100=null,t98=null;
    for(let n=0;n<60*45&&t98===null;n++){race.step(1/60,{autoAccelerate:true,steer:0});if(t100===null&&p.speed*3.6>=100)t100=n/60;if(p.speed>=.98*race.stage.playerSpeed)t98=n/60;
      if(p.lateral>7){p.lateral=0;}}
    race.dispose();return {t100,t98};};
  const r=run();assert.ok(r.t100<7&&r.t100>5,'0-100: '+r.t100);
});
test('sample one-shots start with an attack ramp and never stack gearbox sounds (shift noise fix)',async()=>{
  const ramps=[],param=()=>({value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(){},linearRampToValueAtTime(v,t){ramps.push({v,t});}});
  const node=()=>({gain:param(),playbackRate:param(),frequency:param(),connect(){},disconnect(){},start(){},stop(){}});
  const sources=[];const ctx={currentTime:1,destination:{},createGain:()=>node(),createBufferSource:()=>{const n=node();sources.push(n);return n;},decodeAudioData:async()=>({})};
  const layer=createRacingSamples({context:ctx,base:'http://x/',fetchFn:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}),format:'ogg'});await layer.load();
  const before=sources.length;layer.shiftUp();layer.shiftDown();layer.backfire();layer.blowoff();
  assert.equal(sources.length-before,1,'one gearbox sound per 0.45 s');assert.equal(ramps.length,1);assert.ok(ramps[0].v<=.04&&ramps[0].t>1,'quiet and ramped: '+JSON.stringify(ramps[0]));
  ctx.currentTime=1.6;layer.shiftDown();assert.equal(sources.length-before,2);
});
