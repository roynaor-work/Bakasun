#!/usr/bin/env node
/** Sensitivity to the same successful-renderer initialization used in
 * alien-view.mjs:53. The baseline controller and all gameplay files stay intact.
 * Both arms run from copies; only a wrapper in the second copy sets shipV13=true
 * immediately after construction. This isn't a balance change or a forced result.
 * node workout/island/design/balance-sim-v1/tools/probe-alien-muzzle.mjs [--seeds 16]
 */
import {readFile,writeFile,cp,mkdtemp,rename,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createSnapshot,copyTools,sha256} from './snapshot.mjs';
import {profiles} from './profiles.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../../../..');
const nAt=process.argv.indexOf('--seeds'),n=nAt<0?16:Number(process.argv[nAt+1]);
if(!Number.isInteger(n)||n<1)throw Error('Invalid seed count');
const snapshot=await createSnapshot(repo),variantRoot=await mkdtemp(join(tmpdir(),'bakasun-alien-muzzle-'));
try{
 const toolHashes=await copyTools(repo,snapshot.sourceRoot);
 const {runTrial}=await import(pathToFileURL(join(snapshot.sourceRoot,'workout/island/design/balance-sim-v1/tools/adapters/aliens.mjs')).href);
 await cp(snapshot.sourceRoot,variantRoot,{recursive:true});
 const path='workout/island/minigames/alien-flight-model.mjs',modelPath=join(variantRoot,path),basePath=join(variantRoot,'workout/island/minigames/alien-flight-model-probe-base.mjs');
 const originalModel=await readFile(modelPath);
 const wrapper="import {createAlienModel as base} from './alien-flight-model-probe-base.mjs';\nexport function createAlienModel(options){const model=base(options);model.shipV13=true;return model;}\n";
 await rename(modelPath,basePath);await writeFile(modelPath,wrapper);
 const config=JSON.parse(await readFile(join(snapshot.sourceRoot,'workout/island/data/config.json'),'utf8'));
 const out={schemaVersion:1,baseCommit:snapshot.manifest.baseCommit,sourceDigest:snapshot.manifest.sourceDigest,sourceModelSha256:sha256(originalModel),controllerSha256:toolHashes['adapters/aliens.mjs'],wrapperSha256:sha256(wrapper),wrapper,sourceInitialization:'workout/island/minigames/alien-view.mjs:53',method:'same bot, engine seed and timestep; fallback shipV13=false versus successful-view initialization shipV13=true at construction; no source checkout writes',stages:[1,10,30],seedStart:20001,seedsPerProfile:n,dt:1/60,profiles,geometry:{fallback:{shipV13:false,cannonOffset:config.minigames.alienDefense.v12.cannonOffset,shotOriginForward:config.minigames.alienDefense.playerRadius},primary:{shipV13:true,cannonOffset:config.minigames.alienDefense.v13.cannonOffset,shotOriginForward:config.minigames.alienDefense.v13.muzzleForward}},trials:[],summary:[]};
 for(const stage of out.stages)for(const profile of profiles){
  const rows=[];
  for(let i=0;i<n;i++){
   const seed=out.seedStart+i,args={config,stage,profile,seed};
   const fallback=await runTrial({...args,sourceRoot:snapshot.sourceRoot}),primary=await runTrial({...args,sourceRoot:variantRoot});
   rows.push({stage,profile:profile.id,seed,fallback,primary});
  }
  out.trials.push(...rows);
  const mean=f=>rows.reduce((sum,row)=>sum+f(row),0)/n;
  const difference=f=>{const values=rows.map(row=>f(row.primary)-f(row.fallback)),avg=values.reduce((a,b)=>a+b,0)/n,variance=values.reduce((a,b)=>a+(b-avg)**2,0)/Math.max(1,n-1),se=Math.sqrt(variance/n);return{mean:avg,normal95:[avg-1.96*se,avg+1.96*se]};};
  const fallbackWinPct=100*mean(row=>Number(row.fallback.outcome==='win')),primaryWinPct=100*mean(row=>Number(row.primary.outcome==='win')),fallbackMeanSeconds=mean(row=>row.fallback.seconds),primaryMeanSeconds=mean(row=>row.primary.seconds),fallbackMeanStars=mean(row=>row.fallback.stars),primaryMeanStars=mean(row=>row.primary.stars);
  const d={stage,profile:profile.id,n,fallbackWinPct,primaryWinPct,winPp:primaryWinPct-fallbackWinPct,gainedWins:rows.filter(row=>row.fallback.outcome!=='win'&&row.primary.outcome==='win').length,lostWins:rows.filter(row=>row.fallback.outcome==='win'&&row.primary.outcome!=='win').length,fallbackMeanSeconds,primaryMeanSeconds,seconds:difference(row=>row.seconds),timeChangePct:100*(primaryMeanSeconds/fallbackMeanSeconds-1),fallbackMeanStars,primaryMeanStars,stars:difference(row=>row.stars),damage:difference(row=>row.diagnostics.damage),changedOutcomes:rows.filter(row=>row.fallback.outcome!==row.primary.outcome).length};
  d.descriptiveMaterialFlag=Math.abs(d.winPp)>=10||Math.abs(d.timeChangePct)>=10||Math.abs(d.stars.mean)>=.25;
  out.summary.push(d);process.stderr.write(`stage ${stage} ${profile.id}: ${n} pairs\n`);
 }
 // A repeated case verifies both arms independently, including seed zero.
 out.replayChecks=[];for(const [arm,sourceRoot] of [['fallback',snapshot.sourceRoot],['primary',variantRoot]]){const args={sourceRoot,config,stage:1,profile:profiles[1],seed:0},a=await runTrial(args),b=await runTrial(args);if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${arm} replay mismatch`);out.replayChecks.push({arm,stage:1,seed:0,passed:true});}
 await snapshot.verify();out.sourceUnchanged=true;
 out.cautions=['16 paired seeds per stage/profile are a sensitivity screen, not proof of equivalence.','Thresholds flag descriptive changes (10 percentage points wins, 10% mean time, or 0.25 mean stars); they are not a calibrated product acceptance gate.','Time means include losses; check paired outcomes and raw rows before treating a duration difference as faster completion.','The real view initializes this flag after the asset finishes loading; this probe uses true from the first simulation frame to isolate successful-view geometry.'];
 await writeFile(join(here,'../data/alien-muzzle-sensitivity.json'),JSON.stringify(out,null,2)+'\n');
 process.stdout.write(JSON.stringify(out.summary,null,2)+'\n');
}finally{await snapshot.cleanup();await rm(variantRoot,{recursive:true,force:true});}
