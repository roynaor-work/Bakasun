import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {DRACOLoader} from '../vendor/DRACOLoader.js';
import {Retargeter} from '../design/viewer/retarget.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => (x = clamp(x)) * x * (3 - 2 * x);
const asset = path => new URL(path, import.meta.url).href;
async function json(path) {
  const response = await fetch(asset(path));
  if (!response.ok) throw Error(`Alpine character data ${response.status}: ${path}`);
  return response.json();
}

// The expensive reference adapter (calibration, contact IK and actual skinned
// vertex floor checks) runs only under the loading card. Every runtime track
// contains target-local transforms, including the extra shoulder parents.
export function bakeAlpineMotion(scene, rig, motion, map, isDisposed = () => false) {
  const adapter = new Retargeter(scene, rig, motion.skeleton, map);
  const names = rig.joints.map(j => j.name);
  const stride = names.length * 7;
  const clips = {};
  for (const [name, clip] of Object.entries(motion.states)) {
    if (isDisposed()) throw Object.assign(Error('alpine.disposed'), {disposed: true});
    const times = new Float32Array(clip.keyframes.length);
    const values = new Float32Array(clip.keyframes.length * stride);
    for (let k = 0; k < clip.keyframes.length; k++) {
      const key = clip.keyframes[k];
      // Source locomotion is a reference for validation, never game movement.
      // Horizontal ski contact is free; planted menu poses use local anchors.
      const reference = key.referenceRootTranslationMeters || [0, 0, 0];
      const contacts = (clip.supportContacts || []).filter(c => key.time >= c.startTime && key.time <= c.endTime)
        .map(c => ({...c, anchorMeters: c.anchorMeters.map((v, i) => v - reference[i])}));
      adapter.apply(key, {referenceRoot: [0, 0, 0], contacts, floor: true});
      times[k] = key.time * clip.durationSeconds;
      for (let b = 0; b < names.length; b++) {
        const bone = adapter.bones[names[b]], offset = k * stride + b * 7;
        bone.position.toArray(values, offset);
        bone.quaternion.toArray(values, offset + 3);
      }
    }
    clips[name] = {times, values, duration: clip.durationSeconds, loop: clip.loop};
  }
  adapter.resetBind();
  return {names, stride, clips, transitions: motion.transitions, initialState: motion.initialState,
    motionScale: map.motionScale, bindProof: adapter.proof()};
}

/** Presentation-only state machine. The engine remains the sole authority for
 * speed, falls, landings, tricks and results; motion markers never feed it. */
