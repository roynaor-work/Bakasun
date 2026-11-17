#!/usr/bin/env node
/** Sensitivity to legal, purchasable tennis equipment. Physics and stage data
 * stay unchanged; the public constructor receives rank 3 instead of rank 1.
 */
import {cp,mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {runTrial} from './adapters/tennis.mjs';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../../../..');
const out=resolve(process.argv[2]||join(here,'../data/tennis-gear-sensitivity.json'));
const sourceRoot=await mkdtemp(join(tmpdir(),'balance-tennis-gear-'));
const profiles=[{id:'regular',reactionSeconds:.25,aimError:.10,lapseProbability:.06,patienceSeconds:180},{id:'skilled',reactionSeconds:.10,aimError:.03,lapseProbability:.015,patienceSeconds:300}];
const seeds=Array.from({length:16},(_,i)=>1001+i),stages=[20,30],ranks={speed:3,hit:3,serve:3};
const config=JSON.parse(await readFile(join(root,'workout/island/data/config.json'),'utf8'));
const summarise=rows=>({n:rows.length,wins:rows.filter(r=>r.outcome==='win').length,winPct:100*rows.filter(r=>r.outcome==='win').length/rows.length,meanSeconds:rows.reduce((s,r)=>s+r.seconds,0)/rows.length,meanStars:rows.reduce((s,r)=>s+r.stars,0)/rows.length,completedWithinPatience:rows.filter(r=>r.diagnostics.completedWithinPatience).length,threeStars:rows.filter(r=>r.stars===3).length,meanGamesWon:rows.reduce((s,r)=>s+r.score,0)/rows.length});
try{
 await mkdir(join(sourceRoot,'workout/island/minigames'),{recursive:true});
 for(const file of ['tennis.mjs','tennis-result.mjs'])await cp(join(root,'workout/island/minigames',file),join(sourceRoot,'workout/island/minigames',file));
 const rows=[],cells=[];
 for(const stage of stages)for(const profile of profiles){
  const before=[],after=[];
  for(const seed of seeds){const a=await runTrial({sourceRoot,config,stage,profile,seed}),b=await runTrial({sourceRoot,config,stage,profile,seed,variant:{ranks}});rows.push({stage,profile:profile.id,seed,baseline:a,upgraded:b});before.push(a);after.push(b);}
  const a=summarise(before),b=summarise(after);cells.push({stage,profile:profile.id,baseline:a,upgraded:b,delta:{winPercentagePoints:b.winPct-a.winPct,meanSeconds:b.meanSeconds-a.meanSeconds,meanStars:b.meanStars-a.meanStars},pairedWinTransitions:{gainedWin:before.filter((r,i)=>r.outcome!=='win'&&after[i].outcome==='win').length,lostWin:before.filter((r,i)=>r.outcome==='win'&&after[i].outcome!=='win').length}});
  process.stderr.write(`tennis gear stage ${stage} ${profile.id}: ${a.wins}→${b.wins} wins /16; ${a.meanSeconds.toFixed(1)}→${b.meanSeconds.toFixed(1)}s\n`);
 }
 const result={schemaVersion:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),method:'paired full matches; same bot, stage, seed and config; only public player equipment ranks differ',comparison:{baseline:config.minigames.tennis.player.defaults,upgraded:ranks},stages,seeds,profiles,cells,rows,limitations:['Sensitivity evidence is not a simulated purchasing campaign. Upgrade prices, accrued coins and unlock stars are not bypassed or measured.','Only regular/skilled bots and stages 20/30 are tested in this supplementary cohort.','The main curve remains at fresh rank 1 equipment for every stage.']};
 await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');
}finally{await rm(sourceRoot,{recursive:true,force:true});}
