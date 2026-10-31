/** Presentation-only motion2 adapter. The engine owns position, yaw, jumping,
 * possession, releases and results; no authored marker is sent to the engine. */
import * as THREE from '../vendor/three.module.js';
import {Retargeter} from '../design/viewer/retarget.js';
import {sample,smooth} from '../design/viewer/animation.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const components=['getX','getY','getZ','getW'];
function attributeCompatibility(geometry){for(const attribute of Object.values(geometry.attributes))if(!attribute.getComponent)Object.defineProperty(attribute,'getComponent',{value:function(index,component){return this[components[component]](index);}});return geometry;}
export const V2_ACTION_CLIPS=Object.freeze(['celebration','crossover','defensive_run','defensive_slide','defensive_slide_right','defensive_switch','dribble_fast','dribble_slow','dunk','free_throw','jump_block','layup_left','layup_right','pass_chest','pass_overhead','rebound','receive','screen','shot_fake','spin','sprint','sprint_ball','steal_fail','steal_success','step_back']);
const BASE_CLIPS=['idle','run','decelerate','turn_left','turn_right','shoot','catch','celebrate','fall','recover'];
function supportWindows(state,seconds){
 const duration=state.durationSeconds,absolute=state.loop?Math.max(0,seconds)/duration:clamp(seconds/duration,0,1),ramp=.06/duration,out=[];
 for(const c of state.supportContacts||[])for(const cycle of state.loop?[Math.floor(absolute)-1,Math.floor(absolute),Math.floor(absolute)+1]:[0]){
  const start=cycle+c.startTime,end=cycle+c.endTime;if(absolute<start-ramp||absolute>end+ramp)continue;
  const weight=absolute<start?smooth((absolute-start+ramp)/ramp):absolute>end?1-smooth((absolute-end)/ramp):1,contact={bone:c.bone,weight,contactKey:`${c.bone}:${cycle}:${c.startTime}`},previous=out.findIndex(p=>p.bone===c.bone);
  if(previous<0)out.push(contact);else if(weight>out[previous].weight)out[previous]=contact;
 }return out;
}

/** Keep the exact source soles, but use a small skin proxy for offline contact
 * verification. Never skin thousands of rendered vertices in the frame loop. */
function contactProxy(mesh){
 const g=mesh.geometry,a=g.attributes,keep=new Set(),groups=new Map();
 for(let i=0;i<a.position.count;i++){
  let joint=0,weight=-1;for(let k=0;k<4;k++){const w=a.skinWeight.getComponent(i,k);if(w>weight){joint=a.skinIndex.getComponent(i,k);weight=w;}}
  let group=groups.get(joint);if(!group)groups.set(joint,group=[]);group.push(i);
 }
 for(const rows of groups.values())for(let axis=0;axis<3;axis++){
  const sorted=[...rows].sort((x,y)=>a.position.getComponent(x,axis)-a.position.getComponent(y,axis));
  for(const index of [...sorted.slice(0,3),...sorted.slice(-3)])keep.add(index);
 }
 const indices=[...keep],proxy=new THREE.BufferGeometry();
 for(const name of ['position','skinIndex','skinWeight']){const attr=a[name],values=[];for(const i of indices)for(let k=0;k<attr.itemSize;k++)values.push(attr.getComponent(i,k));proxy.setAttribute(name,new THREE.Float32BufferAttribute(values,attr.itemSize));}
 return attributeCompatibility(proxy);
}

