import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js?v=island-v2-20261107-12';
import {THEME_LOOKS,ALPINE_THEME_ASSETS} from './alpine-league-theme.mjs?v=island-v2-20261107-12';

/** Ski league v23: the look of a theme on top of the regular ski view (loaded by alpine-view.mjs only for a league stage).
 * Interim until the Codex theme kits land: colour grading of the scene (fog, sky and sun light, exposure, snow, rocks, the props'
 * shared palette), a tinted backplate from the theme's background file, and a few code-only layers: an aurora sky shader (night),
 * embers and a far orange glow (volcano: scenery only, no lava on the course), close ice walls from the alpine-world pack and
 * sparkles (ice cave), soft clouds below the run (peak), village houses from the city models and warm lanterns (village).
 * Nothing here touches physics, colliders or scoring; every layer that fails is skipped. */
const assetUrl = path => new URL('../' + path, import.meta.url).href;
const canvasTexture = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
const softDot = () => canvasTexture(64, 64, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); });

export function themeOf(id) { return THEME_LOOKS[id] ? {id, ...THEME_LOOKS[id], assets: ALPINE_THEME_ASSETS[id]} : null; }

/** Lights, fog and exposure, in place, right after the view set them up (fog distances keep the game's reading distance: >= 45 / 150 m). */
export function gradeLights(theme, {scene, renderer, hemi, sun, look}) {
  const g = theme.grade;
  look.fog = g.fog; scene.fog?.color.set(g.fog);
  if (theme.visual.fogNear && scene.fog) { scene.fog.near = look.fogNear = Math.max(34, theme.visual.fogNear); }
  if (theme.visual.fogFar && scene.fog) { scene.fog.far = look.fogFar = Math.max(150, theme.visual.fogFar); }
  hemi.color.set(g.hemiSky); hemi.groundColor.set(g.hemiGround); sun.color.set(g.sun); sun.intensity *= g.sunScale; renderer.toneMappingExposure = g.exposure;
}
/** Snow, rocks and the like: each [material, grade key, share] is multiplied toward the grade colour by `share`. */
export function tintMaterials(theme, materials) {
  const white = new T.Color('#ffffff');
  for (const [material, key, share] of materials) if (material?.color) material.color.multiply(white.clone().lerp(new T.Color(theme.grade[key]), share));
}

/** Theme backplate: the theme's background image, multiplied by the grade's backplate colour and lifted. Replaces what
 * env.backgroundFor() returns (the env keeps its own texture until the tinted one is ready). Returns a disposer. */
export function themeBackplate(theme, env) {
  if (!env?.backgroundFor) return () => {};
  const original = env.backgroundFor.bind(env), made = {}, pending = {}, loader = new T.ImageLoader(), g = theme.grade;
  let dead = false;
  function tint(image) {
    const scale = Math.min(1, 1280 / image.width), w = Math.round(image.width * scale), h = Math.round(image.height * scale);
    return canvasTexture(w, h, (ctx) => {
      ctx.drawImage(image, 0, 0, w, h);
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = g.backplate; ctx.fillRect(0, 0, w, h);
      if (g.lift) { ctx.globalCompositeOperation = 'screen'; const v = Math.round(g.lift * 255); ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, 0, w, h); }
      ctx.globalCompositeOperation = 'source-over';
    });
  }
  env.backgroundFor = aspect => {
    const kind = aspect < 1 ? 'portrait' : 'landscape';
    if (made[kind]) return made[kind];
    if (!pending[kind] && !dead) pending[kind] = loader.loadAsync(assetUrl(theme.assets.background[kind])).then(image => {
      if (dead) return; const t = tint(image); t.generateMipmaps = false; t.minFilter = t.magFilter = T.LinearFilter; made[kind] = t;
    }).catch(() => {});
    return original(aspect);
  };
  return () => { dead = true; env.backgroundFor = original; for (const t of Object.values(made)) t.dispose(); };
}

/** The palette shared by trees, rocks, fences and signs of the design world, nudged toward the theme (half way from white). */
export function tintPalette(theme, palette) { if (palette?.color) palette.color.copy(new T.Color('#ffffff').lerp(new T.Color(theme.grade.foliage), .55)); }

