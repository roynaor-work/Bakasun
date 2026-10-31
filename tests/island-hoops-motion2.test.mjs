import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../workout/island/vendor/three.module.js';
const base=new URL('../workout/island/',import.meta.url),motion=JSON.parse(await readFile(new URL('design/motion2/hoops.json',base),'utf8'));
const bytes=await readFile(new URL('assets/models/hoops-anim.glb',base)),jsonLength=bytes.readUInt32LE(12),source=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binOffset=20+jsonLength+8;
const json=motion.clips[0],clip=THREE.AnimationClip.parse(json),q=array=>new THREE.Quaternion().fromArray(array).normalize();
function accessor(index){
 const a=source.accessors[index],view=source.bufferViews[a.bufferView],n=a.type==='SCALAR'?1:4,size=a.componentType===5126?4:2,offset=binOffset+(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||n*size;
 assert.ok(a.componentType===5126||a.componentType===5122);
 return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>a.componentType===5126?bytes.readFloatLE(offset+i*stride+k*size):Math.max(-1,bytes.readInt16LE(offset+i*stride+k*size)/32767)));
}
test('fake-shot package parses as a standard local THREE clip with the exact authored duration',()=>{
 assert.equal(motion.format,'three-animation-clip-json');assert.equal(motion.clips.length,1);assert.equal(clip.name,'fake_shot');assert.equal(clip.duration,.62);assert.equal(clip.validate(),true);
 assert.equal(clip.tracks.length,18);assert.ok(clip.tracks.every(track=>track instanceof THREE.QuaternionKeyframeTrack));
});
test('every key is finite, normalized and ordered, including the full return to its initial pose',()=>{
 for(const track of json.tracks){
  assert.deepEqual(track.times,[0,.14,.28,.42,.62]);assert.equal(track.values.length,track.times.length*4);assert.ok(track.values.every(Number.isFinite),track.name);
  for(let i=0;i<track.values.length;i+=4)assert.ok(Math.abs(Math.hypot(...track.values.slice(i,i+4))-1)<2e-8,track.name+' quaternion '+i/4);
  assert.deepEqual(track.values.slice(0,4),track.values.slice(-4),track.name+' closes on its exact initial pose');
  assert.deepEqual(track.values.slice(4,8),track.values.slice(12,16),track.name+' reverses the raise');
 }
});
test('track names bind to real sanitized GLTF bones without root movement or unrelated finger tracks',()=>{
 const names=new Set(source.nodes.map(node=>THREE.PropertyBinding.sanitizeNodeName(node.name||''))),seen=new Set();
 for(const track of json.tracks){
  assert.equal(track.type,'quaternion');assert.match(track.name,/\.quaternion$/);const name=track.name.slice(0,-'.quaternion'.length);
  assert.ok(names.has(name),name);assert.equal(seen.has(name),false);seen.add(name);assert.doesNotMatch(name,/Root|Toe|Finger|Index|Middle|Pinky|Ring|Thumb/);
 }
 for(const bone of ['Hips','Spine','Spine1','Spine2','LeftArm','RightArm','LeftForeArm','RightForeArm','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'])assert.ok(seen.has('mixamorig'+bone),bone);
});
test('source provenance and inherited CMU terms remain attached to the derived timing edit',()=>{
 assert.equal(motion.sources[0].path,'assets/models/hoops-anim.glb');assert.equal(motion.sources[0].clip,'jumpshot');
 assert.equal(motion.sources[0].sha256,createHash('sha256').update(bytes).digest('hex'));assert.match(motion.authorship.license,/CMU/);assert.doesNotMatch(motion.authorship.license,/CC0/);
 assert.deepEqual(motion.sources[0].sourceTimeSeconds,[0,.24,.5,.24,0]);assert.deepEqual(motion.sources[0].outputTimeSeconds,[0,.14,.28,.42,.62]);
});
test('peak rotations are independently recoverable from the existing jumpshot at 0.5 seconds',()=>{
 const original=source.animations.find(animation=>animation.name==='jumpshot');
 for(const track of json.tracks){
  const name=track.name.slice(0,-'.quaternion'.length),channel=original.channels.find(c=>c.target.path==='rotation'&&THREE.PropertyBinding.sanitizeNodeName(source.nodes[c.target.node].name)===name);
  assert.ok(channel);const sampler=original.samplers[channel.sampler],times=accessor(sampler.input).map(a=>a[0]);
  const sourceTrack=new THREE.QuaternionKeyframeTrack(name,times,accessor(sampler.output).flat());
  const expected=q(sourceTrack.createInterpolant().evaluate(.5)),actual=q(track.values.slice(8,12));assert.ok(expected.angleTo(actual)<1e-6,name);
 }
});
test('the upper body visibly raises for the fake instead of containing an idle or empty clip',()=>{
 const arms=json.tracks.filter(track=>/mixamorig(Left|Right)(Arm|ForeArm)\.quaternion$/.test(track.name));
 assert.equal(arms.length,4);const angles=arms.map(track=>q(track.values.slice(0,4)).angleTo(q(track.values.slice(8,12))));
 assert.ok(angles.some(angle=>angle>.2),JSON.stringify(angles));
});
test('a real mixer evaluates the clip on the target bone names and leaves world translation untouched',()=>{
 const root=new THREE.Group(),bones=new Map();
 for(const node of source.nodes){const bone=new THREE.Bone();bone.name=THREE.PropertyBinding.sanitizeNodeName(node.name||'');bone.position.set(2,3,4);root.add(bone);bones.set(bone.name,bone);}
 root.position.set(7,0,-3);const before=root.position.clone(),positions=new Map([...bones].map(([name,bone])=>[name,bone.position.clone()]));
 const mixer=new THREE.AnimationMixer(root),action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(.28);
 for(const track of json.tracks){const bone=bones.get(track.name.slice(0,-'.quaternion'.length));assert.ok(bone.quaternion.clone().normalize().angleTo(q(track.values.slice(8,12)))<1e-6,track.name);}
 mixer.setTime(.62);for(const track of json.tracks)assert.ok(bones.get(track.name.slice(0,-'.quaternion'.length)).quaternion.clone().normalize().angleTo(q(track.values.slice(0,4)))<1e-6,track.name);
 assert.deepEqual(root.position,before);for(const [name,bone] of bones)assert.deepEqual(bone.position,positions.get(name));mixer.stopAllAction();mixer.uncacheRoot(root);
});
test('motion is presentation data and cannot carry gameplay release, possession or scoring events',()=>{
 function inspect(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){assert.doesNotMatch(key,/^(events?|release|score|possession|rootMotion|translation|position)$/i);inspect(child);}}
 inspect(motion);
});
