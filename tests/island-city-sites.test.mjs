import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {citySites,cityBlueprint,streetFacing,streetFront,citySitesSignature} from '../workout/island/engine/city-sites.mjs';
import {CitySites} from '../workout/island/view/city-sites.mjs';
import {cityConnections} from '../workout/island/engine/city-connections.mjs';
import {cellsFor} from '../workout/island/engine/rules.mjs';
import {createBuilding,disposeBuilding} from '../workout/island/view/buildings.mjs';
import {CityStreets} from '../workout/island/view/city-streets.mjs';
import * as T from '../workout/island/vendor/three.module.js';
const root=new URL('../workout/island/',import.meta.url);
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const engine=()=>createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1000000});

test('the starting city has a deterministic, nonoverlapping plan on its real street without altering a save',()=>{
 const e=engine(),before=e.exportJSON(),plan=cityBlueprint(e.state,e.registry,data.featureFlags),used=new Set();assert.ok(plan.length>=4);assert.deepEqual(plan,cityBlueprint(e.state,e.registry,data.featureFlags));
 for(const site of plan){assert.ok(e.validatePlacement(site.typeId,site.x,site.z).ok);assert.ok(cityConnections(e.state,e.registry).hasAccess(site));for(const cell of cellsFor(e.registry.buildings.get(site.typeId),site.x,site.z)){const key=cell.join(',');assert.ok(!used.has(key));used.add(key);}}
 assert.equal(e.exportJSON(),before);
});

test('a plan remains available with zero money but actual construction still fails atomically',()=>{
 const e=engine();e.state.money=0;const before=e.exportJSON(),site=citySites(e.state,e.registry,'house')[0];assert.ok(site);assert.equal(e.place('house',site.x,site.z).reason,'reason.money');assert.equal(e.exportJSON(),before);
});

test('suggestions respect pending plans, limits, unlocks and connected roads rather than decorative paths',()=>{
 const e=engine(),site=citySites(e.state,e.registry,'house')[0];assert.ok(e.zone('residential',site.x,site.z).ok);
 const zoneKeys=new Set(cellsFor(e.registry.buildings.get('house'),site.x,site.z).map(cell=>cell.join(',')));
 for(const next of citySites(e.state,e.registry,'house'))assert.ok(cellsFor(e.registry.buildings.get('house'),next.x,next.z).every(cell=>!zoneKeys.has(cell.join(','))));
 assert.deepEqual(citySites(e.state,e.registry,'mathLab'),[]);assert.deepEqual(citySites(e.state,e.registry,'wall'),[]);
 e.state.buildings.push({id:'isolated-road',typeId:'road',x:0,z:0,level:1});
 for(const next of citySites(e.state,e.registry,'house'))assert.ok(cityConnections(e.state,e.registry).hasAccess(next));
 const cap=e.registry.buildings.get('house').limit.maxCount[0];for(let i=0;i<cap;i++)e.state.buildings.push({id:`cap-${i}`,typeId:'house',x:0,z:2+i*2,level:1});assert.deepEqual(citySites(e.state,e.registry,'house'),[]);
});

test('a confirmed recommended site uses standard cost and undo and preserves all unrelated earned fields',()=>{
 const e=engine();e.state.tutorial.skipped=true;e.state.completedMissions=data.missions.map(row=>row.id);const before=structuredClone(e.state),site=citySites(e.state,e.registry,'house')[0];const result=e.place('house',site.x,site.z);assert.ok(result.ok);assert.equal(e.state.money,before.money-e.registry.buildings.get('house').cost);
 for(const key of ['minigameProgress','minigameEquipment','learning','hangar','soccerRoster','parts'])assert.deepEqual(e.state[key],before[key]);
 assert.ok(e.undo().ok);assert.deepEqual(e.state.buildings,before.buildings);assert.equal(e.state.money,before.money);
});

test('industry recommendations prefer separation from homes within the same connected street network',()=>{
 const e=engine();e.state.world={size:24,stage:2};e.state.buildings=[];
 for(let x=1;x<23;x++)e.state.buildings.push({id:`r-${x}`,typeId:'road',x,z:8,level:1});
 e.state.buildings.push({id:'hall',typeId:'cityHall',x:12,z:9,level:1},{id:'home',typeId:'house',x:10,z:6,level:1});
 const site=citySites(e.state,e.registry,'factory',{limit:1})[0];assert.ok(Math.hypot(site.x-10,site.z-6)>6);
});

