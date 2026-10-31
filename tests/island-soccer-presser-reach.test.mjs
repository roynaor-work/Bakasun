import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {fieldTarget} from '../workout/island/minigames/soccer-tactics.mjs';
const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer,dt=c.match.fixedStep;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const hx=c.pitch.length/2,hz=c.pitch.width/2,inset=c.rules.playerBoundary;
const edge=c.physics.ballRadius*.4;
const points=[
 ...[-1,1].map(side=>({x:side*(hx+edge),z:6})),
 ...[-1,1].map(side=>({x:6,z:side*(hz+edge)})),
 ...[-1,1].flatMap(x=>[-1,1].map(z=>({x:x*(hx+edge),z:z*(hz+edge)})))
];
function fixture(point,attackDir=1){
 const game=createSoccer({config:c,stage:1,difficulty:'normal',seed:9}),s=game.getState();
 game.clearInput();s.attackDir=attackDir;s.controlled=0;s.switchCooldown=100;s.passTarget=null;
 for(const p of s.players)Object.assign(p,{x:0,z:0,recover:100,cooldown:100,think:100,vx:0,vz:0,slideTime:0,hands:false});
 const player=s.players[3];
 Object.assign(player,{x:clamp(point.x-Math.sign(point.x)*4,-hx+inset,hx-inset),z:clamp(point.z-Math.sign(point.z)*4,-hz+inset,hz-inset),recover:0,cooldown:0});
 Object.assign(s.ball,{owner:null,x:point.x,z:point.z,y:c.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,flight:null,thrower:null,grace:0,lastTeam:0,lastPlayer:0,shot:null});
 return {game,s,player};
}

test('presser reach uses the legal body inset at every touchline, end line and corner while cover retains formation insets',()=>{
 for(const point of points)for(const attackDir of [-1,1]){
  const f=fixture(point,attackDir),target=fieldTarget(f.player,f.s,c);
  assert.equal(target.duty,'press');
  assert.equal(target.x,clamp(point.x,-hx+inset,hx-inset));assert.equal(target.z,clamp(point.z,-hz+inset,hz-inset));
  assert.ok(distance(target,point)<c.physics.pickupRadius,'the legal approach point is physically close enough for the unchanged local pickup');
  assert.ok(Math.abs(point.x)<hx+c.physics.ballRadius&&Math.abs(point.z)<hz+c.physics.ballRadius,'the whole ball remains in play');
  f.s.players[4].recover=0;const cover=fieldTarget(f.s.players[4],f.s,c);
  assert.equal(cover.duty,'cover');assert.ok(Math.abs(cover.x)<=hx-c.tactics.goalInset);assert.ok(Math.abs(cover.z)<=hz-c.tactics.sideInset);
 }
});

test('presser reach physically captures stationary in-play balls beside all lines and corners without expanding reach or teleporting',()=>{
 for(const point of points)for(const attackDir of [-1,1]){
  const {game,s,player}=fixture(point,attackDir);let captured=false;
  for(let tick=0;tick<Math.ceil(8/dt);tick++){
   const before={x:player.x,z:player.z};game.update(dt);const events=game.drainEvents();
   assert.ok(distance(before,player)<=c.players.speed*2*dt+1e-8,'each approach step remains ordinary running movement');
   assert.ok(Math.abs(player.x)<=hx-inset+1e-8&&Math.abs(player.z)<=hz-inset+1e-8,'the field player stays inside the legal body boundary');
   assert.equal(s.ball.x,point.x);assert.equal(s.ball.z,point.z,'pickup never pulls the loose ball across an unreachable gap');
   assert.equal(s.phase,'playing','a stationary whole ball inside the line cannot cause a restart');
   if(s.ball.owner===player.id){
    assert.ok(distance(player,s.ball)<=c.physics.pickupRadius+1e-8,'possession is granted only inside the original local pickup radius');
    assert.ok(events.some(e=>e.type==='possession'&&e.player===player.id));captured=true;break;
   }
   assert.equal(s.ball.owner,null);
  }
  assert.ok(captured,`reachable loose ball ${JSON.stringify({point,attackDir})} must not leave the AI standing behind its formation inset`);
 }
});
