/** Local Draco adapter for the island's script-src 'self' policy.
 * A same-origin static worker replaces the vendor loader's generated blob worker;
 * geometry decoding and the worker protocol remain the vendored implementation.
 * The worker has its own response policy, so the page needs no WASM/eval exception. */
import {DRACOLoader} from '../vendor/DRACOLoader.js';

export class HoopsDRACOLoader extends DRACOLoader {
 _initDecoder(){
  if(this.decoderPending)return this.decoderPending;
  if(typeof WebAssembly!=='object')return Promise.reject(Error('Basketball Draco requires WebAssembly'));
  this.decoderPending=this._loadLibrary('draco_decoder.wasm','arraybuffer').then(binary=>{
   this.decoderConfig.wasmBinary=binary;
   this.workerSourceURL=new URL('./hoops-draco-worker.mjs',import.meta.url).href;
  });
  return this.decoderPending;
 }

 _getWorker(taskID,taskCost){
  return super._getWorker(taskID,taskCost).then(worker=>{
   if(!worker._hoopsErrorsBound){
    worker._hoopsErrorsBound=true;
    const fail=event=>{
     const error=Error('Basketball Draco worker: '+(event.message||'message decoding failed'));
     worker._hoopsFailure=error;
     // Vendor DRACOLoader has only an onmessage handler. A CSP, script-load or
     // worker failure must reject pending GLTF requests instead of hanging loading.
     for(const callback of Object.values(worker._callbacks))callback.reject(error);
    };
    worker.addEventListener('error',fail);
    worker.addEventListener('messageerror',fail);
   }
   if(worker._hoopsFailure)throw worker._hoopsFailure;
   return worker;
  });
 }

 dispose(){
  for(const worker of this.workerPool)for(const callback of Object.values(worker._callbacks))callback.reject(Error('Basketball Draco loader disposed'));
  return super.dispose();
 }
}
