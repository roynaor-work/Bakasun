import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,migrations,validateSave,loadWorld,STORAGE_KEY,CURRENT_VERSION} from '../workout/island/engine/persistence.mjs';
import {extendStageProgress,validProgress} from '../workout/island/activity/progress.mjs';

const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const oldIds=['alienDefense','fireRescue','navalDuel','soccer','tennis'];
function fixture(){
  // Synthetic v16 world: the historical format had ten stages in every game.
  const old=structuredClone(createEngine(data,{storage:null,now:()=>1000000}).state);old.version=16;
  for(const table of ['minigameLevels','minigameEquipment','minigameProgress'])delete old[table].islandRacing;
  for(const id of oldIds)old.minigameProgress[id]={stage:1,stars:Array(10).fill(0)};
  old.fireCertificates=old.fireCertificates.slice(0,10);
  old.money=7654;old.highScores.navalDuel=875;old.minigameWins.navalDuel=12;
  old.minigameProgress.navalDuel={stage:10,stars:Array(10).fill(3)};
  old.minigameProgress.tennis={stage:5,stars:[3,2,1,3,0,0,0,0,0,0]};
  old.minigameEquipment.tennis.hit=1;
  old.fireCertificates[2]={fast:true,rescue:false,careful:true,stars:2};
  const next={...data,config:structuredClone(data.config)};
  for(const id of oldIds){const first=next.config.minigames[id].levels[0];next.config.minigames[id].levels=Array.from({length:30},(_,i)=>structuredClone(next.config.minigames[id].levels[i]||first));}
  // Only persistence is exercised here; these are deliberately small balance fixtures.
  next.config.minigameLevels.islandRacing=[{cost:0,power:1}];
  next.config.minigames.islandRacing={...next.config.minigames.islandRacing,levels:Array.from({length:30},()=>({})),equipment:{engine:{base:1,levels:[{value:1.1,cost:50}]},grip:{base:1,levels:[{value:1.1,cost:50}]}}};
  const engine=createEngine(next,{storage:{getItem:()=>null,setItem(){}},now:()=>1000000});
  return {old,next,engine};
}

test('a won historical final stage opens stage eleven without altering any earned star',()=>{
  const p={stage:10,stars:[3,2,1,3,2,1,3,2,1,3]},before=structuredClone(p),expanded=extendStageProgress(p,10,30);
  assert.deepEqual(p,before);assert.equal(expanded.stage,11);assert.deepEqual(expanded.stars.slice(0,10),p.stars);assert.deepEqual(expanded.stars.slice(10),Array(20).fill(0));
  assert.equal(extendStageProgress(expanded,10,30),expanded);
});

test('an unfinished final stage stays locked at ten and an earlier stage stays where it was',()=>{
  for(const stage of [1,5,10]){const p={stage,stars:Array.from({length:10},(_,i)=>i<stage-1?2:0)},expanded=extendStageProgress(p,10,30);assert.equal(expanded.stage,stage);assert.deepEqual(expanded.stars.slice(0,10),p.stars);assert.equal(expanded.stars.length,30);}
});

test('v16 world migration preserves learning, city, money, gear and records while adding racing',()=>{
  const {old,next,engine}=fixture(),before=structuredClone(old),r=migrateSave(old,next,engine.registry);
  assert.equal(CURRENT_VERSION,18);assert.equal(r.ok,true);assert.equal(r.migrated,true);assert.deepEqual(old,before);assert.equal(r.state.version,18);
  for(const key of ['learning','money','resources','buildings','world','avatar','team','players','soccerRoster','soccerCard','hangar','alienUpgrades','highScores','minigameWins'])assert.deepEqual(r.state[key],old[key],key);
  assert.deepEqual(r.state.fireCertificates.slice(0,10),old.fireCertificates);assert.deepEqual(r.state.fireCertificates.slice(10),Array(20).fill(null));
  for(const id of oldIds){assert.deepEqual(r.state.minigameEquipment[id],old.minigameEquipment[id]);assert.deepEqual(r.state.minigameProgress[id].stars.slice(0,10),old.minigameProgress[id].stars);}
  assert.equal(r.state.minigameProgress.navalDuel.stage,11);assert.equal(r.state.minigameProgress.tennis.stage,5);
  assert.deepEqual(r.state.minigameEquipment.islandRacing,{engine:0,grip:0});assert.equal(r.state.minigameLevels.islandRacing,1);assert.deepEqual(r.state.minigameProgress.islandRacing,{stage:1,stars:Array(30).fill(0)});
  assert.equal(validateSave(r.state,next,engine.registry).ok,true);
  assert.deepEqual(migrations[17](migrations[16](old,next)),r.state);
  assert.deepEqual(migrateSave(r.state,next,engine.registry).state,r.state);
});

test('a malformed historical campaign is not repaired into valid progress or free unlocks',()=>{
  for(const mutate of [p=>p.stars.pop(),p=>p.stars[2]=0,p=>p.stars[0]=4,p=>p.stage=31,p=>p.stars[0]='3']){
    const {old,next,engine}=fixture();mutate(old.minigameProgress.navalDuel);assert.equal(migrateSave(old,next,engine.registry).ok,false);
  }
});

test('missing equipment of an existing game is rejected while the new race gets default tracks',()=>{
  const {old,next,engine}=fixture();delete old.minigameEquipment.tennis.hit;
  assert.equal(migrateSave(old,next,engine.registry).ok,false);
});

test('current-version truncated progress is rejected and storage keeps the original bytes',()=>{
  const {old,next,engine}=fixture(),valid=migrateSave(old,next,engine.registry).state;
  valid.minigameProgress.tennis.stars.length=10;assert.equal(validProgress(valid.minigameProgress,next),false);
  const raw=JSON.stringify(valid),values=new Map([[STORAGE_KEY,raw]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const loaded=loadWorld(storage,next,engine.registry,99);assert.equal(loaded.ok,false);assert.equal(values.get(STORAGE_KEY),raw);assert.equal(values.get(STORAGE_KEY+'.corrupt.99'),raw);
});

test('an old world can be imported repeatedly into a new campaign without losing later progress',()=>{
  const {old,next,engine}=fixture();assert.equal(engine.importJSON(old).ok,true);const p=engine.state.minigameProgress.navalDuel;
  p.stars[10]=2;p.stage=12;engine.state.minigameProgress.islandRacing.stars[0]=3;engine.state.minigameProgress.islandRacing.stage=2;
  const before=structuredClone(engine.state);assert.equal(engine.importJSON(old).ok,true);assert.deepEqual(engine.state.minigameProgress,before.minigameProgress);assert.deepEqual(engine.state.minigameEquipment,before.minigameEquipment);assert.equal(engine.state.money,before.money);assert.equal(validateSave(engine.state,next,engine.registry).ok,true);
});
