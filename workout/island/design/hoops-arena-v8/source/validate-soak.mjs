/** Independent validation of the complete CSV, including positive render work. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const report=await fs.readFile(path.join(root,'verification/SOAK.md'),'utf8');
const stamps=report.match(/\d{4}-\d\d-\d\dT[\d:.]+Z/g);assert(stamps?.length>=2);const duration=Date.parse(stamps[1])-Date.parse(stamps[0]);assert(duration>=145*60_000,'At least 145 real minutes');
const text=await fs.readFile(path.join(root,'verification/soak.csv'),'utf8'),lines=text.trim().split('\n'),headers=lines.shift().split(',');
const rows=lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[headers[i],v])));assert(rows.length>=60,'Many independently reported cycles');
let frames=0,maxTri=0,maxHeap=0;
for(const r of rows){
  for(const key of ['elapsed_s','frames','p50_ms','p95_ms','triangles','draws','geometries','textures','replay_bytes','heap_bytes'])assert(Number.isFinite(Number(r[key])),key);
  assert(Number(r.frames)>0,'Render frames completed');assert(Number(r.triangles)>0&&Number(r.triangles)<=35000,'Positive, budgeted GPU submissions');assert(Number(r.draws)>0);assert(Number(r.geometries)>0&&Number(r.geometries)<=140);assert.equal(Number(r.textures),8,'All textures remain allocated, no lost-context zero work');assert(Number(r.replay_bytes)>0&&Number(r.replay_bytes)<=65536);assert(Number(r.heap_bytes)>0&&Number(r.heap_bytes)<=200_000_000);
  frames+=Number(r.frames);maxTri=Math.max(maxTri,Number(r.triangles));maxHeap=Math.max(maxHeap,Number(r.heap_bytes));
}
for(const width of ['390','844'])for(const mode of ['true','false'])assert(rows.some(r=>r.width===width&&r.replay===mode),'Orientation and both modes');
for(const lod of ['0','1','2'])for(const mode of ['true','false'])assert(rows.some(r=>r.actual_lod===lod&&r.replay===mode),'Each LOD in both modes across the suite');
const hash=createHash('sha256');async function add(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())await add(p);else{hash.update(path.relative(root,p));hash.update(await fs.readFile(p));}}}await add(path.join(root,'runtime'));assert(report.includes(hash.digest('hex')),'Soak final runtime equals delivered assets');
console.log(`SOAK CSV VERIFIED: ${rows.length} cycles; ${frames} frames; ${duration/60000} real minutes; max ${maxTri} triangles; heap ${maxHeap} bytes; all render samples positive.`);
