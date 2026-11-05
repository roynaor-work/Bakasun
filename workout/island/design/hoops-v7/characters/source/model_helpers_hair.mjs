/**
 * Opaque coiled hair for the two larger athletes.
 *
 * A single connected, closed-at-the-crown scalp shell carries the curl relief.
 * There are no transparent cards, floating spheres or independent curl meshes.
 * `headBounds` must describe the transformed OUTER HEAD UV island, including
 * chin and scalp but excluding the torso, oral cavity and eyeball islands.
 * All generated vertices use the existing Head joint and neutral atlas patch.
 */
export function addOpaqueCoils({ THREE, data, headBounds, profile, addVertex, uvRect }) {
  if (!THREE || !data || !headBounds || typeof addVertex !== 'function' || typeof uvRect !== 'function') {
    throw new TypeError('addOpaqueCoils needs THREE, buffers, outer-head bounds and vertex/UV helpers.');
  }
  const lo = headBounds.min, hi = headBounds.max;
  if (!Array.isArray(lo) || !Array.isArray(hi) || lo.length !== 3 || hi.length !== 3 ||
      ![...lo, ...hi].every(Number.isFinite) || hi.some((v, i) => v <= lo[i])) {
    throw new RangeError('Outer-head bounds must be finite, nonzero metre-space extents.');
  }
  const id = profile?.id;
  if (id !== 'pf' && id !== 'c') throw new RangeError('Opaque coils are authored for pf and c only.');
  const power = id === 'pf', segments = 80, rings = 18;
  const firstVertex = data.pos.length / 3, firstIndex = data.index.length;
  const width = hi[0] - lo[0], height = hi[1] - lo[1], depth = hi[2] - lo[2];
  const center = new THREE.Vector3((lo[0] + hi[0]) / 2, lo[1] + height * .43,
    lo[2] + depth * (power ? .43 : .50));
  // Nose and ears contribute to the outer-head bound. The scalp is shallower
  // and narrower; the final two rows taper further into skin so the hairline
  // cannot become a floating visor in front of the forehead.
  const radiusX = width * (power ? .455 : .49), radiusY = height * .57,
    radiusZ = depth * (power ? .49 : .52);
  const volumeSide = width * (power ? .061 : .014);
  const volumeTop = height * (power ? .12 : .035);
  const relief = height * (power ? .032 : .014);
  // The neutral solid ALBEDO patch also reserves hair detail in the shared
  // NORMAL atlas. Other neutral-patch materials do not sample that normal map.
  const atlasUV = (u, v) => uvRect(u, v, 'hair');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const hash = (x, y, z, salt = 0) => {
    // Integer avalanche gives deterministic, nonrepeating curl placement.
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^
      Math.imul(z | 0, 2147483647) ^ Math.imul(salt + (power ? 143 : 367), 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  function curlHeight(x, y, z) {
    // Smooth cellular lobes evaluated in 3D prevent latitude/longitude stripes
    // at the crown and UV seam. A small ridge within each lobe suggests a coil.
    const scale = power ? 5.8 : 8.6;
    x *= scale; y *= scale; z *= scale;
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let nearest = 10, second = 10, curlSeed = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const gx = ix + a, gy = iy + b, gz = iz + c;
      const dx = gx + .12 + .76 * hash(gx, gy, gz, 1) - x;
      const dy = gy + .12 + .76 * hash(gx, gy, gz, 2) - y;
      const dz = gz + .12 + .76 * hash(gx, gy, gz, 3) - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < nearest) { second = nearest; nearest = d; curlSeed = hash(gx, gy, gz, 4); }
      else if (d < second) second = d;
    }
    const lobe = Math.exp(-4.8 * nearest * nearest);
    const ridge = .82 + .18 * Math.cos(9 * nearest + curlSeed * Math.PI * 2);
    return lobe * ridge + .08 * smooth((second - nearest) * 2.2);
  }
  function hairline(a) {
    const front = Math.max(0, Math.cos(a)), back = Math.max(0, -Math.cos(a));
    // Higher forehead, tapered temples, lower occipital edge. The front starts
    // above the brows; the rear covers the upper back of the skull.
    return lo[1] + height * ((power ? .61 : .64) + .10 * front * front - .17 * back * back +
      .010 * Math.sin(a * 7 + .6) + .005 * Math.sin(a * 13));
  }
  function point(t, angle, crown = false) {
    const line = hairline(angle);
    const end = Math.acos(clamp((line - center.y) / radiusY, -.98, .98));
    const theta = crown ? 0 : end * t;
    const st = Math.sin(theta), ct = Math.cos(theta), sa = Math.sin(angle), ca = Math.cos(angle);
    const unit = new THREE.Vector3(st * sa, ct, st * ca);
    const boundaryTaper = smooth((t - .79) / .21);
    const scalpX = radiusX * (1 - (power ? .055 : .025) * boundaryTaper);
    const scalpZ = radiusZ * (1 - (power ? .135 : .13) * boundaryTaper);
    const surface = new THREE.Vector3(center.x + scalpX * unit.x,
      center.y + radiusY * unit.y, center.z + scalpZ * unit.z);
    const normal = new THREE.Vector3(unit.x / radiusX, unit.y / radiusY, unit.z / radiusZ).normalize();
    // The last ring meets the scalp without a floating, thick lower edge.
    const edge = smooth((1 - t) / .13);
    const upper = Math.pow(Math.max(0, ct), .7);
    const broad = volumeSide * (.78 + .22 * Math.sin(angle * 3 + .7) * Math.sin(theta * 2.3));
    const offset = (.0015 + broad * edge + relief * curlHeight(unit.x, unit.y, unit.z) * edge);
    if(!power&&ct>=0)surface.y=center.y+radiusY*(1-Math.pow(1-ct,1.22));
    surface.addScaledVector(normal, offset);
    // Angular asymmetry must vanish at the pole: otherwise the first ring can
    // rise above the shared crown and create a pointed swimming-cap silhouette.
    surface.y += volumeTop * upper * (.94 + .06 * Math.sin(angle * 3 + .4) * st) * edge;
    return { position: surface.toArray(), normal: normal.toArray() };
  }
  const crown = point(0, 0, true);
  const crownIndex = addVertex(data, crown.position, crown.normal, atlasUV(.5, 0), [['Head', 1]]);
  for (let row = 1; row <= rings; row++) {
    const t = row / rings;
    for (let column = 0; column <= segments; column++) {
      // A small deterministic stagger removes a visible meridian grid while
      // preserving cyclic order and the common seam vertices.
      const jitter = (hash(row, column % segments, 0, 8) - .5) * .34 * Math.sin(Math.PI * t);
      const angle = (column + jitter) / segments * Math.PI * 2;
      const s = point(t, angle);
      addVertex(data, s.position, s.normal, atlasUV(column / segments, t), [['Head', 1]]);
      if (column === segments) continue;
      const current = firstVertex + 1 + (row - 1) * (segments + 1) + column;
      const next = current + 1;
      if (row === 1) data.index.push(crownIndex, current, next);
      else {
        const above = current - (segments + 1), aboveNext = next - (segments + 1);
        data.index.push(above, current, next, above, next, aboveNext);
      }
    }
  }
  // Area-weighted normals on the actual displaced shell make curl relief react
  // to light; analytic ellipsoid normals would incorrectly shade it flat.
  const added = data.pos.length / 3 - firstVertex;
  const sums = Array.from({ length: added }, () => new THREE.Vector3());
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  let minimumDoubleArea = Infinity;
  for (let k = firstIndex; k < data.index.length; k += 3) {
    const a = data.index[k], b = data.index[k + 1], c = data.index[k + 2];
    va.fromArray(data.pos, a * 3); vb.fromArray(data.pos, b * 3); vc.fromArray(data.pos, c * 3);
    const face = vb.sub(va).cross(vc.sub(va));
    minimumDoubleArea = Math.min(minimumDoubleArea, face.length());
    for (const i of [a, b, c]) sums[i - firstVertex].add(face);
  }
  // Duplicate UV seam vertices share the same smooth geometric normal.
  for (let row = 0; row < rings; row++) {
    const a = 1 + row * (segments + 1), b = a + segments;
    const shared = sums[a].clone().add(sums[b]);
    sums[a].copy(shared); sums[b].copy(shared);
  }
  for (let i = 0; i < added; i++) {
    const n = sums[i].normalize();
    data.norm.splice((firstVertex + i) * 3, 3, n.x, n.y, n.z);
  }
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = firstVertex; i < data.pos.length / 3; i++) for (let c = 0; c < 3; c++) {
    const v = data.pos[i * 3 + c];
    if (!Number.isFinite(v)) throw new RangeError('Hair generation produced a non-finite vertex.');
    bounds.min[c] = Math.min(bounds.min[c], v); bounds.max[c] = Math.max(bounds.max[c], v);
  }
  if (!(minimumDoubleArea > 1e-12)) throw new RangeError('Hair shell contains a degenerate triangle.');
  return {
    style: power ? 'dense rounded coils' : 'close cropped coils',
    verticesAdded: added,
    trianglesAdded: (data.index.length - firstIndex) / 3,
    minimumDoubleTriangleArea: minimumDoubleArea,
    bounds,
    joint: 'Head',
    atlasRegion: 'hair',
  };
}
