// SPDX-License-Identifier: CC0-1.0
// Extract and execute the upstream QA CLI byte-for-byte outside this checkout.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const base=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(base,'../../../..');
const commit='5eb4f093bc22523ee417a7f2345c3b813bffba24',prefix='workout/island/design/motion-qa-v1';
try{execFileSync('git',['cat-file','-e',commit],{cwd:repo,stdio:'ignore'});}catch{execFileSync('git',['fetch','origin',commit],{cwd:repo,stdio:'inherit'});}
const temp=await fs.mkdtemp('/tmp/tennis-grip-qa-'),qa=path.join(temp,prefix);await fs.mkdir(qa,{recursive:true});
const files=['run.mjs','sources.mjs','sources.json','glb.mjs','metrics.mjs','report.mjs','sheets.mjs','licenses.mjs','style.css'],provenance=[];
for(const file of files){const bytes=execFileSync('git',['show',`${commit}:${prefix}/${file}`],{cwd:repo,maxBuffer:4*1024*1024});await fs.writeFile(path.join(qa,file),bytes);provenance.push({path:`${prefix}/${file}`,sha256:createHash('sha256').update(bytes).digest('hex')});}
await fs.symlink(path.join(repo,'workout/island/design/soccer-motion-v8'),path.join(qa,'../soccer-motion-v8'),'dir');
const cli=path.join(qa,'run.mjs'),out=path.join(base,'verification/qa');
const args=['--import',path.join(base,'source/qa-register.mjs'),cli,'--library','tennis-grip-v1','--fps','120','--out',out];
const result=spawnSync(process.execPath,args,{cwd:temp,env:{...process.env,TENNIS_QA_CLI:cli},stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
await fs.copyFile(path.join(qa,'style.css'),path.join(base,'verification/style.css'));
const report=JSON.parse(await fs.readFile(path.join(out,'report.json'))),clips=report.libraries[0].clips;
// Repair only emitted HTML navigation for this package's directory layout.
// Source CLI, report renderer and all numerical report data remain unchanged.
for(const [file,prefix,packagePrefix] of [['report.html','../','../../'],...clips.map(c=>[c.htmlPath,'../../','../../../'])]){
 const filename=path.join(out,file);let html=await fs.readFile(filename,'utf8');
 html=html.replaceAll(prefix+'preview.mjs',packagePrefix+'source/qa-ui.mjs');
 for(const link of ['preview.html','README.md','REPORT.md','LICENSES.md'])html=html.replaceAll(prefix+link,packagePrefix+link);
 await fs.writeFile(filename,html);
}
const summary={qaCommit:commit,toolFiles:provenance,invocation:['node',...args],inputAdapter:'Only run.mjs -> sources.mjs resolution is replaced. Original metrics, thresholds, GLB reader, report and CLI are unchanged.',nativeRate:30,measurementRate:120,requiredMinimum:88,clips:clips.map(c=>({id:c.id,score:c.score,coverage:c.coverage,metrics:c.metrics})),minimumScore:Math.min(...clips.map(c=>c.score)),redMetrics:clips.reduce((s,c)=>s+Object.values(c.metrics).filter(m=>m.status==='red').length,0)};
summary.pass=clips.length===9&&summary.minimumScore>=88&&summary.redMetrics===0&&clips.every(c=>c.coverage===1);
await fs.writeFile(path.join(base,'verification/qa-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({pass:summary.pass,minimumScore:summary.minimumScore,redMetrics:summary.redMetrics,clips:clips.map(c=>({id:c.id,score:c.score,reasons:c.reasons}))},null,2));
if(!summary.pass)process.exitCode=1;
