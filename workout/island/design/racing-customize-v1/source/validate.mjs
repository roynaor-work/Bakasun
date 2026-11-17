import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.resolve(process.env.RACING_TOOLS||'/tmp/racing-customize-tools','package.json'));
const validator=require('gltf-validator');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const checks=[];function check(label,fn){fn();checks.push(label);}
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
async function files(dir){const result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await files(p));else result.push(p);}return result;}
const paths=await files(root),reports=[];
check('Exact category counts: 8 / 8 / 6 / 12 / 10 / 6 / 8',()=>{assert.equal(manifest.items.length,58);assert.deepEqual(manifest.categories.map(c=>manifest.items.filter(i=>i.category===c.id).length),[8,8,6,12,10,6,8]);});
check('Unique ids and every item has a unique 96×96 SVG icon',()=>{assert.equal(new Set(manifest.items.map(i=>i.id)).size,58);assert.equal(new Set(manifest.items.map(i=>i.icon)).size,58);});
for(const item of manifest.items){
  for(const field of ['icon','asset'])if(item[field]){
    assert(!path.isAbsolute(item[field])&&!item[field].includes('..'));
    const blob=await fs.readFile(path.join(root,item[field]));
    check(`${item.id} ${field}: bytes and SHA-256`,()=>{assert.equal(blob.length,item[field+'Bytes']);assert.equal(sha(blob),item[field+'Sha256']);});
  }
  const icon=await fs.readFile(path.join(root,item.icon),'utf8');
  check(`${item.id}: clean SVG icon`,()=>{assert.match(icon,/width="96" height="96" viewBox="0 0 96 96"/);assert.doesNotMatch(icon,/<(?:text|script|image|foreignObject)\b|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);});
}
for(const file of paths.filter(p=>p.endsWith('.svg'))){
  const svg=await fs.readFile(file,'utf8');assert.doesNotMatch(svg,/<(?:text|script|foreignObject|image)\b|(?:href|url\s*\()/);
}
for(const file of paths.filter(p=>p.endsWith('.glb'))){
  const blob=await fs.readFile(file),jsonLength=blob.readUInt32LE(12),doc=JSON.parse(blob.subarray(20,20+jsonLength).toString());
  assert.equal(blob.readUInt32LE(8),blob.length);
  assert(!doc.extensionsRequired?.length);assert(!doc.images?.length);assert(!doc.buffers.some(b=>b.uri));
  assert(!doc.extensionsUsed?.some(e=>/draco|meshopt|basis|ktx/i.test(e)));
  const validation=await validator.validateBytes(new Uint8Array(blob),{uri:path.relative(root,file),maxIssues:1000});
  let triangles=0,vertexCount=0,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],minArea=Infinity;
  const binStart=28+jsonLength;
  function data(index){const a=doc.accessors[index],b=doc.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
    const reader={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],out=[];
    for(let i=0;i<a.count;i++){const value=[];for(let k=0;k<width;k++)value.push(blob[reader](binStart+(b.byteOffset||0)+(a.byteOffset||0)+i*(b.byteStride||size*width)+k*size));out.push(value);}return out;}
  for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
    assert.equal(primitive.mode??4,4);const positions=data(primitive.attributes.POSITION),normals=data(primitive.attributes.NORMAL),indices=data(primitive.indices).flat();
    vertexCount+=positions.length;triangles+=indices.length/3;
    for(const point of positions)for(let k=0;k<3;k++){assert(Number.isFinite(point[k]));min[k]=Math.min(min[k],point[k]);max[k]=Math.max(max[k],point[k]);}
    for(const n of normals)assert(Math.abs(Math.hypot(...n)-1)<1e-5);
    for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3).map(j=>{assert(j<positions.length);return positions[j];});
      const u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;minArea=Math.min(minArea,area);assert(area>1e-12);}
  }
  if(!file.includes('/base/')){
    assert(doc.nodes.find(n=>n.name==='Mount'&&!n.translation&&!n.rotation&&!n.scale));
    if(file.includes('/wheels/')){assert(Math.abs(min[1]+.34)<1e-6);assert(Math.abs(max[1]-.34)<1e-6);}
    if(file.includes('/front-wings/')){assert(min[2]+.20 > -1);assert(min[2]+1.98>1.59,'Front wing intersects the tyre longitudinal envelope');}
  }
  const report={file:path.relative(root,file),bytes:blob.length,sha256:sha(blob),triangles,vertices:vertexCount,localBounds:{min,max},minimumTriangleArea:minArea,
    khronos:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,hints:validation.issues.numHints,messages:validation.issues.messages}};
  reports.push(report);
  assert.equal(validation.issues.numErrors,0,JSON.stringify(report));assert.equal(validation.issues.numWarnings,0,JSON.stringify(report));
}
check('37 embedded GLBs; no required extensions, texture codecs or external buffers',()=>assert.equal(reports.length,37));
const basePath=path.join(root,manifest.compatibility.previewBase),base=await fs.readFile(basePath),baseDoc=JSON.parse(base.subarray(20,20+base.readUInt32LE(12)).toString());
for(const [slot,mount] of Object.entries(manifest.compatibility.mounts)){
  if(slot==='wheels')for(const instance of mount.instances){const node=baseDoc.nodes.find(n=>n.name===instance.node);assert(node);node.translation.forEach((v,k)=>assert(Math.abs(v-instance.translation[k])<1e-6));}
  else {const node=baseDoc.nodes.find(n=>n.name===mount.node);assert.deepEqual(node.translation,mount.translation);for(const name of mount.replace)assert(baseDoc.nodes.some(n=>n.name===name));}
}
checks.push('Exact source wheel pivots and additive mount translations verified');
const sourcePath=path.resolve(root,manifest.compatibility.source),source=await fs.readFile(sourcePath);
assert.equal(sha(source),manifest.compatibility.sourceSha256);checks.push('Original player-car source hash matches');
const html=await fs.readFile(path.join(root,'preview.html'),'utf8');
assert(!/<script[^>]+src=|<link[^>]+https?:/.test(html));
assert(html.includes("connect-src 'none'"));
assert(!/WebAssembly|\.wasm\b|DRACOLoader|MeshoptDecoder|KTX2Loader/.test(html));checks.push('Self-contained preview without network or decoder code');
const data=JSON.parse(html.match(/<script id="pack" type="application\/json">(.*?)<\/script>/s)[1]);
assert.deepEqual(data.manifest,manifest);
for(const [file,value] of Object.entries(data.assets))assert.equal(sha(Buffer.from(value,'base64')),sha(await fs.readFile(path.join(root,file))));
checks.push('Every embedded resource matches its separate delivered file');
const totalBytes=(await Promise.all(paths.map(async p=>(await fs.stat(p)).size))).reduce((a,b)=>a+b,0);
check('Whole delivery is below 8,000,000 bytes',()=>assert(totalBytes<8000000));
const output={schemaVersion:1,validatorVersion:validator.version(),passed:true,checks:checks.length,checkNames:checks,
  models:reports,summary:{models:reports.length,khronosErrors:0,khronosWarnings:0,modelBytes:reports.reduce((n,r)=>n+r.bytes,0),
  maxModelBytes:Math.max(...reports.map(r=>r.bytes)),totalBytesAtValidation:totalBytes}};
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output.summary));
