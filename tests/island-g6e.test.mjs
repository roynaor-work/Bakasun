import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../workout/island/vendor/three.module.js';
import {createVessel} from '../workout/island/minigames/naval-view.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {navalLockRadius} from '../workout/island/minigames/naval-lock.mjs';
import {navalUpgradeRanks,NAVAL_TRACKS} from '../workout/island/minigames/naval-upgrades.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {CURRENT_VERSION} from '../workout/island/engine/persistence.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';
import {equipmentValues} from '../workout/island/activity/equipment.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const config=data.config.minigames,b=config.navalDuel;
const make=(level=5,seed=0,extra={})=>createNavalModel({config,balance:b,level,seed,random:seededRandom(Math.imul(seed+1,0x9e3779b9)),...extra});
const advance=(m,t,input={})=>{for(let i=0;i<Math.ceil(t/.02);i++)m.update(.02,input);};
test('G6e holding locks a live enemy, jitters without firing, and releases exactly at the last visible reticle',()=>{
 const m=make();m.playerShip.x=150;m.beginAim();const before={...m.aim};advance(m,.7,{aimHeld:true});assert.equal(m.fired,0);assert.equal(m.lockedTargetIndex,m.enemyShip.index);assert.notDeepEqual(m.aim,before);const visible={...m.aim},ammo=m.ammo[0];m.update(.02,{fireRelease:true});assert.equal(m.fired,1);assert.equal(m.ammo[0],ammo-1);assert.equal(m.ball.targetX,visible.x);assert.equal(m.ball.targetZ,visible.z);assert.ok(Math.hypot(m.ball.windOffsetX,m.ball.windOffsetZ)>0);advance(m,m.ball.duration+.02);assert.equal(m.fired,1);assert.equal(m.blast.x,visible.x);assert.equal(m.blast.z,visible.z);
});
test('G6e an immediate tap fires once; cancelling a hold spends nothing',()=>{
 const m=make();m.beginAim();const point={...m.aim};m.update(.02,{fireRelease:true});assert.equal(m.fired,1);assert.equal(m.ball.targetX,point.x);assert.equal(m.ball.targetZ,point.z);
 const n=make();advance(n,.3,{aimHeld:true});n.cancelAim();advance(n,.3);assert.equal(n.fired,0);
});
test('G6e jitter rises with stage and difficulty, falls inside the ring, and falls further with aim upgrades',()=>{
 const enemy={x:300,z:0},inside={x:150,z:0},outside={x:60,z:0},radius=(p,s=5,d='normal',e={})=>navalLockRadius(p,enemy,b,s,d,e).spread;
 assert.ok(radius(inside,10)>radius(inside,5)&&radius(inside,5)>radius(inside,1));assert.ok(radius(inside,5,'hard')>radius(inside)&&radius(inside)>radius(inside,5,'easy'));assert.ok(radius(outside)>radius(inside));assert.ok(radius({x:20,z:0})>radius(outside));assert.ok(radius(inside,5,'normal',{rate:1.65})<radius(inside));
});
const rates=[];
for(const level of [1,5,10])test(`G6e 200 normal locked releases inside ring at stage ${level}, with and without aim upgrade`,()=>{
 const counts=[];for(const rate of [1,1.65]){let hits=0;for(let seed=0;seed<200;seed++){const m=make(level,seed,{equipment:{rate}});m.playerShip.x=150;advance(m,seed%9*.45);m.beginAim();advance(m,.12+seed%13*.07,{aimHeld:true});m.update(.02,{fireRelease:true});advance(m,1.4);hits+=m.snapshot().hits;}counts.push(hits);}
 rates.push({level,shots:200,base:counts[0],fullAim:counts[1]});if(level===5){assert.ok(counts[0]>=80&&counts[0]<=110,JSON.stringify(rates));assert.ok(counts[1]-counts[0]>=30);}if(level===10)console.log('G6e locked calibration',JSON.stringify(rates));
});
test('G6e easy and hard bracket the medium hit rate at the same stage and without upgrades',()=>{const counts=[];for(const difficulty of ['easy','normal','hard']){let hits=0;for(let seed=0;seed<200;seed++){const m=make(5,seed,{difficulty});m.playerShip.x=150;advance(m,seed%9*.45);m.beginAim();advance(m,.12+seed%13*.07,{aimHeld:true});m.update(.02,{fireRelease:true});advance(m,1.4);hits+=m.snapshot().hits;}counts.push(hits);}assert.ok(counts[0]>counts[1]&&counts[1]>counts[2]);console.log('G6e difficulty calibration',JSON.stringify(counts));});
test('G6e 200 random release timings outside the ring hit fewer than 20 percent',()=>{
 const rng=seededRandom(6006);let hits=0;for(let seed=0;seed<200;seed++){const m=make(5,seed);m.playerShip.x=20+rng()*40;advance(m,rng()*3);m.beginAim();advance(m,rng()*1.5,{aimHeld:true});m.update(.02,{fireRelease:true});advance(m,1.4);hits+=m.snapshot().hits;}assert.ok(hits<40,{hits});console.log('G6e random releases',JSON.stringify({hits,shots:200}));
});
test('G6e guided missile follows a moving enemy, expends one scarce unit and damages that enemy',()=>{
 const m=make(),ammo=m.ammo[1],hp=m.enemyShip.hp;m.update(.02,{ammoIndex:1});m.beginAim();m.update(.02,{fireRelease:true});const initial=m.ball.targetX;advance(m,.3);assert.equal(m.ball.targetX,m.enemyShip.x);assert.notEqual(m.ball.targetX,initial);advance(m,1);assert.ok(m.enemyShip.hp<hp);assert.equal(m.ammo[1],ammo-1);assert.ok(ammo<=4);
});
test('G6e mine drops behind the ship, arms, and only damages an enemy that enters its radius',()=>{
 const m=make(),hp=m.enemyShip.hp;m.playerShip.x=368;m.playerShip.z=m.enemyShip.z;m.playerShip.heading=0;m.update(.02,{ammoIndex:3,fireRelease:true});assert.equal(m.mines.length,1);assert.equal(m.mines[0].x,320);assert.equal(m.fired,1);advance(m,.2);assert.equal(m.enemyShip.hp,hp);advance(m,.6);assert.equal(m.mines.length,0);assert.ok(m.enemyShip.hp<hp);
 const n=make();n.update(.02,{ammoIndex:3,fireRelease:true});advance(n,1);assert.equal(n.enemyShip.hp,n.enemyShip.maxHp);assert.equal(n.mines.length,1);
});
test('G6e salvo launches three distinct shells over an area for one ammunition unit',()=>{
 const m=make(),ammo=m.ammo[4];m.update(.02,{ammoIndex:4});m.beginAim();m.update(.02,{fireRelease:true});assert.equal(m.ammo[4],ammo-1);assert.equal(m.fired,1);assert.equal(m.extraShots.length,2);assert.equal(new Set([m.ball,...m.extraShots].map(p=>p.targetZ)).size,3);assert.ok([m.ball,...m.extraShots].every(p=>p.ammo===4&&p.active));advance(m,1.4);assert.equal(m.extraShots.length,0);
});
test('G6e repair restores 25 percent of maximum hull, clamps at full health and never shoots the enemy',()=>{
 const m=make(),hp=m.enemyShip.hp;m.playerShip.hp=m.playerShip.maxHp*.4;m.update(.02,{ammoIndex:5,fireRelease:true});assert.equal(m.playerShip.hp,m.playerShip.maxHp*.65);assert.equal(m.ball.active,false);assert.ok(m.repairLife>0);assert.equal(m.enemyShip.hp,hp);m.playerShip.hp=m.playerShip.maxHp-.1;m.update(.02,{fireRelease:true});assert.equal(m.playerShip.hp,m.playerShip.maxHp);
});
test('G6e four three-rank upgrades save and reload in the existing naval object without changing save version',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},engine=createEngine(data,{storage,now:()=>1000000}),activity=createActivity(engine,{now:()=>1000000});
 assert.deepEqual(navalUpgradeRanks({}),{hull:0,cannon:0,aim:0,speed:0});assert.deepEqual(navalUpgradeRanks(engine.state),{hull:0,cannon:0,aim:0,speed:0});const other=structuredClone(engine.state.minigameEquipment.alienDefense);engine.state.money=100000;engine.state.minigameProgress.navalDuel.stage=10;engine.state.minigameProgress.navalDuel.stars.fill(3);
 for(const key of Object.values(NAVAL_TRACKS)){for(let rank=1;rank<=3;rank++){assert.equal(activity.upgrade('navalDuel',key).ok,true);assert.equal(engine.state.minigameEquipment.navalDuel[key],rank);}assert.equal(activity.upgrade('navalDuel',key).ok,false);}
 const loaded=createEngine(data,{storage,now:()=>1000000});assert.equal(loaded.state.version,CURRENT_VERSION);assert.deepEqual(navalUpgradeRanks(loaded.state),{hull:3,cannon:3,aim:3,speed:3});assert.deepEqual(loaded.state.minigameEquipment.alienDefense,other);assert.equal(loaded.state.money,engine.state.money);
 const equipment=equipmentValues(loaded.state,data,'navalDuel'),base=make(),up=make(5,0,{equipment});assert.ok(up.maxLives>base.maxLives);advance(base,.5,{moveZ:-1});advance(up,.5,{moveZ:-1});assert.ok(up.playerShip.x>base.playerShip.x);base.update(.02,{firing:true,targetX:base.enemyShip.x,targetZ:base.enemyShip.z,ammoIndex:1});up.update(.02,{firing:true,targetX:up.enemyShip.x,targetZ:up.enemyShip.z,ammoIndex:1});advance(base,1.2);advance(up,1.2);assert.ok(up.enemyShip.hp<base.enemyShip.hp);
});
test('G6e player has no fixed flag or triangle and damage flame starts hidden on deck',()=>{
 const v=createVessel(THREE,b.render);assert.equal(v.flag.children.length,0);assert.equal(v.flag.geometry,undefined);assert.equal(v.flame.visible,false);assert.notEqual(v.flame.geometry.type,'ConeGeometry');assert.equal(v.flame.position.y,.85);v.dispose();
});
