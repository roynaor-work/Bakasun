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
test('G7 an ordinary tap activates on release once; a compatibility click cannot enter the next screen',()=>{
 const h=pressHarness();let open=0,entered=0;const opener=h.button('open-games',()=>open++),card=h.button('game-enter',()=>entered++);
 h.dispatch('pointerdown',opener,{clientX:40,clientY:50});assert.equal(open,0);assert.equal(opener.dataset.pressed,'true');
 h.dispatch('pointerup',opener,{clientX:40,clientY:50});assert.equal(open,1);assert.equal(opener.dataset.pressed,undefined);
 h.at(20);h.dispatch('click',card,{pointerId:99,detail:0});assert.equal(entered,0);
 h.at(30);h.dispatch('pointerdown',card,{pointerId:8,clientX:40,clientY:50});h.dispatch('pointerup',card,{pointerId:8,clientX:40,clientY:50});assert.equal(entered,1);h.stop();
});
for(const end of ['pointerup','pointercancel'])test('G7 scrolling from a button never opens a game: '+end,()=>{
 const h=pressHarness();let count=0;const node=h.button('game-enter',()=>count++);
 const down=h.dispatch('pointerdown',node,{clientX:80,clientY:100});assert.equal(down.defaultPrevented,undefined,'browser scrolling must remain available');
 h.dispatch('pointermove',node,{clientX:81,clientY:150});h.dispatch(end,node,{clientX:81,clientY:150});h.at(20);h.dispatch('click',node,{detail:0});assert.equal(count,0);assert.equal(node.dataset.pressed,undefined);h.stop();
});
test('G7 scrolling a container and retargeted releases both cancel activation',()=>{
 const h=pressHarness();let count=0;const a=h.button('game-enter',()=>count++),b=h.button('other',()=>count++),scroller={scrollHeight:1000,clientHeight:300,scrollTop:0,scrollLeft:0};a.parentElement=scroller;
 h.dispatch('pointerdown',a);scroller.scrollTop=30;h.dispatch('pointerup',a);h.dispatch('click',a);assert.equal(count,0);
 h.at(500);h.dispatch('pointerdown',a);h.dispatch('pointerup',b);h.dispatch('click',b);assert.equal(count,0);h.stop();
});
test('G7 keyboard and trusted fullscreen entry remain available after a cancelled drag',()=>{
 const h=pressHarness();let count=0;const normal=h.button('game-enter',()=>count++),native=h.button('stage-play',()=>count++);
 h.dispatch('pointerdown',normal);h.dispatch('pointercancel',normal);h.dispatch('keydown',normal,{key:'Enter'});h.dispatch('click',normal,{detail:0});assert.equal(count,1);
 h.at(30);h.dispatch('pointerdown',native);h.dispatch('pointerup',native);assert.equal(count,1,'fullscreen entry waits for the browser trusted click');h.dispatch('click',native);assert.equal(count,2);h.dispatch('click',normal);assert.equal(count,2);h.stop();h.dispatch('click',normal);assert.equal(count,3);
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
 const e=engine();const prerequisites=[];let prior=type.unlockAfter;while(prior){prerequisites.unshift(prior);prior=e.registry.buildings.get(prior).unlockAfter;}for(const id of prerequisites){const cell=nearestPlacement(e.state,e.registry,id,{x:8,z:8},undefined,data.featureFlags);assert.ok(e.place(id,cell.x,cell.z).ok);}
 const ignoreId=type.id==='cityHall'?e.state.buildings.find(b=>b.typeId==='cityHall').id:undefined,cell=nearestPlacement(e.state,e.registry,type.id,{x:8,z:8},ignoreId,data.featureFlags);assert.ok(cell,type.id);assert.ok(e.validatePlacement(type.id,cell.x,cell.z,ignoreId).ok,type.id);
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
 const r=migrateSave(old,data,e.registry);assert.ok(r.ok);assert.deepEqual(old,before);assert.deepEqual(r.repairedHarbors,[port.id]);assert.equal(r.state.version,16);assert.equal(r.state.money,old.money);
 const moved=r.state.buildings.find(b=>b.id===port.id);assert.ok(shoreDirection(r.state,e.registry.buildings.get('harbor'),moved.x,moved.z));assert.ok(e.registry.buildings.has('road'));
 const loaded=createEngine(data,{storage:{getItem:()=>JSON.stringify(old),setItem(){}},now:()=>1000000});assert.ok(loaded.validatePlacement('harbor',moved.x,moved.z,moved.id).ok);assert.deepEqual(migrateSave(r.state,data,e.registry).repairedHarbors,[]);
});
test('G7 automatic paths connect every building to the road/plaza and walkers have only adjacent edges',()=>{
 const e=engine();for(const type of ['house','soccer','tennis','fireStation']){const p=nearestPlacement(e.state,e.registry,type,{x:8,z:8},undefined,data.featureFlags);assert.ok(e.place(type,p.x,p.z).ok);}
 const before=structuredClone(e.state),paths=cityPaths(e.state,e.registry);assert.equal(paths.routes.length,e.state.buildings.length);assert.ok(paths.routes.every(r=>r.connected));
 for(const p of paths.cells)for(const index of p.neighbors){const n=paths.cells[index];assert.equal(Math.abs(p.x-n.x)+Math.abs(p.z-n.z),1);}
 assert.deepEqual(e.state,before);
});
