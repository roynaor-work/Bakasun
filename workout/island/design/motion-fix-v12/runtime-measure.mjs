/** Original CC0-1.0 runtime measurement regions.
 * Appended idle handles must not change the action's gait/locomotion identity,
 * halve its apparent speed, or dilute the percentage of anatomical violations.
 * Every regional observation uses the byte-identical original QA formulas.
 */
import {sampleGLB} from './qa/glb.mjs';
import {analyzeClip,METRICS} from './qa/metrics.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const rotate=(v,q)=>{const[x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return[a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];};
export function nativeFrames(buffer,metadata,{fps=60}={}){
 const extraTimes=[metadata.coreRange?.start,metadata.coreRange?.end,...(metadata.supports??[]).flatMap(w=>[w.start,w.end]),...(metadata.ballContacts??[]).flatMap(w=>[w.start,w.end]),...(metadata.events??[]).map(e=>e.time),...(metadata.contacts??[]).map(e=>e.time??e.atSeconds)];
 const native=sampleGLB(buffer,{fps,extraTimes});
 for(const f of native.frames){
  const root=f.root??[0,0,0],q=inverse(f.rotations.Root??[0,0,0,1]);
  f.localJoints=Object.fromEntries(Object.entries(f.joints).map(([name,p])=>[name,rotate([p[0]-root[0],p[1],p[2]-root[2]],q)]));f.assetRoot=[0,root[1],0];f.referenceRoot=[...root];f.soles={};
  for(const bone of ['LeftFoot','RightFoot'])if(f.joints[bone]){
   const local=metadata.soleLocalByBone?.[bone]??metadata.supports?.find(w=>w.bone===bone)?.local??metadata.soleLocal??[0,-.08,0];
   f.soles[bone]=add(f.joints[bone],rotate(local.map((v,i)=>v*(f.scales[bone]?.[i]??1)),f.rotations[bone]));
  }
  f.floorPoints=Object.entries(f.soles).map(([bone,position])=>({bone,position}));
 }
 return native;
}
export function actionRegion(frames,metadata,range=metadata.coreRange){
 if(!range)return {frames,metadata,duration:frames.at(-1).t-frames[0].t};
 const {start,end}=range,D=range.duration??end-start;
 if(!(end>start)||Math.abs((end-start)-D)>1e-4)throw new Error('Invalid core measurement range');
 const selected=frames.filter(f=>f.t>=start-1e-6&&f.t<=end+1e-6).map(f=>({...f,t:Math.max(0,Math.min(D,f.t-start))})).reduce((out,f)=>{if(!out.length||f.t-out.at(-1).t>1e-6)out.push(f);return out;},[]);
 if(selected.length<2||Math.abs(selected[0].t)>1e-5||Math.abs(selected.at(-1).t-D)>1e-5)throw new Error('Native core endpoints missing from sample set');
 const m={...metadata,loop:metadata.originalLoop??metadata.loop};delete m.mirrorFrames;
 for(const k of ['supports','ballContacts','contactWindows'])if(metadata[k])m[k]=metadata[k].filter(w=>w.end>=start-1e-6&&w.start<=end+1e-6).map(w=>({...w,start:Math.max(0,w.start-start),end:Math.min(D,w.end-start)}));
 for(const k of ['events','contacts'])if(metadata[k])m[k]=metadata[k].filter(e=>{const t=e.time??e.atSeconds??e.timeSeconds;return Number.isFinite(t)&&t>=start-1e-6&&t<=end+1e-6;}).map(e=>({...e,...Object.fromEntries(['time','atSeconds','timeSeconds'].filter(k=>Number.isFinite(e[k])).map(k=>[k,e[k]-start]))}));
 return {frames:selected,metadata:m,duration:D};
}
function worst(full,core){
 if(full.status==='insufficient-data')return {metric:full,region:'full'};
 if(core.status==='insufficient-data')return {metric:core,region:'core'};
 if(full.status==='not-applicable')return {metric:core,region:'core'};
 if(core.status==='not-applicable')return {metric:full,region:'full'};
 return core.value>full.value?{metric:core,region:'core'}:{metric:full,region:'full'};
}
export function analyzeRuntime({frames,duration=frames.at(-1).t,height=1.7,metadata={},idleFrames,clipId='',sport='',mirrorFrames}={}){
 const reflected=mirrorFrames??metadata.mirrorFrames;
 const full=analyzeClip({frames,duration,height,metadata:structuredClone({...metadata,...(reflected?{mirrorFrames:reflected}:{})}),idleFrames,clipId,sport});
 if(!metadata.coreRange)return {...full,metrics:Object.fromEntries(Object.entries(full.metrics).map(([k,m])=>[k,{...m,measurementRegion:'full native sequence'}]))};
 const region=actionRegion(frames,metadata),coreMeta={...region.metadata};
 if(reflected?.length){
  const range={...(metadata.mirrorCoreRange??{start:metadata.coreRange.start,end:reflected.at(-1).t-(duration-metadata.coreRange.end)})};range.duration??=range.end-range.start;
  coreMeta.mirrorFrames=actionRegion(reflected,{...metadata,coreRange:range},range).frames;
 }
 const core=analyzeClip({frames:region.frames,duration:region.duration,height,metadata:structuredClone(coreMeta),idleFrames,clipId,sport}),metrics={};
 for(const name of Object.keys(METRICS)){
  let chosen;
  if(['bodySliding','symmetry'].includes(name))chosen={metric:core.metrics[name],region:'core'};
  else if(name==='continuity')chosen={metric:full.metrics[name],region:'full'};
  else chosen=worst(full.metrics[name],core.metrics[name]);
  metrics[name]={...chosen.metric,measurementRegion:chosen.region==='core'?'original action core':'full native sequence',regionPolicy:['bodySliding','symmetry'].includes(name)?'Core duration and originalLoop preserve source gait and locomotion checks.':name==='continuity'?'Idle entry and exit handles are part of the delivered native animation.':'Worst full/core result prevents handles from diluting or masking violations.',regionalObservations:{full:{value:full.metrics[name].value,status:full.metrics[name].status},core:{value:core.metrics[name].value,status:core.metrics[name].status}}};
 }
 let applicableWeight=0,measuredWeight=0,total=0;
 for(const [name,m] of Object.entries(metrics)){if(m.status==='not-applicable')continue;const weight=METRICS[name].weight;applicableWeight+=weight;if(m.score!==null){measuredWeight+=weight;total+=weight*m.score;}}
 const round=(x,d)=>Number(x.toFixed(d));
 const reasons=Object.entries(metrics).filter(([,m])=>['red','yellow','insufficient-data'].includes(m.status)).sort(([a,av],[b,bv])=>((bv.status==='insufficient-data'?100:100-bv.score)*METRICS[b].weight)-((av.status==='insufficient-data'?100:100-av.score)*METRICS[a].weight)).map(([name,m])=>({metric:name,label:METRICS[name].label,status:m.status,value:m.value,unit:METRICS[name].unit,reason:m.reason??METRICS[name].description,measurementRegion:m.measurementRegion}));
 return {score:applicableWeight?round(total/applicableWeight,1):0,coverage:applicableWeight?round(measuredWeight/applicableWeight,4):0,metrics,reasons,scoring:{kind:'weighted reproducible screening proxy',applicableWeight,measuredWeight,missingApplicableMetricsScoreZero:true,regionalPolicy:'Original QA formulas and weights; core originalLoop for gait/body speed; worst full/core physical checks; full delivered idle continuity.'},clipId,sport};
}
