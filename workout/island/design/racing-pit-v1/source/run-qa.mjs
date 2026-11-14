// Original CC0-1.0. Run the pinned upstream CLI with a new input adapter only.
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const exec=promisify(execFile);
const here=path.dirname(fileURLToPath(import.meta.url)), assets=path.resolve(here,'..'),repo=path.resolve(assets,'../../../..');
const PIN='5eb4f093bc22523ee417a7f2345c3b813bffba24', TOOL='workout/island/design/motion-qa-v1';
const MODULES=['run.mjs','glb.mjs','metrics.mjs','report.mjs','sheets.mjs','licenses.mjs'];
const hash=b=>createHash('sha256').update(b).digest('hex');
try{await exec('git',['cat-file','-e',`${PIN}:${TOOL}/run.mjs`],{cwd:repo});}
catch{await exec('git',['fetch','origin','codex/motion-qa-v1'],{cwd:repo,maxBuffer:1024*1024});}
const temporary=await mkdtemp(path.join(tmpdir(),'racing-pit-upstream-'));
try{
  const qaRoot=path.join(temporary,TOOL);await mkdir(qaRoot,{recursive:true});
  const upstreamFiles=[];
  for(const file of MODULES){
    const {stdout}=await exec('git',['show',`${PIN}:${TOOL}/${file}`],{cwd:repo,encoding:'buffer',maxBuffer:4*1024*1024});
    await writeFile(path.join(qaRoot,file),stdout);upstreamFiles.push({file:`${TOOL}/${file}`,sha256:hash(stdout)});
  }
  const vendor='workout/island/design/soccer-motion-v8/runtime/vendor/three.module.js';
  const vendorPath=path.join(temporary,vendor);await mkdir(path.dirname(vendorPath),{recursive:true});await copyFile(path.join(repo,vendor),vendorPath);
  const status=(await exec('git',['status','--porcelain','--',path.relative(repo,path.join(assets,'models'))],{cwd:repo})).stdout.trim();
  const commit=status?'working-tree':(await exec('git',['rev-parse','HEAD'],{cwd:repo})).stdout.trim();
  const output=path.join(temporary,'output');
  const {stdout}=await exec(process.execPath,['--loader',path.join(here,'qa-loader.mjs'),path.join(qaRoot,'run.mjs'),
    '--library','racing-pit-v1','--fps','60','--out',output],
    {cwd:repo,env:{...process.env,PIT_QA_ROOT:qaRoot,PIT_ASSET_COMMIT:commit},maxBuffer:1024*1024});
  for(const entry of upstreamFiles){const bytes=await readFile(path.join(temporary,entry.file));if(hash(bytes)!==entry.sha256)throw new Error(`Upstream code changed: ${entry.file}`);}
  const report=JSON.parse(await readFile(path.join(output,'report.json'),'utf8'));
  await copyFile(path.join(output,'report.json'),path.join(assets,'verification/motion-qa.json'));
  const all=report.libraries.flatMap(l=>l.clips),min=Math.min(...all.map(c=>c.score));
  const missing=all.flatMap(c=>Object.values(c.metrics)).filter(m=>m.status==='insufficient-data').length;
  const provenance={upstreamRepository:'https://github.com/roynaor-work/Bakasun',upstreamBranch:'codex/motion-qa-v1',
    upstreamCommit:PIN,upstreamEntryPoint:`${TOOL}/run.mjs`,upstreamFiles,upstreamUnmodified:true,
    inputAdapter:{file:'source/qa-sources.mjs',sha256:hash(await readFile(path.join(here,'qa-sources.mjs')))},
    loader:{file:'source/qa-loader.mjs',sha256:hash(await readFile(path.join(here,'qa-loader.mjs')))},
    vendor:{file:vendor,sha256:hash(await readFile(vendorPath)),license:'MIT; temporary verification dependency only'},
    assetsGitCommit:commit,scoring:'all upstream metric definitions, thresholds and weights unchanged',
    scope:'70 clips read from all seven delivered GLBs; 60 Hz plus exact key/event/support times',
    minimumRequired:88,minimumObserved:min,coverage:Math.min(...all.map(c=>c.coverage)),
    insufficientDataMetrics:missing,nonApplicable:['ball contact on all clips','body sliding on stationary clips'],
    passed:all.length===70&&min>=88&&missing===0&&all.every(c=>c.coverage===1),
    cliStdout:stdout.trim()};
  await writeFile(path.join(assets,'verification/motion-qa-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  if(!provenance.passed)throw new Error(`Motion QA failed: minimum ${min}; missing applicable metrics ${missing}`);
  console.log(JSON.stringify({clips:all.length,min,average:report.libraries[0].summary.average,
    coverage:provenance.coverage,redMetrics:report.libraries[0].summary.redMetrics,upstream:PIN},null,2));
}finally{await rm(temporary,{recursive:true,force:true});}
