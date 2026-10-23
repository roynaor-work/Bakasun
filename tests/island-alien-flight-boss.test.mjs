import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlienModel} from '../workout/island/minigames/alien-flight-model.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

const data=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8'));
const config=data.minigames,balance=config.alienDefense,entrySeconds=2;
const bossStages=balance.levels.filter(s=>s.boss).map(s=>s.difficulty);
const lawfulMax={
 power:data.minigameLevels.alienDefense.at(-1).power,
 equipment:{damage:balance.equipment.damage.levels.at(-1).value,rate:balance.equipment.rate.levels.at(-1).value,shield:balance.equipment.shield.levels.at(-1).value,weapon:balance.equipment.weapon.levels.at(-1).value},
 permanentUpgrades:{damage:balance.campaign.maxStack,rapid:balance.campaign.maxStack,shield:balance.campaign.maxStack,laser:balance.campaign.maxStack,wing:balance.campaign.maxWings},
 hangar:{damage:0,coins:0,paint:0,rapid:balance.hangar.maxRank,shield:balance.hangar.maxRank,credits:0,spent:balance.hangar.maxRank*2}
};

function makeBoss(level=5,extra={}){
 const b=structuredClone(balance);Object.assign(b.levels[level-1],{rows:0,columns:0,waves:1});
 const model=createAlienModel({config,balance:b,level,random:seededRandom(3),completion:'waves',roundChoices:false,...extra});
 const boss=model.aliens.find(a=>a.boss);assert.ok(boss);return {model,boss,balance:b};
}
function advanceTo(model,target,input={}){
 while(!model.result&&model.time<target-1e-8)model.update(Math.min(.02,target-model.time),typeof input==='function'?input():input);
}
function strike(model,boss,damage=10000){
 model.shots.push({x:boss.x,y:boss.y,vx:0,vy:0,hp:1,kind:1,damage,lastHit:-1,hitLo:0,hitHi:0,hitIds:new Set()});model.update(.02,{});
}
function novaAtBoss(model,boss){
 Object.assign(model.nova,{x:boss.x,y:boss.y+10,fromY:boss.y+10,stopY:boss.y-40,flight:.1,life:0});model.update(.02,{});assert.ok(model.nova.life>0,'The missile actually detonated at the boss');
}
function readGuard(boss){
 assert.equal(boss.guardActive,true,'The closed damage gate must be readable by the view');
 assert.ok(Number.isFinite(boss.guardRemaining)&&boss.guardRemaining>0,'The view needs a positive remaining guard duration');
}

test('boss flight keeps the configured minimum at sixteen active seconds after its entry',()=>{
 assert.equal(balance.balance.minBossSeconds,16);
 for(const level of bossStages){
  const saved=structuredClone(lawfulMax),before=structuredClone(saved),{model,boss}=makeBoss(level,saved);
  const input=()=>{const speed=model.behavior.bossStyle==='sweep'?.7:.4,lead=72*speed*Math.cos(boss.age*speed)*(model.player.y-boss.y)/balance.shotSpeed;return{x:boss.x+lead,firing:true};};
  advanceTo(model,entrySeconds+balance.balance.minBossSeconds-.04,input);
  assert.equal(model.result,undefined,`Stage ${level} boss died before its active flight minimum`);assert.ok(model.aliens.some(a=>a.id===boss.id));
  advanceTo(model,Math.min(model.settings.seconds-.1,entrySeconds+balance.balance.minBossSeconds+25),input);
  assert.equal(model.result?.outcome,'win',`Stage ${level} must become defeatable after the minimum`);
  assert.ok(model.time>=entrySeconds+balance.balance.minBossSeconds-.02);
  assert.deepEqual(saved,before,'Boss flight must not mutate the saved upgrade values');
 }
});

test('boss entry rejects both laser damage and a real missile detonation',()=>{
 const {model,boss}=makeBoss(),hp=boss.hp;advanceTo(model,1.5);assert.ok(boss.entry>0);
 const impact={x:boss.x,y:boss.y};strike(model,boss);assert.equal(boss.hp,hp,'A visible but entering boss is not damageable');
 assert.ok(Math.hypot(impact.x-boss.x,impact.y-boss.y)<boss.radius+balance.shotRadius,'The stationary test shot actually intersects the entering hull');
 novaAtBoss(model,boss);assert.equal(boss.hp,hp,'Nova follows the same entry protection contract');
 assert.equal(model.result,undefined);readGuard(boss);
});

