import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../workout/island/vendor/three.module.js';
import {createVessel} from '../workout/island/minigames/naval-view.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {navalLockRadius,navalLockedPoint} from '../workout/island/minigames/naval-lock.mjs';
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
// Superseded 25/10/2026: the moving jitter reticle is replaced by a still, honest preview.
test('Naval holding locks a live enemy, the preview stays still and release flies the previewed arc',()=>{
 const m=make();m.playerShip.x=150;m.beginAim();m.update(.02,{aimHeld:true,autoAim:true});const before={turret:m.turret,landing:{...m.prediction.landing}};advance(m,.7,{aimHeld:true});assert.equal(m.fired,0);assert.equal(m.lockedTargetIndex,m.enemyShip.index);assert.deepEqual({turret:m.turret,landing:{...m.prediction.landing}},before,'no hidden sway or jitter while holding');
 const preview=m.prediction,ammo=m.ammo[0],hp=m.enemyFleetHp;m.update(.02,{fireRelease:true});assert.equal(m.fired,1);assert.equal(m.ammo[0],ammo-1);assert.deepEqual(m.ball.predicted.end,{x:preview.end.x,z:preview.end.z,t:preview.end.t});assert.ok(Math.hypot(m.ball.launch.ax,m.ball.launch.az)>0,'wind is part of the launch');
 advance(m,m.ball.duration+.05);assert.equal(m.fired,1);const shot=m.lastShot;assert.ok(Math.abs(shot.actual.x-preview.end.x)<1e-9&&Math.abs(shot.actual.z-preview.end.z)<1e-9||shot.targetMoved>0);assert.ok(m.enemyFleetHp<hp);
});
test('G6e an immediate tap fires once; cancelling a hold spends nothing',()=>{
 const m=make();m.beginAim();const point={...m.aim};m.update(.02,{fireRelease:true});assert.equal(m.fired,1);assert.equal(m.ball.targetX,point.x);assert.equal(m.ball.targetZ,point.z);
 const n=make();advance(n,.3,{aimHeld:true});n.cancelAim();advance(n,.3);assert.equal(n.fired,0);
});
test('G6e jitter rises with stage and difficulty, falls inside the ring, and falls further with aim upgrades',()=>{
 const enemy={x:300,z:0},inside={x:150,z:0},outside={x:60,z:0},radius=(p,s=5,d='normal',e={})=>navalLockRadius(p,enemy,b,s,d,e).spread;
 assert.ok(radius(inside,10)>radius(inside,5)&&radius(inside,5)>radius(inside,1));assert.ok(radius(inside,5,'hard')>radius(inside)&&radius(inside)>radius(inside,5,'easy'));assert.ok(radius(outside)>radius(inside));assert.ok(radius({x:20,z:0})>radius(outside));assert.ok(radius(inside,5,'normal',{rate:1.65})<radius(inside));
});
for(const level of [1,10,20,30])test(`G6e 200 visible locked endpoints at stage ${level} remain readable and aim equipment improves precision`,()=>{
 const errors=[];for(const rate of [1,1.65]){let squared=0;for(let seed=0;seed<200;seed++){const ship={x:150,z:0},enemy={x:340,z:10,vx:3,vz:8},point=navalLockedPoint(ship,enemy,{x:70,z:20},b,level,'normal',{rate},seed,.12+seed%13*.07);const error=Math.hypot(point.jitter.x,point.jitter.z);assert.ok(error<b.targeting.radius);squared+=error*error;}errors.push(Math.sqrt(squared/200));}
 assert.ok(errors[0]>1&&errors[1]<errors[0]*.62);
});
test('G6e easy and hard adjust visible sway predictably without imposing a random hit roll',()=>{
 const ship={x:150,z:0},enemy={x:340,z:0},errors=['easy','normal','hard'].map(difficulty=>Array.from({length:200},(_,seed)=>{const point=navalLockedPoint(ship,enemy,{x:0,z:0},b,5,difficulty,{},seed,seed*.07);return Math.hypot(point.x-enemy.x,point.z-enemy.z);}).reduce((a,n)=>a+n,0));
 assert.ok(errors[0]<errors[1]&&errors[1]<errors[2]);
});
test('G6e the opening range is playable across 200 release timings rather than a range lottery',()=>{
 const rng=seededRandom(6006),enemy={x:340,z:0};let good=0;
 for(let seed=0;seed<200;seed++){const point=navalLockedPoint({x:20+rng()*40,z:0},enemy,{x:70,z:40},b,5,'normal',{},seed,rng()*3);good+=Math.hypot(point.x-enemy.x,point.z-enemy.z)<b.targeting.radius;}
 assert.ok(good>=180,JSON.stringify({good,shots:200}));
});
test('G6e guided missile follows a moving enemy, expends one scarce unit and damages that enemy',()=>{
 const m=make(),ammo=m.ammo[1],hp=m.enemyShip.hp;m.update(.02,{ammoIndex:1});m.beginAim();m.update(.02,{fireRelease:true});const initial=m.ball.targetX;advance(m,.3);assert.equal(m.ball.targetX,m.enemyShip.x);assert.notEqual(m.ball.targetX,initial);advance(m,1);assert.ok(m.enemyShip.hp<hp);assert.equal(m.ammo[1],ammo-1);assert.ok(ammo<=4);
});
test('G6e mine launches to the visible target, arms after splashdown and requires an enemy in its radius',()=>{
 const m=make(),enemy=m.enemyShip,hp=enemy.hp,supply=m.ammo[3];m.update(.02,{ammoIndex:3});m.beginAim(enemy.index);m.update(.02,{fireRelease:true,releaseTarget:{x:enemy.x,z:enemy.z,target:enemy.index}});assert.equal(m.mines.length,0);assert.equal(m.ball.ammo,3);assert.equal(m.ball.active,true);assert.equal(m.fired,1);assert.equal(m.ammo[3],supply-1);advance(m,m.ball.duration+.02);assert.equal(m.mines.length,1);assert.equal(enemy.hp,hp);advance(m,b.weapons.mineArmSeconds+.1);assert.equal(m.mines.length,0);assert.ok(enemy.hp<hp);
 const n=make(),other=n.enemyShip;n.update(.02,{ammoIndex:3,fireRelease:true,releaseTarget:{x:65,z:150}});advance(n,1.5);assert.equal(other.hp,other.maxHp);assert.equal(n.mines.length,1);
});
test('G6e salvo launches three distinct shells over an area for one ammunition unit',()=>{
 const m=make(),ammo=m.ammo[4];m.update(.02,{ammoIndex:4});m.beginAim();m.update(.02,{fireRelease:true});assert.equal(m.ammo[4],ammo-1);assert.equal(m.fired,1);assert.equal(m.extraShots.length,2);assert.equal(new Set([m.ball,...m.extraShots].map(p=>p.targetZ)).size,3);assert.ok([m.ball,...m.extraShots].every(p=>p.ammo===4&&p.active));advance(m,1.4);assert.equal(m.extraShots.length,0);
});
test('G6e repair restores 25 percent of maximum hull, clamps at full health and never shoots the enemy',()=>{
 const m=make(),hp=m.enemyShip.hp;m.playerShip.hp=m.playerShip.maxHp*.4;m.update(.02,{ammoIndex:5,fireRelease:true});assert.equal(m.playerShip.hp,m.playerShip.maxHp*.65);assert.equal(m.ball.active,false);assert.ok(m.repairLife>0);assert.equal(m.enemyShip.hp,hp);advance(m,3.1);m.playerShip.hp=m.playerShip.maxHp-.1;m.update(.02,{fireRelease:true});assert.equal(m.playerShip.hp,m.playerShip.maxHp);
});
test('G6e four three-rank upgrades save and reload in the existing naval object without changing save version',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},engine=createEngine(data,{storage,now:()=>1000000}),activity=createActivity(engine,{now:()=>1000000});
 assert.deepEqual(navalUpgradeRanks({}),{hull:0,cannon:0,aim:0,speed:0});assert.deepEqual(navalUpgradeRanks(engine.state),{hull:0,cannon:0,aim:0,speed:0});const other=structuredClone(engine.state.minigameEquipment.alienDefense);engine.state.money=100000;engine.state.minigameProgress.navalDuel.stage=10;engine.state.minigameProgress.navalDuel.stars.fill(3,0,9);
 for(const key of Object.values(NAVAL_TRACKS)){for(let rank=1;rank<=3;rank++){assert.equal(activity.upgrade('navalDuel',key).ok,true);assert.equal(engine.state.minigameEquipment.navalDuel[key],rank);}assert.equal(activity.upgrade('navalDuel',key).ok,false);}
 const loaded=createEngine(data,{storage,now:()=>1000000});assert.equal(loaded.state.version,CURRENT_VERSION);assert.deepEqual(navalUpgradeRanks(loaded.state),{hull:3,cannon:3,aim:3,speed:3});assert.deepEqual(loaded.state.minigameEquipment.alienDefense,other);assert.equal(loaded.state.money,engine.state.money);
 const equipment=equipmentValues(loaded.state,data,'navalDuel'),base=make(),up=make(5,0,{equipment});assert.ok(up.maxLives>base.maxLives);advance(base,.5,{moveZ:-1});advance(up,.5,{moveZ:-1});assert.ok(up.playerShip.x>base.playerShip.x);const baseTarget=base.enemyShip,upTarget=up.enemyShip;base.update(.02,{firing:true,targetX:baseTarget.x,targetZ:baseTarget.z,ammoIndex:1});up.update(.02,{firing:true,targetX:upTarget.x,targetZ:upTarget.z,ammoIndex:1});advance(base,1.2);advance(up,1.2);assert.ok(upTarget.hp<baseTarget.hp);
});
test('G6e player has no fixed flag or triangle and damage flame starts hidden on deck',()=>{
 const v=createVessel(THREE,b.render);assert.equal(v.flag.children.length,0);assert.equal(v.flag.geometry,undefined);assert.equal(v.flame.visible,false);assert.notEqual(v.flame.geometry.type,'ConeGeometry');assert.equal(v.flame.position.y,.85);v.dispose();
});
