import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const dt=config.match.fixedStep,distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function fixture({role='field',seed=41,stage=4}={}){
 const game=createSoccer({config,role,seed,stage,difficulty:'normal'}),s=game.getState();
 for(const p of s.players){Object.assign(p,{x:p.team===0?-10:12,z:(p.id%3-1)*6,vx:0,vz:0,fx:p.team===0?1:-1,fz:0,cooldown:100,think:100,hold:0,recover:0,slideTime:0,hands:false});}
 const p=s.players[role==='keeper'?2:0];Object.assign(p,{x:role==='keeper'?-16:0,z:0,cooldown:0,fx:1,fz:0});
 Object.assign(s.players[1],{x:6,z:0});Object.assign(s.players[6],{x:4,z:-7});
 Object.assign(s.players[2],{x:-16,z:role==='keeper'?0:5});Object.assign(s.players[5],{x:16,z:5});
 s.controlled=p.id;s.switchCooldown=10;s.mode=role==='keeper'?'defense':'attack';
 Object.assign(s.ball,{owner:null,x:3,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:0,flight:null,shot:null,thrower:null,lastTeam:0,lastPlayer:1,curve:0});
 const events=[];const tick=(input={})=>{game.update(dt,input);events.push(...game.drainEvents());return s;};
 return {game,s,p,tick,events};
}
const has=(f,type)=>f.events.some(e=>e.type===type&&e.player===f.p.id);
const stopIncoming=f=>Object.assign(f.s.ball,{x:f.p.x+.7,z:f.p.z,y:config.physics.ballRadius,vx:0,vz:0,vy:0,flight:null});

test('gameplay keeper: free ball maps a shot press to a dive without field attack',()=>{
 const f=fixture({role:'keeper'});Object.assign(f.s.ball,{x:-12,y:.5,lastTeam:1,lastPlayer:3});
 f.tick({kickHeld:true,moveZ:1});
 assert.equal(f.s.mode,'defense');assert.ok(f.p.diveTime>0);assert.ok(has(f,'dive'));
 assert.equal(has(f,'shot'),false);assert.equal(has(f,'header'),false);assert.equal(f.s.charging,false);
});

test('gameplay keeper: an aerial free ball in head range still uses goalkeeper dive',()=>{
 const f=fixture({role:'keeper'});Object.assign(f.s.ball,{x:f.p.x+.7,y:1.7,lastTeam:1,lastPlayer:3});
 f.tick({kickHeld:true,moveZ:1});
 assert.ok(has(f,'dive'),'keeper button remains a dive even in the field header contact window');
 assert.equal(has(f,'header'),false,'keeper is never silently reassigned to an outfield header');
});

test('gameplay keeper: dive cooldown prevents repeated jumps and then permits a new dive',()=>{
 const f=fixture({role:'keeper'});Object.assign(f.s.ball,{x:0,z:8,lastTeam:1,lastPlayer:3});
 f.tick({kickHeld:true});f.tick({});f.tick({kickHeld:true});
 assert.equal(f.events.filter(e=>e.type==='dive').length,1);
 for(let i=0;i<Math.ceil((config.goalkeeping.diveSeconds+.2)/dt);i++)f.tick({});
 assert.equal(f.p.diveTime,0);assert.equal(f.p.diveCooldown,0);
 f.tick({kickHeld:true,moveZ:-1});assert.equal(f.events.filter(e=>e.type==='dive').length,2);assert.ok(f.p.diveZ<0);
});

test('gameplay keeper: restart walk stays continuous without a one-frame goal-line snap',()=>{
 const f=fixture({role:'keeper'});Object.assign(f.p,{x:-14,z:-2});
 Object.assign(f.s.ball,{x:-17.95,z:6,vx:-30,vy:0,lastTeam:1,lastPlayer:3});f.tick();
 assert.equal(f.s.restart?.type,'goalKick');assert.equal(f.s.restart?.player,f.p.id);
 let previous={x:f.p.x,z:f.p.z},steps=0;
 for(let i=0;i<180&&f.s.phase.startsWith('restart');i++){
  f.tick();const travel=distance(previous,f.p);assert.ok(travel<=config.players.speed*1.2*dt+1e-6,`restart travel ${travel} in one fixed tick`);
  previous={x:f.p.x,z:f.p.z};steps++;
 }
 assert.ok(steps>10,'the keeper visibly walks to the restart spot');
});

