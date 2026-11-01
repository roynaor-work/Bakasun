import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fieldTarget,separatePlayers,selectTeamPass,keeperTarget,hasShootingLane,teamPassPoint} from '../workout/island/minigames/soccer-tactics.mjs';
import {teamFormation,teamPresser} from '../workout/island/minigames/soccer-teamplay.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function fixture(){
 const hx=config.pitch.length/2,positions=[[0,0],[-4,-6],[-hx+1.2,0],[3,0],[6,6],[hx-1.2,0],[-4,6],[6,-6]];
 return {difficulty:'normal',attackDir:1,controlled:0,players:config.players.roster.map((p,id)=>({...p,id,x:positions[id][0],z:positions[id][1],vx:0,vz:0,recover:0,slideTime:0})),ball:{owner:0,x:.49,z:0,y:config.physics.ballRadius,vx:0,vz:0,grace:0,lastTeam:0}};
}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}

for(const team of [0,1])test(`teamplay team ${team}: one player presses a free ball and two retain separate cover lanes`,()=>{
 const s=fixture();Object.assign(s.ball,{owner:null,x:1,z:1,vx:2,vz:-1});
 const targets=s.players.filter(p=>p.team===team&&p.role!=='keeper').map(p=>fieldTarget(p,s,config));
 assert.equal(targets.filter(p=>p.duty==='press').length,1);
 const cover=targets.filter(p=>p.duty==='cover');assert.equal(cover.length,2);
 assert.ok(distance(cover[0],cover[1])>=5,'cover players leave both a central and a wide option');
 assert.ok(cover.every(p=>distance(p,s.ball)>config.tactics.markDistance.normal));
});

test('teamplay a close incumbent keeps the press, then releases it to a clearly nearer teammate',()=>{
 const s=fixture();Object.assign(s.ball,{owner:null,x:1,z:0});
 Object.assign(s.players[0],{x:0,z:0,duty:'press'});Object.assign(s.players[1],{x:.2,z:0});
 assert.equal(teamPresser(0,s,config).id,0,'small distance changes do not swap roles');
 s.players[1].x=.9;assert.equal(teamPresser(0,s,config).id,1,'a real advantage changes the presser');
 s.players[1].recover=.3;assert.equal(teamPresser(0,s,config).id,0,'recovering players do not reserve the press');
});

for(const team of [0,1])test(`teamplay team ${team}: a marked support player moves to an open receiving lane`,()=>{
 const s=fixture(),owner=s.players[team===0?0:3],support=s.players[team===0?1:4],blocker=s.players[team===0?4:1],d=team===0?1:-1;
 Object.assign(owner,{x:0,z:0});s.ball.owner=owner.id;
 // Isolate the original unpressed-carrier receiving-lane case.
 // The new pressure/outlet behavior has separate teamshape coverage.
 for(const opponent of s.players.filter(p=>p.team!==team&&p.id!==blocker.id))Object.assign(opponent,{x:-d*12,z:0});
 Object.assign(support,{x:3*d,z:-7*d});Object.assign(blocker,{x:-3*d,z:-7*d});
 assert.ok(s.players.filter(p=>p.team!==team).every(p=>distance(p,owner)>config.tactics.outlet.pressure));
 const target=fieldTarget(support,s,config);
 assert.equal(target.duty,'support');assert.ok(distance(target,blocker)>config.tactics.markDistance.normal);
 assert.ok(distance(target,owner)>=config.ai.requestDistance,'receiving option stays outside the carrier’s feet');
});

test('teamplay support roles preserve two sides of the pitch while a striker carries',()=>{
 for(const team of [0,1]){
  const s=fixture(),owner=s.players[team===0?0:3];Object.assign(owner,{x:0,z:0});s.ball.owner=owner.id;
  for(const opponent of s.players.filter(p=>p.team!==team))Object.assign(opponent,{x:15,z:0});
  const support=s.players.filter(p=>p.team===team&&p.role!=='keeper'&&p!==owner).map(p=>fieldTarget(p,s,config));
  assert.ok(support[0].z*support[1].z<0);assert.ok(Math.abs(support[0].z-support[1].z)>=10);
 }
});

