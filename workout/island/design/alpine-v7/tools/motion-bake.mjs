/* Authoring only. Append standard glTF animation channels; no custom runtime
 * extension is required. All output paths must be inside this new asset pack.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import * as THREE from '../../../vendor/three.module.js';
import {BONE_NAMES,CLIPS,createMotionAnimator} from '../motion/motion.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/alpine-v7-tools/package.json');

/** Construct an image-free authoring proxy from the decoded glTF document.
 * Same skin, local transforms and inverse binds as GLTFLoader, without a DOM.
 */
export function documentScene(doc){
  const root=doc.getRoot(),scene=new THREE.Group(),nodeMap=new Map(),byName={};
  for(const node of root.listNodes()){
    const obj=BONE_NAMES.includes(node.getName())?new THREE.Bone():new THREE.Group();
    obj.name=node.getName();obj.position.fromArray(node.getTranslation());obj.quaternion.fromArray(node.getRotation());obj.scale.fromArray(node.getScale());
    nodeMap.set(node,obj);if(obj.name)byName[obj.name]=obj;
  }
  for(const node of root.listNodes())for(const child of node.listChildren())nodeMap.get(node).add(nodeMap.get(child));
  const gltfScene=root.getDefaultScene()||root.listScenes()[0];
  for(const child of gltfScene.listChildren())scene.add(nodeMap.get(child));
  scene.updateMatrixWorld(true);
  const material=new THREE.MeshBasicMaterial();
  for(const node of root.listNodes())if(node.getMesh())for(const prim of node.getMesh().listPrimitives()){
    const geo=new THREE.BufferGeometry();
    for(const [semantic,key]of [['POSITION','position'],['NORMAL','normal'],['JOINTS_0','skinIndex'],['WEIGHTS_0','skinWeight']]){
      const a=prim.getAttribute(semantic);if(a)geo.setAttribute(key,new THREE.BufferAttribute(a.getArray().slice(),a.getElementSize(),a.getNormalized()));
    }
    if(prim.getIndices())geo.setIndex(new THREE.BufferAttribute(prim.getIndices().getArray().slice(),1));
    const mesh=node.getSkin()?new THREE.SkinnedMesh(geo,material):new THREE.Mesh(geo,material);
    mesh.name=node.getMesh().getName();nodeMap.get(node).add(mesh);
    if(node.getSkin()){
      const skin=node.getSkin(),joints=skin.listJoints(),inverse=skin.getInverseBindMatrices().getArray();
      const skeleton=new THREE.Skeleton(joints.map(j=>nodeMap.get(j)),joints.map((_,i)=>new THREE.Matrix4().fromArray(inverse,i*16)));
      scene.updateMatrixWorld(true);mesh.bind(skeleton,new THREE.Matrix4());
    }
  }
  scene.updateMatrixWorld(true);
  return {scene,nodeMap,byName};
}

const roundArray=a=>Array.from(a,v=>Math.round(v*1e6)/1e6);
const hemisphere=data=>{for(let i=4;i<data.length;i+=4)if(data[i]*data[i-4]+data[i+1]*data[i-3]+data[i+2]*data[i-2]+data[i+3]*data[i-1]<0)for(let k=0;k<4;k++)data[i+k]*=-1;};
const maximum=a=>a.length?Math.max(...a):0;

/** Adaptive key reduction against the original 30 Hz presentation curve.
 * Quaternion error uses slerp, so 180/360/flip winding is retained by the
 * intermediate orientations. Each retained interval is checked at every input
 * sample, not merely at its midpoint.
 */
