// SPDX-License-Identifier: CC0-1.0
// Independent audit of the delivered GLB bytes. Motion scores use the original
// motion-qa-v1 metrics without changing thresholds, coverage or score weights.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as THREE from '../../defense-v7/vendor/three.module.js';
import {parseGLB,readAccessor,createRig,sampleGLB} from './qa-vendor/glb.mjs';
import {analyzeClip,METRICS} from './qa-vendor/metrics.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const verification=path.join(root,'verification');
const sha=b=>createHash('sha256').update(b).digest('hex');
let validator;
for(const base of [path.join(root,'source/package.json'),path.join(process.env.FIRE_RESCUE_TOOLS??'/tmp/fire-rescue-people-v2/tools','package.json')]){
  try {validator=createRequire(base)('gltf-validator');break;} catch {}
}
if(!validator)throw new Error('Install source/package.json or set FIRE_RESCUE_TOOLS to the directory containing gltf-validator.');
const canonical=JSON.parse(await fs.readFile(path.join(root,'../motion2/soccer.json'),'utf8')).skeleton;
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const provenance=JSON.parse(await fs.readFile(path.join(root,'source/qa-vendor/provenance.json'),'utf8'));
const failures=[];
const check=(ok,message,details={})=>{if(!ok)failures.push({message,...details});};
for(const record of provenance){
  const actual=sha(await fs.readFile(path.join(root,'source/qa-vendor',record.file)));
  check(actual===record.deliveredSha256,'QA vendor checksum mismatch',{file:record.file});
  if(record.file==='metrics.mjs')check(actual===record.sourceSha256,'Original metrics were modified');
}
const files=(await fs.readdir(path.join(root,'models'))).filter(f=>f.endsWith('.glb')).sort();
check(files.length===11,'Expected eleven character GLBs',{actual:files.length});
const expectedIds=['boy','girl','mother','father','grandfather','grandmother','baby-stroller','panicked-man','captain','young-firefighter','female-firefighter'].sort();
check(JSON.stringify(files.map(f=>f.replace(/\.glb$/,'')))===JSON.stringify(expectedIds),'Character role inventory differs from the requested eleven roles');
const assets=[],clips=[];
const vec=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
const matrix=(p,r,scale=[1,1,1])=>new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p),new THREE.Quaternion().fromArray(r),new THREE.Vector3().fromArray(scale));
function decodedSurfaces(glb){
  const {json}=glb,{nodes}=createRig(glb),surfaces=[];
  for(const [nodeIndex,node] of json.nodes.entries()){
    if(node.mesh===undefined)continue;
    const skin=node.skin===undefined?null:json.skins[node.skin];
    const inverse=skin?readAccessor(glb,skin.inverseBindMatrices):null;
    const ibms=skin?.joints.map((_,i)=>new THREE.Matrix4().fromArray(inverse,i*16));
    for(const primitive of json.meshes[node.mesh].primitives){
      const pos=readAccessor(glb,primitive.attributes.POSITION);
      const joints=skin?readAccessor(glb,primitive.attributes.JOINTS_0):null;
      const weights=skin?readAccessor(glb,primitive.attributes.WEIGHTS_0):null;
      const indices=primitive.indices===undefined?Array.from({length:pos.length/3},(_,i)=>i):readAccessor(glb,primitive.indices);
      surfaces.push({nodeIndex,pos,joints,weights,indices,ibms,bones:skin?.joints.map(i=>json.nodes[i].name),restWorld:nodes[nodeIndex].matrixWorld.clone(),material:primitive.material});
    }
  }
  return surfaces;
}
function sampleMeshFloor(surfaces,frame){
  let min=Infinity,point=null,vertices=0;
  const soles={LeftFoot:Infinity,RightFoot:Infinity};
  for(const surface of surfaces){
    const boneMatrices=surface.bones?.map((name,i)=>matrix(frame.joints[name],frame.rotations[name],frame.scales[name]).multiply(surface.ibms[i]));
    for(let i=0;i<surface.pos.length/3;i++){
      const p=new THREE.Vector3().fromArray(surface.pos,i*3);
      if(boneMatrices){
        vec.set(0,0,0);
        for(let k=0;k<4;k++){
          const w=surface.weights[i*4+k];
          if(w)vec.addScaledVector(p.clone().applyMatrix4(boneMatrices[surface.joints[i*4+k]]),w);
        }
      }else vec.copy(p).applyMatrix4(surface.restWorld);
      vertices++;
      if(vec.y<min){min=vec.y;point=vec.toArray();}
      if(surface.bones)for(let k=0;k<4;k++){
        const bone=surface.bones[surface.joints[i*4+k]];
        if(bone in soles&&surface.weights[i*4+k]>.999)soles[bone]=Math.min(soles[bone],vec.y);
      }
    }
  }
  return {minY:min,position:point,vertices,soles};
}
for(const file of files){
  const bytes=await fs.readFile(path.join(root,'models',file));
  const glb=parseGLB(bytes),j=glb.json,id=file.replace(/\.glb$/,'');
  const validation=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:1000});
  const surfaces=decodedSurfaces(glb);
  const triangles=surfaces.reduce((sum,x)=>sum+x.indices.length/3,0);
  const record={id,file:'models/'+file,bytes:bytes.length,sha256:sha(bytes),triangles,skins:j.skins?.length??0,joints:j.skins?.[0]?.joints.length??0,animations:j.animations?.map(a=>a.name)??[],validator:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,messages:validation.issues.messages},invalidWeights:0,degenerateTriangles:0,canonicalRest:true,inverseBindMaxError:0};
  const entry=manifest.characters?.find(c=>c.id===id);
  check(entry?.file===record.file&&entry?.sha256===record.sha256&&entry?.bytes===record.bytes&&entry?.triangles===record.triangles,'Manifest geometry/byte count/SHA-256 differs from actual GLB',{id});
  const socketEntries=Object.entries(entry?.sockets??{}),socketNodes=j.nodes.map((node,index)=>({node,index})).filter(({node})=>node.extras?.socket);
  record.socketCount=socketNodes.length;
  record.socketsVerified=[];
  check(socketEntries.length===socketNodes.length,'Manifest and GLB socket counts differ',{id,manifest:socketEntries.length,glb:socketNodes.length});
  const vectorEqual=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,k)=>Number.isFinite(x)&&Math.abs(x-b[k])<1e-8);
  for(const [name,socket] of socketEntries){
    const matches=socketNodes.filter(({node})=>node.name===name),match=matches[0];
    const parent=match?j.nodes.find(node=>node.children?.includes(match.index)):undefined;
    const verified=matches.length===1&&parent?.name===socket.bone&&vectorEqual(match.node.translation??[0,0,0],socket.translation??[0,0,0])&&vectorEqual(match.node.rotation??[0,0,0,1],socket.rotation??[0,0,0,1])&&vectorEqual(match.node.extras?.direction??[0,0,1],socket.direction??[0,0,1]);
    check(verified,'Manifest socket bone/translation/rotation/direction differs from actual GLB',{id,socket:name});
    if(verified)record.socketsVerified.push(name);
  }
  const firefighter=id==='captain'||id.endsWith('firefighter');
  const requiredClips=firefighter?['idle','hose','extinguisher','rescue_carry','signal_clear']:['ready','panic_stand','cough','wave_help','sit_floor','carried_shoulder','walk_happy'];
  check(requiredClips.every(name=>record.animations.includes(name)),'Missing a requested motion clip',{id,requiredClips,actual:record.animations});
  check(triangles>=1000&&triangles<=1300,'Triangle budget exceeded',{id,triangles});
  check(record.skins===1&&record.joints===18,'Character must use one canonical 18-joint skin',{id});
  check(validation.issues.numErrors===0&&validation.issues.numWarnings===0,'Khronos validation is not clean',{id,...record.validator});
  const skin=j.skins?.[0],rig=createRig(glb);
  for(const [i,bone] of canonical.bones.entries()){
    const ni=skin?.joints[i],actual=j.nodes[ni],parent=j.nodes.find((n,index)=>skin.joints.includes(index)&&n.children?.includes(ni));
    const restMatches=actual?.name===bone.name&&(parent?.name??null)===bone.parent&&(actual.translation??[0,0,0]).every((x,k)=>Math.abs(x-bone.restTranslationMeters[k])<1e-6);
    record.canonicalRest&&=restMatches;
    check(restMatches,'Canonical joint name/order/hierarchy/rest mismatch',{id,bone:bone.name,actual:actual?.name});
  }
  const ibms=readAccessor(glb,skin.inverseBindMatrices);
  const skinNode=j.nodes.findIndex(n=>n.skin===0);
  for(const [i,ni] of skin.joints.entries()){
    const product=rig.nodes[skinNode].matrixWorld.clone().invert().multiply(rig.nodes[ni].matrixWorld).multiply(new THREE.Matrix4().fromArray(ibms,i*16));
    product.elements.forEach((x,k)=>{record.inverseBindMaxError=Math.max(record.inverseBindMaxError,Math.abs(x-(k%5===0?1:0)));});
  }
  check(record.inverseBindMaxError<1e-5,'Inverse bind matrix does not reconstruct rest mesh',{id,error:record.inverseBindMaxError});
  for(const surface of surfaces){
    if(surface.weights)for(let i=0;i<surface.weights.length;i+=4){
      const weights=Array.from(surface.weights.slice(i,i+4));
      if(Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-5||weights.some(w=>!Number.isFinite(w)||w<0)||Array.from(surface.joints.slice(i,i+4)).some(x=>x<0||x>=18||!Number.isInteger(x)))record.invalidWeights++;
    }
    for(let i=0;i<surface.indices.length;i+=3){
      const p=[0,1,2].map(k=>new THREE.Vector3().fromArray(surface.pos,surface.indices[i+k]*3));
      if(p[1].sub(p[0]).cross(p[2].sub(p[0])).length()<1e-10)record.degenerateTriangles++;
    }
  }
  check(record.invalidWeights===0&&record.degenerateTriangles===0,'Invalid skin or degenerate triangles',{id,invalidWeights:record.invalidWeights,degenerateTriangles:record.degenerateTriangles});
  for(const animation of j.animations??[]){
    const animatedRotations=new Set(animation.channels.filter(c=>c.target.path==='rotation').map(c=>j.nodes[c.target.node].name));
    check(canonical.bones.every(b=>animatedRotations.has(b.name)),'Animation does not contain all eighteen bone rotation channels',{id,clip:animation.name});
    for(const sampler of animation.samplers){
      const times=readAccessor(glb,sampler.input);
      check(times.length>=2&&times.every((t,i)=>Math.abs(t-i/30)<2e-6),'Animation is not sampled at 30 Hz',{id,clip:animation.name});
      check((sampler.interpolation??'LINEAR')==='LINEAR','Animation interpolation must be LINEAR',{id,clip:animation.name});
    }
    const metadata=animation.extras?.qa;
    check(!!metadata,'Animation has no QA/contact metadata',{id,clip:animation.name});
    if(!metadata)continue;
    const native=sampleGLB(glb,{animation:animation.name,fps:60,extraTimes:(metadata.supports??[]).flatMap(w=>[w.start,w.end])});
    const idle=sampleGLB(glb,{animation:metadata.idleClip??'ready',fps:60});
    let minMeshY=Infinity,worstFloor=null,totalVertexSamples=0,maxSupportGapMeters=0,maxSupportPenetrationMeters=0,supportSamples=0,worstSupport=null;
    for(const frame of native.frames){
      const floor=sampleMeshFloor(surfaces,frame);totalVertexSamples+=floor.vertices;
      if(floor.minY<minMeshY){minMeshY=floor.minY;worstFloor={time:frame.t,position:floor.position};}
      frame.floorPoints.push({bone:'decoded-mesh-minimum',position:floor.position});
      for(const contact of metadata.supports??[]){
        if(frame.t<contact.start-1e-6||frame.t>contact.end+1e-6)continue;
        const surfaceY=contact.surfaceY??metadata.supportSurfaceY??(metadata.supportKind==='stroller footrest'?null:0);
        if(surfaceY===null)continue;
        const gap=floor.soles[contact.bone]-surfaceY;
        if(!Number.isFinite(gap))continue;
        supportSamples++;
        if(gap>maxSupportGapMeters){maxSupportGapMeters=gap;worstSupport={time:frame.t,bone:contact.bone,soleY:floor.soles[contact.bone],surfaceY};}
        maxSupportPenetrationMeters=Math.max(maxSupportPenetrationMeters,-gap);
      }
    }
    // A stroller footrest travels with Root. Subtract only its horizontal world
    // translation before measuring declared footrest contacts. No rotations,
    // vertical positions, floor planes or metric definitions are changed.
    const inSupportFrame=frames=>metadata.supportFrame==='Root'?frames.map(frame=>{
      const x=frame.joints.Root[0],z=frame.joints.Root[2];
      const translate=p=>[p[0]-x,p[1],p[2]-z];
      return {...frame,joints:Object.fromEntries(Object.entries(frame.joints).map(([name,p])=>[name,translate(p)])),root:translate(frame.root),floorPoints:frame.floorPoints.map(probe=>({...probe,position:translate(probe.position)}))};
    }):frames;
    const measured=analyzeClip({...native,frames:inSupportFrame(native.frames),metadata:{...metadata,ballVisible:false,floorProbeKind:'Original canonical sole probes, all 18 joint centres and independently decoded full mesh minimum at every sample'},idleFrames:inSupportFrame(idle.frames),clipId:id+'/'+animation.name,sport:'fire-rescue'});
    const rawWorld=metadata.supportFrame==='Root'?analyzeClip({...native,metadata:{...metadata,coordinateSpace:'Untransformed GLB world; footrest translates through this frame',ballVisible:false},idleFrames:idle.frames,clipId:id+'/'+animation.name,sport:'fire-rescue'}):null;
    let loopRotationRadians=0,loopTranslationMeters=0;
    if(metadata.loop){
      const a=native.frames[0],b=native.frames.at(-1);
      for(const bone of canonical.bones){
        loopRotationRadians=Math.max(loopRotationRadians,new THREE.Quaternion().fromArray(a.localRotations[bone.name]).angleTo(new THREE.Quaternion().fromArray(b.localRotations[bone.name])));
        loopTranslationMeters=Math.max(loopTranslationMeters,new THREE.Vector3().fromArray(a.joints[bone.name]).distanceTo(new THREE.Vector3().fromArray(b.joints[bone.name])));
      }
      check(loopRotationRadians<1e-4&&loopTranslationMeters<1e-4,'Loop endpoints differ',{id,clip:animation.name,loopRotationRadians,loopTranslationMeters});
    }
    const clip={id,clip:animation.name,duration:native.duration,nativeHz:30,auditHz:60,sampleCount:native.frames.length,toolHeightEstimateMeters:native.height,toolHeightMethod:'Original motion-qa-v1 GLB sampler: bind Head.y minus LeftFoot.y plus 0.30 m; not measured mesh stature',...measured,metadata,...rawWorld?{rawWorldDiagnostics:{score:rawWorld.score,coverage:rawWorld.coverage,metrics:rawWorld.metrics,note:'For a moving stroller footrest, world-space foot drift includes the intended stroller travel. The primary score measures the same original metrics in the declared moving support frame.'}}:{},fullMesh:{minY:minMeshY,worstFloor,vertexSamples:totalVertexSamples,supportSamples,maxSupportGapMeters,maxSupportPenetrationMeters,worstSupport},loop:metadata.loop?{rotationRadians:loopRotationRadians,translationMeters:loopTranslationMeters}:null};
    clips.push(clip);
    check(measured.score>88,'motion-qa-v1 score must exceed 88',{id,clip:animation.name,score:measured.score,reasons:measured.reasons});
    check(measured.coverage===1,'Motion metric coverage is incomplete',{id,clip:animation.name,coverage:measured.coverage,reasons:measured.reasons});
    check(minMeshY>=-.005,'Decoded mesh penetrates the ground more than 5 mm',{id,clip:animation.name,minMeshY,worstFloor});
    check(supportSamples>0,'Declared supports have no measurable mesh contact surface',{id,clip:animation.name});
    check(maxSupportGapMeters<=.005&&maxSupportPenetrationMeters<=.005,'Actual sole surface differs from support surface by more than 5 mm',{id,clip:animation.name,maxSupportGapMeters,maxSupportPenetrationMeters,worstSupport});
    console.log(`${id}/${animation.name}: ${measured.score}, coverage ${measured.coverage}, mesh minimum ${minMeshY.toFixed(5)}m`);
  }
  assets.push(record);
}
async function bytesIn(dir){let total=0;for(const item of await fs.readdir(dir,{withFileTypes:true})){if(item.name==='node_modules'||item.name==='__pycache__')continue;const p=path.join(dir,item.name);total+=item.isDirectory()?await bytesIn(p):(await fs.stat(p)).size;}return total;}
const totalBytes=await bytesIn(root);
const summary={schemaVersion:1,pass:failures.length===0,sourceCommit:'5eb4f093bc22523ee417a7f2345c3b813bffba24',tool:'motion-qa-v1',metricsUnmodified:true,scoreThresholdExclusive:88,assetCount:assets.length,clipCount:clips.length,minScore:Math.min(...clips.map(c=>c.score)),meanScore:clips.reduce((s,c)=>s+c.score,0)/clips.length,minCoverage:Math.min(...clips.map(c=>c.coverage)),trianglesRange:[Math.min(...assets.map(a=>a.triangles)),Math.max(...assets.map(a=>a.triangles))],totalGLBBytes:assets.reduce((s,a)=>s+a.bytes,0),folderBytesBeforeReports:totalBytes,khronosErrors:assets.reduce((s,a)=>s+a.validator.errors,0),khronosWarnings:assets.reduce((s,a)=>s+a.validator.warnings,0),limits:{folderBytes:8000000,trianglesPerAsset:[1000,1300],joints:18,nativeHz:30,auditHz:60,maxMeshFloorPenetrationMeters:.005},failures};
await fs.mkdir(verification,{recursive:true});
await fs.writeFile(path.join(verification,'assets.json'),JSON.stringify(assets,null,2)+'\n');
await fs.writeFile(path.join(verification,'motion-qa.json'),JSON.stringify({provenance,definitions:METRICS,clips},null,2)+'\n');
let previousSummaryBytes=0;
try{previousSummaryBytes=(await fs.stat(path.join(verification,'summary.json'))).size;}catch{}
const baseBytes=await bytesIn(root)-previousSummaryBytes;
summary.folderBytes=baseBytes;
for(let i=0;i<4;i++)summary.folderBytes=baseBytes+Buffer.byteLength(JSON.stringify(summary,null,2)+'\n');
check(summary.folderBytes<=8000000,'Entire deliverable exceeds 8 MB',{totalBytes:summary.folderBytes});
summary.pass=failures.length===0;
for(let i=0;i<4;i++)summary.folderBytes=baseBytes+Buffer.byteLength(JSON.stringify(summary,null,2)+'\n');
await fs.writeFile(path.join(verification,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(failures.length)process.exitCode=1;
