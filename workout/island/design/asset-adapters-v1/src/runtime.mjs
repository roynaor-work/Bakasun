/**
 * Lazy, renderer-independent asset loading. Importing this module does no I/O.
 * A ready adapter owns decoded JSON/text/module namespaces and validated binary
 * ArrayBuffers. The caller supplies its existing renderer/audio decoder at use.
 */

const TYPES = Object.freeze({ json: 'json', svg: 'text', txt: 'text', css: 'text',
  mjs: 'module', js: 'module', glb: 'glb' });
const HTML = /^\s*(?:<!doctype\s+html|<html(?:\s|>))/i;
const UNSUPPORTED_GLTF = new Set([
  'KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu',
]);

function assetType(asset) {
  return asset.type || TYPES[asset.path.split('.').pop().toLowerCase()] || 'binary';
}

function safeURL(path, baseURL) {
  const decoded = typeof path === 'string' ? decodeURIComponent(path) : '';
  if (!decoded || /[\\?#]/.test(decoded)
    || decoded.startsWith('/') || decoded.split('/').some(part => !part || part === '.' || part === '..')
    || /^[a-z][a-z\d+.-]*:/i.test(decoded) || /\.wasm$/i.test(decoded)) {
    throw new Error('Invalid asset path');
  }
  const base = new URL(baseURL);
  const resolved = new URL(path, base);
  if (!base.pathname.endsWith('/') || !resolved.href.startsWith(base.href)) throw new Error('Asset leaves pack directory');
  return resolved.href;
}

function checkedGLB(buffer) {
  const data = new DataView(buffer);
  if (buffer.byteLength < 20 || data.getUint32(0, true) !== 0x46546c67
    || data.getUint32(4, true) !== 2 || data.getUint32(8, true) !== buffer.byteLength
    || data.getUint32(16, true) !== 0x4e4f534a) throw new Error('Invalid GLB');
  const jsonLength = data.getUint32(12, true);
  if (!jsonLength || jsonLength % 4 || 20 + jsonLength > buffer.byteLength) throw new Error('Invalid GLB JSON');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const extensions = [...(json.extensionsRequired || []), ...(json.extensionsUsed || [])];
  if (extensions.some(extension => UNSUPPORTED_GLTF.has(extension))) throw new Error('Asset needs an unsupported decoder');
  // Pack files must be self-contained: no hidden HTTP dependencies at render time.
  if ([...(json.buffers || []), ...(json.images || [])]
    .some(entry => typeof entry.uri === 'string' && !entry.uri.startsWith('data:'))) throw new Error('External GLB dependency');
  return buffer;
}

function checkedBinary(buffer, extension) {
  const bytes = new Uint8Array(buffer);
  if (!bytes.length || HTML.test(new TextDecoder().decode(bytes.subarray(0, 512)))) throw new Error('Invalid asset body');
  const text = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  const starts = signature => signature.every((value, index) => bytes[index] === value);
  let valid = true;
  if (extension === 'png') valid = starts([137, 80, 78, 71, 13, 10, 26, 10]);
  else if (extension === 'jpg' || extension === 'jpeg') valid = starts([255, 216, 255]);
  else if (extension === 'webp') valid = text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
  else if (extension === 'ogg') valid = text(0, 4) === 'OggS';
  else if (extension === 'wav') valid = text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE';
  else if (extension === 'mp3') valid = text(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  else if (extension === 'glb') return checkedGLB(buffer);
  if (!valid) throw new Error('Unexpected asset format');
  return buffer;
}

async function defaultLoadAsset(asset, { url, signal, fetch: fetchAsset, importModule, cache }) {
  let response;
  if (cache) {
    try { response = await cache.match(url, { ignoreSearch: true }); }
    catch { /* A cache failure can still use the ordinary network path. */ }
  }
  if (signal.aborted) throw new Error('Loading cancelled');
  if (!response) {
    if (typeof fetchAsset !== 'function') throw new Error('Fetch unavailable');
    response = await fetchAsset(url, { signal, credentials: 'same-origin' });
  }
  if (!response?.ok) throw new Error('Asset unavailable');
  const mime = (response.headers?.get?.('content-type') || '').toLowerCase();
  if (mime.includes('text/html') || mime.includes('application/xhtml+xml')) throw new Error('Unexpected HTML asset');
  const type = assetType(asset);
  const extension = asset.path.split('.').pop().toLowerCase();
  if (type === 'json' || type === 'text' || type === 'module') {
    const source = await response.text();
    if (!source.trim() || HTML.test(source)) throw new Error('Unexpected text asset');
    if (type === 'json') return JSON.parse(source);
    if (extension === 'svg' && !/<svg(?:\s|>)/i.test(source)) throw new Error('Invalid SVG');
    if (type === 'module') {
      if (/WebAssembly|\.wasm(?:["'`?\s]|$)/i.test(source)) throw new Error('WASM module unsupported');
      if (signal.aborted) throw new Error('Loading cancelled');
      return importModule(url);
    }
    return source;
  }
  if (type !== 'binary' && type !== 'glb') throw new Error('Unsupported asset type');
  return checkedBinary(await response.arrayBuffer(), type === 'glb' ? 'glb' : extension);
}

function defaultReleaseAsset(value) {
  if (typeof value?.dispose === 'function') return value.dispose();
  if (typeof value?.close === 'function') return value.close();
}

/**
 * metadata.assets: [{ name, path, type? }], relative to options.baseURL.
 * loadAsset(asset, {url, signal, fetch, importModule, cache}) may return renderer objects.
 * options.cache is an explicitly supplied current-version Cache; its hits undergo
 * the same validation as network responses. No global cache is opened implicitly.
 * releaseAsset(value, asset) releases those owned objects, never legacy fallbacks.
 * A failed/cancelled/timed-out load resolves false without logging. A later load
 * retries. dispose() is reusable and invalidates even loaders ignoring abort.
 */
export function createAdapter(metadata, options = {}) {
  const assets = Array.isArray(metadata?.assets) ? metadata.assets : [];
  const loadAsset = options.loadAsset || defaultLoadAsset;
  const releaseAsset = options.releaseAsset || defaultReleaseAsset;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 30000;
  const concurrency = Number.isInteger(options.concurrency) && options.concurrency > 0 ? options.concurrency : 6;
  let loaded = new Map();
  let available = false;
  let pending = null;

  function release(attempt, value, asset) {
    const key = value !== null && (typeof value === 'object' || typeof value === 'function') ? value : asset;
    if (attempt.released.has(key)) return;
    attempt.released.add(key);
    try {
      const result = releaseAsset(value, asset);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch { /* Cleanup must preserve the legacy path. */ }
  }

  function load() {
    if (available) return Promise.resolve(true);
    if (pending) return pending.result;
    if (!assets.length || metadata.available === false) return Promise.resolve(false);
    const attempt = { controller: new AbortController(), staged: new Map(), released: new Set(), finished: false };
    attempt.result = new Promise(resolve => { attempt.resolve = resolve; });
    pending = attempt;
    attempt.finish = success => {
      if (attempt.finished) return;
      attempt.finished = true;
      clearTimeout(attempt.timer);
      if (success) {
        loaded = attempt.staged;
        available = true;
      } else {
        attempt.controller.abort();
        for (const [name, value] of attempt.staged) release(attempt, value, attempt.descriptors.get(name));
        attempt.staged.clear();
      }
      if (pending === attempt) pending = null;
      attempt.resolve(success);
    };
    attempt.timer = setTimeout(() => attempt.finish(false), timeoutMs);
    attempt.descriptors = new Map();
    let next = 0;
    let remaining = Math.min(concurrency, assets.length);
    async function worker() {
      try {
        while (!attempt.finished && next < assets.length) {
          const asset = assets[next++];
          if (!asset || typeof asset.name !== 'string' || !asset.name || attempt.descriptors.has(asset.name)) throw new Error('Invalid asset name');
          if (asset.supported === false) throw new Error('Unsupported asset');
          attempt.descriptors.set(asset.name, asset);
          const url = safeURL(asset.path, options.baseURL);
          const value = await loadAsset(asset, {
            url, signal: attempt.controller.signal,
            fetch: options.fetch || globalThis.fetch?.bind(globalThis),
            importModule: options.importModule || (url => import(url)),
            cache: options.cache,
          });
          if (value === null || value === undefined) throw new Error('Empty asset');
          if (attempt.finished) release(attempt, value, asset);
          else attempt.staged.set(asset.name, value);
        }
        remaining -= 1;
        if (!remaining && !attempt.finished) attempt.finish(true);
      } catch {
        attempt.finish(false);
      }
    }
    // Schedule even custom synchronous loaders after load() returns its promise.
    for (let index = 0; index < Math.min(concurrency, assets.length); index += 1) Promise.resolve().then(worker);
    return attempt.result;
  }

  function dispose() {
    if (pending) pending.finish(false);
    available = false;
    const owned = { released: new Set() };
    for (const [name, value] of loaded) release(owned, value, assets.find(asset => asset.name === name));
    loaded.clear();
  }

  return Object.freeze({
    load,
    ready: () => available,
    get: (name, fallback = null) => available && loaded.has(name) ? loaded.get(name) : fallback,
    dispose,
  });
}
