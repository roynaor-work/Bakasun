// SPDX-License-Identifier: CC0-1.0
// All writes confined to this asset pack. npm dependencies live outside Git.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from '../../../vendor/three.module.js';
import {BONE_NAMES,CLIPS,sampleParameters,smooth} from '../source/poses.mjs';
import {MotionAnimator} from '../source/motion.mjs';
import {documentScene} from '../source/scene.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(process.env.ALPINE_TRICKS_DEPS||'/tmp/alpine-tricks-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {KHRDracoMeshCompression}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf');
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
  'draco3d.decoder':await draco.createDecoderModule(),'draco3d.encoder':await draco.createEncoderModule()});
const source='../alpine-v7/characters/ski-male.glb';
const sourceBytes=await fs.readFile(path.resolve(ROOT,source));
const doc=await io.readBinary(sourceBytes),root=doc.getRoot();
const rig=JSON.parse(await fs.readFile(path.resolve(ROOT,'../alpine-v7/characters/rig.json'),'utf8'));
const {scene,byName}=documentScene(doc),animator=new MotionAnimator(scene,{sport:'ski',rig});
const nodes=Object.fromEntries(root.listNodes().map(n=>[n.getName(),n]));
// Dispose old animations and their data; original geometry and bind remain intact.
const old=new Set();
for(const a of root.listAnimations()){
  for(const s of a.listSamplers()){old.add(s.getInput());old.add(s.getOutput());}
  for(const c of a.listChannels())c.dispose();for(const s of a.listSamplers())s.dispose();a.dispose();
}
for(const a of old)a?.dispose();
const buffer=root.listBuffers()[0];
const accessorCache=new Map();
const accessor=(name,type,array)=>{
  const typed=new Float32Array(array.map(v=>Math.abs(v)<1e-10?0:Math.round(v*1e7)/1e7)),key=type+':'+createHash('sha256').update(new Uint8Array(typed.buffer)).digest('hex');
  if(accessorCache.has(key))return accessorCache.get(key);
  const result=doc.createAccessor().setType(type).setArray(typed).setBuffer(buffer);
  accessorCache.set(key,result);return result;
};
const trackNames=[...BONE_NAMES,'LeftPole','RightPole'].filter(n=>byName[n]);
const targets=new Set(['ski_ready','glide']);
const anchors=['ski_ready','glide'];
const list=CLIPS.map(c=>({...c,asset:'alpine-tricks.glb',animation:c.id,contactSheet:`sheets/${c.id}.webp`}));
const unique=new Set();
for(const clip of CLIPS)for(const anchor of anchors)for(const [from,to]of [[clip.id,anchor],[anchor,clip.id]]){
  if(from===to||unique.has(from+'>'+to))continue;unique.add(from+'>'+to);
  const id=`bridge__${from}__${to}`;
  list.push({id,label:`גשר · ${CLIPS.find(c=>c.id===from).label} ← ${CLIPS.find(c=>c.id===to).label}`,
    kind:'bridge',category:'bridge',durationSeconds:1.2,sampleHz:30,loop:false,from,to,
    headingOffsetRadians:from==='air_180'?Math.PI:from==='air_360'?2*Math.PI:0,
    translationOffsetMeters:from==='soft_fall_recover'?[0,0,.45]:from==='air_180'?[0,0,.026]:[0,0,0],
    asset:'alpine-tricks.glb',animation:id,contactSheet:`sheets/${id}.webp`,events:[]});
}
// Marker construction uses decoded BIND geometry, never animated output.
// Low central running-surface points, excluding raised shovel/tail tips.
const contactMarkers={};
for(const foot of ['LeftFoot','RightFoot']){
  const q=animator.bindWorld[foot],pos=animator.bindPositions[foot];
  const points=animator.footPoints[foot].map(v=>v.clone().applyQuaternion(q).add(pos));
  const minY=Math.min(...points.map(p=>p.y));
  const low=points.filter(p=>p.y<minY+.0015);
  const zmin=Math.min(...low.map(p=>p.z)),zmax=Math.max(...low.map(p=>p.z));
  const x=animator.restSole[foot].x;
  const world={binding:[x,minY,(zmin+zmax)/2],toe:[x,minY,zmax-.02],heel:[x,minY,zmin+.02]};
  contactMarkers[foot]=Object.fromEntries(Object.entries(world).map(([key,a])=>[key,
    new THREE.Vector3().fromArray(a).sub(pos).applyQuaternion(q.clone().invert()).toArray()]));
}
function parameters(clip,t){
  if(clip.kind!=='bridge')return sampleParameters(clip.id,t);
  const aclip=CLIPS.find(c=>c.id===clip.from),a=sampleParameters(clip.from,aclip.durationSeconds),b=sampleParameters(clip.to,0);
  b.rootYaw+=clip.headingOffsetRadians;
  const targetPelvis=new THREE.Vector3(b.pelvisX,b.pelvisY,b.pelvisZ);
  const rotatedPelvis=targetPelvis.clone().applyAxisAngle(new THREE.Vector3(0,1,0),b.rootYaw);
  b.rootX=clip.translationOffsetMeters[0]-b.pelvisX+rotatedPelvis.x;
  b.rootZ=clip.translationOffsetMeters[2]-b.pelvisZ+rotatedPelvis.z;
  const w=smooth(Math.max(0,Math.min(1,(t-2/30)/(clip.durationSeconds-4/30))));
  const p={...a,name:clip.id,u:w};
  for(const key of Object.keys(a)){
    if(typeof a[key]==='number'&&typeof b[key]==='number')p[key]=a[key]+(b[key]-a[key])*w;
    else if(key==='worldPelvisY')p[key]=null;
  }
  // Both bridge endpoints are on snow. Limb IK preserves support throughout.
  p.fall=0;p.recover=0;p.airHeight=0;p.footLift=0;
  return p;
}
function plannedMarkers(){
  const out={};
  for(const foot of ['LeftFoot','RightFoot'])out[foot]=Object.fromEntries(Object.entries(contactMarkers[foot]).map(([key,v])=>[key,
    new THREE.Vector3().fromArray(v).applyQuaternion(animator.last.footQuaternions[foot]).add(animator.last.footGoals[foot]).toArray()]));
  return out;
}
const metrics=[];
for(const clip of list){
  const count=Math.round(clip.durationSeconds*30),times=Array.from({length:count+1},(_,i)=>i/30);
  const channels=Object.fromEntries(trackNames.map(n=>[n,{rotation:[],translation:[]}]));
  const contactSamples=[];let maxFootReachErrorMeters=0,maxArmReachErrorMeters=0,maxFloorLiftMeters=0,minFootY=Infinity;
  for(const t of times){
    const snap=animator.applyParameters(parameters(clip,t));
    for(const n of trackNames){
      channels[n].rotation.push(...byName[n].quaternion.toArray());
      // Include bind translations too, so every clip is independently resettable.
      channels[n].translation.push(...byName[n].position.toArray());
    }
    contactSamples.push({time:t,...plannedMarkers()});
    maxFootReachErrorMeters=Math.max(maxFootReachErrorMeters,...Object.values(snap.footReachErrorMeters));
    maxArmReachErrorMeters=Math.max(maxArmReachErrorMeters,...Object.values(snap.armReachErrorMeters));
    maxFloorLiftMeters=Math.max(maxFloorLiftMeters,snap.floorLiftMeters);
    minFootY=Math.min(minFootY,...Object.values(snap.feetMinimumY));
  }
  const input=accessor(clip.id+'/time','SCALAR',times);
  const animation=doc.createAnimation(clip.id).setExtras({sampleHz:30,loop:clip.loop,kind:clip.kind,
    events:clip.events,from:clip.from,to:clip.to,headingOffsetRadians:clip.headingOffsetRadians??0,
    rootMotion:'see catalog.json',
    interpolation:'CUBICSPLINE',durationSeconds:clip.durationSeconds});
  for(const n of trackNames)for(const targetPath of ['rotation','translation']){
    const data=channels[n][targetPath],size=targetPath==='rotation'?4:3;
    // Limb and pole translations are the unchanged bind transforms, implicit in
    // standard glTF. Only Root/Hips ever translate; all 18 rotations remain.
    if(targetPath==='translation'&&!['Root','Hips'].includes(n))continue;
    if(size===4)for(let i=4;i<data.length;i+=4){let dot=0;for(let k=0;k<4;k++)dot+=data[i+k]*data[i-4+k];if(dot<0)for(let k=0;k<4;k++)data[i+k]*=-1;}
    const packed=[];
    for(let i=0;i<times.length;i++){
      const tangent=Array.from({length:size},(_,k)=>i===0||i===times.length-1?0:(data[(i+1)*size+k]-data[(i-1)*size+k])*15);
      // Quaternion derivative must lie in tangent plane of the unit 3-sphere.
      if(size===4){let dot=0;for(let k=0;k<4;k++)dot+=tangent[k]*data[i*size+k];for(let k=0;k<4;k++)tangent[k]-=dot*data[i*size+k];}
      packed.push(...tangent,...data.slice(i*size,(i+1)*size),...tangent);
    }
    // Exact constant holds need only two endpoint samples; all changing curves
    // retain the full 30Hz bake, without key reduction or re-timing.
    const constant=data.every((v,i)=>Math.abs(v-data[i%size])<1e-7);
    const compact=constant?[...new Array(size).fill(0),...data.slice(0,size),...new Array(size).fill(0),...new Array(size).fill(0),...data.slice(0,size),...new Array(size).fill(0)]:packed;
    const trackInput=constant?accessor(clip.id+'/hold-time','SCALAR',[0,clip.durationSeconds]):input;
    const sampler=doc.createAnimationSampler().setInput(trackInput).setOutput(accessor(clip.id+'/'+n+'/'+targetPath,size===4?'VEC4':'VEC3',compact)).setInterpolation('CUBICSPLINE');
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[n]).setTargetPath(targetPath).setSampler(sampler));
  }
  let intervals=[[0,clip.durationSeconds]];
  if(clip.category==='air')intervals=[[0,clip.durationSeconds*.25-2/30],[clip.durationSeconds*.75+2/30,clip.durationSeconds]];
  if(clip.category==='fall')intervals=[[0,.66],[6.65,clip.durationSeconds]];
  clip.contacts=intervals.map(([start,end])=>({start,end,mode:'ski-path',referenceSamples:contactSamples.filter(s=>s.time>=start-1/30&&s.time<=end+1/30)}));
  clip.contactIntervals=intervals.map(([start,end])=>({start,end,left:true,right:true}));
  clip.frameCount=count+1;
  metrics.push({id:clip.id,maxFootReachErrorMeters,maxArmReachErrorMeters,maxFloorLiftMeters,minFootY});
}
animator.reset();
root.getAsset().generator='Bakasun alpine-tricks-v1 · calibrated canonical18 · 30Hz CUBICSPLINE';
// Draco compresses geometry only; animation curves remain ordinary float buffers.
// QA decodes the final compressed geometry before testing markers and floor.
let ext=root.listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression');
if(!ext)ext=doc.createExtension(KHRDracoMeshCompression);
ext.setRequired(true).setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,encodeSpeed:5,decodeSpeed:5,quantizationBits:{POSITION:16,NORMAL:12,COLOR:12,GENERIC:20}});
const bytes=await io.writeBinary(doc);
await fs.writeFile(path.join(ROOT,'alpine-tricks.glb'),bytes);
const hash=x=>createHash('sha256').update(x).digest('hex');
const catalog={schemaVersion:1,id:'alpine-tricks-v1',sampleHz:30,units:'metres',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},
  canonicalBoneCount:18,skeleton:rig.joints.map(j=>({name:j.name,parent:j.parent,translation:j.translation,rotation:j.rotation,scale:j.scale})),
  asset:'alpine-tricks.glb',assetSha256:hash(bytes),assetBytes:bytes.length,
  motionCount:CLIPS.length,bridgeCount:list.length-CLIPS.length,
  interpolation:'glTF 2.0 CUBICSPLINE; every dynamic curve retains all 30Hz keys; exact constant holds share two endpoint keys; shared per-second tangents; normalized quaternions',
  rootMotion:{downhill:'external actor locomotion',softFallSlideMeters:.45,
    bridgeExit:'Transfer headingOffsetRadians and translationOffsetMeters to the host actor, then start target at time 0. Preserve world pose during this rebase. 180 lands switch; never unwind yaw on snow.'},
  contactsMeaning:'3D residual of toe, heel and binding running-surface markers against an authored equipment path, after intentional travel and wedge rotation. The host downhill path is external; this is not a claim of zero ski travel over snow.',
  contactMarkers,clips:list,
  sources:[{path:source,sha256:hash(sourceBytes),license:'CC0-1.0',role:'Existing skier, equipment, atlas and exact 18-joint target bind; existing animation replaced.'}],
  baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
  verification:{motionQA:'verification/motion-qa/report.json',contacts:'verification/qa.json'}};
await fs.writeFile(path.join(ROOT,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
await fs.writeFile(path.join(ROOT,'rig.json'),JSON.stringify(rig,null,2)+'\n');
await fs.writeFile(path.join(ROOT,'verification/build.json'),JSON.stringify({sampleHz:30,assetBytes:bytes.length,sha256:hash(bytes),clips:metrics},null,2)+'\n');
console.log(JSON.stringify({motionCount:CLIPS.length,bridgeCount:catalog.bridgeCount,bytes:bytes.length,maxFootError:Math.max(...metrics.map(m=>m.maxFootReachErrorMeters)),maxArmError:Math.max(...metrics.map(m=>m.maxArmReachErrorMeters))}));
