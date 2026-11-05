// Create the optional file:// data pack from the final self-contained GLBs.
// Images are deduplicated; Draco and all skin/animation channels stay unchanged.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/fire-v7-tools/package.json');
const esbuild=require('esbuild');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const data={manifest,models:{},maps:{},particles:{},sky:null,decoder:{}};
const url=(b,mime)=>`data:${mime};base64,${b.toString('base64')}`;
for(const asset of manifest.assets){
  const bytes=await fs.readFile(path.join(root,asset.file));
  const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  const binOffset=20+jsonLength+8,bin=bytes.subarray(binOffset);
  const remove=new Set();
  for(const img of json.images||[]){
    remove.add(img.bufferView);delete img.bufferView;img.uri='fire-atlas:'+asset.texture;
  }
  const remap=new Map(),chunks=[];let offset=0;
  const views=[];
  for(let i=0;i<(json.bufferViews||[]).length;i++){
    const v=json.bufferViews[i];if(remove.has(i))continue;
    const content=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
    remap.set(i,views.length);views.push({...v,byteOffset:offset});chunks.push(content);offset+=content.length;
    const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  }
  json.bufferViews=views;
  function rewrite(obj){
    if(!obj||typeof obj!=='object')return;
    if(typeof obj.bufferView==='number')obj.bufferView=remap.get(obj.bufferView);
    for(const [key,value]of Object.entries(obj))if(key!=='bufferView')rewrite(value);
  }
  rewrite(json);json.buffers[0].byteLength=offset;
  const text=Buffer.from(JSON.stringify(json)),padding=(4-text.length%4)%4;
  const jsonChunk=Buffer.concat([text,Buffer.alloc(padding,32)]),binary=Buffer.concat(chunks);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+binary.length,8);
  header.writeUInt32LE(jsonChunk.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  data.models[asset.id]=Buffer.concat([header,jsonChunk,binHeader,binary]).toString('base64');
  if(!data.maps[asset.texture])data.maps[asset.texture]=url(await fs.readFile(path.join(root,asset.texture)),'image/png');
}
for(const file of await fs.readdir(path.join(root,'particles'))){
  if(file.endsWith('.png'))data.particles[file.replace('.png','')]=url(await fs.readFile(path.join(root,'particles',file)),'image/png');
}
// File URLs have opaque origins in some browsers. Data URIs also keep WebGL
// image uploads independent of relative-file CORS and any HTTP image fetch.
data.sky=url(await fs.readFile(path.join(root,'textures/fire-sky.jpg')),'image/jpeg');
const dracoRoot='/tmp/fire-v7-tools/node_modules/three/examples/jsm/libs/draco/gltf';
data.decoder.wrapper=await fs.readFile(path.join(dracoRoot,'draco_wasm_wrapper.js'),'utf8');
data.decoder.wasm=(await fs.readFile(path.join(dracoRoot,'draco_decoder.wasm'))).toString('base64');
await fs.writeFile(path.join(root,'assets-data.js'),'/* Local data only: no network, user data or executable asset code. */\nwindow.FireData='+JSON.stringify(data)+';\n');
await esbuild.build({entryPoints:[path.join(root,'source/core.js')],bundle:true,format:'iife',globalName:'FireCore',
  outfile:path.join(root,'vendor/fire-core.js'),nodePaths:['/tmp/fire-v7-tools/node_modules'],minify:true,
  target:['es2020'],legalComments:'eof'});
await fs.copyFile('/tmp/fire-v7-tools/node_modules/three/LICENSE',path.join(root,'vendor/LICENSE.three'));
await fs.copyFile(path.join(root,'../viewer/draco/LICENSE.draco'),path.join(root,'vendor/LICENSE.draco'));
await fs.copyFile(path.join(dracoRoot,'draco_decoder.wasm'),path.join(root,'vendor/draco_decoder.wasm'));
await fs.copyFile(path.join(dracoRoot,'draco_wasm_wrapper.js'),path.join(root,'vendor/draco_wasm_wrapper.js'));
console.log('Offline pack:',(await fs.stat(path.join(root,'assets-data.js'))).size,'bytes; models:',manifest.assets.length);
