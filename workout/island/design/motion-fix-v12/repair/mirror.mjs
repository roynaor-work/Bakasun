/** Original CC0-1.0. Exact sagittal reflection of a skeletal repair result.
 * Left/right action counterparts share one solved path reflected across X=0.
 * Fixed bind lengths and target-rig FK remain authoritative; metadata contacts,
 * support intervals, independent ball paths and event times are retained.
 */
import {forward,poseFromWorldFrame,blendPose,smoothstep,slerp,rotate,qinv,vsub,vadd,vmul,length,dot,cross,unit,solveTwoBone} from './rig-ops.mjs';
const clone=v=>structuredClone(v),I=[0,0,0,1];
export const swapSide=name=>typeof name==='string'?name.replace(/Left/g,'__MIRROR_LEFT__').replace(/Right/g,'Left').replace(/__MIRROR_LEFT__/g,'Right').replace(/(^|[_\s/-])(left|right)(?=$|[_\s/-])/g,(_,prefix,side)=>prefix+(side==='left'?'right':'left')):name;
export const mirrorVector=v=>[-v[0],v[1],v[2]];
export const mirrorQuaternion=q=>[q[0],-q[1],-q[2],q[3]];
const vectorMaps=new Set(['joints','localJoints','rawJoints','translations','soles','palms','contactPoints','soleLocalByBone','palmLocalByBone']);
const quaternionMaps=new Set(['rotations','localRotations','rawRotations']);
const boneFields=new Set(['bone','effector','hand','foot','parent','joint','upper','lower','end','sourceBone','targetBone','side','name','type','kind','direction']);
const vectorField=key=>key==='ball'||/local|anchor|root|point|position|translation|offset|target|direction|velocity|normal|pole|axis|origin|knee|ankle|center|centre/i.test(key);
/** Reflect only geometric fields. Provenance file paths and source IDs retain
 * the identity of the actual source action rather than being rewritten.
 */
function reflect(value,key=''){
 if(Array.isArray(value)){
  if(value.length===3&&value.every(Number.isFinite)&&vectorField(key)&&!/scale/i.test(key))return mirrorVector(value);
  if(value.length===4&&value.every(Number.isFinite)&&/rotation|quaternion/i.test(key))return mirrorQuaternion(value);
  return value.map(v=>reflect(v,key));
 }
 if(value&&typeof value==='object'){
  if(vectorMaps.has(key))return Object.fromEntries(Object.entries(value).map(([name,v])=>[swapSide(name),Array.isArray(v)&&v.length===3?mirrorVector(v):reflect(v,name)]));
  if(quaternionMaps.has(key))return Object.fromEntries(Object.entries(value).map(([name,q])=>[swapSide(name),mirrorQuaternion(q)]));
  if(key==='scales')return Object.fromEntries(Object.entries(value).map(([name,v])=>[swapSide(name),clone(v)]));
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,reflect(v,k)]));
 }
 if(typeof value==='string'&&boneFields.has(key))return swapSide(value);
 if(typeof value==='number'&&/^(yaw|referenceYaw|heading|turnAngle|yawRadians|yawDegrees)$/.test(key))return -value;
 return value;
}
function mirroredPose(pose,targetRig){
 const rotations=Object.fromEntries(Object.entries(pose.rotations??{}).map(([name,q])=>[swapSide(name),mirrorQuaternion(q)])),translations=Object.fromEntries(Object.entries(pose.translations??{}).map(([name,p])=>[swapSide(name),mirrorVector(p)]));
 for(const n of targetRig.nodes){if(!rotations[n.name])rotations[n.name]=[...(n.rotation??I)];if(!translations[n.name])translations[n.name]=[...n.translation];}
 return {...clone(pose),rotations,translations,...(pose.scales?{scales:Object.fromEntries(Object.entries(pose.scales).map(([name,s])=>[swapSide(name),[...s]]))}:{})};
}
function symmetricBindError(rig){const map=new Map(rig.nodes.map(n=>[n.name,n]));let error=0;for(const n of rig.nodes){const counterpart=map.get(swapSide(n.name));if(!counterpart)continue;const desired=mirrorVector(n.translation);for(let i=0;i<3;i++)error=Math.max(error,Math.abs(desired[i]-counterpart.translation[i]));}return error;}
function alignedIdle(rig,idleFrame,endpoint){const p=poseFromWorldFrame(idleFrame,rig);if(p.translations.Root&&endpoint.translations.Root){p.translations.Root[0]=endpoint.translations.Root[0];p.translations.Root[2]=endpoint.translations.Root[2];p.rotations.Root=[...(endpoint.rotations.Root??I)];}return p;}
/** Optional target idle handles intentionally relax exact pair symmetry within
 * only the first/last handleSeconds (default .1s). This option never touches
 * the action's core; pass preserveTargetHandles:true to enable it.
 */
