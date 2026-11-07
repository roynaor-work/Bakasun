/** Island Pro Basketball — the hoops v7 characters (GPT package design/hoops-v7/characters, 05/11).
 * Five bodies by position (PG 1.78 .. C 2.20 m, 18 bones, LOD1 skins of about 7.5K triangles) with the
 * package's own 27 authored clips. The game loads them from assets/hoops-v7/ (the design/ folder is not
 * published) and falls back silently to the v4 bodies when anything fails; ?hoopsV7=0 or
 * `assets.v7.enabled:false` switch them off.
 *
 * The package has no in-place "run with the ball" and no pass/receive clips, so the motion layer here is:
 *  - full-body clips for shots, finishes, steals, falls, celebrations and plain locomotion;
 *  - a layered pose for the ball handler: the upper body of a dribble / two-hand-hold clip over the
 *    legs of walk / run / idle, so he runs while he dribbles;
 *  - two-bone arm IK for passes and receptions (hands to the chest, then out toward the target; hands
 *    reaching for an incoming ball);
 *  - the engine's own ball logic stays in charge: the view still places the ball from the palm anchors.
 * The pure helpers do not need WebGL, so node tests can run them. */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {HoopsDRACOLoader} from './hoops-draco.mjs';
import {loadHoopsGLTF} from './hoops-gltf.mjs';
import {v8MotionEnabled,loadV8Motion,buildV8Clips,chooseV8Motion,createDribbleGuard} from './hoops-v8-motion.mjs';

export const V7_ROLES=Object.freeze(['PG','SG','SF','PF','C']);
export const v7RoleKey=pos=>V7_ROLES.includes(pos)?pos:'SF';
/** ?hoopsV7=0 forces the v4 bodies (before/after captures), ?hoopsV7=1 forces v7 even when the config
 * switch is off. Anything else follows the config. */