test('gameplay throw-in: a nearer human keeper is not the taker and never jumps back from the sideline',()=>{
 const f=fixture({role:'keeper'});Object.assign(f.p,{x:-15,z:4});
 Object.assign(f.s.players[0],{x:0,z:-7});Object.assign(f.s.players[1],{x:4,z:-2});Object.assign(f.s.players[6],{x:6,z:7});
 Object.assign(f.s.ball,{x:-15,z:10.95,vx:0,vz:30,vy:0,lastTeam:1,lastPlayer:3});
 const point={x:-15,z:11},keeperDistance=distance(f.p,point);
 assert.ok(f.s.players.filter(p=>p.team===0&&p.role!=='keeper').every(p=>distance(p,point)>keeperDistance),'fixture keeper is closer to the throw-in than all field players');
 let previous={x:f.p.x,z:f.p.z};f.tick();assert.equal(f.s.restart?.type,'throwIn');
 assert.notEqual(f.s.restart.player,f.p.id);assert.notEqual(f.s.players[f.s.restart.player].role,'keeper');
 assert.ok(distance(previous,f.p)<=config.players.speed*1.2*dt+.01);
 for(let i=0;i<300&&f.s.phase.startsWith('restart');i++){
  previous={x:f.p.x,z:f.p.z};f.tick();
  assert.ok(distance(previous,f.p)<=config.players.speed*1.2*dt+.01,'keeper remains in continuous bounded movement throughout the throw-in');
  assert.ok(Math.abs(f.p.z)<=config.pitch.penaltyWidth/2-config.goalkeeping.areaInset+1e-8,'keeper never runs to the touchline');
 }
});

test('gameplay restart spacing does not teleport the nearby human-controlled field player',()=>{
 const f=fixture();Object.assign(f.p,{x:0,z:8.6});Object.assign(f.s.players[1],{x:0,z:9.6});
 Object.assign(f.s.ball,{x:0,z:10.95,vx:0,vz:30,vy:0,lastTeam:1,lastPlayer:3});
 const before={x:f.p.x,z:f.p.z};f.tick();assert.equal(f.s.restart?.type,'throwIn');assert.equal(f.s.restart.player,1);
 assert.equal(f.s.controlled,f.p.id);assert.ok(distance(before,f.p)<=config.players.speed*dt+.05,'restart clearance cannot directly push the human player several metres');
});

test('gameplay keeper: releasing a carried ball leaves a smooth return to the goal line',()=>{
 const f=fixture({role:'keeper'});Object.assign(f.p,{x:-14,z:1,hands:true});
 Object.assign(f.s.ball,{owner:f.p.id,x:-13.7,z:1,y:config.goalkeeping.holdHeight,lastTeam:0,lastPlayer:f.p.id});
 f.tick({passHeld:true});f.tick({});
 assert.equal(f.p.restartMotion?.kind,'keeperThrow');
 assert.equal(f.s.ball.owner,f.p.id,'the keeper retains the ball during the underarm preparation');
 assert.equal(has(f,'pass'),false,'the release waits for the authored contact');
 for(let i=0;i<60&&!has(f,'pass');i++)f.tick();
 assert.ok(has(f,'pass'),'one real pass is released after the preparation');
 assert.equal(f.events.filter(e=>e.type==='pass'&&e.player===f.p.id).length,1);
 const before={x:f.p.x,z:f.p.z};f.tick();assert.ok(distance(before,f.p)<config.players.speed*dt+.02);
 assert.ok(f.p.x>-15,'releasing a throw does not snap the keeper straight to the line');assert.equal(f.s.controlled,f.p.id);
});

for(const kind of ['pass','shot'])test(`gameplay buffered ${kind}: a released press resolves after actual local reception`,()=>{
 const f=fixture();Object.assign(f.s.ball,{x:2.6,lastPlayer:1});
 f.tick(kind==='pass'?{passHeld:true}:{kickHeld:true});assert.equal(f.s.bufferedAction?.kind,kind);
 f.tick();assert.equal(f.s.ball.owner,null);assert.equal(has(f,kind),false);
 stopIncoming(f);f.tick();assert.equal(f.s.ball.owner,f.p.id,'first get a real local touch');
 f.tick();assert.ok(has(f,kind),'the previously released action runs on that received ball');
 assert.equal(f.s.bufferedAction,null);
});

for(const kind of ['pass','shot'])test(`gameplay buffered ${kind}: no remote possession, stale action expires`,()=>{
 const f=fixture();Object.assign(f.s.ball,{x:5});const initialX=f.s.ball.x;
 f.tick(kind==='pass'?{passHeld:true}:{kickHeld:true});f.tick();
 for(let i=0;i<Math.ceil(config.assistance.contact.inputBufferSeconds/dt)+2;i++)f.tick();
 assert.equal(f.s.bufferedAction,null);assert.equal(f.s.ball.owner,null);assert.equal(has(f,kind),false);assert.equal(f.s.ball.x,initialX);
 stopIncoming(f);f.tick();f.tick();assert.equal(has(f,kind),false,'later contact cannot revive the expired input');
});

test('gameplay buffered header: an early press waits for nearby airborne contact',()=>{
 const f=fixture();Object.assign(f.s.ball,{x:config.aerial.reach+.25,y:1.9,vx:0,vy:0});
 f.tick({kickHeld:true});assert.equal(f.s.bufferedAction?.kind,'shot');assert.equal(has(f,'header'),false);f.tick();
 Object.assign(f.s.ball,{x:f.p.x+config.aerial.reach-.1,y:1.7,vx:0,vy:-.3});f.tick();
 assert.ok(has(f,'header'));assert.equal(f.s.ball.owner,null);assert.ok(f.s.ball.vx>0);assert.equal(f.s.bufferedAction,null);
});

