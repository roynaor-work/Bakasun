import {DRACOLoader} from './vendor/DRACOLoader.js';
/** Local static worker keeps the host's script-src/worker-src 'self' policy. */
export class ArenaDracoLoader extends DRACOLoader {
  _initDecoder() {
    if(this.decoderPending)return this.decoderPending;
    if(typeof WebAssembly!=='object')return Promise.reject(Error('Arena Draco requires WebAssembly'));
    this.decoderPending=this._loadLibrary('draco_decoder.wasm','arraybuffer').then(binary=>{
      this.decoderConfig.wasmBinary=binary;this.workerSourceURL=new URL('./draco-worker.js',import.meta.url).href;
    });
    return this.decoderPending;
  }
  async _loadLibrary(name,responseType) {
    const url=this.manager.resolveURL(this.decoderPath+name);this.manager.itemStart(url);
    try {
      const response=await fetch(url,{headers:this.requestHeader,credentials:this.withCredentials?'include':'same-origin'});
      if(!response.ok)throw Error('Arena Draco: HTTP '+response.status);
      return await(responseType==='arraybuffer'?response.arrayBuffer():response.text());
    } catch(error){this.manager.itemError(url);throw error;}finally{this.manager.itemEnd(url);}
  }
  _getWorker(taskID,taskCost) {
    return super._getWorker(taskID,taskCost).then(worker=>{
      if(!worker._arenaErrorsBound) {
        worker._arenaErrorsBound=true;
        const fail=event=>{
          const error=Error('Arena Draco worker: '+(event.message||'message decoding failed'));worker._arenaFailure=error;
          for(const cb of Object.values(worker._callbacks))cb.reject(error);
        };
        worker.addEventListener('error',fail);worker.addEventListener('messageerror',fail);
      }
      if(worker._arenaFailure)throw worker._arenaFailure;return worker;
    });
  }
  dispose(){for(const worker of this.workerPool)for(const cb of Object.values(worker._callbacks))cb.reject(Error('Arena loader disposed'));return super.dispose();}
}
