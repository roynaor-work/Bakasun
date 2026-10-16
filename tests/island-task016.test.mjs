import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {LocalModels} from '../workout/island/view/local-models.mjs';
import {createBuilding,disposeBuilding} from '../workout/island/view/buildings.mjs';
import {vesselHeading,createVessel} from '../workout/island/minigames/naval-view.mjs';
import {createFireScene} from '../workout/island/minigames/fire-view.mjs';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
const root=new URL('../workout/island/',import.meta.url),data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const config=data.config.minigames;
async function asset(path){
 const bytes=await readFile(new URL(path,root)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+length)),binary=bytes.subarray(28+length),primitive=json.meshes[0].primitives[0],a=json.accessors[primitive.attributes.POSITION],v=json.bufferViews[a.bufferView],geometry=new T.BufferGeometry(),array=new Float32Array(a.count*3);
 for(let i=0;i<array.length;i++)array[i]=binary.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+i*4);
 geometry.setAttribute('position',new T.BufferAttribute(array,3));const material=new T.MeshBasicMaterial(),object=new T.Group();object.add(new T.Mesh(geometry,material));return {object,json,faces:json.accessors[primitive.indices].count/3};
}
const loader={async loadAsync(url){return {scene:(await asset(new URL(url).pathname.slice(root.pathname.length))).object};}};
const bounds=object=>new T.Box3().setFromObject(object);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
test('TASK-016 all six bundled GLBs are one mesh/material with embedded resources',async()=>{
 const expected={'alien-d':5214,'enemy-gunboat':4950,hydrant:5090,'house-a':4508,hospital:4218,'shop-corner':4376};
 for(const [name,faces] of Object.entries(expected)){const a=await asset(`assets/models/${name}-512.glb`);assert.equal(a.json.meshes.length,1);assert.equal(a.json.materials.length,1);assert.equal(a.faces,faces);assert.ok(a.json.images.every(i=>i.bufferView!==undefined));assert.ok(a.json.buffers.every(b=>!b.uri));a.object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
});
test('TASK-016 city instances preserve centers, ground contact, individual size and shared resource ownership',async()=>{
 const models=new LocalModels({loader}),house=data.buildings.find(r=>r.id==='house'),hospital=data.buildings.find(r=>r.id==='hospital'),shop=data.buildings.find(r=>r.id==='shop'),specs=[house.levels[0].model,shop.model,hospital.model];
 await Promise.all(specs.map(s=>models.load(s)));let released=0;for(const object of models.assets.values())object.traverse(o=>o.geometry?.addEventListener('dispose',()=>released++));
 const sizes=[];for(const [record,level]of [[house,1],[shop,1],[hospital,1]]){const group=createBuilding(record,level,models),box=bounds(group),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());close(box.min.y,0);close(center.x,0);close(center.z,0);assert.ok(size.x<record.footprint[0]);assert.ok(size.z<record.footprint[1]);sizes.push(size);disposeBuilding(group);}
 assert.ok(sizes[0].x<sizes[1].x&&sizes[1].x<sizes[2].x);assert.ok(sizes[0].y<sizes[1].y&&sizes[1].y<sizes[2].y);assert.equal(released,0);
 const fallback=createBuilding(house,3,models);assert.equal(fallback.userData.modelPath,undefined);disposeBuilding(fallback);models.dispose();models.dispose();assert.equal(released,3);
});
test('TASK-016 hydrant fits the old 1.15-unit height upright at the same ground position without changing simulation',async()=>{
 const balance=config.fireRescue,model=createFireModel({config,balance,level:1,random:()=>.5}),before=model.snapshot(),world=createFireScene({config,balance},model,{loader});
 assert.equal(await world.loadHydrant(),true);const hydrant=world.scene.children.find(o=>o.userData.modelPath===balance.hydrant.path),box=bounds(hydrant),size=box.getSize(new T.Vector3());close(size.y,1.15);close(box.min.y,.1);close(box.getCenter(new T.Vector3()).x,7.3);close(box.getCenter(new T.Vector3()).z,10);assert.equal(hydrant.children[0].rotation.y,0);assert.deepEqual(model.snapshot(),before);world.dispose();
});
test('TASK-016 boats match hull length after rotation, and gunboat yaw follows both directions without reflection',async()=>{
 const models=new LocalModels({loader}),specs={player:config.navalDuel.playerModel,enemy:config.navalDuel.enemyModel,length:config.navalDuel.playerModel.length};await Promise.all([models.load(specs.player),models.load(specs.enemy)]);
 for(const spec of [specs.player,specs.enemy]){const root=models.create(spec,{length:specs.length});close(bounds(root).getSize(new T.Vector3()).z,specs.length);assert.equal(root.children[0].rotation.y,-Math.PI/2);const v={root};vesselHeading(v,0,0,0);vesselHeading(v,2,-3,1);const forward=new T.Vector3(0,0,-1).applyAxisAngle(new T.Vector3(0,1,0),root.rotation.y);close(forward.dot(new T.Vector3(2,0,-3).normalize()),1);vesselHeading(v,-2,3,2);const reverse=new T.Vector3(0,0,-1).applyAxisAngle(new T.Vector3(0,1,0),root.rotation.y);close(reverse.dot(new T.Vector3(-4,0,6).normalize()),1);assert.ok(root.scale.x>0&&root.children[0].scale.x>0);}
 models.dispose();
});
test('TASK-016 local model cache deduplicates requests, isolates failures and releases late loads once',async()=>{
 let calls=0,resolve,released=0;const object=(await asset('assets/models/hydrant-512.glb')).object;object.children[0].geometry.addEventListener('dispose',()=>released++);
 const models=new LocalModels({loader:{loadAsync(){calls++;return new Promise(r=>resolve=r);}}}),spec=config.fireRescue.hydrant;
 const first=models.load(spec),second=models.load(spec);assert.equal(calls,1);models.dispose();resolve({scene:object});assert.equal(await first,false);assert.equal(await second,false);assert.equal(released,1);models.dispose();assert.equal(released,1);
 const failed=new LocalModels({loader:{async loadAsync(){throw Error('missing GLB');}}});assert.equal(await failed.load(spec),false);assert.equal(failed.create(spec),null);assert.equal(await failed.load({path:'https://example.com/model.glb',rotationY:0,scale:1}),false);assert.deepEqual(failed.metrics(),{requested:1,loaded:0,failed:1});failed.dispose();
 const balance=config.fireRescue,model=createFireModel({config,balance,level:1,random:()=>.5}),world=createFireScene({config,balance},model,{loader:{async loadAsync(){throw Error('missing');}}});assert.equal(await world.loadHydrant(),false);assert.equal(world.hydrantMetrics().loaded,false);world.animate();assert.ok(world.metrics().triangles>0);world.dispose();
});

