import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {goalFrameContact,pitchCrossing} from '../workout/island/minigames/soccer-boundary.mjs';
import {slideVelocityScale,sweptSlideContact} from '../workout/island/minigames/soccer-control-depth.mjs';
import {rollBall} from '../workout/island/minigames/soccer-physics.mjs';

const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const dt=c.match.fixedStep;
function fixture(direction=1){
 const game=createSoccer({config:c,stage:1,difficulty:'normal',seed:19,random:()=>0}),s=game.getState();
 game.clearInput();s.attackDir=direction;s.controlled=0;s.switchCooldown=100;s.passTarget=null;
 for(const p of s.players)Object.assign(p,{x:p.team===0?-10:10,z:(p.id%3-1)*7,recover:100,cooldown:100,vx:0,vz:0,slideTime:0,hands:false});
 Object.assign(s.ball,{owner:null,y:c.physics.ballRadius,vx:0,vy:0,vz:0,curve:0,flight:null,thrower:null,grace:100,lastTeam:1,lastPlayer:3});
 const player=s.players[0];Object.assign(player,{recover:0,cooldown:0});
 const tick=(input={})=>{game.update(dt,input);return game.drainEvents();};
 return {game,s,player,tick};
}
function placeSlide(f,{x,z,ballX,ballZ,ballVX,side=1}){
 Object.assign(f.player,{x,z,fx:0,fz:-side,slideX:0,slideZ:-side,slideTime:c.slide.seconds,slideAttempted:false,slideWon:false,slideBehind:false,slideLate:false});
 Object.assign(f.s.ball,{x:ballX,z:ballZ,vx:ballVX});
}
function firstTickGeometry(f){
 const ballFrom={...f.s.ball},ballTo={...ballFrom};rollBall(ballTo,dt,c);
 const p=f.player,speed=c.slide.distance/c.slide.seconds*slideVelocityScale(c.slide.seconds-dt*.5,c);
 const endpoint={x:p.x+p.slideX*speed*dt,z:p.z+p.slideZ*speed*dt};
 return {ballFrom,ballTo,frame:goalFrameContact(ballFrom,ballTo,c),crossing:pitchCrossing(ballFrom,ballTo,c),slide:sweptSlideContact(p,endpoint,ballFrom,ballTo,c,{elapsed:0,dt})};
}

test('real simulation resolves an earlier goal-post collision before a later swept tackle at either end and post',()=>{
 for(const direction of [-1,1])for(const side of [-1,1]){
  const f=fixture(direction);
  placeSlide(f,{x:17.65*direction,z:3.71*side,ballX:17.69*direction,ballZ:2.7*side,ballVX:12.6*direction,side});
  const geometry=firstTickGeometry(f);
  assert.ok(geometry.frame&&geometry.slide,'the fixture contains both possible contacts in the same fixed tick');
  assert.ok(geometry.frame.time<geometry.slide.time,'the post is physically reached before the sliding foot');
  assert.equal(geometry.crossing,null,'this case isolates the post rather than an out-of-play crossing');
  const events=f.tick();
  assert.equal(events.filter(e=>e.type==='post').length,1);
  assert.equal(events.some(e=>e.type==='slide-contact'),false,'the tackler cannot win through a post that already changed the ball path');
  assert.equal(f.player.slideAttempted,false,'a discarded future contact does not consume a tackle attempt');
  assert.equal(f.s.ball.owner,null);assert.ok(f.s.ball.vx*direction<0,'the actual post bounce retains its reflected velocity');
  assert.deepEqual(f.s.score,[0,0]);assert.equal(f.s.phase,'playing');
 }
});

test('real simulation allows a clean local slide before the pending post collision',()=>{
 for(const direction of [-1,1])for(const side of [-1,1]){
  const f=fixture(direction);
  placeSlide(f,{x:17.65*direction,z:3.6*side,ballX:17.69*direction,ballZ:2.7*side,ballVX:12.6*direction,side});
  const geometry=firstTickGeometry(f);
  assert.ok(geometry.frame&&geometry.slide);assert.ok(geometry.slide.time<geometry.frame.time);
  const events=f.tick(),contacts=events.filter(e=>e.type==='slide-contact');
  assert.equal(contacts.length,1);assert.equal(contacts[0].won,true);
  assert.equal(f.s.ball.owner,f.player.id,'a real foot contact keeps normal local possession');
  assert.equal(f.s.ball.lastPlayer,f.player.id);assert.equal(events.some(e=>e.type==='post'),false);
  assert.ok(f.s.ball.x*direction<18-c.physics.ballRadius-c.pitch.postRadius,'the ball is stopped before reaching the post surface');
  assert.deepEqual(f.s.score,[0,0]);
 }
});

test('real simulation allows a clean local slide to stop a ball before it crosses the whole-ball goal line',()=>{
 for(const direction of [-1,1]){
  const f=fixture(direction);
  placeSlide(f,{x:17.65*direction,z:.9,ballX:17.9*direction,ballZ:0,ballVX:30*direction});
  const geometry=firstTickGeometry(f);
  assert.equal(geometry.frame,null);assert.ok(geometry.crossing&&geometry.slide);
  assert.ok(geometry.slide.time<geometry.crossing.time,'the foot arrives while the whole ball is still in play');
  const events=f.tick();
  assert.equal(events.filter(e=>e.type==='slide-contact'&&e.won).length,1);
  assert.equal(events.some(e=>e.type==='goal'||e.type==='restart'),false);
  assert.equal(f.s.ball.owner,f.player.id);assert.deepEqual(f.s.score,[0,0]);assert.equal(f.s.phase,'playing');
 }
});

test('manual selection resets the outgoing player waypoint at the actual handoff without moving the body or possession',()=>{
 for(const direction of [-1,1]){
  const f=fixture(direction),outgoing=f.player,receiver=f.s.players[1];
  Object.assign(outgoing,{x:8*direction,z:2,recover:.5,shapeX:-12*direction,shapeZ:-8,markedPlayer:4,fx:direction,fz:0});
  Object.assign(receiver,{x:6*direction,z:3,recover:0,cooldown:0});
  Object.assign(f.s.ball,{owner:outgoing.id,x:outgoing.x+direction*c.physics.dribbleOffset,z:outgoing.z,lastTeam:0,lastPlayer:outgoing.id});
  const before={x:outgoing.x,z:outgoing.z};
  const events=f.tick({switchPlayer:true});
  assert.equal(f.s.controlled,receiver.id);assert.equal(events.filter(e=>e.type==='switch').length,1);
  assert.equal(outgoing.shapeX,before.x);assert.equal(outgoing.shapeZ,before.z);assert.equal(outgoing.markedPlayer,null);
  assert.deepEqual({x:outgoing.x,z:outgoing.z},before,'selection does not teleport the outgoing player');
  assert.equal(f.s.ball.owner,outgoing.id,'switching control does not transfer the ball');
 }
});
