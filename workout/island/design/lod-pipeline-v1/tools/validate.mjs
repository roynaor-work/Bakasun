#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import validator from '../vendor/gltf-validator/index.js';
import {parseGLB,sha256,invariantFingerprint,triangleCount,sceneTriangleCount,rawAccessor,accessor} from './glb.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const files=[],failures=[];
function referencedBones(doc,p) {
  const vertices=p.indices===undefined?Uint32Array.from({length:doc.json.accessors[p.attributes.POSITION].count},(_,i)=>i):rawAccessor(doc,p.indices),bones=new Set();
  for(let set=0;p.attributes[`JOINTS_${set}`]!==undefined;set++) {
    const js=accessor(doc,p.attributes[`JOINTS_${set}`]),ws=accessor(doc,p.attributes[`WEIGHTS_${set}`]);
    for(const v of vertices)for(let k=0;k<4;k++)if(ws[v*4+k]>0)bones.add(js[v*4+k]);
  }
  return bones;
}
for(const a of manifest.assets) {
  const source=parseGLB(await fs.readFile(path.join(root,a.copy)));
  for(const [level,entry] of [{level:0,file:a.copy,sha256:a.sha256,storedTriangles:a.source.storedTriangles,defaultSceneTriangles:a.source.defaultSceneTriangles},...a.variants].map(e=>[e.level,e])) {
    const bytes=await fs.readFile(path.join(root,entry.file)),doc=parseGLB(bytes);
    const result=await validator.validateBytes(new Uint8Array(bytes),{uri:entry.file,maxIssues:1000});
    const integrity=sha256(bytes)===entry.sha256;
    const contract=invariantFingerprint(doc)===a.source.fingerprint;
    const triangles=triangleCount(doc)===entry.storedTriangles;
    const defaultTriangles=sceneTriangleCount(doc)===entry.defaultSceneTriangles;
    const jointSupport=source.json.meshes.every((m,mi)=>m.primitives.every((p,pi)=>{const original=referencedBones(source,p),reduced=referencedBones(doc,doc.json.meshes[mi].primitives[pi]);return [...original].every(b=>reduced.has(b));}));
    const item={file:entry.file,level,integrity,contract,triangles,defaultTriangles,jointSupport,errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,messages:result.issues.messages};
    files.push(item);
    if(!integrity||!contract||!triangles||!defaultTriangles||!jointSupport||item.errors)failures.push(item.file);
  }
}
const guides=new Map(manifest.assets.flatMap(a=>(a.guides||[]).filter(g=>!g.embedded).map(g=>[g.copy,g])));
for(const guide of guides.values()) {
  const bytes=await fs.readFile(path.join(root,guide.copy));parseGLB(bytes);
  const result=await validator.validateBytes(new Uint8Array(bytes),{uri:guide.copy,maxIssues:1000});
  const item={file:guide.copy,level:'reference-'+guide.level,integrity:sha256(bytes)===guide.sha256,contract:true,triangles:true,defaultTriangles:true,errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,messages:result.issues.messages};
  files.push(item);if(!item.integrity||item.errors)failures.push(item.file);
}
const report={validator:'Khronos glTF Validator '+validator.version(),implementation:'Bundled pure JavaScript; no WASM and no network',files:files.length,deliveredModelGLBs:manifest.assets.length*3,authoredGuideGLBs:guides.size,errors:files.reduce((n,f)=>n+f.errors,0),warnings:files.reduce((n,f)=>n+f.warnings,0),failedFiles:failures,results:files};
await fs.writeFile(path.join(root,'verification/gltf-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({validator:report.validator,files:report.files,errors:report.errors,warnings:report.warnings,failedFiles:failures},null,2));
if(failures.length)process.exitCode=1;
