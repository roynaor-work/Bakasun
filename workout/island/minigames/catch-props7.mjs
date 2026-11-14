/** v7 "תפוס את הפושע": the Codex chase props (design/catch-props-v1, CC0: low-poly GLBs on one shared 1024 colour atlas) as the
 * chase draws them. The GLBs the game uses are copied byte for byte to assets/catch-v7/models (the design folder keeps the sheets,
 * the source and the checks). Every file is one mesh with one material and the same embedded atlas, so they are read here without
 * GLTFLoader: geometry straight from the buffers, the atlas decoded once and shared by every prop (one texture, two materials: solid
 * and road decal). Takes Three.js as a parameter (imports nothing), like catch-chase-fx7.mjs, so node tests build the same geometry.
 * Codex props face +Z, +Y up, in metres, origin at the bottom centre; every geometry here is turned a quarter turn to face +X, the
 * chase track's forward at rest (catch-view6.mjs places props with the track yaw). */
export const PROPS7 = Object.freeze({
  dir: '../assets/catch-v7/models/',
  // what the chase uses (repair-wheel stays in the design folder: no matching rule yet)
  use: Object.freeze(['nitro-bottle', 'oil-slick-a', 'oil-slick-b', 'puddle-a', 'puddle-b', 'warning-sign', 'short-ramp', 'jump-bridge', 'police-helicopter',
    'civilian-hatchback', 'civilian-sedan', 'taxi', 'motorcycle', 'police-barrel', 'police-barrier', 'construction-barrier', 'traffic-cone', 'guardrail']),
  // the drawn hop over a ramp (the pad's boost is the rule, the hop is only drawn), metres along the track from the ramp's foot:
  // short ramp = up 3.6 m to .906 m, then a flight that lands 9 m on; bridge = up 3.45 m to 1.606 m, a small hop over the 1.5 m gap, down
  ramp: Object.freeze({len: 3.6, h: .906, flight: 9}),
  bridge: Object.freeze({len: 8.4, h: 1.606, up: 3.45, gap: 1.5, hop: .3}),
});
const COMPONENTS = {5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array};
const SIZES = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4};

/** Reads a GLB (glTF 2.0 binary, no extensions): every mesh node with its path of translation/rotation/scale from the scene root,
 * whether the material is a blended decal, and the embedded image bytes. Throws on anything else. */
export function parseGlb(bytes) {
  const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const dv = new DataView(buf);
  if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw Error('props7: not a GLB 2.0');
  let off = 12, json = null, bin = null;
  while (off + 8 <= dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, start, len)));
    else if (type === 0x004e4942) bin = {offset: start, length: len};
    off = start + len;
  }
  if (!json || !bin) throw Error('props7: GLB without JSON or BIN');
  if ((json.extensionsUsed || []).length) throw Error('props7: unexpected extensions ' + json.extensionsUsed.join(','));
  const view = index => { const v = json.bufferViews[index]; return {start: bin.offset + (v.byteOffset || 0), stride: v.byteStride || 0, length: v.byteLength}; };
  const read = index => {
    const a = json.accessors[index], Ctor = COMPONENTS[a.componentType], size = SIZES[a.type]; if (!Ctor || !size || a.sparse) throw Error('props7: accessor ' + index);
    const v = view(a.bufferView), elem = size * Ctor.BYTES_PER_ELEMENT, stride = v.stride || elem, base = v.start + (a.byteOffset || 0), out = new Ctor(a.count * size);
    if (stride === elem) out.set(new Ctor(buf.slice(base, base + a.count * elem)));
    else for (let i = 0; i < a.count; i++) out.set(new Ctor(buf.slice(base + i * stride, base + i * stride + elem)), i * size);
    return out;
  };
  const parts = [];
  const walk = (index, path) => {
    const n = json.nodes[index], trs = [...path, {t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1], m: n.matrix || null}];
    if (n.mesh != null) for (const p of json.meshes[n.mesh].primitives) {
      if ((p.mode ?? 4) !== 4) throw Error('props7: only triangles');
      const material = json.materials?.[p.material] || {};
      parts.push({node: n.name || 'mesh' + index, trs, decal: material.alphaMode === 'BLEND', doubleSided: Boolean(material.doubleSided),
        position: read(p.attributes.POSITION), normal: p.attributes.NORMAL != null ? read(p.attributes.NORMAL) : null, uv: p.attributes.TEXCOORD_0 != null ? read(p.attributes.TEXCOORD_0) : null,
        index: p.indices != null ? read(p.indices) : null});
    }
    for (const c of n.children || []) walk(c, trs);
  };
  const scene = json.scenes?.[json.scene || 0];
  for (const r of scene ? scene.nodes : json.nodes.map((_, i) => i)) walk(r, []);
  const img = json.images?.[0];
  const image = img && img.bufferView != null ? {mimeType: img.mimeType || 'image/png', bytes: new Uint8Array(buf.slice(view(img.bufferView).start, view(img.bufferView).start + view(img.bufferView).length))} : null;
  return {name: json.nodes[scene ? scene.nodes[0] : 0]?.name || '', parts, image, decal: parts.some(p => p.decal)};
}

