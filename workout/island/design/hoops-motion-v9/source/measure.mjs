#!/usr/bin/env node
/** Independent delivered-asset audit. No authoring module is imported here.
 * Measurements come from GLTFLoader/Draco's scene animated by AnimationMixer.
 * The in-place FK is combined with the documented host reference trajectory
 * solely for world-space support, speed and acceleration measurements.
 */
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as THREE from '../runtime/vendor/three.module.js';
import {CATALOG} from '../runtime/catalog.mjs';
import {SKELETON, CANONICAL_BONE_NAMES} from '../runtime/skeleton.mjs';

export const LIMITS=Object.freeze({footSlideMeters:.02,plantHeightMeters:.02,holdSurfaceMeters:.02,floorPenetrationMeters:.012,
  decodedPositionMeters:2e-5,decodedAngleRadians:3e-5,cadenceErrorPercent:10,
  groundedAccelerationMetersPerSecond2:.4,groundedLeanAlignedFraction:.90,
  carryAboveChestMeters:.15,kneeFlexionDegrees:155,elbowFlexionDegrees:165,wristSwingDegrees:105,
  loopPositionMeters:1e-7,loopAngleRadians:1e-6,dunkPalmMeters:3.30});
export const ANATOMICAL_ENVELOPES=Object.freeze({kneeSignedFlexionDegrees:[-3,155],kneeOffHingeDegrees:10,
  elbowSignedFlexionDegrees:[-165,3],elbowOffHingeDegrees:10,forearmPronationDegrees:[-100,100],
  hipFlexionDegrees:[-50,145],hipAbductionDegrees:[-45,75],hipAxialTwistDegrees:[-80,80],
  shoulderFlexionDegrees:[-100,200],shoulderAxialTwistDegrees:[-130,130],shoulderTwistAmbiguousAboveElevationDegrees:150,
  ankleSagittalDegrees:[-65,65],ankleLateralDegrees:[-40,40],ankleAxialTwistDegrees:[-35,35],wristSwingDegrees:105,
  forearmHandAxialDeviationFromMedialNeutralDegrees:[-125,125],spineCombinedDegrees:70,chestCombinedDegrees:70,neckCombinedDegrees:85,headCombinedDegrees:90});
const RATE=120, FOOT=[0,-.08,0], PALM=[0,-.08,.025], D=180/Math.PI;
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const norm=a=>Math.hypot(...a),distance=(a,b)=>norm(sub(a,b));
const unit=a=>norm(a)>1e-12?mul(a,1/norm(a)):[0,0,0];
const clamp=(v,a=-1,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
function product(a,b){const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];}
function rotate(q,v){return product(product(q,[...v,0]),inverse(q)).slice(0,3);}
function angle(a,b){return 2*Math.acos(clamp(Math.abs(dot(a,b))/(norm(a)*norm(b)),0,1));}
function slerp(a,b,t){let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d;}if(d>.9995){const q=mix(a,b,t);return mul(q,1/norm(q));}const th=Math.acos(clamp(d)),s=Math.sin(th);return a.map((x,i)=>(Math.sin((1-t)*th)*x+Math.sin(t*th)*b[i])/s);}
const degreesBetween=(a,b)=>Math.acos(clamp(dot(unit(a),unit(b))))*D;
const quantile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))];};
const average=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const amplitude=a=>a.length?(Math.max(...a)-Math.min(...a))/2:0;
function correlation(a,b){const ma=average(a),mb=average(b);let xy=0,xx=0,yy=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;xy+=x*y;xx+=x*x;yy+=y*y;}return xx*yy>1e-14?xy/Math.sqrt(xx*yy):null;}
function unwrap(values){const out=[];for(let v of values){if(out.length){while(v-out.at(-1)>Math.PI)v-=2*Math.PI;while(v-out.at(-1)<-Math.PI)v+=2*Math.PI;}out.push(v);}return out;}
function axialTwist(q,index){
  q=mul(q,1/norm(q));if(q[3]<0)q=mul(q,-1);
  const length=Math.hypot(q[index],q[3]);if(length<1e-8)return null;
  const twist=[0,0,0,q[3]/length];twist[index]=q[index]/length;
  return {angle:2*Math.atan2(twist[index],twist[3])*D,rotation:twist,swing:product(q,inverse(twist))};
}
function hinge(q){const x=axialTwist(q,0);return x?{angle:x.angle,offAxis:angle(q,x.rotation)*D}:{angle:0,offAxis:180};}

/** Separate implementation of the delivered LINEAR/slerp metadata contract. */
export function sampleDelivered(data,t){
  const frames=data.keyframes;if(t<=0)return frames[0];if(t>=1)return frames.at(-1);
  let a=0,b=frames.length-1;while(b-a>1){const m=(a+b)>>1;if(frames[m].time<=t)a=m;else b=m;}
  const x=frames[a],y=frames[b],u=(t-x.time)/(y.time-x.time);
  return {rotations:Object.fromEntries(CANONICAL_BONE_NAMES.map(n=>[n,slerp(x.rotations[n],y.rotations[n],u)])),
    hipsOffsetMeters:mix(x.hipsOffsetMeters,y.hipsOffsetMeters,u),
    ballPositionMeters:mix(x.ballPositionMeters,y.ballPositionMeters,u),
    ballRotationQuaternion:slerp(x.ballRotationQuaternion||[0,0,0,1],y.ballRotationQuaternion||[0,0,0,1],u),
    referenceRootTranslationMeters:mix(x.referenceRootTranslationMeters||[0,0,0],y.referenceRootTranslationMeters||[0,0,0],u)};
}
function metadataFK(frame,skeleton){const result={};for(const b of skeleton.bones){const p=result[b.parent];const tr=b.name==='Hips'?add(b.restTranslationMeters,frame.hipsOffsetMeters):b.restTranslationMeters;result[b.name]={position:p?add(p.position,rotate(p.rotation,tr)):[...tr],rotation:p?product(p.rotation,frame.rotations[b.name]):frame.rotations[b.name]};}return result;}
function phaseAt(data,t){
  const windows=data.phases||[];
  const w=windows.find(w=>t>=w.startTime-1e-9&&t<=w.endTime+1e-9);
  if(w)return w.name||w.phase;
  const trajectory=data.ball?.trajectory||[];let lo=0,hi=trajectory.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if((trajectory[m].time??trajectory[m].normalizedTime??0)<=t)lo=m;else hi=m;}
  return trajectory[lo]?.phase||data.keyframes[Math.min(data.keyframes.length-1,Math.floor(t*(data.keyframes.length-1)))]?.phase||null;
}
const contains=(w,t)=>t>=w.startTime-1e-8&&t<=w.endTime+1e-8;
function worldPoint(sample,name,local){return add(sample.bones[name].position,rotate(sample.bones[name].rotation,local));}
function eventTime(e,data){return Number.isFinite(e.time)?e.time:e.atSeconds/data.durationSeconds;}
const localPoseFields=['hipsOffsetMeters','ballPositionMeters','ballRotationQuaternion'];
function exactLoop(data){const a=data.keyframes[0],b=data.keyframes.at(-1);return CANONICAL_BONE_NAMES.every(n=>JSON.stringify(a.rotations[n])===JSON.stringify(b.rotations[n]))&&localPoseFields.every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));}