test('TASK-016 shop is a separate catalog type with existing placement, income, cap, save and undo rules',()=>{
 const engine=createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1000});engine.skipTutorial();
 const shop=engine.registry.buildings.get('shop'),beforeMoney=engine.state.money,beforeIncome=engine.income().money;
 assert.equal(shop.model.path,'assets/models/shop-corner-512.glb');assert.equal(data.buildings.find(r=>r.id==='house').levels[1].model,null);
 assert.equal(engine.place('shop',0,0).reason,'reason.road');const first=engine.place('shop',4,5);assert.equal(first.ok,true);assert.equal(engine.state.money,beforeMoney-120);assert.equal(engine.income().money,beforeIncome+6);assert.equal(engine.population(),0);
 assert.equal(engine.place('shop',7,5).ok,true);assert.equal(engine.place('shop',10,5).reason,'reason.limit.shop');assert.equal(engine.undo().ok,true);assert.equal(engine.validatePlacement('shop',10,5).ok,true);
 const saved=engine.exportJSON(),reloaded=createEngine(data,{storage:{getItem:()=>saved,setItem(){}},now:()=>1000});assert.ok(reloaded.state.buildings.some(b=>b.id===first.id&&b.typeId==='shop'));assert.equal(reloaded.population(),0);
});

test('TASK-016 enemy uses the patrol loading, waterline, articulation and disposal path at each vessel scale',async()=>{
 const balance=config.navalDuel,r=balance.render;
 for(const scale of [1,1.1,1.32]){const spec={...balance.enemyModel,length:balance.playerModel.length*r.playerScale/scale},v=createVessel(T,r,{}, {},spec,{loader});v.root.scale.setScalar(scale);await v.ready;assert.equal(v.modelStatus.loaded,true);close(v.modelLength,balance.playerModel.length*r.playerScale);assert.equal(v.root.children[0].visible,false);assert.ok(v.turret.parent);v.dispose();v.dispose();}
 const v=createVessel(T,r,{}, {},balance.enemyModel,{loader:{async loadAsync(){throw Error('missing enemy');}}});await v.ready;assert.equal(v.modelStatus.failed,true);assert.equal(v.root.children[0].visible,true);v.dispose();
});
