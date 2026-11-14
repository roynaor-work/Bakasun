// SPDX-License-Identifier: CC0-1.0
// Khronos validator is an authoring dependency installed outside the checkout.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),validator=require(process.env.GLTF_VALIDATOR_MODULE??'/tmp/tennis-grip-tools/node_modules/gltf-validator');
const base=new URL('../',import.meta.url),results={};let pass=true;
for(const file of ['player.glb','racket.glb','right-hand-grip.glb']){
 const result=await validator.validateBytes(new Uint8Array(await fs.readFile(new URL('runtime/'+file,base))),{uri:file});
 results[file]=result;pass&&=result.issues.numErrors===0&&result.issues.numWarnings===0;
 console.log(file+': '+result.issues.numErrors+' errors, '+result.issues.numWarnings+' warnings');
}
await fs.writeFile(new URL('verification/gltf-validation.json',base),JSON.stringify(results,null,2)+'\n');if(!pass)process.exitCode=1;
