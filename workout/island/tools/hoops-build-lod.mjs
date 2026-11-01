#!/usr/bin/env node
/** Offline basketball LOD authoring. Original GLBs and embedded image bytes remain unchanged.
 * Produces four new -lod.glb files and reproducible hashes/parameters in hoops-lod-provenance.json. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
// Build dependencies only: @gltf-transform/{core,functions,extensions} 4.5.1,
// meshoptimizer 1.3.0. Install with --ignore-scripts outside the game repository.
// Set HOOPS_BUILD_MODULES to that build folder's node_modules, or install in an
// ordinary ancestor workspace node_modules. No dependency is shipped at runtime.
const resolver=process.env.HOOPS_BUILD_MODULES?createRequire(path.join(path.resolve(process.env.HOOPS_BUILD_MODULES),'../package.json')):createRequire(import.meta.url);
const load=async name=>{const module=await import(pathToFileURL(resolver.resolve(name)).href);return module.default||module;};
const {NodeIO}=await load('@gltf-transform/core'),{ALL_EXTENSIONS}=await load('@gltf-transform/extensions'),{weld,simplifyPrimitive}=await load('@gltf-transform/functions'),{MeshoptSimplifier}=await load('meshoptimizer');

const island=fileURLToPath(new URL('../',import.meta.url)),models=fileURLToPath(new URL('../assets/models/',import.meta.url)),outputs=fileURLToPath(new URL('../design/hoops/lod/',import.meta.url));
await mkdir(outputs,{recursive:true});
const relative=file=>path.relative(island,file).split(path.sep).join('/');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const sha=b=>createHash('sha256').update(b).digest('hex');
function restoreNodeTransforms(input,output){
 const parse=bytes=>{const length=bytes.readUInt32LE(12);return {json:JSON.parse(bytes.subarray(20,20+length)),bin:bytes.subarray(28+length)};};
 const source=parse(input),result=parse(output),byName=new Map(source.json.nodes.map(n=>[n.name,n]));
 for(const node of result.json.nodes){const original=byName.get(node.name);if(!original)throw Error('Unexpected generated node '+node.name);for(const key of ['matrix','translation','rotation','scale']){delete node[key];if(original[key])node[key]=original[key];}}
 const json=Buffer.from(JSON.stringify(result.json)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);const bytes=Buffer.alloc(28+padded.length+result.bin.length);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);padded.copy(bytes,20);bytes.writeUInt32LE(result.bin.length,20+padded.length);bytes.writeUInt32LE(0x004e4942,24+padded.length);result.bin.copy(bytes,28+padded.length);return bytes;
}
const report={generator:'tools/hoops-build-lod.mjs',flags:['RegularizeLight','Permissive','Prune for hair'],attributeWeights:{NORMAL:.2,TEXCOORD_0:.15,COLOR_0:.08,WEIGHTS_0:.02,JOINTS_0:.001},created:'2026-10-31',method:'Offline meshoptimizer quadric-error edge collapse; original vertex attributes and skeleton retained; original GLBs unchanged',tools:{'@gltf-transform/core':'4.5.1','@gltf-transform/functions':'4.5.1',meshoptimizer:'1.3.0'},docs:['https://gltf-transform.dev/modules/functions/functions/simplify','https://github.com/zeux/meshoptimizer/blob/master/js/README.md#simplifier'],assets:[]};
for(const kind of ['guard','wing','forward','big']){
 const source=path.join(models,`hoops-${kind}.glb`),output=path.join(outputs,`hoops-${kind}-lod.glb`),input=await readFile(source),doc=await io.read(source);
 const beforeSkin=JSON.stringify(doc.getRoot().listSkins().map(s=>({joints:s.listJoints().map(j=>({name:j.getName(),translation:j.getTranslation(),rotation:j.getRotation(),scale:j.getScale()})),inverse:Array.from(s.getInverseBindMatrices().getArray())})));
 await doc.transform(weld({overwrite:true}));
 const meshes=[];
 for(const node of doc.getRoot().listNodes()){
  const mesh=node.getMesh();if(!mesh)continue;const name=node.getName(),hair=/short0|afro|long0|bob0|braid|pony/i.test(name),face=/eyebrow|eyelash|low-poly/i.test(name);
  const cloth=/Jersey|Shorts/.test(name),shoe=/shoes/i.test(name);
  const ratio=hair?.25:face?.35:cloth?.12:.08,error=hair?.025:cloth?.03:shoe?.025:face?.015:.005;
  for(const prim of mesh.listPrimitives()){
   const before=prim.getIndices().getCount()/3;
   const semantics=['NORMAL','TEXCOORD_0','COLOR_0','WEIGHTS_0','JOINTS_0'].filter(n=>prim.getAttribute(n)),attributeWeights=[];
   for(const semantic of semantics){const n=prim.getAttribute(semantic).getElementSize();for(let k=0;k<n;k++)attributeWeights.push(semantic==='NORMAL'?.2:semantic==='TEXCOORD_0'?.15:semantic==='COLOR_0'?.08:semantic==='WEIGHTS_0'?.02:.001);}
   const attributeStride=attributeWeights.length,attributes=new Float32Array(prim.getAttribute('POSITION').getCount()*attributeStride),element=[];
   for(let i=0;i<prim.getAttribute('POSITION').getCount();i++){let offset=i*attributeStride;for(const semantic of semantics){const accessor=prim.getAttribute(semantic);accessor.getElement(i,element);for(let k=0;k<accessor.getElementSize();k++)attributes[offset++]=element[k];}}
   const wrapper={...MeshoptSimplifier,simplify:(indices,positions,stride,target,error)=>MeshoptSimplifier.simplifyWithAttributes(indices,positions,stride,attributes,attributeStride,attributeWeights,null,target,error,['RegularizeLight','Permissive',...(hair?['Prune']:[])])};
   simplifyPrimitive(prim,{simplifier:wrapper,ratio,error,lockBorder:false});
   meshes.push({name,before,after:prim.getIndices().getCount()/3,vertices:prim.getAttribute('POSITION').getCount(),ratio,error});
  }
 }
 const afterSkin=JSON.stringify(doc.getRoot().listSkins().map(s=>({joints:s.listJoints().map(j=>({name:j.getName(),translation:j.getTranslation(),rotation:j.getRotation(),scale:j.getScale()})),inverse:Array.from(s.getInverseBindMatrices().getArray())})));
 if(beforeSkin!==afterSkin)throw Error('Skeleton changed: '+kind);
 await io.write(output,doc);const bytes=restoreNodeTransforms(input,await readFile(output));await writeFile(output,bytes);const row={kind,source:relative(source),sourceSha256:sha(input),sourceBytes:input.length,output:relative(output),outputSha256:sha(bytes),bytes:bytes.length,bones:doc.getRoot().listSkins()[0].listJoints().length,bindIdentical:true,originalNodeTransforms:true,triangles:meshes.reduce((s,m)=>s+m.after,0),sourceTriangles:meshes.reduce((s,m)=>s+m.before,0),meshes};report.assets.push(row);console.log(JSON.stringify(row));
}
await writeFile(path.join(outputs,'hoops-lod-provenance.json'),JSON.stringify(report,null,2)+'\n');