function sampleScene(loaded,t,action,mixer,nodes){
  action.time=t*loaded.animation.duration;action.enabled=true;action.paused=true;mixer.update(0);loaded.scene.updateMatrixWorld(true);
  const frame=sampleDelivered(loaded.data,t),expected=metadataFK(frame,loaded.data.skeleton),bones={};
  let positionError=0,rotationError=0,boneLengthError=0;
  const v=new THREE.Vector3(),q=new THREE.Quaternion();
  for(const b of SKELETON.bones){const node=nodes[b.name];node.getWorldPosition(v);node.getWorldQuaternion(q);
    bones[b.name]={position:v.toArray(),rotation:q.toArray(),localRotation:node.quaternion.toArray()};
    positionError=Math.max(positionError,distance(bones[b.name].position,expected[b.name].position));
    rotationError=Math.max(rotationError,angle(bones[b.name].rotation,expected[b.name].rotation));
    if(b.name!=='Root'&&b.name!=='Hips')boneLengthError=Math.max(boneLengthError,Math.abs(node.position.length()-norm(b.restTranslationMeters)));
  }
  // Ball is a scene-root sibling, so its animated local quaternion is canonical.
  // getWorldQuaternion cannot decompose its intentional zero-scale hidden mesh.
  const ball=nodes.Ball;if(ball){ball.getWorldPosition(v);positionError=Math.max(positionError,distance(v.toArray(),frame.ballPositionMeters));rotationError=Math.max(rotationError,angle(ball.quaternion.toArray(),frame.ballRotationQuaternion));}
  return {t,seconds:t*loaded.data.durationSeconds,bones,ball:ball?v.toArray():frame.ballPositionMeters,reference:frame.referenceRootTranslationMeters,
    phase:phaseAt(loaded.data,t),positionError,rotationError,boneLengthError};
}

