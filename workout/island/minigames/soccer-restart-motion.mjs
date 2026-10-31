import {SOCCER_RESTART_RIG_CALIBRATION} from './soccer-restart-poses.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let restartData;
/** Cache lives in this unversioned soccer-only module, so the legacy athlete
 * import URL and the design-character URL share the same JSON requests. */
export function loadSoccerRestartMotion(){
  if(restartData)return restartData;
  const paths=['motion/soccer.json','motion2/soccer/throws-receives.json','motion2/soccer/kicks-locomotion.json','motion2/soccer/tackles-reactions.json'];
  const pending=Promise.all(paths.map(async path=>{const response=await fetch(new URL('../design/'+path,import.meta.url));if(!response.ok)throw Error(`Soccer motion ${path}: ${response.status}`);return response.json();})).then(packs=>{
    const data=composeSoccerRestartMotion(...packs);installSoccerRestartMotion(data);return data;
  });
  restartData=pending.catch(error=>{restartData=null;throw error;});return restartData;
}
/** These are authored presentation clocks. The simulation decides when to start
 * an action and owns the one release edge; it never listens to mixer callbacks. */
export const SOCCER_RESTART_SEQUENCES=Object.freeze({
  throwIn:Object.freeze({clips:['throw_in_prepare','throw_in_release','throw_in_follow'],event:'presentation_throw_release',duration:1.82,contact:1.1176}),
  corner:Object.freeze({clips:['corner_runup','corner_kick'],event:'visual_ball_strike',duration:2.12,contact:1.5956}),
  goalKick:Object.freeze({clips:['goal_kick'],event:'visual_ball_strike',duration:1.1,contact:.528}),
  keeperThrow:Object.freeze({clips:['goalkeeper_throw'],event:'presentation_keeper_throw_release',duration:1.18,contact:.6608}),
  keeperPunt:Object.freeze({clips:['goalkeeper_punt'],event:'visual_punt_strike',duration:1.36,contact:.8024,drop:.408}),
});
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function slerp(a,b,u){
  let cosine=dot(a,b),end=b;if(cosine<0){cosine=-cosine;end=b.map(v=>-v);}
  if(cosine>.9995){const q=a.map((v,i)=>v+(end[i]-v)*u),n=Math.hypot(...q)||1;return q.map(v=>v/n);}
  const angle=Math.acos(clamp(cosine,-1,1)),sine=Math.sin(angle),x=Math.sin((1-u)*angle)/sine,y=Math.sin(u*angle)/sine;
  return a.map((v,i)=>v*x+end[i]*y);
}
function blendFrame(a,b,u){
  const rotations={};for(const name of Object.keys(b.rotations))rotations[name]=slerp(a.rotations[name],b.rotations[name],u);
  const ah=a.hipsOffsetMeters||[0,0,0],bh=b.hipsOffsetMeters||[0,0,0];
  return {...b,rotations,hipsOffsetMeters:bh.map((v,i)=>ah[i]+(v-ah[i])*u)};
}
/** Preserve the baseline and every unique extension state. The five aliases are
 * continuous timelines built from the checked-in clips, not replacement poses. */
