#!/usr/bin/env node
/** Native browser stress runs of the remaining procedural boss species.
 * --source-root reuses a previously verified disposable copy; without it this
 * script creates and verifies its own copy. Never points the game at the repo.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSnapshot,sha256} from './snapshot.mjs';
import {profiles} from './profiles.mjs';
import {runTrial,cleanup} from './adapters/pigs.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repoRoot=resolve(here,'../../../../..');
const argv=process.argv.slice(2),arg=(name,fallback)=>{const at=argv.indexOf('--'+name);return at<0?fallback:argv[at+1];};
const samples=Number(arg('samples',8)),seedStart=Number(arg('seed-start',1701)),givenRoot=arg('source-root',null);
if(!Number.isInteger(samples)||samples<1||!Number.isInteger(seedStart)||seedStart<0)throw Error('Invalid sample count or seed');
const output=resolve(arg('output',join(here,'../data/pigs-tail-stress.json')));
if(!(output.startsWith(resolve(here,'..')+'/')||output.startsWith('/tmp/')))throw Error('Output must be inside the new package or /tmp');
const snapshot=givenRoot?null:await createSnapshot(repoRoot),sourceRoot=givenRoot?resolve(givenRoot):snapshot.sourceRoot;
if(sourceRoot===repoRoot||sourceRoot.startsWith(repoRoot+'/'))throw Error('Simulation requires a disposable source copy outside the repo');
const manifest=snapshot?.manifest||JSON.parse(await readFile(resolve(arg('manifest',join(here,'../data/source-manifest.json'))),'utf8'));
async function verifyHashes(){for(const [path,hash] of Object.entries(manifest.hashes)){
 assert.equal(sha256(await readFile(join(sourceRoot,path))),hash,'Copied source hash mismatch: '+path);
 assert.equal(sha256(await readFile(join(repoRoot,path))),hash,'Original source hash mismatch: '+path);
}return true;}
const toolHashes={};for(const path of ['stress-pigs-tail.mjs','adapters/pigs.mjs','profiles.mjs'])toolHashes[path]=sha256(await readFile(join(here,path)));
const sourceFiles=['workout/island/minigames/boar-island/core.mjs','workout/island/minigames/boar-island/chain.mjs','workout/island/minigames/boar-island/game.js','workout/island/minigames/boar-island/vendor/three.core.js'];
const data={schemaVersion:1,baseCommit:manifest.baseCommit,sourceDigest:manifest.sourceDigest,toolHashes,
 sourceHashes:Object.fromEntries(sourceFiles.map(p=>[p,manifest.hashes[p]])),sourceRootWasDisposable:true,
 sampling:{stages:[35,40],samplesPerStageProfile:samples,seedStart,seeds:Array.from({length:samples},(_,i)=>seedStart+i),profiles,plannedTrials:samples*2*profiles.length,freshUnupgradedEachWave:true,stars:null,falls:null},
 interpretation:'Supplement to measured waves 1–30. Waves 35 and 40 complete the first procedural boss species rotation (25 king, 30 hive, 35 turtle, 40 leviathan). The campaign is infinite; no finite sample covers every later wave. No win-rate extrapolation outside measured waves.',
 analytic:null,trials:[],replay:null,verification:{before:false,after:false,toolsUnchanged:false,complete:false}};
async function save(){await mkdir(dirname(output),{recursive:true});await writeFile(output+'.tmp',JSON.stringify(data)+'\n');await rename(output+'.tmp',output);}
try{
 data.verification.before=await verifyHashes();
 const core=await import(pathToFileURL(join(sourceRoot,'workout/island/minigames/boar-island/core.mjs')).href);
 data.analytic={
  finiteCampaign:false,authoredWaves:{first:1,last:20},proceduralWaves:{first:21,last:null,n:'wave - 14',waveScale:1.25},
  hp:{normalScale:'1 + 0.14 * (wave - 1)',bossScale:'1 + 0.35 * max(0, floor(wave/5) - offset)',bossOffsets:{king:1,hive:1,turtle:3,leviathan:4},bossHp:'round(baseHp * normalScale * bossScale)',growth:'Normal enemy HP grows linearly. For each recurring boss species, the product of normalScale and bossScale grows quadratically.'},
  speed:{scale:'1 + 0.02 * min(wave,30)',capStartsAtWave:30,maximumMultiplier:1.6},
  spawnGap:{seconds:'max(0.62, 0.9 - 0.02 * (wave - 14))',floorSeconds:.62,floorStartsAtWave:28},
  pulses:{count:core.PULSES,lullSeconds:core.LULL},
  weather:{periodWaves:6,cycle:['clear','fog','rain','storm','clear','rain'],index:'wave % 6'},
  bosses:{everyWaves:5,order:[...core.BOSSES],speciesPeriodWaves:20,firstFullProceduralRotation:[25,30,35,40].map(wave=>({wave,kind:core.waveBoss(wave)})),combinedBossWeatherSchedulePeriod:60,fullGameplayDoesNotRepeat:'Enemy count and HP continue to grow, so the periodic schedules do not make later waves equivalent.'},
  sampledDescriptors:[21,25,28,30,35,40,60,100].map(wave=>{const plan=core.wavePlan(wave),boss=core.waveBoss(wave);return {wave,weather:core.waveWeather(wave),boss,planEntries:plan.length,lastScheduledSpawnSeconds:plan.at(-1).time,scout:core.enemyStats('scout',wave),bossStats:boss?core.enemyStats(boss,wave):null};}),
 };
 await save();
 for(const stage of [35,40])for(const profile of profiles){
  for(let i=0;i<samples;i++){const seed=seedStart+i;data.trials.push({stage,profile:profile.id,seed,...await runTrial({sourceRoot,stage,seed,profile})});await save();}
  const rows=data.trials.filter(r=>r.stage===stage&&r.profile===profile.id);console.log(JSON.stringify({stage,profile:profile.id,trials:rows.length,wins:rows.filter(r=>r.outcome==='win').length,completed:data.trials.length}));
 }
 // The first measured wave is replayed after every profile and the other boss.
 const first=data.trials[0],profile=profiles.find(p=>p.id===first.profile),again={stage:first.stage,profile:first.profile,seed:first.seed,...await runTrial({sourceRoot,stage:first.stage,seed:first.seed,profile})};
 assert.deepEqual(again,first,'Native replay changed after the other wave/profiles');
 data.replay={stage:first.stage,profile:first.profile,seed:first.seed,afterOtherStageAndProfiles:true,exactJsonMatch:true,originalResultHash:sha256(JSON.stringify(first)),replayedResultHash:sha256(JSON.stringify(again))};
 data.verification.after=await verifyHashes();
 for(const [path,hash] of Object.entries(toolHashes))assert.equal(sha256(await readFile(join(here,path))),hash,'Tool changed during simulation: '+path);
 data.verification.toolsUnchanged=true;data.verification.complete=true;await save();
 console.log(JSON.stringify({complete:true,trials:data.trials.length,extraReplayTrials:1,sourceHashesVerified:Object.keys(manifest.hashes).length,output}));
}finally{await cleanup();if(snapshot)await snapshot.cleanup();}
