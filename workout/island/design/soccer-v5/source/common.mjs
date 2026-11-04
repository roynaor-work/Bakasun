import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const i=process.argv.indexOf('--modules');
export const require=createRequire(path.resolve(i<0?'/tmp/soccer-v5-tools/package.json':process.argv[i+1]));
export const {Document,NodeIO}=require('@gltf-transform/core');
export const {ALL_EXTENSIONS,KHRDracoMeshCompression,KHRLightsPunctual}=require('@gltf-transform/extensions');
export const {weld,simplify,resample,prune}=require('@gltf-transform/functions');
export const {MeshoptSimplifier}=require('meshoptimizer');
await MeshoptSimplifier.ready;
const draco=require('draco3dgltf');
export const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder':await draco.createEncoderModule(),
  'draco3d.decoder':await draco.createDecoderModule(),
});
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const json=async file=>JSON.parse(await fs.readFile(path.resolve(root,file),'utf8'));
export const writeJSON=async(file,data)=>fs.writeFile(path.resolve(root,file),JSON.stringify(data,null,2)+'\n');
export const accessor=(doc,name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(doc.getRoot().listBuffers()[0]??doc.createBuffer());
export function compress(doc){
  const ext=doc.getRoot().listExtensionsUsed().find(e=>e.extensionName===KHRDracoMeshCompression.EXTENSION_NAME)??doc.createExtension(KHRDracoMeshCompression);
  ext.setRequired(true).setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    encodeSpeed:5,decodeSpeed:5,quantizationBits:{POSITION:16,NORMAL:12,COLOR:12,GENERIC:20}});
}
export async function save(doc,file,metadata={}){
  doc.getRoot().getAsset().generator='Island soccer-v5 original CC0 assets / glTF Transform 4.5.1';
  doc.getRoot().getAsset().copyright='CC0-1.0. Fictional original athletes and stadium; see LICENSES.md.';
  compress(doc);
  const bytes=await io.writeBinary(doc);
  if(bytes.length>1500000)throw Error(`${file}: ${bytes.length} bytes exceeds 1.5 MB`);
  await fs.writeFile(path.resolve(root,file),bytes);
  const decoded=await io.readBinary(bytes);
  let triangles=0,vertices=0;
  for(const node of decoded.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()??[]){
    vertices+=p.getAttribute('POSITION').getCount();
    triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;
  }
  const record={file,bytes:bytes.length,sha256:sha(bytes),triangles,vertices,...metadata};
  console.log(`${file}: ${record.bytes} bytes, ${triangles} triangles`);
  return record;
}
