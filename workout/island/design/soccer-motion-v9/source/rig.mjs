/** Original v9 analytic canonical-18 rig, metres, +Y up, +Z forward, +X left.
 * CC0-1.0. Knees flex on +X, elbows on -X, avoiding axial shoulder flips. */
import {Quaternion,Matrix4,Vector3} from '../runtime/vendor/three.module.js';
export const bones=[
 ['Root',null,[0,0,0]],['Hips','Root',[0,.86,0]],['Spine','Hips',[0,.2,0]],['Chest','Spine',[0,.18,0]],['Neck','Chest',[0,.1,0]],['Head','Neck',[0,.13,0]],
 ['LeftArm','Chest',[.16,.06,0]],['LeftForeArm','LeftArm',[0,-.27,0]],['LeftHand','LeftForeArm',[0,-.24,0]],['RightArm','Chest',[-.16,.06,0]],['RightForeArm','RightArm',[0,-.27,0]],['RightHand','RightForeArm',[0,-.24,0]],
 ['LeftUpLeg','Hips',[.1,0,0]],['LeftLeg','LeftUpLeg',[0,-.41,0]],['LeftFoot','LeftLeg',[0,-.37,0]],['RightUpLeg','Hips',[-.1,0,0]],['RightLeg','RightUpLeg',[0,-.41,0]],['RightFoot','RightLeg',[0,-.37,0]]
].map(([name,parent,rest])=>({name,parent,rest}));
export const I=[0,0,0,1];
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>{const n=Math.hypot(...a);return n>1e-12?mul(a,1/n):a.map(()=>0);};
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>(x=clamp(x),x*x*(3-2*x));
export const mix=(a,b,t)=>Array.isArray(a)?a.map((v,i)=>v+(b[i]-v)*t):a+(b-a)*t;
export function curve(keys,t){if(t<=keys[0][0])return structuredClone(keys[0][1]);for(let i=1;i<keys.length;i++){if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],smooth((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));}return structuredClone(keys.at(-1)[1]);}
export const qm=(a,b)=>new Quaternion(...a).multiply(new Quaternion(...b)).toArray();
export const qi=q=>[-q[0],-q[1],-q[2],q[3]];
export const rotate=(q,v)=>new Vector3(...v).applyQuaternion(new Quaternion(...q)).toArray();
export const euler=(x=0,y=0,z=0)=>{const r=Math.PI/360;return qm(qm([Math.sin(x*r),0,0,Math.cos(x*r)],[0,Math.sin(y*r),0,Math.cos(y*r)]),[0,0,Math.sin(z*r),Math.cos(z*r)]);};
export const slerp=(a,b,t)=>new Quaternion(...a).slerp(new Quaternion(...b),t).normalize().toArray();
export function fk(p){const out={};for(const b of bones){const parent=out[b.parent]||{position:[0,0,0],rotation:I};out[b.name]={position:add(parent.position,rotate(parent.rotation,b.name==='Hips'?p.hips:b.rest)),rotation:qm(parent.rotation,p.rotations[b.name])};}return out;}
export const forwardPose=fk;
export function point(p,bone,local=[0,0,0]){const b=fk(p)[bone];return add(b.position,rotate(b.rotation,local));}
function frame(direction,pole){const y=mul(unit(direction),-1);let z=sub(pole,mul(y,dot(y,pole)));if(Math.hypot(...z)<1e-6)z=sub([0,0,1],mul(y,y[2]));z=unit(z);const x=unit(cross(y,z));z=cross(x,y);const m=new Matrix4().makeBasis(new Vector3(...x),new Vector3(...y),new Vector3(...z));return new Quaternion().setFromRotationMatrix(m).normalize().toArray();}
export function solve(p,upper,lower,end,target,pole,orientation){
 const w=fk(p),origin=w[upper].position,parent=w[bones.find(b=>b.name===upper).parent].rotation;
 const a=Math.hypot(...bones.find(b=>b.name===lower).rest),b=Math.hypot(...bones.find(b=>b.name===end).rest);
 const delta=sub(target,origin),raw=Math.hypot(...delta),d=clamp(raw,Math.abs(a-b)+.001,a+b-.00001),axis=raw>1e-8?mul(delta,1/raw):[0,-1,0];
 let bend=sub(pole,mul(axis,dot(axis,pole)));if(Math.hypot(...bend)<1e-6)bend=sub([0,0,1],mul(axis,axis[2]));bend=unit(bend);
 const along=(a*a-b*b+d*d)/(2*d),h=Math.sqrt(Math.max(0,a*a-along*along));
 const joint=add(origin,add(mul(axis,along),mul(bend,h))),actual=add(origin,mul(axis,d));
 const arm=upper.includes('Arm'),uq=frame(sub(joint,origin),arm?mul(bend,-1):bend),flex=Math.acos(clamp((d*d-a*a-b*b)/(2*a*b),-1,1))*180/Math.PI,signedFlex=arm?-flex:flex,lq=qm(uq,euler(signedFlex));
 p.rotations[upper]=qm(qi(parent),uq);p.rotations[lower]=euler(signedFlex);p.rotations[end]=orientation?qm(qi(lq),orientation):[...I];
 return {error:Math.abs(raw-d),actual};
}
export function pose(s={}){
 const {hips=[0,.78,0],yaw=0,hipYaw=yaw,lean=0,roll=0,twist=0,head=0,leftFoot=[.12,.08,.02],rightFoot=[-.12,.08,-.02],leftHand=[.23,.86,.12],rightHand=[-.23,.86,.12]}=s;
 const p={hips:[...hips],rotations:Object.fromEntries(bones.map(b=>[b.name,[...I]]))};
 p.rotations.Hips=qm(euler(0,hipYaw,0),euler(s.hipPitch??lean*.45,0,roll));p.rotations.Spine=euler(s.spinePitch??lean*.3,twist*.4,0);p.rotations.Chest=euler(s.chestPitch??lean*.25,twist*.6,0);p.rotations.Head=euler(head,s.headYaw??0,0);
 const direction=rotate(euler(0,yaw,0),[0,0,1]);
 const errors=[];
 for(const [side,foot,hand,sign] of [['Left',leftFoot,leftHand,1],['Right',rightFoot,rightHand,-1]]){
  errors.push(solve(p,side+'UpLeg',side+'Leg',side+'Foot',foot,s[side.toLowerCase()+'Knee']??direction,euler(s[side.toLowerCase()+'FootPitch']??0,s[side.toLowerCase()+'FootYaw']??0,0)).error);
  errors.push(solve(p,side+'Arm',side+'ForeArm',side+'Hand',hand,s[side.toLowerCase()+'Elbow']??rotate(euler(0,yaw,0),[sign*.4,-.7,-.6]),s[side.toLowerCase()+'HandAim']).error);
 }
 p.reachError=Math.max(...errors);return p;
}
