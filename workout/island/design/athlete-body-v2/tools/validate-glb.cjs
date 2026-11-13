/** CC0-1.0. Run the official Khronos validator against the four exports.
 * Install gltf-validator outside the repository and set ATHLETE_GLTF_VALIDATOR
 * to its module path, or make that module available to Node normally.
 */
const fs=require('node:fs'),path=require('node:path');
const validator=require(process.env.ATHLETE_GLTF_VALIDATOR||'gltf-validator');
const base=path.resolve(__dirname,'..');
(async()=>{
 const results=[];
 for(const name of ['soccer','guard','wing','center']){
  const file=path.join(base,'runtime/models',name+'.glb');
  const report=await validator.validateBytes(new Uint8Array(fs.readFileSync(file)),{
   uri:file,maxIssues:1000,
   externalResourceFunction:uri=>Promise.resolve(new Uint8Array(fs.readFileSync(path.resolve(path.dirname(file),uri)))),
  });
  results.push({model:name,issues:report.issues});
 }
 fs.writeFileSync(path.join(base,'verification/gltf-validation.json'),JSON.stringify({validatorVersion:validator.version(),results},null,2)+'\n');
 console.log(JSON.stringify(results.map(r=>({model:r.model,errors:r.issues.numErrors,warnings:r.issues.numWarnings}))));
 if(results.some(r=>r.issues.numErrors||r.issues.numWarnings))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
