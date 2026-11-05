// Compare every compressed view, accessor, node, skin and animation between the
// delivered GLB and the image-deduplicated local preview payload.
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import vm from'node:vm';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sandbox={window:{}};
vm.runInNewContext(await fs.readFile(path.join(root,'assets-data.js'),'utf8'),sandbox,{timeout:10000});
const data=JSON.parse(JSON.stringify(sandbox.window.FireData)),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
function parse(b){const length=b.readUInt32LE(12);assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(8),b.length);return {json:JSON.parse(b.subarray(20,20+length)),binary:b.subarray(28+length)};}
function normalized(payload,atlas){
 const j=structuredClone(payload.json),imageViews=new Set((j.images||[]).map(i=>i.bufferView).filter(i=>i!==undefined)),views=j.bufferViews;
 const keys=views.map(v=>sha(payload.binary.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)));
 for(const image of j.images||[]){delete image.bufferView;image.uri='fire-atlas:'+atlas;}
 const replace=o=>{if(!o||typeof o!=='object')return;if(typeof o.bufferView==='number')o.bufferView=keys[o.bufferView];for(const[k,v]of Object.entries(o))if(k!=='bufferView')replace(v);};replace(j);
 j.bufferViews=views.flatMap((v,i)=>{if(imageViews.has(i))return[];const out={...v,contentSha256:keys[i]};delete out.byteOffset;return[out];});
 for(const b of j.buffers)b.byteLength=0;return j;
}
const report={generatedAt:new Date().toISOString(),models:[],maps:[],decoder:{},localResources:[],passed:false};
assert.deepEqual(data.manifest,manifest);assert.equal(Object.keys(data.models).length,manifest.assets.length);
for(const a of manifest.assets){
 const original=parse(await fs.readFile(path.join(root,a.file))),packed=parse(Buffer.from(data.models[a.id],'base64'));
 assert.deepEqual(normalized(original,a.texture),normalized(packed,a.texture),a.id+' packed model differs');
 report.models.push({id:a.id,sourceBytes:(await fs.stat(path.join(root,a.file))).size,packedBytes:Buffer.from(data.models[a.id],'base64').length,allGeometryAndAnimationBytesIdentical:true});
}
for(const[file,uri]of Object.entries(data.maps)){
 const bytes=Buffer.from(uri.split(',')[1],'base64'),source=await fs.readFile(path.join(root,file));assert.ok(bytes.equals(source));
 report.maps.push({file,bytes:bytes.length,sha256:sha(bytes)});
}
assert.ok(Buffer.from(data.decoder.wasm,'base64').equals(await fs.readFile(path.join(root,'vendor/draco_decoder.wasm'))));
assert.equal(data.decoder.wrapper,await fs.readFile(path.join(root,'vendor/draco_wasm_wrapper.js'),'utf8'));
report.decoder={wasmBytes:Buffer.from(data.decoder.wasm,'base64').length,wasmSha256:sha(Buffer.from(data.decoder.wasm,'base64')),wrapperSha256:sha(data.decoder.wrapper)};
for(const[file,resource]of [...Object.entries(data.particles).map(([id,uri])=>['particles/'+id+'.png',uri]),['textures/fire-sky.jpg',data.sky]]){
 assert.ok(/^data:image\/(png|jpeg);base64,/.test(resource),file+' must be embedded');
 const bytes=Buffer.from(resource.split(',')[1],'base64'),source=await fs.readFile(path.join(root,file));assert.ok(bytes.equals(source),file+' differs from source');
 report.localResources.push({file,bytes:bytes.length,sha256:sha(bytes),embedded:true});
}
const html=await fs.readFile(path.join(root,'preview.html'),'utf8');
for(const[,src]of html.matchAll(/(?:src|href)="([^"]+)"/g)){if(src.endsWith('.md'))continue;assert.ok(!/^(https?:|\/\/)/.test(src));await fs.access(path.join(root,src));}
report.passed=true;await fs.writeFile(path.join(root,'verification/offline-pack.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,models:report.models.length,sharedMaps:report.maps.length,localParticleAndSkyFiles:report.localResources.length}));
