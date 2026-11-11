/** Original CC0-1.0. Bake repairs, then measure exported native GLB bytes. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGLB,sampleGLB} from './qa/glb.mjs';
import {analyzeClip,idleFor,summarize,METRICS} from './measure.mjs';
import {rigFromGLB,poseFromWorldFrame,forward,rotate,qinv,vsub,vadd} from './repair/rig-ops.mjs';
import {animationGLB} from './repair/glb-writer.mjs';
import {repairClip} from './repair/pipeline.mjs';
import {nativeFrames,analyzeRuntime} from './runtime-measure.mjs';
import {mirrorResult,mirrorLowerBodyResult} from './repair/mirror.mjs';
import {retimePeaks} from './repair/retime.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
const slug=s=>s.replace(/[^a-zA-Z0-9_.-]+/g,'__');
const hash=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),only=args.includes('--library')?args[args.indexOf('--library')+1].split(','):null;
const limit=args.includes('--limit')?Number(args[args.indexOf('--limit')+1]):Infinity;
const baseline=JSON.parse(await readFile(path.join(base,'data/before.json')));
const models=(JSON.parse(await readFile(path.join(base,'data/models.json')))).models;
const entries=[],libraryRows=[],provenance={},checkpointRoot='/tmp/motion-fix-build-checkpoints';
await mkdir(path.join(base,'runtime/idles'),{recursive:true});await mkdir(path.join(base,'runtime/before'),{recursive:true});await mkdir(checkpointRoot,{recursive:true});
function pickModels(library,clip){
 if(clip.profile)return models.filter(m=>m.id===`tall-${clip.profile}`);
 if(library.sport==='tennis')return models.filter(m=>m.id==='tennis');
 if(clip.metadata.role==='goalkeeper'||clip.metadata.role==='keeper'||/keeper/.test(clip.id))return models.filter(m=>m.id==='canonical-keeper');
 return models.filter(m=>/^canonical-player-0/.test(m.id));
}
const cleanMeta=meta=>Object.fromEntries(Object.entries(meta).filter(([k])=>!['mirrorFrames','travel','referenceRootMotion','keyframes'].includes(k)).map(([k,v])=>[k,k==='ball'?{radius:v?.radius??meta.ballRadius}:v]));
function encodedTimes(meta){
 const m=structuredClone(meta);
 for(const k of ['supports','ballContacts','contactWindows'])for(const w of m[k]??[])for(const p of ['start','end'])if(Number.isFinite(w[p]))w[p]=Math.fround(w[p]);
 for(const k of ['events','contacts'])for(const e of m[k]??[])for(const p of ['time','atSeconds','timeSeconds'])if(Number.isFinite(e[p]))e[p]=Math.fround(e[p]);
 if(m.coreRange){m.coreRange.start=Math.fround(m.coreRange.start);m.coreRange.end=Math.fround(m.coreRange.end);m.coreRange.duration=m.coreRange.end-m.coreRange.start;}
 for(const k of ['loopStart','loopEnd','runtimeDurationSeconds'])if(Number.isFinite(m[k]))m[k]=Math.fround(m[k]);
 if(m.timeMap){for(const k of m.timeMap.knots)k.runtimeSeconds=Math.fround(k.runtimeSeconds);m.timeMap.runtimeDurationSeconds=Math.fround(m.timeMap.runtimeDurationSeconds);}
 m.timeEncoding='Event and support times rounded to the same IEEE754 float32 seconds stored by native GLB accessors; no event removed.';
 return m;
}
function assess(clip,frames,metadata,idleFrames,mirrorFrames){return analyzeRuntime({frames,duration:frames.at(-1).t,height:clip.height,metadata,idleFrames,mirrorFrames,clipId:clip.id,sport:clip.sport});}
async function save(relative,buffer,source,operation){await mkdir(path.dirname(path.join(base,relative)),{recursive:true});await writeFile(path.join(base,relative),buffer);const record=s=>({...s,license:'CC0-1.0',operation,sha256:hash(buffer)});provenance[relative]=Array.isArray(source)?source.map(record):record(source);}
function stretchResult(result,factor){
 result.poses.forEach(p=>p.t*=factor);result.duration*=factor;
 for(const field of ['supports','ballContacts','contactWindows'])for(const w of result.metadata[field]??[]){w.start*=factor;w.end*=factor;}
 for(const field of ['events','contacts'])for(const e of result.metadata[field]??[]){if(Number.isFinite(e.time))e.time*=factor;if(Number.isFinite(e.atSeconds))e.atSeconds*=factor;}
 for(const k of ['start','end','duration'])result.metadata.coreRange[k]*=factor;
 for(const k of ['loopStart','loopEnd','runtimeDurationSeconds'])if(Number.isFinite(result.metadata[k]))result.metadata[k]*=factor;
 if(result.metadata.timeMap){for(const k of result.metadata.timeMap.knots)k.runtimeSeconds*=factor;result.metadata.timeMap.runtimeDurationSeconds*=factor;}
 result.metadata.timeScale=(result.metadata.timeScale??1)*factor;result.diagnostics.timeScale=result.metadata.timeScale;
}
function bakeResult(result,clip,idleFrames){
 let bytes,native,after,metadata;
 result.metadata.originalDurationSeconds=clip.duration;
 for(let pass=0;pass<4;pass++){
  metadata=encodedTimes(cleanMeta(result.metadata));bytes=animationGLB({rig:result.rig,poses:result.poses,name:`${clip.motionId??clip.id}@motion-fix-v12`,extras:{source:clip.sourceAsset,coreRange:metadata.coreRange,version:'motion-fix-v12'}});
  native=nativeFrames(bytes,metadata);after=assess(clip,native.frames,metadata,idleFrames);
  const ratio=after.metrics.posePops.value??0,total=result.metadata.timeScale??1;
  if(ratio<=.98||total>=2.5||pass===3)break;
  stretchResult(result,Math.min(2.5/total,ratio*1.04));
 }
 return {bytes,native,after,metadata};
}
function severity(analysis){return ['red','insufficient-data','yellow'].map(s=>Object.values(analysis.metrics).filter(m=>m.status===s).length);}
function fewerFailures(a,b){const x=severity(a),y=severity(b);for(let i=0;i<x.length;i++){if(x[i]!==y[i])return x[i]<y[i];}return false;}
let processed=0;
for(const summary of baseline.libraries){
 if(only&&!only.includes(summary.id))continue;
 const library=JSON.parse(gunzipSync(await readFile(`/tmp/motion-fix-baseline/${summary.id}.json.gz`)));
 const repaired=new Map(),idleCache=new Map();let touched=0;
 for(const clip of library.clips){
  if(processed++>=limit)break;
  clip.sport=library.sport;
  const characterModels=pickModels(library,clip),key=`${library.id}/${clip.id}`;
  const entry={key,library:library.id,id:clip.id,label:clip.label,profile:clip.profile??null,height:clip.height,source:clip.sourceAsset,before:{score:clip.score,coverage:clip.coverage,metrics:clip.metrics,duration:clip.duration},after:{score:clip.score,coverage:clip.coverage,metrics:clip.metrics,duration:clip.duration},characters:characterModels.map(m=>({id:m.id,label:m.label,model:m.path})),status:'unchanged',duration:clip.duration};
  const needs=clip.score<88||Object.values(clip.metrics).some(m=>['red','yellow','insufficient-data'].includes(m.status));
  if(!needs){entries.push(entry);continue;}
  const sourceBuffer=await readFile(path.join(base,characterModels[0].path)),rig=rigFromGLB(parseGLB(sourceBuffer).json);
  let idle=idleFor(library,clip);
  if(!idle&&library.sport==='soccer'&&/keeper/.test(clip.id)){
   const sourceIdleLibrary=JSON.parse(gunzipSync(await readFile('/tmp/motion-fix-baseline/soccer-v9.json.gz')));
   idle=sourceIdleLibrary.clips.find(c=>c.id==='goalkeeper_ready');
  }
  let idleFrames=idle?.frames,idlePath;
  if(idle){
   const idleKey=`${library.id}--${idle.id}`;
   if(!idleCache.has(idleKey)){
    const idlePoses=idle.frames.map(f=>poseFromWorldFrame(f,rig)),bytes=animationGLB({rig,poses:idlePoses,name:`${idle.id}@source`,extras:{source:idle.sourceAsset??clip.sourceAsset}});
    idlePath=`runtime/idles/${slug(idleKey)}.source.glb`;
    await save(idlePath,bytes,idle.sourceAsset??clip.sourceAsset,'Native skeleton re-encoding of immutable matching idle; no repaired motion.');
    const m={...idle.metadata,soleLocalByBone:Object.fromEntries(['LeftFoot','RightFoot'].map(b=>[b,idle.metadata.supports?.find(w=>w.bone===b)?.local??idle.metadata.soleLocal??[0,-.08,0]]))};
    idleCache.set(idleKey,{frames:nativeFrames(bytes,m).frames,path:idlePath});
   }
   ({frames:idleFrames,path:idlePath}=idleCache.get(idleKey));
  }
  let input=clip;
  if(library.id==='hoops-tall-v1'){
   const {augmentTallClip}=await import('./repair/tall-ball.mjs');input=await augmentTallClip(clip,library);
  }
  const raw=await repairClip({clip:input,idle,rig,options:{}});
  let result=retimePeaks(raw,{height:clip.height,maxAverageScale:2.5,target:.88}),baked=bakeResult(result,clip,idleFrames);
  if(severity(baked.after).some(n=>n>0)){
   const uniform=bakeResult(raw,clip,idleFrames);
   if(fewerFailures(uniform.after,baked.after)){result=raw;baked=uniform;result.diagnostics.timingStrategy='Uniform slowdown retained because native export has fewer unresolved metric failures.';}
  }
  const {metadata,bytes,native,after}=baked;
  const filename=`runtime/${library.id}/${slug(clip.id)}.motion-fix-v12.glb`;
  await save(filename,bytes,clip.sourceAsset,'Original v12 quaternion smoothing, idle handles, fixed-length two-bone support IK and profile-specific retarget; measured from these exported bytes.');
  const beforeRig=structuredClone(rig),beforeHasBall=clip.frames.some(f=>f.ball);
  if(beforeHasBall&&!beforeRig.nodes.some(n=>n.name==='Ball')){beforeRig.nameToIndex.Ball=beforeRig.nodes.length;beforeRig.nodes.push({name:'Ball',parent:null,translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]});}
  const beforePoses=clip.frames.map(f=>{const p=poseFromWorldFrame(f,beforeRig);if(beforeHasBall&&f.ball)p.translations.Ball=[...f.ball];return p;});
  const beforeBytes=animationGLB({rig:beforeRig,poses:beforePoses,name:`${clip.motionId??clip.id}@before`,extras:{source:clip.sourceAsset}}),beforePath=`runtime/before/${library.id}/${slug(clip.id)}.source.glb`;
  await save(beforePath,beforeBytes,clip.sourceAsset,'Native skeleton re-encoding of original measured pose and reference travel for comparison; baseline scores use immutable source assets.');
  entry.before={...entry.before,asset:characterModels[0]?.path,animation:beforePath,metadata:{ballRadius:clip.metadata.ball?.radius??clip.metadata.ballRadius,ballVisible:clip.metadata.ballVisible}};
  entry.after={...after,duration:native.duration,asset:characterModels[0]?.path,animation:filename,metadata,height:clip.height,idle:idlePath,sha256:hash(bytes),diagnostics:result.diagnostics};
  entry.duration=native.duration;entry.coreRange=metadata.coreRange;entry.status='repaired';
  repaired.set(clip.id,{entry,clip,frames:native.frames,metadata,idleFrames,result});entries.push(entry);touched++;
  if(touched%15===0)console.log(library.id,`${touched} baked`,clip.id,after.score);
 }
 // Re-author explicit left/right action pairs by reflecting the solved left
 // choreography, including the ball and contacts, on the identical bind rig.
 for(const [id,left] of repaired){
  if(!id.includes('_left'))continue;const right=repaired.get(id.replace('_left','_right'));if(!right)continue;
  const mirrored=library.sport==='tennis'?mirrorLowerBodyResult({result:left.result,targetResult:right.result,targetClip:right.clip}):mirrorResult({result:left.result,targetClip:right.clip});
  const baked=bakeResult(mirrored,right.clip,right.idleFrames);
  right.result=mirrored;right.frames=baked.native.frames;right.metadata=baked.metadata;
  await save(right.entry.after.animation,baked.bytes,library.sport==='tennis'?[left.clip.sourceAsset,right.clip.sourceAsset]:left.clip.sourceAsset,library.sport==='tennis'?`Lower-body sagittal reflection of ${left.entry.key}; original right-direction upper body retained from ${right.clip.sourceAsset.path}, preserving RightHand racket grip.`:`Exact original v12 sagittal reflection of ${left.entry.key}; independent path, event order and contact constraints reflected together.`);
  Object.assign(right.entry.after,baked.after,{metadata:baked.metadata,duration:baked.native.duration,sha256:hash(baked.bytes),diagnostics:mirrored.diagnostics,reflectedFrom:left.entry.key});
  right.entry.duration=baked.native.duration;right.entry.coreRange=baked.metadata.coreRange;
 }
 // Mirrored pairs are measured against the exported counterpart, never stale source poses.
 for(const [id,item] of repaired){const mirrorId=id.includes('_left')?id.replace('_left','_right'):id.includes('_right')?id.replace('_right','_left'):null;
  const counterpart=repaired.get(mirrorId),originalMirror=library.clips.find(c=>c.id===mirrorId),mirror=counterpart?.frames??originalMirror?.frames;
  if(mirror)item.metadata.mirrorCoreRange=counterpart?.metadata.coreRange??{start:0,end:originalMirror.duration,duration:originalMirror.duration};
  Object.assign(item.entry.after,assess(item.clip,item.frames,item.metadata,item.idleFrames,mirror));
  const bad=Object.entries(item.entry.after.metrics).filter(([,m])=>m.status==='red'||m.status==='insufficient-data');
  if(bad.length||item.entry.after.score<80){item.entry.status='blocked';item.entry.reason=bad.map(([k,m])=>`${k}: ${m.status}${m.reason?` (${m.reason})`:''}`).join('; ')||'Native candidate score remains below 80.';}
 }
 const local=entries.filter(e=>e.library===library.id),afterClips=local.map(e=>e.after),accepted=local.filter(e=>e.status!=='blocked');
 const row={id:library.id,label:library.id,count:local.length,before:library.summary,after:summarize(afterClips),accepted:accepted.length?summarize(accepted.map(e=>e.after)):null,blocked:local.filter(e=>e.status==='blocked').length};libraryRows.push(row);
 const ownProvenance=Object.fromEntries(Object.entries(provenance).filter(([p])=>p.startsWith(`runtime/${library.id}/`)||p.startsWith(`runtime/before/${library.id}/`)||p.startsWith(`runtime/idles/${library.id}--`)));
 await writeFile(path.join(checkpointRoot,`${library.id}.json`),JSON.stringify({library:row,clips:local,provenance:ownProvenance})+'\n');
 console.log('DONE',library.id,JSON.stringify(row));
}
// Merge per-library checkpoints: separate processes can build different libraries safely.
const allEntries=[],allLibraries=[],allProvenance={};
for(const l of baseline.libraries){try{const data=JSON.parse(await readFile(path.join(checkpointRoot,`${l.id}.json`)));allEntries.push(...data.clips);allLibraries.push(data.library);Object.assign(allProvenance,Object.fromEntries(Object.entries(data.provenance).filter(([p])=>p.startsWith(`runtime/${l.id}/`)||p.startsWith(`runtime/before/${l.id}/`)||p.startsWith(`runtime/idles/${l.id}--`))));}catch(e){if(e.code!=='ENOENT')throw e;}}
const blocklist={version:'motion-fix-v12',policy:'No source clips deleted. Blocked candidates are review-only and must not be integrated.',clips:allEntries.filter(e=>e.status==='blocked').map(e=>({key:e.key,library:e.library,id:e.id,reason:e.reason,before:e.before.score,after:e.after.score,animation:e.after.animation}))};
const manifest={schemaVersion:1,version:'motion-fix-v12',generatedAt:new Date().toISOString(),fps:60,metricDefinitions:METRICS,libraries:allLibraries,clips:allEntries,limitations:['Scores are the unchanged motion-qa-v1 diagnostic heuristic; no claim of human perceptual quality.','Blocked clips are retained for comparison and excluded from integration; whole-library statistics include every candidate.','Mesh shoe surfaces are not collision-audited; sole probes and joints are measured.','Core action path and event order are preserved inside appended idle handles; coreRange and timeScale declare any bounded slowdown (maximum 2.5x). Gait and body speed are measured on the core with original loop semantics.']};
await writeFile(path.join(base,'manifest.json'),JSON.stringify(manifest)+'\n');
await writeFile(path.join(base,'blocklist.json'),JSON.stringify(blocklist,null,2)+'\n');
await writeFile(path.join(base,'data/provenance.json'),JSON.stringify(allProvenance,null,2)+'\n');
console.log('MANIFEST',allEntries.length,'clips',blocklist.clips.length,'blocked');
