import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {createActor} from './catch-actors.mjs?v=island-v2-20261107-8';
import {ROAD_WAVES, roadShape} from './catch-chase.mjs?v=island-v2-20261107-8';
import {DATA_VERSION} from '../release.mjs?v=island-v2-20261107-8';

/** Three.js side of "תפוס את הפושע". One street from the island's city models
 * (assets/game-catch/models: quantized, WebP-textured copies of the city-lab Meshy models; no WebAssembly because the island's CSP has no exception for it),
 * the officer and the thief from the island's rigged adults, a side-on camera
 * that follows the net. All numbers come from the engine's snapshot; nothing
 * here decides who is caught. */

const FILES = {
  apartment: 'apartment', shop: 'shop', cafe: 'cafe', house: 'house', station: 'police-station',
  taxi: 'taxi', truck: 'truck', bus: 'bus', roadblock: 'roadblock', policeCar: 'police-car', van: 'armored-van', bush: 'bush', cone: 'cone', getawayCar: 'getaway-car', tree: 'tree', lamp: 'lamp',
};
const BUILDINGS = {apartment: {h: 11}, shop: {h: 6}, cafe: {h: 6.2}, house: {h: 5}, station: {h: 7.2}};
const THEMES = {
  day: {top: '#4aa6ea', mid: '#9ad2f2', bottom: '#e9f6ff', fog: '#cfe7f5', near: 38, far: 150, hemi: ['#ffffff', '#8c9490', 1.25], sun: ['#fff0d2', 2.6, [-12, 18, 14]], road: '#3f434b', lamps: false, stars: false, sunDisc: '#fff6d8'},
  dusk: {top: '#34428d', mid: '#e8836b', bottom: '#ffc58a', fog: '#e3a081', near: 30, far: 130, hemi: ['#ffd9b0', '#5b4f66', 1.05], sun: ['#ffae66', 2.4, [26, 7, 12]], road: '#383a44', lamps: true, stars: false, sunDisc: '#ffe1a8'},
  night: {top: '#050a1d', mid: '#0f1c47', bottom: '#2b3d78', fog: '#101b3b', near: 24, far: 110, hemi: ['#5b72b8', '#161a2b', .95], sun: ['#9ab8ff', 1.1, [-10, 16, 12]], road: '#2b2e38', lamps: true, stars: true, sunDisc: '#dfe8ff'},
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

function canvasTexture(w, h, draw, {repeat, srgb = true} = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); if (srgb) t.colorSpace = T.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4; return t;
}
function skyTexture(theme) {
  return canvasTexture(1024, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, theme.top); grad.addColorStop(.55, theme.mid); grad.addColorStop(1, theme.bottom);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    if (theme.stars) { g.fillStyle = '#fff'; for (let i = 0; i < 160; i++) { g.globalAlpha = .25 + (i % 7) / 10; g.fillRect((i * 337) % w, (i * 191) % (h * .6), 1.6, 1.6); } g.globalAlpha = 1; }
    const sx = theme === THEMES.dusk ? w * .78 : w * .2, sy = theme === THEMES.dusk ? h * .72 : h * .22, r = theme.stars ? 34 : 46;
    const glow = g.createRadialGradient(sx, sy, 0, sx, sy, r * 4); glow.addColorStop(0, theme.sunDisc + 'dd'); glow.addColorStop(.25, theme.sunDisc + '55'); glow.addColorStop(1, theme.sunDisc + '00');
    g.fillStyle = glow; g.fillRect(0, 0, w, h); g.fillStyle = theme.sunDisc; g.beginPath(); g.arc(sx, sy, r * .55, 0, 7); g.fill();
    // soft clouds: a few flat ellipses, enough to give the sky depth
    g.fillStyle = theme.stars ? 'rgba(160,185,255,.10)' : 'rgba(255,255,255,.55)';
    for (let i = 0; i < 9; i++) { const x = (i * 211 + 90) % w, y = 70 + (i * 53) % 150; for (let j = 0; j < 5; j++) { g.beginPath(); g.ellipse(x + j * 34 - 70, y + (j % 2) * 8, 50 - j * 4, 15, 0, 0, 7); g.fill(); } }
  });
}
function asphaltTexture(theme) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = theme.road; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); g.fillStyle = `rgba(0,0,0,${Math.random() * .07})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#e9dca0'; g.fillRect(40, h * .5 - 3, 180, 6);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, 10, w, 4); g.fillRect(0, h - 14, w, 4);
  }, {repeat: [20, 1]});
}
function tileTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#b8b3a6'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(70,66,58,.45)'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, {repeat: [50, 1]});
}
function glowTexture(color = '#ffffff') {
  return canvasTexture(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, color); r.addColorStop(.35, color + '88'); r.addColorStop(1, color + '00'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
}
function starTexture() {
  return canvasTexture(64, 64, (g) => { g.translate(32, 32); g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 9 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); });
}
function netTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#f4f7ff'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); }
  }, {repeat: [3, 2]});
}
function blobShadow(texture, w, d, opacity = .5) {
  const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({map: texture, transparent: true, opacity, depthWrite: false}));
  m.rotation.x = -Math.PI / 2; m.position.y = .02; m.renderOrder = 1; return m;
}

/** Fits a loaded model: scale by width (x) or height, stand it on y = 0, centre it on x. */
function fitModel(gltf, {width, height, depth}) {
  const root = new T.Group(), model = gltf.scene.clone(true);
  const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3());
  const s = height ? height / size.y : width ? width / size.x : depth / size.z;
  model.scale.setScalar(s);
  const b = new T.Box3().setFromObject(model);
  model.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  root.add(model); root.userData.size = b.getSize(new T.Vector3());
  return root;
}

/** Wheels spin, police roof lights flash: nodes named by the Codex models. Light materials are cloned per car. */
function rigCar(root) {
  const wheels = [], lights = {}; root.traverse(o => {
    if (/^Wheel_/.test(o.name)) wheels.push(o);
    if (o.name === 'Light_R' || o.name === 'Light_B') {
      lights[o.name] = o; o.traverse(m => { if (m.isMesh) m.material = m.material.clone(); });
    }
  });
  root.userData.wheels = wheels; root.userData.lights = lights; return root;
}
function lightOn(node, on) { node?.traverse(m => { if (m.isMesh && m.material) m.material.emissiveIntensity = on ? 3 : .15; }); }
function spinWheels(root, d) { for (const w of root.userData.wheels || []) w.rotation.x += d; }

class Particles {
  constructor(scene, {texture, size, additive, max = 90}) {
    this.max = max; this.items = [];
    const geo = new T.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    geo.setAttribute('position', new T.BufferAttribute(this.pos, 3)); geo.setAttribute('color', new T.BufferAttribute(this.col, 3));
    this.points = new T.Points(geo, new T.PointsMaterial({size, map: texture, transparent: true, depthWrite: false, vertexColors: true, blending: additive ? T.AdditiveBlending : T.NormalBlending, sizeAttenuation: true}));
    this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
  }
  emit(x, y, z, n, {speed = 3, up = 2, life = .9, color = [1, 1, 1], gravity = 7, spread = 1} = {}) {
    for (let i = 0; i < n && this.items.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (.35 + Math.random() * .65);
      this.items.push({x, y, z, vx: Math.cos(a) * s * spread, vy: up * (.4 + Math.random()) + Math.sin(a) * s * .5, vz: (Math.random() - .5) * s * .5, life: life * (.6 + Math.random() * .6), age: 0, color, gravity});
    }
  }
  update(dt) {
    let n = 0;
    this.items = this.items.filter(p => (p.age += dt) < p.life);
    for (const p of this.items) {
      p.vy -= p.gravity * dt; p.x += p.vx * dt; p.y = Math.max(0, p.y + p.vy * dt); p.z += p.vz * dt;
      const fade = 1 - p.age / p.life;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.color[0] * fade; this.col[n * 3 + 1] = p.color[1] * fade; this.col[n * 3 + 2] = p.color[2] * fade; n++;
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export async function createCatchView({canvas, arch: archOn = false, engine: initialEngine = null, balance, stage = 1, v2 = true, quality = 'high', maxDpr = 2, lowDpr = 1.25, onProgress = () => {}, signal}) {
  let engine = initialEngine;
  const level = {...balance.levels[stage - 1]}; let movers = v2 ? (level.movers || []) : []; const theme = THEMES[level.theme] || THEMES.day, base = new URL('../' + (balance.render.base || 'assets/game-catch/'), import.meta.url);
  const renderer = new T.WebGLRenderer({canvas, antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance'});
  const dprCap = quality === 'low' ? lowDpr : maxDpr;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, dprCap));
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  scene.background = skyTexture(theme);
  scene.fog = new T.Fog(theme.fog, theme.near, theme.far);
  const hemi = new T.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]), sun = new T.DirectionalLight(theme.sun[0], theme.sun[1]);
  sun.position.set(...theme.sun[2]); scene.add(hemi, sun);
  const camera = new T.PerspectiveCamera(30, 2, .3, 400);
  const arch = Boolean(archOn), ZC = arch ? 1.2 : 0; // v5 archery view: behind the officer, looking down the street; ZC is the street centre
  if (arch) { // same lane assignment as the engine: covers then movers, round-robin
    const lanes = [0, -2.4, 2.4, -1.2, 1.2]; level.obstacles = level.obstacles.map(o => ({...o})); level.movers = (level.movers || []).map(o => ({...o}));
    [...level.obstacles, ...level.movers].forEach((o, i) => { if (o.z === undefined) o.z = lanes[i % lanes.length]; });
    movers = v2 ? level.movers : [];
  }
  scene.add(camera);

  // ----- assets -----
  const gltfLoader = new GLTFLoader();
  const jobs = [], models = {}, pending = {total: 0, done: 0};
  const CX_TURN = {policeCar: Math.PI / 2, getawayCar: Math.PI / 2, van: Math.PI / 2, roadblock: Math.PI / 2}; // Codex models face +Z, the street runs along +X
  const load = (key, url) => { pending.total++; return gltfLoader.loadAsync(url).then(g => { if (CX_TURN[key]) { const w = new T.Group(); w.add(g.scene); g.scene.rotation.y = CX_TURN[key]; g.scene = w; } models[key] = g; onProgress(++pending.done / pending.total); }); };
  const modelUrl = name => { const u = new URL('models/' + name + '.glb', base); u.searchParams.set('v', DATA_VERSION); return u.href; };
  const needed = new Set(['apartment', 'shop', 'cafe', 'house', 'station', 'lamp', 'tree', 'bush', 'policeCar', 'getawayCar', 'cone']);
  for (const o of [...level.obstacles, ...movers]) needed.add(o.model);
  if (v2) for (const k of ['taxi', 'truck', 'bus', 'roadblock', 'van']) needed.add(k);
  for (const key of needed) jobs.push(load(key, modelUrl(FILES[key])));
  const actorUrl = n => new URL('../assets/models/' + n + '.glb', import.meta.url).href;
  jobs.push(load('officer', actorUrl('adult-woman-rigged-512')), load('thief', actorUrl('adult-man-rigged-512')));
  await Promise.all(jobs);
  if (signal?.aborted) { renderer.dispose(); throw Error('aborted'); }

  // ----- street -----
  const P = balance.physics, S = balance.chase?.period || 66, streetEnd = 134, shadowTex = glowTexture('#000000');
  // v5 bends: the whole street is shifted sideways by A*sin(2*pi*x/S) in the vertex shader (uBend is 0 in the throw scene), so cars, buildings and kerbs bend together.
  const BEND_A = 1.7, bendU = {value: 0}, shiftU = {value: 0}, WAVES = ROAD_WAVES.map(w => ({w: 2 * Math.PI / (S * w.p), a: w.a, ph: w.ph})), bz = x => bendU.value * roadShape(x + shiftU.value, S), bendSprites = [];
  const bendify = root => root.traverse(o => {
    const m = o.isMesh ? o.material : null; if (!m || Array.isArray(m) || m.userData.bend || o.isSkinnedMesh || o.isPoints) return;
    m.userData.bend = true; const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r); sh.uniforms.uBend = bendU; sh.uniforms.uShift = shiftU; sh.uniforms.uW = {value: WAVES.map(w => w.w)};
      sh.vertexShader = 'uniform float uBend;\nuniform float uShift;\nuniform float uW[3];\n' + sh.vertexShader.replace('#include <project_vertex>', 'vec4 bendW = modelMatrix * vec4(transformed, 1.0); float bx = bendW.x + uShift; bendW.z += uBend * (sin(uW[0] * bx) + .7 * sin(uW[1] * bx + 1.3) + .45 * sin(uW[2] * bx + 2.6)); vec4 mvPosition = viewMatrix * bendW; gl_Position = projectionMatrix * mvPosition;');
    };
    m.customProgramCacheKey = () => 'bend2'; m.needsUpdate = true;
  });
  const asphalt = asphaltTexture(theme), road = new T.Mesh(new T.PlaneGeometry(220, 8, 220, 1), new T.MeshStandardMaterial({map: asphalt, roughness: .95}));
  road.rotation.x = -Math.PI / 2; road.position.set(35, 0, 1.2); scene.add(road);
  const tiles = tileTexture();
  const walk = new T.Mesh(new T.BoxGeometry(220, .16, 3.4, 220, 1, 1), new T.MeshStandardMaterial({map: tiles, roughness: .9}));
  walk.position.set(35, .08, -4.1); scene.add(walk);
  const front = walk.clone(); front.position.z = 6.6; front.scale.z = .6; scene.add(front);
  const plaza = new T.Mesh(new T.PlaneGeometry(220, 60, 220, 1), new T.MeshStandardMaterial({color: theme === THEMES.night ? '#1d2230' : '#7f8a74', roughness: 1}));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(35, -.01, -36); scene.add(plaza);
  const near = plaza.clone(); near.position.z = 40; scene.add(near);

  // Buildings: a deterministic row, tallest ones further back, so the street has depth.
  const order = ['apartment', 'shop', 'cafe', 'house', 'apartment', 'station', 'shop', 'cafe', 'apartment', 'house'];
  const rowKeys = level.decor === 'downtown' || level.decor === 'harbor' ? ['apartment', 'apartment', 'shop', 'apartment', 'cafe', 'apartment', 'station', 'apartment'] : level.decor === 'avenue' ? ['shop', 'apartment', 'cafe', 'station', 'house', 'apartment', 'shop'] : order;
  // The street repeats every S metres, so the car chase can scroll forever by shifting the dynamic things back by S.
  const period = (keys, height, z, gap, stageSeed) => {
    const row = []; let w = 0, i = stageSeed % keys.length;
    while (true) {
      const key = keys[i++ % keys.length], size = fitModel(models[key], {height: BUILDINGS[key].h * height}).userData.size.x;
      if (w + size + gap > S && row.length > 3) break;
      row.push({key, size}); w += size + gap;
    }
    const slack = (S - w) / row.length; let x = 0;
    for (const r of row) { r.x = x + r.size / 2; x += r.size + gap + slack; }
    for (let k = -1; k <= 1; k++) for (const r of row) {
      const root = fitModel(models[r.key], {height: BUILDINGS[r.key].h * height}); root.position.set(r.x + k * S, 0, z - (r.key === 'apartment' && height === 1 ? 1.4 : 0)); scene.add(root);
    }
  };
  period(rowKeys, 1, -11.5, .8, level.stage * 3);
  period(rowKeys, 1.5, -27, 3, 2);
  // street trees and lamps along the near edge of the far sidewalk
  const lamps = [], glowTex = glowTexture('#ffd58a');
  for (let x = -8 - S; x < streetEnd; x += 11) {
    const lamp = fitModel(models.lamp, {height: 5.4}); lamp.position.set(x, .16, -3.1); scene.add(lamp);
    if (theme.lamps) {
      const s = new T.Sprite(new T.SpriteMaterial({map: glowTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false})); s.scale.set(3.6, 3.6, 1); s.position.set(x, 5.3, -3); scene.add(s); bendSprites.push({o: s, z0: -3});
      const pool = new T.Mesh(new T.CircleGeometry(3, 24), new T.MeshBasicMaterial({map: glowTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: .55})); pool.rotation.x = -Math.PI / 2; pool.position.set(x, .2, -2.6); scene.add(pool); lamps.push(s);
    }
    if ((Math.round((x + 8) / 11) % 3 + 3) % 3 === 1) { const tree = fitModel(models.tree, {height: 6.4}); tree.position.set(x + 5, .16, -4.6); scene.add(tree); }
    else if ((Math.round((x + 8) / 11) % 3 + 3) % 3 === 2) { const bush = fitModel(models.bush, {width: 2}); bush.position.set(x + 4, .16, -5.2); scene.add(bush); }
  }
  // obstacles, drawn in front of the thief's line so he stands behind them
  const obstacleViews = [];
  for (const o of level.obstacles) {
    const spec = o.model === 'tree' ? {height: 6.4} : o.model === 'lamp' ? {height: o.h} : o.model === 'roadblock' && arch ? {depth: (o.zw || 1.3) * 2} : {width: o.w};
    const root = fitModel(models[o.model], spec);
    root.position.set(o.x, 0, arch ? ZC + (o.z || 0) : o.model === 'tree' || o.model === 'lamp' ? -.1 : .55); scene.add(root); obstacleViews.push(root);
    if (o.model !== 'tree' && o.model !== 'lamp') { const sh = blobShadow(shadowTex, root.userData.size.x * 1.15, root.userData.size.z * 1.6, .45); sh.position.set(o.x, .03, arch ? ZC + (o.z || 0) : .55); scene.add(sh); }
  }
  // the police car that brought the officer, parked behind him
  const squad = rigCar(fitModel(models.policeCar, {width: 4.4})); lightOn(squad.userData.lights.Light_R, true); lightOn(squad.userData.lights.Light_B, true); squad.position.set(-5.6, 0, 2.6); squad.visible = !arch; squad.rotation.y = .12; scene.add(squad);
  // the getaway car waiting at the end of the street
  const getaway = fitModel(models.getawayCar, {width: 4.2}); getaway.position.set(P.escapeX + 2.4, 0, arch ? ZC : .3); scene.add(getaway);
  let getawayX = getaway.position.x;

  // ----- actors -----
  const officer = createActor(models.officer, {height: 1.7, role: 'officer', tint: {torso: [.2, .38, .75], forearm: [.2, .38, .75], legs: [.07, .1, .22], shoes: [.08, .08, .1]}});
  const thief = createActor(models.thief, {height: 1.82, role: 'thief', tint: {torso: [.1, .1, .12], forearm: [.1, .1, .12], legs: [.2, .21, .25], shoes: [.9, .9, .9]}});
  officer.root.position.set(0, 0, ZC); thief.root.position.set(level.dist, 0, arch ? ZC : -.25);
  scene.add(officer.root, thief.root);
  const mat = (color, extra = {}) => new T.MeshStandardMaterial({color, roughness: .7, ...extra});
  // Cap and badge on the officer; beanie, mask and a sack on every thief.
  {
    const cap = new T.Group(), dome = new T.Mesh(new T.SphereGeometry(.118, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#14234a')), visor = new T.Mesh(new T.BoxGeometry(.2, .012, .1), mat('#0b1226')), band = new T.Mesh(new T.CylinderGeometry(.12, .12, .028, 18), mat('#d9b44a'));
    dome.position.y = .15; visor.position.set(0, .165, .115); band.position.y = .158; cap.add(dome, visor, band); officer.attach('Head', cap);
    const badge = new T.Mesh(new T.CylinderGeometry(.03, .03, .008, 12), mat('#e8c352', {metalness: .6, roughness: .3})); badge.rotation.x = Math.PI / 2; badge.position.set(.07, 0, .12);
    officer.attach('Spine2', badge);
  }
  const THIEF_TINTS = [[.1, .1, .12], [.34, .06, .07], [.06, .2, .12]];
  const dressThief = actor => {
    const beanie = new T.Mesh(new T.SphereGeometry(.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#101114')); beanie.position.y = .15;
    const maskGeo = new T.SphereGeometry(.118, 18, 10, -Math.PI / 2.2, Math.PI / 1.1, Math.PI * .56, Math.PI * .22), mask = new T.Mesh(maskGeo, mat('#0d0e10', {side: T.DoubleSide})); mask.rotation.y = Math.PI / 2; mask.position.set(0, .1, .02);
    const sack = new T.Mesh(new T.SphereGeometry(.17, 14, 10), mat('#a07a3d')); sack.scale.set(.9, 1.1, .9); sack.position.set(.04, -.1, 0);
    const tie = new T.Mesh(new T.ConeGeometry(.05, .09, 8), mat('#8c6a32')); tie.position.set(.04, .05, 0); sack.add(tie);
    const sackHolder = new T.Group(); sackHolder.add(sack);
    actor.attach('Head', beanie); actor.attach('Head', mask); actor.attach('LeftHand', sackHolder); actor.sack = sackHolder;
  };
  dressThief(thief);
  officer.root.add(blobShadow(shadowTex, 1.4, 1.1, .5));
  const thieves = [{actor: thief, shadow: blobShadow(shadowTex, 1.4, 1.1, .5), dodge: 0, stagger: 0}];
  thief.root.add(thieves[0].shadow);
  const crewSize = v2 ? (level.crew || 1) : 1;
  for (let i = 1; i < crewSize; i++) {
    const t = THIEF_TINTS[i % THIEF_TINTS.length];
    const a = createActor(models.thief, {height: 1.78 + i * .03, role: 'thief', tint: {torso: t, forearm: t, legs: [.2, .21, .25], shoes: [.9, .9, .9]}});
    dressThief(a); a.root.visible = false; scene.add(a.root);
    const sh = blobShadow(shadowTex, 1.4, 1.1, .5); a.root.add(sh); thieves.push({actor: a, shadow: sh, dodge: 0, stagger: 0});
  }
  // the boss arrives with his armoured van, parked right behind him
  const bossVan = v2 && level.boss ? fitModel(models.van, {width: 5.4}) : null;
  if (bossVan) scene.add(bossVan);
  // crossing cars of the later stages (their positions come from the engine clock)
  const moverViews = movers.map(m => { const r = fitModel(models[m.model], {width: m.w}); r.position.set(m.x, 0, arch ? ZC + (m.z || 0) : .55); scene.add(r); return {spec: m, root: r}; });

  // ----- projectile, preview, effects -----
  const netTex = netTexture(), starTex = starTexture(), dotTex = canvasTexture(64, 64, g => { g.fillStyle = '#7fd4ff55'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.fillStyle = '#9fe4ff'; g.beginPath(); g.arc(32, 32, 17, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 9, 0, 7); g.fill(); });
  const projectile = new T.Group(); projectile.visible = false; scene.add(projectile);
  const netMat = new T.MeshBasicMaterial({map: netTex, transparent: true, alphaTest: .2, side: T.DoubleSide, depthWrite: false, color: '#f6f9ff'});
  const net = new T.Mesh(new T.SphereGeometry(1, 16, 10), netMat); projectile.add(net);
  const knot = new T.Mesh(new T.SphereGeometry(.1, 10, 8), mat('#d8dde8', {metalness: .5, roughness: .35})); projectile.add(knot);
  const loop = new T.Mesh(new T.TorusGeometry(1, .035, 8, 28), mat('#c79a4e')); loop.visible = false; projectile.add(loop);
  const ropeLine = new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length: 14}, () => new T.Vector3())), new T.LineBasicMaterial({color: '#d9b574'})); ropeLine.frustumCulled = false; ropeLine.visible = false; scene.add(ropeLine);
  const trail = new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length: 18}, () => new T.Vector3())), new T.LineBasicMaterial({color: '#ffffff', transparent: true, opacity: .55})); trail.frustumCulled = false; trail.visible = false; scene.add(trail);
  const trailPts = [];
  const dots = []; const dotGroup = new T.Group(); scene.add(dotGroup);
  for (let i = 0; i < 42; i++) { const s = new T.Sprite(new T.SpriteMaterial({map: dotTex, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, color: '#8fdcff', fog: false})); s.renderOrder = 8; s.visible = false; dotGroup.add(s); dots.push(s); }
  const mark = new T.Mesh(new T.RingGeometry(.28, .4, 24), new T.MeshBasicMaterial({color: '#ff6a5c', transparent: true, depthTest: false, side: T.DoubleSide})); mark.renderOrder = 9; mark.visible = false; scene.add(mark);
  const landRing = new T.Mesh(new T.RingGeometry(.42, .58, 32), new T.MeshBasicMaterial({color: '#ffd37a', transparent: true, opacity: .9, depthTest: false, side: T.DoubleSide})); landRing.renderOrder = 9; landRing.visible = false; scene.add(landRing);
  const sparks = new Particles(scene, {texture: starTex, size: .55, additive: true}), dust = new Particles(scene, {texture: glowTexture('#c9b79a'), size: 1.1, additive: false, max: 60});
  for (const ps of [sparks, dust]) { const emit = ps.emit.bind(ps); ps.emit = (x, y, z, ...r) => emit(x, y, mode === 'chase' ? z + bz(x) : z, ...r); } // chase effects follow the bent road
  const caughtNets = thieves.map(() => { const n = new T.Mesh(new T.SphereGeometry(1, 18, 12), netMat.clone()); n.visible = false; n.userData = {t: 0, fade: 0, scale: 1}; scene.add(n); return n; });
  const flash = new T.Sprite(new T.SpriteMaterial({map: glowTexture('#ffffff'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false, fog: false})); flash.visible = false; flash.renderOrder = 10; scene.add(flash);
  const groundNet = new T.Mesh(new T.CircleGeometry(1, 20), new T.MeshBasicMaterial({map: netTex, transparent: true, alphaTest: .2, side: T.DoubleSide, depthWrite: false})); groundNet.rotation.x = -Math.PI / 2; groundNet.visible = false; scene.add(groundNet);

  // ----- camera -----
  const cam = {x: 4, d: 20, shake: 0, focus: [-1.5, level.dist + 3]};
  const look = new T.Vector3(), tmp = new T.Vector3();
  function resize() {
    const parent = canvas.parentElement, w = Math.max(2, parent?.clientWidth || 844), h = Math.max(2, parent?.clientHeight || 390);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; observer?.observe(canvas.parentElement || canvas);
  const hfov = () => 2 * Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  function frameCamera(dt, snap) {
    if (arch) { archFrame(dt); return; }
    let [l, r] = cam.focus, s = engine.state;
    const t0 = engine.clock;
    const c = engine.criminalAt(t0);
    if (s.phase === 'flight' && snap.flightPoint) {
      r = Math.max(r, snap.flightPoint.x + 1.5);
      const fn = engine.flightNow();
      if (fn && fn.share > .55) { const lo = Math.min(fn.x, c.x) - 3.2, hi = Math.max(fn.x, c.x) + 3.2; l = Math.max(l, lo); r = Math.min(r, hi); }
    }
    if (s.phase === 'impact' || s.phase === 'caught') { const f = s.flight; const fx = f?.catchX ?? f?.contact?.x ?? c.x; l = fx - (s.phase === 'caught' ? 3.2 : 5); r = fx + (s.phase === 'caught' ? 3.2 : 5); }
    else if (s.phase === 'flee' || s.phase === 'escape') { l = Math.max(-1.5, c.x - 9); r = c.x + 4; }
    else if (s.phase === 'aim' || s.phase === 'throw') { l = -2; r = s.baseX + (engine.level.move?.amp || 0) + 3.2; }
    // Far thieves: keep the characters readable by letting the officer slide off the left edge.
    if (r - l > 23) l = r - 23;
    const span = Math.max(10, r - l + 1.5), d = (span / 2) / Math.tan(hfov() / 2);
    cam.x = damp(cam.x, (l + r) / 2, 3.2, dt); cam.d = damp(cam.d, d, 3.2, dt);
    cam.shake = Math.max(0, cam.shake - dt * 2.2);
    const sh = cam.shake * cam.shake * .6, ts = performance.now() / 1000;
    camera.position.set(cam.x - cam.d * .26 + Math.sin(ts * 47) * sh * .5, 3.1 + cam.d * .12 + Math.cos(ts * 53) * sh * .4, cam.d * .92 + 1);
    look.set(cam.x + cam.d * .04, 1.55, 0);
    applyHandoff(dt, 30);
  }
  function applyHandoff(dt, fovTo) {
    if (handoff) { // chase -> throw: glide from the chase camera instead of cutting
      handoff.t += dt; const k = smooth(handoff.t / .9), to = camera.position.clone();
      camera.position.lerpVectors(handoff.p, to, k); look.lerpVectors(handoff.l, look, k);
      camera.fov = handoff.fov + (fovTo - handoff.fov) * k; camera.updateProjectionMatrix(); chaseCam.fov = camera.fov;
      if (handoff.t >= .9) handoff = null;
    }
    camera.lookAt(look);
  }
  /** v5: over the officer's shoulder, looking down the street at the thief. The lens is set so the thief's whole sweep fits. */
  function archFrame(dt) {
    const s = engine.state, c = engine.criminalAt(engine.clock), fl = engine.flightNow();
    const halfW = Math.max(6.2, (engine.level.zmove?.amp || 0) + 3.8), D0 = Math.max(engine.level.dist, c.x) + 9.5;
    let fov = clamp(2 * Math.atan(Math.tan(Math.atan(halfW / D0)) / camera.aspect) * 180 / Math.PI, 14, 36);
    let lx = c.x * .86, lz = ZC;
    if (fl && fl.share > .5) { fov *= .82; lx = lerp(lx, fl.x, .45); lz = ZC + (fl.z || 0) * .5; }
    if (s.phase === 'impact' || s.phase === 'caught') { fov *= .8; lz = ZC + (c.z || 0) * .7; }
    cam.fovA = damp(cam.fovA ?? fov, fov, 3.2, dt); cam.lx = damp(cam.lx ?? lx, lx, 3.2, dt); cam.lz = damp(cam.lz ?? lz, lz, 3.2, dt);
    cam.shake = Math.max(0, cam.shake - dt * 2.2);
    const sh = cam.shake * cam.shake * .6, ts = performance.now() / 1000;
    if (!handoff) { camera.fov = cam.fovA; camera.updateProjectionMatrix(); }
    camera.position.set(-9.5 + Math.sin(ts * 47) * sh * .5, 3.5 + Math.cos(ts * 53) * sh * .4, ZC + .6);
    look.set(cam.lx, 1.15, cam.lz);
    applyHandoff(dt, cam.fovA);
  }
  const project = (x, y, z = 0) => { tmp.set(x, y, z).project(camera); return {x: (tmp.x * .5 + .5) * canvas.clientWidth, y: (-tmp.y * .5 + .5) * canvas.clientHeight, visible: tmp.z < 1}; };

  // ----- per-frame -----
  let flightFrom = null, lastFlight = null, caughtAt = null, escapeCarStart = null, groundTimer = 0, lastThiefX = level.dist;
  const toolOf = id => engine.tools.find(t => t.id === id);
  function flightPoint(f) {
    const t = clamp(engine.clock - f.t0, 0, f.duration), p = f.path;
    let i = 0; while (i < p.length - 2 && p[i + 1].t < t) i++;
    const a = p[i], b = p[i + 1] || a, u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    return {x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * u, t, vx: (b.x - a.x) / Math.max(1e-4, b.t - a.t), vy: (b.y - a.y) / Math.max(1e-4, b.t - a.t)};
  }
  function drawPreview(show) {
    const pr = show ? engine.preview() : null, points = pr?.points || [];
    dots.forEach((d, i) => {
      const k = points.length > 1 ? i / (dots.length - 1) * (points.length - 1) : 0, a = points[Math.floor(k)], b = points[Math.min(points.length - 1, Math.floor(k) + 1)];
      if (!show || !a || !b || points.length < 2) { d.visible = false; return; }
      const u = k - Math.floor(k); d.visible = true;
      d.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, arch ? ZC + (a.z || 0) + ((b.z || 0) - (a.z || 0)) * u : .9);
      const fade = 1 - i / dots.length * .55; d.material.opacity = fade; d.scale.setScalar(.34 * (1 - i / dots.length * .35));
    });
    if (pr && pr.blocked && pr.fraction >= 1) { mark.visible = true; mark.position.set(pr.land.x, pr.land.y, arch ? ZC + (pr.land.z || 0) : .95); mark.lookAt(camera.position); } else mark.visible = false;
    if (pr && pr.help >= 1 && pr.land) { // early stages: where the net comes down; green = it would catch (aimHelp 2)
      landRing.visible = true; if (arch) { landRing.position.set(pr.land.x, .06, ZC + (pr.land.z || 0)); landRing.rotation.set(-Math.PI / 2, 0, 0); } else { landRing.position.set(pr.land.x, Math.max(.12, pr.land.y), .95); landRing.lookAt(camera.position); }
      landRing.material.color.set(pr.hit ? '#7dffb0' : '#ffd37a'); landRing.scale.setScalar(pr.hit ? 1.25 + Math.sin(performance.now() / 120) * .12 : 1);
    } else landRing.visible = false;
  }
  function placeNet(f, fp) {
    const tool = toolOf(f.tool), R = tool.radius, open = smooth((fp.t / Math.max(.3, f.duration)) * 1.8);
    const fz = arch ? ZC + (fp.z || 0) : .15; projectile.visible = true; projectile.position.set(fp.x, fp.y, fz);
    const isRope = f.tool === 'rope';
    net.visible = !isRope; loop.visible = isRope; knot.visible = !isRope;
    if (isRope) {
      loop.scale.setScalar(.2 + R * open * 1.1); loop.rotation.z = Math.atan2(fp.vy, fp.vx); loop.rotation.y = .5 * (1 - open); loop.rotation.x = 0;
    } else {
      const s = .13 + R * 1.05 * open; net.scale.set(s, s * .95, s); net.rotation.x += .1; net.rotation.y += .13;
    }
    trailPts.push(new T.Vector3(fp.x, fp.y, fz)); if (trailPts.length > 18) trailPts.shift();
    const pos = trail.geometry.attributes.position; for (let i = 0; i < 18; i++) { const p = trailPts[Math.max(0, trailPts.length - 18 + i)] || trailPts[0]; pos.setXYZ(i, p.x, p.y, p.z); } pos.needsUpdate = true; trail.visible = !isRope;
    if (isRope) {
      const hand = officer.handWorld(), rp = ropeLine.geometry.attributes.position;
      for (let i = 0; i < 14; i++) { const u = i / 13, sag = Math.sin(u * Math.PI) * -.25 * (1 - open * .6); rp.setXYZ(i, hand.x + (fp.x - hand.x) * u, hand.y + (fp.y - hand.y) * u + sag, fz + (hand.z - fz) * (1 - u)); } rp.needsUpdate = true; ropeLine.visible = true;
    } else ropeLine.visible = false;
  }
  function endFlight() { projectile.visible = false; trail.visible = false; ropeLine.visible = false; trailPts.length = 0; }

  // ----- car chase scene (v2) -----
  const throwStuff = [officer.root, ...thieves.map(t => t.actor.root), squad, getaway, ...obstacleViews, ...moverViews.map(m => m.root), ...(bossVan ? [bossVan] : []), dotGroup, mark];
  const chaseGroup = new T.Group(); chaseGroup.visible = false; scene.add(chaseGroup);
  let handoff = null, chase = null, mode = 'throw', chaseShift = 0, chaseCam = {x: 0, fov: 30}, sirenPhase = 0, crimBrake = 1, chaseEnded = 0;
  const carGlow = (color, size) => { const sp = new T.Sprite(new T.SpriteMaterial({map: glowTexture(color), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false})); sp.scale.set(size, size, 1); return sp; };
  const playerCar = rigCar(fitModel(models.policeCar, {width: 4.4})), crimCar = rigCar(fitModel(models.getawayCar, {width: 4.2}));
  chaseGroup.add(playerCar, crimCar);
  const flameP = carGlow('#ffb347', 2.6), flameC = carGlow('#ff8a3d', 2.2), redLight = carGlow('#ff3b3b', 1.3), blueLight = carGlow('#3b6bff', 1.3);
  flameP.position.set(-2.6, .55, 0); flameC.position.set(-2.4, .55, 0); redLight.position.set(.2, 1.65, -.35); blueLight.position.set(.2, 1.65, .35);
  playerCar.add(flameP, redLight, blueLight); crimCar.add(flameC);
  playerCar.add(blobShadow(shadowTex, 5, 2.4, .5).translateY(-.0)); crimCar.add(blobShadow(shadowTex, 5, 2.4, .5));
  const chaseProps = new Map(), propPool = {};
  const coneMat = mat('#ff6a1f'), padMat = new T.MeshBasicMaterial({map: glowTexture('#7dffb0'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: .9});
  function makeProp(o) {
    let root;
    if (o.kind === 'traffic') root = fitModel(models[o.model], {width: o.model === 'bus' ? 7.5 : o.model === 'truck' ? 5.6 : 4.4});
    else if (o.kind === 'barrier') root = fitModel(models.roadblock, {depth: 2.8});
    else if (o.kind === 'cone') { root = new T.Group(); for (let i = 0; i < 3; i++) { const c = fitModel(models.cone, {height: .75}); c.position.set((i - 1) * .5, 0, (i % 2) * .3); root.add(c); } }
    else { root = new T.Mesh(new T.CircleGeometry(1.5, 24), padMat); root.rotation.x = -Math.PI / 2; root.position.y = .04; const holder = new T.Group(); holder.add(root); root = holder; }
    if (arch) bendify(root);
    chaseGroup.add(root); return root;
  }
  const laneZ = lat => balance.chase.laneCenter + lat * balance.chase.laneWidth;
  const chaseLights = new T.PointLight('#ffffff', 0, 0);
  function enterChase(ch) {
    chase = ch; mode = 'chase'; chaseGroup.visible = true; chaseEnded = 0; crimBrake = 1;
    for (const o of throwStuff) o.visible = false;
    for (const t of thieves) t.actor.root.visible = false;
    for (const n of caughtNets) n.visible = false;
    groundNet.visible = false; projectile.visible = false; trail.visible = false; ropeLine.visible = false;
    chaseCam.x = (ch.state.x || 0) + 5.5; handoff = null; bendU.value = arch ? BEND_A * (ch.spec?.curve || 0) : 0;
  }
  function leaveChase() {
    handoff = {p: camera.position.clone(), l: look.clone(), fov: camera.fov, t: 0}; bendU.value = 0; for (const b of bendSprites) b.o.position.z = b.z0;
    mode = 'throw'; chase = null; chaseGroup.visible = false;
    for (const o of throwStuff) o.visible = true; squad.visible = !arch;
    thieves.forEach((t, i) => { t.actor.root.visible = i === 0; });
    for (const [, p] of chaseProps) chaseGroup.remove(p.root);
    chaseProps.clear();
    cam.x = 4; cam.d = 20; cam.shake = 0;
  }
  function updateChase(dt) {
    const st = chase.state, C = balance.chase;
    chaseShift = Math.floor(st.x / S) * S; shiftU.value = chaseShift;
    const px = st.x - chaseShift, cx = st.crim.x - chaseShift;
    sirenPhase += dt * 9;
    playerCar.position.set(px, 0, laneZ(st.lat)); playerCar.rotation.y = -st.steer * .28; playerCar.rotation.z = -(st.boosting ? .03 : 0);
    const brake = st.phase === 'end' ? (crimBrake = Math.max(0, crimBrake - dt * 1.4)) : 1, caught = st.outcome === 'caught';
    crimCar.position.set(cx + (1 - brake) * 3, 0, laneZ(st.crim.lat));
    const skid = caught ? (1 - brake) * 1.1 : 0;
    crimCar.rotation.y = -clamp((st.crim.targetLat - st.crim.lat) * .5, -.3, .3) - skid; crimCar.rotation.z = Math.sin(sirenPhase * 2.3) * st.damage * .03;
    // a battered car smokes, more the more it has taken
    if (st.damage > .2 && Math.random() < st.damage * .7) dust.emit(cx + 1.2, 1.0, laneZ(st.crim.lat), 1, {speed: 1, up: 1.6, color: [.5, .5, .5], gravity: -1.2, life: .9});
    flameP.visible = st.boosting; flameP.scale.setScalar(2 + Math.sin(sirenPhase * 3) * .4); flameC.visible = st.crim.boostLeft > 0; flameC.scale.setScalar(1.8 + Math.sin(sirenPhase * 3) * .35);
    const red = Math.sin(sirenPhase) > 0; redLight.visible = blueLight.visible = false; lightOn(playerCar.userData.lights.Light_R, red); lightOn(playerCar.userData.lights.Light_B, !red);
    spinWheels(playerCar, st.v * dt / .36); spinWheels(crimCar, st.crim.v * dt / .34);
    // obstacles inside the window around the officer
    const lo = st.x - 30, hi = st.x + 85, tn = st.t;
    for (const o of chase.obstacles) {
      const ox = chase.obstacleX(o, tn), inside = ox > lo && ox < hi, entry = chaseProps.get(o.id);
      if (inside && !entry) chaseProps.set(o.id, {root: makeProp(o), o});
      else if (!inside && entry) { chaseGroup.remove(entry.root); chaseProps.delete(o.id); }
    }
    for (const [, e] of chaseProps) { const o = e.o, ox = chase.obstacleX(o, tn) - chaseShift; e.root.position.set(ox, e.root.position.y, laneZ(o.lat)); e.root.visible = !(o.kind === 'pad' && o.used); if (o.hitP || o.hitC) e.root.rotation.y = Math.sin(o.id) * .25; }
    // camera: behind and above, looking ahead; a boost pulls the lens wider
    const fovTarget = 32 + (st.boosting ? 5 : 0) + (st.v > 24 ? 1.5 : 0);
    chaseCam.fov = damp(chaseCam.fov, fovTarget, 5, dt); camera.fov = chaseCam.fov; camera.updateProjectionMatrix();
    chaseCam.x = damp(chaseCam.x, st.x + 5.5, 6, dt); const cxw = chaseCam.x - chaseShift; cam.shake = Math.max(0, cam.shake - dt * 2.2);
    const sh = cam.shake * cam.shake * .6, ts = performance.now() / 1000;
    const bzc = bz(cxw) * .9;
    camera.position.set(cxw - 14 + Math.sin(ts * 47) * sh * .4, 4.6 + Math.cos(ts * 53) * sh * .3, 13.2 + bzc);
    look.set(cxw + 2.5, 1.2, 1.6 + bz(cxw + 2.5) * .9);
    for (const b of bendSprites) b.o.position.z = b.z0 + bz(b.o.position.x); camera.lookAt(look);
    if (st.boosting && Math.random() < .6) dust.emit(px - 2.4, .3, laneZ(st.lat), 1, {speed: 2, up: .8, color: [1, .75, .4], gravity: 0, life: .35});
  }
  const dispatch = {
    chase(events) {
      for (const e of events) {
        if (e.type === 'crash') { cam.shake += .7; sparks.emit(playerCar.position.x + 2, .8, playerCar.position.z, 18, {speed: 4, up: 3, color: [1, .8, .4], life: .6}); dust.emit(playerCar.position.x + 2, .3, playerCar.position.z, 8, {speed: 3, up: 1.5, color: [.7, .65, .55], gravity: 1}); }
        else if (e.type === 'crimCrash') { cam.shake += .3; sparks.emit(crimCar.position.x, .8, crimCar.position.z, 14, {speed: 4, up: 3, color: [.8, .9, 1], life: .5}); }
        else if (e.type === 'ram') { cam.shake += .35; sparks.emit((playerCar.position.x + crimCar.position.x) / 2, .9, (playerCar.position.z + crimCar.position.z) / 2, e.side ? 22 : 12, {speed: 4, up: 2.5, color: [1, .85, .5], life: .5}); }
        else if (e.type === 'scrape') { cam.shake += .25; const side = e.side >= 0 ? 1 : -1; sparks.emit(playerCar.position.x + 1, .35, playerCar.position.z + side * 1.1, 14, {speed: 3, up: 2, color: [1, .8, .4], life: .5}); }
        else if (e.type === 'pad') sparks.emit(playerCar.position.x, .3, playerCar.position.z, 12, {speed: 2.5, up: 2.5, color: [.5, 1, .7], life: .6});
      }
    },
  };

  if (arch) bendify(scene);
  const api = {
    renderer, scene, camera, officer, thief, project, models, thieves,
    get ready() { return true; },
    get mode() { return mode; },
    shake(amount = 1) { cam.shake = Math.min(1.6, cam.shake + amount); },
    enterChase, leaveChase, handleChase(events) { dispatch.chase(events); },
    /** After the chase: the throw engine takes over the same scene. */
    bindThrow(next) { engine = next; leaveChase(); lastThiefX = engine.criminalAt(0).x; },
    handle(events, snap) {
      for (const e of events) {
        const s = engine.state, idx = Math.min(s.crimIndex, thieves.length - 1), th = thieves[idx];
        if (e.type === 'release') officer.throwNow();
        else if (e.type === 'launch') { trailPts.length = 0; }
        else if (e.type === 'catch') {
          const f = s.flight, c = f.catchX ?? e.x, net = caughtNets[idx];
          net.visible = true; net.material.opacity = 1; net.userData.t = 0; net.userData.fade = 0; th.stagger = 0;
          sparks.emit(e.x, e.y, arch ? ZC + (e.z || 0) : .5, e.perfect ? 46 : 26, {speed: 5, up: 4, color: e.perfect ? [1, .85, .3] : [.7, .9, 1], gravity: 5, life: 1.2});
          flash.visible = true; flash.position.set(c, 1.3, arch ? ZC + (e.z || 0) + .3 : .8); flash.userData.t = 0; flash.scale.setScalar(.5);
          cam.shake += e.perfect ? .9 : .55; endFlight();
        } else if (e.type === 'bossHit') { caughtNets[idx].userData.fade = .001; th.stagger = .001; cam.shake += .5; sparks.emit(th.actor.root.position.x, 1.2, arch ? th.actor.root.position.z : .3, 20, {speed: 5, up: 3, color: [1, .6, .3], life: .8}); }
        else if (e.type === 'blocked') { sparks.emit(e.x, e.y, arch ? ZC + (e.z || 0) : .6, 14, {speed: 3, up: 2.5, color: [1, .9, .7], life: .6}); dust.emit(e.x, e.y, arch ? ZC + (e.z || 0) : .4, 8, {speed: 1.5, up: 1.2, color: [.7, .65, .55], gravity: 1}); cam.shake += .25; endFlight(); groundNet.visible = false; }
        else if (e.type === 'miss' || e.type === 'hidden') {
          dust.emit(e.x, .1, arch ? ZC + (e.z || 0) : .3, 14, {speed: 2.4, up: 1.6, color: [.75, .68, .55], gravity: 2}); groundNet.visible = true; groundNet.position.set(e.x, .05, arch ? ZC + (e.z || 0) : .2);
          const R = toolOf(s.flight.tool).radius; groundNet.scale.setScalar(Math.max(.5, R * 1.1)); groundTimer = 1.4; cam.shake += e.near ? .1 : .2; endFlight();
          if (e.near && e.kind !== 'hidden') th.dodge = .001;
        }
        else if (e.type === 'crew') { const n = thieves[e.index]; if (n) { n.actor.root.visible = true; n.arrive = 0; n.fromX = e.x + 9; } }
        else if (e.type === 'turn') { groundNet.visible = false; if (!e.crew) for (let i = 0; i < caughtNets.length; i++) if (i >= s.crimIndex) caughtNets[i].visible = false; }
        else if (e.type === 'flee' || e.type === 'escape') { groundNet.visible = false; if (e.type === 'escape') escapeCarStart = null; }
      }
    },
    update(dt, snap) {
      if (mode === 'chase') { updateChase(dt); sparks.update(dt); dust.update(dt); renderer.render(scene, camera); return; }
      if (!arch && !handoff && camera.fov !== 30) { camera.fov = chaseCam.fov = 30; camera.updateProjectionMatrix(); }
      const s = engine.state, phase = s.phase, tn = engine.clock, cur = Math.min(s.crimIndex, thieves.length - 1);
      // thieves: the ones already caught stand wrapped in their nets, the current one acts, the rest are not on the street yet
      thieves.forEach((th, i) => {
        const a = th.actor, net = caughtNets[i];
        if (i < s.crimIndex) { a.root.visible = true; a.root.position.set(s.caught[i].x, 0, arch ? ZC + (s.caught[i].z || 0) : -.25); a.state.mode = 'caught'; a.update(dt); th.shadow.visible = true; return; }
        if (i > cur) { a.root.visible = false; return; }
        let c = engine.criminalAt(tn), px = c.x;
        if (th.arrive !== undefined && th.arrive < 1) { th.arrive = Math.min(1, th.arrive + dt / 1.2); px = th.fromX + (c.x - th.fromX) * smooth(th.arrive); }
        const vx = (px - (th.lastX ?? px)) / Math.max(1e-4, dt); th.lastX = px;
        a.root.position.x = px; a.state.speed = vx;
        th.dodge = th.dodge > 0 ? th.dodge + dt : 0; if (th.dodge > .9) th.dodge = 0;
        th.stagger = th.stagger > 0 ? th.stagger + dt : 0; if (th.stagger > 1.1) th.stagger = 0;
        const hop = th.dodge > 0 ? Math.sin(th.dodge / .9 * Math.PI) * .55 : 0;
        a.root.position.y = damp(a.root.position.y, c.y, 9, dt) + (hop - (th.hopPrev || 0)); th.hopPrev = hop;
        a.root.position.z = arch ? ZC + c.z : -.25 + (th.dodge > 0 ? Math.sin(th.dodge / .9 * Math.PI) * -.6 : 0);
        if (arch) { const vz = (c.z - (th.lastZ ?? c.z)) / Math.max(1e-4, dt); th.lastZ = c.z; const away = phase === 'flee' || phase === 'escape'; a.root.rotation.y = damp(a.root.rotation.y, away ? 0 : Math.PI + clamp(vz * .12, -.9, .9), 6, dt); }
        const won = phase === 'caught' || (phase === 'done' && s.won);
        a.state.mode = won ? 'caught' : th.stagger > 0 ? 'caught' : th.dodge > 0 ? 'caught' : c.mode === 'gone' ? 'run' : c.mode;
        // a thief who has just been netted pitches forward before he settles
        const t0 = won || net.visible ? net.userData.t : 9;
        a.root.rotation.z = (won || (net.visible && !net.userData.fade)) ? -.55 * Math.exp(-Math.max(0, t0 - .1) * 3.2) * smooth(t0 / .12) : th.stagger > 0 ? -.35 * Math.sin(th.stagger / 1.1 * Math.PI) : 0;
        if (phase === 'escape' && c.mode === 'gone' && i === cur) { a.root.visible = false; if (escapeCarStart == null) escapeCarStart = tn; } else a.root.visible = true;
        if (i === cur && phase === 'escape' && escapeCarStart != null) { const u = tn - escapeCarStart; getawayX = P.escapeX + 2.4 + (u * u) * 22; getaway.position.x = getawayX; }
        a.update(dt);
        th.shadow.visible = c.exposed || phase === 'caught';
        if (bossVan && i === cur) { const target = (th.arrive !== undefined && th.arrive < 1 ? px : c.x) + 3.6; bossVan.position.set(bossVan.position.x ? damp(bossVan.position.x, target, 4, dt) : target, 0, arch ? ZC - 3.1 : -1.4); }
      });
      // officer
      officer.state.aim.angle = engine.aim.angle + engine.wobbleAt(tn).angle; officer.state.aim.power = engine.aim.power;
      if (arch) { const w = engine.aimNow(); officer.root.rotation.y = damp(officer.root.rotation.y, -(w.yaw || 0) * Math.PI / 180, 14, dt); }
      officer.state.mode = phase === 'done' ? (s.won ? 'cheer' : 'dismay') : phase === 'caught' ? 'cheer' : (phase === 'flee' || phase === 'impact' || phase === 'rearm') && !s.won ? (s.throwsLeft > 0 && (phase === 'flee' || phase === 'rearm') ? 'wait' : 'aim') : 'aim';
      if (phase === 'escape') officer.state.mode = 'dismay';
      officer.update(dt);
      // crossing cars
      for (const m of moverViews) { const o = engine.obstacleAt(m.spec, tn); m.root.position.x = o.x; m.root.rotation.y = m.spec.v < 0 ? Math.PI : 0; }
      // projectile
      const f = s.flight;
      if (phase === 'flight' && f) { const fp = flightPoint(f); snap.flightPoint = fp; placeNet(f, fp); } else if (phase !== 'throw') { if (phase !== 'impact') endFlight(); }
      drawPreview(phase === 'aim' && !snap.hidePreview);
      // caught nets hug their thief; a boss shakes his net off
      caughtNets.forEach((net, i) => {
        if (!net.visible) return;
        const th = thieves[i], R = toolOf(f?.tool || engine.tools[0].id).radius;
        net.userData.t += dt; const k = smooth(net.userData.t / .35);
        if (net.userData.fade) { net.userData.fade += dt; net.material.opacity = Math.max(0, 1 - net.userData.fade / .6); net.userData.scale = 1 + net.userData.fade * 1.6; if (net.userData.fade > .6) { net.visible = false; return; } }
        net.position.set(th.actor.root.position.x, 1.0, th.actor.root.position.z + .05);
        const sc = net.userData.scale || 1;
        net.scale.set((.2 + (.62 + R * .5) * k) * sc, (.25 + (1.05 + R * .35) * k) * sc, (.2 + (.62 + R * .5) * k) * sc);
      });
      if (flash.visible) { flash.userData.t += dt; const k = flash.userData.t / .55; flash.scale.setScalar(.5 + k * 5.5); flash.material.opacity = Math.max(0, 1 - k); if (k >= 1) flash.visible = false; }
      if (groundNet.visible) { groundTimer -= dt; groundNet.material.opacity = clamp(groundTimer / .6, 0, 1); if (groundTimer <= 0) groundNet.visible = false; }
      for (const l of lamps) l.material.opacity = .85 + Math.sin(tn * 3 + l.position.x) * .08;
      sparks.update(dt); dust.update(dt);
      frameCamera(dt, snap);
      renderer.render(scene, camera);
    },
    focusAim() { cam.focus = [-2, engine.criminalAt(engine.clock).x + 3.2]; },
    resize,
    dispose() {
      observer?.disconnect();
      scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) for (const mm of Array.isArray(m) ? m : [m]) { mm.map?.dispose?.(); mm.dispose?.(); } });
      officer.dispose(); for (const t of thieves) t.actor.dispose();
      renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
  return api;
}