export function createAlpineMotionPlayer(baked, bones) {
  const count = baked.names.length, stride = baked.stride;
  const shown = new Float32Array(stride), outgoing = new Float32Array(stride);
  const target = new Float32Array(stride);
  const qa = new T.Quaternion(), qb = new T.Quaternion();
  let state = baked.initialState || 'idle', time = 0, fadeTime = 1, fadeDuration = 0;
  let lastTime = null, lastPhase = null, lastS = null, lastSpeed = 0, lastCrash = false, lastAir = false, lastBoost = false;
  let resultSeen = false, clipFinished = false, sampledFrames = 0;

  function sample(name, seconds, out) {
    const clip = baked.clips[name];
    const at = clip.loop ? ((seconds % clip.duration) + clip.duration) % clip.duration : clamp(seconds, 0, clip.duration);
    let lo = 0, hi = clip.times.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (clip.times[mid] <= at) lo = mid; else hi = mid; }
    const w = smooth((at - clip.times[lo]) / Math.max(1e-9, clip.times[hi] - clip.times[lo]));
    const a = lo * stride, b = hi * stride;
    for (let i = 0; i < count; i++) {
      const o = i * 7;
      for (let k = 0; k < 3; k++) out[o + k] = clip.values[a + o + k] + (clip.values[b + o + k] - clip.values[a + o + k]) * w;
      qa.fromArray(clip.values, a + o + 3); qb.fromArray(clip.values, b + o + 3);
      qa.slerp(qb, w).toArray(out, o + 3);
    }
  }
  function display(dt) {
    sample(state, time, target);
    fadeTime += dt;
    const w = fadeDuration > 0 ? smooth(fadeTime / fadeDuration) : 1;
    for (let i = 0; i < count; i++) {
      const o = i * 7, bone = bones[i];
      for (let k = 0; k < 3; k++) shown[o + k] = outgoing[o + k] + (target[o + k] - outgoing[o + k]) * w;
      qa.fromArray(outgoing, o + 3); qb.fromArray(target, o + 3); qa.slerp(qb, w).toArray(shown, o + 3);
      bone.position.fromArray(shown, o); bone.quaternion.fromArray(shown, o + 3);
    }
    sampledFrames++;
  }
  function event(events) {
    if (typeof events === 'string') events = [events];
    let selected = null;
    for (const transition of baked.transitions) {
      if (!events.includes(transition.on) || !(transition.source === state || transition.source === '*' && transition.target !== state)) continue;
      if (transition.on === 'fall_confirmed' && (state === 'fall' || state === 'recover')) continue;
      if (transition.on === 'result_success' && (state === 'fall' || state === 'recover' || state === 'celebrate')) continue;
      if (!selected || transition.priority > selected.priority) selected = transition;
    }
    if (!selected) return false;
    outgoing.set(shown); state = selected.target; time = 0; fadeTime = 0;
    fadeDuration = selected.visualBlendSeconds ?? selected.crossfadeSeconds ?? .12;
    clipFinished = false;
    return true;
  }
  function reset() {
    state = baked.initialState || 'idle'; time = 0; fadeTime = 1; fadeDuration = 0;
    sample(state, 0, outgoing); shown.set(outgoing); target.set(outgoing);
    lastTime = null; lastPhase = null; lastS = null; lastSpeed = 0;
    lastCrash = lastAir = lastBoost = resultSeen = clipFinished = false;
    display(0);
  }
  function update(frame = {}, context = {}) {
    if (context.phase === 'paused') return;
    const now = Number(context.time) || 0;
    const dt = lastTime === null ? 0 : clamp(context.dt ?? now - lastTime, 0, .1);
    const phase = context.phase || 'racing';
    const restarted = lastTime !== null && (now < lastTime - .01 || (lastS !== null && Number(frame.s) < lastS - 2) || phase === 'countdown' && lastPhase !== 'countdown');
    if (restarted) reset();
    const speed = context.speedKmh ?? (lastS !== null && dt > 0 ? Math.max(0, ((frame.s ?? lastS) - lastS) / dt * 3.6) : 0);
    const moving = phase === 'menu' && !!context.previewRun || (phase === 'racing' || phase === 'finished') && (speed > .5 || phase === 'racing');
    time += dt;
    const clip = baked.clips[state];
    const events = [];
    if (frame.crashed && !lastCrash) events.push('fall_confirmed');
    if (!frame.crashed && state === 'fall') events.push('recovery_allowed');
    if (phase === 'finished' && context.result?.won && !resultSeen) events.push('result_success');
    if (frame.airborne && !lastAir) {
      // An authoritative jump can interrupt a short ground action before its
      // authored end. Resolve its return-to-glide edge before the takeoff edge.
      if (!['fall', 'recover', 'glide', 'air'].includes(state)) event(['clip_finished', 'clip_finished_and_moving', 'moving']);
      events.push('takeoff');
    }
    if (!frame.airborne && lastAir || frame.landing && state === 'glide') events.push('ground_contact', 'receive');
    if (frame.boosting && !lastBoost) events.push('boost_confirmed', 'action');
    if (moving) { if (!(phase === 'menu' && context.previewRun)) events.push('moving'); }
    else events.push('stopped');
    if ((moving && speed < lastSpeed - .8 || !moving) && !frame.hit) events.push('slowing');
    if (Math.abs(frame.lean || 0) > .2 && !frame.airborne) events.push(frame.lean < 0 ? 'turn_left' : 'turn_right');
    if (phase === 'menu' && context.previewRun) events.push('menu_run');
    if (!clip.loop && time >= clip.duration && !clipFinished) {
      events.push('clip_finished', moving ? 'clip_finished_and_moving' : 'clip_finished_and_stopped'); clipFinished = true;
    }
    event(events);
    // A result can arrive during fall/recover, where its transition is masked.
    // Keep it pending until the authored state machine actually accepts it.
    if (state === 'celebrate') resultSeen = true;
    display(dt);
    lastTime = now; lastPhase = phase; lastS = frame.s ?? lastS; lastSpeed = speed;
    lastCrash = !!frame.crashed; lastAir = !!frame.airborne; lastBoost = !!frame.boosting;
  }
  reset();
  return {update, event, reset, metrics: () => ({state, clipTime: time, sampledFrames, bakedClips: Object.keys(baked.clips).length})};
}

