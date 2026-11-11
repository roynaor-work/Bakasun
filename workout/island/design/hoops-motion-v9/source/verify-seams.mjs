#!/usr/bin/env node
/** Actual decoded run-to-brake seams, independent of authoring targets. */
import {writeFile} from 'node:fs/promises';
import * as THREE from '../runtime/vendor/three.module.js';
import {loadClip,disposeClip,disposeRuntime,createClipController} from '../runtime/library.mjs';
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const results=[];
for(const [sourceId,targetId,seek] of [['run','brake',.10],['run','brake',.24],['run_ball','brake_ball',.24],['sprint','brake',.15],['sprint_ball','brake_ball',.15]]){
 const [source,target]=await Promise.all([loadClip(sourceId,{format:'glb'}),loadClip(targetId,{format:'glb'})]);
 const controller=createClipController({THREE});
 try{
  const world=(name,point)=>controller.clip.scene.getObjectByName(name).localToWorld(new THREE.Vector3(...point)).add(new THREE.Vector3(...controller.referenceRootTranslationMeters)).toArray();
  controller.play(source);controller.seek(seek);controller.play(target);
  const queued=controller.transition,wait=queued?.secondsUntilContact||0;controller.update(wait);
  let anchor=null,maxDrift=0,airborne=0,blendSeconds=controller.transition?.blendSeconds||0,lockedSamples=0;
  const foot=controller.transition?.plantedFoot;
  if(foot)anchor=world(foot,[0,-.08,0]);
  for(let i=0;i<Math.ceil(target.meta.durationSeconds*120);i++){
   controller.update(1/120);
   const status=controller.transition;
   if(status&&!status.waitingForContact&&!status.supportHandoff&&anchor){maxDrift=Math.max(maxDrift,distance(anchor,world(foot,[0,-.08,0])));lockedSamples++;}
   if(['LeftFoot','RightFoot'].every(n=>world(n,[0,-.08,0])[1]>.02))airborne+=1/120;
  }
  controller.play(source,{transitionSeconds:0});
  const h=1e-4;controller.seek(source.meta.durationSeconds/2-2*h);controller.play(target);controller.update(h);const before=world('Hips',[0,0,0]),vBefore=controller.referenceVelocityMetersPerSecond;controller.update(h);const at=world('Hips',[0,0,0]);controller.update(h);const after=world('Hips',[0,0,0]),vAfter=controller.referenceVelocityMetersPerSecond;
  const incoming=at.map((v,k)=>(v-before[k])/h),outgoing=after.map((v,k)=>(v-at[k])/h);
  const result={source:sourceId,target:targetId,requestedAtSeconds:seek,waitForTouchdownSeconds:wait,blendSeconds,plantedFoot:foot,lockedSamples,maxLockedSoleDriftMeters:maxDrift,newAirborneSeconds:airborne,seamHipPositionStepMeters:distance(at,before),seamHipVelocityChangeMetersPerSecond:distance(incoming,outgoing),seamReferenceVelocityBefore:vBefore,seamReferenceVelocityAfter:vAfter,seamReferenceVelocityChangeMetersPerSecond:distance(vBefore,vAfter)};
  result.pass=maxDrift<.02&&airborne<.009&&result.seamHipVelocityChangeMetersPerSecond<.03&&result.seamReferenceVelocityChangeMetersPerSecond<.01;results.push(result);
 }finally{controller.dispose();disposeClip(source);disposeClip(target);}
}
await disposeRuntime();
const report={method:'Actual GLTFLoader Draco scenes + controller, 120Hz contact sweep; 0.1ms one-sided position/velocity probes at touchdown.',pass:results.every(r=>r.pass),results};
await writeFile(new URL('../verification/run-to-brake.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
