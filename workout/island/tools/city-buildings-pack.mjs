// Packs the Codex "city-buildings-v2" GLBs (branch codex/city-progression-v1,
// workout/island/design/city-buildings-v2/models) into the runtime copy under
// assets/city-buildings-v2/. The source models are flat shaded, untextured and
// vertex coloured, so the pack is lossless to the eye and about a quarter of the size:
//   - one palette (sunrise); the second palette differs only in vertex colours;
//   - positions as normalised int16 (KHR_mesh_quantization, read by the stock GLTFLoader,
//     no decoder and no WASM);
//   - normals dropped: every triangle is flat (checked here), and GLTFLoader turns on
//     flat shading for a mesh without normals;
//   - vertices that share position and colour are merged.
// Usage: node workout/island/tools/city-buildings-pack.mjs <source models dir> [palette]
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pad4=n=>(n+3)&~3;

export function packCityGLB(buffer){
  const jsonLength=buffer.readUInt32LE(12),doc=JSON.parse(buffer.subarray(20,20+jsonLength).toString('utf8')),bin=buffer.subarray(20+jsonLength+8);
  if(doc.meshes.length!==1||doc.meshes[0].primitives.length!==1||doc.nodes.length!==1||doc.extensionsUsed?.length)throw Error('unexpected city model layout');
  const primitive=doc.meshes[0].primitives[0];
  const at=index=>{const a=doc.accessors[index],v=doc.bufferViews[a.bufferView];return {a,offset:(v.byteOffset||0)+(a.byteOffset||0)};};
  const P=at(primitive.attributes.POSITION),N=at(primitive.attributes.NORMAL),C=at(primitive.attributes.COLOR_0),I=at(primitive.indices);
  if(P.a.componentType!==5126||C.a.componentType!==5121||C.a.type!=='VEC4'||I.a.componentType!==5123)throw Error('unexpected accessor types');
  const pos=i=>[0,1,2].map(k=>bin.readFloatLE(P.offset+i*12+k*4)),nor=i=>[0,1,2].map(k=>bin.readFloatLE(N.offset+i*12+k*4));
  const indices=Array.from({length:I.a.count},(_,i)=>bin.readUInt16LE(I.offset+i*2));
  for(let t=0;t<indices.length;t+=3){
    const [a,b,c]=[0,1,2].map(k=>pos(indices[t+k])),u=b.map((v,k)=>v-a[k]),w=c.map((v,k)=>v-a[k]);
    const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],length=Math.hypot(...n)||1;
    for(let k=0;k<3;k++){const m=nor(indices[t+k]);if((m[0]*n[0]+m[1]*n[1]+m[2]*n[2])/length<.999)throw Error('a triangle is not flat shaded');}
  }
  const {min,max}=P.a,center=min.map((v,k)=>(v+max[k])/2),half=Math.max(...min.map((v,k)=>(max[k]-v)/2),1e-6);
  const keys=new Map(),vertices=[],remap=[];
  for(let i=0;i<P.a.count;i++){
    const q=pos(i).map((v,k)=>Math.round((v-center[k])/half*32767)),color=[0,1,2,3].map(k=>bin[C.offset+i*4+k]),key=q.join(',')+'|'+color.join(',');
    if(!keys.has(key)){keys.set(key,vertices.length);vertices.push({q,color});}
    remap.push(keys.get(key));
  }
  const count=vertices.length,posBytes=count*8,colorBytes=count*4,indexBytes=pad4(indices.length*2);
  const out=Buffer.alloc(posBytes+colorBytes+indexBytes);
  vertices.forEach((v,i)=>{v.q.forEach((value,k)=>out.writeInt16LE(value,i*8+k*2));v.color.forEach((value,k)=>{out[posBytes+i*4+k]=value;});});
  indices.forEach((value,i)=>out.writeUInt16LE(remap[value],posBytes+colorBytes+i*2));
  const qs=vertices.map(v=>v.q),qmin=[0,1,2].map(k=>Math.min(...qs.map(q=>q[k]))),qmax=[0,1,2].map(k=>Math.max(...qs.map(q=>q[k])));
  const packed={...doc,extensionsUsed:['KHR_mesh_quantization'],extensionsRequired:['KHR_mesh_quantization'],
    nodes:[{...doc.nodes[0],translation:center,scale:[half,half,half]}],
    meshes:[{...doc.meshes[0],primitives:[{...primitive,attributes:{POSITION:0,COLOR_0:1},indices:2}]}],
    buffers:[{byteLength:out.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:posBytes,byteStride:8,target:34962},{buffer:0,byteOffset:posBytes,byteLength:colorBytes,target:34962},{buffer:0,byteOffset:posBytes+colorBytes,byteLength:indices.length*2,target:34963}],
    accessors:[{bufferView:0,componentType:5122,normalized:true,count,type:'VEC3',min:qmin.map(v=>Math.max(v/32767,-1)),max:qmax.map(v=>Math.max(v/32767,-1))},{bufferView:1,componentType:5121,normalized:true,count,type:'VEC4'},{bufferView:2,componentType:5123,count:indices.length,type:'SCALAR'}]};
  let json=Buffer.from(JSON.stringify(packed),'utf8');json=Buffer.concat([json,Buffer.alloc(pad4(json.length)-json.length,0x20)]);
  const header=Buffer.alloc(12),jsonHead=Buffer.alloc(8),binHead=Buffer.alloc(8),total=12+8+json.length+8+out.length;
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);
  jsonHead.writeUInt32LE(json.length,0);jsonHead.writeUInt32LE(0x4e4f534a,4);binHead.writeUInt32LE(out.length,0);binHead.writeUInt32LE(0x004e4942,4);
  return {glb:Buffer.concat([header,jsonHead,json,binHead,out]),vertices:count,triangles:indices.length/3};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const source=process.argv[2],palette=process.argv[3]||'sunrise';
  if(!source){console.error('usage: city-buildings-pack.mjs <source models dir> [palette]');process.exit(2);}
  const target=path.join(root,'assets/city-buildings-v2');await mkdir(target,{recursive:true});
  let before=0,after=0,files=0;
  for(const name of (await readdir(source)).filter(name=>name.includes(`-${palette}-`)&&name.endsWith('.glb')).sort()){
    const input=await readFile(path.join(source,name)),{glb}=packCityGLB(input);
    await writeFile(path.join(target,name.replace(`-${palette}-`,'-')),glb);before+=input.length;after+=glb.length;files++;
  }
  console.log('city buildings packed:',files,'files',before,'->',after,'bytes');
}
