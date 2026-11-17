import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const validator=require(process.env.CROWD_TOOLS?path.join(process.env.CROWD_TOOLS,'node_modules/gltf-validator'): 'gltf-validator');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const records=[];
function accessor(doc,bin,id){
  const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
  const size={5121:1,5123:2,5126:4}[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0);
  const out=[];for(let i=0;i<a.count;i++){const row=[];for(let k=0;k<n;k++){const offset=start+i*(v.byteStride||n*size)+k*size;row.push(a.componentType===5126?bin.readFloatLE(offset):a.componentType===5123?bin.readUInt16LE(offset):bin.readUInt8(offset));}out.push(row);}return out;
}
for(const fan of manifest.fans)for(const asset of fan.lods){
  const bytes=await fs.readFile(path.join(root,asset.file));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  assert.equal(bytes.length,asset.bytes);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);
  const result=await validator.validateBytes(new Uint8Array(bytes),{uri:asset.file,maxIssues:100});
  assert.equal(result.issues.numErrors,0,JSON.stringify(result.issues));
  assert.equal(result.issues.numWarnings,0,JSON.stringify(result.issues));
  assert.equal(doc.extensionsRequired,undefined);assert.ok(!doc.buffers.some(b=>b.uri));assert.ok(!doc.images.some(i=>i.uri));
  assert.equal(doc.meshes.length,1);assert.equal(doc.meshes[0].primitives.length,1);
  const primitive=doc.meshes[0].primitives[0];const attr=primitive.attributes;
  const pos=accessor(doc,bin,attr.POSITION),normal=accessor(doc,bin,attr.NORMAL),weights=accessor(doc,bin,attr.WEIGHTS_0),joints=accessor(doc,bin,attr.JOINTS_0),indices=accessor(doc,bin,primitive.indices).flat();
  assert.equal(indices.length/3,manifest.triangleBudgets[asset.lod]);
  for(let i=0;i<pos.length;i++){
    assert.ok(pos[i].every(Number.isFinite));assert.ok(normal[i].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...normal[i])-1)<.0001);
    assert.ok(Math.abs(weights[i].reduce((a,b)=>a+b,0)-1)<1e-6);
    assert.ok(joints[i].every(j=>j>=0&&j<18));
  }
  for(let i=0;i<indices.length;i+=3){
    const [a,b,c]=indices.slice(i,i+3).map(j=>pos[j]);const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
    assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-9);
  }
  assert.ok(Math.abs(Math.max(...pos.map(p=>p[1]))-fan.heightM)<1e-5);
  assert.equal(doc.skins[0].joints.length,18);assert.equal(doc.animations.length,7);
  const seams=[];
  for(const clip of doc.animations){
    assert.ok(manifest.clips.some(c=>c.id===clip.name));assert.equal(clip.extras.loop,true);
    let seam=0;
    for(const channel of clip.channels){
      const sampler=clip.samplers[channel.sampler],input=accessor(doc,bin,sampler.input).flat(),output=accessor(doc,bin,sampler.output);
      assert.equal(input[0],0);assert.ok(Math.abs(input.at(-1)-clip.extras.duration)<1e-6);
      assert.ok(input.every((v,i)=>i===0||v>input[i-1]));
      for(const row of output){assert.ok(row.every(Number.isFinite));if(channel.target.path==='rotation')assert.ok(Math.abs(Math.hypot(...row)-1)<1e-5);}
      if(channel.target.path==='rotation'){
        const dot=output[0].reduce((s,v,k)=>s+v*output.at(-1)[k],0);seam=Math.max(seam,1-Math.abs(dot));
      }else seam=Math.max(seam,...output[0].map((v,k)=>Math.abs(v-output.at(-1)[k])));
      if(channel.target.path==='translation'){assert.equal(doc.nodes[channel.target.node].name,'Hips');assert.ok(output.every(row=>Math.abs(row[0])<1e-7&&Math.abs(row[2])<1e-7));}
    }
    assert.ok(seam<1e-6);seams.push({clip:clip.name,maximumEndpointError:Math.max(0,seam)});
  }
  records.push({file:asset.file,triangles:indices.length/3,bytes:bytes.length,khronos:{errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,messages:result.issues.messages},seams});
}
async function files(dir){const out=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(entry.name==='node_modules'||entry.name==='__pycache__')continue;const file=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await files(file));else out.push({file:path.relative(root,file),bytes:(await fs.stat(file)).size});}return out;}
const report={validatorVersion:validator.version(),pass:true,models:16,glbs:records.length,clipsPerGLB:7,triangleBudgets:manifest.triangleBudgets,glbBytes:records.reduce((s,r)=>s+r.bytes,0),assets:records};
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(report,null,2)+'\n');
const inventory=await files(root),packageBytes=inventory.reduce((s,r)=>s+r.bytes,0);assert.ok(packageBytes<=6000000,`Package ${packageBytes} exceeds 6 MB`);
console.log(JSON.stringify({pass:true,glbs:records.length,errors:0,warnings:0,glbBytes:report.glbBytes,packageBytes}));
