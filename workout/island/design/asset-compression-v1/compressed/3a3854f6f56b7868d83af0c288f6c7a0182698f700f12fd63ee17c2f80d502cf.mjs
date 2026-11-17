/** Island Pro Basketball — small allocation-free helpers for the view and the HUD. No three.js
 * import, so the tests run them in node. Measured on 30/10/2026 with tools/perf-hoops.html:
 * every skinned mesh of a cloned avatar carried its own Skeleton (8 bone-matrix passes and 8
 * bone-texture uploads per player per frame), the view spread a new object per player per
 * frame, and the HUD rewrote DOM attributes every frame whether or not they changed. */

const lerp=(a,b,t)=>a+(b-a)*t;
export function lerpAngle(a,b,t){const d=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return a+d*t;}

/** Skinned meshes that drive the same bones share one Skeleton: one bone-matrix update and one
 * bone texture per avatar per frame instead of one per mesh. Returns how many meshes were rebound. */
export function shareSkeletons(meshes){
 const first=new Map();let shared=0;
 for(const m of meshes){
  const sk=m.skeleton;if(!sk||!sk.bones?.length)continue;
  const key=sk.bones.map(b=>b.uuid).join('|');
  const lead=first.get(key);
  if(!lead){first.set(key,m);continue;}
  if(lead.skeleton===sk||!sameInverses(lead.skeleton,sk))continue;
  m.bind(lead.skeleton,m.bindMatrix);shared++;
 }
 return shared;
}
function sameInverses(a,b){
 if(a.boneInverses.length!==b.boneInverses.length)return false;
 for(let i=0;i<a.boneInverses.length;i++){const x=a.boneInverses[i].elements,y=b.boneInverses[i].elements;for(let k=0;k<16;k++)if(Math.abs(x[k]-y[k])>1e-6)return false;}
 return true;
}

/** Interpolated player state written into `out` (reused per player), no spread per frame. */
export function interpPlayer(a,b,alpha,out){
 const o=out||{};
 for(const k in b)o[k]=b[k];
 if(a&&a.id===b.id){
  o.x=lerp(a.x,b.x,alpha);o.z=lerp(a.z,b.z,alpha);o.y=lerp(a.y,b.y,alpha);
  o.vx=lerp(a.vx,b.vx,alpha);o.vz=lerp(a.vz,b.vz,alpha);o.face=lerpAngle(a.face,b.face,alpha);
  o.actT=a.act===b.act?lerp(a.actT,b.actT,alpha):b.actT;
 }
 return o;
}

/** Per-id pool of interpolation targets and a reusable id -> previous snapshot map. */
export function createInterpPool(){
 const outs=new Map(),prev=new Map();
 return {
  /** Index the previous snapshot's players (the map is cleared and refilled, never reallocated). */
  index(players){prev.clear();if(players)for(const p of players)prev.set(p.id,p);return prev;},
  /** Interpolate one current player against the indexed previous one. */
  get(b,alpha){let o=outs.get(b.id);if(!o){o={};outs.set(b.id,o);}return interpPlayer(prev.get(b.id),b,alpha,o);},
  get size(){return outs.size;},
 };
}

/** DOM writes that happen only when the value changes: no style or accessibility churn per frame. */
export function setText(el,v){if(el.textContent!==v)el.textContent=v;return el;}
export function setAttr(el,k,v){if(el.getAttribute(k)!==v)el.setAttribute(k,v);return el;}
export function setData(el,k,v){if(el.dataset[k]!==v)el.dataset[k]=v;return el;}
export function setHidden(el,v){v=!!v;if(el.hidden!==v)el.hidden=v;return el;}
/** First `n` of `nodes` carry class `on`; nodes is a plain array captured once. */
export function markFirst(nodes,n,cls='on'){for(let i=0;i<nodes.length;i++){const want=i<n;if(nodes[i].classList.contains(cls)!==want)nodes[i].classList.toggle(cls,want);}}

/** Smooth approach for camera values: reaches ~99% of the target in `seconds` (exponential). */
export function approach(current,target,dt,seconds){
 if(current==null||!(seconds>0))return target;
 return current+(target-current)*(1-Math.exp(-dt*5/seconds));
}
/** 0..1 ease for a side swing where s runs -1..1. */
export const smoothstep=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
