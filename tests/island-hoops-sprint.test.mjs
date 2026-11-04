import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT,SPRINT_RESERVE} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const input=(o={})=>({...NO_INPUT,move:{x:0,z:0},...o});
function setup(seed=719){
 const config=structuredClone(cfg);
 const clubs=matchTeams(config,initialHoops(config),{stage:1});
 const e=createHoopsEngine({config,seed,teams:clubs.teams,userTeam:0,profile:'quick',difficulty:'easy'});
 const s=e.debug.state,a=e.debug.api;s.phase='live';s.phaseT=0;s.clock=80;s.shotClock=24;
 const mine=a.onCourt(0);
 for(const [i,p] of a.all().entries()){e.debug.place(p.id,-11+(i%5)*4,i<5?-6:6);p.act=null;p.air=-1;p.think=1e6;p.goal=null;p.intent.speed=0;}
 e.debug.give(mine[0].id);s.controlled=mine[0].id;e.drainEvents();
 return {e,s,a,p:mine[0],config};
}
// the runner is put back on the same frontcourt spot every tick, so neither the sideline nor the backcourt count stops him
function run(t,n,inp){let sprintTicks=0;for(let i=0;i<n;i++){t.e.debug.place(t.p.id,2,0);t.e.step(inp);if(t.p.sprinting)sprintTicks++;}t.e.drainEvents();return sprintTicks;}
const held=input({move:{x:1,z:0},sprint:true}),jog=input({move:{x:1,z:0},sprint:false});

test('sprint reserve: the tuning in config matches the brief (3.5 s drain, 1 s delay, 6 s refill, 30% unlock)',()=>{
 assert.deepEqual(cfg.sprintReserve,{drain:3.5,delay:1,refill:6,unlock:0.3});assert.deepEqual({...SPRINT_RESERVE},cfg.sprintReserve);
});

test('sprint reserve: a held sprint empties the meter in about 3.5 seconds and then locks',()=>{
 const t=setup();assert.equal(t.p.boost,1);
 const sprinting=run(t,Math.round(3.5*60)+3,held);
 assert.ok(sprinting>=Math.round(3.5*60)-8&&sprinting<=Math.round(3.5*60)+3,'sprint ticks '+sprinting);
 assert.equal(t.p.boost,0);assert.equal(t.p.boostLock,true);assert.equal(t.p.sprinting,false,'holding the button on an empty tank gives nothing');
 const snap=t.e.snapshot().players.find(x=>x.id===t.p.id);assert.equal(snap.boost,0);assert.equal(snap.boostLocked,true);assert.equal(snap.sprinting,false);
});

test('sprint reserve: refilling waits a second after the sprint stops, then takes about 6 seconds to fill',()=>{
 const t=setup();run(t,60*2,held);const after2=t.p.boost;assert.ok(Math.abs(after2-(1-2/3.5))<.03,'after 2 s '+after2);
 run(t,55,jog);assert.ok(Math.abs(t.p.boost-after2)<1e-9,'no refill in the first second after release');
 run(t,65,jog);assert.ok(t.p.boost>after2+.1,'refill has started after the delay');
 // the delay counts from the moment the sprint stopped (here: the tank ran dry), not from the button release
 const t2=setup();run(t2,Math.round(3.5*60),held);assert.equal(t2.p.boost,0);
 run(t2,58,jog);assert.ok(t2.p.boost<1e-9,'a second of rest before any refill');run(t2,2,jog);
 run(t2,Math.round(6*60*0.5),jog);assert.ok(Math.abs(t2.p.boost-.5)<.04,'half full after 3 s of refill: '+t2.p.boost);
 run(t2,Math.round(6*60*0.5)+5,jog);assert.ok(t2.p.boost>=.99,'full after 6 s of refill: '+t2.p.boost);
 assert.equal(t2.p.boostLock,false);
});

test('sprint reserve: an emptied meter cannot sprint again until it is back to 30%, even if the button is held throughout',()=>{
 const t=setup();run(t,Math.round(3.5*60),held);assert.equal(t.p.boostLock,true);
 // the button stays down: the player moves, no sprint, the tank refills after the delay
 run(t,58,held);assert.ok(t.p.boost<1e-9);run(t,2,held);
 const sprintedWhileLocked=run(t,Math.round(6*60*0.25),held);
 assert.equal(sprintedWhileLocked,0,'no sprint below the unlock level');assert.ok(t.p.boost>.2&&t.p.boost<.3,'still below 30%: '+t.p.boost);
 run(t,Math.round(6*60*0.08),held);assert.equal(t.p.boostLock,false,'unlocked at 30%: '+t.p.boost);
 assert.ok(run(t,10,held)>0,'sprinting again once unlocked');
});

test('sprint reserve: a sprint that is not held does not spend the meter, and a partial reserve still boosts speed',()=>{
 const t=setup();run(t,120,jog);assert.equal(t.p.boost,1);
 const t2=setup();run(t2,60,held);const sprintCap=t2.e.snapshot().players.find(x=>x.id===t2.p.id).maxSpeed;
 run(t2,90,jog);const jogCap=Math.hypot(t2.p.vx,t2.p.vz);
 assert.ok(sprintCap>jogCap*1.1,`sprint cap ${sprintCap} vs jog ${jogCap}`);
});
