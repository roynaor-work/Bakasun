/** CC0-1.0. Read every delivered file, verify inventory and format parsing.
 * Run after source/report.mjs. GLB loading/rendering is additionally exercised
 * by browser-check.mjs; this inventory prevents omitted assets or stale hashes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base=fileURLToPath(new URL('../',import.meta.url));
const inventory=JSON.parse(await fs.readFile(path.join(base,'verification/files.json'),'utf8'));
const licenses=await fs.readFile(path.join(base,'LICENSES.md'),'utf8');
async function walk(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);out.push(...(e.isDirectory()?await walk(p):[path.relative(base,p).replaceAll(path.sep,'/')]));}return out;}
const files=(await walk(base)).sort();let bytesRead=0,glbs=0,jsons=0,modules=0,pngs=0;
const insist=(ok,message)=>{if(!ok)throw Error(message);};
for(const name of files){
 const bytes=await fs.readFile(path.join(base,name));bytesRead+=bytes.length;
 insist(licenses.includes(`](${name})`),`No file-specific license/source: ${name}`);
 if(name!=='verification/files.json'){
  const record=inventory.files.find(f=>f.file===name);insist(record,`File missing from inventory: ${name}`);
  insist(bytes.length===record.bytes&&createHash('sha256').update(bytes).digest('hex')===record.sha256,`Stale or changed file: ${name}`);
 }
 const ext=path.extname(name);
 if(ext==='.json'){JSON.parse(bytes.toString('utf8'));jsons++;}
 else if(ext==='.glb'){
  insist(bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,`Bad GLB: ${name}`);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  insist(!JSON.stringify(json).match(/KHR_draco_mesh_compression|EXT_meshopt_compression/),`Compressed runtime file: ${name}`);glbs++;
 }else if(ext==='.mjs'){execFileSync(process.execPath,['--check',path.join(base,name)],{stdio:'pipe'});modules++;}
 else if(ext==='.png'){insist(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0,`Invalid PNG: ${name}`);pngs++;}
 else new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
insist(inventory.files.length===files.length-1,'Inventory contains obsolete files');
const catalogBytes=await fs.readFile(path.join(base,'runtime/catalog.json'));
const browser=JSON.parse(await fs.readFile(path.join(base,'verification/browser.json'),'utf8'));
insist(browser.pass&&browser.catalogSha256===createHash('sha256').update(catalogBytes).digest('hex'),'Browser evidence does not match final catalog');
const motionSha256=createHash('sha256').update(await fs.readFile(path.join(base,'runtime/motions.json'))).digest('hex');
const contact=JSON.parse(await fs.readFile(path.join(base,'verification/contact-surfaces.json'),'utf8'));
insist(contact.outputMotionSha256===motionSha256&&JSON.parse(catalogBytes).sourceMotionSha256===motionSha256,'Triangle evidence and baked catalog do not match motion source');
console.log(JSON.stringify({pass:true,filesLoaded:files.length,bytesRead,glbs,jsons,modules,pngs,licenseCoverage:'100%',sha256:'all delivered files except inventory itself',browserEvidenceMatchesCatalog:true}));
