// SPDX-License-Identifier: CC0-1.0
// Extract the original pinned tool to /tmp and run its unchanged CLI with a new asset inventory.
import {execFileSync,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,symlink,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),repo=path.resolve(root,'../../../..');
const commit='5eb4f093bc22523ee417a7f2345c3b813bffba24',prefix='workout/island/design/motion-qa-v1/';
try{execFileSync('git',['cat-file','-e',commit],{cwd:repo,stdio:'ignore'});}catch{execFileSync('git',['fetch','--depth=1','--no-tags','origin',commit],{cwd:repo,stdio:'inherit'});}
const temp=process.env.HOOPS_REF_QA_DIR??'/tmp/bakasun-hoops-ref-motion-qa-v1',base=path.join(temp,prefix),evidence=path.join(root,'verification/motion-qa'),output=path.join(evidence,'output');
await mkdir(base,{recursive:true});await mkdir(evidence,{recursive:true});
const paths=execFileSync('git',['ls-tree','-r','--name-only',commit,prefix],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(p=>!p.slice(prefix.length).includes('/')&&/\.(mjs|json|css)$/.test(p)),toolFiles=[];
for(const p of paths){const bytes=execFileSync('git',['show',`${commit}:${p}`],{cwd:repo,maxBuffer:4*1024*1024});await writeFile(path.join(temp,p),bytes);toolFiles.push({path:p,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
try{await symlink(path.join(repo,'workout/island/design/soccer-motion-v8'),path.join(temp,'workout/island/design/soccer-motion-v8'),'dir');}catch(e){if(e.code!=='EEXIST')throw e;}
for(const file of ['style.css','preview.mjs','sheets.mjs'])await copyFile(path.join(base,file),path.join(evidence,file));
const cli=path.join(base,'run.mjs'),env={...process.env,HOOPS_REF_QA_CLI:pathToFileURL(cli).href,HOOPS_REF_SOURCE_COMMIT:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()};
const args=['--import',path.join(root,'source/qa-register.mjs'),cli,'--out',output,'--library','hoops-ref-scoreboard-v1','--fps','120'];
const result=spawnSync(process.execPath,args,{cwd:temp,env,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
const report=JSON.parse(await readFile(path.join(output,'report.json'))),clips=report.libraries[0].clips;
const gate=clips.length===6&&clips.every(c=>c.score>88&&c.coverage===1&&!Object.values(c.metrics).some(m=>m.status==='red'||m.status==='insufficient-data'));
const summary={schemaVersion:1,qaCommit:commit,qaOriginalBranch:'codex/motion-qa-v1',toolFiles,command:[process.execPath,...args],adapter:'Only the CLI sources.mjs input inventory is routed to qa-sources.mjs. Original run.mjs, glb.mjs, metrics.mjs, report.mjs and sheets.mjs remain byte-identical; native GLB samples receive no reference-root or floor correction.',sampleRateHz:120,nativeRateHz:30,strictMinimumExclusive:88,pass:gate,clips:clips.map(c=>({id:c.id,score:c.score,coverage:c.coverage,metrics:c.metrics}))};
await writeFile(path.join(evidence,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({pass:gate,clips:clips.map(c=>({id:c.id,score:c.score,coverage:c.coverage,reasons:c.reasons}))}));if(!gate)process.exitCode=1;
