// SPDX-License-Identifier: CC0-1.0. Materialize the pinned QA tool outside the checkout, run its unchanged CLI.
import {execFileSync,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),repo=path.resolve(root,'../../../..');
const commit='5eb4f093bc22523ee417a7f2345c3b813bffba24',prefix='workout/island/design/motion-qa-v1/';
try{execFileSync('git',['cat-file','-e',commit],{cwd:repo,stdio:'ignore'});}catch{execFileSync('git',['fetch','origin',commit],{cwd:repo,stdio:'inherit'});}
const temp=process.env.KEEPER_QA_DIR??'/tmp/bakasun-keeper-qa-v1',base=path.join(temp,prefix);
await mkdir(base,{recursive:true});
const paths=execFileSync('git',['ls-tree','-r','--name-only',commit,prefix],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(p=>!p.slice(prefix.length).includes('/')&&/\.(mjs|json|css)$/.test(p));
const toolFiles=[];
for(const p of paths){const bytes=execFileSync('git',['show',`${commit}:${p}`],{cwd:repo,maxBuffer:4*1024*1024});await writeFile(path.join(temp,p),bytes);toolFiles.push({path:p,sha256:createHash('sha256').update(bytes).digest('hex')});}
try{await symlink(path.join(repo,'workout/island/design/soccer-motion-v8'),path.join(temp,'workout/island/design/soccer-motion-v8'),'dir');}catch(e){if(e.code!=='EEXIST')throw e;}
await writeFile(path.join(root,'style.css'),await readFile(path.join(base,'style.css')));
const cli=path.join(base,'run.mjs'),env={...process.env,KEEPER_QA_CLI:pathToFileURL(cli).href};
const args=['--import',path.join(root,'source/register-qa.mjs'),cli,'--out',path.join(root,'qa'),'--library','soccer-keeper-crowd-v1','--fps','60'];
const result=spawnSync(process.execPath,args,{cwd:temp,env,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
const report=JSON.parse(await readFile(path.join(root,'qa/report.json'))),clips=report.libraries[0].clips.filter(c=>c.id!=='keeper_ready_reference');
const summary={qaCommit:commit,toolFiles,command:[process.execPath,...args],adapter:'source/qa-sources.mjs replaces only the CLI input inventory; run.mjs, glb.mjs, metrics.mjs, report.mjs and sheets.mjs are byte-identical to the pinned QA branch.',minimumRequired:88,pass:clips.every(c=>c.score>=88&&c.coverage===1&&!Object.values(c.metrics).some(m=>m.status==='red')),clips:clips.map(c=>({id:c.id,score:c.score,coverage:c.coverage,metrics:c.metrics}))};
await writeFile(path.join(root,'qa/summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({pass:summary.pass,clips:clips.map(c=>({id:c.id,score:c.score}))}));if(!summary.pass)process.exitCode=1;
