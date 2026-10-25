import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {cityReport, initialCity} from '../workout/island/engine/city-depth.mjs';
import {CURRENT_VERSION, migrateSave, validateSave} from '../workout/island/engine/persistence.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';

const data = await loadData(new URL('../workout/island/',import.meta.url),async url => ({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
function fixture() {
  let at = 1000000; const values = new Map(), storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const engine = createEngine(data,{storage,now:()=>at}); engine.skipTutorial(); engine.state.money=10000;
  return {engine,storage,setNow:value=>{at=value;}};
}
const building = (id,typeId,x,z,level=1)=>({id,typeId,x,z,level});
const row = (engine,id)=>engine.city.report().buildings.find(b=>b.id===id);

test('city report is detached, deterministic, pure and distinguishes range from exhausted capacity',()=>{
  const {engine:e}=fixture();
  e.state.buildings.push(building('tower','waterTower',5,5),building('a','house',5,3,3),building('b','house',3,5,3),building('c','house',7,5,3),building('far','house',15,15));
  const before=structuredClone(e.state), report=e.city.report(); assert.deepEqual(e.state,before);
  assert.deepEqual(report.buildings.filter(b=>b.water?.served).map(b=>b.id),['a','b']);
  assert.equal(row(e,'c').status,'unserved');assert.equal(row(e,'c').water.reason,'capacity');assert.equal(row(e,'far').water.reason,'out-of-range');
  assert.equal(row(e,'tower').service.used,32);assert.deepEqual(row(e,'tower').service.serves,['a','b']);
  report.buildings.find(b=>b.id==='tower').service.serves.push('fake');assert.deepEqual(row(e,'tower').service.serves,['a','b']);
  const houseReport=report.buildings.find(b=>b.id==='a');if(houseReport.upgrade.nextLevel){houseReport.upgrade.nextLevel.cost=-1;assert.notEqual(row(e,'a').upgrade.nextLevel.cost,-1);}
  const reversed={...e.state,buildings:[...e.state.buildings].reverse()};assert.deepEqual(cityReport(reversed,e.registry,data.config,data.city).buildings.find(b=>b.id==='tower').service,row(e,'tower').service);
});
test('water radius includes its boundary, respects upgraded radii, and damaged towers cannot serve',()=>{
  const {engine:e}=fixture();e.state.buildings.push(building('tower','waterTower',5,5),building('edge','house',10,5),building('outside','house',11,5));
  assert.equal(row(e,'edge').water.served,true);assert.equal(row(e,'outside').water.served,false);
  e.state.buildings.find(b=>b.id==='tower').level=2;assert.equal(row(e,'outside').water.served,true);
  e.state.events.repairs.tower=e.state.updatedAt+10000;assert.equal(row(e,'tower').status,'damaged');assert.equal(row(e,'edge').status,'unserved');
});
test('investment affects actual accrual, rejects invalid/poor/damaged/max-tier commands, and undo preserves earned income',()=>{
  const {engine:e}=fixture();const placed=e.place('factory',4,5);assert.ok(placed.ok);const id=placed.id, before=e.income().materials;
  const money=e.state.money;assert.ok(e.city.invest(id).ok);assert.equal(row(e,id).production.tier,2);assert.equal(e.income().materials,before*1.5);
  e.tick(60);const earned=e.state.resources.materials;assert.ok(e.undo().ok);assert.equal(e.state.resources.materials,earned);assert.equal(row(e,id).production.tier,1);assert.ok(e.state.money>=money);
  assert.ok(e.city.invest(id).ok);assert.ok(e.city.invest(id).ok);assert.equal(e.city.invest(id).ok,false);
  assert.equal(e.city.invest('missing').ok,false);e.state.money=0;const snapshot=structuredClone(e.state);assert.equal(e.city.invest(e.state.buildings[0].id).ok,false);assert.deepEqual(e.state,snapshot);
});
test('port offers are explicit, cooldown uses play time, delivery and skipping are idempotent and undoable',()=>{
  const {engine:e}=fixture();assert.equal(e.city.port().ok,false);e.state.buildings.push(building('port','harbor',0,8));
  assert.ok(e.city.port().ok);const slots=e.city.report().port.slots;assert.equal(slots.length,data.city.port.slots);assert.equal(e.city.port().ok,false);
  const slot=slots[0];e.state.resources[slot.resource]=slot.amount;const money=e.state.money;
  assert.ok(e.city.deliver(slot.id).ok);assert.equal(e.state.money,money+slot.reward);assert.equal(e.state.resources[slot.resource],0);assert.equal(e.city.deliver(slot.id).ok,false);
  assert.ok(e.undo().ok);assert.equal(e.state.money,money);assert.equal(e.state.resources[slot.resource],slot.amount);assert.equal(e.city.report().port.slots[0].state,'offered');
  assert.ok(e.city.skip(slot.id).ok);assert.equal(e.city.skip(slot.id).ok,false);assert.ok(e.city.skip(slots[1].id).ok);assert.equal(e.city.port().ok,false);
  e.tick(60);assert.ok(e.city.port().ok);assert.notEqual(e.city.report().port.slots[0].id,slot.id);
});
test('goal rewards are one-time, survive reload/import and can be reversed by one undo',()=>{
  const {engine:e,storage}=fixture();const id=e.place('factory',4,5).id;assert.equal(e.city.goal('production').ok,false);e.city.invest(id);
  const money=e.state.money;assert.ok(e.city.goal('production').ok);assert.equal(e.city.goal('production').ok,false);assert.equal(e.state.money,money+60);
  assert.ok(e.undo().ok);assert.equal(e.state.money,money);assert.ok(e.city.goal('production').ok);e.save();
  const reload=createEngine(data,{storage});assert.equal(reload.city.goal('production').ok,false);assert.ok(reload.importJSON(e.exportJSON()).ok);assert.equal(reload.city.goal('production').ok,false);
});
test('existing fire outcomes announce damage through engine.subscribe and city repair/undo uses the same damage record',()=>{
  const {engine:e}=fixture();e.setAvatar({created:true});e.place('house',4,5);const events=[];e.subscribe((_,event)=>events.push(event.type));
  const activity=createActivity(e,{now:()=>e.now(),random:()=>0});assert.ok(activity.prepare('fire').ok);const event=e.state.events.active;assert.ok(activity.resolve(event.id,{outcome:'lose'}).ok);
  assert.equal(row(e,event.targetId).status,'damaged');assert.ok(events.includes('city-emergency'));
  const money=e.state.money;assert.ok(e.city.repair(event.targetId).ok);assert.notEqual(row(e,event.targetId).status,'damaged');assert.equal(e.state.money,money-data.config.events.repairCost);
  assert.ok(e.undo().ok);assert.equal(e.state.money,money);assert.equal(row(e,event.targetId).status,'damaged');activity.dispose();
});
test('v17 migration adds only city state, v18 round-trips, and corrupt city saves are rejected',()=>{
  const {engine:e}=fixture(), old=structuredClone(e.state);old.version=17;delete old.city;const before=structuredClone(old);
  const migrated=migrateSave(old,data,e.registry);assert.ok(migrated.ok);assert.equal(CURRENT_VERSION,18);assert.deepEqual(old,before);assert.deepEqual(migrated.state,{...old,version:18,city:initialCity()});assert.ok(validateSave(migrated.state,data,e.registry).ok);
  for(const mutate of [s=>delete s.city,s=>s.city.investments.unknown=2,s=>s.city.delivered=-1,s=>s.city.port.cycle=Infinity,s=>s.city.claimedGoals=['water','water'],s=>s.city.port.slots=[{id:'fake'}]]){const state=structuredClone(migrated.state);mutate(state);assert.equal(migrateSave(state,data,e.registry).ok,false);}
});
test('removing an invested damaged producer clears its saved references; one undo restores both investment and damage',()=>{
  const {engine:e}=fixture(),id=e.place('factory',4,5).id;e.city.invest(id);e.state.events.repairs[id]=e.now()+10000;
  assert.ok(e.remove(id).ok);assert.ok(validateSave(e.state,data,e.registry).ok);assert.equal(e.state.city.investments[id],undefined);assert.equal(e.state.events.repairs[id],undefined);
  assert.ok(e.undo().ok);assert.equal(row(e,id).production.tier,2);assert.equal(row(e,id).status,'damaged');assert.ok(validateSave(e.state,data,e.registry).ok);
});
test('city release pins the report, runtime, UI module and stylesheet to the shared cache identity',async()=>{
  const root=new URL('../workout/island/',import.meta.url),release=JSON.parse(await readFile(new URL('release.json',root),'utf8'));
  const {DATA_VERSION}=await import('../workout/island/release.mjs');assert.equal(release.version,DATA_VERSION);assert.equal(CURRENT_VERSION,18);
  for(const file of ['engine/engine.mjs','engine/persistence.mjs','engine/city-depth.mjs','engine/city-runtime.mjs','ui/interface.mjs','ui/city-depth.mjs','view/island-view.mjs','view/city-depth.mjs','index.html']){
    const source=await readFile(new URL(file,root),'utf8');for(const match of source.matchAll(/\?v=([\w.-]+)/g))assert.equal(match[1],DATA_VERSION,file);
  }
  assert.match(await readFile(new URL('index.html',root),'utf8'),new RegExp('ui/city-depth\\.css\\?v='+DATA_VERSION));
});
test('published PR170 v18 saves gain the city extension once without losing municipal policy, plans or earned fields',()=>{
  const {engine:e}=fixture();e.setCityPolicy({enabled:true,taxRate:13,funding:{water:150}});e.zone('residential',4,5);
  const published=structuredClone(e.state);delete published.city;delete published.cityDepthVersion;const before=structuredClone(published),result=migrateSave(published,data,e.registry);
  assert.ok(result.ok);assert.deepEqual(published,before);assert.deepEqual(result.state,{...published,cityDepthVersion:1,city:initialCity()});assert.ok(validateSave(result.state,data,e.registry).ok);
  const corrupt=structuredClone(result.state);delete corrupt.city;assert.equal(migrateSave(corrupt,data,e.registry).ok,false);
  const future=structuredClone(result.state);future.cityDepthVersion=2;assert.equal(migrateSave(future,data,e.registry).ok,false);
});
test('opt-in municipal water uses the existing flow allocation, funded radius and capacity without a second set of rules',()=>{
  const {engine:e}=fixture(),a=e.place('house',4,5).id,b=e.place('house',6,5).id,tower=e.place('waterTower',8,5).id;
  assert.ok(e.setCityPolicy({enabled:true,funding:{water:50}}).ok);
  const water=e.cityReport().services.water,provider=water.providers.find(row=>row.id===tower),report=e.city.report(),service=report.buildings.find(row=>row.id===tower).service;
  assert.deepEqual(service,{radius:provider.radius,capacity:provider.capacity,used:provider.used,serves:provider.serves});assert.equal(row(e,a).water.reason,'out-of-range');assert.equal(row(e,b).water.served,true);
  assert.equal(provider.used,Object.values(provider.allocations).reduce((sum,n)=>sum+n,0));assert.equal(provider.used,water.covered);
  assert.ok(e.city.invest(tower).ok);assert.deepEqual(row(e,tower).service,service,'a production investment never changes the municipal service budget');
  e.setCityPolicy({funding:{water:150}});assert.ok(row(e,a).water.served);assert.equal(row(e,tower).service.capacity,48);
});
test('valid imported building IDs that match object members retain numeric investment tiers through save, import and undo',()=>{
  for(const id of ['constructor','toString']) {
    const {engine:e}=fixture(),placed=e.place('factory',4,5);e.state.buildings.find(b=>b.id===placed.id).id=id;
    assert.ok(validateSave(e.state,data,e.registry).ok);assert.equal(row(e,id).production.tier,1);assert.ok(e.city.invest(id).ok);assert.equal(row(e,id).production.tier,2);
    const raw=e.exportJSON();assert.ok(e.undo().ok);assert.equal(row(e,id).production.tier,1);assert.ok(e.importJSON(raw).ok);assert.equal(row(e,id).production.tier,2);assert.ok(validateSave(e.state,data,e.registry).ok);
  }
});
