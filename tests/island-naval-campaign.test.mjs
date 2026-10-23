import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {initialProgress,validProgress,recordStageWin} from '../workout/island/activity/progress.mjs';
import {navalCampaignStage,navalStagePressure,navalMissionState,navalAmmoBudget,extendNavalProgress} from '../workout/island/minigames/naval-campaign.mjs';

const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const b=data.config.minigames.navalDuel,strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
test('naval campaign opens thirty contiguous stages while retaining the first ten star slots and rewards',()=>{
 assert.equal(b.levels.length,30);
 const originalLives=[8,8,8,8,8,8,9,9,9,9],originalEnemyHp=[2,3,2,3,3,3,4,4,4,5],originalWaves=[1,1,2,2,2,3,3,3,4,4];
 for(let i=0;i<30;i++)assert.equal(b.levels[i].difficulty,i+1);
 for(let i=0;i<10;i++){
  const s=b.levels[i];assert.equal(s.lives,originalLives[i]);assert.equal(s.enemyLives,originalEnemyHp[i]);assert.equal(s.waves,originalWaves[i]);assert.equal(s.winMoney,35+i*12);assert.equal(s.ammunition[0],28+i*5);
 }
 const progress=initialProgress(data);assert.equal(progress.navalDuel.stars.length,30);assert.equal(progress.navalDuel.stage,1);assert.equal(validProgress(progress,data),true);
});
test('naval first encounter always teaches one surface scout without a surprise submarine or boss',()=>{
 for(const seed of [0,1,2,3,42,739,0xffffffff]){
  const c=navalCampaignStage(b,1,seed);assert.equal(c.fleet.length,1);assert.equal(c.fleet[0].kind,0);assert.equal(c.fleet[0].boss,false);assert.equal(c.mission.id,'fleet');
 }
});
test('naval later encounters vary entry order deterministically and do not mutate the content roster',()=>{
 const before=structuredClone(b.levels[29]),results=new Set();
 for(let seed=0;seed<12;seed++){
  const a=navalCampaignStage(b,30,seed),same=navalCampaignStage(b,30,seed);assert.deepEqual(a,same);results.add(a.fleet.map(row=>row.kind).join());assert.equal(a.fleet.at(-1).boss,true);
  a.fleet[0].kind=99;assert.notEqual(navalCampaignStage(b,30,seed).fleet[0].kind,99);
 }
 assert.ok(results.size>=3);assert.deepEqual(b.levels[29],before);
 const first=navalCampaignStage(b,6,0),repeat=navalCampaignStage(b,6,0,first.fleet.map(row=>row.kind).join());assert.notDeepEqual(first.fleet,repeat.fleet);
});
test('naval roster keeps at most three ships active and a bounded reserve at every stage',()=>{
 for(let stage=1;stage<=30;stage++){
  const c=navalCampaignStage(b,stage,stage*91);assert.equal(c.fleet.length,c.settings.waves);assert.ok(c.fleet.length>=1&&c.fleet.length<=7);assert.ok(c.settings.concurrent>=1&&c.settings.concurrent<=3);assert.ok(c.settings.concurrent<=c.fleet.length);
  for(const e of c.fleet)assert.ok(b.shipTypes[e.kind]);assert.ok(c.settings.seconds>=120&&c.settings.seconds<=300);
 }
});
test('naval missions have localized objectives and introduce tactics before combining them',()=>{
 const ids=new Set();for(let stage=1;stage<=30;stage++){
  const c=navalCampaignStage(b,stage);ids.add(c.mission.id);assert.ok(strings[c.mission.title]);assert.ok(strings[c.mission.brief]);assert.equal(c.settings.feature,c.mission.title);
  assert.ok(c.settings.enemyTactics.telegraphSeconds>=1.5);assert.ok(c.settings.enemyTactics.fireSeconds>=9.5);
 }
 assert.deepEqual([...ids],['fleet','subhunt','intercept','flagship']);assert.equal(navalCampaignStage(b,11).fleet.filter(e=>e.behavior==='dive').length,1);
 assert.equal(navalCampaignStage(b,20).mission.id,'flagship');assert.equal(navalCampaignStage(b,30).fleet.filter(e=>e.boss).length,1);
});
test('naval fleet mission requires every ship, including ships waiting in reserve',()=>{
 const enemies=[{hp:0,active:false},{hp:2,active:false},{hp:0,active:true}];assert.deepEqual(navalMissionState({id:'fleet'},enemies),{completed:2,total:3,complete:false});enemies[1].hp=0;assert.equal(navalMissionState({id:'fleet'},enemies).complete,true);
 assert.equal(navalMissionState({id:'fleet'},[]).complete,false);
});
for(const [id,target]of [['flagship',{boss:true}],['intercept',{behavior:'flank'}],['subhunt',{behavior:'dive'}]])test(`naval ${id} mission finishes the actual priority targets without forcing every escort to sink`,()=>{
 const enemies=[{hp:9,behavior:'guard'},{hp:3,...target},{hp:2,...target}];assert.deepEqual(navalMissionState({id},enemies),{completed:0,total:2,complete:false});enemies[1].hp=0;assert.equal(navalMissionState({id},enemies).complete,false);enemies[2].hp=-.1;assert.equal(navalMissionState({id},enemies).complete,true);assert.equal(enemies[0].hp,9);
 assert.deepEqual(navalMissionState({id},[{hp:0},{hp:1}]),{completed:1,total:2,complete:false});
});
test('naval supplies tolerate a majority of misses without relying on mines, splash or purchased upgrades',()=>{
 for(let stage=1;stage<=30;stage++){
  const {settings,fleet}=navalCampaignStage(b,stage),budget=navalAmmoBudget(b,settings,fleet);
  assert.ok(budget.ratio>=3.2,`stage ${stage}: ${budget.ratio}`);assert.equal(settings.ammunition.length,6);assert.ok(settings.ammunition.every(n=>Number.isInteger(n)&&n>0));assert.ok(settings.ammunition[1]>=3&&settings.ammunition[5]>=3);
 }
});
test('naval second and third acts cap aim pressure while increasing tactical variety',()=>{
 assert.equal(navalStagePressure(1),1);assert.equal(navalStagePressure(10),10);assert.equal(navalStagePressure(20),12.5);assert.equal(navalStagePressure(30),15);
 for(let n=2;n<=30;n++)assert.ok(navalStagePressure(n)>=navalStagePressure(n-1));assert.equal(navalStagePressure(999),15);assert.equal(navalStagePressure(-10),1);
});
test('naval legacy progress extends without changing any earned star or mutating its source',()=>{
 for(let stage=1;stage<=10;stage++){
  const stars=Array.from({length:10},(_,i)=>i<stage-1?i%3+1:0),old={stage,stars},before=structuredClone(old),next=extendNavalProgress(old);
  assert.equal(next.stage,stage);assert.equal(next.stars.length,30);assert.deepEqual(next.stars.slice(0,10),stars);assert.ok(next.stars.slice(10).every(n=>n===0));assert.deepEqual(old,before);
  const progress=initialProgress(data);progress.navalDuel=next;assert.equal(validProgress(progress,data),true);
 }
 const finished={stage:10,stars:[1,2,3,1,2,3,1,2,3,2]},expanded=extendNavalProgress(finished);assert.equal(expanded.stage,11);assert.equal(expanded.stars[9],2);assert.equal(expanded.stars[10],0);
});
test('naval invalid legacy progress stays invalid and complete modern progress stays unchanged',()=>{
 const cases=[null,{stage:1,stars:[0]},{stage:0,stars:Array(10).fill(0)},{stage:2,stars:Array(10).fill(0)},{stage:1,stars:[1,...Array(9).fill(0)]},{stage:10,stars:Array(10).fill(4)}];
 for(const value of cases)assert.equal(extendNavalProgress(value),value);
 const modern={stage:11,stars:[...Array(10).fill(2),...Array(20).fill(0)]};assert.equal(extendNavalProgress(modern),modern);
});
test('naval wins through stages ten, twenty and thirty retain stars and the existing equipment upgrade contract',()=>{
 const state={minigameProgress:initialProgress(data),minigameLevels:Object.fromEntries(Object.keys(data.config.minigameLevels).map(id=>[id,1]))};
 for(let stage=1;stage<=30;stage++){
  recordStageWin(state,data,'navalDuel',stage,stage%3+1);assert.equal(state.minigameProgress.navalDuel.stage,Math.min(30,stage+1));assert.equal(validProgress(state.minigameProgress,data),true);
 }
 const stars=[...state.minigameProgress.navalDuel.stars];recordStageWin(state,data,'navalDuel',1,1);assert.deepEqual(state.minigameProgress.navalDuel.stars,stars);assert.ok(state.minigameLevels.navalDuel>=1&&state.minigameLevels.navalDuel<=data.config.minigameLevels.navalDuel.length);
 assert.equal(state.minigameProgress.alienDefense.stage,1);assert.ok(state.minigameProgress.fireRescue.stars.every(n=>n===0));
});
