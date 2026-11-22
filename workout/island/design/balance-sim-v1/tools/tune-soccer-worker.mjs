import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {runTrial} from './adapters/soccer.mjs';
if(!parentPort)throw Error('Use tune-soccer.mjs to create an isolated source snapshot first.');
const {sourceRoot,seeds,stages,profiles}=workerData;
const config=JSON.parse(await readFile(join(sourceRoot,'workout/island/data/config.json'),'utf8'));
const candidate=structuredClone(config);candidate.minigames.soccer.fullTune={...candidate.minigames.soccer.fullTune,halfSeconds:40};
for(const seed of seeds){
  const rows=[];
  for(const stage of stages)for(const profile of profiles){
    const baseline=await runTrial({sourceRoot,config,game:'soccer',stage,profile,seed});
    const changed=await runTrial({sourceRoot,config:candidate,game:'soccer',stage,profile,seed});
    rows.push({stage,profile:profile.id,seed,baseline,candidate:changed});
  }
  parentPort.postMessage({seed,rows});
}
