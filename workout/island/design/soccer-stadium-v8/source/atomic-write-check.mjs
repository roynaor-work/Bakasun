// Read served assets while the authoring tools rebuild them. This is a direct
// regression check for a truncated GLB being served during in-place writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseGLB,webpSize} from '../tests/audit-helpers.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=process.argv[2]||'http://127.0.0.1:8765';
const assets=(await fs.readdir(path.join(root,'runtime'))).filter(f=>/\.(glb|webp)$/.test(f));
let done=false,requests=0,rounds=0;const failures=[],sizes=new Map();
const run=(binary,args)=>new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{cwd:root,stdio:['ignore','pipe','pipe']});let stderr='';
  child.stdout.resume();child.stderr.on('data',chunk=>stderr+=chunk);
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(binary+' exited '+code+' '+stderr)));
});
const rebuild=(async()=>{
  try{await run('node',['source/build-assets.mjs']);await run('python',['source/textures.py']);await run('node',['source/build-assets.mjs']);}
  catch(error){failures.push(String(error));}
  finally{done=true;}
})();
do{
  for(const name of assets){
    try{
      const response=await fetch(`${base}/runtime/${name}`,{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);
      const data=Buffer.from(await response.arrayBuffer());requests++;
      if(Number(response.headers.get('content-length'))!==data.length)throw new Error('HTTP length differs from asset bytes');
      if(name.endsWith('.glb'))parseGLB(data);else webpSize(data);
      const previous=sizes.get(name)??[Infinity,0];sizes.set(name,[Math.min(previous[0],data.length),Math.max(previous[1],data.length)]);
    }catch(error){failures.push(name+': '+String(error));}
  }
  rounds++;
}while(!done||rounds<20);
await rebuild;
const report=[`Atomic authoring/HTTP regression: ${failures.length?'FAIL':'PASS'}`,`Requests: ${requests}`,`Complete rounds: ${rounds}`,
  'Concurrent rebuilds: GLB, textures, GLB',...assets.map(name=>`${name}: ${sizes.get(name)?.join('..')} bytes`),...failures];
await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(path.join(root,'verification','atomic-write.txt'),report.join('\n')+'\n');
console.log(report.slice(0,4).join('\n'));if(failures.length)throw new Error(failures.join('\n'));
