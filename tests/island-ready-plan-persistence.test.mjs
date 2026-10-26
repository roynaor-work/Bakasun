import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createRegistry} from '../workout/island/engine/registry.mjs';
import {CURRENT_VERSION,STORAGE_KEY,createInitialState,migrateSave,validateSave,loadWorld,saveWorld,exportWorld,importWorld} from '../workout/island/engine/persistence.mjs';
import {cellsFor} from '../workout/island/engine/rules.mjs';
import {shoreDirection} from '../workout/island/engine/placement-help.mjs';

const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const registry=createRegistry(data),copy=value=>structuredClone(value);
const initial=()=>createInitialState(data,1000);
function prepared(stage=0){
  const state=initial();state.world={stage,size:data.config.readyWorldStages[stage].size};
  state.parts[data.world.partGroup]=data.config.readyWorldStages[stage].requiredParts;
  state.readyPlan={version:1,lots:[{id:'saved-house-lot',typeId:'house',x:22,z:12},{id:'saved-park-lot',typeId:'park',x:26,z:12}]};
  return state;
}
function memory(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};}
const cells=row=>cellsFor(registry.buildings.get(row.typeId),row.x,row.z).map(p=>p.join(','));

test('ready plans remain optional in schema 18; all exact legacy sizes and fields roundtrip unchanged',()=>{
  assert.equal(CURRENT_VERSION,18);assert.equal(Object.hasOwn(initial(),'readyPlan'),false);
  for(let stage=0;stage<data.config.worldStages.length;stage++){
    const state=initial();state.world={stage,size:data.config.worldStages[stage].size};state.parts[data.world.partGroup]=data.config.worldStages[stage].requiredParts;
    state.money=1837;state.avatar.created=true;state.avatar.name='Player';
    const snapshot=copy(state),migrated=migrateSave(state,data,registry);assert.equal(migrated.ok,true);
    assert.deepEqual(migrated.state,snapshot);assert.deepEqual(JSON.parse(exportWorld(migrated.state)),snapshot);
    const storage=memory();assert.equal(saveWorld(storage,state).ok,true);assert.deepEqual(loadWorld(storage,data,registry).state,snapshot);
    assert.equal(Object.hasOwn(migrated.state,'readyPlan'),false);assert.deepEqual(state,snapshot);
  }
});

test('authentic older backups migrate without enabling a plan or changing existing building positions',async()=>{
  for(const name of ['save-v12.json','save-v15.json']){
    const old=JSON.parse(await readFile(new URL(`./fixtures/${name}`,import.meta.url),'utf8')),snapshot=copy(old),result=migrateSave(old,data,registry);
    assert.equal(result.ok,true,name);assert.equal(result.state.version,18);assert.equal(Object.hasOwn(result.state,'readyPlan'),false);
    assert.equal(result.state.money,old.money);assert.deepEqual(result.state.resources,old.resources);assert.deepEqual(result.state.parts,old.parts);
    for(const building of old.buildings)assert.deepEqual(result.state.buildings.find(b=>b.id===building.id),building);
    for(const [id,progress] of Object.entries(old.minigameProgress))assert.deepEqual(result.state.minigameProgress[id].stars.slice(0,progress.stars.length),progress.stars);
    assert.deepEqual(old,snapshot);
  }
});

test('ready city stages save/load/export their exact reservations without an implicit regeneration',()=>{
  for(let stage=0;stage<data.config.readyWorldStages.length;stage++){
    const state=prepared(stage),snapshot=copy(state),storage=memory();assert.equal(validateSave(state,data,registry).ok,true);
    assert.equal(saveWorld(storage,state).ok,true);assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version,18);
    const loaded=loadWorld(storage,data,registry);assert.equal(loaded.ok,true);assert.deepEqual(loaded.state,snapshot);
    assert.deepEqual(migrateSave(JSON.parse(exportWorld(state)),data,registry).state,snapshot);
    const absent=copy(state);delete absent.readyPlan;assert.equal(validateSave(absent,data,registry).ok,false);
    const wrongStage=copy(state);wrongStage.world.stage=(stage+1)%3;assert.equal(validateSave(wrongStage,data,registry).ok,false);
  }
  const ordinary=initial();ordinary.readyPlan={version:1,lots:[{id:'transition-house',typeId:'house',x:10,z:2}]};
  assert.equal(validateSave(ordinary,data,registry).ok,true,'a valid optional plan can accompany its original stage size');
  const missingSize=initial();delete missingSize.world.size;assert.equal(validateSave(missingSize,data,registry).ok,false);
});

