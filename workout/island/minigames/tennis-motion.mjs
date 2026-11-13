/** Tennis motion v1 (Codex package design/tennis-motion-v1, CC0): clip choice, sampling and the retarget of its canonical 18-bone skeleton
 * onto the game character's legs and spine. The arms and the racket stay with the existing contact IK (it guarantees the racket meets the ball),
 * so a failure here can only make the lower body look worse, never miss a shot. Pure math, no three.js: the view applies the directions.
 * Upgrade only: ?tennisMotionV1=0 (or any load error) keeps the previous poses. */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const mul=(a,s)=>a.map(v=>v*s);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const qm=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export const qrot=(q,v)=>{const c=[-q[0],-q[1],-q[2],q[3]],p=qm(qm(q,[...v,0]),c);return [p[0],p[1],p[2]];};
export function slerp(a,b,t){let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d;}if(d>.9995)return unit(mix(a,b,t));const h=Math.acos(clamp(d,-1,1)),s=Math.sin(h);return add(mul(a,Math.sin((1-t)*h)/s),mul(b,Math.sin(t*h)/s));}
/** Canonical pose of a clip at `seconds` (looped clips wrap, one-shots hold their last frame). */
export function sampleClip(clip,seconds){
 const n=clip.frames.length-1,t=clip.loop?((seconds%clip.dur)+clip.dur)%clip.dur:clamp(seconds,0,clip.dur),x=clamp(t/clip.dur)*n,i=Math.min(n-1,Math.floor(x)),k=x-i,a=clip.frames[i],b=clip.frames[i+1];
 return {rot:Object.fromEntries(Object.keys(a.rot).map(name=>[name,slerp(a.rot[name],b.rot[name],k)])),hips:mix(a.hips,b.hips,k)};
}
/** World joint positions (metres, canonical frame: +Y up, +Z forward, +X the character's left) of a sampled pose. */
export function jointWorld(bones,pose){
 const out={};
 for(const b of bones){
  let p=b.rest;if(b.name==='Hips')p=add(p,pose.hips);
  if(!b.parent){out[b.name]={p,q:pose.rot[b.name]||[0,0,0,1]};continue;}
  const parent=out[b.parent];out[b.name]={p:add(parent.p,qrot(parent.q,p)),q:qm(parent.q,pose.rot[b.name]||[0,0,0,1])};
 }
 return out;
}
/** Unit directions of the segments the game character takes from the clip: thigh, shin, spine, chest. */
export const SEGMENTS=Object.freeze([['LeftUpLeg','LeftLeg'],['LeftLeg','LeftFoot'],['RightUpLeg','RightLeg'],['RightLeg','RightFoot'],['Spine','Chest'],['Chest','Neck']]);
export function segmentDirections(bones,pose){
 const w=jointWorld(bones,pose),out={};
 for(const [a,b] of SEGMENTS)out[a]=unit(w[b].p.map((v,i)=>v-w[a].p[i]));
 return out;
}
export function blendDirections(a,b,t){const out={};for(const k of Object.keys(b))out[k]=a&&a[k]?unit(mix(a[k],b[k],t)):b[k];return out;}
/** Which clip plays now. `velocity` is the player's world velocity; the player faces -Z (index 0) or +Z (index 1). */
export function clipFor({index,player,phase,serving,tossing,winner,event},clips){
 const has=n=>clips[n]?n:null;
 if(phase==='point'||phase==='game'||phase==='complete'){if(winner===index)return has('celebrate_point');if(winner===1-index)return has('disappointed');}
 if(tossing)return has('serve_toss');
 if(player.swing>0){if(serving)return has('serve_follow_through');return has(player.stroke==='backhand'?'backhand_flat_short':'forehand_flat_short');}
 const speed=Math.hypot(player.vx||0,player.vz||0);
 if(speed<.45)return has('ready_idle');
 // facing -Z (index 0) the character's left is -X; facing +Z it is +X
 const forward=(index===0?-1:1)*(player.vz||0),leftward=index===0?-(player.vx||0):(player.vx||0);
 if(Math.abs(leftward)>Math.abs(forward)*1.2)return has(leftward>0?'run_left':'run_right');
 return has(forward>=0?'run_forward':'run_backward');
}
/** Clip time for a stroke so that the clip's racket_contact lands exactly on the game's contact instant. */
export function strokeTime(clip,progress,contactFraction){
 const contact=clip.events.find(e=>e.name==='racket_contact')?.at??clip.dur*.5,u=clamp(progress);
 return u<contactFraction?(u/Math.max(1e-6,contactFraction))*contact:contact+((u-contactFraction)/Math.max(1e-6,1-contactFraction))*(clip.dur-contact);
}
/** Quaternion that turns a bone so its rest direction `restDir` (world, at rest) points along `target`, as a [x,y,z,w] delta. */
export function turnTo(from,to){
 const a=unit(from),b=unit(to),d=dot(a,b);
 if(d<-.999999){const axis=Math.abs(a[0])<.8?[0,-a[2],a[1]]:[a[2],0,-a[0]],u=unit(axis);return [u[0],u[1],u[2],0];}
 const c=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],w=1+d,n=Math.hypot(c[0],c[1],c[2],w)||1;return [c[0]/n,c[1]/n,c[2]/n,w/n];
}
export async function loadMotion({base,fetcher=globalThis.fetch,params}={}){
 if(params?.get?.('tennisMotionV1')==='0')return null;
 const response=await fetcher(new URL('../assets/tennis-motion-v1/core.json?v=island-v2-20261107-11',base));
 if(!response.ok)throw new Error('motion '+response.status);
 const data=await response.json();
 if(!data?.bones?.length||!data.clips?.run_forward)throw new Error('motion data');
 return {bones:data.bones,clips:data.clips};
}
