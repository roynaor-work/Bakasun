// Original tennis motion authoring in a calibrated canonical 18-bone hierarchy.
// Embedded animation tracks are standard glTF; IK is an authoring-time operation.
import {THREE as T} from './common.mjs';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const motionDefs=[
 {id:'idle',label:'עמידת מוצא',duration:2.4,loop:true,events:[]},
 {id:'run',label:'ריצה',duration:.72,loop:true,events:[{name:'left_plant',time:0},{name:'right_plant',time:.5}]},
 {id:'serve',label:'שירות',duration:3.2,loop:false,events:[
  {name:'prepare',time:0,label:'הכנה'},{name:'toss',time:.28,label:'זריקה'},
  {name:'load',time:.48,label:'העמסה'},{name:'contact',time:.64,label:'פגיעה ומעקב'}]},
 {id:'forehand',label:'פורהנד',duration:1.20,loop:false,events:[{name:'contact',time:.52}]},
 {id:'backhand',label:'בקהנד',duration:1.35,loop:false,events:[{name:'contact',time:.52}]},
 {id:'volley',label:'וולה',duration:.78,loop:false,events:[{name:'contact',time:.45}]},
 {id:'smash',label:'שמאש',duration:1.15,loop:false,events:[{name:'takeoff',time:.34},{name:'contact',time:.52},{name:'land',time:.82}]},
 {id:'slide',label:'החלקה',duration:1.45,loop:false,events:[{name:'brake',time:.35},{name:'contact',time:.58},{name:'recover',time:.85}]},
 {id:'celebrate',label:'חגיגה',duration:2.10,loop:false,events:[{name:'fist_pump',time:.30},{name:'settle',time:.85}]},
];
const control={
 serve:[
  [0,[-.40,1.02,.34],[.27,1.05,.30],[0,.48,.88],0,0],
  [.18,[-.50,.98,.28],[.20,1.13,.41],[0,.2,1],-.20,-.03],
  [.28,[-.57,1.10,.12],[.17,1.54,.30],[0,-.50,.86],-.42,-.08],
  [.46,[-.43,1.49,-.15],[.10,1.94,.20],[.08,-1,.1],-.50,-.14],
  [.55,[-.24,1.72,-.10],[.17,1.72,.30],[-.08,.7,-.7],-.28,-.05],
  [.64,[-.18,1.92,.25],[.24,1.37,.24],[.05,.99,.06],.10,.12],
  [.73,[.07,1.39,.70],[.27,1.15,.21],[.14,-.10,.99],.45,.04],
  [.86,[.24,.96,.40],[.27,1.08,.20],[.20,-.90,.30],.27,-.07],
  [1,[-.37,1.04,.35],[.27,1.06,.29],[0,.5,.87],0,-.03]
 ],
 forehand:[
  [0,[-.40,1.05,.34],[.27,1.08,.34],[0,.45,.9],0,-.04],
  [.25,[-.64,1.14,-.19],[.36,1.25,.35],[-.55,.80,-.1],-.70,-.10],
  [.40,[-.67,1.02,.20],[.36,1.25,.35],[-.60,.25,.76],-.45,-.08],
  [.52,[-.49,1.12,.56],[.31,1.20,.34],[-.3,.25,.92],.10,-.03],
  [.74,[.30,1.48,.36],[.30,1.13,.29],[.72,.65,.05],.70,-.02],
  [1,[-.40,1.05,.34],[.27,1.08,.34],[0,.45,.9],0,-.04]
 ],
 backhand:[
  [0,[-.18,1.13,.33],[-.20,1.09,.36],[0,.5,.86],0,-.05],
  [.27,[.22,1.30,-.02],[.29,1.26,-.10],[.55,.8,-.15],.65,-.11],
  [.44,[.22,1.18,.25],[.37,1.10,.27],[.63,.38,.68],.32,-.08],
  [.52,[.17,1.25,.34],[.28,1.17,.55],[.45,.24,.86],-.10,-.03],
  [.76,[-.20,1.49,.31],[-.42,1.59,.33],[-.76,.62,.15],-.65,.01],
  [1,[-.18,1.13,.33],[-.20,1.09,.36],[0,.5,.86],0,-.05]
 ],
 volley:[
  [0,[-.30,1.24,.36],[.24,1.23,.36],[0,.95,.30],0,-.08],
  [.25,[-.47,1.25,.30],[.27,1.32,.32],[-.3,.95,.1],-.28,-.12],
  [.45,[-.45,1.31,.58],[.25,1.30,.35],[-.3,.93,.2],.05,-.08],
  [.70,[-.27,1.41,.64],[.23,1.26,.30],[-.1,.91,.4],.22,-.04],
  [1,[-.30,1.24,.36],[.24,1.23,.36],[0,.95,.30],0,-.08]
 ],
 smash:[
  [0,[-.40,1.07,.34],[.28,1.07,.32],[0,.5,.86],0,-.06],
  [.25,[-.45,1.52,-.17],[.20,1.89,.22],[0,-.90,-.30],-.38,-.16],
  [.40,[-.25,1.78,-.03],[.27,1.55,.35],[0,.70,-.72],-.25,.15],
  [.52,[-.16,2.00,.31],[.27,1.39,.31],[.02,.99,.10],.12,.20],
  [.68,[.02,1.26,.67],[.27,1.16,.29],[.05,-.55,.83],.40,.06],
  [.85,[.19,.97,.31],[.27,1.06,.29],[.10,-.9,.4],.28,-.13],
  [1,[-.40,1.07,.34],[.28,1.07,.32],[0,.5,.86],0,-.06]
 ],
 slide:[
  [0,[-.38,1.10,.33],[.29,1.13,.31],[0,.5,.86],0,-.07],
  [.28,[-.66,.89,.28],[.35,1.21,.19],[-.7,.30,.64],-.35,-.24],
  [.58,[-.66,.72,.48],[.38,1.17,.08],[-.7,.1,.7],.10,-.32],
  [.80,[-.24,1.14,.49],[.31,1.17,.21],[.35,.65,.67],.35,-.22],
  [1,[-.38,1.10,.33],[.29,1.13,.31],[0,.5,.86],0,-.07]
 ],
 celebrate:[
  [0,[-.39,1.05,.32],[.25,1.08,.30],[0,.5,.86],0,-.03],
  [.20,[-.48,1.52,.20],[.40,1.57,.19],[0,.98,.18],-.15,.08],
  [.30,[-.54,1.70,.16],[.43,1.80,.18],[-.2,.97,.1],-.12,.11],
  [.48,[-.49,1.59,.16],[.36,1.56,.35],[-.15,.95,.25],.10,.02],
  [.66,[-.50,1.70,.15],[.43,1.79,.19],[-.2,.97,.1],-.10,.10],
  [.86,[-.42,1.24,.29],[.33,1.35,.32],[0,.9,.4],0,.02],
  [1,[-.39,1.05,.32],[.25,1.08,.30],[0,.5,.86],0,-.03]
 ]
};
function interpolate(keys,t){
 let a=keys[0],b=keys.at(-1);
 for(let i=0;i<keys.length-1;i++)if(t>=keys[i][0]&&t<=keys[i+1][0]){a=keys[i];b=keys[i+1];break;}
 const u=smooth((t-a[0])/Math.max(1e-9,b[0]-a[0]));
 return a.slice(1).map((x,i)=>Array.isArray(x)?x.map((v,j)=>lerp(v,b[i+1][j],u)):lerp(x,b[i+1],u));
}
export function createMotionBaker(rig){
 const group=new T.Group(),bones={},rest={};
 for(const j of rig.joints){
  const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);bones[j.name]=b;
  rest[j.name]=V().fromArray(j.worldPosition);if(j.parent)bones[j.parent].add(b);else group.add(b);
 }
 group.updateMatrixWorld(true);
 const worldPos=n=>bones[n].getWorldPosition(V());
 const worldQ=n=>bones[n].getWorldQuaternion(Q());
 function orient(n,q){
  const parent=bones[n].parent;
  bones[n].quaternion.copy(parent.getWorldQuaternion(Q()).invert().multiply(q));group.updateMatrixWorld(true);
 }
 function ik(side,limb,target,pole){
  const names=limb==='arm'?[side+'Arm',side+'ForeArm',side+'Hand']:[side+'UpLeg',side+'Leg',side+'Foot'];
  const [a,b,c]=names;const origin=worldPos(a);
  const upper=rest[b].clone().sub(rest[a]),lower=rest[c].clone().sub(rest[b]);
  const la=upper.length(),lb=lower.length();const direction=target.clone().sub(origin);const requestedDistance=direction.length();const distance=clamp(requestedDistance,Math.abs(la-lb)+.003,la+lb-.002);direction.normalize();
  const requested=target.toArray();target.copy(origin).addScaledVector(direction,distance);
  const cosine=clamp((la*la+distance*distance-lb*lb)/(2*la*distance),-1,1);
  const perpendicular=pole.clone().sub(origin);perpendicular.addScaledVector(direction,-perpendicular.dot(direction)).normalize();
  const middle=origin.clone().addScaledVector(direction,la*cosine).addScaledVector(perpendicular,la*Math.sqrt(1-cosine*cosine));
  orient(a,Q().setFromUnitVectors(upper.clone().normalize(),middle.clone().sub(origin).normalize()));
  orient(b,Q().setFromUnitVectors(lower.clone().normalize(),target.clone().sub(middle).normalize()));
  return {requested,resolved:target.toArray(),actual:worldPos(c).toArray(),goalClampedByMeters:Math.abs(requestedDistance-distance),reachError:worldPos(c).distanceTo(target)};
 }
 function pose(id,t){
  for(const j of rig.joints){bones[j.name].position.fromArray(j.translation);bones[j.name].quaternion.identity();}
  let r=V(-.18,1.10,.34),l=V(.08,1.32,.43),shaft=V(-.10,.75,.65),twist=0,hips=-.065;
  let leftFoot=V(.15,.106,.04),rightFoot=V(-.15,.106,-.04);
  let bank=0,lean=.05;
  if(id==='run'){
   const phase=t*Math.PI*2,s=Math.sin(phase),co=Math.cos(phase);
   hips=-.055+.022*Math.cos(phase*2);lean=.18;
   r=V(-.23,1.06,.19+s*.29);l=V(.23,1.06,.19-s*.29);shaft=V(-.15,.80,.55);
   leftFoot=V(.13,.106+Math.max(0,s)*.20,.28*co);
   rightFoot=V(-.13,.106+Math.max(0,-s)*.20,-.28*co);
  }else if(control[id]){
   const values=interpolate(control[id],t);r.fromArray(values[0]);l.fromArray(values[1]);shaft.fromArray(values[2]);twist=values[3];hips=values[4];
   if(id==='serve'){leftFoot.set(.14,.106,.13);rightFoot.set(-.15,.106,-.21);lean=.05+.20*Math.sin(t*Math.PI*2);
    if(t>.53&&t<.78){const h=Math.sin((t-.53)/.25*Math.PI)*.08;leftFoot.y+=h;rightFoot.y+=h;}}
   if(id==='smash'){const h=t>.30&&t<.82?Math.sin((t-.30)/.52*Math.PI)*.18:0;leftFoot.y+=h;rightFoot.y+=h;}
   if(id==='forehand'){leftFoot.x=.23;leftFoot.z=.07;rightFoot.x=-.23;rightFoot.z=-.10;}
   if(id==='backhand'){leftFoot.x=.20;leftFoot.z=-.07;rightFoot.x=-.19;rightFoot.z=.10;}
   if(id==='volley'){rightFoot.z=.20*smooth(t/.45);leftFoot.z=-.06;}
   if(id==='slide'){const amount=Math.sin(Math.PI*t);rightFoot.x=-.18-amount*.38;leftFoot.x=.18+amount*.12;leftFoot.z=-.05;rightFoot.z=.18;bank=-amount*.16;lean=.17;}
   if(id==='celebrate'){const h=Math.max(0,hips-.02);leftFoot.y+=h*.6;rightFoot.y+=h*.6;lean=-.02;}
  }else{hips+=Math.sin(t*Math.PI*2)*.008;r.y+=Math.sin(t*Math.PI*2)*.009;l.y+=Math.sin(t*Math.PI*2)*.009;}
  bones.Hips.position.y+=hips;bones.Hips.quaternion.setFromEuler(new T.Euler(lean,twist*.28,bank));
  bones.Spine.quaternion.setFromEuler(new T.Euler(-lean*.3,twist*.33,0));
  bones.Chest.quaternion.setFromEuler(new T.Euler(-lean*.3,twist*.39,0));
  bones.Head.quaternion.setFromEuler(new T.Euler(-lean*.3,-twist*.30,0));group.updateMatrixWorld(true);
  const errors=[];
  errors.push(ik('Left','leg',leftFoot,V(.18,.5,1.2)),ik('Right','leg',rightFoot,V(-.18,.5,1.2)));
  orient('LeftFoot',Q());orient('RightFoot',Q());
  const rPole=(id==='serve'||id==='smash')?V(-1.2,1.20,-.30):V(-1.4,.75,.6);
  errors.push(ik('Right','arm',r,rPole));
  shaft.normalize();let normal=V(0,0,1);
  if(Math.abs(shaft.dot(normal))>.94)normal=V(0,1,0);
  normal.addScaledVector(shaft,-normal.dot(shaft)).normalize();
  const across=V().crossVectors(shaft,normal).normalize();
  orient('RightHand',Q().setFromRotationMatrix(new T.Matrix4().makeBasis(across,shaft,normal)));
  if(id==='backhand'){
   l=V(-.09,.065,0).applyQuaternion(worldQ('RightHand')).add(worldPos('RightHand'));
   errors.push(ik('Left','arm',l,V(.35,.70,.85)));orient('LeftHand',worldQ('RightHand'));
  }else{
   const leftPole=['serve','smash','celebrate'].includes(id)?V(.75,1.25,-.1):V(.35,.65,.85);
   errors.push(ik('Left','arm',l,leftPole));orient('LeftHand',Q().setFromEuler(new T.Euler(.15,0,.15)));
  }
  group.updateMatrixWorld(true);
  const sweet=V(-.045,.44,-.014).applyMatrix4(bones.RightHand.matrixWorld);
  return {values:Object.fromEntries(rig.joints.map(j=>[j.name,{translation:bones[j.name].position.toArray(),rotation:bones[j.name].quaternion.toArray()}])),
   sweetSpot:sweet.toArray(),effectors:{leftFoot:worldPos('LeftFoot').toArray(),rightFoot:worldPos('RightFoot').toArray(),rightHand:worldPos('RightHand').toArray()},
   maxReachError:Math.max(...errors.map(e=>e.reachError))};
 }
 const clips=[];
 for(const def of motionDefs){
  const times=[...new Set([0,1,...def.events.map(e=>e.time),...Array.from({length:Math.ceil(def.duration*30)+1},(_,i)=>Math.min(1,i/(def.duration*30)))])].sort((a,b)=>a-b);
  const samples=times.map(t=>pose(def.id,t));
  if(def.loop)samples[samples.length-1]=structuredClone(samples[0]);
  clips.push({...def,times:times.map(t=>t*def.duration),samples,
   rootMotion:false,events:def.events.map(e=>({...e,atSeconds:e.time*def.duration})),
   contactSweetSpot:def.events.some(e=>e.name==='contact')?pose(def.id,def.events.find(e=>e.name==='contact').time).sweetSpot:null});
 }
 return {clips,pose};
}
