import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const input=(o={})=>({...NO_INPUT,move:{x:0,z:0},...o});
function setup(options={}){
 const config=structuredClone(cfg);if(options.steal)Object.assign(config.steal,options.steal);
 const clubs=matchTeams(config,initialHoops(config),{stage:1});
 const e=createHoopsEngine({config,seed:options.seed??719,teams:clubs.teams,userTeam:0,profile:'quick',difficulty:'easy'});
 const s=e.debug.state,a=e.debug.api;s.phase='live';s.phaseT=0;s.clock=80;s.shotClock=24;
 const mine=a.onCourt(0),theirs=a.onCourt(1);
 for(const [i,p] of a.all().entries()){e.debug.place(p.id,-11+(i%5)*4,i<5?-6:6);p.act=null;p.air=-1;p.think=1e6;p.goal=null;p.intent.speed=0;}
 e.debug.give(mine[0].id);s.controlled=mine[0].id;e.drainEvents();
 return {e,s,a,mine,theirs,config};
}
function ticks(e,n,inp=input()){const events=[];for(let i=0;i<n;i++){e.step(inp);events.push(...e.drainEvents());}return events;}
function defend(t){const {e,s,mine,theirs}=t,p=mine[0],h=theirs[0];e.debug.place(p.id,0,0);e.debug.place(h.id,0,1);e.debug.give(h.id);s.controlled=p.id;e.drainEvents();return {p,h};}

test('defence: explicit switch chooses the nearest teammate to the handler and to a loose ball',()=>{
 const t=setup(),{e,s,mine,theirs}=t;const h=theirs[0];e.debug.place(h.id,3,0);e.debug.give(h.id);
 e.debug.place(mine[0].id,-10,0);e.debug.place(mine[1].id,3,.9);e.debug.place(mine[2].id,8,0);s.controlled=mine[0].id;
 e.step(input({switchPress:true}));assert.equal(s.controlled,mine[1].id);
 s.ball.state='loose';s.ball.owner=null;s.ball.x=-4;s.ball.z=0;s.ball.y=4;s.ball.vx=s.ball.vy=s.ball.vz=0;
 e.debug.place(mine[2].id,-4,.9);s.controlled=mine[1].id;e.step(input({switchPress:true}));assert.equal(s.controlled,mine[2].id);
});

test('defence: a player who already passed still resolves a subsequent steal',()=>{
 const t=setup({steal:{base:3,foulBase:0}}),{e,s,a,mine,theirs}=t,p=mine[0],receiver=mine[1];
 e.debug.place(p.id,0,0);e.debug.place(receiver.id,4,0);assert.ok(a.startPass(p,receiver));
 ticks(e,30);assert.equal(p.act,null);assert.ok(p.act2?.target,'the old pass target remains in the engine');
 const h=theirs[0];e.debug.place(p.id,0,0);e.debug.place(h.id,0,1);e.debug.give(h.id);s.controlled=p.id;p.r.steal=100;h.r.handle=0;
 const events=[...ticks(e,1,input({passPress:true})),...ticks(e,14)];
 assert.ok(events.some(x=>x.type==='steal'&&x.playerId===p.id));assert.equal(p.stats.stl,1);assert.equal(h.stats.tov,1);
});

test('defence: a steal outside the measured range misses and still consumes its cooldown',()=>{
 const t=setup({steal:{base:100,foulBase:100}}),{e,s}=t,{p,h}=defend(t);
 e.debug.place(h.id,7,0);s.controlled=p.id;
 const events=[...ticks(e,1,input({passPress:true})),...ticks(e,14)];
 assert.ok(events.some(x=>x.type==='stealMiss'&&x.reason==='range'&&x.distance>x.range));
 assert.equal(p.stats.stl,0);assert.equal(p.stats.pf,0);assert.ok(p.cd.steal>0);assert.equal(e.debug.api.startSteal(p),false);
});

