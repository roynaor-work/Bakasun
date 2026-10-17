import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {nearestPlacement,shoreDirection} from '../workout/island/engine/placement-help.mjs';
import {cityPaths} from '../workout/island/engine/paths.mjs';
import {createActionGesture,controlSides} from '../workout/island/minigames/controls.mjs';
import {gamePresentation} from '../workout/island/ui/game-shell.mjs';
import {migrateSave} from '../workout/island/engine/persistence.mjs';
import {installPressFeedback} from '../workout/island/ui/press.mjs';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
function engine(){const e=createEngine(data,{storage:null,now:()=>1000});e.state.money=100000;e.skipTutorial();return e;}
function pressHarness(){
 let time=0;const listeners=new Map();
 const target={addEventListener(type,fn,{signal}){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);signal.addEventListener('abort',()=>list.splice(list.indexOf(fn),1));}};
 const dispatch=(type,node,props={})=>{const event={target:node,pointerId:7,button:0,isTrusted:true,detail:1,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...props};for(const fn of listeners.get(type)||[]){fn(event);if(event.stopped)break;}if(!event.stopped)node['on'+type]?.(event);return event;};
 const button=(action,onclick)=>{const node={dataset:{action},onclick,closest:s=>s==='button'?node:null,matches:()=>false,click:()=>dispatch('click',node,{isTrusted:false,detail:0,pointerId:-1})};return node;};
 const stop=installPressFeedback({target,compatibilityClickMs:data.config.ui.compatibilityClickMs,now:()=>time,scheduleFrame:fn=>fn()});
 return {dispatch,button,stop,at:ms=>{time=ms;}};
}
for(const release of ['pointerup','pointercancel'])for(const detail of [0,1])test(`G7 one touch cannot activate a newly opened card after ${release}, click detail ${detail}`,()=>{
 const h=pressHarness();let open=false,selected=null,calls=0;const card=h.button('select-building',()=>{calls++;selected='fireStation';}),opener=h.button('toggle-build',()=>{open=true;});
 h.dispatch('pointerdown',opener,{clientX:100,clientY:100});assert.equal(open,true,'panel opens immediately before release');assert.equal(selected,null);
 h.dispatch(release,card);h.at(20);h.dispatch('click',card,{pointerId:99,detail,clientX:100,clientY:100});
 h.at(399);h.dispatch('click',card,{pointerId:undefined,detail});assert.equal(calls,0,'even repeated compatibility clicks cannot reach catalog onclick');assert.equal(selected,null);
 h.at(401);h.dispatch('click',card,{pointerId:101,detail});assert.equal(calls,1,'a later click reaches the new button');h.at(410);h.dispatch('pointerdown',card);assert.equal(calls,2);h.dispatch('pointerup',card);h.dispatch('click',card,{pointerId:102});assert.equal(calls,2);h.stop();
});
test('G7 retargeted releases and long holds are guarded while new touches and keyboard remain independent',()=>{
 const h=pressHarness();let count=0,ups=0;const a=h.button('open',()=>count++),b=h.button('new',()=>count++);b.onpointerup=()=>ups++;
 h.dispatch('pointerdown',a);h.dispatch('pointerup',b);assert.equal(ups,0);h.at(30);h.dispatch('pointerdown',b,{pointerId:8});assert.equal(count,2);h.dispatch('pointerup',b,{pointerId:8});
 h.at(40);h.dispatch('keydown',b,{key:'Enter'});h.dispatch('click',b,{detail:0,pointerId:-1});assert.equal(count,3,'a fresh keyboard gesture remains accessible inside the window');h.at(50);h.dispatch('click',b,{detail:0});assert.equal(count,3,'keyboard intent cannot authorize a later touch click');
 h.dispatch('click',{closest:()=>null,onclick:()=>count++},{detail:0});assert.equal(count,3,'a non-button click is not mistaken for keyboard intent');
 h.at(431);h.dispatch('click',b,{detail:0,pointerId:-1});assert.equal(count,4);
 h.at(500);h.dispatch('pointerdown',a);assert.equal(count,5);h.at(1001);h.dispatch('pointerup',b);h.dispatch('click',b,{pointerId:99});assert.equal(count,5,'holding beyond 400ms cannot leak the release click');
 h.at(1402);h.dispatch('click',b);assert.equal(count,6);h.stop();h.dispatch('click',b);assert.equal(count,7,'cleanup removes the guard');
});
test('G7 each of the five playable games declares landscape in the shared shell config',()=>{for(const id of ['soccer','tennis','navalDuel','fireRescue','alienDefense'])assert.equal(gamePresentation(data.config,id).orientation,'landscape');});
test('G7 action drag is independent of movement and short taps use automatic intent',()=>{
 const gesture=createActionGesture(data.config.minigames.soccer.controls);
 gesture.start('kick',100,100);assert.deepEqual(gesture.direction('kick',{x:-1,z:0}),{x:-1,z:0,height:0,manual:false});
 gesture.move('kick',100,10);assert.deepEqual(gesture.direction('kick',{x:1,z:0}),{x:0,z:-1,height:1,manual:true});
 gesture.start('pass',50,50);gesture.move('pass',140,50);assert.deepEqual(gesture.direction('pass'),{x:1,z:0,height:0,manual:true});
 assert.equal(gesture.direction('kick').z,-1,'a second action cannot overwrite kick aim');gesture.reset();assert.equal(gesture.direction('kick').manual,false);
});
test('G7 handedness swaps the two touch zones without changing world action intent',()=>{
 assert.deepEqual(controlSides(true),{movement:'left',actions:'right'});assert.deepEqual(controlSides(false),{movement:'right',actions:'left'});
 const g=createActionGesture(data.config.minigames.soccer.controls);g.start('pass',300,150);g.move('pass',330,150);assert.equal(g.direction('pass',null,-1).x,-1);
});
test('G7 nearest legal placement snaps occupied anchors and is deterministic without mutating the city',()=>{
 const e=engine(),before=structuredClone(e.state),point={x:e.state.buildings[0].x,z:e.state.buildings[0].z};
 const cell=nearestPlacement(e.state,e.registry,'soccer',point,undefined,data.featureFlags);assert.ok(cell);assert.ok(e.validatePlacement('soccer',cell.x,cell.z).ok);
 for(let z=0;z<e.state.world.size;z++)for(let x=0;x<e.state.world.size;x++)if(e.validatePlacement('soccer',x,z).ok)assert.ok((cell.x-point.x)**2+(cell.z-point.z)**2<=(x-point.x)**2+(z-point.z)**2);
 assert.deepEqual(e.state,before);assert.deepEqual(nearestPlacement(e.state,e.registry,'soccer',point,undefined,data.featureFlags),cell);
});
for(const type of data.buildings.filter(b=>!b.locked&&!b.featureFlag))test(`G7 placement help finds an allowed anchor for ${type.id}`,()=>{
 const e=engine(),ignoreId=type.id==='cityHall'?e.state.buildings.find(b=>b.typeId==='cityHall').id:undefined,cell=nearestPlacement(e.state,e.registry,type.id,{x:8,z:8},ignoreId,data.featureFlags);assert.ok(cell,type.id);assert.ok(e.validatePlacement(type.id,cell.x,cell.z,ignoreId).ok,type.id);
});
test('G7 harbor help stays on shore and reports the outward direction; inland is rejected',()=>{
 const e=engine(),cell=nearestPlacement(e.state,e.registry,'harbor',{x:8,z:8},undefined,data.featureFlags),type=e.registry.buildings.get('harbor');
 assert.ok(shoreDirection(e.state,type,cell.x,cell.z));assert.equal(shoreDirection(e.state,type,8,8),null);assert.equal(e.validatePlacement('harbor',8,8).reason,'reason.shore');
});
test('G7 no lawful anchor is invented when money or an occupied island blocks placement',()=>{
 const e=engine();e.state.money=0;assert.equal(nearestPlacement(e.state,e.registry,'soccer',{x:8,z:8},undefined,data.featureFlags),null);
 e.state.money=100000;for(let z=0;z<16;z++)for(let x=0;x<16;x++)if(e.validatePlacement('road',x,z).ok)e.place('road',x,z);
 assert.equal(nearestPlacement(e.state,e.registry,'soccer',{x:8,z:8},undefined,data.featureFlags),null);
});
test('G7 authentic v12 expansion port is repaired to the nearest free shore on load, retaining identity and money',async()=>{
 const old=JSON.parse(await readFile(new URL('./fixtures/save-v12-expanded-harbor.json',import.meta.url),'utf8')),e=engine(),port=old.buildings.find(b=>b.typeId==='harbor'),before=structuredClone(old);
 assert.equal(shoreDirection(old,e.registry.buildings.get('harbor'),port.x,port.z),null);
 const r=migrateSave(old,data,e.registry);assert.ok(r.ok);assert.deepEqual(old,before);assert.deepEqual(r.repairedHarbors,[port.id]);assert.equal(r.state.version,15);assert.equal(r.state.money,old.money);
 const moved=r.state.buildings.find(b=>b.id===port.id);assert.ok(shoreDirection(r.state,e.registry.buildings.get('harbor'),moved.x,moved.z));assert.ok(e.registry.buildings.has('road'));
 const loaded=createEngine(data,{storage:{getItem:()=>JSON.stringify(old),setItem(){}},now:()=>1000000});assert.ok(loaded.validatePlacement('harbor',moved.x,moved.z,moved.id).ok);assert.deepEqual(migrateSave(r.state,data,e.registry).repairedHarbors,[]);
});
test('G7 automatic paths connect every building to the road/plaza and walkers have only adjacent edges',()=>{
 const e=engine();for(const type of ['house','soccer','tennis','fireStation']){const p=nearestPlacement(e.state,e.registry,type,{x:8,z:8},undefined,data.featureFlags);assert.ok(e.place(type,p.x,p.z).ok);}
 const before=structuredClone(e.state),paths=cityPaths(e.state,e.registry);assert.equal(paths.routes.length,e.state.buildings.length);assert.ok(paths.routes.every(r=>r.connected));
 for(const p of paths.cells)for(const index of p.neighbors){const n=paths.cells[index];assert.equal(Math.abs(p.x-n.x)+Math.abs(p.z-n.z),1);}
 assert.deepEqual(e.state,before);
});