test('teamplay campaign formations alter the rival shape without changing home support',()=>{
 const s=fixture(),widths=[];
 // Remove pressure so formation width, rather than an avoidance run, is measured.
 for(const p of s.players.filter(p=>p.team===0))Object.assign(p,{x:-17,z:0});
 Object.assign(s.players[3],{x:0,z:0});s.ball.owner=0;
 const home=fieldTarget(s.players[1],s,config);s.ball.owner=3;
 for(const formation of ['compact','balanced','wide']){
  s.campaign={formation};widths.push(Math.abs(fieldTarget(s.players[4],s,config).z));
  s.ball.owner=0;assert.deepEqual(fieldTarget(s.players[1],s,config),home);s.ball.owner=3;
 }
 assert.ok(widths[0]<widths[1]&&widths[1]<widths[2],JSON.stringify(widths));
 assert.equal(teamFormation(1,{...s,campaign:null},{...config,tactics:{...config.tactics,stageFormation:'counter'}}).name,'counter');
 assert.equal(teamFormation(1,{...s,campaign:{formation:'unknown'}},config).name,'balanced');
});

test('teamplay both ends, six formations and fast free balls always produce finite in-pitch targets',()=>{
 for(const attackDir of [-1,1])for(const formation of ['balanced','wide','compact','counter','press','diamond'])for(const side of [-1,1]){
  const s=fixture();Object.assign(s,{attackDir,campaign:{formation}});Object.assign(s.ball,{owner:null,x:side*config.pitch.length/2,z:side*config.pitch.width/2,vx:side*27,vz:side*15});
  for(const p of s.players.filter(p=>p.role!=='keeper')){
   const target=fieldTarget(p,s,config);assert.ok(Number.isFinite(target.x)&&Number.isFinite(target.z));
   assert.ok(Math.abs(target.x)<=config.pitch.length/2-config.tactics.goalInset);
   assert.ok(Math.abs(target.z)<=config.pitch.width/2-config.tactics.sideInset);
  }
 }
});

test('teamplay a safe lateral pass beats a crowded forward option for either team',()=>{
 for(const mirror of [false,true]){
  const s=fixture();Object.assign(s.players[1],{x:8,z:0});Object.assign(s.players[6],{x:3,z:7});
  Object.assign(s.players[3],{x:4,z:0});Object.assign(s.players[4],{x:9,z:0});Object.assign(s.players[7],{x:-8,z:-8});
  if(mirror)for(const p of s.players){p.team=1-p.team;p.x=-p.x;p.z=-p.z;}
  const passer=s.players[0];assert.equal(selectTeamPass(passer,s,config).id,6);
 }
});

test('teamplay pass choice accounts for where a moving receiver will arrive',()=>{
 const s=fixture();Object.assign(s.players[1],{x:6,z:2,vx:0,vz:-8});Object.assign(s.players[6],{x:3,z:7});
 Object.assign(s.players[3],{x:4,z:0});Object.assign(s.players[4],{x:9,z:0});Object.assign(s.players[7],{x:-8,z:-8});
 assert.equal(selectTeamPass(s.players[0],s,config).id,6,'receiver running into a blocked lane loses to the open wing');
});

test('teamplay a receiver running out toward either touchline has a reachable in-pitch pass point',()=>{
 for(const side of [-1,1]){
  const member={x:side*(config.pitch.length/2-.4),z:side*(config.pitch.width/2-.4),vx:side*10,vz:side*8};
  const point=teamPassPoint(member,config);
  assert.ok(Math.abs(point.x)<=config.pitch.length/2-config.rules.playerBoundary);
  assert.ok(Math.abs(point.z)<=config.pitch.width/2-config.rules.playerBoundary);
  assert.ok(distance(point,member)<.2,'the lead prediction stays in the receiver’s local playable area');
 }
});

