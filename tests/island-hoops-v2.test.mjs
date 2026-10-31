import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';
import * as THREE from '../workout/island/vendor/three.module.js';
import {clone} from '../workout/island/vendor/SkeletonUtils.js';
import {bakeV2Motion,createV2MotionPlayer,chooseV2Motion,actionClipTime,V2_ACTION_CLIPS} from '../workout/island/minigames/hoops-motion-v2.mjs';
import {prepareV2Geometry,createAvatar} from '../workout/island/minigames/hoops-players.mjs';
const base=new URL('../workout/island/',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,base),'utf8'));
let shared;
async function fixture(){
 if(!shared)shared=(async()=>{const bytes=await readFile(new URL('design/hoops/lod/hoops-player-v2-lod.glb',base)),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const [rig,map,motion,manifest,regions]=await Promise.all([json('design/characters/rig.json'),json('design/viewer/retarget-map.json'),json('design/motion/hoops.json'),json('design/motion2/hoops/manifest.json'),json('design/characters2/regions.json')]);const packages=await Promise.all(manifest.clips.map(c=>json('design/motion2/hoops/'+c.file)));return {bytes,gltf,rig,map,motion,manifest,regions,baked:await bakeV2Motion(gltf.scene,rig,motion,packages,map)};})();
 return shared;
}
test('live v2 LOD is derived from the exact characters2 source and retains its full rig within the approved 6500-triangle detail budget',async()=>{
 const {bytes,gltf,rig}=await fixture(),proof=await json('design/hoops/lod/hoops-player-v2-provenance.json'),source=await readFile(new URL(proof.source,base));
 const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(proof.source,'design/characters2/basketball-player.glb');assert.equal(sha(source),proof.sourceSha256);assert.equal(sha(bytes),proof.outputSha256);
 const meshes=[];gltf.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});assert.equal(meshes.length,1);const mesh=meshes[0];assert.equal(mesh.skeleton.bones.length,20);assert.equal(mesh.geometry.index.count/3,proof.triangles);assert.ok(proof.triangles>=5500&&proof.triangles<=6500);
 for(let i=0;i<20;i++){assert.equal(mesh.skeleton.bones[i].name,rig.joints[i].name);for(let k=0;k<16;k++)assert.ok(Math.abs(mesh.skeleton.boneInverses[i].elements[k]-rig.joints[i].inverseBindMatrix[k])<1e-6);}
 for(let i=0;i<mesh.geometry.attributes.position.count;i++){let weight=0;for(let k=0;k<4;k++){assert.ok(mesh.geometry.attributes.skinIndex.getComponent(i,k)<20);weight+=mesh.geometry.attributes.skinWeight.getComponent(i,k);}assert.ok(Math.abs(weight-1)<2e-5);}
});
test('all 25 manifest clips are retargeted with finite normalized rotations and local root channels',async()=>{
 const {baked,manifest}=await fixture();assert.deepEqual(manifest.clips.map(c=>c.clip).sort(),[...V2_ACTION_CLIPS].sort());assert.ok(baked.proof.mappingComplete);assert.ok(baked.proof.bindMaxTranslationErrorMeters<1e-6);
 for(const {clip:name} of manifest.clips){const clip=baked.clips.get(name);assert.ok(clip);assert.equal(clip.tracks.filter(t=>t.name.endsWith('.quaternion')).length,20);for(const track of clip.tracks){for(const value of track.values)assert.ok(Number.isFinite(value));if(track.getValueSize()===4)for(let i=0;i<track.values.length;i+=4)assert.ok(Math.abs(Math.hypot(...track.values.slice(i,i+4))-1)<2e-5);if(track.name==='Root.position')for(let i=0;i<track.values.length;i+=3){assert.ok(Math.abs(track.values[i])<1e-5);assert.ok(Math.abs(track.values[i+2])<1e-5,'reference locomotion must not move engine world position');}}}
});
test('every authored action has a natural presentation selection without changing simulation state',()=>{
 const p={vx:0,vz:0,face:0,act:'',actT:0,z:1,hasBall:false},pick=(patch={},ctx={},hint=null)=>chooseV2Motion({...p,...patch},ctx,hint),seen=new Set();
 for(const name of ['celebration','defensive_switch','receive','screen','steal_success','steal_fail'])seen.add(pick({}, {},name));
 for(const act of ['fake','cross','spin','block','rebound','steal'])seen.add(pick({act}));
 for(const shotType of ['dunk','ft','layup'])seen.add(pick({act:'shoot',shotType}));seen.add(pick({act:'shoot',shotType:'layup',z:-1}));
 seen.add(pick({act:'pass'}));seen.add(pick({act:'pass'},{passKind:'lob'}));
 for(const [vx,vz] of [[2,0],[-2,0],[0,2]])seen.add(pick({vx,vz},{defending:true}));
 for(const [vx,vz,sprinting] of [[0,0,false],[0,3,false],[0,6,true],[0,-1,false]])seen.add(pick({hasBall:true,vx,vz,sprinting}));seen.add(pick({vz:6,sprinting:true}));
 assert.deepEqual([...seen].filter(n=>V2_ACTION_CLIPS.includes(n)).sort(),[...V2_ACTION_CLIPS].sort());const frozen=Object.freeze({...p,act:'shoot',shotType:'dunk',hasBall:true});chooseV2Motion(frozen);assert.equal(frozen.hasBall,true);
});
test('engine release and pause control the new clips; interruption preserves the displayed pose and world transform',async()=>{
 const {gltf,baked}=await fixture(),root=clone(gltf.scene),machine=createV2MotionPlayer(root,baked),p={vx:0,vz:0,face:0,act:'',actT:0,hasBall:true,z:1};root.position.set(3,.5,-4);root.rotation.y=.7;root.scale.setScalar(1.5);
 machine.step(p,{},1/60);const bones=[];root.traverse(o=>{if(o.isBone)bones.push(o);});const pose=bones.map(b=>b.quaternion.toArray()),time=machine.time;machine.step(p,{},0);assert.equal(machine.time,time);
 machine.step({...p,act:'fake',actT:.1},{},1/60);for(let i=0;i<bones.length;i++)assert.ok(bones[i].quaternion.clone().normalize().angleTo(bones[i].quaternion.clone().fromArray(pose[i]).normalize())<.00001,'entry begins from the displayed pose');
 assert.deepEqual(root.position.toArray(),[3,.5,-4]);assert.equal(root.rotation.y,.7);
 const s=baked.states.dunk,marker=s.events.find(e=>e.name==='visual_dunk_release').atSeconds,held=actionClipTime(s,'dunk',{act:'shoot',actT:30,hasBall:true,shotType:'dunk'},{},{layup:{release:.8,duration:1.5}},null);assert.ok(held<marker);assert.ok(actionClipTime(s,'dunk',{act:'shoot',actT:1,hasBall:false,shotType:'dunk'},{},{layup:{release:.8,duration:1.5}},1)>=marker);machine.dispose();
});
test('v2 kits retain indexed sculpted features, skin variety and owned-resource cleanup',async()=>{
 const {gltf,baked,regions}=await fixture();let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});const prepared=prepareV2Geometry(mesh.geometry,regions);assert.equal(prepared.geometry.index.count,mesh.geometry.index.count);assert.equal(prepared.geometry.attributes.position.count,mesh.geometry.attributes.position.count);for(const region of ['shirt','shorts','skin','hair','preserve'])assert.ok(prepared.regions.includes(region));for(const value of prepared.geometry.attributes.uv.array)assert.ok(value>=0&&value<=1);
 const oldCanvas=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=class{constructor(width,height){this.width=width;this.height=height;}getContext(){return new Proxy({},{get:()=>()=>{}});}};
 const previous=mesh.geometry;mesh.geometry=prepared.geometry;
 try{
  const assets={...baked,character:gltf,height:1.275,regions:prepared.regions},look={primary:'#4821aa',secondary:'#181e3e',trim:'#ffbb66'},a=createAvatar(assets,{id:'a',number:7,ratings:{height:200},look:{skin:0}},look),b=createAvatar(assets,{id:'b',number:8,ratings:{height:198},look:{skin:3}},look);
  assert.equal(a.kind,'characters2');assert.ok(a.hands.r&&a.hands.l);let am,bm;a.root.traverse(o=>{if(o.isMesh)am=o;});b.root.traverse(o=>{if(o.isMesh)bm=o;});const skin=prepared.regions.indexOf('skin');assert.notDeepEqual(Array.from(am.geometry.attributes.color.array.slice(skin*3,skin*3+3)),Array.from(bm.geometry.attributes.color.array.slice(skin*3,skin*3+3)));assert.equal(am.material.side,0);assert.ok(!am.material.aoMap);assert.equal(am.material.isMeshPhongMaterial,true);assert.equal(am.material.shininess,18);assert.equal(am.material.specular.getHex(),0x151a22);assert.equal(am.material.userData.hoopsSparseSkinning,true);assert.equal(am.customDepthMaterial.userData.hoopsSparseSkinning,true);const texture=am.material.map,version=texture.version;a.applyKit({base:'#e43a52',accent:'#f0eee8',pattern:'stripes'});assert.equal(am.material.map,texture);assert.ok(texture.version>version);let disposals=0;texture.addEventListener('dispose',()=>disposals++);a.dispose();a.dispose();assert.equal(disposals,1);b.dispose();
 }finally{mesh.geometry=previous;prepared.geometry.dispose();globalThis.OffscreenCanvas=oldCanvas;}
});

