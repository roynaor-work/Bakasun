import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const skip=new Set(['verification/files.csv','verification/inventory.json','manifest.json']);
async function walk(dir=''){
  const out=[];
  for(const item of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
    const rel=path.posix.join(dir,item.name);if(skip.has(rel)||rel.endsWith('soak-running.json'))continue;
    if(item.isDirectory())out.push(...await walk(rel));else{
      const b=await fs.readFile(path.join(root,rel));out.push({file:rel,bytes:b.length,MB:b.length/1e6,sha256:crypto.createHash('sha256').update(b).digest('hex')});
    }
  }return out;
}
let entries=(await walk()).sort((a,b)=>a.file.localeCompare(b.file));
const weightsFile=path.join(root,'WEIGHTS.md');let weights=await fs.readFile(weightsFile,'utf8');weights=weights.split('\n## קובצי תצוגה')[0];
weights+='\n## קובצי תצוגה, תלויות וראיות\n\nהטבלה לעיל היא הגאומטריה והמרקמים. המלאי המלא, כולל כל צילום, נמצא ב-verification/files.csv.\n\n| קובץ | bytes | MB |\n|---|---:|---:|\n';
for(const file of ['offline.html','index.html','style.css','app.mjs','world.mjs','loader.mjs','effects.mjs','vendor/three.module.js','vendor/GLTFLoader.js','vendor/draco/draco_decoder.wasm','verification/framing.json','verification/soak.json','verification/performance-final.json','verification/stability.png','REPORT.md','review.html']){
  const entry=entries.find(e=>e.file===file);if(entry)weights+=`| ${file} | ${entry.bytes.toLocaleString('en-US')} | ${entry.MB.toFixed(4)} |\n`;
}
weights+='\nמפות נוספות שנוצרות בזיכרון: אור פנס 128×256 וצל מגע 64×64. נתוני משולשים אינם חלים על HTML, קוד, JSON או תמונת מסך. גרסת HTML העצמית משכפלת את נכסי הריצה לצורך פתיחה כקובץ יחיד; אין לסכום אותה עם הנכסים המופרדים כמשקל טעינה יחיד.\n';
await fs.writeFile(weightsFile,weights);
entries=(await walk()).sort((a,b)=>a.file.localeCompare(b.file));
const runtime=entries.filter(e=>/^(assets|textures|vendor)\//.test(e.file)||['index.html','offline.html','style.css','app.mjs','world.mjs','loader.mjs','effects.mjs'].includes(e.file));
const largest=[...entries].sort((a,b)=>b.bytes-a.bytes).slice(0,10);
const report={generatedAt:new Date().toISOString(),units:'decimal MB = 1,000,000 bytes',count:entries.length,totalBytes:entries.reduce((n,e)=>n+e.bytes,0),selfInventoryFilesExcluded:[...skip],largest,files:entries};
await fs.writeFile(path.join(root,'verification/inventory.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(root,'verification/files.csv'),'file,bytes,MB,sha256\n'+entries.map(e=>`"${e.file}",${e.bytes},${e.MB.toFixed(6)},${e.sha256}`).join('\n')+'\n');
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({schemaVersion:1,name:'racing-v7',engine:'three.js r160',entryPoints:{standalone:'offline.html',separateFiles:'index.html',review:'review.html'},carCatalog:'assets/cars/catalog.json',tracks:['coast','neon','ridge'],canonicalRig:'assets/crowd/rig.json',GLBMaxBytes:1500000,assetTextureMaxDimension:1024,physicalPhone30fpsVerified:false,runtimeFiles:runtime},null,2)+'\n');
console.log(JSON.stringify({files:entries.length,totalBytes:report.totalBytes,largest}));
