// Build the lightweight runtime copies of the GPT soccer-v5 characters.
// design/soccer-v5 stays untouched. The game drives skeletons from its own motion
// library (motion/motion2 JSON), so the five embedded clips and the two expression
// morph targets are dropped; mesh, skin, vertex colours and the 18-bone rig stay.
// Usage: node tools/soccer-v5-build.mjs  (needs @gltf-transform/core, extensions,
// functions and draco3dgltf installed outside the repo; NODE_PATH or a local install)
import {NodeIO} from '@gltf-transform/core';
import {KHRDracoMeshCompression} from '@gltf-transform/extensions';
import {prune} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import {writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const src=new URL('../design/soccer-v5/models/',import.meta.url),out=new URL('../assets/soccer-v5/',import.meta.url);
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule(),'draco3d.encoder':await draco3d.createEncoderModule()});
const LOOKS=['teal-quiff','teal-curls','teal-knot','goalkeeper'];
const report={};
for(const name of LOOKS){
  const doc=await io.read(new URL(name+'.glb',src).pathname);
  const root=doc.getRoot();
  for(const animation of root.listAnimations()){for(const channel of animation.listChannels())channel.dispose();for(const sampler of animation.listSamplers())sampler.dispose();animation.dispose();}
  for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives())for(const target of primitive.listTargets())target.dispose();
  for(const mesh of root.listMeshes())mesh.setWeights([]);
  for(const node of root.listNodes())node.setWeights([]);
  await doc.transform(prune());
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,encodeSpeed:0,decodeSpeed:5,quantizationVolume:'mesh',quantizationBits:{POSITION:12,NORMAL:8,COLOR:8,GENERIC:12}});
  const bytes=await io.writeBinary(doc);
  await writeFile(new URL(name+'.glb',out),bytes);
  const primitive=root.listMeshes()[0].listPrimitives()[0];
  report[name]={bytes:bytes.length,triangles:primitive.getIndices().getCount()/3,sha256:createHash('sha256').update(bytes).digest('hex')};
}
console.log(JSON.stringify(report,null,1));
