/** Original CC0-1.0. Geometry-preserving, bounded adaptive animation timing.
 * Uses the unchanged QA velocity thresholds (0.04 height marker displacement,
 * 15 degrees bone rotation and 0.08 height root displacement per 60-Hz step).
 * Every local rotation/translation sample stays byte-for-byte numerically the
 * same; only its time changes. Events and physical windows use the same map.
 */
import {forward,blendPose,rotate,qinv,qmul,dot,length,vsub} from './rig-ops.mjs';
const clone=v=>JSON.parse(JSON.stringify(v)),I=[0,0,0,1];
const canonical=/^(Root|Hips|Spine\d*|Chest|UpperChest|Neck|Head|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|Toes))$/;
const qangle=(a,b)=>2*Math.acos(Math.max(-1,Math.min(1,Math.abs(dot(a,b)/(length(a)*length(b)||1)))))*180/Math.PI;
function measuredPose(rig,p){
 const f=forward(rig,p),root=f.root??[0,0,0],inverse=qinv(f.rotations.Root??I),markers={},rotations={};
 for(const [name,position] of Object.entries(f.joints))if(name!=='Root'&&canonical.test(name)){markers[name]=rotate([position[0]-root[0],position[1],position[2]-root[2]],inverse);rotations[name]=qmul(inverse,f.rotations[name]);}
 return {root,markers,rotations};
}
function normalizedStep(a,b,height){
 let largest=length(vsub(a.root,b.root))/(.08*height);
 for(const [name,p] of Object.entries(a.markers))if(b.markers[name])largest=Math.max(largest,length(vsub(p,b.markers[name]))/(.04*height),qangle(a.rotations[name],b.rotations[name])/15);
 return largest;
}
/** Return a deep-cloned result from repairClip. Use a fresh pre-uniform-stretch
 * result when possible; an existing metadata.timeScale consumes the cap too.
 */
export function retimePeaks(result,{maxAverageScale=2.5,target=.92,height=result.metadata?.height??result.height??1.7,subdivisions=4}={}){
 if(!(target>0&&target<1)||!(maxAverageScale>=1)||!(height>0))throw new Error('Invalid retiming bounds');
 const out=clone(result),poses=out.poses;if(poses.length<2)return out;
 const sourceTimes=poses.map(p=>p.t),sourceStart=sourceTimes[0],sourceEnd=sourceTimes.at(-1),sourceDuration=sourceEnd-sourceStart,existingScale=out.metadata.timeScale??1,remainingScale=Math.max(1,maxAverageScale/existingScale),intervals=[];
 for(let i=1;i<poses.length;i++){
  const a=poses[i-1],b=poses[i],dt=b.t-a.t;if(!(dt>0))throw new Error('Pose times must strictly increase');
  let previous=measuredPose(out.rig,a),required=0;
  for(let j=1;j<=subdivisions;j++){const sample=j===subdivisions?b:blendPose(a,b,j/subdivisions,{alignRoot:false}),current=measuredPose(out.rig,sample);required=Math.max(required,normalizedStep(previous,current,height)*subdivisions/(60*target));previous=current;}
  intervals.push({sourceSeconds:dt,requestedSeconds:Math.max(dt,required),predictedRatioAtOriginalSpeed:required/dt*target});
 }
 const requestedDuration=intervals.reduce((s,i)=>s+i.requestedSeconds,0),allowedDuration=sourceDuration*remainingScale,excess=requestedDuration-sourceDuration,budget=Math.max(0,allowedDuration-sourceDuration),allocation=excess>0?Math.min(1,budget/excess):1;
 const knots=[{sourceSeconds:sourceStart,runtimeSeconds:sourceStart}];let runtime=sourceStart,maxPredictedRatio=0;
 intervals.forEach((interval,i)=>{const duration=interval.sourceSeconds+(interval.requestedSeconds-interval.sourceSeconds)*allocation;runtime+=duration;poses[i+1].t=runtime;maxPredictedRatio=Math.max(maxPredictedRatio,interval.predictedRatioAtOriginalSpeed*interval.sourceSeconds/duration);knots.push({sourceSeconds:sourceTimes[i+1],runtimeSeconds:runtime});});
 const map=t=>{if(!Number.isFinite(t))return t;if(t<=sourceStart)return sourceStart+(t-sourceStart);if(t>=sourceEnd)return runtime+(t-sourceEnd);let lo=0,hi=knots.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(knots[m].sourceSeconds<=t)lo=m;else hi=m;}const a=knots[lo],b=knots[hi],u=(t-a.sourceSeconds)/(b.sourceSeconds-a.sourceSeconds);return a.runtimeSeconds+(b.runtimeSeconds-a.runtimeSeconds)*u;};
 const metadata=out.metadata,sourceCoreRange=clone(out.metadata.coreRange??{start:0,end:sourceDuration,duration:sourceDuration});
 for(const field of ['supports','ballContacts','contactWindows'])for(const w of metadata[field]??[]){for(const k of ['start','end','startSeconds','endSeconds'])if(Number.isFinite(w[k]))w[k]=map(w[k]);}
 for(const field of ['events','contacts'])for(const e of metadata[field]??[])for(const k of ['time','atSeconds','timeSeconds'])if(Number.isFinite(e[k]))e[k]=map(e[k]);
 for(const keys of [metadata.travel,metadata.referenceRootMotion?.samples,metadata.ball?.samples,metadata.ball?.keys])for(const key of keys??[])for(const field of ['time','timeSeconds','atSeconds'])if(Number.isFinite(key[field]))key[field]=map(key[field]);
 if(metadata.coreRange){const {start,end}=metadata.coreRange;metadata.coreRange={...metadata.coreRange,start:map(start),end:map(end),duration:map(end)-map(start),sourceDurationSeconds:metadata.coreRange.sourceDurationSeconds??end-start};}
 for(const k of ['loopStart','loopEnd','runtimeDurationSeconds'])if(Number.isFinite(metadata[k]))metadata[k]=map(metadata[k]);
 if(out.frames)for(const f of out.frames)f.t=map(f.t);
 out.duration=runtime-sourceStart;metadata.runtimeDurationSeconds=out.duration;metadata.timeScale=existingScale*out.duration/sourceDuration;
 metadata.timeMap={kind:'piecewise-linear seconds',sourceSpace:'unretimed delivered animation including idle handles',runtimeSpace:'delivered adaptive playback seconds',sourceCoreRange,sourceDurationSeconds:sourceDuration,runtimeDurationSeconds:out.duration,knots,geometry:'Identical local rotation/translation sample path; all sample ordering and contacts retained.'};
 (out.diagnostics??={}).adaptiveRetiming={targetRatio:target,maxAverageScale,averageScale:metadata.timeScale,requestedDurationSeconds:requestedDuration,sourceDurationSeconds:sourceDuration,runtimeDurationSeconds:out.duration,budgetLimited:allocation<1,maxPredictedRatio,subdivisions,notes:['Timing is slowed locally only where measured FK derivatives require it.','Final certification must measure the exported native GLB at 60Hz and exact declared events.','Cadence and body speed use the new physical core timing; no gait metadata is waived.']};
 return out;
}
