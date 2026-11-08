/** Original CC0-1.0. Canonical18 rigid transforms; metres, +Y up, +Z forward. */
export const qIdentity = Object.freeze([0, 0, 0, 1]);
export const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const mul = (a, s) => a.map(v => v * s);
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const length = a => Math.hypot(...a);
export const normalize = (a, fallback = [0, 0, 1]) => length(a) > 1e-12 ? mul(a, 1/length(a)) : [...fallback];
export const lerp = (a, b, t) => Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], t)) : a + (b-a)*t;
export const qNormalize = q => normalize(q, qIdentity);
export const qMul = (a, b) => [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
export const qInverse = q => {
  const d = dot(q, q);
  if (d < 1e-20) throw new RangeError('Cannot invert a zero quaternion');
  return [-q[0]/d, -q[1]/d, -q[2]/d, q[3]/d];
};
export const qAxisAngle = (axis, radians) => [...mul(normalize(axis), Math.sin(radians/2)), Math.cos(radians/2)];
/** Rotate a vector by a unit quaternion; arguments deliberately follow qMul. */
export function qRotate(q, v) {
  const uv = cross(q.slice(0, 3), v);
  return add(v, add(mul(uv, 2*q[3]), mul(cross(q.slice(0, 3), uv), 2)));
}
export function qSlerp(a, b, t) {
  let d = dot(a, b);
  if (d < 0) { b = mul(b, -1); d = -d; }
  if (d > .9995) return qNormalize(lerp(a, b, t));
  const angle = Math.acos(clamp(d, -1, 1)), s = Math.sin(angle);
  return qNormalize(add(mul(a, Math.sin((1-t)*angle)/s), mul(b, Math.sin(t*angle)/s)));
}
/** Columns of an orthonormal, right-handed rotation basis. */
export function qFromBasis(x, y, z) {
  const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2];
  const trace=m00+m11+m22;let q,s;
  if(trace>0){s=Math.sqrt(trace+1)*2;q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
  else if(m00>m11&&m00>m22){s=Math.sqrt(1+m00-m11-m22)*2;q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
  else if(m11>m22){s=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
  else{s=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}
  return qNormalize(q);
}
export function qFromTo(a, b) {
  a=normalize(a);b=normalize(b);const d=dot(a,b);
  if(d>1-1e-10)return [...qIdentity];
  if(d<-1+1e-10)return qAxisAngle(normalize(cross(a, Math.abs(a[0])<.8?[1,0,0]:[0,1,0])),Math.PI);
  return qNormalize([...cross(a,b),1+d]);
}
/** Euler order YXZ, useful for independently authored yaw / lean / roll. */
export const qEuler = (x=0, y=0, z=0) => qMul(qMul(qAxisAngle([0,1,0],y),qAxisAngle([1,0,0],x)),qAxisAngle([0,0,1],z));

export function palmMarker(profile, hand) {
  const p=profile.palms?.[hand]?.palmPoint;
  if(!p)throw new Error(`Missing measured palm marker: ${profile.id}/${hand}`);
  return p;
}
export function soleMarker(profile, foot) {
  const joint=profile.joints.find(j=>j.name===foot);
  if(!joint)throw new Error(`Missing foot: ${profile.id}/${foot}`);
  return [0,-joint.worldPosition[1],0];
}
/** FK includes the external reference root unless local:true. Joint lengths and
 * bind rotations are never changed. Root bone motion and host motion are distinct. */
export function FK(profile, frame, {local=false}={}) {
  const world={},rootQ=local?qIdentity:(frame.rootRotationQuaternion||qIdentity),rootP=local?[0,0,0]:(frame.referenceRootTranslationMeters||[0,0,0]);
  for(const joint of profile.joints){
    const parent=world[joint.parent];let p=[...joint.translation];
    if(joint.name==='Hips')p=add(p,frame.hipsOffsetMeters||[0,0,0]);
    const q=frame.rotations[joint.name]||qIdentity;
    world[joint.name]=parent?{position:add(parent.position,qRotate(parent.rotation,p)),rotation:qMul(parent.rotation,q)}:{position:add(rootP,qRotate(rootQ,p)),rotation:qMul(rootQ,q)};
  }
  const palms={},soles={};
  for(const hand of ['LeftHand','RightHand'])palms[hand]=add(world[hand].position,qRotate(world[hand].rotation,palmMarker(profile,hand)));
  for(const foot of ['LeftFoot','RightFoot'])soles[foot]=add(world[foot].position,qRotate(world[foot].rotation,soleMarker(profile,foot)));
  return {world,palms,soles};
}
/** Normalized 0..1 time, baked easing retained. Discrete contact/phase fields
 * come from the preceding key; vector fields use LINEAR and rotations SLERP. */
export function sampleFrame(clip, normalizedTime) {
  const frames=clip.keyframes;
  if(!frames?.length)throw new Error('Clip has no keyframes');
  const t=clamp(normalizedTime),last=frames.at(-1);
  if(t>=last.time)return {...last,time:t};
  let low=0,high=frames.length-1;
  while(high-low>1){const middle=(low+high)>>1;if(frames[middle].time<=t)low=middle;else high=middle;}
  const a=frames[low],b=frames[high],u=clamp((t-a.time)/(b.time-a.time||1));
  const sampled={...a,time:t,rotations:Object.fromEntries(Object.keys(a.rotations).map(name=>[name,qSlerp(a.rotations[name],b.rotations[name],u)]))};
  for(const field of ['hipsOffsetMeters','referenceRootTranslationMeters','ballPositionMeters'])if(a[field]&&b[field])sampled[field]=lerp(a[field],b[field],u);
  for(const field of ['rootRotationQuaternion','ballRotationQuaternion'])if(a[field]&&b[field])sampled[field]=qSlerp(a[field],b[field],u);
  return sampled;
}
/** Supply a dedicated motionGroup below any display-lane/world placement group. */
export function createActor(scene, profile, motionGroup=scene) {
  const bones={};
  for(const joint of profile.joints){const bone=scene.getObjectByName(joint.name);if(!bone?.isBone)throw new Error(`Missing canonical joint ${profile.id}/${joint.name}`);bones[joint.name]=bone;}
  return {scene,profile,bones,motionGroup};
}
export function applyFrame(actor, frame) {
  for(const joint of actor.profile.joints){
    actor.bones[joint.name].position.fromArray(joint.translation);
    actor.bones[joint.name].quaternion.fromArray(frame.rotations[joint.name]||qIdentity);
    actor.bones[joint.name].scale.set(1,1,1);
  }
  const offset=frame.hipsOffsetMeters||[0,0,0];
  actor.bones.Hips.position.x+=offset[0];actor.bones.Hips.position.y+=offset[1];actor.bones.Hips.position.z+=offset[2];
  actor.motionGroup.position.fromArray(frame.referenceRootTranslationMeters||[0,0,0]);
  actor.motionGroup.quaternion.fromArray(frame.rootRotationQuaternion||qIdentity);
  actor.motionGroup.updateMatrixWorld(true);
  return actor;
}