export function reduceTrack(times,data,path,{angularTolerance=.00025,positionTolerance=.00010}={}){
  const size=path==='rotation'?4:3,tolerance=path==='rotation'?angularTolerance:positionTolerance;
  const retained=new Set([0,times.length-1]),stack=[[0,times.length-1]];
  const qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),qt=new THREE.Quaternion(),actual=new THREE.Quaternion();
  function error(a,b,i){
    const t=(times[i]-times[a])/(times[b]-times[a]);
    if(size===4){qa.fromArray(data,a*4);qb.fromArray(data,b*4);qt.copy(qa).slerp(qb,t);actual.fromArray(data,i*4);return qt.angleTo(actual);}
    let square=0;for(let c=0;c<3;c++){const d=data[a*3+c]+(data[b*3+c]-data[a*3+c])*t-data[i*3+c];square+=d*d;}return Math.sqrt(square);
  }
  while(stack.length){
    const [a,b]=stack.pop();if(b-a<2)continue;let worst=-1,index=-1;
    for(let i=a+1;i<b;i++){const e=error(a,b,i);if(e>worst){worst=e;index=i;}}
    if(worst>tolerance){retained.add(index);stack.push([a,index],[index,b]);}
  }
  const indices=[...retained].sort((a,b)=>a-b),values=[];for(const i of indices)values.push(...data.slice(i*size,(i+1)*size));
  let maxError=0;for(let k=1;k<indices.length;k++)for(let i=indices[k-1]+1;i<indices[k];i++)maxError=Math.max(maxError,error(indices[k-1],indices[k],i));
  return {times:indices.map(i=>times[i]),values,indices,maxError,originalKeys:times.length,retainedKeys:indices.length};
}

function stamp(animator,tracks,seconds){
  animator.reset();
  for(const track of tracks){
    const {times,values,path,node}=track,obj=animator.nodes[node],size=path==='rotation'?4:3;
    let lo=0,hi=times.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]<=seconds)lo=mid;else hi=mid;}
    const t=times[hi]===times[lo]?0:Math.max(0,Math.min(1,(seconds-times[lo])/(times[hi]-times[lo])));
    if(path==='rotation')obj.quaternion.fromArray(values,lo*4).slerp(new THREE.Quaternion().fromArray(values,hi*4),t).normalize();
    else for(let c=0;c<size;c++)obj.position.setComponent(c,values[lo*size+c]+(values[hi*size+c]-values[lo*size+c])*t);
  }
  animator.update();
}

/** Independent world-space check of reduced versus full sampled channels at
 * every authored sample and every interval midpoint (approximately 60 Hz).
 * Foot extrema use all dominant foot vertices, including the full ski blades.
 */
function compareReduction(animator,dense,reduced,times){
  const checks=[...times];for(let i=1;i<times.length;i++)checks.push((times[i-1]+times[i])/2);
  let maxJointPositionErrorMeters=0,maxJointAngularErrorRadians=0,maxFootVertexErrorMeters=0,maxFootHeightErrorMeters=0;
  const reference={};
  for(const t of checks){
    stamp(animator,dense,t);
    for(const n of BONE_NAMES)reference[n]={p:animator.bones[n].getWorldPosition(new THREE.Vector3()),q:animator.bones[n].getWorldQuaternion(new THREE.Quaternion()),m:animator.bones[n].matrixWorld.clone()};
    stamp(animator,reduced,t);
    for(const n of BONE_NAMES){
      const b=animator.bones[n];maxJointPositionErrorMeters=Math.max(maxJointPositionErrorMeters,b.getWorldPosition(new THREE.Vector3()).distanceTo(reference[n].p));
      maxJointAngularErrorRadians=Math.max(maxJointAngularErrorRadians,b.getWorldQuaternion(new THREE.Quaternion()).angleTo(reference[n].q));
    }
    for(const n of ['LeftFoot','RightFoot']){
      const a=reference[n].m.elements,b=animator.bones[n].matrixWorld.elements;let minA=Infinity,minB=Infinity;
      for(const v of animator.footPoints[n]){
        const dx=(a[0]-b[0])*v.x+(a[4]-b[4])*v.y+(a[8]-b[8])*v.z+a[12]-b[12];
        const dy=(a[1]-b[1])*v.x+(a[5]-b[5])*v.y+(a[9]-b[9])*v.z+a[13]-b[13];
        const dz=(a[2]-b[2])*v.x+(a[6]-b[6])*v.y+(a[10]-b[10])*v.z+a[14]-b[14];
        maxFootVertexErrorMeters=Math.max(maxFootVertexErrorMeters,Math.sqrt(dx*dx+dy*dy+dz*dz));
        minA=Math.min(minA,a[1]*v.x+a[5]*v.y+a[9]*v.z+a[13]);minB=Math.min(minB,b[1]*v.x+b[5]*v.y+b[9]*v.z+b[13]);
      }
      maxFootHeightErrorMeters=Math.max(maxFootHeightErrorMeters,Math.abs(minA-minB));
    }
  }
  return {samples:checks.length,maxJointPositionErrorMeters,maxJointAngularErrorRadians,maxFootVertexErrorMeters,maxFootHeightErrorMeters};
}

