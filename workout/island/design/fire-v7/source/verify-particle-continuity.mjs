// An emitter that is already burning must keep its phase when a neighbour
// ignites or disappears. Compare pool bytes without requiring a GPU.
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';import vm from'node:vm';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire('/tmp/fire-v7-tools/package.json'),THREE=require('three');
const sandbox={window:{FireCore:{THREE}}};vm.runInNewContext(await fs.readFile(path.join(root,'effects.js'),'utf8'),sandbox);
const textures=Object.fromEntries(['flame','smoke','steam','water','ember','beacon'].map(k=>[k,{256:new THREE.Texture(),512:new THREE.Texture(),1024:new THREE.Texture()}]));
const fx=new sandbox.window.FireEffects(new THREE.Scene(),textures),time=1.375;
const stable={id:8,position:[0,2,0],heat:.9,scale:1},neighbour={id:4,position:[-6,1,0],heat:.8,scale:1};
fx.clear();fx.fire(time,[stable]);
const baseline=Object.fromEntries(['flame','smoke','ember'].map(k=>{const b=fx.batches[k];return[k,{count:b.count,center:[...b.center.slice(0,b.count*3)],size:[...b.size.slice(0,b.count*2)],params:[...b.params.slice(0,b.count*4)]}];}));
fx.clear();fx.fire(time,[neighbour,stable]);const checks=[];
for(const kind of ['flame','smoke','ember']){
 const b=fx.batches[kind],base=baseline[kind],count=base.count,actual={center:[...b.center.slice(count*3,count*6)],size:[...b.size.slice(count*2,count*4)],params:[...b.params.slice(count*4,count*8)]};
 const changed=Object.entries(actual).reduce((n,[k,values])=>n+values.filter((v,i)=>v!==base[k][i]).length,0);checks.push({kind,particles:count,changedValues:changed,phaseStable:changed===0});
}
fx.dispose();const report={generatedAt:new Date().toISOString(),passed:checks.every(c=>c.phaseStable),scenario:'Prepend an ignited neighbour before an existing source; compare centres, sizes, UV frame, alpha and rotation of the existing emitter',checks};
const file=process.argv[2]||'verification/particle-source-continuity.json';await fs.writeFile(path.join(root,file),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