export function v7Enabled(cfg,params,quality=2){
 const q=params?.get?.('hoopsV7');
 if(q==='0')return false;if(q==='1')return !!cfg?.v7;
 return !!(cfg?.v7&&cfg.v7.enabled!==false&&quality>=(cfg.v7.minQuality??1));
}
export const V7_REQUIRED_CLIPS=Object.freeze(['idle','idle_hold','dribble_right','dribble_crossover','shot_set','shot_jump','layup','dunk_two_hand','euro_step','run','walk','decelerate','defense_shuffle','steal','block','rebound','celebrate','fall']);
export const V7_BONES=Object.freeze(['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);
const UPPER=new Set(['Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand']);
const LOWER=new Set(['Root','Hips','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);
/** Clips whose authored Hips track carries the jump: the engine supplies the vertical world motion, so
 * the part of the track above the standing height is removed (the crouch below it stays). */
const FLIGHT_CLIPS=['shot_jump','shot_fadeaway','shot_stepback','layup','dunk_one_hand','dunk_two_hand','dunk_reverse','block','rebound'];
const UPPER_SOURCES=['dribble_right','dribble_left','dribble_power','idle_hold'];
const LOWER_SOURCES=['idle','walk','run','defense_shuffle'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};

/** The part of a clip a layer plays: the upper body (spine, head, arms, grip morphs) or the lower body (hips, legs). */
export function splitClip(clip,part,name){
 const keep=t=>{const n=t.name.split('.')[0];if(n==='MotionBallAnchor')return false;return part==='upper'?UPPER.has(n)||/morphTargetInfluences/.test(t.name):LOWER.has(n);};
 return new THREE.AnimationClip(name,clip.duration,clip.tracks.filter(keep).map(t=>t.clone()));
}
/** The same clip without the ball anchor track (a presentation helper this game does not use). */
export function stripAnchor(clip,name=clip.name){return new THREE.AnimationClip(name,clip.duration,clip.tracks.filter(t=>t.name.split('.')[0]!=='MotionBallAnchor').map(t=>t.clone()));}
/** Hips height above `restY` removed (the crouch under it kept): y' = restY + min(0, y - restY). */
export function flattenFlight(clip,restY){
 const tracks=clip.tracks.map(t=>{
  if(t.name!=='Hips.position')return t.clone();
  const values=Float32Array.from(t.values);let removed=0;
  for(let i=1;i<values.length;i+=3){const above=values[i]-restY;if(above>0){removed=Math.max(removed,above);values[i]=restY;}}
  const out=new THREE.VectorKeyframeTrack(t.name,t.times,values);out.userData={flightRemoved:removed};return out;
 });
 return new THREE.AnimationClip(clip.name,clip.duration,tracks);
}
/** Shot clip time for an engine act time: before the release the clip is held back so the release marker
 * lines up with the engine's release; after it the follow-through fills the rest of the act. Pure. */
export function shotClipTime(meta,duration,actT,hasBall,releaseAt,engineMeta){
 const contact=meta?.events?.find(e=>/release/.test(e.name))?.at??duration*.5,em=engineMeta||{release:.8,duration:1.5},rel=releaseAt??em.release;
 return hasBall?Math.min(contact-.012,actT/Math.max(.01,em.release)*contact):Math.min(duration-.001,contact+Math.max(0,actT-rel)*(duration-contact)/Math.max(.1,em.duration-em.release));
}
/** Which clips the avatar plays for an engine player: {full} or {upper,lower}; plus the clip time sources.
 * Pure, no three.js: the reachability contract for the clip names. */
export function chooseV7Motion(p,ctx={},hint=null){
 const speed=Math.hypot(p.vx||0,p.vz||0),face=p.face||0,fwd=(p.vx||0)*Math.sin(face)+(p.vz||0)*Math.cos(face),lat=(p.vx||0)*Math.cos(face)-(p.vz||0)*Math.sin(face);
 if(p.stumble)return {full:'fall'};
 if(p.act==='fake')return {full:'shot_set',mode:'fake'};
 if(p.act==='cross')return {full:'dribble_crossover',mode:'cross'};
 if(p.act==='spin')return {full:'euro_step',mode:'spin'};
 if(p.act==='shoot'){
  const t=p.shotType;
  return {full:t==='dunk'?'dunk_two_hand':t==='layup'?'layup':t==='ft'?'shot_set':'shot_jump',mode:'shoot'};
 }
 if(p.act==='block')return {full:'block',mode:'air'};
 if(p.act==='rebound')return {full:'rebound',mode:'air'};
 if(p.act==='steal')return {full:'steal',mode:'steal'};
 if(hint&&V7_REQUIRED_CLIPS.includes(hint))return {full:hint,mode:'hint'};
 const legs=speed>2.2||p.sprinting?'run':speed>1.2?'run':speed>.4?'walk':'idle';
 if(p.hasBall){
  if(ctx.dribbling===false)return {upper:'idle_hold',lower:legs,mode:'hold'};
  // with the ball: a standing dribble, and from a walk upwards the dribble hand over a running gait
  return {upper:'dribble_right',lower:legs,mode:'dribble'};
 }
 if(ctx.defending&&speed>.45&&speed<3.2)return {full:'defense_shuffle',mode:'loop',sideways:Math.abs(lat)>Math.abs(fwd)*.8};
 // polish (07/11): a defender who stands still plays the defensive stance (hips low, hands out wide) instead of the upright idle
 if(ctx.polish&&ctx.defending&&speed<=.45)return {full:'defense_shuffle',mode:'stance'};
 if(speed>.4)return {full:speed>1.2||p.sprinting?'run':'walk',mode:'loop'};
 return {full:ctx.catching?'idle_hold':'idle',mode:'loop'};
}

/** Palm centre of a hand in its bone's local frame: the mean of the vertices the bone owns (weight > .5),
 * measured with the scene in its bind pose. The ball is placed on this point, not on the wrist. */
function palmOffsets(scene){
 scene.updateMatrixWorld(true);const out={},p=new THREE.Vector3();
 scene.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const g=mesh.geometry.attributes,bones=mesh.skeleton.bones;
  for(const side of ['Left','Right']){
   const index=bones.findIndex(b=>b.name===side+'Hand');if(index<0)continue;
   const sum=out[side]||(out[side]={v:new THREE.Vector3(),n:0});
   for(let i=0;i<g.position.count;i++){
    let w=0;for(let k=0;k<4;k++)if(g.skinIndex.getComponent?.(i,k)===index)w+=g.skinWeight.getComponent(i,k);
    if(w>.5){p.fromBufferAttribute(g.position,i).applyMatrix4(mesh.matrixWorld);sum.v.add(p);sum.n++;}
   }
  }
 });
 const result={};
 for(const side of ['Left','Right']){
  const s=out[side],hand=bones_of(scene,side+'Hand');
  if(s&&s.n&&hand){const c=s.v.clone().divideScalar(s.n);result[side]=hand.worldToLocal(c).toArray();}
 }
 return result;
}
function bones_of(scene,name){let r=null;scene.traverse(o=>{if(!r&&o.isBone&&o.name===name)r=o;});return r;}

function releaseScene(scene){
 const materials=new Set(),geometries=new Set();
 scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});
 for(const g of geometries)g.dispose();
 for(const m of materials){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}
}