test('teamplay shooting corridors use visible field defenders and leave the actual keeper to make a save',()=>{
 const s=fixture(),p=s.players[0];Object.assign(p,{x:4,z:0});Object.assign(s.ball,{x:4.49,z:0});
 Object.assign(s.players[3],{x:6,z:0});Object.assign(s.players[4],{x:15,z:9});Object.assign(s.players[7],{x:15,z:-9});
 assert.equal(hasShootingLane(p,s,config),false,'do not fire straight into a nearby presser');
 s.players[3].z=3;assert.equal(hasShootingLane(p,s,config),true,'a real sidestep opens the shot');
 Object.assign(s.players[5],{x:config.pitch.length/2-1,z:0});assert.equal(hasShootingLane(p,s,config),true,'a keeper on the line is not treated as an impossible shot');
});

test('teamplay an unavailable receiver is skipped and a keeper can still release during recovery',()=>{
 const s=fixture();s.players[1].recover=1;assert.equal(selectTeamPass(s.players[0],s,config).id,6);
 for(const p of s.players.filter(p=>p.team===0&&p.role!=='keeper'))p.recover=1;
 assert.ok(selectTeamPass(s.players[2],s,config),'no empty target or infinite hand hold when all field players recover');
});

test('teamplay keeper reacts to a released ball after a short delay, independently of any aim fields',()=>{
 const s=fixture(),p=s.players[2];Object.assign(s.ball,{owner:null,x:-10,z:1,y:.6,vx:-20,vz:2,lastTeam:1,grace:config.physics.possessionGrace});
 const early=keeperTarget(p,s,config);s.ball.grace=.2;const reacted=keeperTarget(p,s,config);
 assert.ok(reacted.z>early.z+.4,'keeper starts toward the observed shot trajectory');
 s.aim={x:-1,z:-1};s.kickAim={manual:true,x:1,z:1};s.input={moveZ:-1,kickHeld:true};
 assert.deepEqual(keeperTarget(p,s,config),reacted,'opponent intent is never read');
 assert.equal(reacted.x,-(config.pitch.length/2-config.ai.keeperInset),'reaction changes a movement target, never the player’s position');
});

test('teamplay keeper sweeps a reachable loose ball but holds the line when an attacker arrives first',()=>{
 const s=fixture(),p=s.players[2],hx=config.pitch.length/2;Object.assign(s.ball,{owner:null,x:-hx+2.2,z:0,vx:0,vz:0,lastTeam:1});
 assert.equal(keeperTarget(p,s,config).duty,'keeper-sweep');
 Object.assign(s.players[3],{x:-hx+2.3,z:0});assert.equal(keeperTarget(p,s,config).duty,'keeper-track');
 s.ball.y=3;assert.equal(keeperTarget(p,s,config).duty,'keeper-track','an unreachable high ball does not pull the keeper out');
 Object.assign(s.ball,{y:config.physics.ballRadius,z:3.3});Object.assign(p,{z:2.4});Object.assign(s.players[3],{x:3,z:0});
 assert.equal(keeperTarget(p,s,config).z,3.3,'a safe sweep may leave the goal mouth while staying in the area');
});

test('teamplay keeper targets remain between the posts and inside either penalty area',()=>{
 for(const attackDir of [-1,1])for(const z of [-40,40]){
  const s=fixture();s.attackDir=attackDir;Object.assign(s.ball,{owner:null,x:-10*attackDir,z,vx:-30*attackDir,vz:z,lastTeam:1});
  const target=keeperTarget(s.players[2],s,config),localX=target.x*attackDir,hx=config.pitch.length/2;
  assert.ok(localX>=-hx+config.goalkeeping.areaInset&&localX<=-hx+config.pitch.penaltyDepth-config.goalkeeping.areaInset);
  assert.ok(Math.abs(target.z)<=config.pitch.goalWidth/2-config.ai.keeperPostInset);
 }
});

