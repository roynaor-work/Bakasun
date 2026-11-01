import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {restartActionProfile,restartBallPose} from '../workout/island/minigames/soccer-restarts.mjs';

const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer,dt=c.match.fixedStep,hx=c.pitch.length/2,hz=c.pitch.width/2;
const run=(game,n,input={},watch=null)=>{const events=[];for(let i=0;i<n;i++){game.update(dt,input);events.push(...game.drainEvents());watch?.(game.getState());}return events;};

test('v3 restarts: the thrower waits with the ball at the chest, then the full authored throw plays from the button to the release',()=>{
 for(const side of [-1,1]){
  const game=createSoccer({config:c,seed:3}),s=game.getState();for(const p of s.players)p.recover=100;
  Object.assign(s.ball,{owner:null,x:2,z:side*(hz-.05),y:c.physics.ballRadius,vx:0,vz:side*30,vy:0,lastTeam:1,grace:100});
  game.update(dt);game.drainEvents();const r=s.restart;assert.equal(r?.type,'throwIn');assert.equal(r.team,0);
  const budget=Math.ceil((Math.max(r.walkSeconds,r.organizeSeconds)+c.match.restartSeconds+.4)/dt);
  for(let i=0;i<budget&&s.phase!=='restartReady';i++){game.update(dt);game.drainEvents();}
  assert.equal(s.phase,'restartReady');
  for(let i=0;i<Math.ceil(.45/dt);i++){game.update(dt);game.drainEvents();}
  const taker=s.players[r.player];
  assert.ok(taker.restartMotion&&taker.restartMotion.kind==='throwIn','the gather pose is shown while waiting');
  assert.ok(Math.abs(taker.restartMotion.elapsed-c.restarts.throwHoldSeconds)<1e-6,`held at the chest gather, not loaded overhead (${taker.restartMotion.elapsed})`);
  assert.ok(s.ball.y<1.7&&s.ball.y>1.2,`the waiting ball sits at chest height (${s.ball.y.toFixed(2)} m)`);
  const overhead=restartBallPose('throwIn',.9).height;assert.ok(overhead>s.ball.y+.2,'the overhead pose is reserved for the throw itself');
  // Press: the release happens exactly contact-hold seconds later, in one event.
  game.update(dt,{passPressed:true});game.drainEvents();assert.ok(r.action,'the button is accepted');
  const expected=restartActionProfile('throwIn').contact-c.restarts.throwHoldSeconds;let elapsed=0,throws=[];
  while(s.phase!=='playing'&&elapsed<expected+.5){game.update(dt);elapsed+=dt;throws.push(...game.drainEvents().filter(e=>e.type==='throw'));}
  assert.equal(throws.length,1,'one throw release');assert.ok(Math.abs(elapsed-expected)<=2*dt+1e-9,`released ${elapsed.toFixed(3)} s after the press (expected about ${expected.toFixed(3)})`);
  assert.equal(s.phase,'playing');assert.ok(s.ball.owner===null&&s.ball.y>1.5,'the ball leaves from above the head');
 }
});

