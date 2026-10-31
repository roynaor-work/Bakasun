import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';

const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer,dt=c.match.fixedStep;
const actions=new Set(['pass','loft','shot','header','clearance','steal','slide','dive']);
function fixture(type,{role='field',seed=17}={}){
 const game=createSoccer({config:c,role,seed}),s=game.getState(),events=[];
 const tick=(input={})=>{game.update(dt,input);const pending=game.drainEvents();events.push(...pending);return pending;};
 const x=type==='throwIn'?0:type==='corner'?c.pitch.length/2-.05:-c.pitch.length/2+.05,z=type==='throwIn'?c.pitch.width/2-.05:6;
 Object.assign(s.ball,{owner:null,x,z,y:c.physics.ballRadius,vx:type==='throwIn'?0:type==='corner'?30:-30,vz:type==='throwIn'?30:0,vy:0,lastTeam:1,grace:100,flight:null});
 tick();assert.equal(s.restart?.type,type);assert.equal(s.restart.team,0);
 return {game,s,events,tick,restart:s.restart};
}
function until(f,predicate,input={},bound=1800){
 for(let n=0;n<bound;n++){if(predicate())return;f.tick(input);}
 assert.ok(predicate(),'the real restart must complete within its bounded walk and preparation');
}
function complete(f,input={}){
 until(f,()=>f.s.phase==='playing',input);
 assert.equal(f.s.restart,null);
 const releases=f.events.filter(e=>e.type==='throw'||e.type==='pass'||e.type==='loft');
 assert.equal(releases.length,1,'one accepted restart produces one physical release');
 return releases[0];
}
function noStaleAction(f,input,frames=4){
 const at=f.events.length;
 for(let n=0;n<frames;n++){
  f.tick(input);assert.equal(f.s.bufferedAction,null,'an ongoing consumed hold cannot create a new input buffer');
  assert.equal(f.s.charging,false,'an ongoing consumed hold cannot charge a second action');
 }
 const player=f.s.controlled;
 assert.equal(f.events.slice(at).some(e=>e.player===player&&actions.has(e.type)),false,'the same physical hold cannot become a shot, steal or dive');
}
function localPossession(f){
 const p=f.s.players[f.s.controlled];
 for(const other of f.s.players)if(other!==p)other.recover=100;
 Object.assign(p,{recover:0,cooldown:0,slideTime:0,stealCooldown:0,fx:1,fz:0});
 Object.assign(f.s.ball,{owner:p.id,x:p.x+c.physics.dribbleOffset,z:p.z,y:c.physics.ballRadius,vx:0,vz:0,vy:0,flight:null,thrower:null,lastTeam:0,lastPlayer:p.id,grace:100});
 f.s.passTarget=null;f.s.switchCooldown=100;return p;
}
function freshAction(f,key,other={}){
 const p=localPossession(f),at=f.events.length;
 for(let n=0;n<8;n++)f.tick({...other,[key]:true});
 assert.equal(f.s.charging,true);assert.equal(f.s.chargeKind,key==='passHeld'?'pass':'shot');
 f.tick({...other,[key]:false});
 const released=f.events.slice(at).filter(e=>e.player===p.id&&(e.type==='pass'||e.type==='shot'));
 assert.equal(released.length,1);assert.equal(released[0].type,key==='passHeld'?'pass':'shot');
}

for(const type of ['throwIn','corner','goalKick'])for(const key of ['passHeld','kickHeld'])test(`held ${key} through ${type} cannot give the keeper a ghost steal or dive`,()=>{
 const f=fixture(type,{role:'keeper'}),input={[key]:true};complete(f,input);
 assert.equal(f.s.ball.owner,null);noStaleAction(f,input);
 assert.equal(f.s.ball.owner,null,'the keeper cannot take back their own released goal kick through a stale button edge');
 f.tick();const afterUp=f.events.length;
 // A genuinely new press must still work. A fresh dive has no possession
 // prerequisite; a fresh standing steal uses a nearby opposing loose ball.
 if(key==='kickHeld'){
  f.s.players[f.s.controlled].diveCooldown=0;f.tick({kickHeld:true});
  assert.equal(f.events.slice(afterUp).filter(e=>e.type==='dive'&&e.player===f.s.controlled).length,1);
 }else{
  const p=f.s.players[f.s.controlled];p.stealCooldown=0;
  Object.assign(f.s.ball,{owner:null,x:p.x+.7,z:p.z,y:c.physics.ballRadius,vx:0,vz:0,vy:0,flight:null,lastTeam:1,lastPlayer:3,grace:0});
  f.tick({passHeld:true});assert.equal(f.events.slice(afterUp).filter(e=>e.type==='steal'&&e.player===p.id).length,1);
 }
});