/** The seven source meshes per body become three draw calls: the human surface (it keeps the grip morphs),
 * the cloth (jersey + shorts, with the fabric normal map) and the rest (eyes, hair, trim, sleeves). Team colours
 * live in a per-vertex colour attribute, so one body can wear any kit; `ranges` says which vertices are which. */
const GROUPS=[['human',['human_surface']],['cloth',['team_primary','team_secondary']],['misc',['eyes','hair','team_trim','compression']]];
const KIT_PART={team_primary:'primary',team_secondary:'secondary',team_trim:'trim'};
export function mergeBodyGroups(scene){
 const byMaterial=new Map();
 scene.traverse(o=>{if(o.isSkinnedMesh)byMaterial.set(o.material.name,o);});
 const groups={};
 for(const [key,names] of GROUPS){
  const meshes=names.map(n=>byMaterial.get(n)).filter(Boolean);if(!meshes.length)throw Error('Basketball v7 body lacks material '+names.join('/'));
  if(key==='human'){groups[key]={meshes,geometry:meshes[0].geometry,material:meshes[0].material,base:null,ranges:{}};continue;}
  const parts=[],ranges={};let offset=0;const colors=[];
  for(const m of meshes){
   const g=new THREE.BufferGeometry(),a=m.geometry.attributes;
   for(const n of ['position','normal','uv','skinIndex','skinWeight'])g.setAttribute(n,a[n]);
   if(key==='cloth'&&a.tangent)g.setAttribute('tangent',a.tangent);
   g.setIndex(m.geometry.index);parts.push(g);
   const count=a.position.count,c=m.material.color,part=KIT_PART[m.material.name];
   for(let i=0;i<count;i++)colors.push(c.r,c.g,c.b);
   if(part)ranges[part]=[offset,count];offset+=count;
  }
  const merged=mergeGeometries(parts,false);if(!merged)throw Error('Basketball v7 could not merge '+key);
  const material=(key==='cloth'?meshes[0].material:byMaterial.get('human_surface').material).clone();
  material.color.set(0xffffff);material.vertexColors=true;material.name='v7-'+key;
  if(key==='misc'){material.normalMap=null;material.side=THREE.DoubleSide;}
  groups[key]={meshes,geometry:merged,material,base:Float32Array.from(colors),ranges};
 }
 return groups;
}

function prepareRole(gltf,meta,role){
 const scene=gltf.scene;let skinned=0,bones=new Set();
 scene.traverse(o=>{if(o.isSkinnedMesh)skinned++;if(o.isBone)bones.add(o.name);});
 if(!skinned)throw Error('Basketball v7 body has no skin: '+role);
 for(const b of V7_BONES)if(!bones.has(b))throw Error('Basketball v7 body lacks bone '+b+': '+role);
 const groups=mergeBodyGroups(scene),humanName=groups.human.meshes[0].name;
 // only the human surface (hands) keeps its grip morphs: the other meshes are merged and have no node of their own
 const onlyHumanMorph=clip=>new THREE.AnimationClip(clip.name,clip.duration,clip.tracks.filter(t=>!/morphTargetInfluences/.test(t.name)||t.name.split('.')[0]===humanName));
 const source=new Map(gltf.animations.map(c=>[c.name,onlyHumanMorph(c)]));
 for(const n of V7_REQUIRED_CLIPS)if(!source.has(n))throw Error('Basketball v7 clip missing: '+n+' ('+role+')');
 const idle=source.get('idle'),hipsTrack=idle.tracks.find(t=>t.name==='Hips.position'),restY=hipsTrack?hipsTrack.values[1]:1,restVec=hipsTrack?[hipsTrack.values[0],hipsTrack.values[1],hipsTrack.values[2]]:[0,1,0];
 const clips=new Map();
 for(const [name,clip] of source){
  clips.set(name,FLIGHT_CLIPS.includes(name)?flattenFlight(stripAnchor(clip),restY):stripAnchor(clip));
 }
 for(const n of UPPER_SOURCES)if(source.has(n))clips.set('upper:'+n,splitClip(source.get(n),'upper','upper:'+n));
 for(const n of LOWER_SOURCES)if(source.has(n))clips.set('lower:'+n,splitClip(source.get(n),'lower','lower:'+n));
 const box=new THREE.Box3().setFromObject(scene);
 return {role,scene,clips,groups,palm:palmOffsets(scene),height:box.max.y-box.min.y,restY,restVec};
}