for(const [label,damage] of [
  ['null',state=>{state.readyPlan=null;}],
  ['present undefined',state=>{state.readyPlan=undefined;}],
  ['unsupported subformat',state=>{state.readyPlan.version=2;}],
  ['missing lot collection',state=>{delete state.readyPlan.lots;}],
  ['duplicate identity',state=>{state.readyPlan.lots[1].id=state.readyPlan.lots[0].id;}],
  ['overlapping reservations',state=>{Object.assign(state.readyPlan.lots[1],{x:22,z:12});}],
  ['unknown building type',state=>{state.readyPlan.lots[0].typeId='missing-type';}],
  ['fractional coordinate',state=>{state.readyPlan.lots[0].x=22.5;}],
  ['outside footprint',state=>{state.readyPlan.lots[0].x=state.world.size-1;}],
])test(`a damaged present ready plan is rejected without changing current state: ${label}`,()=>{
  const damaged=prepared(),current=prepared(),before=copy(current);damage(damaged);
  assert.equal(validateSave(damaged,data,registry).ok,false);assert.equal(migrateSave(damaged,data,registry).ok,false);
  assert.equal(importWorld(damaged,current,data,registry).ok,false);assert.deepEqual(current,before);
});

test('a corrupt saved plan retains the original save and an exact recoverable backup',()=>{
  const damaged=prepared();damaged.readyPlan.lots[0].z=-1;const storage=memory(),raw=exportWorld(damaged);storage.setItem(STORAGE_KEY,raw);
  const result=loadWorld(storage,data,registry,1234);assert.equal(result.ok,false);assert.equal(result.reason,'reason.invalid');
  assert.equal(storage.getItem(STORAGE_KEY),raw);assert.equal(storage.getItem(result.backupKey),raw);
  assert.equal(JSON.parse(storage.getItem(result.backupKey)).readyPlan.lots[0].z,-1);
});

test('an older import expands active ready land by earned parts without shrinking it to legacy dimensions',()=>{
  const current=prepared(),incoming=initial(),plan=copy(current.readyPlan),before=copy(current);incoming.parts[data.world.partGroup]=5;
  const first=importWorld(exportWorld(incoming),current,data,registry);assert.equal(first.ok,true);
  assert.deepEqual(first.state.world,{stage:1,size:data.config.readyWorldStages[1].size});
  assert.deepEqual(first.state.readyPlan.lots.slice(0,plan.lots.length),plan.lots);assert.deepEqual(current,before);
  incoming.parts[data.world.partGroup]=12;const second=importWorld(exportWorld(incoming),first.state,data,registry);assert.equal(second.ok,true);
  assert.deepEqual(second.state.world,{stage:2,size:data.config.readyWorldStages[2].size});
  assert.deepEqual(second.state.readyPlan.lots.slice(0,plan.lots.length),plan.lots);
  const legacy=importWorld(exportWorld(incoming),initial(),data,registry);assert.equal(legacy.ok,true);
  assert.deepEqual(legacy.state.world,{stage:2,size:data.config.worldStages[2].size});assert.equal(Object.hasOwn(legacy.state,'readyPlan'),false);
});

