#!/usr/bin/env node
/** Offline build: light copies of the city models for the full-city preview.
 * Reads the 58 city-lab GLBs, merges vertices, simplifies the mesh to a ratio and shrinks the texture.
 * Output: assets/models/city/lod/NN-name.glb (same names as the full models, same bounds).
 * Build dependencies only (never shipped): @gltf-transform/{core,functions,extensions}, meshoptimizer, sharp.
 * Set CITY_BUILD_MODULES to that node_modules folder.
 * Usage: node tools/city-models-lod.mjs [ratio=.25] [textureSize=256] [quality=70] */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const resolver=process.env.CITY_BUILD_MODULES?createRequire(path.join(path.resolve(process.env.CITY_BUILD_MODULES),'../package.json')):createRequire(import.meta.url);
const load=async name=>{const m=await import(pathToFileURL(resolver.resolve(name)).href);return m.default||m;};
const {NodeIO}=await load('@gltf-transform/core'),{ALL_EXTENSIONS}=await load('@gltf-transform/extensions');
const fn=await load('@gltf-transform/functions'),{MeshoptSimplifier}=await load('meshoptimizer'),sharp=await load('sharp');
const {weld,simplify,quantize,textureCompress,prune,dedup}=fn;
await MeshoptSimplifier.ready;
const island=fileURLToPath(new URL('../',import.meta.url)),lab=path.join(island,'../city-lab');
const ratio=Number(process.argv[2]||.25),size=Number(process.argv[3]||256),quality=Number(process.argv[4]||70);
const out=path.join(island,'assets/models/city/lod');await mkdir(out,{recursive:true});
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const USED=new Set([1,4,5,7,9,19,20,21,22,25,28,29,30,31,32,33,34,35,39,40,47,49,50,51,52, 13,14,15,16,38,41,42,44,45,46,48,53,55]); // CITY_FILES in view/city-models.mjs + PROP_FILES in view/city-preview-props.mjs
const catalog=JSON.parse(await readFile(path.join(lab,'catalog.json'),'utf8')),rows=[];
for(const m of catalog.models.filter(x=>USED.has(x.id))){
  const doc=await io.read(path.join(lab,'models',m.path));
  const alpha=doc.getRoot().listMaterials().some(x=>x.getAlphaMode()!=='OPAQUE');
  await doc.transform(dedup(),prune(),weld(),simplify({simplifier:MeshoptSimplifier,ratio,error:Number(process.env.LOD_ERROR||.1),lockBorder:false}),
    textureCompress({encoder:sharp,targetFormat:alpha?'webp':'jpeg',resize:[size,size],quality}),quantize({quantizePosition:14,quantizeTexcoord:12,quantizeNormal:8}));
  const file=path.basename(m.path),dest=path.join(out,file);await io.write(dest,doc);
  let triangles=0;for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
  rows.push({id:m.id,file,bytes:(await readFile(dest)).length,triangles:Math.round(triangles),fullTriangles:m.triangles});
}
// The street palm (view/city-streets.mjs) is instanced dozens of times; give it a light copy too.
{const doc=await io.read(path.join(island,'assets/models/palm-tree-512.glb'));
 await doc.transform(dedup(),prune(),weld(),simplify({simplifier:MeshoptSimplifier,ratio,error:Number(process.env.LOD_ERROR||.1),lockBorder:false}),quantize({quantizePosition:14,quantizeTexcoord:12,quantizeNormal:8}));
 const dest=path.join(out,'palm-tree-lod.glb');await io.write(dest,doc);
 let triangles=0;for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
 console.log('palm',Math.round(triangles),'tris',(await readFile(dest)).length,'bytes');}
await writeFile(path.join(out,'catalog.json'),JSON.stringify({generator:'tools/city-models-lod.mjs',ratio,textureSize:size,models:rows},null,1)+'\n');
const sum=k=>rows.reduce((a,r)=>a+r[k],0);console.log(`models ${rows.length} tris ${sum('fullTriangles')} -> ${sum('triangles')} bytes ${(sum('bytes')/1e6).toFixed(2)}MB`);
