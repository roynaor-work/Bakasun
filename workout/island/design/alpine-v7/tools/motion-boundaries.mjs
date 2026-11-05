/* Dense holdout audit of the final decoded GLBs. This uses Three's ordinary
 * AnimationMixer and actual weighted vertices; it does not call the procedural
 * motion animator or use the author's intended contact coordinates.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as THREE from '../../../vendor/three.module.js';
import {documentScene} from './motion-bake.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/alpine-v7-tools/package.json'),{NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
const manifest=JSON.parse(await fs.readFile(path.join(ROOT,'characters/manifest.json'),'utf8'));
const option=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const allLODs=process.argv.includes('--all-lods'),probe=option('--input',null),entries=probe?[{id:'motion-probe',file:probe,sport:option('--sport','snowboard'),lod:0}]:manifest.assets.filter(a=>allLODs||a.lod===0),reports=[],failures=[];
const vec=new THREE.Vector3();
const ids=['Root','Hips','Neck','Head','LeftHand','RightHand','LeftFoot','RightFoot'];
const update=scene=>{scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});};
const range=()=>({min:Infinity,max:-Infinity,minTime:0,maxTime:0});
const add=(r,value,time)=>{if(value<r.min){r.min=value;r.minTime=time;}if(value>r.max){r.max=value;r.maxTime=time;}};
const safe=r=>r.min===Infinity?null:r;
const rounded=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*1e8)/1e8:v));
function geometryGroups(scene){
  const groups={LeftFoot:[],RightFoot:[],LeftPole:[],RightPole:[],Snowboard:[],Body:[]};
  scene.traverse(o=>{
    if(!o.isMesh||!o.geometry?.attributes.position)return;
    let gear=o;while(gear&&!['LeftPole','RightPole','Snowboard'].includes(gear.name))gear=gear.parent;
    if(!o.isSkinnedMesh){if(gear)for(let i=0;i<o.geometry.attributes.position.count;i++)groups[gear.name].push({mesh:o,index:i});return;}
    const a=o.geometry.attributes;
    for(let i=0;i<a.position.count;i++){
      const v={mesh:o,index:i};groups.Body.push(v);
      for(const name of ['LeftFoot','RightFoot']){
        let weight=0;for(let k=0;k<4;k++)if(o.skeleton.bones[a.skinIndex.getComponent(i,k)].name===name)weight+=a.skinWeight.getComponent(i,k);
        if(weight>.8)groups[name].push(v);
      }
    }
  });return groups;
}
function minimum(vertices){
  let y=Infinity;
  for(const {mesh,index}of vertices){
    if(mesh.isSkinnedMesh)mesh.getVertexPosition(index,vec);else vec.fromBufferAttribute(mesh.geometry.attributes.position,index);
    vec.applyMatrix4(mesh.matrixWorld);y=Math.min(y,vec.y);
  }return y;
}
function makeClip(animation){
  const tracks=[];let duration=0;const keys=new Set(),events=animation.getExtras()?.events??[];
  for(const channel of animation.listChannels()){
    const s=channel.getSampler(),input=s.getInput().getArray(),output=s.getOutput().getArray(),name=channel.getTargetNode().getName(),p=channel.getTargetPath();
    duration=Math.max(duration,input.at(-1));for(const t of input)keys.add(t);
    if(p==='rotation')tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',input,output));
    else if(p==='translation')tracks.push(new THREE.VectorKeyframeTrack(name+'.position',input,output));
    else if(p==='scale')tracks.push(new THREE.VectorKeyframeTrack(name+'.scale',input,output));
  }
  const times=new Set([0,duration]);
  // 120 Hz checks between the retained 30 Hz keys as well as just to each side
  // of their Float32 timestamps. Events receive an additional +/-1/240s probe.
  for(let i=0;i<=Math.ceil(duration*120);i++)times.add(Math.min(duration,i/120));
  for(const t of keys)for(const delta of [-1e-6,-1e-7,0,1e-7,1e-6])times.add(Math.max(0,Math.min(duration,t+delta)));
  for(const e of events)for(const delta of [-1/240,-1e-6,0,1e-6,1/240])times.add(Math.max(0,Math.min(duration,e.time+delta)));
  return {clip:new THREE.AnimationClip(animation.getName(),duration,tracks),duration,events,times:[...times].sort((a,b)=>a-b),keyTimes:keys.size};
}
for(const entry of entries){
  const file=path.resolve(ROOT,entry.file);if(!file.startsWith(ROOT+path.sep))throw Error('Audit input must stay inside alpine-v7');
  const bytes=await fs.readFile(file),doc=await io.readBinary(bytes),{scene,byName}=documentScene(doc),groups=geometryGroups(scene),mixer=new THREE.AnimationMixer(scene);
  const rest=new Map();scene.traverse(o=>rest.set(o,{p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));
  const reset=()=>{for(const [o,r]of rest){o.position.copy(r.p);o.quaternion.copy(r.q);o.scale.copy(r.s);}update(scene);};
  const clips=[];
  for(const animation of doc.getRoot().listAnimations()){
    mixer.stopAllAction();reset();const {clip,duration,times,keyTimes,events}=makeClip(animation),action=mixer.clipAction(clip).reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    const ranges=Object.fromEntries(Object.keys(groups).map(n=>[n,range()])),boundaries={maxPositionJumpMeters:0,maxAngularJumpRadians:0,worstTime:0},boardCoordinates={},positions={};
    const includeBody=['fall_roll','get_up'].includes(clip.name);let previous=null,maxNormError=0,boardDrift=0;
    for(const t of times){
      mixer.setTime(t);update(scene);
      for(const [name,vertices]of Object.entries(groups))if(vertices.length&&(name!=='Body'||includeBody))add(ranges[name],minimum(vertices),t);
      const current={time:t,positions:{},quaternions:{}};
      for(const n of ids){const o=byName[n];current.positions[n]=o.getWorldPosition(new THREE.Vector3());current.quaternions[n]=o.getWorldQuaternion(new THREE.Quaternion());maxNormError=Math.max(maxNormError,Math.abs(o.quaternion.length()-1));}
      if(previous&&t-previous.time<2.1e-6&&t>previous.time){
        for(const n of ids){const jump=current.positions[n].distanceTo(previous.positions[n]),angle=current.quaternions[n].angleTo(previous.quaternions[n]);if(jump>boundaries.maxPositionJumpMeters){boundaries.maxPositionJumpMeters=jump;boundaries.worstTime=t;}boundaries.maxAngularJumpRadians=Math.max(boundaries.maxAngularJumpRadians,angle);}
      }
      if(byName.Snowboard)for(const n of ['LeftFoot','RightFoot']){
        const p=byName.Snowboard.worldToLocal(current.positions[n].clone());if(!boardCoordinates[n])boardCoordinates[n]=p.clone();boardDrift=Math.max(boardDrift,p.distanceTo(boardCoordinates[n]));
      }
      previous=current;
    }
    const contacts=Object.fromEntries(Object.entries(ranges).map(([n,r])=>[n,safe(r)]).filter(([,r])=>r));
    const gates=[];const gate=(passed,message)=>{gates.push({passed,message});if(!passed)failures.push({file:entry.file,clip:clip.name,message});};
    for(const [group,r]of Object.entries(contacts))gate(r.min>=-.005,`${group} must not penetrate snow by more than 5mm (minimum ${r.min.toFixed(6)}m)`);
    gate(boundaries.maxPositionJumpMeters<.0005,'No joint jump greater than 0.5mm across a two-microsecond key boundary');
    gate(maxNormError<1e-5,'Interpolated local quaternion norms remain within 1e-5');
    if(byName.Snowboard)gate(boardDrift<.002,'Board-relative boot joints drift less than 2mm');
    clips.push(rounded({name:clip.name,durationSeconds:duration,samples:times.length,distinctSourceKeyTimes:keyTimes,fullSkinnedBodySampled:includeBody,contacts,boundaries,maxQuaternionNormError:maxNormError,boardRelativeFootDriftMeters:byName.Snowboard?boardDrift:null,events,gates}));
  }
  mixer.stopAllAction();mixer.uncacheRoot(scene);
  reports.push({id:entry.id,file:entry.file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sport:entry.sport,lod:entry.lod,geometryVertices:Object.fromEntries(Object.entries(groups).map(([n,v])=>[n,v.length])),clips});
  console.log(JSON.stringify({id:entry.id,clips:clips.length,samples:clips.reduce((n,c)=>n+c.samples,0),failures:failures.filter(f=>f.file===entry.file).length}));
}
const output={schemaVersion:1,generatedAt:new Date().toISOString(),allPassed:failures.length===0,allLODs,method:'Decoded Draco GLB; ordinary Three AnimationMixer; actual SkinnedMesh.getVertexPosition; 120Hz plus Float32 key times +/-1e-7 and +/-1e-6 seconds and event boundaries',limitations:['Full-body vertices are sampled for fall_roll and get_up; every clip includes all dominant foot vertices, rigid board and rigid pole vertices.','Board-relative joint drift checks attachment stability, not the visual fit of a boot or binding.','The virtual desktop renderer is separate from physical phone performance.'],characters:reports,failures};
const dest=path.resolve(ROOT,option('--out','motion/verification/dense-boundaries.json'));if(!dest.startsWith(ROOT+path.sep))throw Error('Audit output must stay inside alpine-v7');await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({allPassed:output.allPassed,characters:reports.length,failures,report:path.relative(ROOT,dest)}));if(failures.length)process.exitCode=1;
