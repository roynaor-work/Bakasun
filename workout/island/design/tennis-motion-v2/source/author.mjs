// SPDX-License-Identifier: CC0-1.0
// Original tennis choreography, baked analytic IK; equipment retains tennis-grip-v1's rigid mount.
import * as T from '../vendor/three.module.js';
import {bones,I,pose,solve,fk,rotate,add,sub,mul,qi,qm,slerp,smooth,clamp,euler,dot,unit} from './rig.mjs';
export {bones,fk};
export const RATE=30,HANDLE_CENTER=[0,-.055,.020],GRIP_Y=.065,HEAD_Y=.50;
export const ATTACH=[0,0,-0.8803408430861305,0.47434164901935494];
export const LEFT_ATTACH=[0,0,0.8803408430861305,0.47434164901935494];
export const HEAD_LOCAL=add(HANDLE_CENTER,rotate(ATTACH,[0,HEAD_Y-GRIP_Y,0]));
export const MOUNT={translation:[-0.05428570253711336,-0.019249999999272134,.02],rotation:ATTACH,scale:[1,1,1]};
const clone=x=>structuredClone(x),V=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
// Nonuniform cubic Hermite interpolation. Interior velocities are shared by both
// neighbouring pieces; endpoints rest. Unlike per-key easing this preserves motion through impact.
export function curve(keys,t){
 if(t<=keys[0][0])return clone(keys[0][1]);if(t>=keys.at(-1)[0])return clone(keys.at(-1)[1]);
 let i=1;while(t>keys[i][0])i++;const a=keys[i-1],b=keys[i],h=b[0]-a[0],u=(t-a[0])/h;
 const deriv=k=>{if(k===0||k===keys.length-1)return Array.isArray(keys[k][1])?keys[k][1].map(()=>0):0;const p=keys[k-1],c=keys[k],n=keys[k+1],h0=c[0]-p[0],h1=n[0]-c[0],d=(a,b,c)=>{const x=(b-a)/h0,y=(c-b)/h1;if(x*y<=0)return 0;const w0=2*h1+h0,w1=h1+2*h0;return(w0+w1)/(w0/x+w1/y);};return Array.isArray(p[1])?p[1].map((v,j)=>d(v,c[1][j],n[1][j])):d(p[1],c[1],n[1]);};
 const m=deriv(i-1),n=deriv(i),h00=2*u*u*u-3*u*u+1,h10=u*u*u-2*u*u+u,h01=-2*u*u*u+3*u*u,h11=u*u*u-u*u;
 return Array.isArray(a[1])?a[1].map((v,j)=>h00*v+h10*h*m[j]+h01*b[1][j]+h11*h*n[j]):h00*a[1]+h10*h*m+h01*b[1]+h11*h*n;
}
const ease=x=>(x=clamp(x),x*x*x*(10+x*(-15+6*x)));
const pulse=(u,a,b)=>u<=a||u>=b?0:Math.sin(Math.PI*(u-a)/(b-a))**2;
export function racketFrame(shaft,normal=[0,0,1]){
 const y=new T.Vector3(...shaft).normalize(),z=new T.Vector3(...normal);z.addScaledVector(y,-z.dot(y));
 if(z.lengthSq()<1e-6)z.set(1,0,0).addScaledVector(y,-y.x);z.normalize();const x=new T.Vector3().crossVectors(y,z).normalize();z.crossVectors(x,y);
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)).toArray();
}
const READY={r:[-.145,1.035,.29],shaft:[-.12,.98,.15],l:[.23,1.015,.22],h:.735,twist:0,lean:6,closed:1};
const ST={
 forehand:[[0,READY.r,READY.shaft,0,1],[.22,[-.39,1.04,-.08],[-.85,.45,-.18],-38,0],[.40,[-.40,.93,.14],[-.86,.08,.5],-25,0],[.53,[-.35,1.02,.40],[-.92,.28,.20],9,0],[.72,[.08,1.34,.31],[.73,.64,.22],38,0],[1,READY.r,READY.shaft,0,1]],
 backhand_two_handed:[[0,READY.r,READY.shaft,0,1],[.26,[.13,1.10,.24],[.74,.64,-.15],36,1],[.53,[.11,1.09,.41],[.93,.30,.05],-3,1],[.74,[-.12,1.29,.28],[-.62,.76,.18],-34,1],[1,READY.r,READY.shaft,0,1]],
 backhand_one_handed:[[0,READY.r,READY.shaft,0,1],[.25,[.14,1.04,.12],[.78,.55,-.25],36,0],[.53,[.16,1.08,.32],[.92,.27,.18],-9,0],[.74,[.23,1.33,.16],[.74,.66,.12],-32,0],[1,READY.r,READY.shaft,0,1]],
 volley_forehand:[[0,READY.r,READY.shaft,0,1],[.28,[-.27,1.17,.27],[-.40,.91,.05],-13,0],[.50,[-.29,1.21,.44],[-.34,.93,.1],9,0],[.68,[-.20,1.24,.46],[-.12,.98,.15],14,0],[1,READY.r,READY.shaft,0,1]],
 volley_backhand:[[0,READY.r,READY.shaft,0,1],[.28,[.13,1.18,.27],[.42,.90,-.04],18,0],[.50,[.13,1.22,.36],[.44,.89,.08],-7,0],[.68,[.13,1.25,.36],[.22,.96,.13],-15,0],[1,READY.r,READY.shaft,0,1]],
 slice:[[0,READY.r,READY.shaft,0,1],[.25,[.13,1.11,.24],[.74,.64,-.15],34,0],[.53,[.13,1.03,.32],[.87,.31,-.39],-8,0],[.73,[.15,1.02,.34],[.86,.18,-.47],-28,0],[1,READY.r,READY.shaft,0,1]],
 drop_shot:[[0,READY.r,READY.shaft,0,1],[.28,[-.35,.99,.19],[-.75,.65,-.05],-17,0],[.52,[-.32,1.02,.42],[-.76,.59,-.27],5,0],[.68,[-.25,1.11,.46],[-.60,.70,-.38],16,0],[1,READY.r,READY.shaft,0,1]],
 smash:[[0,READY.r,READY.shaft,0,1],[.22,[-.34,1.29,-.02],[-.29,.75,-.55],-27,0],[.39,[-.27,1.50,-.15],[-.25,.25,-.94],-20,0],[.54,[-.23,1.69,.15],[-.10,.99,.03],12,0],[.71,[.03,1.20,.41],[.45,-.38,.81],30,0],[1,READY.r,READY.shaft,0,1]],
 serve:[[0,READY.r,READY.shaft,0,1],[.16,[-.32,.99,.18],[-.50,.83,-.10],-15,0],[.3333333333,[-.39,1.31,-.02],[-.30,.74,-.60],-29,0],[.46,[-.25,1.49,-.16],[-.30,.20,-.93],-25,0],[.625,[-.22,1.64,.13],[-.11,.98,.05],7,0],[.76,[.02,1.18,.40],[.4,-.36,.84],27,0],[.88,[-.05,1.0,.31],[.25,.75,.61],15,0],[1,READY.r,READY.shaft,0,1]],
 recover:[[0,READY.r,READY.shaft,0,1],[.24,[-.28,1.09,.37],[-.35,.91,.20],-16,1],[.50,[-.11,1.11,.32],[.05,.98,.18],8,1],[.75,[-.16,1.045,.30],[-.16,.97,.19],-3,1],[1,READY.r,READY.shaft,0,1]],
 dive:[[0,READY.r,READY.shaft,0,1],[.22,[-.40,.98,.22],[-.75,.62,.15],-15,0],[.50,[-.96,1.04,.42],[-.90,.30,.12],-12,0],[.66,[-.85,.98,.36],[-.81,.55,.18],-5,0],[.83,[-.35,1.05,.32],[-.25,.95,.16],2,0],[1,READY.r,READY.shaft,0,1]],
 clay_slide:[[0,READY.r,READY.shaft,0,1],[.23,[-.40,1.02,.19],[-.81,.55,.08],-28,0],[.52,[-.59,.90,.36],[-.90,.27,.14],4,0],[.72,[-.42,1.05,.40],[-.75,.62,.18],23,0],[1,READY.r,READY.shaft,0,1]],
 celebrate:[[0,READY.r,READY.shaft,0,1],[.22,[-.29,1.03,.23],[-.30,.94,.16],0,0],[.43,[-.31,1.28,.17],[-.32,.93,.11],-8,0],[.65,[-.32,1.30,.16],[-.35,.93,.10],5,0],[1,READY.r,READY.shaft,0,1]],
 disappointed:[[0,READY.r,READY.shaft,0,1],[.25,[-.30,.95,.16],[-.42,.89,.14],0,0],[.57,[-.37,.85,.13],[-.53,.84,.13],-8,0],[.78,[-.25,.98,.19],[-.28,.94,.17],0,0],[1,READY.r,READY.shaft,0,1]],
 handshake:[[0,READY.r,READY.shaft,0,1],[.25,[-.35,.88,.10],[-.45,.88,.13],3,0],[.45,[-.36,.87,.08],[-.45,.88,.13],5,0],[.66,[-.36,.89,.08],[-.45,.88,.13],5,0],[1,READY.r,READY.shaft,0,1]],
 serve_prepare_1:[[0,READY.r,READY.shaft,0,1],[.25,[-.25,.98,.18],[-.34,.92,.13],-8,0],[.48,[-.29,.93,.15],[-.44,.87,.12],-13,0],[.73,[-.20,1.02,.23],[-.20,.97,.15],-6,1],[1,READY.r,READY.shaft,0,1]],
 serve_prepare_2:[[0,READY.r,READY.shaft,0,1],[.25,[-.31,1.08,.17],[-.47,.86,.15],-12,0],[.48,[-.34,1.21,.12],[-.55,.82,.13],-19,0],[.73,[-.24,1.07,.23],[-.28,.95,.15],-8,1],[1,READY.r,READY.shaft,0,1]],
 serve_prepare_3:[[0,READY.r,READY.shaft,0,1],[.23,[-.29,.94,.13],[-.35,.91,.20],-10,0],[.48,[-.38,1.11,.09],[-.66,.72,-.16],-23,0],[.75,[-.21,1.06,.22],[-.23,.96,.17],-8,1],[1,READY.r,READY.shaft,0,1]]
};
export const definitions=[
 {id:'serve_toss',label:'הגשה · הטלה',duration:2,phase:[0,2],release:1.6},
 {id:'serve_whip',label:'הגשה · הצלפה',duration:1.2,phase:[2,3.2],contact:1},
 {id:'serve_land',label:'הגשה · נחיתה',duration:1.6,phase:[3.2,4.8]},
 {id:'forehand',label:'פורהנד',duration:2.4,contact:1.2666666667},
 {id:'backhand_two_handed',label:'בקהנד · שתי ידיים',duration:2.6,contact:1.3666666667},
 {id:'backhand_one_handed',label:'בקהנד · יד אחת',duration:2.6,contact:1.3666666667},
 {id:'volley_forehand',label:'וולי · פורהנד',duration:1.8,contact:.9},
 {id:'smash',label:'סמאש',duration:2.8,contact:1.5},
 {id:'slice',label:'סלייס',duration:2.6,contact:1.3666666667},
 {id:'drop_shot',label:'דרופ שוט',duration:2.2,contact:1.1333333333},
 {id:'run_side',label:'ריצה צידה',duration:1.6,loop:true,locomotion:true},
 {id:'run_forward',label:'ריצה קדימה',duration:1.6,loop:true,locomotion:true},
 {id:'recover',label:'חזרה לעמידה',duration:2},
 {id:'ready',label:'עמידת קבלה',duration:2.4,loop:true},
 {id:'dive',label:'זינוק לכדור',duration:3.4,contact:1.7},
 {id:'clay_slide',label:'החלקה על חימר',duration:3.2,contact:1.6666666667},
 {id:'celebrate',label:'חגיגת נקודה',duration:3.2},
 {id:'disappointed',label:'התאכזבות',duration:3.2},
 {id:'handshake',label:'לחיצת ידיים ליד הרשת',duration:3.2},
 {id:'look_ball',label:'סיבוב מבט לכדור',duration:2.8},
 {id:'serve_prepare_1',label:'הכנה להגשה · הקפצה',duration:2.8},
 {id:'serve_prepare_2',label:'הכנה להגשה · הנפת מחבט',duration:2.8},
 {id:'serve_prepare_3',label:'הכנה להגשה · העברת משקל',duration:3.2},
 {id:'volley_backhand',label:'וולי · בקהנד',duration:1.8,contact:.9}
].map(d=>({...d,loop:d.loop??false,locomotion:d.locomotion??false}));
const CYCLE=.8,STANCE=.48,SPEED=.5;
export function footPlan(t,side,forward=false){
 const sign=side==='Left'?1:-1,offset=side==='Left'?0:.5,n=t/CYCLE+offset,k=Math.floor(n),phase=n-k;
 const anchor=SPEED*((k-offset)*CYCLE+STANCE*CYCLE/2),sweep=anchor-SPEED*t;
 let travel=sweep,lift=0;if(phase>STANCE){const u=(phase-STANCE)/(1-STANCE);travel+=SPEED*CYCLE*ease(u);lift=.10*Math.sin(Math.PI*u)**2;}
 return {p:forward?[sign*.18,.08+lift,travel]:[sign*.18+travel,.08+lift,sign*.035],plant:phase<=STANCE};
}
function station(id,u){
 const keys=ST[id];if(!keys)return clone(READY);
 return {...clone(READY),r:curve(keys.map(k=>[k[0],k[1]]),u),shaft:curve(keys.map(k=>[k[0],k[2]]),u),twist:curve(keys.map(k=>[k[0],k[3]]),u),closed:clamp(curve(keys.map(k=>[k[0],k[4]]),u))};
}
function quaternionCurve(keys,u){let i=1;while(i<keys.length-1&&u>keys[i][0])i++;const a=keys[i-1],b=keys[i];return slerp(a[1],b[1],ease((u-a[0])/(b[0]-a[0])));}
function poseOnly(def,t,height='medium'){
 const id=def.phase?'serve':def.id,globalT=def.phase?def.phase[0]+t:t,u=globalT/(def.phase?4.8:def.duration),s=station(id,u),activity=pulse(u,0,1);
 let hips=[0,s.h,0],leftFoot=[.18,.08,.035],rightFoot=[-.18,.08,-.035],roll=0,head=0,headYaw=-s.twist*.50;
 s.q=racketFrame(s.shaft);if(!['ready','backhand_two_handed','recover','run_side','run_forward','look_ball'].includes(id))s.closed=u<.16?1-ease(u/.16):u>.88?ease((u-.88)/.12):0;
 if(id==='ready')hips[1]+=.003*(1-Math.cos(u*Math.PI*2));
 if(id==='serve'){hips[1]+=curve([[0,0],[.33,-.025],[.48,-.015],[.625,.055],[.78,0],[1,0]],u);leftFoot[1]+=curve([[0,0],[.55,0],[.625,.055],[.73,0],[1,0]],u);rightFoot[1]+=curve([[0,0],[.55,0],[.64,.065],[.78,0],[1,0]],u);}
 if(id==='smash'){
  const lift=curve([[0,0],[.30,-.025],[.43,.06],[.54,.13],[.66,.06],[.77,0],[1,0]],u);hips[1]+=lift;
  const flight=Math.max(0,curve([[0,0],[.34,0],[.48,.11],[.57,.13],[.70,0],[1,0]],u));leftFoot[1]+=flight;rightFoot[1]+=flight;
 }
 if(id==='dive'){
  const a=curve([[0,0],[.22,.11],[.50,.43],[.66,.38],[.83,.10],[1,0]],u);hips[0]-=a;hips[1]+=.045*pulse(u,.12,.85);roll=28*pulse(u,.12,.85);s.lean+=18*pulse(u,.12,.85);
  leftFoot=curve([[0,leftFoot],[.18,leftFoot],[.32,[.13,.08,.035]],[.5,[-.05,.30,.015]],[.67,[-.03,.12,.035]],[.88,leftFoot],[1,leftFoot]],u);
  rightFoot=curve([[0,rightFoot],[.18,rightFoot],[.32,[-.24,.08,-.035]],[.5,[-.59,.26,-.08]],[.67,[-.52,.12,-.035]],[.88,rightFoot],[1,rightFoot]],u);
 }
 if(id==='clay_slide'){
  const a=curve([[0,0],[.18,.05],[.52,.24],[.72,.17],[1,0]],u);hips[0]-=a;hips[1]-=.105*pulse(u,.08,.91);roll=-7*pulse(u,.08,.91);
  leftFoot=curve([[0,leftFoot],[.18,leftFoot],[.53,[-.02,.08,.08]],[.69,[-.02,.08,.08]],[.90,leftFoot],[1,leftFoot]],u);
  rightFoot=curve([[0,rightFoot],[.18,rightFoot],[.53,[-.58,.08,-.08]],[.69,[-.58,.08,-.08]],[.90,rightFoot],[1,rightFoot]],u);
 }
 if(id==='celebrate')hips[1]+=.018*pulse(u,.2,.8);
 if(id==='disappointed'){s.lean+=10*pulse(u,.1,.9);head=22*pulse(u,.1,.9);hips[1]-=.015*activity;}
 if(id==='look_ball'){headYaw=curve([[0,0],[.25,-44],[.53,38],[.76,15],[1,0]],u);head=curve([[0,0],[.3,-18],[.58,-12],[1,0]],u);}
 if(id.startsWith('serve_prepare')){hips[1]-=.016*activity;hips[2]+=.025*Math.sin(u*Math.PI*2)*activity;}
 if(id==='run_side'||id==='run_forward'){leftFoot=footPlan(t,'Left',id==='run_forward').p;rightFoot=footPlan(t,'Right',id==='run_forward').p;hips[1]-=.012*(1-Math.cos(t/CYCLE*Math.PI*4));s.r[1]-=.006*(1-Math.cos(t/CYCLE*Math.PI*4));}
 // Height variant reaches the ball using arm height plus a partial body crouch.
 const contactU=id==='serve'?.625:def.contact===undefined?null:(def.phase?(def.phase[0]+def.contact)/4.8:def.contact/def.duration);
 const hOffset=typeof height==='number'?height:({low:-.16,medium:0,high:.16}[height]??0);
 let heightShift=0;if(contactU!==null&&hOffset){const w=Math.exp(-(((u-contactU)/.22)**4))*activity;s.r[1]+=hOffset*w;heightShift=hOffset*.70*w;hips[1]+=heightShift;}
 const rq=qm(s.q,qi(ATTACH)),rootR=sub(add(s.r,rotate(rq,HANDLE_CENTER)),rotate(s.q,[0,GRIP_Y,0])),lq=qm(s.q,qi(LEFT_ATTACH)),heldLeft=sub(add(rootR,rotate(s.q,[0,.153,0])),rotate(lq,HANDLE_CENTER));
 let freeLeft=curve([[0,READY.l],[.3,[.29,1.08,.20]],[.6,[.28,1.04,.20]],[1,READY.l]],u);
 if(['forehand','backhand_one_handed','slice'].includes(id))freeLeft=curve([[0,READY.l],[.25,[.34,1.20,.19]],[.60,[.36,1.15,.06]],[1,READY.l]],u);
 if(id==='serve'||id==='smash')freeLeft=curve([[0,READY.l],[.16,[.21,1.08,.30]],[.3333333333,[.15,1.59,.23]],[.45,[.13,1.62,.21]],[.625,[.27,1.21,.18]],[.78,[.27,1.02,.19]],[1,READY.l]],u);
 if(id==='dive')freeLeft=curve([[0,READY.l],[.3,[-.02,1.05,.15]],[.54,[-.12,1.08,.10]],[.77,[.06,1.03,.20]],[1,READY.l]],u);
 if(id==='celebrate')freeLeft=curve([[0,READY.l],[.23,[.28,1.15,.21]],[.42,[.23,1.58,.17]],[.55,[.21,1.44,.20]],[.68,[.23,1.56,.18]],[1,READY.l]],u);
 if(id==='handshake')freeLeft=curve([[0,READY.l],[.27,[.16,1.10,.35]],[.43,[.10,1.12,.46]],[.52,[.10,1.09,.46]],[.62,[.10,1.13,.46]],[.73,[.16,1.10,.35]],[1,READY.l]],u);
 if(id==='serve_prepare_1')freeLeft=curve([[0,READY.l],[.24,[.22,.93,.28]],[.41,[.23,.91,.28]],[.58,[.23,.93,.28]],[.76,[.22,.98,.25]],[1,READY.l]],u);
 freeLeft[1]+=heightShift;const left=V(freeLeft,heldLeft,s.closed),leftQ=slerp(euler(-25,0,-12),lq,s.closed),rightPole=id==='serve'||id==='smash'?[-1,-.10,-.35]:[-1,-.48,-.30],leftPole=[1,-.48,-.30];
 const p=pose({hips,hipYaw:s.twist*.18,twist:s.twist*.82,lean:s.lean,roll,headYaw,head:id==='serve'?-12*Math.sin(u*Math.PI)**2:head,
 rightHand:s.r,leftHand:left,rightHandAim:rq,leftHandAim:leftQ,rightElbow:rightPole,leftElbow:leftPole,leftFoot,rightFoot});
 // Relieve wrist through forearm pronation; never alter equipment's local matrix.
 const w=fk(p),forearm=unit(sub(w.RightHand.position,w.RightForeArm.position));
 const wristAngle=q=>Math.acos(clamp(dot(forearm,rotate(qm(q,qi(ATTACH)),[0,-1,0])),-1,1))*180/Math.PI;
 let desired=s.q;const shaft=new T.Vector3(...rotate(s.q,[0,1,0])),along=new T.Vector3(...forearm),angle=shaft.angleTo(along)*180/Math.PI;
 if(angle>116){const turn=new T.Quaternion().setFromUnitVectors(shaft,along);turn.slerp(new T.Quaternion(),116/angle);desired=new T.Quaternion(...s.q).premultiply(turn).toArray();}
 let finalQ=desired;
 if(wristAngle(desired)>58){const y=new T.Vector3(...rotate(desired,[0,1,0])),x=new T.Vector3(...forearm);x.addScaledVector(y,-x.dot(y));if(x.lengthSq()>1e-6){x.normalize();const z=new T.Vector3().crossVectors(x,y).normalize(),natural=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)).toArray(),limit=Math.max(58,wristAngle(natural)+.25);let lo=0,hi=1;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(wristAngle(slerp(desired,natural,mid))>limit)lo=mid;else hi=mid;}finalQ=slerp(desired,natural,hi);}}
 const finalHand=qm(finalQ,qi(ATTACH));p.rotations.RightHand=qm(qi(w.RightForeArm.rotation),finalHand);
 const finalRoot=sub(add(w.RightHand.position,rotate(finalHand,HANDLE_CENTER)),rotate(finalQ,[0,GRIP_Y,0])),finalLeftQ=qm(finalQ,qi(LEFT_ATTACH)),finalHeldLeft=sub(add(finalRoot,rotate(finalQ,[0,.153,0])),rotate(finalLeftQ,HANDLE_CENTER));
 solve(p,'LeftArm','LeftForeArm','LeftHand',V(freeLeft,finalHeldLeft,s.closed),leftPole);
 const leftParent=fk(p).LeftForeArm.rotation,readyQ=qm(racketFrame(READY.shaft),qi(LEFT_ATTACH));
 let leftWorld=finalLeftQ;
 if(!['ready','backhand_two_handed','recover','run_side','run_forward','look_ball'].includes(id)){
  const keys=id==='serve'||id==='smash'?[[0,readyQ],[.16,euler(-90,0,-12)],[.3333333333,euler(-150,0,-12)],[.45,euler(-150,0,-12)],[.625,euler(-90,0,-12)],[.78,euler(-25,0,-12)],[1,readyQ]]:[[0,readyQ],[.25,euler(-25,0,-12)],[.75,euler(-25,0,-12)],[1,readyQ]];
  leftWorld=slerp(quaternionCurve(keys,u),finalLeftQ,s.closed);
 }
 p.rotations.LeftHand=qm(qi(leftParent),leftWorld);const finalWorld=fk(p);p.targetWrist=s.r;p.targetLeft=V(freeLeft,finalHeldLeft,s.closed);p.reachError=Math.max(Math.hypot(...sub(finalWorld.RightHand.position,s.r)),Math.hypot(...sub(finalWorld.LeftHand.position,p.targetLeft)));p.time=t;p.leftOpen=1-s.closed;p.racketRoot=finalRoot;p.racketRotation=finalQ;p.referenceRoot=def.locomotion?(id==='run_forward'?[0,0,SPEED*t]:[SPEED*t,0,0]):[0,0,0];
 return p;
}
export function sample(def,t,height='medium'){if(typeof def==='string')def=definitions.find(d=>d.id===def);if(!def)throw new Error('Unknown clip');const at=def.loop&& (t<0||t>def.duration)?((t%def.duration)+def.duration)%def.duration:def.phase?t:clamp(t,0,def.duration);return poseOnly(def,at,height);}
export function sweetSpot(p){const w=fk(p).RightHand;return add(w.position,rotate(w.rotation,HEAD_LOCAL));}
function supports(def){
 const D=def.duration;if(def.phase){const windows=[];for(const [bone,land]of[['LeftFoot',4.8*.73],['RightFoot',4.8*.78]])for(const [start,end]of[[0,4.8*.55],[land,4.8]]){const a=Math.max(start,def.phase[0])-def.phase[0],b=Math.min(end,def.phase[1])-def.phase[0];if(b-a>.065)windows.push({bone,start:a,end:b,local:[0,-.08,0]});}return windows;}if(def.locomotion){const a=[];for(const [side,off]of[['Left',0],['Right',.5]])for(let k=-1;k<4;k++){const start=Math.max(0,(k-off)*CYCLE),end=Math.min(D,(k-off+STANCE)*CYCLE);if(end-start>.065)a.push({bone:side+'Foot',start,end,local:[0,-.08,0]});}return a;}
 if(def.id==='smash')return ['LeftFoot','RightFoot'].flatMap(bone=>[{bone,start:0,end:D*.30,local:[0,-.08,0]},{bone,start:D*.78,end:D,local:[0,-.08,0]}]);
 if(['dive','clay_slide'].includes(def.id))return ['LeftFoot','RightFoot'].flatMap(bone=>[{bone,start:0,end:D*.15,local:[0,-.08,0]},{bone,start:D*.93,end:D,local:[0,-.08,0]}]);
 return ['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:D,local:[0,-.08,0]}));
}
const contactAt=(def,height)=>def.contact===undefined?null:sample(def,Math.round(def.contact*RATE)/RATE,height);
function ballFor(def,t,contact,serveData,height){
 if(def.phase){const g=def.phase[0]+t,{release,atHit,v}=serveData;if(g<=1.6){const f=sample(def,t,height),w=fk(f).LeftHand;return add(w.position,rotate(w.rotation,[0,-.075,.027]));}if(g<3){const d=g-1.6;return add(release,add(mul(v,d),[0,-.5*9.81*d*d,0]));}const d=g-3;return add(atHit,add(mul([0,-1.5,12],d),[0,-.5*9.81*d*d,0]));}
 if(def.id==='look_ball'){const x=curve([[0,0],[.25,-1.3],[.53,1.3],[.76,.50],[1,0]],t/def.duration),y=curve([[0,1.35],[.30,1.90],[.58,1.70],[1,1.35]],t/def.duration);return[x,y,1.5];}if(def.id==='serve_prepare_1'){const handBall=at=>{const w=fk(sample(def,at,height)).LeftHand;return add(w.position,rotate(w.rotation,[0,-.075,.027]));},impact=1.18,releaseT=.76,catchT=1.60,ground=[.23,.0335,.28];if(t>=releaseT&&t<=catchT){const before=t<=impact,start=before?releaseT:impact,end=before?impact:catchT,a=before?handBall(releaseT):ground,b=before?ground:handBall(catchT),dt=end-start,d=t-start,v=mul(add(sub(b,a),[0,.5*9.81*dt*dt,0]),1/dt);return add(a,add(mul(v,d),[0,-.5*9.81*d*d,0]));}return handBall(t);}if(!contact)return[0,-10,0];const hit=add(sweetSpot(contact),rotate(contact.racketRotation,[0,0,.0335])),dt=t-contact.time;
 const out=def.id==='drop_shot'?[0,1.4,2.5]:def.id==='slice'?[0,.4,7]:def.id==='smash'?[0,-2.8,12]:[0,1.0,8];return add(hit,add(mul(dt<0?[0,-.5,-4]:out,dt),[0,-.5*9.81*dt*dt,0]));
}
export function author(height='medium'){
 const sd=definitions.find(d=>d.id==='serve_toss'),wh=definitions.find(d=>d.id==='serve_whip'),releasePose=sample(sd,1.6,height),hitPose=sample(wh,1,height),lw=fk(releasePose).LeftHand,release=add(lw.position,rotate(lw.rotation,[0,-.075,.027])),atHit=add(sweetSpot(hitPose),rotate(hitPose.racketRotation,[0,0,.0335])),dt=1.4,serveData={release,atHit,v:mul(add(sub(atHit,release),[0,.5*9.81*dt*dt,0]),1/dt)};
 const clips=definitions.map(def=>{
  const frameCount=Math.round(def.duration*RATE)+1,frames=Array.from({length:frameCount},(_,i)=>sample(def,i/RATE,height)),contact=contactAt(def,height),contactTime=contact?.time??null,releaseTime=def.release??null;
  for(let i=1;i<frames.length;i++)for(const b of bones)if(dot(frames[i-1].rotations[b.name],frames[i].rotations[b.name])<0)frames[i].rotations[b.name]=mul(frames[i].rotations[b.name],-1);
  for(const f of frames){f.ball=ballFor(def,f.time,contact,serveData,height);f.ballScale=contact||def.phase||['serve_prepare_1','look_ball'].includes(def.id)?1:0;}
  const events=[];if(def.id==='serve_prepare_1')events.push({type:'bounce',time:1.18,label:'הקפצת כדור',position:[.23,.0335,.28]});if(releaseTime!==null)events.push({type:'release',time:releaseTime,bone:'LeftHand',local:[0,-.075,-.0065],label:'הטלה'});if(contact)events.push({type:'contact',time:contactTime,bone:'RightHand',local:HEAD_LOCAL,label:'מגע במיתרים'});
  const heightVariants=contact?['low','medium','high'].map(height=>{const f=contactAt(def,height);return {height,contactPoint:sweetSpot(f),heightMeters:sweetSpot(f)[1],handPoint:fk(f).RightHand.position};}):[];
  const groundContacts=def.id==='clay_slide'?[{kind:'intentional-clay-skid',start:def.duration*.18,end:def.duration*.74,footBones:['LeftFoot','RightFoot']}]:[];
  const metadata={continuityReferences:def.id==='serve_toss'?{entry:{clip:'ready',time:0},exit:{clip:'serve_whip',time:0}}:def.id==='serve_whip'?{entry:{clip:'serve_toss',time:2},exit:{clip:'serve_land',time:0}}:def.id==='serve_land'?{entry:{clip:'serve_whip',time:1.2},exit:{clip:'ready',time:0}}:{entry:{clip:'ready',time:0},exit:{clip:'ready',time:0}},label:def.label,loop:def.loop,role:'tennis',floorY:0,soleLocal:[0,-.08,0],checkHingeDirection:true,locomotion:def.locomotion,ballVisible:!!(contact||def.phase||['serve_prepare_1','look_ball'].includes(def.id)),ballContactExpected:!!contact,ball:{radius:.0335},events,supports:supports(def),groundContacts,symmetryMode:def.locomotion?'gait':'structural',referenceTravel:def.locomotion?{speed:SPEED,direction:def.id==='run_forward'?[0,0,1]:[1,0,0],description:'Explicit external travel for in-place gait; Root remains unchanged.'}:null,transitionSeconds:.3,transitionClass:def.phase?'serve-continuation':def.locomotion?'periodic-gait':'ready',contactHeights:heightVariants};
  return {...def,nativeRate:RATE,rootMotion:false,frameCount,contactTime,releaseTime,contactHeightVariants:heightVariants,metadata,frames};
 });
 return {schemaVersion:1,version:'tennis-motion-v2',units:'meters',nativeRate:RATE,rootMotion:false,skeleton:bones,grip:{source:'tennis-grip-v1@a096e507b11389fc10272c38101f968820e89f7e',handleCenterInRightHand:HANDLE_CENTER,handFromRacket:ATTACH,gripNodeY:.20,primaryHandY:GRIP_Y,headY:HEAD_Y,headInRightHand:HEAD_LOCAL,racketMount:MOUNT},serveSequence:{duration:4.8,phases:['serve_toss','serve_whip','serve_land'],globalContactTime:3,globalReleaseTime:1.6},clips};
}