test('v3 restarts: the child\'s keeper steps out, throws to a free team-mate in reach and punts when nobody near is free; the rival keeper keeps throwing',()=>{
 const catchBall=(s,keeperId)=>{const k=s.players[keeperId],d=s.attackDir*(k.team===0?1:-1);Object.assign(k,{x:-d*(hx-2.5),z:0,hands:true,hold:0,cooldown:0,think:100,recover:0});Object.assign(s.ball,{owner:keeperId,x:k.x+d*c.goalkeeping.holdForward,z:0,y:c.goalkeeping.holdHeight,vx:0,vz:0,vy:0,lastTeam:k.team,lastPlayer:keeperId,grace:0,flight:null,thrower:null,shot:null});};
 const setup=(seed)=>{const game=createSoccer({config:c,seed,stage:1,difficulty:'normal',role:'field',league:true}),s=game.getState();game.clearInput();for(const p of s.players){p.cooldown=100;p.recover=0;p.slideTime=0;p.vx=p.vz=0;}s.controlled=0;s.switchCooldown=100;return {game,s};};
 // Free team-mate inside throw reach: underarm throw.
 {const {game,s}=setup(1);for(const p of s.players)if(p.team===0&&p.role!=='keeper'){p.x=-hx+12;p.z=(p.id%3-1)*8;}for(const p of s.players)if(p.team===1){p.x=hx-6;p.z=(p.id%3-1)*6;}
  catchBall(s,2);const start={x:s.players[2].x,z:s.players[2].z};let furthest=0;
  const events=run(game,Math.ceil((c.goalkeeping.maxHoldSeconds+1.2)/dt),{moveX:.4,moveZ:0},q=>{if(q.players[2].hands)furthest=Math.max(furthest,q.players[2].x-start.x);});
  const windup=events.find(e=>e.type==='distribution-windup');assert.ok(windup,'the keeper distributes');assert.equal(windup.kind,'keeperThrow');
  assert.ok(furthest>.8,`the keeper stepped toward the edge of the area while holding (${furthest.toFixed(2)} m)`);
  assert.ok(events.some(e=>e.type==='pass'&&e.player===2),'an underarm throw to a team-mate');}
 // Everyone far away: a punt down the pitch.
 {const {game,s}=setup(2);for(const p of s.players)if(p.team===0&&p.role!=='keeper'){p.x=hx-8;p.z=(p.id%3-1)*8;}for(const p of s.players)if(p.team===1&&p.role!=='keeper'){p.x=-hx+10;p.z=(p.id%3-1)*4;}
  catchBall(s,2);let launch=null;const events=run(game,Math.ceil((c.goalkeeping.maxHoldSeconds+1.4)/dt),{moveX:.4,moveZ:0},q=>{if(!launch&&!q.players[2].hands&&q.ball.owner===null&&q.ball.lastPlayer===2)launch={vx:q.ball.vx,vy:q.ball.vy,y:q.ball.y};});
  const windup=events.find(e=>e.type==='distribution-windup');assert.ok(windup);assert.equal(windup.kind,'keeperPunt','no free team-mate in reach: punt');
  const strike=events.find(e=>e.type==='shot'&&e.player===2);assert.ok(strike,'the punt is a long kick from the hands');
  assert.ok(launch&&launch.vx>12&&launch.vy>1.5,`a long, lofted punt (${JSON.stringify(launch)})`);}
 // The rival keeper, and the child's keeper while the child is idle, keep the original throw.
 for(const keeperId of [5,2]){const {game,s}=setup(3);for(const p of s.players)if(p.role!=='keeper'){p.x=(p.team?-1:1)*(hx-8);p.z=(p.id%3-1)*8;}
  catchBall(s,keeperId);if(keeperId===2)s.idle=5;const events=run(game,Math.ceil((c.goalkeeping.catchSeconds+2)/dt),{});
  const windup=events.find(e=>e.type==='distribution-windup');assert.ok(windup);assert.equal(windup.kind,'keeperThrow',`keeper ${keeperId} keeps the tuned throw`);}
});

test('v3 restarts: a corner taker is ready at the ball with the run-up complete and strikes soon after the button',()=>{
 const game=createSoccer({config:c,seed:4}),s=game.getState();for(const p of s.players)p.recover=100;
 Object.assign(s.ball,{owner:null,x:hx-.05,z:6,y:c.physics.ballRadius,vx:30,vz:0,vy:0,lastTeam:1,grace:100});
 game.update(dt);game.drainEvents();const r=s.restart;assert.equal(r?.type,'corner');assert.equal(r.team,0);
 for(let i=0;i<Math.ceil((Math.max(r.walkSeconds,r.organizeSeconds)+c.match.restartSeconds+.5)/dt)&&s.phase!=='restartReady';i++){game.update(dt);game.drainEvents();}
 assert.equal(s.phase,'restartReady');const taker=s.players[r.player];
 assert.equal(taker.restartMotion?.kind,'corner');assert.ok(taker.restartMotion.elapsed>=1.2-1e-6,'the run-up has been completed while waiting');
 game.update(dt,{kickHeld:true});game.drainEvents();game.update(dt,{kickHeld:false});game.drainEvents();assert.ok(r.action);
 let elapsed=0,kicks=[];while(s.phase!=='playing'&&elapsed<2){game.update(dt);elapsed+=dt;kicks.push(...game.drainEvents().filter(e=>e.type==='loft'||e.type==='pass'));}
 assert.equal(kicks.length,1);assert.ok(elapsed<=restartActionProfile('corner').contact-1.2+3*dt,`the strike follows the button within the authored kick (${elapsed.toFixed(2)} s)`);
});
