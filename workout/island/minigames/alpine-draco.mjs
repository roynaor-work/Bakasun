import {DRACOLoader} from '../vendor/DRACOLoader.js';

/** The bundled r160 FileLoader wraps the original response in another stream.
 * Chrome can then report an aborted decoder request after its bytes were used.
 * Read each local decoder response to completion, as the independently tested
 * design/viewer adapter does, without changing shared vendor code or workers.
 */
export class AlpineDracoLoader extends DRACOLoader {
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