export async function bakeV2Motion(scene,rig,base,packages,map,onProgress){
 const states={...base.states};
 for(const p of packages)for(const [name,state] of Object.entries(p.states))states[name]=state;
 for(const name of V2_ACTION_CLIPS)if(!states[name])throw Error('Basketball motion2 clip missing: '+name);
 scene.traverse(o=>{if(o.isSkinnedMesh)attributeCompatibility(o.geometry);});
 const target=new Retargeter(scene,rig,base.skeleton,map),proof=target.proof();
 if(!proof.mappingComplete||proof.bindMaxTranslationErrorMeters>1e-5||proof.inverseBindMaxError>1e-5)throw Error('Basketball v2 rig does not match the verified retarget map');
 const originals=target.meshes.map(mesh=>({mesh,geometry:mesh.geometry}));
 for(const {mesh} of originals)mesh.geometry=contactProxy(mesh);
 for(const name of Object.keys(target.footVertices)){
  target.footVertices[name]=[];
  for(const {mesh} of originals){const joint=mesh.skeleton.bones.findIndex(b=>b.name===name),a=mesh.geometry.attributes;for(let i=0;i<a.position.count;i++){let weight=0;for(let k=0;k<4;k++)if(a.skinIndex.getComponent(i,k)===joint)weight+=a.skinWeight.getComponent(i,k);if(weight>.5)target.footVertices[name].push({mesh,index:i});}}
 }
 const clips=new Map(),entries=Object.entries(states);
 try{for(let index=0;index<entries.length;index++){
  const [name,state]=entries[index],times=new Set([0,state.durationSeconds]),count=Math.ceil(state.durationSeconds*30);
  for(let i=1;i<count;i++)times.add(i/count*state.durationSeconds);
  for(const event of state.events||[])times.add(event.atSeconds??event.time*state.durationSeconds);
  for(const c of state.supportContacts||[])for(const t of [c.startTime,c.endTime])times.add(t*state.durationSeconds);
  const timeline=[...times].sort((a,b)=>a-b),rotations=Object.fromEntries(rig.joints.map(j=>[j.name,[]])),positions={Root:[],Hips:[]};
  for(const time of timeline){
   const pose=sample(state,time,false);target.apply(pose,{referenceRoot:pose.referenceRootTranslationMeters,contacts:pose.contacts,floor:true});
   for(const j of rig.joints)target.bones[j.name].quaternion.toArray(rotations[j.name],rotations[j.name].length);
   const p=target.bones.Root.position,r=pose.referenceRootTranslationMeters;
   positions.Root.push(p.x-r[0]*map.motionScale,p.y-r[1]*map.motionScale,p.z-r[2]*map.motionScale);
   const hips=target.bones.Hips.position.clone();
   // Authored flight is a validation trajectory; the engine supplies vertical
   // world motion. Keep anticipation/crouch without adding a second jump.
   if(['dunk','layup_left','layup_right','jump_block','rebound'].includes(name))hips.y-=Math.max(0,pose.hipsOffsetMeters[1])*map.motionScale;
   hips.toArray(positions.Hips,positions.Hips.length);
  }
  const tracks=rig.joints.map(j=>new THREE.QuaternionKeyframeTrack(j.name+'.quaternion',timeline,rotations[j.name]));
  for(const n of Object.keys(positions))tracks.push(new THREE.VectorKeyframeTrack(n+'.position',timeline,positions[n]));
  clips.set(name,new THREE.AnimationClip(name,state.durationSeconds,tracks));onProgress?.((index+1)/entries.length);
  await new Promise(resolve=>setTimeout(resolve,0));
 }}finally{target.resetBind();for(const {mesh,geometry} of originals){mesh.geometry.dispose();mesh.geometry=geometry;}}
 return {clips,states,proof,motionScale:map.motionScale,sole:Object.fromEntries(Object.entries(target.sole).map(([n,v])=>[n,v.toArray()])),boneNames:rig.joints.map(j=>j.name)};
}

