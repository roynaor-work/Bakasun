import {CATALOG, CLIPS, CLIP_IDS, CANONICAL_BONE_NAMES} from './catalog.mjs';
import {createStateMachine} from './state-machine.mjs';
export {CATALOG, CLIPS, CLIP_IDS, CANONICAL_BONE_NAMES};
export {createStateMachine, LEGAL_TRANSITIONS, TRANSITION_GRAPH, effectiveTransitionGraph} from './state-machine.mjs';

const DEFAULT_BASE_URL = new URL('../', import.meta.url);
const browserDecoders = new Map();
const pendingClipLoads = new Set();
const disposedResources = new WeakSet();
const disposedImages = new WeakSet();
const isNode = () => typeof process !== 'undefined' && !!process.versions?.node;
const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
};
const bytesOf = bytes => bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
async function readBytes(url, options) {
  if (options.readFile) return bytesOf(await options.readFile(url));
  if (url.protocol === 'file:' && isNode()) return bytesOf(await (await import('node:fs/promises')).readFile(url));
  const response = await (options.fetch || globalThis.fetch)(url, {signal: options.signal});
  if (!response.ok) throw new Error(`Unable to load ${url.pathname}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function parseCompressedJSON(bytes) {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (isNode()) bytes = (await import('node:zlib')).gunzipSync(bytes);
    else {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser needs gzip DecompressionStream support');
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    }
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function validateClip(data, id) {
  if (data.id !== id || !(data.durationSeconds > 0) || !Array.isArray(data.keyframes) || data.keyframes.length < 2) {
    throw new Error(`Invalid keyframe clip: ${id}`);
  }
  const names = data.skeleton?.bones?.map(bone => bone.name);
  if (JSON.stringify(names) !== JSON.stringify(CANONICAL_BONE_NAMES)) throw new Error(`Canonical skeleton mismatch: ${id}`);
  return data;
}
function sharedBrowserDecoder(baseURL) {
  const key = baseURL.href;
  if (!browserDecoders.has(key)) browserDecoders.set(key, import('./vendor/DRACOLoader.js').then(({DRACOLoader}) => {
    class LocalDracoLoader extends DRACOLoader {
      // r160 FileLoader recreates a Response around a streamed reader. Chromium
      // can report that original response as cancelled after delivering the
      // wrapper bytes. Consume the native response completely instead, keeping
      // network completion and decoder readiness tied to the same body read.
      async _loadLibrary(filename, responseType) {
        const url = new URL(filename, this.decoderPath);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Unable to load Draco ${filename}: HTTP ${response.status}`);
        return responseType === 'arraybuffer' ? response.arrayBuffer() : response.text();
      }
      _initDecoder() {
        if (this.decoderPending) return this.decoderPending;
        if (typeof WebAssembly !== 'object') return Promise.reject(new Error('Basketball Draco requires WebAssembly'));
        this.decoderPending = this._loadLibrary('draco_decoder.wasm', 'arraybuffer').then(binary => {
          this.decoderConfig.wasmBinary = binary;
          // Static classic worker, following island/minigames/hoops-draco.mjs.
          // A blob worker inherits the page's script-src 'self' CSP and fails.
          this.workerSourceURL = new URL('draco-worker.js', this.decoderPath).href;
        });
        return this.decoderPending;
      }
      _getWorker(taskID, taskCost) {
        return super._getWorker(taskID, taskCost).then(worker => {
          if (!worker._hoopsErrorsBound) {
            worker._hoopsErrorsBound = true;
            const fail = event => {
              const error = new Error(`Basketball Draco worker: ${event.message || 'message decoding failed'}`);
              worker._hoopsFailure = error;
              for (const callback of Object.values(worker._callbacks)) callback.reject(error);
            };
            worker.addEventListener('error', fail);
            worker.addEventListener('messageerror', fail);
          }
          if (worker._hoopsFailure) throw worker._hoopsFailure;
          return worker;
        });
      }
      dispose() {
        for (const worker of this.workerPool) for (const callback of Object.values(worker._callbacks)) {
          callback.reject(new Error('Basketball Draco loader disposed'));
        }
        return super.dispose();
      }
    }
    return new LocalDracoLoader().setDecoderPath(new URL('runtime/vendor/draco/', baseURL).href)
      .setDecoderConfig({type: 'wasm'}).setWorkerLimit(2);
  }));
  return browserDecoders.get(key);
}
/** Call when the host is finished loading clips, or when unmounting the library.
 * Loaded scenes and animations remain usable; decoder workers are released. */
