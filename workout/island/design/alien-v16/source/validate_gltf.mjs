// CC0-1.0 wrapper. Install gltf-validator externally; no dependency is vendored.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(process.env.ALIEN_V16_VALIDATOR_PACKAGE||'/tmp/alien-v16-tools/package.json');
const validator=require('gltf-validator');
const root=new URL('../',import.meta.url),results=[];
for(const name of (await fs.readdir(new URL('models/',root))).filter(n=>n.endsWith('.glb')).sort()){
 const bytes=await fs.readFile(new URL(`models/${name}`,root));
 const result=await validator.validateBytes(new Uint8Array(bytes),{uri:name,maxIssues:100});
 results.push({file:`models/${name}`,bytes:bytes.length,issues:result.issues});
}
await fs.writeFile(new URL('verification/gltf-results.json',root),JSON.stringify({license:'CC0-1.0',validatorVersion:validator.version(),results},null,2)+'\n');
console.log(results.map(r=>({file:r.file,bytes:r.bytes,errors:r.issues.numErrors,warnings:r.issues.numWarnings})));
if(results.length!==6||results.some(r=>r.issues.numErrors||r.issues.numWarnings))process.exitCode=1;
