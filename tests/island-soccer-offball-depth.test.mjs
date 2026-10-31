import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fieldTarget,steerFieldTarget,separatePlayers} from '../workout/island/minigames/soccer-tactics.mjs';
import {defensiveMark,teamPresser} from '../workout/island/minigames/soccer-teamplay.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';

const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function fixture(){
 const positions=[[0,0],[-5,-6],[-16.3,0],[3,0],[-3,6],[16.3,0],[-4,7],[5,-7]];
 return {difficulty:'normal',attackDir:1,controlled:0,campaign:null,players:c.players.roster.map((p,id)=>({...p,id,x:positions[id][0],z:positions[id][1],vx:0,vz:0,recover:0,slideTime:0})),ball:{owner:0,x:.49,z:0,y:c.physics.ballRadius,vx:0,vz:0,lastTeam:0}};
}
const fields=(s,team)=>s.players.filter(p=>p.team===team&&p.role!=='keeper');
function rotate(s){
 s.attackDir*=-1;
 for(const p of s.players){p.x*=-1;p.z*=-1;p.vx*=-1;p.vz*=-1;}
 for(const key of ['x','z','vx','vz'])s.ball[key]*=-1;
 return s;
}
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} differs from ${b}`);

test('off-ball plans rotate with attack direction for possession, loose balls and defense',()=>{
 for(const owner of [0,3,null]){
  const s=fixture();s.ball.owner=owner;const other=rotate(structuredClone(s));
  for(const p of s.players.filter(p=>p.role!=='keeper')){
   const a=fieldTarget(p,s,c),b=fieldTarget(other.players[p.id],other,c);
   approx(a.x,-b.x);approx(a.z,-b.z);assert.equal(a.duty,b.duty);assert.equal(a.markedPlayer,b.markedPlayer);
  }
 }
});

test('off-ball defense reserves one presser and a different marker for each visible runner',()=>{
 for(const direction of [1,-1]){
  const s=direction===1?fixture():rotate(fixture());s.ball.owner=3;
  Object.assign(s.ball,{x:s.players[3].x,z:s.players[3].z});
  const presser=teamPresser(0,s,c),markers=fields(s,0).filter(p=>p!==presser);
  const assigned=markers.map(p=>defensiveMark(p,s,c,presser));
  assert.equal(assigned.length,2);assert.ok(assigned.every(Boolean));
  assert.equal(new Set(assigned.map(p=>p.id)).size,2,'a runner never attracts both coverers');
  assert.ok(assigned.every(p=>p.id!==3&&p.role!=='keeper'));
  assert.equal(defensiveMark(presser,s,c,presser),null,'the press keeps its own duty');
  for(const p of markers){const t=fieldTarget(p,s,c);assert.equal(t.duty,'cover');assert.ok(distance(t,s.ball)>=c.tactics.markDistance.normal);}
 }
});

test('off-ball marking never reserves a runner for a recovering defender',()=>{
 const s=fixture();s.ball.owner=3;s.players[1].recover=.5;
 assert.equal(defensiveMark(s.players[1],s,c),null);
 const marker=defensiveMark(s.players[6],s,c);assert.ok(marker,'available coverer still picks up a runner');
});

test('off-ball back line retains recovery depth while the free ball is far upfield',()=>{
 for(const direction of [1,-1]){
  const s=fixture();s.ball.owner=null;s.ball.x=16;s.ball.z=0;
  if(direction<0)rotate(s);
  const plans=fields(s,0).map(p=>fieldTarget(p,s,c));
  const cover=plans.filter(p=>p.duty==='cover');assert.equal(cover.length,2);
  assert.ok(cover.every(p=>p.x*s.attackDir<8),'a turnover does not leave all three field players at the far goal');
  assert.ok(distance(cover[0],cover[1])>5,'defensive lanes remain separated');
 }
});

test('off-ball an established high press connects cover to the visible carrier while introductory and loose-ball shapes retain depth',()=>{
 for(const team of [0,1])for(const direction of [-1,1]){
  const member=(id,role,x,z,teamId=team)=>({id,team:teamId,role,x:x*direction,z:z*direction,vx:0,vz:0,recover:0,slideTime:0});
  const s={difficulty:'normal',attackDir:direction*(team===0?1:-1),stage:8,campaign:null,controlled:0,
   players:[member(0,'striker',13,0),member(1,'support',7,-7),member(2,'wing',7,7),member(3,'keeper',14,0,1-team)],
   ball:{owner:null,x:14*direction,z:0,vx:0,vz:0}};
  const cover=s.players[1],loose=fieldTarget(cover,s,c);
  s.ball.owner=3;const connected=fieldTarget(cover,s,c);
  assert.equal(loose.duty,'cover');assert.equal(connected.duty,'cover');
  assert.ok((connected.x-loose.x)*direction>=c.tactics.openSpaceStep,'a supporting line follows the high press by at least one passing corridor');
  assert.equal(connected.z,loose.z,'connecting depth does not collapse the wide lane');
  s.stage=1;assert.deepEqual(fieldTarget(cover,s,c),loose,'the introductory profile retains its original recovery shape');
  s.stage=12;s.league={tuning:c.ai.crossFromStage-.25};
  assert.deepEqual(fieldTarget(cover,s,c),loose,'a later saved league match still uses its introductory interpolated tuning');
  s.league.tuning=c.ai.crossFromStage;
  assert.deepEqual(fieldTarget(cover,s,c),connected,'the existing actual capability threshold enables the connected high press');
 }
});

test('off-ball goalkeeper possession opens three forward distribution lines in either half',()=>{
 for(const direction of [1,-1]){
  const s=fixture();s.ball.owner=2;Object.assign(s.ball,{x:s.players[2].x,z:0});
  for(const p of s.players)if(p.team===1)Object.assign(p,{x:15,z:0});
  if(direction<0)rotate(s);
  const keeper=s.players[2],plans=fields(s,0).map(p=>fieldTarget(p,s,c));
  assert.ok(plans.every(p=>(p.x-keeper.x)*s.attackDir>2),'deep support comes in front of the keeper');
  assert.ok(plans.some(p=>p.z< -3)&&plans.some(p=>p.z>3),'short outlets use both sides');
  assert.ok(Math.max(...plans.map(p=>p.x*s.attackDir))-Math.min(...plans.map(p=>p.x*s.attackDir))>5,'forward, middle and deep lines are staggered');
 }
});

test('off-ball role corridors spread coincident teammates without teleporting their bodies',()=>{
 const s=fixture();for(const p of fields(s,0))Object.assign(p,{x:0,z:0});
 for(const p of s.players)if(p.team===1)Object.assign(p,{x:14,z:0});
 const before=structuredClone(s.players),plans=[1,6].map(id=>fieldTarget(s.players[id],s,c));
 assert.ok(plans[0].z*plans[1].z<0);assert.ok(distance(plans[0],plans[1])>=10);
 assert.deepEqual(s.players,before,'planning changes intent only');
 const human=structuredClone(s.players[0]);separatePlayers(s,c);
 assert.deepEqual(s.players[0],human,'separation never displaces the controlled player');
});

test('off-ball the wing runs beyond the deep outlet to offer a diagonal progression pass',()=>{
 for(const direction of [1,-1]){
  const s=fixture();for(const p of s.players)if(p.team===1)Object.assign(p,{x:15,z:0});
  if(direction<0)rotate(s);
  const wing=fieldTarget(s.players[6],s,c),support=fieldTarget(s.players[1],s,c);
  assert.ok((wing.x-support.x)*s.attackDir>=4,'the wide runner and the deep support occupy different lines');
  assert.ok(wing.z*support.z<0,'both passing sides stay open');
 }
});

test('off-ball a box runner stays in the crossing corridor while finding space around markers',()=>{
 for(const direction of [1,-1])for(const side of [1,-1]){
  const s=fixture();Object.assign(s.players[6],{x:9,z:side*6.5});
  s.ball.owner=6;Object.assign(s.ball,{x:9.49,z:side*6.5});
  Object.assign(s.players[3],{x:14.5,z:-side*1.2});Object.assign(s.players[4],{x:15,z:side*4});Object.assign(s.players[7],{x:12,z:-side*4});
  if(direction<0)rotate(s);
  const runner=fieldTarget(s.players[0],s,c),d=s.attackDir;
  assert.equal(runner.duty,'box-run');
  assert.ok(runner.x*d>c.pitch.length/2-c.pitch.penaltyDepth-1.5,'the actual cross receiver gate remains reachable');
  assert.ok(runner.x*d>=c.pitch.length/2-c.pitch.penaltyDepth+.3-1e-9,'space search keeps the runner inside the area');
  assert.ok(Math.abs(runner.z)<c.pitch.penaltyWidth/2+.5,'the runner stays in a receiving lane rather than returning to the wing');
 }
});

test('off-ball a wide carrier triggers the receiver run before the cross delivery zone',()=>{
 for(const direction of [1,-1])for(const side of [1,-1]){
  const s=fixture();Object.assign(s.players[6],{x:3,z:side*6.5});
  s.ball.owner=6;Object.assign(s.ball,{x:3.49,z:side*6.5});
  if(direction<0)rotate(s);
  assert.ok(c.pitch.length/2-s.players[6].x*s.attackDir>c.ai.crossRange,'the carrier is still outside the unchanged delivery gate');
  assert.equal(fieldTarget(s.players[0],s,c).duty,'box-run','the receiver begins to get ahead of the ball');
  assert.equal(fieldTarget(s.players[1],s,c).duty,'square','one teammate still offers a shorter square pass');
 }
});

test('off-ball tactical intent follows an opening immediately without touching physical movement',()=>{
 const s=fixture(),p=s.players[1],physical={x:p.x,z:p.z,vx:p.vx,vz:p.vz};
 const initial={x:7,z:7,duty:'support',markedPlayer:null};
 const same=steerFieldTarget(p,initial,1/60,c);assert.equal(same,initial,'the caller-owned target is reused');
 assert.deepEqual({x:initial.x,z:initial.z},{x:7,z:7},'a moving receiver has no second artificial target delay');
 const next={x:-14,z:-6,duty:'cover',markedPlayer:4};steerFieldTarget(p,next,1/60,c);
 assert.equal(p.markedPlayer,4);assert.equal(p.shapeX,-14);assert.equal(p.shapeZ,-6);
 assert.deepEqual({x:p.x,z:p.z,vx:p.vx,vz:p.vz},physical);
});

test('off-ball actual body movement keeps momentum and bounded acceleration when possession and duty change',()=>{
 for(const direction of [-1,1]){
  const game=createSoccer({config:c,stage:8,seed:11}),s=game.getState(),p=s.players[1];
  s.attackDir=direction;s.controlled=0;s.switchCooldown=100;
  for(const q of s.players)Object.assign(q,{x:q.team===0?-12*direction:12*direction,z:q.id%2?8:-8,recover:100,vx:0,vz:0,cooldown:100,slideTime:0});
  Object.assign(s.players[0],{x:0,z:0});Object.assign(s.players[3],{x:12*direction,z:0,fx:-direction,fz:0});
  Object.assign(p,{x:-8*direction,z:6,recover:0,vx:3*direction,vz:0,fx:direction,fz:0});
  Object.assign(s.ball,{owner:0,x:.49*direction,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,grace:100,lastTeam:0,lastPlayer:0});
  game.update(c.match.fixedStep);
  assert.equal(p.duty,'support');const momentum={vx:p.vx,vz:p.vz};
  Object.assign(s.players[3],{x:direction,z:0});Object.assign(s.ball,{owner:3,x:.51*direction,z:0,lastTeam:1,lastPlayer:3,grace:100});
  // Existing acceleration/turning owns the physical transition. Updating the
  // tactical destination must never place the body straight at its new target.
  const speedLimit=c.players.speed*2;
  for(let tick=0;tick<30;tick++){
   const before={x:p.x,z:p.z,vx:p.vx,vz:p.vz};game.update(c.match.fixedStep);
   assert.ok(distance(before,p)<=speedLimit*c.match.fixedStep+1e-8,'body travel stays within a football running step');
   assert.ok(Math.hypot(p.vx,p.vz)<=speedLimit,'changing duties cannot add running speed');
   assert.ok(Math.hypot(p.vx-before.vx,p.vz-before.vz)<=2*speedLimit*c.players.acceleration*c.match.fixedStep,'the existing acceleration still bounds a reversal');
   if(tick===0){assert.ok(Math.hypot(p.vx,p.vz)>.1,'a turnover does not zero the runner’s momentum');assert.ok(Math.hypot(p.vx-momentum.vx,p.vz-momentum.vz)<speedLimit,'the runner cannot reverse instantaneously');}
  }
  assert.equal(s.players[0].x,0);assert.equal(s.players[0].z,0,'planning never moves the controlled player');
 }
});

test('off-ball a paused update neither changes the waypoint nor claims a new marker',()=>{
 const p={x:0,z:0,shapeX:1,shapeZ:2,markedPlayer:4},before=structuredClone(p),target={x:5,z:7,duty:'cover',markedPlayer:7};
 assert.equal(steerFieldTarget(p,target,0,c),target);assert.deepEqual(p,before);
});

test('off-ball an intended receiver owns the one team-pass chase instead of drawing a second teammate',()=>{
 for(const direction of [-1,1])for(const team of [0,1]){
  const s=fixture(),receiver=s.players[team===0?6:7],near=s.players[team===0?0:3];
  Object.assign(s.ball,{owner:null,x:near.x,z:near.z,lastTeam:team});
  s.passTarget={player:receiver.id,x:receiver.x,z:receiver.z,time:.8,kind:'ground'};
  if(direction<0)rotate(s);
  assert.equal(teamPresser(team,s,c).id,receiver.id,'the intended receiver keeps the run even before the ball is nearest to them');
  const plans=fields(s,team).map(p=>({id:p.id,...fieldTarget(p,s,c)}));
  assert.deepEqual(plans.filter(t=>t.duty==='press').map(t=>t.id),[receiver.id]);
  assert.ok(plans.filter(t=>t.id!==receiver.id).every(t=>['support','outlet','box-run','square'].includes(t.duty)),'other teammates keep attacking support instead of retreating during their own pass');
 }
});

test('off-ball a turnover, expired pass or unavailable receiver releases the reserved receiving run',()=>{
 for(const invalid of ['turnover','expired','recovering','sliding','rival','keeper']){
  const s=fixture();Object.assign(s.ball,{owner:null,x:0,z:0,lastTeam:0});
  s.passTarget={player:6,x:-4,z:7,time:.8};
  if(invalid==='turnover')s.ball.lastTeam=1;
  if(invalid==='expired')s.passTarget.time=0;
  if(invalid==='recovering')s.players[6].recover=.2;
  if(invalid==='sliding')s.players[6].slideTime=.2;
  if(invalid==='rival')s.passTarget.player=7;
  if(invalid==='keeper')s.passTarget.player=2;
  assert.equal(teamPresser(0,s,c).id,0,`${invalid} uses the normal visible-ball press`);
  assert.equal(fieldTarget(s.players[6],s,c).duty,'cover',`${invalid} also ends the possession-support transition`);
 }
});

test('off-ball support during a team pass uses only its own receiver, never an opponents hidden pass target',()=>{
 const s=fixture();Object.assign(s.ball,{owner:null,x:0,z:0,lastTeam:1});
 s.passTarget={player:7,x:5,z:-7,time:.8};
 const before=fields(s,0).map(p=>fieldTarget(p,s,c));
 s.passTarget={player:4,x:-12,z:8,time:.8};
 assert.deepEqual(fields(s,0).map(p=>fieldTarget(p,s,c)),before,'defenders use the observed free ball and hold their cover lanes');
});

test('off-ball pure planning stays deterministic with deeply frozen match data',()=>{
 const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
 const s=fixture();s.ball.owner=3;freeze(s);const config=freeze(structuredClone(c));
 const plan=()=>fields(s,0).map(p=>fieldTarget(p,s,config));
 assert.deepEqual(plan(),plan());
});