test('late frames release unreachable foot plants and locomotion follows authoritative displacement',async()=>{
 const {gltf,baked}=await fixture(),root=clone(gltf.scene),machine=createV2MotionPlayer(root,baked),p={vx:0,vz:3,face:0,act:'',actT:0,hasBall:false,air:false};root.scale.setScalar(1.55);machine.step({...p,vz:0},{},1/60);
 const feet=[];root.traverse(o=>{if(o.name==='LeftFoot'||o.name==='RightFoot')feet.push(o);});
 for(let frame=1;frame<=25;frame++){root.position.z+=.65;machine.step(p,{defending:true},.05);root.updateMatrixWorld(true);const min=Math.min(...feet.map(b=>b.getWorldPosition(new THREE.Vector3()).y));assert.ok(min<.24,`late frame ${frame}: feet lifted into a seated pose (${min})`);}
 const before=machine.time;root.position.z+=.5;machine.step(p,{defending:true},.01);const stride=baked.states.defensive_run.referenceLocomotion.speedMetersPerSecond*baked.motionScale*root.scale.y;assert.ok(Math.abs((machine.time-before)-.5/stride)<1e-8,'visual stride follows actual world distance despite capped render time');
 root.position.y=.6;machine.step({...p,act:'block',actT:.35,air:true},{},.02);assert.equal(root.position.y,.6,'jump height remains entirely engine-owned');machine.dispose();
});

