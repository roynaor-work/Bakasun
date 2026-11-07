import * as T from '../vendor/three.module.js';
import {cloneSoccerRig} from './soccer-rig.mjs';
import {createSoccerDesignLoader} from './soccer-design-loader.mjs';
import {loadSoccerRestartMotion} from './soccer-athlete-motion.mjs';
import {soccerMetreScale,createSoccerCharacterLod} from './soccer-scale.mjs';
import {regionForTriangle} from '../design/variants/apply-variant.js';
import {armSwingPose,armSwingState,createArmSwingApplier} from './soccer-arm-swing.mjs';
import {soccerMotionV9Enabled,armStandPose,armStandState,armStandWeight,slideRecoverTime} from './soccer-motion-v9.mjs';
import {soccerV7ClipsUrl,soccerV7Url,SOCCER_V7_FILES,soccerV7Map,soccerV7Rig,validateSoccerV7Bind,soccerV7Variation,joinSoccerV7Meshes,applySoccerV7HueShift,SOCCER_V7_KEEPER_HUE} from './soccer-v7.mjs';
import {soccerMotionV10Enabled,soccerV10ClipsUrl,soccerV10States,SOCCER_V10_IDLES,soccerRunLadder,soccerV10CutClip,SOCCER_V10_CUT_MIN_SPEED,SOCCER_V10_CUT_MIN_STEP,soccerV10FirstTouchClip,soccerV10Held,soccerMotionLoadSummary,soccerCodexRunEnabled,SOCCER_CODEX_RUN_LADDER,SOCCER_CODEX_RUN_BOUNDS,soccerCodexMotionEnabled,soccerCodexClipsUrl,soccerCodexStates,soccerLadderRung,SOCCER_CODEX_LADDER,SOCCER_CODEX_BOUNDS,soccerCodexKickClip,soccerCodexKeeperCatch,soccerCodexNextIdle,soccerCodexIdleHold,SOCCER_CODEX_IDLES,SOCCER_CODEX_CELEBRATIONS,soccerCodexHeld,SOCCER_CODEX_BRAKE_FROM} from './soccer-codex-motion.mjs';
import {soccerV8Enabled,soccerV8ClipsUrl,soccerV8States,soccerV8KickClip,soccerV8DiveClip,soccerV8DivePlan} from './soccer-v8.mjs';
import {soccerCharacterSet,SOCCER_V5_FILES,SOCCER_V5_REGIONS,SOCCER_V5_RIG_URL,soccerV5Url,soccerV5Map,assignSoccerV5Regions} from './soccer-v5.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const Q=a=>new T.Quaternion().fromArray(a).normalize();
const asset=path=>new URL(`../design/${path}`,import.meta.url).href;
/** Mobile networks drop single requests; one failure must not demote a whole match
 * to the fallback figures. Three attempts with a short backoff, then a named error. */
export async function retrying(task,label,attempts=3){
  let error;
  for(let attempt=0;attempt<attempts;attempt++){
    try{return await task(attempt);}catch(e){error=e;if(attempt<attempts-1)await new Promise(r=>setTimeout(r,250*(attempt+1)));}
  }
  throw Error(`${label}: ${error?.message||error}`);
}
const json=path=>retrying(async()=>{const response=await fetch(asset(path));if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json();},`Soccer asset ${path}`);
const regions=['preserve','skin','hair','shirt','shorts','socks','shoes','soles','gloves','accent','equipment','helmet'];

function assignRegions(geometry,spec,map){
  const p=geometry.attributes.position,c=geometry.attributes.color,index=geometry.index,labels=new Uint8Array(p.count);
  for(let first=0;first<(index?.count||p.count);first+=3){
    const face=[0,1,2].map(k=>index?index.getX(first+k):first+k),centroid=[0,0,0];
    for(const vertex of face){centroid[0]+=p.getX(vertex)/3;centroid[1]+=p.getY(vertex)/3;centroid[2]+=p.getZ(vertex)/3;}
    const vertex=face[0],region=regionForTriangle([c.getX(vertex),c.getY(vertex),c.getZ(vertex)],centroid,spec,map.maxColorError),label=regions.indexOf(region);
    if(label<0)throw Error(`Unknown soccer character region ${region}`);
    for(const vertex of face)labels[vertex]=label;
  }
  geometry.setAttribute('soccerRegion',new T.BufferAttribute(labels,1));
}

function characterGeometry(source,palette){
  // Share positions, indices, normals and skin buffers between actors. Only
  // vertex colours vary; all actors still own independent skeleton matrices.
  const geometry=new T.BufferGeometry();geometry.setIndex(source.index);
  for(const [name,attribute]of Object.entries(source.attributes))geometry.setAttribute(name,name==='color'?attribute.clone():attribute);
  const colors=geometry.attributes.color,labels=geometry.attributes.soccerRegion;
  for(let vertex=0;vertex<colors.count;vertex++){
    const tint=palette[regions[labels.getX(vertex)]];if(tint)colors.setXYZ(vertex,tint.r,tint.g,tint.b);
  }
  geometry.boundingBox=source.boundingBox?.clone()||null;geometry.boundingSphere=source.boundingSphere?.clone()||null;
  return geometry;
}

function validateBind(source,rig) {
  const meshes=[];source.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
  for(const j of rig.joints) {
    const bone=source.getObjectByName(j.name);
    if(!bone?.isBone||bone.position.distanceTo(new T.Vector3().fromArray(j.translation))>1e-5||bone.quaternion.clone().normalize().angleTo(Q(j.rotation))>1e-5||bone.scale.distanceTo(new T.Vector3().fromArray(j.scale))>1e-5)throw Error(`Soccer GLB bind mismatch: ${j.name}`);
    for(const mesh of meshes) {
      const i=mesh.skeleton.bones.indexOf(bone);
      if(i<0||mesh.skeleton.boneInverses[i].elements.some((v,k)=>Math.abs(v-j.inverseBindMatrix[k])>1e-5))throw Error(`Soccer GLB inverse bind mismatch: ${j.name}`);
    }
  }
}

/** Compile the calibrated world-basis retarget once. Reference locomotion is
 * deliberately excluded: only the simulation may move a player in the world. */
