import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacing} from '../minigames/racing-physics.mjs';
import {racingResult} from '../minigames/racing-result.mjs';
import {readFileSync} from 'node:fs';

const balance=JSON.parse(readFileSync(new URL('../data/config.json',import.meta.url),'utf8')).minigames.islandRacing;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const place=(race,car,s,lane,speed)=>{const p=race.track.sample(s);Object.assign(car,{x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,heading:p.heading,speed,s:p.s,routeS:s,previousS:s,progress:s,lateral:lane,checkpoints:Math.floor(s/(race.track.length/16)),nextCheckpoint:Math.floor(s/(race.track.length/16))+1});return p;};

test('extra rivals: ten cars on the grid, only the five scoring cars rank in the result',()=>{
  const race=createRacing({stage:1,seed:7,config:{countdown:0,extraRivals:5}}),p=race.state.player,tr=race.track;
  assert.equal(race.state.cars.length,10);assert.equal(race.state.cars.filter(c=>c.scoring).length,5);assert.equal(new Set(race.state.cars.map(c=>c.name)).size,10,'every car has its own name');
  const q=[];for(let n=0;n<60*400&&race.state.phase!=='finished';n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);race.step(1/60,{steer:clamp(e*1.7,-1,1),autoAccelerate:true});}
  const r=race.state.result;assert.ok(r&&r.finished);assert.ok(r.rank>=1&&r.rank<=5,'result rank counts the scoring cars: '+r.rank);
  assert.ok(p.rank>=1&&p.rank<=10);assert.equal(race.state.cars.length,10);
  const raw={outcome:r.won?'win':'lose',score:r.checkpoints===r.requiredCheckpoints?6-r.rank:0,racing:r};
  assert.ok(racingResult(raw,{level:1,seed:7},balance),'the result contract accepts a ten-car race');
});
test('crash: a hard wall hit flips the car for 0.5-1.2 s (racing-deep-m7 arc; 0.55 s with crashFx:false), then it restarts on the centre line, along the track, at 9 m/s, without gaining a gate',()=>{
  const race=createRacing({stage:1,seed:1,config:{countdown:0,stage:{opponents:0},steeringAssist:false}}),p=race.state.player,tr=race.track;
  const pt=place(race,p,300,tr.width/2-.3,40);p.heading=pt.heading+1.2;   // heading into the fence at 40 m/s
  const cp=p.checkpoints;let crashed=false,recovered=false,t0=0;
  for(let n=0;n<120;n++){race.step(1/60,{autoAccelerate:true,steer:0});for(const e of race.state.events){if(e.type==='crash'&&e.car==='player'){crashed=true;t0=race.state.time;}if(e.type==='crashRecover'&&e.car==='player'){recovered=true;assert.ok(race.state.time-t0>=.5&&race.state.time-t0<=1.2,'0.5-1.2 s: '+(race.state.time-t0));}}if(recovered)break;}
  assert.ok(crashed&&recovered);assert.ok(Math.abs(p.lateral)<=tr.width*.2+.01,'back on the centre line: '+p.lateral);
  assert.ok(Math.abs(wrap(p.heading-tr.sample(p.s).heading))<.08);assert.ok(p.speed>=8&&p.speed<=12,'restart speed '+p.speed);assert.equal(p.checkpoints,cp);assert.equal(p.crashes,1);assert.equal(p.offroad,false);
});
test('crash: only severe hits flip: slow or glancing contact is a normal wall bump; config.crash=false removes the flip',()=>{
  const run=(speed,angle,config={})=>{const race=createRacing({stage:1,seed:1,config:{countdown:0,stage:{opponents:0},steeringAssist:false,...config}}),p=race.state.player,tr=race.track;const pt=place(race,p,300,tr.width/2-.3,speed);p.heading=pt.heading+angle;
    for(let n=0;n<30;n++)race.step(1/60,{autoAccelerate:true,steer:0});return p.crashes;};
  assert.equal(run(20,1.2),0,'20 m/s straight in is not severe enough');assert.equal(run(40,.3),0,'a glancing hit at 40 m/s');assert.equal(run(40,1.3),1);assert.equal(run(40,1.3,{crash:false}),0);
});
test('crash: a rival stuck against a wall or another car flips and restarts instead of staying stuck',()=>{
  const race=createRacing({stage:1,seed:2,config:{countdown:0,extraRivals:0}}),ai=race.state.cars[1];let crashed=0;
  for(let n=0;n<60*3;n++)race.step(1/60,{autoAccelerate:false});
  ai.maxSpeed=0.5;   // it cannot move: the stuck rule must act
  for(let n=0;n<60*4&&!crashed;n++){race.step(1/60,{autoAccelerate:false});crashed+=race.state.events.filter(e=>e.type==='crash'&&e.car===ai.id&&e.reason==='stuck').length;}
  assert.equal(crashed,1);for(let n=0;n<45;n++)race.step(1/60,{autoAccelerate:false});assert.ok(ai.crashT===0&&ai.speed>1,'it restarted: '+ai.speed);
});
test('1,000 random hard hits: every restart lands on the road, no gate is awarded, nobody stays flipped',()=>{
  let seed=99;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};let flips=0;
  for(let i=0;i<1000;i++){
    const stage=1+Math.floor(rand()*30),race=createRacing({stage,seed:3,config:{countdown:0,stage:{opponents:0},steeringAssist:false}}),p=race.state.player,tr=race.track,s=rand()*tr.length;
    const pt=place(race,p,s,(rand()<.5?-1:1)*(tr.width/2-.3),30+rand()*18);const side=Math.sign(p.lateral);p.heading=pt.heading+side*-(.5+rand()*1)*-1;
    const cp=p.checkpoints;for(let n=0;n<90;n++)race.step(1/60,{autoAccelerate:true,steer:0});
    if(p.crashes)flips++;for(let n=0;n<75&&p.crashT>0;n++)race.step(1/60,{autoAccelerate:true,steer:0});   // a second hit near the end of the window also finishes within 1.2 s (racing-deep-m7 arc)
    assert.ok(p.crashT===0,'nobody stays flipped');assert.equal(p.offroad,false);assert.ok(p.checkpoints<=cp+1);
  }
  assert.ok(flips>100&&flips<1000,'flips happen for the hard hits only: '+flips);
});
test('shift map: more corners shift up earlier; config.shiftMap=false keeps the fixed points',()=>{
  const gearAt=(stage,config)=>{const race=createRacing({stage,seed:1,config:{countdown:0,stage:{opponents:0},...config}}),p=race.state.player,top=race.stage.playerSpeed;place(race,p,300,0,top*.30);p.gearInit=true;p.gear=2;p.gearT=1;
    for(let n=0;n<10;n++){race.step(1/60,{autoAccelerate:true,steer:0});p.speed=top*.30;}return p.gear;};
  assert.equal(gearAt(2,{shiftMap:false}),2,'fixed bound: 30% of top stays in gear 2');assert.equal(gearAt(2,{}),3,'twisty circuit: shifted up');
});
