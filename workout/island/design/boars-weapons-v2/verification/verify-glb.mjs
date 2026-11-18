/** Official Khronos glTF Validator. Install gltf-validator outside the repo and
 * expose it via NODE_PATH, then run this script. No asset repair is performed.
 */
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const validator=require('gltf-validator');
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const results=[];
for (const [key,model] of Object.entries(manifest.models)) {
  const bytes=new Uint8Array(await readFile(new URL(model.file,root)));
  const result=await validator.validateBytes(bytes,{uri:model.file,maxIssues:100});
  assert.equal(result.issues.numErrors,0,JSON.stringify(result.issues));
  assert.equal(result.issues.numWarnings,0,JSON.stringify(result.issues));
  results.push({key,file:model.file,validatorVersion:result.validatorVersion,issues:result.issues,info:result.info});
}
await writeFile(new URL('verification/gltf-validation.json',root),JSON.stringify({passed:true,results},null,2)+'\n');
console.log(JSON.stringify({passed:true,models:results.length,errors:0,warnings:0}));