test('boss health phase gates stay readable and open on thirds of active minimum flight',()=>{
 const {model,boss}=makeBoss(),minimum=balance.balance.minBossSeconds,slice=minimum/3,hp=boss.maxHp;
 advanceTo(model,entrySeconds+.1);strike(model,boss);model.update(.02,{});
 assert.ok(Math.abs(boss.hp-hp*2/3)<1e-7);assert.equal(boss.bossPhase,1);readGuard(boss);assert.ok(boss.guardRemaining<=slice+.02);
 const firstFloor=boss.hp;strike(model,boss);novaAtBoss(model,boss);assert.equal(boss.hp,firstFloor,'Shots and nova cannot cross the closed first gate');
 advanceTo(model,entrySeconds+slice-.04);assert.equal(boss.bossPhase,1);assert.equal(boss.hp,firstFloor);
 advanceTo(model,entrySeconds+slice+.04);assert.equal(boss.bossPhase,2,'Second pattern unlocks after one third of active flight');
 strike(model,boss);model.update(.02,{});assert.ok(Math.abs(boss.hp-hp/3)<1e-7);readGuard(boss);
 const secondFloor=boss.hp;strike(model,boss);assert.equal(boss.hp,secondFloor,'The second gate protects the last third of health');
 advanceTo(model,entrySeconds+2*slice-.04);assert.equal(boss.bossPhase,2);
 advanceTo(model,entrySeconds+2*slice+.04);assert.equal(boss.bossPhase,3,'Final pattern unlocks after two thirds of active flight');
 strike(model,boss);model.update(.02,{});assert.equal(boss.hp,1);readGuard(boss);strike(model,boss);assert.equal(boss.hp,1);
 advanceTo(model,entrySeconds+minimum+.04);strike(model,boss);assert.equal(model.result?.outcome,'win');
});

test('carrier mines warn before deployment, remain slow and never exceed two globally',()=>{
 const b=structuredClone(balance),level=7;Object.assign(b.levels[level-1],{rows:1,columns:2,waves:1,enemyRoster:[4],enemyKinds:1,spawnBudget:0});
 Object.assign(b.stageBehaviors[level-1],{motion:'static',shoots:false,diveEverySeconds:0});
 const model=createAlienModel({config,balance:b,level,random:seededRandom(7),completion:'waves',roundChoices:false,equipment:{shield:3},hangar:{shield:20}});
 let deployed=0,maxMines=0;
 for(let i=0;i<1750&&!model.result;i++){
  const old=new Set(model.bolts),warned=model.aliens.some(a=>a.attackKind==='mine'&&a.tellTime>0)&&model.telegraphs.length>0;model.update(.02,{});
  const mines=model.bolts.filter(bolt=>bolt.mine);maxMines=Math.max(maxMines,mines.length);assert.ok(mines.length<=2);assert.ok(model.bolts.length<=model.behavior.bulletCap);
  for(const mine of mines){assert.ok(mine.vy>0&&mine.vy<=25,'Mine drift should remain readable');if(!old.has(mine)){deployed++;assert.ok(warned,'Every first deployment must follow a visible warning');}}
 }
 assert.ok(deployed>=2,'The test must exercise real carrier deployment');assert.equal(maxMines,2,'Two carriers exercise the global two-mine budget');
});

test('a living boss cannot be released as an escaped ordinary enemy or grant a false win',()=>{
 const {model,boss}=makeBoss();advanceTo(model,entrySeconds+.1);const id=boss.id,lives=model.lives;
 boss.baseY=boss.originY=config.height+boss.radius+100;boss.y=boss.baseY;model.update(.02,{});
 assert.ok(model.aliens.some(a=>a.boss&&a.id===id&&a.hp>0),'Live boss remains owned by its flight');
 assert.equal(model.result,undefined);assert.equal(model.lives,lives,'Boss cannot trigger ordinary escape damage');
});
