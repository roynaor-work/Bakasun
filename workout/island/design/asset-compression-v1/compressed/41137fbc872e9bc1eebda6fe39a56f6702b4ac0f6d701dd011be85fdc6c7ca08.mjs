import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {DRACOLoader} from '../vendor/DRACOLoader.js';

// The island CSP permits same-origin scripts, without blob workers. Keep the
// decoder in a static same-origin worker rather than relaxing the app's policy.
export class SoccerDracoLoader extends DRACOLoader {
  _initDecoder() {
    if(this.decoderPending)return this.decoderPending;
    this.decoderPending=this._loadLibrary('draco_decoder.wasm','arraybuffer').then(binary=>{
      this.decoderConfig.wasmBinary=binary;
      this.workerSourceURL=new URL('./soccer-draco-worker.mjs',import.meta.url).href;
    });
    return this.decoderPending;
  }

  _getWorker(taskID,taskCost){
    return super._getWorker(taskID,taskCost).then(worker=>{
      if(!worker._soccerErrorsBound){
        worker._soccerErrorsBound=true;
        const fail=event=>{
          const error=Error('Soccer Draco worker: '+(event.message||'message decoding failed'));
          worker._soccerFailure=error;
          // Worker load/CSP/decoding errors must settle every outstanding asset
          // promise. Otherwise Promise.all keeps a reopened game loading forever.
          for(const callback of Object.values(worker._callbacks))callback.reject(error);
        };
        worker.addEventListener('error',fail);worker.addEventListener('messageerror',fail);
      }
      if(worker._soccerFailure)throw worker._soccerFailure;
      return worker;
    });
  }

  async _loadLibrary(url,responseType){
    url=this.manager.resolveURL(this.decoderPath+url);this.manager.itemStart(url);
    try{
      // Consume the original response completely. The vendor r160 FileLoader's
      // wrapping stream can leave a decoder request aborted during rapid exit.
      const response=await fetch(url,{headers:this.requestHeader,credentials:this.withCredentials?'include':'same-origin'});
      if(!response.ok)throw Error(`Soccer Draco decoder: HTTP ${response.status}`);
      return await(responseType==='arraybuffer'?response.arrayBuffer():response.text());
    }catch(error){this.manager.itemError(url);throw error;}
    finally{this.manager.itemEnd(url);}
  }
}

/** Session-owned, offline Draco decoder. All soccer assets share one worker. */
export function createSoccerDesignLoader() {
  const draco=new SoccerDracoLoader();
  draco.setDecoderPath(new URL('../vendor/draco/',import.meta.url).href);
  draco.setDecoderConfig({type:'wasm'});
  draco.setWorkerLimit(1);
  const loader=new GLTFLoader().setDRACOLoader(draco);
  const pending=new Set();let disposed=false,decoderDisposed=false;
  const finish=promise=>{
    pending.delete(promise);
    // FileLoader/GLTF parsing can create its worker after dispose was requested.
    // Wait for those already-authorized loads, then terminate that final pool.
    if(disposed&&!pending.size&&!decoderDisposed){decoderDisposed=true;draco.dispose();}
  };
  return {
    loadAsync(url){
      if(disposed)return Promise.reject(new Error('Soccer loader disposed'));
      const promise=loader.loadAsync(url);pending.add(promise);
      promise.then(()=>finish(promise),()=>finish(promise));return promise;
    },
    dispose(){if(disposed)return;disposed=true;finish();}
  };
}
