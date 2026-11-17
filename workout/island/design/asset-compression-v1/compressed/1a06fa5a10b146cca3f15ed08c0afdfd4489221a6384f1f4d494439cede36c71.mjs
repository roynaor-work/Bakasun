import * as T from '../vendor/three.module.js';
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';

/** The officer and the thief come from the island's existing rigged adults
 * (assets/models/adult-woman-rigged-512.glb and adult-man-rigged-512.glb).
 * Their run and walk clips are kept as they are; the throwing, hiding and
 * surrender poses are bone-driven on top of a frozen walk frame, so nothing
 * is drawn in code. Only hats, the mask and the sack are small primitives. */

const V = (x, y, z) => new T.Vector3(x, y, z).normalize();
const q1 = new T.Quaternion(), q2 = new T.Quaternion(), p1 = new T.Vector3(), p2 = new T.Vector3(), p3 = new T.Vector3();
const lerpDir = (a, b, k) => a.clone().lerp(b, k).normalize();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = u => 1 - (1 - u) * (1 - u);

function setWorldQuaternion(node, q) {
  node.quaternion.copy(node.parent.getWorldQuaternion(q2).invert().multiply(q));
  node.updateMatrixWorld(true);
}
/** Rotate `node` by the shortest arc so the segment node -> child points along `dir` (world). */
function pointBone(node, child, dir) {
  node.updateMatrixWorld(true);
  node.getWorldPosition(p1);
  child.getWorldPosition(p2);
  p2.sub(p1).normalize();
  q1.setFromUnitVectors(p2, dir);
  setWorldQuaternion(node, q1.multiply(node.getWorldQuaternion(new T.Quaternion())));
}
function rotateWorld(node, axis, angle) {
  node.updateMatrixWorld(true);
  q1.setFromAxisAngle(axis, angle);
  setWorldQuaternion(node, q1.multiply(node.getWorldQuaternion(new T.Quaternion())));
}
const AXIS_Z = new T.Vector3(0, 0, 1);

const boneKey = n => n.replace(/^mixamorig:?/, '');

