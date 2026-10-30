import {DRACOLoader} from '../vendor/DRACOLoader.js';

/** The bundled r160 FileLoader wraps the original response in another stream.
 * Chrome can then report an aborted decoder request after its bytes were used.
 * Read each local decoder response to completion, as the independently tested
 * design/viewer adapter does, without changing shared vendor code.
 * The island CSP is script-src 'self', which blocks the vendor loader's generated
 * blob worker, so decoding runs in a same-origin static worker (alpine-draco-worker.mjs).
 */
export class AlpineDracoLoader extends DRACOLoader {
  _initDecoder() {
    if (this.decoderPending) return this.decoderPending;
    if (typeof WebAssembly !== 'object') return Promise.reject(Error('Alpine Draco requires WebAssembly'));
    this.decoderPending = this._loadLibrary('draco_decoder.wasm', 'arraybuffer').then(binary => {
      this.decoderConfig.wasmBinary = binary;
      this.workerSourceURL = new URL('./alpine-draco-worker.mjs', import.meta.url).href;
    });
    return this.decoderPending;
  }

  _getWorker(taskID, taskCost) {
    return super._getWorker(taskID, taskCost).then(worker => {
      if (!worker._alpineErrorsBound) {
        worker._alpineErrorsBound = true;
        const fail = event => {
          const error = Error('Alpine Draco worker: ' + (event.message || 'message decoding failed'));
          worker._alpineFailure = error;
          // A CSP, script-load or worker failure must reject pending GLTF requests instead of hanging loading.
          for (const callback of Object.values(worker._callbacks)) callback.reject(error);
        };
        worker.addEventListener('error', fail);
        worker.addEventListener('messageerror', fail);
      }
      if (worker._alpineFailure) throw worker._alpineFailure;
      return worker;
    });
  }

  async _loadLibrary(url, responseType) {
    url = this.manager.resolveURL(this.decoderPath + url);
    this.manager.itemStart(url);
    try {
      const response = await fetch(url, {
        headers: this.requestHeader,
        credentials: this.withCredentials ? 'include' : 'same-origin',
      });
      if (!response.ok) throw Error(`Alpine Draco decoder ${url}: HTTP ${response.status}`);
      return await (responseType === 'arraybuffer' ? response.arrayBuffer() : response.text());
    } catch (error) {
      this.manager.itemError(url);
      throw error;
    } finally {
      this.manager.itemEnd(url);
    }
  }
}
