/** V9 runtime adapted from the repository v8 runtime; no animation samples copied. */
import {CATALOG, CLIPS, CLIP_IDS, CANONICAL_BONE_NAMES} from './catalog.mjs';
import {createStateMachine} from './state-machine.mjs';
export {CATALOG, CLIPS, CLIP_IDS, CANONICAL_BONE_NAMES};
export {createStateMachine, LEGAL_TRANSITIONS, TRANSITION_GRAPH, effectiveTransitionGraph, STATE_IDS, DRIBBLE_STATES, SHOT_STATES, RECEIVE_STATES} from './state-machine.mjs';

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
  if (data.sampleRate !== 30 || data.keyframes.length !== Math.round(data.durationSeconds * 30) + 1) throw new Error(`30Hz clip mismatch: ${id}`);
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
    supportWindows: data.supportWindows || [], ballContactWindows: data.ballContactWindows || [], phases: data.phases || []});
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

/**
 * One presentation controller. Run-to-brake requests wait for the next actual
 * source touchdown, then blend decoded poses for 180 ms. The source stance sole
 * is solved to one world anchor throughout the blend. Root remains identity:
 * referenceRootTranslationMeters is descriptive guidance for the owning host.
 */
export function createClipController({THREE,root,clip,onEvent=()=>{}}={}) {
  if(!THREE?.AnimationMixer)throw new TypeError('Provide the local Three namespace');
  let current=null,pending=null,blend=null,playing=false,generation=0;
  const identity=[0,0,0],solePoint=new THREE.Vector3(0,-.08,0);
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
  const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
  const duration=b=>b?.loaded.meta.durationSeconds||0;
  const localTime=(b,seconds=b.elapsed)=>b.loaded.meta.loop?((seconds%duration(b))+duration(b))%duration(b):Math.min(duration(b),Math.max(0,seconds));
  function rawReference(b,seconds){
    if(!b.loaded.data?.keyframes)return identity.slice();
    const d=duration(b),isLoop=b.loaded.meta.loop,cycles=isLoop?Math.floor(seconds/d):0,t=isLoop?((seconds%d)+d)%d:Math.min(d,Math.max(0,seconds));
    const value=sampleClip(b.loaded,t).referenceRootTranslationMeters;
    if(!isLoop)return value;
    const frames=b.loaded.data.keyframes,first=frames[0].referenceRootTranslationMeters||identity,last=frames.at(-1).referenceRootTranslationMeters||identity;
    return add(value,sub(last,first).map(v=>v*cycles));
  }
  const referenceAt=(b,seconds=b.elapsed)=>add(b.referenceBase,rawReference(b,seconds));
  function rawSpeed(b,seconds){const h=1/600,lo=b.loaded.meta.loop?seconds-h:Math.max(0,seconds-h),hi=b.loaded.meta.loop?seconds+h:Math.min(duration(b),seconds+h);return sub(rawReference(b,hi),rawReference(b,lo)).map(v=>v/(hi-lo||1));}
  function bundle(loaded,elapsed=0){
    const target=root||loaded.scene,mixer=new THREE.AnimationMixer(target),action=mixer.clipAction(loaded.animation);
    action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    const samplers=loaded.animation.tracks.map(track=>{const dot=track.name.lastIndexOf('.'),node=target.getObjectByName(track.name.slice(0,dot));return{node,property:track.name.slice(dot+1),interpolant:track.createInterpolant()};});
    return{loaded,target,mixer,action,samplers,elapsed,referenceBase:identity.slice(),poseOffset:identity.slice()};
  }
  function release(b){if(!b)return;b.mixer.stopAllAction();b.mixer.uncacheRoot(b.target);}
  function evaluate(b,seconds=b.elapsed){
    b.action.enabled=true;b.action.paused=true;b.action.time=localTime(b,seconds);b.mixer.update(0);
    // Reapply the decoded track values explicitly: AnimationMixer may elide an
    // unchanged value after our previous IK pass, which must not accumulate.
    for(const s of b.samplers)if(s.node){const values=s.interpolant.evaluate(b.action.time),property=s.node[s.property];if(property?.fromArray)property.fromArray(values);else s.node[s.property]=values[0];}
    for(const name of ['Hips','Ball']){const node=b.target.getObjectByName(name);if(node)node.position.add(new THREE.Vector3(...b.poseOffset));}
    b.target.updateMatrixWorld(true);
  }
  function capture(b){const result={};for(const name of [...CANONICAL_BONE_NAMES,'Ball']){const n=b.target.getObjectByName(name);if(n)result[name]={position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone()};}return result;}
  function sole(b,name){const foot=b.target.getObjectByName(name);if(!foot)return null;return b.target.worldToLocal(foot.localToWorld(solePoint.clone())).toArray();}
  function installPose(a,b,u){
    for(const [name,target]of Object.entries(b)){const node=current.target.getObjectByName(name);if(!node)continue;const source=a[name]||target;node.position.copy(source.position).lerp(target.position,u);node.quaternion.copy(source.quaternion).slerp(target.quaternion,u);node.scale.copy(source.scale).lerp(target.scale,u);}
    current.target.updateMatrixWorld(true);
  }
  /** Exact two-bone solve using the blended knee's anatomical bend plane. */
  function lockSole(name,anchorLocal){
    const side=name.startsWith('Left')?'Left':'Right',upper=current.target.getObjectByName(side+'UpLeg'),lower=current.target.getObjectByName(side+'Leg'),foot=current.target.getObjectByName(name);
    if(!upper||!lower||!foot)return;
    current.target.updateMatrixWorld(true);
    const a=upper.getWorldPosition(new THREE.Vector3()),knee=lower.getWorldPosition(new THREE.Vector3()),footQ=foot.getWorldQuaternion(new THREE.Quaternion());
    const goal=current.target.localToWorld(new THREE.Vector3(...anchorLocal)).sub(solePoint.clone().applyQuaternion(footQ));
    const l1=lower.position.length(),l2=foot.position.length(),delta=goal.clone().sub(a),distance=Math.max(.001,Math.min(l1+l2-.000001,delta.length())),direction=delta.normalize();
    let pole=knee.clone().sub(a);pole.addScaledVector(direction,-pole.dot(direction));
    if(pole.lengthSq()<1e-10){pole.set(0,0,1).applyQuaternion(current.target.getWorldQuaternion(new THREE.Quaternion()));pole.addScaledVector(direction,-pole.dot(direction));}
    pole.normalize();const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const joint=a.clone().addScaledVector(direction,along).addScaledVector(pole,height),end=a.clone().addScaledVector(direction,distance);
    const plane=pole.clone().cross(direction).normalize();
    const segmentQuaternion=v=>{const y=v.clone().normalize().negate(),x=plane.clone(),z=x.clone().cross(y).normalize();return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));};
    const q1=segmentQuaternion(joint.clone().sub(a)),q2=segmentQuaternion(end.clone().sub(joint)),parent=upper.parent.getWorldQuaternion(new THREE.Quaternion());
    upper.quaternion.copy(parent.invert().multiply(q1));lower.quaternion.copy(q1.clone().invert().multiply(q2));foot.quaternion.copy(q2.clone().invert().multiply(footQ));current.target.updateMatrixWorld(true);
  }
  const targetAdvance=(state,wall)=>{const x=Math.max(0,Math.min(1,wall/state.seconds));return wall+(state.initialRate-1)*state.seconds*(x-Math.pow(x,6)+3*Math.pow(x,5)-2.5*Math.pow(x,4));};
  function blendedReference(state,wall=state.wall){const u=smooth(wall/state.seconds),source=referenceAt(state.source,state.sourceStart+wall),target=referenceAt(current,state.entry+targetAdvance(state,wall));return mix(source,target,u);}
  function applySupportLock(){
    const lock=current?.supportLock;if(!lock)return;
    const end=lock.endTime+.08;
    if(current.elapsed>=end){current.supportLock=null;return;}
    let goal=lock.anchor;
    if(current.elapsed>lock.endTime){
      if(!lock.endPoint){
        const worldPoint=seconds=>{evaluate(current,seconds);return add(sole(current,lock.foot),referenceAt(current,seconds));},h=1e-4;
        lock.endPoint=worldPoint(end);const after=worldPoint(end+h),before=worldPoint(end-h);lock.endVelocity=sub(after,before).map(v=>v/(2*h));evaluate(current);
      }
      const u=(current.elapsed-lock.endTime)/.08,u2=u*u,u3=u2*u;
      goal=lock.anchor.map((v,k)=>(2*u3-3*u2+1)*v+(-2*u3+3*u2)*lock.endPoint[k]+(u3-u2)*.08*lock.endVelocity[k]);
    }
    lockSole(lock.foot,sub(goal,referenceAt(current)));
  }
  function apply(){
    if(!current)return;
    if(!blend){evaluate(current);applySupportLock();return;}
    evaluate(blend.source,blend.sourceStart+blend.wall);const source=capture(blend.source);
    // Preserve incoming one-sided decoded velocities even when touchdown is a
    // 30Hz LINEAR key with a different outgoing slope. The correction vanishes
    // with zero derivative before the target takes over.
    const velocityTime=blend.wall*(1-smooth(blend.wall/blend.seconds));
    for(const [name,correction]of Object.entries(blend.sourceVelocityCorrection)){if(!source[name])continue;source[name].position.addScaledVector(correction.position,velocityTime);const angle=correction.angular.length()*velocityTime;if(angle>1e-12)source[name].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(correction.angular.clone().normalize(),angle));}
    evaluate(current);const target=capture(current),u=smooth(blend.wall/blend.seconds);installPose(source,target,u);
    const reference=blendedReference(blend);lockSole(blend.foot,sub(blend.anchor,reference));
  }
  function cancelTransition(){pending=null;if(current)current.supportLock=null;if(blend){release(blend.source);blend=null;}}
  function nextTouchdown(b){
    const windows=b.loaded.data?.supportWindows||[],d=duration(b),candidates=[];
    for(const w of windows){if(!['LeftFoot','RightFoot'].includes(w.effector)||w.endTime-w.startTime<.02)continue;
      const at=w.startTime*d;
      for(let cycle=Math.floor(b.elapsed/d);cycle<=Math.floor(b.elapsed/d)+2;cycle++){const seconds=at+cycle*d;if(seconds>=b.elapsed-1e-7)candidates.push({seconds,foot:w.effector,supportSeconds:(w.endTime-w.startTime)*d});}
    }
    return candidates.sort((a,b)=>a.seconds-b.seconds)[0]||null;
  }
  function beginTransition(request){
    const source=current,sourceStart=source.elapsed;evaluate(source);
    const sourceSole=sole(source,request.foot),seamReference=referenceAt(source),anchor=add(sourceSole,seamReference),at=capture(source),h=1e-4;
    evaluate(source,sourceStart-h);const before=capture(source);evaluate(source,sourceStart+h);const after=capture(source);
    const angular=(a,b)=>{const q=a.clone().invert().multiply(b);if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);const vector=new THREE.Vector3(q.x,q.y,q.z),length=vector.length();return length>1e-12?vector.multiplyScalar(2*Math.atan2(length,q.w)/(length*h)):vector;};
    const sourceVelocityCorrection={};for(const [name,pose]of Object.entries(at)){if(!before[name]||!after[name])continue;sourceVelocityCorrection[name]={position:pose.position.clone().sub(before[name].position).sub(after[name].position.clone().sub(pose.position)).multiplyScalar(1/h),angular:angular(before[name].quaternion,pose.quaternion).sub(angular(pose.quaternion,after[name].quaternion))};}
    const fullWindows=(request.loaded.data?.supportWindows||[]).filter(w=>w.effector===request.foot&&(w.endTime-w.startTime)*request.loaded.meta.durationSeconds>=.1).sort((a,b)=>a.startTime-b.startTime);
    const entry=(fullWindows[0]?.startTime||0)*request.loaded.meta.durationSeconds,endTime=(fullWindows[0]?.endTime||.3)*request.loaded.meta.durationSeconds;
    current=bundle(request.loaded,entry);evaluate(current);const targetSole=sole(current,request.foot);
    current.poseOffset=sub(sourceSole,targetSole);current.referenceBase=sub(seamReference,rawReference(current,entry));
    current.supportLock={from:source.loaded.id,foot:request.foot,anchor,endTime};
    const sourceVelocity=rawSpeed(source,sourceStart),targetVelocity=rawSpeed(current,entry),sourceSpeed=Math.hypot(sourceVelocity[0],sourceVelocity[2]),targetSpeed=Math.hypot(targetVelocity[0],targetVelocity[2]);
    blend={source,sourceStart,entry,wall:0,seconds:request.seconds,initialRate:Math.max(.25,Math.min(3,sourceSpeed/(targetSpeed||sourceSpeed||1))),foot:request.foot,anchor,sourceVelocityCorrection};pending=null;apply();
  }
  function dispatch(b,from,to){
    const version=generation,d=duration(b),isLoop=b.loaded.meta.loop,first=isLoop?Math.floor(from/d):0,last=isLoop?Math.floor(to/d):0;
    for(let cycle=first;cycle<=last;cycle++)for(const event of b.loaded.meta.events||[]){const at=cycle*d+(event.atSeconds??event.time*d);if(at>from&&at<=to){onEvent({...event,domain:'presentation',clipId:b.loaded.id,cycle});if(version!==generation)return false;}}
    return true;
  }
  function advance(seconds){
    const b=current,from=b.elapsed,end=from+seconds,d=duration(b);
    if(!Number.isFinite(end)||!Number.isSafeInteger(Math.floor(end/d)))throw new RangeError('Playback time exceeds supported precision');
    b.elapsed=b.loaded.meta.loop?end:Math.min(d,end);if(!dispatch(b,from,b.elapsed))return false;
    if(!b.loaded.meta.loop&&b.elapsed===d)playing=false;return true;
  }
  const controller={
    get time(){return current?localTime(current):0;},get duration(){return duration(current);},get playing(){return playing;},get clip(){return current?.loaded||null;},
    get transition(){return pending?Object.freeze({from:current.loaded.id,to:pending.loaded.id,pending:true,waitingForContact:true,secondsUntilContact:Math.max(0,pending.at-current.elapsed),blendSeconds:pending.seconds,plantedFoot:pending.foot}):blend?Object.freeze({from:blend.source.loaded.id,to:current.loaded.id,pending:true,waitingForContact:false,secondsUntilContact:0,remainingSeconds:Math.max(0,blend.seconds-blend.wall),blendSeconds:blend.seconds,plantedFoot:blend.foot}):current?.supportLock?Object.freeze({from:current.supportLock.from,to:current.loaded.id,pending:true,waitingForContact:false,supportHandoff:true,remainingSeconds:Math.max(0,current.supportLock.endTime+.08-current.elapsed),plantedFoot:current.supportLock.foot}):null;},
    get referenceRootTranslationMeters(){return current?(blend?blendedReference(blend):referenceAt(current)):identity.slice();},
    get referenceVelocityMetersPerSecond(){if(!current)return identity.slice();if(!blend)return rawSpeed(current,current.elapsed);const h=1e-4,lo=Math.max(0,blend.wall-h),hi=Math.min(blend.seconds,blend.wall+h);return sub(blendedReference(blend,hi),blendedReference(blend,lo)).map(v=>v/(hi-lo||1));},
    play(loaded,{restart=true,transitionSeconds=.18}={}){
      if(!loaded?.animation||!(loaded.meta?.durationSeconds>0))throw new TypeError('play expects a loaded GLB clip');
      finite(transitionSeconds,'transition duration');if(transitionSeconds<0)throw new RangeError('transition duration must be nonnegative');
      generation++;
      if(current&&current.loaded===loaded&&!restart){playing=true;return controller;}
      const canBrake=current?.loaded.data&&loaded.data&&current.loaded.meta.kind==='gait'&&loaded.meta.kind==='brake'&&transitionSeconds>0;
      if(canBrake){cancelTransition();const touchdown=nextTouchdown(current);if(touchdown){pending={loaded,at:touchdown.seconds,foot:touchdown.foot,seconds:Math.min(transitionSeconds,Math.max(.06,touchdown.supportSeconds*.9))};playing=true;if(touchdown.seconds<=current.elapsed+1e-7)beginTransition(pending);return controller;}}
      cancelTransition();release(current);current=bundle(loaded);playing=true;apply();return controller;
    },
    seek(seconds){finite(seconds,'time');generation++;cancelTransition();if(current)current.elapsed=Math.min(duration(current),Math.max(0,seconds));apply();return controller;},
    pause(){playing=false;return controller;},resume(){if(current)playing=true;return controller;},
    update(deltaSeconds){
      finite(deltaSeconds,'delta');if(deltaSeconds<0)throw new RangeError('delta must be nonnegative');
      if(!playing||!current||deltaSeconds===0)return controller;
      let remaining=deltaSeconds;
      while(remaining>1e-12&&playing&&current){
        if(pending){const until=Math.max(0,pending.at-current.elapsed),step=Math.min(remaining,until);if(step>0){if(!advance(step))return controller;remaining-=step;apply();}if(pending&&until<=step+1e-9){beginTransition(pending);continue;}break;}
        if(blend){const step=Math.min(remaining,blend.seconds-blend.wall),state=blend,from=current.elapsed;state.wall+=step;current.elapsed=Math.min(duration(current),state.entry+targetAdvance(state,state.wall));if(!dispatch(current,from,current.elapsed))return controller;remaining-=step;apply();if(blend===state&&state.wall>=state.seconds-1e-10){release(state.source);blend=null;apply();}continue;}
        if(!advance(remaining))return controller;remaining=0;apply();
      }
      return controller;
    },
    dispose(){generation++;cancelTransition();release(current);current=null;playing=false;},
  };
  if(clip)controller.play(clip);return controller;
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
    get transition() {return controller.transition;}, get referenceRootTranslationMeters() {return controller.referenceRootTranslationMeters;},
    get referenceVelocityMetersPerSecond() {return controller.referenceVelocityMetersPerSecond;},
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