export function composeSoccerRestartMotion(base,...packs){
  if(!base?.skeleton?.bones||!base.states)throw Error('Missing soccer base motion');
  const states={...base.states},transitions=[...(base.transitions||[])];
  for(const pack of packs){
    if(JSON.stringify(pack.skeleton)!==JSON.stringify(base.skeleton))throw Error('Soccer motion skeleton mismatch');
    for(const [id,state]of Object.entries(pack.states||{})){if(states[id])throw Error(`Duplicate soccer motion state: ${id}`);states[id]=state;}
    transitions.push(...(pack.transitions||[]));
  }
  for(const [kind,sequence]of Object.entries(SOCCER_RESTART_SEQUENCES)){
    let offset=0,previous=null;const keyframes=[],events=[],ballContacts=[],supportContacts=[];
    for(const id of sequence.clips){
      const state=states[id];if(!state)throw Error(`Missing authored soccer clip: ${id}`);
      for(const frame of state.keyframes){
        const seconds=frame.time*state.durationSeconds,blend=previous?Math.min(.1,state.durationSeconds*.25):0;
        const u=blend?clamp(seconds/blend,0,1):1,w=u*u*(3-2*u);
        const f=previous&&u<1?blendFrame(previous,frame,w):frame;
        const entry={...f,time:(offset+seconds)/sequence.duration};
        if(keyframes.length&&Math.abs(keyframes.at(-1).time-entry.time)<1e-9)keyframes[keyframes.length-1]=entry;else keyframes.push(entry);
      }
      for(const event of state.events||[]){const at=offset+(event.atSeconds??event.time*state.durationSeconds);events.push({...event,time:at/sequence.duration,atSeconds:at,sourceClip:id});}
      for(const contact of state.ballContacts||[])ballContacts.push({...contact,time:(offset+contact.time*state.durationSeconds)/sequence.duration,sourceClip:id});
      for(const contact of state.supportContacts||[])supportContacts.push({...contact,startTime:(offset+contact.startTime*state.durationSeconds)/sequence.duration,endTime:(offset+contact.endTime*state.durationSeconds)/sequence.duration});
      previous=state.keyframes.at(-1);offset+=state.durationSeconds;
    }
    const releases=events.filter(e=>(e.name||e.event)===sequence.event);
    if(Math.abs(offset-sequence.duration)>1e-8||releases.length!==1||Math.abs(releases[0].atSeconds-sequence.contact)>1e-8)throw Error(`Soccer restart timing drift: ${kind}`);
    states[kind]={durationSeconds:sequence.duration,loop:false,rootMotion:false,keyframes,events,ballContacts,supportContacts,restartKind:kind,releaseEvent:sequence.event};
  }
  return {...base,states,transitions,restartSequences:SOCCER_RESTART_SEQUENCES};
}

