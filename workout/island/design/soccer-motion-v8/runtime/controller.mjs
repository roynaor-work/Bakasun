import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { LocalDRACOLoader } from './LocalDRACOLoader.mjs';
import { clone } from './vendor/SkeletonUtils.js';
import { bones, clips, transitions } from './catalog.mjs';
import { ContactSolver } from './contact-solver.mjs';

const byId = new Map(clips.map(clip => [clip.id, clip]));
const homes = { field: 'idle', keeper: 'keeper_ready' };
const base = new URL('./', import.meta.url);

function destroyScenes(scenes) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const scene of scenes) scene.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of node.material ? [node.material].flat() : []) materials.add(material);
    if (node.isSkinnedMesh) node.skeleton.dispose();
  });
  for (const material of materials) for (const value of Object.values(material)) {
    if (value?.isTexture) textures.add(value);
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    texture.dispose();
    texture.source?.data?.close?.();
  }
}

/** Load the exact runtime assets. No build, network service, or global THREE. */
export async function loadLibrary({ baseURL = base, roles = ['field', 'keeper'], loader } = {}) {
  if (!roles.length || new Set(roles).size !== roles.length || roles.some(role => !homes[role])) {
    throw new Error('roles must contain field and/or keeper once each');
  }
  const scenes = {}, animations = new Map(), metadata = new Map();
  let draco;
  if (!loader) {
    draco = new LocalDRACOLoader();
    draco.setDecoderPath(new URL('vendor/draco/', baseURL).href);
    draco.setDecoderConfig({ type: 'wasm' });
    draco.setWorkerLimit(1);
    const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
    loader = {
      async loadAsync(url) {
        // Read the original response completely. r160 FileLoader rewraps its
        // stream, which can report ERR_ABORTED after a successful GLB parse.
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Soccer motion GLB: HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        return gltfLoader.parseAsync(bytes, new URL('./', url).href);
      }
    };
  }
  // Sequential loading bounds peak mobile decode memory. Both actors use the
  // same single decoder worker. On failure, release everything already loaded.
  try {
    for (const role of roles) {
      const selected = clips.filter(clip => clip.role === role);
      const asset = selected[0].asset;
      const gltf = await loader.loadAsync(new URL(asset, baseURL).href);
      scenes[role] = gltf.scene;
      for (const info of selected) {
        const animation = gltf.animations.find(clip => clip.name === info.id);
        if (!animation) throw new Error(`Missing native clip: ${info.id}`);
        animations.set(info.id, animation);
        metadata.set(info.id, info);
      }
    }
  } catch (error) {
    destroyScenes(Object.values(scenes));
    throw error;
  } finally {
    draco?.dispose();
  }
  const library = {
    scenes, animations, metadata, disposed: false,
    dispose() {
      if (library.disposed) return;
      library.disposed = true;
      destroyScenes(Object.values(scenes));
    }
  };
  return library;
}

function samplePath(keys, seconds, out) {
  if (!keys?.length) return out.set(0, 0, 0);
  if (seconds <= keys[0].time) return out.fromArray(keys[0].position);
  const last = keys[keys.length - 1];
  if (seconds >= last.time) return out.fromArray(last.position);
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].time <= seconds) lo = mid; else hi = mid;
  }
  const a = keys[lo], b = keys[hi], weight = (seconds - a.time) / (b.time - a.time);
  return out.fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), weight);
}

/** Presentation controller. Events are cues; game physics owns ball and score.
 * root is an independent clone; geometry and materials remain library-owned.
 * applyTravel=false leaves game placement untouched. True demonstrates travel
 * inside a child group, without changing the transform the game owns on root.
 */