/** GLTFLoader's meshopt hook (`ready`, `decodeGltfBufferAsync`) backed by a static same-origin module worker
 * (hoops-meshopt-worker.mjs): the page's CSP has no WebAssembly exception, so the decoder never runs in the page.
 * A worker that cannot start or fails rejects every pending request, so loading falls back instead of hanging. */
export function createMeshoptWorkerDecoder(WorkerClass=globalThis.Worker,url=new URL('./hoops-meshopt-worker.mjs',import.meta.url)){
 if(typeof WorkerClass!=='function')throw Error('Basketball v7 needs Web Workers');
 let worker=null,id=0,failure=null;const pending=new Map();
 const fail=error=>{failure=error;for(const p of pending.values())p.reject(error);pending.clear();};
 const start=()=>{
  if(worker)return worker;
  worker=new WorkerClass(url,{type:'module'});
  worker.onmessage=e=>{const {id:rid,value,error}=e.data||{},p=pending.get(rid);if(!p)return;pending.delete(rid);if(error)p.reject(Error('Basketball meshopt worker: '+error));else p.resolve(value);};
  worker.onerror=e=>fail(Error('Basketball meshopt worker: '+(e?.message||'failed to start')));
  worker.onmessageerror=()=>fail(Error('Basketball meshopt worker: message decoding failed'));
  return worker;
 };
 return {
  ready:Promise.resolve(),supported:true,
  decodeGltfBufferAsync(count,size,source,mode,filter){
   if(failure)return Promise.reject(failure);
   const w=start(),rid=++id,bytes=new Uint8Array(source);
   return new Promise((resolve,reject)=>{pending.set(rid,{resolve,reject});w.postMessage({id:rid,count,size,source:bytes,mode,filter},[bytes.buffer]);});
  },
  dispose(){if(worker){worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();worker=null;}pending.clear();},
 };
}

/** Five bodies by position with their authored clips. Throws on any failure (the caller falls back). */
export async function loadPlayerAssetsV7(cfg,base,onProgress,{params,onFallback}={}){
 const v7=cfg.v7;if(!v7?.players)throw Error('Basketball v7 is not configured');
 const meshopt=createMeshoptWorkerDecoder();
 const draco=new HoopsDRACOLoader().setDecoderPath(new URL('vendor/draco/',base).href).setWorkerLimit(1),loader=new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(meshopt),roles={};
 let done=0;const tick=()=>onProgress?.(++done/(V7_ROLES.length+1));
 try{
  const metaResponse=await fetch(new URL(v7.clips,base));if(!metaResponse.ok)throw Error('Basketball v7 clip table '+metaResponse.status);
  const meta=await metaResponse.json();tick();
  const pending=await Promise.allSettled(V7_ROLES.map(async role=>{
   const path=v7.players[role];if(!path)throw Error('Basketball v7 body missing: '+role);
   const gltf=await loadHoopsGLTF(loader,new URL(path,base).href);roles[role]=prepareRole(gltf,meta.clips,role);tick();
  }));
  const failure=pending.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  // v8 motion (06/11): passes, receptions, steal and block as authored clips on the same rig. Optional: a failure keeps the v7 arm-IK passes.
  let v8=null;
  if(v8MotionEnabled(cfg,params)){
   try{v8=await loadV8Motion(cfg,base);for(const r of Object.values(roles)){for(const [n,c] of buildV8Clips(THREE,v8,r.restVec))r.clips.set(n,c);for(const n of ['receive_moving'])r.clips.set('upper:v8:'+n,splitClip(r.clips.get('v8:'+n),'upper','upper:v8:'+n));}}
   catch(error){v8=null;for(const r of Object.values(roles))for(const n of [...r.clips.keys()])if(n.startsWith('v8:'))r.clips.delete(n);onFallback?.('v8 motion',error);}
  }
  return {v7:true,v8,roles,clips:roles.PG.clips,meta:meta.clips,baseHeights:v7.baseHeights,dispose(){for(const r of Object.values(roles)){releaseScene(r.scene);for(const g of Object.values(r.groups))if(g.base)g.geometry.dispose();}}};
 }catch(error){for(const r of Object.values(roles))releaseScene(r.scene);throw error;}
 finally{draco.dispose();meshopt.dispose();}
}

