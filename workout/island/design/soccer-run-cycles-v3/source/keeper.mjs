// SPDX-License-Identifier: CC0-1.0
// Original trajectory-first goalkeeper actions. Canonical18, metres, +Y up,
// +Z forward. Ball trajectories are authored before and independently of IK.
import {pose, solve, euler, rotate, add, sub, slerp} from './rig.mjs';

const RATE = 120;
const SOLE = [0, -.08, 0];
const PALM = [0, -.065, .025];
const RADIUS = .105;
const clamp = x => Math.max(0, Math.min(1, x));
const S = x => (x = clamp(x), x*x*x*(10+x*(-15+6*x)));
const mix = (a,b,u) => a.map((v,i) => v+(b[i]-v)*u);
const sides = [['Left',1],['Right',-1]];
const feet = {Left:[.16,.084,0],Right:[-.16,.084,0]};

function readyPose(t=0, left=feet.Left, right=feet.Right) {
  const breath = .002*(1-Math.cos(2*Math.PI*t/3.2));
  const p = pose({hips:[0,.75+breath,0],hipPitch:2,spinePitch:1.2,chestPitch:.8,
    head:-3,leftFoot:left,rightFoot:right,leftKnee:[0,0,1],rightKnee:[0,0,1]});
  for (const [side,sign] of sides) {
    // Upper arms stay close to the ribcage:16° lateral and12° forward.
    p.rotations[side+'Arm'] = euler(-12,0,sign*16);
    p.rotations[side+'ForeArm'] = euler(-70);
    p.rotations[side+'Hand'] = euler(-6,sign*4,0);
  }
  return p;
}

function makeFrames(duration, evaluator) {
  return Array.from({length:Math.round(duration*RATE)+1},(_,i) => {
    const time=i/RATE, p=evaluator(time);
    return {time,hips:p.hips,rotations:p.rotations};
  });
}

function common(id,label,duration,loop,frames) {
  return {id,label,duration,durationSeconds:duration,loop,nativeRate:RATE,
    frameCount:frames.length,role:'keeper',category:'keeper',speedMps:0,
    locomotion:false,rootMotion:false,symmetryMode:'structural',frames};
}

// Lead foot opens, trailing foot follows; return in the opposite order.
// World-space foot anchors are held throughout every declared support window.
const shuffleSteps = {
  Left:[{start:.2,end:.55,from:.16,to:.48},{start:2.25,end:2.60,from:.48,to:.16}],
  Right:[{start:.65,end:1,from:-.16,to:.16},{start:1.8,end:2.15,from:.16,to:-.16}],
};
function shuffleTravel(t) {
  const x=t<=1.3?.32*S(t/1.3):t<=1.6?.32:t<=2.9?.32*(1-S((t-1.6)/1.3)):0;
  return [x,0,0];
}
function shuffleFoot(side,t) {
  let x=feet[side][0],y=.084;
  for (const step of shuffleSteps[side]) {
    if (t<step.start) break;
    if (t>=step.end) {x=step.to;continue;}
    const u=(t-step.start)/(step.end-step.start);
    x=step.from+(step.to-step.from)*S(u);
    y+=.055*Math.sin(Math.PI*u)**2;
    break;
  }
  return [x,y,0];
}
function buildReady() {
  const duration=3.2;
  const frames=makeFrames(duration,t => {
    const travel=shuffleTravel(t);
    return readyPose(t,sub(shuffleFoot('Left',t),travel),sub(shuffleFoot('Right',t),travel));
  });
  const supports=[],events=[];
  for (const [side] of sides) {
    let start=0;
    for (const step of shuffleSteps[side]) {
      supports.push({bone:side+'Foot',start,end:step.start,local:SOLE});
      events.push({type:'toeoff',bone:side+'Foot',time:step.start},
        {type:'footstrike',bone:side+'Foot',time:step.end});
      start=step.end;
    }
    supports.push({bone:side+'Foot',start,end:duration,local:SOLE});
  }
  return {...common('keeper_ready_side_steps','מוכנות שוער וצעדי צד',duration,true,frames),
    category:'keeper-ready',supports,events,
    referenceTravel:{coordinateSpace:'external actor world path; Root remains fixed',
      samples:frames.map(({time})=>({time,position:shuffleTravel(time),yawRadians:0}))},
    notes:'Ready upper arms16° lateral/12° forward, elbows70° flexed. Four small non-crossing shuffle steps cover32cm sideways and return, with fixed world support anchors. Variable-speed agility action rather than a constant-speed run.',
    armConstraint:{upperArmMaxDegrees:30,meaning:'upper-arm deviation from torso-down direction; not a limit during catches'},
    movement:{lateralExcursionMeters:.32,stepCount:4,swingClearanceMeters:.055},
  };
}