export function compileSoccerDesignClips(data,rig,map) {
  const targets=new Map(map.bones.map(b=>[b.target,b]));
  if(targets.size!==rig.joints.length||data.skeleton.bones.some(b=>!map.bones.some(m=>m.source===b.name)))throw Error('Incomplete soccer retarget map');
  const clips=[];
  for(const [name,state] of Object.entries(data.states)) {
    const times=state.keyframes.map(k=>k.time*state.durationSeconds),values=Object.fromEntries(rig.joints.map(j=>[j.name,[]])),hips=[],root=[];
    for(const frame of state.keyframes) {
      const source={},world={};
      for(const b of data.skeleton.bones)source[b.name]=(b.parent?source[b.parent].clone():new T.Quaternion()).multiply(Q(frame.rotations[b.name]));
      for(const joint of rig.joints) {
        const entry=targets.get(joint.name);
        if(!entry||!source[entry.source||entry.inheritSource])throw Error(`Missing soccer target ${joint.name}`);
        world[joint.name]=source[entry.source||entry.inheritSource].clone().multiply(Q(entry.targetBasisWorldQuaternion));
        const local=joint.parent?world[joint.parent].clone().invert().multiply(world[joint.name]):world[joint.name].clone();
        // Keep adjacent keys on the same quaternion hemisphere for interpolation.
        const previous=values[joint.name],n=previous.length;
        if(n&&local.x*previous[n-4]+local.y*previous[n-3]+local.z*previous[n-2]+local.w*previous[n-1]<0)local.set(-local.x,-local.y,-local.z,-local.w);
        previous.push(local.x,local.y,local.z,local.w);
      }
      const h=rig.joints.find(j=>j.name==='Hips').translation,offset=frame.hipsOffsetMeters||[0,0,0];
      hips.push(...h.map((v,i)=>v+offset[i]*map.motionScale));
      root.push(0,0,0);
    }
    const tracks=rig.joints.map(j=>new T.QuaternionKeyframeTrack(`${j.name}.quaternion`,times,values[j.name]));
    tracks.push(new T.VectorKeyframeTrack('Hips.position',times,hips),new T.VectorKeyframeTrack('Root.position',times,root));
    const clip=new T.AnimationClip(name,state.durationSeconds,tracks);
    clip.userData={loop:state.loop};clips.push(clip);
  }
  return clips;
}

/** The lowest skinned vertex of a posed limb is always an extreme vertex of that
 * limb's bind-space hull. Keep, per bone, the vertices extremal along 26
 * directions (dominant weight), so the floor bake evaluates a few hundred
 * vertices per pose instead of every vertex (13,700 per character; measured
 * 01/11/2026: 4.3 s per character for 27 clips on desktop, 0.25 s with this). */
const floorCandidates=new WeakMap();
const hullDirections=[];
for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1])if(x||y||z){const l=Math.hypot(x,y,z);hullDirections.push([x/l,y/l,z/l]);}
export function soccerFloorCandidates(mesh){
  const cached=floorCandidates.get(mesh.geometry);if(cached)return cached;
  const geometry=mesh.geometry,position=geometry.attributes.position,skinIndex=geometry.attributes.skinIndex,skinWeight=geometry.attributes.skinWeight,count=position.count;
  const bones=mesh.skeleton.bones.length,best=new Int32Array(bones*hullDirections.length).fill(-1),bestDot=new Float64Array(bones*hullDirections.length).fill(-Infinity);
  const local=new T.Vector3(),toBone=mesh.skeleton.boneInverses.map(inverse=>new T.Matrix4().multiplyMatrices(inverse,mesh.bindMatrix));
  for(let i=0;i<count;i++){
    let bone=0,weight=-1;
    for(let k=0;k<4;k++){const w=skinWeight.getComponent(i,k);if(w>weight){weight=w;bone=skinIndex.getComponent(i,k);}}
    if(bone>=bones)continue;
    local.fromBufferAttribute(position,i).applyMatrix4(toBone[bone]);
    for(let d=0;d<hullDirections.length;d++){const dir=hullDirections[d],dot=local.x*dir[0]+local.y*dir[1]+local.z*dir[2],slot=bone*hullDirections.length+d;if(dot>bestDot[slot]){bestDot[slot]=dot;best[slot]=i;}}
  }
  const unique=new Set();for(const i of best)if(i>=0)unique.add(i);
  const candidates=Uint32Array.from(unique).sort((a,b)=>a-b);floorCandidates.set(geometry,candidates);return candidates;
}
/** Floor correction is baked at load time, never evaluated by CPU skinning in a
 * live frame. Each character asset can have its own sole/glove geometry. */
export function bakeSoccerDesignFloor(source,clips,{exhaustive=false}={}) {
  const bones={},meshes=[],saved=[];
  source.traverse(o=>{if(o.isBone){bones[o.name]=o;saved.push({bone:o,q:o.quaternion.clone(),p:o.position.clone()});}if(o.isSkinnedMesh)meshes.push(o);});
  const point=new T.Vector3(),out=[];
  source.updateMatrixWorld(true);
  const inverse=new T.Matrix4().copy(source.matrixWorld).invert();
  const samples=meshes.map(mesh=>exhaustive?null:soccerFloorCandidates(mesh));
  const minY=()=>{
    source.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();
    let low=Infinity;
    for(let m=0;m<meshes.length;m++){
      const mesh=meshes[m],candidates=samples[m],total=candidates?candidates.length:mesh.geometry.attributes.position.count;
      for(let k=0;k<total;k++){
        mesh.getVertexPosition(candidates?candidates[k]:k,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);low=Math.min(low,point.y);
      }
    }
    return low;
  };
  const bindLift=-minY();
  for(const input of clips) {
    const clip=input.clone(),positions=clip.tracks.find(t=>t.name==='Root.position');
    for(let key=0;key<positions.times.length;key++) {
      for(const track of clip.tracks) {
        const [name,property]=track.name.split('.');
        if(property==='quaternion')bones[name].quaternion.fromArray(track.values,key*4);
        else bones[name].position.fromArray(track.values,key*3);
      }
      positions.values[key*3+1]=Math.max(bindLift,-minY())+.002+(exhaustive?0:.0025);
    }
    clip.userData=input.userData;out.push(clip);
  }
  for(const {bone,q,p} of saved){bone.quaternion.copy(q);bone.position.copy(p);}source.updateMatrixWorld(true);
  return out;
}

/** Lightweight presentation state machine. Authored transitions determine fade
 * lengths; animation events never dispatch physics, ownership or scoring. */
