import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const config=JSON.parse(await readFile(join(workerData.sourceRoot,'workout/island/data/config.json'),'utf8'));
const loaded=new Map();
async function adapter(name){if(!loaded.has(name))loaded.set(name,await import(new URL(`./adapters/${name}.mjs`,import.meta.url)));return loaded.get(name);}
parentPort.on('message',async job=>{
  if(job.cleanup){
    try{for(const m of loaded.values())await m.cleanup?.();parentPort.postMessage({cleanup:true});}catch(e){parentPort.postMessage({error:e.stack});}
    return;
  }
  try{
    const mod=await adapter(job.adapter),rows=[];
    for(const seed of job.seeds){
      const result=await mod.runTrial({sourceRoot:workerData.sourceRoot,config:structuredClone(config),game:job.game,stage:job.stage,profile:job.profile,seed});
      if(!['win','lose','timeout'].includes(result.outcome))throw new Error(`Invalid outcome ${result.outcome}`);
      if(!Number.isFinite(result.seconds)||result.seconds<0)throw new Error(`Invalid seconds ${result.seconds}`);
      if(result.stars!==null&&(!Number.isInteger(result.stars)||result.stars<0||result.stars>3))throw new Error(`Invalid stars ${result.stars}`);
      if(result.falls!==null&&(!Number.isFinite(result.falls)||result.falls<0))throw new Error(`Invalid falls ${result.falls}`);
      rows.push({game:job.game,stage:job.stage,profile:job.profile.id,seed,...result,withinPatience:result.seconds<=job.profile.patienceSeconds});
    }
    parentPort.postMessage({key:job.key,rows});
  }catch(e){parentPort.postMessage({key:job.key,error:e.stack});}
});
