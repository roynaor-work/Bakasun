/** Local interactive character review. Packaged as a classic script for file://. */
import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {DRACOLoader} from './vendor/DRACOLoader.js';
import {clone} from './vendor/SkeletonUtils.js';
import {createScene} from './source/scene.js';
import {contactsAt,solveFootIK} from './source/motion-runtime.js';
import {createProps} from './source/props.js';
import {LocomotionSpace} from './source/locomotion-space.js';
import {createLocomotionCurve} from './source/locomotion-curve.js';
import {RecoveryState,solveRecoveryHand,RECOVERY_ARM_BONES} from './source/recovery-state.js';
import {createDribbleFootStyle} from './source/locomotion-dribble.js';
let nativeDribbleFootStyle=null;

const $=id=>document.getElementById(id);
const data=globalThis.SOCCER_V7_DATA;
const query=new URLSearchParams(location.search);
if(query.has('clean'))document.body.dataset.clean='true';
const canvas=$('stage');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(32,1,.025,220);
const environment=createScene(THREE,scene,renderer);
const props=createProps(THREE,scene);
const draco=new DRACOLoader().setWorkerLimit(2);
const decodeBase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
// DRACOLoader's stock worker remains unchanged. Libraries are already on disk
// in this package, embedded as data so neither file:// nor offline needs fetch.
draco._loadLibrary=(url,type)=>Promise.resolve(type==='text'?data.decoderJS:decodeBase64(data.decoderWasm).buffer);
const loader=new GLTFLoader().setDRACOLoader(draco);
const templates=new Map(),payloads=new Map();
let desiredTemplatePaths=new Set();
const errors=[];
const clips=data.motion.clips;
const clipMap=new Map(clips.map(c=>[c.id,c]));
let characterID=query.get('character')||data.manifest.characters[0].id;
let view=query.get('view')||'body',lod=query.get('lod')||'auto',lighting=query.get('lighting')||'studio';
let clipID=query.get('clip')||'idle',playing=!query.has('paused')&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!clipMap.has(clipID))clipID=clips[0].id;
let time=0,speed=1,yaw=.16,pitch=0,zoom=1,actors=[],ticket=0,frameRequest=0,disposed=false;
let last=0,accumulator=0,second=0,frameCount=0,fps=0,lastMeasured=0;
const v=new THREE.Vector3(),q=new THREE.Quaternion(),q2=new THREE.Quaternion();
const rootFollow=new THREE.Vector3();
const clamp=THREE.MathUtils.clamp;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const poseFadeSeconds=.30;
const status=s=>{$('status').textContent=s;};
const definition=id=>data.manifest.characters.find(c=>c.id===id);
const currentClip=()=>clipMap.get(clipID);
const currentLevel=()=>lod==='auto'?(view==='pitch'||(view==='body'&&zoom>1.5)?1:0):Number(lod);
const clonePose=p=>({rotations:Object.fromEntries(Object.entries(p.rotations).map(([n,q])=>[n,[...q]])),hipsOffsetMeters:[...p.hipsOffsetMeters]});
const motorClipFor=id=>id==='dribble'?'run_2':id==='decelerate'?'idle':LocomotionSpace.accepts(id)?id:null;
const motorArmBones=['LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand'];
const motorStyleBones=['Spine','Chest','Neck','Head',...motorArmBones];
function motorWorldQuaternions(pose,heading){
  const world={},modelQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading);
  for(const bone of data.motion.skeleton.bones)world[bone.name]=(bone.parent?world[bone.parent].clone():modelQ.clone()).multiply(new THREE.Quaternion().fromArray(pose.rotations[bone.name])).normalize();
  return world;
}
// Preserve displayed world orientation and velocity on a nongait handoff to the
// actual motor mixture. Physical root, foot targets and leg reach stay authoritative.
function motorArmEntryPose(actor,target,heading){
  const fade=actor.motorEntryFade;if(!fade)return target;
  const duration=poseFadeSeconds,world=motorWorldQuaternions(target,heading),epsilon=.0001,entryBones=fade.bones||motorStyleBones;
  if(!fade.offsets){
    const future=actor.locomotion.predict(epsilon),next=motorWorldQuaternions(actor.motorBodyPose(future.pose,future.unwrappedPhase),actor.motorHeading(future.rootDistance));
    fade.offsets={};fade.velocities={};
    for(const name of entryBones){
      const current=new THREE.Quaternion().fromArray(fade.sourceWorld[name]),projected=current.clone();
      if(fade.previousWorld?.[name]&&fade.dt>0){const delta=current.clone().multiply(new THREE.Quaternion().fromArray(fade.previousWorld[name]).invert());if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);const velocity=new THREE.Vector3().fromArray(rotationLog(delta)).multiplyScalar(1/fade.dt);if(velocity.length()>16)velocity.setLength(16);projected.premultiply(quaternionExp(velocity.multiplyScalar(epsilon)));}
      const offset=current.clone().multiply(world[name].clone().invert()).normalize();if(offset.w<0)offset.set(-offset.x,-offset.y,-offset.z,-offset.w);
      const advanced=projected.multiply(next[name].clone().invert()).normalize();if(advanced.dot(offset)<0)advanced.set(-advanced.x,-advanced.y,-advanced.z,-advanced.w);
      const a=rotationLog(offset),b=rotationLog(advanced);fade.offsets[name]=a;fade.velocities[name]=b.map((x,i)=>(x-a[i])/epsilon);
    }
  }
  const u=clamp(fade.elapsed/duration,0,1),h00=2*u*u*u-3*u*u+1,h10=u*u*u-2*u*u+u,out=clonePose(target);
  for(const name of entryBones){const residual=new THREE.Vector3().fromArray(fade.offsets[name].map((x,i)=>h00*x+h10*duration*fade.velocities[name][i]));world[name]=quaternionExp(residual).multiply(world[name]).normalize();const parent=data.motion.skeleton.bones.find(b=>b.name===name).parent;out.rotations[name]=world[parent].clone().invert().multiply(world[name]).normalize().toArray();}
  return out;
}


function sample(clip,t){
  const duration=clip.duration??clip.durationSeconds;
  const local=clip.loop?((t%duration)+duration)%duration:clamp(t,0,duration);
  const frames=clip.frames;
  let a=0,b=frames.length-1;
  while(b-a>1){const m=(a+b)>>1;if(frames[m].timeSeconds<=local)a=m;else b=m;}
  const f=frames[a],g=frames[b],w=clamp((local-f.timeSeconds)/(g.timeSeconds-f.timeSeconds||1),0,1);
  const rotations={};
  for(const n of Object.keys(f.rotations))rotations[n]=q.fromArray(f.rotations[n]).slerp(q2.fromArray(g.rotations[n]),w).toArray();
  return {rotations,hipsOffsetMeters:f.hipsOffsetMeters.map((x,i)=>THREE.MathUtils.lerp(x,g.hipsOffsetMeters[i],w)),local};
}
function continuePose(a,previous,dt,t){
  if(!previous||dt<=0)return a;
  // Integrate an exponentially decaying source velocity. Constant extrapolation
  // for the entire 220 ms fade can pass 180 degrees from the destination and
  // make shortest-path SLERP switch hemispheres in an advancing frame.
  // The derivative starts at the displayed velocity; total prediction is
  // bounded to 40 ms, then the destination takes over without overshoot.
  const horizon=.04*(1-Math.exp(-t/.04));
  const out=clonePose(a);
  for(const n of Object.keys(a.rotations)){
    q.fromArray(previous.rotations[n]).invert().multiply(q2.fromArray(a.rotations[n]));
    if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);
    const angle=2*Math.acos(clamp(q.w,-1,1)),sin=Math.sin(angle/2);
    if(sin>1e-6){v.set(q.x/sin,q.y/sin,q.z/sin);q2.fromArray(a.rotations[n]).multiply(q.setFromAxisAngle(v,Math.min(angle/dt,16)*horizon)).normalize();out.rotations[n]=q2.toArray();}
  }
  out.hipsOffsetMeters=a.hipsOffsetMeters.map((x,i)=>x+clamp((x-previous.hipsOffsetMeters[i])/dt,-1.5,1.5)*horizon);
  return out;
}
function rotationLog(rotation){
  const length=Math.hypot(rotation.x,rotation.y,rotation.z);
  if(length<1e-12)return[0,0,0];
  const scale=2*Math.atan2(length,rotation.w)/length;
  return[rotation.x*scale,rotation.y*scale,rotation.z*scale];
}
function inertialPose(fade,target,clip,seconds,phaseRate,actor){
  const duration=poseFadeSeconds;
  if(!fade.inertial){
    const epsilon=.0001,projected=continuePose(fade.pose,fade.previous,fade.dt,epsilon),future=actor?.recoveryManaged?actor.recovery.pose(THREE,{aheadSeconds:epsilon*phaseRate}):sample(clip,seconds+epsilon*phaseRate);
    const offsets={},velocities={};
    for(const name of Object.keys(target.rotations)){
      const initial=new THREE.Quaternion().fromArray(target.rotations[name]).normalize().invert().multiply(new THREE.Quaternion().fromArray(fade.pose.rotations[name]).normalize()).normalize();
      // Select the rotation-log branch ONCE at entry. A moving shortest-path
      // SLERP can change branch halfway through an otherwise continuous fade.
      if(initial.w<0)initial.set(-initial.x,-initial.y,-initial.z,-initial.w);
      const advanced=new THREE.Quaternion().fromArray(future.rotations[name]).normalize().invert().multiply(new THREE.Quaternion().fromArray(projected.rotations[name]).normalize()).normalize();
      if(advanced.dot(initial)<0)advanced.set(-advanced.x,-advanced.y,-advanced.z,-advanced.w);
      const start=rotationLog(initial),next=rotationLog(advanced);
      offsets[name]=start;velocities[name]=next.map((x,i)=>(x-start[i])/epsilon);
    }
    const hipsOffset=fade.pose.hipsOffsetMeters.map((x,i)=>x-target.hipsOffsetMeters[i]);
    const hipsVelocity=projected.hipsOffsetMeters.map((x,i)=>(x-future.hipsOffsetMeters[i]-hipsOffset[i])/epsilon);
    fade.inertial={offsets,velocities,hipsOffset,hipsVelocity};
  }
  const u=clamp(fade.elapsed/duration,0,1),h00=2*u*u*u-3*u*u+1,h10=u*u*u-2*u*u+u;
  const rotations={},i=fade.inertial;
  for(const name of Object.keys(target.rotations)){
    v.fromArray(i.offsets[name].map((x,k)=>h00*x+h10*duration*i.velocities[name][k]));
    const angle=v.length();q2.identity();if(angle>1e-12)q2.setFromAxisAngle(v.multiplyScalar(1/angle),angle);
    rotations[name]=q.fromArray(target.rotations[name]).normalize().multiply(q2).normalize().toArray();
  }
  return{rotations,hipsOffsetMeters:target.hipsOffsetMeters.map((x,k)=>x+h00*i.hipsOffset[k]+h10*duration*i.hipsVelocity[k])};
}
// World-space residuals prevent parent and child angular corrections from
// compounding into a fast visible limb turn during a ground-action blend.
function worldQuaternions(pose,actor,clip,seconds){
  const world={},modelQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),actor.baseYaw+actor.curveAngle(pathAt(clip,seconds)));
  for(const bone of data.motion.skeleton.bones){const local=new THREE.Quaternion().fromArray(pose.rotations[bone.name]).normalize();world[bone.name]=(bone.parent?world[bone.parent].clone():modelQ.clone()).multiply(local).normalize();}
  return world;
}
function quaternionExp(vector){const length=vector.length();return length>1e-12?new THREE.Quaternion().setFromAxisAngle(vector.clone().multiplyScalar(1/length),length):new THREE.Quaternion();}
function inertialWorldPose(fade,target,clip,seconds,phaseRate,actor){
  const local=inertialPose(fade,target,clip,seconds,phaseRate,actor),duration=poseFadeSeconds,worldTarget=worldQuaternions(target,actor,clip,seconds);
  if(!fade.worldInertial){
    const epsilon=.0001,next=worldQuaternions(actor.recoveryManaged?actor.recovery.pose(THREE,{aheadSeconds:epsilon*phaseRate}):sample(clip,seconds+epsilon*phaseRate),actor,clip,seconds+epsilon*phaseRate),offsets={},velocities={};
    const source=fade.sourceWorld||Object.fromEntries(Object.entries(worldQuaternions(fade.pose,actor,clip,seconds)).map(([name,q])=>[name,q.toArray()]));
    for(const bone of data.motion.skeleton.bones){const name=bone.name;if(name==='Root')continue;
      const current=new THREE.Quaternion().fromArray(source[name]).normalize(),projected=current.clone();
      if(fade.previousWorld?.[name]&&fade.dt>0){const delta=current.clone().multiply(new THREE.Quaternion().fromArray(fade.previousWorld[name]).normalize().invert());if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);const velocity=new THREE.Vector3().fromArray(rotationLog(delta)).multiplyScalar(1/fade.dt);if(velocity.length()>16)velocity.setLength(16);projected.premultiply(quaternionExp(velocity.multiplyScalar(epsilon)));}
      const initial=current.clone().multiply(worldTarget[name].clone().invert()).normalize();if(initial.w<0)initial.set(-initial.x,-initial.y,-initial.z,-initial.w);
      const advanced=projected.multiply(next[name].clone().invert()).normalize();if(advanced.dot(initial)<0)advanced.set(-advanced.x,-advanced.y,-advanced.z,-advanced.w);
      const start=rotationLog(initial),later=rotationLog(advanced);offsets[name]=start;velocities[name]=later.map((value,index)=>(value-start[index])/epsilon);
    }
    fade.worldInertial={offsets,velocities};
  }
  const u=clamp(fade.elapsed/duration,0,1),h00=2*u*u*u-3*u*u+1,h10=u*u*u-2*u*u+u,resultWorld={Root:worldTarget.Root},rotations={Root:target.rotations.Root.slice()};
  for(const bone of data.motion.skeleton.bones){const name=bone.name;if(name==='Root')continue;if(fade.scopeArms&&!RECOVERY_ARM_BONES.includes(name)){resultWorld[name]=worldTarget[name];rotations[name]=target.rotations[name].slice();continue;}const offset=fade.worldInertial.offsets[name],velocity=fade.worldInertial.velocities[name],residual=new THREE.Vector3().fromArray(offset.map((value,index)=>h00*value+h10*duration*velocity[index]));const world=quaternionExp(residual).multiply(worldTarget[name]).normalize();resultWorld[name]=world;rotations[name]=resultWorld[bone.parent].clone().invert().multiply(world).normalize().toArray();}
  return{rotations,hipsOffsetMeters:fade.scopeArms?target.hipsOffsetMeters:local.hipsOffsetMeters};
}

