import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fireScenario} from '../workout/island/minigames/fire-campaign.mjs';
import {createFireRoads,projectFireRoad,fireRoadRoute,fireTruckIntersectsBuilding} from '../workout/island/minigames/fire-roads.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames;
const original=config.fireRescue;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;};

test('Fire campaign has thirty unique missions with gradual route, supply and rescue variation',()=>{
 assert.equal(original.levels.length,30);
 const stages=original.levels.slice(10),missions=stages.map(s=>s.mission);
 assert.equal(new Set(missions.map(m=>m.titleKey)).size,20);
 assert.equal(new Set(missions.map(m=>m.cityPlan)).size,4);
 assert.ok(new Set(missions.map(m=>m.kind)).size>=7);
 assert.ok(new Set(missions.map(m=>JSON.stringify(m.startAt))).size>=7);
 assert.ok(new Set(missions.map(m=>JSON.stringify(m.siteOrder))).size>=6);
 assert.ok(missions.some(m=>m.hydrantIndices.length===1));
 assert.ok(missions.some(m=>m.hydrantIndices.length===2));
 assert.ok(new Set(stages.map(s=>s.flames)).size>=4);
 assert.ok(new Set(stages.map(s=>s.ladderMode)).size>=4);
 assert.ok(stages.some(s=>s.reigniteSeconds===0));
 assert.ok(stages.some(s=>s.wind>=6));
 for(const [i,stage] of original.levels.entries()){
  assert.equal(stage.difficulty,i+1);
  assert.ok(stage.flames+stage.spreadCount<=original.sites.length);
  if(i)assert.ok(stage.winMoney>original.levels[i-1].winMoney);
  if(!stage.mission)continue;
  assert.ok(stage.mission.requiredRescues<=stage.rescueCount);
  assert.ok(stage.rescueCount<=original.rescueSites.length);
  assert.ok(stage.seconds>=40+stage.rescueCount*10);
  assert.ok(stage.mission.rescueSeconds>=stage.seconds-10);
  assert.ok(stage.water>=76,'Every stage offers a useful starting tank without equipment');
  assert.ok(stage.resistance<=1.5,'Campaign variation does not rely on unbounded heat resistance');
 }
});

test('Fire scenario derivation preserves legacy ten-stage data and never mutates its source',()=>{
 const source=deepFreeze(structuredClone(original)),before=JSON.stringify(source);
 for(let level=1;level<=10;level++)assert.deepEqual(fireScenario(source,level),source);
 for(let level=11;level<=30;level++){
  const scenario=fireScenario(source,level);
  assert.notEqual(scenario,source);
  assert.deepEqual(scenario.levels,source.levels);
  assert.deepEqual(fireScenario(scenario,level),scenario,'Session and model can safely derive the same stage');
 }
 assert.equal(JSON.stringify(source),before);
});

