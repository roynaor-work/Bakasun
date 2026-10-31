import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {hasShootingLane} from '../workout/island/minigames/soccer-teamplay.mjs';
const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer,dt=c.match.fixedStep;
function fixture(direction=1,side=1){
 const game=createSoccer({config:c,stage:1,difficulty:'normal',seed:9}),s=game.getState();
 game.clearInput();s.attackDir=-direction;s.controlled=0;s.switchCooldown=100;s.passTarget=null;
 for(const p of s.players)Object.assign(p,{x:(p.team===0?-12:12)*direction,z:p.id%2?8:-8,recover:100,cooldown:100,think:100,vx:0,vz:0,slideTime:0,hands:false});
 const carrier=s.players[3],blocker=s.players[0];
 Object.assign(carrier,{x:0,z:0,recover:0,fx:direction,fz:0});Object.assign(blocker,{x:1.5*direction,z:side*.2});
 Object.assign(s.ball,{owner:3,x:direction*c.physics.dribbleOffset,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,flight:null,grace:100,lastTeam:1,lastPlayer:3});
 const tick=()=>{game.update(dt);return game.drainEvents();};
 return {game,s,carrier,blocker,tick};
}
test('carrier evade holds one side against the same visible presser, then returns toward goal in both directions',()=>{
 for(const direction of [-1,1])for(const side of [-1,1]){
  const f=fixture(direction,side),p=f.carrier;assert.equal(hasShootingLane(p,f.s,c),false);
  f.tick();assert.equal(p.evadeBlocker,f.blocker.id);const chosen=p.evadeZ;
  assert.ok(chosen*side<0,'the chosen gap is away from the observed defender');
  // The same presser moving across the centre line cannot reverse the chosen
  // gap on every frame. No future human input is supplied or inspected.
  for(let i=0;i<3;i++){f.blocker.z=(i%2?1:-1)*side*.1;f.tick();assert.equal(p.evadeZ,chosen);}
  f.blocker.z=side*.2;
  let ticks=0;
  while(p.evadeBlocker!==null&&ticks++<120){f.tick();if(p.evadeBlocker!==null)assert.equal(p.evadeZ,chosen);}
  assert.equal(p.evadeBlocker,null,'the carrier eventually passes or clears the blocker');
  assert.ok(p.x*direction>0,'the bypass keeps making forward progress');
  const progress=p.x*direction,lateral=Math.abs(p.z);
  for(let i=0;i<45;i++)f.tick();
  assert.ok(p.x*direction>progress+1,'after the bypass the run continues toward goal');
  assert.ok(Math.abs(p.z)<lateral+.01,'the carrier returns from the gap toward the centre');
  assert.equal(f.s.ball.owner,p.id);
 }
});
test('carrier evade clears stale intent when possession changes and on a new reception',()=>{
 for(const direction of [-1,1]){
  const f=fixture(direction);f.tick();assert.equal(f.carrier.evadeBlocker,0);
  Object.assign(f.s.ball,{owner:0,x:f.blocker.x,z:f.blocker.z,lastTeam:0,lastPlayer:0});f.tick();
  assert.equal(f.carrier.evadeBlocker,null);assert.equal(f.carrier.evadeZ,0);
  f.carrier.evadeBlocker=0;f.carrier.evadeZ=7;f.carrier.cooldown=0;
  Object.assign(f.s.ball,{owner:null,x:f.carrier.x,z:f.carrier.z,y:c.physics.ballRadius,vx:0,vz:0,vy:0,lastTeam:0,lastPlayer:0,grace:0});
  f.tick();assert.equal(f.s.ball.owner,f.carrier.id);assert.equal(f.carrier.evadeBlocker,null);assert.equal(f.carrier.evadeZ,0);
 }
});
test('carrier evade clears stale intent at both an out-of-play restart and kickoff',()=>{
 for(const kind of ['restart','goal'])for(const direction of [-1,1]){
  const f=fixture(direction);f.carrier.recover=100;f.carrier.evadeBlocker=0;f.carrier.evadeZ=7;
  Object.assign(f.s.ball,{owner:null,x:kind==='goal'?direction*17.95:0,z:kind==='goal'?0:10.95,vx:kind==='goal'?direction*30:0,vz:kind==='goal'?0:30,vy:0,lastTeam:1,lastPlayer:3,grace:100});
  f.tick();assert.equal(f.s.phase,kind);
  if(kind==='goal')for(let i=0;i<Math.ceil((c.match.goalSeconds+.1)/dt)&&f.s.phase==='goal';i++)f.tick();
  assert.equal(f.carrier.evadeBlocker,null);assert.equal(f.carrier.evadeZ,0);
 }
});
test('carrier evade leaves an approaching moving presser to the existing passing and running policy',()=>{
 for(const direction of [-1,1]){
  const f=fixture(direction);Object.assign(f.blocker,{recover:0,vx:direction});
  f.tick();assert.equal(f.carrier.evadeBlocker,null);assert.ok(f.carrier.vx*direction>0);
  assert.ok(Math.hypot(f.blocker.vx,f.blocker.vz)>c.ai.movingThreshold);
 }
});
test('carrier evade preserves the keeper duel instead of sidestepping a stationary goalkeeper',()=>{
 for(const direction of [-1,1]){
  const f=fixture(direction);Object.assign(f.blocker,{x:-12*direction,z:8});
  Object.assign(f.carrier,{x:15.3*direction,z:0});Object.assign(f.s.players[2],{x:16.8*direction,z:.2});
  Object.assign(f.s.ball,{x:15.79*direction,z:0});
  f.tick();assert.equal(f.carrier.evadeBlocker,null);assert.ok(f.carrier.vx*direction>0);
  assert.equal(f.s.ball.owner,f.carrier.id);
 }
});