function duration(c=currentClip()){return c.duration??c.durationSeconds;}
function pathAt(clip,t){
  const f=clip.frames,ref=f.at(-1).referenceRootTranslationMeters||[0,0,0];
  const len=duration(clip),cycles=clip.loop?Math.floor(t/len):0,local=clip.loop?t-cycles*len:Math.min(t,len);
  const index=clamp(local/len*(f.length-1),0,f.length-1),a=Math.floor(index),b=Math.min(a+1,f.length-1),w=index-a;
  const x=f[a].referenceRootTranslationMeters||[0,0,0],y=f[b].referenceRootTranslationMeters||x;
  return x.map((n,i)=>THREE.MathUtils.lerp(n,y[i],w)+cycles*ref[i]);
}
function modelPath(c,level){return (c.kits?.[0]||c)[`lod${level}`];}
function payload(path){
  if(!payloads.has(path))payloads.set(path,new Promise((resolve,reject)=>{
    const take=()=>{try{const bytes=decodeBase64(globalThis.SOCCER_V7_ASSETS[path]);delete globalThis.SOCCER_V7_ASSETS[path];resolve(bytes);}catch(e){reject(e);}};
    if(globalThis.SOCCER_V7_ASSETS?.[path]){take();return;}
    const s=document.createElement('script');s.src='./offline/'+path.split('/').at(-1).replace('.glb','.js');
    s.onload=()=>{s.remove();take();};s.onerror=()=>{s.remove();payloads.delete(path);reject(Error('לא ניתן לטעון קובץ מקומי: '+path));};document.head.append(s);
  }));
  return payloads.get(path);
}
function disposeTemplate(t){
  const gs=new Set(),ms=new Set(),ts=new Set(),images=new Set();
  t.scene.traverse(o=>{if(o.isMesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);Object.values(m).forEach(x=>{if(x?.isTexture){ts.add(x);if(x.source?.data)images.add(x.source.data);}});}}});
  gs.forEach(x=>x.dispose());ms.forEach(x=>x.dispose());ts.forEach(x=>x.dispose());images.forEach(x=>x.close?.());
}
function trimTemplates(){
  const keep=new Set([...actors.map(a=>a.path),...desiredTemplatePaths]);
  for(const [p,promise] of templates)if(!keep.has(p)){templates.delete(p);payloads.delete(p);promise.then(disposeTemplate).catch(()=>{});}
}
async function template(path){
  if(!templates.has(path))templates.set(path,(async()=>{
    const pendingPayload=payload(path),bytes=await pendingPayload;
    const g=await loader.parseAsync(bytes.buffer,'');
    if(payloads.get(path)===pendingPayload)payloads.delete(path);
    g.scene.traverse(o=>{if(o.isMesh){
      const materials=Array.isArray(o.material)?o.material:[o.material];
      // Millimetre hair cards are below the mobile shadow-map texel size;
      // the anatomical head supplies their stable volume shadow.
      o.castShadow=!materials.every(m=>m.name==='HairCards');o.receiveShadow=true;o.frustumCulled=false;
      for(const m of materials){
        if(m.name==='EyesCornea')o.castShadow=false;
        if(m.alphaTest>0)m.alphaToCoverage=true;
        if(m.name==='Skin')m.envMapIntensity=.75;
        if(m.name==='Cloth')m.envMapIntensity=.85;
        if(m.map)m.map.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
      }
    }});
    return {scene:g.scene,bytes:bytes.length};
  })());
  return templates.get(path);
}

