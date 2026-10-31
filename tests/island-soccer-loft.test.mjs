import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loftDestination,safeLoftPoint,createLoftFlight,stepLoftBall} from '../workout/island/minigames/soccer-loft.mjs';
import {rollBall} from '../workout/island/minigames/soccer-physics.mjs';
import {pitchCrossing} from '../workout/island/minigames/soccer-boundary.mjs';
import {createSoccer,passDestination} from '../workout/island/minigames/soccer.mjs';
import {crossArc} from '../workout/island/minigames/soccer-presentation.mjs';

const base=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} ~= ${b}`);
const state=(x=0,z=0,aim={x:1,z:0},players=[])=>({attackDir:1,controlled:0,aim,ball:{x,z,y:base.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:null},players:[{id:0,team:0,x,z,fx:1,fz:0},...players]});
const inPitch=(b,c=base)=>Math.abs(b.x)<=c.pitch.length/2-c.physics.ballRadius+1e-8&&Math.abs(b.z)<=c.pitch.width/2-c.physics.ballRadius+1e-8;
const simulate=(s,power,c=base)=>{
 const target=loftDestination(s,c,power),ball={...s.ball,...createLoftFlight(s.ball,target,c,power)};
 const time=ball.flight.duration,positions=[];let peak=ball.y;
 for(let i=0;i<Math.round(time/c.match.fixedStep);i++){
  const previous={...ball};stepLoftBall(ball,c.match.fixedStep,c);peak=Math.max(peak,ball.y);
  assert.equal(pitchCrossing(previous,ball,c),null,'a loft cannot leave the pitch before landing');positions.push({x:ball.x,y:ball.y,z:ball.z});
 }
 assert.equal(ball.flight,null);near(ball.x,target.x);near(ball.z,target.z);near(ball.y,c.physics.ballRadius);
 return {ball,target,time,peak,positions};
};

test('loft power determines an interior landing point and a plausible flight time',()=>{
 const c={...base,pitch:{...base.pitch,length:48,width:30}};
 let previous=0;
 for(const power of [.36,.5,.75,1]){
  const result=simulate(state(),power,c);
  assert.ok(result.target.distance>previous);previous=result.target.distance;
  assert.ok(result.time>=.7&&result.time<=1.6);assert.ok(result.peak>1&&result.peak<4.1);
  assert.ok(inPitch(result.ball,c));
 }
});

test('loft launch agrees with the real rollBall integrator, not a separate scripted arc',()=>{
 for(const c of [base,{...base,physics:{...base.physics,ballRadius:.11}},{...base,pitch:{...base.pitch,length:48,width:30}}]){
  for(const fromY of [c.physics.ballRadius,1.1,2.1])for(const power of [.4,.7,1]){
   const ball={x:1,z:2,y:fromY,vx:0,vz:0,vy:0,curve:0},target=safeLoftPoint({x:12,z:-4},c),launch=createLoftFlight(ball,target,c,power);
   Object.assign(ball,launch);let peak=ball.y;
   for(let i=0;i<Math.round(launch.flight.duration/c.match.fixedStep);i++){rollBall(ball,c.match.fixedStep,c);peak=Math.max(peak,ball.y);}
   near(ball.x,target.x);near(ball.z,target.z);near(ball.y,c.physics.ballRadius);
   near(peak-c.physics.ballRadius,launch.flight.height);
  }
 }
});

test('lofts from all lines and corners land inside the pitch at their actual target',()=>{
 for(const attackDir of [-1,1])for(const x of [-17.75,0,17.75])for(const z of [-10.75,0,10.75])for(let degrees=0;degrees<360;degrees+=15)for(const power of [.36,.5,.75,1]){
  const a=degrees*Math.PI/180,s=state(x,z,{x:Math.cos(a),z:Math.sin(a),manual:true});s.attackDir=attackDir;
  const result=simulate(s,power);assert.ok(inPitch(result.ball));
 }
});

test('landing at a line loses enough carry to settle inside instead of instantly rolling out',()=>{
 for(const x of [-17.75,0,17.75])for(const z of [-10.75,0,10.75])for(let degrees=0;degrees<360;degrees+=30){
  const a=degrees*Math.PI/180,{ball}=simulate(state(x,z,{x:Math.cos(a),z:Math.sin(a)}),1);
  for(let i=0;i<900;i++){
   const previous={...ball};rollBall(ball,base.match.fixedStep,base);
   assert.equal(pitchCrossing(previous,ball,base),null,'the first bounce/roll stays inside the pitch');assert.ok(inPitch(ball));
  }
  assert.equal(ball.vx,0);assert.equal(ball.vz,0);
 }
});

test('near-target receiver assistance uses actual teammate position and a bounded lead',()=>{
 const power=.5,range=base.passing.minDistance+(base.passing.maxDistance-base.passing.minDistance)*power;
 const mate={id:1,team:0,x:range-.4,z:1,vx:.5,vz:0};
 const s=state(0,0,{x:1,z:0},[mate]),target=loftDestination(s,base,power);
 assert.equal(target.target,1);assert.equal(target.assisted,true);assert.ok(Math.abs(target.correctionRadians)<=18*Math.PI/180);
 assert.ok(Math.hypot(target.x-mate.x,target.z-mate.z)<=.85);
 const result=simulate(s,power);assert.ok(Math.hypot(result.ball.x-target.x,result.ball.z-target.z)<1e-8);
});

test('manual loft retains its legal direction and does not steer to a nearby teammate',()=>{
 const power=.5,range=base.passing.minDistance+(base.passing.maxDistance-base.passing.minDistance)*power;
 const target=loftDestination(state(0,0,{x:1,z:0,manual:true},[{id:1,team:0,x:range,z:1}]),base,power);
 assert.equal(target.target,1);assert.equal(target.assisted,false);near(target.x,range);near(target.z,0);near(target.correctionRadians,0);
});

test('remote, opposing, behind and out-of-pitch players cannot hijack the landing point',()=>{
 const power=.5,s=state(0,0,{x:1,z:0},[
  {id:1,team:0,x:2,z:0},{id:2,team:1,x:13,z:0},{id:3,team:0,x:-12,z:0},
  {id:4,team:0,x:13,z:4},{id:5,team:0,x:18.1,z:0},{id:6,team:0,x:13,z:0,recover:.1}
 ]),target=loftDestination(s,base,power);
 assert.equal(target.target,null);assert.equal(target.assisted,false);near(target.z,0);near(target.x,13.5);
});

test('receiver choice is stable across roster order, power clamps, and pure calls',()=>{
 const s=state(0,0,{x:1,z:0},[{id:2,team:0,x:13.5,z:-1},{id:1,team:0,x:13.5,z:1}]),saved=structuredClone(s),c=structuredClone(base);
 const first=loftDestination(s,c,.5),reversed=loftDestination({...s,players:[...s.players].reverse()},c,.5);
 assert.equal(first.target,1);assert.deepEqual(first,reversed);assert.deepEqual(s,saved);assert.deepEqual(c,base);
 assert.deepEqual(loftDestination(s,c,-3),loftDestination(s,c,0));assert.deepEqual(loftDestination(s,c,3),loftDestination(s,c,1));
});

test('actual held-pass release lands at the preview target from every line and corner in either attack direction',()=>{
 const c=base,dt=c.match.fixedStep,hx=c.pitch.length/2-c.physics.ballRadius-.02,hz=c.pitch.width/2-c.physics.ballRadius-.02;
 const starts=[[-hx,0],[hx,0],[0,-hz],[0,hz],[-hx,-hz],[-hx,hz],[hx,-hz],[hx,hz]];
 for(const attackDir of [-1,1])for(const [x,z]of starts)for(const requestedPower of [.4,.7,1]){
  const g=createSoccer({config:c,seed:419,stage:1,difficulty:'normal'}),s=g.getState(),p=s.players[0];
  for(const member of s.players)Object.assign(member,{recover:100,cooldown:100,think:100,vx:0,vz:0});
  const facing=unitVector(x/hx,z/hz);Object.assign(p,{x:x-facing.x*c.physics.dribbleOffset,z:z-facing.z*c.physics.dribbleOffset,fx:facing.x,fz:facing.z,recover:0,cooldown:0});
  Object.assign(s,{attackDir,controlled:0,mode:'attack',aim:facing});
  Object.assign(s.ball,{owner:0,x,z,y:c.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,grace:100,lastTeam:0,lastPlayer:0});
  for(let i=0;i<Math.ceil(c.passing.chargeSeconds*requestedPower/dt);i++)g.update(dt,{passHeld:true});
  const passAim={...facing,manual:true},power=s.charge/c.passing.chargeSeconds,preview=crossArc({...s,aim:passAim,passAim},c),destination=passDestination({...s,aim:passAim,passAim},c,power);
  assert.ok(preview);g.update(dt,{passAim});
  const event=g.drainEvents().find(e=>e.type==='loft');assert.ok(event);assert.equal(s.ball.flight?.kind,'physical-loft');
  near(s.ball.flight.x,preview.x);near(s.ball.flight.z,preview.z);near(s.ball.flight.height,preview.height);near(s.ball.flight.duration,preview.duration);
  assert.ok(Math.hypot(event.x-destination.x,event.z-destination.z)<1e-8);
  const flight={...s.ball.flight};p.recover=100;
  while(s.ball.flight){g.update(dt,{});assert.equal(s.phase,'playing');}
  near(s.ball.x,flight.x);near(s.ball.z,flight.z);near(s.ball.y,c.physics.ballRadius);assert.ok(inPitch(s.ball,c));
  for(let i=0;i<360;i++){g.update(dt,{});assert.equal(s.phase,'playing');assert.ok(inPitch(s.ball,c));}
 }
});
function unitVector(x,z){const length=Math.hypot(x,z)||1;return {x:x/length,z:z/length};}

test('actual AI crosses use mirrored in-box targets and the same physical landing in both attack directions',()=>{
 for(const attackDir of [-1,1]){
  const c=base,dt=c.match.fixedStep,g=createSoccer({config:c,seed:781,stage:8}),s=g.getState(),d=-attackDir,hx=c.pitch.length/2;
  for(const p of s.players)Object.assign(p,{recover:100,cooldown:100,think:100,vx:0,vz:0});
  const wing=s.players.find(p=>p.team===1&&p.role==='wing'),mate=s.players.find(p=>p.team===1&&p.role==='striker');
  Object.assign(wing,{x:d*(hx-4),z:6.5,fx:d,fz:0,recover:0,cooldown:0,think:0,hold:1});
  Object.assign(mate,{x:d*(hx-2.4),z:0});
  Object.assign(s,{attackDir,controlled:0});Object.assign(s.ball,{owner:wing.id,x:wing.x+d*c.physics.dribbleOffset,z:wing.z,y:c.physics.ballRadius,vx:0,vz:0,vy:0,grace:100,lastTeam:1,lastPlayer:wing.id});
  g.update(dt);const event=g.drainEvents().find(e=>e.type==='loft');assert.ok(event);
  assert.equal(s.ball.flight?.kind,'physical-loft');assert.ok(event.x*d>hx-c.pitch.penaltyDepth);assert.ok(event.x*d<hx-1);assert.ok(Math.abs(event.z)<c.pitch.penaltyWidth/2);
  near(s.ball.flight.x,event.x);near(s.ball.flight.z,event.z);wing.recover=100;
  while(s.ball.flight){g.update(dt);assert.equal(s.phase,'playing');}
  near(s.ball.x,event.x);near(s.ball.z,event.z);assert.ok(inPitch(s.ball,c));
 }
});

test('an upward deflection keeps its physical velocity beyond the planned landing time until real ground contact',()=>{
 const s=state(),target=loftDestination(s,base,.6),ball={...s.ball,...createLoftFlight(s.ball,target,base,.6)},flight=ball.flight,dt=base.match.fixedStep;
 for(let i=0;i<20;i++)stepLoftBall(ball,dt,base);
 ball.vy=12;let passedPlan=false,landed=false;
 for(let i=0;i<300&&ball.flight;i++){
  const expected={...ball};rollBall(expected,dt,base);const contact=stepLoftBall(ball,dt,base);
  if(expected.y>base.physics.ballRadius+1e-7){
   assert.equal(contact,false);near(ball.vx,expected.vx);near(ball.vz,expected.vz);near(ball.vy,expected.vy);
   if(flight.age>flight.duration){passedPlan=true;assert.equal(ball.flight,flight);}
  }else if(contact){landed=true;near(ball.y,base.physics.ballRadius);}
 }
 assert.ok(passedPlan,'the ball remains a physical loft beyond its obsolete schedule');assert.ok(landed);assert.equal(ball.flight,null);assert.ok(flight.age>flight.duration);
});

test('a downward deflection resolves its first real ground contact before the old landing schedule',()=>{
 const s=state(),target=loftDestination(s,base,.6),ball={...s.ball,...createLoftFlight(s.ball,target,base,.6)},flight=ball.flight,dt=base.match.fixedStep;
 for(let i=0;i<15;i++)stepLoftBall(ball,dt,base);
 ball.vy=-30;let landed=false;
 for(let i=0;i<30&&ball.flight;i++){
  const expected={...ball};rollBall(expected,dt,base);const contact=stepLoftBall(ball,dt,base);
  if(expected.y>base.physics.ballRadius+1e-7){assert.equal(contact,false);near(ball.vx,expected.vx);near(ball.vz,expected.vz);}
  else{assert.equal(contact,true);landed=true;near(ball.y,base.physics.ballRadius);}
 }
 assert.ok(landed);assert.equal(ball.flight,null);assert.ok(flight.age<flight.duration);
 assert.ok(ball.x<target.x-1,'contact does not teleport a deflected ball to its scheduled target');
});
