import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {createActor} from './catch-actors.mjs?v=island-v2-20261107-12';
import {DATA_VERSION} from '../release.mjs?v=island-v2-20261107-12';
import {FILES, BUILDINGS, THEMES, Particles, canvasTexture, skyTexture, tileTexture, glowTexture, starTexture, netTexture, blobShadow, fitModel, rigCar, lightOn, clamp, lerp, damp, smooth} from './catch-gfx.mjs?v=island-v2-20261107-12';

/** v6 Three.js view of "תפוס את הפושע": the city street is built along the chase track (catch-track.mjs): a road ribbon
 * with lane markings and kerbs, sidewalks, buildings, lamps and trees placed by distance along the track and offset
 * from it, so every bend is real geometry and the camera rides behind the police car through the turns.
 * After the chase the same scene hands over to the bow stage (catch-bow-view.mjs) at the frame where the thief stopped.
 * Nothing here decides the game: positions come from the chase engine and the throw engine. */

const CX_TURN = {policeCar: Math.PI / 2, getawayCar: Math.PI / 2, van: Math.PI / 2, roadblock: Math.PI / 2}; // Codex models face +z, the track heads +x at rest
const WALK_W = 3.6, KERB_H = .14, PARKED_TINTS = ['#ffffff', '#cfe0ff', '#d6ffd0', '#ffd6cc']; // the road width comes from the chase rules (CHASE6.roadHalf: 13.6 m since 11/11, Roy: "a wider road")
/** Only the four wheel nodes spin (rigCar also lists their child meshes, which would double the rate). Wheel radius ~.34 m. */
function spinCar(root, dist) { if (!root.userData.spin) root.userData.spin = (root.userData.wheels || []).filter(w => /^Wheel_[FR][LR]$/.test(w.name)); for (const w of root.userData.spin) w.rotation.x += dist / .34; }

/** Road texture: x runs along the road (one tile = 12 m), y across it (the whole width): a one-way road of three lanes with dashed
 * white lane lines, solid white edge lines where the shoulder starts, a lighter shoulder and a yellow line at the kerb. */