/** Pure selection is also the reachability contract for all 25 new clips. */
export function chooseV2Motion(p,ctx={},hint=null){
 const speed=Math.hypot(p.vx||0,p.vz||0),face=p.face||0,fwd=(p.vx||0)*Math.sin(face)+(p.vz||0)*Math.cos(face),lat=(p.vx||0)*Math.cos(face)-(p.vz||0)*Math.sin(face);
 if(p.stumble)return 'fall';
 if(p.act==='fake')return 'shot_fake';
 if(p.act==='cross')return 'crossover';if(p.act==='spin')return 'spin';
 if(p.act==='shoot')return p.shotType==='dunk'?'dunk':p.shotType==='ft'?'free_throw':p.shotType==='layup'?(ctx.layupSide==='left'||ctx.layupSide==null&&(p.z||0)<0?'layup_left':'layup_right'):'shoot';
 if(p.act==='pass')return ctx.passKind==='lob'||ctx.passKind==='overhead'||hint==='pass_overhead'?'pass_overhead':'pass_chest';
 if(p.act==='block')return 'jump_block';if(p.act==='rebound')return 'rebound';
 if(p.act==='steal')return hint==='steal_success'?'steal_success':'steal_fail';
 if(hint&&(V2_ACTION_CLIPS.includes(hint)||BASE_CLIPS.includes(hint)))return hint;
 if(ctx.catching)return 'receive';
 if((ctx.screen||p.role==='screen')&&speed<.7)return 'screen';
 if(p.hasBall){if(ctx.dribbling===false)return 'receive';if(fwd<-.5&&speed<3)return 'step_back';if(p.sprinting||speed>5.4)return 'sprint_ball';return speed>2.3?'dribble_fast':'dribble_slow';}
 if(ctx.defending&&speed>.45){if(Math.abs(lat)>Math.abs(fwd)*.8)return lat>0?'defensive_slide':'defensive_slide_right';return 'defensive_run';}
 if(speed>4.7||p.sprinting)return 'sprint';return speed>.4?'run':'idle';
}

/** Engine time is mapped around the matching visual release. A held charge
 * stays before contact; a shot cannot visually release while still owned. */
export function actionClipTime(state,name,p,ctx,engineAnim,releaseAt){
 const duration=state.durationSeconds,t=p.actT||0;
 if(p.act==='shoot'){
  const meta=engineAnim?.[p.shotType==='ft'?'freethrow':p.shotType==='dunk'?'layup':p.shotType]||{release:.8,duration:1.5};
  const marker=(state.events||[]).find(e=>/visual_(dunk|layup|shot)_release|visual_contact/.test(e.name)),contact=marker?.atSeconds??(marker?.time??.5)*duration;
  const engineRelease=meta.release*(p.shotType==='dunk'?.92:1);
  return p.hasBall?Math.min(contact-.012,t/Math.max(.01,engineRelease)*contact):Math.min(duration,contact+Math.max(0,t-(releaseAt??engineRelease))*(duration-contact)/Math.max(.1,meta.duration-engineRelease));
 }
 if(p.act==='pass'){const marker=state.events.find(e=>/pass_release/.test(e.name));return Math.min(duration,t*(marker?.atSeconds||duration*.47)/.16);}
 if(p.act==='fake')return Math.min(duration,t*duration/.52);
 if(p.act==='cross'||p.act==='spin')return Math.min(duration,t*duration/(p.act==='spin'?.75:.55));
 if(p.act==='steal')return Math.min(duration,t*duration/.4);
 if(p.act==='block'||p.act==='rebound')return Math.min(duration,t*duration/.9);
 return null;
}

function solvePlantedFoot(root,bones,sole,name,anchor,weight){
 const side=name.startsWith('Left')?'Left':'Right',upper=bones[side+'UpLeg'],lower=bones[side+'Leg'],foot=bones[name];
 root.updateMatrixWorld(true);
 const hip=upper.getWorldPosition(new THREE.Vector3()),knee=lower.getWorldPosition(new THREE.Vector3()),ankle=foot.getWorldPosition(new THREE.Vector3()),orientation=foot.getWorldQuaternion(new THREE.Quaternion());
 const point=foot.localToWorld(new THREE.Vector3().fromArray(sole)),drift=point.distanceTo(anchor),release=1-smooth((drift-.06)/.18);weight*=release;
 if(weight<=.001)return false;
 const goal=point.lerp(anchor,weight).sub(new THREE.Vector3().fromArray(sole).multiply(root.scale).applyQuaternion(orientation));
 const l1=hip.distanceTo(knee),l2=knee.distanceTo(ankle),dir=goal.clone().sub(hip),dist=dir.length();
 // A late rendered frame, engine teleport, or fast turn can invalidate a plant.
 // Never pull a leg horizontally toward an unreachable historical world point.
 if(dist>(l1+l2)*1.015||dist<1e-6)return false;dir.divideScalar(dist);
 const d=clamp(dist,Math.abs(l1-l2)+1e-6,l1+l2-1e-6),pole=knee.clone().sub(hip);pole.addScaledVector(dir,-pole.dot(dir));if(pole.lengthSq()<1e-9)pole.set(0,0,1).addScaledVector(dir,-dir.z);pole.normalize();
 const along=(l1*l1-l2*l2+d*d)/(2*d),newKnee=hip.clone().addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
 const setWorld=(bone,q)=>{bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateMatrixWorld(true);};
 setWorld(upper,new THREE.Quaternion().setFromUnitVectors(knee.sub(hip).normalize(),newKnee.sub(hip).normalize()).multiply(upper.getWorldQuaternion(new THREE.Quaternion())));
 const currentKnee=lower.getWorldPosition(new THREE.Vector3()),currentAnkle=foot.getWorldPosition(new THREE.Vector3());
 setWorld(lower,new THREE.Quaternion().setFromUnitVectors(currentAnkle.sub(currentKnee).normalize(),hip.addScaledVector(dir,d).sub(currentKnee).normalize()).multiply(lower.getWorldQuaternion(new THREE.Quaternion())));setWorld(foot,orientation);return true;
}