export function mirrorResult({result,rig=result.rig,targetClip,targetIdle,preserveTargetHandles=false,handleSeconds=.1}){
 if(!rig?.nodes||!result?.poses?.length)throw new Error('mirrorResult requires a target rig and solved poses');
 const outRig=clone(rig);outRig.nameToIndex=Object.fromEntries(outRig.nodes.map((n,i)=>[n.name,i]));
 const bindError=symmetricBindError(outRig);if(bindError>1e-6)throw new Error(`Target bind rig is not symmetric: ${bindError} metres`);
 let poses=result.poses.map(p=>mirroredPose(p,outRig)),metadata=reflect(result.metadata),diagnostics=reflect(result.diagnostics??{});
 const duration=result.duration??poses.at(-1).t;
 if(targetClip){for(const k of ['id','label','labelHe','motionId'])if(targetClip[k]!==undefined)metadata[k]=targetClip[k];if(targetClip.metadata?.role!==undefined)metadata.role=targetClip.metadata.role;}
 if(preserveTargetHandles&&targetIdle?.frames?.length){const idleFrame=targetIdle.frames[0],entry=alignedIdle(outRig,idleFrame,poses[0]),exit=alignedIdle(outRig,idleFrame,poses.at(-1)),core=metadata.coreRange??{start:duration/2,end:duration/2},seconds=Math.min(handleSeconds,core.start,duration-core.end);
  if(seconds>0)poses=poses.map(p=>{let out=p;if(p.t<seconds)out=blendPose(out,entry,1-smoothstep(p.t/seconds),{alignRoot:true});if(duration-p.t<seconds)out=blendPose(out,exit,1-smoothstep((duration-p.t)/seconds),{alignRoot:true});return out;});
 }
 const footLocal=bone=>metadata.soleLocalByBone?.[bone]??metadata.supports?.find(w=>w.bone===bone)?.local??metadata.soleLocal??[0,-.08,0];
 const frames=poses.map((pose,i)=>{const original=result.frames?.[i]?reflect(result.frames[i]):{},fk=forward(outRig,pose),root=fk.root??[0,0,0],inverse=qinv(fk.rotations.Root??I),f={...original,...fk};
  f.localJoints=Object.fromEntries(Object.entries(fk.joints).map(([name,p])=>[name,rotate([p[0]-root[0],p[1],p[2]-root[2]],inverse)]));f.assetRoot=[0,root[1],0];f.referenceRoot=[...root];
  f.soles=Object.fromEntries(['LeftFoot','RightFoot'].filter(b=>fk.joints[b]).map(bone=>[bone,vadd(fk.joints[bone],rotate(footLocal(bone).map((v,k)=>v*(fk.scales[bone]?.[k]??1)),fk.rotations[bone]))]));f.floorPoints=Object.entries(f.soles).map(([bone,position])=>({bone,position}));
  if(!fk.ball&&Array.isArray(original.ball))f.ball=original.ball;
  return f;
 });
 diagnostics.mirror={sourceId:result.metadata?.id??null,targetId:targetClip?.id??null,plane:'X=0',quaternionReflection:'[x,-y,-z,w]',bindSymmetryErrorMeters:bindError,targetIdleHandles:!!(preserveTargetHandles&&targetIdle?.frames?.length),handleSeconds:preserveTargetHandles?handleSeconds:0};
 return {...clone(result),rig:outRig,poses,frames,metadata,diagnostics,duration};
}

