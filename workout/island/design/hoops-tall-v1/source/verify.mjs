/** Original CC0-1.0. Independent delivered-asset audit; authoring dependencies live in /tmp. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(process.env.HOOPS_TALL_TOOLS||process.env.HOOPS_TALL_TOOLS_DIR||'/tmp/hoops-tall-tools','package.json'));
export const BONE_NAMES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
export const CRITICAL_CLIPS=['dribble_forward','layup_right','dunk_one_hand','dunk_two_hands','defensive_stance','rebound_jump'];
const EXPECTED_PARENTS=[null,'Root','Hips','Spine','Chest','Neck','Chest','LeftArm','LeftForeArm','Chest','RightArm','RightForeArm','Hips','LeftUpLeg','LeftLeg','Hips','RightUpLeg','RightLeg'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const multiply=(a,b)=>[
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
const rotate=(q,v)=>multiply(multiply(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
export const palmsFor=profile=>Object.fromEntries(['LeftHand','RightHand'].map(hand=>[hand,profile.palms?.[hand]?.palmPoint||profile.palmPoint||[0,-.12,.025]]));

/** This FK intentionally does not import runtime/retarget.mjs. */
export function independentFK(profile,frame,jumpScale=1){
  const world={};
  for(const joint of profile.joints){
    const local=[...joint.translation];
    if(joint.name==='Hips'){
      const offset=frame.hipsOffsetMeters||[0,0,0];
      local[0]+=offset[0];local[1]+=offset[1]>0?offset[1]*jumpScale:offset[1];local[2]+=offset[2];
    }
    const parent=world[joint.parent],rotation=frame.rotations[joint.name];
    if(!rotation)throw Error(`Missing rotation ${joint.name}`);
    world[joint.name]=parent?{position:add(parent.position,rotate(parent.rotation,local)),rotation:multiply(parent.rotation,rotation)}:{position:local,rotation:[...rotation]};
  }
  return {world,palms:Object.fromEntries(Object.entries(palmsFor(profile)).map(([name,point])=>[name,add(world[name].position,rotate(world[name].rotation,point))]))};
}

/** Minimum amplitude of the original positive Hips envelope, both hands for two-hand dunk. */
export function independentDunk(clip,profile){
  const hands=clip.id==='dunk_two_hands'?['LeftHand','RightHand']:['RightHand'];
  const sourcePeakHipsLift=Math.max(...clip.keyframes.map(f=>f.hipsOffsetMeters[1]));
  let best=null;
  for(const frame of clip.keyframes){
    if(frame.time<.45||frame.time>.62||frame.hipsOffsetMeters[1]<=0)continue;
    const fk=independentFK(profile,frame,0),staticPalmHeight=Math.min(...hands.map(hand=>fk.palms[hand][1]));
    const jumpScale=Math.max(0,(3.305-staticPalmHeight)/frame.hipsOffsetMeters[1]);
    if(!best||jumpScale<best.jumpScale)best={jumpScale,time:frame.time,staticPalmHeight,frame};
  }
  if(!best)throw Error(`No dunk flight: ${clip.id}`);
  const fk=independentFK(profile,best.frame,best.jumpScale),peakPalmHeight=Math.min(...hands.map(hand=>fk.palms[hand][1]));
  return {clip:clip.id,hands,time:best.time,timeSeconds:best.time*clip.durationSeconds,sourcePeakHipsLift,
    jumpScale:best.jumpScale,requiredJump:sourcePeakHipsLift*best.jumpScale,peakHipsLift:sourcePeakHipsLift*best.jumpScale,
    staticPalmHeight:best.staticPalmHeight,peakPalmHeight,clearance:peakPalmHeight-3.05,
    palmPositions:Object.fromEntries(hands.map(hand=>[hand,fk.palms[hand]])),pass:peakPalmHeight>=3.30-1e-8&&sourcePeakHipsLift*best.jumpScale<=1};
}

