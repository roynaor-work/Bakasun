#!/usr/bin/env node
/** Paired sensitivity to the game's own benchSave loadout. Controller stays fixed.
 * node .../probe-pigs-gear.mjs [--source-root /tmp/copied-source]
 * Requires the matching 48-trial pigs-tail-stress.json baseline, otherwise rerun
 * stress-pigs-tail.mjs first. Output is confined to this package or /tmp.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSnapshot,sha256} from './snapshot.mjs';
import {profiles} from './profiles.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repoRoot=resolve(here,'../../../../..');
const argv=process.argv.slice(2),arg=(name,fallback)=>{const at=argv.indexOf('--'+name);return at<0?fallback:argv[at+1];};
const baselinePath=resolve(arg('baseline',join(here,'../data/pigs-tail-stress.json'))),baseline=JSON.parse(await readFile(baselinePath,'utf8'));
assert.equal(baseline.verification.complete,true,'Baseline incomplete');assert.equal(baseline.trials.length,48,'Expected the fixed 48-trial baseline');
const output=resolve(arg('output',join(here,'../data/pigs-gear-sensitivity.json')));
if(!(output.startsWith(resolve(here,'..')+'/')||output.startsWith('/tmp/')))throw Error('Output must be inside the new package or /tmp');
const givenRoot=arg('source-root',null),snapshot=givenRoot?null:await createSnapshot(repoRoot),sourceRoot=givenRoot?resolve(givenRoot):snapshot.sourceRoot;
if(sourceRoot===repoRoot||sourceRoot.startsWith(repoRoot+'/'))throw Error('Requires a disposable source copy outside the repo');
const manifest=snapshot?.manifest||JSON.parse(await readFile(resolve(arg('manifest',join(here,'../data/source-manifest.json'))),'utf8'));
assert.equal(manifest.sourceDigest,baseline.sourceDigest,'Baseline source mismatch');
async function verifyHashes(){for(const [path,hash]of Object.entries(manifest.hashes)){
 assert.equal(sha256(await readFile(join(sourceRoot,path))),hash,'Copied source changed: '+path);
 assert.equal(sha256(await readFile(join(repoRoot,path))),hash,'Original source changed: '+path);
}return true;}
const adapterPath=join(here,'adapters/pigs.mjs'),originalAdapter=await readFile(adapterPath,'utf8');
assert.equal(sha256(originalAdapter),baseline.toolHashes['adapters/pigs.mjs'],'Baseline adapter mismatch');
assert.equal(sha256(await readFile(join(here,'profiles.mjs'))),baseline.toolHashes['profiles.mjs'],'Baseline profile mismatch');
const fixtureFrom='save=freshSave();save.nextWave=stage;save.bestWave=stage-1;',fixtureTo='save=benchSave(stage);';
const observeFrom='weaponLevel:1,sourceBot:true',observeTo='weaponLevel:save.weapons.mg,gear:{weapons:{...save.weapons},upgrades:{...save.upgrades}},sourceBot:true';
assert.equal(originalAdapter.split(fixtureFrom).length,2,'Fixture transform must match once');
assert.equal(originalAdapter.split(observeFrom).length,2,'Observer transform must match once');
const candidateAdapter=originalAdapter.replace(fixtureFrom,fixtureTo).replace(observeFrom,observeTo),toolRoot=await mkdtemp(join(tmpdir(),'bakasun-pigs-gear-tools-'));
await writeFile(join(toolRoot,'pigs-bench.mjs'),candidateAdapter);
const nativeGame=await readFile(join(sourceRoot,'workout/island/minigames/boar-island/game.js'),'utf8'),benchSaveSource=nativeGame.match(/function benchSave\(w\)\{[^\n]+/)?.[0];
assert.ok(benchSaveSource,'Native benchSave was not found');
const expectedGear={weapons:{mg:4,shotgun:4,cannon:4,tesla:4},upgrades:{armor:3,cooling:3,rocket:3,frost:2,turret:2}};
const toolHashes={'probe-pigs-gear.mjs':sha256(await readFile(fileURLToPath(import.meta.url))),'adapters/pigs.mjs':sha256(originalAdapter),'profiles.mjs':sha256(await readFile(join(here,'profiles.mjs')))};
const data={schemaVersion:1,game:'boarDefense',baseCommit:manifest.baseCommit,sourceDigest:manifest.sourceDigest,toolHashes,baselineFile:'data/pigs-tail-stress.json',baselineFileHash:sha256(await readFile(baselinePath)),
 setup:{stages:[35,40],seeds:[1701,1702,1703,1704,1705,1706,1707,1708],profiles,pairedTrials:48,fixture:'Native benchSave(stage)',benchSaveSource,expectedGear,
  interpretation:'The native graphics benchmark loadout is a controlled equipment sensitivity cohort. It is not an estimate of gear a human would own at these waves.',
  controller:'Unchanged source QA bot, same reaction/error/lapse values, same seeds, current weapon mg, stay:true; other owned weapons are not automatically selected.',
  copiedHarnessChanges:[{from:fixtureFrom,to:fixtureTo,purpose:'Call the existing native loadout fixture'},{from:observeFrom,to:observeTo,purpose:'Read the actual weapon rank and upgrade loadout instead of a hard-coded rank-1 diagnostic'}],
  copiedCandidateAdapterHash:sha256(candidateAdapter),nativeGameAndOriginalAdapterUnchanged:true},
 trials:[],summary:[],replay:null,verification:{sourceHashesBefore:false,sourceHashesAfter:false,originalAdapterUnchanged:false,toolsUnchanged:false,complete:false}};
async function save(){await mkdir(dirname(output),{recursive:true});await writeFile(output+'.tmp',JSON.stringify(data)+'\n');await rename(output+'.tmp',output);}
const adapter=await import(pathToFileURL(join(toolRoot,'pigs-bench.mjs')).href);
try{
 data.verification.sourceHashesBefore=await verifyHashes();await save();
 for(const before of baseline.trials){
  const profile=profiles.find(p=>p.id===before.profile);assert.ok(profile,'Unknown baseline profile');
  const candidate=await adapter.runTrial({sourceRoot,stage:before.stage,seed:before.seed,profile});
  assert.equal(candidate.diagnostics.weaponLevel,4,'Native MG rank was not 4');
  for(const [kind,values]of Object.entries(expectedGear))for(const [id,rank]of Object.entries(values))assert.equal(candidate.diagnostics.gear[kind][id],rank,'Native gear mismatch: '+kind+'.'+id);
  data.trials.push({stage:before.stage,profile:before.profile,seed:before.seed,baseline:before,candidate});await save();
  if(data.trials.length%8===0){const rows=data.trials.slice(-8);console.log(JSON.stringify({stage:before.stage,profile:before.profile,baselineWins:rows.filter(r=>r.baseline.outcome==='win').length,candidateWins:rows.filter(r=>r.candidate.outcome==='win').length,completed:data.trials.length}));}
 }
 for(const stage of [35,40])for(const profile of profiles){const rows=data.trials.filter(r=>r.stage===stage&&r.profile===profile.id),mean=(side,key)=>rows.reduce((sum,r)=>sum+r[side][key],0)/rows.length;
  data.summary.push({stage,profile:profile.id,n:rows.length,baselineWins:rows.filter(r=>r.baseline.outcome==='win').length,candidateWins:rows.filter(r=>r.candidate.outcome==='win').length,baselineMeanSeconds:mean('baseline','seconds'),candidateMeanSeconds:mean('candidate','seconds'),baselineMeanKilled:mean('baseline','score'),candidateMeanKilled:mean('candidate','score')});}
 const first=data.trials[0],again=await adapter.runTrial({sourceRoot,stage:first.stage,seed:first.seed,profile:profiles.find(p=>p.id===first.profile)});assert.deepEqual(again,first.candidate,'Gear replay changed after other stage/profiles');
 data.replay={stage:first.stage,profile:first.profile,seed:first.seed,exactJsonMatch:true,firstHash:sha256(JSON.stringify(first.candidate)),replayHash:sha256(JSON.stringify(again))};
 data.verification.sourceHashesAfter=await verifyHashes();
 data.verification.originalAdapterUnchanged=sha256(await readFile(adapterPath))===toolHashes['adapters/pigs.mjs'];assert.equal(data.verification.originalAdapterUnchanged,true);
 for(const [path,hash]of Object.entries(toolHashes))assert.equal(sha256(await readFile(join(here,path))),hash,'Tool changed during simulation: '+path);
 data.verification.toolsUnchanged=true;data.verification.complete=true;await save();console.log(JSON.stringify({complete:true,pairedTrials:data.trials.length,extraReplayTrials:1,summary:data.summary}));
}finally{await adapter.cleanup();await rm(toolRoot,{recursive:true,force:true});if(snapshot)await snapshot.cleanup();}