export async function disposeRuntime() {
  // A player may unmount while JSON, geometry or texture bytes are still in
  // flight. Terminating its decoder before parse settles can strand callbacks.
  while (pendingClipLoads.size) await Promise.allSettled([...pendingClipLoads]);
  const pending = [...browserDecoders.values()]; browserDecoders.clear();
  for (const decoder of await Promise.all(pending)) decoder.dispose();
}

/** Release a loadClip result when its owner is finished with it. The scene is
 * detached, unique GPU resources disposed, and ImageBitmaps closed. Repeated
 * calls, shared materials/maps and alternate scene roots never double-free.
 * A disposed clip must not be played again. Decoder workers are separate and
 * are released by disposeRuntime() after all pending loads have finished. */
export function disposeClip(loaded) {
  const resources = {geometries: new Set(), materials: new Set(), textures: new Set(), skeletons: new Set()};
  const scenes = new Set([loaded?.scene, ...(loaded?.gltf?.scenes || [])].filter(Boolean));
  const counts = {geometries: 0, materials: 0, textures: 0, skeletons: 0, images: 0};
  for (const scene of scenes) {
    scene.removeFromParent?.();
    scene.traverse(object => {
      if (object.geometry) resources.geometries.add(object.geometry);
      if (object.skeleton) resources.skeletons.add(object.skeleton);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        resources.materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.textures.add(value);
        for (const uniform of Object.values(material.uniforms || {})) {
          const values = Array.isArray(uniform.value) ? uniform.value : [uniform.value];
          for (const value of values) if (value?.isTexture) resources.textures.add(value);
        }
      }
    });
  }
  for (const skeleton of resources.skeletons) if (skeleton.boneTexture) {
    resources.textures.add(skeleton.boneTexture);
    skeleton.boneTexture = null; // its texture is included in the deduplicated set
  }
  for (const [kind, set] of Object.entries(resources)) for (const resource of set) {
    if (disposedResources.has(resource)) continue;
    disposedResources.add(resource);
    if (kind === 'textures') for (const image of Array.isArray(resource.image) ? resource.image : [resource.image]) {
      if (image && typeof image.close === 'function' && !disposedImages.has(image)) {
        disposedImages.add(image); image.close(); counts.images++;
      }
    }
    resource.dispose?.(); counts[kind]++;
  }
  return Object.freeze(counts);
}

/**
 * Load one self-contained local clip. The default base is this package, regardless
 * of the importing page. readFile(URL), fetch and a DRACOLoader may be injected.
 * format:'glb' includes the gzip metadata, a scene and the real Three AnimationClip.
 */
export function loadClip(id, options = {}) {
  const pending = loadClipInternal(id, options);
  if (options.format === 'glb') {
    pendingClipLoads.add(pending);
    pending.then(() => pendingClipLoads.delete(pending), () => pendingClipLoads.delete(pending));
  }
  return pending;
}

async function loadClipInternal(id, options) {
  const entry = CLIPS[id];
  if (!entry) throw new RangeError(`Unknown clip: ${id}`);
  const format = options.format || 'json';
  if (!['json', 'glb'].includes(format)) throw new RangeError(`Unknown clip format: ${format}`);
  const baseURL = new URL(options.baseURL || DEFAULT_BASE_URL, DEFAULT_BASE_URL);
  const dataPromise = readBytes(new URL(entry.json, baseURL), options).then(parseCompressedJSON).then(data => validateClip(data, id));
  const glbPromise = format === 'glb' ? readBytes(new URL(entry.glb, baseURL), options) : null;
  const [data, glbBytes] = await Promise.all([dataPromise, glbPromise]);
  const meta = Object.freeze({...entry, durationSeconds: data.durationSeconds, loop: data.loop,
    startState: data.startState, endState: data.endState, events: data.events || [],
    supportWindows: data.supportWindows || [], ballContactWindows: data.ballContactWindows || []});
  if (format === 'json') return {id, format, meta, data};
  const [THREE, {GLTFLoader}] = await Promise.all([import('./vendor/three.module.js'), import('./vendor/GLTFLoader.js')]);
  const loader = options.loader || new GLTFLoader();
  let draco = options.dracoLoader;
  let ownDecoder = false;
  if (!draco) {
    if (isNode()) {ownDecoder = true; draco = await (await import('./node-adapter.mjs')).createNodeDracoLoader();}
    else draco = await sharedBrowserDecoder(baseURL);
  }
  loader.setDRACOLoader(draco);
  if (isNode() && !options.loader) loader.register((await import('./node-adapter.mjs')).nodeTexturePlugin(THREE));
  const bytes = glbBytes;
  let gltf;
  try {gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), new URL('runtime/clips/', baseURL).href);}
  finally {if (ownDecoder) draco.dispose();}
  const animation = gltf.animations.find(clip => clip.name === id) || gltf.animations[0];
  if (!animation) throw new Error(`GLB has no animation: ${id}`);
  return {id, format, meta, data, gltf, scene: gltf.scene, animation};
}

