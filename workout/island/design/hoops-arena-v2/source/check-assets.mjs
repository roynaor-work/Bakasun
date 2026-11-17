/** Khronos, embedded-image, coordinate and delivery-budget acceptance checks.
 * npm install --prefix /tmp/hoops-arena-tools --cache /tmp/hoops-arena-cache gltf-validator@2.0.0-dev.3.10
 * ARENA_TOOLS=/tmp/hoops-arena-tools/node_modules node source/check-assets.mjs
 * All writes are constrained to this package's verification directory.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const validator=require(process.env.ARENA_TOOLS?path.join(process.env.ARENA_TOOLS,'gltf-validator'):'gltf-validator');
const sha=data=>createHash('sha256').update(data).digest('hex');
const reports=[];
for(const name of ['arena','hoop']){
  const filename=`assets/${name}.glb`;
  const bytes=await fs.readFile(path.join(root,filename));
  const result=await validator.validateBytes(new Uint8Array(bytes),{uri:filename,maxIssues:1000});
  await fs.writeFile(path.join(root,'verification',`${name}-khronos.json`),JSON.stringify(result,null,2)+'\n');
  assert.equal(result.issues.numErrors,0,`${name}: Khronos errors`);
  assert.equal(result.issues.numWarnings,0,`${name}: Khronos warnings`);
  assert.equal(result.issues.numInfos,0,`${name}: Khronos information messages`);
  assert.equal(result.issues.numHints,0,`${name}: Khronos hints`);
  const jsonLength=bytes.readUInt32LE(12);
  const doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  assert((doc.extensionsUsed??[]).every(name=>name==='KHR_mesh_quantization'),'Only standard vertex quantization is allowed');
  assert(bytes.length<=2_000_000,'Repository per-model budget');
  assert(doc.buffers.every(b=>!b.uri),'GLB buffers must be embedded');
  assert((doc.images??[]).every(i=>!i.uri&&Number.isInteger(i.bufferView)),'GLB images must be embedded');
  const names=new Set(doc.nodes.map(n=>n.name));
  if(name==='arena'){
    for(const component of ['Court','Hoop_East','Hoop_West','Roof_Near','Roof_Far','Tunnel_East','Tunnel_West','ScorersTable','TeamBench_East','TeamBench_West']){
      assert(names.has(component),`Missing arena component: ${component}`);
    }
    for(const side of ['Near','Far','East','West'])for(let tier=1;tier<=3;tier++)assert(names.has(`Stands_${side}_Tier${tier}`));
    assert.equal(doc.nodes.filter(n=>n.extras?.seat).length,1776);
    assert.equal(doc.images.length,3);
  }else{
    const rim=doc.meshes.find(m=>m.name==='Hoop_rim').primitives[0];
    const positions=doc.accessors[rim.attributes.POSITION];
    // Pivot is the floor directly beneath the ring; upper/lower ring bounds
    // must straddle 3.05m. Bracket is on +X, so support remains behind it.
    assert(positions.min[0]<-.24&&positions.max[0]>.38);
    assert(Math.abs((positions.min[1]+positions.max[1])/2-3.05)<.02);
    assert.equal(doc.images,undefined);
  }
  reports.push({file:filename,bytes:bytes.length,sha256:sha(bytes),issues:result.issues});
}
const textures=[];
for(const file of (await fs.readdir(path.join(root,'textures'))).sort()){
  const data=await fs.readFile(path.join(root,'textures',file));
  assert(data.length<=200_000,`Texture exceeds 200,000 bytes: ${file}`);
  textures.push({file:`textures/${file}`,bytes:data.length,sha256:sha(data)});
}
async function inventory(dir){
  const files=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    assert(!entry.isSymbolicLink(),'No symlinks in delivered package');
    const absolute=path.join(dir,entry.name);
    if(entry.isDirectory())files.push(...await inventory(absolute));
    else files.push({file:path.relative(root,absolute),bytes:(await fs.stat(absolute)).size});
  }
  return files;
}
const files=await inventory(root);
const total=files.reduce((sum,f)=>sum+f.bytes,0);
assert(total<=6_000_000,`Whole package exceeds 6MB: ${total}`);
const report={date:'2026-11-17',validatorVersion:validator.version(),models:reports,textures,
  packageBytesAtCheck:total,packageLimitBytes:6_000_000,tileLimitBytes:200_000,externalModelDependencies:0,
  checks:['Khronos zero errors/warnings/infos/hints','glTF 2.0 with standard vertex quantization only','each GLB under 2MB','embedded GLB images and buffers','all requested component groups',
    'three tiers on all four sides','1776 seats','standalone hoop pivot and ring height','texture budgets','whole directory budget','no symlinks']};
await fs.writeFile(path.join(root,'verification','assets.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({models:reports.map(r=>({file:r.file,bytes:r.bytes,issues:r.issues})),textures,packageBytes:total},null,2));
