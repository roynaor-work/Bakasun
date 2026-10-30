#!/usr/bin/env node
// Independent asset-contract checks; no Draco decoder or browser is needed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as THREE from '../../vendor/three.module.js';
import {Retargeter} from './retarget.js';

const readJSON=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const rig=await readJSON('../characters/rig.json');
const map=await readJSON('./retarget-map.json');
const packages=await Promise.all(['soccer','hoops','alpine'].map(name=>readJSON(`../motion/${name}.json`)));
const source=packages[0].skeleton.bones;
const vector=a=>new THREE.Vector3().fromArray(a);
const quaternion=a=>new THREE.Quaternion().fromArray(a).normalize();

/** Read original uncompressed skeleton and inverse matrices directly from GLB
 * chunks/accessors. This does not use GLTFLoader or reset the loaded transforms.
 */
async function readAsset(name) {
  const bytes=await readFile(new URL(`../characters/${name}.glb`,import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67,'GLB signature');
  assert.equal(bytes.readUInt32LE(4),2,'GLB version');
  assert.equal(bytes.readUInt32LE(8),bytes.length,'GLB length');
  const jsonLength=bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a,'JSON chunk type');
  const gltf=JSON.parse(bytes.subarray(20,20+jsonLength));
  assert.equal(bytes.readUInt32LE(24+jsonLength),0x004e4942,'BIN chunk type');
  const bin=bytes.subarray(28+jsonLength);
  const skin=gltf.skins[0];
  const nodes=gltf.nodes.map(n=>{
    const o=new THREE.Bone();o.name=n.name;
    if(n.translation)o.position.fromArray(n.translation);
    if(n.rotation)o.quaternion.fromArray(n.rotation);
    if(n.scale)o.scale.fromArray(n.scale);
    return o;
  });
  gltf.nodes.forEach((n,i)=>{for(const child of n.children||[])nodes[i].add(nodes[child]);});
  const scene=new THREE.Group();
  for(const i of gltf.scenes[gltf.scene||0].nodes)scene.add(nodes[i]);
  const accessor=gltf.accessors[skin.inverseBindMatrices],view=gltf.bufferViews[accessor.bufferView];
  assert.equal(accessor.type,'MAT4');assert.equal(accessor.componentType,5126);
  assert.equal(accessor.count,skin.joints.length);
  const offset=(view.byteOffset||0)+(accessor.byteOffset||0),stride=view.byteStride||64;
  const matrices=skin.joints.map((_,i)=>{
    const elements=Array.from({length:16},(_,k)=>bin.readFloatLE(offset+i*stride+k*4));
    return new THREE.Matrix4().fromArray(elements);
  });
  const skeleton=new THREE.Skeleton(skin.joints.map(i=>nodes[i]),matrices);
  const bones=Object.fromEntries(skin.joints.map(i=>[nodes[i].name,nodes[i]]));
  // Geometry is deliberately absent: mapping rejection must happen before any
  // geometry sampling, and raw inverse matrices remain independently readable.
  const mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());
  mesh.skeleton=skeleton;scene.add(mesh);scene.updateMatrixWorld(true);
  return {scene,bones,meshes:[mesh],gltf};
}

test('all three motion packages share the identical 18-bone contract',()=>{
  assert.equal(source.length,18);
  for(const data of packages)assert.deepEqual(data.skeleton,packages[0].skeleton);
});

test('JSON maps 18 source bones and both additional shoulders to all 20 target bones',()=>{
  assert.equal(map.bones.length,20);
  assert.deepEqual(map.bones.filter(b=>b.source!==null).map(b=>b.source).sort(),source.map(b=>b.name).sort());
  assert.deepEqual(map.bones.map(b=>b.target).sort(),rig.joints.map(j=>j.name).sort());
  const extras=map.bones.filter(b=>b.source===null);
  assert.deepEqual(extras.map(b=>b.target).sort(),['LeftShoulder','RightShoulder']);
  for(const b of extras){assert.equal(b.inheritSource,'Chest');assert.equal(b.targetParent,'Chest');}
  const byTarget=Object.fromEntries(rig.joints.map(j=>[j.name,j]));
  const bySource=Object.fromEntries(source.map(b=>[b.name,b]));
  for(const entry of map.bones){
    assert.equal(entry.targetParent,byTarget[entry.target].parent);
    assert.deepEqual(entry.targetBindTranslationMeters,byTarget[entry.target].translation);
    if(entry.source)assert.deepEqual(entry.sourceRestTranslationMeters,bySource[entry.source].restTranslationMeters);
    assert(Math.abs(new THREE.Quaternion().fromArray(entry.targetBasisWorldQuaternion).length()-1)<1e-12);
  }
});