test('imported construction can block a reservation but cannot replace its coordinates or earned progress',()=>{
  const current=prepared(),incoming=prepared(),lots=copy(current.readyPlan.lots),snapshot=copy(current);
  incoming.readyPlan.lots=[{id:'different-backup-layout',typeId:'house',x:28,z:18}];
  incoming.buildings.push({id:'imported-road-over-lot',typeId:'road',x:lots[0].x,z:lots[0].z,level:1});
  current.money=2400;incoming.money=3100;current.minigameProgress.alienDefense.stage=2;current.minigameProgress.alienDefense.stars[0]=3;
  incoming.minigameProgress.alienDefense.stage=3;incoming.minigameProgress.alienDefense.stars[0]=1;incoming.minigameProgress.alienDefense.stars[1]=2;
  const currentBefore=copy(current),incomingBefore=copy(incoming),result=importWorld(exportWorld(incoming),current,data,registry);assert.equal(result.ok,true);
  assert.deepEqual(result.state.readyPlan.lots.slice(0,lots.length),lots);
  assert.equal(result.state.readyPlan.lots.some(lot=>lot.id==='different-backup-layout'),false);
  assert.ok(result.state.buildings.some(b=>b.id==='imported-road-over-lot'));
  for(const building of snapshot.buildings)assert.deepEqual(result.state.buildings.find(b=>b.id===building.id),building);
  const occupied=new Set(result.state.buildings.flatMap(cells));
  assert.ok(result.state.readyPlan.lots.some(lot=>lot.typeId==='house'&&lot.id!==lots[0].id&&cells(lot).every(key=>!occupied.has(key))));
  assert.equal(result.state.money,3100);assert.deepEqual(result.state.minigameProgress.alienDefense.stars.slice(0,2),[3,2]);
  assert.equal(result.state.minigameProgress.alienDefense.stage,3);assert.deepEqual(current,currentBefore);assert.deepEqual(incoming,incomingBefore);
  const again=importWorld(exportWorld(incoming),result.state,data,registry);assert.equal(again.ok,true);
  assert.deepEqual(again.state.readyPlan,result.state.readyPlan);assert.deepEqual(again.state.buildings,result.state.buildings);
});

test('a larger prepared backup keeps its buildings when imported into a legacy city and derives local lots',()=>{
  const current=initial(),incoming=prepared();incoming.readyPlan.lots=[{id:'foreign-reservation',typeId:'house',x:28,z:18}];
  incoming.buildings.push({id:'earned-on-larger-island',typeId:'house',x:25,z:3,level:2});
  const result=importWorld(exportWorld(incoming),current,data,registry);assert.equal(result.ok,true);
  assert.ok(result.state.world.size>=incoming.world.size);assert.ok(result.state.readyPlan);
  assert.equal(result.state.readyPlan.lots.some(lot=>lot.id==='foreign-reservation'),false);
  assert.deepEqual(result.state.buildings.find(b=>b.id==='earned-on-larger-island'),incoming.buildings.at(-1));
  assert.equal(Object.hasOwn(current,'readyPlan'),false);
});

test('expansion repairs a built harbor before preparing alternatives and retains historical reservation coordinates',()=>{
  const current=prepared(),incoming=initial(),harbor=registry.buildings.get('harbor'),x=current.world.size-harbor.footprint[0],z=18;
  const reservation={id:'historical-shore-lot',typeId:'harbor',x,z};current.readyPlan.lots.push(reservation);
  current.buildings.push({id:'earned-harbor',typeId:'harbor',x,z,level:2});incoming.parts[data.world.partGroup]=5;
  assert.ok(shoreDirection(current,harbor,x,z));const result=importWorld(exportWorld(incoming),current,data,registry);assert.equal(result.ok,true);
  assert.deepEqual(result.state.readyPlan.lots.find(lot=>lot.id===reservation.id),reservation);
  const port=result.state.buildings.find(b=>b.id==='earned-harbor');assert.ok(port);assert.equal(port.level,2);
  assert.ok(shoreDirection(result.state,harbor,port.x,port.z));assert.equal(validateSave(result.state,data,registry).ok,true);
});

test('a full prepared island still imports progress without deleting buildings or demanding a replacement lot',()=>{
  const current=prepared(),occupied=new Set(current.buildings.flatMap(cells));
  for(let z=0;z<current.world.size;z++)for(let x=0;x<current.world.size;x++)if(!occupied.has(`${x},${z}`))current.buildings.push({id:`full-road-${x}-${z}`,typeId:'road',x,z,level:1});
  const incoming=initial();incoming.money=current.money+100;incoming.claimedRewards=['imported-achievement'];
  assert.equal(validateSave(current,data,registry).ok,true);const result=importWorld(exportWorld(incoming),current,data,registry);assert.equal(result.ok,true);
  assert.deepEqual(result.state.buildings,current.buildings);assert.equal(result.state.money,incoming.money);
  assert.ok(result.state.claimedRewards.includes('imported-achievement'));assert.deepEqual(result.state.readyPlan,current.readyPlan);
});
