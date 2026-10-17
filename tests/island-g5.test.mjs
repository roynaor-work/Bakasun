import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {CURRENT_VERSION,STORAGE_KEY,migrations,migrateSave,validateSave} from '../workout/island/engine/persistence.mjs';
import {cellsFor} from '../workout/island/engine/rules.mjs';
import {gameAvailability} from '../workout/island/activity/availability.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';
import {ActivityInterface} from '../workout/island/ui/activity.mjs';
import {IslandInterface} from '../workout/island/ui/interface.mjs';
import {GameNavigation,fitGameViewport} from '../workout/island/ui/game-shell.mjs';
import {DATA_VERSION} from '../workout/island/release.mjs';
import {createSound} from '../workout/island/minigames/sound.mjs';
const root=new URL('../workout/island/',import.meta.url),data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const strings=JSON.parse(await readFile(new URL('data/strings.he.json',root),'utf8'));
const legacy=JSON.parse(await readFile(new URL('./fixtures/save-v8.json',import.meta.url),'utf8'));
const requirements={soccer:['soccer','יש לבנות מגרש כדורגל'],navalDuel:['harbor','יש לבנות נמל ימי'],fireRescue:['fireStation','יש לבנות תחנת כיבוי'],alienDefense:['airbase','יש לבנות בסיס חיל אוויר']};
function fixture(){let time=1000000;const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))},engine=createEngine(data,{storage,now:()=>time});return {engine,storage,values,now:()=>time,advance:ms=>time+=ms};}
function addFacility(e,typeId){const index=Object.keys(requirements).findIndex(id=>requirements[id][0]===typeId);e.state.buildings.push({id:`required-${typeId}`,typeId,x:index*3,z:0,level:1});}
for(const [id,[building,label]]of Object.entries(requirements)){
 test(`G5 ${id} requires its data-defined building in menu and engine`,()=>{
  const {engine:e}=fixture();assert.equal(data.config.minigames[id].requiresBuilding,building);
  const available=gameAvailability(e.state,data.config,id);assert.equal(available.ok,false);assert.equal(available.buildingId,building);assert.equal(strings[available.reason],label);assert.deepEqual(e.startMinigame(id),available);
  addFacility(e,building);assert.equal(gameAvailability(e.state,data.config,id).ok,true);
  let ctx;e.registry.minigames.set(id,{...e.registry.minigames.get(id),start:c=>{ctx=c;return {dispose(){}};}});const before=e.exportJSON(),run=e.startMinigame(id);assert.equal(run.ok,true);assert.ok(ctx);run.cancel();assert.equal(e.exportJSON(),before);
 });
 test(`G5 ${id} locked action closes menu and opens its exact catalog building`,()=>{
  const {engine}=fixture(),calls=[],ui={closeModal:()=>calls.push('close'),openBuildingCatalog:id=>calls.push(id)};
  const subject={engine,data,ui,availability:id=>gameAvailability(engine.state,data.config,id)};
  assert.equal(ActivityInterface.prototype.requireBuilding.call(subject,id),true);assert.deepEqual(calls,['close',building]);addFacility(engine,building);calls.length=0;assert.equal(ActivityInterface.prototype.requireBuilding.call(subject,id),false);assert.deepEqual(calls,[]);
 });
}
test('G5 new games buildings are regular code visuals, affordable, unique at every stage; harbor retains its ID and shore rule',()=>{
 const {engine}=fixture();for(const id of ['harbor','airbase']){const b=engine.registry.buildings.get(id);assert.ok(b.cost>0&&b.cost<data.config.startingMoney/4);assert.ok(b.footprint.every(n=>Number.isInteger(n)&&n>0));assert.equal(b.limit.kind,'unique');assert.deepEqual(b.limit.maxCount,[1,1,1]);assert.equal(b.model,null);assert.ok(strings[b.title]);}
 assert.equal(engine.registry.buildings.get('harbor').requiresShore,true);assert.equal(engine.validatePlacement('harbor',4,8).reason,'reason.shore');assert.equal(engine.place('road',0,7).ok,true);const port=engine.place('harbor',0,8);assert.equal(port.ok,true);assert.equal(engine.place('harbor',0,10).reason,'reason.limit.harbor');
});
test('G5 every new city has one central, movable, permanent city hall before the unchanged tutorial steps',()=>{
 const {engine:e}=fixture(),h=e.state.buildings.find(b=>b.typeId==='cityHall');assert.equal(CURRENT_VERSION,12);assert.equal(STORAGE_KEY,'island.v1');assert.equal(e.state.version,12);assert.equal(e.state.buildings.filter(b=>b.typeId==='cityHall').length,1);assert.ok(Math.hypot(h.x+.5-8,h.z+.5-8)<=1);
 assert.equal(validateSave(e.state,data,e.registry).ok,true);assert.equal(e.remove(h.id).reason,'reason.cityHallPermanent');assert.equal(e.place('cityHall',1,1).reason,'reason.limit.cityHall');assert.equal(e.move(h.id,0,0).ok,true);assert.equal(e.undo().ok,true);assert.deepEqual(e.state.buildings.find(b=>b.id===h.id),h);
 assert.deepEqual(data.tutorial.steps.map(s=>s.id),['house','road','fireStation','park','soccer']);assert.equal(strings['tutorial.cityHall'],'זו העירייה שלך');
});
test('G5 authentic a61f155 v8 fixture migrates to v9 without input mutation or loss, then reloads and imports',()=>{
 const f=fixture(),before=structuredClone(legacy),r=migrateSave(legacy,data,f.engine.registry);assert.equal(legacy.version,8);assert.equal(legacy.money,321);assert.ok(legacy.buildings.some(b=>b.typeId==='soccer'));assert.equal(r.ok,true);assert.equal(r.migrated,true);assert.equal(r.state.version,12);assert.deepEqual(legacy,before);
 for(const key of Object.keys(legacy).filter(k=>!['version','buildings'].includes(k)))assert.deepEqual(r.state[key],key==='players'?[...legacy.players,...data.players.filter(p=>!legacy.players.some(old=>old.id===p.id))]:key==='team'?{...legacy.team,sportWins:{soccer:legacy.team.wins,tennis:0}}:key==='minigameEquipment'?{...legacy[key],tennis:{speed:0,hit:0,serve:0}}:key==='minigameProgress'?{...legacy[key],tennis:{stage:1,stars:Array(10).fill(0)}}:key==='minigameLevels'?{...legacy[key],tennis:1}:legacy[key],key);
 assert.deepEqual(r.state.buildings.filter(b=>b.typeId!=='cityHall'),legacy.buildings);assert.equal(r.state.buildings.length,legacy.buildings.length+1);assert.equal(validateSave(r.state,data,f.engine.registry).ok,true);
 const direct=migrations[8](legacy,data);assert.deepEqual(legacy,before);assert.deepEqual(migrations[11](migrations[10](migrations[9](direct,data),data),data),r.state);
 f.storage.setItem(STORAGE_KEY,JSON.stringify(legacy));const loaded=createEngine(data,{storage:f.storage});assert.equal(loaded.storageStatus.ok,true);assert.equal(loaded.state.money,321);assert.equal(loaded.state.minigameEquipment.navalDuel.damage,2);assert.equal(loaded.importJSON(legacy).ok,true);assert.equal(loaded.state.buildings.filter(b=>b.typeId==='cityHall').length,1);assert.deepEqual([...f.values.keys()],[STORAGE_KEY]);
});
test('G5 a packed center chooses the closest free cell, never overwrites buildings and avoids a colliding city-hall ID',()=>{
 const {engine}=fixture(),old=structuredClone(legacy),occupied=new Set(old.buildings.flatMap(b=>cellsFor(engine.registry.buildings.get(b.typeId),b.x,b.z).map(c=>c.join(','))));
 for(let z=4;z<12;z++)for(let x=4;x<12;x++)if(!occupied.has(`${x},${z}`)){old.buildings.push({id:`fill-${x}-${z}`,typeId:'road',x,z,level:1});occupied.add(`${x},${z}`);}
 old.buildings.push({id:'city-hall',typeId:'road',x:0,z:0,level:1});occupied.add('0,0');const before=structuredClone(old),r=migrateSave(old,data,engine.registry);assert.equal(r.ok,true);assert.deepEqual(old,before);assert.deepEqual(r.state.buildings.slice(0,-1),old.buildings);
 const hall=r.state.buildings.at(-1);assert.equal(hall.typeId,'cityHall');assert.notEqual(hall.id,'city-hall');assert.equal(occupied.has(`${hall.x},${hall.z}`),false);
 const distance=Math.hypot(hall.x+.5-8,hall.z+.5-8);for(let z=0;z<16;z++)for(let x=0;x<16;x++)if(!occupied.has(`${x},${z}`))assert.ok(Math.hypot(x+.5-8,z+.5-8)>=distance);
});
test('G5 invalid zero/two city halls are rejected; additive import retains the current hall even if IDs and positions differ',()=>{
 const {engine:e}=fixture(),hall=e.state.buildings.find(b=>b.typeId==='cityHall');for(const count of [0,2]){const state=structuredClone(e.state);if(!count)state.buildings=state.buildings.filter(b=>b.typeId!=='cityHall');else state.buildings.push({...hall,id:'second-hall',x:0,z:0});assert.equal(validateSave(state,data,e.registry).ok,false);}
 const incoming=structuredClone(e.state),other=incoming.buildings.find(b=>b.typeId==='cityHall');Object.assign(other,{id:'imported-hall',x:0,z:0});const before=structuredClone(hall);assert.equal(e.importJSON(incoming).ok,true);assert.deepEqual(e.state.buildings.filter(b=>b.typeId==='cityHall'),[before]);
});
test('G5 migration respects registered extension footprints and bounds its search for malformed world sizes',()=>{
 const {engine:e}=fixture();e.registerBuilding({id:'existingExtension',footprint:[2,2],levels:[{cost:0}],cost:0,limit:{kind:'free'}});
 const old=structuredClone(legacy);old.buildings.push({id:'old-extension',typeId:'existingExtension',x:0,z:0,level:1});assert.equal(migrateSave(old,data,e.registry).ok,true);
 for(const size of [-1,0,1.5,Number.MAX_SAFE_INTEGER])assert.equal(migrateSave({...old,world:{stage:0,size}},data,e.registry).ok,false);
 for(const row of [null,{id:'invalid-row',typeId:'road',x:'7',z:3,level:1},{id:'huge-coordinate',typeId:'soccer',x:2**53,z:0,level:1}])assert.equal(migrateSave({...old,buildings:[...old.buildings,row]},data,e.registry).ok,false);
});
test('G5 a completely occupied legacy island fails validation without mutating or overwriting the original save',()=>{
 const f=fixture(),old=structuredClone(legacy);old.buildings=Array.from({length:256},(_,i)=>({id:`road-${i}`,typeId:'road',x:i%16,z:Math.floor(i/16),level:1}));const raw=JSON.stringify(old);f.storage.setItem(STORAGE_KEY,raw);const loaded=createEngine(data,{storage:f.storage,now:()=>42});assert.equal(loaded.storageStatus.ok,false);assert.equal(loaded.save().ok,false);assert.equal(f.storage.getItem(STORAGE_KEY),raw);assert.equal(f.storage.getItem('island.v1.corrupt.42'),raw);
});
test('G5 a 3x2 soccer pitch moves to another legal site without unique/cost/road regressions and preserves level',()=>{
 const {engine:e}=fixture(),pitch=e.place('soccer',4,8);assert.equal(pitch.ok,true);assert.deepEqual(e.registry.buildings.get('soccer').footprint,[3,2]);assert.equal(e.upgrade(pitch.id).ok,true);const money=e.state.money;
 assert.equal(e.validatePlacement('soccer',8,8).reason,'reason.limit.soccer');assert.equal(e.validatePlacement('soccer',8,8,pitch.id).ok,true);assert.equal(e.move(pitch.id,8,8).ok,true);assert.equal(e.state.money,money);assert.deepEqual(e.state.buildings.find(b=>b.id===pitch.id),{id:pitch.id,typeId:'soccer',x:8,z:8,level:2});
 const before=e.exportJSON();assert.equal(e.move(pitch.id,14,8).reason,'reason.bounds');assert.equal(e.move(pitch.id,8,12).reason,'reason.road');assert.equal(e.exportJSON(),before);assert.equal(e.undo().ok,true);assert.equal(e.state.buildings.find(b=>b.id===pitch.id).x,4);
});
test('G5 no alternative pitch site is detected and the message names its actual footprint and road access',()=>{
 const {engine:e}=fixture(),r=e.place('soccer',4,8),pitch=e.state.buildings.find(b=>b.id===r.id),occupied=new Set(e.state.buildings.flatMap(b=>cellsFor(e.registry.buildings.get(b.typeId),b.x,b.z).map(c=>c.join(','))));
 for(let z=0;z<16;z++)for(let x=0;x<16;x++)if(!occupied.has(`${x},${z}`))e.state.buildings.push({id:`full-${x}-${z}`,typeId:'road',x,z,level:1});
 assert.equal(IslandInterface.prototype.findMoveCell.call({engine:e},'soccer',pitch),null);assert.match(strings['app.noMoveSpace'],/מקום פנוי.*{width}×{depth}.*כביש/);
});
for(const [type,id]of Object.entries({fire:'fireRescue',ship:'navalDuel',aliens:'alienDefense'}))test(`G5 ${type} events cannot auto-launch or choose play without their required building; self-handling remains available`,()=>{
 const f=fixture(),e=f.engine;e.setAvatar({created:true});e.skipTutorial();e.grantParts(data.world.partGroup,5);const home=e.place('house',4,5);for(const facility of ['fireStation','airbase','harbor'])addFacility(e,facility);
 const launches=[],a=createActivity(e,{now:f.now,random:()=>0,onLaunch:c=>launches.push(c)});assert.equal(a.prepare(type).ok,true);e.state.events.active.targetId=type==='ship'?null:home.id;
 const building=data.config.minigames[id].requiresBuilding;e.state.buildings=e.state.buildings.filter(b=>b.typeId!==building);f.advance(data.config.events.warningMs);a.tick();assert.equal(launches.length,0);assert.equal(e.state.events.active.phase,'ready');const before=structuredClone(e.state);assert.deepEqual(a.choose('play'),gameAvailability(e.state,data.config,id));assert.deepEqual(e.state,before);assert.equal(a.choose('auto').ok,true);assert.equal(e.state.events.active,null);a.dispose();
});
for(const [width,height]of [[390,844],[360,740],[1440,1000],[844,390]])test(`G5 viewport ${width}x${height} fits all fixed model coordinates and translates input without cropping`,()=>{
 for(const [mw,mh]of [[360,480],[360,320]]){const fit=fitGameViewport(width,height,mw,mh);assert.ok(fit.offsetX>=0&&fit.offsetY>=0);assert.ok(fit.offsetX+mw*fit.scale<=width+.00001);assert.ok(fit.offsetY+mh*fit.scale<=height+.00001);assert.ok(Math.abs(fit.width/fit.height-width/height)<1e-10);for(const [x,y]of [[0,0],[mw,mh],[mw/2,mh/2]]){const sx=x*fit.scale+fit.offsetX,sy=y*fit.scale+fit.offsetY;assert.ok(Math.abs((sx-fit.offsetX)/fit.scale-x)<1e-10);assert.ok(Math.abs((sy-fit.offsetY)/fit.scale-y)<1e-10);}}
});
function historyTarget(){
 const listeners=new Set(),entries=[{previousPage:true},null],pending=[];let index=1;
 const target={history:{get state(){return entries[index];},get length(){return entries.length;},replaceState(s){entries[index]=s;},pushState(s){entries.splice(index+1);entries.push(s);index++;},go(delta){const next=index+delta;if(next>=0&&next<entries.length)pending.push(next);}},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn),flush(){let steps=0;while(pending.length){assert.ok(++steps<20,'history loop');index=pending.shift();for(const fn of listeners)fn({state:entries[index]});}},get index(){return index;}};
 return target;
}
test('G5 repeated game back/stay and entry/exit reuse two history slots without accumulating entries',()=>{
 const target=historyTarget();let backs=0;const nav=new GameNavigation({target,onGameBack:()=>backs++});for(let round=0;round<20;round++){nav.menu();nav.menu();nav.game();assert.equal(target.history.length,4);for(let n=0;n<3;n++){target.history.go(-1);target.flush();assert.equal(nav.depth,2);assert.equal(target.history.length,4);}nav.leave();target.flush();assert.equal(nav.depth,0);assert.equal(target.index,1);}assert.equal(backs,60);nav.dispose();
});
test('G5 menu Back returns to map and map Back reaches the browser previous page normally',()=>{
 const target=historyTarget();let menuBack=0;const nav=new GameNavigation({target,onMenuBack:()=>menuBack++});nav.menu();target.history.go(-1);target.flush();assert.equal(menuBack,1);assert.equal(nav.desired,0);target.history.go(-1);target.flush();assert.equal(target.index,0);assert.deepEqual(target.history.state,{previousPage:true});nav.dispose();
});
test('G5 rapid close/reopen and reload with a stale game guard settle correctly without duplicate history',()=>{
 const target=historyTarget();let nav=new GameNavigation({target});nav.game();nav.menu();nav.leave();nav.menu();target.flush();assert.equal(nav.depth,1);assert.equal(nav.desired,1);nav.game();nav.dispose();nav=new GameNavigation({target});target.flush();assert.equal(nav.depth,0);assert.equal(target.index,1);assert.equal(target.history.length,4);nav.dispose();
});
test('G5 release and shell modules import from the island with one synchronized version',async()=>{
 assert.equal(DATA_VERSION,'g7-20261018-1');for(const path of ['ui/game-shell.mjs','ui/activity.mjs','minigames/canvas-session.mjs','minigames/soccer-session.mjs','activity/availability.mjs','engine/city-hall.mjs']){const source=await readFile(new URL(path,root),'utf8');for(const version of source.matchAll(/\?v=([\w-]+)/g))assert.equal(version[1],DATA_VERSION,path);assert.doesNotMatch(source,/https?:\/\//);}
});
test('G5 paused audio stays silent through global pointer unlocks and mute changes, then resumes only when requested',()=>{
 let audio,created=0,resumes=0,starts=0;const gains=[],param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}}),node=()=>({gain:param(),frequency:param(),connect(){},disconnect(){},start(){starts++;},stop(){}});
 class Audio {constructor(){audio=this;created++;this.state='running';this.currentTime=1;this.sampleRate=100;}createGain(){const value=node();gains.push(value);return value;}createBuffer(){return {getChannelData:()=>new Float32Array(40)};}createOscillator(){return node();}suspend(){this.state='suspended';return Promise.resolve();}resume(){resumes++;this.state='running';return Promise.resolve();}close(){return Promise.resolve();}}
 const sound=createSound({AudioContext:Audio});sound.setPaused(true);sound.unlock();assert.equal(created,0);sound.setPaused(false);sound.unlock();sound.play('shot');assert.equal(starts,1);sound.setPaused(true);assert.equal(audio.state,'suspended');assert.equal(gains[0].gain.value,0);
 sound.unlock();sound.setMuted(true);sound.setMuted(false);sound.play('hit');assert.equal(starts,1);assert.equal(resumes,0);assert.equal(gains[0].gain.value,0);sound.setPaused(false);sound.unlock();sound.play('hit');assert.equal(resumes,1);assert.equal(starts,2);sound.dispose();
});
