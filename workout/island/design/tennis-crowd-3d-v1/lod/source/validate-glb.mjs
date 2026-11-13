/** CC0. Records results from the official Khronos validator, installed externally.
 * node source/validate-glb.mjs [/absolute/path/to/gltf-validator]
 */
import fs from 'node:fs';
import {createRequire} from 'node:module';
const validator=createRequire(import.meta.url)(process.argv[2]??'gltf-validator');
const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('assets.json',root)));
const results=[];
for(const asset of manifest.assets){
  const report=await validator.validateBytes(new Uint8Array(fs.readFileSync(new URL(asset.file,root))),{uri:asset.file});
  results.push({file:asset.file,errors:report.issues.numErrors,warnings:report.issues.numWarnings,messages:report.issues.messages});
}
fs.writeFileSync(new URL('gltf-validation.json',root),JSON.stringify({validatorVersion:validator.version(),results},null,2)+'\n');
const errors=results.reduce((n,r)=>n+r.errors,0),warnings=results.reduce((n,r)=>n+r.warnings,0);
console.log(JSON.stringify({models:results.length,errors,warnings}));
if(errors||warnings)process.exitCode=1;
