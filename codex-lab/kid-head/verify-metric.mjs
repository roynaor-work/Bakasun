// Synthetic identity check only: never used as reference-character accuracy.
import {PNG} from 'pngjs';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(tmpdir(),'kid-head-metric-'));
try{const views=['front','threeQuarter','side','back'],sheet=new PNG({width:4096,height:1024});for(let j=0;j<views.length;j++){const p=PNG.sync.read(await readFile(new URL(`shots/r3/${views[j]}-head.png`,import.meta.url)));for(let y=0;y<1024;y++)p.data.copy(sheet.data,(y*4096+j*1024)*4,y*1024*4,(y+1)*1024*4);}await writeFile(path.join(temp,'reference.png'),PNG.sync.write(sheet));await writeFile(path.join(temp,'target.json'),JSON.stringify({image:'reference.png',views:Object.fromEntries(views.map((v,i)=>[v,[i*1024,0,1024,1024]]))}));const result=spawnSync(process.execPath,[new URL('measure.mjs',import.meta.url).pathname,path.join(temp,'target.json'),path.join(temp,'out')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const metrics=JSON.parse(await readFile(path.join(temp,'out/metrics.json')));assert.equal(metrics.bestRound,3);for(const v of views)assert.equal(metrics.results[2][v],1);assert(metrics.results[0].mean<1);console.log('Synthetic metric check passed: identical silhouettes IoU=1; altered geometry IoU<1; best round=3. This is not target validation.');}finally{await rm(temp,{recursive:true,force:true});}
