/** Original CC0-1.0 independent audit of serialized runtime GLBs.
 * Uses the pinned original glTF reader and unchanged motion-qa-v1 metrics,
 * never the repair solver/FK or the eight-pose diagnostic preview.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sampleGLB} from './qa/glb.mjs';
import {analyzeClip,METRICS} from './qa/metrics.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const rotate=(v,q)=>{const[x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return[a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];};
const keyOf=e=>e.key??`${e.library}/${e.id}`;
const isBlocked=e=>e.status==='blocked'||e.blocked===true;
const metricsOf=v=>v?.metrics??v?.analysis?.metrics??{};
async function json(file){let b=await readFile(file);if(b[0]===31&&b[1]===139)b=gunzipSync(b);return JSON.parse(b.toString());}
function resolve(root,file){const full=path.resolve(root,file);if(!full.startsWith(path.resolve(root)+path.sep))throw new Error(`Audit path escapes bundle: ${file}`);return full;}
/** Independently apply the declared action-core policy; no repair/runtime evaluator import. */
function regionFrames(frames,range){
 const d=range.duration??range.end-range.start;
 const selected=frames.filter(f=>f.t>=range.start-1e-6&&f.t<=range.end+1e-6).map(f=>({...f,t:Math.min(d,Math.max(0,f.t-range.start))})).reduce((out,f)=>{if(!out.length||f.t-out.at(-1).t>1e-6)out.push(f);return out;},[]);
 if(selected.length<2||Math.abs(selected[0].t)>1e-5||Math.abs(selected.at(-1).t-d)>1e-5)throw new Error('Core endpoint missing from independent native audit');
 return selected;
}
function independentAnalyze(args){
 const {frames,metadata,clipId,height,sport,idleFrames}=args,range=metadata.coreRange;
 const full=analyzeClip({...args,metadata:structuredClone(metadata)});if(!range)return full;
 const duration=range.duration??range.end-range.start,coreMetadata={...metadata,loop:metadata.originalLoop??metadata.loop};delete coreMetadata.mirrorFrames;
 for(const name of ['supports','ballContacts','contactWindows'])if(metadata[name])coreMetadata[name]=metadata[name].filter(w=>w.end>=range.start-1e-6&&w.start<=range.end+1e-6).map(w=>({...w,start:Math.max(0,w.start-range.start),end:Math.min(duration,w.end-range.start)}));
 for(const name of ['events','contacts'])if(metadata[name])coreMetadata[name]=metadata[name].filter(e=>{const t=e.time??e.atSeconds??e.timeSeconds;return Number.isFinite(t)&&t>=range.start-1e-6&&t<=range.end+1e-6;}).map(e=>({...e,...Object.fromEntries(['time','atSeconds','timeSeconds'].filter(k=>Number.isFinite(e[k])).map(k=>[k,e[k]-range.start]))}));
 if(metadata.mirrorFrames?.length){const reflected=metadata.mirrorFrames,mirrorRange=metadata.mirrorCoreRange??{start:range.start,end:reflected.at(-1).t-(args.duration-range.end)};coreMetadata.mirrorFrames=regionFrames(reflected,mirrorRange);}
 const core=analyzeClip({frames:regionFrames(frames,range),duration,height,metadata:structuredClone(coreMetadata),idleFrames,clipId,sport}),metrics={};
 for(const name of Object.keys(METRICS)){
  const f=full.metrics[name],c=core.metrics[name];let selected,region;
  if(name==='bodySliding'||name==='symmetry'){selected=c;region='original action core';}
  else if(name==='continuity'){selected=f;region='full native sequence';}
  else if(f.status==='insufficient-data'){selected=f;region='full native sequence';}
  else if(c.status==='insufficient-data'){selected=c;region='original action core';}
  else if(f.status==='not-applicable'){selected=c;region='original action core';}
  else if(c.status==='not-applicable'||f.value>=c.value){selected=f;region='full native sequence';}
  else{selected=c;region='original action core';}
  metrics[name]={...selected,measurementRegion:region};
 }
 let weight=0,measured=0,points=0;for(const[name,m]of Object.entries(metrics)){if(m.status==='not-applicable')continue;weight+=METRICS[name].weight;if(m.score!==null){measured+=METRICS[name].weight;points+=METRICS[name].weight*m.score;}}
 return {...full,metrics,score:weight?Number((points/weight).toFixed(1)):0,coverage:weight?Number((measured/weight).toFixed(4)):0,scoring:{...full.scoring,applicableWeight:weight,measuredWeight:measured,regionalPolicy:'independent action-core audit'}};
}
function summarize(clips){
 const scores=clips.map(c=>c.score).filter(Number.isFinite),redClips=clips.filter(c=>Object.values(c.metrics??{}).some(m=>m.status==='red')).length,yellowClips=clips.filter(c=>Object.values(c.metrics??{}).some(m=>m.status==='yellow')).length;
 return {count:clips.length,measuredScores:scores.length,average:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100:null,redMetrics:clips.reduce((a,c)=>a+Object.values(c.metrics??{}).filter(m=>m.status==='red').length,0),redClips,yellowClips,yellowPercent:clips.length?Math.round(yellowClips/clips.length*10000)/100:0,insufficientMetrics:clips.reduce((a,c)=>a+Object.values(c.metrics??{}).filter(m=>m.status==='insufficient-data').length,0)};
}
/** All original denominators survive. Blocked source clips retain unresolved
 * source diagnostics here; a separate admitted summary describes runtime only.
 */
