import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../workout/island/vendor/three.module.js';
import {createVessel} from '../workout/island/minigames/naval-view.mjs';
import {createNavalModel,navalLead} from '../workout/island/minigames/naval.mjs';
import {navalShotRange,navalRangeState} from '../workout/island/minigames/g6e-ballistics.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,b=config.navalDuel;
const make=(level=5,seed=0)=>createNavalModel({config,balance:b,level,seed,random:seededRandom(Math.imul(seed+1,0x9e3779b9))});
const advance=(m,t,input={})=>{for(let i=0;i<Math.ceil(t/.02);i++)m.update(.02,input);};
test('G6e power grows while held; release fires once and higher power travels farther',()=>{
 const m=make();advance(m,.3,{chargeHeld:true});const low=m.chargePower;advance(m,.6,{chargeHeld:true});assert.ok(m.chargePower>low);assert.equal(m.fired,0);
 m.update(.02,{chargeHeld:false,releasePower:m.chargePower});advance(m,.1,{chargeHeld:false});assert.equal(m.fired,1);
 assert.ok(navalShotRange(.8,b)>navalShotRange(.2,b));assert.equal(navalShotRange(0,b),28);
 const launch=power=>{const n=make();n.update(.02,{chargeHeld:false,yaw:.3,releasePower:power});return Math.hypot(n.ball.targetX-n.playerShip.x,n.ball.targetZ-n.playerShip.z);};assert.ok(launch(.9)>launch(.1)+150);
});
test('G6e a zero-length tap spends one round and visibly lands close',()=>{
 const m=make(),ammo=m.ammo[0];m.update(.02,{chargeHeld:false,releasePower:0});assert.equal(m.fired,1);assert.equal(m.ammo[0],ammo-1);assert.ok(m.ball.duration>0);assert.ok(Math.hypot(m.ball.targetX-m.playerShip.x,m.ball.targetZ-m.playerShip.z)<80);advance(m,1);assert.ok(m.blast.life>0);
});
test('G6e cancelling charge fires nothing, selected bearing survives idle frames and reverses landing',()=>{
 const m=make();advance(m,.3,{chargeHeld:true,targetX:200,targetZ:100});const yaw=m.yaw;advance(m,.2,{chargeHeld:false});assert.equal(m.fired,0);assert.equal(m.yaw,yaw);
 m.update(.02,{chargeHeld:false,releasePower:.6});assert.ok(m.ball.targetZ>40);const n=make();n.update(.02,{chargeHeld:false,yaw:-.7,releasePower:.6});assert.ok(n.ball.targetZ<0);
});
test('G6e inside the enemy ring has less scatter; outside scatter grows with distance',()=>{
 const enemies=[{x:300,z:0,hp:1,active:true}],inside=navalRangeState({x:150,z:0},enemies,b),outside=navalRangeState({x:60,z:0},enemies,b),far=navalRangeState({x:20,z:0},enemies,b);
 assert.ok(inside.inside);assert.equal(outside.inside,false);assert.ok(inside.spread<outside.spread&&outside.spread<far.spread);
});
const rates=[];
for(const level of [1,5,10])test(`G6e 200 normal charged shots inside the ring at stage ${level}`,()=>{
 let hits=0;for(let seed=0;seed<200;seed++){const m=make(level,seed);m.playerShip.x=150;advance(m,seed%9*.7);const p=navalLead(m.playerShip,m.enemyShip,b),range=Math.hypot(p.x-m.playerShip.x,p.z-m.playerShip.z);
  m.update(.02,{chargeHeld:false,targetX:p.x,targetZ:p.z,releasePower:(range-b.charge.minRange)/(b.charge.maxRange-b.charge.minRange)});advance(m,1.4);hits+=m.snapshot().hits;
 }
 const rate=hits/200;rates.push({level,hits,shots:200,rate});if(level===5)assert.ok(rate>=.4&&rate<=.55,JSON.stringify(rates));if(level===10){assert.ok(rates[0].rate>rates[1].rate&&rate<rates[1].rate);assert.ok(rate>=.35);console.log('G6e aimed calibration',JSON.stringify(rates));}
});
test('G6e fewer than 20% hits across 200 random bearing/power shots inside and outside ring',()=>{
 const random=seededRandom(0x6e2026);for(const x of [60,150]){let hits=0;for(let seed=0;seed<200;seed++){const m=make(5,seed);m.playerShip.x=x;advance(m,seed%5*.3);m.update(.02,{chargeHeld:false,yaw:(random()-.5)*Math.PI,releasePower:random()});advance(m,1.4);hits+=m.snapshot().hits;}console.log('G6e random calibration',JSON.stringify({x,hits,shots:200}));assert.ok(hits/200<.2);}
});
test('G6e player factory has no fixed flag/triangle and damage flame starts hidden',()=>{
 const v=createVessel(THREE,b.render);assert.equal(v.flag.children.length,0);assert.equal(v.flag.geometry,undefined);assert.equal(v.flame.visible,false);assert.notEqual(v.flame.geometry.type,'ConeGeometry');v.dispose();
});

test('G6e Vulcan charges without firing, then releases a finite burst along the chosen bearing',()=>{
 const m=make();advance(m,.7,{ammoIndex:4,chargeHeld:true,yaw:.2});assert.equal(m.fired,0);m.update(.02,{chargeHeld:false,releasePower:.5});advance(m,.7,{chargeHeld:false});assert.ok(m.fired>=5&&m.fired<=6);assert.ok(m.heat>0);const fired=m.fired;advance(m,.5,{chargeHeld:false});assert.equal(m.fired,fired);
});
