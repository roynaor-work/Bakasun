/** Original v10 binary glTF utilities. CC0-1.0. All offsets are bytes. */
const widths = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const components = {5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
const requireThat=(ok,message)=>{if(!ok)throw new Error(message);};

export function unpack(input) {
 const bytes=Buffer.isBuffer(input)?input:Buffer.from(input);
 requireThat(bytes.length>=28&&bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2,'Expected a binary glTF 2 file');
 requireThat(bytes.readUInt32LE(8)===bytes.length,'GLB length mismatch');
 const chunks=[];
 for(let offset=12;offset<bytes.length;){
  requireThat(offset+8<=bytes.length,'Truncated chunk header');
  const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);
  requireThat(size%4===0&&offset+8+size<=bytes.length,'Invalid chunk extent');
  chunks.push({type,data:bytes.subarray(offset+8,offset+8+size)});offset+=8+size;
 }
 requireThat(chunks.length===2&&chunks[0].type===0x4e4f534a&&chunks[1].type===0x004e4942,'Expected JSON then BIN');
 const document=JSON.parse(chunks[0].data.toString('utf8'));
 requireThat(document.asset?.version==='2.0'&&document.buffers?.length===1&&!document.buffers[0].uri,'Expected self-contained glTF 2');
 requireThat(document.buffers[0].byteLength<=chunks[1].data.length&&chunks[1].data.length-document.buffers[0].byteLength<4,'Invalid binary buffer length');
 return {document,json:document,binary:chunks[1].data};
}

export function pack(document,input) {
 const binary=Buffer.isBuffer(input)?input:Buffer.from(input);
 const source=Buffer.from(JSON.stringify(document),'utf8');
 const json=Buffer.alloc(Math.ceil(source.length/4)*4,32);source.copy(json);
 const bin=Buffer.alloc(Math.ceil(binary.length/4)*4);binary.copy(bin);
 const bytes=Buffer.alloc(28+json.length+bin.length);
 bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);
 bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
 bytes.writeUInt32LE(bin.length,20+json.length);bytes.writeUInt32LE(0x004e4942,24+json.length);bin.copy(bytes,28+json.length);
 return bytes;
}

/** Returns raw numeric components, without normalizing integer attributes. */
export function readAccessor(glb,index) {
 const document=glb.document??glb.json,accessor=document.accessors?.[index];
 requireThat(accessor&&!accessor.sparse,`Missing or sparse accessor ${index}`);
 const width=widths[accessor.type],[size,method]=components[accessor.componentType]??[];
 requireThat(width&&size&&accessor.count>0,`Unsupported accessor ${index}`);
 const view=document.bufferViews?.[accessor.bufferView];
 requireThat(view&&view.buffer===0,`Accessor ${index} has no uncompressed data`);
 const stride=view.byteStride??size*width,start=accessor.byteOffset??0;
 requireThat(stride>=size*width&&start>=0&&start+(accessor.count-1)*stride+size*width<=view.byteLength,`Accessor ${index} exceeds bufferView`);
 const data=new DataView(glb.binary.buffer,glb.binary.byteOffset,glb.binary.byteLength),values=[];
 for(let row=0;row<accessor.count;row++)for(let c=0;c<width;c++)values.push(data[method]((view.byteOffset??0)+start+row*stride+c*size,true));
 return {accessor,width,values};
}

/** Remove unused source animation, compressed streams, accessors and views. */
export function compact(document,binary) {
 const accessorReferences=[],keep=(object,key)=>{if(object?.[key]!==undefined)accessorReferences.push([object,key]);};
 for(const mesh of document.meshes??[])for(const primitive of mesh.primitives){keep(primitive,'indices');for(const key of Object.keys(primitive.attributes??{}))keep(primitive.attributes,key);for(const target of primitive.targets??[])for(const key of Object.keys(target))keep(target,key);}
 for(const skin of document.skins??[])keep(skin,'inverseBindMatrices');
 for(const animation of document.animations??[])for(const sampler of animation.samplers){keep(sampler,'input');keep(sampler,'output');}
 for(const node of document.nodes??[])for(const key of Object.keys(node.extensions?.EXT_mesh_gpu_instancing?.attributes??{}))keep(node.extensions.EXT_mesh_gpu_instancing.attributes,key);
 const usedAccessors=[...new Set(accessorReferences.map(([o,k])=>o[k]))].sort((a,b)=>a-b),accessorMap=new Map(usedAccessors.map((v,i)=>[v,i]));
 const oldAccessors=document.accessors;document.accessors=usedAccessors.map(i=>{requireThat(oldAccessors[i],`Invalid accessor ${i}`);return oldAccessors[i];});
 for(const [o,k]of accessorReferences)o[k]=accessorMap.get(o[k]);
 const viewReferences=[];
 function walk(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(walk);return;}for(const [key,child]of Object.entries(value)){if(key==='bufferView')viewReferences.push([value,key]);else if(key!=='bufferViews'&&key!=='extras')walk(child);}}
 walk(document);
 const usedViews=[...new Set(viewReferences.map(([o,k])=>o[k]))].sort((a,b)=>a-b),viewMap=new Map(usedViews.map((v,i)=>[v,i])),parts=[],oldViews=document.bufferViews;let size=0;
 document.bufferViews=usedViews.map(index=>{const v=oldViews[index];requireThat(v&&v.buffer===0&&(v.byteOffset??0)+v.byteLength<=binary.length,`Invalid view ${index}`);const pad=(4-size%4)%4;if(pad){parts.push(Buffer.alloc(pad));size+=pad;}const copy={...v,byteOffset:size};parts.push(binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength));size+=v.byteLength;return copy;});
 for(const [o,k]of viewReferences)o[k]=viewMap.get(o[k]);
 document.buffers=[{byteLength:size}];return pack(document,Buffer.concat(parts));
}
