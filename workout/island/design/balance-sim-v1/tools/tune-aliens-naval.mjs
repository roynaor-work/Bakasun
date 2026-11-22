#!/usr/bin/env node
/** Paired holdout experiment. The engine must already be copied outside the checkout. */
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runTrial as aliens} from './adapters/aliens.mjs';
import {runTrial as naval} from './adapters/naval.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../../../..');
const args=process.argv.slice(2),at=args.indexOf('--source-root');
if(at<0)throw Error('Pass --source-root pointing to the isolated copy made by run.mjs.');
const sourceRoot=await realpath(args[at+1]);
if(sourceRoot===await realpath(repo))throw Error('Refusing the working checkout: use an isolated source copy.');
const nAt=args.indexOf('--seeds'),seeds=nAt>=0?Number(args[nAt+1]):16;
if(!Number.isInteger(seeds)||seeds<1)throw Error('Invalid seed count');
const text=await readFile(join(sourceRoot,'workout/island/data/config.json'),'utf8'),config=JSON.parse(text);
const profiles=[{id:'impatient',reactionSeconds:.45,aimError:.22,lapseProbability:.16,patienceSeconds:90},{id:'regular',reactionSeconds:.25,aimError:.10,lapseProbability:.06,patienceSeconds:180},{id:'skilled',reactionSeconds:.10,aimError:.03,lapseProbability:.015,patienceSeconds:300}];
const experiments=[
 {id:'alien-stage10-extra-life',game:'alienDefense',stage:10,parameter:'minigames.alienDefense.levels[9].lives',current:5,proposed:6,run:aliens,apply:c=>c.minigames.alienDefense.levels[9].lives=6},
 {id:'naval-stage24-three-cannons',game:'navalDuel',stage:24,parameter:'minigames.navalDuel.levels[23].fleet[5].cannons',current:4,proposed:3,run:naval,apply:c=>c.minigames.navalDuel.levels[23].fleet[5].cannons=3},
 {id:'naval-stage24-base-hp',game:'navalDuel',stage:24,parameter:'minigames.navalDuel.levels[23].fleet[5].hpScale',current:4,proposed:3,run:naval,apply:c=>c.minigames.navalDuel.levels[23].fleet[5].hpScale=3}
];
const out={schemaVersion:1,sourceConfigSha256:createHash('sha256').update(text).digest('hex'),seedStart:10001,seedsPerProfile:seeds,dt:1/60,profiles,experiments:[]};
const pick=args.indexOf('--experiment'),selected=pick>=0?args[pick+1]:null;
const output=join(here,'../data/tuning-aliens-naval.json');
if(selected){const previous=JSON.parse(await readFile(output,'utf8'));if(previous.sourceConfigSha256!==out.sourceConfigSha256||previous.seedsPerProfile!==seeds)throw Error('Cannot append experiments from another source or seed count');out.experiments=previous.experiments.filter(e=>e.id!==selected);}
for(const experiment of experiments.filter(e=>!selected||e.id===selected)){
 const {run,apply,...metadata}=experiment,modified=structuredClone(config);apply(modified);const rows=[];
 for(const profile of profiles){
  for(let i=0;i<seeds;i++){const seed=10001+i,ctx={sourceRoot,stage:experiment.stage,profile,seed};const before=await run({...ctx,config}),after=await run({...ctx,config:modified});rows.push({profile:profile.id,seed,before,after});}
  process.stderr.write(`${experiment.id}: ${profile.id} ${seeds} pairs\n`);
 }
 const mean=(a,f)=>a.reduce((sum,row)=>sum+f(row),0)/a.length;
 const summary=profiles.map(p=>{const a=rows.filter(row=>row.profile===p.id);return{profile:p.id,n:a.length,beforeWinPct:100*mean(a,row=>Number(row.before.outcome==='win')),afterWinPct:100*mean(a,row=>Number(row.after.outcome==='win')),beforeMeanSeconds:mean(a,row=>row.before.seconds),afterMeanSeconds:mean(a,row=>row.after.seconds),beforeMeanStars:mean(a,row=>row.before.stars),afterMeanStars:mean(a,row=>row.after.stars),gainedWins:a.filter(row=>row.before.outcome!=='win'&&row.after.outcome==='win').length,lostWins:a.filter(row=>row.before.outcome==='win'&&row.after.outcome!=='win').length};});
 out.experiments.push({...metadata,summary,trials:rows});
}
await writeFile(output,JSON.stringify(out,null,2)+'\n');
process.stdout.write(JSON.stringify(out.experiments.map(({id,summary})=>({id,summary})),null,2)+'\n');
