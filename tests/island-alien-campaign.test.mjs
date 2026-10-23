import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8'));
const strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
const b=config.minigames.alienDefense;

test('Alien campaign has thirty authored stages, localized features and compatible behavior records',()=>{
 assert.equal(b.levels.length,30);assert.equal(b.stageBehaviors.length,30);
 const formations=new Set(['rows','v','circle','escort']),motions=new Set(['static','drift','zigzag','surge']);
 for(const[s,level]of b.levels.entries()){
  const behavior=b.stageBehaviors[s];assert.equal(level.difficulty,s+1);assert.equal(level.feature,`feature.alien.${s+1}`);assert.ok(strings[level.feature]?.length>15);
  assert.ok(level.formations.length>0&&level.formations.every(f=>formations.has(f)));assert.equal(level.patternKinds,level.formations.length);
  assert.ok(level.enemyRoster.length>0&&level.enemyRoster.every(k=>Number.isInteger(k)&&k>=0&&k<b.enemyTypes.length));assert.equal(level.enemyKinds,new Set(level.enemyRoster).size);
  assert.ok(motions.has(behavior.motion));assert.equal(typeof behavior.shoots,'boolean');assert.ok([0,1].includes(behavior.shield));
  assert.ok(behavior.warningSeconds>=.9&&behavior.warningSeconds<=1.4);assert.ok(behavior.fireCadence>=2.2&&behavior.fireCadence<=3.2);assert.ok(behavior.diveEverySeconds===0||behavior.diveEverySeconds>=6.5);
 }
 assert.equal(new Set(b.levels.map(s=>strings[s.feature])).size,30);
});

test('Bosses mark each fifth stage with a distinct readable pattern and bounded health',()=>{
 const stages=b.levels.filter(s=>s.boss);assert.deepEqual(stages.map(s=>s.difficulty),[5,10,15,20,25,30]);
 assert.equal(new Set(stages.map(s=>b.stageBehaviors[s.difficulty-1].bossStyle)).size,6);
 for(const s of stages){assert.ok(s.bossLives>=30&&s.bossLives<=100);assert.ok(b.stageBehaviors[s.difficulty-1].warningSeconds>=1);}
 for(const s of b.levels.filter(s=>!s.boss))assert.equal(b.stageBehaviors[s.difficulty-1].bossStyle,'none');
});

test('Every alien campaign and stage formation has a localized Hebrew name',()=>{
 for(const pattern of new Set([...b.campaign.patterns,...b.levels.flatMap(s=>s.formations)]))assert.ok(strings[`pattern.${pattern}`]?.length>=2,pattern);
});

test('First flights teach one new threat at a time with short fleets and low bullet pressure',()=>{
 for(const s of b.levels.slice(0,4)){assert.equal(s.waves,3);assert.ok(s.rows*s.columns<=12);assert.ok(s.seconds>=60&&s.seconds<=72);assert.ok(b.stageBehaviors[s.difficulty-1].bulletCap<=5);}
 assert.deepEqual(b.levels[0].enemyRoster,[0]);assert.ok(!b.levels[0].enemyRoster.includes(1));assert.ok(b.levels[1].enemyRoster.includes(1));assert.ok(b.levels[2].enemyRoster.includes(2));
 assert.equal(b.stageBehaviors[0].diveEverySeconds,0);assert.equal(b.stageBehaviors[1].diveEverySeconds,0);assert.ok(b.stageBehaviors[2].diveEverySeconds>=9);
});

test('Tactical variety stays within collision pools and a capped readable fire budget',()=>{
 const signatures=new Set();
 for(const[index,s]of b.levels.entries()){
  const behavior=b.stageBehaviors[index],count=s.rows*s.columns;
  assert.ok(count<=18);assert.ok(count+s.spawnBudget+(s.boss?1:0)<=b.maxAliens);
  assert.ok(Number.isInteger(behavior.bulletCap)&&behavior.bulletCap>=2&&behavior.bulletCap<=10&&behavior.bulletCap<b.maxBolts);
  assert.ok(s.boltSpeed<=140);assert.ok(s.enemyHpScale>=.8&&s.enemyHpScale<=1);
  const upgradedDamage=b.equipment.damage.levels.at(-1).value;
  for(const kind of new Set(s.enemyRoster)){const hp=b.enemyTypes[kind].hp*Math.min(1.5,1+index*b.hpPerStage)*s.enemyHpScale;assert.ok(Math.ceil(hp/upgradedDamage)+behavior.shield<=4,`stage ${index+1}, kind ${kind} became a health sponge`);}
  signatures.add(JSON.stringify([s.formations,s.enemyRoster,behavior.motion,behavior.diveEverySeconds,behavior.shield,behavior.bossStyle]));
 }
 assert.equal(signatures.size,30);
 for(const index of[5,10,15,20,25])assert.ok(b.levels[index].seconds<b.levels[index-1].seconds||b.levels[index].rows*b.levels[index].columns<=b.levels[index-1].rows*b.levels[index-1].columns,'new sector should offer a recovery opening');
});

test('Original ten stage reward contracts stay exact and new rewards grow moderately',()=>{
 const expected=[
  [10,30,0,50000,400],[12,42,0,70000,550],[14,54,0,90000,700],[16,66,1,110000,850],[18,78,1,130000,1000],
  [20,90,1,150000,1150],[22,102,2,170000,1300],[24,114,2,190000,1450],[26,126,2,210000,1600],[28,138,3,230000,1750]
 ];
 for(let i=0;i<10;i++)assert.deepEqual(['points','winMoney','winParts','scoreLimit','rewardScoreLimit'].map(k=>b.levels[i][k]),expected[i]);
 const oldMaximum=138+Math.floor(1750/b.pointsPerCoin);
 for(const s of b.levels.slice(10)){assert.ok(s.winMoney>=138&&s.winMoney<=260);assert.ok(s.winParts>=2&&s.winParts<=4);assert.ok(s.winMoney+Math.floor(s.rewardScoreLimit/b.pointsPerCoin)<oldMaximum*2);}
});
