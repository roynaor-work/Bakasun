/** Original CC0-1.0. Read-only motion continuity audit. No package imports; independent FK.
 * Reports extrema for review rather than claiming a physiological pass/fail.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args = process.argv.slice(2);
const root = path.resolve(args.find(argument => !argument.startsWith('--')) || fileURLToPath(new URL('../', import.meta.url)));
const catalog = JSON.parse(await fs.readFile(path.join(root, 'runtime/catalog.json'), 'utf8'));
const add = (a,b) => a.map((v,i) => v+b[i]);
const sub = (a,b) => a.map((v,i) => v-b[i]);
const mul = (a,s) => a.map(v => v*s);
const dot = (a,b) => a.reduce((n,v,i) => n+v*b[i],0);
const length = a => Math.hypot(...a);
const normalize = a => mul(a, 1/(length(a)||1));
const qmul = (a,b) => [
 a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
 a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
 a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
 a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
const rotate = (q,v) => qmul(qmul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
const angle = (a,b) => Math.acos(Math.min(1,Math.max(-1,dot(normalize(a),normalize(b)))))*180/Math.PI;
const qangle = (a,b) => 2*Math.acos(Math.min(1,Math.max(-1,Math.abs(dot(normalize(a),normalize(b))))))*180/Math.PI;
function fk(profile, frame) {
 const world={}, palms={}, soles={};
 for(const joint of profile.joints){
  const parent=world[joint.parent];
  const local=joint.name==='Hips'?add(joint.translation,frame.hipsOffsetMeters):joint.translation;
  const localQ=frame.rotations[joint.name];
  world[joint.name]=parent?{p:add(parent.p,rotate(parent.q,local)),q:qmul(parent.q,localQ)}:{p:add(frame.referenceRootTranslationMeters,rotate(frame.rootRotationQuaternion,local)),q:qmul(frame.rootRotationQuaternion,localQ)};
 }
 for(const hand of ['LeftHand','RightHand'])palms[hand]=add(world[hand].p,rotate(world[hand].q,profile.palms[hand].palmPoint));
 for(const foot of ['LeftFoot','RightFoot']){
  const joint=profile.joints.find(j=>j.name===foot);
  soles[foot]=add(world[foot].p,rotate(world[foot].q,[0,-joint.worldPosition[1],0]));
 }
 return {world,palms,soles};
}
const round = n => Number(n.toFixed(4));
const extrema = () => ({value:0,timeSeconds:0});
function maxAt(record, value, timeSeconds, extra={}) {if(value>record.value)Object.assign(record,{value,timeSeconds:round(timeSeconds),...extra});}
const results=[];
for(const meta of catalog.clips)for(const profile of catalog.profiles){
 const sourceBytes=await fs.readFile(path.join(root,`runtime/keyframes/${profile.id}/${meta.id}.json`));
 const clip=JSON.parse(sourceBytes.toString('utf8'));
 const keyframesSha256=createHash('sha256').update(sourceBytes).digest('hex');
 const frames=clip.keyframes, worlds=frames.map(frame=>fk(profile,frame));
 const result={id:meta.id,profile:profile.id,loop:meta.loop,keyframesSha256,maximumPalmVelocity:extrema(),maximumContactPalmVelocity:extrema(),maximumSoleVelocity:extrema(),maximumBoneWorldOrientationStep:extrema(),maximumBoneLocalOrientationStep:extrema(),maximumKneeBackwardOffset:extrema(),minimumElbowInteriorDegrees:{value:180,timeSeconds:0},maximumElbowSideOffset:extrema(),maximumRootVelocity:extrema(),maximumRootVelocityChange:extrema(),hotspots:[]};
 const rootVelocities=[];
 for(let i=0;i<frames.length;i++){
  const frame=frames[i],world=worlds[i],time=frame.time*clip.durationSeconds;
  const hipsForward=rotate(world.world.Hips.q,[0,0,1]);
  const hipsRight=rotate(world.world.Hips.q,[1,0,0]);
  for(const side of ['Left','Right']){
   const hip=world.world[side+'UpLeg'].p,knee=world.world[side+'Leg'].p,ankle=world.world[side+'Foot'].p;
   const hipAnkle=sub(ankle,hip),u=dot(sub(knee,hip),hipAnkle)/(dot(hipAnkle,hipAnkle)||1),projection=add(hip,mul(hipAnkle,u));
   const kneeBackward=-dot(sub(knee,projection),hipsForward);
   maxAt(result.maximumKneeBackwardOffset,kneeBackward,time,{side});
   const shoulder=world.world[side+'Arm'].p,elbow=world.world[side+'ForeArm'].p,wrist=world.world[side+'Hand'].p;
   const elbowAngle=angle(sub(shoulder,elbow),sub(wrist,elbow));
   if(elbowAngle<result.minimumElbowInteriorDegrees.value)Object.assign(result.minimumElbowInteriorDegrees,{value:round(elbowAngle),timeSeconds:round(time),side});
   maxAt(result.maximumElbowSideOffset,Math.abs(dot(sub(elbow,shoulder),hipsRight)),time,{side});
  }
  if(i===0)continue;
  const previous=frames[i-1],a=worlds[i-1],delta=(frame.time-previous.time)*clip.durationSeconds;
  for(const hand of ['LeftHand','RightHand']){
   const speed=length(sub(world.palms[hand],a.palms[hand]))/delta;
   maxAt(result.maximumPalmVelocity,speed,time,{hand,wasContact:previous.handContacts[hand].touching,isContact:frame.handContacts[hand].touching});
   if(previous.handContacts[hand].touching&&frame.handContacts[hand].touching)maxAt(result.maximumContactPalmVelocity,speed,time,{hand});
  }
  for(const foot of ['LeftFoot','RightFoot'])maxAt(result.maximumSoleVelocity,length(sub(world.soles[foot],a.soles[foot]))/delta,time,{foot});
  for(const joint of profile.joints){
   maxAt(result.maximumBoneWorldOrientationStep,qangle(world.world[joint.name].q,a.world[joint.name].q),time,{bone:joint.name});
   maxAt(result.maximumBoneLocalOrientationStep,qangle(frame.rotations[joint.name],previous.rotations[joint.name]),time,{bone:joint.name});
  }
  const rv=mul(sub(frame.referenceRootTranslationMeters,previous.referenceRootTranslationMeters),1/delta);rootVelocities.push(rv);
  maxAt(result.maximumRootVelocity,length(rv),time);
  if(rootVelocities.length>1)maxAt(result.maximumRootVelocityChange,length(sub(rv,rootVelocities.at(-2))),time);
 }
 if(meta.kind==='shot'){
  const release=(clip.events||[]).find(event=>event.type==='ball_release'&&event.bounceIndex===undefined);
  const releaseIndex=release?frames.findIndex(frame=>Math.abs(frame.time*clip.durationSeconds-release.timeSeconds)<1e-6):-1;
  // Release events in this package coincide with an authored 30Hz key. Keep a
  // missing/non-key event explicit rather than inventing a nearby-time value.
  result.releaseTimeSeconds=release?.timeSeconds??null;
  result.releaseRightElbowInteriorDegrees=null;
  if(releaseIndex>=0){
   const world=worlds[releaseIndex].world,shoulder=world.RightArm.p,elbow=world.RightForeArm.p,wrist=world.RightHand.p;
   result.releaseRightElbowInteriorDegrees=angle(sub(shoulder,elbow),sub(wrist,elbow));
  }
 }
 const start=frames[0],end=frames.at(-1);
 result.endpoint={rootDistanceMeters:round(length(sub(start.referenceRootTranslationMeters,end.referenceRootTranslationMeters))),ballLocalDistanceMeters:round(length(sub(start.ballPositionMeters,end.ballPositionMeters))),maximumLocalRotationDifferenceDegrees:round(Math.max(...profile.joints.map(j=>qangle(start.rotations[j.name],end.rotations[j.name]))))};
 if(result.maximumPalmVelocity.value>12)result.hotspots.push('Palm displacement exceeds 0.4m in one 30Hz interval; inspect contact transition/follow-through.');
 if(result.maximumBoneWorldOrientationStep.value>50)result.hotspots.push('World bone orientation changes by more than 50 degrees in one interval; inspect pole or hand rotation.');
 if(result.maximumKneeBackwardOffset.value>.05)result.hotspots.push('Knee bend extends backward relative to hips facing; inspect knee pole.');
 if(result.minimumElbowInteriorDegrees.value<20)result.hotspots.push('Elbow folds below 20 degrees; inspect contact posture and reach.');
 results.push(result);
}
const output={method:'Read-only independent FK from delivered JSON. 30Hz maxima and shot-release right elbow angle for visual review; thresholds are attention markers, not anatomical pass/fail gates.',units:{maximumPalmVelocity:'m/s',maximumContactPalmVelocity:'m/s',maximumSoleVelocity:'m/s',maximumBoneWorldOrientationStep:'degrees per 30Hz interval',maximumBoneLocalOrientationStep:'degrees per 30Hz interval',maximumKneeBackwardOffset:'m',minimumElbowInteriorDegrees:'degrees',releaseRightElbowInteriorDegrees:'degrees, shoulder-elbow-wrist interior angle at the non-dribble ball_release key; shots only',maximumElbowSideOffset:'m',maximumRootVelocity:'m/s',maximumRootVelocityChange:'m/s change per interval'},performances:results.length,results};
const preciseNumber=(_key,value)=>typeof value==='number'?Number(value.toFixed(6)):value;
if(args.includes('--json'))console.log(JSON.stringify(output,preciseNumber,2));
else for(const result of results.filter(result=>result.profile==='guard'))console.log(JSON.stringify(result,preciseNumber));
