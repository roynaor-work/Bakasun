#!/usr/bin/env node
// Black-box regression: adding a documentation commit must not invalidate a
// native-game cache, duplicate trials or mix provenance after publishing.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createSnapshot,copyTools,sha256} from './snapshot.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../../../..');
const source=await createSnapshot(repo),output=await mkdtemp(join(tmpdir(),'balance-resume-proof-'));
const git=(...args)=>execFileSync('git',args,{cwd:source.sourceRoot,encoding:'utf8'}).trim();
const commit=message=>git('-c','user.name=Balance runner fixture','-c','user.email=balance-fixture@example.invalid','commit','--no-gpg-sign','-qm',message);
try{
  git('init','-q');git('add','package.json','workout');commit('Copied native source fixture');const firstHead=git('rev-parse','HEAD');
  await copyTools(repo,source.sourceRoot);
  const cli=join(source.sourceRoot,'workout/island/design/balance-sim-v1/tools/run.mjs');
  const args=[cli,'--games','fireRescue','--stages','1','--profiles','regular','--samples','1','--jobs','1','--output',output];
  const firstLog=execFileSync(process.execPath,args,{encoding:'utf8'});
  const firstData=await readFile(join(output,'baseline-fireRescue.json'));
  const before=JSON.parse(firstData);assert.equal(before.trials.length,1);assert.equal(before.trials[0].diagnostics.resultValid,true);
  await writeFile(join(source.sourceRoot,'balance-fixture-note.txt'),'A documentation-only change; the game source is unchanged.\n');
  git('add','balance-fixture-note.txt');commit('Documentation-only fixture commit');const secondHead=git('rev-parse','HEAD');assert.notEqual(firstHead,secondHead);
  const secondLog=execFileSync(process.execPath,args,{encoding:'utf8'});
  const secondData=await readFile(join(output,'baseline-fireRescue.json'));
  assert.equal(sha256(firstData),sha256(secondData),'Resumed trial data changed');
  const manifest=JSON.parse(await readFile(join(output,'source-manifest.json'),'utf8'));
  assert.equal(manifest.baseCommit,firstHead);assert.equal(manifest.invocationHead,secondHead);assert.equal(manifest.sourceDigest,source.manifest.sourceDigest);
  const summarize=join(source.sourceRoot,'workout/island/design/balance-sim-v1/tools/summarize.mjs');
  execFileSync(process.execPath,[summarize,'--data',output,'--no-charts','--tables',join(output,'TABLES.md')],{encoding:'utf8'});
  const originalsUnchanged=await source.verify();
  const result={schemaVersion:1,baseCommit:source.manifest.baseCommit,sourceDigest:source.manifest.sourceDigest,method:'Disposable Git fixture of identical native game source; one actual fireRescue trial, a documentation-only commit, then the same run command and summary.',firstHead,secondHead,measuredRevisionPreserved:manifest.baseCommit===firstHead,invocationHeadRecorded:manifest.invocationHead===secondHead,trialCount:before.trials.length,trialDataIdentical:true,sourceDigestIdentical:true,summaryAccepted:true,originalsUnchanged,firstLogSha256:sha256(firstLog),secondLogSha256:sha256(secondLog),complete:true};
  await writeFile(join(here,'../data/runner-resume-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await source.cleanup();await rm(output,{recursive:true,force:true});}