test('fixed conservative player culling bounds include skinned vertices of all 35 clips without per-frame skin bounds',async context=>{
 const {gltf,baked}=await fixture(),root=clone(gltf.scene),bones={};let mesh;root.traverse(o=>{if(o.isBone)bones[o.name]=o;if(o.isSkinnedMesh)mesh=o;});mesh.geometry.computeBoundingBox();const height=mesh.geometry.boundingBox.max.y-mesh.geometry.boundingBox.min.y,sphere=new THREE.Sphere(new THREE.Vector3(0,height/2,0),1.35),point=new THREE.Vector3();let furthest=0;
 for(const clip of baked.clips.values())for(const phase of [0,.2,.4,.6,.8,.999]){
  for(const track of clip.tracks){const [name,property]=track.name.split('.');bones[name][property].fromArray(track.createInterpolant().evaluate(clip.duration*phase));}root.updateMatrixWorld(true);mesh.skeleton.update();
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point);furthest=Math.max(furthest,point.distanceTo(sphere.center));assert.ok(sphere.containsPoint(point),`${clip.name} pose escaped the fixed sphere`);}
 }
 context.diagnostic(`maximum sampled pose radius: ${furthest.toFixed(4)} source metres; fixed 1.35 sphere`);assert.ok(furthest>height*.6,'test exercises extended action poses');assert.ok(sphere.radius>=furthest*1.35,'the culling sphere retains at least 35% margin across all 35 clips');
});
