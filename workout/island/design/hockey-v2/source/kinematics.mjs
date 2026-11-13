// SPDX-License-Identifier: CC0-1.0
// Exact geometric reconstruction on the existing canonical athlete rig.
import {CANON_NAMES,qaxis,qmul,qrotate,qnorm,qslerp,jointWorld} from '../../../minigames/athletes-core.mjs';
export {qaxis,qmul,qrotate,qnorm,qslerp,jointWorld};
export const PI=Math.PI,TAU=2*PI,DEG=PI/180;
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
export const bell=x=>Math.sin(PI*clamp(x))**2;
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const scale=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const unit=a=>scale(a,1/(Math.hypot(...a)||1));
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
export const xyz=(x=0,y=0,z=0)=>qmul(qmul(qaxis([0,0,1],z*DEG),qaxis([0,1,0],y*DEG)),qaxis([1,0,0],x*DEG));
export const yawQ=yaw=>qaxis([0,1,0],yaw);
export const rounded=x=>+x.toFixed(9);
export const newPose=()=>({rot:Object.fromEntries(CANON_NAMES.map(n=>[n,[0,0,0,1]])),hips:[0,-.14,0]});
export const key=(pose,u)=>({time:rounded(u),rotations:Object.fromEntries(CANON_NAMES.map(n=>[n,qnorm(pose.rot[n]).map(rounded)])),hipsOffsetMeters:pose.hips.map(rounded)});
export function frameAlong(direction,hinge){
 const y=scale(unit(direction),-1),x=unit(sub(hinge,scale(y,dot(hinge,y)))),z=cross(x,y);
 const [m00,m10,m20]=x,[m01,m11,m21]=y,[m02,m12,m22]=z,tr=m00+m11+m22;
 let q,s;
 if(tr>0){s=Math.sqrt(tr+1)*2;q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
 else if(m00>m11&&m00>m22){s=Math.sqrt(1+m00-m11-m22)*2;q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
 else if(m11>m22){s=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
 else{s=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}
 return qnorm(q);
}
/** World target and world sole orientation; Root and Hips rotations are included. */
export function solveLeg(p,side,target,footWorld,heading=0){
 const w=jointWorld(p),hip=w[side+'UpLeg'].p,delta=sub(target,hip),d=Math.hypot(...delta),axis=unit(delta);
 if(d>=.7798||d<=.0402)throw Error(`Unreachable ${side} ankle target ${d}`);
 const along=(.41**2-.37**2+d*d)/(2*d),centre=add(hip,scale(axis,along));
 const pole=add(hip,qrotate(yawQ(heading),[0,-.2,.4])),off=sub(pole,centre),bend=unit(sub(off,scale(axis,dot(off,axis))));
 const knee=add(centre,scale(bend,Math.sqrt(Math.max(0,.41**2-along**2))));
 const upper=sub(knee,hip),lower=sub(target,knee),hinge=unit(cross(upper,lower));
 const uq=frameAlong(upper,hinge),lq=frameAlong(lower,hinge);
 p.rot[side+'UpLeg']=qmul(inverse(w.Hips.q),uq);
 p.rot[side+'Leg']=qmul(inverse(uq),lq);
 p.rot[side+'Foot']=qmul(inverse(lq),footWorld);
}
export function keepStickAboveIce(p,heading=0){
 const w=jointWorld(p),tilt=-Math.acos(clamp((w.RightHand.p[1]-.032)/1.28,-.99,.99));
 p.rot.RightHand=qmul(inverse(w.RightForeArm.q),qmul(yawQ(heading),qaxis([0,0,1],tilt)));
}
