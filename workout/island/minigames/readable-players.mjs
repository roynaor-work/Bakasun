/** Readable players (28/11/2026): Roy, "השחקנים נראים מוזר ורע". With the v3 body in, what is left at phone size (844x390) is how big the players
 * are on the screen and how well the two that matter stand out. Measured in Chromium (tools/readable-players-measure.mjs, tools/soccer-v250-touch.mjs):
 *  - basketball: the child's player is 81..85 px tall already (the broadcast lens keeps `bSpan` metres in the frame), so its camera stays as it is;
 *    `hoopsBroadcastPixels` is the same number without a browser, and the test holds it above `READABLE.hoops.minPixels`.
 *  - football: 40.5 px while running. The full match's camera comes ~16% closer (48 px), the far limit and the fit that keeps the ball and the
 *    selected player in the frame are unchanged.
 *  - both: a thin outline of constant width on the screen around the child's player (white) and around another player who has the ball (amber).
 *    No words and nothing floating above the pitch.
 * `?readablePlayers=0` gives back the previous look exactly. The pure parts run in node; three.js only through `T`. */

export const READABLE = Object.freeze({
  hoops: Object.freeze({minPixels: 60, viewportHeight: 390, playerHeight: 1.9}),
  // football, full match: v25.0 was base 19.2 / near 15.4 / speedZoom 6 / portraitBase 33
  soccer: Object.freeze({camera: Object.freeze({base: 16.2, near: 13.2, speedZoom: 5, portraitBase: 29}), targetPixels: 48}),
  outline: Object.freeze({pixels: 1.5, selected: 0xffffff, holder: 0xffc24a}),
});

const params = search => new URLSearchParams(search ?? globalThis.location?.search ?? '');
/** On a page unless `?readablePlayers=0`; off without a page (node), so earlier contracts keep testing the earlier look. */
export function readablePlayersEnabled(search) {
  if (search === undefined && !globalThis.location) return false;
  return params(search).get('readablePlayers') !== '0';
}

/** The session's config for the closer football camera (full match only; the small match keeps its camera). Idempotent. */
export function applyReadablePlayersSoccer(config, {enabled = readablePlayersEnabled()} = {}) {
  if (!enabled || config.readablePlayersView || !config.full?.camera) return config;
  const C = READABLE.soccer.camera, was = config.full.camera;
  const camera = {...was, base: Math.min(was.base, C.base), near: Math.min(was.near, C.near), speedZoom: Math.min(was.speedZoom, C.speedZoom), portraitBase: Math.min(was.portraitBase, C.portraitBase)};
  return {...config, readablePlayersView: true, full: {...config.full, camera}, view: {...config.view, camera: {...config.view.camera, nearDistance: camera.base, portraitNearDistance: camera.portraitBase}}};
}

/** Height in CSS pixels of a player `height` metres tall standing at depth `z` under basketball's broadcast camera (hoops-view cameraFor), for a
 * frame `viewportHeight` pixels high. `followZ` is the depth the lens follows (the ball handler's). Same numbers as the view: `view` is config.view. */
export function hoopsBroadcastPixels(view, court, {z = 0, followZ = z, height = 1.9, viewportHeight = 390} = {}) {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const cz = -(court.hz + (view.bDist ?? 7)), cy = view.bHeight ?? 7, lookY = view.bLookY ?? 1;
  const lz = clamp(clamp(followZ, -court.hz, court.hz) * (view.bFollowZ ?? 0.75) + (view.bLookZ ?? 0), -court.hz + (view.bNearZ ?? 3), court.hz - 1);
  const dist = Math.hypot(lz - cz, cy - lookY), fov = clamp(2 * Math.atan((view.bSpan ?? 8) / 2 / dist) * 180 / Math.PI, view.bFovMin ?? 16, view.bFovMax ?? 40) * Math.PI / 180;
  // camera basis: forward towards (0, lookY, lz); a point projects to y = f * (up . d) / (forward . d)
  const fy = (lookY - cy) / dist, fz = (lz - cz) / dist, uy = fz, uz = -fy, f = viewportHeight / 2 / Math.tan(fov / 2);
  const screenY = y => { const dy = y - cy, dz = z - cz; return f * (uy * dy + uz * dz) / (fy * dy + fz * dz); };
  return screenY(height) - screenY(0);
}

/** Who gets an outline this frame: the child's player, and the player with the ball when he is someone else. Nothing during a replay. */
export function readableOutlinePlan({controlled = null, holder = null, replay = false, enabled = true} = {}) {
  if (!enabled || replay) return [];
  const out = [];
  if (controlled != null) out.push({id: controlled, kind: 'selected'});
  if (holder != null && holder !== controlled) out.push({id: holder, kind: 'holder'});
  return out;
}