function lerp(a, b, alpha) {return a.map((value, index) => value + (b[index] - value) * alpha);}
function slerp(a, b, alpha) {
  let dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  if (dot < 0) {b = b.map(value => -value); dot = -dot;}
  if (dot > 0.9995) {
    const q = lerp(a, b, alpha), length = Math.hypot(...q);
    return q.map(value => value / length);
  }
  const theta = Math.acos(Math.min(1, dot)), sin = Math.sin(theta);
  const x = Math.sin((1 - alpha) * theta) / sin, y = Math.sin(alpha * theta) / sin;
  return a.map((value, index) => value * x + b[index] * y);
}

/** Normalized keyframe times are sampled with linear vectors and quaternion SLERP,
 * exactly as the GLB LINEAR channels; authored easing is already densely baked. */
export function sampleClip(clip, seconds, {loop = false} = {}) {
  const data = clip.data || clip;
  finite(seconds, 'time');
  const duration = data.durationSeconds;
  const time = loop ? ((seconds % duration) + duration) % duration : Math.min(duration, Math.max(0, seconds));
  const normalized = time / duration;
  const frames = data.keyframes;
  let low = 0, high = frames.length - 1;
  while (high - low > 1) {const mid = (low + high) >> 1; if (frames[mid].time <= normalized) low = mid; else high = mid;}
  const a = frames[low], b = frames[high];
  const alpha = Math.max(0, Math.min(1, (normalized - a.time) / (b.time - a.time || 1)));
  return {timeSeconds: time, timeNormalized: normalized,
    rotations: Object.fromEntries(CANONICAL_BONE_NAMES.map(name => [name, slerp(a.rotations[name], b.rotations[name], alpha)])),
    hipsOffsetMeters: lerp(a.hipsOffsetMeters, b.hipsOffsetMeters, alpha),
    referenceRootTranslationMeters: lerp(a.referenceRootTranslationMeters || [0, 0, 0], b.referenceRootTranslationMeters || [0, 0, 0], alpha),
    ballPositionMeters: lerp(a.ballPositionMeters, b.ballPositionMeters, alpha),
    ballRotationQuaternion: slerp(a.ballRotationQuaternion || [0, 0, 0, 1], b.ballRotationQuaternion || [0, 0, 0, 1], alpha)};
}

/** One controller never changes gameplay state. Non-loop clips hold their final
 * pose. seek does not dispatch events; events crossed by update are presentation. */