function touchdownCount(samples,foot){
  // Height hysteresis is independent of horizontal speed and support markers.
  const heights=samples.map(s=>worldPoint(s,foot,FOOT)[1]);
  let on=heights[0]<=.012,count=0,last=-Infinity;
  for(let i=1;i<heights.length;i++){
    if(on&&heights[i]>.025)on=false;
    else if(!on&&heights[i]<=.012){if(samples[i].seconds-last>.12){count++;last=samples[i].seconds;}on=true;}
  }
  return count;
}
function anatomyAt(s,result){
  const bones=s.bones;const violation=(joint,kind,value,low,high)=>{
    const ranges=result.jointRanges[joint]||(result.jointRanges[joint]={}),range=ranges[kind]||(ranges[kind]={minDegrees:Infinity,maxDegrees:-Infinity,allowedMinDegrees:low,allowedMaxDegrees:high});range.minDegrees=Math.min(range.minDegrees,value);range.maxDegrees=Math.max(range.maxDegrees,value);
    if(value<low-1e-3||value>high+1e-3){const key=`${joint}:${kind}`;if(!result.anatomicalViolations.some(v=>v.key===key))result.anatomicalViolations.push({key,joint,kind,value,low,high,time:s.t});}
  };
  for(const side of ['Left','Right']){
    const p=n=>bones[side+n].position;
    const knee=180-degreesBetween(sub(p('UpLeg'),p('Leg')),sub(p('Foot'),p('Leg')));
    const elbow=180-degreesBetween(sub(p('Arm'),p('ForeArm')),sub(p('Hand'),p('ForeArm')));
    result.maxKneeFlexionDegrees=Math.max(result.maxKneeFlexionDegrees,knee);result.minKneeFlexionDegrees=Math.min(result.minKneeFlexionDegrees,knee);
    result.maxElbowFlexionDegrees=Math.max(result.maxElbowFlexionDegrees,elbow);
    violation(side+'Leg','flexion',knee,0,LIMITS.kneeFlexionDegrees);violation(side+'ForeArm','flexion',elbow,0,LIMITS.elbowFlexionDegrees);
    const kh=hinge(bones[side+'Leg'].localRotation),pronation=axialTwist(bones[side+'ForeArm'].localRotation,1),eh=hinge(pronation?.swing||bones[side+'ForeArm'].localRotation);
    result.maxKneeOffHingeDegrees=Math.max(result.maxKneeOffHingeDegrees,kh.offAxis);result.maxElbowOffHingeDegrees=Math.max(result.maxElbowOffHingeDegrees,eh.offAxis);
    result.maxForearmPronationDegrees=Math.max(result.maxForearmPronationDegrees,Math.abs(pronation?.angle||0));
    violation(side+'Leg','off-hinge rotation',kh.offAxis,0,10);violation(side+'Leg','signed hinge flexion',kh.angle,-3,LIMITS.kneeFlexionDegrees);
    // Canonical arms use +X pointing anatomical left; forward elbow flexion
    // is negative X. Knees flex positively X in the same unchanged bind axes.
    violation(side+'ForeArm','off-hinge rotation',eh.offAxis,0,10);violation(side+'ForeArm','signed hinge flexion',eh.angle,-LIMITS.elbowFlexionDegrees,3);
    if(pronation)violation(side+'ForeArm','pronation',pronation.angle,-100,100);
    const thigh=rotate(inverse(bones.Hips.rotation),unit(sub(p('Leg'),p('UpLeg'))));
    const flex=Math.atan2(thigh[2],-thigh[1])*D,abduct=Math.asin(clamp((side==='Left'?1:-1)*thigh[0]))*D;
    violation(side+'UpLeg','flexion',flex,-50,145);violation(side+'UpLeg','abduction',abduct,-45,75);
    const hipTwist=axialTwist(bones[side+'UpLeg'].localRotation,1);
    if(hipTwist){result.maxHipAxialTwistDegrees=Math.max(result.maxHipAxialTwistDegrees,Math.abs(hipTwist.angle));violation(side+'UpLeg','axial twist',hipTwist.angle,-80,80);}
    const upper=rotate(inverse(bones.Chest.rotation),unit(sub(p('ForeArm'),p('Arm'))));
    let shoulderFlex=Math.atan2(upper[2],-upper[1])*D;
    // atan2 wraps a legitimate overhead reach from +179 to -179 degrees.
    if(upper[1]>0&&shoulderFlex< -100)shoulderFlex+=360;
    // Elevation from the torso-down direction; hands may reach overhead.
    result.maxUpperArmElevationDegrees=Math.max(result.maxUpperArmElevationDegrees,Math.acos(clamp(-upper[1]))*D);
    violation(side+'Arm','posterior extension',shoulderFlex,-100,200);
    const shoulderElevation=Math.acos(clamp(-upper[1]))*D,shoulderTwist=axialTwist(bones[side+'Arm'].localRotation,1);
    if(shoulderElevation>=150)result.overheadTwistAmbiguousSampleCount++;
    if(shoulderTwist){result.maxShoulderAxialTwistDegrees=Math.max(result.maxShoulderAxialTwistDegrees,Math.abs(shoulderTwist.angle));if(shoulderElevation<150)violation(side+'Arm','axial twist',shoulderTwist.angle,-130,130);}
    const shinAxis=unit(sub(p('Foot'),p('UpLeg'))),bend=sub(sub(p('Leg'),p('UpLeg')),mul(shinAxis,dot(sub(p('Leg'),p('UpLeg')),shinAxis)));
    const forward=rotate(bones.Hips.rotation,[0,0,1]),projection=sub(forward,mul(shinAxis,dot(forward,shinAxis)));
    if(knee>8&&norm(bend)>.001&&norm(projection)>.001)result.minKneeForwardDot=Math.min(result.minKneeForwardDot,dot(unit(bend),unit(projection)));
    // Geometric ankle bend is invariant to the IK segment frame's axial twist.
    // A neutral shin and toe axis are perpendicular. Local Euler X would
    // incorrectly call a 180-degree segment-frame twist 180-degree flexion.
    const shank=unit(sub(p('Foot'),p('Leg'))),footForward=rotate(bones[side+'Foot'].rotation,[0,0,1]),footRight=rotate(bones[side+'Foot'].rotation,[1,0,0]);
    const ankle=Math.asin(clamp(dot(shank,footForward)))*D;
    const ankleSide=Math.asin(clamp(dot(shank,footRight)))*D;
    result.maxAnkleBendDegrees=Math.max(result.maxAnkleBendDegrees,Math.abs(ankle));
    violation(side+'Foot','ankle flexion',ankle,-65,65);
    violation(side+'Foot','ankle lateral bend',ankleSide,-40,40);
    const ankleTwist=axialTwist(bones[side+'Foot'].localRotation,1);
    if(ankleTwist){result.maxAnkleAxialTwistDegrees=Math.max(result.maxAnkleAxialTwistDegrees,Math.abs(ankleTwist.angle));violation(side+'Foot','ankle axial twist',ankleTwist.angle,-35,35);}
    const fingerAxis=rotate(bones[side+'Hand'].localRotation,[0,-1,0]);
    const wrist=degreesBetween(fingerAxis,[0,-1,0]);
    result.maxWristSwingDegrees=Math.max(result.maxWristSwingDegrees,wrist);
    violation(side+'Hand','wrist swing',wrist,0,LIMITS.wristSwingDegrees);
    const wristAxial=axialTwist(bones[side+'Hand'].localRotation,1);
    if(wristAxial){
      // Bind palms face forward; anatomical neutral palms face medially.
      // Allocate longitudinal hand roll to forearm pronation/supination rather
      // than calling a normal inward palm an impossible 90-degree wrist twist.
      let deviation=(pronation?.angle||0)+wristAxial.angle-(side==='Left'?-90:90);
      while(deviation>180)deviation-=360;while(deviation< -180)deviation+=360;
      result.maxForearmHandAxialDeviationDegrees=Math.max(result.maxForearmHandAxialDeviationDegrees,Math.abs(deviation));
      violation(side+'Hand','forearm/hand axial deviation from medial neutral',deviation,-125,125);
    }
  }
  for(const [name,limit] of [['Spine',70],['Chest',70],['Neck',85],['Head',90]]){
    const bend=angle(bones[name].localRotation,[0,0,0,1])*D;
    result.maxAxialJointDegrees[name]=Math.max(result.maxAxialJointDegrees[name],bend);violation(name,'combined rotation',bend,0,limit);
  }
}
function signature(samples,hasBall,includeBall=true){const result=[];for(let i=0;i<24;i++){const s=samples[Math.round(i*(samples.length-1)/23)];for(const n of ['Hips','Chest','Head','LeftHand','RightHand','LeftFoot','RightFoot'])result.push(...s.bones[n].position);if(includeBall)result.push(...(hasBall?s.ball:[0,0,0]));}return result;}
export const trajectoryRms=(a,b)=>Math.sqrt(a.reduce((sum,x,i)=>sum+(x-b[i])**2,0)/a.length);

