import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createRegistry} from '../workout/island/engine/registry.mjs';
import {createInitialState} from '../workout/island/engine/persistence.mjs';
import {cellsFor,validatePlacement} from '../workout/island/engine/rules.mjs';
import {cityConnections} from '../workout/island/engine/city-connections.mjs';
import {prepareReadyPlan,validReadyPlan,readyPlots,readyPlotAt,readyPlotForType} from '../workout/island/engine/ready-plots.mjs';

const base=new URL('../workout/island/',import.meta.url);
const data=await loadData(base,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
function fixture(){
  const registry=createRegistry(data),state=createInitialState(data,1000);
  state.world={size:32,stage:0};return {state,registry,flags:data.featureFlags};
}
const cells=(row,registry)=>cellsFor(registry.buildings.get(row.typeId),row.x,row.z).map(cell=>cell.join(','));
const remaining=state=>JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key])=>!['buildings','readyPlan','world'].includes(key))));
const prepare=f=>prepareReadyPlan(f.state,f.registry,f.flags);
const plots=f=>readyPlots(f.state,f.registry,f.flags);

function assertConnections(f){
  const connections=cityConnections(f.state,f.registry);
  for(const lot of plots(f))if(f.registry.buildings.get(lot.typeId).requiresRoad)assert.ok(connections.hasAccess(lot),`${lot.typeId} ${lot.id} has connected road access`);
  return connections;
}

test('the prepared town covers every enabled building type, with locked future defense and exact sports footprints',()=>{
  const f=fixture(),before=remaining(f.state),oldBuildings=structuredClone(f.state.buildings),result=prepare(f),rows=plots(f);
  assert.ok(result.ok);assert.ok(result.addedLots>=36);assert.equal(remaining(f.state),before);
  assert.deepEqual(f.state.buildings.slice(0,oldBuildings.length),oldBuildings);
  const expected=[...f.registry.buildings.values()].filter(type=>!type.isRoad&&type.id!=='cityHall'&&(!type.featureFlag||f.flags[type.featureFlag])&&(type.minWorldStage||0)<=f.state.world.stage);
  for(const type of expected)assert.ok(rows.some(row=>row.typeId===type.id),type.id);
  assert.ok(!f.state.readyPlan.lots.some(row=>['road','cityHall','flowerGarden'].includes(row.typeId)));
  for(const id of ['basketball','tennis','pool','athletics','soccer']){
    const row=rows.find(lot=>lot.typeId===id),type=f.registry.buildings.get(id);
    assert.deepEqual([row.w,row.d],type.footprint);assert.equal(cells(row,f.registry).length,row.w*row.d);
    for(let dx=0;dx<row.w;dx++)for(let dz=0;dz<row.d;dz++)assert.equal(readyPlotAt(f.state,f.registry,row.x+dx,row.z+dz,f.flags).id,row.id);
    assert.notEqual(readyPlotAt(f.state,f.registry,row.x+row.w,row.z,f.flags)?.id,row.id);
  }
  for(const id of ['wall','watchtower','shield','embassy']){
    const row=rows.find(lot=>lot.typeId===id);assert.equal(row.status,'locked');assert.equal(row.reason,'reason.locked');assert.equal(row.ok,false);
  }
  assert.ok(rows.some(row=>row.typeId==='waterTower'));assert.ok(rows.some(row=>row.typeId==='powerPlant'));
  assert.ok(validReadyPlan(f.state.readyPlan,f.state,f.registry));
});

