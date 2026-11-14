// SPDX-License-Identifier: CC0-1.0
// Hash the package and the exact read-only source assets. The manifest omits its own hash.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(base,'../../../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const sources=[
 ['workout/island/design/soccer-header-v1/runtime/reference/idle_relaxed.glb','CC0-1.0','Calibrated fictional body, materials and images; derived in player.glb.'],
 ['workout/island/design/soccer-header-v1/source/rig.mjs','CC0-1.0','Canonical solver copied with arm reach constraint in the new copy.'],
 ['workout/island/design/soccer-header-v1/source/glb.mjs','CC0-1.0','Read-only GLB utility copied without modification.'],
 ['workout/island/design/motion/soccer.json','CC0-1.0','Exact canonical rest translations and hierarchy.'],
 ['workout/island/minigames/tennis-view.mjs','Repository source; read-only','Current procedural attachment and world hand rotation inspection.'],
 ['workout/island/minigames/tennis-pose.mjs','Repository source; read-only','Current target-pose sampling inspection.'],
 ['workout/island/design/tennis-v7/rig.json','CC0-1.0','Compared calibrated T-pose bind against canonical neutral bind.'],
 ['workout/island/design/tennis-v7/source/motions.mjs','CC0-1.0','Inspected existing tennis choreography; new movements are authored in this package.']
];
const provenance={baseMainCommit:'d759582c171600dd7c7df7906c2fb38ae7f8b88a',qaCommit:'5eb4f093bc22523ee417a7f2345c3b813bffba24',sources:await Promise.all(sources.map(async([file,license,use])=>{const b=await fs.readFile(path.join(repo,file));return {path:file,license,use,bytes:b.length,sha256:hash(b)};}))};
await fs.writeFile(path.join(base,'verification/provenance.json'),JSON.stringify(provenance,null,2)+'\n');
async function walk(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(f));else if(e.isFile()&&f!==path.join(base,'manifest.json'))out.push(f);}return out;}
const files=await Promise.all((await walk(base)).sort().map(async p=>{const b=await fs.readFile(p);return {path:path.relative(base,p),bytes:b.length,sha256:hash(b),license:'CC0-1.0'};}));
const manifest={schemaVersion:1,library:'tennis-grip-v1',license:'CC0-1.0',fileCount:files.length,totalBytes:files.reduce((s,f)=>s+f.bytes,0),note:'All files except this manifest are hashed; existing MIT runtime dependencies are linked, not copied.',files};
await fs.writeFile(path.join(base,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({fileCount:manifest.fileCount,totalBytes:manifest.totalBytes}));
