import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {AlpineDracoLoader as DRACOLoader} from './alpine-draco.mjs';
import {Retargeter} from '../design/viewer/retarget.js';
import {bodyTarget, followBody} from './alpine-steer.mjs';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {V7_CLIPS, V7_TRIANGLES, v7Config, v7Enabled, wantedLod, pickAvailable, lodPlan, levelUseful, v7Path} from './alpine-v7.mjs';

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
  bones = [...bones];                                    // rebind() swaps the rig in place (LOD change) without a new player
  const count = baked.names.length, stride = baked.stride;
  const shown = new Float32Array(stride), outgoing = new Float32Array(stride);
  const target = new Float32Array(stride);
  const qa = new T.Quaternion(), qb = new T.Quaternion();
  // The authored turn clips enter and leave a carve in 0.36s. During a held
  // input retain their apex instead of replaying neutral endings; edge changes
  // use the same authored 120ms visual blend from the displayed pose.
  const transitions = [...baked.transitions];
  const isCarve = name => name === 'turn_left' || name === 'turn_right';
  for (const source of ['turn_left', 'turn_right']) {
    const edge = baked.transitions.find(t => t.source === 'glide' && t.target === source);
    if (!edge) continue;
    const opposite = source === 'turn_left' ? 'turn_right' : 'turn_left';
    transitions.push({...edge, source, target: opposite, on: opposite});
    transitions.push({...edge, source, target: 'glide', on: 'carve_release'});
  }
  let state = baked.initialState || 'idle', time = 0, fadeTime = 1, fadeDuration = 0;
  let lastTime = null, lastPhase = null, lastS = null, lastSpeed = 0, lastCrash = false, lastAir = false, lastBoost = false;
  let resultSeen = false, clipFinished = false, sampledFrames = 0;
  let carveHeld = false, carveStrength = 0;

  const clipOf = name => baked.clips[name === 'recover' && baked.clips.getup ? 'getup' : name];
  function sample(name, seconds, out) {
    const clip = clipOf(name);
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
  // Procedural riding layer on top of the authored clips. The glide and air clips swing only ~3 degrees,
  // so on their own the rider looks frozen. This adds a speed-dependent crouch, a lean into the turn,
  // counter-rotating shoulders, knee absorption and alternating pole swings. It is presentation only,
  // applied as model-space rotations on the already posed bones, and fades out in falls, menus and results.
  let boneByName = Object.fromEntries(baked.names.map((n, i) => [n, bones[i]]));
  const order = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'].filter(n => boneByName[n]);
  const ride = {w: 0, speed: 0, lean: 0, phase: 0, bob: 0, boost: 0, arms: 0, rate: 0, prevLean: 0};
  let frameBone = bones[0]; const qFrame = new T.Quaternion(), qParent = new T.Quaternion(), qWork = new T.Quaternion(), qDelta = new T.Quaternion(), euler = new T.Euler();
  const AX = new T.Vector3(1, 0, 0), AY = new T.Vector3(0, 1, 0), AZ = new T.Vector3(0, 0, 1);
  function rideTargets() {
    const t = ride.phase, sp = ride.speed, lean = ride.lean, a = Math.abs(lean);
    const b = ride.boost;                                 // 0..1: boost pressed, the rider drops into an aerodynamic tuck
    const crouch = .1 + .28 * sp + .62 * b;               // forward bow of the torso, rad
    const knee = .16 + .3 * sp + .12 * a + .42 * b;       // thigh forward / shin back, rad
    const bump = (Math.sin(t * 5.2) * .035 * sp + Math.sin(t * 8.7 + 1.3) * .02 * sp) * (1 - .6 * b); // terrain absorption
    const swing = Math.sin(t * (2.2 + 1.8 * sp)) * (.16 + .1 * sp) * (1 - b);        // pole swing stops in the tuck
    const hipsPitch = crouch * .35 + bump * .5, torso = hipsPitch + crouch * (.4 + .3); // forward pitch of the pelvis and of the chest, rad
    const turn = Math.max(-1, Math.min(1, ride.rate * .12)); // 1 = swinging hard from one side to the other
    const sway = Math.sin(t * 1.7) * (.02 + .03 * sp);       // slow weight shift while going straight
    return {crouch, knee, bump, swing, lean, a, b, hipsPitch, torso, turn, sway};
  }
  function applyRide() {
    if ((ride.w < .01 && ride.arms < .01) || !frameBone?.parent) return;
    const k = rideTargets(), w = ride.w, armW = ride.arms;
    frameBone.parent.updateWorldMatrix(true, false); frameBone.parent.getWorldQuaternion(qFrame);
    const delta = {
      Hips: [k.crouch * .35 + k.bump * .5, -k.lean * .2 - k.turn * .16, k.lean * .14 + k.sway],
      Spine: [k.crouch * .4, k.lean * .14 + k.turn * .12, k.lean * .3 - k.sway * .6],
      Chest: [k.crouch * .3, k.lean * .18 + k.turn * .18, k.lean * .22 - k.sway],
      Neck: [-k.crouch * (.3 + .35 * k.b), -k.lean * .22, -k.lean * .12],
      Head: [-k.crouch * .15, k.turn * .1, -k.lean * .1 + k.sway * .6],
      LeftArm: [k.swing + k.b * (1.4 - k.torso), 0, -.52 + k.a * .1 + k.turn * .18 + k.lean * .12], RightArm: [-k.swing + k.b * (1.4 - k.torso), 0, .52 - k.a * .1 + k.turn * .18 + k.lean * .12],
      LeftForeArm: [-.6 - k.swing * .5 - .55 * k.b, 0, 0], RightForeArm: [-.6 + k.swing * .5 - .55 * k.b, 0, 0],
      LeftUpLeg: [-(k.knee + k.bump) - k.hipsPitch - (k.lean > 0 ? k.a * .1 : -k.a * .08), 0, 0], RightUpLeg: [-(k.knee + k.bump) - k.hipsPitch - (k.lean < 0 ? k.a * .1 : -k.a * .08), 0, 0],
      LeftLeg: [(k.knee + k.bump) * 2, 0, 0], RightLeg: [(k.knee + k.bump) * 2, 0, 0],
      LeftFoot: [-(k.knee + k.bump), 0, 0], RightFoot: [-(k.knee + k.bump), 0, 0]
    };
    for (const name of order) {
      const bone = boneByName[name], d = delta[name]; if (!d) continue;
      bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(qParent);
      qParent.premultiply(qWork.copy(qFrame).invert());            // parent orientation in model space
      const bw = name.endsWith('Arm') ? armW : w;
      euler.set(d[0] * bw, d[1] * bw, d[2] * bw, 'YXZ'); qDelta.setFromEuler(euler);
      // local' = inverse(parent) * delta * parent * local: the delta is a model-space rotation
      qWork.copy(qParent).invert().multiply(qDelta).multiply(qParent);
      bone.quaternion.premultiply(qWork);
    }
    // Bent legs lower the pelvis: two ~0.24 m segments folded by the knee angle.
    if (boneByName.Hips) boneByName.Hips.position.y -= 2 * .24 * (1 - Math.cos(Math.max(0, k.knee + k.bump))) * w;
  }
  function display(dt) {
    const sampleTime = isCarve(state) && carveHeld ? Math.min(time, clipOf(state).duration * .5 * carveStrength) : time;
    sample(state, sampleTime, target);
    fadeTime += dt;
    const w = fadeDuration > 0 ? smooth(fadeTime / fadeDuration) : 1;
    for (let i = 0; i < count; i++) {
      const o = i * 7, bone = bones[i];
      for (let k = 0; k < 3; k++) shown[o + k] = outgoing[o + k] + (target[o + k] - outgoing[o + k]) * w;
      qa.fromArray(outgoing, o + 3); qb.fromArray(target, o + 3); qa.slerp(qb, w).toArray(shown, o + 3);
      bone.position.fromArray(shown, o); bone.quaternion.fromArray(shown, o + 3);
    }
    applyRide();
    sampledFrames++;
  }
  function event(events) {
    if (typeof events === 'string') events = [events];
    let selected = null;
    for (const transition of transitions) {
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
    ride.w = ride.speed = ride.lean = ride.phase = ride.boost = ride.arms = ride.rate = ride.prevLean = 0;
    lastCrash = lastAir = lastBoost = resultSeen = clipFinished = false;
    carveHeld = false; carveStrength = 0;
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
    const lean = bodyTarget(frame);
    carveHeld = moving && !frame.airborne && !frame.crashed && Math.abs(lean) > .2;
    carveStrength += ((carveHeld ? Math.abs(lean) : 0) - carveStrength) * (1 - Math.exp(-12 * dt));
    time += dt * (state === 'recover' ? 1.9 : state === 'fall' ? 1.15 : 1);
    // Riding layer targets: full on the ground in glide/carve, partial in the air and pole push, off elsewhere.
    const rideWeight = (!moving || frame.crashed) ? 0 : (state === 'glide' || isCarve(state)) ? 1 : state === 'tuck' ? .45 : (state === 'air' || state === 'pole_push') ? .55 : 0;
    const speed01 = clamp((Number(speed) || 0) / 60);
    const follow = 1 - Math.exp(-8 * dt);
    ride.w += (rideWeight - ride.w) * follow; ride.speed += (speed01 - ride.speed) * follow; ride.lean = followBody(ride.lean, lean, dt);
    if (dt > 0) ride.rate += (((ride.lean - ride.prevLean) / dt) - ride.rate) * (1 - Math.exp(-9 * dt)); ride.prevLean = ride.lean;
    ride.arms += (((state === 'fall' || state === 'recover' || state === 'celebrate') ? 0 : 1) - ride.arms) * (1 - Math.exp(-7 * dt));
    ride.boost += ((frame.boosting && rideWeight > 0 && !frame.airborne ? 1 : 0) - ride.boost) * (1 - Math.exp(-9 * dt));
    ride.phase += dt;
    const clip = clipOf(state);
    const events = [];
    if (frame.crashed && !lastCrash) events.push('fall_confirmed');
    // After the tumble the rider gets straight back on the board: the get-up starts early and plays fast.
    if ((!frame.crashed || time >= .55) && state === 'fall') events.push('recovery_allowed');
    if (phase === 'finished' && context.result?.won && !resultSeen) events.push('result_success');
    if (frame.airborne && !lastAir) {
      // An authoritative jump can interrupt a short ground action before its
      // authored end. Resolve its return-to-glide edge before the takeoff edge.
      if (!['fall', 'recover', 'glide', 'air'].includes(state)) event(['clip_finished', 'clip_finished_and_moving', 'moving']);
      events.push('takeoff');
    }
    if (!frame.airborne && lastAir || frame.landing && state === 'glide') events.push('ground_contact', 'receive');
    if (frame.boosting && !lastBoost) events.push('boost_confirmed', 'action');
    // Embedded skier3 clips: the authored crouch takes over at speed (hysteresis so it never flickers).
    if (moving && !frame.airborne && !frame.crashed) { if (speed01 > .72) events.push('fast'); else if (speed01 < .5) events.push('slow'); }
    if (moving) { if (!(phase === 'menu' && context.previewRun)) events.push('moving'); }
    else events.push('stopped');
    if ((moving && speed < lastSpeed - .8 || !moving) && !frame.hit) events.push('slowing');
    if (carveHeld) events.push(lean < 0 ? 'turn_left' : 'turn_right');
    else if (isCarve(state) && moving && !frame.airborne) events.push('carve_release');
    if (phase === 'menu' && context.previewRun) events.push('menu_run');
    if (!clip.loop && time >= clip.duration && !clipFinished && !(isCarve(state) && carveHeld)) {
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
  /** Moves the player onto another skeleton with the same bone names (a different LOD of the rider) and shows the current pose on it. */
  function rebind(next) {
    for (let i = 0; i < bones.length; i++) bones[i] = next[i];
    boneByName = Object.fromEntries(baked.names.map((n, i) => [n, bones[i]])); frameBone = bones[0];
    display(0);
  }
  reset();
  return {update, event, reset, rebind, metrics: () => ({state, clipTime: time, sampledFrames, bakedClips: Object.keys(baked.clips).length, carveHeld, carveStrength})};
}


const SKIER3_URL = asset('../design/skier3/skier.glb');
const edge = (source, target, on, priority = 10, blend = .12) => ({source, target, on, priority, visualBlendSeconds: blend, crossfadeSeconds: blend});
/** State graph for the five clips embedded in design/skier3/skier.glb. Same events as the authored graph,
 * minus the left/right carve clips: leaning into turns is the procedural riding layer's job. */
const SKIER3_TRANSITIONS = [
  edge('idle', 'glide', 'moving'), edge('glide', 'idle', 'stopped'), edge('tuck', 'idle', 'stopped'), edge('pole_push', 'idle', 'clip_finished_and_stopped'),
  edge('glide', 'tuck', 'fast', 12), edge('tuck', 'glide', 'slow', 12),
  edge('glide', 'pole_push', 'boost_confirmed', 40), edge('tuck', 'pole_push', 'boost_confirmed', 40),
  edge('pole_push', 'glide', 'clip_finished_and_moving'),
  edge('glide', 'air', 'takeoff', 50), edge('tuck', 'air', 'takeoff', 50), edge('pole_push', 'air', 'takeoff', 50),
  edge('air', 'land', 'ground_contact', 60), edge('glide', 'land', 'receive', 40), edge('land', 'glide', 'clip_finished_and_moving'), edge('land', 'idle', 'clip_finished_and_stopped'),
  edge('*', 'fall', 'fall_confirmed', 100, .12), edge('fall', 'recover', 'recovery_allowed', 90, .18), edge('recover', 'idle', 'clip_finished', 90, .18),
  edge('*', 'celebrate', 'result_success', 80, .2), edge('celebrate', 'idle', 'clip_finished'),
  edge('*', 'idle', 'reset', 110, 0)
];

/** Samples the clips embedded in the GLB into the same baked format the authored data produces, so the
 * existing state machine and riding layer drive them unchanged. Local transforms only: no retargeting. */
const SKIER3_CLIPS = Object.freeze({glide: 'glide', crouch: 'crouch', boost: 'boost', fall: 'fall', getUp: 'get_up', celebrate: null});
export function bakeEmbeddedSkier(gltf, isDisposed = () => false, clipNames = SKIER3_CLIPS, seconds = {}, tag = 'skier3') {
  const bones = []; gltf.scene.traverse(o => { if (o.isBone) bones.push(o); });
  if (bones.length !== 18) throw Error(`alpine.${tag}.bones:${bones.length}`);
  const names = bones.map(b => b.name), stride = names.length * 7, FPS = 30;
  const byName = Object.fromEntries(gltf.animations.map(a => [a.name, a]));
  for (const key of ['glide', 'crouch', 'boost', 'fall', 'getUp']) if (!byName[clipNames[key]]) throw Error(`alpine.${tag}.clip:${clipNames[key]}`);
  // v7 clips are authored slower than the engine's timing (fall 4 s against a 1 s recovery): fit them to the skier3 durations.
  const fit = (clip, secs) => { if (secs > 0 && clip.duration > 0) { const k = secs / clip.duration; for (let i = 0; i < clip.times.length; i++) clip.times[i] *= k; clip.duration = secs; } return clip; };
  const sampleClip = (clip, {loop, from = 0, to = clip.duration}) => {
    const interp = {};
    for (const track of clip.tracks) { const [node, prop] = track.name.split('.'); (interp[node] ||= {})[prop] = track.createInterpolant(); }
    const frames = Math.max(2, Math.round((to - from) * FPS) + 1), times = new Float32Array(frames), values = new Float32Array(frames * stride);
    for (let k = 0; k < frames; k++) {
      if (isDisposed()) throw Object.assign(Error('alpine.disposed'), {disposed: true});
      const t = Math.min(to, from + k / FPS); times[k] = t - from;
      for (let b = 0; b < names.length; b++) {
        const i = interp[names[b]] || {}, o = k * stride + b * 7;
        (i.position ? i.position.evaluate(t) : bones[b].position.toArray()).forEach((v, n) => { values[o + n] = v; });
        (i.quaternion ? i.quaternion.evaluate(t) : bones[b].quaternion.toArray()).forEach((v, n) => { values[o + 3 + n] = v; });
      }
    }
    return {times, values, duration: to - from, loop};
  };
  const glide = sampleClip(byName[clipNames.glide], {loop: true}), crouch = sampleClip(byName[clipNames.crouch], {loop: true});
  const boost = fit(sampleClip(byName[clipNames.boost], {loop: false}), seconds.boost), fall = fit(sampleClip(byName[clipNames.fall], {loop: false}), seconds.fall), getUp = fit(sampleClip(byName[clipNames.getUp], {loop: false}), seconds.getUp);
  // A dedicated celebrate clip (v7) plays once; skier3 has none and reuses the two pole pumps of its boost.
  const celebrate = clipNames.celebrate && byName[clipNames.celebrate] ? sampleClip(byName[clipNames.celebrate], {loop: false}) : boost;
  const clips = {
    idle: glide, glide, tuck: crouch, air: crouch, pole_push: boost, fall, recover: getUp, getup: getUp,
    // Landing absorbs through the first half second of the authored crouch; celebrating is two pole pumps.
    land: sampleClip(byName[clipNames.crouch], {loop: false, to: .5}), celebrate
  };
  return {names, stride, clips, transitions: SKIER3_TRANSITIONS, initialState: 'idle', motionScale: 1, embedded: true,
    bindProof: {source: 'embedded', tag, clips: gltf.animations.map(a => a.name)}};
}

const LEGACY_URL = asset('../design/characters/skier.glb');
/** Prefers the alpine-v7 rider (LODs, assets/alpine-v7) when the config switch is on and `?alpineV7=0` is absent; a failed
 * load falls back silently to the GPT/Codex skier3 asset (embedded clips), then to the earlier retargeted skier, and the
 * view falls back again to its procedural rider if all fail. */
export async function loadAlpineCharacters({modelUrl = SKIER3_URL, isDisposed = () => false, v7 = null, quality = 'high', params = new URLSearchParams(globalThis.location?.search || '')} = {}) {
  if (modelUrl === SKIER3_URL) {
    const config = v7 ? v7Config(v7) : null;
    if (config && v7Enabled(config, params)) {
      try { return await loadV7Characters({config, quality, isDisposed}); }
      catch (error) { if (error?.disposed || isDisposed()) throw error; v7Failure = String(error?.message || error); }
    }
    try { return await loadCharacters({modelUrl, embedded: true, isDisposed}); }
    catch (error) { if (error?.disposed || isDisposed()) throw error; skier3Failure = String(error?.message || error); modelUrl = LEGACY_URL; }
  }
  return loadCharacters({modelUrl, embedded: false, isDisposed});
}
let v7Failure = null;
let skier3Failure = null;

async function loadCharacters({modelUrl, embedded, isDisposed}) {
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
    const results = await Promise.allSettled(embedded ? [loader.loadAsync(modelUrl)] : [
      loader.loadAsync(modelUrl), json('../design/characters/rig.json'), json('../design/motion/alpine.json'), json('../design/viewer/retarget-map.json'),
      json('../design/motion2/alpine/alpine.json').catch(() => null) // optional: the richer get-up clip
    ]);
    gltf = results[0].status === 'fulfilled' ? results[0].value : null;
    gltf?.scene.traverse(o => { if (o.geometry) ownedGeometries.add(o.geometry); if (o.material) for (const m of [].concat(o.material)) ownedMaterials.add(m); });
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    if (isDisposed()) throw Object.assign(Error('alpine.disposed'), {disposed: true});
    const bakeStarted = performance.now();
    let baked;
    if (embedded) baked = bakeEmbeddedSkier(gltf, isDisposed);
    else {
      const [, rig, motion, map, motion2] = results.map(result => result.value);
      // 'getup' plays in place of the short authored 'recover': the rider climbs back onto the skis from lying on the side.
      if (motion2?.states?.recover_side) motion.states = {...motion.states, getup: motion2.states.recover_side};
      baked = bakeAlpineMotion(gltf.scene, rig, motion, map, isDisposed);
    }
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
      metrics() { return {mode: embedded ? 'skier3' : 'design-skier', fallbackReason: embedded ? v7Failure : skier3Failure, clips: Object.keys(baked.clips).length, bones: baked.names.length, trianglesPerRider: embedded ? 24918 : 1920, motionScale: baked.motionScale, bakeMs, loadMs, actors: actors.size}; }
    };
  } catch (error) { dispose(); throw error; }
}

// ---------------------------------------------------------------------------------------------------------------
// alpine-v7 rider. One GLB per LOD (19.9K / 9.9K / 4.1K triangles against skier3's 24.9K), each with the 18 canonical bones,
// 14 embedded clips and an embedded 1024 atlas. Only the levels the quality tier needs are fetched; a rival level nobody
// asks for is never downloaded. The same clips, state graph and riding layer drive every level (rebind on a LOD change).

const V7_JACKET = new T.Color('#356d72');        // the shell block of the v7 atlas; rivals recolour pixels near it
/** The nine source primitives (shell, face, helmet, goggles, buckles, boots, ...) are 8 draw calls per rider and per shadow
 * pass. They share one atlas, so they merge: 'gloss' (mirror goggles, metal buckles) stays apart on the player's close LOD0,
 * everything else becomes one skinned mesh; rival levels merge into one. Poles stay two small meshes on the hands. */
function mergeRiderMeshes(scene, splitGloss, own) {
  const skinned = []; scene.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  const buckets = new Map();
  for (const mesh of skinned) {
    const key = splitGloss && [].concat(mesh.material)[0].metalness >= .5 ? 'gloss' : 'body';
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(mesh);
  }
  for (const [key, list] of buckets) {
    const first = list[0];
    if (list.length < 2 || !list.every(m => m.skeleton === first.skeleton && m.matrix.equals(first.matrix) && m.parent === first.parent)) continue;
    const geometries = list.map(m => {
      const g = m.geometry.clone();
      // Draco may decode the skin indices as Uint8 in one primitive and Uint16 in another; merging needs one type.
      const idx = g.attributes.skinIndex; if (idx && !(idx.array instanceof Uint16Array)) g.setAttribute('skinIndex', new T.BufferAttribute(Uint16Array.from(idx.array), idx.itemSize));
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
      return g;
    });
    const merged = mergeGeometries(geometries, false); for (const g of geometries) g.dispose();
    if (!merged) continue;
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const material = (key === 'body' && list.find(m => /^Technical shell/.test(m.material.name))?.material) || first.material;
    const mesh = new T.SkinnedMesh(merged, material); mesh.name = 'rider-' + key; mesh.matrix.copy(first.matrix); mesh.matrixAutoUpdate = first.matrixAutoUpdate;
    first.parent.add(mesh); mesh.bind(first.skeleton, first.bindMatrix);
    for (const m of list) { m.removeFromParent(); m.geometry.dispose(); if (m.material !== material) own.materials.add(m.material); }
    own.geometries.add(merged);
  }
}
/** Paints the jacket block of the atlas in the rival's colour (pixels near the shell colour, keeping the cloth shading). */
function tintJacket(material, color) {
  const tint = new T.Color(color);
  material.onBeforeCompile = shader => {
    shader.uniforms.uJacketRef = {value: V7_JACKET}; shader.uniforms.uJacketTint = {value: tint};
    shader.fragmentShader = 'uniform vec3 uJacketRef;uniform vec3 uJacketTint;\n' + shader.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>
      { float jd = distance(diffuseColor.rgb, uJacketRef), jm = 1.0 - smoothstep(.05, .12, jd);
        float jl = clamp(dot(diffuseColor.rgb, vec3(.2126,.7152,.0722)) / dot(uJacketRef, vec3(.2126,.7152,.0722)), .6, 1.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, uJacketTint * jl, jm); }`);
  };
  material.customProgramCacheKey = () => 'alpine-v7-jacket';
  material.needsUpdate = true;
}

async function loadV7Characters({config, quality: startQuality, isDisposed}) {
  const loadStarted = performance.now();
  let quality = startQuality === 'low' ? 'low' : 'high';
  const plan = lodPlan(quality, config);
  const levels = new Map(), pending = new Map(), actors = new Set();
  const own = {geometries: new Set(), materials: new Set()};
  let disposed = false, baked = null, deferredFailure = null;
  const free = entry => { entry.scene.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); entry.textures.forEach(t => t.dispose()); };
  function dispose() {
    if (disposed) return; disposed = true;
    for (const actor of actors) { actor.root.removeFromParent(); actor.shadow.removeFromParent(); actor.disposeVariants(); }
    for (const g of own.geometries) g.dispose(); for (const m of own.materials) m.dispose();
    for (const entry of levels.values()) free(entry);
    actors.clear(); levels.clear();
  }
  const checkAlive = () => { if (disposed || isDisposed()) throw Object.assign(Error('alpine.disposed'), {disposed: true}); };
  /** Fetches the listed levels with one Draco worker, which never outlives the call (workers do not survive into the race). */
  async function fetchLevels(list) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(asset('../vendor/draco/')); draco.setDecoderConfig({type: 'wasm'}); draco.setWorkerLimit(1);
    try {
      const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
      const results = await Promise.allSettled(list.map(level => loader.loadAsync(asset('../' + v7Path(level, config)))));
      const entries = results.map((result, i) => {
        if (result.status !== 'fulfilled') return null;
        const gltf = result.value, textures = new Set();
        gltf.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) if (m.map) textures.add(m.map); });
        return {level: list[i], gltf, scene: gltf.scene, textures};
      });
      const failed = results.find(r => r.status === 'rejected');
      if (failed || disposed || isDisposed()) { for (const e of entries) if (e) free(e); if (failed) throw failed.reason; checkAlive(); }
      return entries;
    } finally { draco.dispose(); }
  }
  function register(entry) {
    // LOD0 is the player's close level and keeps the mirrored goggles apart; every other level merges into one mesh.
    mergeRiderMeshes(entry.scene, entry.level === 0, own);
    entry.scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) own.materials.add(m); });
    levels.set(entry.level, entry);
    if (!baked) baked = bakeEmbeddedSkier(entry.gltf, isDisposed, V7_CLIPS, config.clipSeconds, 'v7');
  }
  // The levels this tier needs now are awaited (a failure here means "no v7": the caller falls back to skier3).
  try {
    for (const entry of await fetchLevels(plan.now)) register(entry);
    checkAlive();
  } catch (error) { dispose(); throw error; }
  const loadMs = performance.now() - loadStarted;
  function ensure(level) {
    if (levels.has(level) || pending.has(level) || disposed || deferredFailure) return;
    const task = fetchLevels([level]).then(([entry]) => { if (disposed) { free(entry); return; } register(entry); for (const a of actors) a.refresh(); })
      .catch(error => { if (!error?.disposed) deferredFailure = String(error?.message || error); }).finally(() => pending.delete(level));
    pending.set(level, task);
  }

  return {
    createRider(id, color, scene, kit) {
      if (disposed) throw Error('alpine.disposed');
      const role = id === 'player' ? 'player' : 'rival';
      const root = new T.Group(), holder = new T.Group(); root.add(holder);
      // Course local -Z is downhill; the delivered character faces +Z.
      holder.rotation.y = Math.PI; holder.scale.setScalar(config.scale); holder.position.y = .025;
      const variants = new Map();
      function variant(level) {
        let v = variants.get(level); if (v) return v;
        const body = kit.cloneSkinned(levels.get(level).scene), found = {};
        body.traverse(o => {
          if (o.isBone) found[o.name] = o;
          if (!o.isMesh) return;
          o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
          const material = o.material.clone(); material.envMapIntensity = .25;
          if (role === 'rival' && material.map && /^Technical shell/.test(material.name)) tintJacket(material, color);
          o.material = material; own.materials.add(material);
        });
        v = {body, bones: baked.names.map(name => found[name])}; variants.set(level, v); return v;
      }
      const shadowGeometry = new T.PlaneGeometry(1.2, 2.2);
      const shadowMaterial = new T.MeshBasicMaterial({map: kit.contactTex, transparent: true, depthWrite: false, opacity: .5});
      own.geometries.add(shadowGeometry); own.materials.add(shadowMaterial);
      const shadow = new T.Mesh(shadowGeometry, shadowMaterial); shadow.castShadow = shadow.receiveShadow = false;
      shadow.rotation.x = -Math.PI / 2; scene.add(root, shadow);
      let shown = null, level = null, distance = 0, player = null;
      function show(next) {
        if (next === level) return;
        const v = variant(next);
        if (shown) holder.remove(shown.body);
        holder.add(v.body); shown = v; level = next;
        if (player) player.rebind(v.bones);
      }
      const choose = () => {
        const want = wantedLod({role, quality, distance, current: level, config});
        if (!levels.has(want) && levelUseful(want, role, quality, config)) ensure(want);
        show(pickAvailable(want, levels.keys()));
      };
      choose();
      player = createAlpineMotionPlayer(baked, shown.bones);
      const actor = {id, root, body: holder, shadow, update: player.update, reset: player.reset, event: player.event,
        metrics: () => ({...player.metrics(), lod: level}),
        /** Called by the view each frame with the camera-to-rider distance; swaps the level when the policy says so. */
        setDistance(d) { distance = d; choose(); },
        refresh: choose,
        get lod() { return level; },
        disposeVariants() { for (const v of variants.values()) v.body.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); variants.clear(); },
        pose(time, lean = 0, air = 0, impact = 0) { player.update({lean, airborne: air > .5, landing: impact > .2}, {time, phase: 'racing'}); }};
      actors.add(actor); return actor;
    },
    dispose,
    /** The quality governor dropped a preset: every rider re-evaluates its level (the player to LOD1, rivals to LOD2). */
    setQuality(next) { quality = next === 'low' ? 'low' : 'high'; for (const a of actors) a.refresh(); },
    metrics() {
      const lods = {}; for (const a of actors) lods[a.id] = a.lod;
      return {mode: 'v7', fallbackReason: null, clips: Object.keys(baked.clips).length, bones: baked.names.length, trianglesPerRider: V7_TRIANGLES[plan.player], lods,
        loaded: [...levels.keys()].sort(), pending: [...pending.keys()], deferredFailure, plan: {player: plan.player, rival: plan.rival, now: plan.now}, quality,
        motionScale: baked.motionScale, loadMs, actors: actors.size};
    }
  };
}
