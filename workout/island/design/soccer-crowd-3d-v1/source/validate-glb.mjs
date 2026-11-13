/** CC0. Run with a gltf-validator installation outside the repository. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url));
const validator=createRequire(import.meta.url)(process.argv[2] || '/tmp/soccer-crowd-tools/node_modules/gltf-validator');
const manifest=JSON.parse(await fs.readFile(path.join(root,'assets.json'),'utf8'));
const results=[];
for(const asset of manifest.assets) {
  const bytes=await fs.readFile(path.join(root,asset.file));
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:asset.file,maxIssues:100});
  results.push({file:asset.file,...report.issues});
}
await fs.writeFile(path.join(root,'gltf-validation.json'),JSON.stringify({validator:validator.version(),results},null,2)+'\n');
console.log(JSON.stringify({files:results.length,errors:results.reduce((s,r)=>s+r.numErrors,0),warnings:results.reduce((s,r)=>s+r.numWarnings,0)}));
if(results.some(r=>r.numErrors || r.numWarnings))process.exitCode=1;
