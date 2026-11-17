// Original CC0-1.0. Run the untouched, Git-pinned motion-qa-v1 CLI.
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const exec=promisify(execFile),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),repo=path.resolve(root,'../../../..');
const PIN='5eb4f093bc22523ee417a7f2345c3b813bffba24',TOOL='workout/island/design/motion-qa-v1';
const MODULES=['run.mjs','glb.mjs','metrics.mjs','report.mjs','sheets.mjs','licenses.mjs'];
const hash=b=>createHash('sha256').update(b).digest('hex');
try{await exec('git',['cat-file','-e',`${PIN}:${TOOL}/run.mjs`],{cwd:repo});}catch{await exec('git',['fetch','origin','codex/motion-qa-v1'],{cwd:repo});}
const temporary=await mkdtemp(path.join(tmpdir(),'city-citizens-upstream-'));
try{
  const qaRoot=path.join(temporary,TOOL);await mkdir(qaRoot,{recursive:true});const upstreamFiles=[];
  for(const file of MODULES){const {stdout}=await exec('git',['show',`${PIN}:${TOOL}/${file}`],{cwd:repo,encoding:'buffer',maxBuffer:4*1024*1024});await writeFile(path.join(qaRoot,file),stdout);upstreamFiles.push({file:`${TOOL}/${file}`,sha256:hash(stdout)});}
  const vendor='workout/island/design/soccer-motion-v8/runtime/vendor/three.module.js';
  const vendorPath=path.join(temporary,vendor);await mkdir(path.dirname(vendorPath),{recursive:true});await copyFile(path.join(repo,vendor),vendorPath);
  const status=(await exec('git',['status','--porcelain','--',path.relative(repo,root)],{cwd:repo})).stdout.trim();
  const commit=status?'working-tree':(await exec('git',['rev-parse','HEAD'],{cwd:repo})).stdout.trim(),output=path.join(temporary,'output');
  const {stdout}=await exec(process.execPath,['--loader',path.join(here,'qa-loader.mjs'),path.join(qaRoot,'run.mjs'),'--library','city-citizens-v1','--fps','120','--out',output],{cwd:repo,env:{...process.env,CITY_QA_ROOT:qaRoot,CITY_ASSET_COMMIT:commit},maxBuffer:4*1024*1024});
  for(const entry of upstreamFiles)if(hash(await readFile(path.join(temporary,entry.file)))!==entry.sha256)throw Error(`Upstream mutated ${entry.file}`);
  const report=JSON.parse(await readFile(path.join(output,'report.json'),'utf8')),all=report.libraries.flatMap(l=>l.clips),minimum=Math.min(...all.map(c=>c.score));
  for(const input of report.libraries[0].source.inputs)if(hash(await readFile(path.join(root,input.path)))!==input.sha256)throw Error(`Asset changed during QA: ${input.path}`);
  process.env.CITY_QA_ROOT=qaRoot;
  const {loadLibraries}=await import(pathToFileURL(path.join(here,'qa-sources.mjs')).href),{analyzeClip}=await import(pathToFileURL(path.join(qaRoot,'metrics.mjs')).href);
  const probe=(await loadLibraries({fps:60,onlyFirst:true}))[0],idle=probe.clips.find(c=>c.motionId==='idle'),walk=probe.clips.find(c=>c.motionId==='walk');
  const measure=c=>analyzeClip({...c,idleFrames:idle.frames,clipId:c.id});
  const slipped=structuredClone(walk);for(const f of slipped.frames)f.joints.LeftFoot[0]+=.3*f.t/walk.duration;
  const penetrated=structuredClone(idle);for(const f of penetrated.frames)for(const p of f.floorPoints)p.position[1]-=.2;
  const popped=structuredClone(idle);popped.frames.at(-1).rawJoints.LeftHand[0]+=.4;
  const negativeControls={footSlipDetected:measure(slipped).metrics.footSliding.status==='red',floorPenetrationDetected:measure(penetrated).metrics.floorPenetration.status==='red',posePopDetected:measure(popped).metrics.posePops.status==='red',
    injectedMeters:{supportFootDrift:.3,floorDepth:.2,oneFrameHandJump:.4},scope:'cloned first native GLB samples; unchanged upstream analyzeClip; delivered bytes remain untouched'};
  const missing=all.flatMap(c=>Object.values(c.metrics)).filter(m=>m.status==='insufficient-data').length;
  const provenance={upstreamRepository:'https://github.com/roynaor-work/Bakasun',upstreamBranch:'codex/motion-qa-v1',upstreamCommit:PIN,upstreamEntryPoint:`${TOOL}/run.mjs`,upstreamFiles,upstreamUnmodified:true,
    inputAdapter:{file:'source/qa-sources.mjs',sha256:hash(await readFile(path.join(here,'qa-sources.mjs')))},loader:{file:'source/qa-loader.mjs',sha256:hash(await readFile(path.join(here,'qa-loader.mjs')))},
    vendor:{file:vendor,sha256:hash(await readFile(vendorPath)),license:'MIT; temporary verification dependency'},assetsGitCommit:commit,
    scoring:'all original upstream metric definitions, thresholds and weights unchanged',scope:'216 clips from36 citizen GLBs, including all3 palettes per identity;120Hz plus exact key/support/event times',
    limitations:['The canonical humanoid scoring tool does not support animal anatomy. All6 animals instead receive independent decoded GLB mesh-floor and loop audits.','In-place locomotion uses the documented simulation-owned reference speed; the game runtime is not executed.','Scores are reproducible diagnostics, not a human perceptual evaluation.'],
    minimumRequiredExclusive:88,minimumObserved:minimum,coverage:Math.min(...all.map(c=>c.coverage)),insufficientDataMetrics:missing,negativeControls,
    passed:all.length===216&&minimum>88&&missing===0&&all.every(c=>c.coverage===1)&&negativeControls.footSlipDetected&&negativeControls.floorPenetrationDetected&&negativeControls.posePopDetected,cliStdout:stdout.trim()};
  await mkdir(path.join(root,'verification'),{recursive:true});
  // Preserve every original score/metric/evidence in the lossless compressed report.
  await writeFile(path.join(root,'verification/motion-qa-full.json.gz'),gzipSync(Buffer.from(JSON.stringify(report)),{level:9}));
  const compact={schemaVersion:report.schemaVersion,generatedAt:report.generatedAt,fps:report.fps,metricDefinitions:report.metricDefinitions,limitations:report.limitations,elapsedSeconds:report.elapsedSeconds,
    fullEvidence:'motion-qa-full.json.gz',summary:report.libraries[0].summary,clips:all.map(c=>({id:c.id,source:c.source,score:c.score,coverage:c.coverage,idleReference:c.idleReference,
      metrics:Object.fromEntries(Object.entries(c.metrics).map(([n,m])=>[n,{value:m.value,status:m.status,score:m.score}])),reasons:c.reasons}))};
  await writeFile(path.join(root,'verification/motion-qa.json'),JSON.stringify(compact)+'\n');
  await writeFile(path.join(root,'verification/motion-qa-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify({passed:provenance.passed,clips:all.length,min:minimum,average:report.libraries[0].summary.average,redMetrics:report.libraries[0].summary.redMetrics,insufficientData:missing,upstream:PIN},null,2));
  if(!provenance.passed)process.exitCode=1;
}finally{await rm(temporary,{recursive:true,force:true});}