class Actor{
  constructor(model,path,identity,slot=0){
    this.model=model;this.path=path;this.identity=identity;this.slot=slot;
    model.visible=false;
    this.bones={};this.rest={};this.meshes=[];this.floorMeshes=[];
    model.traverse(o=>{
      if(o.isBone){this.bones[o.name]=o;this.rest[o.name]=o.position.clone();}
      if(o.isSkinnedMesh)this.meshes.push(o);
    });
    for(const b of data.motion.skeleton.bones)if(!this.bones[b.name])throw Error('Missing canonical joint '+b.name);
    // Cache immutable attributes once. Exact floor checks need only the Y row
    // of each skin matrix, rather than allocating vectors for every vertex.
    for(const m of this.meshes){
      const p=m.geometry.attributes.position,j=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;
      const positions=new Float32Array(p.count*3),joints=new Uint16Array(p.count*4),weights=new Float32Array(p.count*4);
      for(let i=0;i<p.count;i++){
        positions.set([p.getX(i),p.getY(i),p.getZ(i)],i*3);
        joints.set([j.getX(i),j.getY(i),j.getZ(i),j.getW(i)],i*4);
        weights.set([w.getX(i),w.getY(i),w.getZ(i),w.getW(i)],i*4);
      }
      const feet={LeftFoot:[],RightFoot:[]};
      for(let i=0;i<p.count;i++)for(let k=0;k<4;k++)if(weights[i*4+k]>.5){const name=m.skeleton.bones[joints[i*4+k]].name;if(feet[name])feet[name].push(i);}
      this.floorMeshes.push({mesh:m,positions,joints,weights,feet,count:p.count,rows:new Float64Array(m.skeleton.bones.length*4),boundsRows:new Float64Array(m.skeleton.bones.length*12)});
    }
    this.floorMatrix=new THREE.Matrix4();this.floorLeft=new THREE.Matrix4();
    this.offset=new THREE.Vector3();this.origin=new THREE.Vector3();this.world=new THREE.Vector3();this.previous=null;this.pose=null;this.fade=null;this.dt=1/30;this.minY=0;this.lift=0;
    this.locks=new Map();this.landings=new Map();this.contactTargets=new Map();this.clock=0;this.contactResidual=0;this.landingResidual=0;
    this.velocity=new THREE.Vector3();this.rootBlend=null;this.phaseSynced=false;
    this.baseYaw=0;
    this.phaseOffset=0;this.phaseRate=1;this.entryPhaseRate=1;this.pathScale=1;this.sampleSeconds=0;
    this.createdView=view;
    this.recovery=new RecoveryState({clips,sample:(clip,t)=>sample(clip,t)});this.recoveryManaged=false;this.recoveryTransitionSerial=0;this.activeClipID=null;
    this.helper=new THREE.SkeletonHelper(model);this.helper.visible=false;this.helper.material.depthTest=false;scene.add(model,this.helper);
  }
  modelHeading(){return new THREE.Euler().setFromQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()),'YXZ').y;}
  rigidBootMinimumY(name){
    this.refreshFloorRows();let minimum=Infinity;
    for(const piece of this.floorMeshes){const index=piece.mesh.skeleton.bones.findIndex(b=>b.name===name),p=piece.positions,j=piece.joints,w=piece.weights,r=piece.rows;for(const i of piece.feet[name]){if(p[i*3+1]>=.18)continue;const base=i*4;let influence=0;for(let k=0;k<4;k++)if(j[base+k]===index)influence+=w[base+k];if(influence<.95)continue;let y=0;for(let k=0;k<4;k++){const row=j[base+k]*4;y+=w[base+k]*(r[row]*p[i*3]+r[row+1]*p[i*3+1]+r[row+2]*p[i*3+2]+r[row+3]);}minimum=Math.min(minimum,y);}}
    return minimum;
  }
  motionID(){return this.activeClipID||clipID;}
  motionClip(){return clipMap.get(this.motionID());}
  recoveryDescriptor({history=true}={}){
    const state=this.recovery.snapshot({history});
    if(!this.recoveryManaged)Object.assign(state,{clock:this.clock,phase:'standalone',activeBaseClip:this.motionID(),baseSeconds:this.sampleSeconds,overlayClip:null,overlaySeconds:0,request:null,pendingRequestID:null,episode:null,locomotionAllowed:!!this.locomotion,presentation:null,constraints:null,contributors:[{clipID:this.motionID(),sampleSeconds:this.sampleSeconds,playbackRate:this.phaseRate,weight:1,scope:'body',transform:'identity'}]});
    if(state.locomotionAllowed&&this.locomotion){const motor=this.locomotion.snapshot({includeHistory:false});state.contributors=motor.contributors.map(c=>({clipID:c.clip,sampleSeconds:c.time,playbackRate:1,weight:c.weight,scope:'body',transform:'physicalLocomotionSpace'}));state.physicalMotor={clock:motor.clock,actualSpeed:motor.actualSpeed,targetSpeed:motor.targetSpeed,unwrappedPhase:motor.unwrappedPhase,rootDistance:motor.rootDistance,requestID:motor.requestID,requestedClip:motor.requestedClip,lastPhaseReseed:structuredClone(motor.lastPhaseReseed),request:structuredClone(this.locomotion.requests.find(r=>r.id===motor.requestID))};state.modifiers=this.motorStyle?.weight>0?[{kind:'nativeUpperDelta',baseClipID:'run_2',styleClipID:'dribble',phase:motor.unwrappedPhase,weight:this.motorStyle.weight,bones:motorStyleBones.slice()},...(this.dribbleDetail||[]).map(detail=>({kind:'nativeFlightFootDelta',...structuredClone(detail)}))]:[];if(this.motorEntryFade)state.modifiers.push({kind:'worldOrientationEntry',elapsed:this.motorEntryFade.elapsed,duration:poseFadeSeconds,bones:(this.motorEntryFade.bones||motorStyleBones).slice(),scope:'orientationReferenceBeforePhysicalFootIK'});if(this.motorHipEntry)state.modifiers.push({...structuredClone(this.motorHipEntry),kind:'physicalPelvisEntry',continuing:this.motorPelvisEntry,displayedY:this.bones.Hips.getWorldPosition(new THREE.Vector3()).y});if(!this.recoveryManaged)state.motorAction=this.requestedAction||this.motionID();}
    return state;
  }
  syncRecovery(){
    const state=this.recovery.snapshot({history:false});if(state.transitionSerial===this.recoveryTransitionSerial)return;
    this.recoveryPoleCache={};this.recoveryPoleDiagnostics={};this.recoveryLegReferenceCache={};
    const previous=this.activeClipID,next=this.recovery.base.clipID;
    if(/^turn_/.test(previous)&&(previous!==next||this.sampleSeconds>this.recovery.base.seconds+.000001)){this.handoffHeading();if(this.worldRotations)this.worldRotations=Object.fromEntries(Object.entries(this.bones).map(([n,b])=>[n,b.getWorldQuaternion(new THREE.Quaternion()).normalize().toArray()]));}
    if(this.recovery.bridge){this.fade=null;this.rootBlend=null;this.locks.clear();this.landings.clear();this.contactTargets.clear();}
    else if(this.recovery.overlay&&previous===next){this.capture();if(this.fade)this.fade.scopeArms=true;}
    else if(!(state.locomotionAllowed&&this.locomotion)){
      this.capture();if(this.locomotion)this.clearLocomotion();this.activeClipID=next;this.entryPhaseRate=1;this.pathScale=1;this.phaseSynced=false;this.rebase(state.baseSeconds);
    }
    this.activeClipID=next;this.recoveryTransitionSerial=state.transitionSerial;
  }
  capture(){
    if(this.pose)this.fade={pose:clonePose(this.pose),previous:this.previous&&clonePose(this.previous),dt:this.dt,elapsed:0,rootLift:this.model.position.y-this.world.y};
    for(const lock of this.locks.values()){lock.release=Math.min(lock.release,this.clock+.12);lock.carried=true;}
    if(this.fade){this.fade.sourceWorld=this.worldRotations&&structuredClone(this.worldRotations);this.fade.previousWorld=this.previous&&this.previousWorldRotations&&structuredClone(this.previousWorldRotations);}
    this.capturedVelocity=this.velocity.clone();
    this.landings.clear();
  }
  handoffHeading(){
    const angle=new THREE.Euler().setFromQuaternion(this.bones.Hips.quaternion,'YXZ').y;
    if(Math.abs(angle)<1e-7)return;
    const inverse=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-angle);
    this.model.rotation.set(0,this.modelHeading()+angle,0);this.baseYaw+=angle;
    this.bones.Hips.quaternion.premultiply(inverse);
    this.bones.Hips.position.sub(this.rest.Hips).applyQuaternion(inverse).add(this.rest.Hips);
    for(const pose of [this.pose,this.previous])if(pose){pose.rotations.Hips=new THREE.Quaternion().fromArray(pose.rotations.Hips).premultiply(inverse).toArray();pose.hipsOffsetMeters=new THREE.Vector3().fromArray(pose.hipsOffsetMeters).applyQuaternion(inverse).toArray();}
    for(const lock of this.locks.values())lock.yawRadians=(lock.yawRadians||0)-angle;
    this.updateMatrices();
  }
  rebase(seconds){
    this.phaseOffset=0;this.contactTargets.clear();
    const actorPhase=view==='pitch'&&this.motionClip().loop?this.slot*.071:0;
    const raw=pathAt(this.motionClip(),seconds+actorPhase);
    this.baseYaw=this.modelHeading()-this.curveAngle(raw);
    const path=this.referencePoint(raw);
    this.origin.copy(this.world).sub(this.offset).sub(path);
    this.rootBlend={elapsed:0,velocity:this.capturedVelocity||new THREE.Vector3(),lastTime:seconds,lastSampleSeconds:seconds+actorPhase};
  }
  curveAngle(raw){return view==='pitch'&&/^run_|sprint|dribble/.test(this.motionID())?raw[2]/8:0;}
  referencePoint(raw){
    if(this.motionID()==='decelerate')raw=[raw[0],raw[1],raw[2]*this.pathScale];
    const angle=this.curveAngle(raw),r=8;
    const p=angle?new THREE.Vector3(raw[0]*Math.cos(angle)+r*(1-Math.cos(angle)),raw[1],r*Math.sin(angle)-raw[0]*Math.sin(angle)):new THREE.Vector3().fromArray(raw);
    return p.applyAxisAngle(new THREE.Vector3(0,1,0),this.baseYaw);
  }
  update(seconds,dt=0,exact=false){
    // A queued intent does not advance or replay the displayed recovery.
    // Re-running a stateful knee-plane solver at dt=0 can otherwise undo its
    // previous-frame convergence while the body clock has not changed.
    if(!exact&&dt===0&&this.recoveryManaged&&this.pose&&this.recoveryTransitionSerial===this.recovery.transitionSerial&&!this.recovery.snapshot({history:false}).locomotionAllowed){this.helper.visible=$('skeleton').checked;return;}
    if(!exact&&playing&&this.recoveryManaged){
      if(dt>0)this.recovery.step(dt,recoveryContext(this));this.syncRecovery();
      const recoveryState=this.recovery.snapshot({history:false});
      if(recoveryState.locomotionAllowed){this.updateLocomotion(seconds,dt,recoveryState.motorAction);const motor=this.locomotion.snapshot({includeHistory:false});motor.requests=this.locomotion.requests.filter(r=>r.id===this.locomotion.requestID||r.id===this.recovery.requestRecord?.motorRequestID);this.recovery.bindMotor(motor,{styleWeight:this.motorStyle?.weight||0,rendered:motor.targetSpeed===0&&this.recovery.requestRecord?.scope==='locomotion'?recoveryContext(this).measured:null});return;}
      seconds=this.recovery.base.seconds;
    }
    if(!exact&&this.locomotion&&!playing){this.helper.visible=$('skeleton').checked;return;}
    if(!exact&&playing&&!this.recoveryManaged&&motorClipFor(this.motionID())){this.updateLocomotion(seconds,dt,this.motionID());return;}
    if(this.locomotion)this.clearLocomotion();
    const c=this.motionClip();
    const displayedSoles=this.pose?Object.fromEntries(['LeftFoot','RightFoot'].map(name=>[name,{position:this.bones[name].localToWorld(new THREE.Vector3(0,-.08,0)),orientation:this.bones[name].getWorldQuaternion(new THREE.Quaternion()),pole:this.kneePole(name),axis:this.legAxis(name),bend:this.kneeFlexion(name)}])):null;
    this.displayedSoles=displayedSoles;this.updateDelta=dt;
    const phase=!this.recoveryManaged&&view==='pitch'&&c.loop?this.slot*.071:0;
    const gait=/^run_|sprint|dribble/.test(this.motionID())&&c.speedMps>0;
    this.phaseRate=1;
    if(this.rootBlend&&dt>0&&gait){
      const w=smooth((this.rootBlend.elapsed+dt*.5)/.22);
      this.phaseRate=THREE.MathUtils.lerp(this.entryPhaseRate,1,w);
      this.phaseOffset+=(this.phaseRate-1)*dt;
    }
    this.sampleSeconds=seconds+phase+this.phaseOffset;
    const target=this.recoveryManaged?this.recovery.pose(THREE):sample(c,this.sampleSeconds);
    this.clock+=dt;
    let pose=target,carriedLift=0;
    if(this.fade){
      this.fade.elapsed+=dt;const w=smooth(this.fade.elapsed/poseFadeSeconds);
      carriedLift=(this.fade.rootLift||0)*(1-w);
      const entryRate=gait&&this.rootBlend?this.entryPhaseRate:1;
      pose=inertialWorldPose(this.fade,target,c,this.sampleSeconds,entryRate,this);
      if(w===1)this.fade=null;
    }
    this.previous=this.pose;this.pose=pose;if(dt>0)this.dt=dt;
    for(const [n,r] of Object.entries(pose.rotations))this.bones[n].quaternion.fromArray(r);
    this.bones.Hips.position.copy(this.rest.Hips).add(v.fromArray(pose.hipsOffsetMeters));
    const path=pathAt(c,this.sampleSeconds);
    this.model.rotation.set(0,this.baseYaw+this.curveAngle(path),0);
    // Presentation-only trajectory: gameplay adapters must integrate their own
    // authoritative root once. The camera tracks it here to expose foot plants.
    const previousWorld=this.world.clone();
    const desired=this.referencePoint(path).add(this.offset).add(this.origin);
    if(this.rootBlend&&dt>0){
      if(this.motionID()==='decelerate'){
        // Gait phase and root distance share one clock. Blending world speed
        // while running an unchanged gait clock would drag planted feet.
        this.world.copy(desired);
      }else{
        const priorPath=this.referencePoint(pathAt(c,this.rootBlend.lastSampleSeconds));
        const targetDelta=this.referencePoint(path).sub(priorPath);
        const w=smooth((this.rootBlend.elapsed+dt*.5)/.22);
        this.world.add(this.rootBlend.velocity.clone().multiplyScalar(dt).lerp(targetDelta,w));
        this.origin.add(this.world.clone().sub(desired));
      }
      this.rootBlend.elapsed+=dt;this.rootBlend.lastTime=seconds;this.rootBlend.lastSampleSeconds=this.sampleSeconds;
      if(this.rootBlend.elapsed>=.22)this.rootBlend=null;
    }else this.world.copy(desired);
    if(dt>0)this.velocity.copy(this.world).sub(previousWorld).multiplyScalar(1/dt);
    this.model.position.copy(this.world);this.updateMatrices();
    // Compress the swing trajectory together with a scaled stopping path.
    // Scaling world anchors alone leaves the authored long stride unchanged
    // and would teleport the next foot when its new plant is admitted.
    if((gait&&this.fade)||(this.motionID()==='decelerate'&&Math.abs(this.pathScale-1)>1e-7)){
      const scale=this.motionID()==='decelerate'?(this.fade?THREE.MathUtils.lerp(1,this.pathScale,smooth(this.fade.elapsed/poseFadeSeconds)):this.pathScale):1;
      if((this.fade&&this.fade.elapsed>1e-8)||Math.abs(scale-1)>1e-8){
      const feet=['LeftFoot','RightFoot'].map(name=>{
        const bone=this.bones[name],local=this.model.worldToLocal(bone.localToWorld(new THREE.Vector3(0,-.08,0)));
        local.z*=scale;
        return{name,target:this.model.localToWorld(local),orientation:bone.getWorldQuaternion(new THREE.Quaternion()),pole:new THREE.Vector3(0,0,1).applyQuaternion(this.bones.Root.getWorldQuaternion(new THREE.Quaternion()))};
      });
      for(const foot of feet)this.solveSole(foot.name,foot.target,foot.orientation,foot.pole);
      this.updateMatrices();
      }
    }
    const envelope=(!this.recoveryManaged||(!this.recovery.overlay&&!this.recovery.bridge&&!this.recovery.base.mirror&&!this.recovery.bridgeConstraints()))&&(this.motionID()!=='decelerate'||this.pathScale===1)&&data.floor?.pass&&data.floor.complete&&data.floor.motionSha256===data.hashes.motion&&data.floor.modelSha256[this.path]===data.hashes.models[this.path]?data.floor.models?.[this.path]?.[this.motionID()]:null;
    if(envelope&&!exact&&!this.fade){
      const index=target.local*(data.floor.sampleRateHz||60),a=Math.min(Math.floor(index),envelope.length-1);
      this.lift=THREE.MathUtils.lerp(envelope[a],envelope[Math.min(a+1,envelope.length-1)],index-a);
      this.minY=.002;
    }else{
      this.lift=carriedLift;
    }
    this.model.position.y+=this.lift;this.updateMatrices();
    // World-space anchors survive phase-aligned changes and interrupted fades.
    // New plants are admitted after the previous foot's support has released.
    for(const [name,lock] of this.locks)if(this.clock>lock.release+1e-7){
      this.locks.delete(name);
      const shown=displayedSoles?.[name];
      if(shown&&lock.carried)this.landings.set(name,{key:'release:'+lock.key,mode:'release',start:this.clock,duration:.08,from:shown.position.clone(),orientation:shown.orientation.clone(),pole:shown.pole.clone(),poleAxis:shown.axis.toArray()});
    }
    const activeContacts=this.recoveryManaged?this.recovery.bridge?[]:this.recovery.contacts():contactsAt(c,this.sampleSeconds);
    const activeKeys=new Set(activeContacts.map(c=>c.key));
    for(const key of this.contactTargets.keys())if(!activeKeys.has(key))this.contactTargets.delete(key);
    for(const [name,landing] of this.landings)if(landing.mode!=='release'&&!activeKeys.has(landing.key)){
      const shown=displayedSoles?.[name];
      if(shown)this.landings.set(name,{key:'release:'+landing.key,mode:'release',start:this.clock,duration:.08,from:shown.position.clone(),orientation:shown.orientation.clone(),pole:shown.pole.clone(),poleAxis:shown.axis.toArray()});
      else this.landings.delete(name);
    }
    if(this.phaseSynced&&this.fade)for(const name of this.locks.keys())if(!activeContacts.some(c=>c.bone===name)){const old=this.locks.get(name);this.locks.delete(name);const shown=displayedSoles?.[name];if(shown)this.landings.set(name,{key:'release:'+old.key,mode:'release',start:this.clock,duration:.08,from:shown.position.clone(),orientation:shown.orientation.clone(),pole:shown.pole.clone(),poleAxis:shown.axis.toArray()});}
    for(const contact of activeContacts){
      if(contact.mode!=='plant'||!/Foot$/.test(contact.bone))continue;
      const key=contact.key;
      let lock=this.locks.get(contact.bone);
      const release=this.clock+Math.max(0,contact.endTimeSeconds-this.sampleSeconds)/Math.max(.05,this.phaseRate);
      if(gait&&!this.contactTargets.has(key)){const nominal=this.referencePoint(contact.anchor).add(this.offset).add(this.origin);this.contactTargets.set(key,this.fade&&lock?lock.anchor.clone():nominal);}
      if(!lock){
        let anchor=this.referencePoint(contact.anchor).add(this.offset).add(this.origin);
        if(gait)anchor=this.contactTargets.get(key).clone();
        let landing=this.landings.get(contact.bone);
        if(landing&&landing.key!==key){this.landings.delete(contact.bone);landing=null;}
        if(landing&&landing.key===key){
          if(landing.followReference)landing.to.copy(anchor);
          if(this.clock<landing.start+landing.duration-1e-7)continue;
          const flat=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),landing.worldYaw??(this.baseYaw+this.curveAngle(contact.anchor)+(contact.yawRadians||0)));
          if(displayedSoles?.[contact.bone]&&displayedSoles[contact.bone].position.distanceTo(anchor)>.003)continue;
          if(!this.canReachSole(contact.bone,anchor,flat))continue;
          this.landings.delete(contact.bone);
        }
        const currentSole=this.bones[contact.bone].localToWorld(new THREE.Vector3(0,-.08,0));
        if(this.fade||(displayedSoles&&currentSole.distanceTo(anchor)>.004)){
          const bone=this.bones[contact.bone],sole=displayedSoles?.[contact.bone]?.position||currentSole;
          // A destination plant must not teleport a currently airborne foot to
          // the floor or pin it behind the COM. A short airborne trajectory
          // reaches the authored, reachable anchor with zero landing velocity.
          if(sole.distanceTo(anchor)>.002&&!landing){
            const shown=displayedSoles?.[contact.bone];
            const from=shown?.position.clone()||sole.clone();
            const followReference=Boolean(this.rootBlend&&!gait&&this.motionID()!=='decelerate');
            const plannedDuration=clamp(.14+from.distanceTo(anchor)/12,.14,.27);
            this.landings.set(contact.bone,{key,start:this.clock,duration:Math.min(.27,Math.max(plannedDuration,followReference?.27-this.fade.elapsed:0)),from,to:anchor.clone(),orientation:shown?.orientation.clone()||bone.getWorldQuaternion(new THREE.Quaternion()),pole:shown?.pole.clone()||this.kneePole(contact.bone),poleAxis:(shown?.axis||this.legAxis(contact.bone)).toArray(),yawRadians:contact.yawRadians||0,worldYaw:this.baseYaw+this.curveAngle(contact.anchor)+(contact.yawRadians||0),followReference});
            continue;
          }
        }
        lock={bone:contact.bone,key,anchor,release,yawRadians:contact.yawRadians||0,worldYaw:landing?.worldYaw??(this.baseYaw+this.curveAngle(contact.anchor)+(contact.yawRadians||0))};this.locks.set(contact.bone,lock);
      }else if(lock.key===key)lock.release=release;
      else lock.release=Math.min(lock.release,release);
    }
    this.contactResidual=0;
    for(const lock of this.locks.values())this.contactResidual=Math.max(this.contactResidual,this.solvePlant(lock));
    this.updateMatrices();
    this.applyLandings();this.updateMatrices();
    // A swinging boot below the floor must flex its own leg. Raising the whole
    // body would overextend the opposite planted leg during an interrupted run.
    for(const name of ['LeftFoot','RightFoot'])if(!this.locks.has(name)){
      const minimum=this.footMinimumY(name);
      if(minimum<.001){
        const bone=this.bones[name],orientation=bone.getWorldQuaternion(new THREE.Quaternion());
        const sole=bone.localToWorld(new THREE.Vector3(0,-.08,0));sole.y+=.002-minimum;
        this.solveSole(name,sole,orientation);this.updateMatrices();
      }
    }
    if(this.recoveryManaged)applyRecoveryConstraints(this);
    // Validate the displayed geometry AFTER IK. The hands, knees and torso also
    // touch during slides/falls; ankle positions alone cannot establish safety.
    for(let pass=0;pass<3;pass++){
      this.minY=this.minimumY(true);
      if(this.minY>=.0008)break;
      const lift=.002-this.minY;this.lift+=lift;this.model.position.y+=lift;this.updateMatrices();
      if(pass<2){for(const lock of this.locks.values())this.contactResidual=Math.max(this.contactResidual,this.solvePlant(lock));this.applyLandings();if(this.recoveryManaged)applyRecoveryConstraints(this);this.updateMatrices();}
    }
    // The next interruption starts at the pose actually displayed after IK,
    // rather than the uncorrected animation sample.
    this.pose={rotations:Object.fromEntries(Object.entries(this.bones).map(([n,b])=>[n,b.quaternion.toArray()])),hipsOffsetMeters:this.bones.Hips.position.clone().sub(this.rest.Hips).toArray()};
    if(dt>0)this.previousWorldRotations=this.worldRotations;
    this.worldRotations=Object.fromEntries(Object.entries(this.bones).map(([name,bone])=>[name,bone.getWorldQuaternion(new THREE.Quaternion()).normalize().toArray()]));
    this.helper.visible=$('skeleton').checked;this.lastClipID=this.motionID();
  }
  clearLocomotion(){this.locomotion=null;this.motorEntryFade=null;this.motorPelvisEntry=false;this.motorHipEntry=null;this.motorStyle=null;this.requestedAction=null;}
  motorHeading(distance){return this.motorYaw+(this.motorCurved?distance/8:0);}
  motorBodyPose(pose,phase){
    const weight=this.motorStyle?.weight||0;if(weight<=0)return pose;
    const base=sample(clipMap.get('run_2'),phase*duration(clipMap.get('run_2'))),style=sample(clipMap.get('dribble'),phase*duration(clipMap.get('dribble'))),out=clonePose(pose);
    for(const name of motorStyleBones){const delta=new THREE.Quaternion().fromArray(base.rotations[name]).invert().multiply(new THREE.Quaternion().fromArray(style.rotations[name]));const weighted=new THREE.Quaternion().slerp(delta,weight);out.rotations[name]=new THREE.Quaternion().fromArray(pose.rotations[name]).multiply(weighted).normalize().toArray();}
    return out;
  }
  motorPresentation(){const id=this.requestedAction==='dribble'?'dribble':this.locomotion.requestedClip,clip=clipMap.get(id);return{clip,seconds:id==='idle'?this.locomotion.clock:this.locomotion.phase*duration(clip)};}
  updateMotorLocks(state,point){
    this.locks.clear();
    for(const [name,f]of Object.entries(state.feet))if(f.mode==='plant')this.locks.set(name,{bone:name,key:'motor:'+name+':'+f.heelPhase,anchor:point(f.anchor),release:this.clock+Math.max(0,f.stanceEndPhase-state.unwrappedPhase)/Math.max(.01,state.frequency),worldYaw:this.motorHeading(f.anchor[2]),yawRadians:0});
  }
  updateLocomotion(seconds,dt,requestedAction=clipID){
    const physicalClip=motorClipFor(requestedAction);if(!physicalClip)throw Error('Unknown motor action '+requestedAction);
    if(!this.pose){this.update(seconds,0,true);}
    if(!this.locomotion){
      this.locomotion=new LocomotionSpace(THREE,clips,sample,data.motion.skeleton);
      this.motorOrigin=this.world.clone();this.motorYaw=new THREE.Euler().setFromQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()),'YXZ').y;this.motorCurved=view==='pitch';
      const curve=this.motorCurved?createLocomotionCurve({origin:this.motorOrigin.toArray(),yaw:this.motorYaw,radius:8}):null;
      const yawQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),this.motorYaw),inverse=yawQ.clone().invert();
      const feet=Object.fromEntries(['LeftFoot','RightFoot'].map(name=>{const world=this.bones[name].localToWorld(new THREE.Vector3(0,-.08,0)),position=curve?curve.inversePoint(world.toArray(),0):world.sub(this.motorOrigin).applyQuaternion(inverse).toArray(),worldOrientation=this.bones[name].getWorldQuaternion(new THREE.Quaternion());return[name,{position,orientation:curve?curve.inverseOrientation(worldOrientation.toArray(),position[2]):inverse.clone().multiply(worldOrientation).normalize().toArray()}];}));
      const sourceClip=clipMap.get(this.lastClipID)||this.motionClip(),seedClip=/^turn_/.test(sourceClip.id)?clipMap.get('idle'):sourceClip,phase=seedClip!==sourceClip?0:this.sampleSeconds/duration(sourceClip),actualSpeed=this.velocity.length();
      this.locomotion.reset({speed:actualSpeed,phase,distance:0,feet,idleSeconds:sourceClip.id==='idle'?this.sampleSeconds:0,sourceClip:seedClip.id});
      this.motorStyle={weight:sourceClip.id==='dribble'?1:0,from:sourceClip.id==='dribble'?1:0,to:requestedAction==='dribble'?1:0,elapsed:0};
      this.motorEntryFade=!motorClipFor(sourceClip.id)&&this.worldRotations?{sourceWorld:structuredClone(this.worldRotations),previousWorld:this.previousWorldRotations&&structuredClone(this.previousWorldRotations),dt:this.dt,elapsed:0,bones:['Hips',...motorStyleBones,'LeftUpLeg','LeftLeg','RightUpLeg','RightLeg']}:null;
      this.motorPelvisEntry=!!this.motorEntryFade;
      this.fade=null;this.rootBlend=null;this.landings.clear();this.contactTargets.clear();
      if(this.motorEntryFade)motorArmEntryPose(this,this.motorBodyPose(this.locomotion.pose(),this.locomotion.phase),this.motorHeading(0));
    }
    if(this.requestedAction!==requestedAction){const weight=this.motorStyle?.weight||0;this.motorStyle={weight,from:weight,to:requestedAction==='dribble'?1:0,elapsed:0};this.requestedAction=requestedAction;}
    if(this.locomotion.requestedClip!==physicalClip||!this.locomotion.requests.length)this.locomotion.request(physicalClip);
    const curve=this.motorCurved?createLocomotionCurve({origin:this.motorOrigin.toArray(),yaw:this.motorYaw,radius:8}):null;
    const originYaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),this.motorYaw);
    const point=p=>curve?new THREE.Vector3().fromArray(curve.mapPoint(p)):new THREE.Vector3().fromArray(p).applyQuaternion(originYaw).add(this.motorOrigin);
    if(dt===0){this.updateMotorLocks(this.locomotion.snapshot(),point);this.lastClipID=requestedAction;return;}
    const previousHipY=this.bones.Hips.getWorldPosition(new THREE.Vector3()).y,before=this.world.clone(),geometry=curve?curve.geometryFromWorldHips({distance:this.locomotion.distance,measuredAt:this.locomotion.clock,hips:Object.fromEntries(['LeftFoot','RightFoot'].map(name=>[name,this.bones[name.replace(/Foot$/,'')+'UpLeg'].getWorldPosition(new THREE.Vector3()).toArray()]))}):{measuredAt:this.locomotion.clock,hipHeight:this.bones.Hips.getWorldPosition(new THREE.Vector3()).y-this.world.y,hipX:this.bones.Hips.position.x,hipZ:this.bones.Hips.position.z,hips:Object.fromEntries(['LeftFoot','RightFoot'].map(name=>{const hip=this.bones[name.replace(/Foot$/,'')+'UpLeg'].getWorldPosition(new THREE.Vector3()).sub(this.motorOrigin).applyAxisAngle(new THREE.Vector3(0,1,0),-this.motorYaw);return[name,{x:hip.x,y:hip.y,z:hip.z-this.locomotion.distance}];}))};
    const state=this.locomotion.step(dt,geometry,{includeHistory:false});this.clock+=dt;this.dt=dt;this.motorStyle.elapsed+=dt;this.motorStyle.weight=THREE.MathUtils.lerp(this.motorStyle.from,this.motorStyle.to,smooth(this.motorStyle.elapsed/poseFadeSeconds));
    const heading=this.motorHeading(state.rootDistance),yawQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading);
    let pose=this.motorBodyPose(this.locomotion.pose(),state.unwrappedPhase);if(this.motorEntryFade){this.motorEntryFade.elapsed+=dt;pose=motorArmEntryPose(this,pose,heading);if(this.motorEntryFade.elapsed>=poseFadeSeconds)this.motorEntryFade=null;}
    this.previous=this.pose;
    for(const [name,rotation]of Object.entries(pose.rotations))this.bones[name].quaternion.fromArray(rotation);
    this.bones.Hips.position.copy(this.rest.Hips).add(new THREE.Vector3().fromArray(pose.hipsOffsetMeters));
    this.world.copy(point([0,0,state.rootDistance]));this.velocity.copy(this.world).sub(before).multiplyScalar(1/dt);this.model.position.copy(this.world);this.model.quaternion.copy(yawQ);this.lift=0;this.updateMatrices();
    this.motorHipEntry=null;
    if(this.motorPelvisEntry){const targetY=this.bones.Hips.getWorldPosition(new THREE.Vector3()).y,maximumStep=dt,appliedY=clamp(targetY,previousHipY-maximumStep,previousHipY+maximumStep);this.bones.Hips.position.y+=appliedY-targetY;this.updateMatrices();this.motorPelvisEntry=Math.abs(targetY-appliedY)>1e-7;this.motorHipEntry={mode:'bounded-physical-pelvis-height',scope:'beforeReachAndFloorCorrection',previousY:previousHipY,targetY,appliedY,maximumStepMeters:maximumStep,maximumDesiredSpeedMps:1,remainingMeters:targetY-appliedY};}
    const targetFeet=Object.entries(state.feet).map(([name,f])=>({name,state:f,target:point(f.position),orientation:curve?new THREE.Quaternion().fromArray(curve.mapOrientation(f.orientation,f.position[2])):originYaw.clone().multiply(new THREE.Quaternion().fromArray(f.orientation))}));
    this.dribbleDetail=[];
    if(this.motorStyle.weight>0&&!this.disableDribbleFootStyle){
      if(!nativeDribbleFootStyle)nativeDribbleFootStyle=createDribbleFootStyle(THREE,data.motion.skeleton,clipMap.get('run_2'),clipMap.get('dribble'),sample,data.bootBounds);
      for(const f of targetFeet)this.dribbleDetail.push(nativeDribbleFootStyle.apply({name:f.name,unwrappedPhase:state.unwrappedPhase,mode:f.state.mode,target:f.target,orientation:f.orientation,heading,styleWeight:this.motorStyle.weight,speed:state.actualSpeed}));
    }
    this.locomotionProjections=[];const inverseYaw=yawQ.clone().invert();
    for(const f of targetFeet)if(f.state.mode!=='plant'&&f.state.mode!=='inherited'){
      const midRadius=.777-(.777-this.locomotion.flightReachRadius)*this.locomotion.smooth(state.actualSpeed/1.6),age=state.clock-(f.state.flightStartTime??state.clock),progress=f.state.flightProgress??0,radius=Math.max(.777-(.777-midRadius)*this.locomotion.smooth(age/.08),midRadius+(.777-midRadius)*this.locomotion.smooth((progress-.70)/.30));
      const hip=this.bones[f.name.replace(/Foot$/,'')+'UpLeg'].getWorldPosition(new THREE.Vector3()),ankle=f.target.clone().add(new THREE.Vector3(0,.08,0).applyQuaternion(f.orientation)),local=ankle.sub(hip).applyQuaternion(inverseYaw),available=Math.sqrt(Math.max(0,radius*radius-local.x*local.x-local.y*local.y)),z=clamp(local.z,-available,available),gap=local.z-z;
      f.target.add(new THREE.Vector3(0,0,-gap).applyQuaternion(yawQ));this.locomotionProjections.push({bone:f.name,foreAftMeters:gap,preservedSoleY:f.target.y,radius});
    }
    const hip=this.bones.Hips.getWorldPosition(new THREE.Vector3());let maximumHip=hip.y;
    for(const f of targetFeet)if(f.state.mode==='plant'){const ankle=f.target.clone().add(new THREE.Vector3(0,.08,0).applyQuaternion(f.orientation)),root=this.bones[f.name.replace(/Foot$/,'')+'UpLeg'].getWorldPosition(new THREE.Vector3()),horizontal=Math.hypot(root.x-ankle.x,root.z-ankle.z);if(horizontal<.777)maximumHip=Math.min(maximumHip,ankle.y+Math.sqrt(.777*.777-horizontal*horizontal)-(root.y-hip.y));}
    if(maximumHip<hip.y){this.bones.Hips.position.y-=hip.y-maximumHip;this.updateMatrices();}
    this.contactResidual=0;this.landingResidual=0;this.landings.clear();this.updateMotorLocks(state,point);
    const pole=new THREE.Vector3(0,0,1).applyQuaternion(yawQ);
    for(const f of targetFeet){const gap=this.solveSole(f.name,f.target,f.orientation,pole);if(f.state.mode==='plant')this.contactResidual=Math.max(this.contactResidual,gap);else this.landingResidual=Math.max(this.landingResidual,gap);}
    this.updateMatrices();
    for(let pass=0;pass<3;pass++){this.minY=this.minimumY(true);if(this.minY>=.0008)break;const lift=.002-this.minY;this.model.position.y+=lift;this.lift+=lift;this.updateMatrices();for(const f of targetFeet)this.solveSole(f.name,f.target,f.orientation,pole);this.updateMatrices();}
    const requested=clipMap.get(requestedAction);this.sampleSeconds=state.unwrappedPhase*duration(requested);this.phaseRate=state.frequency*duration(requested);this.pathScale=1;
    this.pose={rotations:Object.fromEntries(Object.entries(this.bones).map(([n,b])=>[n,b.quaternion.toArray()])),hipsOffsetMeters:this.bones.Hips.position.clone().sub(this.rest.Hips).toArray()};
    this.previousWorldRotations=this.worldRotations;this.worldRotations=Object.fromEntries(Object.entries(this.bones).map(([n,b])=>[n,b.getWorldQuaternion(new THREE.Quaternion()).normalize().toArray()]));
    this.helper.visible=$('skeleton').checked;this.lastClipID=requestedAction;
  }

  updateMatrices(){this.model.updateMatrixWorld(true);for(const m of this.meshes)m.skeleton.update();}
  refreshFloorRows(){
    for(const piece of this.floorMeshes){
      const m=piece.mesh,r=piece.rows;
      this.floorLeft.multiplyMatrices(m.matrixWorld,m.bindMatrixInverse);
      for(let b=0;b<m.skeleton.bones.length;b++){
        const e=this.floorMatrix.fromArray(m.skeleton.boneMatrices,b*16).premultiply(this.floorLeft).multiply(m.bindMatrix).elements;
        r[b*4]=e[1];r[b*4+1]=e[5];r[b*4+2]=e[9];r[b*4+3]=e[13];
      }
    }
  }
  minimumY(exact=false){
    this.refreshFloorRows();let min=Infinity;
    for(const piece of this.floorMeshes){
      const p=piece.positions,j=piece.joints,w=piece.weights,r=piece.rows;
      for(let i=0;i<piece.count;i++){
        const x=p[i*3],y=p[i*3+1],z=p[i*3+2],base=i*4;let sy=0;
        for(let k=0;k<4;k++){const weight=w[base+k];if(weight){const row=j[base+k]*4;sy+=weight*(r[row]*x+r[row+1]*y+r[row+2]*z+r[row+3]);}}
        if(sy<min)min=sy;
      }
    }
    return min;
  }
  footMinimumY(name){
    this.refreshFloorRows();let min=Infinity;
    for(const piece of this.floorMeshes){
      const p=piece.positions,j=piece.joints,w=piece.weights,r=piece.rows;
      for(const i of piece.feet[name]){
        const x=p[i*3],y=p[i*3+1],z=p[i*3+2],base=i*4;let sy=0;
        for(let k=0;k<4;k++){const weight=w[base+k];if(weight){const row=j[base+k]*4;sy+=weight*(r[row]*x+r[row+1]*y+r[row+2]*z+r[row+3]);}}
        min=Math.min(min,sy);
      }
    }
    // The same exact convex support set covers both delivered LODs. A rotated
    // toe/stud removed by simplification must not change the swing correction.
    const proxy=data.bootBounds;
    if(proxy?.modelSha256?.[this.path]===data.hashes.models[this.path]){
      const points=proxy.feet[name]?.vertices,e=this.bones[name].matrixWorld.elements;
      if(points)for(const p of points)min=Math.min(min,e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13]-proxy.paddingMeters);
    }
    return min;
  }
  legAxis(name){const side=name.replace(/Foot$/,'');return this.bones[name].getWorldPosition(new THREE.Vector3()).sub(this.bones[side+'UpLeg'].getWorldPosition(new THREE.Vector3())).normalize();}
  kneeFlexion(name){const side=name.replace(/Foot$/,''),hip=this.bones[side+'UpLeg'].getWorldPosition(new THREE.Vector3()),knee=this.bones[side+'Leg'].getWorldPosition(new THREE.Vector3()),ankle=this.bones[name].getWorldPosition(new THREE.Vector3());return Math.acos(clamp(knee.clone().sub(hip).normalize().dot(ankle.sub(knee).normalize()),-1,1));}
  kneePole(name){
    const side=name.replace(/Foot$/,''),hip=this.bones[side+'UpLeg'].getWorldPosition(new THREE.Vector3()),knee=this.bones[side+'Leg'].getWorldPosition(new THREE.Vector3()),ankle=this.bones[name].getWorldPosition(new THREE.Vector3());
    const direction=ankle.sub(hip).normalize(),pole=knee.sub(hip);pole.addScaledVector(direction,-pole.dot(direction));
    if(pole.lengthSq()<1e-10)pole.set(0,0,1).applyQuaternion(this.bones.Root.getWorldQuaternion(new THREE.Quaternion()));
    return pole.normalize();
  }
  solvePlant(lock){
    const rootYaw=new THREE.Euler().setFromQuaternion(this.bones.Root.getWorldQuaternion(new THREE.Quaternion()),'YXZ').y;
    const relativeYaw=lock.worldYaw==null?(lock.yawRadians||0):lock.worldYaw-rootYaw;
    return solveFootIK(THREE,this.bones,lock.bone,lock.anchor,.08,relativeYaw);
  }
  canReachSole(name,target,orientation){
    const side=name.replace(/Foot$/,''),hip=this.bones[side+'UpLeg'].getWorldPosition(new THREE.Vector3());
    const length=this.bones[side+'Leg'].position.length()+this.bones[name].position.length()-1e-8;
    return target.clone().add(new THREE.Vector3(0,.08,0).applyQuaternion(orientation)).distanceTo(hip)<=length+.000001;
  }
  constrainSole(name,target,orientation){
    const side=name.replace(/Foot$/,''),hip=this.bones[side+'UpLeg'].getWorldPosition(new THREE.Vector3()),offset=new THREE.Vector3(0,.08,0).applyQuaternion(orientation);
    const length=this.bones[side+'Leg'].position.length()+this.bones[name].position.length()-1e-8;
    const direction=target.clone().add(offset).sub(hip),gap=Math.max(0,direction.length()-length);
    return{target:gap?direction.setLength(length).add(hip).sub(offset):target,gap};
  }
  limitLandingTarget(name,target,orientation){
    const previous=this.displayedSoles?.[name],dt=this.updateDelta;
    if(!previous||dt<=0)return target;
    const side=name.replace(/Foot$/,''),hip=this.bones[side+'UpLeg'].getWorldPosition(new THREE.Vector3());
    const a=this.bones[side+'Leg'].position.length(),b=this.bones[name].position.length();
    const offset=new THREE.Vector3(0,.08,0).applyQuaternion(orientation),delta=target.clone().add(offset).sub(hip),distance=delta.length();
    const bend=Math.acos(clamp((distance*distance-a*a-b*b)/(2*a*b),-1,1));
    const limitedBend=clamp(bend,Math.max(0,previous.bend-20*dt),Math.min(Math.PI,previous.bend+20*dt));
    const direction=delta.normalize(),angle=previous.axis.angleTo(direction);
    if(angle>8*dt){const turn=new THREE.Quaternion().setFromUnitVectors(previous.axis,direction);direction.copy(previous.axis).applyQuaternion(new THREE.Quaternion().identity().slerp(turn,8*dt/angle));}
    const radius=Math.sqrt(Math.max(0,a*a+b*b+2*a*b*Math.cos(limitedBend)));
    return direction.multiplyScalar(radius).add(hip).sub(offset);
  }
  solveSole(name,target,orientation,pole=this.kneePole(name)){
    const rootQ=this.bones.Root.getWorldQuaternion(new THREE.Quaternion());
    const offset=new THREE.Vector3(0,.08,0).applyQuaternion(orientation).sub(new THREE.Vector3(0,.08,0).applyQuaternion(rootQ));
    const residual=solveFootIK(THREE,this.bones,name,target.clone().add(offset),.08,0,pole);
    const bone=this.bones[name],parentQ=bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert()).multiply(orientation).normalize();return residual;
  }
  applyLandings(){
    this.landingResidual=0;
    for(const [name,landing] of this.landings){
      if(this.locks.has(name)){this.landings.delete(name);continue;}
      const u=clamp((this.clock-landing.start)/landing.duration,0,1),w=smooth(u);
      const releasing=landing.mode==='release',bone=this.bones[name];
      const destination=releasing?bone.localToWorld(new THREE.Vector3(0,-.08,0)):landing.to;
      // Lift before horizontal transfer; settle XZ before lowering. This keeps
      // the first and last millimetres of flight from becoming a floor skate.
      const transfer=smooth((u-.22)/.56);
      const target=landing.from.clone().lerp(destination,transfer);
      target.y=THREE.MathUtils.lerp(landing.from.y,destination.y,w)+.075*Math.sin(Math.PI*u)**2;
      const destinationQ=releasing?bone.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),landing.worldYaw??(this.modelHeading()+(landing.yawRadians||0)));
      const orientation=landing.orientation.clone().slerp(destinationQ,w);
      const constrained=this.constrainSole(name,target,orientation);landing.projectionMeters=constrained.gap;
      const reachable=releasing?constrained.target:this.limitLandingTarget(name,constrained.target,orientation);
      landing.kinematicDeviationMeters=reachable.distanceTo(constrained.target);
      const destinationPole=releasing?this.kneePole(name):new THREE.Vector3(0,0,1).applyQuaternion(destinationQ);
      const side=name.replace(/Foot$/,''),hip=this.bones[side+'UpLeg'].getWorldPosition(new THREE.Vector3());
      const axis=reachable.clone().add(new THREE.Vector3(0,.08,0).applyQuaternion(orientation)).sub(hip).normalize();
      const project=p=>{
        const projected=p.clone().addScaledVector(axis,-p.dot(axis));
        if(projected.lengthSq()<1e-10){projected.set(0,1,0).addScaledVector(axis,-axis.y);if(projected.lengthSq()<1e-10)projected.set(1,0,0).addScaledVector(axis,-axis.x);}
        return projected.normalize();
      };
      const transported=landing.transportedPole?new THREE.Vector3().fromArray(landing.transportedPole):landing.pole.clone();
      if(landing.poleAxis)transported.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3().fromArray(landing.poleAxis),axis));
      const fromPole=project(transported),toPole=project(destinationPole);
      landing.transportedPole=fromPole.toArray();landing.poleAxis=axis.toArray();
      let angle=Math.atan2(axis.dot(new THREE.Vector3().crossVectors(fromPole,toPole)),clamp(fromPole.dot(toPole),-1,1));
      if(landing.poleAngle!==undefined)angle+=2*Math.PI*Math.round((landing.poleAngle-angle)/(2*Math.PI));
      else if(Math.abs(Math.abs(angle)-Math.PI)<1e-5)angle=side==='Left'?Math.PI:-Math.PI;
      landing.poleAngle=angle;
      const pole=fromPole.applyAxisAngle(axis,angle*w);
      this.landingResidual=Math.max(this.landingResidual,this.solveSole(name,reachable,orientation,pole));
      if(u===1&&releasing)this.landings.delete(name);
    }
  }
  minimumYReference(){let min=Infinity;for(const m of this.meshes)for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,v);v.applyMatrix4(m.matrixWorld);min=Math.min(min,v.y);}return min;}
  bounds(mode=false){
    const min=new THREE.Vector3(Infinity,Infinity,Infinity),max=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
    for(const piece of this.floorMeshes){
      const m=piece.mesh,p=piece.positions,j=piece.joints,w=piece.weights,r=piece.boundsRows;
      this.floorLeft.multiplyMatrices(m.matrixWorld,m.bindMatrixInverse);
      for(let b=0;b<m.skeleton.bones.length;b++){
        const e=this.floorMatrix.fromArray(m.skeleton.boneMatrices,b*16).premultiply(this.floorLeft).multiply(m.bindMatrix).elements;
        for(let a=0;a<3;a++){const k=b*12+a*4;r[k]=e[a];r[k+1]=e[a+4];r[k+2]=e[a+8];r[k+3]=e[a+12];}
      }
      for(let i=0;i<piece.count;i++){
        const x=p[i*3],y=p[i*3+1],z=p[i*3+2];if(mode==='head'&&y<1.43)continue;if(mode==='cloth'&&(y<.84||y>1.43||Math.abs(x)>.205))continue;
        const base=i*4;let sx=0,sy=0,sz=0;
        for(let k=0;k<4;k++){const weight=w[base+k];if(weight){const row=j[base+k]*12;sx+=weight*(r[row]*x+r[row+1]*y+r[row+2]*z+r[row+3]);sy+=weight*(r[row+4]*x+r[row+5]*y+r[row+6]*z+r[row+7]);sz+=weight*(r[row+8]*x+r[row+9]*y+r[row+10]*z+r[row+11]);}}
        min.x=Math.min(min.x,sx);min.y=Math.min(min.y,sy);min.z=Math.min(min.z,sz);max.x=Math.max(max.x,sx);max.y=Math.max(max.y,sy);max.z=Math.max(max.z,sz);
      }
    }
    return new THREE.Box3(min,max);
  }
  triangles(){let count=0;this.model.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return count;}
  dispose(){scene.remove(this.model,this.helper);this.helper.geometry.dispose();this.helper.material.dispose();for(const s of new Set(this.meshes.map(m=>m.skeleton)))s.dispose();}
}
async function createActor(c,level,slot=0){const path=modelPath(c,level),t=await template(path);return new Actor(clone(t.scene),path,c.id,slot);}
async function rebuild(){
  const id=++ticket;status('טוען נכס מקומי…');
  const next=[];
  const fields=data.manifest.characters.filter(c=>c.id.startsWith('player-'));
  desiredTemplatePaths=new Set(view==='pitch'?fields.map(c=>modelPath(c,currentLevel())):[modelPath(definition(characterID)||data.manifest.characters[0],currentLevel())]);
  if(view==='pitch'){
    for(let i=0;i<12;i++){
      const a=await createActor(fields[(i<6?0:3)+(i%3)],currentLevel(),i);
      if(id!==ticket){a.dispose();next.forEach(a=>a.dispose());trimTemplates();return;}
      a.offset.set((i%3-1)*5.0+(i<6?-1.0:1.0),0,(i<6?-1:1)*(4+Math.floor(i%6/3)*6));
      a.baseYaw=i<6?0:Math.PI;a.model.rotation.set(0,a.baseYaw,0);next.push(a);
    }
  }else next.push(await createActor(definition(characterID)||data.manifest.characters[0],currentLevel()));
  if(id!==ticket){next.forEach(a=>a.dispose());trimTemplates();return;}
  for(const a of next){
    const compatible=p=>p.slot===a.slot&&(p.createdView==='pitch')===(view==='pitch');
    const prior=actors.find(p=>compatible(p)&&p.identity===a.identity)||actors.find(compatible);
    if(prior){
      a.origin.copy(prior.origin);a.world.copy(prior.world);a.velocity.copy(prior.velocity);a.baseYaw=prior.baseYaw;a.clock=prior.clock;a.dt=prior.dt;a.phaseOffset=prior.phaseOffset;a.pathScale=prior.pathScale;a.phaseRate=prior.phaseRate;a.sampleSeconds=prior.sampleSeconds;a.phaseSynced=prior.phaseSynced;a.lift=prior.lift;a.minY=prior.minY;a.contactResidual=prior.contactResidual;a.landingResidual=prior.landingResidual;a.capturedVelocity=prior.capturedVelocity?.clone();a.restoredPose=true;
      a.recoveryLegReferenceCache=prior.recoveryLegReferenceCache&&structuredClone(prior.recoveryLegReferenceCache);a.recoveryPoleCache=prior.recoveryPoleCache&&structuredClone(prior.recoveryPoleCache);a.recoveryPoleDiagnostics=prior.recoveryPoleDiagnostics&&structuredClone(prior.recoveryPoleDiagnostics);a.recovery=prior.recovery;a.recoveryManaged=prior.recoveryManaged;a.recoveryTransitionSerial=prior.recoveryTransitionSerial;a.activeClipID=prior.activeClipID;
      a.locomotion=prior.locomotion?.clone();a.dribbleDetail=prior.dribbleDetail&&structuredClone(prior.dribbleDetail);a.motorOrigin=prior.motorOrigin?.clone();a.motorYaw=prior.motorYaw;a.motorCurved=prior.motorCurved;a.requestedAction=prior.requestedAction;a.motorStyle=prior.motorStyle&&structuredClone(prior.motorStyle);a.motorEntryFade=prior.motorEntryFade&&structuredClone(prior.motorEntryFade);a.motorPelvisEntry=prior.motorPelvisEntry;a.motorHipEntry=prior.motorHipEntry&&structuredClone(prior.motorHipEntry);a.lastClipID=prior.lastClipID;
      a.rootBlend=prior.rootBlend&&{...prior.rootBlend,velocity:prior.rootBlend.velocity.clone()};a.fade=prior.fade&&structuredClone(prior.fade);a.pose=prior.pose&&clonePose(prior.pose);a.previous=prior.previous&&clonePose(prior.previous);a.worldRotations=prior.worldRotations&&structuredClone(prior.worldRotations);a.previousWorldRotations=prior.previousWorldRotations&&structuredClone(prior.previousWorldRotations);
      a.contactTargets=new Map([...prior.contactTargets].map(([key,anchor])=>[key,anchor.clone()]));a.entryPhaseRate=prior.entryPhaseRate;
      a.locks=new Map([...prior.locks].map(([n,l])=>[n,{...l,anchor:l.anchor.clone()}]));
      a.landings=new Map([...prior.landings].map(([n,l])=>[n,{...l,from:l.from.clone(),to:l.to?.clone(),orientation:l.orientation.clone(),pole:l.pole.clone()}]));
      if(a.pose){for(const [name,r] of Object.entries(a.pose.rotations))a.bones[name].quaternion.fromArray(r);a.bones.Hips.position.copy(a.rest.Hips).add(new THREE.Vector3().fromArray(a.pose.hipsOffsetMeters));}
      a.model.position.copy(prior.model.position);a.model.quaternion.copy(prior.model.quaternion);a.updateMatrices();
    }
  }
  actors.forEach(a=>a.dispose());actors=next;
  for(const a of actors){a.model.visible=true;a.model.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.wireframe=$('wireframe').checked;});if(a.restoredPose){a.updateMatrices();a.minY=a.minimumY(true);if(a.minY<.0008){const correction=.001-a.minY;a.model.position.y+=correction;a.lift+=correction;a.updateMatrices();a.minY=a.minimumY(true);}a.helper.visible=$('skeleton').checked;}else a.update(time,0,true);}
  const c=definition(characterID);
  $('character-label').textContent=view==='pitch'?'שנים עשר על הדשא':(c.label||c.id);
  $('clip-label').textContent=currentClip().label||clipID;
  const bytes=[...new Set(actors.map(a=>a.path))].reduce((n,p)=>n+(data.manifest.characters.flatMap(c=>c.kits||[c]).find(k=>k.lod0===p||k.lod1===p)?.[p.endsWith('lod0.glb')?'lod0Bytes':'lod1Bytes']||0),0);
  $('asset-size').textContent=(bytes/1e6).toFixed(2)+' MB';
  environment.setMode(lighting,view);resize();syncUI();render();status('מוכן · גרירה מסובבת את המבט');
  // A phone should not retain sixteen decoded 1024 PBR atlases after browsing.
  desiredTemplatePaths=new Set(actors.map(a=>a.path));trimTemplates();
}
function placeCamera(){
  const first=actors[0];
  rootFollow.copy(view==='pitch'||!first?new THREE.Vector3():first.world);
  if(view==='pitch'){
    camera.fov=camera.aspect<1?53:43;
    const r=camera.aspect<1?42:35;camera.position.set(r*.74,r*.67,r*.46);camera.lookAt(0,.1,0);
  }else{
    const face=view==='face',fabric=view==='cloth';
    camera.fov=face||fabric?25:30;
    const bounds=first?.bounds(face?'head':fabric?'cloth':false);
    const size=bounds?.getSize(new THREE.Vector3())||new THREE.Vector3(.6,1.76,.4);
    const target=bounds?.getCenter(new THREE.Vector3())||rootFollow.clone().add(new THREE.Vector3(0,face?1.605:.88,0));
    target.y+=pitch;
    const width=Math.abs(Math.cos(yaw))*size.x+Math.abs(Math.sin(yaw))*size.z;
    const height=Math.max(face?.34:fabric?.60:1.2,size.y)*1.14;
    const framing=face?.74:fabric?.80:1;
    const halfFov=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),baseDistance=Math.max(height,width/camera.aspect*1.14)/(2*halfFov)*zoom+size.z*.30;
    const viewDepth=.5*(Math.abs(Math.sin(yaw))*size.x+Math.abs(Math.cos(yaw))*size.z);
    const distance=face?Math.max(baseDistance*framing,Math.max(height,width/camera.aspect*1.14)/(2*halfFov)*zoom+viewDepth):baseDistance*framing;
    camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw)*distance,face?.004:.055,Math.cos(yaw)*distance));
    camera.lookAt(target);
  }
  camera.updateProjectionMatrix();
  environment.update(time,rootFollow);
  if(environment.setContacts&&first&&view!=='pitch')environment.setContacts(['LeftFoot','RightFoot'].map(n=>first.bones[n].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,-.08,0))));
}
function resize(){const r=$('viewport').getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);placeCamera();render();}
function render(){const actor=actors[0],recoveryPresentation=actor?.recoveryManaged?actor.recovery.snapshot({history:false}).presentation:null,presentation=recoveryPresentation?{clip:clipMap.get(recoveryPresentation.clipID),seconds:recoveryPresentation.seconds}:actor?.locomotion?actor.motorPresentation():{clip:actor?.motionClip()||currentClip(),seconds:actor?.sampleSeconds??time};props.update(actor,presentation.clip,presentation.seconds,view);renderer.render(scene,camera);$('triangles').textContent=renderer.info.render.triangles.toLocaleString('en');$('draws').textContent=renderer.info.render.calls;}
function recoveryContext(a){
  if(!a)return{};const recovery=a.recovery;const heading=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),a.modelHeading()),inverse=heading.clone().invert();
  const point=p=>p.applyQuaternion(inverse).toArray(),orientation=q=>inverse.clone().multiply(q).normalize().toArray(),soles={},footQuaternions={},kneePoles={},hands={};
  for(const name of['LeftFoot','RightFoot']){soles[name]=point(a.bones[name].localToWorld(new THREE.Vector3(0,-.08,0)));footQuaternions[name]=orientation(a.bones[name].getWorldQuaternion(new THREE.Quaternion()));kneePoles[name]=a.kneePole(name).applyQuaternion(inverse).toArray();}
  for(const name of['LeftHand','RightHand']){const side=name.replace(/Hand$/,''),upper=a.bones[side+'Arm'].getWorldPosition(new THREE.Vector3()),elbow=a.bones[side+'ForeArm'].getWorldPosition(new THREE.Vector3()),wrist=a.bones[name].getWorldPosition(new THREE.Vector3()),axis=wrist.clone().sub(upper).normalize(),pole=elbow.sub(upper).addScaledVector(axis,-elbow.dot(axis));hands[name]={position:point(wrist),orientation:orientation(a.bones[name].getWorldQuaternion(new THREE.Quaternion())),pole:pole.normalize().applyQuaternion(inverse).toArray()};}
  return{pose:clonePose(a.pose),locomotion:a.locomotion?.snapshot({includeHistory:false})||null,frameHeadingQuaternion:heading.toArray(),originMeters:point(a.world.clone()),measured:{minimumY:a.minY,rootSpeedMps:a.velocity.length(),rigidBootMinimumY:Object.fromEntries(['LeftFoot','RightFoot'].map(name=>[name,a.rigidBootMinimumY(name)])),chestPosition:point(a.bones.Chest.getWorldPosition(new THREE.Vector3())),pelvisHeight:a.bones.Hips.getWorldPosition(new THREE.Vector3()).y,hipsUpDot:new THREE.Vector3(0,1,0).applyQuaternion(a.bones.Hips.getWorldQuaternion(new THREE.Quaternion())).y,soles,footQuaternions,kneePoles,hands}};
}
function applyRecoveryConstraints(a){
  const recovery=a.recovery;
  const constraints=recovery.bridgeConstraints();
  if(recovery.overlay)applyCatchEffectors(a);
  if(!constraints)return;
  const heading=new THREE.Quaternion().fromArray(recovery.episode.origin.frameHeadingQuaternion),point=values=>new THREE.Vector3().fromArray(values).applyQuaternion(heading),orientation=values=>heading.clone().multiply(new THREE.Quaternion().fromArray(values)).normalize();
  a.recoveryConstraintResidual=0;a.recoveryFootResidual=0;a.recoveryHandResidual=0;
  for(const foot of constraints.feet){const target=point(foot.target),q=orientation(foot.worldQuaternion),pole=foot.poleMode==='transport-limited'?recoveryKneePole(a,foot,target,q,heading):foot.pole?point(foot.pole):a.kneePole(foot.bone);if(foot.poleMode==='transport-limited')seedRecoveryLeg(a,foot);const result=a.solveSole(foot.bone,target,q,pole);a.recoveryConstraintResidual=Math.max(a.recoveryConstraintResidual,result);a.recoveryFootResidual=Math.max(a.recoveryFootResidual,result);a.updateMatrices();}
  if(a.recoveryHandCache?.clock!==a.clock)a.recoveryHandCache={clock:a.clock,rootY:a.model.position.y,hands:Object.fromEntries(constraints.hands.map(hand=>[hand.bone,{position:a.bones[hand.bone].getWorldPosition(new THREE.Vector3()),orientation:a.bones[hand.bone].getWorldQuaternion(new THREE.Quaternion())}]))};
  for(const hand of constraints.hands){const bone=a.bones[hand.bone],saved=a.recoveryHandCache.hands[hand.bone],current=saved.position.clone().add(new THREE.Vector3(0,a.model.position.y-a.recoveryHandCache.rootY,0)),target=current.lerp(point(hand.target),hand.weight),q=saved.orientation.clone().slerp(orientation(hand.worldQuaternion),hand.weight),pole=hand.pole?point(hand.pole):null;const result=solveRecoveryHand(THREE,a.bones,hand.bone,target,q,pole,a.worldRotations);a.recoveryConstraintResidual=Math.max(a.recoveryConstraintResidual,result);a.recoveryHandResidual=Math.max(a.recoveryHandResidual,result);a.updateMatrices();}
}
function applyCatchEffectors(a){
  const recovery=a.recovery;
  const heading=new THREE.Quaternion().fromArray(recovery.episode.origin.frameHeadingQuaternion),inverse=heading.clone().invert(),chest=a.bones.Chest.getWorldPosition(new THREE.Vector3()).applyQuaternion(inverse).toArray();
  const targets=recovery.overlayTargets(THREE,chest);a.catchEffectorTargets=targets;a.catchEffectorResidual=0;
  for(const hand of targets){const target=new THREE.Vector3().fromArray(hand.target).applyQuaternion(heading),q=heading.clone().multiply(new THREE.Quaternion().fromArray(hand.worldQuaternion)).normalize(),pole=new THREE.Vector3().fromArray(hand.pole).applyQuaternion(heading);a.catchEffectorResidual=Math.max(a.catchEffectorResidual,solveRecoveryHand(THREE,a.bones,hand.bone,target,q,pole,a.worldRotations));a.updateMatrices();}
}

