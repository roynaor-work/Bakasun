import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.SOCCER_QUALITY_SOURCE;
if(!root)throw Error('Set SOCCER_QUALITY_SOURCE');
const {createSoccer}=await import(pathToFileURL(resolve(root,'workout/island/minigames/soccer.mjs')));
const base=JSON.parse(await readFile(resolve(root,'workout/island/data/config.json'),'utf8')).minigames.soccer;
function fixture({quality=true,rank=1,runner=true}={}){
  const config={...base,quality:{passing:quality}},game=createSoccer({config,seed:17,difficulty:'normal',rulesVersion:'off',feelVersion:'off'}),s=game.getState();
  for(const p of s.players)Object.assign(p,{recover:100,cooldown:0,vx:0,vz:0,x:-10,z:-10});
  Object.assign(s,{controlled:0,switchCooldown:100,phase:'playing'});
  Object.assign(s.players[0],{x:0,z:0,fx:1,fz:0,recover:0,kick:rank});
  Object.assign(s.players[1],{x:5,z:0,recover:0,cooldown:100});
  if(runner)Object.assign(s.players[6],{x:10,z:5,vx:4.2,vz:0,recover:0,cooldown:100});
  Object.assign(s.ball,{owner:0,x:0,z:0,y:base.physics.ballRadius,lastTeam:0,lastPlayer:0,grace:0});
  return {game,s};
}
test('native sprint input plus pass chooses a safe running receiver behind the passing flag',()=>{
  const {game}=fixture();game.update(base.match.fixedStep,{sprintHeld:true,passPressed:true});
  const event=game.drainEvents().find(e=>e.type==='pass');
  assert.equal(event?.kind,'through');assert.equal(event.target,6);assert.ok(event.x>10);
  const off=fixture({quality:false});off.game.update(base.match.fixedStep,{sprintHeld:true,passPressed:true});
  assert.equal(off.game.drainEvents().find(e=>e.type==='pass')?.kind,'ground');
});
test('quality human ground-pass weight depends on distance instead of the kicker rank',()=>{
  const releases=[];
  for(const rank of [1,5]){const {game,s}=fixture({rank,runner:false});game.update(base.match.fixedStep,{passPressed:true});releases.push(Math.hypot(s.ball.vx,s.ball.vz));}
  assert.ok(releases[0]>0);assert.ok(Math.abs(releases[1]-releases[0])<1e-8);
});