/** Scale to a real height, keep the body upright on y = 0, keep the clips. */
export function createActor(gltf, {height = 1.75, tint, role}) {
  const root = new T.Group(), body = cloneSkinned(gltf.scene);
  body.rotation.y = Math.PI / 2;
  root.add(body);
  const bones = new Map();
  body.traverse(n => { if (n.isBone) bones.set(boneKey(n.name), n); });
  root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(body), size = box.getSize(new T.Vector3());
  const scale = height / Math.max(0.01, size.y);
  body.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const lowest = new T.Box3().setFromObject(body).min.y;
  body.position.y -= lowest;
  body.traverse(n => {
    if (!n.isMesh) return;
    n.frustumCulled = false;
    // Keep the painted texture; only darken or tint the clothes by bone, so skin and face stay as drawn.
    const index = n.geometry.attributes.skinIndex, weight = n.geometry.attributes.skinWeight;
    if (index && n.skeleton && tint) {
      const g = n.geometry = n.geometry.clone(), count = g.attributes.position.count, colors = new Float32Array(count * 3), mix = new Float32Array(count), names = n.skeleton.bones.map(b => boneKey(b.name));
      for (let i = 0; i < count; i++) {
        let best = 0, w = -1;
        for (let k = 0; k < 4; k++) { const v = [weight.getX, weight.getY, weight.getZ, weight.getW][k].call(weight, i); if (v > w) { w = v; best = k; } }
        const bone = names[[index.getX, index.getY, index.getZ, index.getW][best].call(index, i)] || '';
        let c = null;
        if (/^(Hips|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg)$/.test(bone)) c = tint.legs;
        else if (/^(Spine|Spine1|Spine2|LeftShoulder|RightShoulder|LeftArm|RightArm)$/.test(bone)) c = tint.torso;
        else if (/^(LeftForeArm|RightForeArm)$/.test(bone)) c = tint.forearm || tint.torso;
        else if (/Foot|Toe/.test(bone)) c = tint.shoes;
        if (c) { mix[i] = 1; colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2]; }
        else { colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 1; }
      }
      g.setAttribute('color', new T.BufferAttribute(colors, 3));
      g.setAttribute('tintMix', new T.BufferAttribute(mix, 1));
      const m = (Array.isArray(n.material) ? n.material[0] : n.material).clone();
      m.vertexColors = true; m.roughness = Math.max(.72, m.roughness ?? .8); m.metalness = 0;
      // Clothes take the uniform's colour but keep the painted shading; skin and face stay as drawn.
      m.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float tintMix;\nvarying float vTintMix;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTintMix = tintMix;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTintMix;').replace('#include <color_fragment>', 'float tintLuma = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb * (.35 + 1.3 * tintLuma), vTintMix);');
      };
      m.customProgramCacheKey = () => 'catch-tint-v1';
      n.material = m;
    }
  });
  const mixer = new T.AnimationMixer(body), clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  const run = mixer.clipAction(clips.Running), walk = mixer.clipAction(clips.Walking);
  run.play(); walk.play(); run.setEffectiveWeight(0); walk.setEffectiveWeight(1); walk.paused = true;
  // The walk frame in which the feet pass each other makes the neutral standing pose.
  const standTime = (() => {
    const foots = [bones.get('LeftFoot'), bones.get('RightFoot')], dur = clips.Walking.duration;
    let best = 0, gap = 1e9;
    for (let i = 0; i <= 24; i++) {
      walk.time = dur * i / 24; mixer.update(0); root.updateMatrixWorld(true);
      const a = foots[0].getWorldPosition(p1).clone(), b = foots[1].getWorldPosition(p2).clone(), d = Math.abs(a.x - b.x) + 2 * Math.abs(a.y - b.y);
      if (d < gap) { gap = d; best = walk.time; }
    }
    return best;
  })();
  walk.time = standTime; mixer.update(0);
  const state = {mode: 'idle', t: 0, speed: 0, run: 0, throwT: 1, aim: {angle: 38, power: .5}, pose: null, crouch: 0, lean: 0};
  const get = n => bones.get(n);
  const sides = {R: {arm: get('RightArm'), fore: get('RightForeArm'), hand: get('RightHand'), up: get('RightUpLeg'), leg: get('RightLeg'), foot: get('RightFoot'), toe: get('RightToeBase')},
                 L: {arm: get('LeftArm'), fore: get('LeftForeArm'), hand: get('LeftHand'), up: get('LeftUpLeg'), leg: get('LeftLeg'), foot: get('LeftFoot'), toe: get('LeftToeBase')}};
  const spine = get('Spine'), chest = get('Spine2'), head = get('Head');
  // Some clips leave the spine untouched, so every pose starts from the standing frame's spine.
  const spineRest = spine.quaternion.clone();

  function arms(rUp, rFore, lUp, lFore) {
    for (const [s, up, fore] of [['R', rUp, rFore], ['L', lUp, lFore]]) {
      const b = sides[s]; if (!up) continue;
      pointBone(b.arm, b.fore, up); pointBone(b.fore, b.hand, fore);
    }
  }
  function legs(rThigh, rShin, lThigh, lShin) {
    for (const [s, thigh, shin] of [['R', rThigh, rShin], ['L', lThigh, lShin]]) {
      const b = sides[s];
      pointBone(b.up, b.leg, thigh); pointBone(b.leg, b.foot, shin);
      if (b.toe) pointBone(b.foot, b.toe, V(1, -.12, 0));
    }
  }
  const STANCE = {rT: V(-.38, -.92, .12), rS: V(-.12, -1, .02), lT: V(.5, -.86, -.1), lS: V(.1, -1, -.02)};
  const NEUTRAL_ARM = V(.08, -1, .1);

  function applyOfficer(dt) {
    const a = state.aim, rad = a.angle * Math.PI / 180, pull = clamp(a.power, 0, 1);
    const WIND_UP = {up: V(-.82, .42, .2), fore: V(-.12, .98, .12)};
    const REST = {up: V(.12, -.98, .12), fore: V(.5, -.85, .1)};
    const dir = V(Math.cos(rad), Math.sin(rad), .06), flung = V(.62, -.78, .12);
    let rUp, rFore, lUp = dir, lFore = dir, lean = .14 * pull;
    if (state.mode === 'cheer') {
      const k = Math.sin(state.t * 9) * .15;
      rUp = V(.15, 1, .35 + k); rFore = V(.1, 1, .25 + k); lUp = V(.15, 1, -.35 - k); lFore = V(.1, 1, -.25 - k); lean = -.05;
    } else if (state.mode === 'dismay') {
      rUp = V(.15, .55, .6); rFore = V(.3, .95, -.5); lUp = V(.15, .55, -.6); lFore = V(.3, .95, .5); lean = .12;
    } else if (state.throwT < 1) {
      const u = state.throwT, release = .45;
      if (u < release) { const k = easeOut(u / release); rUp = lerpDir(lerpDir(REST.up, WIND_UP.up, .25 + .75 * pull), dir, k); rFore = lerpDir(WIND_UP.fore, dir, k); lean = (.14 * pull) * (1 - k) - .22 * k; }
      else { const k = easeOut((u - release) / (1 - release)); rUp = lerpDir(dir, flung, k); rFore = lerpDir(dir, flung, k); lean = -.22 + .1 * k; lUp = lerpDir(dir, V(-.1, -1, -.2), k); lFore = lUp; }
    } else {
      const hold = state.mode === 'wait' ? 0 : 1;
      rUp = lerpDir(REST.up, WIND_UP.up, hold * (.22 + .78 * pull)); rFore = lerpDir(REST.fore, WIND_UP.fore, hold * (.12 + .88 * pull));
      if (state.mode === 'wait') { lUp = NEUTRAL_ARM; lFore = REST.fore; lean = 0; }
    }
    if (state.debug !== 'noarms') arms(rUp, rFore, lUp, lFore);
    spine.quaternion.copy(spineRest); spine.updateMatrixWorld(true);
    if (state.debug !== 'nolean') rotateWorld(spine, AXIS_Z, lean);
    if (state.debug !== 'nolegs') legs(STANCE.rT, STANCE.rS, STANCE.lT, STANCE.lS);
  }
  function applyThief(dt) {
    if (posed()) { spine.quaternion.copy(spineRest); spine.updateMatrixWorld(true); }
    if (state.mode === 'caught') {
      const k = clamp(state.t / .5, 0, 1), sway = Math.sin(state.t * 7) * .12 * (1 - k * .5);
      arms(V(.1, 1, .5 + sway), V(0, 1, .12), V(.1, 1, -.5 - sway), V(0, 1, -.12));
      legs(V(.5, -.75, .2), V(-.55, -.8, .1), V(.5, -.75, -.2), V(-.55, -.8, -.1));
      rotateWorld(spine, AXIS_Z, -.28 * k);
    } else if (state.mode === 'hide') {
      arms(V(.4, -.7, .3), V(.7, -.2, .3), V(.4, -.7, -.3), V(.7, -.2, -.3));
      rotateWorld(spine, AXIS_Z, -.2);
    }
  }
  function ground() {
    root.updateMatrixWorld(true);
    let low = 1e9;
    for (const n of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) { const b = bones.get(n); if (b) { b.getWorldPosition(p3); low = Math.min(low, p3.y - root.position.y); } }
    body.position.y -= (low - .06) ;
  }
  const posed = () => state.mode === 'wait' || state.mode === 'aim' || state.mode === 'cheer' || state.mode === 'dismay' || state.mode === 'caught' || state.mode === 'hide' || state.throwT < 1;

  return {
    root, body, bones, state, mixer, standTime,
    /** speed: world m/s along x; mode: idle|run|aim|wait|cheer|dismay|caught|hide */
    update(dt) {
      state.t += dt;
      if (state.throwT < 1) state.throwT = Math.min(1, state.throwT + dt / .62);
      const running = state.mode === 'run';
      const target = running ? 1 : 0;
      state.run += (target - state.run) * Math.min(1, dt * 14);
      run.setEffectiveWeight(state.run); walk.setEffectiveWeight(1 - state.run);
      run.setEffectiveTimeScale(clamp(.55 + Math.abs(state.speed) / 3.6 * .7, .7, 1.6));
      body.position.y = 0;
      mixer.update(dt);
      if (!running || state.run < .3) walk.time = standTime;
      root.updateMatrixWorld(true);
      if (state.debug === 'none') return;
      if (role === 'officer') { if (state.mode !== 'run') { applyOfficer(dt); ground(); } }
      else { applyThief(dt); if (posed()) ground(); }
    },
    throwNow() { state.throwT = 0; },
    handWorld(out = new T.Vector3()) { return sides.R.hand.getWorldPosition(out); },
    headWorld(out = new T.Vector3()) { return head.getWorldPosition(out); },
    chestWorld(out = new T.Vector3()) { return chest.getWorldPosition(out); },
    attach(boneName, object) { (bones.get(boneName) || root).add(object); },
    dispose() {
      mixer.stopAllAction();
      body.traverse(n => { if (n.isMesh) { n.geometry?.dispose?.(); } });
    },
  };
}
