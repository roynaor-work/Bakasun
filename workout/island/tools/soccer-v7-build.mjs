// Build the runtime copies of the three GPT soccer-v7 identities used by the game.
// design/soccer-v7/characters stays untouched. The game drives the skeleton from its
// own motion library (same source clips as the 31 embedded ones), so the embedded
// animations are dropped. LOD1 files also drop textures: at runtime LOD1 meshes reuse
// the LOD0 material. The five GPT primitives stay separate here (the wasm Draco encoder
// produced undecodable output for a joined mesh); the game joins them at load time
// (one draw call per character, see soccer-v7.mjs joinSoccerV7Meshes).
//
// Near mesh: GPT's LOD0 (35K triangles) cannot be used under the game's 130K triangle
// ceiling (the world is ~37K, 12 players at LOD1 are 70K, one LOD0 already adds 30K).
// The near file is LOD0 simplified with meshoptimizer to ~12K triangles (vertices kept,
// so skin weights and UV seams stay valid). Far file = GPT LOD1 (5.8K, textures dropped).
// Usage: node tools/soccer-v7-build.mjs  (needs @gltf-transform/core, extensions,
// functions, meshoptimizer and draco3dgltf installed outside the repo; NODE_PATH or a local install)
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,simplify} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const src=new URL('../design/soccer-v7/characters/models/',import.meta.url),out=new URL('../assets/soccer-v7/',import.meta.url);
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule(),'draco3d.encoder':await draco3d.createEncoderModule()});
const IDENTITIES=['player-01','player-04','goalkeeper'];
const report={};
for(const name of IDENTITIES)for(const lod of [0,1]){
  const file=`${name}-lod${lod}`,target=`${name}-${lod?'far':'near'}`;
  const doc=await io.read(new URL(file+'.glb',src).pathname);
  const root=doc.getRoot();
  for(const animation of root.listAnimations()){for(const c of animation.listChannels())c.dispose();for(const s of animation.listSamplers())s.dispose();animation.dispose();}
  if(lod===1)for(const material of root.listMaterials())material.setBaseColorTexture(null).setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
  if(lod===0)await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.34,error:.01,lockBorder:false}));
  await doc.transform(prune({keepAttributes:true})); // LOD1 keeps its UVs: it samples the LOD0 atlas at runtime
  const bytes=await io.writeBinary(doc);
  await writeFile(new URL(target+'.glb',out),bytes);
  const prims=root.listMeshes()[0].listPrimitives();
  report[target]={source:file,bytes:bytes.length,triangles:prims.reduce((n,p)=>n+p.getIndices().getCount()/3,0),primitives:prims.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
console.log(JSON.stringify(report,null,1));
