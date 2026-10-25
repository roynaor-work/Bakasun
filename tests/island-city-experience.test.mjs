import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {nearestCityZone,cityConnections} from '../workout/island/engine/city-management.mjs';
import {IslandInterface} from '../workout/island/ui/interface.mjs';
import {createTranslator} from '../workout/island/ui/translate.mjs';
import {planningFrame} from '../workout/island/view/planning-frame.mjs';
import {CityGrowth} from '../workout/island/view/city-growth.mjs';
import * as T from '../workout/island/vendor/three.module.js';
const data=await loadData(new URL('../workout/island/',import.meta.url),async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
const engine=()=>createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1000000});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ~= ${b}`);

test('planning helper prefers actual city road access even when money is zero',()=>{
 const e=engine();e.state.money=0;const before=e.exportJSON(),cell=nearestCityZone(e.state,e.registry,'residential',{x:0,z:0});assert.ok(cell);assert.ok(cityConnections(e.state,e.registry).hasAccess({typeId:'house',...cell}));assert.equal(e.exportJSON(),before);
});

test('planning helper skips already planned lots and returns null when there is no space',()=>{
 const e=engine(),first=nearestCityZone(e.state,e.registry,'residential');e.zone('residential',first.x,first.z);const next=nearestCityZone(e.state,e.registry,'residential',first);assert.ok(next);assert.ok(e.validateZone('residential',next.x,next.z).ok);assert.notDeepEqual(next,first);
 const full=structuredClone(e.state);full.buildings=Array.from({length:256},(_,i)=>({id:`fill-${i}`,typeId:'road',x:i%16,z:Math.floor(i/16),level:1}));assert.equal(nearestCityZone(full,e.registry,'residential'),null);assert.equal(nearestCityZone(e.state,e.registry,'invalid'),null);
});

test('the lightweight city HUD retains live demand and budgets without evaluating the planning queue',()=>{
 const e=engine();e.zone('residential',4,5);e.setCityPolicy({enabled:true});const before=e.exportJSON(),full=e.cityReport(),light=e.cityReport({includeZones:false});assert.deepEqual(light.zones,[]);for(const key of ['residents','jobs','budget','services','demand'])assert.deepEqual(light[key],full[key]);assert.equal(e.exportJSON(),before);
});

test('two real UI confirmations add two distinct free plans without leaving placement or reopening a dialog',()=>{
 const e=engine(),ui=Object.create(IslandInterface.prototype),type=e.registry.buildings.get('house');let focused=0,dialogs=0;
 Object.assign(ui,{engine:e,data,t:createTranslator(strings),view:{setGhost(){}},root:{dataset:{}},selected:'house',zoneKind:'residential',zoneSessionCount:0,currentGhost:{x:4,z:5},placeButton:{focus(){focused++;}},cancelButton:{setAttribute(){}},ghostStatus:{dataset:{}},cityManagement:{open(){dialogs++;}}});
 const before=structuredClone(e.state);ui.commitPlacement();ui.commitPlacement();assert.equal(e.state.cityManagement.zones.length,2);assert.equal(ui.zoneSessionCount,2);assert.equal(ui.zoneKind,'residential');assert.equal(ui.selected,'house');assert.equal(focused,2);assert.equal(dialogs,0);assert.equal(e.state.money,before.money);assert.deepEqual(e.state.buildings,before.buildings);assert.ok(ui.ghostStatus.textContent.includes('2 מגרשים נוספו'));assert.ok(e.validateZone('residential',ui.currentGhost.x,ui.currentGhost.z).ok);assert.equal(type.cost,80);
});

for(const [width,height,insets]of [[1280,720,{right:410}],[844,390,{right:356}],[390,844,{bottom:472}],[390,844,{bottom:94}]]){
 test(`planning camera centers the city in the free ${width}x${height} area and retains coordinate picking`,()=>{
  const f=planningFrame(width,height,24,1,insets),camera=new T.OrthographicCamera(f.left,f.right,f.top,f.bottom,.1,100),point=new T.Vector3(0,0,-1);camera.updateMatrixWorld();const clip=point.clone().project(camera);
  close((clip.x+1)*width/2,f.usable.left+f.usable.width/2);close((1-clip.y)*height/2,f.usable.top+f.usable.height/2);
  assert.ok(f.usable.width>0&&f.usable.height>0);const restored=clip.clone().unproject(camera);close(restored.x,point.x);close(restored.y,point.y);
 });
}

test('growth cues mark only new buildings, expire with active time and preserve all saved data',()=>{
 const e=engine();const home=e.place('house',4,5),record=e.state.buildings.find(row=>row.id===home.id),before=e.exportJSON(),scene=new T.Scene(),cues=new CityGrowth(scene,.34);
 cues.highlight([record],16,id=>e.registry.buildings.get(id));assert.equal(cues.mesh.count,1);const matrix=new T.Matrix4();cues.mesh.getMatrixAt(0,matrix);cues.update(.5);const moved=new T.Matrix4();cues.mesh.getMatrixAt(0,moved);assert.notDeepEqual(moved.elements,matrix.elements);assert.equal(e.exportJSON(),before);
 for(const value of [NaN,Infinity,-1])cues.update(value);assert.equal(cues.mesh.count,1);cues.update(2.5);assert.equal(cues.mesh.count,0);cues.dispose();assert.equal(scene.children.length,0);
});

test('reduced motion keeps growth marker scale still, caps bursts and disposes only its resources',()=>{
 const e=engine(),scene=new T.Scene(),cues=new CityGrowth(scene,.34,{reducedMotion:true}),rows=Array.from({length:12},(_,i)=>({id:`home-${i}`,typeId:'house',x:i,z:5,level:1}));cues.highlight(rows,16,id=>e.registry.buildings.get(id));assert.equal(cues.mesh.count,8);
 const before=new T.Matrix4(),after=new T.Matrix4();cues.mesh.getMatrixAt(0,before);cues.update(.8);cues.mesh.getMatrixAt(0,after);assert.deepEqual(after.elements,before.elements);
 let geometry=0,material=0;cues.geometry.addEventListener('dispose',()=>geometry++);cues.material.addEventListener('dispose',()=>material++);cues.dispose();assert.equal(geometry,1);assert.equal(material,1);
});
