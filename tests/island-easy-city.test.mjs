import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {validReadyPlan} from '../workout/island/engine/ready-plots.mjs';
import {cellsFor,isAdjacent,placementAvailability} from '../workout/island/engine/rules.mjs';
import {validateSave} from '../workout/island/engine/persistence.mjs';
import {walkingRoute,cityCenter,navigationActive} from '../workout/island/view/city-navigation.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';
import {IslandView} from '../workout/island/view/island-view.mjs';
import {createBuilding,disposeBuilding} from '../workout/island/view/buildings.mjs';
import {achievementRows} from '../workout/island/ui/city-access.mjs';
import {IslandInterface} from '../workout/island/ui/interface.mjs';

const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const fixture=()=>createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1e6});

test('a new prepared town uses compact connected streets instead of an island-wide lattice',()=>{
  const e=fixture();e.enableReadyBuilding();const roads=e.state.buildings.filter(b=>b.typeId==='road'),lots=e.state.readyPlan.lots,hall=e.state.buildings.find(b=>b.typeId==='cityHall');
  assert.ok(roads.length<120,roads.length+' roads');assert.equal(lots.length,37);assert.equal(validReadyPlan(e.state.readyPlan,e.state,e.registry),true);
  for(const lot of lots){const type=e.registry.buildings.get(lot.typeId);if(type.requiresRoad)assert.ok(roads.some(r=>isAdjacent(lot,r,e.registry)),lot.id);}
  for(const lot of lots.filter(p=>p.typeId==='house'))assert.ok(Math.hypot(lot.x-hall.x,lot.z-hall.z)<7);
  assert.ok(Math.max(...roads.map(r=>r.x))<25);assert.ok(Math.max(...roads.map(r=>r.z))<25);
  const grid=roads.filter(r=>r.x%5===0||r.z%5===0);assert.ok(grid.length/roads.length<.7);
  const before=e.exportJSON();e.enableReadyBuilding();assert.equal(e.exportJSON(),before);assert.equal(validateSave(e.state,data,e.registry).ok,true);
});

test('legacy grid cities retain every earned building, road, reserved coordinate and progression',()=>{
  const e=fixture();e.skipTutorial();e.state.world.size=32;e.state.readyPlan={version:1,lots:[{id:'old-home',typeId:'house',x:8,z:8}]};e.state.buildings.push({id:'earned-home',typeId:'house',x:8,z:8,level:2});
  const used=new Set(e.state.buildings.flatMap(b=>cellsFor(e.registry.buildings.get(b.typeId),b.x,b.z).map(p=>p.join(','))));
  for(let z=0;z<32;z++)for(let x=0;x<32;x++)if((x%5===0||z%5===0)&&!used.has(`${x},${z}`))e.state.buildings.push({id:`ready-road-${x}-${z}`,typeId:'road',x,z,level:1});
  const old=structuredClone(e.state);e.enableReadyBuilding();for(const b of old.buildings)assert.deepEqual(e.state.buildings.find(n=>n.id===b.id),b);assert.deepEqual(e.state.readyPlan.lots.find(p=>p.id==='old-home'),old.readyPlan.lots[0]);
  for(const key of ['money','resources','avatar','parts','minigameProgress','highScores','learning'])assert.deepEqual(e.state[key],old[key],key);assert.equal(validateSave(e.state,data,e.registry).ok,true);
});

test('the later airport reserves a real 7x4 plot without changing the original airbase or old reservations',()=>{
  const e=fixture();e.skipTutorial();e.enableReadyBuilding();const lots=structuredClone(e.state.readyPlan.lots);assert.equal(e.readyPlotForType('airport'),null);assert.equal(placementAvailability(e.state,e.registry,'airport').reason,'reason.futureDistrict');
  e.grantParts(data.world.partGroup,5);const airport=e.readyPlotForType('airport');assert.ok(airport);assert.deepEqual([airport.w,airport.d],[7,4]);assert.deepEqual(e.registry.buildings.get('airbase').footprint,[2,2]);
  for(const lot of lots)assert.deepEqual(e.state.readyPlan.lots.find(p=>p.id===lot.id),lot);e.state.money=1e5;assert.equal(e.buildReadyPlot(airport.id).ok,true);assert.equal(validateSave(e.state,data,e.registry).ok,true);
});

