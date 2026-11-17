import { clamp, lerp, normalize, slerp, multiply, rotate, distance, angleDegrees, finite, freeze } from './math.mjs';

function trackValue(track, t) {
  const n=track.path==='rotation'?4:3, times=track.times;
  let lo=0, hi=times.length-1;
  if(t<=times[0]) hi=lo=0;
  else if(t>=times[hi]) lo=hi;
  else { while(hi-lo>1){const m=(lo+hi)>>1;if(times[m]<=t)lo=m;else hi=m;} }
  const a=track.values.slice(lo*n,(lo+1)*n), b=track.values.slice(hi*n,(hi+1)*n);
  const alpha=hi===lo||track.interpolation==='STEP'?0:(t-times[lo])/(times[hi]-times[lo]);
  return track.path==='rotation'?slerp(a,b,alpha):lerp(a,b,alpha);
}

/** Sample exact GLB accessor data. Time is clamped; callers explicitly choose looping. */
export function sampleClip(clip, time) {
  finite(time,'sample time');
  const t=clamp(time,0,clip.duration);
  const pose=clip.skeleton.map(b=>({translation:[...b.translation],rotation:normalize(b.rotation),scale:[...b.scale]}));
  for(const track of clip.tracks) pose[track.bone][track.path]=trackValue(track,t);
  return pose;
}
export function blendPoses(a,b,weight) {
  finite(weight,'blend weight');
  const w=clamp(weight,0,1);
  if(a.length!==b.length)throw new RangeError('incompatible skeleton lengths');
  return a.map((p,i)=>({translation:lerp(p.translation,b[i].translation,w),rotation:slerp(p.rotation,b[i].rotation,w),scale:lerp(p.scale,b[i].scale,w)}));
}
/** FK assumes parent-local TRS and canonical parent-first joints; extraction validates this. */
export function worldPose(clip,pose) {
  const world=[];
  for(let i=0;i<pose.length;i++){
    const p=pose[i], parent=clip.skeleton[i].parent;
    if(parent<0){world.push({translation:[...p.translation],rotation:[...p.rotation],scale:[...p.scale]});continue;}
    if(parent>=i)throw new RangeError('skeleton must be parent-first');
    const a=world[parent], offset=rotate(a.rotation,p.translation.map((v,j)=>v*a.scale[j]));
    world.push({translation:a.translation.map((v,j)=>v+offset[j]),rotation:normalize(multiply(a.rotation,p.rotation)),scale:a.scale.map((v,j)=>v*p.scale[j])});
  }
  return world;
}

/** Conservative joint/sole probes, NOT triangles or a certified skinned mesh collider. */
export function floorProbes(clip, pose) {
  const world=worldPose(clip,pose), probes=[];
  for(let i=0;i<clip.skeleton.length;i++){
    const name=clip.skeleton[i].name, joint=world[i];
    if(name==='Root')continue;
    // Canonical feet have an ankle-to-sole offset of 8cm in source supports.
    const offsets=/Foot$/.test(name)?[[-.045,-.08,-.035],[.045,-.08,-.035],[-.045,-.08,.12],[.045,-.08,.12]]:[[0,0,0]];
    for(const offset of offsets){const v=rotate(joint.rotation,offset.map((n,j)=>n*joint.scale[j]));probes.push({bone:name,position:v.map((n,j)=>n+joint.translation[j])});}
  }
  return probes;
}
export function floorMinimum(clip,pose){return Math.min(...floorProbes(clip,pose).map(p=>p.position[1]));}
export function correctFloor(clip,pose,{maxLift=.12,clearance=0}={}){
  finite(maxLift,'maxLift',0);finite(clearance,'clearance',0);
  const rawMinimum=floorMinimum(clip,pose), requiredLift=Math.max(0,clearance-rawMinimum), lift=Math.min(maxLift,requiredLift);
  const corrected=pose.map((p,i)=>({...p,translation:p.translation.map((v,j)=>v+(clip.skeleton[i].parent<0&&j===1?lift:0)),rotation:[...p.rotation],scale:[...p.scale]}));
  return {pose:corrected,rawMinimum,minimum:rawMinimum+lift,lift,requiredLift,safe:rawMinimum+lift>=-1e-5};
}
export function poseDifference(clip,a,b){
  const wa=worldPose(clip,a),wb=worldPose(clip,b);
  return {maxJointMeters:Math.max(...wa.map((p,i)=>distance(p.translation,wb[i].translation))),maxRotationDegrees:Math.max(...a.map((p,i)=>angleDegrees(p.rotation,b[i].rotation)))};
}
export const FLOOR_POLICY=freeze({maxLift:.12,clearance:0,description:'Bounded vertical presentation lift of canonical joint/sole probes; residual penetration remains a diagnostic.'});