/** Code-only layers of a theme. ctx: {scene, course, place, worldPoint, terrainY, frameAt, deckEdge, mobile, reduced, designWorld, isDisposed}. */
export async function createThemeLayers(theme, ctx) {
  const layers = [], own = {geo: new Set(), mat: new Set(), tex: new Set()}, keep = (set, x) => (set.add(x), x);
  const {scene} = ctx, camPos = new T.Vector3(), fwd = new T.Vector3(), up = new T.Vector3(), tmp = new T.Vector3();
  const dummy = new T.Object3D(); let quality = 'high';
  const add = (o, perf = 'theme') => { o.userData.perf = perf; scene.add(o); return o; };
  for (const id of theme.layers) {
    try { const layer = await LAYERS[id]?.({...ctx, theme, own, keep, add, dummy, camPos, fwd, up, tmp}); if (layer) layers.push({id, ...layer}); } catch {}
    if (ctx.isDisposed?.()) break;
  }
  return {
    update(ps, camera, dt, time) {
      camera.getWorldPosition(camPos); camera.getWorldDirection(fwd); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      for (const l of layers) l.update?.(ps, camera, dt, time, quality);
    },
    setQuality(q) { quality = q === 'low' ? 'low' : 'high'; for (const l of layers) l.setQuality?.(quality); },
    metrics: () => ({theme: theme.id, layers: layers.map(l => l.id), ...Object.fromEntries(layers.map(l => [l.id, l.metrics?.() ?? true]))}),
    dispose() { for (const l of layers) l.dispose?.(); for (const g of own.geo) g.dispose(); for (const m of own.mat) m.dispose(); for (const t of own.tex) t.dispose(); layers.length = 0; }
  };
}

/** A big camera-facing plane far ahead, positioned each frame (aurora, far glow). */
function skyPlane({add, keep, own, fwd, up, camPos}, material, {width, height, distance, rise}) {
  const mesh = add(new T.Mesh(keep(own.geo, new T.PlaneGeometry(1, 1)), keep(own.mat, material)), 'effects'); mesh.scale.set(width, height, 1); mesh.frustumCulled = false; mesh.renderOrder = -1;
  return {mesh, place(camera) { mesh.position.copy(camPos).addScaledVector(fwd, distance).addScaledVector(up, rise); mesh.quaternion.copy(camera.quaternion); }};
}

