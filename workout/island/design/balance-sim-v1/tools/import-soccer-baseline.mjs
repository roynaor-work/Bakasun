#!/usr/bin/env node
// Reuse the identically configured baseline arm of the paired experiment.
// Every copied source hash is checked, and overlapping trials must match exactly.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const pack=join(dirname(fileURLToPath(import.meta.url)),'..'),data=join(pack,'data');
const tuningPath=join(data,'tuning-soccer.json'),bytes=await readFile(tuningPath),tuning=JSON.parse(bytes);
const manifest=JSON.parse(await readFile(join(data,'source-manifest.json'),'utf8'));
const baselinePath=join(data,'baseline-soccer.json'),baseline=JSON.parse(await readFile(baselinePath,'utf8'));
if(tuning.baseCommit!==baseline.baseCommit||baseline.sourceDigest!==manifest.sourceDigest)throw Error('Source revision mismatch');
for(const item of tuning.sourceManifest)if(manifest.hashes[item.path]!==item.sha256)throw Error(`Source mismatch ${item.path}`);
const byKey=new Map(baseline.trials.map(r=>[`${r.stage}:${r.profile}:${r.seed}`,r]));
let reused=0,overlaps=0;
for(const row of tuning.rows){
  const key=`${row.stage}:${row.profile}:${row.seed}`,prior=byKey.get(key),result=row.baseline;
  if(prior){
    for(const name of ['outcome','seconds','stars','falls','score','reason','objectives','diagnostics'])if(JSON.stringify(prior[name])!==JSON.stringify(result[name]))throw Error(`Replay differs ${key} ${name}`);
    overlaps++;continue;
  }
  const profile=baseline.profiles.find(p=>p.id===row.profile);
  const trial={game:'soccer',stage:row.stage,profile:row.profile,seed:row.seed,...result,withinPatience:result.seconds<=profile.patienceSeconds};
  byKey.set(key,trial);reused++;
}
baseline.trials=[...byKey.values()].sort((a,b)=>a.stage-b.stage||a.profile.localeCompare(b.profile)||a.seed-b.seed);
baseline.importedBaseline={file:'tuning-soccer.json',sha256:createHash('sha256').update(bytes).digest('hex'),sourceHashesVerified:true,overlapsVerified:overlaps,reused};
await writeFile(baselinePath,JSON.stringify(baseline)+'\n');console.log(JSON.stringify({reused,overlaps,trials:baseline.trials.length}));