test('airport architecture fits its unequal footprint and owns a single architectural draw',()=>{
  const e=fixture(),type=e.registry.buildings.get('airport'),root=createBuilding(type),box=new T.Box3().setFromObject(root);let draws=0;root.traverse(n=>{if(n.isMesh)draws++;});
  assert.ok(box.min.x>=-3.5&&box.max.x<=3.5);assert.ok(box.min.z>=-2&&box.max.z<=2);assert.equal(draws,1);assert.equal(type.visual.fixedFacing,true);disposeBuilding(root);
});

test('walking destinations follow graph connections around an obstacle and reject disconnected jumps',()=>{
  const points=[{x:0,z:0,neighbors:[1]},{x:0,z:1,neighbors:[0,2]},{x:1,z:1,neighbors:[1,3]},{x:2,z:1,neighbors:[2,4]},{x:2,z:0,neighbors:[3]},{x:3,z:0,neighbors:[]}],before=structuredClone(points);
  const route=walkingRoute(points,{x:0,z:0},{x:2,z:0});assert.equal(route.length,5);assert.deepEqual(route.map(p=>[p.x,p.z]),[[0,0],[0,1],[1,1],[2,1],[2,0]]);assert.deepEqual(walkingRoute(points,{x:0,z:0},{x:3,z:0}),[]);assert.deepEqual(walkingRoute([],{x:0,z:0},{x:1,z:1}),[]);assert.deepEqual(points,before);
});

function cameraView(){const v=Object.create(IslandView.prototype);Object.assign(v,{size:32,angle:.69,elevation:.76,zoom:2,target:new T.Vector3(0,.4,0),camera:new T.OrthographicCamera(-16,16,9,-9,.1,180),ray:new T.Raycaster(),plane:new T.Plane(new T.Vector3(0,1,0),-.34),pointer:new T.Vector2(),hit:new T.Vector3(),canvas:{style:{},dataset:{},setPointerCapture(){},addEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720})},handlers:{},pointers:new Map(),onCell(){assert.fail('drag built something');},onHover(){}});v.resize=()=>{Object.assign(v.camera,{left:-25/v.zoom,right:25/v.zoom,top:14/v.zoom,bottom:-14/v.zoom});v.camera.updateProjectionMatrix();v.updateCamera();};v.resize();return v;}

test('single-finger dragging pans the map under the finger without rotating or placing',()=>{
  const v=cameraView(),before=v.groundAt(600,360),angle=v.angle;v.bindEvents();v.handlers.pointerdown({pointerId:1,clientX:600,clientY:360});v.handlers.pointermove({pointerId:1,clientX:680,clientY:390});v.handlers.pointerup({pointerId:1,clientX:680,clientY:390});assert.ok(v.groundAt(680,390).distanceTo(before)<1e-8);assert.equal(v.angle,angle);
});

test('camera keyboard input is bound to the map canvas and interrupted gestures cannot become taps',()=>{
  const v=cameraView();v.bindEvents();const before=v.target.clone();v.handlers.keydown({key:'ArrowRight',preventDefault(){}});assert.ok(v.target.distanceTo(before)>1);v.handlers.keydown({key:'+',preventDefault(){}});assert.equal(v.zoom,2.4);
  v.handlers.pointerdown({pointerId:1,clientX:600,clientY:360});v.handlers.pointercancel({pointerId:1});v.handlers.pointerup({pointerId:1,clientX:600,clientY:360});assert.equal(v.gestureMidpoint,null);assert.equal(v.pointers.size,0);
});

