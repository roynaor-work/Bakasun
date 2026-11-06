import { DRACOLoader } from './vendor/DRACOLoader.js';

/** Same-origin classic worker for the island's script-src 'self' policy.
 * The decoder wrapper runs only inside that static worker. The main document
 * fetches the local WASM bytes without eval, Blob scripts or inline code.
 */
export class LocalDRACOLoader extends DRACOLoader {
  preload() {
    // Prewarming has no caller-owned promise. Observe its failure here while
    // retaining decoderPending, so an actual decode still rejects with it.
    this._initDecoder().catch(() => {});
    return this;
  }
  async _loadLibrary(url, responseType) {
    url = this.manager.resolveURL(this.decoderPath + url);
    this.manager.itemStart(url);
    try {
      const response = await fetch(url, {
        headers: this.requestHeader, credentials: this.withCredentials ? 'include' : 'same-origin'
      });
      if (!response.ok) throw new Error(`Soccer motion Draco decoder: HTTP ${response.status}`);
      return await (responseType === 'arraybuffer' ? response.arrayBuffer() : response.text());
    } catch (error) {
      this.manager.itemError(url); throw error;
    } finally { this.manager.itemEnd(url); }
  }
  _initDecoder() {
    if (this.decoderPending) return this.decoderPending;
    if (typeof WebAssembly !== 'object' || this.decoderConfig.type === 'js') {
      return Promise.reject(new Error('Soccer motion requires WebAssembly Draco decoding'));
    }
    this.decoderPending = this._loadLibrary('draco_decoder.wasm', 'arraybuffer').then(binary => {
      this.decoderConfig.wasmBinary = binary;
      this.workerSourceURL = new URL('./draco-worker.js', import.meta.url).href;
    });
    return this.decoderPending;
  }
  _getWorker(taskID, taskCost) {
    return super._getWorker(taskID, taskCost).then(worker => {
      if (!worker._soccerMotionErrorsBound) {
        worker._soccerMotionErrorsBound = true;
        const fail = event => {
          const error = new Error(`Soccer motion Draco worker: ${event.message || 'message decoding failed'}`);
          worker._soccerMotionFailure = error;
          for (const callback of Object.values(worker._callbacks)) callback.reject(error);
          worker.terminate();
        };
        worker.addEventListener('error', fail);
        worker.addEventListener('messageerror', fail);
      }
      if (worker._soccerMotionFailure) throw worker._soccerMotionFailure;
      return worker;
    });
  }
  dispose() {
    for (const worker of this.workerPool) {
      for (const callback of Object.values(worker._callbacks)) callback.reject(new Error('Soccer motion Draco loader disposed'));
      worker.terminate();
    }
    this.workerPool.length = 0;
    // workerSourceURL is an ordinary bundled file, never an object URL.
    return this;
  }
}
