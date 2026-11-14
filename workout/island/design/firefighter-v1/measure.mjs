// SPDX-License-Identifier: CC0-1.0
// Run the official QA CLI byte-for-byte from its pinned repository commit in /tmp.
import {mkdtemp,mkdir,symlink,writeFile,readFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(base,'../../../..');
const commit='5eb4f093bc22523ee417a7f2345c3b813bffba24',qaPath='workout/island/design/motion-qa-v1';
try{execFileSync('git',['cat-file','-e',commit+'^{commit}'],{cwd:repo,stdio:'pipe'});}
catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',commit],{cwd:repo,stdio:'inherit'});}
const temp=await mkdtemp(path.join(tmpdir(),'firefighter-qa-')),qaRoot=path.join(temp,qaPath);
await mkdir(qaRoot,{recursive:true});
const qaFiles=[];
for(const f of ['run.mjs','sources.mjs','sources.json','metrics.mjs','glb.mjs','report.mjs','sheets.mjs','licenses.mjs']){
  const bytes=execFileSync('git',['show',`${commit}:${qaPath}/${f}`],{cwd:repo,maxBuffer:4*1024*1024});
  await writeFile(path.join(qaRoot,f),bytes);qaFiles.push({file:f,commit,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await mkdir(path.join(qaRoot,'../soccer-motion-v8/runtime'),{recursive:true});
await symlink(path.join(repo,'workout/island/design/soccer-motion-v8/runtime/vendor'),path.join(qaRoot,'../soccer-motion-v8/runtime/vendor'),'dir');
const out=path.join(base,'verification/qa');await mkdir(out,{recursive:true});
const env={...process.env,FIREFIGHTER_QA_ROOT:qaRoot,FIREFIGHTER_SOURCE_COMMIT:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()};
const result=spawnSync(process.execPath,['--import',pathToFileURL(path.join(base,'qa-register.mjs')).href,path.join(qaRoot,'run.mjs'),'--library','firefighter-v1','--fps','120','--out',out],{cwd:repo,env,stdio:'inherit'});
if(result.status!==0)throw Error('Original QA CLI failed: '+result.status);
const report=JSON.parse(await readFile(path.join(out,'report.json'),'utf8'));
const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
const all=report.libraries[0].clips,required=manifest.motions.requiredClips.map(id=>all.find(c=>c.id===id));
const summary={qaCommit:commit,qaFiles,adapter:'Only sources.mjs is redirected. All animation frames come from the delivered GLB through the unchanged glb.mjs sampler. All metric formulas, weights and thresholds remain original.',
  sampleRate:120,nativeRate:30,requiredCount:required.length,minimumScore:Math.min(...required.map(c=>c?.score??0)),
  redMetrics:required.reduce((s,c)=>s+Object.values(c?.metrics??{}).filter(m=>m.status==='red').length,0),
  coverage:required.map(c=>({id:c?.id,score:c?.score,coverage:c?.coverage,metrics:Object.fromEntries(Object.entries(c?.metrics??{}).map(([k,v])=>[k,{value:v.value,status:v.status}]))})),
  passed:required.every(c=>c&&c.score>=88&&c.coverage===1&&Object.values(c.metrics).every(m=>m.status!=='red'))};
await writeFile(path.join(base,'verification/motion-qa.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({minimumScore:summary.minimumScore,redMetrics:summary.redMetrics,passed:summary.passed,clips:summary.coverage.map(c=>({id:c.id,score:c.score,bad:Object.entries(c.metrics).filter(([,m])=>m.status!=='green'&&m.status!=='not-applicable')}))},null,2));
if(!summary.passed)process.exitCode=1;
