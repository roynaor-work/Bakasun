/** Original CC0-1.0. Canonical18 rotations, target proportions and explicit lift calibration. */
export const RIM_HEIGHT = 3.05;
export const PALM_CLEARANCE = 0.25;
const add = (a,b) => a.map((v,i)=>v+b[i]);
export function multiplyQuaternion(a,b) {
  const [x,y,z,w]=a,[X,Y,Z,W]=b;
  return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
}
export function rotateVector(v,q) {
  const [x,y,z,w]=q, [a,b,c]=v;
  const tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
function slerp(a,b,t) {
  let dot=a.reduce((s,v,i)=>s+v*b[i],0);
  if(dot<0){b=b.map(v=>-v);dot=-dot;}
  if(dot>.9995){const q=a.map((v,i)=>v+(b[i]-v)*t),n=Math.hypot(...q);return q.map(v=>v/n);}
  const theta=Math.acos(Math.min(1,dot)),s=Math.sin(theta);
  return a.map((v,i)=>(Math.sin((1-t)*theta)*v+Math.sin(t*theta)*b[i])/s);
}
/** Normalized times, LINEAR vectors / shortest-arc SLERP as in the source GLB channels.
 * The source samples already contain authored easing; do not ease them twice. */
export function sampleClip(clip,time) {
  const frames=clip.keyframes,t=Math.max(0,Math.min(1,time));
  let lo=0,hi=frames.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(frames[mid].time<=t)lo=mid;else hi=mid;}
  const a=frames[lo],b=frames[hi],u=Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time||1)));
  const rotations=Object.fromEntries(Object.keys(a.rotations).map(name=>[name,slerp(a.rotations[name],b.rotations[name],u)]));
  const lerp=(field)=>a[field]?.map((v,i)=>v+(b[field][i]-v)*u);
  return {time:t,rotations,hipsOffsetMeters:lerp('hipsOffsetMeters')||[0,0,0],referenceRootTranslationMeters:lerp('referenceRootTranslationMeters')||[0,0,0],ballPositionMeters:lerp('ballPositionMeters')};
}
export function palmPoint(profile,hand) {
  return profile.palms?.[hand]?.palmPoint || profile.palmPoint || [0,-.12,.025];
}
/** Only positive airborne lift is calibrated; crouch and local rotations are preserved. */
export function targetHipsOffset(frame,{jumpScale=1}={}) {
  const [x,y,z]=frame.hipsOffsetMeters||[0,0,0];
  return [x,y>0?y*jumpScale:y,z];
}
export function forwardKinematics(profile,frame,options={}) {
  const world={};
  for(const j of profile.joints){
    let local=j.translation.slice();
    if(j.name==='Hips')local=add(local,targetHipsOffset(frame,options));
    const parent=world[j.parent],q=frame.rotations[j.name]||[0,0,0,1];
    world[j.name]=parent?{position:add(parent.position,rotateVector(local,parent.rotation)),rotation:multiplyQuaternion(parent.rotation,q)}:{position:local,rotation:q.slice()};
  }
  const palms={};
  for(const hand of ['LeftHand','RightHand'])palms[hand]=add(world[hand].position,rotateVector(palmPoint(profile,hand),world[hand].rotation));
  return {world,palms};
}
export function createActor(scene,profile) {
  const bones={};
  for(const joint of profile.joints){
    const bone=scene.getObjectByName(joint.name);
    if(!bone?.isBone)throw new Error(`Missing canonical bone ${joint.name}`);
    bones[joint.name]=bone;
  }
  return {scene,root:scene,profile,bones};
}
export function applyFrame(actor,frame,options={}) {
  for(const j of actor.profile.joints){
    actor.bones[j.name].quaternion.fromArray(frame.rotations[j.name]||[0,0,0,1]);
    actor.bones[j.name].position.fromArray(j.translation);
  }
  const offset=targetHipsOffset(frame,options);
  actor.bones.Hips.position.x+=offset[0];actor.bones.Hips.position.y+=offset[1];actor.bones.Hips.position.z+=offset[2];
  actor.scene.updateMatrixWorld(true);
  return actor;
}
/** Minimum amplitude of the *existing* flight envelope, with both palms for a two-hand dunk.
 * No clip bytes, timing, joint rotation, bind offset or limb length is changed.
 * Root/world motion is deliberately excluded from reach measurements.
 */
export function calibrateDunk(clip,profile,{safetyMeters=.005}={}) {
  const hands=clip.id==='dunk_two_hands'?['LeftHand','RightHand']:['RightHand'];
  const sourcePeakHipsLift=Math.max(...clip.keyframes.map(f=>f.hipsOffsetMeters[1]));
  let best=null;
  for(const frame of clip.keyframes){
    const lift=frame.hipsOffsetMeters[1];
    if(lift<=0 || frame.time<.45 || frame.time>.62)continue;
    const fk=forwardKinematics(profile,frame,{jumpScale:0});
    const reach=Math.min(...hands.map(h=>fk.palms[h][1]));
    const scale=Math.max(0,(RIM_HEIGHT+PALM_CLEARANCE+safetyMeters-reach)/lift);
    if(!best || scale<best.jumpScale)best={jumpScale:scale,peakTime:frame.time,staticPalmHeight:reach};
  }
  if(!best)throw new Error(`No dunk flight samples: ${clip.id}`);
  const frame=sampleClip(clip,best.peakTime),fk=forwardKinematics(profile,frame,{jumpScale:best.jumpScale});
  const peakPalmHeight=Math.min(...hands.map(h=>fk.palms[h][1]));
  return {...best,hands,requiredJump:sourcePeakHipsLift*best.jumpScale,peakHipsLift:sourcePeakHipsLift*best.jumpScale,
    sourcePeakHipsLift,peakPalmHeight,clearance:peakPalmHeight-RIM_HEIGHT,
    peakPalmPositions:Object.fromEntries(hands.map(h=>[h,fk.palms[h]])),
    pass:peakPalmHeight>=RIM_HEIGHT+PALM_CLEARANCE-1e-8&&sourcePeakHipsLift*best.jumpScale<=1};
}
