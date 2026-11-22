#!/usr/bin/env node
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {availableParallelism} from 'node:os';
import {createSnapshot,copyTools,sha256} from './snapshot.mjs';
import {profiles,adapters} from './profiles.mjs';

const here=dirname(fileURLToPath(import.meta.url)),repoRoot=resolve(here,'../../../../..');
const argv=process.argv.slice(2),arg=(name,fallback)=>{const i=argv.indexOf(`--${name}`);return i<0?fallback:argv[i+1];};
if(argv.includes('--help')){
  console.log('node tools/run.mjs [--games soccer,streetSlam,...] [--stages 1,2] [--profiles regular] [--samples 32] [--seed-start 1701] [--jobs 4] [--output /tmp/balance-data] [--keep-copy]\nAll gameplay runs on a disposable source copy. Matching completed trials are resumed. Output is confined to this package or /tmp.');
  process.exit(0);
}
const samples=Number(arg('samples',32)),seedStart=Number(arg('seed-start',1701)),jobs=Number(arg('jobs',Math.min(4,availableParallelism())));
if(!Number.isSafeInteger(samples)||samples<1||!Number.isSafeInteger(seedStart)||seedStart<0||!Number.isSafeInteger(jobs)||jobs<1)throw new Error('Invalid samples, seed-start or jobs');
const selectedGames=arg('games','').split(',').filter(Boolean),selectedStages=arg('stages','').split(',').filter(Boolean).map(Number),selectedProfiles=arg('profiles','').split(',').filter(Boolean);
const stopFile=arg('stop-file',null);
const output=resolve(arg('output',join(here,'../data'))),pack=resolve(here,'..');
if(!(output===pack||output.startsWith(pack+'/')||output.startsWith('/tmp/')))throw new Error('Output must be inside this new package or /tmp');
await mkdir(output,{recursive:true});
const snapshot=await createSnapshot(repoRoot),modules=[],workers=[];
await copyTools(repoRoot,snapshot.sourceRoot);
const copiedTools=join(snapshot.sourceRoot,'workout/island/design/balance-sim-v1/tools');
const writes=new Map();
function atomic(path,value){
  const next=(writes.get(path)||Promise.resolve()).then(async()=>{
    const temporary=path+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,JSON.stringify(value)+'\n');await rename(temporary,path);
  });
  writes.set(path,next);return next;
}
try{
  let previousManifest;
  try{previousManifest=JSON.parse(await readFile(join(output,'source-manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(previousManifest&&previousManifest.sourceDigest!==snapshot.manifest.sourceDigest)throw new Error('Output contains another game-source snapshot. Use a new --output directory.');
  // A commit that adds this report changes Git HEAD without changing any game
  // source bytes. Keep the measured revision on resume, and record invocation
  // HEAD separately; identity of the copied game is its full source digest.
  const measuredBaseCommit=previousManifest?.baseCommit||snapshot.manifest.baseCommit;
  const botProfiles=profiles.filter(p=>!selectedProfiles.length||selectedProfiles.includes(p.id));
  if(!botProfiles.length)throw new Error('No matching profiles');
  for(const name of adapters){
    try{const m=await import(pathToFileURL(join(copiedTools,`adapters/${name}.mjs`)));modules.push({name,m});}
    catch(e){if(!selectedGames.length||e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
  }
  const metadata=modules.flatMap(({name,m})=>m.games.map(g=>({...g,adapter:name}))).filter(g=>!selectedGames.length||selectedGames.includes(g.id));
  for(const id of selectedGames)if(!metadata.some(g=>g.id===id))throw new Error(`Unknown game: ${id}`);
  const toolHashes={};
  for(const name of new Set(['profiles.mjs','worker.mjs',...modules.map(m=>`adapters/${m.name}.mjs`),...metadata.flatMap(g=>g.toolDependencies||[])]))toolHashes[name]=sha256(await readFile(join(copiedTools,name)));
  const fingerprint=sha256(JSON.stringify({source:snapshot.manifest.sourceDigest,tools:toolHashes}));
  const allData=new Map(),queue=[];
  for(const game of metadata){
    const gameFingerprint=sha256(JSON.stringify({source:snapshot.manifest.sourceDigest,profiles:toolHashes['profiles.mjs'],worker:toolHashes['worker.mjs'],adapter:toolHashes[`adapters/${game.adapter}.mjs`],...((game.toolDependencies||[]).length?{dependencies:Object.fromEntries(game.toolDependencies.map(p=>[p,toolHashes[p]]))}:{})}));
    let prior;
    try{prior=JSON.parse(await readFile(join(output,`baseline-${game.id}.json`),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(prior&&prior.fingerprint!==gameFingerprint)throw new Error(`Cannot resume ${game.id}: source or controller changed. Use a new --output directory.`);
    const data=prior||{schemaVersion:1,fingerprint:gameFingerprint,baseCommit:measuredBaseCommit,sourceDigest:snapshot.manifest.sourceDigest,game,profiles,trials:[]};
    allData.set(game.id,data);
    const done=new Set(data.trials.map(r=>`${r.stage}:${r.profile}:${r.seed}`));
    for(const stage of game.stages.filter(s=>!selectedStages.length||selectedStages.includes(s)))for(const profile of botProfiles){
      const seeds=Array.from({length:samples},(_,i)=>seedStart+i).filter(seed=>!done.has(`${stage}:${profile.id}:${seed}`));
      for(let start=0;start<seeds.length;start+=4)queue.push({key:`${game.id}:${stage}:${profile.id}:${seeds[start]}`,adapter:game.adapter,game:game.id,stage,profile,seeds:seeds.slice(start,start+4)});
    }
    await atomic(join(output,`baseline-${game.id}.json`),data);
    const mod=modules.find(m=>m.name===game.adapter).m;
    if(mod.auditStages)await atomic(join(output,`${game.id}-stage-audit.json`),await mod.auditStages({sourceRoot:snapshot.sourceRoot,config:JSON.parse(await readFile(join(snapshot.sourceRoot,'workout/island/data/config.json'),'utf8'))}));
  }
  await atomic(join(output,'source-manifest.json'),{...snapshot.manifest,baseCommit:measuredBaseCommit,invocationHead:snapshot.manifest.baseCommit,toolHashes,fingerprint,profiles,method:'60Hz native logic, full completion, fresh state per trial, seeded independent input errors; patience is descriptive, not a stop rule'});
  console.log(JSON.stringify({source:snapshot.manifest.baseCommit,snapshot:snapshot.sourceRoot,cells:queue.length,trials:queue.reduce((n,j)=>n+j.seeds.length,0),workers:jobs}));
  let completed=0,failed;
  async function useWorker(){
    const worker=new Worker(pathToFileURL(join(copiedTools,'worker.mjs')),{workerData:{sourceRoot:snapshot.sourceRoot}});workers.push(worker);
    function request(job){return new Promise((res,rej)=>{
      if(worker.threadId===-1){rej(new Error('Worker already exited'));return;}
      let timer;
      const clean=()=>{worker.off('message',onMessage);worker.off('error',onError);worker.off('exit',onExit);clearTimeout(timer);};
      const onMessage=x=>{clean();res(x);},onError=e=>{clean();rej(e);},onExit=code=>onError(new Error(`Worker exited before response (${code})`));
      worker.once('message',onMessage);worker.once('error',onError);worker.once('exit',onExit);
      if(job.cleanup)timer=setTimeout(()=>onError(new Error('Worker cleanup timed out')),15000);
      worker.postMessage(job);
    });}
    try{
      while(queue.length&&!failed){
        if(stopFile){try{await readFile(resolve(stopFile));break;}catch(e){if(e.code!=='ENOENT')throw e;}}
        const job=queue.shift(),result=await request(job);
        if(result.error)throw new Error(`${job.key}: ${result.error}`);
        const data=allData.get(job.game);data.trials.push(...result.rows);data.trials.sort((a,b)=>a.stage-b.stage||a.profile.localeCompare(b.profile)||a.seed-b.seed);
        await atomic(join(output,`baseline-${job.game}.json`),data);
        completed++;console.log(JSON.stringify({cell:job.key,n:result.rows.length,wins:result.rows.filter(r=>r.outcome==='win').length,completed,remaining:queue.length}));
      }
    }catch(e){failed=e;console.error(e.stack);}
    finally{try{if(worker.threadId!==-1)await request({cleanup:true});}catch(e){console.error(e.message);}await worker.terminate();}
  }
  await Promise.all(Array.from({length:Math.min(jobs,Math.max(1,queue.length))},useWorker));
  const originalsUnchanged=await snapshot.verify();
  await atomic(join(output,`run-verification-${metadata.map(g=>g.id).join('-')}.json`),{baseCommit:measuredBaseCommit,invocationHead:snapshot.manifest.baseCommit,originalsUnchanged,completedCells:completed,errors:failed?[failed.message]:[],coverage:metadata.map(g=>({id:g.id,stages:g.stages.length,trials:allData.get(g.id).trials.length})),sourceDigest:snapshot.manifest.sourceDigest});
  if(failed)throw failed;
}finally{
  for(const worker of workers)await worker.terminate();
  for(const {m} of modules)await m.cleanup?.();
  if(!argv.includes('--keep-copy'))await snapshot.cleanup();
}
