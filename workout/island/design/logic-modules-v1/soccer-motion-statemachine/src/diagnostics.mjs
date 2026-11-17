import { getClip,TRANSITIONS } from './graph.mjs';
import { sampleClip,blendPoses,poseDifference,correctFloor,floorMinimum,FLOOR_POLICY } from './pose.mjs';
import { finite,freeze } from './math.mjs';
import { playbackRateFor } from './machine.mjs';

export const DIAGNOSTIC_THRESHOLDS=freeze({hardCutJointMeters:.15,hardCutRotationDegrees:40,blendStepJointMeters:.12,floorPenetrationMeters:.02,maxPresentationLiftMeters:.12,sampleRateHz:120,phaseSamples:5});
function configuration(options){
  const sampleRate=options.sampleRate??120,phaseSamples=options.phaseSamples??5;
  finite(sampleRate,'sampleRate',1);finite(phaseSamples,'phaseSamples',2);
  if(sampleRate>240||phaseSamples>33||!Number.isInteger(phaseSamples))throw new RangeError('audit sampling exceeds supported bounds');
  return {sampleRate,phaseSamples};
}
/** Inspect every declared window endpoint and uniform intermediate source phases.
 * Outgoing pose is frozen exactly as in the runtime, target advances at native rate.
 * Results are sampled measurements, not mathematical guarantees between samples.
 */
export function auditTransition(transitionOrId,options={}){
  const e=typeof transitionOrId==='string'?TRANSITIONS.find(t=>t.id===transitionOrId):transitionOrId;
  if(!e||!TRANSITIONS.some(t=>t.id===e.id))throw new RangeError('unknown transition');
  const {sampleRate,phaseSamples}=configuration(options),a=getClip(e.from),b=getClip(e.to);
  const targetRate=options.speedMps===undefined?1:playbackRateFor(b,options.speedMps);
  const speedGuardFailures=options.speedMps===undefined?[]:b.guards.filter(g=>g.startsWith('maxSpeed:')&&options.speedMps>Number(g.slice(9))+1e-9||g.startsWith('minSpeed:')&&options.speedMps<Number(g.slice(9))-1e-9);
  const [lo,hi]=e.exitWindow,phases=lo===hi?[lo]:Array.from({length:phaseSamples},(_,i)=>lo+(hi-lo)*i/(phaseSamples-1));
  let hardCutJointMeters=0,hardCutRotationDegrees=0,blendStepJointMeters=0,rawFloorMinimum=Infinity,correctedFloorMinimum=Infinity,maxRequiredLiftMeters=0,maxAppliedLiftMeters=0,samples=0,worstPhase=lo;
  for(const phase of phases){
    const from=sampleClip(a,phase*a.duration),entry=e.entryPhase==='preserve-normalized'?phase*b.duration:e.entryPhase*b.duration;
    const cut=poseDifference(b,from,sampleClip(b,entry));
    if(cut.maxJointMeters>hardCutJointMeters){hardCutJointMeters=cut.maxJointMeters;worstPhase=phase;}
    hardCutRotationDegrees=Math.max(hardCutRotationDegrees,cut.maxRotationDegrees);
    const steps=Math.max(1,Math.ceil(e.blendSeconds*sampleRate));let previous=null;
    for(let i=0;i<=steps;i++){
      const elapsed=e.blendSeconds*i/steps,raw=entry+elapsed*targetRate,targetTime=b.loop?raw%b.duration:Math.min(raw,b.duration);
      const pose=blendPoses(from,sampleClip(b,targetTime),i/steps),floor=correctFloor(b,pose,FLOOR_POLICY);
      rawFloorMinimum=Math.min(rawFloorMinimum,floor.rawMinimum);correctedFloorMinimum=Math.min(correctedFloorMinimum,floor.minimum);
      maxRequiredLiftMeters=Math.max(maxRequiredLiftMeters,floor.requiredLift);maxAppliedLiftMeters=Math.max(maxAppliedLiftMeters,floor.lift);
      if(previous)blendStepJointMeters=Math.max(blendStepJointMeters,poseDifference(b,previous,floor.pose).maxJointMeters);
      previous=floor.pose;samples++;
    }
  }
  const t=DIAGNOSTIC_THRESHOLDS;
  return freeze({transitionId:e.id,from:e.from,to:e.to,kind:e.kind,sourcePhases:phases,samples,sampleRateHz:sampleRate,targetRate,speedMps:options.speedMps??null,speedPermitted:speedGuardFailures.length===0,speedGuardFailures,hardCutJointMeters,hardCutRotationDegrees,blendStepJointMeters,rawFloorMinimum,correctedFloorMinimum,maxRequiredLiftMeters,maxAppliedLiftMeters,worstPhase,hardCutPass:hardCutJointMeters<=t.hardCutJointMeters&&hardCutRotationDegrees<=t.hardCutRotationDegrees,rawFloorPass:rawFloorMinimum>=-t.floorPenetrationMeters,adaptedPass:correctedFloorMinimum>=-t.floorPenetrationMeters&&blendStepJointMeters<=t.blendStepJointMeters});
}
export function auditGraph(options={}){
  configuration(options);const transitions=TRANSITIONS.map(e=>auditTransition(e,options));
  const max=k=>Math.max(...transitions.map(t=>t[k])),min=k=>Math.min(...transitions.map(t=>t[k]));
  return freeze({schemaVersion:1,thresholds:DIAGNOSTIC_THRESHOLDS,scope:'Exact source GLB rotations/translations, canonical joint origins and conservative sole-corner proxies; excludes skinned mesh, contact IK, ball collision, and unsampled time/phase/rate combinations. Speed-forbidden edges are additionally measured at the defensive capped rate and marked speedPermitted=false; the runtime rejects those requests.',summary:{transitionCount:transitions.length,speedGuardedTransitions:transitions.filter(t=>!t.speedPermitted).length,samples:transitions.reduce((sum,t)=>sum+t.samples,0),hardCutFailures:transitions.filter(t=>!t.hardCutPass).length,rawFloorFailures:transitions.filter(t=>!t.rawFloorPass).length,adaptedFailures:transitions.filter(t=>!t.adaptedPass).length,maxHardCutJointMeters:max('hardCutJointMeters'),maxBlendStepJointMeters:max('blendStepJointMeters'),rawFloorMinimum:min('rawFloorMinimum'),correctedFloorMinimum:min('correctedFloorMinimum'),maxRequiredLiftMeters:max('maxRequiredLiftMeters')},transitions});
}
/** Intrinsic clip check includes native key times and a uniform subframe grid. */
export function auditClip(clipOrId,options={}){
  const {sampleRate}=configuration(options),clip=typeof clipOrId==='string'?getClip(clipOrId):clipOrId;
  const times=new Set([0,clip.duration,...clip.tracks.flatMap(t=>t.times)]);
  for(let i=0;i<=Math.ceil(clip.duration*sampleRate);i++)times.add(Math.min(clip.duration,i/sampleRate));
  let minimum=Infinity,time=0;
  for(const t of [...times].sort((a,b)=>a-b)){const floor=floorMinimum(clip,sampleClip(clip,t));if(floor<minimum){minimum=floor;time=t;}}
  return freeze({clipId:clip.id,samples:times.size,minimum,time,floorPass:minimum>=-DIAGNOSTIC_THRESHOLDS.floorPenetrationMeters,loopClosure:clip.loop?poseDifference(clip,sampleClip(clip,0),sampleClip(clip,clip.duration)):null});
}