/** GPT v7 speed ladder (clips are stride-matched to these speeds; all share the same foot phase:
 * left strike at 0, right strike at .5, so a rung change keeps the phase and the feet do not pop). */
export const SOCCER_V7_LADDER=Object.freeze([['run_1',1.6],['run_2',2.4],['run_3',3.2],['run_4',4.2],['run_5',5.4],['sprint',7.2]]);
export function soccerV7Rung(speed,current=-1){
  const bounds=SOCCER_V7_LADDER.slice(1).map((rung,i)=>(SOCCER_V7_LADDER[i][1]+rung[1])/2);
  let index=bounds.findIndex(b=>speed<b);if(index<0)index=bounds.length;
  // Hysteresis: stay on the current rung until the speed is clearly past the boundary.
  if(current>=0&&Math.abs(index-current)===1){const edge=bounds[Math.min(index,current)];if(Math.abs(speed-edge)<.25)index=current;}
  return index;
}
// v9: the aeroplane holds both arms straight out for 2.2 s, which Roy saw as a T-pose after a goal.
const SOCCER_V7_CELEBRATIONS=soccerMotionV9Enabled()?['celebrate_arms_up','celebrate_fist_pump','celebrate_victory_leap']:['celebrate_arms_up','celebrate_fist_pump','celebrate_victory_leap','celebrate_aeroplane'];
export function createSoccerDesignMotion(mixer,clips,data,config) {
  const actions=Object.fromEntries(clips.map(clip=>{
    const a=mixer.clipAction(clip);a.setLoop(data.states[clip.name].loop?T.LoopRepeat:T.LoopOnce,Infinity);a.clampWhenFinished=true;return [clip.name,a];
  }));
  // Codex v9: walk and jog replace the slowed-down runs of the v7 ladder when the library loaded.
  const codexRuns=Boolean(actions.v9_walk&&actions.v9_jog&&actions.v9_run&&actions.v9_sprint)&&soccerCodexRunEnabled(config),codex=codexRuns||Boolean(actions.v9_walk&&actions.v9_jog&&actions.run_4&&actions.run_5&&actions.sprint);
  const v10=codexRuns&&Boolean(actions.v10_run&&actions.v10_idle_relaxed),idles=v10?SOCCER_V10_IDLES:SOCCER_CODEX_IDLES,idleHome=v10?'v10_idle_relaxed':'v9_idle_relaxed';
  const ladderDef=codexRuns?soccerRunLadder(v10):codex?SOCCER_CODEX_LADDER:SOCCER_V7_LADDER,ladderBounds=codexRuns?SOCCER_CODEX_RUN_BOUNDS:codex?SOCCER_CODEX_BOUNDS:null;
  const ladder=ladderDef.map(([name])=>name),hasLadder=Boolean(actions.sprint&&actions.run_3)||codex,isLadder=name=>ladder.includes(name);
  let idleAge=0,cutAccum=0,touchTimer=0,recentSpeed=0;
  let rung=-1,state=data.initialState,previousMode=null,previousSpeed=0,previousYaw=null,kickTimer=0,stealTimer=0,lastTransition=null,slide=null,dive=null;
  /** Map the simulation's slide and recovery clocks onto the composite slide clip.
   * The slide part follows slideTime exactly; the fall and the getting up are
   * given the recovery plus `slideGraceSeconds` so they are not rushed, and keep
   * playing while the player stands still. Returns true when the timeline is over. */
  const slideTimeline=(p,mode,moving,dt)=>{
    const clip=data.states[slide.name],action=actions[slide.name],total=clip.durationSeconds,slideDur=clip.slideSeconds;
    let t=slide.time;
    if(mode==='slide'){t=Math.max(t,(1-clamp((p.slideTime||0)/slide.slideSeconds,0,1))*slideDur);}
    else if(mode==='recover'){
      if(slide.recoverSeconds===null){slide.recoverSeconds=Math.max(.05,p.recover||config.slide?.recoverSeconds||.6);slide.rate=Math.max(1,(total-slideDur)/(slide.recoverSeconds+(config.view.slideGraceSeconds??.35)));}
      const v9=soccerMotionV9Enabled()?slideRecoverTime(clip.parts,slide.recoverSeconds,1-clamp((p.recover||0)/slide.recoverSeconds,0,1)):null;
      t=v9!==null?Math.max(t,v9):Math.max(t,slideDur+(slide.recoverSeconds-clamp(p.recover||0,0,slide.recoverSeconds))*slide.rate);
    }
    else{
      // The simulation has released the player. Finish the getting up only while
      // they stand; the first step blends straight into locomotion.
      if(moving||t>=total-1e-5){slide=null;return true;}
      slide.follow=true;t=Math.min(total,t+dt*Math.max(1,slide.rate));
    }
    slide.time=t;action.stopFading().setEffectiveWeight(1).setEffectiveTimeScale(0);action.time=clamp(t,0,total);
    if(t>=total-1e-5&&mode!=='slide'&&mode!=='recover'){slide=null;return true;}
    return false;
  };
  const clean=[],boneByName={};let cleanSaved=false;
  mixer.getRoot().traverse(bone=>{if(bone.isBone){clean.push({bone,q:bone.quaternion.clone(),p:bone.position.clone()});boneByName[bone.name]=bone;}});
  // Procedural arm swing over the locomotion clips (see soccer-arm-swing.mjs).
  const standLayer={weight:0,breath:0},standPose={},standOn=soccerMotionV9Enabled();
  const arm={phase:0,weight:0,sprint:0,carry:0},armPose={},applyArms=createArmSwingApplier(T,mixer.getRoot(),boneByName);
  const LOCOMOTION=new Set(['run','dribble_run','turn_left','turn_right','decelerate']),ARM_PHASE={run:0,dribble_run:0}; // both authored cycles start with the left foot in front
  const updateMixer=dt=>{
    if(cleanSaved)for(const pose of clean){pose.bone.quaternion.copy(pose.q);pose.bone.position.copy(pose.p);}
    mixer.update(dt);for(const pose of clean){pose.q.copy(pose.bone.quaternion);pose.p.copy(pose.bone.position);}cleanSaved=true;
  };
  actions[state].play();
  const change=(name,event,force=false,{at=0,rate=1,fadeSeconds}={})=>{
    if(!actions[name]||name===state&&!force)return;
    const transition=data.transitions.find(t=>(t.source===state||t.source==='*')&&t.target===name&&(!event||t.on===event));
    const fade=fadeSeconds??transition?.visualBlendSeconds??.12;
    const outgoing=actions[state],incoming=actions[name];
    if(incoming!==outgoing)outgoing.fadeOut(fade);
    incoming.reset().setEffectiveWeight(1).setEffectiveTimeScale(rate);incoming.time=at;
    if(incoming!==outgoing)incoming.fadeIn(fade);incoming.play();
    state=name;lastTransition=event||name;
  };
  return {
    actions,/** Seconds into a state at which its authored ball contact happens (null if it has none). */contactTime(name){const st=data.states[name],c=st?.ballContacts?.find(c=>/strike|contact/.test(c.event));return c?c.time*st.durationSeconds:null;},get state(){return state;},get lastTransition(){return lastTransition;},get armSwing(){return arm;},get slide(){return slide?{name:slide.name,time:slide.time,rate:slide.rate,follow:slide.follow}:null;},
    update(p,s,animation,dt) {
      const restart=p.restartMotion;
      if(restart&&actions[restart.kind]){
        if(state!==restart.kind){for(const action of Object.values(actions))action.stopFading().setEffectiveWeight(0);change(restart.kind,'restart-action',true,{rate:0,fadeSeconds:0});}
        const action=actions[restart.kind];action.stopFading().setEffectiveWeight(1).setEffectiveTimeScale(0);action.time=clamp(restart.elapsed,0,data.states[restart.kind].durationSeconds);
        kickTimer=p.kickTime||0;stealTimer=p.stealTime||0;previousMode=animation.mode;
        updateMixer(0);return state;
      }
      if(dt<=0)return state;
      const speed=Math.hypot(p.vx,p.vz),yaw=Math.atan2(p.fx,p.fz),mode=animation.mode,turn=previousYaw===null?0:wrap(yaw-previousYaw);
      cutAccum=cutAccum*Math.exp(-dt/.2)+turn;recentSpeed=Math.max(speed,recentSpeed*Math.exp(-dt/.3));
      const moving=speed>(config.view.animation.idleSpeed||.2),edge=mode!==previousMode;
      const kick=(p.kickTime||0)>kickTimer+1e-6||(p.stealTime||0)>stealTimer+1e-6;
      if(slide&&state!==slide.name)slide=null;
      if(mode==='celebrate'&&edge){const variants=[...SOCCER_V7_CELEBRATIONS,...SOCCER_CODEX_CELEBRATIONS].filter(n=>actions[n]);change(variants.length?variants[(p.id||0)%variants.length]:'celebrate','result_success');}
      else if(mode==='slide'&&edge&&actions['slide-'+(p.slideKind||'straight')]){
        // One continuous authored timeline (slide, fall, get up) driven by the
        // simulation's own slide and recovery clocks; see slideTimeline().
        const name='slide-'+(p.slideKind||'straight');slide={name,kind:p.slideKind||'straight',time:0,slideSeconds:Math.max(.05,p.slideTime||config.slide?.seconds||.35),recoverSeconds:null,rate:1,follow:false};
        change(name,'fall_confirmed',true,{rate:0,fadeSeconds:.08});
      }
      else if(mode==='slide'&&edge){
        // The authored variant plays through the simulation's slide and the first
        // part of its recovery; the getting-up clip fills the remaining recovery.
        const kind=p.slideKind&&actions['slide_'+p.slideKind]?'slide_'+p.slideKind:'fall',clip=data.states[kind],total=Math.max(.2,(p.slideTime||0)+(config.slide?.variants?.[p.slideKind]?.recoverSeconds??config.slide?.recoverSeconds??.6)*.45);
        change(kind,'fall_confirmed',true,{rate:Math.max(1,clip.durationSeconds/total)});
      }
      else if(mode==='recover'&&edge&&slide&&state===slide.name){
        // A missed tackle continues on the miss timeline from the same instant.
        if(p.slideWon===false&&actions[slide.name+'-miss']){const name=slide.name+'-miss';change(name,'recovery_allowed',true,{rate:0,fadeSeconds:0});actions[name].time=slide.time;slide.name=name;}
      }
      else if(mode==='dive'&&edge){
        // GPT v7 keeper dives: the side comes from the dive direction against the keeper's facing
        // (anatomical left is (cos yaw, -sin yaw) in x,z), the high clip from the ball height.
        const left=-Math.sin(yaw)*(p.diveZ||1)>0,high=(s.ball.y||0)>1.1&&left;
        const v8=soccerV8DiveClip(left,s.ball.y||0,n=>Boolean(actions[n])),plan=v8&&soccerV8DivePlan(data.states[v8]);
        if(plan){dive={name:v8,contact:plan.contact,settleRate:plan.settleRate,rate:plan.rate};change(v8,'fall_confirmed',true,{at:plan.at,rate:plan.rate,fadeSeconds:.06});}
        else{
          const chosen=actions.keeper_dive_left?(high?'keeper_dive_high':left?'keeper_dive_left':'keeper_dive_right'):'fall';
          change(chosen,'fall_confirmed',true,{rate:chosen==='fall'?1:data.states[chosen].durationSeconds/1.05});
        }
      }
      else if(mode==='recover'&&edge){
        const kind=p.slideKind&&actions['slide_'+p.slideKind+'_recover']?(p.slideWon===false&&actions.slide_miss?'slide_miss':'slide_'+p.slideKind+'_recover'):'recover',clip=data.states[kind],total=Math.max(.2,(p.recover||0)*(kind==='slide_miss'?.5:.75));
        change(kind,'recovery_allowed',true,{rate:Math.max(1,clip.durationSeconds/total)});
      }
      else if((mode==='kick'||mode==='steal')&&kick) {
        // The simulation has already released the ball. Enter immediately before
        // the authored contact, then fit only the follow-through to its existing
        // countdown. No physics release, countdown or result is delayed.
        const v9k=codex?soccerCodexKickClip(s,speed,n=>Boolean(actions[n])):null,v8=v9k||soccerV8KickClip(s,n=>Boolean(actions[n])),requested=v8||(s.event?.type==='shot'?'kick_power':s.ball.flight?'pass_long':'pass_short'),name=actions[requested]?requested:'kick';
        const clip=data.states[name],contact=clip.ballContacts?.find(c=>/strike|contact/.test(c.event));
        const contactTime=(contact?.time??.35)*clip.durationSeconds,m=config.view.athlete?.motion||{};
        const at=Math.max(0,contactTime-(m.contactLead??.03));
        const remaining=Math.max(.08,(mode==='steal'?p.stealTime:p.kickTime)||config.ai?.kickAnimationSeconds||.42);
        change(name,'action',true,{at,rate:(clip.durationSeconds-at)/remaining,fadeSeconds:m.kickFadeIn??.025});
      }
      else if(v10&&p.role!=='keeper'&&(p.receiveTime||0)>touchTimer+1e-6&&!(['kick','steal','slide','recover','celebrate'].includes(mode))&&soccerV10FirstTouchClip(p.receiveHeight||0,p.receiveSpeed||0,p.id||0,n=>Boolean(actions[n]))){
        // The ball has just reached him: the short first touch, entered just before its receive event (0.33 s into the clip).
        change(soccerV10FirstTouchClip(p.receiveHeight||0,p.receiveSpeed||0,p.id||0,n=>Boolean(actions[n])),'receive',true,{at:.2,rate:1.1,fadeSeconds:.06});
      }
      else if(v10&&p.role!=='keeper'&&(isLadder(state)||state==='turn_left'||state==='turn_right')&&recentSpeed>=SOCCER_V10_CUT_MIN_SPEED&&Math.abs(turn)>SOCCER_V10_CUT_MIN_STEP&&soccerV10CutClip(cutAccum,n=>Boolean(actions[n]),turn/dt)){
        const name=soccerV10CutClip(cutAccum,n=>Boolean(actions[n]),turn/dt);cutAccum=0;change(name,'cut',true,{fadeSeconds:.06});
      }
      else if(mode==='catch'&&edge)change((p.role==='keeper'&&soccerCodexKeeperCatch(s.ball.y||0,n=>Boolean(actions[n])))||(p.role==='keeper'&&actions.keeper_catch?'keeper_catch':'catch'),'receive');
      else if(state==='v9_run_brake'&&!(moving&&actions[state].time>.2)&&actions[state].time<data.states[state].durationSeconds-.05){/* the brake plays to its end unless the player clearly sets off again */}
      else if((soccerCodexHeld(state)||soccerV10Held(state))&&actions[state]&&actions[state].time<data.states[state].durationSeconds-.05&&!(moving&&actions[state].time>.7)){/* a Codex once-clip plays to its end */}
      else if(slide&&state===slide.name&&!slideTimeline(p,mode,speed>(config.view.animation.idleSpeed||.2),dt)){/* the slide timeline is still playing */}
      else if(!['celebrate','fall','recover','kick','kick_power','pass_short','pass_long','catch','keeper_catch','slide_miss'].includes(state)&&!state.startsWith('slide_')&&!state.startsWith('keeper_dive')&&!state.startsWith('v8_keeper_dive')&&state!=='v8_shot'&&!state.startsWith('v8_pass')&&!state.startsWith('celebrate_')||actions[state].time>=data.states[state].durationSeconds-1e-5) {
        const running=['run','dribble_run','defensive_jockey'].includes(state)||isLadder(state);
        let locomotion=s.ball.owner===p.id&&actions.dribble_run?'dribble_run':s.mode==='defense'&&actions.defensive_jockey&&speed<config.view.animation.runSpeed?'defensive_jockey':'run';
        if(hasLadder&&locomotion==='run'){rung=soccerLadderRung(ladderDef,speed,isLadder(state)?ladder.indexOf(state):rung,ladderBounds);locomotion=ladder[rung];}
        if(mode==='celebrate'){/* Hold the authored celebration until the goal phase ends. */}
        else if(!moving&&running)change(codex&&actions.v9_run_brake?(previousSpeed>=SOCCER_CODEX_BRAKE_FROM?'v9_run_brake':(p.role==='keeper'&&actions.v9_goalkeeper_ready?'v9_goalkeeper_ready':actions[idleHome]?idleHome:'idle')):'decelerate','slowing');
        else if(!moving)change(p.role==='keeper'&&actions.v9_goalkeeper_ready?'v9_goalkeeper_ready':p.role==='keeper'&&actions.v8_keeper_ready?'v8_keeper_ready':actions[idleHome]?(idles.includes(state)?state:idleHome):'idle','stopped');
        else if(running&&Math.abs(turn)>.16)change(turn<0?'turn_left':'turn_right',turn<0?'turn_left':'turn_right');
        else if(speed<previousSpeed-.15&&running)change('decelerate','slowing');
        else if(!['turn_left','turn_right','decelerate'].includes(state)||actions[state].time>=data.states[state].durationSeconds-1e-5){
          // Rung to rung keeps the foot phase; every other entry starts the cycle.
          const phase=isLadder(state)&&isLadder(locomotion)?(actions[state].time/data.states[state].durationSeconds)%1:0;
          change(locomotion,'moving',false,{at:phase*(data.states[locomotion]?.durationSeconds||0)});
        }
      }
      if(dive&&state===dive.name)actions[state].setEffectiveTimeScale(actions[state].time>=dive.contact?dive.settleRate:dive.rate);
      else if(dive&&state!==dive.name)dive=null;
      if(['run','dribble_run','defensive_jockey'].includes(state))actions[state].setEffectiveTimeScale(clamp(speed/(config.view.animation.runSpeed||4.5),.55,1.7));
      else if(isLadder(state))actions[state].setEffectiveTimeScale(clamp(speed/ladderDef[ladder.indexOf(state)][1],state==='v9_walk'?.6:.5,state==='v9_walk'?1.6:1.4));
      if(codex&&p.role!=='keeper'&&idles.includes(state)&&!moving){idleAge+=dt;if(idleAge>=soccerCodexIdleHold(p.id||0)){idleAge=0;change(idles[(idles.indexOf(state)+1)%idles.length],'idle_variety',true,{fadeSeconds:.35});}}else idleAge=0;
      previousMode=mode;previousSpeed=speed;previousYaw=yaw;kickTimer=p.kickTime||0;stealTimer=p.stealTime||0;touchTimer=p.receiveTime||0;
      updateMixer(dt);
      const runSpeed=config.view.animation.runSpeed||4.5,idle=config.view.animation.idleSpeed||.2,locomotion=LOCOMOTION.has(state)&&moving;
      const clipPhase=state==='run'||state==='dribble_run'?(actions[state].time/data.states[state].durationSeconds+ARM_PHASE[state])%1:NaN;
      armSwingState(arm,dt,{locomotion,clipPhase,speed01:(speed-idle)/(runSpeed-idle),sprint01:Math.max(mode==='sprint'?1:0,(speed-runSpeed)/2),carrying:s.ball.owner===p.id});
      if(arm.weight>0)applyArms(armSwingPose(arm.phase,1,arm.sprint,arm.carry,undefined,armPose),arm.weight);
      // v9: natural arms while standing, turning or shadowing (the authored clips hold them out like a T-pose).
      if(standOn){armStandState(standLayer,dt,armStandWeight(state)*(1-clamp(arm.weight,0,1)*(moving?1:0)));if(standLayer.weight>0)applyArms(armStandPose(state,standLayer.breath,standLayer.weight,standPose),1);}
      return state;
    },
  };
}

