/** Local Draco adapter + GLB fetch for the tennis v7 pack, under the island's script-src 'self' policy.
 * Same design as hoops-draco.mjs / hoops-gltf.mjs (each game keeps its own copy): a same-origin static worker
 * (tennis-draco-worker.mjs) replaces the vendor loader's blob worker, and binary bodies are read with the
 * browser's native reader (Chrome can abort FileLoader's progress wrapper even when every byte arrived). */
import {DRACOLoader} from '../vendor/DRACOLoader.js';

export async function fetchTennisAsset(loader,url,responseType='arraybuffer',{fetcher=globalThis.fetch,signal,parse}={}){
 if(responseType!=='arraybuffer'&&responseType!=='text')throw Error('Unsupported tennis asset response: '+responseType);
 const manager=loader.manager,resolved=manager?.resolveURL(String(url))??String(url);
 manager?.itemStart(resolved);
 try{
  const response=await fetcher(resolved,{headers:loader.requestHeader,credentials:loader.withCredentials?'include':'same-origin',signal});
  if(!response.ok)throw Error('Tennis asset HTTP '+response.status+': '+resolved);
  const bytes=await (responseType==='text'?response.text():response.arrayBuffer());
  return parse?await parse(bytes):bytes;
 }catch(error){manager?.itemError(resolved);throw error;}finally{manager?.itemEnd(resolved);}
}
export function loadTennisGLTF(loader,url,options={}){
 const requested=(loader.path||'')+String(url),resourcePath=new URL('.',requested).href;
 return fetchTennisAsset(loader,requested,'arraybuffer',{...options,parse:buffer=>loader.parseAsync(buffer,resourcePath)});
}

export class TennisDRACOLoader extends DRACOLoader {
 _loadLibrary(url,responseType){
  return fetchTennisAsset(this,this.decoderPath+url,responseType);
 }

 _initDecoder(){
  if(this.decoderPending)return this.decoderPending;
  if(typeof WebAssembly!=='object')return Promise.reject(Error('Tennis Draco requires WebAssembly'));
  this.decoderPending=this._loadLibrary('draco_decoder.wasm','arraybuffer').then(binary=>{
   this.decoderConfig.wasmBinary=binary;
   this.workerSourceURL=new URL('./tennis-draco-worker.mjs',import.meta.url).href;
  });
  return this.decoderPending;
 }

 _getWorker(taskID,taskCost){
  return super._getWorker(taskID,taskCost).then(worker=>{
   if(!worker._tennisErrorsBound){
    worker._tennisErrorsBound=true;
    const fail=event=>{
     const error=Error('Tennis Draco worker: '+(event.message||'message decoding failed'));
     worker._tennisFailure=error;
     for(const callback of Object.values(worker._callbacks))callback.reject(error);
    };
    worker.addEventListener('error',fail);
    worker.addEventListener('messageerror',fail);
   }
   if(worker._tennisFailure)throw worker._tennisFailure;
   return worker;
  });
 }

 dispose(){
  for(const worker of this.workerPool)for(const callback of Object.values(worker._callbacks))callback.reject(Error('Tennis Draco loader disposed'));
  return super.dispose();
 }
}
