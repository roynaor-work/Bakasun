// Original CC0-1.0 tennis sampling, FK and post-blend foot locking.
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=a=>Math.hypot(...a);
export const unit=a=>mul(a,1/(norm(a)||1));
export const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export const qi=q=>[-q[0],-q[1],-q[2],q[3]];
export const qm=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export const rotate=(q,v)=>{const p=qm(qm(q,[...v,0]),qi(q));return p.slice(0,3);};
export const axis=(a,t)=>[...mul(unit(a),Math.sin(t/2)),Math.cos(t/2)];
export function aim(a,b){a=unit(a);b=unit(b);const d=dot(a,b);if(d<-.999999)return axis(Math.abs(a[0])<.8?cross(a,[1,0,0]):cross(a,[0,1,0]),Math.PI);return unit([...cross(a,b),1+d]);}
export function slerp(a,b,t){let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d;}if(d>.9995)return unit(mix(a,b,t));const h=Math.acos(clamp(d,-1,1));return add(mul(a,Math.sin((1-t)*h)/Math.sin(h)),mul(b,Math.sin(t*h)/Math.sin(h)));}
export function fk(skeleton,frame){const out={};for(const b of skeleton.bones){let p=b.restTranslationMeters;if(b.name==='Root')p=add(p,frame.referenceRootTranslationMeters);if(b.name==='Hips')p=add(p,frame.hipsOffsetMeters);const parent=out[b.parent];const q=frame.rotations[b.name];out[b.name]=parent?{p:add(parent.p,rotate(parent.q,p)),q:qm(parent.q,q)}:{p:[...p],q:[...q]};}out.Racket={...out.RightHand};out.RacketHead={p:add(out.RightHand.p,rotate(out.RightHand.q,[0,.5,0])),q:out.RightHand.q};return out;}
export function sample(clip,seconds){const x=clamp(seconds/clip.durationSeconds)*(clip.keyframes.length-1),i=Math.min(clip.keyframes.length-2,Math.floor(x)),t=x-i,a=clip.keyframes[i],b=clip.keyframes[i+1];return {time:seconds/clip.durationSeconds,rotations:Object.fromEntries(Object.keys(a.rotations).map(n=>[n,slerp(a.rotations[n],b.rotations[n],t)])),hipsOffsetMeters:mix(a.hipsOffsetMeters,b.hipsOffsetMeters,t),referenceRootTranslationMeters:mix(a.referenceRootTranslationMeters,b.referenceRootTranslationMeters,t)};}
export function continuedSample(clip,seconds){
 if(clip.loop&&seconds>=clip.durationSeconds){const turns=Math.floor(seconds/clip.durationSeconds),f=sample(clip,seconds-turns*clip.durationSeconds),delta=sub(clip.keyframes.at(-1).referenceRootTranslationMeters,clip.keyframes[0].referenceRootTranslationMeters);f.referenceRootTranslationMeters=add(f.referenceRootTranslationMeters,mul(delta,turns));return f;}
 if(seconds<=clip.durationSeconds)return sample(clip,seconds);
 const a=clip.keyframes.at(-2),b=clip.keyframes.at(-1),extra=(seconds-clip.durationSeconds)*30;
 return {time:seconds/clip.durationSeconds,rotations:Object.fromEntries(Object.keys(a.rotations).map(n=>[n,slerp(a.rotations[n],b.rotations[n],1+extra)])),hipsOffsetMeters:mix(a.hipsOffsetMeters,b.hipsOffsetMeters,1+extra),referenceRootTranslationMeters:mix(a.referenceRootTranslationMeters,b.referenceRootTranslationMeters,1+extra)};
}
// Orient all three axes from the common bend plane. A shortest-arc aim of
// local -Y alone has an arbitrary twist near an overhead arm; compensating
// upper/forearm/hand twists can then cancel only at authored frames, while
// ordinary glTF SLERP sends the racket sideways between those frames.
function limbFrame(direction,normal){
 const y=mul(unit(direction),-1),x=unit(cross(y,normal)),z=unit(cross(x,y));
 const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2],trace=m00+m11+m22;
 let q;
 if(trace>0){const r=2*Math.sqrt(1+trace);q=[(m21-m12)/r,(m02-m20)/r,(m10-m01)/r,r/4];}
 else if(m00>m11&&m00>m22){const r=2*Math.sqrt(1+m00-m11-m22);q=[r/4,(m01+m10)/r,(m02+m20)/r,(m21-m12)/r];}
 else if(m11>m22){const r=2*Math.sqrt(1+m11-m00-m22);q=[(m01+m10)/r,r/4,(m12+m21)/r,(m02-m20)/r];}
 else{const r=2*Math.sqrt(1+m22-m00-m11);q=[(m02+m20)/r,(m12+m21)/r,r/4,(m10-m01)/r];}
 return unit(q);
}
// Exact two-bone lengths, with a caller-selected anatomical bend pole.
export function solveLimb(skeleton,frame,upper,lower,end,target,pole,endWorldQ=[0,0,0,1]){
 const w=fk(skeleton,frame),b=skeleton.bones.find(b=>b.name===upper),parent=w[b.parent],p=w[upper].p,a=norm(skeleton.bones.find(b=>b.name===lower).restTranslationMeters),c=norm(skeleton.bones.find(b=>b.name===end).restTranslationMeters),v=sub(target,p),d=clamp(norm(v),Math.abs(a-c)+1e-5,a+c-1e-5),u=unit(v),h=(a*a+d*d-c*c)/(2*d);
 let bend=sub(pole,mul(u,dot(pole,u)));
 if(norm(bend)<1e-8){const fallback=Math.abs(u[2])<.8?[0,0,1]:[1,0,0];bend=sub(fallback,mul(u,dot(fallback,u)));}
 bend=unit(bend);
 const joint=add(p,add(mul(u,h),mul(bend,Math.sqrt(Math.max(0,a*a-h*h))))),reachable=add(p,mul(u,d)),normal=unit(cross(u,bend)),uq=limbFrame(sub(joint,p),normal),lq=limbFrame(sub(reachable,joint),normal);
 frame.rotations[upper]=qm(qi(parent.q),uq);frame.rotations[lower]=qm(qi(uq),lq);frame.rotations[end]=qm(qi(lq),endWorldQ);return frame;
}
export function lockFeet(skeleton,frame,anchors){for(const side of ['Left','Right']){const a=anchors[side+'Foot'];if(a)solveLimb(skeleton,frame,side+'UpLeg',side+'Leg',side+'Foot',add(a,[0,.08,0]),[0,0,1]);}return frame;}
// Root positions are aligned at the handoff; continued source velocity decays
// smoothly while the destination accelerates. Active sole anchors survive the
// handoff until their smooth release, and IK runs AFTER quaternion blending.
export function transitionFrame(skeleton,source,target,sourceTime,elapsed,duration=.3){
 const start=sample(source,sourceTime),end0=sample(target,0),epsilon=1/300,prev=sample(source,Math.max(0,sourceTime-epsilon)),vel=mul(sub(start.referenceRootTranslationMeters,prev.referenceRootTranslationMeters),1/epsilon),targetVel=mul(sub(sample(target,epsilon).referenceRootTranslationMeters,end0.referenceRootTranslationMeters),1/epsilon);
 const t=clamp(elapsed/duration),k=smooth(t),dst=continuedSample(target,elapsed),src=continuedSample(source,sourceTime+elapsed);
 // Integral of 1-smoothstep: initial velocity equals the displayed source;
 // final velocity equals the destination, with a persistent stopping offset.
 const integral=duration*(t-t*t*t+.5*t*t*t*t),root=add(start.referenceRootTranslationMeters,add(sub(dst.referenceRootTranslationMeters,end0.referenceRootTranslationMeters),mul(sub(vel,targetVel),integral)));
 const out={time:0,rotations:{},hipsOffsetMeters:mix(src.hipsOffsetMeters,dst.hipsOffsetMeters,k),referenceRootTranslationMeters:root};
 for(const n in src.rotations)out.rotations[n]=slerp(src.rotations[n],dst.rotations[n],k);
 const anchors={},world=fk(skeleton,start);
 for(const p of source.footPlants||[]){if(sourceTime*30>=p.startFrame&&sourceTime*30<=p.endFrame){const name=p.bone,original=add(world[name].p,rotate(world[name].q,p.localPointMeters)),raw=fk(skeleton,out),current=add(raw[name].p,rotate(raw[name].q,p.localPointMeters)),releaseAt=Math.min(duration*.55,Math.max(0,p.endFrame/30-sourceTime));anchors[name]=mix(original,current,smooth((elapsed-releaseAt)/Math.min(.10,duration-releaseAt)));}}
 // Ramp into the constraint with zero initial slope. At a 30 Hz landing
 // key the displayed SLERP sole can still have a small velocity; applying
 // full IK instantly would remove it in one sample and jerk the knee.
 const free=Object.fromEntries(Object.entries(out.rotations).map(([n,q])=>[n,[...q]]));
 lockFeet(skeleton,out,anchors);
 const entry=smooth(elapsed/.06);
 for(const side of ['Left','Right'])for(const part of ['UpLeg','Leg','Foot']){const name=side+part;out.rotations[name]=slerp(free[name],out.rotations[name],entry);}
 return out;
}
