#!/usr/bin/env node
/** Paired, full-native-match check of one quick-game duration candidate.
 * Copies the implementation before importing it. No source file is edited.
 * node workout/island/design/balance-sim-v1/tools/probe-hoops.mjs
 */
import {cp,mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {runTrial} from './adapters/hoops.mjs';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../../../..');
const out=resolve(process.argv[2]||join(here,'../data/tuning-hoops.json'));
const sourceRoot=await mkdtemp(join(tmpdir(),'balance-hoops-tuning-'));
const profiles=[{id:'regular',reactionSeconds:.25,aimError:.10,lapseProbability:.06,patienceSeconds:180},{id:'skilled',reactionSeconds:.10,aimError:.03,lapseProbability:.015,patienceSeconds:300}];
const seeds=Array.from({length:16},(_,i)=>1001+i),stages=[1,5,10];
const config=JSON.parse(await readFile(join(root,'workout/island/data/config.json'),'utf8'));
const candidate=structuredClone(config);candidate.minigames.streetSlam.rules.profiles.quick.quarterSeconds=45;
const parameter={path:'minigames.streetSlam.rules.profiles.quick.quarterSeconds',current:config.minigames.streetSlam.rules.profiles.quick.quarterSeconds,proposed:45};
const summarise=rows=>({n:rows.length,wins:rows.filter(r=>r.outcome==='win').length,winPct:100*rows.filter(r=>r.outcome==='win').length/rows.length,meanSeconds:rows.reduce((s,r)=>s+r.seconds,0)/rows.length,meanStars:rows.reduce((s,r)=>s+r.stars,0)/rows.length,completedWithinPatience:rows.filter(r=>r.diagnostics.completedWithinPatience).length,threeStars:rows.filter(r=>r.stars===3).length,meanMargin:rows.reduce((s,r)=>s+r.diagnostics.margin,0)/rows.length});
try{
 await mkdir(join(sourceRoot,'workout/island/design/tactics'),{recursive:true});
 await cp(join(root,'workout/island/minigames'),join(sourceRoot,'workout/island/minigames'),{recursive:true});
 await cp(join(root,'workout/island/design/tactics/basketball.json'),join(sourceRoot,'workout/island/design/tactics/basketball.json'));
 const rows=[],cells=[];
 for(const stage of stages)for(const profile of profiles){
  const before=[],after=[];
  for(const seed of seeds){
   const a=await runTrial({sourceRoot,config,stage,profile,seed}),b=await runTrial({sourceRoot,config:candidate,stage,profile,seed});
   rows.push({stage,profile:profile.id,seed,baseline:a,candidate:b});before.push(a);after.push(b);
  }
  const a=summarise(before),b=summarise(after);cells.push({stage,profile:profile.id,baseline:a,candidate:b,delta:{winPercentagePoints:b.winPct-a.winPct,meanSeconds:b.meanSeconds-a.meanSeconds,meanStars:b.meanStars-a.meanStars,completedWithinPatience:b.completedWithinPatience-a.completedWithinPatience},pairedWinTransitions:{bothWin:before.filter((r,i)=>r.outcome==='win'&&after[i].outcome==='win').length,gainedWin:before.filter((r,i)=>r.outcome!=='win'&&after[i].outcome==='win').length,lostWin:before.filter((r,i)=>r.outcome==='win'&&after[i].outcome!=='win').length}});
  process.stderr.write(`hoops tuning stage ${stage} ${profile.id}: ${a.meanSeconds.toFixed(1)}→${b.meanSeconds.toFixed(1)}s; ${a.wins}→${b.wins} wins /16\n`);
 }
 const result={schemaVersion:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),method:'paired independent full matches; same stage, bot and seeds; only the listed config parameter changes',parameter,stages,seeds,profiles,cells,rows,limitations:['16 paired seeds per cell are directional evidence; shorter matches can increase outcome variance.','Only regular and skilled bots, stages 1,5,10, are in this duration probe.','Replay presentation and loading time are excluded, as in the primary logic simulation.','Overtime length remains 45 seconds; the candidate changes regulation quarters only.']};
 await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');
}finally{await rm(sourceRoot,{recursive:true,force:true});}
