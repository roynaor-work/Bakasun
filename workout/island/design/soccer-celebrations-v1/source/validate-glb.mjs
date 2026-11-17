// SPDX-License-Identifier: CC0-1.0
// Independent Khronos validation; vendored validator is Apache-2.0, pure JS.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import validator from './validator/index.js';
const base=new URL('../',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',base)));
const results=[];
for(const clip of catalog.clips){
 const bytes=await fs.readFile(new URL(clip.asset,base));
 const report=await validator.validateBytes(new Uint8Array(bytes),{uri:clip.asset,maxIssues:1000,externalResourceFunction:async()=>{throw Error('The GLB must be fully embedded.');}});
 results.push({id:clip.id,asset:clip.asset,sha256:hash(bytes),report});
 console.log(`${clip.id}: ${report.issues.numErrors} errors; ${report.issues.numWarnings} warnings`);
}
const vendorFiles=['index.js','gltf_validator.dart.js','package.json','LICENSE','NOTICES'];
const provenance=[];
for(const file of vendorFiles){const bytes=await fs.readFile(new URL(`validator/${file}`,import.meta.url));provenance.push({file:`source/validator/${file}`,sha256:hash(bytes),bytes:bytes.length});}
const output={schemaVersion:1,generatedAt:new Date().toISOString(),validator:{name:'Khronos glTF Validator',version:'2.0.0-dev.3.10',license:'Apache-2.0',source:'https://registry.npmjs.org/gltf-validator/-/gltf-validator-2.0.0-dev.3.10.tgz',runtime:'pure JavaScript, no WASM',files:provenance},results,summary:{clips:results.length,errors:results.reduce((s,c)=>s+c.report.issues.numErrors,0),warnings:results.reduce((s,c)=>s+c.report.issues.numWarnings,0)}};
output.passed=output.summary.errors===0;
await fs.writeFile(new URL('verification/gltf-validation.json',base),JSON.stringify(output,null,2)+'\n');
if(!output.passed)process.exitCode=1;
