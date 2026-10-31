import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer,dt=c.match.fixedStep;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function fixture(team=1,direction=1,side=1,stage=8){
 const game=createSoccer({config:c,stage,difficulty:'normal',seed:9,role:'keeper'}),s=game.getState();
 game.clearInput();s.attackDir=direction*(team===0?1:-1);s.controlled=2;s.switchCooldown=100;s.passTarget=null;
 for(const p of s.players)Object.assign(p,{x:0,z:0,recover:100,cooldown:100,think:100,vx:0,vz:0,slideTime:0,hands:false});
 const wing=s.players[team===0?6:7],receiver=s.players[team===0?0:3];
 Object.assign(wing,{x:direction*10,z:side*6.5,recover:0,cooldown:0,think:0,hold:1,fx:direction,fz:0});
 Object.assign(receiver,{x:direction*14.5,z:0,vx:direction*.7,recover:0,cooldown:0,think:100,fx:direction,fz:0});
 Object.assign(s.ball,{owner:wing.id,x:wing.x+direction*c.physics.dribbleOffset,z:wing.z,y:c.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,flight:null,thrower:null,grace:100,lastTeam:team,lastPlayer:wing.id});
 const tick=()=>{game.update(dt);return game.drainEvents();};
 return {game,s,wing,receiver,tick};
}
test('cross flight clamps the receiver prediction in attack-local coordinates for both teams and directions',()=>{
 for(const team of [0,1])for(const direction of [-1,1])for(const side of [-1,1]){
  const f=fixture(team,direction,side),events=f.tick(),cross=events.find(e=>e.type==='loft'&&e.player===f.wing.id);
  assert.ok(cross,'the unchanged wide-carrier delivery gate accepts this real cross');
  const flight=f.s.ball.flight;assert.ok(flight);assert.equal(f.s.passTarget.player,f.receiver.id);
  const expected=direction*clamp((f.receiver.x+f.receiver.vx*flight.duration*.5)*direction,c.pitch.length/2-c.pitch.penaltyDepth,c.pitch.length/2-1.2);
  near(cross.x,expected);near(flight.x,expected);near(f.s.passTarget.x,expected);
  assert.ok(flight.x*direction>c.pitch.length/2-c.pitch.penaltyDepth,'an in-box receiver cannot be forced back onto the area boundary by reversed world bounds');
  near(cross.power,c.ai.crossPower);near(flight.duration,c.passing.loftMinSeconds+c.ai.crossPower*c.passing.loftExtraSeconds);
  assert.equal(events.filter(e=>e.type==='loft').length,1);
 }
});
test('cross flight reaches an actual automatic header while descending inside either penalty area',()=>{
 for(const team of [0,1])for(const direction of [-1,1])for(const side of [-1,1]){
  const f=fixture(team,direction,side);assert.ok(f.tick().some(e=>e.type==='loft'));
  const flight=f.s.ball.flight;f.wing.recover=100;f.wing.vx=f.wing.vz=0;let headed=false;
  for(let tick=0;tick<Math.ceil(flight.duration/dt)+2;tick++){
   const liveFlight=!!f.s.ball.flight,descending=f.s.ball.vy<0;
   const events=f.tick(),header=events.find(e=>e.type==='header'&&e.player===f.receiver.id&&e.team===team);
   if(header){assert.ok(liveFlight,'the header belongs to the real flight, not a later loose ball');assert.ok(descending);headed=true;break;}
   if(!f.s.ball.flight)break;
  }
  assert.ok(headed,`the in-box receiver must meet the descending cross ${JSON.stringify({team,direction,side})}`);
 }
});
test('cross flight preserves the rival stage gate and a mirrored delivery has mirrored landing coordinates',()=>{
 for(const direction of [-1,1]){
  const early=fixture(1,direction,1,1);assert.equal(early.tick().some(e=>e.type==='loft'),false);
 }
 for(const team of [0,1]){
  const a=fixture(team,1,1),b=fixture(team,-1,-1);a.tick();b.tick();
  near(a.s.ball.flight.x,-b.s.ball.flight.x);near(a.s.ball.flight.z,-b.s.ball.flight.z);
  near(a.s.ball.flight.duration,b.s.ball.flight.duration);near(a.s.ball.flight.height,b.s.ball.flight.height);
 }
});
