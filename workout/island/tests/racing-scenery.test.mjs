import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {createTrack} from '../minigames/racing-tracks.mjs';
import {createRacingScenery} from '../minigames/racing-scenery.mjs';

// Only texture drawing is faked. Every scene object, transform, material,
// instance buffer and triangle count below comes from the real local Three.js.
function fixture(stage=1,seed=1){
 const scene=new T.Scene(),resources=new Set(),keep=value=>(resources.add(value),value);
 const context={fillRect(){},beginPath(){},ellipse(){},fill(){},moveTo(){},lineTo(){},stroke(){}};
 const canvas={width:0,height:0,getContext(kind){assert.equal(kind,'2d');return context;}};
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement(tag){assert.equal(tag,'canvas');return canvas;}}});
 let scenery,track;
 try{
  track=createTrack(stage);const bounds=new T.Box3();
  for(const p of track.points)bounds.expandByPoint(new T.Vector3(p.x,p.y,p.z));
  scenery=createRacingScenery({T,scene,track,seed,center:bounds.getCenter(new T.Vector3()),keep,
   colors:{land:'#68a879',rock:'#b8a98a',sand:'#e4cda1'},mat:(color,options)=>keep(new T.MeshStandardMaterial({color,...options}))});
 }finally{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
 return {scene,resources,scenery,canvas,track,close(){scenery.dispose();for(const resource of resources)resource.dispose?.();}};
}

function sceneCost(scene){
 let triangles=0,draws=0,shadowDraws=0;scene.traverseVisible(object=>{
  if(!object.isMesh)return;
  const instances=object.isInstancedMesh?object.count:1;
  if(instances===0)return;
  draws++;if(object.castShadow)shadowDraws++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3*instances;
 });return {triangles,draws,shadowDraws};
}

const stages=[1,2,3,4,5,6,19,20,21,22,23,24,30],seeds=[1,97];
for(const stage of stages)for(const seed of seeds)for(const quality of [0,1,2]){
 test(`scenery budget: stage ${stage}, seed ${seed}, quality ${quality}`,()=>{
  const f=fixture(stage,seed);
  try{
   f.scenery.setQuality(quality);
   const measured=sceneCost(f.scene),budget=quality===2?12000:30000;
   assert.ok(measured.triangles>0);
   assert.ok(measured.triangles<=budget,`${measured.triangles} independently counted triangles exceed ${budget}`);
   assert.ok(measured.draws+(quality===0?measured.shadowDraws:0)<=20,`${measured.draws} scenery draws plus enabled shadows exceed 20`);
   assert.equal(f.scenery.metrics().triangles,measured.triangles);
   assert.equal(f.scenery.metrics().draws,measured.draws);
   if(quality===2){
    const hidden=[];f.scene.traverse(o=>{if(o.isInstancedMesh&&o.name==='racing-scenery-batch'&&!o.visible)hidden.push(o);});
    assert.equal(hidden.length,3,'low quality must hide the bush, tuft and flower batches');
    assert.deepEqual(hidden.map(o=>o.geometry.type).sort(),['ConeGeometry','IcosahedronGeometry','SphereGeometry']);
    assert.ok(hidden.every(o=>o.count===0),'hidden plants must submit zero instances');
   }
  }finally{f.close();}
 });
}

test('scenery shares registered materials and texture across many instances',()=>{
 const f=fixture(6,97);
 try{
  const found=new Set(),meshes=[];
  f.scene.traverse(o=>{if(!o.isMesh)return;meshes.push(o);found.add(o.geometry);
   for(const material of Array.isArray(o.material)?o.material:[o.material]){found.add(material);for(const value of Object.values(material))if(value?.isTexture)found.add(value);}
  });
  for(const resource of found)assert.ok(f.resources.has(resource),'a scene GPU resource was not registered with its owner');
  assert.equal(f.resources.size,found.size,'registry must contain exactly the shared scene resources');
  assert.ok(meshes.reduce((sum,o)=>sum+o.count,0)>100);
  assert.equal(meshes.filter(o=>o.material===f.scenery.grassMaterial).length,2,'mounds and far islands share the grass material');
  assert.equal([...f.resources].filter(o=>o.isTexture).length,1,'each scenery instance needs only one ground texture');
  assert.equal(f.scenery.grassMaterial.map.image,f.canvas);
  assert.equal(f.canvas.width,256);assert.equal(f.canvas.height,256);
 }finally{f.close();}
});

for(const stage of [1,2,3,4,5,6])test(`roadside architecture keeps the racing corridor clear: track ${stage}`,()=>{
 const f=fixture(stage,97);
 try{
  const details=f.scenery.metrics().roadside;
  assert.ok(details.buildings>=3,'each circuit needs substantial roadside architecture');
  assert.ok(details.lamps>=20,'road lighting must repeat along the course');
  assert.ok(details.guardrailSections>=30,'corners need substantial route protection');
  assert.ok(details.cornerSigns>=1,'each circuit needs readable advance corner signs');
  assert.equal(details.galleries,['summit','volcano','ruins'].includes(f.track.theme)?1:0);
  const matrix=new T.Matrix4(),point=new T.Vector3();let inspected=0;
  f.scene.traverse(object=>{
   if(!object.isInstancedMesh||!object.name.startsWith('racing-roadside-')||object.name==='racing-roadside-pool')return;
   object.geometry.computeBoundingBox();const b=object.geometry.boundingBox;
   for(let i=0;i<object.count;i++){
    object.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
     point.set(x,y,z).applyMatrix4(matrix);const road=f.track.project(point.x,point.z);inspected++;
     assert.ok(road.distance>f.track.width/2+.5||point.y>road.y+5.8,`${object.name} obstructs the road or chase-camera clearance`);
    }
   }
  });assert.ok(inspected>1000);
 }finally{f.close();}
});

test('scenery disposal detaches only its root and leaves shared resource disposal to the view',()=>{
 const f=fixture(5,1),unrelated=new T.Group();f.scene.add(unrelated);
 const instanceDisposals=new Map(),resourceDisposals=new Map();
 f.scene.traverse(o=>{if(o.isInstancedMesh){instanceDisposals.set(o,0);o.addEventListener('dispose',()=>instanceDisposals.set(o,instanceDisposals.get(o)+1));}});
 for(const resource of f.resources){resourceDisposals.set(resource,0);resource.addEventListener('dispose',()=>resourceDisposals.set(resource,resourceDisposals.get(resource)+1));}
 f.scenery.dispose();f.scenery.dispose();
 assert.deepEqual(f.scene.children,[unrelated]);assert.equal(f.scenery.metrics().disposed,true);
 assert.ok([...instanceDisposals.values()].every(count=>count===1),'instance buffers dispose exactly once');
 assert.ok([...resourceDisposals.values()].every(count=>count===0),'scenery must not prematurely dispose resources shared with terrain');
 for(const resource of f.resources)resource.dispose();
 assert.ok([...resourceDisposals.values()].every(count=>count===1),'view-owned resources dispose once through their Set');
});
