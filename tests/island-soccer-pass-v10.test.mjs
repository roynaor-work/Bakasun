import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assistedPassDestination,groundPassSeconds,passExecutionError} from '../workout/island/minigames/soccer-assistance.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {runBench,summarize} from '../workout/island/tools/soccer-pass-bench.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const player=(id,x,z,extra={})=>({id,x,z,vx:0,vz:0,fx:1,fz:0,team:0,role:'support',speed:1,cooldown:0,recover:0,slideTime:0,...extra});
const foe=(id,x,z,extra={})=>player(id,x,z,{team:1,...extra});
const ball=(extra={})=>({x:0,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,owner:0,...extra});
const state=(players,aimDegrees=0,extra={})=>{const a=aimDegrees*Math.PI/180;return {players,ball:ball(),controlled:0,attackDir:1,role:'field',aim:{x:Math.cos(a),z:Math.sin(a)},...extra};};
const at=(id,distance,degrees,extra={})=>player(id,Math.cos(degrees*Math.PI/180)*distance,Math.sin(degrees*Math.PI/180)*distance,extra);

test('pass v10: the team-mate nearest the stick bearing is chosen, not the nearest one',()=>{
  const s=state([player(0,0,0),at(1,6,-20),at(2,15,12)],8);
  assert.equal(assistedPassDestination(s,config).target,2);
  const t=state([player(0,0,0),at(1,6,-20),at(2,15,12)],-14);
  assert.equal(assistedPassDestination(t,config).target,1);
});

test('pass v10: a tap reaches a far team-mate instead of stopping after the minimum distance',()=>{
  for(const distance of [8,12,16,19]){
    const result=assistedPassDestination(state([player(0,0,0),at(1,distance,5)],-3),config);
    assert.equal(result.target,1);assert.ok(Math.abs(result.distance-distance)<0.05,`distance ${distance} got ${result.distance}`);
  }
});

test('pass v10: a pass leads a runner but never beyond the configured lead',()=>{
  const runner=at(1,10,0,{vx:0,vz:5});
  const result=assistedPassDestination(state([player(0,0,0),runner],0),config);
  assert.equal(result.target,1);assert.ok(result.z>0.3,'aims ahead of the runner');assert.ok(result.z<=config.assistance.passing.maxLeadDistance+1e-9);
  const standing=assistedPassDestination(state([player(0,0,0),at(1,10,0)],0),config);
  assert.ok(Math.abs(standing.z)<1e-9,'a standing team-mate gets the ball at his feet');
});

test('pass v10: an open lane only breaks a near tie, a clear intent is never overridden',()=>{
  const mates=[player(0,0,0),at(1,10,6),at(2,10,-6)];
  const blocker=foe(9,5,Math.sin(6*Math.PI/180)*5);
  assert.equal(assistedPassDestination(state([...mates,blocker],0.4),config).target,2,'tie: the open lane wins');
  assert.equal(assistedPassDestination(state([...mates,blocker],14),config).target,1,'a stick clearly towards the marked team-mate keeps him');
});

test('pass v10: a team-mate standing on the line is the receiver',()=>{
  const result=assistedPassDestination(state([player(0,0,0),at(1,5,0),at(2,14,0)],0),config);
  assert.equal(result.target,1);
});

test('pass v10: ground pass time grows gently with distance and is bounded',()=>{
  let previous=0;
  for(const distance of [1,5,10,15,20,22]){const t=groundPassSeconds(distance,config);assert.ok(t>=previous&&t>=0.3&&t<=1.2);previous=t;}
  assert.ok(groundPassSeconds(5,config)<groundPassSeconds(22,config));
  const legacy={...config,assistance:{...config.assistance,passing:{...config.assistance.passing,travelBaseSeconds:0}}};
  assert.equal(groundPassSeconds(12,legacy),config.passing.groundTravelSeconds);
});

test('pass v10: execution error grows with pressure and running speed and is repeatable',()=>{
  const lone=state([player(0,0,0),foe(9,20,0)]),pressed=state([player(0,0,0),foe(9,1.5,0)]),running=state([player(0,0,0,{vx:5.3}),foe(9,20,0)]);
  const a=passExecutionError(lone,config,1),b=passExecutionError(pressed,config,1),c=passExecutionError(running,config,1);
  assert.ok(a>0&&b>a&&c>a);assert.equal(passExecutionError(pressed,config,0),0);assert.equal(passExecutionError(pressed,config,1),b);
  assert.ok(b<=(config.assistance.passing.baseErrorDegrees+config.assistance.passing.pressureErrorDegrees)*Math.PI/180+1e-12);
  assert.ok(passExecutionError(pressed,config,-1)<0);
});

test('pass v10: the stale stick does not walk the receiver away, a new direction does',()=>{
  const make=()=>{
    const game=createSoccer({config,seed:77,stage:3}),s=game.getState();
    for(const p of s.players)Object.assign(p,{x:p.team===0?-16:16,z:(p.id%4-1.5)*4,vx:0,vz:0,cooldown:100,think:100,recover:0});
    Object.assign(s.players[0],{x:0,z:0,cooldown:0});Object.assign(s.players[1],{x:8,z:0,cooldown:0});
    Object.assign(s.ball,{owner:0,x:.49,z:0,vx:0,vz:0,grace:0});s.controlled=0;s.switchCooldown=10;
    return {game,s};
  };
  const run=turn=>{
    const {game,s}=make(),step=config.match.fixedStep;
    game.update(step,{moveX:1,moveZ:0,passHeld:true});game.update(step,{moveX:1,moveZ:0,passHeld:false});
    assert.equal(s.controlled,1,'the receiver is selected at once');
    for(let i=0;i<20;i++)game.update(step,turn?{moveX:0,moveZ:1}:{moveX:1,moveZ:0});
    return s.players[1];
  };
  const stale=run(false),turned=run(true);
  assert.ok(turned.z>0.8,'a deliberate new direction moves him');assert.ok(Math.abs(stale.z)<0.5,'the leftover stick does not');
});

test('pass v10: seeded headless bench meets the clear-intent target with no regression in release time',()=>{
  const rows=runBench(config,{runs:150,scenarios:['clean','live'],kinds:['tap','short']}),summary=summarize(rows),again=summarize(runBench(config,{runs:150,scenarios:['clean','live'],kinds:['tap','short']}));
  assert.deepEqual(summary,again,'fixed seeds repeat exactly');
  for(const [key,row] of Object.entries(summary)){
    assert.ok(row.clearIntent>=90,`${key}: ${row.clearIntent}% of clear-intent passes reach the intended team-mate`);
    assert.ok(row.clearWrong<=6,`${key}: wrong-player passes ${row.clearWrong}%`);
    assert.equal(row.out,0);assert.equal(row.loose,0);assert.ok(row.badFirstTouch<3);
  }
  assert.ok(summary['clean/tap'].releaseSeconds<=0.1);
});