test('teamplay separation never moves the controlled child, even when players start coincident',()=>{
 const s=fixture(),p=s.players[0];Object.assign(s.players[1],{x:p.x,z:p.z});const before={x:p.x,z:p.z};
 separatePlayers(s,config);assert.deepEqual({x:p.x,z:p.z},before);assert.ok(distance(p,s.players[1])>=config.tactics.teammateDistance-1e-6);
 assert.ok(s.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
});

test('teamplay tactical marking distances never push bodies that are not touching',()=>{
 const s=fixture();Object.assign(s.players[3],{x:2,z:0});const before=structuredClone(s.players);
 const spacious={...config,tactics:{...config.tactics,markDistance:{easy:30,normal:30,hard:30},teammateDistance:30}};
 separatePlayers(s,spacious);assert.deepEqual(s.players,before,'only the bounded body radius is used for physical separation');
});

test('teamplay planning is deterministic and leaves state, cards and configuration untouched',()=>{
 const s=freeze(fixture()),c=freeze(structuredClone(config));
 const plan=()=>({targets:s.players.filter(p=>p.role!=='keeper').map(p=>fieldTarget(p,s,c)),pass:selectTeamPass(s.players[0],s,c).id,keeper:keeperTarget(s.players[2],s,c)});
 assert.deepEqual(plan(),plan());
});

function homeAttack(role='keeper'){
 const game=createSoccer({config,role,stage:15,seed:41}),s=game.getState(),hx=config.pitch.length/2,hz=config.pitch.width/2;
 for(const p of s.players)Object.assign(p,{x:(p.team===0?-1:1)*(hx-2),z:p.id%2?hz-2:-hz+2,recover:100,cooldown:100,think:100,vx:0,vz:0});
 s.controlled=role==='keeper'?2:6;s.switchCooldown=100;
 Object.assign(s.players[0],{x:hx-12,z:0,fx:1,fz:0,hold:.8,think:0,recover:0,cooldown:0});
 Object.assign(s.players[1],{x:hx-9,z:5,recover:0});Object.assign(s.players[3],{x:hx-10,z:1});
 Object.assign(s.ball,{owner:0,x:hx-12+config.physics.dribbleOffset,z:0,y:config.physics.ballRadius,vx:0,vz:0,grace:100,lastTeam:0});
 return game;
}
test('teamplay when the child is keeper, a home attacker shoots from a good lane before recycling under pressure',()=>{
 const game=homeAttack();game.update(config.match.fixedStep);assert.ok(game.drainEvents().some(e=>e.type==='shot'&&e.team===0));
});

test('teamplay home keeper-role attackers use a shot interval and keep passing outside the shooting lane',()=>{
 const game=homeAttack(),s=game.getState(),p=s.players[0],x=config.pitch.length/2-12;game.update(config.match.fixedStep);game.drainEvents();
 Object.assign(p,{x,z:0,cooldown:0,think:0,hold:.8});Object.assign(s.ball,{owner:0,x:x+config.physics.dribbleOffset,z:0,grace:100});
 game.update(config.match.fixedStep);assert.ok(game.drainEvents().some(e=>e.type==='pass'&&e.team===0),'another pass remains available between shots');
 s.elapsed+=10;Object.assign(p,{x,z:0,cooldown:0,think:0,hold:.8});Object.assign(s.ball,{owner:0,x:x+config.physics.dribbleOffset,z:0,grace:100});
 game.update(config.match.fixedStep);assert.ok(game.drainEvents().some(e=>e.type==='shot'&&e.team===0));
 const wide=homeAttack(),w=wide.getState();w.players[0].z=8;w.ball.z=8;wide.update(config.match.fixedStep);
 assert.equal(wide.drainEvents().some(e=>e.type==='shot'&&e.team===0),false,'wide angles do not produce indiscriminate automatic shots');
});

test('teamplay attacking shot priority does not change the original field-player policy',()=>{
 const game=homeAttack('field');game.update(config.match.fixedStep);const events=game.drainEvents();
 assert.ok(events.some(e=>e.type==='pass'&&e.team===0));assert.equal(events.some(e=>e.type==='shot'&&e.team===0),false);
});

test('teamplay keeper-role teammates advance with the ball before a pressured backward pass',()=>{
 const game=homeAttack(),s=game.getState(),p=s.players[0];
 Object.assign(p,{x:-8,z:0,carryStartX:-8});Object.assign(s.players[1],{x:-12,z:5});Object.assign(s.players[3],{x:-6,z:1});Object.assign(s.ball,{x:-7.51,z:0});
 game.update(config.match.fixedStep);assert.equal(game.drainEvents().some(e=>e.type==='pass'&&e.team===0),false,'a freshly received ball is not sent straight back');
 Object.assign(p,{x:-5,z:0,think:0,cooldown:0});Object.assign(s.players[1],{x:-8,z:5});Object.assign(s.players[3],{x:-3,z:1});Object.assign(s.ball,{owner:0,x:-4.51,z:0,grace:100});
 game.update(config.match.fixedStep);assert.ok(game.drainEvents().some(e=>e.type==='pass'&&e.team===0),'a real forward carry allows a safe recycle');
});

for(const team of [0,1])test(`teamplay team ${team}: a real AI pass keeps its physical origin and guides a local receiver without stopping momentum`,()=>{
 const game=createSoccer({config,role:'keeper',stage:15,seed:41}),s=game.getState(),d=team===0?1:-1;
 for(const p of s.players)Object.assign(p,{x:p.team===0?-16:16,z:p.id%2?9:-9,recover:100,cooldown:100,think:100,vx:0,vz:0});
 const sender=s.players[team===0?1:4],receiver=s.players[team===0?0:3],blocker=s.players[team===0?3:0];
 Object.assign(sender,{x:-6*d,z:0,fx:d,fz:0,hold:1,carryStartX:-9*d,think:0,recover:0,cooldown:0,kick:1});
 Object.assign(receiver,{x:0,z:4*d,vx:3*d,vz:0,think:100,recover:0,cooldown:0});
 Object.assign(blocker,{x:-4*d,z:-d});sender.card.pass=config.card.initial;
 Object.assign(s.ball,{owner:sender.id,x:-6*d+.49*d,z:0,y:config.physics.ballRadius,vx:0,vz:0,grace:100,lastTeam:team});
 const origin={x:s.ball.x,z:s.ball.z};game.update(config.match.fixedStep);
 const pass=game.drainEvents().find(e=>e.type==='pass'&&e.team===team);assert.ok(pass);
 assert.equal(s.passTarget.player,receiver.id);assert.equal(s.passTarget.kind,'ground');
 assert.deepEqual({x:s.passTarget.startX,z:s.passTarget.startZ},origin,'neither team moves the ball to a new foot position before release');
 const speed=Math.hypot(s.ball.vx,s.ball.vz);assert.ok(distance(s.ball,origin)<=speed*config.match.fixedStep+.02,'first ball step is actual flight');
 for(let tick=0;tick<90&&s.ball.owner!==receiver.id;tick++)game.update(config.match.fixedStep);
 assert.equal(s.ball.owner,receiver.id,'receiver meets the pass with normal local pickup');
 assert.ok(distance(receiver,s.ball)<=config.physics.pickupRadius+.12);assert.ok(Math.hypot(receiver.vx,receiver.vz)>.15,'receiving does not zero the runner’s velocity');
});

for(const team of [0,1])test(`teamplay team ${team}: a cooldown-blocked attempt does not reserve the next AI shooting interval`,()=>{
 const game=homeAttack(),s=game.getState(),p=s.players[team===0?0:3];
 if(team===1){
  Object.assign(s.players[0],{x:6,z:9,recover:100});
  Object.assign(p,{x:-config.pitch.length/2+6,z:0,fx:-1,fz:0,recover:0,hold:1,think:0});
  Object.assign(s.ball,{owner:p.id,x:p.x-.49,z:0,lastTeam:1,grace:100});
 }
 p.cooldown=.1;game.update(config.match.fixedStep);
 assert.equal(game.drainEvents().some(e=>e.type==='shot'&&e.team===team),false);
 p.cooldown=0;p.think=0;game.update(config.match.fixedStep);
 assert.ok(game.drainEvents().some(e=>e.type==='shot'&&e.team===team),'the first legal shot does not wait for a phantom attempt');
});