export async function auditNative({root=here,manifest,output=path.join(root,'verification/native-audit.json')}={}){
 manifest??=await json(path.join(root,'manifest.json'));
 const before=await json(path.join(root,'data/before.json'));
 const original=new Map(before.libraries.flatMap(l=>l.clips.map(c=>[`${l.id}/${c.id}`,{...c,library:l.id}])));
 const entries=manifest.clips??manifest.entries??[],errors=[],clips=[],cache=new Map(),baselineCache=new Map();
 const sourceLibrary=async library=>{if(!baselineCache.has(library))baselineCache.set(library,await json(`/tmp/motion-fix-baseline/${library}.json.gz`));return baselineCache.get(library);};
 const metadataFor=async(e,prior)=>{
  const after=e.after??{},ref=after.measurementMetadata??after.metadata??e.measurementMetadata??e.metadata;
  if(typeof ref==='string')return await json(resolve(root,ref));
  return ref??prior.metadata;
 };
 for(const e of entries){
  const key=keyOf(e),prior=original.get(key);if(!prior){errors.push({key,error:'Runtime entry has no original source counterpart'});continue;}
  const after=e.after??{},asset=typeof after==='string'?after:after.animation??after.asset??e.animation??e.asset;
  if(!asset){
   if(e.status==='unchanged'){
    const library=await sourceLibrary(e.library),source=library.clips.find(c=>c.id===e.id),idles=library.idleClips??library.clips.filter(c=>/idle|ready|stance/.test(c.id)),compatible=c=>(c.profile??'')===(source.profile??'')&&(c.metadata.role??'field')===(source.metadata.role??'field')&&(!!library.idleClips||(c.metadata.sourceLibrary??'')===(source.metadata.sourceLibrary??'')),sourceIdle=source&&(idles.find(c=>compatible(c)&&c.id!==source.id)??idles.find(compatible));
    if(!source)errors.push({key,error:'Unchanged entry missing immutable dense source frames'});
    else{const item={key,entry:e,prior,metadata:source.metadata,duration:source.duration,height:source.height,frames:source.frames,asset:source.sourceAsset.path,sourceState:'unchanged-immutable-source',sourceIdle};cache.set(key,item);clips.push(item);}
    continue;
   }
   errors.push({key,error:'Candidate entry has no serialized animation GLB'});continue;
  }
  try{
   const metadata=await metadataFor(e,prior),duration=e.duration??after.duration??prior.duration,height=e.height??after.height??prior.height;
   const extraTimes=[0,duration,metadata.coreRange?.start,metadata.coreRange?.end,...(metadata.events??[]).map(x=>x.time??x.atSeconds??x.timeSeconds),...(metadata.contacts??[]).map(x=>x.time??x.atSeconds),...(metadata.supports??[]).flatMap(w=>[w.start,w.end]),...(metadata.ballContacts??[]).flatMap(w=>[w.start,w.end])];
   const native=sampleGLB(await readFile(resolve(root,asset)),{animation:after.animationName??e.animationName,fps:60,extraTimes});
   if(Math.abs(native.duration-duration)>1e-4)throw new Error(`Duration differs: metadata ${duration}, GLB ${native.duration}`);
   for(const frame of native.frames){
    const root=frame.root??[0,0,0],q=inverse(frame.rotations.Root??[0,0,0,1]);
    frame.localJoints=Object.fromEntries(Object.entries(frame.joints).map(([name,p])=>[name,rotate([p[0]-root[0],p[1],p[2]-root[2]],q)]));
    frame.assetRoot=[0,root[1],0];frame.referenceRoot=[...root];
    frame.soles={};
    for(const bone of ['LeftFoot','RightFoot'])if(frame.joints[bone]){
     const probe=metadata.soleLocalByBone?.[bone]??metadata.soleLocalPoints?.[bone]??metadata.supports?.find(w=>w.bone===bone)?.local??metadata.soleLocal??[0,-.08,0];
     frame.soles[bone]=add(frame.joints[bone],rotate(probe.map((v,i)=>v*(frame.scales?.[bone]?.[i]??1)),frame.rotations[bone]??[0,0,0,1]));
    }
    frame.floorPoints=Object.entries(frame.soles).map(([bone,position])=>({bone,position}));
   }
   const item={key,entry:e,prior,metadata,duration,height,frames:native.frames,asset};cache.set(key,item);clips.push(item);
  }catch(error){errors.push({key,error:error.message});}
 }
 const results=[];
 for(const c of clips){
  try{
   const {entry:e,metadata:originalMetadata,key}=c,after=e.after??{},metadata={...originalMetadata};
   const idleKey=after.idleReference??e.idleReference??c.prior.idleReference;
   let idle=cache.get(idleKey);
   if(!idle&&idleKey){const oldId=String(idleKey).split('/').slice(1).join('/');idle=cache.get(`${e.library}/${oldId}`);}
   if(!idle){
    const role=c.metadata.role??'field',profile=e.profile??c.prior.profile??'';
    idle=clips.find(x=>x.entry.library===e.library&&(x.entry.profile??x.prior.profile??'')===profile&&(x.metadata.role??'field')===role&&/idle|ready|stance/.test(x.entry.id)&&x.key!==key)??clips.find(x=>x.entry.library===e.library&&(x.entry.profile??x.prior.profile??'')===profile&&(x.metadata.role??'field')===role&&/idle|ready|stance/.test(x.entry.id));
   }
   const idleAsset=after.idle??after.idleAnimation;
   if(idleAsset){
    const n=sampleGLB(await readFile(resolve(root,idleAsset)),{fps:60});
    for(const f of n.frames){const r=f.root??[0,0,0],q=inverse(f.rotations.Root??[0,0,0,1]);f.localJoints=Object.fromEntries(Object.entries(f.joints).map(([name,p])=>[name,rotate([p[0]-r[0],p[1],p[2]-r[2]],q)]));f.assetRoot=[0,r[1],0];}
    idle={key:idleAsset,frames:n.frames};
   }else if(c.sourceIdle)idle={key:c.sourceIdle.id,frames:c.sourceIdle.frames};
   const mirrorId=e.id.includes('_left')?e.id.replace('_left','_right'):e.id.includes('_right')?e.id.replace('_right','_left'):null;
   let mirror=mirrorId?cache.get(`${e.library}/${mirrorId}`):null;if(mirrorId&&!mirror){const originalLibrary=await sourceLibrary(e.library);mirror=originalLibrary.clips.find(x=>x.id===mirrorId);}if(mirror)metadata.mirrorFrames=mirror.frames;
   const measured=independentAnalyze({frames:c.frames,duration:c.duration,height:c.height,metadata,idleFrames:idle?.frames,clipId:e.id,sport:c.prior.sport??e.sport});
   const stored=typeof after==='object'?after.analysis??after:{},differences=[];
   if(Number.isFinite(stored.score)&&Math.abs(stored.score-measured.score)>.11)differences.push({field:'score',stored:stored.score,measured:measured.score});
   if(Number.isFinite(stored.coverage)&&Math.abs(stored.coverage-measured.coverage)>.00011)differences.push({field:'coverage',stored:stored.coverage,measured:measured.coverage});
   for(const [name,m] of Object.entries(metricsOf(stored))){const actual=measured.metrics[name];if(m.status!==actual?.status||Number.isFinite(m.value)!==Number.isFinite(actual?.value))differences.push({field:name,stored:m,measured:actual});else if(Number.isFinite(m.value)&&Math.abs(m.value-actual.value)>Math.max(.00001,Math.abs(m.value)*.005))differences.push({field:name,stored:m.value,measured:actual.value});}
   results.push({key,library:e.library,id:e.id,asset:c.asset,sampledFrames:c.frames.length,blocked:isBlocked(e),sourceState:c.sourceState??'native-exported-candidate',idleReference:idle?.key??null,...measured,storedDifferences:differences});
   if(differences.length)errors.push({key,error:'Serialized native metrics differ from stored after metrics',differences});
  }catch(error){errors.push({key:c.key,error:error.message});}
 }
 const byKey=new Map(results.map(c=>[c.key,c])),entryMap=new Map(entries.map(e=>[keyOf(e),e]));
 const libraries=before.libraries.map(l=>{
  const full=l.clips.map(c=>byKey.get(`${l.id}/${c.id}`)??{...c,sourceState:isBlocked(entryMap.get(`${l.id}/${c.id}`)??{})?'blocked-unresolved-source':'missing-unresolved-source'}),admitted=results.filter(c=>c.library===l.id&&!c.blocked),candidates=results.filter(c=>c.library===l.id),blocked=l.clips.filter(c=>isBlocked(entryMap.get(`${l.id}/${c.id}`)??{})).length;
  return {id:l.id,before:summarize(l.clips),fullOriginalSet:summarize(full),admittedRuntime:summarize(admitted),blocked,missing:l.clips.length-candidates.length};
 });
 for(const l of libraries)if(l.missing)errors.push({library:l.id,error:`${l.missing} original clips missing from native output or blocklist`});
 const result={schemaVersion:1,generatedAt:new Date().toISOString(),fps:60,pass:errors.length===0,metricSource:'qa/metrics.mjs unchanged from motion-qa-v1',denominators:'fullOriginalSet retains all original clips; blocked candidates are natively remeasured and remain in fullOriginalSet; admittedRuntime is separately reported',clips:results,libraries,errors};
 if(output){await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result)+'\n');}
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await auditNative();console.log(JSON.stringify({pass:result.pass,clips:result.clips.length,errors:result.errors.slice(0,10),libraries:result.libraries}));if(!result.pass)process.exitCode=1;
}