// ---- two-bone arm reach -------------------------------------------------------------------------
const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_d=new THREE.Vector3(),_e=new THREE.Vector3(),_q=new THREE.Quaternion(),_q2=new THREE.Quaternion();
function setWorldQuaternion(bone,q){bone.parent.getWorldQuaternion(_q2).invert();bone.quaternion.copy(_q2.multiply(q));bone.updateMatrixWorld(true);}
/** Bend the arm (upper, lower) so the wrist reaches `goal` (world); `weight` 0..1 blends from the current pose.
 * The elbow keeps the side it already bends to. Returns false when the goal is degenerate. */
export function reachArm(upper,lower,hand,goal,weight){
 if(weight<=.001)return false;
 upper.updateWorldMatrix(true,false);
 const shoulder=upper.getWorldPosition(_a),elbow=lower.getWorldPosition(_b),wrist=hand.getWorldPosition(_c);
 const l1=shoulder.distanceTo(elbow),l2=elbow.distanceTo(wrist),target=_d.copy(wrist).lerp(goal,weight),dir=_e.copy(target).sub(shoulder),dist=dir.length();
 if(dist<1e-6||l1<1e-6||l2<1e-6)return false;dir.divideScalar(dist);
 const d=clamp(dist,Math.abs(l1-l2)+1e-4,(l1+l2)*0.999);
 const pole=elbow.clone().sub(shoulder);pole.addScaledVector(dir,-pole.dot(dir));if(pole.lengthSq()<1e-9)pole.set(0,-1,0).addScaledVector(dir,dir.y);pole.normalize();
 const along=(l1*l1-l2*l2+d*d)/(2*d),newElbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
 const newWrist=shoulder.clone().addScaledVector(dir,d);
 const upperQ=upper.getWorldQuaternion(new THREE.Quaternion());
 setWorldQuaternion(upper,new THREE.Quaternion().setFromUnitVectors(elbow.clone().sub(shoulder).normalize(),newElbow.clone().sub(shoulder).normalize()).multiply(upperQ));
 const elbowNow=lower.getWorldPosition(new THREE.Vector3()),wristNow=hand.getWorldPosition(new THREE.Vector3()),lowerQ=lower.getWorldQuaternion(new THREE.Quaternion());
 setWorldQuaternion(lower,new THREE.Quaternion().setFromUnitVectors(wristNow.sub(elbowNow).normalize(),newWrist.clone().sub(elbowNow).normalize()).multiply(lowerQ));
 return true;
}

