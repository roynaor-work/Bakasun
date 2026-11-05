/** Read-only source-FK/contact basis diagnostic; never changes motion data. */
import fs from'node:fs/promises';import crypto from'node:crypto';import*as THREE from'../vendor/three.module.js';
import{sampleClip,applyPose,contactsAt}from'./motion-runtime.js';
const bytes=await fs.readFile(new URL('../animations.json',import.meta.url)),motion=JSON.parse(bytes),clip=motion.clips.find(c=>c.id==='decelerate');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),actor=new THREE.Group(),bones={};
for(const spec of motion.skeleton.bones){const bone=new THREE.Bone();bone.name=spec.name;bone.position.fromArray(spec.restTranslationMeters);bones[spec.name]=bone;(spec.parent?bones[spec.parent]:actor).add(bone);}
function sample(seconds,scale){const pose=sampleClip(THREE,clip,seconds);const root=pose.referenceRootTranslationMeters.slice();root[2]*=scale;actor.position.fromArray(root);applyPose(bones,pose);actor.updateMatrixWorld(true);const feet={};for(const name of['LeftFoot','RightFoot']){const sole=bones[name].localToWorld(new THREE.Vector3(0,-.08,0)),local=actor.worldToLocal(sole.clone()),warpedLocal=local.clone();warpedLocal.z*=scale;feet[name]={rawWorldSoleMeters:sole.toArray(),rawLocalSoleMeters:local.toArray(),localZWarpedWorldSoleMeters:actor.localToWorld(warpedLocal).toArray(),worldQuaternion:bones[name].getWorldQuaternion(new THREE.Quaternion()).toArray()};}return{seconds,scale,referenceRootMeters:root,feet};}
const rows=[],dense=[];
for(const scale of[1,.2667,1.2]){
 for(const contact of clip.contacts.filter(c=>c.mode==='plant')){
  const start=contact.start,end=contact.end,anchor=[contact.anchor[0],contact.anchor[1],contact.anchor[2]*scale];
  for(const[label,time]of[['pre-one-frame',start-1/30],['pre-10ms',start-.01],['begin',start],['post-10ms',start+.01],['mid',(start+end)/2],['end',end]]){
   if(time<0||time>clip.duration)continue;const row=sample(time,scale),foot=row.feet[contact.bone],target=new THREE.Vector3().fromArray(anchor);
   const rawError=new THREE.Vector3().fromArray(foot.rawWorldSoleMeters).sub(target),warpedError=new THREE.Vector3().fromArray(foot.localZWarpedWorldSoleMeters).sub(target);
   rows.push({...row,bone:contact.bone,label,contactStart:start,contactEnd:end,scaledAnchorMeters:anchor,rawErrorMeters:rawError.toArray(),rawDistanceMeters:rawError.length(),localZWarpedErrorMeters:warpedError.toArray(),localZWarpedDistanceMeters:warpedError.length()});
  }
 }
 let maxRaw=0,maxWarped=0,count=0,worstRaw=null,worstWarped=null;
 for(let i=0;i<=240;i++){const time=i/240,row=sample(time,scale);for(const contact of contactsAt(clip,time).filter(c=>c.mode==='plant')){const target=new THREE.Vector3(contact.anchor[0],contact.anchor[1],contact.anchor[2]*scale),foot=row.feet[contact.bone],raw=new THREE.Vector3().fromArray(foot.rawWorldSoleMeters).distanceTo(target),warped=new THREE.Vector3().fromArray(foot.localZWarpedWorldSoleMeters).distanceTo(target);if(raw>maxRaw){maxRaw=raw;worstRaw={seconds:time,bone:contact.bone};}if(warped>maxWarped){maxWarped=warped;worstWarped={seconds:time,bone:contact.bone};}count++;}}
 dense.push({scale,supportSamples:count,maxRawDistanceMeters:maxRaw,maxLocalZWarpedDistanceMeters:maxWarped,worstRaw,worstWarped});
}
const boundaryRows=rows.filter(row=>['begin','mid','end'].includes(row.label)),report={schemaVersion:1,motionSha256:sha(bytes),runtimeSha256:sha(await fs.readFile(new URL('./motion-runtime.js',import.meta.url))),clip:clip.id,sourceAuthored30Hz:true,contactIKApplied:false,trajectoryWarp:'Scale actor-local sole Z algebraically; referenceRootZ and authoredanchorZ are scaled together.',denseSamplingHz:240,dense,rows,summary:{maxBoundaryRawDistanceMeters:Math.max(...boundaryRows.map(r=>r.rawDistanceMeters)),maxBoundaryLocalZWarpedDistanceMeters:Math.max(...boundaryRows.map(r=>r.localZWarpedDistanceMeters))},limits:['Canonical bones/FK only, no whole-mesh floor uplift or transition pose blend/root-origin carry.','Pre-contact approach is intentionally airborne; its distance to the future plant is not slip.','Local-Z warp is measured algebraically before any trajectory/contact IK; planted feet have flat orientation.']};
await fs.writeFile(new URL('./motion-decelerate-fk-diagnostic.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({dense,summary:report.summary,leftLatePlant:rows.filter(row=>row.bone==='LeftFoot'&&row.contactStart>.4&&['pre-one-frame','begin','mid','end'].includes(row.label)).map(row=>({scale:row.scale,label:row.label,seconds:row.seconds,sole:row.feet.LeftFoot.rawWorldSoleMeters,warped:row.feet.LeftFoot.localZWarpedWorldSoleMeters,anchor:row.scaledAnchorMeters,raw:row.rawDistanceMeters,warpError:row.localZWarpedDistanceMeters}))}));