/** The outline's vertex change: the back faces pushed out along the normal by a fixed number of pixels (after projection, so the line is as
 * thin far away as it is close). Exported for the test. */
export const OUTLINE_VERTEX = `
#include <project_vertex>
#ifdef USE_SKINNING
 vec3 rpN = normalize(transformedNormal);
 #ifdef FLIP_SIDED
  rpN = -rpN;
 #endif
#else
 vec3 rpN = normalize(normalMatrix * normal);
#endif
gl_Position.xy += rpN.xy * uReadablePx * gl_Position.w;
`;

/** Outlines for at most a few players: every solid mesh under the player's root gets a companion on the same skeleton that draws only its
 * pushed-out back faces in one flat colour (one extra draw call per mesh, two per v3 player: body and hair). Companions are made the first time a
 * player is outlined and follow the source's visibility (LOD) and geometry every frame.
 *   const o = createPlayerOutlines(T); o.resize(cssWidth, cssHeight); o.update([{id, kind, root}]); o.dispose(); */
export function createPlayerOutlines(T, {pixels = READABLE.outline.pixels, colors = READABLE.outline} = {}) {
  const px = {value: new T.Vector2(0.003, 0.006)}, made = new Map(), materials = {};
  let active = [];
  const material = kind => materials[kind] || (materials[kind] = (() => {
    const m = new T.MeshBasicMaterial({color: colors[kind] ?? 0xffffff, side: T.BackSide, fog: false, toneMapped: false});
    m.onBeforeCompile = shader => { shader.uniforms.uReadablePx = px; shader.vertexShader = 'uniform vec2 uReadablePx;\n' + shader.vertexShader.replace('#include <project_vertex>', OUTLINE_VERTEX); };
    m.customProgramCacheKey = () => 'readable-outline';
    return m;
  })());
  const solid = o => o.isMesh && !o.isInstancedMesh && !o.userData.readableOutline && o.geometry?.attributes?.normal && !o.material?.transparent && o.material?.depthWrite !== false;
  function build(root) {
    const list = [];
    root.traverse(o => { if (solid(o)) list.push(o); });
    return list.map(src => {
      const c = src.isSkinnedMesh ? new T.SkinnedMesh(src.geometry, material('selected')) : new T.Mesh(src.geometry, material('selected'));
      c.name = 'readable-outline'; c.userData.readableOutline = true; c.position.copy(src.position); c.quaternion.copy(src.quaternion); c.scale.copy(src.scale);
      c.frustumCulled = false; c.castShadow = c.receiveShadow = false; c.visible = false; c.matrixAutoUpdate = src.matrixAutoUpdate;
      src.parent.add(c);
      if (src.isSkinnedMesh) c.bind(src.skeleton, src.bindMatrix);
      if (src.morphTargetInfluences) { c.morphTargetInfluences = src.morphTargetInfluences; c.morphTargetDictionary = src.morphTargetDictionary; }
      return {src, c};
    });
  }
  const hide = entry => { for (const {c} of entry.pairs) c.visible = false; };
  return {
    /** CSS pixels of the area the camera draws into */
    resize(width, height) { px.value.set(2 * pixels / Math.max(1, width), 2 * pixels / Math.max(1, height)); },
    /** `plan`: [{id, kind, root}] of this frame; everyone else's outline is hidden */
    update(plan) {
      const next = [];
      for (const {id, kind, root} of plan) {
        if (!root) continue;
        let entry = made.get(id);
        if (entry && entry.root !== root) { for (const {c} of entry.pairs) c.removeFromParent(); entry = null; }
        if (!entry) { entry = {root, pairs: build(root)}; made.set(id, entry); }
        const mat = material(kind);
        for (const {src, c} of entry.pairs) {
          if (!src.parent) { c.visible = false; continue; }
          if (c.parent !== src.parent) src.parent.add(c);
          if (c.geometry !== src.geometry) c.geometry = src.geometry;
          c.material = mat; c.visible = src.visible;
        }
        next.push(entry);
      }
      for (const entry of active) if (!next.includes(entry)) hide(entry);
      active = next;
    },
    get count() { return active.reduce((n, e) => n + e.pairs.filter(p => p.c.visible).length, 0); },
    dispose() { for (const entry of made.values()) for (const {c} of entry.pairs) c.removeFromParent(); made.clear(); active = []; for (const m of Object.values(materials)) m.dispose(); },
  };
}