test('square buildings face each adjoining street while rectangular models retain their footprint axes',()=>{
 const e=engine(),def=id=>e.registry.buildings.get(id),home={typeId:'house',x:5,z:5};
 for(const [x,z,angle]of [[5,7,0],[5,4,Math.PI],[7,5,Math.PI/2],[4,5,-Math.PI/2]])assert.equal(streetFacing(home,def('house'),[{typeId:'road',x,z}],def),angle);
 const hospital={typeId:'hospital',x:5,z:5};assert.equal(streetFacing(hospital,def('hospital'),[{typeId:'road',x:8,z:5}],def),0);
 assert.equal(streetFront(hospital,def('hospital'),[{typeId:'road',x:8,z:5}],def).angle,Math.PI/2);
});

test('suggestion caches react to funding and completed repairs, and ignore money-only ticks',()=>{
 const e=engine(),first=citySitesSignature(e.state);e.state.money+=1;assert.equal(citySitesSignature(e.state),first);
 e.state.cityManagement.funding.water=50;assert.notEqual(citySitesSignature(e.state),first);
 const funded=citySitesSignature(e.state);e.state.events.repairs['provider']=e.state.updatedAt+10;assert.notEqual(citySitesSignature(e.state),funded);e.state.updatedAt+=10;assert.equal(citySitesSignature(e.state),funded);
});

test('numbered planning marks share one atlas and three draws, clear completely and release their resources',t=>{
 const previous=globalThis.document;t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const context={beginPath(){},arc(){},fill(){},stroke(){},fillText(){}};globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
 const e=engine(),scene=new T.Scene(),marks=new CitySites(scene,.34),plan=cityBlueprint(e.state,e.registry,data.featureFlags);marks.resize(390,844);marks.show(plan,16);
 assert.equal(scene.children.length,3);assert.equal(marks.fill.count,plan.length);assert.equal(marks.labelGeometry.drawRange.count,plan.length*6);assert.deepEqual(marks.labelMaterial.uniforms.viewport.value.toArray(),[390,844]);
 const camera=new T.OrthographicCamera(-12,12,12,-12,.1,100);camera.position.set(12,20,25);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const site=plan[0],p=new T.Vector3(site.x+(site.w-1)/2-7.5,.34+.48,site.z+(site.d-1)/2-7.5).project(camera),rect={left:10,top:20,width:390,height:844},x=rect.left+(p.x+1)*rect.width/2,y=rect.top+(1-p.y)*rect.height/2;
 assert.deepEqual(marks.pick(x,y,camera,rect),{x:site.x,z:site.z});assert.equal(marks.pick(-100,-100,camera,rect),null);
 marks.show([],16);assert.equal(marks.fill.count,0);assert.equal(marks.border.count,0);assert.equal(marks.labelGeometry.drawRange.count,0);
 let disposed=0;for(const resource of [marks.texture,marks.labelGeometry,marks.labelMaterial,marks.geometry,marks.fillMaterial,marks.borderMaterial])resource.addEventListener('dispose',()=>disposed++);marks.dispose();assert.equal(disposed,6);assert.equal(scene.children.length,0);
});

test('original apartment and fire-station assets retain their exact bytes and original maps',async()=>{
 const manifest=JSON.parse(await readFile(new URL('assets/models/manifest.json',root),'utf8'));
 for(const id of ['apartment-block','fire-station']){const path=`assets/models/${id}-512.glb`,bytes=await readFile(new URL(path,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest[path]);const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.ok(gltf.materials[0].pbrMetallicRoughness.baseColorTexture);}
 const e=engine();assert.equal(e.registry.buildings.get('house').levels[2].model.path,'assets/models/apartment-block-512.glb');assert.equal(e.registry.buildings.get('fireStation').model.path,'assets/models/fire-station-512.glb');
});

test('retained detailed architecture stays batched, finite and inside the original footprint',()=>{
 const e=engine();for(const [id,level]of [['house',2],['house',4],['school',1],['factory',3],['cityHall',1]]){
  const type=e.registry.buildings.get(id),group=createBuilding(type,level),meshes=[];group.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,1);
  const box=new T.Box3().setFromObject(group),size=box.getSize(new T.Vector3());assert.ok(Number.isFinite(size.y));assert.ok(size.x<=type.footprint[0]+.01);assert.ok(size.z<=type.footprint[1]+.06);disposeBuilding(group);
 }
});

test('street aprons and original palms use bounded batches and never mutate saved positions',()=>{
 const e=engine(),site=citySites(e.state,e.registry,'house')[0];e.place('house',site.x,site.z);const before=e.exportJSON(),scene=new T.Scene(),streets=new CityStreets(scene,.34,{create:()=>null});
 streets.rebuild(e.state.buildings,e.state.world.size,id=>e.registry.buildings.get(id));assert.ok(streets.metrics().entrances>0);assert.ok(streets.metrics().draws<=3);assert.equal(e.exportJSON(),before);streets.quality='low';streets.rebuild(e.state.buildings,e.state.world.size,id=>e.registry.buildings.get(id));assert.ok(streets.metrics().draws<=3);streets.dispose();assert.equal(scene.children.length,0);
});
