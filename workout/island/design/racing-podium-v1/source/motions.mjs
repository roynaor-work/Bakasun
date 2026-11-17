// Original CC0 racing ceremony choreography. The reviewed tennis-v7 two-bone IK
// method is adapted here for fixed feet, authored elbow poles and hand sockets.
import {createRequire} from 'node:module';
const require=createRequire('/tmp/racing-podium-tools/package.json');
const T=require('three');
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const baseR=[-.30,.97,.17],baseL=[.30,.97,.14],baseH=[0,-.035,0];
// [normalized time, right wrist, left wrist, hip offset, axial turn, lean, head]
const standing=[baseR,baseL,baseH,0,.015,0];
const key=(t,r=baseR,l=baseL,h=baseH,turn=0,lean=.015,head=0)=>[t,r,l,h,turn,lean,head];
const controls={
 exit_car:[
  key(0,[-.61,1.02,.20],[-.04,.99,.27],[-.40,-.28,-.04],-.12,.28,.07),
  key(.20,[-.65,1.03,.22],[-.03,1.12,.34],[-.40,-.26,-.02],-.12,.30,.05),
  key(.40,[-.60,1.08,.18],[-.06,1.15,.30],[-.35,-.19,.01],-.08,.25,.03),
  key(.67,[-.43,1.02,.17],[.18,1.05,.20],[-.18,-.07,.01],-.04,.12,.01),
  key(.88,[-.33,.97,.17],[.28,.97,.14],[-.03,-.035,0],0,.025,0),key(1),
 ],
 helmet_lift:[key(0),key(.15,[-.48,1.32,.30],[.25,1.10,.25],[0,-.035,0],-.03,-.01,-.05),
  key(.30,[-.18,1.63,.10],[.27,1.08,.20],[0,-.025,0],0,-.02,-.07),
  key(.48,[-.24,1.84,.10],[.27,1.08,.20],[0,-.012,0],0,-.025,-.07),
  key(.63,[-.30,1.93,.07],[.38,1.34,.15],[0,-.003,0],.04,-.025,-.10),
  key(.75,[-.42,1.63,.26],[.33,1.10,.17],[0,-.012,0],0,-.01,-.04),
  key(.90,[-.42,1.12,.25],baseL,baseH),key(1)],
 wave:[key(0),key(.22,[-.40,1.76,.15],baseL,[0,-.020,0],-.06,-.01,-.025),
  key(.36,[-.46,1.80,.12],baseL,[0,-.020,0],.02,-.01,-.025),
  key(.48,[-.35,1.80,.16],baseL,[0,-.020,0],-.02,-.01,-.025),
  key(.60,[-.46,1.80,.12],baseL,[0,-.020,0],.02,-.01,-.025),
  key(.72,[-.35,1.80,.16],baseL,[0,-.020,0],-.02,-.01,-.025),key(1)],
 disappointment:[key(0),key(.20,[-.30,.96,.20],[.30,.96,.20],[0,-.050,0],0,.09,.18),
  key(.42,[-.18,1.51,.18],[.18,1.51,.18],[0,-.065,0],0,.16,.30),
  key(.66,[-.16,1.49,.18],[.16,1.49,.18],[0,-.065,0],-.04,.16,.30),
  key(.83,[-.30,.99,.20],[.30,.99,.20],[0,-.050,0],0,.08,.14),key(1)],
 handshake:[key(0),key(.22,[-.16,1.10,.43],baseL,baseH,-.035,.025,0),
  key(.39,[-.16,1.14,.43],baseL,baseH,-.035,.025,0),
  key(.52,[-.16,1.10,.43],baseL,baseH,-.035,.025,0),
  key(.65,[-.16,1.14,.43],baseL,baseH,-.035,.025,0),
  key(.78,[-.16,1.10,.43],baseL,baseH,-.035,.025,0),key(1)],
 trophy_lift:[key(0),key(.19,[-.29,1.18,.33],[.20,1.17,.32],[0,-.042,0],-.06,.035,-.03),
  key(.39,[-.25,1.69,.27],[.21,1.45,.27],[0,-.016,0],0,-.02,-.10),
  key(.56,[-.29,1.93,.14],[.40,1.77,.17],[0,-.003,0],.02,-.025,-.14),
  key(.72,[-.29,1.93,.14],[.40,1.77,.17],[0,-.003,0],.02,-.025,-.14),
  key(.89,[-.31,1.10,.23],[.28,1.03,.18],[0,-.035,0],0,.01,-.02),key(1)],
};
export const motionDefs=[
 {id:'exit_car',label:'ירידה מהרכב',duration:3.8,loop:false,events:[{type:'seat_release',time:1.0},{type:'right_plant',time:1.52},{type:'left_plant',time:3.34}]},
 {id:'helmet_lift',label:'הרמת קסדה',duration:3.6,loop:false,events:[{type:'helmet_raise',time:1.08},{type:'helmet_salute',time:2.268}]},
 {id:'wave',label:'נפנוף ידיים',duration:3.6,loop:true,events:[{type:'wave',time:1.30}]},
 {id:'victory_dance',label:'ריקוד שמחה',duration:3.6,loop:true,events:[{type:'celebrate',time:.9},{type:'celebrate',time:2.7}]},
 {id:'disappointment',label:'אכזבה',duration:3.8,loop:false,events:[{type:'head_down',time:1.6}]},
 {id:'handshake',label:'לחיצת יד',duration:3.2,loop:false,events:[{type:'hand_contact_start',time:.704},{type:'hand_contact_end',time:2.496}]},
 {id:'podium_idle',label:'עמידה על הפודיום',duration:3.2,loop:true,events:[]},
 {id:'trophy_lift',label:'הרמת גביע',duration:4.2,loop:false,events:[{type:'trophy_high',time:2.352},{type:'confetti',time:2.52}]},
];
function interpolate(keys,t){
 let a=keys[0],b=keys.at(-1);
 for(let i=0;i<keys.length-1;i++)if(t>=keys[i][0]&&t<=keys[i+1][0]){a=keys[i];b=keys[i+1];break;}
 const u=smooth((t-a[0])/Math.max(1e-9,b[0]-a[0]));
 return a.slice(1).map((x,i)=>Array.isArray(x)?x.map((v,j)=>lerp(v,b[i+1][j],u)):lerp(x,b[i+1],u));
}
export function createMotionBaker(rig,soleY=-.08525){
 const group=new T.Group(),bones={},rest={};
 for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);bones[j.name]=b;
  rest[j.name]=V().fromArray(j.worldPosition);if(j.parent)bones[j.parent].add(b);else group.add(b);}
 group.updateMatrixWorld(true);
 const worldPos=n=>bones[n].getWorldPosition(V()),worldQ=n=>bones[n].getWorldQuaternion(Q());
 const orient=(n,q)=>{bones[n].quaternion.copy(bones[n].parent.getWorldQuaternion(Q()).invert().multiply(q));group.updateMatrixWorld(true);};
 function ik(side,limb,target,pole){
  const [a,b,c]=limb==='arm'?[side+'Arm',side+'ForeArm',side+'Hand']:[side+'UpLeg',side+'Leg',side+'Foot'];
  const origin=worldPos(a),upper=rest[b].clone().sub(rest[a]),lower=rest[c].clone().sub(rest[b]);
  const la=upper.length(),lb=lower.length(),direction=target.clone().sub(origin),requestedDistance=direction.length();
  const distance=clamp(requestedDistance,Math.abs(la-lb)+.004,la+lb-.003);direction.normalize();
  const resolved=origin.clone().addScaledVector(direction,distance);
  const cosine=clamp((la*la+distance*distance-lb*lb)/(2*la*distance),-1,1);
  const perpendicular=pole.clone().sub(origin);perpendicular.addScaledVector(direction,-perpendicular.dot(direction)).normalize();
  const middle=origin.clone().addScaledVector(direction,la*cosine).addScaledVector(perpendicular,la*Math.sqrt(1-cosine*cosine));
  orient(a,Q().setFromUnitVectors(upper.clone().normalize(),middle.clone().sub(origin).normalize()));
  orient(b,Q().setFromUnitVectors(lower.clone().normalize(),resolved.clone().sub(middle).normalize()));
  return {error:worldPos(c).distanceTo(resolved),clamped:Math.abs(requestedDistance-distance)};
 }
 const ankleY=-soleY+.001; // Actual generated outsole bottom, plus a 1 mm clearance.
 function pose(id,t){
  for(const j of rig.joints){bones[j.name].position.fromArray(j.translation);bones[j.name].quaternion.identity();}
  let [r,l,h,turn,lean,head]=controls[id]?interpolate(controls[id],t):standing.map(v=>Array.isArray(v)?[...v]:v);
  let bank=0,lf=V(.16,ankleY,-.07336),rf=V(-.16,ankleY,-.07336);
  if(id==='podium_idle'){
   const cycle=Math.sin(Math.PI*2*t);h[1]+=.003*cycle;r[1]+=.005*cycle;l[1]+=.005*cycle;head=.012*cycle;
  }
  if(id==='victory_dance'){
   const phase=t*Math.PI*2,beat=Math.sin(phase),pulse=Math.sin(phase*2);
   const envelope=Math.sin(Math.PI*t)**2;
   h=[.035*beat*envelope,-.035-.018*(1-Math.cos(phase*2))*.5*envelope,0];
   turn=.22*beat*envelope;bank=.055*beat*envelope;lean=.015;
   r=[-.30-.08*envelope,.97+(.36+.12*beat)*envelope,.17+.10*envelope];
   l=[.30+.08*envelope,.97+(.36-.12*beat)*envelope,.14+.10*envelope];
   lf.y+=.035*Math.max(0,beat)*envelope;rf.y+=.035*Math.max(0,-beat)*envelope;
   head=-.035*envelope;
  }
  if(id==='exit_car'){
   const step=smooth((t-.20)/.20),returnX=smooth((t-.68)/.20);
   rf.set(lerp(-.47,-.16,returnX),lerp(.20,ankleY,step)+.085*Math.sin(returnX*Math.PI),lerp(.32,-.07336,step));
   const leftStep=smooth((t-.42)/.24);
   lf.set(lerp(-.20,.16,leftStep),lerp(.25,ankleY,leftStep)+.065*Math.sin(leftStep*Math.PI),lerp(.35,-.07336,leftStep));
   if(t>=.88){lf.set(.16,ankleY,-.07336);rf.set(-.16,ankleY,-.07336);}
  }
  bones.Hips.position.add(V(...h));bones.Hips.quaternion.setFromEuler(new T.Euler(lean,turn*.28,bank));
  bones.Spine.quaternion.setFromEuler(new T.Euler(-lean*.3,turn*.33,0));
  bones.Chest.quaternion.setFromEuler(new T.Euler(-lean*.3,turn*.39,0));
  bones.Head.quaternion.setFromEuler(new T.Euler(head-lean*.3,-turn*.30,0));group.updateMatrixWorld(true);
  const errors=[];
  errors.push(ik('Left','leg',lf,V(.20,.55,1.2)),ik('Right','leg',rf,V(-.20,.55,1.2)));
  orient('LeftFoot',Q());orient('RightFoot',Q());
  errors.push(ik('Right','arm',V(...r),V(-1.0,1.05,.50)),ik('Left','arm',V(...l),V(1.0,1.05,.50)));
  orient('LeftHand',Q());orient('RightHand',Q());
  // The wrist rolls during the wave while the raised arm stays articulated.
  if(id==='wave'){
   const envelope=smooth(t/.22)*(1-smooth((t-.72)/.28));
   orient('RightHand',Q().setFromEuler(new T.Euler(.08*envelope,.10*Math.sin(t*Math.PI*8)*envelope,.12*Math.sin(t*Math.PI*8)*envelope)));
  }
  group.updateMatrixWorld(true);
  return {values:Object.fromEntries(rig.joints.map(j=>[j.name,{translation:bones[j.name].position.toArray(),rotation:bones[j.name].quaternion.toArray()}])),
   effectors:{leftFoot:worldPos('LeftFoot').toArray(),rightFoot:worldPos('RightFoot').toArray(),rightHand:worldPos('RightHand').toArray(),leftHand:worldPos('LeftHand').toArray()},
   maxReachError:Math.max(...errors.map(e=>e.error)),maxTargetClamp:Math.max(...errors.map(e=>e.clamped))};
 }
 const clips=[];
 for(const def of motionDefs){
  const count=Math.ceil(def.duration*30),times=Array.from({length:count+1},(_,i)=>def.duration*i/count),samples=times.map(t=>pose(def.id,t/def.duration));
  if(def.loop)samples[samples.length-1]=structuredClone(samples[0]);
  let supports=['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:def.duration,local:[0,soleY,0]}));
  if(def.id==='victory_dance')supports=[{bone:'RightFoot',start:0,end:1.8,local:[0,soleY,0]},{bone:'LeftFoot',start:1.8,end:3.6,local:[0,soleY,0]}];
  if(def.id==='exit_car')supports=[{bone:'RightFoot',start:1.52,end:2.584,local:[0,soleY,0]},{bone:'LeftFoot',start:2.508,end:3.8,local:[0,soleY,0]},{bone:'RightFoot',start:3.344,end:3.8,local:[0,soleY,0]}];
  clips.push({...def,times,samples,locomotion:false,floorY:0,soleLocal:[0,soleY,0],supports,ballVisible:false,checkHingeDirection:true,symmetryMode:'structural',rootMotion:false});
 }
 return {clips,pose};
}
