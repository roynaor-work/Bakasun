// SPDX-License-Identifier: CC0-1.0
// Authoring-time Khronos validator; installed outside the repository, never shipped at runtime.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const imported=await import(process.env.FIREFIGHTER_VALIDATOR??'gltf-validator'),validator=imported.default??imported;
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),reports=[];
for(const file of ['models/firefighter-equipment.glb','models/oxygen-mask.glb','models/rescue-cat.glb','motions/firefighter-clips.glb']){
  const result=await validator.validateBytes(new Uint8Array(await readFile(path.join(base,file))),{uri:file,maxIssues:1000});
  reports.push({path:file,version:validator.version(),...result});
  console.log(JSON.stringify({file,errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,codes:[...new Set(result.issues.messages.map(m=>m.code))]}));
}
await writeFile(path.join(base,'verification/gltf-validator.json'),JSON.stringify(reports,null,2)+'\n');
if(reports.some(r=>r.issues.numErrors||r.issues.numWarnings))process.exitCode=1;