/** Called by the character build after its geometry, rig and equipment exist.
 * Output JSON is optional. Repeated baking replaces existing clips, rather than
 * accumulating duplicated channels. Keep Draco encoding after this step.
 */
export async function bakeMotions(doc,{rig,sport='ski',hz=30,jsonPath=null,metricsPath=null}={}){
  if(hz<30)throw new Error('Motion bake must preserve at least 30 samples/sec');
  const root=doc.getRoot(),{scene,byName}=documentScene(doc),animator=createMotionAnimator(scene,{rig,sport});
  const docByName=Object.fromEntries(root.listNodes().map(n=>[n.getName(),n]));
  const oldAccessors=new Set();
  for(const a of root.listAnimations()){
    for(const s of a.listSamplers()){oldAccessors.add(s.getInput());oldAccessors.add(s.getOutput());}
    for(const c of a.listChannels())c.dispose();for(const s of a.listSamplers())s.dispose();a.dispose();
  }
  for(const a of oldAccessors)if(a)a.dispose();
  const buffer=root.listBuffers()[0]||doc.createBuffer('alpine-v7');
  const accessor=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
  const trackNodes=[...BONE_NAMES,...['Snowboard','LeftPole','RightPole'].filter(n=>byName[n])];
  const translationNodes=new Set(['Root','Hips','Snowboard','LeftPole','RightPole']);
  const metrics=[],jsonClips=[];
  for(const clip of CLIPS){
    const count=Math.ceil(clip.duration*hz),times=Array.from({length:count+1},(_,i)=>i*clip.duration/count);
    // Include every phase event exactly as well as the uniform bake.
    for(const event of clip.events)times.push(event.time);
    times.sort((a,b)=>a-b);const unique=times.filter((v,i)=>!i||v-times[i-1]>1e-7);
    const values=Object.fromEntries(trackNodes.map(n=>[n,{rotation:[],translation:[]}])) ,frames=[];
    let minY=Infinity,minBoardY=Infinity,maxFootError=0,maxArmError=0,maxGrabError=0,maxFloorLift=0,maxQuatError=0,maxEdge=0;
    let apex=null;
    for(const t of unique){
      const snap=animator.apply(clip.name,t,{wrap:false});
      for(const name of trackNodes){
        const o=byName[name];values[name].rotation.push(...o.quaternion.toArray());
        if(translationNodes.has(name))values[name].translation.push(...o.position.toArray());
        maxQuatError=Math.max(maxQuatError,Math.abs(o.quaternion.length()-1));
      }
      minY=Math.min(minY,...Object.values(snap.feetMinimumY));
      if(snap.boardMinimumY!==null)minBoardY=Math.min(minBoardY,snap.boardMinimumY);
      maxFootError=Math.max(maxFootError,maximum(Object.values(snap.footReachErrorMeters)));
      maxArmError=Math.max(maxArmError,maximum(Object.values(snap.armReachErrorMeters)));
      if(snap.parameters.grab>.99)maxGrabError=Math.max(maxGrabError,snap.grabErrorMeters??0);
      maxFloorLift=Math.max(maxFloorLift,snap.floorLiftMeters);maxEdge=Math.max(maxEdge,Math.abs(snap.edgeDegrees));
      if(!apex||Math.abs(t/clip.duration-.5)<Math.abs(apex.normalizedTime-.5))apex={normalizedTime:t/clip.duration,kneeFlexDegrees:snap.kneeFlexDegrees,torsoInclinationDegrees:snap.torsoInclinationDegrees,feetMinimumY:snap.feetMinimumY,edgeDegrees:snap.edgeDegrees,pelvis:snap.jointPositions.Hips,grabErrorMeters:snap.grabErrorMeters};
      frames.push({time:t,knees:snap.kneeFlexDegrees,torso:snap.torsoInclinationDegrees,edge:snap.edgeDegrees,grab:snap.parameters.grab,grabError:snap.grabErrorMeters,footError:snap.footReachErrorMeters,floorLift:snap.floorLiftMeters});
    }
    const animation=doc.createAnimation(clip.name).setExtras({loop:clip.loop,label:clip.label,durationSeconds:clip.duration,category:clip.category,events:clip.events,rootMotion:'in-place presentation; horizontal host locomotion remains external',authoredBy:'Original alpine-v7 analytic limb IK',sampleHz:hz});
    const packed=[],dense=[],timeInputs=new Map();let originalKeys=0,retainedKeys=0,originalValueScalars=0,retainedValueScalars=0,maxAngularError=0,maxTranslationError=0;
    for(const name of trackNodes)for(const targetPath of ['rotation','translation']){
      const data=values[name][targetPath];if(!data.length)continue;
      if(targetPath==='rotation')hemisphere(data);
      // Omit constant channels whose value already equals the preserved bind.
      const size=targetPath==='rotation'?4:3,first=data.slice(0,size),constant=data.every((v,i)=>Math.abs(v-first[i%size])<1e-8);
      const original=targetPath==='rotation'?docByName[name].getRotation():docByName[name].getTranslation();
      if(constant&&first.every((v,i)=>Math.abs(v-original[i])<1e-8))continue;
      const reduced=reduceTrack(unique,data,targetPath);originalKeys+=reduced.originalKeys;retainedKeys+=reduced.retainedKeys;
      originalValueScalars+=data.length;retainedValueScalars+=reduced.values.length;
      if(targetPath==='rotation')maxAngularError=Math.max(maxAngularError,reduced.maxError);else maxTranslationError=Math.max(maxTranslationError,reduced.maxError);
      const key=reduced.indices.join(',');let input=timeInputs.get(key);
      if(!input){input=accessor(`${clip.name}/time/${timeInputs.size}`,'SCALAR',new Float32Array(reduced.times));timeInputs.set(key,input);}
      const output=accessor(`${clip.name}/${name}/${targetPath}`,targetPath==='rotation'?'VEC4':'VEC3',new Float32Array(reduced.values));
      const sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(docByName[name]).setTargetPath(targetPath).setSampler(sampler));
      packed.push({node:name,path:targetPath,times:reduced.times,values:reduced.values});
      dense.push({node:name,path:targetPath,times:unique,values:data});
    }
    const originalSamplerBytes=(originalValueScalars+unique.length)*4,reducedSamplerBytes=(retainedValueScalars+[...timeInputs.values()].reduce((n,a)=>n+a.getCount(),0))*4;
    const worldErrors=compareReduction(animator,dense,packed,unique),reduction={originalKeys,retainedKeys,savedFraction:1-retainedKeys/originalKeys,originalSamplerAccessorBytes:originalSamplerBytes,reducedSamplerAccessorBytes:reducedSamplerBytes,samplerByteSavedFraction:1-reducedSamplerBytes/originalSamplerBytes,angularToleranceRadians:.00025,translationToleranceMeters:.00010,maxAngularInterpolationErrorRadians:maxAngularError,maxTranslationInterpolationErrorMeters:maxTranslationError,...worldErrors};
    if(worldErrors.maxFootVertexErrorMeters>.0015)throw new Error(`${clip.name}: reduced foot vertices exceed 1.5mm motion error`);
    metrics.push({name:clip.name,durationSeconds:clip.duration,samples:unique.length,bakeHz:hz,minimumFootGeometryY:minY,minimumBoardGeometryY:Number.isFinite(minBoardY)?minBoardY:null,maxFootReachErrorMeters:maxFootError,maxArmReachErrorMeters:maxArmError,maxFullGrabErrorMeters:maxGrabError,maxFloorLiftMeters:maxFloorLift,maxQuaternionNormError:maxQuatError,maximumEquipmentEdgeDegrees:maxEdge,apex,events:clip.events,reduction,frames});
    jsonClips.push({name:clip.name,label:clip.label,durationSeconds:clip.duration,loop:clip.loop,events:clip.events,referenceSampleTimes:roundArray(unique),tracks:packed.map(t=>({...t,times:roundArray(t.times),values:roundArray(t.values)}))});
  }
  animator.reset();
  const pack={schemaVersion:1,kind:'alpine-v7-baked-local-motion',sport,license:'CC0-1.0',units:'metres',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},skeleton:{name:'Motion2Canonical18',bones:rig.joints.map(j=>({name:j.name,parent:j.parent,translation:j.translation,rotation:j.rotation,scale:j.scale}))},sampleHz:hz,interpolation:'LINEAR; continuous quaternion hemisphere; full rotations sampled through intermediate orientations',clips:jsonClips};
  const report={schemaVersion:1,sport,canonicalBoneCount:18,clipCount:CLIPS.length,sampleHz:hz,method:'Original analytic two-bone IK; target bind segment lengths retained; ordinary glTF channels',limitations:['Design motion in place; the host supplies horizontal travel and ramp collision.','Measured geometry/IK checks use decoded target geometry; physical-phone frame rate is a separate host verification.'],clips:metrics};
  for(const [target,data]of [[jsonPath,pack],[metricsPath,report]])if(target){const dest=path.resolve(target);if(!dest.startsWith(ROOT+path.sep))throw new Error('Motion output must stay inside alpine-v7');await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,JSON.stringify(data)+'\n');}
  return {clips:metrics.map(({frames,...c})=>c),report,pack,animationCount:root.listAnimations().length};
}