function quaternionSlerp(a,b,t){
  let dot=a.reduce((sum,v,i)=>sum+v*b[i],0);
  if(dot<0){b=b.map(v=>-v);dot=-dot;}
  if(dot>.9995){const result=a.map((v,i)=>v+(b[i]-v)*t),length=Math.hypot(...result);return result.map(v=>v/length);}
  const angle=Math.acos(Math.min(1,dot)),sin=Math.sin(angle);
  return a.map((v,i)=>(Math.sin((1-t)*angle)*v+Math.sin(t*angle)*b[i])/sin);
}
export function independentSample(clip,time){
  const frames=clip.keyframes,t=Math.max(0,Math.min(1,time));let lo=0,hi=frames.length-1;
  while(hi-lo>1){const mid=(hi+lo)>>1;if(frames[mid].time<=t)lo=mid;else hi=mid;}
  const a=frames[lo],b=frames[hi],u=Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time||1)));
  return {time:t,rotations:Object.fromEntries(Object.keys(a.rotations).map(name=>[name,quaternionSlerp(a.rotations[name],b.rotations[name],u)])),
    hipsOffsetMeters:a.hipsOffsetMeters.map((v,i)=>v+(b.hipsOffsetMeters[i]-v)*u)};
}

async function listFiles(directory){
  const result=[];
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const filename=path.join(directory,entry.name);
    if(entry.isDirectory())result.push(...await listFiles(filename));else result.push(filename);
  }
  return result.sort();
}
async function createIO(){
  const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),draco=require('draco3dgltf');
  const {MeshoptDecoder}=require('meshoptimizer');await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule(),'meshopt.decoder':MeshoptDecoder});
}
const attributeDigest=attribute=>attribute?hash(Buffer.from(attribute.getArray().buffer,attribute.getArray().byteOffset,attribute.getArray().byteLength)):null;
const closeArray=(a,b,epsilon=1e-5)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=epsilon);

