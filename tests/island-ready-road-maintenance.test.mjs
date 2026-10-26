import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {municipalBudget} from '../workout/island/engine/city-management.mjs';

const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
function fixture(){
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const engine=createEngine(data,{storage,now:()=>1000});engine.skipTutorial();engine.setCityPolicy({enabled:true});
  return {engine,storage};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} should equal ${b}`);

test('preparing a real island adds free roads without raising maintenance, income deductions or saved bills',()=>{
  const {engine,storage}=fixture(),before=engine.cityReport().budget,income=engine.income().money;
  assert.equal(engine.enableReadyBuilding().ok,true);
  const roads=engine.state.buildings.filter(row=>row.typeId==='road'&&row.id.startsWith('ready-road-'));
  assert.ok(roads.length>50,'exercise the actual prepared street network');
  const after=engine.cityReport().budget;close(after.maintenance,before.maintenance);close(after.expenses,before.expenses);
  close(engine.income().money,income);
  const money=engine.state.money;engine.tick(60);close(engine.state.money,money+income);
  assert.equal(engine.save().ok,true);
  const loaded=createEngine(data,{storage,now:()=>1000});close(loaded.cityReport().budget.maintenance,before.maintenance);
  assert.equal(loaded.state.buildings.filter(row=>row.id.startsWith('ready-road-')).length,roads.length);
});

test('a player-built road in a prepared city keeps its normal construction price and recurring upkeep',()=>{
  const {engine}=fixture();assert.equal(engine.enableReadyBuilding().ok,true);
  let cell;
  for(let z=0;z<engine.state.world.size&&!cell;z++)for(let x=0;x<engine.state.world.size&&!cell;x++)if(engine.validatePlacement('road',x,z).ok)cell={x,z};
  assert.ok(cell);const money=engine.state.money,maintenance=engine.cityReport().budget.maintenance;
  const result=engine.place('road',cell.x,cell.z);assert.equal(result.ok,true);
  const built=engine.state.buildings.find(row=>row.id===result.id);assert.equal(built.id.startsWith('ready-road-'),false);
  close(engine.state.money,money-engine.registry.buildings.get('road').cost);
  close(engine.cityReport().budget.maintenance-maintenance,data.config.cityManagement.maintenance.road);
});

test('the free-road exemption needs a ready plan, the exact generated prefix, and an actual road type',()=>{
  const {engine}=fixture(),state=engine.state;
  state.buildings.push(
    {id:'ready-road-0-0',typeId:'road',x:0,z:0,level:1},
    {id:'ready-roadway-1-0',typeId:'road',x:1,z:0,level:1},
    {id:'my-ready-road-2-0',typeId:'road',x:2,z:0,level:1},
    {id:'ready-road-park',typeId:'park',x:0,z:2,level:1},
    {id:'ready-road-water',typeId:'waterTower',x:4,z:2,level:1}
  );
  const snapshot=structuredClone(state),legacy=municipalBudget(state,engine.registry,data.config);
  const prepared=municipalBudget({...state,readyPlan:{version:1,lots:[]}},engine.registry,data.config);
  close(legacy.maintenance-prepared.maintenance,data.config.cityManagement.maintenance.road);
  assert.deepEqual(prepared.departments,legacy.departments);assert.ok(prepared.departments.water>0);
  assert.ok(prepared.maintenance>=data.config.cityManagement.maintenance.park);
  assert.deepEqual(state,snapshot,'a budget report never edits saved building identity or policy');
});