const multiply=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rotate=(v,q)=>{const n=multiply(multiply(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);return n.slice(0,3);};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
function canonicalPose(data,frame){
  const positions={},rotations={};
  for(const bone of data.skeleton.bones){
    const parent=bone.parent,local=bone.restTranslationMeters.map((v,i)=>v+(bone.name==='Hips'?(frame.hipsOffsetMeters?.[i]||0):0));
    positions[bone.name]=parent?add(positions[parent],rotate(local,rotations[parent])):local;
    rotations[bone.name]=parent?multiply(rotations[parent],frame.rotations[bone.name]):frame.rotations[bone.name];
  }
  return {positions,rotations};
}
const contactPoint=(pose,bone,local)=>add(pose.positions[bone],rotate(local,pose.rotations[bone]));
const fallbackPaths={
  throwIn:[[0,1.22,.342787193,0],[.648,1.82,-.017212807,0],[.9,1.82,-.017212807,0],[1.1176,1.82,.102787193,0]],
  keeperThrow:[[0,1.16,.312787193,0],[.6608,1.50631745,.478782999,-.12]],
  keeperPunt:[[0,1.12,.3,0],[.408,1.13,.42,0],[.8024,.485,.6,-.12]],
  corner:[[0,.11,.553964792,-.047666347],[1.5956,.11,.553964792,-.047666347]],
  goalKick:[[0,.11,.585,-.12],[.528,.11,.585,-.12]],
};
let paths={...fallbackPaths,...SOCCER_RESTART_RIG_CALIBRATION.paths};
/** Called during asset preload. FK and allocations are confined to loading;
 * per-tick sampling below only interpolates a cached metre-space trajectory. */
export function installSoccerRestartMotion(data){
  const result={};
  for(const [kind,profile]of Object.entries(SOCCER_RESTART_SEQUENCES)){
    if(!data.states[kind])throw Error(`Missing composed soccer action: ${kind}`);
    if(kind==='corner'||kind==='goalKick'){result[kind]=fallbackPaths[kind];continue;}
    result[kind]=[];
    for(const frame of data.states[kind].keyframes){
      const t=frame.time*profile.duration;if(t>profile.contact+1e-8)break;
      const pose=canonicalPose(data,frame);let center;
      if(kind==='keeperPunt'&&t>profile.drop){
        const u=clamp((t-profile.drop)/(profile.contact-profile.drop),0,1);
        center=[-.12*u,1.13+(.485-1.13)*u*u,.42+.18*u];
      }else if(kind==='keeperThrow'){
        const hand=contactPoint(pose,'RightHand',[0,-.05,.02]),u=clamp(t/profile.contact,0,1),w=u*u*(3-2*u);
        const offset=[.105*(1-w),.01631745*w,.032787193+(.108782999-.032787193)*w],length=Math.hypot(...offset)||1;
        center=add(hand,offset.map(v=>v*.11/length));
      }else{
        const local=kind==='keeperPunt'?[-.02,0,0]:[0,-.05,.02],other=kind==='keeperPunt'?[.02,0,0]:local;
        const left=contactPoint(pose,'LeftHand',local),right=contactPoint(pose,'RightHand',other);
        center=left.map((v,i)=>(v+right[i])/2);if(kind==='throwIn')center[2]+=.032787193;
      }
      result[kind].push([t,center[1],center[2],center[0]]);
    }
    const contact=fallbackPaths[kind].at(-1);if(Math.abs(result[kind].at(-1)[0]-profile.contact)>1e-8)result[kind].push(contact);
  }
  // Asset-normalized rig paths are an immutable simulation input, available to
  // headless games before loading. Loading a view must never change physics.
  paths={...result,...SOCCER_RESTART_RIG_CALIBRATION.paths};
}
/** Normalized-avatar fallback path; the rendered held sphere uses its actual
 * calibrated palm contacts instead, via soccerRestartBallAttachment. */
export function sampleSoccerRestartBall(kind,elapsed,out={}){
  const profile=SOCCER_RESTART_SEQUENCES[kind];if(!profile)throw Error(`Unknown soccer restart: ${kind}`);
  const t=clamp(Number.isFinite(elapsed)?elapsed:0,0,profile.contact),keys=paths[kind];let i=0;
  while(i<keys.length-2&&keys[i+1][0]<t)i++;
  const a=keys[i],b=keys[i+1],u=clamp((t-a[0])/(b[0]-a[0]),0,1);
  out.height=a[1]+(b[1]-a[1])*u;out.forward=a[2]+(b[2]-a[2])*u;out.side=a[3]+(b[3]-a[3])*u;return out;
}

let scratch;
/** Attach to actual animated skin contacts, never a fixed point above a head.
 * The sphere keeps its real radius. Ground kicks and a punt after the hand-drop
 * event return false so the view displays the simulation-owned ball trajectory. */
export function soccerRestartBallAttachment(T,character,motion,radius,out,sampleContact=false){
  if(!character||!motion||motion.elapsed+1e-8>=motion.contact&&!sampleContact||!['throwIn','keeperThrow','keeperPunt'].includes(motion.kind))return false;
  if(motion.kind==='keeperPunt'&&motion.elapsed>SOCCER_RESTART_SEQUENCES.keeperPunt.drop)return false;
  if(!scratch){scratch={};for(const name of ['a','b','v','scale','mid','lateral','forward','leftTarget','rightTarget','jointTarget','shoulder','elbow','hand','line','bend','hinge','from','wanted','rest'])scratch[name]=new T.Vector3();for(const name of ['q','parentQ','handQ'])scratch[name]=new T.Quaternion();}
  const root=character.root,left=root.getObjectByName('LeftHand'),right=root.getObjectByName('RightHand');if(!left||!right)return false;
  const map=character.restartContactMap||root.userData?.restartContactMap,scale=map?.motionScale||1;
  character.pivot.updateWorldMatrix(true,true);
  const point=(bone,side,target)=>{
    const local=motion.kind==='keeperPunt'?[side==='LeftHand'?-.02:.02,0,0]:[0,-.05,.02];
    target.fromArray(local);
    const mapping=map?.bones?.find(entry=>entry.target===side);
    if(mapping)target.applyQuaternion(scratch.q.fromArray(mapping.targetBasisWorldQuaternion).invert()).multiplyScalar(scale);
    else target.multiplyScalar(character.restartContactScale||1);
    return bone.localToWorld(target);
  };
  point(left,'LeftHand',scratch.a);point(right,'RightHand',scratch.b);
  if(motion.kind==='keeperThrow'){
    const u=clamp(motion.elapsed/motion.contact,0,1),w=u*u*(3-2*u),dx=.105*(1-w),dy=.01631745*w,dz=.032787193+(.108782999-.032787193)*w;
    const offset=scratch.v.set(dx,dy,dz).normalize().multiplyScalar(radius);character.pivot.getWorldQuaternion(scratch.q);offset.applyQuaternion(scratch.q);
    out.copy(scratch.b).add(offset);
    const metrics=character.restartContactMetrics||={};metrics.kind=motion.kind;metrics.elapsed=motion.elapsed;metrics.radius=radius;metrics.leftDistance=null;metrics.rightDistance=out.distanceTo(scratch.b);return true;
  }
  const half=radius*(motion.kind==='throwIn'?.105/.11:1),forwardDistance=Math.sqrt(Math.max(0,radius*radius-half*half));
  scratch.mid.copy(scratch.a).add(scratch.b).multiplyScalar(.5);scratch.lateral.copy(scratch.a).sub(scratch.b).normalize();
  scratch.forward.set(0,0,1);character.pivot.getWorldQuaternion(scratch.q);scratch.forward.applyQuaternion(scratch.q);
  scratch.forward.addScaledVector(scratch.lateral,-scratch.forward.dot(scratch.lateral)).normalize();
  out.copy(scratch.mid).addScaledVector(scratch.forward,forwardDistance);
  scratch.leftTarget.copy(scratch.mid).addScaledVector(scratch.lateral,half);scratch.rightTarget.copy(scratch.mid).addScaledVector(scratch.lateral,-half);
  // Retargeted adult limbs can put the palms a few centimetres farther apart
  // than the authored canonical hands. Correct the hands, never enlarge the
  // sphere or leave a visible gap. Preserve the authored wrist orientation.
  const aim=(bone,child,target)=>{
    bone.getWorldPosition(scratch.from);bone.parent.getWorldQuaternion(scratch.parentQ).invert();
    scratch.wanted.copy(target).sub(scratch.from).normalize().applyQuaternion(scratch.parentQ);
    bone.quaternion.setFromUnitVectors(scratch.rest.copy(child.position).normalize(),scratch.wanted);bone.updateWorldMatrix(false,true);
  };
  const placeHand=(side,palm,target)=>{
    const upper=root.getObjectByName(side+'Arm'),lower=root.getObjectByName(side+'ForeArm'),hand=root.getObjectByName(side+'Hand');if(!upper||!lower||!hand)return;
    upper.getWorldPosition(scratch.shoulder);lower.getWorldPosition(scratch.elbow);hand.getWorldPosition(scratch.hand);hand.getWorldQuaternion(scratch.handQ);
    scratch.jointTarget.copy(target).sub(palm).add(scratch.hand);
    const a=scratch.shoulder.distanceTo(scratch.elbow),b=scratch.elbow.distanceTo(scratch.hand);
    scratch.line.copy(scratch.jointTarget).sub(scratch.shoulder);const length=clamp(scratch.line.length(),Math.abs(a-b)+1e-6,a+b-1e-6);scratch.line.normalize();
    const along=(a*a-b*b+length*length)/(2*length),height=Math.sqrt(Math.max(0,a*a-along*along));
    scratch.bend.copy(scratch.elbow).sub(scratch.shoulder);scratch.bend.addScaledVector(scratch.line,-scratch.bend.dot(scratch.line));
    if(scratch.bend.lengthSq()<1e-8){scratch.bend.set(0,-1,0);scratch.bend.addScaledVector(scratch.line,-scratch.bend.dot(scratch.line));}scratch.bend.normalize();
    scratch.hinge.copy(scratch.shoulder).addScaledVector(scratch.line,along).addScaledVector(scratch.bend,height);
    aim(upper,lower,scratch.hinge);aim(lower,hand,scratch.jointTarget);
    hand.parent.getWorldQuaternion(scratch.parentQ).invert();hand.quaternion.copy(scratch.parentQ).multiply(scratch.handQ);hand.updateWorldMatrix(false,true);
  };
  placeHand('Left',scratch.a,scratch.leftTarget);placeHand('Right',scratch.b,scratch.rightTarget);
  point(left,'LeftHand',scratch.a);point(right,'RightHand',scratch.b);
  const metrics=character.restartContactMetrics||={};metrics.kind=motion.kind;metrics.elapsed=motion.elapsed;metrics.radius=radius;metrics.leftDistance=out.distanceTo(scratch.a);metrics.rightDistance=out.distanceTo(scratch.b);
  return true;
}

let strikeScratch;
/** Small retarget correction at a foot strike. Keep the ball and its physics
 * untouched: ease the displayed body into the toe contact and carry that shift
 * through follow-through, so neither a frozen ball nor the player jumps. */
export function alignSoccerRestartStrike(T,character,motion,ball,radius){
  if(!character||!motion||!['corner','goalKick','keeperPunt'].includes(motion.kind))return null;
  if(!strikeScratch)strikeScratch={toe:new T.Vector3(),normal:new T.Vector3(),target:new T.Vector3(),delta:new T.Vector3(),q:new T.Quaternion()};
  const root=character.root,foot=root.getObjectByName('RightFoot');if(!foot)return null;
  const map=character.restartContactMap||root.userData?.restartContactMap,mapping=map?.bones?.find(entry=>entry.target==='RightFoot');
  const point=()=>{
    strikeScratch.toe.set(0,-.025,.13);
    if(mapping)strikeScratch.toe.applyQuaternion(strikeScratch.q.fromArray(mapping.targetBasisWorldQuaternion).invert()).multiplyScalar(map.motionScale);
    character.pivot.updateWorldMatrix(true,true);foot.localToWorld(strikeScratch.toe);return strikeScratch.toe;
  };
  let alignment=character.restartStrikeAlignment;
  if(!alignment||alignment.kind!==motion.kind||motion.elapsed<alignment.elapsed-1e-8)alignment=character.restartStrikeAlignment={kind:motion.kind,elapsed:motion.elapsed,x:0,z:0,contactDistance:null};
  if(motion.elapsed+1e-8<motion.contact){
    const u=clamp((motion.elapsed-motion.contact+.12)/.12,0,1),weight=u*u*(3-2*u);
    point();strikeScratch.normal.set(motion.kind==='corner'?.023634796:0,0,motion.kind==='corner'?.107430891:1).normalize();character.pivot.getWorldQuaternion(strikeScratch.q);strikeScratch.normal.applyQuaternion(strikeScratch.q);
    strikeScratch.target.set(ball.x,ball.y,ball.z).addScaledVector(strikeScratch.normal,-radius);
    strikeScratch.delta.copy(strikeScratch.target).sub(strikeScratch.toe);strikeScratch.delta.y=0;
    const length=strikeScratch.delta.length();if(length>.45)strikeScratch.delta.multiplyScalar(.45/length);
    alignment.x=strikeScratch.delta.x*weight;alignment.z=strikeScratch.delta.z*weight;
    character.pivot.position.x+=alignment.x;character.pivot.position.z+=alignment.z;point();
    alignment.contactDistance=strikeScratch.toe.distanceTo(strikeScratch.target.set(ball.x,ball.y,ball.z));
  }else{
    const weight=clamp(1-(motion.elapsed-motion.contact)/.18,0,1);
    character.pivot.position.x+=alignment.x*weight;character.pivot.position.z+=alignment.z*weight;point();
  }
  alignment.elapsed=motion.elapsed;
  const metrics=character.restartStrikeMetrics||={};metrics.kind=motion.kind;metrics.elapsed=motion.elapsed;metrics.contact=motion.contact;metrics.radius=radius;metrics.contactDistance=alignment.contactDistance;metrics.footDistance=strikeScratch.toe.distanceTo(strikeScratch.target.set(ball.x,ball.y,ball.z));metrics.shiftMetres=Math.hypot(alignment.x,alignment.z);return metrics;
}