/** A loaded GLB is required. Mutating its animation changes these measurements. */
export function measureClip(loaded,{sampleRateHz=RATE}={}){
  const {data,scene,animation}=loaded,meta=CATALOG.find(c=>c.id===loaded.id)||loaded.meta||{};
  if(!scene||!animation)throw new TypeError('measureClip requires the decoded GLB scene and animation');
  const errors=[],fail=s=>{if(!errors.includes(s))errors.push(s);};
  const result={id:loaded.id,durationSeconds:data.durationSeconds,keyCount:data.keyframes.length,sampleRateHz,
    pass:false,errors,exactCanonical:JSON.stringify(data.skeleton)===JSON.stringify(SKELETON),
    maxGlbJsonPositionErrorMeters:0,maxGlbJsonAngleErrorRadians:0,maxBoneLengthErrorMeters:0,
    maxQuaternionNormError:0,maxPlantedFootDriftMeters:0,maxPlantedSoleHeightMeters:0,maxSupportAnchorErrorMeters:0,supportSampleCount:0,supportWindowCount:(data.supportWindows||[]).length,
    plantedCoverage:null,minSoleHeightMeters:Infinity,maxHoldSurfaceErrorMeters:0,holdSampleCount:0,
    carryHandChestMaxMeters:null,carryHandChestP95Meters:null,carrySampleCount:0,
    meanReferenceSpeedMetersPerSecond:0,cadenceHz:null,expectedCadenceHz:null,cadenceErrorPercent:null,
    leanAlignedFraction:null,meanAccelerationLeanDegrees:null,accelerationSampleCount:0,
    shoulderYawAmplitudeDegrees:null,hipYawAmplitudeDegrees:null,counterRotationCorrelation:null,
    brakeAirborneSeconds:null,loopPoseMaxMeters:null,loopPoseMaxRadians:null,exactLoopPose:null,
    minKneeFlexionDegrees:180,maxKneeFlexionDegrees:0,maxElbowFlexionDegrees:0,maxAnkleBendDegrees:0,maxAnkleAxialTwistDegrees:0,maxWristSwingDegrees:0,
    maxUpperArmElevationDegrees:0,minKneeForwardDot:1,maxAxialJointDegrees:{Spine:0,Chest:0,Neck:0,Head:0},
    maxKneeOffHingeDegrees:0,maxElbowOffHingeDegrees:0,maxForearmPronationDegrees:0,maxHipAxialTwistDegrees:0,maxShoulderAxialTwistDegrees:0,maxForearmHandAxialDeviationDegrees:0,overheadTwistAmbiguousSampleCount:0,
    anatomicalViolations:[],jointRanges:{},maxPalmHeightMeters:-Infinity,jumps:[],releases:[],referenceHeadingChangeDegrees:null,cutHeadingErrorDegrees:null,euro:null,rimCrossing:null,dunkPalmAtReleaseMeters:null,dunkPalmRimHorizontalMeters:null,dunkReleasePalms:null,
    heldPhaseSampleCount:0,heldPhaseActualContactCoverage:null,heldPhaseMarkerCoverage:null};
  if(!result.exactCanonical)fail('canonical skeleton mismatch');
  if(data.rootMotion!==false)fail('clip must use the v8 in-place root-motion contract');
  const frameCount=Math.round(data.durationSeconds*30);
  if(Math.abs(data.durationSeconds*30-frameCount)>1e-6||data.keyframes.length!==frameCount+1)fail('not exactly 30 Hz');
  for(let i=0;i<data.keyframes.length;i++){
    const f=data.keyframes[i];if(Math.abs(f.time-i/frameCount)>1e-8)fail('nonuniform 30 Hz keys');
    for(const name of CANONICAL_BONE_NAMES){const q=f.rotations?.[name];if(!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)){fail('nonfinite joint quaternion');continue;}result.maxQuaternionNormError=Math.max(result.maxQuaternionNormError,Math.abs(norm(q)-1));if(name==='Root'&&angle(q,[0,0,0,1])>1e-7)fail('Root is not identity');}
    for(const field of ['hipsOffsetMeters','ballPositionMeters','referenceRootTranslationMeters'])if(!Array.isArray(f[field])||f[field].length!==3||!f[field].every(Number.isFinite))fail('nonfinite '+field);
  }
  if(result.maxQuaternionNormError>1e-6)fail('nonunit joint quaternion');
  if(animation.tracks.some(t=>!Array.from(t.values).every(Number.isFinite)))fail('nonfinite decoded animation values');
  const nodes=Object.fromEntries([...CANONICAL_BONE_NAMES,'Ball'].map(n=>[n,scene.getObjectByName(n)]));
  if(CANONICAL_BONE_NAMES.some(n=>!nodes[n]))throw new Error(loaded.id+': decoded canonical bones missing');
  if(!nodes.Ball)fail('decoded Ball node missing');
  const mixer=new THREE.AnimationMixer(scene),action=mixer.clipAction(animation);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const steps=Math.ceil(data.durationSeconds*sampleRateHz),times=new Set(Array.from({length:steps+1},(_,i)=>i/steps));
  for(const f of data.keyframes)times.add(f.time);
  for(const w of [...(data.supportWindows||[]),...(data.ballContactWindows||[])])for(const t of [w.startTime,w.endTime])if(t>=0&&t<=1)times.add(t);
  for(const e of data.events||[]){const t=eventTime(e,data);if(t>=0&&t<=1)times.add(t);else fail('event outside clip');if(e.domain!=='presentation')fail('event domain differs from v8');}
  const samples=[...times].sort((a,b)=>a-b).map(t=>sampleScene(loaded,t,action,mixer,nodes));
  result.sampleCount=samples.length;
  const supportAnchors=new Map();for(const w of data.supportWindows||[]){const s=sampleScene(loaded,w.startTime,action,mixer,nodes),actual=add(worldPoint(s,w.effector,w.localPointMeters||FOOT),s.reference);supportAnchors.set(w,actual);if(Array.isArray(w.anchorMeters)&&w.anchorMeters.length===3)result.maxSupportAnchorErrorMeters=Math.max(result.maxSupportAnchorErrorMeters,distance(actual,add(w.anchorMeters,s.reference)));else fail('support window missing its v8 anchor');if(w.startTime>1e-8&&w.endTime<1-1e-8&&(w.endTime-w.startTime)*data.durationSeconds<.025)fail('interior support window shorter than one source interval');}
  const carry=[],shoulders=[],hips=[];let groundSamples=0,coveredSamples=0,path=0,heldActual=0,heldMarked=0;
  for(let i=0;i<samples.length;i++){
    const s=samples[i];result.maxGlbJsonPositionErrorMeters=Math.max(result.maxGlbJsonPositionErrorMeters,s.positionError);result.maxGlbJsonAngleErrorRadians=Math.max(result.maxGlbJsonAngleErrorRadians,s.rotationError);result.maxBoneLengthErrorMeters=Math.max(result.maxBoneLengthErrorMeters,s.boneLengthError);
    anatomyAt(s,result);
    for(const foot of ['LeftFoot','RightFoot']){
      const sole=worldPoint(s,foot,FOOT);result.minSoleHeightMeters=Math.min(result.minSoleHeightMeters,sole[1]);
      if(sole[1]<=.008){groundSamples++;if((data.supportWindows||[]).some(w=>w.effector===foot&&contains(w,s.t)))coveredSamples++;}
    }
    for(const w of data.supportWindows||[])if(contains(w,s.t)){result.supportSampleCount++;const p=add(worldPoint(s,w.effector,w.localPointMeters||FOOT),s.reference);result.maxPlantedFootDriftMeters=Math.max(result.maxPlantedFootDriftMeters,distance(p,supportAnchors.get(w)));result.maxPlantedSoleHeightMeters=Math.max(result.maxPlantedSoleHeightMeters,p[1]);}
    for(const w of data.ballContactWindows||[])if(contains(w,s.t)){
      const palm=worldPoint(s,w.effector,w.localPointMeters||PALM);result.holdSampleCount++;
      result.maxHoldSurfaceErrorMeters=Math.max(result.maxHoldSurfaceErrorMeters,Math.abs(distance(palm,s.ball)-(data.ball?.radiusMeters??.12)));
      if(['held','carry','gather','hand'].includes(s.phase))carry.push(palm[1]-s.bones.Chest.position[1]);
    }
    if(meta.ball&&['held','carry','gather','hand','shooting','dunk','rebound','dribble-contact'].includes(s.phase)){
      result.heldPhaseSampleCount++;
      if(['LeftHand','RightHand'].some(n=>Math.abs(distance(worldPoint(s,n,PALM),s.ball)-(data.ball?.radiusMeters??.12))<=LIMITS.holdSurfaceMeters))heldActual++;
      if((data.ballContactWindows||[]).some(w=>contains(w,s.t)))heldMarked++;
    }
    for(const hand of ['LeftHand','RightHand'])result.maxPalmHeightMeters=Math.max(result.maxPalmHeightMeters,worldPoint(s,hand,PALM)[1]+s.reference[1]);
    const shoulder=sub(s.bones.LeftArm.position,s.bones.RightArm.position),hip=sub(s.bones.LeftUpLeg.position,s.bones.RightUpLeg.position);
    shoulders.push(Math.atan2(-shoulder[2],shoulder[0]));hips.push(Math.atan2(-hip[2],hip[0]));
    if(i){const delta=sub(s.reference,samples[i-1].reference);path+=Math.hypot(delta[0],delta[2]);}
  }
  result.plantedCoverage=groundSamples?coveredSamples/groundSamples:null;
  result.carrySampleCount=carry.length;result.carryHandChestMaxMeters=carry.length?Math.max(...carry):null;result.carryHandChestP95Meters=quantile(carry,.95);
  result.heldPhaseActualContactCoverage=result.heldPhaseSampleCount?heldActual/result.heldPhaseSampleCount:null;result.heldPhaseMarkerCoverage=result.heldPhaseSampleCount?heldMarked/result.heldPhaseSampleCount:null;
  result.meanReferenceSpeedMetersPerSecond=path/data.durationSeconds;
  const uniform=Array.from({length:steps+1},(_,i)=>samples.find(s=>Math.abs(s.t-i/steps)<1e-10));
  if(meta.kind==='gait'||meta.kind==='slide'){
    const touches=touchdownCount(uniform,'LeftFoot')+touchdownCount(uniform,'RightFoot');result.detectedSteps=touches;
    result.cadenceHz=touches/data.durationSeconds;
    result.expectedCadenceHz=meta.cadence*(meta.speed?result.meanReferenceSpeedMetersPerSecond/meta.speed:1);
    result.cadenceErrorPercent=100*Math.abs(result.cadenceHz-result.expectedCadenceHz)/result.expectedCadenceHz;
  }
  const shoulderAngles=unwrap(shoulders),hipAngles=unwrap(hips);
  result.shoulderYawAmplitudeDegrees=amplitude(shoulderAngles)*D;result.hipYawAmplitudeDegrees=amplitude(hipAngles)*D;result.counterRotationCorrelation=correlation(shoulderAngles,hipAngles);
  if(meta.kind==='cut'){
    const first=uniform[Math.max(1,Math.round(steps*.10))],last=uniform[Math.round(steps*.90)];
    const incoming=sub(first.reference,uniform[0].reference),outgoing=sub(uniform.at(-1).reference,last.reference);incoming[1]=0;outgoing[1]=0;
    result.referenceHeadingChangeDegrees=degreesBetween(incoming,outgoing);result.cutHeadingErrorDegrees=Math.abs(result.referenceHeadingChangeDegrees-meta.angle);
  }
  const leanAngles=[];let aligned=0;
  // Symmetric 100ms derivative window suppresses individual footstrike noise.
  const radius=Math.max(1,Math.round(.10*sampleRateHz));
  for(let i=radius;i<uniform.length-radius;i++){
    const a=uniform[i-radius],b=uniform[i],c=uniform[i+radius],dt=(c.seconds-a.seconds)/2;
    const accel=mul(add(sub(c.reference,b.reference),sub(a.reference,b.reference)),1/(dt*dt));accel[1]=0;
    if(norm(accel)<.4||!['LeftFoot','RightFoot'].some(n=>worldPoint(b,n,FOOT)[1]<=.02))continue;const torso=unit(sub(b.bones.Neck.position,b.bones.Hips.position)),direction=unit(accel);
    const forwardLean=Math.atan2(dot([torso[0],0,torso[2]],direction),Math.abs(torso[1]))*D;
    leanAngles.push(forwardLean);if(forwardLean>.25)aligned++;
  }
  result.accelerationSampleCount=leanAngles.length;result.leanAlignedFraction=leanAngles.length?aligned/leanAngles.length:null;result.meanAccelerationLeanDegrees=average(leanAngles);
  if(meta.kind==='brake')result.brakeAirborneSeconds=uniform.slice(0,-1).filter(s=>['LeftFoot','RightFoot'].every(n=>worldPoint(s,n,FOOT)[1]>.02)).length*data.durationSeconds/steps;
  if(data.loop){
    const a=samples[0],b=samples.at(-1);result.loopPoseMaxMeters=0;result.loopPoseMaxRadians=0;for(const n of CANONICAL_BONE_NAMES){result.loopPoseMaxMeters=Math.max(result.loopPoseMaxMeters,distance(a.bones[n].position,b.bones[n].position));result.loopPoseMaxRadians=Math.max(result.loopPoseMaxRadians,angle(a.bones[n].rotation,b.bones[n].rotation));}
    if(meta.ball)result.loopPoseMaxMeters=Math.max(result.loopPoseMaxMeters,distance(a.ball,b.ball));result.exactLoopPose=exactLoop(data);
  }
  const takeoffs=(data.events||[]).filter(e=>e.name==='takeoff');
  for(const e of takeoffs){
    const takeoff=eventTime(e,data),landEvent=(data.events||[]).find(x=>['land','landing'].includes(x.name)&&eventTime(x,data)>takeoff);
    if(!landEvent){fail('takeoff without later land marker');continue;}const land=eventTime(landEvent,data);
    const before=samples.filter(s=>s.t>=Math.max(0,takeoff-.25)&&s.t<=takeoff),flight=samples.filter(s=>s.t>=takeoff&&s.t<=land),after=samples.filter(s=>s.t>=land&&s.t<=Math.min(1,land+.25));
    const pelvis=s=>s.bones.Hips.position[1]+s.reference[1],knee=s=>Math.max(...['Left','Right'].map(side=>180-degreesBetween(sub(s.bones[side+'UpLeg'].position,s.bones[side+'Leg'].position),sub(s.bones[side+'Foot'].position,s.bones[side+'Leg'].position))));
    const launch=sampleScene(loaded,takeoff,action,mixer,nodes),touch=sampleScene(loaded,land,action,mixer,nodes);
    result.jumps.push({takeoff,land,airtimeSeconds:(land-takeoff)*data.durationSeconds,
      anticipationDropMeters:pelvis(before[0])-Math.min(...before.map(pelvis)),anticipationKneeFlexionDegrees:Math.max(...before.map(knee)),
      riseMeters:Math.max(...flight.map(pelvis))-pelvis(launch),landingCompressionMeters:pelvis(touch)-Math.min(...after.map(pelvis)),landingKneeFlexionDegrees:Math.max(...after.map(knee))});
  }
  for(const e of (data.events||[]).filter(e=>e.name==='release')){
    const t=eventTime(e,data),at=sampleScene(loaded,t,action,mixer,nodes);
    const hands=[...(new Set((data.ballContactWindows||[]).filter(w=>contains(w,t)).map(w=>w.effector)))];
    let surfaceError=null,extensionRatio=null,followSeconds=0;
    for(const name of hands){
      const side=name.startsWith('Left')?'Left':'Right',arm=side+'Arm',v0=sub(at.bones[name].position,at.bones[arm].position);
      surfaceError=Math.min(surfaceError??Infinity,Math.abs(distance(worldPoint(at,name,PALM),at.ball)-(data.ball?.radiusMeters??.12)));
      const after=samples.filter(s=>s.seconds>=at.seconds&&s.seconds<=Math.min(data.durationSeconds,at.seconds+.20));
      let end=at.seconds,minimumExtension=1;
      for(const s of after){const v=sub(s.bones[name].position,s.bones[arm].position),ratio=norm(v)/.51;if(degreesBetween(v0,v)>25||ratio<.60)break;end=s.seconds;minimumExtension=Math.min(minimumExtension,ratio);}
      if(end-at.seconds>followSeconds){followSeconds=end-at.seconds;extensionRatio=minimumExtension;}
    }
    const preceding=samples.filter(s=>s.t<=t+1e-8&&['held','carry','gather','hand','shooting','dunk','rebound','dribble-contact'].includes(s.phase));
    const primaryCoverage=preceding.length?preceding.filter(s=>hands.some(n=>Math.abs(distance(worldPoint(s,n,PALM),s.ball)-(data.ball?.radiusMeters??.12))<=LIMITS.holdSurfaceMeters)).length/preceding.length:null;
    result.releases.push({time:t,contactingHands:hands,palmSurfaceErrorMeters:surfaceError,followThroughSeconds:followSeconds,followThroughMinimumExtensionRatio:extensionRatio,primaryHandContactCoverage:primaryCoverage});
    if(!hands.length)fail('release occurs after hand contact was lost');
  }
  if(meta.kind==='euro'){
    const longEvent=(data.events||[]).find(e=>e.name==='long_step'),shortEvent=(data.events||[]).find(e=>e.name==='short_step'),release=(data.events||[]).find(e=>e.name==='release'),gather=(data.events||[]).find(e=>e.name==='gather');
    if(longEvent&&shortEvent&&release&&gather){
      const first=meta.side==='left'?'LeftFoot':'RightFoot',second=meta.side==='left'?'RightFoot':'LeftFoot',longT=eventTime(longEvent,data),shortT=eventTime(shortEvent,data),gatherT=eventTime(gather,data),releaseT=eventTime(release,data);
      const longPose=sampleScene(loaded,longT,action,mixer,nodes),shortPose=sampleScene(loaded,shortT,action,mixer,nodes);
      const firstWorld=add(worldPoint(longPose,first,FOOT),longPose.reference),previousWorld=add(worldPoint(longPose,second,FOOT),longPose.reference),secondWorld=add(worldPoint(shortPose,second,FOOT),shortPose.reference);
      const gatherSamples=samples.filter(s=>s.t>=gatherT&&s.t<=longT),twoHand=gatherSamples.filter(s=>['LeftHand','RightHand'].every(n=>Math.abs(distance(worldPoint(s,n,PALM),s.ball)-.12)<=LIMITS.holdSurfaceMeters)).length;
      const main=meta.side==='left'?'LeftHand':'RightHand',mainSamples=samples.filter(s=>s.t>=gatherT&&s.t<=releaseT);
      const mainCoverage=mainSamples.filter(s=>Math.abs(distance(worldPoint(s,main,PALM),s.ball)-.12)<=LIMITS.holdSurfaceMeters).length/mainSamples.length;
      result.euro={longStepMeters:firstWorld[2]-previousWorld[2],shortStepMeters:secondWorld[2]-firstWorld[2],twoHandGatherCoverage:twoHand/gatherSamples.length,mainHandContactCoverage:mainCoverage,mainHandReleaseTime:releaseT,
        guideReleaseLeadSeconds:(releaseT-Math.max(...(data.ballContactWindows||[]).filter(w=>w.effector!==main).map(w=>w.endTime)))*data.durationSeconds};
    }else fail('euro sequence missing gather/long-step/short-step/release markers');
  }
  const shotKinds=['euro','layup','floater','jump_shot','free_throw','three_point','dunk_one_hand','dunk_two_hands'];
  if(shotKinds.includes(meta.kind)){
    const court=data.courtTarget,release=(data.events||[]).find(e=>e.name==='release');
    if(!court||!Array.isArray(court.rimCenterMeters)||court.rimCenterMeters.length!==3||!court.rimCenterMeters.every(Number.isFinite))fail('shot lacks a fixed court rim target');
    else {
      const rim=court.rimCenterMeters,clearance=(court.rimRadiusMeters??.2286)-(data.ball?.radiusMeters??.12),releaseT=release?eventTime(release,data):0;
      if(Math.abs(rim[1]-3.05)>1e-6||Math.abs(court.rimRadiusMeters-.2286)>1e-6)fail('court rim dimensions differ from regulation reference');
      for(let i=1;i<uniform.length;i++){
        const a=uniform[i-1],b=uniform[i],pa=add(a.ball,a.reference),pb=add(b.ball,b.reference);
        if(a.t<releaseT-1e-8||pa[1]<rim[1]||pb[1]>rim[1]||pb[1]>=pa[1])continue;
        const u=(pa[1]-rim[1])/(pa[1]-pb[1]),crossing=mix(pa,pb,u),offset=Math.hypot(crossing[0]-rim[0],crossing[2]-rim[2]);
        result.rimCrossing={timeSeconds:a.seconds+(b.seconds-a.seconds)*u,positionMeters:crossing,rimOffsetMeters:offset,availableClearanceMeters:clearance,pass:offset<=clearance};break;
      }
      if(!result.rimCrossing||!result.rimCrossing.pass)fail('released ball misses the fixed rim on its descending crossing');
      if(meta.kind.startsWith('dunk')&&release){
        const at=sampleScene(loaded,releaseT,action,mixer,nodes),hands=(data.ballContactWindows||[]).filter(w=>contains(w,releaseT)).map(w=>w.effector);
        const palms=hands.map(n=>add(worldPoint(at,n,PALM),at.reference));
        result.dunkReleasePalms=hands.map((name,i)=>({effector:name,positionMeters:palms[i],heightMeters:palms[i][1],rimHorizontalMeters:Math.hypot(palms[i][0]-rim[0],palms[i][2]-rim[2])}));
        result.dunkPalmAtReleaseMeters=palms.length?(meta.kind==='dunk_two_hands'?Math.min(...palms.map(p=>p[1])):Math.max(...palms.map(p=>p[1]))):null;
        result.dunkPalmRimHorizontalMeters=palms.length?(meta.kind==='dunk_two_hands'?Math.max(...palms.map(p=>Math.hypot(p[0]-rim[0],p[2]-rim[2]))):Math.min(...palms.map(p=>Math.hypot(p[0]-rim[0],p[2]-rim[2])))):null;
        if(meta.kind==='dunk_two_hands'&&new Set(hands).size!==2)fail('two-hand dunk does not have both palms in contact at release');
        if(result.dunkPalmAtReleaseMeters===null||result.dunkPalmAtReleaseMeters<3.30||result.dunkPalmRimHorizontalMeters>.35)fail('dunk release palm does not clear the fixed rim by 25 cm nearby');
      }
    }
  }
  Object.defineProperty(result,'signature',{value:signature(uniform,meta.ball),enumerable:false});
  Object.defineProperty(result,'skeletonSignature',{value:signature(uniform,meta.ball,false),enumerable:false});
  mixer.stopAllAction();mixer.uncacheRoot(scene);
  if(result.maxGlbJsonPositionErrorMeters>LIMITS.decodedPositionMeters)fail('decoded GLB positions differ from delivered JSON');
  if(result.maxGlbJsonAngleErrorRadians>LIMITS.decodedAngleRadians)fail('decoded GLB rotations differ from delivered JSON');
  if(result.maxBoneLengthErrorMeters>1e-5)fail('bone length changed');
  if(result.maxPlantedFootDriftMeters>LIMITS.footSlideMeters)fail('planted foot drift exceeds 2 cm');
  if(result.maxSupportAnchorErrorMeters>LIMITS.footSlideMeters)fail('support metadata anchor differs from actual contact by over 2 cm');
  if(result.maxPlantedSoleHeightMeters>LIMITS.plantHeightMeters)fail('declared planted contact floats over 2 cm above the floor');
  if(result.supportSampleCount===0&&!['dive','get_up','rebound_land'].includes(meta.kind))fail('no measured planted support');
  if(result.plantedCoverage!==null&&result.plantedCoverage<.80&&!['dive','get_up','rebound_land'].includes(meta.kind))fail('support markers omit grounded feet');
  if(result.minSoleHeightMeters< -LIMITS.floorPenetrationMeters)fail('sole penetrates floor');
  if(result.maxHoldSurfaceErrorMeters>LIMITS.holdSurfaceMeters)fail('held ball leaves palm surface');
  if(result.heldPhaseActualContactCoverage!==null&&result.heldPhaseActualContactCoverage<.98)fail('ball loses actual hand contact during a held phase');
  if(result.heldPhaseMarkerCoverage!==null&&result.heldPhaseMarkerCoverage<.98)fail('held phases lack contact marker coverage');
  if(result.carryHandChestMaxMeters!==null&&result.carryHandChestMaxMeters>LIMITS.carryAboveChestMeters)fail('carry hand unnaturally above chest');
  if(result.cadenceErrorPercent!==null&&result.cadenceErrorPercent>LIMITS.cadenceErrorPercent)fail('cadence differs from speed target by over 10%');
  if(['run','sprint','jog'].includes(meta.gait)){
    if(result.shoulderYawAmplitudeDegrees<2||result.hipYawAmplitudeDegrees<2||!(result.counterRotationCorrelation<=-.5))fail('running shoulders and hips do not counterrotate');
  }
  if(result.accelerationSampleCount>4&&result.leanAlignedFraction<LIMITS.groundedLeanAlignedFraction)fail('torso leans away from grounded acceleration');
  if(result.cutHeadingErrorDegrees!==null&&result.cutHeadingErrorDegrees>3)fail('cut direction differs from requested angle by over 3 degrees');
  if(meta.kind==='brake'&&result.brakeAirborneSeconds>.009)fail('run-to-brake contains an airborne jump');
  if(data.loop&&(!result.exactLoopPose||result.loopPoseMaxMeters>LIMITS.loopPositionMeters||result.loopPoseMaxRadians>LIMITS.loopAngleRadians))fail('loop poses do not close exactly');
  if(result.anatomicalViolations.length)fail('joint outside anatomical range');
  if(result.minKneeForwardDot<-.05)fail('knee bends backward');
  if(meta.kind==='idle'&&result.maxUpperArmElevationDegrees>55)fail('idle arms spread outward');
  const requiresJump=['euro','layup','floater','jump_shot','three_point','dunk_one_hand','dunk_two_hands','block','rebound'].includes(meta.kind)||(meta.kind==='celebrate'&&meta.variant==='jump');
  if(requiresJump&&!result.jumps.length)fail('jump performance lacks takeoff and land evidence');
  for(const jump of result.jumps){if(jump.anticipationDropMeters<.025||jump.anticipationKneeFlexionDegrees<25)fail('jump lacks measured anticipation');if(meta.kind!=='dive'&&(jump.landingKneeFlexionDegrees<30||jump.landingCompressionMeters<.025))fail('landing lacks measured crouch and follow-through');}
  if(['euro','layup','floater','jump_shot','free_throw','three_point'].includes(meta.kind)&&result.releases.some(r=>r.followThroughSeconds<.10))fail('shot lacks measured arm follow-through');
  if(['euro','layup','floater','jump_shot','free_throw','three_point','dunk_one_hand','dunk_two_hands'].includes(meta.kind)&&result.releases.some(r=>r.primaryHandContactCoverage!==null&&r.primaryHandContactCoverage<.98))fail('primary shooting hand loses the ball before release');
  if(result.euro){if(!(result.euro.longStepMeters>result.euro.shortStepMeters&&result.euro.shortStepMeters>.05))fail('euro does not contain a long step then short step');if(result.euro.twoHandGatherCoverage<.98||result.euro.mainHandContactCoverage<.98)fail('euro gather or late hand release is missing');}
  if(meta.kind?.startsWith('dunk')&&result.maxPalmHeightMeters<LIMITS.dunkPalmMeters)fail('dunk palm does not clear ring by 25 cm');
  result.pass=errors.length===0;return result;
}

