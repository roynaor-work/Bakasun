#!/usr/bin/env node
// Independently extract the ZIP, verify every inventory hash, and rebuild four
// representative model families with fetch and WebAssembly disabled.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {inflateRawSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {sha256} from './glb.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),archive=path.resolve(process.argv[2]||path.join(root,'bakasun-lod-pipeline-v1.zip')),zip=await fs.readFile(archive);
const deliveryPath=path.join(root,'verification/delivery.json'),delivery=JSON.parse(await fs.readFile(deliveryPath,'utf8'));
assert.equal(sha256(zip),delivery.sha256,'Archive differs from its trusted delivery receipt');
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
let end=zip.length-22;while(end>=Math.max(0,zip.length-65557)&&zip.readUInt32LE(end)!==0x06054b50)end--;
assert.ok(end>=0,'ZIP end record');
assert.equal(zip.readUInt32LE(end),0x06054b50,'ZIP end signature');
const count=zip.readUInt16LE(end+10),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'bakasun-lod-check-'));
let cursor=zip.readUInt32LE(end+16),payloadBytes=0;
for(let i=0;i<count;i++) {
  assert.equal(zip.readUInt32LE(cursor),0x02014b50);
  const method=zip.readUInt16LE(cursor+10),crc=zip.readUInt32LE(cursor+16),compressedSize=zip.readUInt32LE(cursor+20),size=zip.readUInt32LE(cursor+24),nameLength=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30),comment=zip.readUInt16LE(cursor+32),offset=zip.readUInt32LE(cursor+42);
  const name=zip.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
  assert.ok(name.startsWith('bakasun-lod-pipeline-v1/')&&!name.split('/').includes('..')&&!name.includes('\\'));
  assert.equal(zip.readUInt32LE(offset),0x04034b50);
  const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28),packed=zip.subarray(start,start+compressedSize);
  assert.ok(size<64_000_000,'Unexpectedly large ZIP member');
  const bytes=method===8?inflateRawSync(packed,{maxOutputLength:64_000_000}):method===0?packed:null;
  assert.ok(bytes,'Unsupported ZIP method');assert.equal(bytes.length,size);assert.equal(crc32(bytes),crc);
  const file=path.join(temporary,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);payloadBytes+=bytes.length;
  cursor+=46+nameLength+extra+comment;
}
const extracted=path.join(temporary,'bakasun-lod-pipeline-v1'),manifest=JSON.parse(await fs.readFile(path.join(extracted,'manifest.json'),'utf8'));
for(const item of manifest.fileInventory) {
  const bytes=await fs.readFile(path.join(extracted,item.path));assert.equal(bytes.length,item.bytes,item.path);assert.equal(sha256(bytes),item.sha256,item.path);
}
const guard=path.join(temporary,'offline-guard.mjs');await fs.writeFile(guard,"globalThis.fetch=()=>{throw Error('Network is disabled during archive reconstruction')};globalThis.WebAssembly=undefined;\n");
const run=args=>{const r=spawnSync(process.execPath,['--import',guard,...args],{cwd:extracted,encoding:'utf8',timeout:180000,maxBuffer:4_000_000});assert.equal(r.status,0,(r.stdout||'')+(r.stderr||'')+(r.error?.message||''));return r.stdout;};
const tap=run(['--test','--test-reporter=tap','tools/lod.test.mjs']);
const tests=Number(tap.match(/^# tests (\d+)/m)[1]),passed=Number(tap.match(/^# pass (\d+)/m)[1]);assert.equal(passed,tests);
const cases=['hoops-realism-v2/players/guard','soccer-crowd-people-v2/fan-01','tennis-crowd-people-v2/fan-14','catch-vehicles-v2/police-sedan'];
for(const id of cases) {
  run(['tools/lod.mjs','--only',id]);
  for(const v of manifest.assets.find(a=>a.id===id).variants)assert.equal(sha256(await fs.readFile(path.join(extracted,v.file))),v.sha256,v.file+' was not reproduced byte-for-byte');
}
const report={zipCrcPassed:true,archiveSha256:sha256(zip),entries:count,payloadBytes,inventoryFiles:manifest.fileInventory.length,allInventoryHashesMatch:true,isolatedTests:{tests,passed},reconstructedModels:cases,reconstructedVariants:cases.length*2,byteIdenticalReconstruction:true,fetchDisabled:true,webAssemblyDisabled:true,requiresGit:false,requiresNpmInstall:false,node:process.version};
assert.equal(delivery.sha256,report.archiveSha256);delivery.verification=report;
await fs.writeFile(deliveryPath,JSON.stringify(delivery,null,2)+'\n');console.log(JSON.stringify(report,null,2));
