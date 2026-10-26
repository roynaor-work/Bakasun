import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {validateSave} from '../workout/island/engine/persistence.mjs';
import {createBuilding,disposeBuilding} from '../workout/island/view/buildings.mjs';

const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
function fixture(){const values=new Map();return createEngine(data,{storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},now:()=>1000000});}

test('ready island preparation is idempotent, preserves the existing city and progress, and creates usable sports and utilities',()=>{
  const e=fixture(),before=structuredClone(e.state),result=e.enableReadyBuilding();
  assert.equal(result.ok,true);assert.equal(e.state.world.size,32);assert.equal(e.state.world.stage,before.world.stage);
  for(const old of before.buildings)assert.deepEqual(e.state.buildings.find(b=>b.id===old.id),old);
  for(const key of ['money','resources','avatar','parts','minigameProgress','minigameEquipment','learning','highScores','hangar','soccerRoster'])assert.deepEqual(e.state[key],before[key],key);
  for(const type of ['basketball','tennis','waterTower','powerPlant']){const site=e.readyPlotForType(type);assert.ok(site,type);assert.equal(site.typeId,type);assert.equal(e.validatePlacement(type,site.x,site.z).ok,true,type);}
  const saved=e.exportJSON();assert.equal(e.enableReadyBuilding().ok,true);assert.equal(e.exportJSON(),saved);
  assert.equal(validateSave(e.state,data,e.registry).ok,true);
});

test('a fixed plot builds once, charges the real cost once, and undo restores the same empty plot',()=>{
  const e=fixture();e.skipTutorial();e.enableReadyBuilding();const site=e.readyPlotForType('basketball'),money=e.state.money,count=e.state.buildings.length,coords={x:site.x,z:site.z};
  const built=e.buildReadyPlot(site.id);assert.equal(built.ok,true);assert.equal(e.state.buildings.length,count+1);assert.equal(e.state.money,money-e.registry.buildings.get('basketball').cost);
  assert.equal(e.buildReadyPlot(site.id).ok,false);assert.equal(e.state.money,money-e.registry.buildings.get('basketball').cost);assert.deepEqual(e.state.readyPlan.lots.find(p=>p.id===site.id).x,coords.x);
  assert.equal(e.undo().ok,true);const restored=e.readyPlots().find(p=>p.id===site.id);assert.ok(restored);assert.equal(restored.x,coords.x);assert.equal(restored.z,coords.z);assert.equal(e.state.money,money);
});

test('prepared streets complete the road lesson and remain fixed while the island grows without shrinking',()=>{
  const e=fixture();e.enableReadyBuilding();const house=e.readyPlotForType('house');assert.equal(e.buildReadyPlot(house.id).ok,true);assert.notEqual(e.nextObjective().buildType,'road');
  const road=e.state.buildings.find(b=>b.typeId==='road');assert.equal(e.remove(road.id).reason,'ready.fixedRoad');assert.equal(e.move(road.id,0,0).reason,'ready.fixedRoad');
  const sites=new Map(e.state.readyPlan.lots.map(p=>[p.id,{...p}]));e.grantParts(data.world.partGroup,5);assert.equal(e.state.world.size,40);e.grantParts(data.world.partGroup,7);assert.equal(e.state.world.size,48);
  for(const [id,site]of sites)assert.deepEqual(e.state.readyPlan.lots.find(p=>p.id===id),site);
  assert.equal(validateSave(e.state,data,e.registry).ok,true);
  const reset=e.reset({keepAvatar:true});assert.equal(reset.ok,true);assert.equal(e.state.world.size,32);assert.ok(e.state.readyPlan.lots.length>20);
});

test('power stations generate the advertised energy, improve with upgrades and stop when damaged',()=>{
  const e=fixture();e.skipTutorial();const built=e.place('powerPlant',8,5);assert.equal(built.ok,true);
  assert.equal(e.income().energy,14);const energy=e.state.resources.energy;e.tick(60);assert.equal(e.state.resources.energy,energy+14);
  assert.equal(e.upgrade(built.id).ok,true);assert.ok(e.income().energy>14);
  e.state.events.repairs[built.id]=e.now()+60000;assert.equal(e.income().energy,0);
});

test('every power station level stays within its plot and uses one architectural batch',()=>{
  const e=fixture(),type=e.registry.buildings.get('powerPlant');
  for(let level=1;level<=type.levels.length;level++){
    const root=createBuilding(type,level),box=new T.Box3().setFromObject(root),meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});
    assert.ok(box.min.x>=-1.5-1e-6&&box.max.x<=1.5+1e-6);assert.ok(box.min.z>=-1-1e-6&&box.max.z<=1+1e-6);assert.equal(meshes.length,1);disposeBuilding(root);
  }
});