function recoveryKneePole(a,foot,target,orientation,heading){
  a.recoveryPoleCache??={};a.recoveryPoleDiagnostics??={};
  const shown=a.displayedSoles?.[foot.bone],dt=Math.max(0,a.updateDelta||0);let state=a.recoveryPoleCache[foot.bone];
  if(!state||state.clock!==a.clock){state={clock:a.clock,sourcePole:(shown?.pole||a.kneePole(foot.bone)).toArray(),sourceAxis:(shown?.axis||a.legAxis(foot.bone)).toArray()};a.recoveryPoleCache[foot.bone]=state;}
  const side=foot.bone.replace(/Foot$/,''),hip=a.bones[side+'UpLeg'].getWorldPosition(new THREE.Vector3()),axis=target.clone().add(new THREE.Vector3(0,.08,0).applyQuaternion(orientation)).sub(hip).normalize();
  const project=p=>{p.addScaledVector(axis,-p.dot(axis));if(p.lengthSq()<1e-10){p.set(0,1,0).addScaledVector(axis,-axis.y);if(p.lengthSq()<1e-10)p.set(1,0,0).addScaledVector(axis,-axis.x);}return p.normalize();};
  const transported=project(new THREE.Vector3().fromArray(state.sourcePole).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3().fromArray(state.sourceAxis),axis))),forward=new THREE.Vector3().fromArray(foot.poleGuide||[0,0,1]).applyQuaternion(heading),projected=forward.clone().addScaledVector(axis,-forward.dot(axis));
  const desired=projected.lengthSq()<.0001?transported.clone():project(projected),angle=Math.atan2(axis.dot(new THREE.Vector3().crossVectors(transported,desired)),clamp(transported.dot(desired),-1,1)),limit=(foot.poleVelocityLimitRadiansPerSecond||8)*dt,turn=clamp(angle,-limit,limit),pole=transported.clone().applyAxisAngle(axis,turn).normalize();
  a.recoveryPoleDiagnostics[foot.bone]={clock:a.clock,sourcePole:state.sourcePole,sourceAxis:state.sourceAxis,axis:axis.toArray(),transportedPole:transported.toArray(),desiredPole:desired.toArray(),usedPole:pole.toArray(),remainingRadians:angle-turn,appliedRadians:turn,limitRadians:limit,limitRadiansPerSecond:foot.poleVelocityLimitRadiansPerSecond||8};return pole;
}
function seedRecoveryLeg(a,foot){
  const side=foot.bone.replace(/Foot$/,''),names=[side+'UpLeg',side+'Leg'];a.recoveryLegReferenceCache??={};let cache=a.recoveryLegReferenceCache[foot.bone];
  if(!cache||cache.clock!==a.clock){cache={clock:a.clock,goal:Object.fromEntries(names.map(name=>[name,a.bones[name].getWorldQuaternion(new THREE.Quaternion()).normalize().toArray()]))};a.recoveryLegReferenceCache[foot.bone]=cache;}
  for(const name of names){const bone=a.bones[name],source=a.worldRotations?.[name];if(!source)continue;const orientation=new THREE.Quaternion().fromArray(source).normalize(),goal=new THREE.Quaternion().fromArray(cache.goal[name]),angle=orientation.angleTo(goal);if(foot.nativeReferenceRelaxation&&angle>1e-10)orientation.slerp(goal,Math.min(1,8*Math.max(0,a.updateDelta||0)/angle));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(orientation).normalize();bone.updateWorldMatrix(true,true);}
}

