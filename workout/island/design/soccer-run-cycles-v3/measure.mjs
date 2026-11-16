// SPDX-License-Identifier: CC0-1.0
// Immutable motion-qa-v1 evaluator; only the input-library inventory is adapted.
import {readFile,writeFile,mkdir,mkdtemp,symlink} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {bones} from './source/rig.mjs';

const base=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(base,'../../../..');
const pinned='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const qaPath='workout/island/design/motion-qa-v1',output=path.join(base,'verification');
const workspace=await mkdtemp(path.join(tmpdir(),'soccer-run-cycles-qa-')),qaRoot=path.join(workspace,qaPath);
await mkdir(qaRoot,{recursive:true});
try {execFileSync('git',['cat-file','-e',`${pinned}^{commit}`],{cwd:repo,stdio:'pipe'});}
catch {execFileSync('git',['fetch','--depth=1','--filter=blob:none','--no-tags','origin',pinned],{cwd:repo,stdio:'inherit'});}
const hash=b=>createHash('sha256').update(b).digest('hex');
const qaFiles=[];
for(const file of ['run.mjs','sources.mjs','sources.json','metrics.mjs','glb.mjs','report.mjs','sheets.mjs','licenses.mjs']){
 const bytes=execFileSync('git',['show',`${pinned}:${qaPath}/${file}`],{cwd:repo,maxBuffer:4*1024*1024});
 await writeFile(path.join(qaRoot,file),bytes);
 qaFiles.push({path:`${qaPath}/${file}`,commit:pinned,bytes:bytes.length,sha256:hash(bytes)});
}
await mkdir(path.join(qaRoot,'../soccer-motion-v8/runtime'),{recursive:true});
await symlink(path.join(repo,'workout/island/design/soccer-motion-v8/runtime/vendor'),path.join(qaRoot,'../soccer-motion-v8/runtime/vendor'),'dir');
await mkdir(output,{recursive:true});
// The unchanged report renderer links its controls one directory above --out.
// Copy pinned presentation files there; the viewer's two local URLs are adapted.
for(const file of ['style.css','preview.mjs','preview.html','sheets.mjs']){
 const sourceBytes=execFileSync('git',['show',`${pinned}:${qaPath}/${file}`],{cwd:repo,maxBuffer:4*1024*1024});
 const bytes=file==='preview.mjs'?Buffer.from(sourceBytes.toString().replace("'./output/report.json'","'./qa/report.json'").replace("'../soccer-motion-v8/runtime/vendor/three.module.js'","'../../soccer-motion-v8/runtime/vendor/three.module.js'")):file==='preview.html'?Buffer.from(sourceBytes.toString().replaceAll('href="./output/report.html"','href="./qa/report.html"').replaceAll('href="./REPORT.md"','href="../REPORT.md"').replaceAll('href="./README.md"','href="../README.md"')):sourceBytes;
 await writeFile(path.join(output,file),bytes);
 if(!qaFiles.some(r=>r.path===`${qaPath}/${file}`))qaFiles.push({path:`${qaPath}/${file}`,commit:pinned,bytes:sourceBytes.length,sha256:hash(sourceBytes),deliveredSha256:hash(bytes),purpose:/^preview\./.test(file)?'QA report presentation; only local report, vendor and documentation URLs adapted':'Unchanged QA report presentation'});
}
const env={...process.env,SOCCER_RUN_CYCLES_QA_ROOT:qaRoot,SOCCER_RUN_CYCLES_SOURCE_COMMIT:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()};
const command=['--import',pathToFileURL(path.join(base,'qa-register.mjs')).href,path.join(qaRoot,'run.mjs'),'--library','soccer-run-cycles-v3','--fps','120','--out',path.join(output,'qa')];
const result=spawnSync(process.execPath,command,{cwd:repo,env,stdio:'inherit'});
if(result.status!==0)throw Error(`Pinned QA CLI failed with exit ${result.status}`);
process.env.SOCCER_RUN_CYCLES_QA_ROOT=qaRoot;
const {loadMotionAssets}=await import('./qa-sources.mjs');
const {parseGLB,readAccessor}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs')).href);
const {analyzeClip}=await import(pathToFileURL(path.join(qaRoot,'metrics.mjs')).href);
const {catalog,clips}=await loadMotionAssets({fps:120});
const motionBytes=await readFile(path.join(base,'runtime/motions.json')),motions=JSON.parse(motionBytes);
const report=JSON.parse(await readFile(path.join(output,'qa/report.json'),'utf8'));
const qaClips=report.libraries[0].clips;
// Fix documentation destinations for the nested package. This touches hrefs
// only; all measurements and numeric/per-clip JSON remain original CLI output.
const presentationChanges=[];
for(const relativePath of ['report.html',...qaClips.map(c=>c.htmlPath)]){
 const file=path.join(output,'qa',relativePath),before=await readFile(file,'utf8');
 let after=before;
 for(const [name,target]of [['README.md','REPORT.md'],['REPORT.md','REPORT.md'],['LICENSES.md','LICENSES.md']]){
  const oldPrefix=relativePath==='report.html'?'../':'../../';
  const href=path.relative(path.dirname(file),path.join(base,target)).split(path.sep).join('/');
  after=after.replaceAll(`href="${oldPrefix}${name}"`,`href="${href}"`);
 }
 if(after!==before){await writeFile(file,after);presentationChanges.push({path:`qa/${relativePath}`,originalSha256:hash(Buffer.from(before)),deliveredSha256:hash(Buffer.from(after)),changes:'Documentation href destinations only'});}
}
await writeFile(path.join(output,'qa-presentation.json'),JSON.stringify({schemaVersion:1,numericReportsUnchanged:true,files:presentationChanges},null,2)+'\n');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const nearest=(frames,t)=>frames.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a);
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const rotate=(v,q)=>{const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];};
const point=(frame,bone,local=[0,-.08,0])=>frame.joints[bone].map((v,i)=>v+rotate(local,frame.rotations[bone])[i]);
const correlation=(a,b)=>{const mean=x=>x.reduce((s,v)=>s+v,0)/x.length,am=mean(a),bm=mean(b);let num=0,aa=0,bb=0;for(let i=0;i<a.length;i++){num+=(a[i]-am)*(b[i]-bm);aa+=(a[i]-am)**2;bb+=(b[i]-bm)**2;}return num/Math.sqrt(aa*bb);};
function armMeasures(frames){
 const rows=frames.map(f=>{
  const out={};for(const side of ['Left','Right']){
   const p=f.localJoints??f.joints,upper=sub(p[side+'ForeArm'],p[side+'Arm']),fore=sub(p[side+'Hand'],p[side+'ForeArm']),thigh=sub(p[side+'Leg'],p[side+'UpLeg']);
   out[side]={elbow:Math.acos(Math.max(-1,Math.min(1,-dot(upper,fore)/(Math.hypot(...upper)*Math.hypot(...fore)))))*180/Math.PI,abduction:Math.atan2(upper[0]*(side==='Left'?1:-1),-upper[1])*180/Math.PI,swing:Math.atan2(upper[2],-upper[1]),leg:Math.atan2(thigh[2],-thigh[1])};
  }return out;
 });
 const elbows=rows.flatMap(r=>[r.Left.elbow,r.Right.elbow]);
 return {elbowMeanDegrees:elbows.reduce((s,v)=>s+v,0)/elbows.length,elbowMinDegrees:Math.min(...elbows),elbowMaxDegrees:Math.max(...elbows),maxAbductionDegrees:Math.max(...rows.flatMap(r=>[r.Left.abduction,r.Right.abduction])),armOppositionCorrelation:correlation(rows.map(r=>r.Left.swing),rows.map(r=>r.Right.swing)),leftArmLegCorrelation:correlation(rows.map(r=>r.Left.swing),rows.map(r=>r.Left.leg)),rightArmLegCorrelation:correlation(rows.map(r=>r.Right.swing),rows.map(r=>r.Right.leg))};
}
const requiredIds=['jog','run','sprint','referee_run','keeper_ready_side_steps','keeper_catch_chest','keeper_catch_head'];
const speedTargets={jog:2.6,run:4.5,sprint:7.2,referee_run:5};
const checks=[];
for(const clip of clips){
 const entry=catalog.clips.find(c=>c.id===clip.id),authored=motions.clips.find(c=>c.id===clip.id),qa=qaClips.find(c=>c.id===clip.id);
 const bytes=await readFile(path.join(base,entry.asset)),native=parseGLB(bytes),rate=entry.nativeRate;
 const timeArrays=native.json.animations.flatMap(a=>a.samplers.map(s=>Array.from(readAccessor(native,s.input))));
 const grid=timeArrays.every(times=>times.length===entry.frameCount&&times.every((t,i)=>Math.abs(t-i/rate)<1e-6));
 let maxQuaternionError=0,maxHipsError=0;
 for(const f of authored.frames){const actual=nearest(clip.frames,f.time);maxHipsError=Math.max(maxHipsError,distance(actual.localJoints.Hips,f.hips));for(const {name}of bones){const q=f.rotations[name],n=Math.hypot(...q),expected=q.map(v=>v/n);maxQuaternionError=Math.max(maxQuaternionError,Math.min(distance(actual.localRotations[name],expected),distance(actual.localRotations[name],expected.map(v=>-v))));}}
 const supportWindows=clip.metadata.supports.map(w=>{const frames=clip.frames.filter(f=>f.t>=w.start-1e-6&&f.t<=w.end+1e-6),anchor=point(nearest(clip.frames,w.start),w.bone,w.local);return {...w,samples:frames.length,maxSpatialDriftMeters:Math.max(0,...frames.map(f=>distance(point(f,w.bone,w.local),anchor))),maxFloorDistanceMeters:Math.max(0,...frames.map(f=>Math.abs(point(f,w.bone,w.local)[1])))};});
 const nativeCanonical=bones.every(reference=>{const index=native.json.nodes.findIndex(n=>n.name===reference.name),node=native.json.nodes[index],parent=native.json.nodes.find(n=>n.children?.includes(index));return node&&(parent?.name??null)===reference.parent&&distance(node.translation??[0,0,0],reference.rest)<1e-8;});
 const joints=native.json.skins?.flatMap(s=>s.joints)??[],uniqueJoints=[...new Set(joints)];
 const stillRoot=clip.frames.every(f=>distance(f.assetRoot,[0,0,0])<1e-6&&Math.min(distance(f.localRotations.Root,[0,0,0,1]),distance(f.localRotations.Root,[0,0,0,-1]))<1e-6);
 let travelled=0;for(let i=1;i<clip.frames.length;i++)travelled+=distance(clip.frames[i].referenceRoot,clip.frames[i-1].referenceRoot);const actualSpeed=travelled/clip.duration;
 const arms=armMeasures(clip.frames),gait=Object.hasOwn(speedTargets,clip.id);
 const assertions={scoreAbove88:qa?.score>88,completeApplicableMetrics:qa?.coverage===1,sourceMotionHash:hash(motionBytes)===catalog.sourceMotionSha256,assetHashAndBytes:hash(bytes)===entry.sha256&&bytes.length===entry.bytes,nativePoseMatchesSource:maxQuaternionError<1e-6&&maxHipsError<1e-6,canonical18:nativeCanonical&&uniqueJoints.length===18&&Object.keys(clip.frames[0].localJoints).length===18,native120Hz:rate===120&&grid&&entry.frameCount===Math.round(clip.duration*rate)+1,rootStationary:stillRoot&&entry.rootMotion===false,noDraco:!JSON.stringify(native.json).includes('KHR_draco_mesh_compression'),noMeshopt:!JSON.stringify(native.json).includes('EXT_meshopt_compression'),stanceWindowsDeclared:supportWindows.length>0&&supportWindows.every(w=>w.samples>=2&&w.end>w.start),stanceFootSlipUnder2cm:supportWindows.every(w=>w.maxSpatialDriftMeters<.02),correctWorldSpeed:!gait||Math.abs(actualSpeed-speedTargets[clip.id])<1e-5&&Math.abs(entry.speedMps-speedTargets[clip.id])<1e-8,elbows90:!gait||Math.max(Math.abs(arms.elbowMinDegrees-90),Math.abs(arms.elbowMaxDegrees-90))<5,opposedArms:!gait||arms.armOppositionCorrelation<-.9&&arms.leftArmLegCorrelation<-.15&&arms.rightArmLegCorrelation<-.15,keeperReadyArms30:clip.id!=='keeper_ready_side_steps'||arms.maxAbductionDegrees<=30};
 checks.push({id:clip.id,score:qa?.score,coverage:qa?.coverage,assertions,nativePoseError:{maxQuaternionError,maxHipsErrorMeters:maxHipsError},arms,actualWorldPathSpeedMps:actualSpeed,maxStanceDriftMeters:Math.max(0,...supportWindows.map(w=>w.maxSpatialDriftMeters)),supportWindows,qaMetrics:qa?.metrics});
}
const libraryAssertions={allRequiredClips:requiredIds.every(id=>checks.some(c=>c.id===id)),uniqueClipIds:new Set(checks.map(c=>c.id)).size===checks.length};
const referee=catalog.clips.find(c=>c.id==='referee_run');
const refereeRates=[];
for(const speedMps of [4,5,6]){
 const rate=speedMps/5,{clips:rateClips}=await loadMotionAssets({fps:120/rate});
 const original=rateClips.find(c=>c.id==='referee_run');if(!original)continue;
 const frames=original.frames.map(f=>({...f,t:f.t/rate})),duration=original.duration/rate;
 const supports=original.metadata.supports.map(w=>({...w,start:w.start/rate,end:w.end/rate}));
 const metadata={...original.metadata,speed:speedMps,supports,events:original.metadata.events.map(e=>({...e,time:e.time/rate}))};
 const idle=rateClips.find(c=>/idle|ready|stance/.test(c.id)&&c.metadata.role===original.metadata.role);
 const qa=analyzeClip({frames,duration,height:original.height,metadata,idleFrames:idle?.frames,clipId:original.id,sport:'soccer'});
 let travelled=0;for(let i=1;i<frames.length;i++)travelled+=distance(frames[i].referenceRoot,frames[i-1].referenceRoot);
 const windows=supports.map(w=>{const samples=frames.filter(f=>f.t>=w.start-1e-6&&f.t<=w.end+1e-6),anchor=point(nearest(frames,w.start),w.bone,w.local);return {bone:w.bone,start:w.start,end:w.end,samples:samples.length,maxSpatialDriftMeters:Math.max(0,...samples.map(f=>distance(point(f,w.bone,w.local),anchor)))};});
 const slip=Math.max(0,...windows.map(w=>w.maxSpatialDriftMeters)),measuredSpeed=travelled/duration;
 refereeRates.push({speedMps,playbackRate:rate,effectiveDurationSeconds:duration,measurementRate:120,actualWorldPathSpeedMps:measuredSpeed,score:qa.score,coverage:qa.coverage,maxStanceDriftMeters:slip,supportWindows:windows,qaMetrics:qa.metrics,passed:Math.abs(measuredSpeed-speedMps)<1e-5&&slip<.02&&qa.score>88&&qa.coverage===1,method:'Measured time reparameterization: pose, contacts and external trajectory use t*rate together. No spatial scaling.'});
}
libraryAssertions.refereeSpeedRangeMeasured=refereeRates.length===3&&refereeRates.every(r=>r.passed);
const inputPaths=['catalog.json','runtime/motions.json',...catalog.clips.map(c=>c.asset)];
const inputManifest=[];
for(const relativePath of inputPaths){const bytes=await readFile(path.join(base,relativePath));inputManifest.push({path:relativePath,bytes:bytes.length,sha256:hash(bytes)});}
const inputManifestBytes=Buffer.from(JSON.stringify({schemaVersion:1,files:inputManifest},null,2)+'\n');
await writeFile(path.join(output,'input-manifest.json'),inputManifestBytes);
const failures=[...Object.entries(libraryAssertions).filter(([,ok])=>!ok).map(([key])=>`library: ${key}`),...checks.flatMap(c=>Object.entries(c.assertions).filter(([,ok])=>!ok).map(([key])=>`${c.id}: ${key}`))];
const evidence={schemaVersion:1,qaCommit:pinned,qaFiles,qaInvocation:'Unmodified pinned motion-qa-v1/run.mjs --library soccer-run-cycles-v3 --fps 120; only source inventory adapted.',baseCommit:env.SOCCER_RUN_CYCLES_SOURCE_COMMIT,sourceMotionSha256:hash(motionBytes),inputManifestSha256:hash(inputManifestBytes),catalogSha256:inputManifest.find(f=>f.path==='catalog.json').sha256,nativeRate:120,measurementRate:120,coordinateSpace:'Native zero-root GLB plus explicit external actor scenario applied once. Untransformed pose and rotations retained for continuity.',limitations:report.limitations,requiredIds,libraryAssertions,refereeRates,clips:checks.length,minimumScore:Math.min(...checks.map(c=>c.score)),redMetrics:qaClips.reduce((s,c)=>s+Object.values(c.metrics).filter(m=>m.status==='red').length,0),maxStanceDriftMeters:Math.max(...checks.map(c=>c.maxStanceDriftMeters)),checks,failures,passed:failures.length===0};
await writeFile(path.join(output,'requirements.json'),JSON.stringify(evidence,null,2)+'\n');
await writeFile(path.join(output,'qa-provenance.json'),JSON.stringify({qaCommit:pinned,qaFiles,sourceAdapterSha256:hash(await readFile(path.join(base,'qa-sources.mjs'))),registerHookSha256:hash(await readFile(path.join(base,'qa-register.mjs')))},null,2)+'\n');
console.log(JSON.stringify({qaRoot,clips:evidence.clips,minimumScore:evidence.minimumScore,redMetrics:evidence.redMetrics,maxStanceDriftMeters:evidence.maxStanceDriftMeters,passed:evidence.passed,failures},null,2));
if(!evidence.passed)process.exitCode=1;
