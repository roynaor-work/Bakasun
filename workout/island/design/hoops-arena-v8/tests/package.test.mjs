import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
async function walk(dir) {let out=[];for(const item of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(dir,item.name);assert(!item.isSymbolicLink(),'No symlinks');if(item.isDirectory())out.push(...await walk(name));else out.push({name,size:(await fs.stat(name)).size});}return out;}
function webpSize(data) {
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
  for(let at=12;at+8<=data.length;){const type=data.toString('ascii',at,at+4),n=data.readUInt32LE(at+4),p=at+8;
    if(type==='VP8X')return [1+data.readUIntLE(p+4,3),1+data.readUIntLE(p+7,3)];
    if(type==='VP8 ')return [data.readUInt16LE(p+6)&0x3fff,data.readUInt16LE(p+8)&0x3fff];
    if(type==='VP8L'){const bits=data.readUInt32LE(p+1);return [1+(bits&0x3fff),1+((bits>>>14)&0x3fff)];}
    at=p+n+(n%2);
  }throw Error('No WebP dimensions');
}
test('Delivery is ≤60 MB; every GLB ≤1.5 MB; other files ≤5 MB; no raw JSON, archives or video',async t=>{
  const files=await walk(root),total=files.reduce((n,f)=>n+f.size,0);assert(total<=60_000_000);
  for(const f of files){const ext=path.extname(f.name);assert(!['.json','.zip','.7z','.tar','.gz','.mp4','.webm','.mov','.avi'].includes(ext),f.name);assert(f.size<=(ext==='.glb'?1_500_000:5_000_000),f.name);if(ext==='.html')assert(f.size<16_000,'Small external-script preview');}
  t.diagnostic('Package bytes: '+total);
});
test('All supplied textures are at most 1024 × 1024',async t=>{
  const files=(await walk(path.join(root,'runtime'))).filter(f=>f.name.endsWith('.webp'));assert.equal(files.length,5);
  for(const f of files){const [w,h]=webpSize(await fs.readFile(f.name));assert(w<=1024&&h<=1024);t.diagnostic(path.basename(f.name)+': '+w+'×'+h);}
});
test('Only the two most recent render directories are retained',async()=>{
  const dirs=(await fs.readdir(path.join(root,'iterations'),{withFileTypes:true})).filter(x=>x.isDirectory());assert(dirs.length<=2);const nums=dirs.map(x=>Number(x.name)).sort((a,b)=>a-b);if(nums.length===2)assert.equal(nums[1]-nums[0],1);
});
test('The last two iterations contain all six real PNG renders in their named dimensions',async()=>{
  const dirs=(await fs.readdir(path.join(root,'iterations'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();assert.equal(dirs.length,2);assert(Number(dirs.at(-1))>=6,'At least six rounds');
  for(const dir of dirs)for(const [w,h]of [[390,844],[844,390]])for(const [view,mode]of [['far','live'],['near','live'],['near','replay']]){
    const data=await fs.readFile(path.join(root,'iterations',dir,`${w}x${h}-${view}-${mode}.png`));assert.deepEqual([...data.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(data.readUInt32BE(16),w);assert.equal(data.readUInt32BE(20),h);
  }
  const history=await fs.readFile(path.join(root,'iterations/HISTORY.md'),'utf8');for(let n=1;n<Number(dirs[0]);n++)assert.match(history,new RegExp('^'+String(n).padStart(2,'0')+' —','m'),'Collapsed history line '+n);
});
test('The newest render evidence matches the exact current runtime files',async()=>{
  const {createHash}=await import('node:crypto');const hash=createHash('sha256');
  async function add(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())await add(p);else{hash.update(path.relative(root,p));hash.update(await fs.readFile(p));}}}
  await add(path.join(root,'runtime'));const dirs=(await fs.readdir(path.join(root,'iterations'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
  const state=await fs.readFile(path.join(root,'iterations',dirs.at(-1),'STATE.md'),'utf8');assert(state.includes(hash.digest('hex')),'Rerender after changing runtime');
});
