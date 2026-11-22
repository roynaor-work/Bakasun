#!/usr/bin/env node
/** Validate evidence, source immutability and optional native deterministic replay. */
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSnapshot,copyTools,sha256,git} from './snapshot.mjs';
const here=dirname(fileURLToPath(import.meta.url)),pack=resolve(here,'..'),repo=resolve(here,'../../../../..');
const argv=process.argv.slice(2),arg=(key,fallback)=>{const at=argv.indexOf('--'+key);return at<0?fallback:argv[at+1];};
const output=resolve(arg('output',join(pack,'data/verification.json')));
if(!(output.startsWith(pack+'/')||output.startsWith('/tmp/')))throw Error('Output must be confined to the package or /tmp');
const dataDir=resolve(arg('data',join(pack,'data'))),manifest=JSON.parse(await readFile(join(dataDir,'source-manifest.json'),'utf8'));
const files=(await readdir(dataDir)).filter(p=>/^baseline-[\w-]+\.json$/.test(p)).sort(),datasets=[];
const snapshot=await createSnapshot(repo),modules=[];
try{
  assert.equal(snapshot.manifest.sourceDigest,manifest.sourceDigest,'Current game source differs from the measured source');
  await copyTools(repo,snapshot.sourceRoot);
  const config=JSON.parse(await readFile(join(snapshot.sourceRoot,'workout/island/data/config.json'),'utf8'));
  const checks=[];
  for(const name of files){
    const data=JSON.parse(await readFile(join(dataDir,name),'utf8'));datasets.push(data);
    assert.equal(data.sourceDigest,manifest.sourceDigest,name);
    const hash=async file=>sha256(await readFile(join(here,file)));
    const dependencies=data.game.toolDependencies||[];
    const fingerprint=sha256(JSON.stringify({source:data.sourceDigest,profiles:await hash('profiles.mjs'),worker:await hash('worker.mjs'),adapter:await hash(`adapters/${data.game.adapter}.mjs`),...(dependencies.length?{dependencies:Object.fromEntries(await Promise.all(dependencies.map(async p=>[p,await hash(p)])))}:{})}));
    assert.equal(data.fingerprint,fingerprint,`Controller fingerprint changed: ${data.game.id}`);
    const coordinates=new Set();
    for(const row of data.trials){
      const key=`${row.stage}:${row.profile}:${row.seed}`;assert.ok(!coordinates.has(key),`Duplicate ${data.game.id}:${key}`);coordinates.add(key);
      assert.ok(data.game.stages.includes(row.stage));assert.ok(data.profiles.some(p=>p.id===row.profile));
      assert.ok(['win','lose','timeout'].includes(row.outcome));assert.ok(Number.isFinite(row.seconds)&&row.seconds>=0);
      assert.ok(row.stars===null||(Number.isInteger(row.stars)&&row.stars>=0&&row.stars<=3));
      assert.ok(row.falls===null||(Number.isFinite(row.falls)&&row.falls>=0));
      for(const flag of ['settlementValid','resultValid'])if(flag in row.diagnostics)assert.equal(row.diagnostics[flag],true,`${data.game.id}:${key} rejected by native settlement`);
    }
    checks.push({game:data.game.id,trials:data.trials.length,uniqueCoordinates:true,controllerFingerprintVerified:true,nativeSettlementFlagsValid:true});
  }
  const summary=JSON.parse(await readFile(join(dataDir,'summary.json'),'utf8'));
  assert.equal(summary.sourceDigest,manifest.sourceDigest);assert.equal(summary.games.length,10);
  if(!argv.includes('--allow-partial'))assert.equal(summary.coverage.complete,true,'Baseline coverage incomplete');
  assert.equal(summary.coverage.totalTrials,datasets.reduce((s,d)=>s+d.trials.length,0),'Summary is stale');
  const replays=[];
  if(argv.includes('--replay')){
    for(const data of datasets){
      const mod=await import(pathToFileURL(join(snapshot.sourceRoot,'workout/island/design/balance-sim-v1/tools/adapters',data.game.adapter+'.mjs')));modules.push(mod);
      const row=data.trials.find(r=>r.stage===data.game.stages[0]&&r.profile==='regular');assert.ok(row,'No replay trial');
      const profile=data.profiles.find(p=>p.id===row.profile);
      const actual=await mod.runTrial({sourceRoot:snapshot.sourceRoot,config:structuredClone(config),game:data.game.id,stage:row.stage,profile,seed:row.seed});
      const serialized=JSON.parse(JSON.stringify(actual));
      for(const field of ['outcome','seconds','stars','falls','score','reason','objectives','diagnostics'])assert.deepEqual(serialized[field],row[field],`Native replay differs ${data.game.id}:${field}`);
      replays.push({game:data.game.id,stage:row.stage,profile:row.profile,seed:row.seed,identical:true});
      await mod.cleanup?.();
    }
  }
  const originalsUnchanged=await snapshot.verify();
  const existingChanges=git(repo,'diff','--name-only','HEAD').split('\n').filter(p=>p&&!p.startsWith('workout/island/design/balance-sim-v1/'));
  assert.deepEqual(existingChanges,[]);
  const result={schemaVersion:1,measuredBaseCommit:manifest.baseCommit,currentHead:git(repo,'rev-parse','HEAD'),sourceDigest:manifest.sourceDigest,sourceFiles:snapshot.manifest.fileCount,originalsUnchanged,existingFilesChanged:[],coverage:summary.coverage,datasets:checks,replays,allChecksPassed:true};
  await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{for(const mod of modules)await mod.cleanup?.();await snapshot.cleanup();}
