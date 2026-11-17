// SPDX-License-Identifier: CC0-1.0. Execute the pinned upstream CLI unchanged.
import{readFile,writeFile,mkdir,mkdtemp,copyFile,rm}from'node:fs/promises';
import{execFile}from'node:child_process';
import{promisify}from'node:util';
import{tmpdir}from'node:os';
import path from'node:path';
import{fileURLToPath}from'node:url';
import{createHash}from'node:crypto';
const exec=promisify(execFile),here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),repo=path.resolve(root,'../../../..');
const PIN='5eb4f093bc22523ee417a7f2345c3b813bffba24',TOOL='workout/island/design/motion-qa-v1';
const MODULES=['run.mjs','glb.mjs','metrics.mjs','report.mjs','sheets.mjs','licenses.mjs'];
const hash=b=>createHash('sha256').update(b).digest('hex');
try{await exec('git',['cat-file','-e',`${PIN}:${TOOL}/run.mjs`],{cwd:repo});}
catch{await exec('git',['fetch','origin','codex/motion-qa-v1'],{cwd:repo,maxBuffer:1024*1024});}
const temp=await mkdtemp(path.join(tmpdir(),'racing-podium-upstream-'));
try{
  const qaRoot=path.join(temp,TOOL);await mkdir(qaRoot,{recursive:true});
  const upstreamFiles=[];
  for(const file of MODULES){
    const{stdout}=await exec('git',['show',`${PIN}:${TOOL}/${file}`],{cwd:repo,encoding:'buffer',maxBuffer:4*1024*1024});
    await writeFile(path.join(qaRoot,file),stdout);upstreamFiles.push({file:`${TOOL}/${file}`,sha256:hash(stdout)});
  }
  const vendor='workout/island/design/soccer-motion-v8/runtime/vendor/three.module.js';
  const vendorPath=path.join(temp,vendor);await mkdir(path.dirname(vendorPath),{recursive:true});await copyFile(path.join(repo,vendor),vendorPath);
  const commit=(await exec('git',['rev-parse','HEAD'],{cwd:repo})).stdout.trim();
  const output=path.join(temp,'output');
  const{stdout}=await exec(process.execPath,['--loader',path.join(here,'qa-loader.mjs'),path.join(qaRoot,'run.mjs'),
    '--library','racing-podium-v1','--fps','60','--out',output],
    {cwd:repo,env:{...process.env,PODIUM_QA_ROOT:qaRoot,PODIUM_ASSET_COMMIT:commit},maxBuffer:2*1024*1024});
  for(const e of upstreamFiles)if(hash(await readFile(path.join(temp,e.file)))!==e.sha256)throw Error(`Upstream changed: ${e.file}`);
  const report=JSON.parse(await readFile(path.join(output,'report.json'),'utf8'));
  await mkdir(path.join(root,'verification'),{recursive:true});
  await copyFile(path.join(output,'report.json'),path.join(root,'verification/motion-qa.json'));
  const all=report.libraries.flatMap(l=>l.clips),minimum=Math.min(...all.map(c=>c.score));
  const missing=all.flatMap(c=>Object.values(c.metrics)).filter(m=>m.status==='insufficient-data').length;
  const provenance={upstreamRepository:'https://github.com/roynaor-work/Bakasun',upstreamBranch:'codex/motion-qa-v1',
    upstreamCommit:PIN,upstreamFiles,upstreamUnmodified:true,
    inputAdapter:{file:'source/qa-sources.mjs',sha256:hash(await readFile(path.join(here,'qa-sources.mjs')))},
    loader:{file:'source/qa-loader.mjs',sha256:hash(await readFile(path.join(here,'qa-loader.mjs')))},
    runner:{file:'source/run-qa.mjs',sha256:hash(await readFile(fileURLToPath(import.meta.url)))},
    vendor:{file:vendor,sha256:hash(await readFile(vendorPath)),license:'MIT; temporary verification dependency'},
    sourceBaseCommit:commit,assets:report.libraries[0].source.inputs,
    scoring:'Original upstream metric definitions, weights and thresholds; no sample or support repairs',
    scope:'All 16 embedded driver clips; 60 Hz plus every baked key and exact event/support times; actual sole vertices',
    minimumRequiredExclusive:88,minimumObserved:minimum,coverage:Math.min(...all.map(c=>c.coverage)),
    insufficientDataMetrics:missing,redMetrics:report.libraries[0].summary.redMetrics,
    passed:all.length===16&&minimum>88&&missing===0&&all.every(c=>c.coverage===1),cliStdout:stdout.trim()};
  await writeFile(path.join(root,'verification/motion-qa-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  const summary={clips:all.length,minimum,average:report.libraries[0].summary.average,coverage:provenance.coverage,
    redMetrics:provenance.redMetrics,insufficientDataMetrics:missing,passed:provenance.passed,upstream:PIN};
  console.log(JSON.stringify(summary,null,2));
  if(!provenance.passed)throw Error(`Motion QA failed: minimum ${minimum}; missing ${missing}`);
}finally{await rm(temp,{recursive:true,force:true});}
