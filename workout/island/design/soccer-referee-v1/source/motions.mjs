// SPDX-License-Identifier: CC0-1.0
// Original referee signals. Targets are metres in the canonical +Z-facing rig.
// Feet use analytic two-bone IK. Signals have an entry, readable hold, and exit.
import {pose, bones, euler, mix, smooth, fk, rotate, add, qi, qm} from './canonical-rig.mjs';

export {bones};
const TAU = 2 * Math.PI;
const smoother = t => {t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
function envelope(t, a, b, c, d) {
  return t<a?0:t<b?smoother((t-a)/(b-a)):t<c?1:t<d?1-smoother((t-c)/(d-c)):0;
}
const feet = {leftFoot:[.115,.08,.025],rightFoot:[-.115,.08,-.025]};
const restHands = {leftHand:[.245,.81,.045],rightHand:[-.245,.81,.045]};
function neutral(t=0, duration=2.4) {
  const breath=Math.sin(TAU*t/duration);
  return {hips:[0,.825+.0015*breath,0],...feet,...restHands,
    lean:.8+.4*breath,headYaw:1.5*Math.sin(TAU*t/duration),
    leftHand:[.245,.81+.002*breath,.045],rightHand:[-.245,.81+.002*breath,.045]};
}
const specs = [
  ['idle','עמידה',2.4,true,'stationary'],
  ['jog','ריצה קלה',1,true,'locomotion'],
  ['whistle','שריקה',3,false,'signal'],
  ['point_penalty','הצבעה לנקודה',3.4,false,'signal'],
  ['advantage','יתרון',3.4,false,'signal'],
  ['yellow_card','כרטיס צהוב',4,false,'signal'],
  ['red_card','כרטיס אדום',4,false,'signal'],
  ['goal_signal','סימון שער',3.6,false,'signal'],
  ['assistant_run','ריצה לאורך הקו',1,true,'locomotion'],
  ['assistant_offside','סימון נבדל',3.6,false,'signal'],
];

// C1 periodic foot path: stance sweeps backwards at exactly the declared root
// speed, swing returns with matching endpoint velocities and zero lift slope.
// Each foot has a genuine 46% stance and 54% swing; no support masking.
const stance=.46;
function gaitFoot(phase, speed, duration, sign) {
  const p=((phase%1)+1)%1, step=speed*duration*stance;
  if(p<=stance)return [sign*.115,.08,step/2-speed*duration*p];
  const u=(p-stance)/(1-stance), slope=-speed*duration*(1-stance);
  const h00=2*u**3-3*u**2+1,h10=u**3-2*u**2+u,h01=-2*u**3+3*u**2,h11=u**3-u**2;
  const z=h00*(-step/2)+h10*slope+h01*(step/2)+h11*slope;
  return [sign*.115,.08+.10*Math.sin(Math.PI*u)**2,z];
}
function gait(t, duration, assistant) {
  const speed=assistant?1.15:1.0, phase=t/duration, wave=Math.sin(TAU*phase);
  const l=gaitFoot(phase,speed,duration,1),r=gaitFoot(phase+.5,speed,duration,-1);
  const s={hips:[0,.795+.005*Math.cos(TAU*phase*2),0],
    leftFoot:l,rightFoot:r,lean:5,
    leftHand:[.245,1.02,.16-.10*wave],rightHand:[-.245,1.02,.16+.10*wave],
    leftElbow:[.2,-.8,-.6],rightElbow:[-.2,-.8,-.6],head:1};
  if(assistant) {
    // Carry the flag low on the outside, clear of the legs and ground.
    s.rightHand=[-.31,.92,.015];
    s.rightHandAim=euler(0,0,0);
  }
  return pose(s);
}
function setAim(p,bone,worldQ) {
  const parent=bones.find(b=>b.name===bone).parent;
  p.rotations[bone]=qm(qi(fk(p)[parent].rotation),worldQ);
}
function blendPose(from,to,alpha) {
  return {hips:mix(from.hips,to.hips,alpha),
    rotations:Object.fromEntries(bones.map(b=>[b.name,rigHelpers.slerp(from.rotations[b.name],to.rotations[b.name],alpha)])),
    reachError:Math.max(from.reachError??0,to.reachError??0)};
}
export function sampleMotion(id,t,duration) {
  if(id==='jog'||id==='assistant_run')return {pose:gait(t,duration,id==='assistant_run'),props:{}};
  const props={YellowCard:0,RedCard:0,Whistle:0};
  if(id==='idle')return {pose:pose(neutral(t,duration)),props};
  const s=neutral(0),base=pose(s),u=t/duration;
  const a=envelope(u,.06,.30,.70,.95);
  let handAim;
  if(id==='whistle') {
    // Local whistle mouthpiece [0,-.040,.006] arrives at the authored lips.
    s.rightHand=[.0055669,1.5034154,.1102977];s.rightElbow=[-.5,-.75,.15];
    s.head=2;props.Whistle=a>.96?1:0;handAim=euler(-88,0,-8);
  } else if(id==='point_penalty') {
    s.rightHand=[-.29,1.04,.425];s.rightElbow=[-.25,-.7,.6];
    s.head=9;handAim=euler(-70,0,0);
  } else if(id==='advantage') {
    s.leftHand=[.29,1.22,.435];s.rightHand=[-.29,1.22,.435];
    s.leftElbow=[.35,-.55,.7];s.rightElbow=[-.35,-.55,.7];
  } else if(id==='yellow_card'||id==='red_card') {
    const pocket=pose({...s,rightHand:[-.17,.94,.16],rightElbow:[-.5,-.7,.5]});
    const raised=pose({...s,rightHand:[-.27,1.73,.075],rightElbow:[-.9,-.25,.4]});
    setAim(raised,'RightHand',euler(0,0,176));
    let p;
    if(u<.16)p=blendPose(base,pocket,smoother((u-.03)/.13));
    else if(u<.22)p=pocket;
    else if(u<.46)p=blendPose(pocket,raised,smoother((u-.22)/.24));
    else if(u<.76)p=raised;
    else p=blendPose(raised,base,smoother((u-.76)/.20));
    props[id==='yellow_card'?'YellowCard':'RedCard']=u>=.23&&u<.925?1:0;
    return {pose:p,props};
  } else if(id==='goal_signal') {
    s.rightHand=[-.57,1.35,.17];s.rightElbow=[-.7,-.4,.6];
    s.headYaw=-16;handAim=euler(0,0,-90);
  } else if(id==='assistant_offside') {
    s.rightHand=[-.31,1.72,.04];s.rightElbow=[-.85,-.3,.45];
    handAim=euler(0,0,180);
  }
  const target=pose(s);
  if(handAim)setAim(target,'RightHand',handAim);
  if(id==='advantage')for(const side of ['Left','Right'])
    setAim(target,side+'Hand',euler(-95,0,side==='Left'?15:-15));
  // Blend full, solved, local poses. Re-solving IK through a nearly collinear
  // arm/pole would cause an axial flip although the target path was smooth.
  return {pose:blendPose(base,target,a),props};
}
import * as rigHelpers from './canonical-rig.mjs';

function supportWindows(duration) {
  const out=[];
  for(const [bone,offset] of [['LeftFoot',0],['RightFoot',.5]]) {
    for(let k=-1;k<2;k++) {
      const start=Math.max(0,(k-offset)*duration),end=Math.min(duration,(k+stance-offset)*duration);
      if(end>start)out.push({bone,start,end,local:[0,-.08,0]});
    }
  }
  return out;
}
export function authorClips() {
  return specs.map(([id,labelHe,durationSeconds,loop,kind])=>{
    const count=Math.round(durationSeconds*30)+1,locomotion=kind==='locomotion';
    const speed=id==='assistant_run'?1.15:id==='jog'?1:0;
    const frames=Array.from({length:count},(_,i)=>{
      const time=i/30, {pose:p,props}=sampleMotion(id,time,durationSeconds);
      return {time,hips:p.hips,rotations:p.rotations,props,reachError:p.reachError};
    });
    // Keep quaternion samples on a continuous hemisphere before glTF export.
    for(const b of bones)for(let i=1;i<frames.length;i++) {
      const prev=frames[i-1].rotations[b.name],q=frames[i].rotations[b.name];
      if(prev.reduce((s,v,k)=>s+v*q[k],0)<0)frames[i].rotations[b.name]=q.map(v=>-v);
    }
    const supports=locomotion?supportWindows(durationSeconds):['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:durationSeconds,local:[0,-.08,0]}));
    return {id,labelHe,durationSeconds,sampleHz:30,frameCount:count,loop,kind,
      role:id.startsWith('assistant_')?'assistant':'referee',frames,
      metadata:{loop,kind,locomotion,referenceTravelKnown:locomotion,
        rootMotion:false,speedMps:speed,soleLocal:[0,-.08,0],supports,
        referenceRootMotion:{samples:[{time:0,position:[0,0,0]},{time:durationSeconds,position:[0,0,speed*durationSeconds]}]},
        events:locomotion?supports.map(w=>({type:'foot_plant',time:w.start,bone:w.bone})):
          id==='idle'?[]:[{type:id==='whistle'?'whistle':'signal',time:Math.round(durationSeconds*.5*30)/30,presentationOnly:true}],
        symmetryMode:locomotion?'gait':'structural',ballVisible:false,ballContacts:[],
        presentationOnly:true,gameplayEffects:false}};
  });
}