test('all reserved footprints and free roads are disjoint and every required road belongs to the hall network',()=>{
  const f=fixture();prepare(f);const occupied=new Set(),connections=assertConnections(f);
  assert.equal(connections.connected.size,connections.roads.size);
  for(const lot of f.state.readyPlan.lots){
    const type=f.registry.buildings.get(lot.typeId);
    for(const key of cells(lot,f.registry)){assert.ok(!occupied.has(key));assert.ok(!connections.roads.has(key));occupied.add(key);}
    const check=validatePlacement({...f.state,money:Number.MAX_SAFE_INTEGER},f.registry,lot.typeId,lot.x,lot.z,undefined,f.flags);
    assert.ok(check.ok||['reason.locked','reason.learningOrder'].includes(check.reason),`${lot.typeId}: ${check.reason}`);
    if(type.requiresShore)assert.ok(lot.x===0||lot.z===0,'new ports use a stable coastline');
  }
});

test('fresh neighborhoods stay near home while preserving water coverage and connected facilities',()=>{
  const f=fixture();prepare(f);const rows=plots(f),size=f.state.world.size,center=lot=>({x:lot.x+lot.w/2,z:lot.z+lot.d/2});
  assert.ok(Math.max(...rows.map(lot=>lot.x+lot.w))<size*.8);
  assert.ok(Math.max(...rows.map(lot=>lot.z+lot.d))<size*.8);
  assert.ok(f.state.buildings.filter(b=>b.typeId==='road').length<120);
  const home=rows.find(lot=>lot.typeId==='house'),water=rows.find(lot=>lot.typeId==='waterTower');
  assert.ok(Math.hypot(center(home).x-center(water).x,center(home).z-center(water).z)<=f.registry.buildings.get('waterTower').radius);
  assertConnections(f);
});

test('preparation is free and idempotent; building, removal and reload preserve a lot id, number and coordinates',()=>{
  const f=fixture();prepare(f);const saved=JSON.stringify(f.state),beforePlan=structuredClone(f.state.readyPlan),lot=readyPlotForType(f.state,f.registry,'house',f.flags);
  assert.deepEqual(prepare(f),{ok:true,changed:false,addedLots:0,addedRoads:0});assert.equal(JSON.stringify(f.state),saved);
  f.state.buildings.push({id:'built-on-ready-lot',typeId:lot.typeId,x:lot.x,z:lot.z,level:1});
  assert.ok(!plots(f).some(row=>row.id===lot.id));assert.equal(prepare(f).changed,false);assert.deepEqual(f.state.readyPlan,beforePlan);
  const reloaded={...f,state:JSON.parse(JSON.stringify(f.state))};assert.ok(validReadyPlan(reloaded.state.readyPlan,reloaded.state,reloaded.registry));
  reloaded.state.buildings=reloaded.state.buildings.filter(row=>row.id!=='built-on-ready-lot');
  const reopened=plots(reloaded).find(row=>row.id===lot.id);assert.ok(reopened);assert.equal(reopened.number,lot.number);assert.deepEqual([reopened.x,reopened.z],[lot.x,lot.z]);
  assert.equal(prepare(reloaded).changed,false);
});

test('funds, capacity, feature locks and learning prerequisites use actual command rules while keeping vacant labels visible',()=>{
  const f=fixture();prepare(f);f.state.money=0;
  const before=JSON.stringify(f.state),home=readyPlotForType(f.state,f.registry,'house',f.flags);
  assert.equal(home.ok,false);assert.equal(home.status,'unavailable');assert.equal(home.reason,'reason.money');
  const math=readyPlotForType(f.state,f.registry,'mathLab',f.flags);assert.equal(math.reason,'reason.learningOrder');
  assert.equal(readyPlotForType(f.state,f.registry,'tennis',{...f.flags,sportFacilities:false}).reason,'reason.locked');
  const registry={...f.registry,buildings:new Map(f.registry.buildings)},type=registry.buildings.get('house');
  registry.buildings.set('house',{...type,limit:{kind:'stageCap',maxCount:[0,0,0],reason:'reason.limit.house'}});
  assert.equal(readyPlotForType(f.state,registry,'house',f.flags).reason,'reason.limit.house');
  assert.equal(JSON.stringify(f.state),before);assert.equal(readyPlotAt(f.state,f.registry,-1,0,f.flags),null);
});

