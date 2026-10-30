import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(here,'manifest.json')));
async function list(dir){
 const result=[];
 for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
  const p=path.join(dir,entry.name);
  if(entry.isDirectory())result.push(...await list(p));else result.push(p);
 }
 return result;
}
const files=[];
for(const filename of await list(here)){
 if(path.basename(filename)==='inventory.json')continue;
 assert.ok(!filename.endsWith('.glb'),'No duplicate character GLB may be added to variants/');
 const data=await fs.readFile(filename);
 files.push({path:path.relative(here,filename).replaceAll('\\','/'),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const shared=[];
for(const id of manifest.models){
 const data=await fs.readFile(path.join(here,`../characters/${id}.glb`));
 shared.push({path:`../characters/${id}.glb`,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const baseBytes=files.reduce((sum,f)=>sum+f.bytes,0),characterBytes=shared.reduce((sum,f)=>sum+f.bytes,0);
const inventory={schemaVersion:1,budgetBytes:400000,sharedCharacterBytes:characterBytes,variantsBytes:0,totalBytes:0,
 includes:'four referenced GLBs plus all files in variants/, including this inventory; shared engine/decoder and old character PNG previews excluded',
 shared,files};
let content='';
for(let i=0;i<10;i++){
 const next=JSON.stringify(inventory,null,2)+'\n';if(next===content)break;
 content=next;inventory.variantsBytes=baseBytes+Buffer.byteLength(content);inventory.totalBytes=characterBytes+inventory.variantsBytes;
}
content=JSON.stringify(inventory,null,2)+'\n';
assert.equal(inventory.variantsBytes,baseBytes+Buffer.byteLength(content));
assert.ok(inventory.totalBytes<=400000,`Budget exceeded: ${inventory.totalBytes}`);
await fs.writeFile(path.join(here,'inventory.json'),content);
console.log(JSON.stringify({sharedCharacterBytes:characterBytes,variantsBytes:inventory.variantsBytes,totalBytes:inventory.totalBytes,budgetBytes:400000,remainingBytes:400000-inventory.totalBytes}));
