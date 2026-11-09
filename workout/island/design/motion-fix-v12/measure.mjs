/** Original CC0 v12 measurement harness; preserves motion-qa-v1 thresholds and weights exactly. */
import {writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadAll,base} from './load-sources.mjs';
import {analyzeClip,METRICS} from './qa/metrics.mjs';
export {analyzeClip,METRICS};
const r=x=>Math.round(x*100)/100;
export function idleFor(library,clip){
 const idles=library.idleClips??library.clips.filter(c=>/idle|ready|stance/.test(c.id));
 const role=clip.role??clip.metadata?.role;
 const compatible=c=>(c.role??c.metadata?.role)===role&&(c.profile??c.metadata?.profile??'')===(clip.profile??clip.metadata?.profile??'')&&(library.idleClips||((c.metadata?.sourceLibrary??'')===(clip.metadata?.sourceLibrary??'')));
 return idles.find(c=>compatible(c)&&c!==clip)??idles.find(compatible);
}
export function measureLibraries(libraries){
 for(const library of libraries){
  for(const clip of library.clips){
   const idle=idleFor(library,clip),mirrorId=clip.id.includes('_left')?clip.id.replace('_left','_right'):clip.id.includes('_right')?clip.id.replace('_right','_left'):null;
   const mirror=mirrorId?library.clips.find(c=>c.id===mirrorId):null;
   const meta={...clip.metadata};if(mirror)meta.mirrorFrames=mirror.frames;
   Object.assign(clip,analyzeClip({frames:clip.frames,duration:clip.duration,height:clip.height,metadata:meta,idleFrames:idle?.frames,clipId:clip.id,sport:library.sport}));
   clip.idleReference=idle?`${idle.library??library.id}/${idle.id}`:null;
  }
  library.summary=summarize(library.clips);
 }
 return libraries;
}
export function summarize(clips){return {count:clips.length,average:r(clips.reduce((a,c)=>a+c.score,0)/clips.length),min:Math.min(...clips.map(c=>c.score)),max:Math.max(...clips.map(c=>c.score)),below80:clips.filter(c=>c.score<80).length,redMetrics:clips.reduce((a,c)=>a+Object.values(c.metrics).filter(m=>m.status==='red').length,0),redClips:clips.filter(c=>Object.values(c.metrics).some(m=>m.status==='red')).length,yellowClips:clips.filter(c=>!Object.values(c.metrics).some(m=>m.status==='red')&&Object.values(c.metrics).some(m=>m.status==='yellow')).length,unknownMetrics:clips.reduce((a,c)=>a+Object.values(c.metrics).filter(m=>m.status==='insufficient-data').length,0)};}
export function compact(libraries){return {schemaVersion:1,generatedAt:new Date().toISOString(),fps:60,metricDefinitions:METRICS,libraries:libraries.map(({idleClips,...l})=>({...l,clips:l.clips.map(({frames,metadata,...c})=>({...c,metadata:Object.fromEntries(Object.entries(metadata).filter(([k])=>!['ball','travel','referenceRootMotion','mirrorFrames'].includes(k)))}))}))};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const libraries=measureLibraries(await loadAll());
 await mkdir(path.join(base,'data'),{recursive:true});await writeFile(path.join(base,'data/before.json'),JSON.stringify(compact(libraries))+'\n');
 await mkdir('/tmp/motion-fix-baseline',{recursive:true});
 for(const library of libraries){await writeFile(`/tmp/motion-fix-baseline/${library.id}.json.gz`,gzipSync(JSON.stringify(library)));console.log(library.id,JSON.stringify(library.summary));}
}
