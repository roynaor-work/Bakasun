// SPDX-License-Identifier: CC0-1.0
// Reproduce stock motion-qa-v1, then audit synchronized contact and support FK.
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {assetRoot,loadAssets,point} from './qa-sources.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(assetRoot,'../../../..');
const PIN='5eb4f093bc22523ee417a7f2345c3b813bffba24',TOOL='workout/island/design/motion-qa-v1';
const MODULES=['run.mjs','sources.mjs','sources.json','glb.mjs','metrics.mjs','report.mjs','sheets.mjs','licenses.mjs'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const near=(frames,t)=>frames.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a);
const windowFrames=(frames,w)=>frames.filter(f=>f.t>=w.start-1e-6&&f.t<=w.end+1e-6);
const out=path.join(assetRoot,'verification');
await mkdir(out,{recursive:true});
const temporary=await mkdtemp(path.join(tmpdir(),'soccer-celebrations-qa-'));
try{
  const qaRoot=path.join(temporary,TOOL);await mkdir(qaRoot,{recursive:true});
  const pinned=JSON.parse(await readFile(path.join(here,'upstream-qa/provenance.json'),'utf8'));
  if(pinned.upstreamCommit!==PIN)throw Error('Unexpected upstream QA provenance commit');
  const files=[];
  for(const file of MODULES){
    const bytes=await readFile(path.join(here,'upstream-qa',file));
    if(hash(bytes)!==pinned.files.find(f=>f.file===`${TOOL}/${file}`)?.sha256)throw Error(`Pinned QA source mismatch: ${file}`);
    await writeFile(path.join(qaRoot,file),bytes);files.push({file:`${TOOL}/${file}`,sha256:hash(bytes),bytes:bytes.length});
  }
  const vendor='workout/island/design/soccer-motion-v8/runtime/vendor/three.module.js';
  const vendorDestination=path.join(temporary,vendor);await mkdir(path.dirname(vendorDestination),{recursive:true});
  await copyFile(path.join(assetRoot,'vendor/three.module.js'),vendorDestination);
  let commit='offline-folder';try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:assetRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
  process.env.CELEBRATION_QA_ROOT=qaRoot;process.env.CELEBRATION_ASSET_COMMIT=commit;
  const args=['--loader',path.join(here,'qa-loader.mjs'),path.join(qaRoot,'run.mjs'),'--library','soccer-celebrations-v1','--fps','120','--out',path.join(out,'qa')];
  const result=spawnSync(process.execPath,args,{cwd:repo,env:process.env,encoding:'utf8',maxBuffer:4*1024*1024});
  if(result.status!==0)throw Error(`Pinned QA CLI failed: ${result.stderr}\n${result.stdout}`);
  for(const file of files)if(hash(await readFile(path.join(temporary,file.file)))!==file.sha256)throw Error(`Upstream mutation: ${file.file}`);
  const {readAccessor}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs')).href);
  const {catalog,skeleton,entries,clips,referenceSha256}=await loadAssets({fps:120});
  const report=JSON.parse(await readFile(path.join(out,'qa/report.json'),'utf8'));
  const results=report.libraries[0].clips.filter(c=>!c.id.startsWith('idle_reference/'));
  const metricsById=new Map(results.map(c=>[c.id,c]));
  const checks=[],failures=[];
  for(const {entry,glb,bytes,actors,props} of entries){
    const d=glb.json,animation=d.animations[0],parents=new Map();
    d.nodes.forEach((n,i)=>(n.children??[]).forEach(child=>parents.set(child,i)));
    const tracks=animation.samplers.map(s=>Array.from(readAccessor(glb,s.input)));
    const native30Hz=tracks.every(times=>times.length===entry.frameCount&&times.every((t,i)=>Math.abs(t-i/30)<1e-6));
    const actorChecks=[];
    for(const actor of entry.actors){
      const clip=actors.get(actor.id),qa=metricsById.get(clip.id),prefix=actor.prefix??`${actor.id}_`;
      const exactCanonical=skeleton.every(b=>{
        const index=d.nodes.findIndex(n=>n.name===`${prefix}${b.name}`),n=d.nodes[index];
        if(!n)return false;
        const parent=parents.has(index)?d.nodes[parents.get(index)].name:null;
        return (!b.parent||parent===`${prefix}${b.parent}`)&&distance(n.translation??[0,0,0],b.restTranslationMeters)<1e-7;
      });
      const supports=(entry.supports??[]).filter(w=>w.actor===actor.id).map(w=>{
        const selected=windowFrames(clip.frames,w);if(!selected.length)throw Error(`${clip.id}: empty support window`);
        const local=w.local??(['LeftFoot','RightFoot'].includes(w.bone)?[0,-.08,0]:[0,0,0]);
        const p=selected.map(f=>point(f,w.bone,local)),anchor=w.anchor??p[0];
        return {...w,local,samples:selected.length,
          maxDrift3DMeters:Math.max(...p.map(v=>distance(v,p[0]))),
          maxHorizontalDriftMeters:Math.max(...p.map(v=>horizontal(v,p[0]))),
          maxAnchorErrorMeters:Math.max(...p.map(v=>distance(v,anchor))),
          horizontalTravelMeters:p.slice(1).reduce((s,v,i)=>s+horizontal(v,p[i]),0),
          maxGroundErrorMeters:Math.max(...p.map(v=>Math.abs(v[1]))),
          minY:Math.min(...p.map(v=>v[1])),maxY:Math.max(...p.map(v=>v[1])),
          pass:w.mode==='slide'||Math.max(...p.map(v=>distance(v,anchor)))<=.02};
      });
      const sourceSampleHashMatches=qa.source.sha256===hash(bytes);
      actorChecks.push({actor:actor.id,role:actor.role,score:qa.score,coverage:qa.coverage,sourceSampleHashMatches,
        redMetrics:Object.entries(qa.metrics).filter(([,m])=>m.status==='red').map(([k])=>k),
        exactCanonical,native30Hz,supports,
        pass:exactCanonical&&native30Hz&&sourceSampleHashMatches&&qa.score>88&&qa.coverage===1&&supports.every(w=>w.pass)});
    }
    const contacts=(entry.contacts??[]).map((c,index)=>{
      const a=c.a.node?props.get(c.a.node):actors.get(c.a.actor??c.actors?.[0]),b=c.b.node?props.get(c.b.node):actors.get(c.b.actor??c.actors?.[1]);
      if(!a||!b)throw Error(`${entry.id}: contact ${index} references missing actors`);
      const selected=windowFrames(a.frames,c);if(!selected.length)throw Error(`${entry.id}: empty contact interval`);
      let maxDistance=0,worst=null,sum=0;
      for(const frame of selected){const other=near(b.frames,frame.t);if(Math.abs(frame.t-other.t)>1e-6)throw Error('Actor clocks are not synchronized');
        const pa=point(frame,c.a.node?a.bone:c.a.bone,c.a.local),pb=point(other,c.b.node?b.bone:c.b.bone,c.b.local),gap=distance(pa,pb);sum+=gap;
        if(gap>=maxDistance){maxDistance=gap;worst={time:frame.t,a:pa,b:pb};}}
      const limit=Math.min(.03,c.maxDistanceMeters??.02);
      return {...c,index,samples:selected.length,maxGapMeters:maxDistance,meanGapMeters:sum/selected.length,
        toleranceMeters:limit,worst,pass:maxDistance<=limit};
    });
    let slide=null;
    if(entry.slide){
      const declaration=entry.slide,actor=actors.get(declaration.actor),selected=windowFrames(actor.frames,declaration);
      if(!selected.length)throw Error(`${entry.id}: empty intentional slide interval`);
      const bones=declaration.bones.map(bone=>{
        const points=selected.map(f=>point(f,bone,declaration.local??[0,0,0]));
        const travel=points.slice(1).reduce((s,v,i)=>s+horizontal(v,points[i]),0);
        return {bone,samples:points.length,pointKind:declaration.local?'declared bone-local surface point':'skeletal knee center; no invented surface offset',
          start:points[0],end:points.at(-1),horizontalTravelMeters:travel,
          displacementMeters:horizontal(points.at(-1),points[0]),
          minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1])),
          expectedTravelMeters:declaration.expectedTravelMeters,
          travelErrorMeters:Math.abs(travel-declaration.expectedTravelMeters)};
      });
      slide={...declaration,bones,pass:bones.every(b=>b.travelErrorMeters<=.025&&b.minY>=-.01)};
    }
    const noCompression=!(d.extensionsUsed??[]).some(e=>/draco|meshopt|ktx|basisu/i.test(e))&&!(d.extensionsRequired??[]).some(e=>/draco|meshopt|ktx|basisu/i.test(e));
    const embedded=!(d.buffers??[]).some(b=>b.uri)&&!(d.images??[]).some(i=>i.uri&&!i.uri.startsWith('data:'));
    const synchronized=entry.actors.every(a=>Math.abs(actors.get(a.id).duration-entry.duration)<1e-6);
    const catalogHashMatches=entry.sha256===hash(bytes)&&entry.bytes===bytes.length;
    const pass=actorChecks.every(a=>a.pass)&&contacts.every(c=>c.pass)&&(!slide||slide.pass)&&noCompression&&embedded&&synchronized&&catalogHashMatches;
    const check={id:entry.id,asset:entry.asset,sha256:hash(bytes),bytes:bytes.length,duration:entry.duration,
      frameCount:entry.frameCount,actors:actorChecks,contacts,slide,noCompression,embedded,synchronized,catalogHashMatches,pass};
    checks.push(check);if(!pass)failures.push(entry.id);
  }
  // Negative controls exercise the same independent FK measurements; a single
  // perturbed interior frame must be rejected even when all metadata is intact.
  const planted=clips.find(c=>c.metadata.supports.some(w=>w.end-w.start>.1));
  const plant=planted?.metadata.supports.find(w=>w.end-w.start>.1);
  let supportInjectionDetected=false;
  if(plant){const frames=windowFrames(planted.frames,plant),anchor=point(frames[0],plant.bone,plant.local),probe=structuredClone(frames[Math.floor(frames.length/2)]);
    probe.joints[plant.bone][0]+=.10;supportInjectionDetected=distance(point(probe,plant.bone,plant.local),anchor)>.02;}
  const firstContact=checks.flatMap(c=>c.contacts).find(c=>c.samples>0);
  const contactInjectionDetected=!!firstContact&&distance(firstContact.worst.a.map((v,i)=>v+(i===0?.10:0)),firstContact.worst.b)>firstContact.toleranceMeters;
  const negativeControls={supportInjectionDetected,contactInjectionDetected,injectionMeters:.10,pass:supportInjectionDetected&&contactInjectionDetected};
  const evidence={schemaVersion:1,fps:120,nativeHz:30,upstreamCommit:PIN,upstreamUnmodified:true,upstreamFiles:files,
    invocation:'Original motion-qa-v1/run.mjs --library soccer-celebrations-v1 --fps 120; only sources.mjs redirected',
    reference:{file:'source/qa-reference-idle.glb',sha256:referenceSha256,original:'soccer-header-v1/runtime/reference/idle_relaxed.glb',
      adaptation:'A static parent applies each actor initial world Root quaternion to the genuine idle reference. Action samples are untouched.'},
    inputAdapter:{file:'source/qa-sources.mjs',sha256:hash(await readFile(path.join(here,'qa-sources.mjs')))},
    runner:{file:'source/run-qa.mjs',sha256:hash(await readFile(path.join(here,'run-qa.mjs')))},
    loader:{file:'source/qa-loader.mjs',sha256:hash(await readFile(path.join(here,'qa-loader.mjs')))},
    assetsBaseCommit:commit,clipCount:checks.length,actorCount:results.length,
    minimumScore:Math.min(...results.map(c=>c.score)),minimumRequiredExclusive:88,
    meanActorScore:results.reduce((sum,c)=>sum+c.score,0)/results.length,
    redMetrics:results.flatMap(c=>Object.entries(c.metrics).filter(([,m])=>m.status==='red').map(([metric,m])=>({actor:c.id,metric,value:m.value}))),
    minimumCoverage:Math.min(...results.map(c=>c.coverage)),
    maxPlantedFootDriftMeters:Math.max(0,...checks.flatMap(c=>c.actors.flatMap(a=>a.supports.filter(w=>w.mode!=='slide'&&/Foot$/.test(w.bone)).map(w=>w.maxDrift3DMeters)))),
    maxPairContactGapMeters:Math.max(0,...checks.flatMap(c=>c.contacts.map(w=>w.maxGapMeters))),
    limitations:['Stock score is a weighted diagnostic proxy, not a human perceptual rating.',
      'Stock floor metric checks joint centers and declared sole points; no surface mesh collision certification.',
      'Intentional slide windows are measured separately and excluded from stationary foot plant metadata.',
      'The genuine idle reference uses each actor initial facing; no action pose or endpoint is substituted as a reference.',
      'Paired contact checks compare declared bone-local surface points in delivered world-space FK.'],
    checks,negativeControls,failures,passed:checks.length===14&&!failures.length&&negativeControls.pass};
  await writeFile(path.join(out,'motion-qa.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({clips:evidence.clipCount,actors:evidence.actorCount,min:evidence.minimumScore,
    maxFootDriftMeters:evidence.maxPlantedFootDriftMeters,maxPairGapMeters:evidence.maxPairContactGapMeters,
    passed:evidence.passed,failures},null,2));
  if(!evidence.passed)process.exitCode=1;
}finally{await rm(temporary,{recursive:true,force:true});}
