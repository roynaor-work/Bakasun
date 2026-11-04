import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const require=createRequire('/tmp/tennis-v7-tools/package.json');
export const THREE=require('three');
export const {Document,NodeIO}=require('@gltf-transform/core');
export const {ALL_EXTENSIONS,KHRDracoMeshCompression}=require('@gltf-transform/extensions');
export const {weld,simplify,resample,prune}=require('@gltf-transform/functions');
export const {MeshoptSimplifier}=require('meshoptimizer');
await MeshoptSimplifier.ready;
const draco=require('draco3dgltf');
export const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
 'draco3d.encoder':await draco.createEncoderModule(), 'draco3d.decoder':await draco.createDecoderModule()
});
export const json=async f=>JSON.parse(await fs.readFile(path.resolve(root,f),'utf8'));
export const writeJSON=async(f,d)=>fs.writeFile(path.resolve(root,f),JSON.stringify(d,null,2)+'\n');
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const acc=(doc,name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(doc.getRoot().listBuffers()[0]??doc.createBuffer());
export async function save(doc,file,metadata={}){
 doc.getRoot().getAsset().generator='Tennis v7 / original CC0 design / glTF Transform 4.5.1';
 doc.getRoot().getAsset().copyright='Original fictional tennis assets. CC0-1.0; see LICENSES.md.';
 await doc.transform(prune());
 const ext=doc.createExtension(KHRDracoMeshCompression).setRequired(true);
 ext.setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,encodeSpeed:5,decodeSpeed:5,
  quantizationBits:{POSITION:16,NORMAL:12,TEX_COORD:14,COLOR:10,GENERIC:16}});
 const bytes=await io.writeBinary(doc);
 if(bytes.length>1500000)throw Error(file+' exceeds 1.5 MB: '+bytes.length);
 await fs.writeFile(path.resolve(root,file),bytes);
 const decoded=await io.readBinary(bytes);let triangles=0,vertices=0;
 for(const mesh of decoded.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  vertices+=p.getAttribute('POSITION').getCount();triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;
 }
 const data={file,bytes:bytes.length,MB:bytes.length/1e6,sha256:sha(bytes),triangles,vertices,...metadata};
 console.log(file,bytes.length+' bytes',triangles+' tris');return data;
}
export function primitive(doc,g,material,name){
 if(!g.index){const n=g.getAttribute('position').count;g.setIndex(Array.from({length:n},(_,i)=>i));}
 if(!g.getAttribute('normal'))g.computeVertexNormals();
 const p=doc.createPrimitive().setMaterial(material);
 for(const [from,to,type] of [['position','POSITION','VEC3'],['normal','NORMAL','VEC3'],['tangent','TANGENT','VEC4'],['uv','TEXCOORD_0','VEC2'],['color','COLOR_0','VEC3']]){
  const attr=g.getAttribute(from);if(attr)p.setAttribute(to,acc(doc,name+' '+from,type,new Float32Array(attr.array)));
 }
 p.setIndices(acc(doc,name+' indices','SCALAR',new Uint32Array(g.index.array)));return p;
}
