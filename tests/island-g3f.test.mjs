import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {pitchCrossing,goalFrameContact} from '../workout/island/minigames/soccer-boundary.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames.soccer;
const dt=config.match.fixedStep,hx=config.pitch.length/2,hz=config.pitch.width/2,r=config.physics.ballRadius;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function setup(ball={}){
  const game=createSoccer({config,seed:42,stage:3}),s=game.getState();
  for(const p of s.players)Object.assign(p,{x:p.team?8:-8,z:p.id%2?7:-7,vx:0,vz:0,recover:100,think:100});
  Object.assign(s.ball,{owner:null,x:0,y:r,z:0,vx:0,vy:0,vz:0,grace:100,lastTeam:0,flight:null,...ball});
  return game;
}
test('G3f only a whole ball crosses the line, with height interpolated at the crossing',()=>{
  const from={x:hx-.1,y:2.5,z:0};
  assert.equal(pitchCrossing(from,{x:hx+.1,y:1,z:0},config),null);
  const cross=pitchCrossing(from,{x:hx+.3,y:1,z:.4},config);
  assert.equal(cross.axis,'x');near(cross.time,.8);near(cross.y,1.3);near(cross.z,.32);
});
test('G3f a diagonal ball leaving the touchline first cannot become a goal kick',()=>{
  const cross=pitchCrossing({x:hx-.2,y:r,z:hz+.2},{x:hx+1,y:r,z:hz+1},config);
  assert.equal(cross.axis,'z');near(cross.z,hz+r);assert.ok(cross.x<hx);
});
for(const side of [-1,1])for(const frame of ['post','crossbar'])test(`G3f swept ${frame} at goal ${side} catches a ball that passes through between ticks`,()=>{
  const y=frame==='post'?1:config.pitch.goalHeight,z=frame==='post'?config.pitch.goalWidth/2:0;
  const contact=goalFrameContact({x:side*(hx-1),y,z},{x:side*(hx+1),y,z},config);
  assert.equal(contact.kind,frame);assert.ok(contact.time>0&&contact.time<.5);near(contact.normal.x,-side);
  const g=setup({x:side*(hx-.5),y,z,vx:side*80});g.update(dt);
  const s=g.getState();assert.deepEqual(s.score,[0,0]);assert.equal(s.phase,'playing');assert.equal(s.event.type,'post');assert.ok(s.ball.vx*side<0);assert.equal(s.ball.owner,null);
});
test('G3f a ball moving away from an overlapping post is not bounced back into it',()=>{
  const z=config.pitch.goalWidth/2;
  assert.equal(goalFrameContact({x:hx-.2,y:1,z},{x:hx-.4,y:1,z},config),null);
});
test('G3f a shot over the crossbar stays scoreless even if it descends below it before the tick ends',()=>{
  const g=setup({x:hx-.1,y:config.pitch.goalHeight+.5,z:0,vx:80,vy:-50});g.update(dt);
  assert.deepEqual(g.getState().score,[0,0]);
});
for(const side of [-1,1])for(const lastTeam of [0,1])test(`G3f touchline ${side}, last team ${lastTeam}: throw-in to the other team at the exit position`,()=>{
  const g=setup({x:3,z:side*(hz+.1),vx:12,vz:side*30,lastTeam});g.update(dt);
  const s=g.getState();assert.equal(s.phase,'restart');assert.equal(s.restart.type,'throwIn');assert.equal(s.restart.team,1-lastTeam);
  near(s.restart.x,3+(r-.1)/30*12);near(s.restart.z,side*(hz-config.rules.sideInset));
  assert.equal(s.ball.flight,null);assert.equal(s.passTarget,null);assert.ok(s.players[s.ball.owner].team===1-lastTeam);
  const time=s.elapsed;g.update(.25);near(s.elapsed,time);
});
for(const attackDir of [-1,1])for(const side of [-1,1])test(`G3f goal on side ${side} with attack direction ${attackDir} credits the correct team once`,()=>{
  const g=setup({x:side*(hx-.3),vx:side*40}),s=g.getState();s.attackDir=attackDir;
  g.update(dt);const team=side*attackDir>0?0:1;assert.equal(s.phase,'goal');assert.equal(s.score[team],1);
  const elapsed=s.elapsed;g.update(.25);assert.equal(s.score[team],1);near(s.elapsed,elapsed);
});
test('G3f an already out-of-play ball inside the goal cannot be credited as a new goal',()=>{
  const g=setup({x:hx+r+.01,vx:1});g.update(dt);assert.deepEqual(g.getState().score,[0,0]);assert.equal(g.getState().restart.type,'goalKick');
});
test('G3f a diagonal touchline exit retains its first exit position and restart type',()=>{
  const g=setup({x:hx-.2,z:hz+.2,vx:72,vz:48}),s=g.getState();g.update(dt);
  assert.equal(s.restart.type,'throwIn');assert.equal(s.restart.team,1);assert.ok(s.restart.x<=hx-config.rules.sideGoalInset);
});
test('G3f kickoff clears old slides, headers, recovery and actions tapped during a stoppage',()=>{
  const g=setup(),s=g.getState();s.phase='goal';s.phaseTime=dt;s.event={type:'goal',team:1};
  for(const p of s.players)Object.assign(p,{slideTime:.4,recover:.8,headerTime:.4,kickTime:.4,stealTime:.4,turnLean:.2});
  g.update(dt/2,{kickHeld:true,passHeld:true});g.update(dt/2,{});g.update(dt,{});
  assert.equal(s.phase,'playing');assert.equal(s.charging,false);assert.equal(s.ball.owner,s.controlled);
  for(const p of s.players)for(const key of ['slideTime','recover','headerTime','kickTime','stealTime'])assert.equal(p[key],0,key);
});
test('G3f frame collision and restart simulation agree at 30, 60 and 120 Hz',()=>{
  const snapshots=[30,60,120].map(hz=>{const g=setup({x:hx-2,y:1,z:config.pitch.goalWidth/2,vx:25});for(let i=0;i<hz;i++)g.update(1/hz);return g.snapshot();});
  assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
});
