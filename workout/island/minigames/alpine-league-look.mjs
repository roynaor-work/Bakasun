import * as T from '../vendor/three.module.js';
import {THEME_LOOKS,ALPINE_THEME_ASSETS} from './alpine-league-theme.mjs?v=island-v2-20261107-12';

/** Ski league v23: the look of a theme on top of the regular ski view (loaded by alpine-view.mjs only for a league stage).
 * The art is Codex's theme pack (alpine-league-theme.mjs maps every file; alpine-design-world.mjs loads the models and tiles): here the
 * scene is set to the pack's palette (fog, sky and sun light, exposure, snowfall colour, the snow and ground colours), the theme's sky
 * becomes the backplate, and a few layers add what a model cannot: an aurora sky shader (night, gentle: the sky art has its own bands),
 * the pack's sparkle sprite in the air (ice cave), soft clouds below the run (summit), the pack's landmarks beside the run (ice arches,
 * village chalets) and warm lanterns along the fences (village). Nothing here touches physics, colliders or scoring; every layer that
 * fails is skipped. */
const assetUrl = path => new URL('../' + path, import.meta.url).href;
const canvasTexture = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
const softDot = () => canvasTexture(64, 64, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); });
const random = seed => () => ((seed = Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

export function themeOf(id) { return THEME_LOOKS[id] ? {id, ...THEME_LOOKS[id], assets: ALPINE_THEME_ASSETS[id]} : null; }

/** Lights, fog, exposure and snowfall, in place, right after the view set them up (fog distances keep the game's reading distance:
 * >= 34 / 150 m). */
export function gradeLights(theme, {scene, renderer, hemi, sun, look}) {
  const g = theme.grade;
  look.fog = g.fog; scene.fog?.color.set(g.fog);
  if (theme.visual.fogNear && scene.fog) { scene.fog.near = look.fogNear = Math.max(34, theme.visual.fogNear); }
  if (theme.visual.fogFar && scene.fog) { scene.fog.far = look.fogFar = Math.max(150, theme.visual.fogFar); }
  if (theme.visual.snow != null) look.snow = theme.visual.snow;
  if (g.snowfall) look.snowColor = g.snowfall;
  hemi.color.set(g.hemiSky); hemi.groundColor.set(g.hemiGround); sun.color.set(g.sun); sun.intensity *= g.sunScale; renderer.toneMappingExposure = g.exposure;
}
/** Snow and ground: each [material, grade key] takes the grade colour (white = the pack's tiles as drawn), replacing any tint the
 * environment applied. */
export function tintMaterials(theme, materials) { for (const [material, key] of materials) material?.color?.set(theme.grade[key]); }

/** Theme backplate: the theme's sky image, multiplied by the grade's backplate colour and lifted (white and 0 = as drawn), downscaled
 * to at most 1280 px wide. Replaces what env.backgroundFor() returns (the env keeps its own texture until this one is ready). Returns a
 * disposer. */
export function themeBackplate(theme, env) {
  if (!env?.backgroundFor) return () => {};
  const original = env.backgroundFor.bind(env), made = {}, pending = {}, loader = new T.ImageLoader(), g = theme.grade;
  let dead = false;
  function tint(image) {
    const scale = Math.min(1, 1280 / image.width), w = Math.round(image.width * scale), h = Math.round(image.height * scale);
    return canvasTexture(w, h, (ctx) => {
      ctx.drawImage(image, 0, 0, w, h);
      if (g.backplate !== '#ffffff') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = g.backplate; ctx.fillRect(0, 0, w, h); }
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

/** The palette shared by trees, rocks, fences and signs of the design world, nudged toward the grade's foliage colour (white: none). */
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

/** A big camera-facing plane far ahead, positioned each frame (aurora). */
function skyPlane({add, keep, own, fwd, up, camPos}, material, {width, height, distance, rise}) {
  const mesh = add(new T.Mesh(keep(own.geo, new T.PlaneGeometry(1, 1)), keep(own.mat, material)), 'effects'); mesh.scale.set(width, height, 1); mesh.frustumCulled = false; mesh.renderOrder = -1;
  return {mesh, place(camera) { mesh.position.copy(camPos).addScaledVector(fwd, distance).addScaledVector(up, rise); mesh.quaternion.copy(camera.quaternion); }};
}

const LAYERS = {
  /** Northern lights: soft curtains of green to violet above the painted sky bands, moving slowly (still in reduced motion). */
  aurora(ctx) {
    const material = new T.ShaderMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, side: T.DoubleSide, uniforms: {time: {value: 0}, strength: {value: ctx.theme.grade.aurora ?? .45}},
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;uniform float time;uniform float strength;
        void main(){vec2 uv=vUv;float w=sin(uv.x*5.3+time*.21)*.09+sin(uv.x*12.7-time*.33)*.035;
        float y=uv.y-.42-w;float curtain=exp(-y*y*22.)+.55*exp(-pow(y-.18,2.)*40.);
        float rays=.5+.5*sin(uv.x*85.+sin(uv.x*6.+time*.5)*3.+time*.7);rays=.45+.55*rays*rays;
        float edge=smoothstep(0.,.16,uv.x)*smoothstep(1.,.84,uv.x)*smoothstep(1.,.62,uv.y)*smoothstep(0.,.22,uv.y);
        vec3 col=mix(vec3(.18,1.,.55),vec3(.62,.35,1.),smoothstep(.25,.85,uv.y+w));
        gl_FragColor=vec4(col*curtain*rays*edge*strength,1.);}`});
    const sky = skyPlane(ctx, material, {width: 1700, height: 620, distance: 760, rise: 300});
    return {update(ps, camera, dt, time) { material.uniforms.time.value = ctx.reduced ? 4 : time; sky.place(camera); }, dispose() { ctx.scene.remove(sky.mesh); }};
  },
  /** Ice cave: the pack's sparkle sprite twinkling in the air ahead (the pack's colour; off in reduced motion). */
  async sparkles(ctx) {
    if (ctx.reduced) return null;
    let map = null; try { map = await new T.TextureLoader().loadAsync(assetUrl(ctx.theme.assets.sparkle)); map.colorSpace = T.SRGBColorSpace; } catch { map = softDot(); }
    ctx.keep(ctx.own.tex, map); if (ctx.isDisposed?.()) return null;
    const N = ctx.mobile ? 40 : 70, pos = new Float32Array(N * 3), phase = new Float32Array(N), rnd = random(5);
    const geo = ctx.keep(ctx.own.geo, new T.BufferGeometry()); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('phase', new T.BufferAttribute(phase, 1));
    const seeds = Array.from({length: N}, () => [rnd() * 44 - 22, rnd() * 9, rnd() * 80 - 10]); for (let i = 0; i < N; i++) phase[i] = rnd() * 6.28;
    const material = ctx.keep(ctx.own.mat, new T.ShaderMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: {time: {value: 0}, map: {value: map}, color: {value: new T.Color(ctx.theme.grade.sparkle ?? '#cfeeff')}},
      vertexShader: 'attribute float phase;uniform float time;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=pow(.5+.5*sin(time*2.6+phase),6.);gl_PointSize=min(14.,(3.+vA*8.)*(40./max(1.,-mv.z)));gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform sampler2D map;uniform vec3 color;varying float vA;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(color*t.rgb*t.a*vA,1.);}'}));
    const points = ctx.add(new T.Points(geo, material), 'effects'); points.frustumCulled = false;
    return {update(ps, camera, dt, time) {
      material.uniforms.time.value = time; const {camPos, fwd} = ctx, len = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / len, fz = fwd.z / len;
      for (let i = 0; i < N; i++) { const [sx, sy, sz] = seeds[i]; pos[i * 3] = camPos.x + fx * sz - fz * sx; pos[i * 3 + 1] = camPos.y - 2 + sy; pos[i * 3 + 2] = camPos.z + fz * sz + fx * sx; }
      geo.attributes.position.needsUpdate = true;
    }, metrics: () => ({sparkles: N}), dispose() { ctx.scene.remove(points); }};
  },
  /** Summit: soft clouds below the run on both sides, drifting slowly. */
  clouds(ctx) {
    const tex = ctx.keep(ctx.own.tex, canvasTexture(256, 128, (c, w, h) => { for (let k = 0; k < 7; k++) { const x = w * (.18 + k * .11), y = h * (.62 - Math.sin(k * 1.7) * .12), r = h * (.28 + (k % 3) * .07), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); } }));
    const material = ctx.keep(ctx.own.mat, new T.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, opacity: .9, color: '#f4f7fb'})), geo = ctx.keep(ctx.own.geo, new T.PlaneGeometry(1, .5));
    const clouds = [], N = ctx.mobile ? 8 : 14, rnd = random(9);
    for (let i = 0; i < N; i++) { const mesh = ctx.add(new T.Mesh(geo, material), 'effects'); mesh.frustumCulled = false; clouds.push({mesh, s: 20 + i * 24, side: i % 2 ? 1 : -1, off: 22 + rnd() * 40, size: 34 + rnd() * 30, drop: 7 + rnd() * 6, drift: .6 + rnd()}); }
    return {update(ps, camera, dt) {
      for (const c of clouds) {
        if (c.s < ps - 40) c.s += N * 24; c.s += c.drift * dt * (ctx.reduced ? 0 : 1);
        const x = c.side * (ctx.deckEdge + c.off); ctx.worldPoint(c.s, x, ctx.terrainY(c.s, Math.abs(x), c.side) - c.drop, c.mesh.position);
        c.mesh.scale.set(c.size, c.size, 1); c.mesh.rotation.set(0, Math.atan2(ctx.camPos.x - c.mesh.position.x, ctx.camPos.z - c.mesh.position.z), 0);
      }
    }, metrics: () => ({clouds: N}), dispose() { for (const c of clouds) ctx.scene.remove(c.mesh); }};
  },
  /** The pack's landmarks beside the run (asset map: landmarks): ice arches facing the riders, chalets turned toward the run. Upright on
   * the slope, outside the fence, alternating sides; one instanced draw per model, at most `cap` in view. Geometry and material belong to
   * the design world. */
  landmarks(ctx) {
    const sets = (ctx.theme.assets?.landmarks || []).map((_, i) => ctx.designWorld?.landmark?.(i)).filter(Boolean); if (!sets.length) return null;
    const frame = {}, all = [];
    for (const [k, {geometry, entry}] of sets.entries()) {
      const box = geometry.boundingBox, base = entry.height / Math.max(.01, box.max.y - box.min.y), cap = entry.cap ?? 10, rnd = random(31 + k * 17);
      const mesh = ctx.add(new T.InstancedMesh(geometry, ctx.designWorld.palette, cap), 'landmarks'); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      const items = [];
      for (let s = entry.start ?? 40, i = 0; s < ctx.course.length + 40; s += entry.spacing[0] + rnd() * (entry.spacing[1] - entry.spacing[0]), i++) {
        const side = (i + k) % 2 ? 1 : -1, x = side * (ctx.deckEdge + entry.offset[0] + rnd() * (entry.offset[1] - entry.offset[0])), scale = base * (.92 + rnd() * .16);
        ctx.frameAt(s, frame); ctx.place(ctx.dummy, s, x, ctx.terrainY(s, Math.abs(x), side) - box.min.y * scale - .1, 0, -side * (entry.turn ?? 0) + (rnd() - .5) * (entry.jitter ?? .3), Math.atan(frame.grade));
        ctx.dummy.scale.setScalar(scale); ctx.dummy.updateMatrix(); items.push({s, matrix: ctx.dummy.matrix.clone()});
      }
      all.push({mesh, items, cap, count: 0});
    }
    let key = '';
    return {update(ps, camera, dt, time, quality) {
      const k = `${Math.floor(ps / 6)}:${quality}`; if (k === key) return; key = k;
      const reach = quality === 'low' ? 110 : 200;
      for (const set of all) {
        set.count = 0; for (const it of set.items) if (it.s > ps - 25 && it.s < ps + reach && set.count < set.cap) set.mesh.setMatrixAt(set.count++, it.matrix);
        set.mesh.count = set.count; set.mesh.visible = set.count > 0; set.mesh.instanceMatrix.needsUpdate = true;
      }
    }, metrics: () => ({landmarks: all.reduce((n, s) => n + s.count, 0), total: all.reduce((n, s) => n + s.items.length, 0)}), dispose() { for (const s of all) { ctx.scene.remove(s.mesh); s.mesh.dispose(); } }};
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
    }, metrics: () => ({lanterns: N}), dispose() { ctx.scene.remove(points); }};
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