/** Load every new asset once; optional evidence write stays within this package. */
export async function measureAll({write=false}={}){
  const {loadClip,disposeClip,disposeRuntime}=await import('../runtime/library.mjs');
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const results=[];try{for(const meta of CATALOG){const loaded=await loadClip(meta.id,{format:'glb'});try{const result=measureClip(loaded);const [bytes,jsonBytes]=await Promise.all([readFile(new URL('../'+meta.glb,import.meta.url)),readFile(new URL('../'+meta.json,import.meta.url))]);result.glbBytes=bytes.length;result.glbSha256=sha(bytes);result.keyframeSha256=sha(jsonBytes);if(bytes.length>1_500_000){result.errors.push('GLB exceeds 1.5 MB');result.pass=false;}if(loaded.gltf?.parser?.json?.extras?.keyframeSha256!==result.keyframeSha256){result.errors.push('GLB provenance does not match the actual gzip bytes');result.pass=false;}results.push(result);}finally{disposeClip(loaded);}}}finally{await disposeRuntime();}
  const duplicates=[];for(let i=0;i<results.length;i++){
    let nearest=null;for(let j=0;j<results.length;j++)if(i!==j){const rms=trajectoryRms(results[i].signature,results[j].signature);if(!nearest||rms<nearest.rmsMeters)nearest={id:results[j].id,rmsMeters:rms};}
    results[i].nearestPerformance=nearest;if(nearest?.rmsMeters<.0001){results[i].errors.push('duplicate pose performance: '+nearest.id);results[i].pass=false;if(i<results.findIndex(r=>r.id===nearest.id))duplicates.push({a:results[i].id,b:nearest.id,rmsMeters:nearest.rmsMeters});}
  }
  const oldCatalog=await import('../../hoops-motion-v8/runtime/catalog.mjs');
  // Compare body performance separately: hiding/replacing a copied ball is not
  // sufficient to turn an old motion into an original additional performance.
  const old=[];for(const meta of oldCatalog.CATALOG){const data=JSON.parse(gunzipSync(await readFile(new URL('../../hoops-motion-v8/'+meta.json,import.meta.url))));const samples=Array.from({length:24},(_,i)=>{const f=sampleDelivered(data,i/23);return {bones:metadataFK(f,data.skeleton),ball:f.ballPositionMeters};});old.push({id:meta.id,signature:signature(samples,true,false)});}
  for(const result of results){let nearest=null;for(const previous of old){const rms=trajectoryRms(result.skeletonSignature,previous.signature);if(!nearest||rms<nearest.rmsMeters)nearest={id:previous.id,rmsMeters:rms};}result.nearestV8Performance=nearest;if(nearest.rmsMeters<.0001){result.errors.push('duplicates v8 performance: '+nearest.id);result.pass=false;}}
  const motion2=JSON.parse(await readFile(new URL('../../motion2/hoops.json',import.meta.url),'utf8')),original=[];
  for(const [id,state] of Object.entries(motion2.states)){
    // Original motion2 stores its ball separately. Body comparison deliberately
    // ignores the ball and therefore cannot be evaded by changing ball motion.
    const data={keyframes:state.keyframes.map(f=>({...f,ballPositionMeters:[0,0,0],ballRotationQuaternion:[0,0,0,1]}))};
    const samples=Array.from({length:24},(_,i)=>{const f=sampleDelivered(data,i/23);return {bones:metadataFK(f,motion2.skeleton),ball:[0,0,0]};});original.push({id,signature:signature(samples,false,false)});
  }
  for(const result of results){let nearest=null;for(const previous of original){const rms=trajectoryRms(result.skeletonSignature,previous.signature);if(!nearest||rms<nearest.rmsMeters)nearest={id:previous.id,rmsMeters:rms};}result.nearestMotion2Performance=nearest;if(nearest.rmsMeters<.0001){result.errors.push('duplicates original motion2 performance: '+nearest.id);result.pass=false;}}
  const report={schema:'hoops-motion-v9/independent-measurements-1',method:'Decoded GLTFLoader + Draco, actual AnimationMixer world transforms at 120 Hz; world plants use host reference trajectory; no authoring imports. Joint values use canonical bind axes and broad anatomical envelopes; overhead shoulder axial swing/twist becomes singular and those samples are counted explicitly. All grounded horizontal accelerations above 0.4 m/s² are evaluated; no acceleration lean is required during flight. Duplicate comparison against v8 and original motion2 uses body pose independently of ball visibility.',limits:LIMITS,anatomicalEnvelopes:ANATOMICAL_ENVELOPES,baselineComparisons:{motion2:original.length,v8:old.length},clipCount:results.length,passed:results.filter(r=>r.pass).length,duplicates,clips:results};
  if(write){await mkdir(new URL('../verification/',import.meta.url),{recursive:true});await writeFile(new URL('../verification/measurements.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
  return report;
}
export function measurementTable(report){const fmt=(v,d=2)=>v===null||v===undefined?'—':Number.isFinite(v)?v.toFixed(d):String(v);return [
  '| Clip | GLB KB | Plant cm | Speed m/s · steps/s · error % | Carry palm−chest cm | Lean aligned % | Hip/shoulder ° · corr | Brake air ms | Knee/elbow/ankle/wrist max ° | Loop | Palm max m | Crouch before/after cm | Arm follow ms | Nearest new pose RMS cm | Result |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|',
  ...report.clips.map(r=>`| ${r.id} | ${fmt(r.glbBytes/1000,1)} | ${fmt(r.maxPlantedFootDriftMeters*100)} | ${fmt(r.meanReferenceSpeedMetersPerSecond)} · ${fmt(r.cadenceHz)} · ${fmt(r.cadenceErrorPercent)} | ${fmt(r.carryHandChestMaxMeters===null?null:r.carryHandChestMaxMeters*100)} | ${fmt(r.leanAlignedFraction===null?null:r.leanAlignedFraction*100,0)} | ${fmt(r.hipYawAmplitudeDegrees,1)}/${fmt(r.shoulderYawAmplitudeDegrees,1)} · ${fmt(r.counterRotationCorrelation)} | ${fmt(r.brakeAirborneSeconds===null?null:r.brakeAirborneSeconds*1000,0)} | ${fmt(r.maxKneeFlexionDegrees,1)}/${fmt(r.maxElbowFlexionDegrees,1)}/${fmt(r.maxAnkleBendDegrees,1)}/${fmt(r.maxWristSwingDegrees,1)} | ${r.exactLoopPose===null?'one-shot':r.exactLoopPose?'exact':'FAIL'} | ${fmt(r.maxPalmHeightMeters)} | ${r.jumps.length?r.jumps.map(j=>fmt(j.anticipationDropMeters*100,1)+'/'+fmt(j.landingCompressionMeters*100,1)).join('; '):'—'} | ${r.releases.length?fmt(Math.min(...r.releases.map(x=>x.followThroughSeconds))*1000,0):'—'} | ${fmt(r.nearestPerformance?.rmsMeters===undefined?null:r.nearestPerformance.rmsMeters*100)} | ${r.pass?'PASS':r.errors.join('; ')} |`)
].join('\n');}
if(process.argv[1]===fileURLToPath(import.meta.url)){const report=await measureAll({write:true});console.log(measurementTable(report));console.log(`${report.passed}/${report.clipCount} clips passed`);if(report.passed!==report.clipCount)process.exitCode=1;}
