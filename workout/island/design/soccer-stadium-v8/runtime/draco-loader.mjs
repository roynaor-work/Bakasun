import {DRACOLoader} from './vendor/DRACOLoader.js';

/** The game's script policy allows same-origin scripts. Decode in an external
 * classic worker, which also keeps WASM compilation out of the main thread. */
export class StadiumDracoLoader extends DRACOLoader {
  constructor(manager,workerURL=new URL('./draco-worker.js',import.meta.url)){
    super(manager);this.stadiumWorkerURL=String(workerURL);
  }
  _initDecoder(){
    if(this.decoderPending)return this.decoderPending;
    this.decoderPending=this._loadLibrary('draco_decoder.wasm','arraybuffer').then(binary=>{
      this.decoderConfig.wasmBinary=binary;this.workerSourceURL=this.stadiumWorkerURL;
    });return this.decoderPending;
  }
  _getWorker(taskID,taskCost){
    return super._getWorker(taskID,taskCost).then(worker=>{
      if(!worker._stadiumErrorsBound){
        worker._stadiumErrorsBound=true;
        const fail=event=>{
          const error=new Error('Stadium Draco worker: '+(event.message||'message decoding failed'));worker._stadiumFailure=error;
          for(const callback of Object.values(worker._callbacks))callback.reject(error);
        };
        worker.addEventListener('error',fail);worker.addEventListener('messageerror',fail);
      }
      if(worker._stadiumFailure)throw worker._stadiumFailure;return worker;
    });
  }
  async _loadLibrary(url,responseType){
    url=this.decoderPath+url;this.manager.itemStart(url);
    try{
      const response=await fetch(url,{headers:this.requestHeader,credentials:this.withCredentials?'include':'same-origin'});
      if(!response.ok)throw new Error('Stadium Draco decoder: HTTP '+response.status);
      return responseType==='arraybuffer'?await response.arrayBuffer():await response.text();
    }catch(error){this.manager.itemError(url);throw error;}
    finally{this.manager.itemEnd(url);}
  }
}