export function createController(library, {
  role = 'field', start = homes[role], onEvent = () => {},
  autoReturn = true, applyTravel = false
} = {}) {
  if (library.disposed || !library.scenes[role]) throw new Error(`Role unavailable: ${role}`);
  const root = new THREE.Group(), travel = new THREE.Group();
  root.name = `soccer-motion-v8-${role}`;
  const actor = clone(library.scenes[role]);
  travel.add(actor); root.add(travel);
  actor.traverse(node => { if (node.isSkinnedMesh) node.frustumCulled = false; });
  const mixer = new THREE.AnimationMixer(actor), actions = new Map();
  const joints = new Map();
  actor.traverse(node => { if (node.isBone) joints.set(node.name, node); });
  const contacts = new ContactSolver(root, actor, travel, joints, applyTravel);
  let id, clock = 0, paused = false, disposed = false, currentAction;
  let emitStart = true, completed = false, epoch = 0, travelOrigin = new THREE.Vector3();
  let fade = null, previousPose, previousDelta = 1 / 60;
  const scratch = new THREE.Vector3(), previousTravel = new THREE.Vector3();

  function snapshotPose() {
    return { rotations: bones.map(bone => joints.get(bone.name).quaternion.clone().normalize()), hips: joints.get('Hips').position.clone() };
  }
  function clearFade() {
    if (!fade) return;
    fade.action.stop(); mixer.uncacheClip(fade.clip); fade = null;
  }
  function sourceClip(current, duration) {
    const times = [0, Math.min(.001, duration / 4), duration / 2, duration];
    const integration = time => time - time * time / (2 * duration);
    const tracks = bones.map((bone, index) => {
      const present = current.rotations[index];
      const before = previousPose?.rotations[index] ?? present;
      const delta = before.clone().invert().multiply(present).normalize();
      if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
      const angle = 2 * Math.acos(THREE.MathUtils.clamp(delta.w, -1, 1));
      const sine = Math.sin(angle / 2);
      const axis = sine < 1e-8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(delta.x, delta.y, delta.z).multiplyScalar(1 / sine);
      const values = times.flatMap(time => present.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle * integration(time) / previousDelta)).toArray());
      return new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values);
    });
    const velocity = current.hips.clone().sub(previousPose?.hips ?? current.hips).multiplyScalar(1 / previousDelta);
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, times.flatMap(time => current.hips.clone().addScaledVector(velocity, integration(time)).toArray())));
    return new THREE.AnimationClip(`__soccer_displayed_${epoch}`, duration, tracks);
  }

  function alive() { if (disposed) throw new Error('Controller is disposed'); }
  function infoFor(nextId) {
    const info = library.metadata.get(nextId);
    if (!info || info.role !== role) throw new Error(`Clip unavailable for ${role}: ${nextId}`);
    return info;
  }
  function actionFor(nextId) {
    if (!actions.has(nextId)) actions.set(nextId, mixer.clipAction(library.animations.get(nextId)));
    return actions.get(nextId);
  }
  function configure(nextId) {
    const info = infoFor(nextId), action = actionFor(nextId);
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    action.setLoop(info.loop ? THREE.LoopRepeat : THREE.LoopOnce, info.loop ? Infinity : 1);
    action.clampWhenFinished = !info.loop;
    action.play();
    return action;
  }
  function localTime(info = byId.get(id), time = clock) {
    return info.loop ? time % info.duration : Math.min(time, info.duration);
  }
  function placeTravel() {
    const info = byId.get(id);
    travel.position.copy(travelOrigin);
    if (applyTravel && info.travel?.length) {
      const cycles = info.loop ? Math.floor(clock / info.duration) : 0;
      samplePath(info.travel, localTime(info), scratch);
      if (cycles) scratch.addScaledVector(new THREE.Vector3().fromArray(info.travel.at(-1).position), cycles);
      if (fade) {
        const t = fade.elapsed / fade.duration, weight = t * t * (3 - 2 * t);
        travel.position.addScaledVector(scratch, weight);
        travel.position.addScaledVector(fade.travelVelocity,
          (fade.elapsed - fade.elapsed * fade.elapsed / (2 * fade.duration)) * (1 - weight));
      } else travel.position.add(scratch);
    } else if (applyTravel && fade) {
      const t = fade.elapsed / fade.duration, weight = t * t * (3 - 2 * t);
      travel.position.addScaledVector(fade.travelVelocity,
        (fade.elapsed - fade.elapsed * fade.elapsed / (2 * fade.duration)) * (1 - weight));
    }
    root.updateMatrixWorld(true);
  }
  function edgeAllowed(edge) {
    return clock + 1e-8 >= (edge.earliest ?? 0) && clock <= (edge.latest ?? Infinity) + 1e-8;
  }
  function change(edge) {
    if (!edge || !edgeAllowed(edge)) return false;
    infoFor(edge.to);
    contacts.begin(byId.get(id), clock, byId.get(edge.to), edge.blend);
    const displayed = snapshotPose();
    const incomingSource = sourceClip(displayed, edge.blend);
    const travelVelocity = travel.position.clone().sub(previousTravel).multiplyScalar(1 / previousDelta);
    // Keep the travel world offset across state changes; clip Hips motion stays
    // inside its native bone channels and is never added here a second time.
    travelOrigin.copy(travel.position);
    clearFade(); mixer.stopAllAction();
    id = edge.to; clock = 0; completed = false; emitStart = true; epoch++;
    currentAction = configure(id);
    currentAction.setEffectiveWeight(0);
    const source = mixer.clipAction(incomingSource).reset().setLoop(THREE.LoopOnce, 1).play();
    source.clampWhenFinished = true;
    fade = { action: source, clip: incomingSource, elapsed: 0, duration: edge.blend, travelVelocity };
    mixer.update(0); placeTravel();
    previousPose = displayed; previousTravel.copy(travel.position);
    return true;
  }
  const controller = {
    root, actor, mixer,
    get id() { return id; }, get time() { return clock; },
    get paused() { return paused; }, get role() { return role; },
    get metadata() { return byId.get(id); },
    get contacts() { return contacts.diagnostics; },
    reset(nextId = homes[role]) {
      alive(); infoFor(nextId);
      contacts.reset();
      clearFade(); mixer.stopAllAction();
      id = nextId; clock = 0; completed = false; emitStart = true; epoch++;
      travelOrigin.set(0, 0, 0);
      currentAction = configure(id);
      mixer.update(0); placeTravel();
      previousPose = snapshotPose(); previousDelta = 1 / 60; previousTravel.copy(travel.position);
      return controller;
    },
    play(nextId) {
      alive(); infoFor(nextId);
      return change(transitions.find(edge => edge.from === id && edge.to === nextId && edgeAllowed(edge)));
    },
    request(trigger) {
      alive();
      return change(transitions.find(edge => edge.from === id && edge.trigger === trigger && edgeAllowed(edge)));
    },
    seek(seconds) {
      alive();
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('seek requires non-negative seconds');
      contacts.reset();
      clearFade(); mixer.stopAllAction(); currentAction = configure(id);
      clock = byId.get(id).loop ? seconds : Math.min(seconds, byId.get(id).duration);
      currentAction.time = localTime();
      mixer.update(0); emitStart = false; completed = clock >= byId.get(id).duration; epoch++;
      placeTravel();
      previousPose = snapshotPose(); previousDelta = 1 / 60; previousTravel.copy(travel.position);
      return controller;
    },
    pause() { alive(); paused = true; return controller; },
    resume() { alive(); paused = false; return controller; },
    update(deltaSeconds) {
      alive();
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('update requires non-negative seconds');
      if (paused || deltaSeconds === 0) return controller;
      const info = byId.get(id), from = emitStart ? -1e-9 : clock;
      const until = info.loop ? clock + deltaSeconds : Math.min(clock + deltaSeconds, info.duration);
      const crossed = [];
      for (const event of info.events) {
        if (info.loop) {
          const firstCycle = Math.max(0, Math.floor((from - event.time) / info.duration) + 1);
          const lastCycle = Math.floor((until - event.time + 1e-9) / info.duration);
          for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
            crossed.push({ ...event, clip: id, cycle, at: cycle * info.duration + event.time });
          }
        } else if (event.time > from && event.time <= until + 1e-9) {
          crossed.push({ ...event, clip: id, cycle: 0, at: event.time });
        }
      }
      clock = until; emitStart = false;
      previousPose = snapshotPose(); previousDelta = deltaSeconds;
      previousTravel.copy(travel.position);
      if (fade) {
        fade.elapsed = Math.min(fade.elapsed + deltaSeconds, fade.duration);
        const t = fade.elapsed / fade.duration, weight = t * t * (3 - 2 * t);
        currentAction.setEffectiveWeight(weight); fade.action.setEffectiveWeight(1 - weight);
      }
      mixer.update(deltaSeconds); placeTravel();
      contacts.apply(info, clock);
      if (fade?.elapsed >= fade?.duration) clearFade();
      crossed.sort((a, b) => a.at - b.at);
      // Dispatch after pose evaluation; a listener may replace the state. That
      // cancels remaining old-state cues and any automatic finished transition.
      const eventEpoch = epoch;
      for (const event of crossed) { if (epoch !== eventEpoch || disposed) break; onEvent(event); }
      if (epoch === eventEpoch && !disposed && !info.loop && clock >= info.duration && !completed) {
        completed = true;
        if (autoReturn) controller.request('finished');
      }
      return controller;
    },
    ballPosition(out = new THREE.Vector3()) {
      alive();
      samplePath(byId.get(id).ball?.keys, localTime(), out);
      if (applyTravel) out.add(travel.position);
      return out;
    },
    eventPosition(cue, out = new THREE.Vector3()) {
      alive();
      const bone = joints.get(cue.bone);
      if (!bone || !Array.isArray(cue.local) || cue.local.length !== 3) throw new Error('Cue requires a known bone and local contact point');
      root.updateMatrixWorld(true);
      return bone.localToWorld(out.fromArray(cue.local));
    },
    dispose() {
      if (disposed) return;
      disposed = true; clearFade(); mixer.stopAllAction(); mixer.uncacheRoot(actor);
      actor.traverse(node => { if (node.isSkinnedMesh) node.skeleton.dispose(); });
      root.removeFromParent(); root.clear();
    }
  };
  return controller.reset(start);
}
