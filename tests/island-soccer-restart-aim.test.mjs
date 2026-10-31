import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {restartAimPreview,restartThrowTarget} from '../workout/island/minigames/soccer-restarts.mjs';

const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer,dt=c.match.fixedStep;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ~= ${b}`);
function fixture(type,direction=1,side=1){
 const game=createSoccer({config:c,seed:17}),s=game.getState(),events=[];s.attackDir=direction;
 const tick=(input={})=>{game.update(dt,input);const list=game.drainEvents();events.push(...list);return list;};
 const end=type==='corner'?direction:-direction;
 Object.assign(s.ball,{owner:null,x:type==='throwIn'?0:end*(c.pitch.length/2-.05),z:side*(type==='throwIn'?c.pitch.width/2-.05:6),y:c.physics.ballRadius,vx:type==='throwIn'?0:end*30,vz:type==='throwIn'?side*30:0,vy:0,lastTeam:1,grace:100,flight:null});
 tick();assert.equal(s.restart?.type,type);assert.equal(s.restart.team,0);
 for(let i=0;i<1800&&s.phase!=='restartReady';i++)tick();
 assert.equal(s.phase,'restartReady');assert.equal(s.restart.action,undefined);
 s.players[s.restart.player].card.pass=c.card.initial;
 return {game,s,events,tick,restart:s.restart};
}
function release(f,input){
 for(let i=0;i<120&&f.s.phase!=='playing';i++)f.tick(input);
 assert.equal(f.s.phase,'playing');
 return f.events.find(e=>e.type==='throw'||e.type==='loft'||e.type==='pass');
}

for(const type of ['throwIn','corner','goalKick'])for(const direction of [-1,1])for(const shot of [false,true])test(`${type} ${shot?'long button':'pass button'}, direction ${direction}: cue starts at the taker and matches the real manual release`,()=>{
 for(const seconds of [.05,.5]){
  const f=fixture(type,direction,direction),s=f.s,r=f.restart,selected=s.controlled;
  const aim={manual:true,x:type==='corner'?-direction*.4:direction,z:type==='throwIn'?direction*.8:-direction*.7};
  const key=shot?'kickHeld':'passHeld',aimKey=shot?'kickAim':'passAim';
  for(let n=0;n<Math.round(seconds/dt);n++)f.tick({[key]:true,[aimKey]:aim});
  const cue=restartAimPreview(s,c,{});assert.ok(cue);
  assert.equal(cue.playerId,r.player);assert.equal(s.controlled,selected,'aiming cannot switch away from the freely controlled receiver');
  near(cue.originX,r.x);near(cue.originZ,r.z);
  assert.ok(Math.hypot(cue.originX-s.players[selected].x,cue.originZ-s.players[selected].z)>1,'fixture keeps the selector away from the reserved taker');
  if(type==='throwIn'){assert.equal(cue.handThrow,true);assert.equal(cue.loft,false,'a hand throw must not show the inaccurate foot-cross parabola');assert.ok(cue.aimZ*-Math.sign(r.z)>0);}
  const expected={...cue},event=release(f,{[aimKey]:aim});assert.ok(event);
  const speed=Math.hypot(s.ball.vx,s.ball.vz);assert.ok(speed>0);
  near(s.ball.vx/speed,expected.aimX);near(s.ball.vz/speed,expected.aimZ);
  near(s.ball.x,r.x);near(s.ball.z,r.z);
  if(type!=='throwIn'){
   assert.equal(Boolean(s.ball.flight),expected.loft);near(event.power,expected.power);
   if(expected.loft){near(s.ball.flight.x,expected.x);near(s.ball.flight.z,expected.z);near(s.ball.flight.height,expected.height);}
  }
 }
});

test('an automatic hand-throw cue shares the actual short/long receiving choice and keeps its legal inward direction',()=>{
 for(const shot of [false,true]){
  const f=fixture('throwIn'),s=f.s,key=shot?'kickHeld':'passHeld';
  for(let i=0;i<6;i++)f.tick({[key]:true});
  const cue=restartAimPreview(s,c,{}),target=restartThrowTarget(s.players[f.restart.player],f.restart,s,c,shot);
  assert.ok(target);assert.equal(cue.handThrow,true);assert.equal(cue.loft,false);
  const at=JSON.stringify(s);assert.equal(restartAimPreview(s,c,cue),cue);assert.equal(JSON.stringify(s),at,'preview and target selection do not move a runner or acquire possession');
  const event=release(f,{});assert.equal(event.type,'throw');
  // Runners continue moving during preparation. Compare the common targeting
  // geometry at actual release, rather than expecting a 320ms-old position.
  const r=f.restart,accepted={...s,restart:r,phase:'restartReady',charging:true,charge:r.action.power*(shot?c.physics.chargeSeconds:c.passing.chargeSeconds),chargeKind:shot?'shot':'pass'};
  const released=restartAimPreview(accepted,c,{});
  assert.equal(event.target,restartThrowTarget(s.players[r.player],r,s,c,shot).id);
  const speed=Math.hypot(s.ball.vx,s.ball.vz);near(s.ball.vx/speed,released.aimX);near(s.ball.vz/speed,released.aimZ);
 }
});

test('ordinary play and inactive restart previews leave the reusable cue untouched',()=>{
 const f=fixture('goalKick'),out={sentinel:7};
 assert.equal(restartAimPreview(f.s,c,out),null);assert.deepEqual(out,{sentinel:7});
 const plain={phase:'playing',restart:null,charging:true};assert.equal(restartAimPreview(plain,c,out),null);assert.deepEqual(out,{sentinel:7});
 f.tick({passHeld:true,passAim:{x:1,z:0,manual:true}});
 const before=structuredClone(f.s),config=structuredClone(c),a=restartAimPreview(f.s,c,out);
 assert.equal(a,out);assert.equal(restartAimPreview(f.s,c,out),out);assert.deepEqual(f.s,before);assert.deepEqual(c,config);
});
