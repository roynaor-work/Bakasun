import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer,matchResult,seededRandom} from '../codex-lab/island-soccer/soccer.mjs';

const base=JSON.parse(await readFile(new URL('../codex-lab/island-soccer/config.json',import.meta.url)));
const dt=base.match.fixedStep;
function controller(s,tick,hold) {
  const p=s.players[s.controlled],b=s.ball,d=s.attackDir;
  if(b.owner===p.id){const shoot=p.x*d>5;hold.value=shoot?hold.value+1:0;return {moveX:d,moveZ:-p.z*.2,kickHeld:shoot && hold.value%65<60};}
  hold.value=0;return {moveX:b.x-p.x,moveZ:b.z-p.z,switchPlayer:tick%45===0};
}
function simulate(stage,seed,idle=false) {
  const model=createSoccer({config:base,stage,seed}),hold={value:0};let tick=0;
  while(!model.result && tick<24000){model.update(dt,idle?{}:controller(model.getState(),tick,hold));tick++;const s=model.getState();
    assert.ok(s.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)), 'finite players');
    assert.ok(Math.abs(s.ball.x)<=base.pitch.length/2+base.rules.netBallInset+.1,'ball bounded in X');
    assert.ok(Math.abs(s.ball.z)<=base.pitch.width/2+base.rules.outMargin+.1,'ball bounded in Z');
  }
  assert.ok(model.result,'a complete match terminates');return model.snapshot();
}
for(let stage=1;stage<=10;stage++)test(`soccer stage ${stage}: seeded complete matches, bounds and difficulty`,()=>{
  const results=[1,2,3,4,5,6].map(seed=>simulate(stage,seed).result);
  for(const result of results){assert.equal(result.stage,stage);assert.equal(result.durationSeconds,150);}
  if(stage<=3)assert.ok(results.every(r=>r.won),'beginner controller wins early stages');
  if(stage>=8)assert.ok(results.some(r=>r.goalsFor<r.goalsAgainst),'late opponents can beat a solo dribbler');
});
test('soccer stage 1: idle beginner assistance wins across seeds',()=>{for(const seed of [1,2,3,17,2026])assert.equal(simulate(1,seed,true).result.won,true);});
test('soccer: identical seed and input reproduce every state field',()=>{
  assert.deepEqual(simulate(8,71),simulate(8,71));
  const a=seededRandom(9),b=seededRandom(10);assert.notDeepEqual(Array.from({length:8},a),Array.from({length:8},b));
});
test('soccer: fixed steps agree at 30, 60 and 120 Hz',()=>{
  const snapshots=[30,60,120].map(hz=>{const game=createSoccer({config:base,stage:4,seed:40});for(let i=0;i<hz*3;i++)game.update(1/hz,{moveX:1,moveZ:.1});return game.snapshot();});
  assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
});
test('soccer: result payload, star precedence, losses and draws',()=>{
  for(const [score,stars,won] of [[[1,0],3,true],[[3,1],2,true],[[2,1],1,true],[[0,0],1,false],[[1,2],1,false]]){
    const result=matchResult({score,stage:3,seed:44,elapsed:150});
    assert.deepEqual(Object.keys(result),['won','goalsFor','goalsAgainst','stage','stars','seed','durationSeconds']);assert.equal(result.stars,stars);assert.equal(result.won,won);
  }
  const game=createSoccer({config:{...base,match:{...base.match,halfSeconds:dt}},seed:44});
  while(!game.result)game.update(.25,{});const result=game.snapshot();game.update(1,{moveX:1,kickHeld:true});assert.deepEqual(game.snapshot(),result,'finished model cannot award twice');
});
test('soccer: two 75 second halves, halftime freezes clock and swaps ends',()=>{
  const g=createSoccer({config:base,seed:51});const s=g.getState();s.halfElapsed=75-dt;s.elapsed=75-dt;
  g.update(dt,{});assert.equal(s.phase,'halftime');assert.equal(s.elapsed,75);assert.equal(s.half,1);
  g.update(.25,{});assert.equal(s.elapsed,75);assert.equal(s.halfElapsed,75);
  while(s.phase==='halftime')g.update(dt,{});
  assert.equal(s.half,2);assert.equal(s.attackDir,-1);assert.ok(s.halfElapsed<.1);
  s.halfElapsed=75-dt;s.elapsed=150-dt;g.update(dt,{});assert.equal(s.phase,'finished');assert.equal(g.result.durationSeconds,150);
});
test('soccer: short press passes to nearest teammate, held press shoots with power',()=>{
  function setup(){const g=createSoccer({config:base,stage:3,seed:31});const s=g.getState();s.players[0].cooldown=0;s.players[1].x=2;s.players[1].z=-4;for(const p of s.players.filter(p=>p.team===1)){p.x=12;p.z=7;}return g;}
  const pass=setup();pass.update(dt,{kickHeld:true});pass.update(dt,{});let s=pass.getState();assert.equal(s.event.type,'pass');assert.equal(s.event.target,1);assert.equal(s.controlled,1);assert.equal(s.ball.owner,null);
  const shot=setup();for(let i=0;i<40;i++)shot.update(dt,{kickHeld:true});shot.update(dt,{});s=shot.getState();assert.equal(s.event.type,'shot');assert.ok(s.event.power>.5);assert.ok(s.ball.vy>0);assert.ok(Math.hypot(s.ball.vx,s.ball.vz)>base.physics.passSpeed);
});
test('soccer: player switch chooses nearest to ball and cancels a charged shot',()=>{
  const g=createSoccer({config:base,stage:3}),s=g.getState();s.players[1].x=6;s.players[1].z=4;Object.assign(s.ball,{owner:null,x:6,z:4,y:2,grace:1});
  g.update(dt,{kickHeld:true});g.update(dt,{switchPlayer:true,kickHeld:true});assert.equal(s.controlled,1);assert.ok(s.charge<dt*2);
  g.clearInput();g.update(dt,{});assert.equal(s.charging,false);assert.notEqual(s.event?.type,'shot');
});
test('soccer: corners, goal kicks and sidelines always restart inside the pitch',()=>{
  for(const [x,z,lastTeam,type] of [[16,6,1,'corner'],[16,6,0,'goalKick'],[-16,6,0,'corner'],[-16,6,1,'goalKick'],[4,10,0,'goalKick']]){
    const g=createSoccer({config:base}),s=g.getState();Object.assign(s.ball,{owner:null,x,z,lastTeam,vx:0,vz:0});g.update(dt,{});
    assert.equal(s.phase,'restart');assert.equal(s.restart.type,type);assert.ok(Math.abs(s.ball.x)<15&&Math.abs(s.ball.z)<9);
    const elapsed=s.elapsed;g.update(.25,{});assert.equal(s.elapsed,elapsed);
    for(let i=0;i<90;i++)g.update(dt,{});assert.notEqual(s.phase,'restart');
  }
});
test('soccer: swept shots and dribbles score, goal celebration freezes time',()=>{
  for(const dribble of [false,true]){const g=createSoccer({config:base}),s=g.getState();s.ball.x=14.9;s.ball.z=0;
    if(dribble){s.players[0].x=14.6;s.players[0].fx=1;s.players[0].fz=0;}else Object.assign(s.ball,{owner:null,vx:40,vz:0,y:.3});
    g.update(dt,{});assert.equal(s.score[0],1);assert.equal(s.phase,'goal');const time=s.elapsed;g.update(.25,{});assert.equal(s.elapsed,time);assert.equal(s.score[0],1);
  }
});
test('soccer: speed and kick ranks change actual motion and ball velocity',()=>{
  function ranked(rank){const team=structuredClone(base.team);team.players.forEach(p=>{p.speed=p.kick=p.guard=rank;});const g=createSoccer({config:base,stage:3,seed:200,team});for(const p of g.getState().players.filter(p=>p.team===1)){p.x=12;p.z=7;}return g;}
  const slow=ranked(1),fast=ranked(5);for(let i=0;i<30;i++){slow.update(dt,{moveZ:1});fast.update(dt,{moveZ:1});}assert.ok(fast.getState().players[0].z>slow.getState().players[0].z+.35);
  const weak=ranked(1),strong=ranked(5);for(let i=0;i<35;i++){weak.update(dt,{kickHeld:true});strong.update(dt,{kickHeld:true});}weak.update(dt,{});strong.update(dt,{});
  const speed=g=>Math.hypot(g.getState().ball.vx,g.getState().ball.vz);assert.ok(speed(strong)>speed(weak)*1.2);
  assert.equal(fast.getState().players[0].guard,5);
  assert.equal(strong.getState().players[3].kick,weak.getState().players[3].kick,'city upgrades never upgrade opponents');
});
test('soccer: malformed input is contained and snapshots are detached',()=>{
  const g=createSoccer({config:base,stage:Infinity,seed:-2});g.update(NaN,{});g.update(-1,{});g.update(dt,{moveX:Infinity,moveZ:NaN});assert.ok(Number.isFinite(g.getState().players[0].x));
  const copy=g.snapshot();copy.players[0].x=999;assert.notEqual(g.getState().players[0].x,999);assert.equal(g.getState().stage,1);
});
test('soccer: vendor copies are identical, GLB stays relative, no island writes or dependencies',async()=>{
  for(const file of ['three.module.js','GLTFLoader.js','BufferGeometryUtils.js','LICENSE.three'])assert.deepEqual(await readFile(new URL(`../codex-lab/island-soccer/vendor/${file}`,import.meta.url)),await readFile(new URL(`../codex-lab/kid-full/vendor/${file}`,import.meta.url)));
  const model=await readFile(new URL('../codex-lab/island-soccer/soccer.mjs',import.meta.url),'utf8');assert.doesNotMatch(model.replace(/\/\/[^\n]*/g,''),/\b(document|window|localStorage|Date|Math\.random)\b/);
  const app=await readFile(new URL('../codex-lab/island-soccer/app.mjs',import.meta.url),'utf8');assert.doesNotMatch(app,/island\.v1/);assert.match(app,/setItem\('soccer-lab'/);
  const view=await readFile(new URL('../codex-lab/island-soccer/soccer-view.mjs',import.meta.url),'utf8');assert.match(view,/\.\.\/kid-full\/kid-full\.glb/);
});
