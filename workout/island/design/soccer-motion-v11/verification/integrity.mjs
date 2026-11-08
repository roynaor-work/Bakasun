/** CC0-1.0. Read every delivered file and check the exhaustive license/hash inventory.
 * Run after source/report.mjs. No generated output is written by this check.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=new URL('../',import.meta.url),root=fileURLToPath(base);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const demand=(ok,message)=>{if(!ok)throw Error(message);};
async function walk(directory){const out=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);out.push(...(entry.isDirectory()?await walk(file):[path.relative(root,file).split(path.sep).join('/')]));}return out;}
const inventory=JSON.parse(await fs.readFile(new URL('verification/files.json',base),'utf8'));
const records=inventory.files??inventory.entries??inventory.inventory;
demand(Array.isArray(records),'Inventory must list files');
const actual=(await walk(root)).filter(file=>file!=='verification/files.json').sort();
demand(JSON.stringify(actual)===JSON.stringify(records.map(record=>record.file).sort()),'Unlisted or missing file');
const licenses=await fs.readFile(new URL('LICENSES.md',base),'utf8');
for(const record of records){
 demand(record.license==='CC0-1.0',`Unlicensed: ${record.file}`);
 demand(licenses.includes(`[${record.file}](${record.file})`),`License row missing: ${record.file}`);
 const bytes=await fs.readFile(new URL(record.file,base));
 demand(bytes.length===record.bytes&&sha256(bytes)===record.sha256,`Content changed: ${record.file}`);
}
demand(licenses.includes('[verification/files.json](verification/files.json)'),'Inventory must itself have a license');
const catalog=JSON.parse(await fs.readFile(new URL('runtime/catalog.json',base),'utf8'));
for(const item of [...catalog.clips,...catalog.references]){
 const bytes=await fs.readFile(new URL('runtime/'+item.asset,base));
 demand(bytes.length===item.bytes&&sha256(bytes)===item.sha256,`Catalog asset changed: ${item.id}`);
}
console.log(JSON.stringify({pass:true,filesLoaded:actual.length+1,licensedFiles:actual.length+1,glbAssets:catalog.clips.length+catalog.references.length,inventorySelfHashExcluded:true}));
