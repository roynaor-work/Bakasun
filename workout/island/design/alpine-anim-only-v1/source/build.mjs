// CC0-1.0. New animation channels only; existing v7 geometry is read for IK/floor measurements.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as THREE from '../../../vendor/three.module.js';
import {createMotionAnimator,BONE_NAMES} from '../../alpine-v7/motion/motion.mjs';
import {documentScene} from '../../alpine-v7/tools/motion-bake.mjs';

const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(process.env.ALPINE_TOOLS_PACKAGE||'/tmp/alpine-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {KHRDracoMeshCompression}=require('@gltf-transform/extensions');
const codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
const source=path.resolve(out,'../alpine-v7/characters/ski-male.glb');
const sourceBytes=await fs.readFile(source),rig=JSON.parse(await fs.readFile(path.resolve(out,'../alpine-v7/characters/rig.json'),'utf8'));
const {scene,byName}=documentScene(await io.read(source));
const names=[...BONE_NAMES,'LeftPole','RightPole'];
const nodes=names.map(name=>{
 const n=byName[name];return {name,translation:n.position.toArray(),rotation:n.quaternion.toArray(),scale:n.scale.toArray(),children:n.children.filter(c=>names.includes(c.name)).map(c=>names.indexOf(c.name))};
});
// Use the actual GLB rest TRS, including omitted unit scales; rig.json differs by float roundoff.
rig.joints=rig.joints.map(j=>({...j,...Object.fromEntries(['translation','rotation','scale'].map(k=>[k,nodes.find(n=>n.name===j.name)[k]]))}));
const animator=createMotionAnimator(scene,{rig,sport:'ski',geometryFloor:true});
const specs=[
 {id:'snowplow_brake',label:'מחרשה · בלימה',durationSeconds:2,loop:true},
 {id:'landing',label:'נחיתה',durationSeconds:1.2,loop:false},
 {id:'air_180',label:'סיבוב 180 באוויר',durationSeconds:2.4,loop:false},
 {id:'air_360',label:'סיבוב 360 באוויר',durationSeconds:2.8,loop:false},
 {id:'trick_landing',label:'נחיתה אחרי טריק',durationSeconds:1.4,loop:false},
 {id:'fall',label:'נפילה',durationSeconds:2.4,loop:false},
 {id:'get_up',label:'קימה',durationSeconds:2.8,loop:false},
];
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10);};
const qYaw=a=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),a);
const snapshot=()=>Object.fromEntries(names.map(n=>[n,{p:byName[n].position.toArray(),q:byName[n].quaternion.toArray()}]));

function pose(id,u){
 if(id==='air_180'||id==='air_360'){
  // Reuse the v7 bind-aware jump solution, resampled at the requested 30 Hz.
  animator.apply(id==='air_180'?'trick_180':'trick_360',u*(id==='air_180'?3.2:3.6),{wrap:false});
 }else if(id==='fall'||id==='get_up'){
  // Controlled side fall and pole-assisted rise share exactly the same resting pose.
  const phase=id==='fall'?1-smooth((u-.06)/.87):smooth((u-.10)/.83);
  animator.apply('get_up',3.8*phase,{wrap:false});
  // Keep even the virtual origin on/above snow during the side-pivot.
  // v7's source floor solver protects geometry but permits a negative Root.
  byName.Root.position.y=Math.max(0,byName.Root.position.y);
 }else if(id==='snowplow_brake'){
  const wave=Math.sin(2*Math.PI*u),load=.5-.5*Math.cos(2*Math.PI*u);
  animator.apply('glide',0,{wrap:false});
  byName.Hips.position.y-=.025+.005*load;animator.update();
  const rootQ=animator.rootWorldQuaternion();
  for(const [side,sign] of [['Left',1],['Right',-1]]){
   const foot=byName[side+'Foot'];
   const worldQ=rootQ.clone().multiply(qYaw(-sign*.18)).multiply(animator.bindWorld[side+'Foot']);
   // The complete blade is 1.17m in source units. This width keeps tips apart.
   const sole=new THREE.Vector3(sign*.22,0,animator.restSole[side+'Foot'].z);
   const ankle=sole.sub(animator.soles[side+'Foot'].clone().applyQuaternion(worldQ));
   let low=Infinity;for(const v of animator.footPoints[side+'Foot'])low=Math.min(low,v.clone().applyQuaternion(worldQ).y+ankle.y);
   ankle.y-=low;
   animator.solveLimb(side+'UpLeg',side+'Leg',side+'Foot',ankle,new THREE.Vector3(sign*.20,.26,.29));
   animator.worldQuaternion(foot,worldQ);animator.update();
  }
  byName.Chest.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.006*wave));animator.update();
 }else{
  // Start at snow contact; absorb impact, rebound, then settle into v7 ready.
  const depth=id==='trick_landing'?.13:.095;
  const compression=u<.27?smooth(u/.27):1-smooth((u-.27)/.73);
  animator.apply('glide',0,{wrap:false});
  byName.Hips.position.y-=depth*compression;
  byName.Hips.position.z-=.018*compression;
  byName.Spine.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.12*compression));
  if(id==='trick_landing')byName.Chest.quaternion.multiply(qYaw(.11*Math.sin(Math.PI*u)*(1-u)));
  animator.update();
  for(const [side,sign]of [['Left',1],['Right',-1]]){
   const foot=byName[side+'Foot'],goal=new THREE.Vector3(sign*.127,0,animator.restSole[side+'Foot'].z).sub(animator.soles[side+'Foot'].clone().applyQuaternion(animator.bindWorld[side+'Foot']));
   let low=Infinity;for(const v of animator.footPoints[side+'Foot'])low=Math.min(low,v.clone().applyQuaternion(animator.bindWorld[side+'Foot']).y+goal.y);goal.y-=low;
   animator.solveLimb(side+'UpLeg',side+'Leg',side+'Foot',goal,new THREE.Vector3(sign*.162,.24,.29));
   animator.worldQuaternion(foot,animator.bindWorld[side+'Foot']);animator.update();
  }
 }
 animator.update();
 if(id==='landing'||id==='trick_landing'||id==='snowplow_brake')for(const [side,sign]of [['Left',1],['Right',-1]]){
  // Re-aim attached shafts after lowering the torso; the poles must clear snow too.
  const pole=byName[side+'Pole'],grip=pole.getWorldPosition(new THREE.Vector3());
  const down=Math.max(.05,Math.min(.88,(grip.y-.035)/.75)),lateral=sign*.12;
  const direction=new THREE.Vector3(lateral,-down,-Math.sqrt(Math.max(0,1-down*down-lateral*lateral))).normalize();
  animator.worldQuaternion(pole,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),direction));
 }
 // A 2mm clearance protects the ski blade against subframe LINEAR interpolation.
 byName.Root.position.y+=.002;animator.update();
 return snapshot();
}

