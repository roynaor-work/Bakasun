#!/usr/bin/env node
/** Offline build: compresses the 58 city-lab GLBs for island use. Sources under
 * workout/city-lab stay untouched. Output: assets/models/city/NN-name.glb
 * (JPEG texture, quantized, no decoder needed) plus catalog.json (bytes, size after fit).
 * Build dependencies only (never shipped): @gltf-transform/{core,functions,extensions} 4.5.1,
 * sharp. Set CITY_BUILD_MODULES to that node_modules folder.
 * Usage: node tools/city-models-compress.mjs [textureSize=1024] [quality=78] [outDir] */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const resolver=process.env.CITY_BUILD_MODULES?createRequire(path.join(path.resolve(process.env.CITY_BUILD_MODULES),'../package.json')):createRequire(import.meta.url);
const load=async name=>{const m=await import(pathToFileURL(resolver.resolve(name)).href);return m.default||m;};
const {NodeIO}=await load('@gltf-transform/core'),{ALL_EXTENSIONS}=await load('@gltf-transform/extensions');
const fn=await load('@gltf-transform/functions'),{MeshoptEncoder}=await load('meshoptimizer'),sharp=await load('sharp');
const {weld,quantize,textureCompress,prune,dedup}=fn;
const island=fileURLToPath(new URL('../',import.meta.url)),lab=path.join(island,'../city-lab');
const size=Number(process.argv[2]||1024),quality=Number(process.argv[3]||78),out=path.resolve(process.argv[4]||path.join(island,'assets/models/city'));
await mkdir(out,{recursive:true});
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const catalog=JSON.parse(await readFile(path.join(lab,'catalog.json'),'utf8'));
const rows=[];let before=0,after=0;
for(const m of catalog.models){
  const src=path.join(lab,'models',m.path),file=path.basename(m.path).replace(/\.glb$/,'.glb');
  const doc=await io.read(src);
  const alpha=doc.getRoot().listMaterials().some(x=>x.getAlphaMode()!=='OPAQUE');
  await doc.transform(dedup(),prune(),weld(),
    textureCompress({encoder:sharp,targetFormat:alpha?'webp':'jpeg',resize:[size,size],quality}),
    // Meshopt/Draco would need WebAssembly, which the island CSP (script-src 'self') blocks:
    // quantization alone is read natively by GLTFLoader.
    quantize({quantizePosition:14,quantizeTexcoord:12,quantizeNormal:8}));
  const dest=path.join(out,file);await io.write(dest,doc);
  const bytes=(await readFile(dest)).length;before+=m.bytes;after+=bytes;
  rows.push({id:m.id,name:m.name,name_he:m.name_he,category:m.category,file,bytes,sourceBytes:m.bytes,triangles:m.triangles,
    size:[m.width,m.height,m.depth],suggestedLongestSideM:m.suggested_longest_side_m,hasBasePlate:m.has_base_plate,alpha});
}
await writeFile(path.join(out,'catalog.json'),JSON.stringify({generator:'tools/city-models-compress.mjs',textureSize:size,quality,sourceBytes:before,bytes:after,models:rows},null,1)+'\n');
console.log(`models ${rows.length} source ${(before/1e6).toFixed(1)}MB -> ${(after/1e6).toFixed(2)}MB avg ${(after/rows.length/1e3).toFixed(0)}KB max ${(Math.max(...rows.map(r=>r.bytes))/1e3).toFixed(0)}KB`);
