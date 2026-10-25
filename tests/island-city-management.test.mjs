import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {initialCityManagement,cityConnections} from '../workout/island/engine/city-management.mjs';
import {CURRENT_VERSION,STORAGE_KEY,migrateSave,validateSave,importWorld} from '../workout/island/engine/persistence.mjs';
import {CityOverlay} from '../workout/island/view/city-overlay.mjs';
import * as T from '../workout/island/vendor/three.module.js';

const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
function fixture(){const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},engine=createEngine(data,{storage,now:()=>1000000});engine.skipTutorial();return {engine,storage,values};}
function enabled(){const f=fixture();assert.ok(f.engine.setCityPolicy({enabled:true}).ok);return f;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ~= ${b}`);

test('city management starts paused and preserves the original economy and all unrelated progress',()=>{
 const {engine:e}=fixture(),before=structuredClone(e.state);assert.equal(e.state.version,18);assert.deepEqual(e.state.cityManagement,initialCityManagement());
 const income=e.income();assert.equal('municipal' in income,false);const tick=e.tick(60);close(e.state.money,before.money+income.money);
 assert.deepEqual(tick.developed,[]);assert.deepEqual(e.state.cityManagement,before.cityManagement);
 for(const key of ['learning','minigameProgress','minigameEquipment','highScores','hangar','soccerRoster','buildings','parts'])assert.deepEqual(e.state[key],before[key],key);
});

test('v17 migration adds only paused management and is immutable and idempotent',()=>{
 const {engine:e}=fixture(),old=structuredClone(e.state);old.version=17;delete old.cityManagement;old.money=7654;old.resources.materials=543;old.minigameProgress.tennis.stars[0]=3;old.minigameProgress.tennis.stage=2;
 const before=structuredClone(old),result=migrateSave(old,data,e.registry);assert.ok(result.ok);assert.deepEqual(old,before);assert.equal(CURRENT_VERSION,18);
 assert.deepEqual(result.state,{...old,version:18,cityManagement:initialCityManagement()});assert.deepEqual(migrateSave(result.state,data,e.registry).state,result.state);
});

test('invalid policy commands are atomic, including unknown departments and nonnumeric values',()=>{
 const {engine:e}=enabled();for(const input of [null,[],{enabled:1},{taxRate:99},{taxRate:'9'},{funding:null},{funding:[]},{funding:{water:0}},{funding:{water:'100'}},{funding:{other:100}},{unknown:true}]){
 const before=e.exportJSON();assert.equal(e.setCityPolicy(input).ok,false,JSON.stringify(input));assert.equal(e.exportJSON(),before);}
});

test('higher taxes raise real income and lower every zone demand without changing earned resources',()=>{
 const {engine:e}=enabled();e.place('house',4,5);const before=structuredClone(e.state.resources);
 e.setCityPolicy({taxRate:5});const low=e.cityReport();e.setCityPolicy({taxRate:13});const high=e.cityReport();
 assert.ok(high.budget.taxes>low.budget.taxes);assert.ok(high.budget.net>low.budget.net);for(const id of ['residential','commercial','industrial'])assert.ok(high.demand[id]<low.demand[id]);assert.deepEqual(e.state.resources,before);
 const income=e.income();close(income.money,income.sources.filter(row=>row.resource==='money').reduce((sum,row)=>sum+row.amount,0));
});

test('service funding affects the actual bill, capacity, radius and city metrics',()=>{
 const {engine:e}=enabled();const home=e.place('house',4,5),tower=e.place('waterTower',4,8);assert.ok(home.ok&&tower.ok);
 e.setCityPolicy({funding:{water:50}});const low=e.cityReport(),lowMetric=e.metrics().health;e.setCityPolicy({funding:{water:150}});const high=e.cityReport();
 close(high.services.water.capacity,low.services.water.capacity*3);close(high.budget.departments.water,low.budget.departments.water*3);assert.ok(e.metrics().health>lowMetric);
 const source=e.state.buildings.find(row=>row.id===tower.id);e.state.events.repairs[source.id]=e.state.updatedAt+1000;assert.equal(e.cityReport().services.water.capacity,0);
});

test('city connection excludes decorative walking paths and isolated road islands',()=>{
 const {engine:e}=enabled();e.place('house',4,5);e.place('waterTower',4,8);assert.equal(e.cityReport().services.water.coverage,100);
 const home=e.state.buildings.find(row=>row.typeId==='house');home.x=0;home.z=0;e.state.buildings.push({id:'isolated',typeId:'road',x:0,z:2,level:1});
 const network=cityConnections(e.state,e.registry);assert.equal(network.hasAccess(home),false);assert.ok(e.cityReport().disconnected.includes(home.id));assert.equal(e.cityReport().services.water.homes[home.id],0);
});

test('a free planned lot can wait for money and roads and rejects overlaps and bounds atomically',()=>{
 const {engine:e}=enabled();e.state.money=0;const a=e.zone('residential',0,0);assert.ok(a.ok);assert.equal(e.state.money,0);assert.equal(e.cityReport().zones[0].reason,'city.reason.connection');
 for(const [kind,x,z]of [['residential',1,1],['industrial',0,0],['commercial',15,15],['other',2,2],['residential',.5,0],['residential',3,7]]){const before=e.exportJSON();assert.equal(e.zone(kind,x,z).ok,false);assert.equal(e.exportJSON(),before);}
});

test('one connected ready lot develops only at the interval and pays the standard building cost',()=>{
 const {engine:e}=enabled();e.state.claimedRewards.push('mission.house');const lot=e.zone('residential',4,5);assert.ok(lot.ok);const nextId=e.state.nextId;
 assert.deepEqual(e.tick(29).developed,[]);assert.equal(e.state.nextId,nextId);const money=e.state.money,result=e.tick(1);
 assert.equal(result.developed.length,1);close(e.state.money,money+result.gained.money-e.registry.buildings.get('house').cost);
 assert.equal(e.cityReport().zones[0].status,'developed');const building=e.state.buildings.find(row=>row.id===result.developed[0].buildingId);assert.equal(building.typeId,'house');assert.equal(e.state.cityManagement.developed,1);
 e.tick(60);assert.equal(e.state.cityManagement.developed,1,'an occupied lot never charges or duplicates itself');
});

test('blocked lots consume no construction money, reward, progress or building ID',()=>{
 const {engine:e}=enabled();e.zone('residential',0,0);const before=structuredClone(e.state),result=e.tick(60);
 assert.deepEqual(result.developed,[]);assert.equal(e.state.nextId,before.nextId);assert.deepEqual(e.state.buildings,before.buildings);assert.deepEqual(e.state.claimedRewards,before.claimedRewards);close(e.state.money,before.money+result.gained.money);
});

test('new housing after the bootstrap needs jobs and local funded water',()=>{
 const {engine:e}=enabled();assert.ok(e.place('house',4,5).ok);assert.ok(e.place('house',6,5).ok);assert.ok(e.zone('residential',8,5).ok);
 assert.equal(e.cityReport().zones[0].reason,'city.reason.jobs');assert.ok(e.place('shop',10,5).ok);assert.equal(e.cityReport().zones[0].reason,'city.reason.water');
 assert.ok(e.place('waterTower',8,8).ok);assert.equal(e.cityReport().zones[0].status,'ready');assert.equal(e.tick(30).developed.length,1);
});

test('a local water tower cannot borrow unused capacity from an out-of-range tower',()=>{
 const {engine:e}=enabled();e.place('house',4,5);e.place('waterTower',4,8);const home=e.state.buildings.find(row=>row.typeId==='house');home.level=4;
 e.state.cityManagement.funding.water=50;const coverage=e.cityReport().services.water.coverage;assert.equal(coverage,67);
 e.state.buildings.push({id:'far-water',typeId:'waterTower',x:12,z:0,level:3},{id:'far-road',typeId:'road',x:12,z:2,level:1});assert.equal(e.cityReport().services.water.coverage,coverage);
});

test('overlapping service areas route spare capacity to reachable unserved homes without double counting',()=>{
 const custom={...data,config:structuredClone(data.config)};custom.config.buildings.waterTower.levels[0].supply=4;
 const e=createEngine(custom,{storage:{getItem:()=>null,setItem(){}},now:()=>1000000});e.skipTutorial();e.move(e.state.buildings.find(row=>row.typeId==='cityHall').id,0,0);
 e.place('house',4,5);e.place('house',8,5);assert.ok(e.place('waterTower',6,8).ok);assert.ok(e.place('waterTower',2,8).ok);e.setCityPolicy({enabled:true});
 const water=e.cityReport().services.water;assert.equal(water.capacity,8);assert.equal(water.covered,8);assert.equal(water.coverage,100);assert.ok(Object.values(water.homes).every(value=>value===100));
});

test('city growth keeps stage count caps, money guards and the original model type',()=>{
 const {engine:e}=enabled();e.zone('residential',4,5);e.state.money=0;assert.equal(e.cityReport().zones[0].reason,'reason.money');assert.deepEqual(e.tick(30).developed,[]);assert.equal(e.state.nextId,1);
 e.state.money=10000;for(const [x,z]of [[4,5],[6,5],[8,5],[10,5],[4,8],[8,8]])assert.ok(e.place('house',x,z).ok);
 assert.ok(e.zone('residential',10,8).ok);assert.equal(e.cityReport().zones.at(-1).reason,'reason.limit.house');assert.deepEqual(e.tick(30).developed,[]);
});

test('pausing freezes growth and municipal charges while the original economy continues',()=>{
 const {engine:e}=enabled();e.zone('residential',4,5);e.tick(15);e.setCityPolicy({enabled:false});const clock=e.state.cityManagement.growthSeconds,policy=structuredClone(e.state.cityManagement);assert.equal('municipal' in e.income(),false);
 e.tick(60);assert.equal(e.state.cityManagement.growthSeconds,clock);assert.deepEqual(e.state.cityManagement,policy);e.setCityPolicy({enabled:true});assert.equal(e.tick(15).developed.length,1);
});

test('foreground tick grouping respects growth boundaries and produces equal costs and buildings',()=>{
 const a=enabled().engine,b=enabled().engine;for(const e of [a,b]){e.zone('residential',4,5);e.zone('residential',6,5);}
 a.tick(60);for(let i=0;i<60;i++)b.tick(1);close(a.state.money,b.state.money);assert.deepEqual(a.state.buildings,b.state.buildings);assert.deepEqual(a.state.cityManagement,b.state.cityManagement);
});

test('an unpaid municipal bill never creates debt or grants fully funded services',()=>{
 const custom={...data,config:structuredClone(data.config)};custom.config.cityManagement.services.waterTower.upkeep=10000;
 const e=createEngine(custom,{storage:{getItem:()=>null,setItem(){}},now:()=>1000000});e.skipTutorial();e.place('house',4,5);e.place('waterTower',4,8);e.setCityPolicy({enabled:true});e.state.money=0;e.tick(1);
 assert.equal(e.state.money,0);assert.ok(e.state.cityManagement.operatingRatio>0&&e.state.cityManagement.operatingRatio<.01);assert.ok(e.cityReport().services.water.capacity<1);assert.ok(validateSave(e.state,custom,e.registry).ok);
});

test('removing a zoning plan leaves a developed building and all rewards intact; undo restores only the plan',()=>{
 const {engine:e}=enabled(),lot=e.zone('residential',4,5);e.tick(30);const before=structuredClone(e.state.buildings),money=e.state.money;e.removeZone(lot.id);assert.deepEqual(e.state.buildings,before);assert.equal(e.state.money,money);assert.ok(e.undo().ok);assert.equal(e.state.cityManagement.zones.length,1);assert.equal(e.cityReport().zones[0].status,'developed');
});

test('undo does not overwrite a building that grew into the former position of a moved building',()=>{
 const {engine:e}=enabled();const home=e.place('house',4,5);assert.ok(e.move(home.id,6,5).ok);e.zone('commercial',4,5);e.tick(30);assert.ok(e.undo().ok,'undo the zoning designation first');const before=e.exportJSON();assert.equal(e.undo().reason,'reason.occupied');assert.equal(e.exportJSON(),before);assert.ok(validateSave(e.state,data,e.registry).ok);
});

test('city policy, plans, growth and every earned field survive save and reload',()=>{
 const f=enabled(),e=f.engine;e.setCityPolicy({taxRate:13,funding:{water:150,health:50}});e.zone('residential',4,5);e.tick(30);e.save();const loaded=createEngine(data,{storage:f.storage,now:()=>1000000});assert.deepEqual(loaded.state,e.state);assert.ok(loaded.storageStatus.ok);
});

test('backup imports add nonconflicting plans once while retaining current policy and earned progress',()=>{
 const current=enabled().engine,incoming=enabled().engine;current.zone('residential',4,5);incoming.zone('commercial',4,5);incoming.zone('industrial',8,5);incoming.setCityPolicy({taxRate:13,funding:{water:150}});
 const before=structuredClone(current.state),raw=incoming.exportJSON();assert.ok(current.importJSON(raw).ok);assert.equal(current.state.cityManagement.zones.length,2);assert.equal(current.state.cityManagement.taxRate,9);assert.equal(current.state.cityManagement.funding.water,100);assert.ok(current.importJSON(raw).ok);assert.equal(current.state.cityManagement.zones.length,2);
 for(const key of ['minigameProgress','minigameEquipment','learning','highScores','buildings'])assert.deepEqual(current.state[key],before[key],key);
 const old=structuredClone(current.state);old.version=17;delete old.cityManagement;assert.ok(current.importJSON(old).ok);assert.equal(current.state.cityManagement.zones.length,2);assert.equal(current.state.cityManagement.enabled,true);
});

test('corrupt current management saves are rejected without replacing any stored or live data',()=>{
 const f=enabled(),e=f.engine;for(const change of [p=>p.enabled=1,p=>p.taxRate=1,p=>p.funding.water=Infinity,p=>p.funding.bad=100,p=>p.growthSeconds=30,p=>p.growthSeconds=-1,p=>p.operatingRatio=2,p=>p.nextZoneId=0,p=>p.zones=[{id:'zone-1',kind:'bad',x:0,z:0}],p=>p.zones=[{id:'zone-1',kind:'residential',x:99,z:0}],p=>p.zones=[{id:'zone-1',kind:'residential',x:0,z:0},{id:'zone-2',kind:'commercial',x:1,z:1}]]){
 const raw=JSON.parse(e.exportJSON());change(raw.cityManagement);const before=e.exportJSON(),saved=f.values.get(STORAGE_KEY);assert.equal(e.importJSON(raw).ok,false);assert.equal(e.exportJSON(),before);assert.equal(f.values.get(STORAGE_KEY),saved);}
 const broken=JSON.parse(e.exportJSON());broken.world=null;assert.doesNotThrow(()=>validateSave(broken,data,e.registry));assert.equal(validateSave(broken,data,e.registry).ok,false);
});

test('planning overlay batches pending zones and covered homes without changing saves or source materials',()=>{
 const {engine:e}=enabled();e.zone('residential',4,5);const scene=new T.Scene(),overlay=new CityOverlay(scene,.1),before=e.exportJSON();overlay.sync(e.state,id=>e.registry.buildings.get(id),data.config,e.cityReport());assert.equal(overlay.mesh.count,1);assert.equal(e.exportJSON(),before);
 e.tick(30);overlay.sync(e.state,id=>e.registry.buildings.get(id),data.config,e.cityReport());assert.equal(overlay.mesh.count,0);
 overlay.mode='water';overlay.sync(e.state,id=>e.registry.buildings.get(id),data.config,e.cityReport());assert.equal(overlay.mesh.count,1);const color=new T.Color();overlay.mesh.getColorAt(0,color);assert.ok(color.r>color.g);
 let geometry=0,material=0;overlay.geometry.addEventListener('dispose',()=>geometry++);overlay.material.addEventListener('dispose',()=>material++);overlay.dispose();assert.equal(scene.children.length,0);assert.equal(geometry,1);assert.equal(material,1);
});
