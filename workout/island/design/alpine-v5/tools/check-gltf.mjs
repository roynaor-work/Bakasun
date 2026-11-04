import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const modulePath=process.argv[2];
if(!modulePath)throw new Error('Usage: node tools/check-gltf.mjs /absolute/path/to/gltf-validator/index.js');
const {default:validator}=await import(pathToFileURL(path.resolve(modulePath)));
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const results=[];
for(const a of manifest.assets.filter(a=>a.kind==='model')) {
  const r=await validator.validateBytes(new Uint8Array(await readFile(new URL(a.path,root))),{uri:a.path,maxIssues:100});
  results.push({id:a.id,file:a.path,validatorVersion:validator.version(),errors:r.issues.numErrors,
    warnings:r.issues.numWarnings,infos:r.issues.numInfos,messages:r.issues.messages,
    triangles:r.info?.totalTriangleCount});
}
const passed=results.every(r=>r.errors===0&&r.warnings===0);
await writeFile(new URL('verification/gltf-report.json',root),JSON.stringify({passed,validator:'Khronos glTF Validator',results},null,2)+'\n');
console.log(JSON.stringify({passed,models:results.length,errors:results.reduce((n,r)=>n+r.errors,0),warnings:results.reduce((n,r)=>n+r.warnings,0)},null,2));
if(!passed)process.exitCode=1;
