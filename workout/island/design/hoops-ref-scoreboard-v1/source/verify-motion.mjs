// SPDX-License-Identifier: CC0-1.0
// Export-contract validation supplements the unchanged motion-qa-v1 scores.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=new URL('../',import.meta.url),qaBase=path.join(process.env.HOOPS_REF_QA_DIR??'/tmp/bakasun-hoops-ref-motion-qa-v1','workout/island/design/motion-qa-v1');
const {parseGLB,readAccessor,sampleGLB}=await import(pathToFileURL(path.join(qaBase,'glb.mjs')).href);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const quaternionDistance=(a,b)=>Math.min(distance(a,b),distance(a,b.map(v=>-v)));
const catalog=JSON.parse(await readFile(new URL('motion/motions.json',root))),bytes=await readFile(new URL('models/referee.glb',root)),final=parseGLB(bytes),reference=JSON.parse(await readFile(new URL('../../motion2/hoops.json',import.meta.url))).skeleton;
const referenceNames=reference.bones.map(b=>b.name),jointNodes=final.json.skins.flatMap(s=>s.joints.map(i=>final.json.nodes[i])),assertions={canonicalNames:jointNodes.length===18&&jointNodes.every((n,i)=>n.name===referenceNames[i]),canonicalDefinition:JSON.stringify(catalog.skeleton)===JSON.stringify(reference),canonicalHierarchy:true,canonicalRest:true},clips=[];
for(const b of reference.bones){const index=final.json.nodes.findIndex(n=>n.name===b.name),n=final.json.nodes[index],parent=final.json.nodes.find(n=>n.children?.includes(index))?.name??null;assertions.canonicalHierarchy&&=parent===b.parent;assertions.canonicalRest&&=!!n&&distance(n.translation??[0,0,0],b.restTranslationMeters)<1e-8&&quaternionDistance(n.rotation??[0,0,0,1],[0,0,0,1])<1e-8;}
const samples=new Map(catalog.clips.map(c=>[c.id,sampleGLB(final,{animation:c.id,fps:120,extraTimes:c.metadata.supports.flatMap(w=>[w.start,w.end])})]));
const neutral=samples.get('idle').frames[0];
for(const entry of catalog.clips){
 const single=parseGLB(await readFile(new URL(entry.asset,root))),a=single.json.animations[0],b=final.json.animations.find(a=>a.name===entry.id);
 let native30Hz=true,identicalChannels=true,maxQuaternionLengthError=0;
 for(const c of b.channels){const s=b.samplers[c.sampler],name=final.json.nodes[c.target.node].name,times=Array.from(readAccessor(final,s.input)),values=Array.from(readAccessor(final,s.output));
  native30Hz&&=times.length===entry.frameCount&&times.every((t,i)=>Math.abs(t-i/30)<1e-6)&&s.interpolation==='LINEAR';
  const original=a.channels.find(ch=>single.json.nodes[ch.target.node].name===name&&ch.target.path===c.target.path),os=original&&a.samplers[original.sampler];
  identicalChannels&&=!!os&&JSON.stringify(times)===JSON.stringify(Array.from(readAccessor(single,os.input)))&&JSON.stringify(values)===JSON.stringify(Array.from(readAccessor(single,os.output)));
  if(c.target.path==='rotation')for(let i=0;i<values.length;i+=4)maxQuaternionLengthError=Math.max(maxQuaternionLengthError,Math.abs(1-Math.hypot(...values.slice(i,i+4))));
 }
 const native=samples.get(entry.id),first=native.frames[0],last=native.frames.at(-1),displacement=entry.cycleDisplacementMeters;
 const endpointJointDeltaMeters=Math.max(...referenceNames.map(n=>distance(last.joints[n],first.joints[n].map((v,i)=>v+displacement[i]))));
 const endpointRotationDelta=Math.max(...referenceNames.map(n=>quaternionDistance(first.localRotations[n],last.localRotations[n])));
 const neutralEndpointErrorMeters=entry.id==='run'?null:Math.max(...[first,last].flatMap(f=>referenceNames.map(n=>distance(f.joints[n],neutral.joints[n]))));
 const checks={native30Hz,channelCount:b.channels.length===20,allSkeletonRotations:referenceNames.every(n=>b.channels.some(c=>c.target.path==='rotation'&&final.json.nodes[c.target.node].name===n)),identicalChannels,maxQuaternionLengthError:maxQuaternionLengthError<1e-6,closedBodyPose:endpointJointDeltaMeters<1e-5&&endpointRotationDelta<1e-5,neutralEndpoints:neutralEndpointErrorMeters===null||neutralEndpointErrorMeters<1e-5};
 clips.push({id:entry.id,pass:Object.values(checks).every(Boolean),checks,duration:native.duration,frameCount:entry.frameCount,sampledFrames:native.frames.length,maxQuaternionLengthError,endpointJointDeltaMeters,endpointRotationDelta,neutralEndpointErrorMeters,cycleDisplacementMeters:displacement});
}
const whistle=samples.get('whistle').frames.reduce((a,b)=>Math.abs(a.t-1.2)<Math.abs(b.t-1.2)?a:b),lip=whistle.joints.Head.map((v,i)=>v+[-.0023,.0357,.1198][i]),mouthpiece=whistle.joints.RightHand.map((v,i)=>v+[0,-.025,.010][i]),measurements={whistleHoldHandMeters:whistle.joints.RightHand,whistleHoldHandWorldQuaternion:whistle.rotations.RightHand,lipLandmarkHeadLocalMeters:[-.0023,.0357,.1198],lipLandmarkSource:'Measured source face UV mouth landmark, approximately atlas UV (.913,.375); model rebind preserves Head-local position.',whistleMouthpieceMeters:mouthpiece,lipLandmarkMeters:lip,whistleMouthpieceToLipMeters:distance(lip,mouthpiece),runNativeSpeedMetersPerSecond:distance(samples.get('run').frames[0].root,samples.get('run').frames.at(-1).root)/.8};
assertions.whistleMeetsLip=measurements.whistleMouthpieceToLipMeters<.003;
const report={schemaVersion:1,asset:'models/referee.glb',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,pass:Object.values(assertions).every(Boolean)&&clips.every(c=>c.pass),assertions,clips,measurements,limitations:['Checks exported skeleton and animation channels; motion-qa-v1 evaluates skeletal probes, while visual/mesh checks are separate.','Run closes its body pose modulo 1.28m forward Root travel; runtime must extract displacement rather than resetting world position without accounting for it.']};
await writeFile(new URL('verification/motion-qa/native-validation.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1;
