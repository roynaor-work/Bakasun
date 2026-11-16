// SPDX-License-Identifier: CC0-1.0
// Reproduce the original motion-qa-v1 formulas without changing any metric or score.
import {readFile,writeFile,mkdir,mkdtemp,symlink,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadSamples} from './qa-sources.mjs';
const source=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(source,'..');
const pin='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const upstreamPath='workout/island/design/motion-qa-v1';
const expected={
  'metrics.mjs':'bff64c9ff97798b466b4193962594d1554f684f3f19fa931d310d7432260fed7',
  'glb.mjs':'0e5763ad87754a94522e631036fa8c20c881bb9ff00e676087905f82c07400cc',
  'sheets.mjs':'968a4d80c386ba55e7930c1ff9e921c09bb9b4584dbf7821e1c3d354d7652ca7'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const workspace=await mkdtemp(path.join(tmpdir(),'alpine-anim-motion-qa-')),qaRoot=path.join(workspace,'motion-qa-v1');
await mkdir(qaRoot,{recursive:true});
try{
  const upstream=[];
  for(const [name,digest]of Object.entries(expected)){
    let bytes;
    if(process.env.ALPINE_QA_ORIGINAL)bytes=await readFile(path.join(process.env.ALPINE_QA_ORIGINAL,name));
    else bytes=execFileSync('curl',['--fail','--silent','--show-error','--location','--connect-timeout','20',`https://raw.githubusercontent.com/roynaor-work/Bakasun/${pin}/${upstreamPath}/${name}`],{maxBuffer:2*1024*1024});
    if(hash(bytes)!==digest)throw Error(`Pinned upstream hash mismatch: ${name}`);
    await writeFile(path.join(qaRoot,name),bytes);upstream.push({file:`${upstreamPath}/${name}`,sha256:digest,bytes:bytes.length});
  }
  const vendor=path.resolve(root,'../soccer-motion-v8/runtime/vendor'),vendorParent=path.join(workspace,'soccer-motion-v8/runtime');
  await mkdir(vendorParent,{recursive:true});await symlink(vendor,path.join(vendorParent,'vendor'),'dir');
  const {analyzeClip,METRICS}=await import(pathToFileURL(path.join(qaRoot,'metrics.mjs')).href);
  const {readAccessor}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs')).href);
  const {clips,glb,inputs,probes,sole}=await loadSamples(qaRoot,{fps:120});
  const results=clips.map(c=>({id:c.id,durationSeconds:c.duration,heightMeters:c.height,measuredFrames:c.frames.length,
    ...analyzeClip({frames:c.frames,duration:c.duration,height:c.height,metadata:c.metadata,idleFrames:c.idleFrames,clipId:c.id,sport:'alpine'}),
    boundaryAssumptions:{entry:c.boundaryAssumptions.entry,exit:c.boundaryAssumptions.exit}}));
  for(const result of results)result.reasons=result.reasons.map(({reason,...rest})=>rest);
  // Hoist identical explanatory strings once. Every original numeric observation
  // and per-clip status stays intact; repeated prose remains recoverable here.
  const commonMetricEvidence={};
  for(const metric of Object.keys(METRICS)){
    const rows=results.map(c=>c.metrics[metric]),common={};
    const reason=rows[0].reason;
    if(typeof reason==='string'&&rows.every(m=>m.reason===reason)){common.reason=reason;for(const m of rows)delete m.reason;}
    for(const [key,value]of Object.entries(rows[0].evidence??{}))if(typeof value==='string'&&rows.every(m=>m.evidence?.[key]===value)){
      (common.evidence??={})[key]=value;for(const m of rows)delete m.evidence[key];
    }
    if(Object.keys(common).length)commonMetricEvidence[metric]=common;
  }
  const declared=['snowplow_brake','landing','air_180','air_360','trick_landing','fall','get_up'];
  const nativeTimes=glb.json.animations.flatMap(a=>a.samplers.map(s=>Array.from(readAccessor(glb,s.input))));
  const assertions={sevenRequestedClips:results.length===7&&declared.every(id=>results.some(c=>c.id===id)),
    animationOnly:!glb.json.meshes?.length&&!glb.json.textures?.length&&!glb.json.images?.length&&!glb.json.materials?.length,
    native30Hz:nativeTimes.every(ts=>ts.every((t,i)=>Math.abs(t-i/30)<1e-6)),
    scoreStrictlyAbove88:results.every(c=>c.score>88),completeApplicableMetrics:results.every(c=>c.coverage===1),
    noRedMetrics:results.every(c=>Object.values(c.metrics).every(m=>m.status!=='red'))};
  const report={schemaVersion:1,upstreamRepository:'https://github.com/roynaor-work/Bakasun',upstreamCommit:pin,upstream,
    invocation:'Original sampleGLB + analyzeClip; original constants, formulas, weights and scoring, with explicit independent entry/exit reference postures',
    scoringUnmodified:true,sampleRateHz:120,nativeSampleRateHz:30,inputs,
    adapterFiles:await Promise.all(['qa-run.mjs','qa-sources.mjs'].map(async file=>({file:`source/${file}`,sha256:hash(await readFile(path.join(source,file)))}))),
    boundaryAssumptions:(({entry,exit,...rest})=>rest)(clips[0].boundaryAssumptions),
    heightKind:'Geometry-derived native v7 stature from catalog.heightMeters; recommended host scale not applied to the QA scene',
    floorProbes:{local:probes,supportLocal:sole,source:'Native v7 foot mesh, in foot-local space; probe construction recorded in catalog'},
    metricDefinitions:Object.fromEntries(Object.entries(METRICS).map(([name,{description,...definition}])=>[name,definition])),commonMetricEvidence,
    minimumRequiredExclusive:88,minimumObserved:Math.min(...results.map(c=>c.score)),
    assertions,clips:results,passed:Object.values(assertions).every(Boolean),
    limitations:['Scores are the upstream reproducible diagnostic heuristic, not a human perceptual score.',
      'No ball is present. The step-speed metric does not apply to ski sliding or stationary actions.',
      'Floor measurements cover declared real v7 ski/boot probes and joints; they do not decode every deformed body vertex.',
      'Continuity measures source-derived stable entry/exit postures, including the fallen and switch stances; no runtime mixer or game physics is exercised.']};
  await mkdir(path.join(root,'verification'),{recursive:true});
  await writeFile(path.join(root,'verification/motion-qa.json'),JSON.stringify(report)+'\n');
  console.log(JSON.stringify({passed:report.passed,minimumObserved:report.minimumObserved,clips:results.map(c=>({id:c.id,score:c.score,coverage:c.coverage,reasons:c.reasons})),assertions},null,2));
  if(!report.passed)process.exitCode=1;
}finally{await rm(workspace,{recursive:true,force:true});}
