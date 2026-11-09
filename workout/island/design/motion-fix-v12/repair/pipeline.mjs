/** Original CC0-1.0 deterministic target-rig repair pipeline.
 * Repairs local skeletal rotations, then bakes physical foot constraints. Core
 * action samples remain in order; explicit idle handles are appended around it.
 */
import {vadd,vsub,vmul,length,dot,cross,unit,rotate,qinv,qmul,slerp,smoothstep,rigFromGLB,restPose,forward,poseFromWorldFrame,blendPose,smoothPoses,lockFoot,solveTwoBone,solePoint} from './rig-ops.mjs';
const I=[0,0,0,1],clone=v=>JSON.parse(JSON.stringify(v));
const lerp=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const clamp=x=>Math.max(0,Math.min(1,x));
const nearest=(frames,t)=>frames.reduce((a,f)=>Math.abs(f.t-t)<Math.abs(a.t-t)?f:a);
const yaw=q=>{const f=rotate([0,0,1],q),a=Math.atan2(f[0],f[2]);return [0,Math.sin(a/2),0,Math.cos(a/2)];};
function marker(frame,bone,local){return vadd(frame.joints[bone],rotate(local.map((v,i)=>v*(frame.scales?.[bone]?.[i]??1)),frame.rotations[bone]??I));}
function node(rig,name){return rig.nodes[rig.nameToIndex[name]];}
function setWorldTranslation(rig,pose,name,target){const n=node(rig,name);if(!n)return;const fk=forward(rig,pose),parent=n.parent;pose.translations[name]=parent?rotate(vsub(target,fk.joints[parent]),qinv(fk.rotations[parent])).map((v,i)=>v/fk.scales[parent][i]):[...target];}
function shiftHips(rig,pose,shift){const fk=forward(rig,pose);setWorldTranslation(rig,pose,'Hips',vadd(fk.joints.Hips,shift));}
function shiftRoot(rig,pose,shift){const fk=forward(rig,pose);setWorldTranslation(rig,pose,'Root',vadd(fk.joints.Root??[0,0,0],shift));}
function alignIdlePose(rig,idleFrame,corePose){
 const p=poseFromWorldFrame(idleFrame,rig),fk=forward(rig,p),target=forward(rig,corePose),difference=qmul(yaw(target.rotations.Root??I),qinv(yaw(fk.rotations.Root??I))),root=node(rig,'Root');
 if(root){p.rotations.Root=qmul(difference,p.rotations.Root??I);const a=fk.joints.Root??[0,0,0],b=target.joints.Root??[0,0,0];setWorldTranslation(rig,p,'Root',[b[0],a[1],b[2]]);}return p;
}
function inferredSupports(clip){
 const windows=[],h=clip.height??1.8,floor=clip.metadata.floorY??0;
 for(const bone of ['LeftFoot','RightFoot']){let start=null;for(let i=0;i<clip.frames.length;i++){const f=clip.frames[i],prior=clip.frames[Math.max(0,i-1)],local=clip.metadata.soleLocal??[0,0,0];if(!f.joints[bone])continue;const p=marker(f,bone,local),last=marker(prior,bone,local),dt=i?f.t-prior.t:1,stable=p[1]<=floor+.025*h&&Math.abs(p[1]-last[1])/dt<.08*h;
  if(stable&&start===null)start=f.t;if((!stable||i===clip.frames.length-1)&&start!==null){const end=stable?f.t:prior.t;if(end-start>=.06)windows.push({bone,start,end,local});start=null;}
 }}return windows;
}
function contactWindows(meta){const windows=(meta.ballContacts??meta.contactWindows??[]).map(w=>({...w,bone:w.bone??w.effector}));for(const e of meta.contacts??meta.events??[]){if(!/^(contact|touch|catch|receive|release|hand_ball_contact|ball_release)$/.test(e.type??e.name??'')||!(e.bone??e.effector))continue;const t=e.time??e.atSeconds;if(Number.isFinite(t))windows.push({bone:e.bone??e.effector,start:t,end:t,local:e.local??e.localPointMeters,type:e.type??e.name});}return windows;}
/** Collapse only demonstrably duplicate straight-gait cycles. The source may
 * contain two complete repeats; exporting one fundamental cycle preserves its
 * cadence, speed and footstep identity while giving the runtime a true loop.
 * Sideways/diagonal strafing is deliberately retained, not made symmetrical.
 */
