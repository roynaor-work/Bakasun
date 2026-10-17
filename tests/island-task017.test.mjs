import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {MeshyPilot} from '../workout/island/view/meshy-pilot.mjs';
import {LocalModels} from '../workout/island/view/local-models.mjs';
const root=new URL('../workout/island/',import.meta.url);
const settings=JSON.parse(await readFile(new URL('data/config.json',root))).cityView.meshyPilot;
function rig(){
 const root=new T.Group(),hips=new T.Bone(),foot=new T.Bone();hips.name='mixamorigHips';foot.name='mixamorigLeftFoot';hips.add(foot);root.add(hips);
 const geometry=new T.BoxGeometry(.2,1,.2),indices=new Uint16Array(geometry.attributes.position.count*4),weights=new Float32Array(indices.length);
 for(let i=0;i<indices.length;i+=4){indices[i]=1;weights[i]=1;}
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());root.add(mesh);mesh.bind(new T.Skeleton([hips,foot]));
 const clip=new T.AnimationClip('Walking',1,[new T.VectorKeyframeTrack('mixamorigLeftFoot.position',[0,.5,1],[0,0,0,0,.2,.1,0,0,0])]);
 return {scene:root,animations:[clip]};
}
test('TASK-017 supplied GLBs retain byte size, topology, embedded images and Mixamo animation contract',async()=>{
 for(const [file,bytes,triangles]of [['car-a-512.glb',327664,4770],['adult-man-rigged-512.glb',1218676,5170]]){
  const b=await readFile(new URL('assets/models/'+file,root)),json=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
  assert.equal(b.length,bytes);assert.equal(json.meshes.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+json.accessors[p.indices].count/3,0),0),triangles);
  assert.ok(json.images.every(i=>i.bufferView!==undefined));assert.ok(json.buffers.every(b=>!b.uri));
  if(file.startsWith('adult')){assert.equal(json.skins[0].joints.length,66);assert.deepEqual(json.animations.map(a=>a.name).sort(),['Running','Walking']);}
 }
});
test('TASK-017 clones bind to their own bones, preserve cache geometry, and dispose only their own skeleton resources',async()=>{
 const source=rig(),scene=new T.Scene();let released=0;source.scene.traverse(o=>o.geometry?.addEventListener('dispose',()=>released++));
 const pilot=new MeshyPilot(scene,settings,{loader:{async loadAsync(url){if(url.includes('car-a'))throw Error('car unavailable');return source;}}});await pilot.load();
 const a=pilot.walker,b=pilot.createWalker(),points=[new T.Vector3(),new T.Vector3(1,0,0)];a.setRoute(points);b.setRoute(points);b.wait=0;
 a.tick(.2);b.tick(.2);assert.equal(a.stopped,true);assert.equal(b.stopped,false);assert.notEqual(a.mixer,b.mixer);
 const foot=w=>w.root.getObjectByName('mixamorigLeftFoot');assert.notEqual(foot(a),foot(b));assert.notEqual(foot(a),source.scene.getObjectByName('mixamorigLeftFoot'));assert.notDeepEqual(foot(a).position.toArray(),foot(b).position.toArray());
 b.dispose();assert.equal(released,0);a.tick(2);assert.equal(released,0);pilot.dispose();pilot.dispose();assert.equal(released,1);assert.equal(scene.children.length,0);
});
test('TASK-017 closing while optional loads are pending releases resources without attaching pilots',async()=>{
 const pending=[],scene=new T.Scene();let released=0;
 const pilot=new MeshyPilot(scene,settings,{loader:{loadAsync(){return new Promise(resolve=>pending.push(resolve));}}}),ready=pilot.load();pilot.dispose();
 for(const resolve of pending){const object=rig();object.scene.traverse(o=>o.geometry?.addEventListener('dispose',()=>released++));resolve(object);}
 await ready;assert.equal(released,2);assert.equal(scene.children.length,0);assert.equal(pilot.createWalker(),null);
});
test('TASK-017 a missing rig animation retains a usable optional car and no walker',async()=>{
 const cache=new LocalModels({loader:{async loadAsync(){return {scene:new T.Group()};}}});await cache.load(settings.walker);assert.deepEqual(cache.animations.get(settings.walker.path),[]);cache.dispose();
 const pilot=new MeshyPilot(new T.Scene(),settings,{loader:{async loadAsync(){return {scene:new T.Group()};}}});await pilot.load();assert.equal(pilot.metrics().carLoaded,true);assert.equal(pilot.metrics().walkerLoaded,false);pilot.dispose();
});