for(const key of ['passHeld','kickHeld'])test(`a natural throw-in reception does not reuse held ${key}; a subsequent new press works`,()=>{
 const f=fixture('throwIn'),input={[key]:true},release=complete(f,input);
 assert.ok(Number.isInteger(release.target));
 // No receiver position or ownership is forced: use the real flight, support
 // run, local contact and selection that follow the throw.
 until(f,()=>f.s.ball.owner===release.target,input,180);
 assert.equal(f.s.controlled,release.target);assert.equal(f.s.players[release.target].team,0);
 assert.equal(f.events.filter(e=>e.type==='possession'&&e.player===release.target).length,1);
 for(const p of f.s.players)if(p.id!==release.target)p.recover=100;
 noStaleAction(f,input,45);
 const beforeUp=f.events.length;f.tick();
 assert.equal(f.events.slice(beforeUp).some(e=>e.player===release.target&&actions.has(e.type)),false,'button-up rearms without releasing a ghost charge');
 freshAction(f,key);
});

for(const key of ['passHeld','kickHeld'])test(`a first ${key} press during an accepted windup is consumed until physical up`,()=>{
 const f=fixture('throwIn');until(f,()=>!!f.restart.action,{passPressed:true});
 assert.equal(f.s.phase,'restartReady');assert.equal(f.restart.action.power,0);
 complete(f,{[key]:true});noStaleAction(f,{[key]:true});
 f.tick();freshAction(f,key);
});

for(const key of ['passHeld','kickHeld'])test(`${key} release and repress during windup cannot leak into playing, but a later fresh press works`,()=>{
 const f=fixture('throwIn'),input={[key]:true};until(f,()=>!!f.restart.action,input);
 const motion=f.s.players[f.restart.player].restartMotion;
 f.tick();assert.equal(f.s.phase,'restartReady');assert.equal(motion.released,false);
 f.tick(input);assert.equal(f.s.phase,'restartReady');assert.equal(motion.released,false);
 complete(f,input);f.game.clearInput();noStaleAction(f,input);
 f.tick();freshAction(f,key);
});

test('consuming a shot hold does not consume an independent new pass press after reception',()=>{
 const f=fixture('throwIn'),input={kickHeld:true},release=complete(f,input);
 until(f,()=>f.s.ball.owner===release.target,input,180);
 noStaleAction(f,input,2);
 freshAction(f,'passHeld',input);
 assert.equal(f.s.charging,false);
});

test('an AI keeper distribution does not consume a field player’s unrelated held action',()=>{
 const game=createSoccer({config:c,seed:17}),s=game.getState(),keeper=s.players[2],human=s.players[0];
 for(const p of s.players)Object.assign(p,{recover:p===keeper||p===human?0:100,think:100,cooldown:0,vx:0,vz:0});
 Object.assign(keeper,{x:-16,z:0,hands:true,hold:c.goalkeeping.catchSeconds,think:0});
 Object.assign(s.ball,{owner:keeper.id,x:-15.6,z:0,y:c.goalkeeping.holdHeight,lastTeam:1,grace:100,flight:null});s.controlled=human.id;s.switchCooldown=100;
 game.update(dt,{kickHeld:true});assert.ok(keeper.distribution);assert.equal(human.distribution,null);
 for(let n=0;n<60&&keeper.distribution;n++)game.update(dt,{kickHeld:true});
 assert.equal(keeper.distribution,null);
 // Isolate the next local reception; the human's already held preparation
 // belongs to them, rather than to the AI keeper's independent throw.
 s.controlled=human.id;Object.assign(human,{x:0,z:0,cooldown:0,recover:0});
 Object.assign(s.ball,{owner:human.id,x:.49,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,flight:null,lastTeam:0,lastPlayer:human.id,grace:100});
 game.update(dt,{kickHeld:true});assert.equal(s.charging,true);assert.equal(s.chargeKind,'shot');
});
