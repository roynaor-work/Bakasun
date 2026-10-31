#!/usr/bin/env node
/** Offline QEM of the actual characters2 basketball asset. Never used in gameplay.
 * Install the versions below in an isolated authoring folder with --ignore-scripts;
 * point HOOPS_BUILD_MODULES at its node_modules. Original source stays unchanged. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const req=process.env.HOOPS_BUILD_MODULES?createRequire(path.join(path.resolve(process.env.HOOPS_BUILD_MODULES),'../package.json')):createRequire(import.meta.url);
const {NodeIO}=req('@gltf-transform/core'),{ALL_EXTENSIONS}=req('@gltf-transform/extensions'),{weld,simplifyPrimitive}=req('@gltf-transform/functions'),{MeshoptSimplifier}=req('meshoptimizer'),draco=req('draco3dgltf');
const island=fileURLToPath(new URL('../',import.meta.url)),source='design/characters2/basketball-player.glb',output='design/hoops/lod/hoops-player-v2-lod.glb';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
await MeshoptSimplifier.ready;
const input=await readFile(path.join(island,source)),doc=await io.read(path.join(island,source));
const skinProof=()=>JSON.stringify(doc.getRoot().listSkins().map(s=>({bones:s.listJoints().map(n=>({name:n.getName(),translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale()})),inverse:Array.from(s.getInverseBindMatrices().getArray())})));
const bind=skinProof();await doc.transform(weld({overwrite:true}));
const ratio=.25,error=.004,weights={NORMAL:.15,COLOR_0:.4,WEIGHTS_0:.02,JOINTS_0:.001},profiles={head:{ratio:.35,error:.0025},hands:{ratio:.26,error:.003},shoes:{ratio:.12,error:.008},body:{ratio:.25,error:.004}},parts=[];let before=0,after=0,vertices=0;
for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
 before+=primitive.getIndices().getCount()/3;
 const semantics=Object.keys(weights),aw=semantics.flatMap(n=>Array(primitive.getAttribute(n).getElementSize()).fill(weights[n])),stride=aw.length,attributes=new Float32Array(primitive.getAttribute('POSITION').getCount()*stride);
 for(let i=0;i<primitive.getAttribute('POSITION').getCount();i++){let k=i*stride;for(const name of semantics)for(const v of primitive.getAttribute(name).getElement(i,[]))attributes[k++]=v;}
 const boneNames=doc.getRoot().listSkins()[0].listJoints().map(n=>n.getName()),joints=primitive.getAttribute('JOINTS_0'),skinWeights=primitive.getAttribute('WEIGHTS_0'),vertexGroups=[];
 for(let i=0;i<joints.getCount();i++){const j=joints.getElement(i,[]),w=skinWeights.getElement(i,[]),name=boneNames[j[w.indexOf(Math.max(...w))]];vertexGroups.push(name==='Head'?'head':name.endsWith('Hand')?'hands':name.endsWith('Foot')?'shoes':'body');}
 const simplifier={...MeshoptSimplifier,simplify:(indices,positions,positionStride)=>{
  const groups=Object.fromEntries(Object.keys(profiles).map(n=>[n,[]])),usage=new Uint8Array(vertexGroups.length),keys=Object.keys(profiles);
  for(let i=0;i<indices.length;i+=3){const tri=Array.from(indices.subarray(i,i+3)),votes=tri.map(v=>vertexGroups[v]),name=votes.find(n=>votes.filter(v=>v===n).length>=2)||votes[0];groups[name].push(...tri);for(const v of tri)usage[v]|=1<<keys.indexOf(name);}
  const locks=new Uint8Array(usage.length);for(let i=0;i<usage.length;i++)if(usage[i]&&(usage[i]&(usage[i]-1)))locks[i]=1;
  const reduced=[];let achieved=0;
  for(const [name,list] of Object.entries(groups)){if(!list.length)continue;const profile=profiles[name],[result,maxError]=MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(list),positions,positionStride,attributes,stride,aw,locks,Math.floor(list.length*profile.ratio/3)*3,profile.error,['RegularizeLight','Permissive']);reduced.push(...result);achieved=Math.max(achieved,maxError);parts.push({name,sourceTriangles:list.length/3,triangles:result.length/3,...profile});}
  return [Uint32Array.from(reduced),achieved];
 }};
 simplifyPrimitive(primitive,{simplifier,ratio,error,lockBorder:false});
 after+=primitive.getIndices().getCount()/3;vertices+=primitive.getAttribute('POSITION').getCount();
}
if(bind!==skinProof())throw Error('v2 skeleton changed during QEM');
// The runtime has a local Draco adapter, but this derived LOD is uncompressed:
// no per-session decode cost or decoder dependency is required for the player.
for(const extension of doc.getRoot().listExtensionsUsed())if(extension.extensionName==='KHR_draco_mesh_compression')extension.dispose();
const outputPath=path.join(island,output);await mkdir(path.dirname(outputPath),{recursive:true});await io.write(outputPath,doc);
const bytes=await readFile(outputPath),hash=b=>createHash('sha256').update(b).digest('hex');
const report={generator:'tools/hoops-build-v2-lod.mjs',source,output,sourceSha256:hash(input),outputSha256:hash(bytes),sourceBytes:input.length,outputBytes:bytes.length,sourceTriangles:before,triangles:after,vertices,bones:20,bindIdentical:true,ratio,error,parts,attributeWeights:weights,method:'meshoptimizer QEM selects complete original vertex tuples; head and fingers have tighter error bounds; cross-region boundaries locked; original sculpted normals, linear palette, skin weights and inverse binds preserved',tools:{'@gltf-transform/core':'4.5.1','@gltf-transform/functions':'4.5.1',meshoptimizer:'1.3.0',draco3dgltf:'1.5.9'},docs:['https://gltf-transform.dev/modules/functions/functions/simplify','https://github.com/zeux/meshoptimizer/blob/master/js/README.md#simplifier']};
await writeFile(path.join(path.dirname(outputPath),'hoops-player-v2-provenance.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
