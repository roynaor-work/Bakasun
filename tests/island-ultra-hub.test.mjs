import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../workout/island/vendor/three.module.js';
import {Environment,GROUND} from '../workout/island/view/environment.mjs';
import {coastline} from '../workout/island/view/ultra-island-terrain.mjs';
import {pathMesh,disposePath} from '../workout/island/view/city-life.mjs';
import {IslandRoadBatch} from '../workout/island/view/ultra-island-roads.mjs';

test('natural coastline surrounds every buildable cell at all supported island sizes',()=>{
  for(const size of [8,16,24,32,64])for(let i=0;i<4096;i++){
    const angle=i/4096*Math.PI*2,square=size/2/Math.max(Math.abs(Math.cos(angle)),Math.abs(Math.sin(angle)));
    assert.ok(coastline(angle,size,'grass')>square+.3,`grass must contain grid at ${size}/${i}`);
    assert.ok(coastline(angle,size)>coastline(angle,size,'grass')+.4,`beach must stay outside lawn at ${size}/${i}`);
  }
});

test('terrain resize preserves placement plane, replaces old resources and disposes once',async()=>{
  const scene=new T.Scene(),environment=new Environment(scene,{});let releases=0;
  environment.rebuild(16);environment.land.children[0].geometry.addEventListener('dispose',()=>releases++);
  environment.showPlacementGrid(true);
  for(const size of [24,32,16]){
    environment.rebuild(size);assert.equal(environment.grid.position.y,GROUND+.006);assert.equal(environment.grid.visible,true);
    environment.land.traverse(node=>{if(node.geometry)for(const value of node.geometry.attributes.position.array)assert.ok(Number.isFinite(value));});
  }
  assert.equal(releases,1);assert.equal(environment.water.metrics().reflectionPasses,0);
  let mapReleases=0;environment.grassMap.addEventListener('dispose',()=>mapReleases++);
  environment.dispose();environment.dispose();await environment.modelsReady;
  assert.equal(mapReleases,1);assert.equal(scene.children.length,0);
});

test('paving follows path connections without changing routes and releases its GPU resources',()=>{
  const cells=[{x:2,z:3,neighbors:[1]},{x:3,z:3,neighbors:[0,2]},{x:3,z:4,neighbors:[1]}],before=JSON.stringify(cells);
  const mesh=pathMesh(cells,16,{width:.34,color:'#e6d2ac'}),matrix=new T.Matrix4();
  assert.equal(mesh.count,5);for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));}
  assert.equal(JSON.stringify(cells),before);
  const resources=[mesh.geometry,mesh.material,mesh.material.map],counts=resources.map(()=>0);
  resources.forEach((resource,i)=>resource.addEventListener('dispose',()=>counts[i]++));disposePath(mesh);disposePath(mesh);assert.deepEqual(counts,[1,1,1]);
});

test('road batching preserves authored colors, world transforms and original picking targets',()=>{
  const scene=new T.Scene(),entries=[],material=new T.MeshStandardMaterial({vertexColors:true});
  for(let i=0;i<2;i++){
    const geometry=new T.BoxGeometry(1,.1,1),colors=new Float32Array(geometry.attributes.position.count*3);
    for(let j=0;j<colors.length;j+=3)colors[j+i*2]=1;
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));
    const group=new T.Group(),mesh=new T.Mesh(geometry,material);
    group.position.x=i*3;group.add(mesh);scene.add(group);entries.push({typeId:'road',level:1,group});
  }
  let sourceReleased=0;entries[0].group.children[0].geometry.addEventListener('dispose',()=>sourceReleased++);
  const batch=new IslandRoadBatch(scene);batch.rebuild(entries,id=>id==='road');assert.deepEqual(batch.metrics(),{pieces:2,draws:1});
  assert.equal(entries[0].group.visible,false);assert.equal(entries[1].group.visible,false);
  assert.equal(batch.mesh.geometry.attributes.color.getX(0),1);assert.equal(batch.mesh.geometry.attributes.color.getZ(entries[0].group.children[0].geometry.attributes.position.count),1);
  batch.mesh.geometry.computeBoundingBox();assert.ok(batch.mesh.geometry.boundingBox.max.x>3.4);
  assert.ok(new T.Raycaster(new T.Vector3(0,10,0),new T.Vector3(0,-1,0)).intersectObjects([entries[0].group],true).length>0);
  const geometry=batch.mesh.geometry;batch.rebuild(entries,id=>id==='road');assert.equal(batch.mesh.geometry,geometry);
  let disposed=0;geometry.addEventListener('dispose',()=>disposed++);batch.dispose();batch.dispose();assert.equal(disposed,1);assert.equal(sourceReleased,0);assert.ok(entries.every(e=>e.group.visible));
  for(const {group} of entries)group.children[0].geometry.dispose();material.dispose();
});

test('textured and custom roads retain their individual models and materials',()=>{
  const scene=new T.Scene(),texture=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1),materials=[new T.MeshStandardMaterial({vertexColors:true}),new T.MeshStandardMaterial({vertexColors:true,color:'red'}),new T.MeshStandardMaterial({map:texture}),new T.MeshStandardMaterial({vertexColors:true,normalMap:texture})],entries=[];
  for(const material of materials){const group=new T.Group(),geometry=new T.BoxGeometry(1,.1,1);geometry.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3).fill(1),3));group.add(new T.Mesh(geometry,material));scene.add(group);entries.push({typeId:'road',level:1,group});}
  const batch=new IslandRoadBatch(scene);batch.rebuild(entries,()=>true);assert.deepEqual(batch.metrics(),{pieces:1,draws:1});assert.ok(entries.slice(1).every(e=>e.group.visible));batch.dispose();
  const normalOnly=new IslandRoadBatch(scene);normalOnly.rebuild([entries[3]],()=>true);assert.deepEqual(normalOnly.metrics(),{pieces:0,draws:0});assert.equal(entries[3].group.visible,true);normalOnly.dispose();
  for(const {group}of entries)group.children[0].geometry.dispose();materials.forEach(m=>m.dispose());texture.dispose();
});
