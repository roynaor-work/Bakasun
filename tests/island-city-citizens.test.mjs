import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../workout/island/vendor/three.module.js';
import {Citizens} from '../workout/island/view/city-citizens.mjs';
import {LocalModels} from '../workout/island/view/local-models.mjs';

const MAN='assets/models/adult-man-rigged-512.glb',WOMAN='assets/models/adult-woman-rigged-512.glb';
function rig(){
  const root=new T.Group(),hips=new T.Bone(),foot=new T.Bone();hips.name='Hips';foot.name='Foot';hips.add(foot);root.add(hips);
  const geometry=new T.BoxGeometry(.2,1,.2),indices=new Uint16Array(geometry.attributes.position.count*4),weights=new Float32Array(indices.length);
  for(let i=0;i<indices.length;i+=4){indices[i]=1;weights[i]=1;}
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  const mesh=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial());root.add(mesh);mesh.bind(new T.Skeleton([hips,foot]));
  const clip=new T.AnimationClip('Walking',1,[new T.VectorKeyframeTrack('Foot.position',[0,.5,1],[0,0,0,0,.2,.1,0,0,0])]);
  return {scene:root,animations:[clip],mesh};
}
const paths=()=>[
  {x:0,y:.4,z:0,neighbors:[1]},
  {x:1,y:.6,z:0,neighbors:[0]},
  {x:10,y:.4,z:10,neighbors:[3]},
  {x:10,y:.4,z:11,neighbors:[2]}
];
const firstMesh=object=>{let found;object.traverse(o=>{if(o.isSkinnedMesh)found??=o;});return found;};

test('city citizens use the two original embedded Walking rigs without changing asset files',async()=>{
  const root=new URL('../workout/island/',import.meta.url),manifest=JSON.parse(await readFile(new URL('assets/models/manifest.json',root)));
  for(const path of [MAN,WOMAN]){
    const b=await readFile(new URL(path,root)),json=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
    assert.equal(createHash('sha256').update(b).digest('hex'),manifest[path]);
    assert.equal(json.meshes.length,1);assert.equal(json.materials.length,1);
    assert.ok(json.animations.some(a=>a.name==='Walking'));assert.ok(json.skins[0].joints.length>20);
    assert.ok(json.images.every(i=>i.bufferView!==undefined));assert.ok(json.buffers.every(buffer=>!buffer.uri));
  }
});

test('city citizens share pilot models while owning independent skeletons, phases and mixers',async()=>{
  const sources=new Map(),requests=[],scene=new T.Scene();let released=0;
  const models=new LocalModels({loader:{async loadAsync(url){requests.push(url);const source=rig();sources.set(url.includes('adult-woman')?WOMAN:MAN,source);source.mesh.geometry.addEventListener('dispose',()=>released++);return source;}}});
  await models.load({path:MAN,rotationY:0,scale:.32});
  const original=sources.get(MAN).mesh.geometry.attributes.position.array.slice(),citizens=new Citizens(scene,40,{models});citizens.setPoints(paths(),40);
  assert.equal(citizens.people.length,12);assert.ok(citizens.meshes.every(m=>m.visible));
  await citizens.ready;assert.equal(requests.length,2);assert.equal(citizens.visuals.length,12);assert.ok(citizens.meshes.every(m=>!m.visible));
  const [a,b,c]=citizens.visuals,mesh=firstMesh(a.root);
  assert.notEqual(a.mixer,c.mixer);assert.notEqual(mesh.skeleton,firstMesh(c.root).skeleton);
  assert.notEqual(mesh.skeleton.bones[0],sources.get(MAN).mesh.skeleton.bones[0]);
  assert.equal(mesh.geometry,sources.get(MAN).mesh.geometry);assert.equal(mesh.material,sources.get(MAN).mesh.material);
  assert.equal(firstMesh(b.root).geometry,sources.get(WOMAN).mesh.geometry);
  assert.notEqual(a.action.time,c.action.time);assert.deepEqual(sources.get(MAN).mesh.geometry.attributes.position.array,original);
  let skeletons=0;for(const walker of citizens.visuals){const sk=firstMesh(walker.root).skeleton,dispose=sk.dispose.bind(sk);sk.dispose=()=>{skeletons++;dispose();};}
  citizens.dispose();citizens.dispose();assert.equal(skeletons,12);assert.equal(released,0);assert.equal(scene.children.length,0);assert.equal(models.disposed,false);
  models.dispose();assert.equal(released,2);
});

