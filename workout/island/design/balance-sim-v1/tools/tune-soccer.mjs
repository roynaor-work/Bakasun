#!/usr/bin/env node
/** Paired duration sensitivity on a freshly copied, hashed source snapshot.
 * node workout/island/design/balance-sim-v1/tools/tune-soccer.mjs
 * Optional: --repo /path/to/Bakasun --output /tmp/tuning.json --seeds 16.
 * Writes only the requested output and its private temporary source copy. */
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {runTrial,auditStages} from './adapters/soccer.mjs';
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const repo=resolve(get('--repo',fileURLToPath(new URL('../../../../../',import.meta.url))));
const output=resolve(get('--output',join(repo,'workout/island/design/balance-sim-v1/data/tuning-soccer.json')));
const seedCount=Number(get('--seeds','16')),workers=Number(get('--workers','4'));
if(!Number.isInteger(workers)||workers<1||workers>8)throw Error('workers must be1..8');
if(!Number.isInteger(seedCount)||seedCount<1||seedCount>1000)throw Error('seeds must be1..1000');
const work=await mkdtemp(join(tmpdir(),'bakasun-soccer-tune-')),sourceRoot=join(work,'source');
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const baseCommit=git('rev-parse','HEAD'),adapterSha256=createHash('sha256').update(await readFile(new URL('./adapters/soccer.mjs',import.meta.url))).digest('hex');
const paths=git('ls-files','--','workout/island/minigames','workout/island/activity','workout/island/engine','workout/island/data','workout/island/design/tactics/soccer.json').split('\n').filter(p=>/\.(mjs|js|json)$/.test(p));
const manifest=[];
for(const path of paths){const bytes=await readFile(join(repo,path)),destination=join(sourceRoot,path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes);manifest.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
const config=JSON.parse(await readFile(join(sourceRoot,'workout/island/data/config.json'),'utf8'));
const stages=[1,6,10,11,15],seeds=Array.from({length:seedCount},(_,i)=>1701+i);
const profiles=[{id:'impatient',reactionSeconds:.45,aimError:.22,lapseProbability:.16,patienceSeconds:90},{id:'regular',reactionSeconds:.25,aimError:.10,lapseProbability:.06,patienceSeconds:180},{id:'skilled',reactionSeconds:.10,aimError:.03,lapseProbability:.015,patienceSeconds:300}];
const candidate=structuredClone(config);candidate.minigames.soccer.fullTune={...candidate.minigames.soccer.fullTune,halfSeconds:40};
const rows=[];
try{
  const started=performance.now();
  let completedSeeds=0;
  await Promise.all(Array.from({length:Math.min(workers,seeds.length)},(_,index)=>new Promise((resolve,reject)=>{
    const assigned=seeds.filter((_,i)=>i%Math.min(workers,seeds.length)===index);
    const worker=new Worker(new URL('./tune-soccer-worker.mjs',import.meta.url),{workerData:{sourceRoot,seeds:assigned,stages,profiles}});
    worker.on('message',message=>{rows.push(...message.rows);completedSeeds++;process.stderr.write(`soccer tuning ${completedSeeds}/${seedCount} paired seeds; ${rows.length*2} trials; ${((performance.now()-started)/1000).toFixed(1)} s elapsed\n`);});
    worker.on('error',reject);worker.on('exit',code=>code===0?resolve():reject(Error(`soccer worker exited ${code}`)));
  })));
  rows.sort((a,b)=>a.seed-b.seed||a.stage-b.stage||profiles.findIndex(p=>p.id===a.profile)-profiles.findIndex(p=>p.id===b.profile));
  const metric={winRate:r=>+(r.outcome==='win'),meanSeconds:r=>r.seconds,meanStars:r=>r.stars,meanFalls:r=>r.falls,objectiveCompletionRate:r=>+r.objectives.every(o=>o.complete),withinPatienceRate:r=>+r.diagnostics.withinPatience};
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,round=x=>Math.round(x*1e6)/1e6;
  function bootstrap95(values){let n=715239;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};const samples=[];for(let i=0;i<2000;i++){let sum=0;for(let j=0;j<values.length;j++)sum+=values[Math.floor(random()*values.length)];samples.push(sum/values.length);}samples.sort((a,b)=>a-b);return [round(samples[49]),round(samples[1949])];}
  function summarize(group){const bySeed=new Map();for(const r of group){if(!bySeed.has(r.seed))bySeed.set(r.seed,[]);bySeed.get(r.seed).push(r);}return Object.fromEntries(Object.entries(metric).map(([id,value])=>{const base=group.map(r=>value(r.baseline)),change=group.map(r=>value(r.candidate)),deltas=[...bySeed.values()].map(block=>mean(block.map(r=>value(r.candidate)-value(r.baseline))));return [id,{baseline:round(mean(base)),candidate:round(mean(change)),delta:round(mean(change)-mean(base)),pairedSeedBootstrap95:bootstrap95(deltas)}];}));}
  const groups=stages.flatMap(stage=>profiles.map(p=>{const group=rows.filter(r=>r.stage===stage&&r.profile===p.id);return {stage,profile:p.id,pairs:group.length,metrics:summarize(group)};}));
  const profileSummaries=profiles.map(p=>{const group=rows.filter(r=>r.profile===p.id);return {profile:p.id,pairs:group.length,metrics:summarize(group)};});
  const result={schemaVersion:1,game:'soccer',baseCommit,adapterSha256,sourceManifest:manifest,method:{paired:true,seeds,stages,profiles,stepSeconds:1/60,modelRandom:'Native createSoccer seededRandom default (Mulberry32), independent bot RNG; the browser session supplies context.seededRandom (LCG), so seed IDs do not promise exact browser replay. All gameplay flags and config transforms match browser defaults.',baseline:'Shipped browser: applySoccerFull v241:true; SOCCER_FULL.halfSeconds90; full default4-4-2; AIv2/rulesv1/feelv2/switchv23/airv23/v241 all enabled.',candidate:'Same source and initial roster, config copy minigames.soccer.fullTune.halfSeconds=40, consumed by applySoccerFull; this does not edit game source.',parameter:'SOCCER_FULL.halfSeconds in workout/island/minigames/soccer-full.mjs',current:90,proposed:40,ci:'Exploratory percentile paired bootstrap, 2000 replicates, resampling seed blocks; aggregated stages/profiles share each seed block. Small seed count limits precision; no human calibration.',duration:'Model simulation time including native stoppages; excludes renderer holds, load and bonus penalties.'},trialCount:rows.length*2,aggregate:{pairs:rows.length,metrics:summarize(rows)},profileSummaries,groups,rows};
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');
  const audit=await auditStages({sourceRoot,config});audit.baseCommit=result.baseCommit;await writeFile(join(dirname(output),'soccer-stage-audit.json'),JSON.stringify(audit,null,2)+'\n');
  process.stderr.write(`Wrote ${output}\n`);console.log(JSON.stringify({aggregate:result.aggregate,profileSummaries},null,2));
}finally{await rm(work,{recursive:true,force:true});}