export function createClipController({THREE, root, clip, onEvent = () => {}} = {}) {
  if (!THREE?.AnimationMixer) throw new TypeError('Provide the local Three namespace');
  let current = null, mixer = null, action = null, time = 0, playing = false, elapsed = 0;
  const duration = () => current?.meta.durationSeconds || 0;
  function apply() {
    if (!action) return;
    action.enabled = true;
    action.paused = true;
    action.time = time;
    mixer.update(0);
    (root || current.scene).updateMatrixWorld(true);
  }
  const controller = {
    get time() {return time;}, get duration() {return duration();},
    get playing() {return playing;}, get clip() {return current;},
    play(loaded, {restart = true} = {}) {
      if (!loaded?.animation || !(loaded.meta?.durationSeconds > 0)) throw new TypeError('play expects a loaded GLB clip');
      if (loaded !== current || restart) {
        mixer?.stopAllAction();
        if (mixer && current) mixer.uncacheRoot(root || current.scene);
        current = loaded;
        mixer = new THREE.AnimationMixer(root || loaded.scene);
        action = mixer.clipAction(loaded.animation);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        time = 0; elapsed = 0;
      }
      playing = true; apply(); return controller;
    },
    seek(seconds) {
      finite(seconds, 'time');
      time = Math.min(duration(), Math.max(0, seconds)); elapsed = time;
      apply(); return controller;
    },
    pause() {playing = false; return controller;},
    resume() {if (current) playing = true; return controller;},
    update(deltaSeconds) {
      finite(deltaSeconds, 'delta');
      if (deltaSeconds < 0) throw new RangeError('delta must be nonnegative');
      if (!playing || !current || deltaSeconds === 0) return controller;
      const previous = elapsed, end = previous + deltaSeconds, d = duration();
      if (!Number.isFinite(end) || !Number.isSafeInteger(Math.floor(end / d))) throw new RangeError('Playback time exceeds supported precision');
      const isLoop = current.meta.loop;
      elapsed = isLoop ? end : Math.min(d, end);
      time = isLoop ? elapsed % d : elapsed;
      // Enumerate cycles so a large step neither loses nor duplicates events.
      const firstCycle = isLoop ? Math.floor(previous / d) : 0;
      const lastCycle = isLoop ? Math.floor(elapsed / d) : 0;
      const updating = current;
      for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
        for (const event of current.meta.events || []) {
          const at = cycle * d + (event.atSeconds ?? event.time * d);
          if (at > previous && at <= elapsed) {
            onEvent({...event, domain: 'presentation', clipId: current.id, cycle});
            if (updating !== current) return controller;
          }
        }
      }
      if (!isLoop && time === d) playing = false;
      apply(); return controller;
    },
    dispose() {mixer?.stopAllAction(); if (mixer && current) mixer.uncacheRoot(root || current.scene); current = null; action = null; mixer = null; playing = false; time = 0; elapsed = 0;},
  };
  if (clip) controller.play(clip);
  return controller;
}

/** Recommended host integration: policy is checked before IO and once more
 * after loading. A newer playback request or authority update cancels stale
 * asynchronous loads. A receiving clip never creates an authoritative epoch. */
export function createMotionPlayer({THREE, root, possession, initialState = 'idle', onEvent,
  load = loadClip, loadOptions = {}, ownsLoadedClips = load === loadClip} = {}) {
  const policy = createStateMachine({initialState, possession});
  const controller = createClipController({THREE, root, onEvent});
  const cache = new Map(), owned = new Set();
  let request = 0, disposed = false;
  function acquire(id) {
    if (!cache.has(id)) {
      const promise = Promise.resolve(load(id, {...loadOptions, format: 'glb'})).then(loaded => {
        if (ownsLoadedClips) {if (disposed) disposeClip(loaded); else owned.add(loaded);}
        return loaded;
      }).catch(error => {if (cache.get(id) === promise) cache.delete(id); throw error;});
      cache.set(id, promise);
    }
    return cache.get(id);
  }
  const player = Object.freeze({
    get state() {return policy.state;}, get context() {return policy.context;},
    get scene() {return root || controller.clip?.scene || null;}, get clip() {return controller.clip;},
    get time() {return controller.time;}, get duration() {return controller.duration;}, get playing() {return controller.playing;},
    legalNext: policy.legalNext, effectiveGraph: policy.effectiveGraph,
    authorizePossession(context) {
      const result = policy.authorizePossession(context);
      request++; return result;
    },
    async play(id, options = {}) {
      if (disposed) return Object.freeze({ok: false, reason: 'disposed', ...policy.snapshot()});
      const permitted = policy.canTransition(id);
      if (!permitted.ok) return Object.freeze({...permitted, ...policy.snapshot()});
      const ownRequest = ++request;
      if (id === 'idle') {const result = policy.transition(id); if (result.ok) controller.pause(); return result;}
      const loaded = await acquire(id);
      if (disposed || ownRequest !== request) return Object.freeze({ok: false, reason: 'superseded', ...policy.snapshot()});
      if (loaded.id !== id || !loaded.animation || !(loaded.meta?.durationSeconds > 0)) throw new Error(`Loader returned an invalid clip: ${id}`);
      const result = policy.transition(id);
      if (result.ok) controller.play(loaded, options);
      return result;
    },
    update(seconds) {controller.update(seconds); return player;},
    seek(seconds) {controller.seek(seconds); return player;},
    pause() {controller.pause(); return player;},
    resume() {controller.resume(); return player;},
    dispose() {
      disposed = true; request++; controller.dispose();
      for (const loaded of owned) disposeClip(loaded);
      owned.clear(); cache.clear();
    },
  });
  return player;
}