/** After an AI keeper's throw/punt leaves the hand the simulation walks him back to goal at once, while the
 * authored clip is still swinging the arm/leg forward (it read as a follow-through backwards). The view keeps him
 * standing where he released, facing the ball's way, until the clip ends, then eases him to his real place.
 * Presentation only: positions in the simulation are untouched. `?keeperKick=0` restores the old look. */
const KEEPER_KICKS=new Set(['keeperThrow','keeperPunt']),KEEPER_EASE=.3;
const keeperKickOn=new URLSearchParams(globalThis.location?.search||'').get('keeperKick')!=='0';
export function keeperStand(character,p,s,dt){
  const m=p.restartMotion;
  if(keeperKickOn&&m&&KEEPER_KICKS.has(m.kind)&&m.released&&p.id!==s.controlled){
    return character.stand||(character.stand={x:p.x,z:p.z,yaw:Math.atan2(p.fx,p.fz),ease:0});
  }
  if(character.stand){
    const st=character.stand;st.ease+=dt/KEEPER_EASE;
    if(st.ease>=1){character.stand=null;return null;}
    const u=st.ease*st.ease*(3-2*st.ease);return {x:st.x+(p.x-st.x)*u,z:st.z+(p.z-st.z)*u,yaw:Math.atan2(p.fx,p.fz)};
  }
  return null;
}

