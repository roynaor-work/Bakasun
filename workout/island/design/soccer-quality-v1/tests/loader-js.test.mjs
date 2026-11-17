import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(process.env.SOCCER_QUALITY_SOURCE||fileURLToPath(new URL('../../../../../',import.meta.url)));
const runtime=path.join(root,'workout/island');
const source=await readFile(path.join(runtime,'vendor/draco/draco_decoder.js'),'utf8');
const workerSource=await readFile(path.join(runtime,'minigames/soccer-draco-js-worker.mjs'),'utf8');
const {SoccerDracoLoader}=await import(pathToFileURL(path.join(runtime,'minigames/soccer-design-loader.mjs')));

test('quality loader selects a static JS worker before any decoder library request',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
 try{
  for(const search of ['?soccerQuality=v1','?soccerQualityLoft=1','?soccerQualityKeeper=1']){
   Object.defineProperty(globalThis,'location',{value:{search},configurable:true});
   const loader=new SoccerDracoLoader().setDecoderConfig({type:'wasm',wasmBinary:new ArrayBuffer(8)});
   loader._loadLibrary=()=>{throw Error('JavaScript path must not request a WASM decoder');};
   await loader._initDecoder();
   assert.equal(loader.decoderConfig.type,'js');assert.equal(loader.decoderConfig.wasmBinary,undefined);
   assert.match(loader.workerSourceURL,/soccer-draco-js-worker\.mjs$/);
   loader.dispose();
  }
  for(const search of ['','?soccerQuality=0','?soccerQualityLoft=0']){
   Object.defineProperty(globalThis,'location',{value:{search},configurable:true});
   const loader=new SoccerDracoLoader(),requests=[];
   loader._loadLibrary=async(name,type)=>{requests.push({name,type});return new ArrayBuffer(8);};
   await loader._initDecoder();
   assert.deepEqual(requests,[{name:'draco_decoder.wasm',type:'arraybuffer'}]);
   assert.match(loader.workerSourceURL,/soccer-draco-worker\.mjs$/);loader.dispose();
  }
 }finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
});

function compressedPrimitive(bytes){
 const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const primitive=json.meshes.flatMap(mesh=>mesh.primitives).find(p=>p.extensions?.KHR_draco_mesh_compression);
 assert.ok(primitive,'fixture must contain compressed production geometry');
 const extension=primitive.extensions.KHR_draco_mesh_compression,view=json.bufferViews[extension.bufferView],offset=20+jsonLength+8+(view.byteOffset||0);
 return {data:bytes.subarray(offset,offset+view.byteLength),attributes:extension.attributes,points:json.accessors[primitive.attributes.POSITION].count};
}

test('static JS worker decodes a production player with WebAssembly unavailable',async()=>{
 const primitive=compressedPrimitive(await readFile(path.join(runtime,'assets/soccer-v7/player-01-near.glb')));
 let scope,resolveMessage,rejectMessage;
 const decoded=new Promise((resolve,reject)=>{resolveMessage=resolve;rejectMessage=reject;});
 const imports=[];
 scope=vm.createContext({console,WebAssembly:undefined,setTimeout,clearTimeout,location:{href:'https://example.test/workout/island/minigames/soccer-draco-js-worker.mjs'},
  importScripts:url=>{imports.push(url);assert.equal(url,'../vendor/draco/draco_decoder.js');vm.runInContext(source,scope,{filename:'draco_decoder.js'});},
  postMessage:value=>value.type==='error'?rejectMessage(Error(value.error)):resolveMessage(value)
 });
 vm.runInContext('globalThis.self=globalThis',scope);
 vm.runInContext(workerSource,scope,{filename:'soccer-draco-js-worker.mjs'});
 scope.onmessage({data:{type:'init',decoderConfig:{type:'js'}}});
 const data=primitive.data.buffer.slice(primitive.data.byteOffset,primitive.data.byteOffset+primitive.data.byteLength);
 const attributes=Object.fromEntries(Object.entries(primitive.attributes).map(([key,value])=>[key.toLowerCase(),value]));
 const attributeTypes=Object.fromEntries(Object.keys(attributes).map(key=>[key,key==='joints_0'?'Uint16Array':'Float32Array']));
 scope.onmessage({data:{type:'decode',id:1,buffer:data,taskConfig:{attributeIDs:attributes,attributeTypes,useUniqueIDs:true}}});
 const result=await decoded;
 assert.deepEqual(imports,['../vendor/draco/draco_decoder.js']);assert.equal(result.id,1);
 const positions=result.geometry.attributes.find(attribute=>attribute.name==='position');
 assert.equal(positions.array.length/positions.itemSize,primitive.points);
 assert.ok(positions.array.every(Number.isFinite));assert.ok(result.geometry.index.array.length>0);
});