test('defence: an unsuccessful close reach can be a reach foul; a clean jump does not launch into the handler',()=>{
 const t=setup({steal:{base:0,foulBase:100}}),{e}=t,{p}=defend(t);
 const events=[...ticks(e,1,input({passPress:true})),...ticks(e,14)];
 assert.ok(events.some(x=>x.type==='foul'&&x.playerId===p.id));assert.equal(p.stats.pf,1);
 const jump=setup(),d=defend(jump).p;d.vx=5;
 const ev=ticks(jump.e,1,input({shootDown:true}));assert.ok(ev.some(x=>x.type==='jump'&&x.kind==='block'));
 assert.ok(d.air>=0);assert.ok(Math.hypot(d.vx,d.vz)<3);assert.equal(jump.e.snapshot().players.find(x=>x.id===d.id).air,true);
});

function running({sprint,defense=false,energy=1,steps=70}={}){
 const t=setup(),{e,s,mine,theirs,config}=t,p=mine[0];config.player.defenseAssist=false;
 e.debug.place(p.id,-4,0);e.debug.setEnergy(p.id,energy);p.r.speed=80;
 if(defense){e.debug.place(theirs[0].id,7,6);e.debug.give(theirs[0].id);}else e.debug.give(p.id);s.controlled=p.id;
 const x=p.x;ticks(e,steps,input({move:{x:1,z:0},sprint}));return {...t,p,distance:p.x-x};
}
test('sprint: a held request accelerates attack and defence and consumes more reserve than jogging',()=>{
 for(const defense of [false,true]){
  const jog=running({sprint:false,defense}),fast=running({sprint:true,defense});
  assert.ok(fast.distance>jog.distance*1.12,`${defense?'defence':'attack'} ${fast.distance} > ${jog.distance}`);
  assert.ok(fast.p.energy<jog.p.energy-.005);assert.equal(fast.p.sprinting,true);
  const snap=fast.e.snapshot().players.find(p=>p.id===fast.p.id);assert.equal(snap.sprinting,true);assert.equal(snap.exhausted,false);
  const speed=Math.hypot(fast.p.vx,fast.p.vz);ticks(fast.e,18,input({move:{x:1,z:0},sprint:false}));
  assert.equal(fast.p.sprinting,false);assert.ok(Math.hypot(fast.p.vx,fast.p.vz)<speed-.4,'releasing sprint returns to running speed');
 }
});
test('sprint: exhausted requests grant no boost, and a held button at rest does not spend stamina',()=>{
 const jog=running({sprint:false,energy:.03,steps:35}),empty=running({sprint:true,energy:.03,steps:35});
 assert.equal(empty.p.sprinting,false);assert.ok(Math.abs(empty.distance-jog.distance)<1e-9);assert.ok(Math.abs(empty.p.energy-jog.p.energy)<1e-9);
 assert.equal(empty.e.snapshot().players.find(p=>p.id===empty.p.id).exhausted,true);
 const t=setup(),p=t.mine[0];t.e.debug.place(p.id,0,0);p.energy=.4;const start=p.energy;ticks(t.e,60,input({sprint:true}));
 assert.equal(p.sprinting,false);assert.ok(p.energy>=start,'standing still recovers rather than paying a sprint multiplier');
});

