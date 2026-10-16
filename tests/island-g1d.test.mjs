import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../workout/island/engine/load-data.mjs';
import { createEngine } from '../workout/island/engine/engine.mjs';
import { createRegistry, configureBuilding } from '../workout/island/engine/registry.mjs';
import { createInitialState, migrateSave, loadWorld, STORAGE_KEY, CURRENT_VERSION } from '../workout/island/engine/persistence.mjs';
import { createBuilding, disposeBuilding } from '../workout/island/view/buildings.mjs';
const data = await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const strings = JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
const content = JSON.parse(await readFile(new URL('../workout/island/data/buildings.json',import.meta.url),'utf8'));
function memoryStorage() {
  const values = new Map();
  return {values,get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
for(const keepAvatar of [false,true]) test(`G1d reset restarts the entire game and preserves foreign storage; keepAvatar=${keepAvatar}`,()=>{
  const storage=memoryStorage(),engine=createEngine(data,{storage,now:()=>1234});
  engine.state.money=7777;engine.state.tutorial={step:3,completed:true,skipped:true};
  engine.setAvatar({...engine.state.avatar,created:true,name:'בדיקה',shirtColor:'#f2ad59'});
  engine.state.highScores.alienDefense=100;engine.state.events.repairs.old=9999;
  engine.state.claimedRewards=['old'];engine.state.buildings.push({id:'old',typeId:'house',x:0,z:0,level:4});
  engine.state.extraLegacyField=true;
  const avatar=structuredClone(engine.state.avatar);
  const foreign={'kidfit.profile':'keep profile','kidfit.activeWorkout':'keep workout','bakasun':'keep site','island.other':'keep other','island.v1.corrupt.notes':'not owned','island.v1.extra':'not owned'};
  for(const [key,value] of Object.entries(foreign))storage.setItem(key,value);
  storage.setItem('island.v1.corrupt.100','bad');storage.setItem('island.v1.corrupt.200','bad');
  assert.equal(engine.reset({keepAvatar}).ok,true);
  const expected=createInitialState(data,1234);if(keepAvatar)expected.avatar=avatar;
  assert.deepEqual(engine.state,expected);
  assert.deepEqual(loadWorld(storage,data,engine.registry).state,expected);
  assert.equal(engine.canUndo(),false);
  assert.equal(storage.getItem('island.v1.corrupt.100'),null);
  assert.equal(storage.getItem('island.v1.corrupt.200'),null);
  for(const [key,value] of Object.entries(foreign))assert.equal(storage.getItem(key),value,key);
  // Lifecycle saves must persist the reset state, never resurrect the old city.
  engine.save();assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)),expected);
});
test('G1d failed reset removal keeps the live city and reports a storage error',()=>{
  const storage=memoryStorage(),engine=createEngine(data,{storage});engine.state.money=999;engine.save();
  const before=structuredClone(engine.state),raw=storage.getItem(STORAGE_KEY);
  storage.removeItem=()=>{throw new Error('denied');};
  assert.deepEqual(engine.reset(),{ok:false,reason:'reason.storage'});
  assert.deepEqual(engine.state,before);assert.equal(storage.getItem(STORAGE_KEY),raw);
});
test('G1d failed fresh-save write restores the old save and leaves the live state intact',()=>{
  const storage=memoryStorage(),engine=createEngine(data,{storage});engine.state.money=999;engine.save();
  const before=structuredClone(engine.state),raw=storage.getItem(STORAGE_KEY),write=storage.setItem;
  storage.setItem=(key,value)=>{if(value!==raw)throw new Error('quota');write(key,value);};
  assert.equal(engine.reset().ok,false);assert.deepEqual(engine.state,before);assert.equal(storage.getItem(STORAGE_KEY),raw);
});
for(const version of [1,2,3]) test(`G1d old v${version} cities retain three grandfathered water towers and house levels`,()=>{
  const state=createInitialState(data,1000);state.version=version;
  state.buildings=[1,2,3].map((level,i)=>({id:`water-${i}`,typeId:'waterTower',x:i*3,z:0,level}));
  state.buildings.push({id:'home',typeId:'house',x:0,z:4,level:4});
  const result=migrateSave(state,data,createRegistry(data));
  assert.equal(result.ok,true);assert.equal(result.state.version,CURRENT_VERSION);
  assert.deepEqual(result.state.buildings.filter(b=>b.typeId!=='cityHall'),state.buildings);
});
test('G1d model slots and Hebrew names reach runtime without changing balance',()=>{
  for(const row of content) {
    const runtime=data.buildings.find(r=>r.id===row.id),balance=data.config.buildings[row.id];
    assert.deepEqual(runtime.model,row.model);assert.equal(row.levels.length,balance.levels.length);
    for(const [i,level] of row.levels.entries()) {
      assert.deepEqual(runtime.levels[i].model,level.model);
      for(const [key,value] of Object.entries(balance.levels[i]))if(!['visual','title'].includes(key))assert.deepEqual(runtime.levels[i][key],value,`${row.id} ${i} ${key}`);
      if(runtime.levels.length>1)assert.ok(strings[runtime.levels[i].title],`${row.id} level ${i+1}`);
    }
    for(const key of ['cost','footprint','limit','maxLevelByStage','supply','population','income'])assert.deepEqual(runtime[key],balance[key]);
  }
  const row=structuredClone(content[0]);row.model='assets/future.glb';row.levels[1].model='assets/future-level2.glb';
  const configured=configureBuilding(row,data.config);
  assert.equal(configured.model,row.model);assert.equal(configured.levels[1].model,row.levels[1].model);
});
test('G1d houses have four separate shapes, floor counts, palettes and roof profiles',()=>{
  const house=data.buildings.find(row=>row.id==='house');
  assert.deepEqual(house.levels.map(row=>row.visual.floors),[1,2,3,5]);
  assert.equal(new Set(house.levels.map(row=>row.visual.design)).size,4);
  assert.equal(new Set(house.levels.map(row=>row.visual.color)).size,4);
  assert.equal(new Set(house.levels.map(row=>row.visual.windowColor)).size,4);
});
test('G1d every level changes geometry while retaining shared material and draw-call budget',()=>{
  let sharedMaterial;
  for(const row of data.buildings) {
    const signatures=[];
    for(let level=1;level<=row.levels.length;level++) {
      const group=createBuilding(row,level),meshes=[],lines=[];
      group.traverse(o=>{if(o.isMesh)meshes.push(o);if(o.isLineSegments)lines.push(o);});
      assert.equal(meshes.length,1,`${row.id} level ${level}: one batched mesh`);
      assert.ok(lines.length<=1);
      sharedMaterial??=meshes[0].material;assert.equal(meshes[0].material,sharedMaterial);
      assert.equal(meshes[0].material.map,null);
      const geometry=meshes[0].geometry;
      signatures.push(JSON.stringify(Array.from(geometry.attributes.position.array)));
      disposeBuilding(group);
    }
    if(row.levels.length>1)assert.equal(new Set(signatures).size,row.levels.length,row.id);
  }
});