/** Compile actions that have a live simulation mapping. Other extension
 * states remain in the merged library without an expensive unused floor bake. */
const ACTIVE_CLIPS=['idle','run','decelerate','turn_left','turn_right','kick','catch','celebrate','fall','recover','throwIn','corner','goalKick','keeperThrow','keeperPunt','dribble_run','defensive_jockey','pass_short','pass_long','kick_power','slide_straight','slide_straight_recover','slide_lateral','slide_lateral_recover','slide_fast','slide_fast_recover','slide_miss'];
let designSources=null,lastDesignError=null,lastV5Error=null,lastV7Error=null,lastV8Error=null;
/** Why the Codex v9 motion clips were skipped (null when loaded or not asked for). */
let lastCodexError=null,lastV10Error=null,motionCounts={v8:0,v9:0,v10:0};
export function soccerCodexMotionError(){return lastCodexError;}
/** One line for the load report / debug: which motion packs are in this match, and why one was skipped. */
export function soccerMotionLoadReport(){return soccerMotionLoadSummary(motionCounts,[lastV8Error&&'v8: '+lastV8Error,lastCodexError&&'v9: '+lastCodexError,lastV10Error&&'v10: '+lastV10Error].filter(Boolean));}
/** Why the v8 motion clips were skipped (null when loaded or not asked for). */
export function soccerV8MotionError(){return lastV8Error;}
/** Why the authored characters last failed to prepare (for the load report). */
export function soccerDesignCharacterError(){return lastDesignError;}
/** Why the v5 set was skipped in favour of v4 (null when v5 loaded or was not asked for). */
export function soccerV5FallbackReason(){return lastV5Error;}
/** Why the v7 set was skipped in favour of v5/v4 (null when v7 loaded or was not asked for). */
export function soccerV7FallbackReason(){return lastV7Error;}
const fetchJson=url=>retrying(async()=>{const response=await fetch(url);if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json();},`Soccer asset ${url}`);
/** Shared CPU pipeline for both character sets: retarget the motion library,
 * validate the bind pose, bake the floor, label recolour regions and build LODs. */
