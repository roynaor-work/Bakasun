// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
let validator;
try {validator=require(process.env.GLTF_VALIDATOR_MODULE??'gltf-validator');}
catch(e) {throw Error('Install source/package.json devDependencies, or set GLTF_VALIDATOR_MODULE to gltf-validator module path.',{cause:e});}
const records=[];
for(const dir of ['models','clips','source/base']) {
  for(const name of (await fs.readdir(path.join(root,dir))).filter(n=>n.endsWith('.glb')).sort()) {
    const file=`${dir}/${name}`,bytes=await fs.readFile(path.join(root,file));
    const result=await validator.validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:1000});
    records.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),
      bytes:bytes.length,issues:result.issues,info:result.info});
  }
}
const report={validator:'Khronos glTF Validator',version:validator.version(),
  pass:records.every(r=>r.issues.numErrors===0&&r.issues.numWarnings===0),
  files:records.length,errors:records.reduce((n,r)=>n+r.issues.numErrors,0),
  warnings:records.reduce((n,r)=>n+r.issues.numWarnings,0),records};
await fs.mkdir(path.join(root,'verification'),{recursive:true});
await fs.writeFile(path.join(root,'verification','gltf.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,files:report.files,errors:report.errors,warnings:report.warnings}));
if(!report.pass)process.exitCode=1;
