/** Authoring dependency location may be supplied without installing in the repo.
 * npm i --prefix /tmp/naval-toolchain @gltf-transform/core@4.2.1
 *   @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 draco3dgltf@1.5.7
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const measureOnly=process.argv.includes('--measure-only');
const deps=process.env.NAVAL_TOOLCHAIN || '/tmp/naval-toolchain/node_modules';
const require=createRequire(path.join(deps,'_naval.cjs'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco,dedup,weld}=require('@gltf-transform/functions');
const draco3d=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder':await draco3d.createDecoderModule(),
  'draco3d.encoder':await draco3d.createEncoderModule(),
});
function parse(bytes){
  const b=Buffer.from(bytes);const len=b.readUInt32LE(12);
  return {json:JSON.parse(b.subarray(20,20+len).toString()),bin:b.subarray(28+len)};
}
function pack(json,bin){
  const j=Buffer.from(JSON.stringify(json));const jl=Math.ceil(j.length/4)*4;const bl=Math.ceil(bin.length/4)*4;
  const out=Buffer.alloc(12+8+jl+8+bl);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(jl,12);out.writeUInt32LE(0x4e4f534a,16);out.fill(32,20,20+jl);j.copy(out,20);
  out.writeUInt32LE(bl,20+jl);out.writeUInt32LE(0x004e4942,24+jl);bin.copy(out,28+jl);return out;
}
function externalize(bytes,texture){
  const {json:j,bin}=parse(bytes);
  const omitted=new Set((j.images||[]).map(i=>i.bufferView).filter(i=>i!==undefined));
  const views=[],pieces=[],map=new Map();let at=0;
  for(let i=0;i<j.bufferViews.length;i++){
    if(omitted.has(i))continue;
    const v=j.bufferViews[i],n=Math.ceil(v.byteLength/4)*4,p=Buffer.alloc(n);
    bin.copy(p,0,v.byteOffset||0,(v.byteOffset||0)+v.byteLength);pieces.push(p);
    map.set(i,views.length);views.push({...v,buffer:0,byteOffset:at});at+=n;
  }
  for(const a of j.accessors||[]){
    if(a.bufferView!==undefined)a.bufferView=map.get(a.bufferView);
    if(a.sparse)for(const q of ['indices','values'])a.sparse[q].bufferView=map.get(a.sparse[q].bufferView);
  }
  for(const m of j.meshes||[])for(const p of m.primitives){const d=p.extensions?.KHR_draco_mesh_compression;if(d)d.bufferView=map.get(d.bufferView);}
  j.images=(j.images||[]).map((i)=>({name:i.name,uri:'../textures/'+texture}));
  j.bufferViews=views;j.buffers=[{byteLength:at}];
  j.asset.copyright='Original fictional assets, CC0-1.0; authored for naval-v7';
  return pack(j,Buffer.concat(pieces));
}
const result=[];
for(const dir of ['ships','environment','crew']){
  for(const name of (await fs.readdir(path.join(root,'assets',dir))).filter(n=>n.endsWith('.glb')).sort()){
    const p=path.join(root,'assets',dir,name),source=await fs.readFile(p),original=parse(source).json;
    let out=source;
    if((!original.extensionsRequired?.includes('KHR_draco_mesh_compression')||dir==='crew')&&!measureOnly){
      const doc=await io.read(p);
      if(dir==='crew'){
        // Export canonical local axes, rather than Blender's bone-roll basis.
        // The mesh is already in metre/Y-up coordinates. Rebuild bind inverses
        // from the canonical translations so rest pose remains the same shape.
        const canonical=JSON.parse(await fs.readFile(path.join(root,'assets/crew/canonical-skeleton.json'),'utf8'));
        const world=new Map(),byName=new Map(canonical.bones.map(b=>[b.name,b]));
        for(const b of canonical.bones){const parent=world.get(b.parent)||[0,0,0];world.set(b.name,b.restTranslationMeters.map((v,i)=>v+parent[i]));}
        for(const skin of doc.getRoot().listSkins()){
          const matrices=new Float32Array(skin.listJoints().length*16);
          skin.listJoints().forEach((joint,i)=>{
            const b=byName.get(joint.getName());if(!b)throw new Error('Unknown canonical joint '+joint.getName());
            joint.setTranslation(b.restTranslationMeters).setRotation([0,0,0,1]).setScale([1,1,1]);
            const p=world.get(b.name);matrices.set([1,0,0,0,0,1,0,0,0,0,1,0,-p[0],-p[1],-p[2],1],i*16);
          });
          skin.getInverseBindMatrices().setArray(matrices);
        }
      }
      await doc.transform(dedup(),weld(),draco({method:'edgebreaker',encodeSpeed:4,decodeSpeed:6,quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12,quantizeColor:8,quantizeGeneric:12}));
      const tex=dir==='ships'?'fleet-tide-1024.png':dir==='crew'?'crew-256.png':'basalt-512.png';
      out=externalize(await io.writeBinary(doc),tex);await fs.writeFile(p,out);
    }
    const j=parse(out).json;
    if(out.length>1_500_000)throw new Error(name+' exceeds 1.5MB');
    if(!j.extensionsRequired?.includes('KHR_draco_mesh_compression'))throw new Error(name+' is not Draco compressed');
    const doc=await io.read(p); // Prove every compressed stream decodes after repacking.
    let uniqueTriangles=0,vertices=0,primitives=0,triangles=0,drawsPerInstance=0;
    for(const m of doc.getRoot().listMeshes())for(const prim of m.listPrimitives()){
      uniqueTriangles+=(prim.getIndices()?.getCount()||prim.getAttribute('POSITION').getCount())/3;
      vertices+=prim.getAttribute('POSITION').getCount();primitives++;
    }
    // Count node instances, not just unique mesh resources. Identical cruiser
    // turrets share a mesh but both contribute to an asset's rendered budget.
    const visit=node=>{const mesh=node.getMesh();if(mesh)for(const prim of mesh.listPrimitives()){triangles+=(prim.getIndices()?.getCount()||prim.getAttribute('POSITION').getCount())/3;drawsPerInstance++;}for(const c of node.listChildren())visit(c);};
    for(const s of doc.getRoot().listScenes())for(const n of s.listChildren())visit(n);
    const row={file:'assets/'+dir+'/'+name,bytes:out.length,MB:Number((out.length/1e6).toFixed(6)),triangles,uniqueTriangles,vertices,primitives,drawsPerInstance,
      textures:(j.images||[]).map(i=>i.uri),skinJoints:(j.skins||[]).map(s=>s.joints.length),dracoRequired:true,decoded:true};
    result.push(row);console.log(name,Math.round(triangles)+' tris',out.length+' bytes');
  }
}
await fs.writeFile(path.join(root,'verification/asset-metrics.json'),JSON.stringify(result,null,2)+'\n');
