import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {puntDestination,createKeeperPuntFlight} from '../workout/island/minigames/soccer-restarts.mjs';
import {passLanding} from '../workout/island/minigames/soccer-presentation.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const hx=config.pitch.length/2,hz=config.pitch.width/2,dt=config.match.fixedStep,r=config.physics.ballRadius;
const inside=b=>Math.abs(b.x)<hx&&Math.abs(b.z)<hz;
/** Our keeper (id 2) holds the ball in the goal area; team-mates spread over our half. */
function keeperFixture(seed=3,role='keeper'){
  const g=createSoccer({config,seed,stage:3,role}),s=g.getState();
  Object.assign(s,{phase:'playing',phaseTime:0,attackDir:1,controlled:role==='keeper'?2:0,switchCooldown:100,passTarget:null,restart:null,charging:false,charge:0,chargeKind:null,mode:'attack'});
  for(const p of s.players)Object.assign(p,{x:(p.team?1:-1)*hx*.45,z:(p.id%3-1)*hz*.55,vx:0,vz:0,fx:p.team?-1:1,fz:0,cooldown:100,think:100,recover:0,slideTime:0,hands:false,hold:0,restartMotion:null,distribution:null});
  const k=s.players[2];Object.assign(k,{x:-hx+2,z:0,cooldown:0,hands:true});Object.assign(s.players[5],{x:hx-2,z:0});
  Object.assign(s.players[0],{x:-hx+13,z:0});Object.assign(s.players[1],{x:-hx+8,z:-7});
  Object.assign(s.ball,{owner:2,x:k.x+config.goalkeeping.holdForward,z:0,y:config.goalkeeping.holdHeight,vx:0,vz:0,vy:0,lastTeam:0,lastPlayer:2,flight:null,shot:null,grace:0});
  return {g,s};
}
/** Press a button once, then follow the ball until it first lands (or stops). */
function release(g,s,button){
  const input={moveX:0,moveZ:0,kickHeld:button==='kick',passHeld:button==='pass',sprintHeld:false,switchPlayer:false};
  g.update(dt,input);g.update(dt,{...input,kickHeld:false,passHeld:false});
  let released=null,t=0,landing=null,maxY=0;const events=[];
  for(let i=0;i<900;i++){
    g.update(dt,{moveX:0,moveZ:0});t+=dt;for(const e of g.drainEvents())if(['pass','loft','shot','throw'].includes(e.type))events.push({t,...e});
    const b=s.ball;
    if(released===null&&b.owner===null)released={t,x:b.x,z:b.z,speed:Math.hypot(b.vx,b.vz),vy:b.vy,flight:!!b.flight,target:s.passTarget?{...s.passTarget}:null};
    if(released){maxY=Math.max(maxY,b.y);const slow=Math.hypot(b.vx,b.vz)<.4&&b.y<=r+1e-3;if(landing===null&&t>released.t+.25&&(b.y<=r+1e-3&&(released.flight||slow)))landing={t,x:b.x,z:b.z};}
    if(landing&&(b.owner!==null||t>landing.t+.3))break;
  }
  return {released,landing,maxY,events};
}

