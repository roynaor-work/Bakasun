#!/usr/bin/env node
/** Offline LOD authoring for the hoops v4 five (design/hoops-v4/assets/players/*.glb, 27-29K triangles each).
 * The v4 files stay untouched; the game ships the reduced skins next to the v3 LODs in design/hoops/lod-v4/.
 * Same method as hoops-build-lod.mjs (meshoptimizer quadric edge collapse, skeleton and bind pose identical,
 * original node transforms restored). The result keeps the five body shapes and heights, the
 * team_primary / team_secondary / team_trim materials, the 52-bone Mixamo rig and the embedded clips.
 * Build-only dependencies, never shipped: @gltf-transform/{core,functions,extensions} 4.5.1,
 * meshoptimizer 1.3.0, draco3dgltf. Set HOOPS_BUILD_MODULES to that node_modules folder. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const resolver=process.env.HOOPS_BUILD_MODULES?createRequire(path.join(path.resolve(process.env.HOOPS_BUILD_MODULES),'../package.json')):createRequire(import.meta.url);
const load=async name=>{const module=await import(pathToFileURL(resolver.resolve(name)).href);return module.default||module;};
const {NodeIO}=await load('@gltf-transform/core'),{ALL_EXTENSIONS}=await load('@gltf-transform/extensions'),{weld,simplifyPrimitive}=await load('@gltf-transform/functions'),{MeshoptSimplifier}=await load('meshoptimizer'),draco3d=await load('draco3dgltf');
const island=fileURLToPath(new URL('../',import.meta.url)),sources=fileURLToPath(new URL('../design/hoops-v4/assets/players/',import.meta.url)),outputs=fileURLToPath(new URL('../design/hoops/lod-v4/',import.meta.url));
const TARGET=Number(process.env.HOOPS_V4_TARGET||5200);
await mkdir(outputs,{recursive:true});
const relative=file=>path.relative(island,file).split(path.sep).join('/');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule(),'draco3d.encoder':await draco3d.createEncoderModule()});
await MeshoptSimplifier.ready;
const sha=b=>createHash('sha256').update(b).digest('hex');
function restoreNodeTransforms(input,output){
 const parse=bytes=>{const length=bytes.readUInt32LE(12);return {json:JSON.parse(bytes.subarray(20,20+length)),bin:bytes.subarray(28+length)};};
 const source=parse(input),result=parse(output),byName=new Map(source.json.nodes.map(n=>[n.name,n]));
 for(const node of result.json.nodes){const original=byName.get(node.name);if(!original)throw Error('Unexpected generated node '+node.name);for(const key of ['matrix','translation','rotation','scale']){delete node[key];if(original[key])node[key]=original[key];}}
 const json=Buffer.from(JSON.stringify(result.json)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);const bytes=Buffer.alloc(28+padded.length+result.bin.length);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);padded.copy(bytes,20);bytes.writeUInt32LE(result.bin.length,20+padded.length);bytes.writeUInt32LE(0x004e4942,24+padded.length);result.bin.copy(bytes,28+padded.length);return bytes;
}
// share of the triangle budget per part kind (the body carries the silhouette, hair and garments the read)
const KIND=name=>/short0|afro|long0|bob0|braid|pony/i.test(name)?'hair':/eyebrow|eyelash|low-poly/i.test(name)?'face':/shoes/i.test(name)?'shoe':/Jersey|base024|Shorts/.test(name)?'cloth':'body';
const SHARE={body:.5,hair:.07,face:.07,shoe:.1,cloth:.26};
const report={generator:'tools/hoops-build-v4-lod.mjs',targetTriangles:TARGET,created:new Date().toISOString().slice(0,10),method:'Offline meshoptimizer quadric-error edge collapse (same flags and attribute weights as hoops-build-lod.mjs); skeleton, bind pose and node transforms identical; source GLBs unchanged',tools:{'@gltf-transform/core':'4.5.1','@gltf-transform/functions':'4.5.1',meshoptimizer:'1.3.0',draco3dgltf:'1.5.7'},assets:[]};
for(const role of ['pg','sg','sf','pf','c']){
 const source=path.join(sources,role+'.glb'),output=path.join(outputs,`hoops-v4-${role}-lod.glb`),input=await readFile(source),doc=await io.read(source);
 const skin=()=>JSON.stringify(doc.getRoot().listSkins().map(s=>({joints:s.listJoints().map(j=>({name:j.getName(),translation:j.getTranslation(),rotation:j.getRotation(),scale:j.getScale()})),inverse:Array.from(s.getInverseBindMatrices().getArray())})));
 const beforeSkin=skin();
 await doc.transform(weld({overwrite:true}));
 const meshes=[],totals={};
 for(const node of doc.getRoot().listNodes()){const mesh=node.getMesh();if(!mesh)continue;for(const prim of mesh.listPrimitives())totals[KIND(node.getName())]=(totals[KIND(node.getName())]||0)+prim.getIndices().getCount()/3;}
 for(const node of doc.getRoot().listNodes()){
  const mesh=node.getMesh();if(!mesh)continue;const name=node.getName(),kind=KIND(name),hair=kind==='hair';
  for(const prim of mesh.listPrimitives()){
   const before=prim.getIndices().getCount()/3;
   // the cut share of this part: its slice of the budget, shared among parts of the same kind in proportion to size
   const ratio=Math.min(1,Math.max(.03,TARGET*SHARE[kind]*(before/totals[kind])/before)),error=kind==='cloth'?.03:kind==='shoe'?.025:kind==='face'||hair?.02:.005;
   const semantics=['NORMAL','TEXCOORD_0','COLOR_0','WEIGHTS_0','JOINTS_0'].filter(n=>prim.getAttribute(n)),attributeWeights=[];
   for(const semantic of semantics){const n=prim.getAttribute(semantic).getElementSize();for(let k=0;k<n;k++)attributeWeights.push(semantic==='NORMAL'?.2:semantic==='TEXCOORD_0'?.15:semantic==='COLOR_0'?.08:semantic==='WEIGHTS_0'?.02:.001);}
   const attributeStride=attributeWeights.length,attributes=new Float32Array(prim.getAttribute('POSITION').getCount()*attributeStride),element=[];
   for(let i=0;i<prim.getAttribute('POSITION').getCount();i++){let offset=i*attributeStride;for(const semantic of semantics){const accessor=prim.getAttribute(semantic);accessor.getElement(i,element);for(let k=0;k<accessor.getElementSize();k++)attributes[offset++]=element[k];}}
   const wrapper={...MeshoptSimplifier,simplify:(indices,positions,stride,target,error)=>MeshoptSimplifier.simplifyWithAttributes(indices,positions,stride,attributes,attributeStride,attributeWeights,null,target,error,['RegularizeLight','Permissive',...(hair?['Prune']:[])])};
   if(before>150)simplifyPrimitive(prim,{simplifier:wrapper,ratio,error,lockBorder:false});
   meshes.push({name,kind,before,after:prim.getIndices().getCount()/3,vertices:prim.getAttribute('POSITION').getCount(),ratio:+ratio.toFixed(3),error});
  }
 }
 if(beforeSkin!==skin())throw Error('Skeleton changed: '+role);
 await io.write(output,doc);const bytes=restoreNodeTransforms(input,await readFile(output));await writeFile(output,bytes);
 const row={role,source:relative(source),sourceSha256:sha(input),sourceBytes:input.length,output:relative(output),outputSha256:sha(bytes),bytes:bytes.length,bones:doc.getRoot().listSkins()[0].listJoints().length,bindIdentical:true,originalNodeTransforms:true,triangles:meshes.reduce((s,m)=>s+m.after,0),sourceTriangles:meshes.reduce((s,m)=>s+m.before,0),meshes};report.assets.push(row);console.log(JSON.stringify({...row,meshes:undefined}));
}
// The venue: the 189K-triangle seated crowd (489 modelled spectators in one static mesh) is reduced by CROWD_RATIO;
// every other part of the arena keeps its triangles. Same simplifier, vertex colours weighted in.
{
 const CROWD_RATIO=Number(process.env.HOOPS_V4_CROWD_RATIO||.45),source=path.join(island,'design/hoops-v4/assets/arena.glb'),output=path.join(outputs,'hoops-v4-arena-lod.glb'),input=await readFile(source),doc=await io.read(source);
 await doc.transform(weld({overwrite:true}));
 const meshes=[];
 for(const node of doc.getRoot().listNodes()){
  const mesh=node.getMesh();if(!mesh||node.getName()!=='seated_crowd')continue;
  for(const prim of mesh.listPrimitives()){
   const before=prim.getIndices().getCount()/3,semantics=['NORMAL','COLOR_0'].filter(n=>prim.getAttribute(n)),attributeWeights=[];
   for(const semantic of semantics){const n=prim.getAttribute(semantic).getElementSize();for(let k=0;k<n;k++)attributeWeights.push(semantic==='NORMAL'?.2:.08);}
   const attributeStride=attributeWeights.length,attributes=new Float32Array(prim.getAttribute('POSITION').getCount()*attributeStride),element=[];
   for(let i=0;i<prim.getAttribute('POSITION').getCount();i++){let offset=i*attributeStride;for(const semantic of semantics){const accessor=prim.getAttribute(semantic);accessor.getElement(i,element);for(let k=0;k<accessor.getElementSize();k++)attributes[offset++]=element[k];}}
   const wrapper={...MeshoptSimplifier,simplify:(indices,positions,stride,target,error)=>MeshoptSimplifier.simplifyWithAttributes(indices,positions,stride,attributes,attributeStride,attributeWeights,null,target,error,['RegularizeLight','Permissive'])};
   simplifyPrimitive(prim,{simplifier:wrapper,ratio:CROWD_RATIO,error:.02,lockBorder:false});
   meshes.push({name:'seated_crowd',before,after:prim.getIndices().getCount()/3,vertices:prim.getAttribute('POSITION').getCount(),ratio:CROWD_RATIO,error:.02});
  }
 }
 if(!meshes.length)throw Error('arena has no seated_crowd');
 await io.write(output,doc);const bytes=restoreNodeTransforms(input,await readFile(output));await writeFile(output,bytes);
 let triangles=0;for(const node of doc.getRoot().listNodes()){const m=node.getMesh();if(m)for(const prim of m.listPrimitives())triangles+=prim.getIndices().getCount()/3;}
 const row={role:'arena',source:relative(source),sourceSha256:sha(input),sourceBytes:input.length,output:relative(output),outputSha256:sha(bytes),bytes:bytes.length,originalNodeTransforms:true,triangles,sourceTriangles:213316,meshes};report.assets.push(row);console.log(JSON.stringify({...row,meshes:undefined}));
}
await writeFile(path.join(outputs,'hoops-v4-lod-provenance.json'),JSON.stringify(report,null,2)+'\n');
