/** Soccer Motion v9. Presentation only; never changes gameplay or ownership. */
import {bones, clips, initial} from './catalog.mjs';
export {bones, clips, initial};
export {createStateMachine, LEGAL_TRANSITIONS, TRANSITION_GRAPH} from './state-machine.mjs';
export const CLIPS = Object.freeze(Object.fromEntries(clips.map(c => [c.id, c])));
export const CLIP_IDS = Object.freeze(clips.map(c => c.id));
export const CANONICAL_BONE_NAMES = Object.freeze(bones.map(b => b.name));
export const CATALOG = Object.freeze(clips);
const packageURL = new URL('../', import.meta.url);
let decoderPending;
const activeLoads = new Set();
const isNode = () => typeof process !== 'undefined' && !!process.versions?.node;
function entry(id) {const value = CLIPS[id]; if (!value) throw new RangeError(`Unknown soccer clip: ${id}`); return value;}
async function browserDecoder() {
  if (!decoderPending) decoderPending = import('./LocalDRACOLoader.mjs').then(({LocalDRACOLoader}) =>
    new LocalDRACOLoader().setDecoderPath(new URL('vendor/draco/', import.meta.url).href).setDecoderConfig({type: 'wasm'}).setWorkerLimit(2));
  return decoderPending;
}
export function loadClip(id, options = {}) {
  const pending = loadInternal(id, options); activeLoads.add(pending);
  pending.then(() => activeLoads.delete(pending), () => activeLoads.delete(pending));
  return pending;
}
async function loadInternal(id, options) {
  const meta = entry(id), baseURL = new URL(options.baseURL || packageURL, packageURL);
  const url = new URL(meta.asset, new URL('runtime/', baseURL));
  const THREE = await import('./vendor/three.module.js');
  let gltf;
  if (isNode() && !options.loader && !options.dracoLoader && url.protocol === 'file:') {
    gltf = await (await import('../verification/glb-reader.mjs')).loadNativeGLTF(url);
  } else {
    const {GLTFLoader} = await import('./vendor/GLTFLoader.js');
    const loader = options.loader || new GLTFLoader();
    loader.setDRACOLoader(options.dracoLoader || await browserDecoder());
    const response = await (options.fetch || fetch)(url, {signal: options.signal});
    if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
    gltf = await loader.parseAsync(await response.arrayBuffer(), new URL('./', url).href);
  }
  const animation = gltf.animations.find(a => a.name === id);
  if (!animation) throw new Error(`${id}: native animation is absent`);
  const names = new Set(); gltf.scene.traverse(object => {if (object.isBone) names.add(object.name);});
  for (const bone of bones) if (!names.has(bone.name)) throw new Error(`${id}: missing canonical bone ${bone.name}`);
  return {id, meta, gltf, scene: gltf.scene, animation, THREE};
}
export function pathAt(keys, time) {
  if (!keys?.length) return [0, 0, 0];
  if (time <= keys[0].time) return [...keys[0].position];
  if (time >= keys.at(-1).time) return [...keys.at(-1).position];
  let low = 0, high = keys.length - 1;
  while (high - low > 1) {const mid = (low + high) >> 1; if (keys[mid].time <= time) low = mid; else high = mid;}
  const a = keys[low], b = keys[high], u = (time - a.time) / (b.time - a.time);
  return a.position.map((v, i) => v + (b.position[i] - v) * u);
}
/** Exact clamped native sampling, including the duration endpoint. update()
 * accumulates external loop travel by default; setTime() is a local seek.
 * Hosts that reset the actor between previews can use accumulateTravel:false. */
export function createPlayer(loaded, {travel = false} = {}) {
  const {THREE, scene, animation, meta} = loaded;
  const root = new THREE.Group(); root.name = `motion-v9:${loaded.id}`; root.add(scene);
  const mixer = new THREE.AnimationMixer(scene), action = mixer.clipAction(animation);
  action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  let seconds = 0, disposed = false, useTravel = travel, worldOffset = [0, 0, 0];
  function setTime(time) {
    if (disposed) throw new Error('Motion player disposed');
    if (!Number.isFinite(time)) throw new TypeError('Time must be finite');
    seconds = Math.max(0, Math.min(meta.duration, time));
    // Three clamps action.enabled at the final key. Re-enable before seeking.
    action.enabled = true; action.paused = false; mixer.setTime(seconds);
    root.position.fromArray(useTravel ? pathAt(meta.travel, seconds).map((value, i) => value + worldOffset[i]) : [0, 0, 0]);
    root.updateMatrixWorld(true);
    scene.traverse(object => {if (object.isSkinnedMesh) object.skeleton.update();});
    return seconds;
  }
  return {root, scene, loaded, mixer, action, meta,
    get time() {return seconds;}, get worldOffset() {return [...worldOffset];}, setTime,
    setWorldOffset(offset) {
      if (!Array.isArray(offset) || offset.length !== 3 || !offset.every(Number.isFinite)) throw new TypeError('World offset must contain three finite metres');
      worldOffset = [...offset]; setTime(seconds);
    },
    update(delta, {loop = meta.loop, accumulateTravel = true} = {}) {
      if (!Number.isFinite(delta)) throw new TypeError('Delta must be finite');
      let time = seconds + delta;
      if (loop) {
        const cycles = Math.floor(time / meta.duration);
        if (useTravel && accumulateTravel && cycles) {
          const first = pathAt(meta.travel, 0), last = pathAt(meta.travel, meta.duration);
          worldOffset = worldOffset.map((v, i) => v + cycles * (last[i] - first[i]));
        }
        time = ((time % meta.duration) + meta.duration) % meta.duration;
      }
      return setTime(time);
    },
    setTravel(enabled) {useTravel = !!enabled; setTime(seconds);},
    dispose() {if (disposed) return; disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(scene); root.removeFromParent(); disposeClip(loaded);},
  };
}
const disposedResources = new WeakSet(), disposedImages = new WeakSet();
export function disposeClip(loaded) {
  loaded.scene?.removeFromParent();
  loaded.scene?.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const resources = [object.geometry];
    if (object.skeleton && !disposedResources.has(object.skeleton)) {
      if (object.skeleton.boneTexture) {resources.push(object.skeleton.boneTexture); object.skeleton.boneTexture = null;}
      resources.push(object.skeleton);
    }
    for (const material of materials) if (material) {
      resources.push(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.push(value);
    }
    for (const resource of resources) if (resource && !disposedResources.has(resource)) {
      disposedResources.add(resource);
      const images = Array.isArray(resource.image) ? resource.image : [resource.image];
      for (const image of images) if (image && typeof image.close === 'function' && !disposedImages.has(image)) {disposedImages.add(image); image.close();}
      resource.dispose?.();
    }
  });
}
export async function disposeRuntime() {
  while (activeLoads.size) await Promise.allSettled([...activeLoads]);
  if (decoderPending) {(await decoderPending).dispose(); decoderPending = null;}
}