/** Standalone optional authoring command. Character builder normally imports
 * bakeMotions before writing its final Draco GLB.
 */
async function main(){
  const arg=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
  const source=arg('--input',null),output=arg('--output',source),sport=arg('--sport','ski');
  if(!source)throw new Error('Usage: node tools/motion-bake.mjs --input characters/ski-male.glb --output characters/ski-male.glb --sport ski');
  const {NodeIO}=require('@gltf-transform/core'),{KHRDracoMeshCompression}=require('@gltf-transform/extensions'),codec=require('draco3dgltf');
  const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({'draco3d.encoder':await codec.createEncoderModule(),'draco3d.decoder':await codec.createDecoderModule()});
  const doc=await io.read(path.resolve(ROOT,source));const rig=JSON.parse(await fs.readFile(path.resolve(ROOT,arg('--rig','characters/rig.json')),'utf8'));
  const result=await bakeMotions(doc,{rig,sport,hz:Number(arg('--hz','30')),jsonPath:path.resolve(ROOT,`motion/${sport}.json`),metricsPath:path.resolve(ROOT,`motion/${sport}-metrics.json`)});
  let ext=doc.getRoot().listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression');if(!ext)ext=doc.createExtension(KHRDracoMeshCompression);
  ext.setRequired(true).setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,encodeSpeed:5,decodeSpeed:5,quantizationBits:{POSITION:16,NORMAL:12,COLOR:12,GENERIC:20}});
  const target=path.resolve(ROOT,output);if(!target.startsWith(ROOT+path.sep))throw new Error('GLB output must stay inside alpine-v7');
  await io.write(target,doc);const bytes=(await fs.stat(target)).size;
  console.log(JSON.stringify({output:path.relative(ROOT,target),bytes,animations:result.animationCount,clips:result.clips},null,2));
  if(bytes>1500000)throw new Error('Animated GLB exceeds 1.5 MB');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