function finishSources({scenes,rig,map,data,assign,set,outfield,keeper,validate=null,lodFor=null,extra={},extraClips=[]}){
  globalThis.performance?.mark?.('soccer:prepare-cpu-start');
  const active=new Set([...ACTIVE_CLIPS,...extraClips,...Object.keys(data.slideSequences||{})]);
  const compiled=compileSoccerDesignClips({...data,states:Object.fromEntries(Object.entries(data.states).filter(([name])=>active.has(name)))},rig,map);
  for(const source of scenes)(validate||(s=>validateBind(s,rig)))(source);
  const clipSets=scenes.map(source=>bakeSoccerDesignFloor(source,compiled));
  const sourceHeights=scenes.map(source=>{
    source.updateMatrixWorld(true);source.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});
    const bounds=new T.Box3().setFromObject(source);return bounds.max.y-bounds.min.y;
  });
  const lodGeometry=new Map();
  scenes.forEach((source,sourceIndex)=>source.traverse(o=>{
    if(!o.isMesh)return;
    if(lodFor){lodGeometry.set(o.geometry,lodFor(o,sourceIndex));return;}
    assign(o.geometry,sourceIndex);
    // Keep the medium mesh; a separate 28-cell mobile mesh offsets the larger
    // squad. Both retain source colour/skin boundaries and the same height.
    lodGeometry.set(o.geometry,[createSoccerCharacterLod(o.geometry,sourceHeights[sourceIndex]/40),createSoccerCharacterLod(o.geometry,sourceHeights[sourceIndex]/28)]);
  }));
  globalThis.performance?.mark?.('soccer:prepare-cpu-end');
  return {sources:scenes,clipSets,sourceHeights,lodGeometry,data,map,clips:compiled.map(c=>c.name),set,outfield,keeper,...extra};
}
async function prepareV4(loader){
  const [player,keeper,rig,map,data,regionMap]=await Promise.all([
    retrying(()=>loader.loadAsync(asset('characters2/soccer-player.glb')),'characters2/soccer-player.glb'),retrying(()=>loader.loadAsync(asset('characters2/goalkeeper.glb')),'characters2/goalkeeper.glb'),
    json('characters/rig.json'),json('viewer/retarget-map.json'),retrying(()=>loadSoccerRestartMotion(),'motion library'),json('characters2/regions.json'),
  ]);
  return finishSources({scenes:[player.scene,keeper.scene],rig,map,data,set:'v4',outfield:[0],keeper:1,
    assign:(geometry,index)=>assignRegions(geometry,regionMap.models[index?'goalkeeper':'soccer-player'],regionMap)});
}
async function prepareV5(loader){
  const files=[...SOCCER_V5_FILES.outfield,SOCCER_V5_FILES.keeper];
  const [rig,map,data,...glbs]=await Promise.all([fetchJson(SOCCER_V5_RIG_URL),json('viewer/retarget-map.json'),retrying(()=>loadSoccerRestartMotion(),'motion library'),
    ...files.map(file=>retrying(()=>loader.loadAsync(soccerV5Url(file)),'soccer-v5/'+file))]);
  return finishSources({scenes:glbs.map(g=>g.scene),rig,map:soccerV5Map(map),data,set:'v5',outfield:SOCCER_V5_FILES.outfield.map((_,i)=>i),keeper:files.length-1,
    assign:(geometry,index)=>assignSoccerV5Regions(geometry,SOCCER_V5_REGIONS[files[index]])});
}
/** GPT v7: player-01 (team A), player-04 (team B), goalkeeper. LOD0 and LOD1 come from the files; LOD1
 * reuses the LOD0 material (it has no textures of its own). Skeleton = canonical source rest, identity retarget. */
