import {decodeMotion16} from '../runtime/motion16.mjs';

export const MOTION_LIMITS={component:1/32767/2+1e-12,rotationDegrees:0.01,translationMeters:0.0002,forwardKinematicsMeters:0.001};
const quaternion=(a,b)=> {
  const norm=Math.hypot(...a)*Math.hypot(...b);
  return norm ? 2*Math.acos(Math.min(1,Math.abs(a.reduce((s,v,i)=>s+v*b[i],0))/norm))*180/Math.PI : Infinity;
};
export function encodeMotion16(source) {
  const values=[],counts={quaternions:0,translations:0,unquantizedVectors:0};
  function visit(value,insideFrame=false,parentKey='') {
    if (!value||typeof value!=='object') return value;
    if (Object.hasOwn(value,'$islandInt16')) throw Error('Reserved motion16 key in input');
    if (Array.isArray(value)) {
      const isQ=insideFrame&&parentKey==='quaternion';
      const isT=insideFrame&&/Meters$/.test(parentKey);
      if ((isQ&&value.length===4||isT&&value.length===3)&&value.every(Number.isFinite)) {
        const max=Math.max(...value.map(Math.abs));
        const scale=isQ?1/32767:Math.max(max/32767,1e-9);
        if (isQ&&max>1 || isT&&Math.sqrt(3)*scale/2>MOTION_LIMITS.translationMeters) { counts.unquantizedVectors++;return value; }
        const offset=values.length;
        for(const v of value) values.push(Math.round(v/scale));
        counts[isQ?'quaternions':'translations']++;
        return {$islandInt16:[offset,value.length,scale]};
      }
      return value.map(v=>visit(v,insideFrame||parentKey==='keyframes',parentKey));
    }
    return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='rotations'&&insideFrame&&v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([bone,q])=>[bone,visit(q,true,'quaternion')])):visit(v,insideFrame,key)]));
  }
  const template=visit(source);
  if (!counts.quaternions&&!counts.translations) return null;
  const json=Buffer.from(JSON.stringify(template)),buffer=Buffer.alloc(12+json.length+values.length*2);
  Buffer.from([73,83,76,77,49,54,1,0]).copy(buffer);buffer.writeUInt32LE(json.length,8);json.copy(buffer,12);
  values.forEach((v,i)=>buffer.writeInt16LE(v,12+json.length+i*2));
  const decoded=decodeMotion16(buffer),quality=compareMotion(source,decoded);
  return {buffer,decoded,quality:{...quality,...counts},safe:quality.maxRotationDegrees<=MOTION_LIMITS.rotationDegrees&&quality.maxTranslationMeters<=MOTION_LIMITS.translationMeters&&quality.maxForwardKinematicsMeters<=MOTION_LIMITS.forwardKinematicsMeters};
}
const normalized=q=> {const n=Math.hypot(...q);return q.map(v=>v/n);};
const multiply=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rotate=(q,v)=>multiply(multiply(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
function fk(frame,bones) {
  const result=new Map();
  for(const bone of bones) {
    const parent=result.get(bone.parent), q=normalized(frame.rotations?.[bone.name]||[0,0,0,1]);
    let p=[...bone.restTranslationMeters];
    if(bone.name==='Hips'&&frame.hipsOffsetMeters)p=p.map((v,i)=>v+frame.hipsOffsetMeters[i]);
    if(bone.name==='Root'&&frame.referenceRootTranslationMeters)p=p.map((v,i)=>v+frame.referenceRootTranslationMeters[i]);
    if(parent)p=rotate(parent.q,p).map((v,i)=>v+parent.p[i]);
    result.set(bone.name,{q:parent?multiply(parent.q,q):q,p});
  }
  return result;
}
export function compareMotion(a,b) {
  const quality={maxComponentError:0,maxRotationDegrees:0,maxTranslationMeters:0,maxForwardKinematicsMeters:0,framesWithForwardKinematics:0,metadataExact:true};
  function visit(x,y,frame=false,key='') {
    if(Array.isArray(x)&&Array.isArray(y)&&frame&&x.every(Number.isFinite)) {
      if(key==='quaternion'&&x.length===4) {
        quality.maxComponentError=Math.max(quality.maxComponentError,...x.map((v,i)=>Math.abs(v-y[i])));
        quality.maxRotationDegrees=Math.max(quality.maxRotationDegrees,quaternion(x,y));return;
      }
      if(/Meters$/.test(key)&&x.length===3) {
        quality.maxTranslationMeters=Math.max(quality.maxTranslationMeters,Math.hypot(...x.map((v,i)=>v-y[i])));return;
      }
    }
    if(x&&typeof x==='object') {
      if(!y||JSON.stringify(Object.keys(x))!==JSON.stringify(Object.keys(y)))throw Error('Motion structure changed');
      for(const k of Object.keys(x)) {
        if(k==='rotations'&&frame) {for(const bone of Object.keys(x[k]))visit(x[k][bone],y[k][bone],true,'quaternion');}
        else visit(x[k],y[k],frame||key==='keyframes',k);
      }
    } else if(!Object.is(x,y)&&!(x===0&&y===0))throw Error('Nonvector motion metadata changed');
  }
  visit(a,b);
  const bones=a.skeleton?.bones;
  if(bones?.every(b=>b.restTranslationMeters?.length===3)) {
    function frames(x,y) {
      if(!x||typeof x!=='object')return;
      if(x.keyframes) for(let i=0;i<x.keyframes.length;i++) {
        const pa=fk(x.keyframes[i],bones),pb=fk(y.keyframes[i],bones);
        for(const [name,p]of pa)quality.maxForwardKinematicsMeters=Math.max(quality.maxForwardKinematicsMeters,Math.hypot(...p.p.map((v,j)=>v-pb.get(name).p[j])));
        quality.framesWithForwardKinematics++;
      }
      for(const key of Object.keys(x))if(key!=='keyframes')frames(x[key],y[key]);
    }
    frames(a,b);
  }
  return quality;
}