async function inspectGLB(filename,io,profile){
  const bytes=await fs.readFile(filename),document=await io.readBinary(bytes),root=document.getRoot();
  const jointNodes=root.listSkins().flatMap(s=>s.listJoints()),uniqueJoints=[...new Set(jointNodes)];
  const jointNames=uniqueJoints.map(j=>j.getName()),hierarchy=uniqueJoints.map(j=>({name:j.getName(),parent:jointNames.includes(j.getParentNode()?.getName())?j.getParentNode().getName():null,
    translation:j.getTranslation(),rotation:j.getRotation(),scale:j.getScale()}));
  const primitives=root.listMeshes().flatMap(m=>m.listPrimitives());
  const triangles=primitives.reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
  const uvs=primitives.map(p=>({material:p.getMaterial()?.getName(),count:p.getAttribute('TEXCOORD_0')?.getCount()||0,hash:attributeDigest(p.getAttribute('TEXCOORD_0'))}));
  const indices=primitives.map(p=>attributeDigest(p.getIndices()));
  let weightError=0,minimumWeight=1,maximumWeight=0,invalidJoints=0,finite=true,maximumNormalLengthError=0;
  const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
  for(const p of primitives){
    for(const semantic of p.listSemantics())for(const value of p.getAttribute(semantic).getArray())finite&&=Number.isFinite(value);
    const weights=p.getAttribute('WEIGHTS_0'),joints=p.getAttribute('JOINTS_0');
    const positions=p.getAttribute('POSITION'),normals=p.getAttribute('NORMAL');
    for(let i=0;i<positions.getCount();i++){
      const point=positions.getElement(i,[]);point.forEach((v,k)=>{minimum[k]=Math.min(minimum[k],v);maximum[k]=Math.max(maximum[k],v);});
      maximumNormalLengthError=Math.max(maximumNormalLengthError,Math.abs(Math.hypot(...normals.getElement(i,[]))-1));
    }
    if(!weights||!joints)throw Error(`Unskinned primitive: ${filename}`);
    for(let i=0;i<weights.getCount();i++){
      const w=weights.getElement(i,[]),j=joints.getElement(i,[]);weightError=Math.max(weightError,Math.abs(w.reduce((a,b)=>a+b,0)-1));
      minimumWeight=Math.min(minimumWeight,...w);maximumWeight=Math.max(maximumWeight,...w);
      invalidJoints+=j.filter((value,k)=>w[k]>0&&(!Number.isInteger(value)||value<0||value>=18)).length;
    }
  }
  const sharp=require('sharp'),textures=[];
  for(const texture of root.listTextures()){
    const image=texture.getImage(),metadata=await sharp(image).metadata();
    await sharp(image).raw().toBuffer();
    textures.push({name:texture.getName(),mimeType:texture.getMimeType(),width:metadata.width,height:metadata.height,bytes:image.length,sha256:hash(image)});
  }
  const inverseBinds=root.listSkins().map(s=>{
    const actual=s.getInverseBindMatrices(),joints=s.listJoints();let maximumError=0;
    for(let i=0;i<joints.length;i++){
      const a=actual.getElement(i,[]),position=joints[i].getWorldTranslation();
      const expected=[1,0,0,0,0,1,0,0,0,0,1,0,...position.map(v=>-v),1];
      maximumError=Math.max(maximumError,...a.map((v,k)=>Math.abs(v-expected[k])));
    }
    return maximumError;
  });
  const hierarchyMatches=hierarchy.length===18&&hierarchy.every(j=>{
    const index=BONE_NAMES.indexOf(j.name),reference=profile.joints.find(x=>x.name===j.name);
    return index>=0&&j.parent===EXPECTED_PARENTS[index]&&reference&&closeArray(j.translation,reference.translation)&&closeArray(j.rotation,[0,0,0,1])&&closeArray(j.scale,[1,1,1]);
  });
  return {document,summary:{path:path.relative(ROOT,filename),bytes:bytes.length,sha256:hash(bytes),triangles,vertices:primitives.reduce((n,p)=>n+p.getAttribute('POSITION').getCount(),0),
    jointNames,hierarchy,hierarchyMatches,extensions:root.listExtensionsRequired().map(e=>e.extensionName),extensionsUsed:root.listExtensionsUsed().map(e=>e.extensionName),
    textures,uvs,indices,finite,weightError,minimumWeight,maximumWeight,invalidJoints,maximumNormalLengthError,
    bounds:{minimum,maximum,height:maximum[1]-minimum[1]},materials:root.listMaterials().map(m=>m.getName()),inverseBindMaximumError:Math.max(...inverseBinds)}};
}

