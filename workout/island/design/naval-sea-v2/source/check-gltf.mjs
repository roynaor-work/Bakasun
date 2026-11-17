import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(`${process.env.SEA_TOOLCHAIN || '/tmp/naval-sea-v2-tools/node_modules'}/package.json`);
const validator=require('gltf-validator');
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const results=[];
for(const a of manifest.assets.filter(a=>a.path.endsWith('.glb'))){
 const r=await validator.validateBytes(new Uint8Array(await readFile(new URL(a.path,root))),{uri:a.path,maxIssues:1000});
 results.push({file:a.path,triangles:a.triangles,bytes:a.bytes,errors:r.issues.numErrors,warnings:r.issues.numWarnings,infos:r.issues.numInfos,messages:r.issues.messages});
}
const report={passed:results.every(r=>r.errors===0&&r.warnings===0&&r.infos===0),validator:'Khronos glTF Validator',version:validator.version(),results};
await writeFile(new URL('verification/gltf-report.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