function fundamentalLoop(clip){
 if(!clip.metadata.loop||!/(?:run|walk|jog|sprint)/i.test(clip.id))return clip;
 const first=clip.frames[0],last=clip.frames.at(-1),travel=rotate(vsub(last.root??[0,0,0],first.root??[0,0,0]),qinv(first.rotations.Root??I));
 if(Math.hypot(travel[0],travel[2])<.05||Math.abs(travel[0])>Math.abs(travel[2])*.0875)return clip;
 const windows=clip.metadata.supports??[],candidates=[];
 for(const bone of ['LeftFoot','RightFoot']){const starts=windows.filter(w=>w.bone===bone).map(w=>w.start).sort((a,b)=>a-b);for(let i=1;i<starts.length;i++){const p=starts[i]-starts[i-1],repeats=clip.duration/p;if(p>=.3&&repeats>=1.8&&Math.abs(repeats-Math.round(repeats))<.035)candidates.push(p);}}
 const body=(f,name)=>{const root=f.root??[0,0,0],p=f.joints[name];return rotate([p[0]-root[0],p[1]-root[1],p[2]-root[2]],qinv(f.rotations.Root??I));};
 for(const period of [...new Set(candidates)].sort((a,b)=>a-b)){
  if(Math.abs(nearest(clip.frames,period).t-period)>1e-5)continue;
  let squared=0,count=0,max=0;for(let i=0;i<=24;i++){const t=(clip.duration-period)*i/24,a=nearest(clip.frames,t),b=nearest(clip.frames,t+period);for(const name of Object.keys(a.joints)){if(name==='Root'||!b.joints[name])continue;const error=length(vsub(body(a,name),body(b,name)))/(clip.height??1.8);squared+=error*error;count++;max=Math.max(max,error);}}
  const rms=Math.sqrt(squared/Math.max(1,count));if(rms>.004||max>.012)continue;
  const result=clone(clip);result.duration=period;result.frames=result.frames.filter(f=>f.t<=period+1e-6);result.metadata.sourceRepeatNormalization={sourceDurationSeconds:clip.duration,fundamentalPeriodSeconds:period,originalRepeats:Math.round(clip.duration/period),poseAutocorrelationRmsHeight:rms,poseAutocorrelationMaxHeight:max,sampleRange:{start:0,end:period},reason:'Remove physically duplicate gait repeats; preserve cadence and root speed.'};
  result.metadata.loopRootDeltaMeters=vsub(result.frames.at(-1).root??[0,0,0],result.frames[0].root??[0,0,0]);
  for(const key of ['supports','ballContacts','contactWindows'])if(result.metadata[key])result.metadata[key]=result.metadata[key].filter(w=>w.start<period-1e-6).map(w=>({...w,end:Math.min(period,w.end)}));
  for(const key of ['events','contacts'])if(result.metadata[key])result.metadata[key]=result.metadata[key].filter(e=>(e.time??e.atSeconds??e.timeSeconds??0)<=period+1e-6);
  return result;
 }
 return clip;
}
function shiftedMetadata(meta,offset,duration,originalDuration,supports){
 const m=clone(meta);m.loop=false;m.originalLoop=!!meta.loop;m.coreRange={start:offset,end:offset+originalDuration,duration:originalDuration};m.loopStart=meta.loop?offset:null;m.loopEnd=meta.loop?offset+originalDuration:null;m.runtimeDurationSeconds=duration;
 m.supports=supports.map(w=>({...w,start:w.start+offset,end:w.end+offset}));
 for(const field of ['ballContacts','contactWindows'])if(m[field])m[field]=m[field].map(w=>({...w,start:w.start+offset,end:w.end+offset}));
 for(const field of ['events','contacts'])if(m[field])m[field]=m[field].map(e=>({...e,...(Number.isFinite(e.time)?{time:e.time+offset}:{}),...(Number.isFinite(e.atSeconds)?{atSeconds:e.atSeconds+offset}:{})}));
 m.coordinateSpace='baked native target-rig world; external root motion applied once';m.rootMotionApplied=true;m.repairVersion='motion-fix-v12';return m;
}
export function repairClip({clip,idle,rig,options={}}){
 clip=options.normalizeRepeatedLoops===false?clip:fundamentalLoop(clip);
 const fps=options.fps??60,handle=options.handleSeconds??.35,ramp=options.contactRampSeconds??.12,floor=clip.metadata.floorY??0,diagnostics={pelvisLoweringMax:0,rootFloorLiftMax:0,unreachable:[],independentBallTrajectory:clip.frames.some(f=>f.ball),corePreserved:true,handleSeconds:handle,smoothingRadius:options.smoothingRadius??4,smoothingPasses:options.smoothingPasses??2};
 rig=clone(rig);rig.nameToIndex=Object.fromEntries(rig.nodes.map((n,i)=>[n.name,i]));
 const sourceSupports=(clip.metadata.supports??[]).filter(w=>/^(Left|Right)Foot$/.test(w.bone)&&w.end>w.start),supports=sourceSupports.length?clone(sourceSupports):inferredSupports(clip);
 let core=clip.frames.map(f=>poseFromWorldFrame(f,rig));
 core=smoothPoses(core,{passes:options.smoothingPasses??2,radius:options.smoothingRadius??4,translation:options.smoothTranslation??false});
 const idleFrames=idle?.frames?.length?idle.frames:[clip.frames[0],clip.frames.at(-1)],entryIdle=alignIdlePose(rig,idleFrames[0],core[0]),exitIdle=alignIdlePose(rig,idleFrames[0],core.at(-1));
 const D=clip.duration,poses=[],steps=Math.max(2,Math.ceil(handle*fps));
 for(let i=0;i<steps;i++){const u=i/steps,p=blendPose(entryIdle,core[0],smoothstep(u),{alignRoot:false});p.t=handle*u;poses.push(p);}
 core.forEach(p=>{p.t+=handle;poses.push(p);});
 for(let i=1;i<=steps;i++){const u=i/steps,p=blendPose(core.at(-1),exitIdle,smoothstep(u),{alignRoot:false});p.t=handle+D+handle*u;poses.push(p);}
 const duration=D+2*handle,metadata=shiftedMetadata(clip.metadata,handle,duration,D,supports);
 if(clip.metadata.sourceRepeatNormalization)diagnostics.sourceRepeatNormalization=clip.metadata.sourceRepeatNormalization;
 const footLocal=bone=>supports.find(w=>w.bone===bone)?.local??clip.metadata.soleLocal??[0,-.08,0];
 // Calibrate the target rig's axial hinge convention once from its compatible
 // idle. Local-X and local-Z source hinges then retain their skin orientation
 // throughout a turn, instead of choosing opposite atan2 branches per frame.
 const footHingeAngles={};{const fk=forward(rig,entryIdle);for(const bone of ['LeftFoot','RightFoot'])if(node(rig,bone)){const end=node(rig,bone),lower=node(rig,end.parent),upper=node(rig,lower.parent),ab=vsub(fk.joints[lower.name],fk.joints[upper.name]),bc=vsub(fk.joints[end.name],fk.joints[lower.name]),normal=cross(ab,bc),axis=unit(ab),lateral=rotate([1,0,0],fk.rotations[upper.name]);if(length(normal)<1e-6){footHingeAngles[bone]=0;continue;}const projected=unit(vsub(lateral,vmul(axis,dot(lateral,axis)))),hinge=unit(normal),angle=Math.atan2(dot(axis,cross(projected,hinge)),dot(projected,hinge)),limit=Math.acos(.02);footHingeAngles[bone]=Math.max(-limit,Math.min(limit,angle));}}
 diagnostics.footHingeAnglesRadians=footHingeAngles;
 // Anchors are derived from the source's actual target-rig sole at support
 // onset; world floor is authoritative. Source paths and support times stay.
 const constraints=supports.map(w=>{const f=nearest(clip.frames,w.start),local=w.local??footLocal(w.bone),a=marker(f,w.bone,local);return {...w,start:w.start+handle,end:w.end+handle,local,anchor:[a[0],floor,a[2]]};});
 // The still ends of the handles have explicit physical support. Moving handle
 // feet retain their source interpolation and are floor-corrected below.
 const hold=Math.min(.075,handle/3);
 for(const bone of ['LeftFoot','RightFoot'])if(node(rig,bone)){
  const local=footLocal(bone),a=solePoint(rig,entryIdle,bone,local),b=solePoint(rig,exitIdle,bone,local);
  for(const w of [{bone,start:0,end:hold,local,anchor:[a[0],floor,a[2]]},{bone,start:duration-hold,end:duration,local,anchor:[b[0],floor,b[2]]}]){constraints.push(w);metadata.supports.push({bone,start:w.start,end:w.end,local});}
 }
 for(const pose of poses){
  let fk=forward(rig,pose),minY=Math.min(...Object.values(fk.joints).map(p=>p[1]),...['LeftFoot','RightFoot'].filter(b=>fk.joints[b]).map(b=>solePoint(rig,pose,b,footLocal(b))[1]));
  if(minY<floor){const lift=floor-minY;shiftRoot(rig,pose,[0,lift,0]);diagnostics.rootFloorLiftMax=Math.max(diagnostics.rootFloorLiftMax,lift);}
  const active=['LeftFoot','RightFoot'].map(bone=>{
   const windows=constraints.filter(w=>w.bone===bone&&pose.t>=w.start-ramp&&pose.t<=w.end+ramp);if(!windows.length)return null;
   const weighted=windows.map(w=>({...w,weight:pose.t<w.start?smoothstep((pose.t-w.start+ramp)/ramp):pose.t>w.end?1-smoothstep((pose.t-w.end)/ramp):1}));
   const planted=weighted.find(w=>pose.t>=w.start&&pose.t<=w.end);if(planted)return planted;
   if(weighted.length===1)return weighted[0];
   // When the previous release ramp overlaps the next plant approach, move
   // continuously between their distinct physical anchors. Selecting the
   // stronger anchor would switch abruptly halfway through an airborne swing.
   const total=weighted.reduce((s,w)=>s+w.weight,0);if(total<1e-8)return null;
   return {...weighted[0],anchor:weighted.reduce((a,w)=>vadd(a,vmul(w.anchor,w.weight/total)),[0,0,0]),weight:Math.max(...weighted.map(w=>w.weight)),start:Math.max(...weighted.map(w=>w.start)),end:Math.min(...weighted.map(w=>w.end))};
  }).filter(Boolean);
  // Retargeted cuts may put an authored support outside the target leg's
  // horizontal reach. Move the pelvis (not the simulation root/foot anchor)
  // toward the feasible reach disks before solving the small vertical offset.
  // Alternating projections accommodate double support on unequal profiles.
  const initialHips=forward(rig,pose).joints.Hips;
  for(let iteration=0;iteration<3;iteration++)for(const w of active){fk=forward(rig,pose);const foot=node(rig,w.bone),leg=node(rig,foot.parent),hip=node(rig,leg.parent),a=fk.joints[hip.name],target=vsub(w.anchor,rotate(w.local,yaw(fk.rotations[w.bone]))),reach=length(vsub(fk.joints[leg.name],a))+length(vsub(fk.joints[w.bone],fk.joints[leg.name]))-.002,horizontal=Math.hypot(a[0]-target[0],a[2]-target[2]),limit=reach*.96;
   if(horizontal>limit){const correction=(horizontal-limit)/horizontal*w.weight;shiftHips(rig,pose,[(target[0]-a[0])*correction,0,(target[2]-a[2])*correction]);}
  }
  const adjustedHips=forward(rig,pose).joints.Hips;diagnostics.pelvisHorizontalCompensationMax=Math.max(diagnostics.pelvisHorizontalCompensationMax??0,Math.hypot(adjustedHips[0]-initialHips[0],adjustedHips[2]-initialHips[2]));
  // Lower pelvis as little as necessary to make supported ankles reachable.
  let lower=0;
  for(const w of active){fk=forward(rig,pose);const foot=node(rig,w.bone),leg=node(rig,foot.parent),hip=node(rig,leg.parent),a=fk.joints[hip.name],q=yaw(fk.rotations[w.bone]),target=vsub(w.anchor,rotate(w.local,q)),l1=length(vsub(fk.joints[leg.name],a)),l2=length(vsub(fk.joints[w.bone],fk.joints[leg.name])),horizontal=Math.hypot(a[0]-target[0],a[2]-target[2]),maxReach=l1+l2-.001;
   if(horizontal>=maxReach){diagnostics.unreachable.push({t:pose.t,bone:w.bone,reason:'horizontal support target beyond leg reach',excess:horizontal-maxReach});continue;}
   lower=Math.max(lower,(a[1]-target[1]-Math.sqrt(maxReach*maxReach-horizontal*horizontal))*w.weight);
  }
  if(lower>0){shiftHips(rig,pose,[0,-lower,0]);diagnostics.pelvisLoweringMax=Math.max(diagnostics.pelvisLoweringMax,lower);}
  for(const w of active){fk=forward(rig,pose);const desired=yaw(fk.rotations[w.bone]),result=lockFoot(rig,pose,{bone:w.bone,anchor:w.anchor,soleLocal:w.local,worldRotation:desired,weight:w.weight,hingeAngle:footHingeAngles[w.bone]});if(result.targetError>.02&&(pose.t>=w.start&&pose.t<=w.end))diagnostics.unreachable.push({t:pose.t,bone:w.bone,...result});}
  // A swinging foot may graze the floor outside a plant: lift the ankle with
  // the same analytic knee chain instead of translating any limb segments.
  for(const bone of ['LeftFoot','RightFoot'])if(node(rig,bone)){
   fk=forward(rig,pose);const sole=solePoint(rig,pose,bone,footLocal(bone));if(sole[1]<floor-.00001){const target=[...fk.joints[bone]],end=node(rig,bone),lower=node(rig,end.parent),upper=node(rig,lower.parent);target[1]+=floor-sole[1];solveTwoBone(rig,pose,{effector:bone,target,worldRotation:fk.rotations[bone],hingeAngle:footHingeAngles[bone],pole:vsub(fk.joints[lower.name],fk.joints[upper.name])});}
  }
 }
 // The independently authored ball path is primary in the action core. Arm IK
 // moves each declared palm onto its original side of the ball; this permits a
 // two-hand catch without projecting a ball between incompatible idle palms.
 if(diagnostics.independentBallTrajectory){
  let ballName=rig.nodes.find(n=>/^ball$/i.test(n.name))?.name;if(!ballName){ballName='Ball';rig.nameToIndex.Ball=rig.nodes.length;rig.nodes.push({name:'Ball',parent:null,translation:[0,0,0],rotation:I,scale:[1,1,1]});}
  const ballWindows=contactWindows(clip.metadata).filter(w=>w.bone&&Number.isFinite(w.start)&&Number.isFinite(w.end)),radius=clip.metadata.ball?.radius??clip.metadata.ballRadius??.12;
  const priority=w=>(w.bone==='RightHand'?10:0)+(w.local?2:0)+(w.end>w.start?1:0),isPalm=w=>/Hand$/.test(w.bone)&&length(w.local??[0,0,0])<=.35;
  const entryHold=ballWindows.filter(w=>w.start<=1/fps&&isPalm(w)).sort((a,b)=>priority(b)-priority(a))[0];
  const exitHold=ballWindows.filter(w=>w.end>=D-1/fps&&isPalm(w)&&!/release/.test(w.type??'')&&!(clip.metadata.events??[]).some(e=>/release/.test(e.type??e.name??'')&&Math.abs((e.time??-1)-D)<=1/fps&&(e.bone??e.effector)===w.bone)).sort((a,b)=>priority(b)-priority(a))[0];
  for(const [holdWindow,start,end,label] of [[entryHold,0,handle,'entry'],[exitHold,handle+D,duration,'exit']])if(holdWindow)(metadata.ballContacts??=[]).push({bone:holdWindow.bone,start,end,local:holdWindow.local??[0,0,0],provenance:`${label} handle retains the dominant source hand hold; original two-hand core contacts stay unchanged`});
  diagnostics.armContactIK={solves:0,maxReachErrorMeters:0,maxTargetErrorMeters:0};
  function sourceSide(frame,w,center){let axis=vsub(marker(frame,w.bone,w.local??[0,0,0]),center);if(length(axis)<1e-7)axis=w.bone==='LeftHand'?[1,0,0]:[-1,0,0];return unit(axis);}
  for(const pose of poses){
   pose.rotations[ballName]=I;const t=clamp((pose.t-handle)/D)*D,source=nearest(clip.frames,t),isCore=pose.t>=handle-1e-8&&pose.t<=handle+D+1e-8;let center=source.ball?[...source.ball]:[0,-100,0];
   const active=[];
   for(const w of ballWindows){if(!isCore&&isPalm(w))continue;const start=w.start+handle,end=w.end+handle,distance=pose.t<start?start-pose.t:pose.t>end?pose.t-end:0;if(distance>ramp)continue;active.push({...w,strength:1-smoothstep(distance/ramp)});}
   const holdWindow=pose.t<handle?entryHold:pose.t>handle+D?exitHold:null;
   if(holdWindow){const endpoint=pose.t<handle?clip.frames[0]:clip.frames.at(-1),axis=sourceSide(endpoint,holdWindow,endpoint.ball),fk=forward(rig,pose),heldCenter=vsub(marker(fk,holdWindow.bone,holdWindow.local??[0,0,0]),vmul(axis,radius)),distance=pose.t<handle?handle-pose.t:pose.t-handle-D;
    center=lerp(center,heldCenter,smoothstep(distance/ramp));active.push({...holdWindow,strength:1,handleHold:true});
   }
   // Foot/racket-free contacts keep their independently timed ball event and
   // adjust only its local contact neighbourhood after the planted-foot solve.
   for(const w of active.filter(w=>!isPalm(w))){const fk=forward(rig,pose);if(!fk.joints[w.bone])continue;const point=marker(fk,w.bone,w.local??[0,0,0]),axis=unit(vsub(center,point));center=lerp(center,vadd(point,vmul(axis,radius)),w.strength);}
   // Each hand is solved independently against the SAME primary sphere.
   // Group repeated event/window declarations to avoid applying a ramp twice.
   for(const bone of ['LeftHand','RightHand']){const windows=active.filter(w=>w.bone===bone&&isPalm(w)).sort((a,b)=>b.strength-a.strength||priority(b)-priority(a));if(!windows.length)continue;const w=windows[0],fk=forward(rig,pose),local=w.local??[0,0,0];if(!fk.joints[bone])continue;
    const axis=sourceSide(source,w,source.ball??center),targetPoint=vadd(center,vmul(axis,radius)),target=vsub(targetPoint,rotate(local.map((v,i)=>v*fk.scales[bone][i]),fk.rotations[bone]));
    const solved=solveTwoBone(rig,pose,{effector:bone,target,worldRotation:fk.rotations[bone],weight:w.strength});diagnostics.armContactIK.solves++;diagnostics.armContactIK.maxReachErrorMeters=Math.max(diagnostics.armContactIK.maxReachErrorMeters,solved.reachError);diagnostics.armContactIK.maxTargetErrorMeters=Math.max(diagnostics.armContactIK.maxTargetErrorMeters,solved.targetError);
   }
   setWorldTranslation(rig,pose,ballName,center);
  }
 }
 const frames=poses.map(p=>{const f=forward(rig,p),root=f.root??[0,0,0],inverse=qinv(f.rotations.Root??I);f.localJoints=Object.fromEntries(Object.entries(f.joints).map(([n,v])=>[n,rotate([v[0]-root[0],v[1],v[2]-root[2]],inverse)]));f.assetRoot=[0,root[1],0];f.referenceRoot=[...root];f.floorPoints=['LeftFoot','RightFoot'].filter(b=>f.joints[b]).map(b=>({bone:b,position:solePoint(rig,p,b,footLocal(b))}));return f;});
 return {rig,poses,metadata,duration,diagnostics,frames};
}