async function prepareV7(loader){
  const names=[...SOCCER_V7_FILES.outfield,SOCCER_V7_FILES.keeper];
  const [map,library,extra,...glbs]=await Promise.all([json('viewer/retarget-map.json'),retrying(()=>loadSoccerRestartMotion(),'motion library'),fetchJson(soccerV7ClipsUrl()),
    ...names.flatMap(name=>[0,1].map(lod=>retrying(()=>loader.loadAsync(soccerV7Url(name,lod)),`soccer-v7/${name}-lod${lod}`)))]);
  // GPT soccer v8 clips: optional. Any failure keeps the v7/library clips (recorded for the load report).
  let v8={};lastV8Error=null;
  if(soccerV8Enabled(null,'motion')){try{v8=soccerV8States(await fetchJson(soccerV8ClipsUrl()));}catch(error){lastV8Error=String(error?.message||error);}}
  lastV10Error=null;let v9={};lastCodexError=null;
  if(soccerCodexMotionEnabled(null)){try{v9=soccerCodexStates(await fetchJson(soccerCodexClipsUrl()));}catch(error){lastCodexError=String(error?.message||error);}}
  let v10={};
  if(soccerMotionV10Enabled(null)){try{v10=soccerV10States(await fetchJson(soccerV10ClipsUrl()));}catch(error){lastV10Error=String(error?.message||error);}}
  motionCounts={v8:Object.keys(v8).length,v9:Object.keys(v9).length,v10:Object.keys(v10).length};
  const data={...library,states:{...library.states,...extra.states,...v8,...v9,...v10}};
  const lod0=names.map((_,i)=>glbs[i*2].scene),lod1=names.map((_,i)=>glbs[i*2+1].scene);
  for(const scene of lod0)joinSoccerV7Meshes(scene);for(const scene of lod1)joinSoccerV7Meshes(scene,{doubleSided:false});
  const firstMesh=scene=>{let m=null;scene.traverse(o=>{if(!m&&o.isSkinnedMesh)m=o;});return m;};
  return finishSources({scenes:lod0,rig:soccerV7Rig(lod0[0]),map:soccerV7Map(map),data,set:'v7',outfield:SOCCER_V7_FILES.outfield.map((_,i)=>i),keeper:names.length-1,
    validate:scene=>validateSoccerV7Bind(scene,data.skeleton.bones),assign:()=>{},extraClips:[...Object.keys(extra.states),...Object.keys(v8),...Object.keys(v9),...Object.keys(v10)],
    lodFor:(mesh,sourceIndex)=>{const low=firstMesh(lod1[sourceIndex]);if(!low||low.skeleton.bones.some((b,i)=>b.name!==mesh.skeleton.bones[i]?.name))throw Error('Soccer v7 LOD1 skeleton mismatch');return [low.geometry,low.geometry];}});
}
/** Decode, retarget, floor-bake and LOD the authored characters once per
 * page. Every match clones rigs from these shared sources, so a reopened game
 * (or one opened after the soccer menu warmed the cache) skips the whole CPU
 * pipeline. The shared sources are never disposed; sessions own only their clones.
 * The v5 cartoon set is tried first (see soccer-v5.mjs); if any of it fails the
 * v4 set loads instead, silently for the player and recorded for the load report.
 * A failed preparation is forgotten so the next opening retries it. */
export function prepareSoccerDesignSources(){
  if(designSources)return designSources;
  const loader=createSoccerDesignLoader();
  designSources=(async()=>{
    try{
      globalThis.performance?.mark?.('soccer:prepare-fetch-start');
      lastV5Error=null;lastV7Error=null;
      const wanted=soccerCharacterSet();
      if(wanted==='v7'){
        try{return await prepareV7(loader);}
        catch(error){lastV7Error=String(error?.message||error);}
      }
      if(wanted==='v5'||wanted==='v7'){
        try{return await prepareV5(loader);}
        catch(error){lastV5Error=String(error?.message||error);}
      }
      return await prepareV4(loader);
    }catch(error){designSources=null;lastDesignError=String(error?.message||error);throw error;}
    finally{loader.dispose();}
  })();
  return designSources;
}
/** Optional authored GLB path for comparison/fallback. The realistic athlete
 * remains the game's default; no textures or decoding are added to that path. */