for(let level=11;level<=30;level++)test(`Fire mission ${level}: roads, model facades, targets, spawn and rescue routes agree`,()=>{
 const b=fireScenario(original,level),stage=b.levels[level-1],roads=createFireRoads(b.city),order=b.scenario.sourceSiteIndices;
 assert.equal(new Set(order).size,original.sites.length);
 assert.deepEqual([...order].sort((a,b)=>a-b),original.sites.map((_,i)=>i));
 assert.deepEqual([...b.city.roadsX].sort((a,b)=>a-b),b.city.roadsX);
 assert.deepEqual([...b.city.roadsZ].sort((a,b)=>a-b),b.city.roadsZ);
 assert.deepEqual(b.city.models,original.city.models);
 assert.equal(b.vehicle.model,original.vehicle.model);
 for(const key of ['length','width','cannonPivot','muzzleOffset'])assert.deepEqual(b.vehicle[key],original.vehicle[key]);
 for(const key of ['maxTriangles','maxDrawCalls','resolutionScale'])assert.equal(b.render[key],original.render[key]);
 assert.deepEqual(b.hydrant.position,b.city.hydrants[0]);
 const spawn={x:b.vehicle.x,z:b.vehicle.z};
 close(projectFireRoad(roads,spawn).distance,0);
 assert.ok(b.city.buildings.every(lot=>!fireTruckIntersectsBuilding(spawn,lot,b.vehicle)));
 close((b.nozzleX-b.render.logicalCenter[0])*b.render.worldScale,b.vehicle.x);
 close((b.nozzleY-b.render.logicalCenter[1])*b.render.worldScale,b.vehicle.z);
 for(const [index,site] of b.sites.entries()){
  const world=b.render.sites[index],source=original.render.sites[order[index]];
  close((site.x-b.render.logicalCenter[0])*b.render.worldScale,world[0]);
  close((site.y-b.render.logicalCenter[1])*b.render.worldScale,world[2]);
  const lotIndex=original.city.buildings.reduce((best,lot,i,lots)=>Math.hypot(lot.x-source[0],lot.z-source[2])<Math.hypot(lots[best].x-source[0],lots[best].z-source[2])?i:best,0);
  const oldLot=original.city.buildings[lotIndex],lot=b.city.buildings[lotIndex];
  close(world[0]-lot.x,source[0]-oldLot.x);close(world[2]-lot.z,source[2]-oldLot.z);
  assert.equal(lot.width,oldLot.width);assert.equal(lot.depth,oldLot.depth);
 }
 for(const rescue of b.rescueSites.slice(0,stage.rescueCount)){
  close((rescue.x-b.render.logicalCenter[0])*b.render.worldScale,rescue.world[0]);
  close((rescue.y-b.render.logicalCenter[1])*b.render.worldScale,rescue.world[2]);
  assert.ok(rescue.fireIndex<stage.flames,'Required rescue fire starts active');
  assert.equal(rescue.timeoutSeconds,stage.mission.rescueSeconds);
  const destination={x:rescue.world[0],z:rescue.world[2]},park=projectFireRoad(roads,destination);
  assert.ok(park.distance<=b.rescue.truckRadius,'Rescue can be approached from an ordinary road');
  assert.ok(fireRoadRoute(roads,spawn,destination).length>0);
  assert.ok(b.city.buildings.every(lot=>!fireTruckIntersectsBuilding(park,lot,b.vehicle)));
 }
 for(const hydrant of b.city.hydrants){
  const point={x:hydrant[0],z:hydrant[2]},park=projectFireRoad(roads,point);
  assert.ok(park.distance<b.hydrant.radius,'A truck parked on the road can connect');
  assert.ok(b.city.buildings.every(lot=>!fireTruckIntersectsBuilding(park,lot,b.vehicle)));
 }
});

test('Fire rescue order remaps source windows and moves required source fires into the initial wave',()=>{
 const source=structuredClone(original),stage=source.levels[10];
 Object.assign(stage,{flames:3,rescueCount:3});
 Object.assign(stage.mission,{requiredRescues:3,rescueIndices:[2,0,1],siteOrder:[1,2,3,5,6,8,0,4,7]});
 const b=fireScenario(source,11);
 for(const [i,sourceIndex] of stage.mission.rescueIndices.entries()){
  const rescue=b.rescueSites[i];assert.ok(rescue.fireIndex<3);
  assert.equal(b.scenario.sourceSiteIndices[rescue.fireIndex],original.rescueSites[sourceIndex].fireIndex);
 }
 assert.deepEqual(source.levels[10].mission.siteOrder,[1,2,3,5,6,8,0,4,7]);
});

test('Fire scenario rejects malformed stage metadata before creating mismatched targets',()=>{
 assert.throws(()=>fireScenario(original,0),RangeError);
 assert.throws(()=>fireScenario(original,31),RangeError);
 for(const change of [{cityPlan:'unknown'},{siteOrder:Array(9).fill(0)},{hydrantIndices:[]},{rescueIndices:[99]}]){
  const source=structuredClone(original);Object.assign(source.levels[10].mission,change);
  assert.throws(()=>fireScenario(source,11),RangeError);
 }
});

/** Uses real model actions and road travel. It never changes heat, timers,
 * position, water or rescue progress, and has no purchased equipment. */