const lowerBodyNode=name=>/^(Root|Hips|(?:Left|Right)(?:UpLeg|Leg|Foot|Toes|ToeBase))$/.test(name);
function sampleLocalPose(poses,time,rig){
 if(time<=poses[0].t)return poses[0];if(time>=poses.at(-1).t)return poses.at(-1);
 let lo=0,hi=poses.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(poses[mid].t<=time)lo=mid;else hi=mid;}
 const a=poses[lo],b=poses[hi],u=(time-a.t)/(b.t-a.t),rotations={},translations={},scales={};
 for(const n of rig.nodes){rotations[n.name]=slerp(a.rotations?.[n.name]??n.rotation??I,b.rotations?.[n.name]??n.rotation??I,u);translations[n.name]=(a.translations?.[n.name]??n.translation).map((v,i)=>v+((b.translations?.[n.name]??n.translation)[i]-v)*u);if(a.scales?.[n.name]||b.scales?.[n.name])scales[n.name]=(a.scales?.[n.name]??n.scale??[1,1,1]).map((v,i)=>v+((b.scales?.[n.name]??n.scale??[1,1,1])[i]-v)*u);}
 return {t:time,rotations,translations,scales};
}
function targetFootHingeAngles(rig,targetResult){
 const angles={},fk=forward(rig,targetResult.poses[0]);
 for(const bone of ['LeftFoot','RightFoot']){
  const stored=targetResult.diagnostics?.footHingeAnglesRadians?.[bone];if(Number.isFinite(stored)){angles[bone]=stored;continue;}
  const end=rig.nodes[rig.nameToIndex[bone]],lower=end&&rig.nodes[rig.nameToIndex[end.parent]],upper=lower&&rig.nodes[rig.nameToIndex[lower.parent]];if(!upper)continue;
  const ab=vsub(fk.joints[lower.name],fk.joints[upper.name]),bc=vsub(fk.joints[end.name],fk.joints[lower.name]),normal=cross(ab,bc),axis=unit(ab),lateral=rotate([1,0,0],fk.rotations[upper.name]);
  if(length(normal)<1e-6){angles[bone]=0;continue;}
  const projected=unit(vsub(lateral,vmul(axis,dot(lateral,axis)))),hinge=unit(normal),angle=Math.atan2(dot(axis,cross(projected,hinge)),dot(projected,hinge)),limit=Math.acos(.02);angles[bone]=Math.max(-limit,Math.min(limit,angle));
 }
 return angles;
}
function preserveAnkleWithHinge(rig,pose,bone,hingeAngle){
 const fk=forward(rig,pose),end=rig.nodes[rig.nameToIndex[bone]],lower=end&&rig.nodes[rig.nameToIndex[end.parent]],upper=lower&&rig.nodes[rig.nameToIndex[lower.parent]];if(!upper)return null;
 return solveTwoBone(rig,pose,{effector:bone,target:[...fk.joints[bone]],worldRotation:[...fk.rotations[bone]],pole:vsub(fk.joints[lower.name],fk.joints[upper.name]),hingeAngle});
}
/** Mirror directional travel while keeping the target actor's handedness.
 * In tennis, left/right denotes court travel, not dominant racket hand. Root,
 * Hips and both leg chains come from the reflected solved source. Spine/head,
 * arms/hands, and all equipment channels come from the independently repaired
 * target at normalized time. A racket remains parented to RightHand in the
 * unchanged target rig. Intended for travel clips without upper-body ball hits;
 * all contact/event metadata is retained from the reflected source as requested.
 */
