import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLoftFlight,loftReceptionTarget} from '../workout/island/minigames/soccer-loft.mjs';
import {rollBall} from '../workout/island/minigames/soccer-physics.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} ~= ${b}`);
function fixture(direction=1){
 const hx=c.pitch.length/2,ball={x:direction*(hx-4.3),z:-6.53,y:c.physics.ballRadius,owner:null,vx:0,vz:0,vy:0,curve:0};
 Object.assign(ball,createLoftFlight(ball,{x:direction*(hx-3.7),z:3.76},c,.55));
 const player={id:3,role:'striker',x:direction*(hx-5.8),z:1.72,vx:direction*3.27,vz:3.08,fx:direction,fz:0,speed:1,recover:0,cooldown:0,slideTime:0};
 return {ball,player};
}
test('a head receiver anticipates an actual descending contact before the ground landing point',()=>{
 const {ball,player}=fixture(),saved=structuredClone({ball,player}),target=loftReceptionTarget(player,ball,c,{speed:4.5,direction:1});
 assert.ok(target);assert.equal(target.kind,'head-intercept');assert.ok(target.z<ball.flight.z-1);assert.ok(target.height>=c.aerial.minHeight&&target.height<=c.aerial.maxHeight);
 const predicted={...ball};for(let i=0;i<Math.round(target.seconds/c.match.fixedStep);i++)rollBall(predicted,c.match.fixedStep,c);
 near(target.x,predicted.x);near(target.z,predicted.z);near(target.height,predicted.y);assert.ok(predicted.vy<0);
 assert.deepEqual({ball,player},saved);
});
test('mirrored head interception uses the same observed physical trajectory in either attack direction',()=>{
 const a=fixture(1),b=fixture(-1),first=loftReceptionTarget(a.player,a.ball,c,{speed:4.5,direction:1}),second=loftReceptionTarget(b.player,b.ball,c,{speed:4.5,direction:-1});
 assert.ok(first&&second);near(first.x,-second.x);near(first.z,second.z);near(first.height,second.height);near(first.seconds,second.seconds);
});
test('an unavailable or unreachable player cannot gain a remote header target, and ground runs are unchanged',()=>{
 const {ball,player}=fixture();assert.equal(loftReceptionTarget({...player,x:-c.pitch.length/2+2,z:12},ball,c,{speed:4.5,direction:1}),null);
 for(const patch of [{role:'keeper'},{recover:.1},{slideTime:.1},{cooldown:.1}])assert.equal(loftReceptionTarget({...player,...patch},ball,c,{speed:4.5,direction:1}),null);
 assert.equal(loftReceptionTarget(player,{...ball,flight:null},c,{speed:4.5,direction:1}),null);
 assert.equal(loftReceptionTarget(player,{...ball,owner:1},c,{speed:4.5,direction:1}),null);
});
test('the real AI runner meets and heads the physical cross without a position jump or altered contact limits',()=>{
 for(const direction of [-1,1]){
  const g=createSoccer({config:c,seed:701,stage:8}),s=g.getState(),{ball,player}=fixture(direction),receiver=s.players[3],dt=c.match.fixedStep;
  for(const p of s.players)Object.assign(p,{x:(p.team?1:-1)*(c.pitch.length/2-3),z:p.id%2?c.pitch.width/2-3:-c.pitch.width/2+3,recover:100,cooldown:100,think:100,vx:0,vz:0});
  Object.assign(receiver,player,{team:1,think:100});s.attackDir=-direction;s.controlled=0;
  Object.assign(s.ball,ball,{lastTeam:1,lastPlayer:7,grace:.1});s.passTarget={player:receiver.id,x:ball.flight.x,z:ball.flight.z,time:2.5,kind:'loft'};g.drainEvents();
  let headed=false;for(let i=0;i<120&&s.ball.flight;i++){
   const previous={x:receiver.x,z:receiver.z};g.update(dt);assert.ok(Math.hypot(receiver.x-previous.x,receiver.z-previous.z)<=c.players.speed*1.5*dt+.01,'only normal bounded body movement reaches the contact');
   if(g.drainEvents().some(event=>event.type==='header'&&event.player===receiver.id))headed=true;
  }
  assert.ok(headed,'a reachable descending cross produces the actual header event');assert.equal(s.ball.flight,null);assert.ok(s.ball.vx*direction>0);
 }
});
