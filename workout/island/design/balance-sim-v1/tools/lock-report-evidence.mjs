#!/usr/bin/env node
// Release-time guard for this source-specific narrative. New game sources need
// a new audit, not automatic reuse of the conclusions written for this version.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './snapshot.mjs';
const pack=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=async p=>JSON.parse(await readFile(join(pack,p),'utf8'));
const baseCommit='43b27dc235387e3cb737aee9558cdf9d5fd5a262';
const sourceDigest='fd6c9abd3392ab91504777feb75f2f00dd4f521cb0bccf29ae6817534040fd07';
const summary=await read('data/summary.json'),verification=await read('data/verification.json'),manifest=await read('data/source-manifest.json');
assert.equal(summary.baseCommit,baseCommit);assert.equal(summary.sourceDigest,sourceDigest);assert.equal(summary.coverage.complete,true);
assert.equal(verification.allChecksPassed,true);assert.equal(verification.coverage.complete,true);assert.equal(verification.replays.length,10);
assert.equal(verification.sourceDigest,sourceDigest);assert.equal(manifest.baseCommit,baseCommit);assert.equal(manifest.sourceDigest,sourceDigest);
for(const [id,reaction,error,lapse,patience] of [['impatient',.45,.22,.16,90],['regular',.25,.10,.06,180],['skilled',.10,.03,.015,300]])for(const game of summary.games){
  const p=game.profiles.find(p=>p.id===id);assert.deepEqual([p.reactionSeconds,p.aimError,p.lapseProbability,p.patienceSeconds],[reaction,error,lapse,patience]);
}
for(const name of ['tuning-soccer','alpine-probes','tuning-fire-holdout','fire-tuning-recommendations','tuning-catch','pigs-tail-stress','pigs-gear-sensitivity','racing-project-equivalence','racing-seasons']){
  const evidence=await read(`data/${name}.json`);assert.equal(evidence.baseCommit,baseCommit,`${name}: source revision`);
  if(evidence.sourceDigest)assert.equal(evidence.sourceDigest,sourceDigest,`${name}: source digest`);
}
for(const name of ['tuning-hoops','tennis-gear-sensitivity'])assert.equal((await read(`data/${name}.json`)).sourceCommit,baseCommit);
assert.equal((await read('data/tuning-aliens-naval.json')).sourceConfigSha256,manifest.hashes['workout/island/data/config.json']);
const tests=await read('data/test-results.json');assert.equal(tests.isolatedBrowser.exitCode,0);assert.equal(tests.simulatorStatistics.fail,0);
const artifacts=await read('data/final-artifact-validation.json');assert.equal(artifacts.complete,true);assert.equal(artifacts.totalPanels,40);assert.equal(artifacts.watchdogTimeouts,0);
assert.equal(artifacts.summarySha256,sha256(await readFile(join(pack,'data/summary.json'))));
assert.equal(artifacts.tablesSha256,sha256(await readFile(join(pack,'TABLES.md'))));
const files={};
for(const name of (await readdir(join(pack,'data'))).filter(p=>p.endsWith('.json')&&p!=='report-evidence-lock.json').sort())files['data/'+name]=sha256(await readFile(join(pack,'data',name)));
for(const name of ['TABLES.md','tools/report.mjs','tools/profiles.mjs'])files[name]=sha256(await readFile(join(pack,name)));
for(const chart of artifacts.charts){assert.equal(chart.sha256,sha256(await readFile(join(pack,chart.path))));files[chart.path]=chart.sha256;}
await writeFile(join(pack,'data/report-evidence-lock.json'),JSON.stringify({schemaVersion:1,baseCommit,sourceDigest,purpose:'Bind this reviewed narrative to its measured source, controllers, evidence and tables; regenerate only after reviewing changed conclusions.',files},null,2)+'\n');
console.log(JSON.stringify({lockedFiles:Object.keys(files).length,baseCommit,sourceDigest}));
