// SPDX-License-Identifier: CC0-1.0
// C1 bridges for canonical18 local poses. Browser and Node; no dependencies.

export const CANONICAL_BONES=Object.freeze([
 'Root','Hips','Spine','Chest','Neck','Head',
 'LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand',
 'LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'
]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const scale=(a,s)=>a.map(v=>v*s);
const zero=n=>Array(n).fill(0);
function vector(value,width,label){
 if(!Array.isArray(value)||value.length!==width||!value.every(Number.isFinite))throw new TypeError(`${label} must contain ${width} finite numbers`);
 return [...value];
}
function scalar(value,label){if(!Number.isFinite(value))throw new TypeError(`${label} must be finite`);return value;}
function normalized(q,derivative){
 const norm=Math.hypot(...q);
 if(norm<1e-10)throw new RangeError('A quaternion cannot have zero length');
 q=scale(q,1/norm);
 const radial=dot(q,derivative);
 return {q,d:derivative.map((v,i)=>(v-q[i]*radial)/norm)};
}
function endpoint(input,label){
 if(!input||typeof input!=='object')throw new TypeError(`${label} pose is required`);
 const rotations={},rotationDerivatives={};
 for(const name of Object.keys(input.rotations??{}))if(!CANONICAL_BONES.includes(name))throw new TypeError(`Unsupported bone ${name}; bridge body bones only`);
 for(const name of Object.keys(input.rotationDerivatives??{}))if(!CANONICAL_BONES.includes(name))throw new TypeError(`Unsupported rotation derivative ${name}`);
 for(const name of CANONICAL_BONES){
  const result=normalized(vector(input.rotations?.[name],4,`${label}.${name}`),vector(input.rotationDerivatives?.[name]??zero(4),4,`${label}.${name} derivative`));
  rotations[name]=result.q;rotationDerivatives[name]=result.d;
 }
 return {
  hips:vector(input.hips,3,`${label}.hips`),hipsVelocity:vector(input.hipsVelocity??zero(3),3,`${label}.hipsVelocity`),
  rotations,rotationDerivatives,
  leftOpen:scalar(input.leftOpen??0,`${label}.leftOpen`),leftOpenVelocity:scalar(input.leftOpenVelocity??0,`${label}.leftOpenVelocity`)
 };
}

/**
 * Capture two complete parent-local poses and their velocities at the splice.
 * Rotations use xyzw. rotationDerivatives are quaternion component / second,
 * not Euler angles or angular velocities. Missing velocities mean rest.
 * The source exit and target entry velocities should come from the GLB's
 * outgoing and incoming CUBICSPLINE tangents respectively. Normalization
 * projects tangents onto the quaternion unit sphere, preserving C1 rotation.
 * Only the canonical18 transforms and the left-hand opening morph participate;
 * the immutable RightHand → racket_mount attachment is never modified.
 */
export function createBridge({from,to,duration=.3}={}){
 if(!Number.isFinite(duration)||duration<=0)throw new RangeError('Bridge duration must be positive and finite');
 const start=endpoint(from,'from'),end=endpoint(to,'to');
 for(const name of CANONICAL_BONES)if(dot(start.rotations[name],end.rotations[name])<0){
  end.rotations[name]=scale(end.rotations[name],-1);
  end.rotationDerivatives[name]=scale(end.rotationDerivatives[name],-1);
 }
 return {kind:'canonical18-c1-bridge',duration,from:start,to:end};
}

function hermite(a,b,da,db,u,duration){
 const u2=u*u,u3=u2*u;
 const h00=2*u3-3*u2+1,h10=u3-2*u2+u,h01=-2*u3+3*u2,h11=u3-u2;
 const d00=(6*u2-6*u)/duration,d10=3*u2-4*u+1,d01=(-6*u2+6*u)/duration,d11=3*u2-2*u;
 return {
  value:a.map((v,i)=>h00*v+h10*duration*da[i]+h01*b[i]+h11*duration*db[i]),
  derivative:a.map((v,i)=>d00*v+d10*da[i]+d01*b[i]+d11*db[i])
 };
}

/** Parent-local angular velocity, radians/second, from a unit xyzw quaternion. */
export function quaternionAngularVelocity(q,derivative){
 const {q:n,d}=normalized(vector(q,4,'quaternion'),vector(derivative,4,'quaternion derivative'));
 const [x,y,z,w]=n,[dx,dy,dz,dw]=d;
 // 2 * vector(conjugate(q) * dq): local, expressed in the bone frame.
 return [2*(w*dx-x*dw-y*dz+z*dy),2*(w*dy+x*dz-y*dw-z*dx),2*(w*dz-x*dy+y*dx-z*dw)];
}

/**
 * Evaluate analytically, including velocities. Time is seconds, clamped to
 * [0,duration]. Exactly at either endpoint the supplied derivative is retained;
 * outside the interval the returned constant pose has zero velocity. Handover
 * to the target clip at duration, rather than sampling past the bridge.
 */
export function sampleBridge(bridge,time){
 if(bridge?.kind!=='canonical18-c1-bridge')throw new TypeError('Expected a bridge from createBridge');
 scalar(time,'Bridge time');
 const {from,to,duration}=bridge,u=Math.max(0,Math.min(1,time/duration)),outside=time<0||time>duration;
 const hips=hermite(from.hips,to.hips,from.hipsVelocity,to.hipsVelocity,u,duration);
 const left=hermite([from.leftOpen],[to.leftOpen],[from.leftOpenVelocity],[to.leftOpenVelocity],u,duration);
 const rotations={},rotationDerivatives={},angularVelocities={};
 for(const name of CANONICAL_BONES){
  const h=hermite(from.rotations[name],to.rotations[name],from.rotationDerivatives[name],to.rotationDerivatives[name],u,duration);
  const {q,d}=normalized(h.value,h.derivative);
  rotations[name]=q;rotationDerivatives[name]=outside?zero(4):d;
  angularVelocities[name]=quaternionAngularVelocity(q,rotationDerivatives[name]);
 }
 return {
  time:Math.max(0,Math.min(duration,time)),finished:time>=duration,
  hips:hips.value,hipsVelocity:outside?zero(3):hips.derivative,
  rotations,rotationDerivatives,angularVelocities,
  leftOpen:left.value[0],leftOpenVelocity:outside?0:left.derivative[0]
 };
}

/** Apply to a loaded Three.js hierarchy without changing equipment transforms. */
export function applyLocalPose(root,pose){
 if(typeof root?.getObjectByName!=='function')throw new TypeError('Expected a loaded scene hierarchy');
 // Resolve everything before mutation, so a mismatched rig fails atomically.
 const nodes=CANONICAL_BONES.map(name=>{
  const node=root.getObjectByName(name);
  if(!node?.quaternion||!node?.position)throw new TypeError(`Missing canonical bone ${name}`);
  vector(pose.rotations?.[name],4,`${name} rotation`);return node;
 });
 vector(pose.hips,3,'hips');
 for(let i=0;i<nodes.length;i++)nodes[i].quaternion.fromArray(pose.rotations[CANONICAL_BONES[i]]);
 nodes[1].position.fromArray(pose.hips);
 const left=root.getObjectByName('grip_hand_L');
 if(left?.morphTargetInfluences&&Number.isFinite(pose.leftOpen))left.morphTargetInfluences[0]=pose.leftOpen;
 root.updateMatrixWorld?.(true);
}