/** Height (m) and nose-up pitch (rad) of a car `x` metres past the foot of a ramp (kind 'ramp' or 'bridge'). */
export function rampLift(kind, x) {
  if (kind === 'bridge') {
    const B = PROPS7.bridge, top = B.up + B.gap;
    if (!(x > 0 && x < B.len)) return {y: 0, pitch: 0};
    if (x < B.up) return {y: B.h * x / B.up, pitch: Math.atan2(B.h, B.up)};
    if (x < top) { const u = (x - B.up) / B.gap; return {y: B.h + B.hop * Math.sin(u * Math.PI), pitch: Math.atan(B.hop * Math.PI / B.gap * Math.cos(u * Math.PI)) * .5}; }
    return {y: B.h * (B.len - x) / B.up, pitch: -Math.atan2(B.h, B.up)};
  }
  const R = PROPS7.ramp, slope = R.h / R.len;
  if (!(x > 0)) return {y: 0, pitch: 0};
  if (x < R.len) return {y: slope * x, pitch: Math.atan(slope)};
  const u = x - R.len, a = (R.h + slope * R.flight) / (R.flight * R.flight);
  if (u >= R.flight) return {y: 0, pitch: 0};
  return {y: Math.max(0, R.h + slope * u - a * u * u), pitch: Math.atan(slope - 2 * a * u) * (1 - .5 * u / R.flight)}; // the nose drops softly, half way at the landing
}
/** Length along the track that a ramp of this kind covers (its foot is at the pad's s minus half of the prop). */
export const rampSpan = kind => kind === 'bridge' ? {back: PROPS7.bridge.len / 2, total: PROPS7.bridge.len} : {back: PROPS7.ramp.len / 2, total: PROPS7.ramp.len + PROPS7.ramp.flight};

