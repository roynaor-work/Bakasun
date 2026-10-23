import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../workout/island/vendor/three.module.js';
import {LocalModels} from '../workout/island/view/local-models.mjs';
import {modelTriangles,fleetModel,liveFleetIds} from '../workout/island/minigames/ultra-alien-fleet.mjs';
import {alienEnvironment} from '../workout/island/minigames/ultra-alien-environment.mjs';

test('ULTRA alien transforms retain shared original materials, texture pixels and geometry',async()=>{
 const texture=new T.DataTexture(new Uint8Array(16),2,2),material=new T.MeshStandardMaterial({color:'#c6c7b5',map:texture,roughness:.8});
 const geometry=new T.BoxGeometry(4,1,3),source=new T.Group();source.add(new T.Mesh(geometry,material));
 const models=new LocalModels({loader:{loadAsync:async()=>({scene:source})}}),spec={path:'assets/models/ship-player.glb',rotationY:90,scale:1.15};
 await models.load(spec);const a=fleetModel(models,spec),b=fleetModel(models,spec);
 assert.notEqual(a,b);assert.equal(a.children[0].children[0].geometry,geometry);assert.equal(a.children[0].children[0].material,material);
 a.rotation.z=.3;a.scale.setScalar(3);assert.equal(b.scale.x,1);assert.equal(source.rotation.y,0);
 assert.equal(material.color.getHexString(),'c6c7b5');assert.equal(material.roughness,.8);assert.equal(material.map,texture);assert.equal(texture.image.width,2);
 assert.equal(modelTriangles(a),12);models.dispose();
});

test('ULTRA dense fleets keep boss and diving ships live within the measured triangle ceiling',()=>{
 const aliens=Array.from({length:40},(_,i)=>({id:i+1,kind:i%5,y:100+i,boss:false,diveAge:-1}));
 aliens[0].boss=true;aliens[1].diveAge=.2;const costs=[4842,4690,5002,4914,5088];
 for(const limit of [8,16]){const ids=liveFleetIds(aliens,81500,costs,limit);assert.ok(ids.has(1));assert.ok(ids.has(2));assert.ok(ids.size<=limit);
  assert.ok(aliens.filter(a=>ids.has(a.id)).reduce((n,a)=>n+costs[a.kind],0)<=81500);
  assert.deepEqual([...ids],[...liveFleetIds([...aliens].reverse(),81500,costs,limit)]);
 }
});

test('ULTRA a light formation uses original models for every visible enemy',()=>{
 const aliens=Array.from({length:12},(_,i)=>({id:i,kind:0,y:i*10,boss:false,diveAge:-1}));
 assert.equal(liveFleetIds(aliens,81500,[5000]).size,12);
});

test('ULTRA backdrop cannot write depth over the collision plane and releases its resources',()=>{
 const scene=new T.Scene(),environment=alienEnvironment(scene),sky=scene.children.find(o=>o.isMesh);let released=0;
 sky.geometry.addEventListener('dispose',()=>released++);sky.material.addEventListener('dispose',()=>released++);
 assert.equal(sky.material.depthTest,false);assert.equal(sky.material.depthWrite,false);assert.ok(sky.renderOrder<0);
 environment.update(12,844/390);assert.equal(sky.material.uniforms.aspect.value,844/390);environment.dispose();assert.equal(scene.children.length,0);assert.equal(released,2);
});