test('a dense existing city and pending municipal zones retain every earned record and coordinate',()=>{
  const f=fixture();for(let x=12;x<=16;x++)f.state.buildings.push({id:`old-road-${x}`,typeId:'road',x,z:7,level:1});
  const occupied=new Set(f.state.buildings.flatMap(row=>cells(row,f.registry)));
  for(let z=0;z<16;z+=2)for(let x=0;x<16;x+=2){
    const row={id:`old-home-${x}-${z}`,typeId:'house',x,z,level:1};
    if(cells(row,f.registry).some(key=>occupied.has(key)))continue;
    f.state.buildings.push(row);cells(row,f.registry).forEach(key=>occupied.add(key));
  }
  f.state.cityManagement.zones.push({id:'zone-1',kind:'residential',x:19,z:21});f.state.cityManagement.nextZoneId=2;
  const before=structuredClone(f.state.buildings),earned=remaining(f.state),zoneCells=new Set(cells({typeId:'house',x:19,z:21},f.registry));
  assert.ok(prepare(f).ok);assert.deepEqual(f.state.buildings.slice(0,before.length),before);assert.equal(remaining(f.state),earned);
  for(const row of f.state.buildings.slice(before.length))for(const key of cells(row,f.registry))assert.ok(!zoneCells.has(key));
  for(const lot of f.state.readyPlan.lots)for(const key of cells(lot,f.registry))assert.ok(!zoneCells.has(key));
  assert.ok(plots(f).some(lot=>lot.typeId==='tennis'));assertConnections(f);
});

test('additive imported buildings can block a reservation without moving it and get a permanent replacement',()=>{
  const f=fixture();prepare(f);const lot=f.state.readyPlan.lots.find(row=>row.typeId==='tennis'),before=structuredClone(lot);
  f.state.buildings.push({id:'imported-well',typeId:'waterTower',x:lot.x,z:lot.z,level:1});
  assert.ok(validReadyPlan(f.state.readyPlan,f.state,f.registry));assert.ok(!plots(f).some(row=>row.id===lot.id));
  const result=prepare(f);assert.ok(result.addedLots>0);assert.deepEqual(f.state.readyPlan.lots.find(row=>row.id===lot.id),before);
  const replacement=plots(f).find(row=>row.typeId==='tennis');assert.ok(replacement);assert.notEqual(replacement.id,lot.id);
  assert.deepEqual(f.state.buildings.find(row=>row.id==='imported-well'),{id:'imported-well',typeId:'waterTower',x:lot.x,z:lot.z,level:1});
  assert.equal(prepare(f).changed,false);
});

test('stage expansions append lots and corridors without changing prior reservations, ports or progress',()=>{
  const f=fixture();prepare(f);const harbor=structuredClone(f.state.readyPlan.lots.find(row=>row.typeId==='harbor'));
  f.state.buildings.push({id:'earned-harbor',typeId:'harbor',x:harbor.x,z:harbor.z,level:1});
  for(const [stage,size]of [[1,40],[2,48]]){
    const plan=structuredClone(f.state.readyPlan.lots),before=structuredClone(f.state.buildings),earned=remaining(f.state);
    f.state.world={stage,size};const result=prepare(f);assert.ok(result.addedLots>0);assert.ok(result.addedRoads>=0);
    assert.deepEqual(f.state.readyPlan.lots.slice(0,plan.length),plan);assert.deepEqual(f.state.buildings.slice(0,before.length),before);
    assert.equal(remaining(f.state),earned);assert.deepEqual(f.state.readyPlan.lots.find(row=>row.id===harbor.id),harbor);
    assert.ok(harbor.x===0||harbor.z===0);assert.ok(validReadyPlan(f.state.readyPlan,f.state,f.registry));assertConnections(f);
    assert.equal(prepare(f).changed,false);
  }
});