test('city citizens keep connected sidewalk travel and interpolated height through quality changes',async()=>{
  const citizens=new Citizens(new T.Scene(),40,{loader:{async loadAsync(){return rig();}}});citizens.setPoints(paths(),40);await citizens.ready;
  for(let i=0;i<300;i++){
    citizens.tick(.05,i*.05);
    for(let n=0;n<citizens.people.length;n++){
      const person=citizens.people[n],walker=citizens.visuals[n];
      if(n%4<2){assert.ok(person.x>=0&&person.x<=1);assert.equal(person.z,0);assert.ok(person.y>=.4&&person.y<=.6);assert.ok(person.target<2);}
      else{assert.equal(person.x,10);assert.ok(person.z>=10&&person.z<=11);assert.ok(person.target>=2);}
      assert.deepEqual(walker.root.position.toArray(),[person.x,person.y,person.z]);
    }
  }
  citizens.setQuality('low');assert.equal(citizens.people.length,4);assert.equal(citizens.visuals.length,4);
  citizens.setQuality('high');assert.equal(citizens.people.length,12);
  citizens.setPoints([],40);assert.equal(citizens.people.length,0);assert.equal(citizens.visuals.length,0);citizens.dispose();
});

test('city citizens retain fallback on unavailable animations and never dispose shared primitive materials',async()=>{
  const scene=new T.Scene(),citizens=new Citizens(scene,10,{loader:{async loadAsync(){return {scene:new T.Group(),animations:[]};}}});citizens.setPoints(paths(),6);await citizens.ready;
  assert.equal(citizens.visuals.length,0);assert.equal(citizens.metrics().fallback,true);assert.ok(citizens.meshes.every(m=>m.visible));
  citizens.tick(.1,.1);let materialReleases=0,geometryReleases=0;
  const materials=new Set(citizens.meshes.map(m=>m.material));for(const material of materials)material.addEventListener('dispose',()=>materialReleases++);
  for(const mesh of citizens.meshes)mesh.geometry.addEventListener('dispose',()=>geometryReleases++);
  citizens.dispose();assert.equal(materialReleases,0);assert.equal(geometryReleases,5);
});

test('city citizens use a surviving original rig after one load fails',async()=>{
  const citizens=new Citizens(new T.Scene(),8,{loader:{async loadAsync(url){if(url.includes('adult-woman'))throw Error('offline');return rig();}}});citizens.setPoints(paths(),8);
  assert.equal(await citizens.ready,true);assert.equal(citizens.visuals.length,8);assert.deepEqual(citizens.metrics().models,[MAN]);citizens.dispose();
});

test('disabled citizens skip loading and pending owned loads cannot attach after disposal',async()=>{
  let calls=0;const hidden=new Citizens(new T.Scene(),40,{enabled:false,loader:{async loadAsync(){calls++;return rig();}}});hidden.setPoints(paths(),40);
  assert.equal(await hidden.ready,false);assert.equal(calls,0);assert.equal(hidden.people.length,0);assert.equal(hidden.root.visible,false);hidden.dispose();
  const pending=[],scene=new T.Scene(),citizens=new Citizens(scene,12,{loader:{loadAsync(){return new Promise(resolve=>pending.push(resolve));}}});citizens.setPoints(paths(),12);citizens.dispose();let released=0;
  for(const resolve of pending){const source=rig();source.mesh.geometry.addEventListener('dispose',()=>released++);resolve(source);}
  assert.equal(await citizens.ready,false);assert.equal(released,2);assert.equal(scene.children.length,0);assert.equal(citizens.visuals.length,0);
});
