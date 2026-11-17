#!/usr/bin/env node
// Dependency-free deterministic ZIP. Deflate is archive packaging only;
// extracted GLBs remain native, uncompressed glTF with PNG/JPEG textures.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';
import {sha256} from './glb.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),archive='bakasun-lod-pipeline-v1.zip';
const excluded=new Set([archive,'verification/delivery.json']);
async function walk(relative='') {
  const result=[];
  for(const entry of (await fs.readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
    const name=relative?relative+'/'+entry.name:entry.name;
    if(excluded.has(name))continue;
    if(entry.isSymbolicLink())throw Error('Archive must not depend on symbolic links');
    if(entry.isDirectory())result.push(...await walk(name));else result.push(name);
  }
  return result;
}
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const files=await walk(),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
manifest.fileInventory=[];
for(const name of files)if(name!=='manifest.json'){const bytes=await fs.readFile(path.join(root,name));manifest.fileInventory.push({path:name,bytes:bytes.length,sha256:sha256(bytes)});}
manifest.inventoryExcludes=['manifest.json',archive,'verification/delivery.json'];
manifest.download={file:archive,checksumFile:'verification/delivery.json',selfContained:true,requiresNetwork:false};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest)+'\n');
const local=[],central=[];let offset=0;const date=((2026-1980)<<9)|(11<<5)|17;
for(const name of files) {
  const bytes=await fs.readFile(path.join(root,name)),packed=deflateRawSync(bytes,{level:9}),filename=Buffer.from('bakasun-lod-pipeline-v1/'+name),crc=crc32(bytes);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);h.writeUInt16LE(date,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(packed.length,18);h.writeUInt32LE(bytes.length,22);h.writeUInt16LE(filename.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt16LE(date,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);
  local.push(h,filename,packed);central.push(c,filename);offset+=h.length+filename.length+packed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const zip=Buffer.concat([...local,directory,end]);await fs.writeFile(path.join(root,archive),zip);
const delivery={archive,bytes:zip.length,sha256:sha256(zip),entries:files.length,manifestSha256:sha256(await fs.readFile(path.join(root,'manifest.json'))),excludedFromArchive:['verification/delivery.json'],format:'Standard ZIP; no application or mesh compression required after extraction'};
await fs.writeFile(path.join(root,'verification/delivery.json'),JSON.stringify(delivery,null,2)+'\n');console.log(JSON.stringify(delivery,null,2));
