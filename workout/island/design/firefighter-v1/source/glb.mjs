// SPDX-License-Identifier: CC0-1.0
// Original small uncompressed glTF writer. No encoder, npm package or WASM.
import {readFile} from 'node:fs/promises';
import {pack, unpack, readAccessor,compact} from '../../soccer-header-v1/source/glb.mjs';
export {pack, unpack, readAccessor,compact};
export class GLB {
  constructor(nodes = [], roots = [0]) {
    this.json = {asset:{version:'2.0',generator:'Original firefighter-v1 authoring tools',copyright:'CC0-1.0'},
      scene:0,scenes:[{nodes:roots}],nodes,meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[]};
    this.parts=[]; this.length=0;
  }
  accessor(values, type='VEC3', componentType=5126, target) {
    const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type];
    const ArrayType={5126:Float32Array,5123:Uint16Array,5121:Uint8Array}[componentType];
    const array=new ArrayType(values);
    const pad=(4-this.length%4)%4;
    if(pad){this.parts.push(Buffer.alloc(pad));this.length+=pad;}
    let bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    const elementBytes=width*array.BYTES_PER_ELEMENT;
    const stride=target===34962?Math.ceil(elementBytes/4)*4:elementBytes;
    if(stride!==elementBytes){const aligned=Buffer.alloc(array.length/width*stride);for(let i=0;i<array.length/width;i++)bytes.copy(aligned,i*stride,i*elementBytes,(i+1)*elementBytes);bytes=aligned;}
    const view={buffer:0,byteOffset:this.length,byteLength:bytes.length};
    if(stride!==elementBytes)view.byteStride=stride;
    if(target)view.target=target;
    const bufferView=this.json.bufferViews.push(view)-1;
    this.parts.push(bytes);this.length+=bytes.length;
    const a={bufferView,componentType,count:values.length/width,type};
    if(type!=='MAT4') {
      a.min=Array.from({length:width},(_,i)=>Math.min(...values.filter((_,j)=>j%width===i)));
      a.max=Array.from({length:width},(_,i)=>Math.max(...values.filter((_,j)=>j%width===i)));
    }
    return this.json.accessors.push(a)-1;
  }
  finish(){
    for(const key of ['meshes','materials','animations','skins'])if(this.json[key]?.length===0)delete this.json[key];
    this.json.buffers=[{byteLength:this.length}];return pack(this.json,Buffer.concat(this.parts));
  }
}
export async function inspectBody(file) {
  const glb=unpack(await readFile(file)),j=glb.json;
  return {glb,primitive:j.meshes[0].primitives[0],skeleton:j.skins[0].joints.map(i=>j.nodes[i])};
}