function roadTexture(theme, C) {
  const half = C.roadHalf, px = d => (d + half) / (2 * half) * 256; // metres across -> canvas y
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = theme.road; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, 0, w, px(-C.shoulder)); g.fillRect(0, px(C.shoulder), w, h - px(C.shoulder));
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); g.fillStyle = `rgba(0,0,0,${Math.random() * .08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    const line = (d, wide, style) => { g.fillStyle = style; g.fillRect(0, px(d) - wide / 2, w, wide); };
    line(-C.shoulder, 4, 'rgba(255,255,255,.8)'); line(C.shoulder, 4, 'rgba(255,255,255,.8)');
    line(-half + .3, 3, '#e9dca0'); line(half - .3, 3, '#e9dca0');
    g.fillStyle = 'rgba(255,255,255,.75)'; for (let x = 0; x < w; x += 256) for (const d of [-C.laneWidth / 2, C.laneWidth / 2]) g.fillRect(x, px(d) - 2, 110, 4);
  }, {repeat: [1, 1]});
}
/** Zebra stripes across the road (bands along y = across the ribbon). */
function zebraTexture() {
  return canvasTexture(32, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.9)'; for (let y = 10; y < h - 8; y += 24) g.fillRect(0, y, w, 12); });
}
/** A warning sign for a bend: a yellow diamond with a black arrow that bends left or right (dir > 0 = left). */
function bendSignTexture(dir) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#ffd21f'; g.beginPath(); g.moveTo(64, 2); g.lineTo(126, 64); g.lineTo(64, 126); g.lineTo(2, 64); g.closePath(); g.fill();
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.stroke();
    g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(64, 98); g.lineTo(64, 66); g.quadraticCurveTo(64, 46, 64 + dir * 20, 44); g.stroke();
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(64 + dir * 36, 44); g.lineTo(64 + dir * 16, 30); g.lineTo(64 + dir * 16, 58); g.closePath(); g.fill();
  });
}
/** A ribbon along the track between offsets dA and dB (right positive), at height y; uv.x = s / uScale. */
function ribbon(track, s0, s1, dA, dB, y, step = 2, uScale = 10) {
  const n = Math.ceil((s1 - s0) / step) + 1, pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
  for (let i = 0; i < n; i++) {
    const s = s0 + i * step, a = track.toWorld(s, dA), b = track.toWorld(s, dB);
    pos.set([a.x, y, a.z, b.x, y, b.z], i * 6); uv.set([s / uScale, 0, s / uScale, 1], i * 4);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
/** A vertical kerb face along the track at offset d, from y0 to y1. */
function kerbFace(track, s0, s1, d, y0, y1, step = 2) {
  const n = Math.ceil((s1 - s0) / step) + 1, pos = new Float32Array(n * 2 * 3), idx = [];
  for (let i = 0; i < n; i++) { const s = s0 + i * step, a = track.toWorld(s, d); pos.set([a.x, y0, a.z, a.x, y1, a.z], i * 6); if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); } }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return new T.Mesh(geo, new T.MeshStandardMaterial({color: '#cfc9bb', roughness: .9, side: T.DoubleSide}));
}

/** `assets7` (v7, default on unless ?catchAssets=0): the Codex prop pack (catch-props7.mjs) replaces the drawn shapes: ramps for the
 * boost pads (the cars hop over them), oil slicks, police and construction barriers, cones, civilian cars, nitro bottles, the police
 * helicopter, guardrails on the outside of the bends, puddles on the shoulder and a warning sign before every ramp. */
export async function createCatchView6({canvas, balance, stage = 1, chase, quality = 'high', maxDpr = 2, lowDpr = 1.25, onProgress = () => {}, signal, assets7 = false}) {
  const level = balance.levels[stage - 1], theme = THEMES[level.theme] || THEMES.day, base = new URL('../' + (balance.render.base || 'assets/game-catch/'), import.meta.url);
  const track = chase.track, C = chase.C, low = quality === 'low', ROAD_W = (C.roadHalf || 6.8) * 2;
  const renderer = new T.WebGLRenderer({canvas, antialias: !low, alpha: false, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, low ? lowDpr : maxDpr));
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene(); scene.background = skyTexture(theme); scene.fog = new T.Fog(theme.fog, theme.near + 10, theme.far + 40);
  const hemi = new T.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]), sun = new T.DirectionalLight(theme.sun[0], theme.sun[1]);
  sun.position.set(...theme.sun[2]); scene.add(hemi, sun);
  const camera = new T.PerspectiveCamera(52, 2, .3, 420); scene.add(camera);

  // ----- assets -----
  const gltfLoader = new GLTFLoader(), jobs = [], models = {}, pending = {total: 0, done: 0};
  const load = (key, url) => { pending.total++; return gltfLoader.loadAsync(url).then(g => { if (CX_TURN[key]) { const w = new T.Group(); w.add(g.scene); g.scene.rotation.y = CX_TURN[key]; g.scene = w; } models[key] = g; onProgress(++pending.done / pending.total); }); };
  const modelUrl = name => { const u = new URL('models/' + name + '.glb', base); u.searchParams.set('v', DATA_VERSION); return u.href; };
  for (const key of ['apartment', 'shop', 'cafe', 'house', 'station', 'lamp', 'tree', 'bush', 'policeCar', 'getawayCar', 'cone', 'taxi', 'truck', 'bus', 'roadblock', 'van']) jobs.push(load(key, modelUrl(FILES[key])));
  const actorUrl = n => new URL('../assets/models/' + n + '.glb', import.meta.url).href;
  jobs.push(load('officer', actorUrl('adult-woman-rigged-512')), load('thief', actorUrl('adult-man-rigged-512')));
  let props7 = null, P7mod = null; // v7: a failed pack load keeps the drawn shapes
  if (assets7 && (chase.v7?.elements || chase.v7?.weapons)) {
    pending.total++;
    jobs.push(import('./catch-props7.mjs?v=island-v2-20261107-12').then(m => { P7mod = m; return m.loadProps7({T, version: DATA_VERSION, signal}); }).then(p => { props7 = p; }).catch(() => { props7 = null; }).finally(() => onProgress(++pending.done / pending.total)));
  }
  await Promise.all(jobs);
  if (signal?.aborted) { renderer.dispose(); throw Error('aborted'); }

  // ----- the street along the track -----
  const S0 = -80, S1 = track.length + 240, world = []; // world = [{obj, s}] for the visibility window
  const keep = (obj, s) => { world.push({obj, s}); scene.add(obj); return obj; };
  const roadTex = roadTexture(theme, C); roadTex.wrapS = T.RepeatWrapping; roadTex.wrapT = T.ClampToEdgeWrapping;
  const road = new T.Mesh(ribbon(track, S0, S1, -ROAD_W / 2, ROAD_W / 2, .01, 2, 12), new T.MeshStandardMaterial({map: roadTex, roughness: .95})); scene.add(road);
  const tiles = tileTexture(); tiles.repeat.set(1, 1);
  const walkMat = new T.MeshStandardMaterial({map: tiles, roughness: .9});
  scene.add(new T.Mesh(ribbon(track, S0, S1, ROAD_W / 2, ROAD_W / 2 + WALK_W, KERB_H, 2, 3), walkMat), new T.Mesh(ribbon(track, S0, S1, -ROAD_W / 2 - WALK_W, -ROAD_W / 2, KERB_H, 2, 3), walkMat));
  scene.add(kerbFace(track, S0, S1, ROAD_W / 2, 0, KERB_H), kerbFace(track, S0, S1, -ROAD_W / 2, 0, KERB_H));
  // pedestrian crossings every ~90 m on the straights, and a bend sign on the right sidewalk 28 m before every arc
  const zebraMat = new T.MeshBasicMaterial({map: zebraTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  for (let s = 130; s < S1 - 60; s += 90) { if (Math.abs(track.curvatureAt(s)) > 1 / 400 || Math.abs(track.curvatureAt(s + 4)) > 1 / 400) continue; const z = new T.Mesh(ribbon(track, s, s + 3.6, -C.shoulder, C.shoulder, .025, 1.8, 3.6), zebraMat); z.renderOrder = 1; keep(z, s + 1.8); }
  const signTex = {1: bendSignTexture(1), [-1]: bendSignTexture(-1)}, poleGeo = new T.CylinderGeometry(.05, .06, 2.6, 8), poleMat = new T.MeshStandardMaterial({color: '#8d9299', roughness: .5, metalness: .4}), plateGeo = new T.PlaneGeometry(1, 1);
  for (const seg of track.segments) {
    if (seg.kind !== 'arc' || seg.s0 < 40) continue;
    const s = seg.s0 - 28, p = track.toWorld(s, ROAD_W / 2 + .9), sign = new T.Group();
    const pole = new T.Mesh(poleGeo, poleMat); pole.position.y = KERB_H + 1.3; sign.add(pole);
    const plate = new T.Mesh(plateGeo, new T.MeshBasicMaterial({map: signTex[seg.dir > 0 ? 1 : -1], transparent: true, side: T.DoubleSide})); plate.position.y = KERB_H + 2.9; plate.rotation.y = -Math.PI / 2; sign.add(plate);
    sign.position.set(p.x, 0, p.z); sign.rotation.y = track.yawAt(s); keep(sign, s);
  }
  const ground = new T.Mesh(new T.PlaneGeometry(2600, 2600), new T.MeshStandardMaterial({color: theme === THEMES.night ? '#1d2230' : theme === THEMES.dusk ? '#6b6a5c' : '#7f8a74', roughness: 1}));
  ground.rotation.x = -Math.PI / 2; ground.position.set(track.toWorld(track.length / 2).x, -.03, track.toWorld(track.length / 2).z); scene.add(ground);
  const shadowTex = glowTexture('#000000');
  // buildings on both sides: a deterministic row by stage, shops and cafes near, apartments taller behind
  const rowKeys = level.decor === 'downtown' || level.decor === 'harbor' ? ['apartment', 'apartment', 'shop', 'apartment', 'cafe', 'apartment', 'station', 'apartment'] : level.decor === 'avenue' ? ['shop', 'apartment', 'cafe', 'station', 'house', 'apartment', 'shop'] : ['apartment', 'shop', 'cafe', 'house', 'apartment', 'station', 'shop', 'cafe', 'apartment', 'house'];
  const fitted = {}; for (const k of rowKeys) if (!fitted[k]) { const f = fitModel(models[k], {height: BUILDINGS[k].h}); fitted[k] = f.userData.size; }
  const budget = low ? 150 : 240; // per side: a shared budget left the right side empty after ~300 m (found 11/11 on the stage 3 sheet)
  for (const side of [-1, 1]) {
    let s = S0 + 10, i = (stage * 3 + (side > 0 ? 2 : 0)) % rowKeys.length, count = 0;
    while (s < S1 && count < budget) {
      const key = rowKeys[i++ % rowKeys.length], size = fitted[key], gap = 1.5 + ((i * 7) % 5);
      // skip the inside of tight bends where the buildings would overlap the road
      const k = track.curvatureAt(s + size.x / 2); const inside = (k > 0 && side < 0) || (k < 0 && side > 0);
      if (!(inside && Math.abs(k) > 1 / 70)) {
        const root = fitModel(models[key], {height: BUILDINGS[key].h});
        const d = side * (ROAD_W / 2 + WALK_W + size.z / 2 + .6), p = track.toWorld(s + size.x / 2, d);
        root.position.set(p.x, 0, p.z); root.rotation.y = track.yawAt(s + size.x / 2) + (side > 0 ? Math.PI : 0);
        keep(root, s + size.x / 2); count++;
      }
      s += size.x + gap;
    }
  }
  // lamps, trees and bushes on the sidewalks
  const lamps = [], lampGlow = glowTexture('#ffd58a');
  for (let s = S0 + 6; s < S1; s += 11) {
    const n = Math.round((s - S0) / 11), side = n % 2 ? 1 : -1, d = side * (ROAD_W / 2 + WALK_W - .7), p = track.toWorld(s, d);
    if (n % 3 === 0) { const lamp = fitModel(models.lamp, {height: 5.4}); lamp.position.set(p.x, KERB_H, p.z); keep(lamp, s);
      if (theme.lamps) { const sp = new T.Sprite(new T.SpriteMaterial({map: lampGlow, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false})); sp.scale.set(3.6, 3.6, 1); sp.position.set(p.x, 5.3, p.z); keep(sp, s); lamps.push(sp); } }
    else if (n % 3 === 1) { const tree = fitModel(models.tree, {height: 6.4}); tree.position.set(p.x, KERB_H, p.z); keep(tree, s); }
    else { const bush = fitModel(models.bush, {width: 2}); bush.position.set(p.x, KERB_H, p.z); keep(bush, s); }
  }
  // the roadblock at the end of the chase
  { const s = chase.spec.seconds * (C.baseSpeed + C.boostSpeed) + 120; for (const d of C.lanes) { const rb = fitModel(models.roadblock, {depth: 3.2}); const p = track.toWorld(s, d); rb.position.set(p.x, 0, p.z); rb.rotation.y = track.yawAt(s); keep(rb, s); } }
  const viewWindow = [-45, 190];
  function cullWorld(sNow) { for (const w of world) w.obj.visible = w.s > sNow + viewWindow[0] && w.s < sNow + viewWindow[1]; railWindow(sNow); }

  // ----- v7 prop pack (catch-props7.mjs, Codex CC0) for the chase elements: road decor here, the obstacles in makeProp -----
  const P7 = props7 && chase.v7?.elements ? props7 : null;
  const rampKind = o => stage >= 4 && o.id % 3 === 0 ? 'bridge' : 'ramp'; // from stage 4 every third ramp is the jump bridge
  const ramps = P7 ? chase.obstacles.filter(o => o.kind === 'pad').map(o => ({s: o.s, d: o.d, kind: rampKind(o), ...P7mod.rampSpan(rampKind(o))})).sort((a, b) => a.s - b.s) : [];
  /** The drawn hop of anything driving at (s, d) over a ramp: {y, pitch} or null (the pad's boost stays the rule). */
  const liftAt = (s, d) => { for (const r of ramps) { const x = s - (r.s - r.back); if (x <= 0) break; if (x < r.total && Math.abs(d - r.d) < 1.7) return P7mod.rampLift(r.kind, x); } return null; };
  let rails = null;
  if (P7) {
    const at = (s, d, y = KERB_H) => { const g = new T.Group(), p = track.toWorld(s, d); g.position.set(p.x, y, p.z); g.rotation.y = track.yawAt(s); return g; };
    // a warning sign (a bump ahead) on the sidewalk 26 m before every ramp, on the side of its lane
    for (const r of ramps) { const g = at(r.s - 26, (r.d < -.5 ? -1 : 1) * (ROAD_W / 2 + 1.1)); g.add(P7.mesh('warning-sign')); keep(g, r.s - 26); }
    // puddles on the shoulder of the straights, by the kerb (only scenery: the lanes stay clear)
    for (let s = 150 + (stage * 37) % 60, k = 0; s < S1 - 80; s += 130 + (k * 53) % 70, k++) {
      if (Math.abs(track.curvatureAt(s)) > 1 / 300) continue;
      const m = P7.mesh(k % 2 ? 'puddle-b' : 'puddle-a'), bb = m.geometry.boundingBox; m.scale.set(2.6 / (bb.max.x - bb.min.x), 1, 1.15 / (bb.max.z - bb.min.z));
      const g = at(s, (k % 2 ? 1 : -1) * 6.1, 0); g.add(m); keep(g, s);
    }
    // a police barrel on the sidewalk beside every closed edge lane of a police roadblock
    for (const o of chase.obstacles) if (o.kind === 'barrier' && o.police && Math.abs(o.d) > 1) { const g = at(o.s, Math.sign(o.d) * (ROAD_W / 2 + 1)); g.add(P7.mesh('police-barrel')); keep(g, o.s); }
    // guardrails on the outside of every bend (one instanced draw, refilled for the visible window)
    const list = [];
    for (const seg of track.segments) { if (seg.kind !== 'arc' || seg.s0 < 30) continue; const side = seg.dir > 0 ? 1 : -1; for (let s = seg.s0 - 6; s < seg.s1 + 6; s += 5.08) list.push({s, d: side * (ROAD_W / 2 + .45)}); }
    list.sort((a, b) => a.s - b.s);
    if (list.length) {
      const all = new Float32Array(list.length * 16), m4 = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1), up = new T.Vector3(0, 1, 0), p3 = new T.Vector3();
      list.forEach((r, i) => { const mid = r.s + 2.54, p = track.toWorld(mid, r.d); q.setFromAxisAngle(up, track.yawAt(mid)); m4.compose(p3.set(p.x, KERB_H, p.z), q, one); m4.toArray(all, i * 16); });
      const mesh = P7.instanced('guardrail', 64); mesh.frustumCulled = false; scene.add(mesh);
      rails = {list, all, mesh, lo: -1, hi: -1};
    }
  }
  function railWindow(sNow) {
    if (!rails) return;
    const a = sNow + viewWindow[0], b = sNow + viewWindow[1]; let lo = 0; while (lo < rails.list.length && rails.list[lo].s + 5 < a) lo++;
    let hi = lo; while (hi < rails.list.length && rails.list[hi].s < b && hi - lo < 64) hi++;
    if (lo === rails.lo && hi === rails.hi) return; rails.lo = lo; rails.hi = hi;
    rails.mesh.instanceMatrix.array.set(rails.all.subarray(lo * 16, hi * 16)); rails.mesh.count = hi - lo; rails.mesh.instanceMatrix.needsUpdate = true; rails.mesh.visible = hi > lo;
  }

  // ----- cars -----
  const playerCar = rigCar(fitModel(models.policeCar, {width: 4.4})), crimCar = rigCar(fitModel(models.getawayCar, {width: 4.2}));
  scene.add(playerCar, crimCar);
  const carGlow = (color, size) => { const sp = new T.Sprite(new T.SpriteMaterial({map: glowTexture(color), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false})); sp.scale.set(size, size, 1); return sp; };
  const flameP = carGlow('#ffb347', 2.6), flameC = carGlow('#ff8a3d', 2.2); flameP.position.set(-2.6, .55, 0); flameC.position.set(-2.4, .55, 0);
  const redLight = carGlow('#ff3b3b', 1.4), blueLight = carGlow('#3b6bff', 1.4); redLight.position.set(.2, 1.7, -.35); blueLight.position.set(.2, 1.7, .35);
  playerCar.add(flameP, redLight, blueLight); crimCar.add(flameC);
  // headlights at dusk and night: a soft cone of light on the road ahead of each car
  const beams = [];
  if (theme.lamps) for (const car of [playerCar, crimCar]) { const beam = new T.Mesh(new T.PlaneGeometry(6, 14), new T.MeshBasicMaterial({map: glowTexture('#fff3c4'), transparent: true, opacity: .35, blending: T.AdditiveBlending, depthWrite: false})); beam.rotation.x = -Math.PI / 2; beam.position.set(8, .05, 0); car.add(beam); beams.push(beam); }
  // speed streaks: thin additive sprites that stretch along the road while boosting
  const streakTex = canvasTexture(64, 8, g => { const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#ffffff00'); gr.addColorStop(.5, '#ffffffcc'); gr.addColorStop(1, '#ffffff00'); g.fillStyle = gr; g.fillRect(0, 0, 64, 8); });
  const streakGeo = new T.PlaneGeometry(9, .16), streaks = []; for (let i = 0; i < (low ? 14 : 24); i++) { const m = new T.Mesh(streakGeo, new T.MeshBasicMaterial({map: streakTex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false})); m.renderOrder = 6; scene.add(m); streaks.push({m, s: 0, d: 0, y: 0}); }
  playerCar.add(blobShadow(shadowTex, 5, 2.6, .5)); crimCar.add(blobShadow(shadowTex, 5, 2.6, .5));
  const sparks = new Particles(scene, {texture: starTexture(), size: .55, additive: true}), dust = new Particles(scene, {texture: glowTexture('#c9b79a'), size: 1.1, additive: false, max: 90});
  // obstacles appear inside the window around the officer
  const props = new Map();
  /** v7 pack: a ramp for a boost pad, an oil slick sized to its slippery patch, a police or a construction barrier, three cones,
   * civilian cars for the taxis and the parked cars (a motorcycle among them); trucks and buses keep their v6 models. */
  function makeProp7(o) {
    const root = new T.Group(); let m = null;
    if (o.kind === 'pad') m = P7.mesh(rampKind(o) === 'bridge' ? 'jump-bridge' : 'short-ramp');
    else if (o.kind === 'oil') { m = P7.mesh(o.id % 2 ? 'oil-slick-b' : 'oil-slick-a'); const bb = m.geometry.boundingBox; m.scale.set(4.6 / (bb.max.x - bb.min.x), 1, 3.3 / (bb.max.z - bb.min.z)); }
    else if (o.kind === 'barrier') { m = P7.mesh(o.police ? 'police-barrier' : 'construction-barrier'); if (o.police) m.scale.set(1, 1.35, .82); } // police: within its lane, taller to read from afar
    else if (o.kind === 'cone') for (let i = 0; i < 3; i++) { const c = P7.mesh('traffic-cone'); c.scale.setScalar(.85); c.position.set((i - 1) * .5, 0, (i % 2) * .3); root.add(c); }
    else if (o.kind === 'traffic' && o.model === 'taxi') m = P7.mesh(['taxi', 'civilian-sedan', 'civilian-hatchback'][o.id % 3]);
    else if (o.kind === 'parked') m = P7.mesh(['civilian-hatchback', 'civilian-sedan', 'motorcycle'][o.id % 3]);
    else return null;
    if (m) root.add(m);
    if (o.kind === 'traffic' || o.kind === 'parked') { const bike = o.kind === 'parked' && o.id % 3 === 2; root.add(blobShadow(shadowTex, bike ? 2.8 : 4.8, bike ? 1.2 : 2.4, .45)); }
    scene.add(root); return root;
  }
  function makeProp(o) {
    if (P7) { const r = makeProp7(o); if (r) return r; }
    let root;
    if (o.kind === 'traffic' || o.kind === 'parked') { root = fitModel(models[o.model], {width: o.model === 'bus' ? 7.5 : o.model === 'truck' ? 5.6 : 4.4}); if (o.kind === 'parked' && o.tint) root.traverse(m => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.color.set(PARKED_TINTS[o.tint % PARKED_TINTS.length]); } }); }
    else if (o.kind === 'barrier') root = fitModel(models.roadblock, {depth: 2.8});
    else if (o.kind === 'cone') { root = new T.Group(); for (let i = 0; i < 3; i++) { const c = fitModel(models.cone, {height: .75}); c.position.set((i - 1) * .5, 0, (i % 2) * .3); root.add(c); } }
    else if (o.kind === 'oil') { root = new T.Group(); const m = new T.Mesh(new T.CircleGeometry(1.6, 24), new T.MeshStandardMaterial({color: '#141a22', roughness: .15, metalness: .6, transparent: true, opacity: .85})); m.rotation.x = -Math.PI / 2; m.position.y = .03; m.scale.x = 1.5; root.add(m); }
    else { root = new T.Group(); const m = new T.Mesh(new T.CircleGeometry(1.5, 24), new T.MeshBasicMaterial({map: glowTexture('#7dffb0'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: .9})); m.rotation.x = -Math.PI / 2; m.position.y = .04; root.add(m); }
    if (o.kind === 'traffic' || o.kind === 'parked') root.add(blobShadow(shadowTex, 5, 2.4, .45));
    scene.add(root); return root;
  }

  // ----- camera -----
  const cam = {fov: 52, shake: 0, look: null, pos: null, bank: 0};
  const look = new T.Vector3(), tmp = new T.Vector3(), tmp2 = {};
  function resize() { const parent = canvas.parentElement, w = Math.max(2, parent?.clientWidth || 844), h = Math.max(2, parent?.clientHeight || 390); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; observer?.observe(canvas.parentElement || canvas);
  const placeOnTrack = (obj, s, d, yawExtra = 0) => { track.toWorld(s, d, tmp2); obj.position.set(tmp2.x, obj.position.y, tmp2.z); obj.rotation.y = track.yawAt(s) + yawExtra; };

  let mode = 'chase', phase = 0, fx = null, fx7 = null, bow = null, engine = null, frame = null, skidSpin = 0;
  import('./catch-tyre-fx.mjs?v=island-v2-20261107-12').then(m => { if (m.createTyreFx && !signal?.aborted) fx = m.createTyreFx({T, scene, playerCar, crimCar, sparks, dust, gfx: {glowTexture, canvasTexture, blobShadow}}); }).catch(() => { fx = null; });
  // v7: nitro orbs, police roadblocks, the tools (spike strip, sticky net, pulse, tracker and helicopter), oil on the thief
  if (chase.v7?.weapons || chase.v7?.elements) import('./catch-chase-fx7.mjs?v=island-v2-20261107-12').then(m => { if (m.createChaseFx7 && !signal?.aborted && mode === 'chase') fx7 = m.createChaseFx7({T, scene, track, chase, playerCar, crimCar, sparks, dust, gfx: {glowTexture, canvasTexture, netTexture}, theme, low, props7}); }).catch(() => { fx7 = null; });
  const hop = {p: 0, c: 0, yP: 0, yC: 0}; // v7 ramps: the drawn nose pitch (damped) and the last height, for the landing puff

  function updateChase(dt) {
    const st = chase.state, c = st.crim;
    phase += dt;
    cullWorld(st.s);
    // cars: on the track, with the steering angle and the bend showing as a small yaw, a lean on hard steering
    // v7 ramps: both cars hop over a ramp in their lane (drawn only), with a puff of dust and a small shake on a high landing
    const lp = P7 ? liftAt(st.s, st.d) : null;
    hop.p = damp(hop.p, lp ? lp.pitch : 0, 14, dt);
    playerCar.position.y = lp ? lp.y : 0; placeOnTrack(playerCar, st.s, st.d, -st.steer * .22); playerCar.rotation.z = -st.steer * .05 + (st.boosting ? .02 : 0) + hop.p;
    if (lp) hop.yP = Math.max(hop.yP, lp.y); else if (hop.yP > .5) { hop.yP = 0; cam.shake += .25; dust.emit(playerCar.position.x, .2, playerCar.position.z, 8, {speed: 2.5, up: 1, color: [.75, .72, .66], gravity: .6, life: .6}); }
    const cd = c.d + (c.wobble || 0);
    const lc = P7 && st.phase !== 'skid' ? liftAt(c.s, cd) : null;
    hop.c = damp(hop.c, lc ? lc.pitch : 0, 14, dt);
    crimCar.position.y = lc ? lc.y : 0;
    if (lc) hop.yC = Math.max(hop.yC, lc.y); else if (hop.yC > .5) { hop.yC = 0; dust.emit(crimCar.position.x, .2, crimCar.position.z, 6, {speed: 2.5, up: 1, color: [.75, .72, .66], gravity: .6, life: .6}); }
    if (st.phase === 'skid') { const u = clamp(st.skid / C.skidSeconds, 0, 1); skidSpin = Math.sin(u * Math.PI) * .9 * (1 - u * .5) + u * .35; placeOnTrack(crimCar, c.s, cd, -skidSpin); if (Math.random() < .8) dust.emit(crimCar.position.x, .3, crimCar.position.z, 2, {speed: 2.5, up: 1.2, color: [.55, .55, .55], gravity: -.5, life: 1}); }
    else placeOnTrack(crimCar, c.s, cd, -clamp((c.targetD - c.d) * .12, -.25, .25));
    crimCar.rotation.z = Math.sin(phase * 2.3) * st.damage * .03 + (crimCar.userData.flatLeanNow || 0) + hop.c; crimCar.rotation.x = (crimCar.userData.flatPitch || 0) * .5;
    if (st.damage > .25 && Math.random() < st.damage * .6) dust.emit(crimCar.position.x, 1, crimCar.position.z, 1, {speed: 1, up: 1.6, color: [.5, .5, .5], gravity: -1.2, life: .9});
    flameP.visible = st.boosting; flameP.scale.setScalar(2 + Math.sin(phase * 9) * .4); flameC.visible = c.boostLeft > 0; flameC.scale.setScalar(1.8 + Math.sin(phase * 9) * .35);
    const red = Math.sin(phase * 9) > 0; lightOn(playerCar.userData.lights.Light_R, red); lightOn(playerCar.userData.lights.Light_B, !red);
    redLight.visible = red; blueLight.visible = !red; redLight.material.opacity = blueLight.material.opacity = .55 + Math.abs(Math.sin(phase * 9)) * .45;
    // streaks: while boosting (or very fast) they fly past on both sides of the road
    const streakOn = st.boosting || st.v > C.baseSpeed + 4;
    for (const k of streaks) {
      if (k.m.material.opacity <= 0 && streakOn && Math.random() < .35) { k.s = st.s + 26 + Math.random() * 60; k.d = (Math.random() < .5 ? -1 : 1) * (2.5 + Math.random() * 8); k.y = .25 + Math.random() * 2.8; k.m.material.opacity = .55 + Math.random() * .3; }
      if (k.m.material.opacity > 0) { placeOnTrack(k.m, k.s, k.d); k.m.position.y = k.y; k.m.material.opacity -= dt * (k.s < st.s - 8 ? 3 : .25); if (k.s < st.s - 14) k.m.material.opacity = 0; }
    }
    spinCar(playerCar, st.v * dt); spinCar(crimCar, c.v * dt);
    if (st.scraping && Math.random() < .7) { track.toWorld(st.s + 1, Math.sign(st.d) * (C.roadHalf - .1), tmp2); sparks.emit(tmp2.x, .3, tmp2.z, 3, {speed: 3, up: 2, color: [1, .8, .4], life: .4}); }
    if (Math.abs(st.steer) > .6 && st.v > 15 && Math.random() < .5) { track.toWorld(st.s - 1.5, st.d, tmp2); dust.emit(tmp2.x, .2, tmp2.z, 1, {speed: 1.5, up: .6, color: [.8, .78, .7], gravity: .5, life: .5}); }
    if (st.boosting && Math.random() < .6) { track.toWorld(st.s - 2.4, st.d, tmp2); dust.emit(tmp2.x, .3, tmp2.z, 1, {speed: 2, up: .8, color: [1, .75, .4], gravity: 0, life: .35}); }
    // obstacles in the window
    const lo = st.s - 30, hi = st.s + 160;
    for (const o of chase.obstacles) {
      if (o.kind === 'nitro') continue; // drawn by catch-chase-fx7.mjs (instanced)
      const os = chase.obstacleS(o, st.t), inside = os > lo && os < hi, entry = props.get(o.id);
      if (inside && !entry) props.set(o.id, {root: makeProp(o), o});
      else if (!inside && entry) { scene.remove(entry.root); props.delete(o.id); }
    }
    for (const [, e] of props) {
      const o = e.o, os = chase.obstacleS(o, st.t); placeOnTrack(e.root, os, o.d, o.kind === 'parked' ? 0 : 0); e.root.visible = Boolean(P7) || !(o.kind === 'pad' && o.used); if (o.hitP || o.hitC) e.root.rotation.y += Math.sin(o.id) * .3;
      if (P7 && o.kind === 'traffic') { const l = liftAt(os, o.d); e.root.position.y = l ? l.y : 0; e.root.rotation.z = l ? l.pitch : 0; } // a car in front also hops a ramp
    }
    // camera: behind and above the police car, looking ahead into the bend; boost widens the lens
    const kAhead = track.curvatureAt(st.s + 30);
    const fovTarget = (low ? 50 : 52) + (st.boosting ? 7 : 0) + clamp((st.v - 22) * .4, 0, 4);
    cam.fov = damp(cam.fov, fovTarget, 5, dt); camera.fov = cam.fov; camera.updateProjectionMatrix();
    // 11/11: 8.5 m back and 3.6 m up for the wider road; the camera sits a little toward the outside of the bend and looks further into it
    track.toWorld(st.s - 8.5, st.d * .5 + kAhead * 45, tmp2); const px = tmp2.x, pz = tmp2.z;
    track.toWorld(st.s + 16, st.d * .3 - kAhead * 120, tmp2); const lx = tmp2.x, lz = tmp2.z;
    if (!cam.pos) { cam.pos = new T.Vector3(px, 3.6, pz); cam.look = new T.Vector3(lx, 1.1, lz); }
    const kp = 1 - Math.exp(-dt * 7), kl = 1 - Math.exp(-dt * 9);
    cam.pos.x += (px - cam.pos.x) * kp; cam.pos.z += (pz - cam.pos.z) * kp; cam.pos.y += (3.6 - (st.boosting ? .25 : 0) - cam.pos.y) * kp;
    cam.look.x += (lx - cam.look.x) * kl; cam.look.z += (lz - cam.look.z) * kl; cam.look.y = 1.1;
    cam.shake = Math.max(0, cam.shake - dt * 2.2);
    const sh = cam.shake * cam.shake * .6, ts = performance.now() / 1000;
    camera.position.set(cam.pos.x + Math.sin(ts * 47) * sh * .4, cam.pos.y + Math.cos(ts * 53) * sh * .3, cam.pos.z + Math.cos(ts * 41) * sh * .4);
    look.copy(cam.look); camera.lookAt(look);
    cam.bank = damp(cam.bank, -st.steer * .04 - st.slide * .006 - st.curvature * st.v * .012, 6, dt); camera.rotateZ(cam.bank);
    for (const l of lamps) l.material.opacity = .85 + Math.sin(phase * 3 + l.position.x) * .08;
    fx?.update(dt, {thiefSpeed: c.v, flatCount: chase.gun.state.flatCount, skid: st.phase === 'skid'});
    fx7?.update(dt);
  }
  const dispatch = {
    chase(events) {
      for (const e of events) {
        if (e.type === 'crash') { cam.shake += .7; sparks.emit(playerCar.position.x, .8, playerCar.position.z, 18, {speed: 4, up: 3, color: [1, .8, .4], life: .6}); dust.emit(playerCar.position.x, .3, playerCar.position.z, 8, {speed: 3, up: 1.5, color: [.7, .65, .55], gravity: 1}); }
        else if (e.type === 'crimCrash') { cam.shake += .3; sparks.emit(crimCar.position.x, .8, crimCar.position.z, 14, {speed: 4, up: 3, color: [.8, .9, 1], life: .5}); }
        else if (e.type === 'ram') { cam.shake += .35; sparks.emit((playerCar.position.x + crimCar.position.x) / 2, .9, (playerCar.position.z + crimCar.position.z) / 2, e.side ? 22 : 12, {speed: 4, up: 2.5, color: [1, .85, .5], life: .5}); }
        else if (e.type === 'scrape') { cam.shake += .2; }
        else if (e.type === 'oil') { cam.shake += .15; }
        else if (e.type === 'nearMiss') { cam.shake += .18; }
        else if (e.type === 'pad') sparks.emit(playerCar.position.x, .3, playerCar.position.z, 12, {speed: 2.5, up: 2.5, color: [.5, 1, .7], life: .6});
        else if (e.type === 'skid') { cam.shake += .5; }
      }
      fx?.handle(events); fx7?.handle(events);
    },
  };

  // ----- the bow stage (after the chase) -----
  let officer = null, thieves = [], bowFallback = null;
  async function makeBowStage(eng, fr) {
    officer = createActor(models.officer, {height: 1.7, role: 'officer', tint: {torso: [.2, .38, .75], forearm: [.2, .38, .75], legs: [.07, .1, .22], shoes: [.08, .08, .1]}});
    const thief = createActor(models.thief, {height: 1.82, role: 'thief', tint: {torso: [.1, .1, .12], forearm: [.1, .1, .12], legs: [.2, .21, .25], shoes: [.9, .9, .9]}});
    thieves = [{actor: thief, shadow: blobShadow(shadowTex, 1.4, 1.1, .5)}]; thief.root.add(thieves[0].shadow); officer.root.add(blobShadow(shadowTex, 1.4, 1.1, .5));
    scene.add(officer.root, thief.root);
    try {
      const m = await import('./catch-bow-view.mjs?v=island-v2-20261107-12');
      bow = m.createBowStage({T, scene, camera, models, officer, thieves, frame: fr, track, balance, level, stage, engine: eng, sparks, dust, gfx: {glowTexture, canvasTexture, blobShadow, starTexture, fitModel}, theme});
      bow.bind?.(eng); bow.enter?.();
    } catch (err) { bow = null; bowFallback = makeFallbackBow(eng, fr); }
  }
  /** Until catch-bow-view.mjs exists: a first-person look down the street with the thief and a plain net. */
  function makeFallbackBow(eng, fr) {
    const net = new T.Mesh(new T.SphereGeometry(.5, 12, 8), new T.MeshBasicMaterial({color: '#f6f9ff', wireframe: true})); net.visible = false; scene.add(net);
    const w = (x, z, out = {}) => track.toWorld(fr.s0 + x, fr.d0 + z, out);
    return {
      update(dt) {
        const s = eng.state, c = eng.criminalAt(eng.clock), th = thieves[0].actor;
        w(c.x, c.z, tmp2); th.root.position.set(tmp2.x, c.y, tmp2.z); th.root.rotation.y = track.yawAt(fr.s0 + c.x) + Math.PI; th.state.mode = c.mode === 'gone' ? 'run' : c.mode; th.update(dt);
        w(0, 0, tmp2); officer.root.position.set(tmp2.x, 0, tmp2.z); officer.root.rotation.y = track.yawAt(fr.s0); officer.state.mode = 'aim'; officer.update(dt);
        const fn = eng.flightNow(); if (fn) { w(fn.x, fn.z, tmp2); net.visible = true; net.position.set(tmp2.x, fn.y, tmp2.z); } else net.visible = false;
        w(.9, .35, tmp2); camera.position.set(tmp2.x, 1.6, tmp2.z); w(c.x, c.z * .5, tmp2); look.set(tmp2.x, 1.1, tmp2.z); camera.fov = 40; camera.updateProjectionMatrix(); camera.lookAt(look);
      },
      handle() {}, project: null, dispose() { scene.remove(net); },
    };
  }

  const api = {
    renderer, scene, camera, models, track, sparks, dust, playerCar, crimCar,
    get mode() { return mode; }, get bow() { return bow; }, get officer() { return officer; }, get thieves() { return thieves; }, get fx7() { return fx7; },
    /** v7: the Codex prop pack when it is drawn (null with ?catchAssets=0, without v7 elements or when the pack failed to load). */
    get props7() { return props7; }, get props7Road() { return Boolean(P7); },
    /** Tools: which pack props are in the scene now (counts by name) and the guardrails drawn. */
    props7Stats() { const n = {}; scene.traverseVisible(o => { if (o.name?.startsWith('props7:')) n[o.name.slice(7)] = (n[o.name.slice(7)] || 0) + (o.isInstancedMesh ? o.count : 1); }); return n; },
    shake(amount = 1) { cam.shake = Math.min(1.6, cam.shake + amount); },
    enterChase() { mode = 'chase'; },
    handleChase(events) { dispatch.chase(events); },
    /** After the chase the throw engine takes over the same street at the thief's stop. Resolves when the bow stage is ready. */
    async bindThrow(next, fr) {
      engine = next; frame = fr; mode = 'throw'; fx7?.leave?.();
      for (const [, e] of props) { if (e.o.kind !== 'parked' && e.o.kind !== 'barrier') { scene.remove(e.root); props.delete(e.o.id); } }
      playerCar.visible = true; cam.shake = 0;
      await makeBowStage(next, fr);
      return bow || bowFallback;
    },
    handle(events, snap) { bow?.handle(events, snap); },
    project(x, y, z = 0) { tmp.set(x, y, z).project(camera); return {x: (tmp.x * .5 + .5) * canvas.clientWidth, y: (-tmp.y * .5 + .5) * canvas.clientHeight, visible: tmp.z < 1}; },
    /** World position of the thief's car (for the HUD reticle). */
    crimWorld() { return {x: crimCar.position.x, y: .5, z: crimCar.position.z}; },
    update(dt, snap = {}) {
      if (mode === 'chase') updateChase(dt);
      else { cullWorld(frame ? frame.s0 : chase.state.s); (bow || bowFallback)?.update(dt, snap); for (const l of lamps) l.material.opacity = .85 + Math.sin(performance.now() / 333 + l.position.x) * .08; }
      sparks.update(dt); dust.update(dt);
      if (!snap.noRender) renderer.render(scene, camera); // tools step the simulation many times per drawn frame
    },
    resize,
    dispose() {
      observer?.disconnect(); bow?.dispose?.(); bowFallback?.dispose?.(); fx?.dispose?.(); fx7?.dispose?.();
      scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) for (const mm of Array.isArray(m) ? m : [m]) { mm.map?.dispose?.(); mm.dispose?.(); } });
      officer?.dispose(); for (const t of thieves) t.actor.dispose(); props7?.dispose?.();
      renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
  return api;
}
