import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';
import {HoopsDRACOLoader} from '../workout/island/minigames/hoops-draco.mjs';
import {fetchHoopsAsset,loadHoopsGLTF} from '../workout/island/minigames/hoops-gltf.mjs';

function manager(){const events=[];return {events,resolveURL:url=>url,itemStart:url=>events.push(['start',url]),itemError:url=>events.push(['error',url]),itemEnd:url=>events.push(['end',url])};}
const response=bytes=>({ok:true,arrayBuffer:async()=>bytes,get body(){throw Error('progress stream must never be read');}});

test('GLB loading passes exact native bytes and the original resource directory through URL remapping',async()=>{
 const url='https://island.test/characters/player.glb?cache=a/b#model',bytes=Uint8Array.from([0,7,255,12]).buffer,m=manager(),headers={'X-Asset-Test':'basketball'},signal=new AbortController().signal;let parsed;
 m.resolveURL=()=> 'blob:https://island.test/cached-asset';
 const loader={manager:m,requestHeader:headers,withCredentials:true,parseAsync:async(buffer,path)=>{assert.equal(buffer,bytes);assert.equal(path,'https://island.test/characters/');assert.deepEqual(m.events,[['start','blob:https://island.test/cached-asset']],'manager waits for parsing');parsed={buffer,path};return parsed;}};
 const result=await loadHoopsGLTF(loader,url,{signal,fetcher:async(actual,options)=>{assert.equal(actual,'blob:https://island.test/cached-asset');assert.equal(options.headers,headers);assert.equal(options.credentials,'include');assert.equal(options.signal,signal);return response(bytes);}});
 assert.equal(result,parsed);assert.deepEqual(m.events,[['start','blob:https://island.test/cached-asset'],['end','blob:https://island.test/cached-asset']]);
});

test('configured loader resource path and relative URL directories are preserved',async()=>{
 for(const config of [{path:'/island/',url:'models/player.glb',expected:'/island/models/'},{path:'',resourcePath:'/shared/textures/',url:'player.glb',expected:'/shared/textures/'}]){
  const m=manager(),bytes=new ArrayBuffer(0),loader={...config,manager:m,parseAsync:async(buffer,path)=>{assert.equal(buffer,bytes);return path;}};
  const path=await loadHoopsGLTF(loader,config.url,{fetcher:async(url,options)=>{assert.equal(url,(config.path||'')+config.url);assert.equal(options.credentials,'same-origin');return response(bytes);}});assert.equal(path,config.expected);
 }
});

test('HTTP, native body-reader and parse failures reject promptly and balance manager accounting',async()=>{
 for(const kind of ['http','body','parse','network']){
  const url='https://island.test/player.glb',m=manager(),failure=Error(kind+' failed');let parseCalls=0;
  const loader={manager:m,parseAsync:async()=>{parseCalls++;if(kind==='parse')throw failure;return {};}};
  const fetcher=async()=>{if(kind==='network')throw failure;if(kind==='http')return {ok:false,status:404,arrayBuffer:()=>{throw Error('error body must not be parsed');}};return {ok:true,arrayBuffer:async()=>{if(kind==='body')throw failure;return new ArrayBuffer(0);}};};
  await assert.rejects(loadHoopsGLTF(loader,url,{fetcher}),kind==='http'?/HTTP 404.*player\.glb/:error=>error===failure);
  assert.equal(parseCalls,kind==='parse'?1:0);assert.deepEqual(m.events,[['start',url],['error',url],['end',url]]);
 }
});

test('real basketball GLB parses through the native reader without FileLoader streaming',async()=>{
 const bytes=await readFile(new URL('../workout/island/design/hoops/lod/hoops-player-v2-lod.glb',import.meta.url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),gltf=await loadHoopsGLTF(new GLTFLoader(),'https://island.test/hoops/player.glb',{fetcher:async()=>response(buffer)});let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});assert.ok(mesh);assert.equal(mesh.skeleton.bones.length,20);assert.equal(mesh.geometry.index.count/3,6381);mesh.geometry.dispose();mesh.material.dispose();
});

test('local decoder text and WASM use native readers, configured headers and one cached initialization',async()=>{
 const original=globalThis.fetch,m=manager(),loader=new HoopsDRACOLoader(m).setDecoderPath('https://island.test/draco/').setRequestHeader({'X-Asset-Test':'decoder'}).setWithCredentials(true),wasm=Uint8Array.from([0,97,115,109,1,0,0,0]).buffer,calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push(url);assert.equal(options.credentials,'include');assert.equal(options.headers['X-Asset-Test'],'decoder');return {ok:true,text:async()=> 'local decoder source',arrayBuffer:async()=>wasm,get body(){throw Error('decoder progress stream must not be read');}};};
  assert.equal(await loader._loadLibrary('draco_wasm_wrapper.js','text'),'local decoder source');const pending=loader._initDecoder();assert.equal(loader._initDecoder(),pending);await pending;assert.equal(loader.decoderConfig.wasmBinary,wasm);assert.ok(loader.workerSourceURL.endsWith('/hoops-draco-worker.mjs'));assert.deepEqual(calls,['https://island.test/draco/draco_wasm_wrapper.js','https://island.test/draco/draco_decoder.wasm']);
  globalThis.fetch=async()=>({ok:false,status:503});await assert.rejects(loader._loadLibrary('unavailable.wasm','arraybuffer'),/HTTP 503/);assert.deepEqual(m.events.slice(-3),[['start','https://island.test/draco/unavailable.wasm'],['error','https://island.test/draco/unavailable.wasm'],['end','https://island.test/draco/unavailable.wasm']]);
 }finally{globalThis.fetch=original;loader.dispose();}
});

test('unsupported native decoder response types do not start an unbalanced request',async()=>{
 const m=manager();await assert.rejects(fetchHoopsAsset({manager:m},'local.bin','json'),/Unsupported basketball asset response/);assert.deepEqual(m.events,[]);
});
