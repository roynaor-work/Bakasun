/** Exhaustive delivered-file weights; runtime textures are separate from photos. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const exclude=new Set(['verification/file-inventory.json','verification/file-sizes.csv']);
const files=[];
async function walk(dir=''){
  for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
    if(e.name==='__pycache__'||e.name.endsWith('.pyc')||e.name.endsWith('.tmp'))continue;
    const p=path.posix.join(dir,e.name);if(exclude.has(p))continue;
    if(e.isDirectory())await walk(p);else if(e.isFile())files.push(p);
  }
}
await walk();
const records=[];
for(const file of files.sort()){
  const bytes=await fs.readFile(path.join(root,file)),ext=path.extname(file);
  const kind=file.startsWith('models/')?'model':file.startsWith('textures/')?'runtime-texture':file.startsWith('offline/')?'offline-payload':/\.(png|webp|jpg|mp4|webm)$/.test(file)?'review-media':file.startsWith('vendor/')?'vendor-runtime':'source-or-report';
  const record={file,kind,bytes:bytes.length,MB:Number((bytes.length/1e6).toFixed(6)),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  if(ext==='.glb'){
    const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString('utf8').trim());
    record.triangles=(doc.meshes||[]).reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+(p.indices!==undefined?doc.accessors[p.indices].count:doc.accessors[p.attributes.POSITION].count)/3,0),0);
    record.animations=doc.animations?.length||0;record.joints=doc.skins?.[0]?.joints.length||0;
  }else if(['.png','.webp','.jpg'].includes(ext)){
    const m=await sharp(bytes).metadata();record.width=m.width;record.height=m.height;
  }
  records.push(record);
}
const ownRecords=[...exclude].map(file=>({file,kind:'inventory',bytes:0,MB:0,sha256:null,selfDescribing:true}));
records.push(...ownRecords);records.sort((a,b)=>a.file.localeCompare(b.file));
const result={schemaVersion:1,generatedAt:new Date().toISOString(),units:'decimal MB = 1,000,000 bytes',selfReference:'The two inventory files include their exact own byte sizes; their SHA-256 is intentionally null to avoid an impossible self hash.',files:records.length,totalBytes:0,modelBytes:records.filter(r=>r.kind==='model').reduce((n,r)=>n+r.bytes,0),textureBytes:records.filter(r=>r.kind==='runtime-texture').reduce((n,r)=>n+r.bytes,0),records};
const columns=['file','kind','bytes','MB','triangles','width','height','animations','joints','sha256'];
let json,csv,converged=false;
for(let attempt=0;attempt<12;attempt++){
  result.totalBytes=records.reduce((n,r)=>n+r.bytes,0);
  json=JSON.stringify(result,null,2)+'\n';
  csv=[columns.join(','),...records.map(r=>columns.map(c=>JSON.stringify(r[c]??'')).join(','))].join('\n')+'\n';
  const sizes=[Buffer.byteLength(json),Buffer.byteLength(csv)];
  if(ownRecords.every((r,i)=>r.bytes===sizes[i])){converged=true;break;}
  ownRecords.forEach((r,i)=>{r.bytes=sizes[i];r.MB=Number((r.bytes/1e6).toFixed(6));});
}
if(!converged)throw Error('Self-describing byte sizes did not converge');
await fs.writeFile(path.join(root,'verification/file-inventory.json'),json);
await fs.writeFile(path.join(root,'verification/file-sizes.csv'),csv);
console.log(JSON.stringify({files:records.length,totalMB:result.totalBytes/1e6,modelsMB:result.modelBytes/1e6,texturesMB:result.textureBytes/1e6,largest:[...records].sort((a,b)=>b.bytes-a.bytes).slice(0,8).map(({file,MB})=>({file,MB}))},null,2));
