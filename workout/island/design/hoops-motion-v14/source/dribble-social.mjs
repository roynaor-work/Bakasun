// SPDX-License-Identifier: CC0-1.0
// Original canonical18 ball handling, pivot and sportsmanship motions.
// Metres, +Y up, +Z forward; simulation travel is applied exactly once.
import {bones,I,pose,point,solve,euler,rotate,add,sub,mul,slerp,mix} from '../../soccer-header-v1/source/rig.mjs';
import {idlePose} from '../../hoops-motion-v13/source/locomotion.mjs';
import {createBallActions} from '../../hoops-motion-v13/source/ball-actions.mjs';

const R=.12,PALM=[0,-.08,.025],SOLE=[0,-.08,0],TAU=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const S=x=>(x=clamp(x),x*x*x*(10+x*(-15+6*x)));
const curve=(keys,t)=>{if(t<=keys[0][0])return structuredClone(keys[0][1]);for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],S((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return structuredClone(keys.at(-1)[1]);};
const foot=(side,width=.108)=>[(side==='Left'?1:-1)*width,.08,0];
const staticTravel=D=>({coordinateSpace:'simulation-owned demonstration world; never embedded Root translation',samples:[{time:0,position:[0,0,0],yawRadians:0},{time:D,position:[0,0,0],yawRadians:0}]});
const supports=(D,width=.108)=>['Left','Right'].map(side=>({bone:side+'Foot',start:0,end:D,local:SOLE,anchor:[foot(side,width)[0],0,0]}));
function plant(p,width=.108){for(const side of ['Left','Right'])solve(p,side+'UpLeg',side+'Leg',side+'Foot',foot(side,width),[0,0,1],I);return p;}
function hand(p,side,surface,amount=1,orientation=I,pole){
 const names=[side+'Arm',side+'ForeArm',side+'Hand'],before=names.map(n=>[...p.rotations[n]]),sign=side==='Left'?1:-1;
 solve(p,names[0],names[1],names[2],sub(surface,rotate(orientation,PALM)),pole??[sign*.45,-.3,-.5],orientation);
 if(amount<1)names.forEach((n,i)=>p.rotations[n]=slerp(before[i],p.rotations[n],amount));
}
function entry(id,label,D,sample,metadata={}){
 const frames=Array.from({length:Math.round(D*30)+1},(_,i)=>{const time=i/30,p=sample(time);return {time,hips:p.hips,rotations:p.rotations};});
 return {id,label,duration:D,durationSeconds:D,nativeRate:30,frameCount:frames.length,category:'action',locomotion:false,speedMps:0,rootMotion:false,loop:false,symmetryMode:'structural',supports:supports(D),events:[],referenceTravel:staticTravel(D),
  entry:{reference:'idle',phase:0,blendSeconds:.4,alternatives:[{reference:'run',phase:0,blendSeconds:.35}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'},
  exit:{reference:'idle',phase:0,blendSeconds:.4,alternatives:[{reference:'run',phase:0,blendSeconds:.35}],curve:'C1 velocity-aware runtime bridge',footLock:'carry-until-release'},
  license:'CC0-1.0',...metadata,frames};
}

function dribble(id){
 const behind=id==='dribble_behind',D=3.2,T=.8,width=behind?.108:.205,hip=behind?.765:.70;
 // Every hand-to-hand transfer has an independent floor rebound. At the
 // midpoint the ball passes behind the pelvis or through the spread legs.
 const ball=t=>{
  const phase=t/T,u=phase-Math.floor(phase),x=-.31*Math.cos(Math.PI*phase);
  const y=R+(.94-R)*(u<=.5?1-4*u*u:1-4*(1-u)*(1-u));
  const z=behind?-.20-.065*Math.sin(Math.PI*u)**2:.19-.19*Math.sin(Math.PI*u)**2;
  return [x,y,z];
 };
 const sample=t=>{
  const phase=t/T,weight=.5+.5*Math.cos(Math.PI*phase),p=idlePose(0);
  p.hips=[.015*Math.sin(Math.PI*phase),hip+.006*Math.sin(TAU*phase),0];
  p.rotations.Hips=euler(behind?2:10,5*Math.sin(Math.PI*phase),0);
  p.rotations.Spine=euler(behind?0:5,behind?14*Math.sin(Math.PI*phase):4*Math.sin(Math.PI*phase),0);
  p.rotations.Chest=euler(behind?-2:3,behind?16*Math.sin(Math.PI*phase):5*Math.sin(Math.PI*phase),0);
  p.rotations.Head=euler(behind?2:7,-5*Math.sin(Math.PI*phase));plant(p,width);
  const b=ball(t),surface=[b[0],Math.max(.78,b[1]+R),b[2]];
  hand(p,'Right',surface,weight,I,behind?[-.8,-.2,.1]:undefined);hand(p,'Left',surface,1-weight,I,behind?[.8,-.2,.1]:undefined);
  return p;
 };
 const events=[];
 for(let k=0;k<=Math.round(D/T);k++){
  const time=k*T,bone=k%2?'LeftHand':'RightHand',position=ball(time),p=sample(time),marker=point(p,bone,PALM);
  events.push({type:'contact',time,bone,local:PALM,heightMeters:marker[1],positionMeters:marker,ballCenterMeters:position,handSide:k%2?'left':'right'});
  if(time+T/2<D){const bounce=time+T/2;events.push({type:'bounce',time:bounce,surface:'floor',position:ball(bounce),positionMeters:[ball(bounce)[0],0,ball(bounce)[2]],heightMeters:0,ballCenterHeightMeters:R});}
 }
 return entry(id,behind?'כדרור מאחורי הגב':'כדרור בין הרגליים',D,sample,{category:'dribble',kind:id,loop:true,supports:supports(D,width),events,
  ball:{radius:R,trajectory:'Independent alternating ballistic parabola with a floor rebound midway between each pair of hand contacts.',samples:Array.from({length:Math.round(D*120)+1},(_,i)=>({time:i/120,position:ball(i/120)}))},
  handContactConvention:'PALM [0,-.08,.025] touches the regulated sphere upper surface at each explicitly marked apex.',
  actionGeometry:{floorHeightMeters:0,ballRadiusMeters:R,stanceWidthMeters:width*2,bouncePositionMeters:ball(T/2),transferPlane:behind?'behind pelvis, z negative':'between spread legs, z zero at floor rebound'},
  notes:behind?'Four alternating transfers behind the pelvis, shoulder rotation, right/left reception and fixed support feet.':'Four low alternating transfers through a 0.41m stance; the ball crosses the leg gap at floor level, with knee flexion and opposite-hand reception.'});
}

function pivot(){
 const D=4,anchor=[.108,0,0];
 const yaw=t=>Math.PI*S((t-.8)/2.2);
 const travel=t=>sub(anchor,rotate(euler(0,yaw(t)*180/Math.PI),anchor));
 const sample=t=>{
  const a=S((t-.25)/.5)*(1-S((t-3.2)/.55)),p=idlePose(0);
  p.hips=[.01*Math.sin(Math.PI*t/D)*a,.835-.075*a,0];
  p.rotations.Hips=euler(2,4*Math.sin(Math.PI*t/D)*a,0);
  p.rotations.Spine=euler(2,8*Math.sin(Math.PI*t/D)*a,0);
  p.rotations.Chest=euler(1,8*Math.sin(Math.PI*t/D)*a,0);
  p.rotations.Head=euler(0,22*Math.sin(Math.PI*t/D)*a,0);
  solve(p,'LeftUpLeg','LeftLeg','LeftFoot',foot('Left'),[0,0,1],I);
  const lift=.11*S((t-.55)/.3)*(1-S((t-2.9)/.3));
  solve(p,'RightUpLeg','RightLeg','RightFoot',[-.108,.08+lift,-.045*lift/.11],[0,0,1],I);
  for(const [side,sign]of[['Left',1],['Right',-1]]){
   const surface=[sign*.18,1.04,.27];hand(p,side,surface,a);
  }
  return p;
 };
 const events=[{type:'pivot_plant',time:.55,bone:'LeftFoot',local:SOLE,heightMeters:0,positionMeters:anchor},{type:'pivot_turn',time:1.9,bone:'LeftFoot',local:SOLE,heightMeters:0,positionMeters:anchor},{type:'footstrike',time:3.2,bone:'RightFoot',local:SOLE,heightMeters:0}];
 return entry('pivot','סיבוב על רגל ציר',D,sample,{category:'pivot',kind:'pivot',events,
  supports:[{bone:'LeftFoot',start:0,end:D,local:SOLE,anchor},{bone:'RightFoot',start:0,end:.55,local:SOLE},{bone:'RightFoot',start:3.2,end:D,local:SOLE}],
  referenceTravel:{coordinateSpace:'simulation-owned world rotation about planted left sole; never embedded Root motion',samples:Array.from({length:D*120+1},(_,i)=>({time:i/120,position:travel(i/120),yawRadians:yaw(i/120)}))},
  actionGeometry:{pivotBone:'LeftFoot',pivotPointWorldMeters:anchor,turnRadians:Math.PI,floorHeightMeters:0},
  notes:'A 180-degree front pivot: the left sole remains the world-space pivot, the right shoe lifts before turning and plants after completion. Actor origin travels around the fixed pivot.'});
}

function help(){
 const D=4.8,contactStart=1.3,contactEnd=2.9,partnerPosition=[0,0,.84],partnerYaw=Math.PI;
 const shared=t=>curve([[0,[-.13,.72,.46]],[contactStart,[-.13,.75,.46]],[contactEnd,[-.13,1.05,.39]],[D,[-.13,1.05,.39]]],t);
 const activation=t=>S((t-.35)/.9)*(1-S((t-3.0)/1.1));
 const sample=t=>{
  const a=activation(t),load=curve([[0,0],[.35,0],[1.1,1],[1.7,1],[2.9,.1],[3.7,0],[D,0]],t),p=idlePose(0);
  p.hips=[0,.835-.18*load,-.035*a];
  p.rotations.Hips=euler(11*load,-4*a,0);p.rotations.Spine=euler(14*load,-3*a,0);p.rotations.Chest=euler(10*load,0,0);p.rotations.Head=euler(10*load,-6*a,0);
  plant(p,.108);
  hand(p,'Right',shared(t),a);
  // The free arm counterbalances the assisted hand without an IK orientation
  // branch near the shoulder: its elbow stays relaxed in one flexion plane.
  p.rotations.LeftArm=slerp(p.rotations.LeftArm,euler(-18,0,18),a);
  p.rotations.LeftForeArm=slerp(p.rotations.LeftForeArm,euler(-55),a);
  return p;
 };
 const partnerSample=t=>{
  const rise=S((t-1.5)/1.6),hip=mix(.47,.835,rise),p=pose({hips:[0,hip,0],hipPitch:8*(1-rise),spinePitch:7*(1-rise),chestPitch:6*(1-rise),head:8*(1-rise),leftFoot:[.14,.08,.09*(1-rise)],rightFoot:[-.14,.08,.09*(1-rise)]});
  const surface=rotate(euler(0,-180,0),sub(shared(t),partnerPosition));
  hand(p,'Left',surface,activation(t),euler(0,-180,0));
  hand(p,'Right',[-.24,hip+.07,.20],1);
  return p;
 };
 const marker=point(sample(contactStart),'RightHand',PALM);
 const events=[{type:'assist_contact',time:contactStart,bone:'RightHand',local:PALM,partnerBone:'LeftHand',heightMeters:marker[1],positionMeters:marker},{type:'assist_lift',time:2.1,bone:'RightHand',local:PALM,heightMeters:shared(2.1)[1],positionMeters:shared(2.1)},{type:'assist_release',time:contactEnd,bone:'RightHand',local:PALM,heightMeters:shared(contactEnd)[1],positionMeters:shared(contactEnd)}];
 return entry('help_up','עזרה לשחקן לקום',D,sample,{category:'sportsmanship',kind:'help_up',events,coreRange:{start:.35,end:4.1},
  partnerInteraction:{kind:'help-up',role:'teammate',positionMeters:partnerPosition,yawRadians:partnerYaw,
   frames:Array.from({length:Math.round(D*30)+1},(_,i)=>{const time=i/30,p=partnerSample(time);return {time,hips:p.hips,rotations:p.rotations};}),
   contact:{actorBone:'RightHand',partnerBone:'LeftHand',local:PALM,partnerLocal:PALM,start:contactStart,end:contactEnd,
    trajectory:Array.from({length:Math.round(D*120)+1},(_,i)=>({time:i/120,position:shared(i/120)}))}},
  actionGeometry:{floorHeightMeters:0,partnerPositionMeters:partnerPosition,assistContactStartSeconds:contactStart,assistContactEndSeconds:contactEnd,assistGripHeightRangeMeters:[.75,1.05]},
  notes:'The athlete flexes knees and trunk, clasps a seated teammate’s left hand, shifts weight backward while lifting, and opens the grip once the teammate stands. Both reference meshes retain canonical18 proportions.'});
}

export function createDribbleAndSocial(){
 const reactions=createBallActions().filter(c=>['celebrate_short','disappointed'].includes(c.id)).map(c=>({...c,id:c.id==='celebrate_short'?'celebrate_score':'disappointed',label:c.id==='celebrate_short'?'חגיגת סל':'התאכזבות',license:'CC0-1.0',derivation:'v13 original CC0 reaction mechanics, preserved with new v14 event metadata',events:[{type:c.id==='celebrate_short'?'score_reaction':'miss_reaction',time:1.3,heightMeters:point(c.frames[39],'Head')[1],bone:'Head',local:[0,0,0]}]}));
 return [dribble('dribble_behind'),dribble('dribble_between'),pivot(),...reactions,help()];
}