test('keeper punt: a high ball that lands on the grass well downfield, near its announced target',()=>{
  for(const seed of [3,11,27]){
    const {g,s}=keeperFixture(seed),out=release(g,s,'kick'),shot=out.events.find(e=>e.type==='shot'&&e.player===2);
    assert.ok(shot?.punt,'the punt is announced as a shot from the hands');assert.ok(out.released?.flight,'it is a physical loft flight');
    assert.ok(out.maxY>=1.8,`a visible arc (${out.maxY.toFixed(2)} m)`);
    assert.ok(out.landing&&inside(out.landing),'lands inside the pitch');
    const travel=out.landing.x-out.released.x;assert.ok(travel>=config.goalkeeping.puntMinDistance*.85,`travels downfield (${travel.toFixed(1)} m)`);
    assert.ok(Math.hypot(out.landing.x-shot.x,out.landing.z-shot.z)<1.2,`lands near the announced point (${Math.hypot(out.landing.x-shot.x,out.landing.z-shot.z).toFixed(2)} m)`);
  }
});
test('keeper throw: lands inside the pitch within a metre of the announced point',()=>{
  const {g,s}=keeperFixture(3),out=release(g,s,'pass'),pass=out.events.find(e=>e.type==='pass'&&e.player===2);
  assert.ok(pass&&out.released?.flight);assert.ok(out.landing&&inside(out.landing));
  assert.ok(Math.hypot(out.landing.x-pass.x,out.landing.z-pass.z)<1,'throw lands on its point');
});
test('punt destination: power picks the range band; a short team-mate receives it ahead of them',()=>{
  const {s}=keeperFixture(3),k=s.players[2];
  const soft=puntDestination(k,s,config,0),hard=puntDestination(k,s,config,1);
  assert.ok(soft.distance>=config.goalkeeping.puntMinDistance-1e-6&&hard.distance>soft.distance+4,`${soft.distance.toFixed(1)} < ${hard.distance.toFixed(1)}`);
  assert.ok(Math.abs(soft.x)<hx-.7&&Math.abs(hard.x)<hx-.7);
  const flight=createKeeperPuntFlight(s.ball,hard,config,1);assert.ok(flight.flight.height>2&&Math.hypot(flight.flight.x-hard.x,flight.flight.z-hard.z)<1e-6);
});
test('while the keeper holds the ball, the team moves to goal-kick outlets and offers a pass',()=>{
  const {g,s}=keeperFixture(3);s.players[2].think=100;s.players[2].hold=0;
  for(let i=0;i<Math.round(1.6/dt);i++){g.update(dt,{moveX:0,moveZ:0});s.players[2].hold=0;}
  const mates=s.players.filter(p=>p.team===0&&p.role!=='keeper');
  const outlets=mates.filter(p=>typeof p.duty==='string'&&p.duty.startsWith('goal-kick'));
  assert.ok(outlets.length>=3,`outlet duties: ${mates.map(p=>p.duty).join(',')}`);
  assert.ok(mates.some(p=>p.request),'at least one open team-mate asks for the ball');
  assert.ok(s.ball.owner===2&&s.players[2].hands,'the keeper still holds');
});
test('ground pass: the charging marker and the ball agree on the landing point',()=>{
  const g=createSoccer({config,seed:5,stage:2,role:'field'}),s=g.getState();
  Object.assign(s,{phase:'playing',phaseTime:0,attackDir:1,controlled:0,switchCooldown:100,restart:null});
  for(const p of s.players)Object.assign(p,{x:(p.team?1:-1)*8+(p.id%3)*2,z:(p.id%3-1)*7,vx:0,vz:0,fx:p.team?-1:1,fz:0,cooldown:100,think:100,recover:0,slideTime:0,hands:false});
  const p=s.players[0];Object.assign(p,{x:-4,z:0,fx:1,fz:0,cooldown:0});Object.assign(s.players[1],{x:3,z:0});Object.assign(s.ball,{owner:0,x:p.x+.4,z:0,y:r,vx:0,vz:0,vy:0,flight:null,shot:null,lastTeam:0,lastPlayer:0});
  s.aim={x:1,z:0};
  g.update(dt,{moveX:0,moveZ:0,passHeld:true});g.update(dt,{moveX:0,moveZ:0,passHeld:true});
  const marker=passLanding(s,config);assert.ok(marker,'a ground pass shows its landing marker while charging');
  g.update(dt,{moveX:0,moveZ:0,passHeld:false});
  let t=0,closest=Infinity;const target=s.passTarget;assert.ok(target&&target.kind==='ground');
  while(t<2.5){g.update(dt,{moveX:0,moveZ:0});t+=dt;closest=Math.min(closest,Math.hypot(s.ball.x-target.x,s.ball.z-target.z));if(s.ball.owner!==null&&t>.1||Math.hypot(s.ball.vx,s.ball.vz)<.3)break;}
  assert.ok(closest<1.2,`the ball passes through the shown point (${closest.toFixed(2)} m)`);
  assert.ok(Math.hypot(marker.x-target.x,marker.z-target.z)<2.5,'the marker matched the release point');
});
