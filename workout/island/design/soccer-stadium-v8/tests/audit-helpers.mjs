import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const RUNTIME=path.join(ROOT,'runtime');

export function parseGLB(bytes) {
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB header');
  let document,binary,offset=12;
  while(offset<bytes.length){
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),end=offset+8+length;
    if(end>bytes.length||length%4)throw new Error('Invalid GLB chunk');
    if(type===0x4e4f534a){if(document)throw new Error('Duplicate GLB document');document=JSON.parse(bytes.subarray(offset+8,end).toString());}
    if(type===0x004e4942){if(binary)throw new Error('Duplicate GLB binary');binary=bytes.subarray(offset+8,end);}
    offset=end;
  }
  if(!document||!binary)throw new Error('Missing GLB chunk');return {document,binary};
}

let decoderPromise;
export function decoder() {
  if(!decoderPromise)decoderPromise=(async()=>{
    const scope={WebAssembly,TextDecoder,TextEncoder,setTimeout,clearTimeout,console};vm.createContext(scope);
    vm.runInContext(await fs.readFile(path.join(RUNTIME,'vendor/draco/draco_wasm_wrapper.js'),'utf8'),scope);
    return scope.DracoDecoderModule({wasmBinary:new Uint8Array(await fs.readFile(path.join(RUNTIME,'vendor/draco/draco_decoder.wasm')))});
  })();return decoderPromise;
}

/** Decode the bytes, inspect the real face count and every face index. Metadata
 * is only a cross-check. Nodes are traversed, so mesh reuse is counted again. */
export async function decodedParts(file) {
  const bytes=await fs.readFile(file),{document:g,binary}=parseGLB(bytes),D=await decoder(),parts=new Map(),details=[];
  if(!(g.extensionsRequired??[]).includes('KHR_draco_mesh_compression'))throw new Error('Draco must be required');
  if((g.buffers??[]).some(b=>b.uri))throw new Error('Unexpected external GLB buffer');
  const visited=new Set();
  const visit=(index,ancestors=new Set())=>{
    if(ancestors.has(index))throw new Error('Cyclic GLB graph');
    const next=new Set(ancestors);next.add(index);const node=g.nodes[index];visited.add(index);
    if(node.mesh!==undefined){
      for(const primitive of g.meshes[node.mesh].primitives){
        if((primitive.mode??4)!==4)throw new Error('Only triangles are permitted');
        const ext=primitive.extensions?.KHR_draco_mesh_compression;
        if(!ext)throw new Error('Every primitive must be Draco compressed');
        const view=g.bufferViews[ext.bufferView],data=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
        const dec=new D.Decoder(),buffer=new D.DecoderBuffer(),mesh=new D.Mesh(),face=new D.DracoInt32Array();
        try{
          buffer.Init(new Int8Array(data.buffer,data.byteOffset,data.byteLength),data.byteLength);
          const status=dec.DecodeBufferToMesh(buffer,mesh);
          if(!status.ok()||!mesh.ptr)throw new Error('Draco decode failed: '+status.error_msg());
          const triangles=mesh.num_faces(),vertices=mesh.num_points();
          for(let f=0;f<triangles;f++){
            dec.GetFaceFromMesh(mesh,f,face);
            for(let k=0;k<3;k++)if(face.GetValue(k)<0||face.GetValue(k)>=vertices)throw new Error('Face index out of range');
          }
          if(g.accessors[primitive.indices].count!==triangles*3)throw new Error('Triangle metadata disagrees with decoded faces');
          if(g.accessors[primitive.attributes.POSITION].count!==vertices)throw new Error('Vertex metadata disagrees with decoder');
          const part=node.extras?.part??node.name.split('_')[0];
          const instancing=node.extensions?.EXT_mesh_gpu_instancing;
          const instances=instancing?g.accessors[Object.values(instancing.attributes)[0]].count:1;
          parts.set(part,(parts.get(part)??0)+triangles*instances);
          details.push({part,triangles,vertices,instances,material:g.materials[primitive.material].name});
        }finally{D.destroy(face);D.destroy(mesh);D.destroy(buffer);D.destroy(dec);}
      }
    }
    for(const child of node.children??[])visit(child,next);
  };
  for(const index of g.scenes[g.scene??0].nodes??[])visit(index);
  if(visited.size!==g.nodes.length)throw new Error('Unreachable nodes are not permitted');
  return {parts,details,document:g,bytes:bytes.length};
}

export function webpSize(b) {
  if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP')throw new Error('Invalid WebP');
  for(let offset=12;offset+8<=b.length;){
    const type=b.toString('ascii',offset,offset+4),len=b.readUInt32LE(offset+4),start=offset+8;
    if(type==='VP8X')return [b.readUIntLE(start+4,3)+1,b.readUIntLE(start+7,3)+1];
    if(type==='VP8L'){const v=b.readUInt32LE(start+1);return [(v&16383)+1,((v>>>14)&16383)+1];}
    if(type==='VP8 ')return [b.readUInt16LE(start+6)&16383,b.readUInt16LE(start+8)&16383];
    offset=start+len+(len%2);
  }throw new Error('No WebP image chunk');
}

export async function filesUnder(dir) {
  const result=[];
  for(const item of await fs.readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.isSymbolicLink())throw new Error('Symlinks are not allowed in the package');
    if(item.isDirectory())result.push(...await filesUnder(file));else result.push(file);
  }return result;
}