function setClip(id){
  if(!clipMap.has(id))throw Error('Unknown clip '+id);
  if(!playing){for(const a of actors){a.recoveryManaged=false;a.activeClipID=null;a.recovery.reset({clipID:id,seconds:0});}setClipCanonical(id);return;}
  clipID=id;
  for(const a of actors){
    if(!a.recoveryManaged){const sourceID=a.lastClipID||id;a.recovery.reset({clipID:sourceID,seconds:a.sampleSeconds,clock:a.clock});a.activeClipID=sourceID;a.recoveryTransitionSerial=a.recovery.transitionSerial;a.recoveryManaged=true;}
    a.recovery.request(id,recoveryContext(a));a.update(time,0);
  }
  syncUI();placeCamera();render();
}
function seek(u){for(const a of actors){a.recoveryManaged=false;a.activeClipID=null;a.recovery.reset({clipID,seconds:clamp(u,0,1)*duration()});}seekCanonical(u);}

function updateTime(){
  const actor=actors[0],c=currentClip(),motor=playing&&actor?.locomotion,len=duration(c),recovery=actor?.recoveryManaged?actor.recovery.snapshot({history:false}):null;
  const recoveryLabels={braking:'מאט לפני הפעולה', 'await-landing':'משלים נחיתה', 'await-upright-landing':'משלים נחיתה', 'await-turn-finish':'משלים פנייה', 'seated-bridge':'מתרומם', 'getting-up':'מתרומם'};
  if(recoveryLabels[recovery?.phase]){$('scrub').value=0;$('time').textContent=recoveryLabels[recovery.phase];return;}
  if(recovery?.presentation){const local=recovery.presentation.seconds;$('scrub').value=clamp(local/len,0,1);$('time').textContent=local.toFixed(2)+' / '+len.toFixed(2);return;}
  const local=motor&&c.id!=='decelerate'?(c.id==='idle'?motor.clock%len:(((motor.phase%1)+1)%1)*len):(c.loop?time%len:Math.min(time,len));
  $('scrub').value=local/len;
  if(motor&&(c.id==='decelerate'||(c.id==='idle'&&(motor.speed>.03||Object.values(motor.feet).some(f=>f.mode!=='plant')))))$('time').textContent=motor.speed>.03?motor.speed.toFixed(1)+' מ׳/ש׳ · מאט':Object.values(motor.feet).some(f=>f.mode!=='plant')?'מתייצב':'נעצר';
  else $('time').textContent=local.toFixed(2)+' / '+len.toFixed(2);
}
function syncUI(){$('clip-label').textContent=currentClip().label||clipID;for(const [id,value] of Object.entries({character:characterID,clip:clipID,view,lod,lighting,speed}))$(id).value=value;$('play').setAttribute('aria-pressed',String(playing));$('play').setAttribute('aria-label',playing?'השהיה':'ניגון');$('play').querySelector('span')?.replaceChildren(playing?'השהיה':'ניגון');$('play').querySelector('path')?.setAttribute('d',playing?'M9 6v12M15 6v12':'M8 5v14l11-7z');document.body.dataset.view=view;updateTime();}
function setPlaying(p){playing=Boolean(p);if(playing)last=0;else $('fps').textContent='—';syncUI();}
function setClipCanonical(id){
  if(!clipMap.has(id))throw Error('Unknown clip '+id);
  if(playing&&motorClipFor(id)&&actors.length&&actors.every(a=>a.locomotion)){clipID=id;actors.forEach(a=>a.updateLocomotion(time,0,id));syncUI();placeCamera();render();return;}
  if(!playing)for(const a of actors)a.clearLocomotion();
  const from=currentClip(),phase=((actors[0]?.sampleSeconds??time)%duration(from))/duration(from);
  const locomotion=c=>/^run_|sprint|dribble/.test(c.id);
  if(/^turn_/.test(from.id)&&from.id!==id)for(const a of actors)a.handoffHeading();
  actors.forEach(a=>a.capture());clipID=id;
  const phaseSynced=locomotion(from)&&locomotion(currentClip());
  const entryPlant=currentClip().contacts.find(c=>c.bone==='LeftFoot'&&c.start===0);
  time=phaseSynced?phase*duration():(playing&&locomotion(currentClip())&&entryPlant?entryPlant.end*.5:0);
  actors.forEach(a=>{a.entryPhaseRate=phaseSynced?clamp(a.phaseRate*duration(currentClip())/duration(from),.15,5):(locomotion(currentClip())&&a.capturedVelocity.length()<.1?0:1);a.pathScale=clipID==='decelerate'&&locomotion(from)&&playing?clamp((a.capturedVelocity.length()||from.speedMps||6)/(currentClip().entrySpeedMps||6),.15,1.2):1;a.rebase(time);a.phaseSynced=phaseSynced;if(!playing){a.fade=null;a.rootBlend=null;a.locks.clear();a.pose=null;a.previous=null;a.worldRotations=null;a.previousWorldRotations=null;}});
  actors.forEach(a=>{a.update(time,0);if(!playing&&motorClipFor(clipID)){const c=currentClip();a.velocity.copy(a.referencePoint(pathAt(c,a.sampleSeconds+.001))).sub(a.referencePoint(pathAt(c,a.sampleSeconds))).multiplyScalar(1000);}});syncUI();placeCamera();render();
}
function seekCanonical(u){for(const a of actors)a.clearLocomotion();time=clamp(u,0,1)*duration();for(const a of actors){a.fade=null;a.rootBlend=null;a.pose=null;a.previous=null;a.worldRotations=null;a.previousWorldRotations=null;a.phaseOffset=0;a.pathScale=1;a.locks.clear();a.landings.clear();a.contactTargets.clear();a.origin.set(0,0,0);a.update(time,0,true);a.velocity.copy(a.referencePoint(pathAt(currentClip(),time+.001))).sub(a.referencePoint(pathAt(currentClip(),time))).multiplyScalar(1000);}updateTime();placeCamera();render();}
function step(dt=1/30){time+=playing?dt*speed:0;for(const a of actors)a.update(time,playing?dt*speed:0);updateTime();placeCamera();render();}
function tick(now){
  if(disposed)return;frameRequest=requestAnimationFrame(tick);
  if(document.hidden){last=now;accumulator=0;return;}
  const dt=Math.min(.1,(now-(last||now))/1000);last=now;accumulator+=dt;
  if(accumulator>=1/30){const elapsed=Math.min(.067,accumulator);accumulator%=1/30;if(playing){step(elapsed);frameCount++;}}
  if(now-second>=1000){fps=frameCount*1000/(now-second||1000);frameCount=0;second=now;$('fps').textContent=playing?fps.toFixed(0):'—';lastMeasured=now;}
}
function fail(e){errors.push(String(e));status('טעינה נכשלה: '+e.message);console.error(e);}
function options(id,entries){$(id).replaceChildren(...entries.map(([value,label])=>Object.assign(document.createElement('option'),{value,textContent:label})));}

