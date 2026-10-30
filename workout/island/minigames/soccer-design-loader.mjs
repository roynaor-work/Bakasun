import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {DRACOLoader} from '../vendor/DRACOLoader.js';

// The island CSP permits same-origin scripts, without blob workers. Keep the
// decoder in a static same-origin worker rather than relaxing the app's policy.
class SoccerDracoLoader extends DRACOLoader {
  _initDecoder() {
    if(this.decoderPending)return this.decoderPending;
    this.decoderPending=this._loadLibrary('draco_decoder.wasm','arraybuffer').then(binary=>{
      this.decoderConfig.wasmBinary=binary;
      this.workerSourceURL=new URL('./soccer-draco-worker.mjs',import.meta.url).href;
    });
    return this.decoderPending;
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
