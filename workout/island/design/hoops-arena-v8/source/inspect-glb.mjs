import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const runtime=new URL('../runtime/',import.meta.url);
let decoderPromise;
export async function dracoModule() {
  return decoderPromise??=(async()=>{
    const scope={WebAssembly,TextDecoder,TextEncoder,console,setTimeout,clearTimeout};vm.createContext(scope);
    const wrapper=await fs.readFile(new URL('vendor/draco/draco_wasm_wrapper.js',runtime),'utf8');vm.runInContext(wrapper,scope,{filename:'local-draco-wrapper.js'});
    const wasmBinary=await fs.readFile(new URL('vendor/draco/draco_decoder.wasm',runtime));
    return scope.DracoDecoderModule({wasmBinary,print:()=>{},printErr:s=>{throw new Error(s);}});
  })();
}
export async function parseGLB(url) {
  const bytes=await fs.readFile(url);
  assert.equal(bytes.readUInt32LE(0),0x46546c67,'GLB magic');assert.equal(bytes.readUInt32LE(4),2,'glTF 2');assert.equal(bytes.readUInt32LE(8),bytes.length,'GLB length');
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a,'GLB document chunk');const size=bytes.readUInt32LE(12);
  const document=JSON.parse(bytes.subarray(20,20+size).toString('utf8'));
  const at=20+size;assert.equal(bytes.readUInt32LE(at+4),0x004e4942,'GLB binary chunk');
  const binary=bytes.subarray(at+8,at+8+bytes.readUInt32LE(at));
  return {bytes,document,binary};
}
export async function decodeParts(url) {
  const {bytes,document:g,binary}=await parseGLB(url),d=await dracoModule();const parts=[];
  assert(g.extensionsRequired?.includes('KHR_draco_mesh_compression'),'Draco is required, not an unused annotation');
  for(const mesh of g.meshes)for(const primitive of mesh.primitives) {
    const ext=primitive.extensions?.KHR_draco_mesh_compression;assert(ext,'Every primitive is Draco compressed');assert.equal(primitive.mode??4,4,'Triangle primitive');
    const view=g.bufferViews[ext.bufferView],stream=binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
    const decoder=new d.Decoder(),buffer=new d.DecoderBuffer(),decoded=new d.Mesh();
    buffer.Init(new Int8Array(stream),stream.byteLength);
    try {
      const status=decoder.DecodeBufferToMesh(buffer,decoded);assert(status.ok(),mesh.name+': '+status.error_msg());
      const count=decoded.num_faces();assert(count>0&&count<35000,'Plausible part size');
      assert.equal(count*3,g.accessors[primitive.indices].count,mesh.name+' decoded index count matches metadata');
      const points=decoded.num_points();assert(points>0);
      const face=new d.DracoInt32Array();
      try {for(let i=0;i<count;i++){assert(decoder.GetFaceFromMesh(decoded,i,face));for(let k=0;k<3;k++)assert(face.GetValue(k)>=0&&face.GetValue(k)<points,'Index in bounds');}}finally{d.destroy(face);}
      const attrs={};
      for(const [semantic,id]of Object.entries(ext.attributes)) {
        const attr=decoder.GetAttributeByUniqueId(decoded,id);assert(attr?.ptr,'Decoded '+semantic);
        const values=new d.DracoFloat32Array();
        try {
          assert(decoder.GetAttributeFloatForAllPoints(decoded,attr,values));
          assert.equal(values.size(),points*attr.num_components());
          for(let i=0;i<values.size();i++)assert(Number.isFinite(values.GetValue(i)),'Finite attribute');
          attrs[semantic]={components:attr.num_components(),count:points};
        } finally {d.destroy(values);}
      }
      parts.push({name:mesh.name,triangles:count,points,attributes:attrs});
    } finally {d.destroy(decoded);d.destroy(buffer);d.destroy(decoder);}
  }
  return {bytes:bytes.length,document:g,parts};
}
