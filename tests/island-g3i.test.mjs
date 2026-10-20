import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer,seededRandom} from '../workout/island/minigames/soccer.mjs';
import {inPenaltyArea} from '../workout/island/minigames/soccer-physics.mjs';
import {fieldTarget} from '../workout/island/minigames/soccer-tactics.mjs';
const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames.soccer,dt=c.match.fixedStep;
const advance=(g,seconds,input={})=>{for(let i=0;i<Math.round(seconds/dt);i++)g.update(dt,input);};
function isolated(options={}){
 const g=createSoccer({config:c,...options}),s=g.getState();
 for(const p of s.players)Object.assign(p,{x:p.team?10:-10,z:p.id%2?9:-9,recover:100,cooldown:100,think:100,vx:0,vz:0});
 Object.assign(s.players[0],{x:0,z:0,recover:0,cooldown:0,fx:1,fz:0});s.controlled=0;s.switchCooldown=100;s.ball.grace=100;
 return g;
}
for(const difficulty of ['easy','normal','hard'])for(const attackDir of [-1,1])test(`G3i ${difficulty}, direction ${attackDir}: walk into the area with the keeper holding; release within 3s`,()=>{
 const g=isolated({difficulty}),s=g.getState(),k=s.players[5],p=s.players[0];s.attackDir=attackDir;
 Object.assign(k,{x:attackDir*16.5,z:0,hands:true,hold:0,recover:0,cooldown:0,fx:-attackDir,fz:0});
 Object.assign(p,{x:attackDir*12,z:2,fx:attackDir,fz:0});Object.assign(s.ball,{owner:5,x:k.x-attackDir*c.goalkeeping.holdForward,z:0,y:c.goalkeeping.holdHeight,lastTeam:1});
 advance(g,.6,{moveX:attackDir});assert.ok(inPenaltyArea(k,p,s,c));assert.ok(k.hands);assert.equal(s.ball.owner,k.id);
 advance(g,2.4);assert.equal(k.hands,false);assert.notEqual(s.ball.owner,k.id);assert.ok(g.drainEvents().some(e=>e.type==='pass'&&e.player===k.id));assert.ok(c.goalkeeping.maxHoldSeconds<=3);
});
for(const action of ['standing','slide','automatic'])for(const height of [c.goalkeeping.holdHeight,c.physics.ballRadius])test(`G3i ${action} cannot steal from keeper hands at height ${height}`,()=>{
 const g=isolated({random:()=>0}),s=g.getState(),k=s.players[5],p=s.players[0];Object.assign(k,{x:16,z:0,hands:true,recover:100,fx:-1,fz:0});
 Object.assign(p,{x:15.3,z:0});Object.assign(s.ball,{owner:k.id,x:15.66,z:0,y:height,grace:0,lastTeam:1});
 if(action==='automatic'){s.controlled=1;s.players[1].recover=0;}
 g.update(dt,action==='standing'?{passPressed:true}:action==='slide'?{kickHeld:true,moveX:1}:{});
 assert.equal(s.ball.owner,k.id);assert.ok(k.hands);assert.equal(g.drainEvents().some(e=>e.won),false);
});
test('G3i standing steal reaches a ball at 1.1m, but not beyond 1.2m',()=>{
 for(const range of [1.1,1.21]){
  const g=isolated({random:()=>0}),s=g.getState();Object.assign(s.players[3],{x:range+.3,z:0,fx:-1,fz:0});Object.assign(s.ball,{owner:3,x:range,z:0,y:c.physics.ballRadius});
  g.update(dt,{passPressed:true});assert.equal(s.ball.owner,range<1.2?0:3);
 }
});
for(const difficulty of ['easy','normal','hard'])test(`G3i ${difficulty}: actual standing-steal rate within 10 percentage points, rear approach harder`,t=>{
 const results={};
 for(const [side,x,z]of [['front',.8,0],['side',0,.8],['rear',-.8,0]]){
  const g=isolated({difficulty,random:seededRandom(9182)}),s=g.getState(),p=s.players[0],owner=s.players[3];let wins=0;
  p.guard=1;p.card.defense=owner.card.defense=c.card.initial;
  for(let trial=0;trial<3000;trial++){
   g.clearInput();Object.assign(p,{x,z,vx:0,vz:0,stealCooldown:0,recover:0,cooldown:0});Object.assign(owner,{x:0,z:0,fx:1,fz:0,hands:false});Object.assign(s.ball,{owner:3,x:0,z:0,y:c.physics.ballRadius,grace:100});g.update(dt,{passPressed:true});wins+=Number(g.drainEvents().some(e=>e.type==='steal'&&e.won));
  }
  results[side]=wins/3000;
 }
 const expected=c.steal.baseChance[difficulty];for(const side of ['front','side'])assert.ok(Math.abs(results[side]-expected)<=.1,JSON.stringify(results));
 assert.ok(results.rear<results.front*.7&&results.rear<results.side*.7);assert.equal(c.steal.reach,1.2);t.diagnostic(JSON.stringify({difficulty,expected,...results}));
});
for(const [difficulty,target,minimum]of [['easy',2,5],['normal',4,3.5],['hard',6,2.5]])test(`G3i ${difficulty}: spacing >= ${minimum}m and >= ${target} rival shots in 90s without input`,t=>{
 const rows=[];
 for(const stage of [1,5,10])for(let seed=1;seed<=5;seed++){
  const g=createSoccer({config:c,difficulty,stage,seed}),s=g.getState();let sum=0,samples=0,shots=0,passes=0,open=0;
  for(let i=0;i<90/dt;i++){
   g.update(dt);for(const e of g.drainEvents())if(e.team===1){shots+=Number(e.type==='shot');passes+=Number(e.type==='pass');}
   if(s.phase!=='playing')continue;
   for(const p of s.players)if(p.team===0&&p.role!=='keeper'&&p.id!==s.ball.owner){const distance=Math.min(...s.players.filter(q=>q.team===1).map(q=>Math.hypot(q.x-p.x,q.z-p.z)));sum+=distance;samples++;if(p.request&&distance>=minimum)open++;}
  }
  const average=sum/samples;assert.ok(average>=minimum,JSON.stringify({difficulty,stage,seed,average}));assert.ok(shots>=target,JSON.stringify({difficulty,stage,seed,shots,target}));assert.ok(passes>0);assert.ok(open>0);rows.push({stage,seed,shots,averageMetres:average});
 }
 t.diagnostic(JSON.stringify({difficulty,rows}));
});
test('G3i covering defenders return to their zones instead of following off-ball runs',()=>{
 const g=createSoccer({config:c,difficulty:'easy'}),s=g.getState();s.ball.owner=0;
 // Put the ball far from the defender so it remains a covering player.
 Object.assign(s.ball,{x:-10,z:0});Object.assign(s.players[3],{x:-9,z:0});Object.assign(s.players[4],{x:7,z:7});
 const before=fieldTarget(s.players[4],s,c);Object.assign(s.players[1],{x:-16,z:-10});const after=fieldTarget(s.players[4],s,c);
 assert.equal(before.duty,'cover');assert.deepEqual(after,before);
});
test('G3i support opens a clear passing lane away from a nearby defender',()=>{
 const g=createSoccer({config:c}),s=g.getState();Object.assign(s.players[0],{x:0,z:0});s.ball.owner=0;Object.assign(s.players[1],{x:3,z:-7});Object.assign(s.players[4],{x:-3,z:-7});
 const target=fieldTarget(s.players[1],s,c);assert.equal(target.duty,'support');assert.ok(Math.hypot(target.x-s.players[4].x,target.z-s.players[4].z)>c.tactics.markDistance.normal);
});