test('identity source pose aligns target segments, including arms through extra parents',()=>{
  const chain={Hips:'Spine',Spine:'Chest',Chest:'Neck',Neck:'Head',LeftArm:'LeftForeArm',LeftForeArm:'LeftHand',RightArm:'RightForeArm',RightForeArm:'RightHand',LeftUpLeg:'LeftLeg',LeftLeg:'LeftFoot',RightUpLeg:'RightLeg',RightLeg:'RightFoot'};
  const joints=Object.fromEntries(rig.joints.map(j=>[j.name,j]));
  const sources=Object.fromEntries(source.map(b=>[b.name,b]));
  const entries=Object.fromEntries(map.bones.map(b=>[b.target,b]));
  for(const [bone,child] of Object.entries(chain)){
    const basis=quaternion(entries[bone].targetBasisWorldQuaternion);
    const actual=vector(joints[child].translation).applyQuaternion(basis).normalize();
    const expected=vector(sources[child].restTranslationMeters).normalize();
    assert(actual.distanceTo(expected)<1e-12,`${bone}: calibrated segment direction`);
  }
  for(const side of ['Left','Right']){
    const shoulder=quaternion(entries[`${side}Shoulder`].targetBasisWorldQuaternion);
    const arm=quaternion(entries[`${side}Arm`].targetBasisWorldQuaternion);
    const armLocal=shoulder.clone().invert().multiply(arm);
    assert(shoulder.clone().multiply(armLocal).angleTo(arm)<1e-7,`${side}: extra parent is included`);
    assert(armLocal.angleTo(quaternion(joints[`${side}Arm`].rotation))>.1,'arm mapping must compensate T-pose axes');
  }
  const lengths=side=>vector(joints[`${side}Leg`].translation).length()+vector(joints[`${side}Foot`].translation).length();
  assert(Math.abs(map.motionScale-(lengths('Left')+lengths('Right'))/(2*.78))<1e-12);
});

for(const name of ['soccer-player','goalkeeper','basketball-player','skier'])test(`${name}: untouched GLB bind and inverse matrices match the retarget contract`,async()=>{
  const asset=await readAsset(name);
  assert(asset.gltf.extensionsRequired.includes('KHR_draco_mesh_compression'));
  const proof=Retargeter.prototype.validateBind.call({...asset,rig,source,map,scale:map.motionScale});
  assert.equal(proof.sourceBoneCount,18);assert.equal(proof.targetBoneCount,20);assert.equal(proof.mappingComplete,true);
  assert.equal(proof.bindMaxTranslationErrorMeters,0);assert.equal(proof.bindMaxScaleError,0);assert.equal(proof.inverseBindMaxError,0);
  assert(proof.bindMaxRotationErrorRadians<1e-7);assert(proof.bindMaxQuaternionNormError<1e-7);
  assert(proof.calibrationMaxDirectionErrorRadians<1e-7);assert(proof.calibrationMaxBasisErrorRadians<1e-7);assert.equal(proof.motionScaleError,0);
});

for(const [label,corrupt] of [
  ['missing shoulder',m=>{m.bones=m.bones.filter(b=>b.target!=='LeftShoulder');}],
  ['duplicate mapping',m=>{m.bones.push(structuredClone(m.bones.at(-1)));}],
  ['wrong bone basis',m=>{m.bones.find(b=>b.target==='LeftArm').targetBasisWorldQuaternion=[0,0,0,1];}],
  ['wrong scale',m=>{m.motionScale+=.1;}],
  ['swapped left/right source',m=>{const a=m.bones.find(b=>b.target==='LeftArm'),b=m.bones.find(b=>b.target==='RightArm');[a.source,b.source]=[b.source,a.source];}],
])test(`reject corrupted map: ${label}`,async()=>{
  const asset=await readAsset('soccer-player');const changed=structuredClone(map);corrupt(changed);
  assert.throws(()=>new Retargeter(asset.scene,rig,packages[0].skeleton,changed),/Incomplete or geometrically inconsistent retarget map/);
});
