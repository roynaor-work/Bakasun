/** Cached skeletal clips: the verified design retargeter runs at load, never in the frame loop.
 * Simulation owns world motion, release, possession and score. Reference locomotion is baked
 * for contact solving then removed from Root; animation markers never call the engine. */
import * as THREE from '../vendor/three.module.js';
import {Retargeter} from '../design/viewer/retarget.js';
import {sample,eligible} from '../design/viewer/animation.js';

export async function bakeHoopsMotion(scene,rig,motion,map){
 const target=new Retargeter(scene,rig,motion.skeleton,map),clips=new Map();
 const proof=target.proof();
 if(!proof.mappingComplete||proof.bindMaxTranslationErrorMeters>1e-5||proof.inverseBindMaxError>1e-5)throw Error('Hoops character bind does not match retarget map');
 for(const [name,state] of Object.entries(motion.states)){
  const times=[],rotations=Object.fromEntries(rig.joints.map(j=>[j.name,[]])),positions={Root:[],Hips:[]};
  const count=Math.max(2,Math.ceil(state.durationSeconds*60));
  for(let i=0;i<=count;i++){
   const t=i/count*state.durationSeconds,pose=sample(state,t,false);
   target.apply(pose,{referenceRoot:pose.referenceRootTranslationMeters,contacts:pose.contacts,floor:true});
   times.push(t);
   for(const j of rig.joints)target.bones[j.name].quaternion.toArray(rotations[j.name],rotations[j.name].length);
   const root=target.bones.Root.position,ref=pose.referenceRootTranslationMeters;
   positions.Root.push(root.x-ref[0]*map.motionScale,root.y-ref[1]*map.motionScale,root.z-ref[2]*map.motionScale);
   target.bones.Hips.position.toArray(positions.Hips,positions.Hips.length);
  }
  const tracks=rig.joints.map(j=>new THREE.QuaternionKeyframeTrack(j.name+'.quaternion',times,rotations[j.name]));
  for(const n of Object.keys(positions))tracks.push(new THREE.VectorKeyframeTrack(n+'.position',times,positions[n]));
  clips.set(name,new THREE.AnimationClip(name,state.durationSeconds,tracks));
  // Let loading progress and cancellation paint between clips.
  await new Promise(r=>setTimeout(r,0));
 }
 target.resetBind();return {clips,motion,proof,motionScale:map.motionScale};
}

export function createMotionMachine(root,assets){
 const mixer=new THREE.AnimationMixer(root),actions={};
 for(const [name,clip] of assets.clips){const a=mixer.clipAction(clip);if(!assets.motion.states[name].loop){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;}actions[name]=a;}
 let state=assets.motion.initialState,time=0,lastAct='',lastFace=null,lastCatch=false,finished=false,shotRelease=null;
 let active=actions[state];active.play();
 function event(events){
  const tr=eligible(assets.motion,state,events);if(!tr)return false;
  const next=actions[tr.target];next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
  active.crossFadeTo(next,tr.visualBlendSeconds,false);active=next;state=tr.target;time=0;finished=false;return true;
 }
 function step(p,ctx,dt){
  const speed=Math.hypot(p.vx,p.vz),moving=speed>.4;
  const events=[];
  if(p.stumble&&!lastAct.startsWith('stumble'))events.push('fall_confirmed');
  else if(state==='fall'&&!p.stumble&&time>=assets.motion.states.fall.durationSeconds)events.push('recovery_allowed');
  if((p.act==='shoot'||p.act==='pass'||p.act==='block'||p.act==='rebound')&&(p.act!==lastAct||!['shoot','fall','recover'].includes(state)))events.push('action');
  if(ctx.catching&&!lastCatch)events.push('receive');
  if(!moving)events.push(state==='run'?'slowing':'stopped');else events.push('moving');
  if(lastFace!=null&&state==='run'&&moving){const d=((p.face-lastFace+Math.PI*3)%(Math.PI*2))-Math.PI;if(Math.abs(d)>.18)events.push(d>0?'turn_left':'turn_right');}
  const clip=assets.motion.states[state];
  if(!clip.loop&&time>=clip.durationSeconds&&!finished){finished=true;events.push(moving?'clip_finished_and_moving':'clip_finished_and_stopped','clip_finished');}
  event(events);
  // No wall clock catch-up. Locomotion follows simulation speed; actions keep engine time.
  const strideSpeed=(assets.motion.states.run.referenceLocomotion?.speedMetersPerSecond||2.2)*assets.motionScale*root.scale.y;
  const rate=state==='run'?THREE.MathUtils.clamp(speed/strideSpeed,.25,4.5):1;
  active.setEffectiveTimeScale(rate);time+=dt*rate;
  if(state==='shoot'&&p.act==='shoot'){
   if(lastAct!=='shoot')shotRelease=null;
   const meta=assets.engineAnim?.[p.shotType==='ft'?'freethrow':p.shotType==='dunk'?'layup':p.shotType]||{release:.8,duration:1.5};
   const contact=assets.motion.states.shoot.events.find(e=>e.name==='visual_contact')?.atSeconds||.42;
   const release=meta.release*(p.shotType==='dunk'?.92:1),duration=assets.motion.states.shoot.durationSeconds;
   if(!p.hasBall&&shotRelease==null)shotRelease=p.actT;
   time=p.hasBall?Math.min(contact-.015,p.actT/release*contact):Math.min(duration,contact+Math.max(0,p.actT-shotRelease)*(duration-contact)/Math.max(.1,meta.duration-release));
   active.time=time;active.setEffectiveTimeScale(0);
  }
  mixer.update(dt);
  lastAct=p.stumble?'stumble':p.act;lastFace=p.face;lastCatch=ctx.catching;
 }
 return {mixer,actions,step,event,get state(){return state;},dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);}};
}