const gltf={asset:{version:'2.0',generator:'Bakasun alpine-anim-only-v1 · v7 local tracks · CC0'},scene:0,scenes:[{nodes:[0]}],nodes:nodes.map(n=>({...n,children:n.children.length?n.children:undefined})),animations:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
const chunks=[];let offset=0;
function accessor(values,type){
 const bytes=Buffer.from(new Float32Array(values).buffer),width=type==='SCALAR'?1:type==='VEC3'?3:4;
 gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;
 const a={bufferView:gltf.bufferViews.length-1,componentType:5126,count:values.length/width,type};
 if(type==='SCALAR'){a.min=[values[0]];a.max=[values.at(-1)];}
 gltf.accessors.push(a);return gltf.accessors.length-1;
}
const geometryChecks=[];
let constantTime;
for(const spec of specs){
 const count=Math.round(spec.durationSeconds*30)+1,times=Array.from({length:count},(_,i)=>i/30),frames=[];
 let minimumGeometryY=Infinity;
 for(let i=0;i<count;i++){
  frames.push(pose(spec.id,i/(count-1)));
  for(const {bone,local}of animator.bodyPoints)minimumGeometryY=Math.min(minimumGeometryY,local.clone().applyMatrix4(bone.matrixWorld).y);
 }
 const animation={name:spec.id,samplers:[],channels:[],extras:{sampleHz:30,loop:spec.loop,label:spec.label}};
 const input=accessor(times,'SCALAR');
 for(const [i,name]of names.entries())for(const [key,property,type]of [['q','rotation','VEC4'],['p','translation','VEC3']]){
  const values=frames.flatMap(f=>f[name][key]);
  if(key==='q')for(let n=4;n<values.length;n+=4)if(values.slice(n,n+4).reduce((s,v,k)=>s+v*values[n-4+k],0)<0)for(let k=0;k<4;k++)values[n+k]*=-1;
  const rest=nodes[i][property];
  if(values.every((v,k)=>Math.abs(v-rest[k%rest.length])<1e-7))continue;
  // A mathematically constant channel needs one key. All changing channels retain every 30Hz sample.
  const width=key==='q'?4:3,constant=values.every((v,k)=>Math.abs(v-values[k%width])<1e-8);
  if(constant&&constantTime===undefined)constantTime=accessor([0],'SCALAR');
  const output=accessor(constant?values.slice(0,width):values,type);animation.channels.push({sampler:animation.samplers.length,target:{node:i,path:property}});animation.samplers.push({input:constant?constantTime:input,output,interpolation:'LINEAR'});
 }
 gltf.animations.push(animation);geometryChecks.push({id:spec.id,samples:count,minimumDominantProxyY:minimumGeometryY});
}
gltf.buffers[0].byteLength=offset;
const json=Buffer.from(JSON.stringify(gltf)),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),bin=Buffer.concat(chunks),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jp.length+8+bin.length,8);jh.writeUInt32LE(jp.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
const glb=Buffer.concat([header,jh,jp,bh,bin]);await fs.writeFile(path.join(out,'clips.glb'),glb);
const feet=['LeftFoot','RightFoot'];
for(const spec of specs){
 spec.name=spec.id;spec.file='clips.glb';spec.sampleHz=30;spec.samples=Math.round(spec.durationSeconds*30)+1;
 // Full planted intervals for fall/rise, measured from the actual sole at 30Hz.
 const spans=spec.id.startsWith('air_')?[[0,spec.durationSeconds*.23],[spec.durationSeconds*.77,spec.durationSeconds]]:spec.id==='fall'?[[0,20/30]]:spec.id==='get_up'?[[61/30,spec.durationSeconds]]:[[0,spec.durationSeconds]];
 spec.contacts=feet.flatMap(bone=>spans.map(([start,end])=>({bone,start,end,local:animator.soles[bone].toArray()})));
 spec.events=spec.id.startsWith('air_')?[{name:'takeoff',time:spec.durationSeconds*.23},{name:'landing',time:spec.durationSeconds*.77}]:spec.id.includes('landing')||spec.id==='landing'?[{name:'snow_contact',time:0},{name:'max_compression',time:spec.durationSeconds*.27}]:spec.id==='fall'?[{name:'balance_lost',time:.144},{name:'settled',time:2.232}]:spec.id==='get_up'?[{name:'recovery_allowed',time:0},{name:'ready',time:2.604}]:[{name:'brake_pressure_peak',time:1}];
 spec.references={entry:spec.id==='get_up'?'fallen':'ready',exit:spec.id==='fall'?'fallen':spec.id==='air_180'?'ready_switch':'ready'};
 if(spec.loop)spec.references={entry:'self',exit:'self'};
}
animator.apply('glide',0,{wrap:false});const ready=snapshot();animator.apply('get_up',0,{wrap:false});const fallen=snapshot();
const catalog={schemaVersion:1,id:'alpine-anim-only-v1',license:'CC0-1.0',sampleHz:30,units:'metres',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},format:'glTF 2.0 animation-only; local absolute xyzw quaternions, LINEAR interpolation',file:'clips.glb',bytes:glb.length,sha256:createHash('sha256').update(glb).digest('hex'),source:{file:'../alpine-v7/characters/ski-male.glb',sha256:createHash('sha256').update(sourceBytes).digest('hex'),rigFile:'../alpine-v7/characters/rig.json',bind:'Exact existing v7 local TRS; not generic motion2 canonical rest transforms'},heightMeters:1.29,worldScale:1.35,soleProbes:Object.fromEntries(feet.map(n=>[n,animator.soles[n].toArray()])),referencePoses:{ready,fallen},clips:specs,playback:{binding:'Bind clips by exact node names to an existing v7 skier scene. Do not retarget, rescale bone lengths, or alter inverse binds.',groundTravel:'In-place clips. Host owns world X/Z translation. Sliding skis intentionally have no walking gait model.',switch:'air_180 ends at Root yaw +pi. Preserve that heading by transferring the Root end transform to the host and rebasing Root channels, or pre-multiply subsequent Root tracks by the end transform. trick_landing is relative to the inherited heading.',fallRecovery:'fall exit and get_up entry share the same side-rest pose; clamp one-shots, never loop falls or landings.'}};
catalog.qa={supportLocal:catalog.soleProbes,soleProbes:Object.fromEntries(feet.map(n=>{
 // Actual blade/boot vertices, extremes in bind world XYZ (not an invented ankle offset).
 const points=animator.footPoints[n],q=animator.bindWorld[n],selected=new Map();
 for(const axis of ['x','y','z'])for(const sign of [-1,1]){
  let chosen=points[0],best=-Infinity;
  for(const p of points){const value=p.clone().applyQuaternion(q)[axis]*sign;if(value>best){best=value;chosen=p;}}
  selected.set(chosen.toArray().join(','),chosen.toArray());
 }
 return[n,[...selected.values()]];
})),probeMethod:'Six geometric extremal vertices per v7 dominant-weight foot in calibrated bind world XYZ; support uses average actual lowest blade surface. Full dominant-weight skinned geometry separately checked at all authored samples.',checkHingeDirection:false};
// Reference definitions live in the adapter and read v7 independently; no extra animation clips.
delete catalog.referencePoses;
await fs.writeFile(path.join(out,'catalog.json'),JSON.stringify(catalog)+'\n');
console.log(JSON.stringify({bytes:glb.length,clips:geometryChecks}));