// Independent ball path: approach, soft catch absorption, then a controlled
// lowering into a two-handed chest cradle. No ball point is read from FK.
function ballPath(kind,t) {
  const height=kind==='head'?1.49:1.155;
  if(t<=.75)return [0,height,1.65+( .38-1.65)*S(t/.75)];
  if(t<=1.08){const u=S((t-.75)/.33);return [0,height-.035*u,.38-.055*u];}
  if(t<=1.85){const u=S((t-1.08)/.77);return [0,(height-.035)+(1.095-(height-.035))*u,.325-.025*u];}
  return [0,1.095,.30];
}
function handOrientation(sign) {
  // The hand extends inward around the sphere, rather than through it.
  return euler(-20,0,-sign*85);
}
function palmTarget(center,sign) {
  const lateral=.089;
  return add(center,[sign*lateral,0,-Math.sqrt(RADIUS*RADIUS-lateral*lateral)]);
}
function catchPose(kind,t) {
  const p=readyPose(0),center=ballPath(kind,t),errors=[];
  for(const [side,sign] of sides){
    const orientation=handOrientation(sign),point=palmTarget(center,sign);
    const wrist=sub(point,rotate(orientation,PALM));
    errors.push(solve(p,side+'Arm',side+'ForeArm',side+'Hand',wrist,
      [sign*.7,-.6,-.3],orientation).error);
  }
  p.reachError=Math.max(...errors);
  return p;
}
function buildCatch(kind) {
  const duration=2.4,contact=.75,initial=readyPose(0),atCatch=catchPose(kind,contact);
  const frames=makeFrames(duration,t=>{
    if(t>=contact)return catchPose(kind,t);
    const u=S((t-.12)/(contact-.12)),p=structuredClone(initial);
    for(const [side]of sides)for(const suffix of ['Arm','ForeArm','Hand']){
      const bone=side+suffix;
      p.rotations[bone]=slerp(initial.rotations[bone],atCatch.rotations[bone],u);
    }
    return p;
  });
  const ballSamples=frames.map(({time})=>({time,position:ballPath(kind,time)}));
  const events=sides.map(([side])=>({type:'catch',bone:side+'Hand',time:contact,local:PALM}));
  events.push({type:'secure',time:1.08},{type:'cradle',time:1.85});
  const ballContacts=sides.map(([side])=>({bone:side+'Hand',start:contact,end:duration,local:PALM}));
  return {...common('keeper_catch_'+kind,kind==='head'?'תפיסה בעמידה בגובה ראש':'תפיסה בעמידה בגובה חזה',duration,false,frames),
    category:'keeper-catch',supports:sides.map(([side])=>({bone:side+'Foot',start:0,end:duration,local:SOLE})),
    events,ballContacts,ball:{radius:RADIUS,samples:ballSamples,independentTrajectory:true,
      authoring:'Analytic approach/absorption/cradle path authored in ballPath(); palms solve toward its surface. No FK-derived ball centers.'},
    referenceTravel:{coordinateSpace:'standing actor world position',samples:[
      {time:0,position:[0,0,0],yawRadians:0},{time:duration,position:[0,0,0],yawRadians:0}]},
    contactHeightMeters:kind==='head'?1.49:1.155,
    notes:'Standing two-handed catch at'+(kind==='head'?' head':' chest')+' height, soft absorption, then controlled chest cradle; both soles stay fixed. The ball is authored independently; local palm probes are constrained to its surface from catch through the held finish.',
    palmProbes:{LeftHand:PALM,RightHand:PALM},
  };
}

export function buildKeeper(){return [buildReady(),buildCatch('chest'),buildCatch('head')];}
