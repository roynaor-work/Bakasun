import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {terrainNoise,islandTerrain,releaseTerrain} from '../workout/island/view/ultra-island-terrain.mjs';
import {GROUND} from '../workout/island/view/environment.mjs';
import {loadCoastalSurfaces} from '../workout/island/view/coastal-surfaces.mjs';
import {IslandFlora} from '../workout/island/view/ultra-island-flora.mjs';
import {createCoastalDetails} from '../workout/island/view/ultra-island-scenery.mjs';

test('detailed terrain preserves every sampled buildable point at the shared ground height, including 40/48 expansions',()=>{
  const material=new T.MeshStandardMaterial();
  for(const size of [8,16,24,32,40,48,64]){
    const root=islandTerrain(size,GROUND,material,material);root.updateMatrixWorld(true);
    assert.equal(root.children.length,2,'lawn and beach retain two terrain draws');
    assert.ok(root.children.reduce((n,m)=>n+m.geometry.index.count/3,0)<8500);
    for(let x=-size/2;x<=size/2;x+=size/8)for(let z=-size/2;z<=size/2;z+=size/8){
      const hits=new T.Raycaster(new T.Vector3(x,10,z),new T.Vector3(0,-1,0)).intersectObject(root,true);
      assert.ok(hits.length);assert.ok(Math.abs(hits[0].point.y-GROUND)<1e-6,`${size}: ${x},${z}`);
    }
    releaseTerrain(root);
  }
  material.dispose();
});

test('world-space lawn patches are bounded, deterministic and continuous across cell boundaries',()=>{
  const values=new Set();
  for(let x=-20;x<=20;x+=.25)for(let z=-20;z<=20;z+=.75){
    const n=terrainNoise(x,z);assert.ok(n>=0&&n<=1);assert.equal(n,terrainNoise(x,z));values.add(n);
    assert.ok(Math.abs(n-terrainNoise(x+1e-6,z))<.00001);
  }
  assert.ok(values.size>1000);
});

test('coastal vegetation stays outside the full building square and uses the existing two detail batches',()=>{
  for(const size of [16,32,40,48]){
    const coast=createCoastalDetails(size,GROUND);assert.equal(coast.group.children.length,2);
    for(const p of coast.palms)assert.ok(Math.max(Math.abs(p.x),Math.abs(p.z))>size/2+.3);
    const shrubs=coast.group.children[1],m=new T.Matrix4();
    for(let i=0;i<shrubs.count;i++){
      shrubs.getMatrixAt(i,m);const p=new T.Vector3(),s=new T.Vector3();m.decompose(p,new T.Quaternion(),s);
      assert.ok(Math.max(Math.abs(p.x)-s.x*.5,Math.abs(p.z)-s.z*.5)>size/2);
    }
    releaseTerrain(coast.group);
  }
});

function surfaceOwner(){return {disposed:false,grassMap:new T.Texture(),sandMap:new T.Texture(),grassMaterial:new T.MeshStandardMaterial(),sandMaterial:new T.MeshStandardMaterial()};}
test('local photographic surfaces replace fallbacks and release late arrivals without touching shared model art',async()=>{
  const previousDocument=globalThis.document;globalThis.document={};
  try{
    const owner=surfaceOwner(),pending=[],released=[0,0];owner.grassMap.addEventListener('dispose',()=>released[0]++);owner.sandMap.addEventListener('dispose',()=>released[1]++);
    const ready=loadCoastalSurfaces(owner,{load(url,ok,progress,fail){pending.push({url,ok,fail});}});
    assert.equal(pending.length,2);assert.ok(pending.every(p=>new URL(p.url).pathname.includes('/island/assets/textures/coastal-')));
    for(const p of pending)p.ok(new T.Texture());assert.equal(await ready,true);assert.deepEqual(released,[1,1]);
    assert.equal(owner.grassMaterial.map,owner.grassMap);assert.equal(owner.sandMaterial.map,owner.sandMap);
    const shader={fragmentShader:'#include <map_fragment>'};owner.grassMaterial.onBeforeCompile(shader);assert.ok(shader.fragmentShader.includes('turfDetail'));
    for(const resource of [owner.grassMap,owner.sandMap,owner.grassMaterial,owner.sandMaterial])resource.dispose();
    const late=surfaceOwner(),callbacks=[];let lateReleases=0;
    const result=loadCoastalSurfaces(late,{load(url,ok){callbacks.push(ok);}});late.disposed=true;
    for(const callback of callbacks){const map=new T.Texture();map.addEventListener('dispose',()=>lateReleases++);callback(map);}
    assert.equal(await result,false);assert.equal(lateReleases,2);
    for(const resource of [late.grassMap,late.sandMap,late.grassMaterial,late.sandMaterial])resource.dispose();
    const failed=surfaceOwner(),fallback=failed.grassMap;
    assert.equal(await loadCoastalSurfaces(failed,{load(url,ok,progress,fail){fail();}}),false);assert.equal(failed.grassMap,fallback);
    for(const resource of [failed.grassMap,failed.sandMap,failed.grassMaterial,failed.sandMaterial])resource.dispose();
  }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});

test('palm ambient contacts survive directional-shadow fallback, clear on rebuild and release owned resources once',async()=>{
  const parent=new T.Group(),flora=new IslandFlora(parent);await flora.ready;
  const source=new T.Group(),geometry=new T.BoxGeometry(.2,2,.2),material=new T.MeshStandardMaterial();source.add(new T.Mesh(geometry,material));flora.models.assets.set('assets/models/palm-tree-512.glb',source);
  const positions=[{x:18,y:GROUND-.01,z:4,scale:.7},{x:4,y:GROUND-.01,z:18,scale:.8}];flora.rebuild(positions);
  assert.equal(flora.contacts.count,2);assert.equal(flora.metrics().draws,2);assert.equal(flora.instances[0].geometry,geometry);assert.equal(flora.instances[0].material,material);
  const contacts=flora.contacts;flora.rebuild(positions);assert.notEqual(flora.contacts,contacts);flora.rebuild([]);assert.equal(parent.children.length,0);
  let releases=0;for(const r of [flora.contactGeometry,flora.contactMaterial,flora.contactMaterial.map,geometry,material])r.addEventListener('dispose',()=>releases++);
  flora.dispose();flora.dispose();assert.equal(releases,5);assert.equal(parent.children.length,0);
});

test('bundled 1K photographic detail has a small download budget and documented CC0 provenance',async()=>{
  let total=0;const root=new URL('../workout/island/assets/textures/',import.meta.url);
  for(const file of ['coastal-grass.jpg','coastal-sand.jpg']){
    const bytes=await readFile(new URL(file,root));assert.equal(bytes.readUInt16BE(0),0xffd8);total+=(await stat(new URL(file,root))).size;
  }
  assert.ok(total<250000);const sources=await readFile(new URL('COASTAL-SOURCES.txt',root),'utf8');assert.match(sources,/CC0/);assert.match(sources,/polyhaven.com\/a\/grass_ground/);
});
