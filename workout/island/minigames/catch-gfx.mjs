import * as T from '../vendor/three.module.js';

/** v6 "תפוס את הפושע": the Three.js helpers of catch-view.mjs (v5), extracted unchanged so the v6 modules
 * (catch-view6.mjs, catch-bow-view.mjs, catch-tyre-fx.mjs) share them without touching the v5 view.
 * Textures are drawn on canvases (no image files), models are fitted by width/height/depth and stood on y = 0. */

export const FILES = {
  apartment: 'apartment', shop: 'shop', cafe: 'cafe', house: 'house', station: 'police-station',
  taxi: 'taxi', truck: 'truck', bus: 'bus', roadblock: 'roadblock', policeCar: 'police-car', van: 'armored-van', bush: 'bush', cone: 'cone', getawayCar: 'getaway-car', tree: 'tree', lamp: 'lamp',
};
export const BUILDINGS = {apartment: {h: 11}, shop: {h: 6}, cafe: {h: 6.2}, house: {h: 5}, station: {h: 7.2}};
export const THEMES = {
  day: {top: '#4aa6ea', mid: '#9ad2f2', bottom: '#e9f6ff', fog: '#cfe7f5', near: 38, far: 150, hemi: ['#ffffff', '#8c9490', 1.25], sun: ['#fff0d2', 2.6, [-12, 18, 14]], road: '#3f434b', lamps: false, stars: false, sunDisc: '#fff6d8'},
  dusk: {top: '#34428d', mid: '#e8836b', bottom: '#ffc58a', fog: '#e3a081', near: 30, far: 130, hemi: ['#ffd9b0', '#5b4f66', 1.05], sun: ['#ffae66', 2.4, [26, 7, 12]], road: '#383a44', lamps: true, stars: false, sunDisc: '#ffe1a8'},
  night: {top: '#050a1d', mid: '#0f1c47', bottom: '#2b3d78', fog: '#101b3b', near: 24, far: 110, hemi: ['#5b72b8', '#161a2b', .95], sun: ['#9ab8ff', 1.1, [-10, 16, 12]], road: '#2b2e38', lamps: true, stars: true, sunDisc: '#dfe8ff'},
};
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
export const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

export function canvasTexture(w, h, draw, {repeat, srgb = true} = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); if (srgb) t.colorSpace = T.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4; return t;
}
export function skyTexture(theme) {
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
export function asphaltTexture(theme) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = theme.road; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); g.fillStyle = `rgba(0,0,0,${Math.random() * .07})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#e9dca0'; g.fillRect(40, h * .5 - 3, 180, 6);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, 10, w, 4); g.fillRect(0, h - 14, w, 4);
  }, {repeat: [20, 1]});
}
export function tileTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#b8b3a6'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(70,66,58,.45)'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, {repeat: [50, 1]});
}
export function glowTexture(color = '#ffffff') {
  return canvasTexture(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, color); r.addColorStop(.35, color + '88'); r.addColorStop(1, color + '00'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
}
export function starTexture() {
  return canvasTexture(64, 64, (g) => { g.translate(32, 32); g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 9 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); });
}
export function netTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#f4f7ff'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); }
  }, {repeat: [3, 2]});
}
export function blobShadow(texture, w, d, opacity = .5) {
  const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({map: texture, transparent: true, opacity, depthWrite: false}));
  m.rotation.x = -Math.PI / 2; m.position.y = .02; m.renderOrder = 1; return m;
}

/** Fits a loaded model: scale by width (x) or height, stand it on y = 0, centre it on x. */
export function fitModel(gltf, {width, height, depth}) {
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
export function rigCar(root) {
  const wheels = [], lights = {}; root.traverse(o => {
    if (/^Wheel_/.test(o.name)) wheels.push(o);
    if (o.name === 'Light_R' || o.name === 'Light_B') {
      lights[o.name] = o; o.traverse(m => { if (m.isMesh) m.material = m.material.clone(); });
    }
  });
  root.userData.wheels = wheels; root.userData.lights = lights; return root;
}
export function lightOn(node, on) { node?.traverse(m => { if (m.isMesh && m.material) m.material.emissiveIntensity = on ? 3 : .15; }); }
export function spinWheels(root, d) { for (const w of root.userData.wheels || []) w.rotation.x += d; }

export class Particles {
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