test('a historical port reservation remains readable inland after expansion and gets a new shoreline option',()=>{
  const f=fixture();f.state.readyPlan={version:1,lots:[{id:'old-east-port',typeId:'harbor',x:29,z:20}]};
  assert.ok(validReadyPlan(f.state.readyPlan,f.state,f.registry));f.state.world={size:40,stage:1};
  assert.ok(validReadyPlan(f.state.readyPlan,f.state,f.registry));assert.ok(!plots(f).some(row=>row.id==='old-east-port'));
  prepare(f);assert.deepEqual(f.state.readyPlan.lots[0],{id:'old-east-port',typeId:'harbor',x:29,z:20});
  const replacement=plots(f).find(row=>row.typeId==='harbor');assert.ok(replacement);assert.ok(replacement.x===0||replacement.z===0);
});

test('plan validation rejects damaged versions, IDs, types, positions, arbitrary inland ports, overlaps and extra fields',()=>{
  const f=fixture();prepare(f);assert.equal(validReadyPlan(undefined,f.state,f.registry),true);
  for(const corrupt of [null,[],{version:2,lots:[]},{version:1,lots:[],extra:true}])assert.equal(validReadyPlan(corrupt,f.state,f.registry),false);
  const baseLot={id:'plot',typeId:'house',x:1,z:1};
  for(const lot of [{...baseLot,id:'bad id'},{...baseLot,typeId:'missing'},{...baseLot,typeId:'road'},{...baseLot,typeId:'cityHall'},{...baseLot,x:-1},{...baseLot,z:.5},{...baseLot,x:32},{...baseLot,w:2},{...baseLot,typeId:'harbor',x:11,z:11}])assert.equal(validReadyPlan({version:1,lots:[lot]},f.state,f.registry),false);
  assert.equal(validReadyPlan({version:1,lots:[baseLot,{...baseLot,x:5}]},f.state,f.registry),false);
  assert.equal(validReadyPlan({version:1,lots:[baseLot,{...baseLot,id:'overlap',x:2}]},f.state,f.registry),false);
  const damaged=structuredClone(f.state);damaged.readyPlan={version:99,lots:[]};const before=JSON.stringify(damaged);
  assert.equal(prepareReadyPlan(damaged,f.registry,f.flags).ok,false);assert.equal(JSON.stringify(damaged),before);
});

test('free preparation respects save capacity and never deletes records even when no space remains',()=>{
  const f=fixture(),limited={...f.registry,config:{...f.registry.config,maxSaveBuildings:f.state.buildings.length+12}};
  assert.ok(prepareReadyPlan(f.state,limited,f.flags).ok);assert.ok(f.state.buildings.length<=limited.config.maxSaveBuildings);
  assert.equal(f.state.buildings.length,limited.config.maxSaveBuildings);
  const cappedLots=readyPlots(f.state,limited,f.flags);assert.ok(cappedLots.length>0);
  for(const lot of cappedLots){assert.equal(lot.ok,false);assert.equal(lot.status,'unavailable');assert.equal(lot.reason,'ready.limit');}
  assert.equal(readyPlotForType(f.state,limited,cappedLots[0].typeId,f.flags).reason,'ready.limit');
  const connected=cityConnections(f.state,limited);assert.equal(connected.roads.size,connected.connected.size);
  for(const lot of f.state.readyPlan.lots)if(limited.buildings.get(lot.typeId).requiresRoad)assert.ok(connected.hasAccess(lot));
  const full=fixture(),occupied=new Set(full.state.buildings.flatMap(row=>cells(row,full.registry)));
  for(let z=0;z<32;z++)for(let x=0;x<32;x++)if(!occupied.has(`${x},${z}`))full.state.buildings.push({id:`full-${x}-${z}`,typeId:'flowerGarden',x,z,level:1});
  const original=structuredClone(full.state.buildings),earned=remaining(full.state);assert.ok(prepare(full).ok);
  assert.deepEqual(full.state.buildings,original);assert.equal(remaining(full.state),earned);assert.deepEqual(full.state.readyPlan,{version:1,lots:[]});
});