test('gameplay header buffer expires before remote airborne contact becomes local',()=>{
 const f=fixture();Object.assign(f.s.ball,{x:5,y:2.2,vy:0});f.tick({kickHeld:true});f.tick();
 for(let i=0;i<Math.ceil(config.assistance.contact.inputBufferSeconds/dt)+2;i++)f.tick();
 assert.equal(f.s.bufferedAction,null);assert.equal(has(f,'header'),false);
 Object.assign(f.s.ball,{x:.8,y:1.7,vx:0,vy:0});f.tick();assert.equal(has(f,'header'),false);
});

for(const kind of ['pass','shot'])test(`gameplay clearInput: ${kind} buffer cannot survive pause/cancel or control change`,()=>{
 const f=fixture();f.tick(kind==='pass'?{passHeld:true}:{kickHeld:true});assert.equal(f.s.bufferedAction?.kind,kind);
 f.game.clearInput();assert.equal(f.s.bufferedAction,null);assert.equal(f.s.charging,false);stopIncoming(f);f.tick();f.tick();assert.equal(has(f,kind),false);
 const g=fixture();g.tick(kind==='pass'?{passHeld:true}:{kickHeld:true});g.tick({switchPlayer:true});assert.equal(g.s.bufferedAction,null);assert.notEqual(g.s.controlled,g.p.id);
});

test('gameplay reception: the runner keeps momentum and the ball takes several ticks to reach the foot',()=>{
 const f=fixture();Object.assign(f.p,{vx:5,fx:1});
 Object.assign(f.s.ball,{x:-.7,vx:4,lastPlayer:1});
 f.s.passTarget={player:f.p.id,x:0,z:0,time:1,kind:'ground',startX:-5,startZ:0};
 const beforeX=f.p.x;f.tick({moveX:1});
 assert.equal(f.s.ball.owner,f.p.id);assert.ok(f.p.vx>4,'receiving a pass must not stop the runner');assert.ok(f.p.x>beforeX);
 assert.ok(Math.abs(f.s.ball.x-(f.p.x+config.physics.dribbleOffset))>.2,'reception does not immediately glue the ball to the forward foot');
 const beforeBall=f.s.ball.x;f.tick({moveX:1});assert.ok(f.s.ball.x>beforeBall);assert.ok(f.p.vx>4);assert.equal(f.s.ball.owner,f.p.id);
});

test('gameplay manual switching chooses a useful field player and excludes the nearer keeper',()=>{
 const f=fixture();Object.assign(f.s.ball,{x:-15,z:0,y:3});Object.assign(f.s.players[2],{x:-15,z:0});Object.assign(f.s.players[1],{x:-12,z:0});
 f.tick({switchPlayer:true});assert.equal(f.s.controlled,1);assert.notEqual(f.s.controlled,2);assert.ok(f.events.some(e=>e.type==='switch'&&e.player===1));
});

test('gameplay field: an allowed back pass to the nearby keeper does not transfer human selection',()=>{
 const f=fixture(),keeper=f.s.players[2];Object.assign(f.p,{x:-7,z:0,fx:-1,fz:0});Object.assign(keeper,{x:-14,z:0,cooldown:0});
 Object.assign(f.s.ball,{owner:f.p.id,x:f.p.x-config.physics.dribbleOffset,z:0,lastTeam:0,lastPlayer:f.p.id});
 const aim={x:-1,z:0,manual:false};f.tick({passHeld:true,passAim:aim});f.tick({passAim:aim});
 const pass=f.events.find(e=>e.type==='pass'&&e.player===f.p.id);
 assert.ok(pass,'a back pass remains a legal field action');assert.equal(pass.target,keeper.id);
 assert.ok(pass.distance<=config.assistance.passing.maxAssistDistance);assert.ok(f.s.ball.vx<0,'the ball travels back toward the keeper');
 assert.equal(f.s.controlled,f.p.id,'releasing a pass to a keeper must not select the keeper');
});

test('gameplay keeper possession in field mode does not steal selection from an outfield player',()=>{
 const f=fixture(),keeper=f.s.players[2];Object.assign(keeper,{cooldown:0,x:-16,z:0});
 Object.assign(f.s.ball,{x:-15.8,z:0,y:.3,vx:0,vy:0,lastTeam:1,lastPlayer:3});f.tick();
 assert.equal(f.s.ball.owner,keeper.id);assert.equal(keeper.hands,true);assert.equal(f.s.controlled,f.p.id);
});

test('gameplay input windows and contacts are deterministic across seeds and frame grouping',()=>{
 function play(seed,hz){const f=fixture({seed});for(let i=0;i<hz/2;i++)f.game.update(1/hz,{moveX:1});return f.game.snapshot();}
 for(const seed of [1,77,20261023]){assert.deepEqual(play(seed,30),play(seed,60));assert.deepEqual(play(seed,60),play(seed,120));}
});
