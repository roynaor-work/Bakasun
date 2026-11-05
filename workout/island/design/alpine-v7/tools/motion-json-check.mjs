/* Independent playback equivalence check for the self-contained motion JSON.
 * Both paths use ordinary Three AnimationMixers and the same decoded geometry.
 * This audit never samples the procedural motion authoring functions.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as THREE from '../../../vendor/three.module.js';
import {BONE_NAMES,createClipsFromJSON} from '../motion/motion.mjs';
import {documentScene} from './motion-bake.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/alpine-v7-tools/package.json');
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
const manifestBytes=await fs.readFile(path.join(ROOT,'characters/manifest.json'));
const manifest=JSON.parse(manifestBytes);
const limits={worldJointPositionMeters:.0001,worldFootVertexPositionMeters:.0001,worldJointOrientationRadians:.0001};
const digest=b=>createHash('sha256').update(b).digest('hex');
const inputs=new Map([['characters/manifest.json',{bytes:manifestBytes.length,sha256:digest(manifestBytes)}]]);
const failures=[],reports=[];
const V=new THREE.Vector3(),W=new THREE.Vector3(),QA=new THREE.Quaternion(),QB=new THREE.Quaternion();

async function input(relative){
  const file=path.resolve(ROOT,relative);if(!file.startsWith(ROOT+path.sep))throw Error('JSON audit input must stay in alpine-v7');
  const bytes=await fs.readFile(file),hash=digest(bytes);
  if(inputs.has(relative)&&inputs.get(relative).sha256!==hash)throw Error(`Input changed during audit: ${relative}`);
  inputs.set(relative,{bytes:bytes.length,sha256:hash});return bytes;
}
function update(scene){scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});}
function snapshot(scene){const rest=new Map();scene.traverse(o=>rest.set(o,{p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));return()=>{for(const [o,r]of rest){o.position.copy(r.p);o.quaternion.copy(r.q);o.scale.copy(r.s);}update(scene);};}
function clipsFromGLB(document){
  return document.getRoot().listAnimations().map(animation=>{
    let duration=0;const tracks=[];
    for(const channel of animation.listChannels()){
      const sampler=channel.getSampler(),times=sampler.getInput().getArray(),values=sampler.getOutput().getArray(),target=channel.getTargetNode().getName(),property=channel.getTargetPath();
      if(sampler.getInterpolation()!=='LINEAR')throw Error(`Expected ordinary LINEAR baked channels: ${animation.getName()}`);
      duration=Math.max(duration,times.at(-1));
      if(property==='rotation')tracks.push(new THREE.QuaternionKeyframeTrack(target+'.quaternion',times,values,THREE.InterpolateLinear));
      else if(property==='translation')tracks.push(new THREE.VectorKeyframeTrack(target+'.position',times,values,THREE.InterpolateLinear));
      else if(property==='scale')tracks.push(new THREE.VectorKeyframeTrack(target+'.scale',times,values,THREE.InterpolateLinear));
      else throw Error(`Unsupported ordinary GLB animation property: ${property}`);
    }
    const clip=new THREE.AnimationClip(animation.getName(),duration,tracks);clip.userData=animation.getExtras();return clip;
  });
}
function meshes(scene){const result=[];scene.traverse(o=>{if(o.isSkinnedMesh)result.push(o);});return result;}
function footRepresentatives(list){
  const candidates={LeftFoot:[],RightFoot:[]};
  for(let m=0;m<list.length;m++){
    const mesh=list[m],a=mesh.geometry.attributes;
    for(let i=0;i<a.position.count;i++)for(const side of ['LeftFoot','RightFoot']){
      let weight=0;for(let k=0;k<4;k++)if(mesh.skeleton.bones[a.skinIndex.getComponent(i,k)].name===side)weight+=a.skinWeight.getComponent(i,k);
      if(weight>.8){mesh.getVertexPosition(i,V).applyMatrix4(mesh.matrixWorld);candidates[side].push({meshIndex:m,index:i,side,bindPosition:V.clone()});}
    }
  }
  const directions=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push(new THREE.Vector3(x,y,z).normalize());
  const selected=[];
  for(const [side,points]of Object.entries(candidates)){
    if(!points.length)throw Error(`No actual dominant foot vertices for ${side}`);
    const chosen=new Map();
    for(const direction of directions){let best=points[0],score=-Infinity;for(const p of points){const s=p.bindPosition.dot(direction);if(s>score){score=s;best=p;}}chosen.set(best.meshIndex+':'+best.index,best);}
    for(let i=0;i<points.length;i+=Math.max(1,Math.floor(points.length/16))){const p=points[i];chosen.set(p.meshIndex+':'+p.index,p);}
    selected.push(...chosen.values());
  }
  return {selected,candidateCounts:Object.fromEntries(Object.entries(candidates).map(([s,a])=>[s,a.length]))};
}
function timesFor(a,b,jsonClip){
  const duration=Math.max(a.duration,b.duration),times=new Set([0,a.duration,b.duration,duration]);
  for(let i=0;i<=240;i++)times.add(duration*i/240);
  for(const clip of [a,b])for(const track of clip.tracks)for(const time of track.times)times.add(time);
  for(const event of jsonClip.events??[])for(const delta of [-1e-6,0,1e-6])times.add(Math.max(0,Math.min(duration,event.time+delta)));
  return [...times].sort((x,y)=>x-y);
}
function activate(mixer,clip){const action=mixer.clipAction(clip).reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();return action;}

for(const entry of manifest.assets.filter(a=>a.lod===0)){
  const file=entry.file,jsonFile=`motion/${entry.sport==='snowboard'?'snowboard':'ski'}.json`,bytes=await input(file),jsonBytes=await input(jsonFile),pack=JSON.parse(jsonBytes),document=await io.readBinary(bytes);
  const a=documentScene(document),b=documentScene(document),placement=manifest.characters.find(c=>c.sport===entry.sport&&c.model===entry.file);
  for(const proxy of [a,b]){proxy.scene.scale.setScalar(manifest.recommendedWorldScale??1);proxy.scene.rotation.y=placement?.worldYawRadians??0;update(proxy.scene);}
  const listA=meshes(a.scene),listB=meshes(b.scene);
  if(listA.length!==listB.length||listA.some((mesh,i)=>mesh.geometry.attributes.position.count!==listB[i].geometry.attributes.position.count))throw Error('Decoded proxy geometry correspondence failed');
  const {selected,candidateCounts}=footRepresentatives(listA),resetA=snapshot(a.scene),resetB=snapshot(b.scene),mixerA=new THREE.AnimationMixer(a.scene),mixerB=new THREE.AnimationMixer(b.scene),clipsA=clipsFromGLB(document),clipsB=createClipsFromJSON(pack),clips=[];
  if(clipsA.length!==14||clipsB.length!==14)failures.push({file,message:'Both representations must contain all14 clips'});
  if(entry.sha256!==digest(bytes))failures.push({file,message:'Final character manifest hash does not match the sampled GLB'});
  for(const clipA of clipsA){
    const clipB=clipsB.find(c=>c.name===clipA.name),jsonClip=pack.clips.find(c=>c.name===clipA.name);if(!clipB||!jsonClip){failures.push({file,clip:clipA.name,message:'JSON clip missing'});continue;}
    mixerA.stopAllAction();mixerB.stopAllAction();resetA();resetB();const actionA=activate(mixerA,clipA),actionB=activate(mixerB,clipB);
    const times=timesFor(clipA,clipB,jsonClip),max={worldJointPositionMeters:0,worldFootVertexPositionMeters:0,worldJointOrientationRadians:0},worst={};
    for(const time of times){
      // setTime resets action.time, but a previous clamped endpoint leaves the
      // LoopOnce action paused. Unpause before every independent seek so nearby
      // Float32/JSON terminal timestamps all sample the endpoint correctly.
      actionA.paused=false;actionB.paused=false;
      mixerA.setTime(time);mixerB.setTime(time);update(a.scene);update(b.scene);
      for(const name of BONE_NAMES){
        a.byName[name].getWorldPosition(V);b.byName[name].getWorldPosition(W);const position=V.distanceTo(W);
        a.byName[name].getWorldQuaternion(QA).normalize();b.byName[name].getWorldQuaternion(QB).normalize();const angle=QA.angleTo(QB);
        if(position>max.worldJointPositionMeters){max.worldJointPositionMeters=position;worst.position={time,joint:name};}
        if(angle>max.worldJointOrientationRadians){max.worldJointOrientationRadians=angle;worst.orientation={time,joint:name};}
      }
      for(const point of selected){
        const ma=listA[point.meshIndex],mb=listB[point.meshIndex];ma.getVertexPosition(point.index,V).applyMatrix4(ma.matrixWorld);mb.getVertexPosition(point.index,W).applyMatrix4(mb.matrixWorld);const distance=V.distanceTo(W);
        if(distance>max.worldFootVertexPositionMeters){max.worldFootVertexPositionMeters=distance;worst.footVertex={time,side:point.side,meshIndex:point.meshIndex,index:point.index};}
      }
    }
    const gates=Object.entries(limits).map(([name,limit])=>({measurement:name,value:max[name],limit,passed:max[name]<=limit}));
    for(const gate of gates)if(!gate.passed)failures.push({file,jsonFile,clip:clipA.name,...gate,worst});
    clips.push({name:clipA.name,samples:times.length,glbDurationSeconds:clipA.duration,jsonDurationSeconds:clipB.duration,max,worst,gates});
  }
  mixerA.stopAllAction();mixerB.stopAllAction();mixerA.uncacheRoot(a.scene);mixerB.uncacheRoot(b.scene);
  reports.push({id:entry.id,file,jsonFile,sport:entry.sport,worldScale:manifest.recommendedWorldScale??1,worldYawRadians:placement?.worldYawRadians??0,glbSha256:digest(bytes),jsonSha256:digest(jsonBytes),footCandidateCounts:candidateCounts,representativeFootVertices:selected.length,clips});
  console.log(JSON.stringify({id:entry.id,clips:clips.length,samples:clips.reduce((n,c)=>n+c.samples,0),max:Object.fromEntries(Object.keys(limits).map(k=>[k,Math.max(...clips.map(c=>c.max[k]))]))}));
}
for(const [relative,proof]of inputs){const now=await fs.readFile(path.join(ROOT,relative));if(digest(now)!==proof.sha256)failures.push({file:relative,message:'Input changed while equivalence audit was running; rerun after freeze'});}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),allPassed:failures.length===0,method:'Two ordinary Three r160 AnimationMixers; JSON createClipsFromJSON versus independently reconstructed ordinary GLB channels on identical decoded Draco geometry;240 uniform intervals plus all retained GLB/JSON keys and event boundaries; recommended scene scale and placement yaw applied to both.',seekHandling:'Each independent seek explicitly unpauses its LoopOnce action before AnimationMixer.setTime; this preserves clamped endpoints when JSON and Float32 duration timestamps differ slightly.',limits,inputs:Object.fromEntries(inputs),characters:reports,failures,limitations:['Representative actual foot vertices include26 directional extrema plus uniform dominant-foot samples; this is a playback equivalence audit, not a full collision audit.','The JSON rounds values/timestamps to six decimal places, so bit-for-bit equality is not expected.','Shared ski JSON is verified on both male and female base geometry. LOD playback structure and floor contact are covered by the separate dense all-LOD audit.']};
const output=path.join(ROOT,'motion/verification/json-playback.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({allPassed:report.allPassed,characters:reports.length,failures,report:'motion/verification/json-playback.json'}));if(failures.length)process.exitCode=1;