export function createAvatarV7(assets,card,teamLook,opts={}){
 const role=v7RoleKey(card.pos),src=assets.roles[role];
 const root=cloneSkinned(src.scene);root.name='player-'+card.id;root.userData.characterVersion=7;
 const base=(assets.baseHeights?.[role]||src.height*100),scale=(card.ratings?.height||base)/base;root.scale.setScalar(scale);
 const mats=[],bones={};
 root.traverse(o=>{if(o.isBone)bones[o.name]=o;});
 // three draw calls per body: the human surface keeps its own mesh (grip morphs), cloth and the rest are merged
 const sources=new Map();root.traverse(o=>{if(o.isSkinnedMesh)sources.set(o.material.name,o);});
 const colorAttrs={};
 for(const [key,group] of Object.entries(src.groups)){
  const original=sources.get(group.meshes[0].material.name);if(!original)throw Error('Basketball v7 clone lost '+key);
  if(key==='human'){
   original.frustumCulled=false;const own=original.material.clone();own.userData.kitPart=null;original.material=own;mats.push(own);continue;
  }
  const geometry=new THREE.BufferGeometry();for(const [n,a] of Object.entries(group.geometry.attributes))geometry.setAttribute(n,a);geometry.setIndex(group.geometry.index);
  const color=new THREE.BufferAttribute(Float32Array.from(group.base),3);color.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('color',color);colorAttrs[key]={attr:color,ranges:group.ranges};
  const material=group.material.clone();material.userData.kitPart=null;mats.push(material);
  const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='v7-'+key;mesh.frustumCulled=false;
  mesh.bind(original.skeleton,original.bindMatrix);original.parent.add(mesh);
  for(const m of group.meshes){const o=sources.get(m.material.name);if(o)o.parent.remove(o);}
 }
 // palm anchors: the ball is held at the palm, not at the wrist bone
 const hands={};
 for(const [side,key] of [['Right','r'],['Left','l']]){
  const wrist=bones[side+'Hand'],anchor=new THREE.Object3D();anchor.name=side+'Palm';
  const off=src.palm[side];if(off)anchor.position.fromArray(off);wrist.add(anchor);hands[key]=anchor;hands[key+'Wrist']=wrist;
 }
 const mixer=new THREE.AnimationMixer(root),actions={},cur={full:{idle:1},upper:{},lower:{},mix:1};
 for(const [name,clip] of src.clips){const a=mixer.clipAction(clip);a.enabled=true;a.setEffectiveWeight(0);a.setLoop(THREE.LoopRepeat,Infinity);a.paused=true;a.play();actions[name]=a;}
 const phase={},meta=assets.meta;
 let lastSpeed=0,hint=null,hintTime=0,stumbleT=0,releaseAt=null,wasBall=false,lastAct=null,state='idle',statePhase=0,reach={l:0,r:0},catchUntil=0;
 const armBones={r:[bones.RightArm,bones.RightForeArm,bones.RightHand],l:[bones.LeftArm,bones.LeftForeArm,bones.LeftHand]};
 const wristWorld=new THREE.Vector3(),palmWorld=new THREE.Vector3(),goal=new THREE.Vector3(),fwd=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),sideV=new THREE.Vector3(),reachGoal=new THREE.Vector3();
 function target(map,name,w,dt,tau=.075){const k=1-Math.exp(-dt/tau);let sum=0;for(const n of new Set([...Object.keys(map),...(name?[name]:[])])){const goalW=n===name?1:0,v=(map[n]||0)+(goalW-(map[n]||0))*k;if(v<.004&&goalW===0)delete map[n];else{map[n]=v;sum+=v;}}return sum;}
 const duration=n=>meta[n]?.duration||actions[n]?.getClip().duration||1;
 function clipTime(plan,p,ctx,dt,speed){
  const out={};
  const loopAdvance=(name,rate)=>{phase[name]=((phase[name]||0)+dt*rate)%duration(name);return phase[name];};
  const stride=name=>{const ref=meta[name]?.refSpeed||1;return (ctx.polish?strideSpeed:speed)/Math.max(.05,ref*root.scale.y);};
  const locomotion=name=>name==='run'?loopAdvance(name,clamp(stride(name),.35,ctx.polish?2.7:2.1)):name==='walk'?loopAdvance(name,clamp(stride(name),.4,2.2)):loopAdvance(name,1);
  if(plan.mode==='v8'){out.full=[plan.full,plan.t];return out;}
  if(plan.mode==='v8layer'){const l='lower:'+plan.lower;out.upper=['upper:'+plan.upper,plan.t];out.lower=[l,plan.lower==='run'||plan.lower==='walk'?locomotion(plan.lower):loopAdvance(l,1)];return out;}
  if(plan.full){
   const n=plan.full,d=duration(n);let t;
   if(plan.mode==='shoot'){
    const meta2=assets.engineAnim?.[p.shotType==='ft'?'freethrow':p.shotType==='dunk'?'layup':p.shotType];
    t=shotClipTime(meta[n],d,p.actT||0,!!p.hasBall,releaseAt,meta2&&{release:meta2.release*(p.shotType==='dunk'?.92:1),duration:meta2.duration});
   }else if(plan.mode==='fake')t=d*.34*Math.sin(Math.PI*clamp((p.actT||0)/.52,0,1));
   else if(plan.mode==='cross')t=Math.min(d-.001,(p.actT||0)*d/.55);
   else if(plan.mode==='spin')t=Math.min(d-.001,(p.actT||0)*d/.75);
   else if(plan.mode==='steal')t=Math.min(d-.001,(p.actT||0)*1.9);
   else if(plan.mode==='air')t=Math.min(d-.001,.25+((p.actT||0)<.75?(p.actT||0)/.75*.85:.85+((p.actT||0)-.75)));
   else if(n==='fall')t=Math.min(d-.001,stumbleT);
   else if(plan.mode==='hint')t=Math.min(d-.001,hintAge);
   else if(n==='run'||n==='walk')t=locomotion(n);
   else if(plan.mode==='stance')t=loopAdvance(n,.12);
   else if(n==='defense_shuffle')t=loopAdvance(n,clamp(speed/1.5,.5,2));
   else t=loopAdvance(n,1);
   out.full=[n,t];
  }else{
   const u='upper:'+plan.upper,l='lower:'+plan.lower;
   out.upper=[u,plan.upper.startsWith('dribble')?loopAdvance(u,clamp(.75+speed/6,.8,1.5)):loopAdvance(u,1)];
   out.lower=[l,plan.lower==='run'||plan.lower==='walk'?locomotion(plan.lower):loopAdvance(l,1)];
  }
  return out;
 }
 let hintAge=0,strideSpeed=0,leanNow=0;
 root.rotation.order='YXZ';
 const guard=createDribbleGuard(),v8s={releasedAt:null,passClip:null,recvClip:null,recvSince:null},v8pack=assets.v8||null;
 const av={root,hands,mixer,actions,mats,card,kind:'v7',role,scale,dribblePump:0,dribbleCtx:null,
  applyKit(kit){
   const primary=new THREE.Color(kit.base||'#5b38c9'),accent=new THREE.Color(kit.accent||'#f4d377'),secondary=kit.shorts?new THREE.Color(kit.shorts):primary.clone().multiplyScalar(.62);
   const paint={primary,secondary,trim:accent};
   for(const {attr,ranges} of Object.values(colorAttrs)){
    for(const [part,[start,count]] of Object.entries(ranges)){const c=paint[part];if(!c)continue;for(let i=start;i<start+count;i++)attr.setXYZ(i,c.r,c.g,c.b);}
    attr.needsUpdate=true;
   }
  },
  event(e){
   const type=typeof e==='string'?e:e?.type;
   if(type==='score'||type==='result_success'){hint='celebrate';hintTime=duration('celebrate');hintAge=0;}
   else if(type==='catch'||type==='interception')catchUntil=performance.now()+420;
  },
  get motionState(){return state;},
  get dribbleLocked(){return guard.locked;},
  get motionPhase(){return statePhase;},
  dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);for(const m of mats)m.dispose();},
 };
 av.pose=function(p,ctx={},dt){
  if(!(dt>0))return;dt=Math.min(.05,dt);
  const speed=Math.hypot(p.vx||0,p.vz||0);
  hintTime-=dt;hintAge+=dt;if(hintTime<=0)hint=null;
  if(hint==='celebrate'&&(p.act||p.stumble))hint=null;
  if(p.stumble)stumbleT+=dt;else stumbleT=0;
  if(!hint&&!p.act&&!p.hasBall&&lastSpeed>2&&speed<.45){hint='decelerate';hintTime=duration('decelerate')*.7;hintAge=0;}
  if(hint==='decelerate'&&speed>1.2)hint=null;
  if(wasBall&&!p.hasBall&&p.act==='shoot')releaseAt=p.actT;
  if(p.act!=='shoot')releaseAt=p.act==='shoot'?releaseAt:null;
  const catching=ctx.catching||performance.now()<catchUntil;
  if(ctx.polish){
   // the stride follows the speed the feet really cover (a short low-pass: the engine's velocity steps with the tick), and the body leans
   // into an acceleration and back into a braking: forward up to 0.11 rad, back up to 0.07 (about 5 cm of head travel per 0.03 rad)
   strideSpeed+=(speed-strideSpeed)*(1-Math.exp(-dt/.05));
   const accel=(speed-lastSpeed)/dt,want=clamp(accel*.012+Math.min(.04,speed*.007),-.07,.11);
   leanNow+=(want-leanNow)*(1-Math.exp(-dt/.12));root.rotation.x=leanNow;
  }else{strideSpeed=speed;if(root.rotation.x)root.rotation.x=0;}
  guard.observe(p);
  let plan=guard.filter(chooseV7Motion(p,{...ctx,catching},hint));
  if(v8pack){
   const o=chooseV8Motion(v8pack,p,{...ctx,catching},v8s,dt);
   // polish (07/11): the moving reception takes the arms of the clip over the legs of the run: the clip's own legs travel 0.95 m on the spot (55 cm of slide)
   if(o&&ctx.polish&&o.full==='v8:receive_moving'&&actions['upper:v8:receive_moving'])plan={upper:'v8:receive_moving',lower:speed>.4?'run':'idle',mode:'v8layer',t:o.t};
   else if(o)plan=o;
  }
  // weights: layers cross-fade with the same time constant; full-body and layered poses sum to one per track
  const mixTarget=plan.full?1:0;cur.mix+=(mixTarget-cur.mix)*(1-Math.exp(-dt/.075));
  const times=clipTime(plan,p,ctx,dt,speed);
  const sF=target(cur.full,plan.full||null,1,dt),sU=target(cur.upper,plan.upper?'upper:'+plan.upper:null,1,dt),sL=target(cur.lower,plan.lower?'lower:'+plan.lower:null,1,dt);
  for(const name in actions)actions[name].setEffectiveWeight(0);
  if(sF>0)for(const [n,w] of Object.entries(cur.full)){const a=actions[n];if(!a)continue;a.setEffectiveWeight(w/sF*cur.mix);}
  if(sU>0)for(const [n,w] of Object.entries(cur.upper)){const a=actions[n];if(a)a.setEffectiveWeight(w/sU*(1-cur.mix));}
  if(sL>0)for(const [n,w] of Object.entries(cur.lower)){const a=actions[n];if(a)a.setEffectiveWeight(w/sL*(1-cur.mix));}
  for(const key of ['full','upper','lower']){const t=times[key];if(t&&actions[t[0]])actions[t[0]].time=t[1];}
  // actions fading out keep their last time; the clip being played sets the reported state and phase
  const main=times.full||times.upper;
  if(main){state=main[0].replace(/^(upper|lower):/,'');const d=duration(main[0].replace(/^(upper|lower):/,''))||1,t=main[1]/d%1;
   // the ball view expects the floor at u = .42 of the cycle; the dribble clip's floor contact is at .5
   statePhase=/dribble/.test(state)?(t<.5?t*.42/.5:.42+(t-.5)*.58/.5):t;}
  mixer.update(0);
  // arm reach: pass wind-up / release and the hands going out to an incoming ball
  const rw={l:0,r:0},ball=ctx.ball;
  root.updateMatrixWorld(true);
  if(p.act==='pass'&&plan.mode!=='v8'){
   const t=p.actT||0,k=smooth((t-.06)/.2),kind=p.passKind||ctx.passKind||'chest',high=kind==='lob'||kind==='overhead'||kind==='jump',low=kind==='bounce';
   rw.l=rw.r=k*(t<.5?1:smooth(1-(t-.5)/.25));
   fwd.set(Math.sin(p.face),0,Math.cos(p.face));sideV.crossVectors(up,fwd).normalize();
   const chestY=bones.Chest.getWorldPosition(wristWorld).y;
   for(const key of ['l','r']){
    const sgn=key==='l'?1:-1;
    bones.Chest.getWorldPosition(goal);
    goal.addScaledVector(fwd,.18+.42*k).addScaledVector(sideV,sgn*.1);
    goal.y=chestY+(high?.38*k:low?-.42*k:.02);
    reachTo(key,goal,rw[key]);
   }
   rw.l=rw.r=0;
  }else if(catching&&plan.mode!=='v8'&&!p.hasBall&&ball&&Number.isFinite(ball.x)){
   const d=Math.hypot(ball.x-p.x,ball.z-p.z),w=smooth(1-(d-.4)/2.6);
   for(const key of ['l','r']){
    const sgn=key==='l'?1:-1;goal.set(ball.x,Math.max(.5,ball.y),ball.z);fwd.set(Math.sin(p.face),0,Math.cos(p.face));sideV.crossVectors(up,fwd).normalize();goal.addScaledVector(sideV,sgn*.08);
    reachTo(key,goal,w*.9);
   }
  }
  lastSpeed=speed;wasBall=p.hasBall;lastAct=p.act;
 };
 /** Put the palm (not the wrist) of arm `key` at the world goal with weight w. */
 function reachTo(key,worldGoal,w){
  if(w<=.001)return;const [u,l,h]=armBones[key],palm=hands[key];
  h.getWorldPosition(wristWorld);palm.getWorldPosition(palmWorld);
  const wristGoal=reachGoal.copy(worldGoal).sub(palmWorld).add(wristWorld);
  reachArm(u,l,h,wristGoal,w);root.updateMatrixWorld(true);
 }
 // the team's own colours from the first frame (the kit picker may repaint them later through applyKit)
 if(teamLook)av.applyKit({base:teamLook.primary,accent:teamLook.trim||teamLook.secondary,shorts:teamLook.shortsBase});
 return av;
}
