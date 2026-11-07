import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
const config=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;

function goalKickOrganize(aiVersion,cap){
  const c=cap===undefined?config:{...config,restarts:{...config.restarts,organizeMaxSeconds:cap}};
  const g=createSoccer({config:c,seed:9,stage:5,difficulty:'normal',role:'field',aiVersion}),s=g.getState(),hx=c.pitch.length/2;
  g.clearInput();s.phase='playing';
  // Everyone stands at the far end, so every player has a long walk to the restart layout.
  for(const p of s.players)Object.assign(p,{x:p.team===0?hx-3:-hx+3,z:(p.id%4-1.5)*4,vx:0,vz:0,cooldown:0,recover:0});
  Object.assign(s.ball,{owner:null,x:hx-.05,z:3,y:c.physics.ballRadius,vx:6,vz:0,vy:0,grace:0,lastTeam:1,lastPlayer:3,flight:null,shot:null});
  for(let i=0;i<4&&!s.restart;i++)g.update(1/60,{});
  assert.ok(s.restart,'the ball leaving the pitch starts a restart');
  return s.restart.organizeSeconds;
}
test('restart organisation: v1 keeps the 3 s cap, v2 caps it at 2 s (configurable), shorter walks are unchanged',()=>{
  const v1=goalKickOrganize('v1'),v2=goalKickOrganize('v2');
  assert.ok(v1>2.2&&v1<=3.001,`v1 organise ${v1}`);
  assert.ok(v2<=2.001&&v2>=config.restarts.walkSeconds,`v2 organise ${v2}`);
  assert.ok(goalKickOrganize('v2',1.2)<=1.2001,'restarts.organizeMaxSeconds overrides the default');
  assert.ok(goalKickOrganize('v1',1.2)>2.2,'v1 ignores the new setting');
});