const LAYERS = {
  /** Northern lights: soft curtains of green to violet, moving slowly (still in reduced motion). */
  aurora(ctx) {
    const material = new T.ShaderMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, side: T.DoubleSide, uniforms: {time: {value: 0}},
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;uniform float time;
        void main(){vec2 uv=vUv;float w=sin(uv.x*5.3+time*.21)*.09+sin(uv.x*12.7-time*.33)*.035;
        float y=uv.y-.42-w;float curtain=exp(-y*y*22.)+.55*exp(-pow(y-.18,2.)*40.);
        float rays=.5+.5*sin(uv.x*85.+sin(uv.x*6.+time*.5)*3.+time*.7);rays=.45+.55*rays*rays;
        float edge=smoothstep(0.,.16,uv.x)*smoothstep(1.,.84,uv.x)*smoothstep(1.,.62,uv.y)*smoothstep(0.,.22,uv.y);
        vec3 col=mix(vec3(.18,1.,.55),vec3(.62,.35,1.),smoothstep(.25,.85,uv.y+w));
        gl_FragColor=vec4(col*curtain*rays*edge*.85,1.);}`});
    const sky = skyPlane(ctx, material, {width: 1700, height: 620, distance: 760, rise: 300});
    return {update(ps, camera, dt, time) { material.uniforms.time.value = ctx.reduced ? 4 : time; sky.place(camera); }, dispose() { ctx.scene.remove(sky.mesh); }};
  },
  /** Volcano: a far orange glow on the horizon (scenery: the lava is far away and never on the course). */
  glow(ctx) {
    const tex = ctx.keep(ctx.own.tex, canvasTexture(256, 128, (c, w, h) => { const g = c.createRadialGradient(w / 2, h, 0, w / 2, h, w / 2); g.addColorStop(0, 'rgba(255,150,60,.95)'); g.addColorStop(.4, 'rgba(255,90,40,.45)'); g.addColorStop(1, 'rgba(255,60,20,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }));
    const sky = skyPlane(ctx, new T.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, opacity: .55}), {width: 1400, height: 360, distance: 700, rise: 40});
    return {update(ps, camera) { sky.place(camera); }, dispose() { ctx.scene.remove(sky.mesh); }};
  },
  /** Volcano: warm embers drifting up around the rider. */
  embers(ctx) {
    if (ctx.reduced) return null;
    const N = ctx.mobile ? 70 : 140, pos = new Float32Array(N * 3), seed = new Float32Array(N * 4); let r = 13;
    const rnd = () => ((r = Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N; i++) seed.set([rnd() * 40 - 20, rnd() * 14, rnd() * 70 - 10, .6 + rnd() * 1.4], i * 4);
    const geo = ctx.keep(ctx.own.geo, new T.BufferGeometry()); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const points = ctx.add(new T.Points(geo, ctx.keep(ctx.own.mat, new T.PointsMaterial({color: '#ffad5c', map: ctx.keep(ctx.own.tex, softDot()), size: .32, transparent: true, depthWrite: false, blending: T.AdditiveBlending}))), 'effects'); points.frustumCulled = false;
    let t = 0;
    return {update(ps, camera, dt) {
      t += dt; const {camPos, fwd} = ctx, hx = fwd.x, hz = fwd.z, len = Math.hypot(hx, hz) || 1, fx = hx / len, fz = hz / len;
      for (let i = 0; i < N; i++) { const [sx, sy, sz, v] = seed.subarray(i * 4, i * 4 + 4), y = (sy + t * v) % 14, side = sx + Math.sin(t * .7 + i) * .8; pos[i * 3] = camPos.x + fx * sz - fz * side; pos[i * 3 + 1] = camPos.y - 3 + y; pos[i * 3 + 2] = camPos.z + fz * sz + fx * side; }
      geo.attributes.position.needsUpdate = true;
    }, setQuality(q) { geo.setDrawRange(0, q === 'low' ? N >> 1 : N); }, dispose() { ctx.scene.remove(points); }};
  },
  /** Ice cave: a close canyon of the pack's glacier walls on both sides (high quality only) and sparkles in the air. */
  iceWalls(ctx) {
    const geometry = ctx.designWorld?.packGeometry?.('ice-wall'); if (!geometry) return null;
    const material = ctx.keep(ctx.own.mat, new T.MeshStandardMaterial({color: '#d8f2ff', vertexColors: true, roughness: .22, metalness: 0, envMapIntensity: .9, emissive: '#0d3550', emissiveIntensity: .35}));
    // 10 m glacier modules stretched to 13.5 m every 13 m: one continuous wall a side, at most 16 instances (about 60K triangles, high quality only).
    const CAP = 16, mesh = ctx.add(new T.InstancedMesh(geometry, material, CAP), 'iceWall'); mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const walls = []; let r = 71; const rnd = () => ((r = Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let s = -20; s < ctx.course.length + 60; s += 13) for (const side of [-1, 1]) {
      const x = side * (ctx.deckEdge + 7 + rnd() * 2); ctx.place(ctx.dummy, s + rnd(), x, ctx.terrainY(s, Math.abs(x), side) - .25, 0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      ctx.dummy.scale.set(1.36, 1.5 + rnd() * .9, 1); ctx.dummy.updateMatrix(); walls.push({s, matrix: ctx.dummy.matrix.clone()});
    }
    let key = '', q = 'high', count = 0;
    return {update(ps, camera, dt, time, quality) {
      const k = `${Math.floor(ps / 4)}:${quality}`; if (k === key) return; key = k; count = 0;
      if (quality !== 'low') for (const w of walls) if (w.s > ps - 18 && w.s < ps + 88 && count < CAP) mesh.setMatrixAt(count++, w.matrix);
      mesh.count = count; mesh.visible = count > 0; mesh.instanceMatrix.needsUpdate = true; q = quality;
    }, metrics: () => ({walls: count, quality: q}), dispose() { ctx.scene.remove(mesh); mesh.dispose(); }};
  },
  sparkles(ctx) {
    if (ctx.reduced) return null;
    const N = ctx.mobile ? 60 : 110, pos = new Float32Array(N * 3), phase = new Float32Array(N); let r = 5;
    const rnd = () => ((r = Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
    const geo = ctx.keep(ctx.own.geo, new T.BufferGeometry()); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('phase', new T.BufferAttribute(phase, 1));
    const seeds = Array.from({length: N}, () => [rnd() * 44 - 22, rnd() * 9, rnd() * 80 - 10]); for (let i = 0; i < N; i++) phase[i] = rnd() * 6.28;
    const material = ctx.keep(ctx.own.mat, new T.ShaderMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: {time: {value: 0}},
      vertexShader: 'attribute float phase;uniform float time;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=pow(.5+.5*sin(time*2.6+phase),6.);gl_PointSize=min(9.,(2.+vA*5.)*(40./max(1.,-mv.z)));gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float vA;void main(){vec2 d=gl_PointCoord-.5;float a=smoothstep(.5,0.,length(d));gl_FragColor=vec4(vec3(.8,.95,1.)*a*vA,1.);}'}));
    const points = ctx.add(new T.Points(geo, material), 'effects'); points.frustumCulled = false;
    return {update(ps, camera, dt, time) {
      material.uniforms.time.value = time; const {camPos, fwd} = ctx, len = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / len, fz = fwd.z / len;
      for (let i = 0; i < N; i++) { const [sx, sy, sz] = seeds[i]; pos[i * 3] = camPos.x + fx * sz - fz * sx; pos[i * 3 + 1] = camPos.y - 2 + sy; pos[i * 3 + 2] = camPos.z + fz * sz + fx * sx; }
      geo.attributes.position.needsUpdate = true;
    }, dispose() { ctx.scene.remove(points); }};
  },
  /** Peak: soft clouds below the run on both sides, drifting slowly. */
  clouds(ctx) {
    const tex = ctx.keep(ctx.own.tex, canvasTexture(256, 128, (c, w, h) => { for (let k = 0; k < 7; k++) { const x = w * (.18 + k * .11), y = h * (.62 - Math.sin(k * 1.7) * .12), r = h * (.28 + (k % 3) * .07), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); } }));
    const material = ctx.keep(ctx.own.mat, new T.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, opacity: .9, color: '#f4f7fb'})), geo = ctx.keep(ctx.own.geo, new T.PlaneGeometry(1, .5));
    const clouds = [], N = ctx.mobile ? 8 : 14; let r = 9; const rnd = () => ((r = Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N; i++) { const mesh = ctx.add(new T.Mesh(geo, material), 'effects'); mesh.frustumCulled = false; clouds.push({mesh, s: 20 + i * 24, side: i % 2 ? 1 : -1, off: 22 + rnd() * 40, size: 34 + rnd() * 30, drop: 7 + rnd() * 6, drift: .6 + rnd()}); }
    return {update(ps, camera, dt) {
      for (const c of clouds) {
        if (c.s < ps - 40) c.s += N * 24; c.s += c.drift * dt * (ctx.reduced ? 0 : 1);
        const x = c.side * (ctx.deckEdge + c.off); ctx.worldPoint(c.s, x, ctx.terrainY(c.s, Math.abs(x), c.side) - c.drop, c.mesh.position);
        c.mesh.scale.set(c.size, c.size, 1); c.mesh.rotation.set(0, Math.atan2(ctx.camPos.x - c.mesh.position.x, ctx.camPos.z - c.mesh.position.z), 0);
      }
    }, dispose() { for (const c of clouds) ctx.scene.remove(c.mesh); }};
  },
  /** Village: houses from the island's city models, outside the fence, facing the run (asset map: houses). */
  async houses(ctx) {
    const file = ctx.theme.assets?.houses?.[0]; if (!file) return null;
    const gltf = await new GLTFLoader().loadAsync(assetUrl(file)); if (ctx.isDisposed?.()) return null;
    gltf.scene.updateMatrixWorld(true); const parts = [];
    gltf.scene.traverse(n => { if (n.isMesh) parts.push({geometry: ctx.keep(ctx.own.geo, n.geometry.clone().applyMatrix4(n.matrixWorld)), material: ctx.keep(ctx.own.mat, [].concat(n.material)[0])}); });
    gltf.scene.traverse(n => { if (n.isMesh) n.geometry.dispose(); }); if (!parts.length) return null;
    for (const p of parts) { if (p.material.map) ctx.keep(ctx.own.tex, p.material.map); p.geometry.computeBoundingBox(); }
    const box = parts[0].geometry.boundingBox, height = Math.max(.01, box.max.y - box.min.y), scale = 8.5 / Math.max(height, (box.max.x - box.min.x) * .8);
    const homes = []; let r = 31; const rnd = () => ((r = Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let s = 40, i = 0; s < ctx.course.length + 40; s += 30 + rnd() * 14, i++) {
      const side = i % 2 ? 1 : -1, x = side * (ctx.deckEdge + 14 + rnd() * 9);
      ctx.place(ctx.dummy, s, x, ctx.terrainY(s, Math.abs(x), side) - box.min.y * scale - .15, 0, (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (rnd() - .5) * .5, 0);
      ctx.dummy.scale.setScalar(scale * (.9 + rnd() * .25)); ctx.dummy.updateMatrix(); homes.push({s, matrix: ctx.dummy.matrix.clone()});
    }
    const CAP = 10, meshes = parts.map(p => { const m = ctx.add(new T.InstancedMesh(p.geometry, p.material, CAP), 'houses'); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; return m; });
    let key = '', count = 0;
    return {update(ps, camera, dt, time, quality) {
      const k = `${Math.floor(ps / 6)}:${quality}`; if (k === key) return; key = k; count = 0;
      const reach = quality === 'low' ? 110 : 190;
      for (const h of homes) if (h.s > ps - 25 && h.s < ps + reach && count < CAP) { for (const m of meshes) m.setMatrixAt(count, h.matrix); count++; }
      for (const m of meshes) { m.count = count; m.visible = count > 0; m.instanceMatrix.needsUpdate = true; }
    }, metrics: () => ({houses: count, total: homes.length}), dispose() { for (const m of meshes) { ctx.scene.remove(m); m.dispose(); } }};
  },
  /** Village: warm lanterns along both fences. */
  lanterns(ctx) {
    const N = 64, pos = new Float32Array(N * 3), geo = ctx.keep(ctx.own.geo, new T.BufferGeometry()); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const points = ctx.add(new T.Points(geo, ctx.keep(ctx.own.mat, new T.PointsMaterial({color: '#ffcf7a', map: ctx.keep(ctx.own.tex, softDot()), size: .55, transparent: true, depthWrite: false, blending: T.AdditiveBlending}))), 'effects'); points.frustumCulled = false;
    const p = new T.Vector3(); let key = '';
    return {update(ps) {
      const k = String(Math.floor(ps / 4)); if (k === key) return; key = k; const s0 = Math.floor(ps / 4) * 4 - 8;
      for (let i = 0; i < N; i++) { const side = i % 2 ? 1 : -1, s = s0 + Math.floor(i / 2) * 4, x = side * (ctx.deckEdge + .75); ctx.worldPoint(s, x, ctx.terrainY(s, Math.abs(x), side) + 1.25, p); p.toArray(pos, i * 3); }
      geo.attributes.position.needsUpdate = true;
    }, dispose() { ctx.scene.remove(points); }};
  }
};

/** The record ghost: the rider asset, see-through and pale blue, no shadows. Called each frame (a level-of-detail switch may bring new meshes). */
export function ghostify(root) {
  root.traverse(o => {
    if (!o.isMesh || o.userData.ghost) return;
    const source = [].concat(o.material)[0], m = new T.MeshBasicMaterial({color: '#9fdcff', transparent: true, opacity: .34, depthWrite: false, map: source?.map || null, fog: true});
    o.material = m; o.castShadow = o.receiveShadow = false; o.userData.ghost = true; o.userData.ghostMaterial = m; o.renderOrder = 3;
  });
}
export function disposeGhost(root) { root?.traverse(o => { if (o.userData?.ghostMaterial) o.userData.ghostMaterial.dispose(); }); }
