#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSnapshot} from './snapshot.mjs';
import {profiles} from './profiles.mjs';
import {runTrial} from './adapters/fire.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repoRoot=resolve(here,'../../../../..');
const argv=process.argv.slice(2),arg=(name,fallback)=>{const at=argv.indexOf('--'+name);return at<0?fallback:argv[at+1];};
const samples=Number(arg('samples',16)),seedStart=Number(arg('seed-start',1701));
const final=argv.includes('--final');
const second=argv.includes('--candidate2')||final;
const output=resolve(arg('output',join(here,final?'../data/tuning-fire-final.json':second?'../data/tuning-fire-candidate2.json':'../data/tuning-fire.json')));
if(!(output.startsWith(resolve(here,'..')+'/')||output.startsWith('/tmp/')))throw Error('Output must be inside the new package or /tmp');
const snapshot=await createSnapshot(repoRoot);
const rows=[],changes=[{stage:7,current:1.4,proposed:second&&!final?1.25:1.15},{stage:8,current:1.85,proposed:1.25},{stage:9,current:2.4,proposed:1.4},{stage:10,current:3.1,proposed:1.55}];
try{
 const config=JSON.parse(await readFile(join(snapshot.sourceRoot,'workout/island/data/config.json'),'utf8'));
 for(const change of changes)for(const profile of profiles){
  const candidate=structuredClone(config);candidate.minigames.fireRescue.levels[change.stage-1].resistance=change.proposed;
  if(second&&change.stage>=9)candidate.minigames.fireRescue.levels[change.stage-1].seconds+=final?(change.stage===9?26:26):(change.stage===9?20:30);
  for(let i=0;i<samples;i++){
   const seed=seedStart+i,args={sourceRoot:snapshot.sourceRoot,stage:change.stage,profile,seed};
   rows.push({stage:change.stage,profile:profile.id,seed,baseline:await runTrial({...args,config}),candidate:await runTrial({...args,config:candidate})});
  }
  console.log(change.stage,profile.id,rows.slice(-samples).filter(r=>r.baseline.outcome==='win').length,rows.slice(-samples).filter(r=>r.candidate.outcome==='win').length);
 }
 const data={candidate:final?'final':second?2:1,extraSeconds:final?{9:26,10:26}:second?{9:20,10:30}:null,schemaVersion:1,baseCommit:snapshot.manifest.baseCommit,sourceDigest:snapshot.manifest.sourceDigest,samples,seedStart,changes:changes.map(c=>({...c,parameter:`minigames.fireRescue.levels[${c.stage-1}].resistance`})),description:'Paired identical engine and bot seeds, one stage resistance override only; no original source changes.',rows,originalsUnchanged:await snapshot.verify()};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(data)+'\n');
}finally{await snapshot.cleanup();}
