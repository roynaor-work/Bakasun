// SPDX-License-Identifier: CC0-1.0
// Reproduce the real pinned motion-qa-v1 CLI outside the checkout, without metric edits.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderQaReport} from './qa-report.mjs';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const repo=path.resolve(root,'../../../..');
const commit='5eb4f093bc22523ee417a7f2345c3b813bffba24';
const prefix='workout/island/design/motion-qa-v1';
const expected=['idle','jog','whistle','point_penalty','advantage','yellow_card','red_card','goal_signal','assistant_run','assistant_offside'];
try {execFileSync('git',['cat-file','-e',`${commit}^{commit}`],{cwd:repo,stdio:'ignore'});}
catch {execFileSync('git',['fetch','--depth=1','--filter=blob:none','--no-tags','origin',commit],{cwd:repo,stdio:'inherit'});}
const temporary=await mkdtemp(path.join(tmpdir(),'soccer-referee-qa-'));
const qaRoot=path.join(temporary,prefix);
await mkdir(qaRoot,{recursive:true});
const files=['run.mjs','sources.mjs','sources.json','metrics.mjs','glb.mjs','report.mjs','sheets.mjs','licenses.mjs'];
const toolFiles=[];
for (const file of files) {
  const bytes=execFileSync('git',['show',`${commit}:${prefix}/${file}`],{cwd:repo,maxBuffer:4*1024*1024});
  await writeFile(path.join(qaRoot,file),bytes);
  toolFiles.push({path:`${prefix}/${file}`,commit,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await mkdir(path.join(qaRoot,'../soccer-motion-v8/runtime'),{recursive:true});
await symlink(path.join(repo,'workout/island/design/soccer-motion-v8/runtime/vendor'),path.join(qaRoot,'../soccer-motion-v8/runtime/vendor'),'dir');
const out=path.join(root,'qa');
await mkdir(out,{recursive:true});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const args=['--import',new URL('./qa-register.mjs',import.meta.url).href,
  path.join(qaRoot,'run.mjs'),'--library','soccer-referee-v1','--fps','120','--out',out];
const result=spawnSync(process.execPath,args,{cwd:repo,
  env:{...process.env,SOCCER_REFEREE_QA_ROOT:qaRoot,SOCCER_REFEREE_SOURCE_COMMIT:sourceCommit},stdio:'inherit'});
if (result.error) throw result.error;
assert.equal(result.status,0,'Pinned motion-qa-v1 CLI failed.');
for (const record of toolFiles) {
  const actual=await readFile(path.join(temporary,record.path));
  assert.equal(createHash('sha256').update(actual).digest('hex'),record.sha256,`${record.path}: QA source changed during measurement`);
}
const report=JSON.parse(await readFile(path.join(out,'report.json'),'utf8'));
const clips=report.libraries.flatMap(l=>l.clips);
const assertions={
  exactClipCoverage:JSON.stringify(clips.map(c=>c.id).sort())===JSON.stringify([...expected].sort()),
  strictScoreAbove88:clips.every(c=>c.score>88),
  fullApplicableCoverage:clips.every(c=>c.coverage===1),
  noRedMetrics:clips.every(c=>Object.values(c.metrics).every(m=>m.status!=='red')),
};
const summary={schemaVersion:1,qaCommit:commit,toolFiles,sourceBaseCommit:sourceCommit,
  sourceRevision:'The checkout base commit is context only. Delivered working-tree catalog and GLB inputs are identified by their SHA-256 and Git blob hashes in qa/report.json libraries[].sources.',
  command:'node --import <package>/source/qa-register.mjs <temporary>/workout/island/design/motion-qa-v1/run.mjs --library soccer-referee-v1 --fps 120 --out <package>/qa',
  adapter:'Only the source inventory is replaced. All eight pinned QA modules are byte-identical before and after execution. Actual GLB animation channels are sampled by the pinned glb.mjs reader; declared external reference travel is applied once.',
  reportPresentation:'qa/report.html and per-clip HTML are original portable views; qa/report.json, per-clip JSON and SVG remain the unchanged CLI output.',
  scoreRequirement:'strictly greater than 88',assertions,pass:Object.values(assertions).every(Boolean),
  minimumScore:Math.min(...clips.map(c=>c.score)),
  clips:clips.map(c=>({id:c.id,score:c.score,coverage:c.coverage,idleReference:c.idleReference,
    redMetrics:Object.entries(c.metrics).filter(([,m])=>m.status==='red').map(([id])=>id),metrics:c.metrics}))};
await writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
await renderQaReport(report,out);
console.log(JSON.stringify({pass:summary.pass,minimumScore:summary.minimumScore,assertions,clips:summary.clips.map(c=>({id:c.id,score:c.score}))},null,2));
if (!summary.pass) process.exitCode=1;