export async function loadAlpineCharacters({modelUrl = asset('../design/characters/skier.glb'), isDisposed = () => false} = {}) {
  const loadStarted = performance.now();
  const draco = new DRACOLoader();
  draco.setDecoderPath(asset('../vendor/draco/')); draco.setDecoderConfig({type: 'wasm'}); draco.setWorkerLimit(1);
  let gltf, disposed = false;
  const actors = new Set(), ownedGeometries = new Set(), ownedMaterials = new Set();
  function dispose() {
    if (disposed) return; disposed = true;
    draco.dispose();
    for (const actor of actors) { actor.root.removeFromParent(); actor.shadow.removeFromParent(); actor.body.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); }
    for (const geometry of ownedGeometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
    gltf?.scene.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
    actors.clear();
  }
  try {
    const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
    const results = await Promise.allSettled([
      loader.loadAsync(modelUrl), json('../design/characters/rig.json'), json('../design/motion/alpine.json'), json('../design/viewer/retarget-map.json')
    ]);
    gltf = results[0].status === 'fulfilled' ? results[0].value : null;
    gltf?.scene.traverse(o => { if (o.geometry) ownedGeometries.add(o.geometry); if (o.material) for (const m of [].concat(o.material)) ownedMaterials.add(m); });
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    const [, rig, motion, map] = results.map(result => result.value);
    if (isDisposed()) throw Object.assign(Error('alpine.disposed'), {disposed: true});
    const bakeStarted = performance.now();
    const baked = bakeAlpineMotion(gltf.scene, rig, motion, map, isDisposed);
    const bakeMs = performance.now() - bakeStarted, loadMs = performance.now() - loadStarted;
    // All Draco work has completed; workers never survive into the race.
    draco.dispose();
    return {
      createRider(id, color, scene, kit) {
        if (disposed) throw Error('alpine.disposed');
        const root = new T.Group(), body = kit.cloneSkinned(gltf.scene); root.add(body);
        // Course local -Z is downhill; the delivered character faces +Z.
        body.rotation.y = Math.PI; body.scale.setScalar(1.125); body.position.y = .025;
        const found = {};
        body.traverse(o => {
          if (o.isBone) found[o.name] = o;
          if (!o.isMesh) return;
          o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
          const material = o.material.clone(); material.roughness = .78; material.envMapIntensity = .25;
          o.material = material; ownedMaterials.add(material);
          if (id !== 'player' && o.geometry.attributes.color) {
            const geometry = o.geometry.clone(), colors = geometry.attributes.color, tint = new T.Color(color);
            // Recolour only the authored blue jacket, retaining skin and visor.
            for (let i = 0; i < colors.count; i++) {
              const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i);
              if (g > r * 1.3 && b > r * 1.4 && b > .15) colors.setXYZ(i, tint.r, tint.g, tint.b);
            }
            colors.needsUpdate = true; o.geometry = geometry; ownedGeometries.add(geometry);
          }
        });
        const shadowGeometry = new T.PlaneGeometry(1.2, 2.2);
        const shadowMaterial = new T.MeshBasicMaterial({map: kit.contactTex, transparent: true, depthWrite: false, opacity: .5});
        ownedGeometries.add(shadowGeometry); ownedMaterials.add(shadowMaterial);
        const shadow = new T.Mesh(shadowGeometry, shadowMaterial); shadow.castShadow = shadow.receiveShadow = false;
        shadow.rotation.x = -Math.PI / 2; scene.add(root, shadow);
        const player = createAlpineMotionPlayer(baked, baked.names.map(name => found[name]));
        const actor = {root, body, shadow, update: player.update, reset: player.reset, event: player.event, metrics: player.metrics,
          pose(time, lean = 0, air = 0, impact = 0) { player.update({lean, airborne: air > .5, landing: impact > .2}, {time, phase: 'racing'}); }};
        actors.add(actor); return actor;
      },
      dispose,
      metrics() { return {mode: 'design-skier', clips: Object.keys(baked.clips).length, bones: baked.names.length, trianglesPerRider: 1920, motionScale: baked.motionScale, bakeMs, loadMs, actors: actors.size}; }
    };
  } catch (error) { dispose(); throw error; }
}