/** Actual LBS deformation, with fixed edge thresholds declared before measurement. */
function deformVertex(primitive,index,jointNames,bindPositions,fk){
  const original=primitive.getAttribute('POSITION').getElement(index,[]),weights=primitive.getAttribute('WEIGHTS_0').getElement(index,[]),indices=primitive.getAttribute('JOINTS_0').getElement(index,[]);
  let point=[0,0,0];
  for(let k=0;k<weights.length;k++)if(weights[k]){
    const name=jointNames[indices[k]],bind=bindPositions[name],joint=fk.world[name];
    const delta=original.map((v,j)=>v-bind[j]),transformed=add(joint.position,rotate(joint.rotation,delta));
    point=point.map((v,j)=>v+transformed[j]*weights[k]);
  }
  return point;
}
function physicalPalmMetrics(document,profile,clip,calibration){
  const skin=document.getRoot().listSkins()[0],jointNames=skin.listJoints().map(j=>j.getName()),bindPositions=Object.fromEntries(skin.listJoints().map(j=>[j.getName(),j.getWorldTranslation()]));
  const primitives=document.getRoot().listMeshes().flatMap(m=>m.listPrimitives());
  const frame=clip.keyframes.reduce((a,b)=>Math.abs(a.time-calibration.time)<Math.abs(b.time-calibration.time)?a:b),fk=independentFK(profile,frame,calibration.jumpScale),hands={};
  for(const hand of calibration.hands){
    const surface=profile.palms[hand].palmSurface,primitive=primitives[surface.primitive],index=surface.sourceVertex;
    const actual=deformVertex(primitive,index,jointNames,bindPositions,fk),bind=primitive.getAttribute('POSITION').getElement(index,[]),joint=bindPositions[hand],point=profile.palms[hand].palmPoint;
    hands[hand]={primitive:surface.primitive,vertex:index,position:actual,height:actual[1],clearance:actual[1]-3.05,
      guideDistance:distance(actual,fk.palms[hand]),bindGuideDistance:distance(bind,add(joint,point))};
  }
  return {hands,minimumHeight:Math.min(...Object.values(hands).map(h=>h.height)),minimumClearance:Math.min(...Object.values(hands).map(h=>h.clearance))};
}
function surfaceMetrics(document,profile,clips){
  const skin=document.getRoot().listSkins()[0],jointNames=skin.listJoints().map(j=>j.getName());
  const bindPositions=Object.fromEntries(skin.listJoints().map(j=>[j.getName(),j.getWorldTranslation()]));
  const geometry=document.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives()).map((p,primitiveIndex)=>{
    const positions=p.getAttribute('POSITION'),joints=p.getAttribute('JOINTS_0'),weights=p.getAttribute('WEIGHTS_0'),edges=new Map();
    const indices=p.getIndices()?.getArray()||Array.from({length:positions.getCount()},(_,i)=>i);
    for(let i=0;i<indices.length;i+=3)for(const [a,b] of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){
      const key=a<b?`${a}:${b}`:`${b}:${a}`;
      if(!edges.has(key)){const length=distance(positions.getElement(a,[]),positions.getElement(b,[]));if(length>=.005)edges.set(key,{a,b,length});}
    }
    return {positions,joints,weights,primitiveIndex,material:p.getMaterial().getName(),edges:[...edges.values()]};
  });
  const output=[];
  for(const clip of clips){
    const calibration=clip.id.startsWith('dunk_')?independentDunk(clip,profile):{jumpScale:1};
    let finite=true;const ratios=[];let collapsed=0,total=0,maximumEdge=null;
    for(const time of [0,.25,.5,.5694444444,.75,1]){
      const fk=independentFK(profile,independentSample(clip,time),calibration.jumpScale);
      for(const g of geometry){
        const deformed=[];
        for(let i=0;i<g.positions.getCount();i++){
          const original=g.positions.getElement(i,[]),weights=g.weights.getElement(i,[]),indices=g.joints.getElement(i,[]);let point=[0,0,0];
          for(let k=0;k<weights.length;k++)if(weights[k]){
            const name=jointNames[indices[k]],bind=bindPositions[name],joint=fk.world[name];
            const delta=original.map((v,j)=>v-bind[j]),transformed=add(joint.position,rotate(joint.rotation,delta));
            point=point.map((v,j)=>v+transformed[j]*weights[k]);
          }
          finite&&=point.every(Number.isFinite);deformed.push(point);
        }
        for(const edge of g.edges){const deformedLength=distance(deformed[edge.a],deformed[edge.b]),ratio=deformedLength/edge.length;ratios.push(ratio);total++;if(ratio<.05)collapsed++;
          if(!maximumEdge||ratio>maximumEdge.ratio)maximumEdge={ratio,time,primitive:g.primitiveIndex,material:g.material,a:edge.a,b:edge.b,restLength:edge.length,deformedLength,
            aPosition:g.positions.getElement(edge.a,[]),bPosition:g.positions.getElement(edge.b,[]),aJoints:g.joints.getElement(edge.a,[]),bJoints:g.joints.getElement(edge.b,[]),aWeights:g.weights.getElement(edge.a,[]),bWeights:g.weights.getElement(edge.b,[])};
        }
      }
    }
    ratios.sort((a,b)=>a-b);
    output.push({clip:clip.id,sampleTimes:[0,.25,.5,.5694444444,.75,1],finite,edgesSampled:total,
      p99EdgeStretch:ratios[Math.floor((ratios.length-1)*.99)],maximumEdgeStretch:ratios.at(-1),minimumEdgeRatio:ratios[0],collapsedEdgeFraction:collapsed/total,maximumEdge,
      gates:{p99LessThan:3,maximumLessThan:8,restEdgeMinimumMeters:.005}});
  }
  return output;
}