const api={
  ready:null,
  setCharacter:async id=>{if(!definition(id))throw Error('Unknown character');characterID=id;return rebuild();},
  setView:async value=>{if(!['face','body','cloth','pitch'].includes(value))throw Error('Unknown view');view=value;if(value==='pitch')lighting='stadium';yaw=.16;pitch=0;zoom=1;return rebuild();},
  setLOD:async value=>{lod=String(value);return rebuild();},
  setLighting:value=>{lighting=value;environment.setMode(lighting,view);syncUI();placeCamera();render();},
  setClip,setPlaying,seek,
  setOrbit:(y,p=0,z=1)=>{yaw=y;pitch=p;zoom=z;placeCamera();render();},
  setClean:value=>{if(value)document.body.dataset.clean='true';else delete document.body.dataset.clean;resize();},
  step:(dt=1/30)=>{step(dt);},
  state:()=>({recovery:actors[0]?.recoveryDescriptor()||null,characterID,view,lod,lighting,clipID,time,playing,fps,threeRevision:THREE.REVISION,errors:[...errors],draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,models:actors.map(a=>({id:a.identity,path:a.path,triangles:a.triangles(),lift:a.lift,minimumY:a.minimumY(true),world:a.world.toArray(),requestedAction:a.recoveryManaged?a.recovery.requestRecord?.clipID||clipID:a.requestedAction||clipID,recovery:a.recoveryDescriptor(),activeBaseClip:a.recoveryManaged?a.recovery.base.clipID:a.motionID(),activeBaseSeconds:a.recoveryManaged?a.recovery.base.seconds:a.sampleSeconds,physicalMotorTargetClip:a.locomotion?.requestedClip||null,locomotion:a.locomotion?.snapshot()||null,motorPresentation:a.locomotion?{clip:a.motorPresentation().clip.id,seconds:a.motorPresentation().seconds,styleWeight:a.motorStyle?.weight||0}:null,sampleSeconds:a.sampleSeconds,phaseRate:a.phaseRate,pathScale:a.pathScale,contactResidual:a.contactResidual,contacts:[...a.locks.values()].map(l=>({bone:l.bone,key:l.key,anchor:l.anchor.toArray(),release:l.release}))})),environment:environment.metrics}),
  // Deliberately available for reproducible geometry/transition audits.
  inspect:()=>({recovery:actors[0]?.recoveryDescriptor()||null,actors,scene,camera,renderer,environment,sample,clipMap,data,motorClipFor,cachedTemplatePaths:[...templates.keys()]}),
  dispose:()=>{disposed=true;cancelAnimationFrame(frameRequest);actors.forEach(a=>a.dispose());draco.dispose();props.dispose();environment.dispose();renderer.dispose();},
};
globalThis.soccerV7=api;
api.ready=(async()=>{
  options('character',data.manifest.characters.map(c=>[c.id,c.label||c.id]));
  options('clip',clips.map(c=>[c.id,c.label||c.id]));
  for(const [id,fn] of Object.entries({character:v=>api.setCharacter(v),view:v=>api.setView(v),lod:v=>api.setLOD(v),clip:v=>setClip(v),lighting:v=>api.setLighting(v),speed:v=>{speed=Number(v);}}))$(id).addEventListener('change',e=>Promise.resolve(fn(e.target.value)).catch(fail));
  $('play').addEventListener('click',()=>setPlaying(!playing));
  $('reset').addEventListener('click',()=>{yaw=.16;pitch=0;zoom=1;seek(0);});
  $('scrub').addEventListener('input',e=>{setPlaying(false);seek(Number(e.target.value));});
  $('wireframe').addEventListener('change',()=>{for(const a of actors)a.model.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.wireframe=$('wireframe').checked;});render();});
  $('skeleton').addEventListener('change',()=>{for(const a of actors)a.helper.visible=$('skeleton').checked;render();});
  $('controls-toggle').addEventListener('click',()=>{const closed=document.body.dataset.controls!=='closed';document.body.dataset.controls=closed?'closed':'open';$('controls-toggle').setAttribute('aria-expanded',String(!closed));requestAnimationFrame(resize);});
  $('fullscreen').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(fail);});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|SELECT|BUTTON/.test(e.target.tagName)){e.preventDefault();setPlaying(!playing);}if(e.key==='Escape'&&document.body.dataset.clean)api.setClean(false);});
  const pointers=new Map();let pinch=null,lodTimer=0;
  const refreshLOD=()=>{clearTimeout(lodTimer);lodTimer=setTimeout(()=>{if(lod==='auto'&&actors[0]&&!actors[0].path.endsWith('lod'+currentLevel()+'.glb'))rebuild().catch(fail);},160);};
  const pinchDistance=()=>{const p=[...pointers.values()];return p.length<2?0:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);};
  canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);if(pointers.size===2)pinch={distance:pinchDistance(),zoom};});
  canvas.addEventListener('pointermove',e=>{
    const previous=pointers.get(e.pointerId);if(!previous)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2&&pinch){zoom=clamp(pinch.zoom*pinch.distance/Math.max(1,pinchDistance()),.65,1.8);}
    else if(view!=='pitch'){yaw-=(e.clientX-previous.x)*.008;pitch=clamp(pitch+(e.clientY-previous.y)*.001,-.12,.12);}
    placeCamera();render();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;refreshLOD();});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom*Math.exp(e.deltaY*.001),.65,1.8);placeCamera();render();refreshLOD();},{passive:false});
  canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.12;if(e.key==='ArrowRight')yaw+=.12;if(e.key==='ArrowUp')pitch=clamp(pitch+.02,-.12,.12);if(e.key==='ArrowDown')pitch=clamp(pitch-.02,-.12,.12);if(e.key==='+')zoom=clamp(zoom*.9,.65,1.8);if(e.key==='-')zoom=clamp(zoom/ .9,.65,1.8);placeCamera();render();refreshLOD();});
  new ResizeObserver(resize).observe($('viewport'));
  await rebuild();requestAnimationFrame(tick);return true;
})().catch(e=>{fail(e);throw e;});
