// SPDX-License-Identifier: CC0-1.0
// Input adapter for the immutable motion-qa-v1 mathematics and GLB sampler.
// No scores, formulas, thresholds, clip frames or probe observations are altered.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as T from '../../../vendor/three.module.js';
const BASE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),REPO=path.resolve(BASE,'../../../..');
const COMMIT='5eb4f093bc22523ee417a7f2345c3b813bffba24',PREFIX='workout/island/design/motion-qa-v1/';
const temp=process.env.ALPINE_TRICKS_QA_DIR??'/tmp/alpine-tricks-pinned-qa',qaRoot=path.join(temp,PREFIX);
const hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(qaRoot,{recursive:true});
try{execFileSync('git',['cat-file','-e',COMMIT],{cwd:REPO,stdio:'pipe'});}catch{execFileSync('git',['fetch','--depth=1','--filter=blob:none','--no-tags','origin',COMMIT],{cwd:REPO,stdio:'inherit'});}
const provenance=[];
for(const name of ['run.mjs','sources.mjs','sources.json','metrics.mjs','glb.mjs','report.mjs','sheets.mjs','licenses.mjs','style.css','preview.mjs']){
 const bytes=execFileSync('git',['show',`${COMMIT}:${PREFIX}${name}`],{cwd:REPO,maxBuffer:4*1024*1024});
 await fs.writeFile(path.join(qaRoot,name),bytes);provenance.push({path:PREFIX+name,commit:COMMIT,sha256:hash(bytes),bytes:bytes.length});
}
try{await fs.symlink(path.join(REPO,'workout/island/design/soccer-motion-v8'),path.join(temp,'workout/island/design/soccer-motion-v8'),'dir');}catch(e){if(e.code!=='EEXIST')throw e;}
const {sampleGLB}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs'))),{analyzeClip,METRICS}=await import(pathToFileURL(path.join(qaRoot,'metrics.mjs')));
const {renderReport,renderClip}=await import(pathToFileURL(path.join(qaRoot,'report.mjs'))),{sheetSvg}=await import(pathToFileURL(path.join(qaRoot,'sheets.mjs')));
const catalog=JSON.parse(await fs.readFile(path.join(BASE,'catalog.json'),'utf8')),bytes=await fs.readFile(path.join(BASE,catalog.asset));
const rotate=(p,q)=>new T.Vector3().fromArray(p).applyQuaternion(q).toArray();
const point=(frame,bone,p)=>rotate(p,new T.Quaternion().fromArray(frame.rotations[bone])).map((v,i)=>v+frame.joints[bone][i]);
const native=new Map();
for(const entry of catalog.clips){
 const extraTimes=[...(entry.events??[]).map(e=>e.time??e.atSeconds),...(entry.contacts??[]).flatMap(c=>[c.start,c.end])];
 const sampled=sampleGLB(bytes,{animation:entry.id,fps:120,extraTimes});
 for(const f of sampled.frames){
  f.localJoints=structuredClone(f.joints);f.assetRoot=[...f.root];
  f.floorPoints=['LeftFoot','RightFoot'].flatMap(bone=>Object.entries(catalog.contactMarkers[bone]).map(([marker,p])=>({bone:bone+'/'+marker,position:point(f,bone,p)})));
 }
 native.set(entry.id,{entry,...sampled});
}
const ready=native.get('ski_ready');
function idleAtHeading(heading){
 const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),heading);
 return ready.frames.map(f=>({...f,joints:Object.fromEntries(Object.entries(f.joints).map(([n,p])=>[n,rotate(p,q)])),localJoints:Object.fromEntries(Object.entries(f.localJoints).map(([n,p])=>[n,rotate(p,q)])),rotations:Object.fromEntries(Object.entries(f.rotations).map(([n,r])=>[n,q.clone().multiply(new T.Quaternion().fromArray(r)).toArray()])),root:rotate(f.root,q),assetRoot:rotate(f.assetRoot,q)}));
}
function rootHeading(f){const q=new T.Quaternion().fromArray(f.rotations.Root),v=new T.Vector3(0,0,1).applyQuaternion(q);return Math.atan2(v.x,v.z);}
const clips=[];
for(const {entry,frames,duration,height}of native.values()){
 const metadata={...entry,contacts:[],skiContacts:entry.contacts,ballContacts:[],loop:entry.loop,ballVisible:false,locomotion:false,symmetryMode:'structural',checkHingeDirection:false,
  supports:entry.contactIntervals.flatMap(w=>['LeftFoot','RightFoot'].map(bone=>({bone,start:w.start,end:w.end,local:catalog.contactMarkers[bone].binding}))),
  floorProbeKind:'Final GLB FK of declared ski binding/toe/heel running-surface points plus all canonical joint centres; full weighted mesh is audited separately in qa.json.',
  coordinateSpace:'Native final GLB actor-local presentation, including intentional ski rotation/travel. Downhill host translation remains external.',
  idleReference:'Actual ski_ready samples transformed by native entry/exit Root yaw; no clip samples changed. Explicit contextual references account for a switch landing.',
  sourceAsset:catalog.asset};
 const headingEntry=rootHeading(frames[0]),headingExit=rootHeading(frames.at(-1));
 const contextual={entry:idleAtHeading(headingEntry),exit:idleAtHeading(headingExit)};
 const result=analyzeClip({frames,duration,height,metadata,idleFrames:contextual,clipId:entry.id,sport:'alpine'});
 const forward=analyzeClip({frames,duration,height,metadata,idleFrames:ready.frames,clipId:entry.id,sport:'alpine'});
 const name='alpine-tricks-v1--'+entry.id;
 clips.push({id:entry.id,motionId:entry.id,label:entry.label,duration,height,metadata,frames,...result,
  nativeForwardIdleDiagnostic:{score:forward.score,coverage:forward.coverage,continuity:forward.metrics.continuity},
  idleContext:{source:'ski_ready',entryRootYawRadians:headingEntry,exitRootYawRadians:headingExit,translationAlignment:'Unmodified analyzer aligns horizontal Root translation.'},
  library:'alpine-tricks-v1',htmlPath:`clips/${name}.html`,jsonPath:`clips/${name}.json`,sheetPath:`sheets/${name}.svg`,assetPrefix:'../',sheetHref:`../sheets/${name}.svg`,jsonHref:name+'.json'});
}
const output=path.join(BASE,'verification/motion-qa');
await fs.mkdir(path.join(output,'clips'),{recursive:true});await fs.mkdir(path.join(output,'sheets'),{recursive:true});
const source={ref:'codex/alpine-tricks-v1',commit:catalog.baseCommit,path:'workout/island/design/alpine-tricks-v1',sha256:hash(bytes)};
const summary={count:clips.length,average:clips.reduce((s,c)=>s+c.score,0)/clips.length,min:Math.min(...clips.map(c=>c.score)),max:Math.max(...clips.map(c=>c.score)),redMetrics:clips.reduce((s,c)=>s+Object.values(c.metrics).filter(m=>m.status==='red').length,0),unknownMetrics:clips.reduce((s,c)=>s+Object.values(c.metrics).filter(m=>m.status==='insufficient-data').length,0)};
const library={id:'alpine-tricks-v1',sport:'alpine',version:1,source,sources:[source],clips,summary};
for(const clip of clips){
 const short=Array.from({length:8},(_,i)=>clip.frames.reduce((a,f)=>Math.abs(f.t-clip.duration*i/7)<Math.abs(a.t-clip.duration*i/7)?f:a)).map(({t,joints,root,ball})=>({t,joints,root,ball}));
 await fs.writeFile(path.join(output,clip.jsonPath),JSON.stringify({...clip,frames:short})+'\n');
 await fs.writeFile(path.join(output,clip.sheetPath),sheetSvg(clip,clip.frames));
 await fs.writeFile(path.join(output,clip.htmlPath),renderClip(clip,library).replaceAll('href="../preview.html?clip=alpine-tricks-v1--','href="../../../preview.html?clip='));
}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),fps:120,metricDefinitions:METRICS,qaCommit:COMMIT,qaFiles:provenance,assetSha256:hash(bytes),adapter:'Unmodified pinned sampleGLB and analyzeClip; exact native animation selected by name. Adapter supplies actual rig-specific ski markers, explicit supports, no-ball/non-walking applicability, and actual ski_ready reference transformed by entry/exit host yaw. Original forward-idle diagnostics retained for every row.',
 limitations:['This is the original weighted reproducible diagnostic heuristic, not perceptual or medical certification.','Root yaw contextual reference accounts for switch landings; native clip frames are not rotated or retimed.','The original footSliding metric measures total binding drift within a support interval; independent qa.json measures all three running-surface markers against declared intentional ski paths.','Ground contact geometry, C1 endpoints and shared tangents are independently audited on decoded final GLB in qa.json.'],libraries:[{...library,clips:clips.map(({frames,...c})=>c)}],comparisons:[],elapsedSeconds:0,assetPrefix:'./',pass:clips.every(c=>c.score>88&&c.coverage===1&&!Object.values(c.metrics).some(m=>m.status==='red'))};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(output,'report.html'),renderReport(report).replaceAll('href="./preview.html"','href="../../preview.html"').replaceAll('href="./README.md"','href="../../README.md"').replaceAll('href="./REPORT.md"','href="../../REPORT.md"').replaceAll('href="./LICENSES.md"','href="../../LICENSES.md"'));
for(const name of ['style.css','preview.mjs','sheets.mjs'])await fs.writeFile(path.join(output,name),await fs.readFile(path.join(qaRoot,name)));
await fs.writeFile(path.join(BASE,'verification/motion-qa-provenance.json'),JSON.stringify({qaCommit:COMMIT,qaFiles:provenance,assetSha256:hash(bytes),adapter:report.adapter,minimumScore:summary.min,pass:report.pass},null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,...summary,failures:clips.filter(c=>c.score<=88||c.coverage<1||Object.values(c.metrics).some(m=>m.status==='red')).map(c=>({id:c.id,score:c.score,reasons:c.reasons}))},null,2));
if(!report.pass)process.exitCode=1;