export async function loadDesignCharacters({config,roster,scene,track=x=>x,selectedKit=null}) {
  const resources=new Set(),characters=[];
  const own=value=>(resources.add(value),track(value),value);
  let disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;for(const c of characters)c.dispose();
    for(const r of resources)r.dispose?.();resources.clear();
  };
  try {
    const {sources,clipSets,sourceHeights,lodGeometry,data,map,clips,set,outfield,keeper:keeperSource}=await prepareSoccerDesignSources();
    globalThis.performance?.mark?.('soccer:characters-instance-start');
    const height=config.view.animation.characterHeight||1.8;
    let triangles=0,lowTriangles=0,mobileTriangles=0;
    for(let id=0;id<roster.length;id++) {
      const slot=roster[id],isKeeper=slot.role==='keeper',isV7=set==='v7',index=isKeeper?keeperSource:isV7?outfield[slot.team===0?0:1]:outfield[roster.slice(0,id).filter(other=>other.role!=='keeper').length%outfield.length],source=sources[index],root=cloneSoccerRig(source),pivot=new T.Group();
      const variation=isV7?soccerV7Variation(id):null;
      root.scale.setScalar(soccerMetreScale(sourceHeights[index],height)*(variation?.scale||1));pivot.add(root);scene.add(pivot);
      const team=slot.team===0?config.team:config.opponent;
      const appearance=config.view.appearance||{},pick=(name,fallback)=>appearance[name]?.[id%(appearance[name]?.length||1)]||fallback;
      const kit=slot.team===0&&!isKeeper?selectedKit:null;
      const palette=Object.fromEntries(Object.entries({skin:pick('skin','#bf8054'),hair:pick('hair','#263443'),shirt:isKeeper?(config.view.athlete?.keeperColors?.[slot.team]||(slot.team===0?'#dfbb48':'#339d91')):(kit?.primary||team.colors[0]),shorts:kit?.shorts||team.colors[1],socks:kit?.socks||pick('socks','#f2f4ee')}).map(([name,hex])=>[name,new T.Color(hex)]));
      const fullMeshes=[],lowMeshes=[],mobileMeshes=[];root.traverse(o=>{if(o.isMesh)fullMeshes.push(o);});
      for(const o of fullMeshes){
        const originalGeometry=o.geometry,original=Array.isArray(o.material)?o.material[0]:o.material;
        if(isV7){
          // Textured atlas, shared geometry (never disposed by a session), one cloned material per actor for the tint.
          o.material=own(original.clone());o.material.color.setRGB(...variation.tint);
          if(isKeeper)applySoccerV7HueShift(o.material,SOCCER_V7_KEEPER_HUE[slot.team]||0);
          o.frustumCulled=false;o.castShadow=o.receiveShadow=true;
          triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;
          const low=o.clone(false);low.name=o.name+'LOD1';low.geometry=lodGeometry.get(originalGeometry)[0];low.visible=false;o.parent.add(low);lowMeshes.push(low);
          const lowCount=(low.geometry.index?.count||low.geometry.attributes.position.count)/3;lowTriangles+=lowCount;mobileTriangles+=lowCount;
          continue;
        }
        const geometry=own(characterGeometry(originalGeometry,palette));
        o.geometry=geometry;o.material=own(original.clone());o.material.vertexColors=true;o.material.roughness=.78;o.material.metalness=0;
        o.frustumCulled=false;o.castShadow=o.receiveShadow=true;
        triangles+=(geometry.index?.count||geometry.attributes.position.count)/3;
        const low=o.clone(false);low.name=o.name+'LOD1';low.geometry=own(characterGeometry(lodGeometry.get(originalGeometry)[0],palette));low.visible=false;o.parent.add(low);lowMeshes.push(low);
        lowTriangles+=(low.geometry.index?.count||low.geometry.attributes.position.count)/3;
        const mobile=o.clone(false);mobile.name=o.name+'LOD2';mobile.geometry=own(characterGeometry(lodGeometry.get(originalGeometry)[1],palette));mobile.visible=false;o.parent.add(mobile);mobileMeshes.push(mobile);
        mobileTriangles+=(mobile.geometry.index?.count||mobile.geometry.attributes.position.count)/3;
      }
      const mixer=new T.AnimationMixer(root),motion=createSoccerDesignMotion(mixer,clipSets[index],data,config);
      let characterDisposed=false;
      let lod=0;
      const fullTriangleCount=isV7?fullMeshes.reduce((n,o)=>n+(o.geometry.index.count/3),0):0;
      const character={design:true,v7:isV7,root,pivot,mixer,motion,team:slot.team,keeper:isKeeper,active:data.initialState,mode:'idle',yaw:null,restartContactMap:map,
        setLod(level){const next=isV7?(level>0?1:0):level>=2?2:level>0?1:0;if(next===lod)return lod;lod=next;fullMeshes.forEach(o=>o.visible=lod===0);lowMeshes.forEach(o=>o.visible=lod===1);mobileMeshes.forEach(o=>o.visible=lod===2);return lod;},
        update(p,s,animation,dt){
          if(characterDisposed)return;
          const stand=keeperStand(this,p,s,dt),wanted=stand?stand.yaw:Math.atan2(p.fx,p.fz);
          if(this.yaw===null)this.yaw=wanted;else if(dt>0)this.yaw+=wrap(wanted-this.yaw)*(1-Math.exp(-dt*18));
          pivot.position.set(stand?stand.x:p.x,Math.max(0,animation.height||0),stand?stand.z:p.z);pivot.rotation.set(0,this.yaw,0);
          this.active=motion.update(p,s,animation,dt);this.mode=animation.mode;
        },
        metrics:()=>({kind:'design-glb-v2',set,fullTriangles:isV7?fullTriangleCount:undefined,state:motion.state,lastTransition:motion.lastTransition,keeper:isKeeper,lod,heightMetres:height,armSwing:motion.armSwing.weight,slide:motion.slide}),
        dispose(){if(characterDisposed)return;characterDisposed=true;mixer.stopAllAction();mixer.uncacheRoot(root);root.traverse(o=>o.skeleton?.dispose());pivot.removeFromParent();},
      };
      mixer.update(0);characters.push(character);
    }
    globalThis.performance?.mark?.('soccer:characters-instance-end');
    return {characters,metrics:{kind:'design-glb-v2',characterSet:set,source:set==='v7'?'assets/soccer-v7':set==='v5'?'assets/soccer-v5':'design/characters2',triangles:triangles/roster.length,eightCharacterTriangles:triangles,economyCharacterTriangles:lowTriangles/roster.length,mobileCharacterTriangles:mobileTriangles/roster.length,meshes:1,lod:0,lodCount:set==='v7'?2:3,independentSkeletons:true,clips:[...clips],retarget:'calibrated-world-basis',floor:'baked-at-load',referenceRootMotion:false,heightMetres:height},dispose};
  }catch(error){dispose();throw error;}
}
