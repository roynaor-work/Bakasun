#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {CATALOG} from '../runtime/catalog.mjs';
const require=createRequire(resolve(process.env.HOOPS_VALIDATOR_DIR||'/tmp/hoops-v9-validator','package.json'));
const validator=require('gltf-validator');
const clips=[];
for(const meta of CATALOG){const bytes=await readFile(new URL('../'+meta.glb,import.meta.url));const result=await validator.validateBytes(new Uint8Array(bytes),{uri:meta.id+'.glb',maxIssues:100});clips.push({id:meta.id,bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,messages:result.issues.messages});}
await mkdir(new URL('../verification/',import.meta.url),{recursive:true});
await writeFile(new URL('../verification/gltf-validation.json',import.meta.url),JSON.stringify({validator:'gltf-validator@2.0.0-dev.3.10',clips},null,2)+'\n');
const bad=clips.filter(c=>c.errors);console.log(JSON.stringify({clips:clips.length,errors:clips.reduce((n,c)=>n+c.errors,0),warnings:clips.reduce((n,c)=>n+c.warnings,0),bad},null,2));if(bad.length)process.exitCode=1;
