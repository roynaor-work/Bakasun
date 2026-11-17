#!/usr/bin/env node
// Reuse identical native buffer views without rerunning geometry reduction.
// Both geometry streams and the entire animation/scene contract are compared.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGLB,writeGLB,rawAccessor,invariantFingerprint,sha256} from './glb.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
function geometryFingerprint(doc) {
  const data=i=>{const a=doc.json.accessors[i],v=rawAccessor(doc,i);return {type:a.type,count:a.count,componentType:a.componentType,normalized:!!a.normalized,sha256:sha256(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};};
  return sha256(JSON.stringify(doc.json.meshes.map(m=>m.primitives.map(p=>({attributes:Object.fromEntries(Object.entries(p.attributes).map(([k,i])=>[k,data(i)])),indices:p.indices===undefined?null:data(p.indices),targets:p.targets?.map(t=>Object.fromEntries(Object.entries(t).map(([k,i])=>[k,data(i)])))})))));
}
let beforeBytes=0,afterBytes=0;
for(const a of manifest.assets) {
  for(const v of a.variants) {
    const input=await fs.readFile(path.join(root,v.file));
    if(sha256(input)!==v.sha256)throw Error('Input hash mismatch '+v.file);
    const source=parseGLB(input),bytes=writeGLB(source),output=parseGLB(bytes);
    if(invariantFingerprint(source)!==invariantFingerprint(output)||geometryFingerprint(source)!==geometryFingerprint(output))throw Error('Native buffer reuse changed data '+v.file);
    beforeBytes+=input.length;afterBytes+=bytes.length;
    await fs.writeFile(path.join(root,v.file),bytes);v.bytes=bytes.length;v.sha256=sha256(bytes);
  }
  const {distancePolicy,...measurement}=a;
  await fs.writeFile(path.join(root,'verification',a.id.replaceAll('/','__')+'.json'),JSON.stringify(measurement)+'\n');
}
manifest.summary.lodBytes=afterBytes;
delete manifest.fileInventory;delete manifest.download;
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest)+'\n');
console.log(JSON.stringify({beforeBytes,afterBytes,savedBytes:beforeBytes-afterBytes,geometryStreamsUnchanged:true,animationContractUnchanged:true},null,2));