/** Builds the props from parsed files ({id: parseGlb(...)}) and the decoded atlas (ImageBitmap or image; null in node tests). */
export function buildProps7({T, files, image = null}) {
  const tex = new T.Texture(image || undefined);
  tex.colorSpace = T.SRGBColorSpace; tex.flipY = false; tex.magFilter = tex.minFilter = T.NearestFilter; tex.generateMipmaps = false; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
  if (image) tex.needsUpdate = true;
  const mat = new T.MeshStandardMaterial({map: tex, roughness: 1, metalness: 0});
  const decalMat = new T.MeshStandardMaterial({map: tex, roughness: 1, metalness: 0, transparent: true, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  // oil reads as a dark, slick patch on the grey asphalt (the atlas brown alone sat too close to the road at 20 m): darker and glossy
  const oilMat = decalMat.clone(); oilMat.color.setRGB(.5, .5, .56); oilMat.roughness = .25; oilMat.metalness = .45;
  const M = new T.Matrix4(), N = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), S = new T.Vector3();
  const matrixOf = trs => { M.identity(); for (const k of trs) { if (k.m) N.fromArray(k.m); else N.compose(V.fromArray(k.t), Q.fromArray(k.r), S.fromArray(k.s)); M.multiply(N); } return M.clone(); };
  const geometryOf = (list, skipLast = false) => {
    // concatenates the parts (one per file except the helicopter), each moved by its node path
    let count = 0, indexCount = 0; for (const p of list) { count += p.position.length / 3; indexCount += p.index ? p.index.length : p.position.length / 3; }
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2), idx = new (count > 65535 ? Uint32Array : Uint16Array)(indexCount);
    let v = 0, i = 0;
    for (const p of list) {
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p.position.slice(), 3)); if (p.normal) g.setAttribute('normal', new T.BufferAttribute(p.normal.slice(), 3));
      g.applyMatrix4(matrixOf(skipLast ? p.trs.slice(0, -1) : p.trs));
      const n = p.position.length / 3; pos.set(g.attributes.position.array, v * 3); if (p.normal) nor.set(g.attributes.normal.array, v * 3); if (p.uv) uv.set(p.uv, v * 2);
      if (p.index) { for (let k = 0; k < p.index.length; k++) idx[i + k] = p.index[k] + v; i += p.index.length; } else { for (let k = 0; k < n; k++) idx[i + k] = v + k; i += n; }
      v += n; g.dispose();
    }
    const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3)); out.setAttribute('uv', new T.BufferAttribute(uv, 2)); out.setIndex(new T.BufferAttribute(idx, 1));
    if (!list.every(p => p.normal)) out.computeVertexNormals();
    out.rotateY(Math.PI / 2); out.computeBoundingBox(); out.computeBoundingSphere();
    return out;
  };
  const geo = {}, decal = {}, triangles = {}; let rotorPivot = null;
  for (const [id, f] of Object.entries(files)) {
    decal[id] = f.decal;
    if (id === 'police-helicopter') {
      const body = f.parts.filter(p => p.node !== 'rotor'), rotor = f.parts.filter(p => p.node === 'rotor');
      geo[id + ':body'] = geometryOf(body); if (rotor.length) { geo[id + ':rotor'] = geometryOf(rotor, true); const t = new T.Vector3(); matrixOf(rotor[0].trs).decompose(t, Q, S); rotorPivot = t.applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2); }
      triangles[id] = (geo[id + ':body'].index.count + (geo[id + ':rotor']?.index.count || 0)) / 3;
    } else { geo[id] = geometryOf(f.parts); triangles[id] = geo[id].index.count / 3; }
  }
  const api = {
    tex, mat, decalMat, oilMat, triangles, files: Object.keys(files),
    has: id => Boolean(geo[id] || geo[id + ':body']),
    geo: id => geo[id] || null,
    isDecal: id => Boolean(decal[id]),
    /** One prop (shared geometry and material): a decal sits 1.5 cm over the road and draws after it. */
    mesh(id) {
      const g = geo[id]; if (!g) return null;
      const m = new T.Mesh(g, decal[id] ? (id.startsWith('oil') ? oilMat : decalMat) : mat); m.name = 'props7:' + id;
      if (decal[id]) { m.position.y = .015; m.renderOrder = 1; }
      return m;
    },
    /** Many copies in one draw (matrices set by the caller). */
    instanced(id, max) { const g = geo[id]; if (!g) return null; const m = new T.InstancedMesh(g, decal[id] ? decalMat : mat, Math.max(1, max)); m.name = 'props7:' + id; m.count = 0; return m; },
    /** The police helicopter: the body and the rotor on its hub (rotor.rotation.y spins the blades only). */
    heli() {
      if (!geo['police-helicopter:body']) return null;
      const g = new T.Group(), body = new T.Mesh(geo['police-helicopter:body'], mat); body.name = 'props7:heli-body'; g.add(body);
      if (geo['police-helicopter:rotor']) { const r = new T.Mesh(geo['police-helicopter:rotor'], mat); r.name = 'props7:heli-rotor'; r.position.copy(rotorPivot); g.add(r); g.userData.rotor = r; }
      return g;
    },
    stats() { return {files: Object.keys(files).length, textures: 1, triangles: Object.values(triangles).reduce((a, b) => a + b, 0)}; },
    dispose() { for (const g of Object.values(geo)) g.dispose(); mat.dispose(); decalMat.dispose(); oilMat.dispose(); tex.dispose(); try { image?.close?.(); } catch { /* not a bitmap */ } },
  };
  return api;
}

async function decodeImage({bytes, mimeType}) {
  const blob = new Blob([bytes], {type: mimeType});
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(blob, {imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none'}); } catch { /* older Safari: an image element */ } }
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { URL.revokeObjectURL(url); reject(Error('props7: atlas')); }; img.src = url;
  });
}

/** Fetches the props the chase uses (the asset version as ?v=, like the other catch models), decodes the atlas once and builds them. */
export async function loadProps7({T, version = '', signal, ids = PROPS7.use} = {}) {
  const url = id => { const u = new URL(PROPS7.dir + id + '.glb', import.meta.url); if (version) u.searchParams.set('v', version); return u.href; };
  const files = {};
  await Promise.all(ids.map(async id => { const r = await fetch(url(id), {signal}); if (!r.ok) throw Error('props7: ' + id + ' ' + r.status); files[id] = parseGlb(await r.arrayBuffer()); }));
  const first = ids.map(id => files[id].image).find(Boolean), image = first ? await decodeImage(first) : null;
  if (signal?.aborted) { try { image?.close?.(); } catch { /* ignore */ } throw Error('aborted'); }
  return buildProps7({T, files, image});
}