function attack(seed=719,{timed=false,range=1.35}={}){
 const t=setup({seed,steal:{base:0,foulBase:0}}),{e,s,mine,theirs,config}=t,p=mine[0],d=theirs[0];config.player.defenseAssist=false;
 e.debug.place(p.id,0,0);p.face=0;p.r.handle=90;p.r.release=100;e.debug.give(p.id);s.controlled=p.id;
 e.debug.place(d.id,0,range);d.r.perimD=90;d.act=timed?'steal':null;d.actT=timed?config.steal.reachAt:0;d.act2=null;e.drainEvents();return {...t,p,d};
}
test('attack: tap move and held move request explicit crossover and spin with cost and cooldown',()=>{
 const cross=attack(811,{range:5}),spin=attack(811,{range:5});
 const cx=ticks(cross.e,1,input({movePress:true})),sp=ticks(spin.e,1,input({spinPress:true}));
 assert.equal(cross.p.act,'cross');assert.equal(spin.p.act,'spin');assert.ok(cx.some(e=>e.type==='move'&&e.kind==='cross'));assert.ok(sp.some(e=>e.type==='move'&&e.kind==='spin'));
 assert.ok(cross.p.energy<.99);assert.ok(spin.p.energy<cross.p.energy);assert.ok(cross.p.cd.move>1);
 const elapsed=cross.p.actT;ticks(cross.e,1,input({movePress:true}));assert.ok(cross.p.actT>elapsed,'repeat input does not restart the clip or resolution');
 const tail=ticks(cross.e,40);assert.ok(tail.some(e=>e.type==='moveResult'&&e.reason==='space'));assert.equal(cross.p.act,null);assert.equal(cross.e.debug.api.startMove(cross.p,'spin'),false,'cooldown outlasts the move');
});
test('attack: timing a crossover against a committed reach beats more defenders than an uncommitted guard',()=>{
 let good=0,late=0,goodFailures=0;
 for(let seed=900;seed<964;seed++)for(const timed of [false,true]){
  const t=attack(seed,{timed});const events=[...ticks(t.e,1,input({movePress:true})),...ticks(t.e,16)];
  const result=events.filter(e=>e.type==='moveResult');assert.equal(result.length,1,'one resolution per move');
  assert.equal(result[0].timed,timed);
  if(result[0].success){if(timed)good++;else late++;assert.ok(t.d.stumble>0,'successful move slows the committed guard');}
  else if(timed)goodFailures++;
 }
 assert.ok(good>late+8,`good timing ${good}, uncommitted guard ${late}`);assert.ok(goodFailures>0&&good>0,'timing improves the odds without guaranteeing success');
});
test('attack: a shot fake can draw a close defender into a jump, but never releases or scores the ball',()=>{
 let baited=0;
 for(let seed=1000;seed<1032;seed++){
  const t=attack(seed,{range:1.4}),{p,d,e}=t;d.r.perimD=0;d.vz=-3;const owner=e.snapshot().ball.owner;
  const events=[...ticks(e,1,input({fakePress:true})),...ticks(e,12)];
  const result=events.find(x=>x.type==='fakeResult');assert.ok(result);if(result.success){baited++;assert.ok(d.air>=0);}
  assert.equal(p.act,'fake');assert.equal(e.snapshot().ball.owner,owner);assert.equal(e.snapshot().ball.state,'held');assert.equal(e.snapshot().players.find(x=>x.id===p.id).shotHeld,false);
  assert.equal(p.stats.fga,0);assert.ok(!events.some(x=>x.type==='release'||x.type==='score'));assert.ok(p.energy<.998);
  assert.equal(e.debug.api.startFake(p),false,'fake cannot be spammed while it is active');
 }
 assert.ok(baited>0&&baited<32,'a fake is a risk, rather than a guaranteed defender jump');
 const far=attack(1001,{range:5}),events=[...ticks(far.e,1,input({fakePress:true})),...ticks(far.e,12)];
 assert.equal(events.find(e=>e.type==='fakeResult').success,false);assert.equal(far.d.air,-1);
});
test('attack: cancelling a consumed shot charge keeps possession without releasing the shot',()=>{
 const t=setup(),{e,s,a,mine}=t,p=mine[0],side=a.side(0),rim=e.court.rim(side);e.debug.place(p.id,rim.x-side*6,0);s.controlled=p.id;
 ticks(e,1,input({shootDown:true}));assert.equal(p.shot?.held,true);ticks(e,10);
 const events=[...ticks(e,1,input({shootCancel:true,shootUp:true})),...ticks(e,70)];
 assert.ok(events.some(e=>e.type==='shotCancel'));assert.equal(p.act,null);assert.equal(p.stats.fga,0);assert.equal(e.snapshot().ball.owner,p.id);assert.ok(!events.some(e=>e.type==='release'));
});
test('attack: new action inputs preserve deterministic replay for the same seed',()=>{
 const one=attack(1171),two=attack(1171);
 for(let i=0;i<210;i++){
  const inp=input({move:{x:Math.sin(i/45)*.45,z:0},sprint:i%50<20,movePress:i===0||i===125,spinPress:i===80,fakePress:i===180});
  one.e.step(inp);two.e.step(inp);assert.deepEqual(one.e.snapshot(),two.e.snapshot());assert.deepEqual(one.e.drainEvents(),two.e.drainEvents());
 }
});
