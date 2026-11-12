// SPDX-License-Identifier: CC0-1.0
// מקור: מתאם מקורי לבודק glTF הרשמי של Khronos; הבודק עצמו אינו מופץ בחבילה.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const validator=require(process.env.HOCKEY_GLTF_VALIDATOR||'/tmp/hockey-validation/node_modules/gltf-validator');
const folder=new URL('../',import.meta.url),reports=[];
for(const name of ['skater','goalie','stick']) {
  const bytes=await readFile(new URL(`models/${name}.glb`,folder));
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:`${name}.glb`,maxIssues:1000});
  reports.push({name,report});
}
await mkdir(new URL('evidence/',folder),{recursive:true});
await writeFile(new URL('evidence/gltf-validation.json',folder),JSON.stringify({
  license:'CC0-1.0',source:'source/validate-gltf.mjs',
  validator:{name:'Khronos glTF Validator',version:validator.version(),url:'https://github.com/KhronosGroup/glTF-Validator',distributed:false},
  passed:reports.every(r=>r.report.issues.numErrors===0),reports,
},null,2)+'\n');
for(const {name,report} of reports)console.log(JSON.stringify({name,errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos}));
if(reports.some(r=>r.report.issues.numErrors>0))process.exitCode=1;
