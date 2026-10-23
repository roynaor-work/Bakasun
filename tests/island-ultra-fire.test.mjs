import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {createUltraFireEffects} from '../workout/island/minigames/ultra-fire-effects.mjs';
import {createUltraFireScenery} from '../workout/island/minigames/ultra-fire-scenery.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.fireRescue;
function fixture(){
 const model=createFireModel({config,balance,level:1,random:()=>.5}),scene=new T.Scene(),camera=new T.OrthographicCamera(-27.5,27.5,12.7,-12.7,.1,180);
 camera.position.set(6,balance.city.cameraHeight*.82,18+balance.city.cameraBack*1.3);camera.lookAt(6,0,15.6);camera.updateMatrixWorld();
 const effects=createUltraFireEffects({scene,model,balance}),args={camera,nozzle:new T.Vector3(6,2.6,18),impact:new T.Vector3(...balance.render.sites[0])};
 effects.update(args);return {model,scene,camera,effects,args};
}
test('ULTRA fire cards remain outside the facade in the active oblique camera',()=>{
 const {scene,effects}=fixture(),flames=scene.getObjectByName('ultra-fire-flames'),matrix=new T.Matrix4(),corner=new T.Vector3();
 assert.equal(flames.count,21);
 for(let i=0;i<flames.count;i++){
  flames.getMatrixAt(i,matrix);const front=balance.render.sites[Math.floor(i/7)][2];
  for(const x of [-.5,.5])for(const y of [-.5,.5]){corner.set(x,y,0).applyMatrix4(matrix);assert.ok(corner.z>=front-.001,'a flame corner must not intersect its building');}
 }
 effects.dispose();
});
test('ULTRA effects freeze with simulation time and release all GPU resources once',()=>{
 const {scene,model,effects,args}=fixture(),before=model.snapshot(),resources=new Set(),matrices=[];
 scene.traverse(o=>{if(o.isInstancedMesh){resources.add(o);resources.add(o.geometry);resources.add(o.material);matrices.push(o.instanceMatrix.array.slice());}});
 const counts=new Map([...resources].map(r=>[r,0]));for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
 effects.update(args);let i=0;scene.traverse(o=>{if(o.isInstancedMesh)assert.deepEqual(o.instanceMatrix.array,matrices[i++]);});
 assert.deepEqual(model.snapshot(),before);assert.ok(effects.metrics().maxTriangles<1500);assert.ok(effects.metrics().drawCalls<=6);
 effects.dispose();effects.dispose();for(const count of counts.values())assert.equal(count,1);assert.equal(scene.children.length,0);
});
test('ULTRA Meshy scenery shares its authored resources, fits two trees and disposes once',async()=>{
 const scene=new T.Scene(),geometry=new T.BoxGeometry(1.8,1.9,1.05),map=new T.Texture(),material=new T.MeshStandardMaterial({map}),asset=new T.Group();asset.add(new T.Mesh(geometry,material));
 const counts=new Map([[geometry,0],[map,0],[material,0]]);for(const r of counts.keys())r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
 const scenery=createUltraFireScenery({scene,adapters:{loader:{async loadAsync(){return {scene:asset};}}}});assert.equal(await scenery.load(),true);assert.equal(scenery.metrics().trees,2);assert.equal(scenery.metrics().models.loaded,1);
 const trees=[];scene.traverse(o=>{if(o.name==='ultra-fire-meshy-tree')trees.push(o);});
 for(const tree of trees){const bounds=new T.Box3().setFromObject(tree);assert.ok(Math.abs(bounds.min.y)<.0001);assert.ok(Math.abs(bounds.max.y-3.8)<.0001);tree.traverse(o=>{if(o.isMesh){assert.equal(o.material,material);assert.equal(o.material.map,map);assert.ok(o.castShadow&&o.receiveShadow);}});}
 scenery.dispose();scenery.dispose();for(const count of counts.values())assert.equal(count,1);assert.equal(scene.children.length,0);
});
test('ULTRA scenery respects the round budget before accepting any model',async()=>{
 const scene=new T.Scene(),asset=new T.Group();asset.add(new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()));
 const scenery=createUltraFireScenery({scene,canAdd:()=>false,adapters:{loader:{async loadAsync(){return {scene:asset};}}}});assert.equal(await scenery.load(),false);assert.equal(scenery.metrics().trees,0);assert.equal(scenery.metrics().rejected,2);scenery.dispose();assert.equal(scene.children.length,0);
});