export function createV2MotionPlayer(root,assets){
 const bones={};root.traverse(o=>{if(o.isBone)bones[o.name]=o;});
 const entries=[...assets.clips].map(([name,clip])=>[name,clip.tracks.map(t=>({bone:bones[t.name.split('.')[0]],property:t.name.split('.')[1],size:t.getValueSize(),interpolant:t.createInterpolant()}))]),tracks=new Map(entries),names=assets.boneNames;
 const mixer=new THREE.AnimationMixer(root),actions=Object.fromEntries([...assets.clips].map(([n,c])=>[n,mixer.clipAction(c)]));
 let state='idle',time=0,elapsed=1,fadeSeconds=.18,hint=null,hintTime=0,lastAct='',lastActT=0,releaseAt=null,previousDt=1/60,sourceDt=1/60,wasBall=false,lastSpeed=0,lastFace=null,lastStumble=false;
 const lastWorldPosition=root.position.clone();let positioned=false;
 const identity=new THREE.Quaternion(),current=names.map(n=>({q:bones[n].quaternion.clone(),p:bones[n].position.clone()})),previous=current.map(p=>({q:p.q.clone(),p:p.p.clone()})),source=current.map(p=>({q:p.q.clone(),p:p.p.clone(),delta:new THREE.Quaternion(),velocity:new THREE.Vector3(),workQ:new THREE.Quaternion(),targetQ:new THREE.Quaternion(),targetP:new THREE.Vector3()})),held=new Map();
 function event(e){
  const type=typeof e==='string'?e:e?.type;
  const target=({result_success:'celebration',score:'celebrate',steal:'steal_success',stealMiss:'steal_fail',catch:'receive',interception:'catch',control:'defensive_switch',switch:'defensive_switch',screen:'screen',step_back:'step_back'})[type]||(assets.states[type]?type:null);
  if(type==='pass'||type==='passStart'){hint=e.kind==='lob'||e.kind==='overhead'?'pass_overhead':'pass_chest';hintTime=.85;return;}
  if(target){hint=target;hintTime=assets.states[target].durationSeconds;}
 }
 function transition(next){
  const outgoing=assets.states[state];held.clear();
  if(outgoing)for(const c of supportWindows(outgoing,time))if(c.weight>.05&&assets.sole[c.bone])held.set(c.bone,{anchor:bones[c.bone].localToWorld(new THREE.Vector3().fromArray(assets.sole[c.bone])),key:null,weight:c.weight});
  for(let i=0;i<names.length;i++){source[i].q.copy(current[i].q);source[i].p.copy(current[i].p);source[i].delta.copy(previous[i].q).invert().multiply(current[i].q);if(source[i].delta.w<0)source[i].delta.set(-source[i].delta.x,-source[i].delta.y,-source[i].delta.z,-source[i].delta.w);source[i].velocity.copy(current[i].p).sub(previous[i].p).divideScalar(Math.max(.004,previousDt));}
  sourceDt=previousDt;state=next;time=0;elapsed=0;fadeSeconds=assets.states[state].transitionRecommendations?.entry?.visualBlendSeconds||.18;releaseAt=null;
 }
 function step(p,ctx={},dt){
  if(!(dt>0))return;dt=Math.min(.05,dt);hintTime-=dt;if(hintTime<=0)hint=null;
  const speed=Math.hypot(p.vx||0,p.vz||0),turn=lastFace==null?0:((p.face-lastFace+Math.PI*3)%(Math.PI*2))-Math.PI;
  if(!p.act&&!hint){const natural=lastStumble&&!p.stumble?'recover':!p.hasBall&&lastSpeed>1.5&&speed<.45?'decelerate':!p.hasBall&&!ctx.defending&&speed>.7&&Math.abs(turn)>.1?(turn>0?'turn_left':'turn_right'):null;if(natural){hint=natural;hintTime=assets.states[natural].durationSeconds;}}
  let next=chooseV2Motion(p,ctx,hint);if(!tracks.has(next))next='idle';
  if(next!==state||p.act&&p.act===lastAct&&(p.actT||0)<lastActT-.02)transition(next);
  const data=assets.states[state],stride=data.referenceLocomotion?.speedMetersPerSecond*assets.motionScale*root.scale.y,rate=stride?clamp(speed/stride,.2,4):1;
  const distance=positioned?Math.hypot(root.position.x-lastWorldPosition.x,root.position.z-lastWorldPosition.z):speed*dt;
  // Engine displacement, rather than capped presentation dt, advances strides.
  // This keeps feet and simulation together when rasterisation misses a frame.
  time+=stride?Math.min(distance/stride,.75):dt*rate;lastWorldPosition.copy(root.position);positioned=true;if(wasBall&&!p.hasBall&&p.act==='shoot')releaseAt=p.actT;
  const synced=actionClipTime(data,state,p,ctx,assets.engineAnim,releaseAt);if(synced!=null)time=synced;
  const t=data.loop?time%data.durationSeconds:Math.min(time,data.durationSeconds),blend=smooth(elapsed/fadeSeconds);
  for(let i=0;i<names.length;i++){previous[i].q.copy(current[i].q);previous[i].p.copy(current[i].p);}
  for(const track of tracks.get(state)){const values=track.interpolant.evaluate(t);if(track.property==='quaternion')track.bone.quaternion.fromArray(values);else track.bone.position.fromArray(values);}
  if(blend<1)for(let i=0;i<names.length;i++){
   const b=bones[names[i]],s=source[i];s.targetQ.copy(b.quaternion);s.targetP.copy(b.position);s.workQ.slerpQuaternions(identity,s.delta,Math.min(elapsed,.1)/Math.max(.004,sourceDt));
   b.quaternion.copy(s.q).multiply(s.workQ).slerp(s.targetQ,blend);b.position.copy(s.p).addScaledVector(s.velocity,Math.min(elapsed,.1)).lerp(s.targetP,blend);
  }
  // Carry outgoing world plants after mixing. Release on the authored stance
  // end; the analytic solver adjusts only the leg, never engine world motion.
  const contacts=held.size?supportWindows(data,time):[];
  for(const [name,lock] of held){const c=contacts.find(c=>c.bone===name);if(c&&lock.key==null)lock.key=c.contactKey;const matching=c&&c.contactKey===lock.key,weight=matching?c.weight:(1-blend)*lock.weight;let valid=true;if(weight>.001&&!p.air)valid=solvePlantedFoot(root,bones,assets.sole[name],name,lock.anchor,weight);if(!valid||weight<=.001||!matching&&blend===1)held.delete(name);}
  for(let i=0;i<names.length;i++){current[i].q.copy(bones[names[i]].quaternion);current[i].p.copy(bones[names[i]].position);}
  elapsed+=dt;previousDt=dt;lastAct=p.act;lastActT=p.actT||0;wasBall=p.hasBall;lastSpeed=speed;lastFace=p.face;lastStumble=p.stumble;
 }
 return {step,event,mixer,actions,get state(){return state;},get time(){return time;},get phase(){return time/assets.states[state].durationSeconds%1;},dispose(){held.clear();mixer.stopAllAction();mixer.uncacheRoot(root);}};
}
