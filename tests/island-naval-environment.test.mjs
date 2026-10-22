import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../workout/island/vendor/three.module.js';
import {createNavalEnvironment,navalWaterNormals} from '../workout/island/minigames/naval-environment.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

test('naval normals are deterministic, normalized, repeatable and require no network asset',()=>{
  const first=navalWaterNormals(),second=navalWaterNormals();
  assert.equal(first.image.width,128);assert.equal(first.image.height,128);
  assert.equal(first.wrapS,THREE.RepeatWrapping);assert.equal(first.wrapT,THREE.RepeatWrapping);
  assert.deepEqual(first.image.data,second.image.data);
  let variation=0;const bytes=first.image.data;
  for(let i=0;i<bytes.length;i+=4){const normal=[bytes[i],bytes[i+1],bytes[i+2]].map(n=>n/255*2-1);assert.ok(Math.abs(Math.hypot(...normal)-1)<.015);assert.equal(bytes[i+3],255);variation+=Math.abs(bytes[i]-128);}
  assert.ok(variation>10000);first.dispose();second.dispose();
});

test('naval environment keeps simulation/save state unchanged and uses the supplied simulation clock',async()=>{
  const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames;
  const model=createNavalModel({config,balance:config.navalDuel,level:1,random:seededRandom(4)});
  const before=model.snapshot(),scene=new THREE.Scene(),renderer={},fallback=new THREE.Object3D(),sun=new THREE.Object3D();
  scene.add(fallback,sun);const environment=createNavalEnvironment(scene,renderer,fallback,sun);
  const camera=new THREE.PerspectiveCamera();camera.position.set(5,14,24);
  environment.update(2,camera);assert.equal(environment.metrics().waterTime,.9);
  environment.update(2,camera);assert.equal(environment.metrics().waterTime,.9);
  assert.deepEqual(model.snapshot(),before);assert.equal(renderer.toneMapping,THREE.ACESFilmicToneMapping);
  assert.equal(fallback.visible,false);assert.equal(sun.visible,false);
  environment.dispose();
});

test('naval low quality retains the existing lightweight sea and releases new resources exactly once',()=>{
  const scene=new THREE.Scene(),fallback=new THREE.Object3D(),sun=new THREE.Object3D();scene.add(fallback,sun);
  const environment=createNavalEnvironment(scene,{},fallback,sun),water=scene.children.find(o=>o.isWater),sky=scene.children.find(o=>o.isMesh&&!o.isWater);
  const released={geometry:0,material:0,normals:0,skyGeometry:0,skyMaterial:0};
  for(const [key,resource]of Object.entries({geometry:water.geometry,material:water.material,normals:water.material.uniforms.normalSampler.value,skyGeometry:sky.geometry,skyMaterial:sky.material}))resource.addEventListener('dispose',()=>released[key]++);
  environment.degrade();environment.degrade();assert.equal(environment.metrics().water,'light');assert.equal(fallback.visible,true);assert.equal(water.visible,false);
  environment.dispose();environment.dispose();environment.degrade();
  assert.deepEqual(released,{geometry:1,material:1,normals:1,skyGeometry:1,skyMaterial:1});
  assert.equal(environment.metrics().disposed,true);assert.deepEqual(scene.children,[fallback,sun]);
});
