// Recompute delivery inventories from real files and decoded compressed meshes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,RUNTIME,decodedParts,filesUnder,webpSize} from '../tests/audit-helpers.mjs';
import {LEVELS,crowdPlacements} from '../runtime/layout.mjs';

const verification=path.join(ROOT,'verification');await fs.mkdir(verification,{recursive:true});
const inventory=['path,bytes,width,height,sha256'];let runtimeBytes=0;
const runtimeFiles=(await filesUnder(RUNTIME)).sort(),hash=createHash('sha256'),largest=[];
for(const file of runtimeFiles){
  const bytes=await fs.readFile(file),name=path.relative(RUNTIME,file).split(path.sep).join('/'),dimensions=file.endsWith('.webp')?webpSize(bytes):['',''];
  inventory.push([name,bytes.length,...dimensions,createHash('sha256').update(bytes).digest('hex')].join(','));
  runtimeBytes+=bytes.length;hash.update(name+'\n');hash.update(bytes);largest.push({name,bytes:bytes.length});
}
await fs.writeFile(path.join(verification,'runtime-files.csv'),inventory.join('\n')+'\n');
await fs.writeFile(path.join(verification,'runtime-sha256.txt'),hash.digest('hex')+'\n');
const lods=[],partNames=new Set();
for(let i=0;i<3;i++){
  const decoded=await decodedParts(path.join(RUNTIME,`stadium-lod${i}.glb`)),parts=Object.fromEntries(decoded.parts);
  parts.Crowd=crowdPlacements(LEVELS[i]).length*2;parts.Halos=8;parts.Sky=2;
  Object.keys(parts).forEach(p=>partNames.add(p));lods.push({parts,total:Object.values(parts).reduce((a,b)=>a+b,0),bytes:decoded.bytes});
}
const rows=['part,LOD0,LOD1,LOD2'];for(const name of partNames)rows.push([name,...lods.map(l=>l.parts[name]??0)].join(','));rows.push(['TOTAL',...lods.map(l=>l.total)].join(','));
await fs.writeFile(path.join(verification,'triangles.csv'),rows.join('\n')+'\n');
const packageFiles=await Promise.all((await filesUnder(ROOT)).map(async file=>({name:path.relative(ROOT,file),bytes:(await fs.stat(file)).size})));
const totalBytes=packageFiles.reduce((sum,file)=>sum+file.bytes,0);
const summary=[`Runtime: ${runtimeBytes} bytes; ${runtimeFiles.length} exact local load files`,`Package at inventory time: ${totalBytes} bytes`,
  ...lods.map((l,i)=>`LOD${i}: ${l.total} triangles; ${l.bytes} GLB bytes`),'Largest runtime files:',...largest.sort((a,b)=>b.bytes-a.bytes).slice(0,8).map(f=>`${f.name}: ${f.bytes} bytes`),
  'Largest package files:',...packageFiles.sort((a,b)=>b.bytes-a.bytes).slice(0,5).map(f=>`${f.name}: ${f.bytes} bytes`)];
await fs.writeFile(path.join(verification,'sizes.txt'),summary.join('\n')+'\n');console.log(summary.join('\n'));