test('tour planning uses real sidewalks, leaves saves untouched and releases its route line on exit',()=>{
  const v=cameraView();Object.assign(v,{walkPoints:[{x:0,y:.5,z:0,neighbors:[1]},{x:1,y:.5,z:0,neighbors:[0]}],avatar:{holder:new T.Group(),speed:.2},scene:new T.Scene(),route:[]});v.setTour(true);assert.equal(v.touring,true);assert.ok(v.avatar.speed>.2);assert.equal(v.goWalk({x:1,z:0}),true);const line=v.tourPath;let geometry=0,material=0;line.geometry.addEventListener('dispose',()=>geometry++);line.material.addEventListener('dispose',()=>material++);assert.equal(v.route.length,2);v.setTour(false);v.clearTourPath();assert.equal(v.route.length,0);assert.equal(v.avatar.speed,.2);assert.equal(line.parent,null);assert.equal(geometry,1);assert.equal(material,1);
});

test('initial camera centers on occupied homes rather than vacant faraway road corridors',()=>{
  const e=fixture();e.enableReadyBuilding();const center=cityCenter(e.state.buildings,id=>e.registry.buildings.get(id),32);assert.ok(Math.hypot(center.x-7,center.z-8)<1);assert.equal(center.span,10);
});

test('the personal score table uses earned per-game results without comparing unrelated score units or fake rivals',()=>{
  const state={highScores:{soccer:50,fire:999},minigameWins:{soccer:2},minigameProgress:{soccer:{stage:3,stars:[3,2]},fire:{stage:2,stars:[1]}}},before=structuredClone(state),rows=achievementRows(state,[{id:'soccer',title:'Soccer'},{id:'fire',title:'Fire'}]);assert.deepEqual(rows,[{id:'soccer',title:'Soccer',level:3,stars:5,wins:2,best:50},{id:'fire',title:'Fire',level:2,stars:1,wins:0,best:999}]);assert.deepEqual(state,before);
});

test('smooth camera framing does not resize the WebGL drawing buffer on every animation step',()=>{
  const v=cameraView(),oldWindow=globalThis.window;let sizes=0,ratios=0;globalThis.window={devicePixelRatio:1};Object.assign(v,{renderer:{setSize(){sizes++;},setPixelRatio(){ratios++;}},data,quality:'high'});delete v.resize;
  try{v.resize();v.zoom=3;v.resize();v.zoom=3.1;v.resize();assert.equal(sizes,1);assert.equal(ratios,1);assert.ok(v.camera.top>0);}finally{globalThis.window=oldWindow;}
});

test('an emergency waits while touring, panning or flying the camera, then resumes normally',()=>{
  for(const busy of [{touring:true},{pointers:new Map([[1,{x:1,y:1}]])},{cameraFlight:{}}]){
    const e=fixture();e.skipTutorial();e.state.avatar.created=true;e.enableReadyBuilding();e.state.money=1e4;e.buildReadyPlot(e.readyPlotForType('house').id);e.buildReadyPlot(e.readyPlotForType('fireStation').id);
    const view={pointers:new Map()};let now=1e6,launched=0;const activity=createActivity(e,{now:()=>now,random:()=>0,blocked:()=>navigationActive(view),onLaunch:()=>launched++});
    assert.equal(activity.prepare('fire').ok,true);Object.assign(view,busy);now+=data.config.events.warningMs+1;activity.tick();assert.equal(launched,0);assert.equal(e.state.events.active.phase,'warning');Object.assign(view,{touring:false,pointers:new Map(),cameraFlight:null});activity.tick();assert.equal(launched,1);assert.equal(e.state.events.active.phase,'playing');activity.dispose();
  }
});

test('the future airport card explains its expansion requirement and does not claim an absent lot or reached limit',()=>{
  const e=fixture(),hint={},classes=new Set(),card={dataset:{building:'airport'},classList:{toggle(){},add:name=>classes.add(name)},setAttribute(){},querySelector:()=>hint},messages=[];
  const ui=Object.assign(Object.create(IslandInterface.prototype),{engine:e,catalog:{children:[card]},categories:{children:[]},getBuilding:id=>e.registry.buildings.get(id),tutorialStep:()=>null,t:id=>id,readyPlots:{active:true,chooseType(){assert.fail('no airport lot exists yet');}},toast:id=>messages.push(id)});
  ui.updateCatalogState();assert.equal(hint.textContent,'reason.futureDistrict');assert.equal(hint.hidden,false);assert.ok(classes.has('locked'));ui.selectBuilding('airport');assert.deepEqual(messages,['reason.futureDistrict']);
});