export async function verifyPackage({write=false}={}){
  const [rig,catalog]=await Promise.all(['rig.json','catalog.json'].map(async f=>JSON.parse(await fs.readFile(path.join(ROOT,f),'utf8'))));
  const profiles=Array.isArray(rig.profiles)?rig.profiles:Object.entries(rig.profiles).map(([id,p])=>({id,...p}));
  const clips=[];
  for(const entry of catalog.clips){
    const bytes=await fs.readFile(path.join(ROOT,entry.path)),clip=JSON.parse(gunzipSync(bytes));
    clips.push({entry,clip,sha256:hash(bytes),bytes:bytes.length,hashMatches:hash(bytes)===entry.sha256,
      skeletonMatches:JSON.stringify(clip.skeleton.bones.map(b=>[b.name,b.parent]))===JSON.stringify(BONE_NAMES.map((name,i)=>[name,EXPECTED_PARENTS[i]]))});
  }
  const io=await createIO(),models=[],modelDocuments={};
  const validator=require('gltf-validator'),validation=[];
  for(const profile of profiles)for(const prefix of ['runtime','models']){
    const filename=path.join(ROOT,prefix,`${profile.id}.glb`),inspected=await inspectGLB(filename,io,profile);
    models.push({...inspected.summary,profile:profile.id,format:prefix==='runtime'?'plain':'draco'});
    if(prefix==='runtime')modelDocuments[profile.id]=inspected.document;
    const report=await validator.validateBytes(new Uint8Array(await fs.readFile(filename)),{uri:path.relative(ROOT,filename),maxIssues:100});
    validation.push({path:path.relative(ROOT,filename),errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,messages:report.issues.messages});
  }
  const {forwardKinematics,calibrateDunk,sampleClip}=await import('../runtime/retarget.mjs');
  const measurements=[];let allFrameCount=0,maximumBoneLengthError=0,maximumRuntimeFKError=0,maximumQuaternionNormError=0,maximumSamplingError=0;
  for(const profile of profiles){
    const dunks=clips.filter(c=>c.entry.library==='v9'&&c.entry.id.startsWith('dunk_'));
    const dunkMetrics=dunks.map(({clip})=>{
      const independent=independentDunk(clip,profile),runtime=calibrateDunk(clip,profile);
      return {...independent,physicalPalm:physicalPalmMetrics(modelDocuments[profile.id],profile,clip,independent),runtimeCalibrationDifference:Math.max(Math.abs(independent.jumpScale-runtime.jumpScale),Math.abs(independent.requiredJump-runtime.requiredJump),Math.abs(independent.peakPalmHeight-runtime.peakPalmHeight))};
    });
    for(const {clip} of clips){
      const scale=clip.id.startsWith('dunk_')?independentDunk(clip,profile).jumpScale:1;
      for(const frame of clip.keyframes){
        allFrameCount++;const independent=independentFK(profile,frame,scale),runtime=forwardKinematics(profile,frame,{jumpScale:scale});
        for(const j of profile.joints){
          const a=independent.world[j.name];maximumRuntimeFKError=Math.max(maximumRuntimeFKError,distance(a.position,runtime.world[j.name].position));
          maximumQuaternionNormError=Math.max(maximumQuaternionNormError,Math.abs(Math.hypot(...frame.rotations[j.name])-1));
          if(j.parent&&j.name!=='Hips')maximumBoneLengthError=Math.max(maximumBoneLengthError,Math.abs(distance(a.position,independent.world[j.parent].position)-Math.hypot(...j.translation)));
        }
      }
      for(const time of [.137,.423,.731]){
        const independent=independentSample(clip,time),runtime=sampleClip(clip,time);
        maximumSamplingError=Math.max(maximumSamplingError,distance(independent.hipsOffsetMeters,runtime.hipsOffsetMeters));
        for(const name of BONE_NAMES)maximumSamplingError=Math.max(maximumSamplingError,distance(independent.rotations[name],runtime.rotations[name]));
      }
    }
    measurements.push({profile:profile.id,height:profile.heightMeters??profile.height,armLength:profile.armLengthMeters??profile.armLength,dunks:dunkMetrics,
      surface:surfaceMetrics(modelDocuments[profile.id],profile,clips.filter(c=>c.entry.library==='v9'&&CRITICAL_CLIPS.includes(c.entry.id)).map(c=>c.clip))});
  }
  const runtimeModels=models.filter(m=>m.format==='plain'),sharedUVLayout=runtimeModels.every(m=>JSON.stringify(m.uvs)===JSON.stringify(runtimeModels[0].uvs)),sharedTopology=runtimeModels.every(m=>JSON.stringify(m.indices)===JSON.stringify(runtimeModels[0].indices));
  const files=[];
  for(const filename of await listFiles(ROOT)){
    const bytes=await fs.readFile(filename),relative=path.relative(ROOT,filename);
    // Outputs cannot contain their own stable content hash; they are still opened and parsed.
    files.push(['verification/metrics.json','verification/gltf-validation.json'].includes(relative)?{path:relative,generatedAuditOutput:true}:{path:relative,bytes:bytes.length,sha256:hash(bytes)});
    if(filename.endsWith('.json'))JSON.parse(bytes.toString('utf8'));
    else if(filename.endsWith('.json.gz'))JSON.parse(gunzipSync(bytes));
    else if(/\.(png|webp|jpe?g)$/i.test(filename))await require('sharp')(bytes).raw().toBuffer();
  }
  const metrics={schemaVersion:1,method:'Independent quaternion FK and actual delivered-mesh LBS; metres; no Root/reference path added to reach.',
    limitations:'Bone-length preservation and sampled edge stretch do not prove universal skin nonintersection, foot locking or live-ball contact.',
    clipCount:clips.length,clips:clips.map(({entry,clip,sha256,bytes,hashMatches,skeletonMatches})=>({library:entry.library,id:clip.id,path:entry.path,sha256,bytes,hashMatches,skeletonMatches,frames:clip.keyframes.length})),
    profileCount:profiles.length,models,sharedUVLayout,sharedTopology,allFrameCount,maximumBoneLengthError,maximumRuntimeFKError,maximumQuaternionNormError,maximumSamplingError,measurements,files};
  if(write){
    await fs.mkdir(path.join(ROOT,'verification'),{recursive:true});
    await fs.writeFile(path.join(ROOT,'verification/metrics.json'),JSON.stringify(metrics,null,2)+'\n');
    await fs.writeFile(path.join(ROOT,'verification/gltf-validation.json'),JSON.stringify({schemaVersion:1,files:validation},null,2)+'\n');
  }
  return {metrics,validation,rig,profiles,catalog,clips};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {metrics,validation}=await verifyPackage({write:true});
  console.log(JSON.stringify({clips:metrics.clipCount,profiles:metrics.profileCount,glbs:metrics.models.length,frameEvaluations:metrics.allFrameCount,
    sharedUVLayout:metrics.sharedUVLayout,gltfErrors:validation.reduce((n,v)=>n+v.errors,0),dunks:metrics.measurements.map(m=>({profile:m.profile,dunks:m.dunks.map(d=>({clip:d.clip,jump:d.requiredJump,palm:d.peakPalmHeight,pass:d.pass}))}))},null,2));
}