export function mirrorLowerBodyResult({result,targetResult,rig=targetResult?.rig??result?.rig,targetClip}){
 if(!targetResult?.poses?.length)throw new Error('mirrorLowerBodyResult requires targetResult.poses');
 const mirrored=mirrorResult({result,rig,targetClip}),targetPoses=targetResult.poses,leftStart=mirrored.poses[0].t,leftSpan=mirrored.poses.at(-1).t-leftStart,targetStart=targetPoses[0].t,targetSpan=targetPoses.at(-1).t-targetStart;
 if(!(leftSpan>0&&targetSpan>0))throw new Error('Lower-body mirror requires positive source and target durations');
 const footHingeAngles=targetFootHingeAngles(mirrored.rig,targetResult),axialGauge={method:'target compatible-idle hinge convention; existing ankle, foot world rotation and knee pole retained',maxAnkleErrorMeters:0,maxKneeDisplacementMeters:0,floorSolves:0,maxFloorTargetErrorMeters:0};
 // Reflected local-Z hinge conventions can lie on opposite atan2 branches.
 // Re-express the same physical ankle/knee pose in the target's constant idle
 // convention BEFORE any handle interpolation, avoiding an artificial spin.
 for(const pose of mirrored.poses)for(const bone of ['LeftFoot','RightFoot'])if(Number.isFinite(footHingeAngles[bone])){
  const before=forward(mirrored.rig,pose),end=mirrored.rig.nodes[mirrored.rig.nameToIndex[bone]],knee=end.parent,solved=preserveAnkleWithHinge(mirrored.rig,pose,bone,footHingeAngles[bone]);
  if(solved){const after=forward(mirrored.rig,pose);axialGauge.maxAnkleErrorMeters=Math.max(axialGauge.maxAnkleErrorMeters,solved.targetError);axialGauge.maxKneeDisplacementMeters=Math.max(axialGauge.maxKneeDisplacementMeters,length(vsub(after.joints[knee],before.joints[knee])));}
 }
 const upperNames=mirrored.rig.nodes.filter(n=>!lowerBodyNode(n.name)).map(n=>n.name),leftEnd=mirrored.poses.at(-1).t,core=mirrored.metadata.coreRange;
 const entryHandle=Number.isFinite(core?.start)?Math.max(0,core.start-leftStart):0,exitHandle=Number.isFinite(core?.end)?Math.max(0,leftEnd-core.end):0;
 const handles={entry:{hold:Math.min(.075,entryHandle),blendEnd:Math.min(.25,entryHandle)},exit:{hold:Math.min(.075,exitHandle),blendEnd:Math.min(.25,exitHandle)}};
 mirrored.poses=mirrored.poses.map(pose=>{const entryDistance=pose.t-leftStart,exitDistance=leftEnd-pose.t,time=entryDistance<handles.entry.blendEnd?targetStart+entryDistance:exitDistance<handles.exit.blendEnd?targetPoses.at(-1).t-exitDistance:targetStart+(pose.t-leftStart)/leftSpan*targetSpan,target=sampleLocalPose(targetPoses,time,mirrored.rig),out=clone(pose);
  for(const name of upperNames){if(target.rotations?.[name])out.rotations[name]=[...target.rotations[name]];if(target.translations?.[name])out.translations[name]=[...target.translations[name]];if(target.scales?.[name]){out.scales??={};out.scales[name]=[...target.scales[name]];}}
  // The original right-handed idle also owns its lower-body stance. Preserve
  // the FULL target pose during the declared endpoint support hold, then blend
  // to the mirrored lower body entirely within the appended idle handle. The
  // reflected action core remains exact and no support/event is discarded.
  let blended=out;for(const [distance,handle] of [[pose.t-leftStart,handles.entry],[leftEnd-pose.t,handles.exit]]){
   if(handle.blendEnd<=0||distance>=handle.blendEnd)continue;
   if(distance<=handle.hold)blended=clone(target);
   else {const weight=smoothstep((distance-handle.hold)/(handle.blendEnd-handle.hold));blended=blendPose(target,out,weight,{alignRoot:false});}
  }
  blended.t=pose.t;return blended;
 });
 const meta=mirrored.metadata,footLocal=bone=>meta.soleLocalByBone?.[bone]??meta.supports?.find(w=>w.bone===bone)?.local??meta.soleLocal??[0,-.08,0];
 // A blend between two valid planted stances can cross the floor on the
 // rotation arc. Re-solve only the swinging ankle inside the new handles;
 // preserve its current bend pole and fixed lengths. The action core is exact.
 for(const pose of mirrored.poses)if(pose.t<core.start||pose.t>core.end)for(const bone of ['LeftFoot','RightFoot']){
  const fk=forward(mirrored.rig,pose),local=footLocal(bone),sole=vadd(fk.joints[bone],rotate(local.map((v,k)=>v*fk.scales[bone][k]),fk.rotations[bone])),floor=meta.floorY??0;
  if(sole[1]<floor-1e-6){const side=bone.startsWith('Left')?'Left':'Right',target=[...fk.joints[bone]];target[1]+=floor-sole[1];const solved=solveTwoBone(mirrored.rig,pose,{effector:bone,target,worldRotation:fk.rotations[bone],pole:vsub(fk.joints[`${side}Leg`],fk.joints[`${side}UpLeg`]),hingeAngle:footHingeAngles[bone]});axialGauge.floorSolves++;axialGauge.maxFloorTargetErrorMeters=Math.max(axialGauge.maxFloorTargetErrorMeters,solved.targetError);}
 }
 mirrored.frames=mirrored.poses.map((pose,i)=>{const original=mirrored.frames[i]??{},fk=forward(mirrored.rig,pose),root=fk.root??[0,0,0],inverse=qinv(fk.rotations.Root??I),f={...original,...fk};
  f.localJoints=Object.fromEntries(Object.entries(fk.joints).map(([name,p])=>[name,rotate([p[0]-root[0],p[1],p[2]-root[2]],inverse)]));f.assetRoot=[0,root[1],0];f.referenceRoot=[...root];
  if(original.rawJoints)f.rawJoints=clone(f.localJoints);if(original.rawRotations)f.rawRotations=clone(fk.rotations);
  f.soles=Object.fromEntries(['LeftFoot','RightFoot'].filter(b=>fk.joints[b]).map(bone=>[bone,vadd(fk.joints[bone],rotate(footLocal(bone).map((v,k)=>v*(fk.scales[bone]?.[k]??1)),fk.rotations[bone]))]));f.floorPoints=Object.entries(f.soles).map(([bone,position])=>({bone,position}));
  if(!fk.ball&&Array.isArray(original.ball))f.ball=original.ball;return f;
 });
 const ownership={method:'reflected action-core Root/Hips/leg positions with target idle axial gauge; original target upper body and equipment sampled in local space at normalized time; original full target idle stance retained in endpoint holds',lowerBodySourceId:result.metadata?.id??result.id??null,upperBodySourceId:targetClip?.id??targetResult.metadata?.id??targetResult.id??null,upperBodyNodes:upperNames,dominantHandPreserved:true,sourceDurationSeconds:leftSpan,targetUpperDurationSeconds:targetSpan,endpointHandles:handles,endpointPoseOwner:'original independently repaired target',actionCoreLowerBodyPositionsPreserved:true,footHingeAnglesRadians:footHingeAngles,axialGauge};
 mirrored.metadata.lowerBodyMirror=ownership;mirrored.diagnostics.lowerBodyMirror=clone(ownership);mirrored.diagnostics.mirror={...mirrored.diagnostics.mirror,wholeBody:false,dominantHandPreserved:true};return mirrored;
}
