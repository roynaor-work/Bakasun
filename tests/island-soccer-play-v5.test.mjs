import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySoccerTeams,SOCCER_PRODUCT_TEAMS} from '../workout/island/minigames/soccer-teams.mjs';
import {headerLandingPoint,createLoftFlight,loftDestination} from '../workout/island/minigames/soccer-loft.mjs';
import {rollBall} from '../workout/island/minigames/soccer-physics.mjs';
import {runCross} from '../workout/island/tools/soccer-cross-bench.mjs';

const base=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const product=applySoccerTeams(base,'8');

test('the product default is 8-a-side on 68x42', () => {
  assert.equal(SOCCER_PRODUCT_TEAMS,'8');
  assert.equal(product.pitch.length,68);assert.equal(product.pitch.width,42);assert.equal(product.squad.extraPlayersPerTeam,4);
});
test('headerLandingPoint: the lob crosses header height right over the receiver', () => {
  const hx=product.pitch.length/2,ball={x:hx-14,y:.11,z:9},receiver={x:hx-3,z:1};
  for(const q of [.3,.6,.9]){
    const land=headerLandingPoint(ball,receiver,product,q),solved=createLoftFlight(ball,land,product,q),f={x:ball.x,y:.11,z:ball.z,vx:solved.vx,vy:solved.vy,vz:solved.vz,curve:0};
    let at=null;for(let i=0;i<400&&!at;i++){const d=f.vy<0;rollBall(f,product.match.fixedStep,product);if(d&&f.y<=product.aerial.headerHeight)at={x:f.x,z:f.z};}
    assert.ok(at,'the lob comes down through header height');
    assert.ok(Math.hypot(at.x-receiver.x,at.z-receiver.z)<.8,`q=${q} crosses ${JSON.stringify(at)} not over ${JSON.stringify(receiver)}`);
  }
});
test('snap lob: the stick towards a team-mate sends the ball to him whatever the charge; a drag and v1 keep the ray', () => {
  const players=[{id:0,team:0,role:'forward',x:0,z:0,vx:0,vz:0,fx:1,fz:0,recover:0,slideTime:0},{id:1,team:0,role:'forward',x:12,z:2,vx:0,vz:0,recover:0,slideTime:0},{id:2,team:0,role:'forward',x:6,z:-12,vx:0,vz:0,recover:0,slideTime:0}];
  const state={players,controlled:0,attackDir:1,ball:{x:.5,y:.11,z:0,vx:0,vz:0,owner:0},aim:{x:1,z:.15},passAim:null};
  for(const q of [.15,.5,.95])assert.equal(loftDestination(state,product,q,{snap:true}).target,1,`q=${q}`);
  assert.equal(loftDestination(state,product,.15,{snap:false}).target,null,'without snap a short charge lands short of him');
  const manual={...state,passAim:{x:1,z:.15,manual:true}};
  assert.equal(loftDestination(manual,product,.15,{snap:true}).target,null,'a manual drag keeps its ray');
});
test('cross bench: v2 lobs reach the striker and he heads them; v1 does not', () => {
  const v2=runCross(product,{runs:30,press:'auto'});
  assert.ok(v2.targetCorrect>=90,JSON.stringify(v2));assert.ok(v2.headed>=70,JSON.stringify(v2));
  assert.ok(v2.goals<=70,'a header is not a laser: '+JSON.stringify(v2));
});
