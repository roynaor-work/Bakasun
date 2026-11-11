/** Original CC0-1.0. Copy source keyframes byte-for-byte; do not alter animation data. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const clips=[];
for(const library of ['v9','v8']) {
  const sourceCommit=library==='v9'?'6dd1675ded8ef2c9d361821aa1642ab75de90541':'bd4d3600692b14be8881d2ba50a2b96485f3119e';
  const sourceDirectory=`workout/island/design/hoops-motion-${library}/runtime/keyframes`;
  const out=path.resolve(root,`runtime/keyframes/${library}`);
  await fs.mkdir(out,{recursive:true});
  const names=execFileSync('git',['ls-tree','--full-tree','--name-only',`${sourceCommit}:${sourceDirectory}`],{cwd:root,encoding:'utf8'}).trim().split('\n');
  if(names.filter(x=>x.endsWith('.json.gz')).length!==(library==='v9'?83:15))throw new Error(`Incomplete frozen ${library} source tree`);
  for(const name of names.filter(x=>x.endsWith('.json.gz')).sort()){
    const bytes=execFileSync('git',['show',`${sourceCommit}:${sourceDirectory}/${name}`],{cwd:root,maxBuffer:8*1024*1024}),clip=JSON.parse(gunzipSync(bytes));
    await fs.writeFile(path.join(out,name),bytes);
    clips.push({library,id:clip.id,label:clip.labelHe||clip.id,kind:clip.kind,
      durationSeconds:clip.durationSeconds,loop:clip.loop,
      path:`runtime/keyframes/${library}/${name}`,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
      source:`${sourceDirectory}/${name}`,sourceCommit});
  }
}
await fs.writeFile(path.join(root,'catalog.json'),JSON.stringify({schemaVersion:1,clips},null,2)+'\n');
console.log(`${clips.length} unchanged clips packaged`);