function completeMission(level,seed){
 const balance=fireScenario(original,level),roads=createFireRoads(balance.city),model=createFireModel({config,balance,level,random:seededRandom(seed)});
 let pumping=false,refilling=false,refillSeconds=0,spraySeconds=0,driveSeconds=0;
 for(let step=0;step<15000&&!model.result;step++){
  if(model.water<=16)refilling=true;if(model.water>=model.maxWater-.1)refilling=false;
  if(model.pressure<.3)pumping=true;if(model.pressure>=model.maxPressure*.98)pumping=false;
  const input={charge:pumping||refilling};
  const moveTo=world=>{
   const destination=projectFireRoad(roads,{x:world[0],z:world[2]});
   if(Math.hypot(destination.x-model.truck.x,destination.z-model.truck.z)>.03){input.truckX=destination.x;input.truckZ=destination.z;return true;}
   return false;
  };
  if(refilling){
   const hydrant=balance.city.hydrants.reduce((best,next)=>Math.hypot(next[0]-model.truck.x,next[2]-model.truck.z)<Math.hypot(best[0]-model.truck.x,best[2]-model.truck.z)?next:best);
   moveTo(hydrant);input.refill=true;
  }else{
   let rescue=model.rescues.find(r=>!r.rescued&&!r.expired);
   const descending=model.rescues.find(r=>r.rescued&&r.descent<1);
   if(rescue&&descending&&model.ladder.mode==='sequence')rescue=null;
   if(rescue){
    const fire=model.flames[rescue.fireIndex],moving=moveTo(rescue.world);
    if(fire.heat>0){input.x=fire.x;input.y=fire.y;input.firing=!moving&&!pumping;}
    else if(!moving){input.rescue=true;input.x=rescue.x;input.y=rescue.y;if(model.ladder.mode==='wind')input.moveX=Math.max(-1,Math.min(1,(-model.ladder.wind-model.ladder.sway*3)/balance.ladder.stabilizePower));}
   }else if(!descending){
    const fire=model.flames.filter(f=>f.active&&f.heat>0).sort((a,b)=>Math.hypot(a.x-model.nozzle.x,a.y-model.nozzle.y)-Math.hypot(b.x-model.nozzle.x,b.y-model.nozzle.y))[0];
    if(fire){
     let moving=false;
     if(Math.hypot(fire.x-model.nozzle.x,fire.y-model.nozzle.y)>model.range*.8)moving=moveTo(balance.render.sites[model.flames.indexOf(fire)]);
     input.x=fire.x;input.y=fire.y;input.firing=!moving&&!pumping;
    }
   }
  }
  const water=model.water;model.update(.02,input);
  refillSeconds+=Number(model.water>water&&!model.spraying)*.02;
  spraySeconds+=Number(model.spraying)*.02;driveSeconds+=Number(model.truck.driving)*.02;
 }
 return {result:model.result,time:model.time,rescued:model.rescues.filter(r=>r.rescued).length,expired:model.rescues.filter(r=>r.expired).length,refillSeconds,spraySeconds,driveSeconds};
}

for(let level=11;level<=30;level++)test(`Fire mission ${level}: three seeds finish through driving, water management and every required rescue without equipment`,()=>{
 for(const seed of [1,3,17]){
  const outcome=completeMission(level,seed),label=JSON.stringify({level,seed,...outcome}),stage=original.levels[level-1];
  assert.equal(outcome.result?.outcome,'win',label);
  assert.equal(outcome.rescued,stage.mission.requiredRescues,label);
  assert.equal(outcome.expired,0,label);
  assert.ok(outcome.result.summary.out>=stage.flames,label);
  assert.ok(outcome.time<stage.seconds,label);
  assert.ok(outcome.driveSeconds>0&&outcome.spraySeconds>0,label);
  if(stage.mission.kind==='supply'||level===30)assert.ok(outcome.refillSeconds>0,label);
 }
});

test('Fire mission sequence is repeatable for the same seed and preserves the balance while playing',()=>{
 const before=JSON.stringify(original);
 assert.deepEqual(completeMission(26,7),completeMission(26,7));
 assert.equal(JSON.stringify(original),before);
});
