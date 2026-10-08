import * as THREE from './vendor/three.module.js';

// Units are model units. +Y points to the fingertips; +Z is the palm side.
export const HAND_PARAMETERS = Object.freeze({
  gridStep: 0.045,
  palmCenter: [-0.01, -0.18, 0],
  palmRadii: [0.57, 0.61, 0.245],
  wristRadius: 0.255,
  fingerRadii: [0.153, 0.159, 0.149, 0.126],
  fingerRootsX: [-0.425, -0.142, 0.152, 0.421],
  fingerTipY: [1.015, 1.20, 1.105, 0.865],
  thumbRadius: 0.176,
  rootBlend: 0.17,
  tipBlend: 0.045,
  jointBlend: 0.095,
  depthScale: 0.93,
  color: '#edb28e',
  roughness: 0.73,
  bounds: [[-1.26, -1.40, -0.54], [1.09, 1.49, 0.99]],
});

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const mix = (a, b, t) => a + (b - a) * t;

// A polynomial smooth minimum replaces a hard boolean seam with a soft web.
function smoothMin(a, b, radius) {
  if (!Number.isFinite(a)) return b;
  const h = clamp(0.5 + 0.5 * (b - a) / radius);
  return mix(b, a, h) - radius * h * (1 - h);
}

// Ellipsoid distance approximation preserves a flattened, fleshy palm.
function ellipsoidDistance(x, y, z, center, radii) {
  const dx = x - center[0], dy = y - center[1], dz = z - center[2];
  const k0 = Math.hypot(dx / radii[0], dy / radii[1], dz / radii[2]);
  const k1 = Math.hypot(dx / (radii[0] ** 2), dy / (radii[1] ** 2), dz / (radii[2] ** 2));
  return k1 > 1e-8 ? k0 * (k0 - 1) / k1 : -Math.min(...radii);
}

function prepareSegment(a, b, radiusA, radiusB, depthScale = HAND_PARAMETERS.depthScale) {
  const vx = b[0] - a[0], vy = b[1] - a[1], vz = (b[2] - a[2]) / depthScale;
  return { a, b, radiusA, radiusB, depthScale, vx, vy, vz, invLength2: 1 / (vx * vx + vy * vy + vz * vz) };
}

function segmentDistance(x, y, z, segment) {
  const dx = x - segment.a[0], dy = y - segment.a[1], dz = (z - segment.a[2]) / segment.depthScale;
  const t = clamp((dx * segment.vx + dy * segment.vy + dz * segment.vz) * segment.invLength2);
  return Math.hypot(dx - segment.vx * t, dy - segment.vy * t, dz - segment.vz * t) - mix(segment.radiusA, segment.radiusB, t);
}

function makeDigit(points, radii) {
  return { points, radii, segments: points.slice(1).map((p, i) => prepareSegment(points[i], p, radii[i], radii[i + 1])) };
}

function describePose(pose) {
  const fingers = HAND_PARAMETERS.fingerRootsX.map((rootX, i) => {
    const r = HAND_PARAMETERS.fingerRadii[i];
    const top = HAND_PARAMETERS.fingerTipY[i];
    if (pose === 'fist') {
      const knuckleY = [0.60, 0.68, 0.65, 0.51][i];
      return makeDigit([
        [rootX, 0.22, -0.045],
        [rootX, knuckleY, 0.015],
        [rootX + 0.012, knuckleY - 0.09, 0.34],
        [rootX + 0.025, 0.08 + i * 0.018, 0.365],
      ], [r * 1.05, r * 1.03, r, r * 0.91]);
    }
    if (pose === 'wave') {
      const splay = [-0.13, -0.03, 0.10, 0.25][i];
      const curl = [0.105, 0.17, 0.22, 0.275][i];
      return makeDigit([
        [rootX, 0.25, 0.0],
        [rootX + splay * 0.40, 0.64, 0.018],
        [rootX + splay * 0.82, top - 0.14, curl * 0.42],
        [rootX + splay, top, curl],
      ], [r * 1.08, r, r * 0.93, r * 0.86]);
    }
    const splay = [-0.07, -0.005, 0.034, 0.075][i];
    return makeDigit([
      [rootX, 0.245, -0.008],
      [rootX + splay * 0.5, 0.65, 0.012],
      [rootX + splay, top, 0.040],
    ], [r * 1.08, r, r * 0.87]);
  });
  const thumb = pose === 'fist'
    ? makeDigit([[-0.49, -0.26, 0.075], [-0.57, 0.11, 0.32], [-0.38, 0.33, 0.51], [-0.10, 0.36, 0.54]], [0.21, 0.19, 0.17, 0.15])
    : makeDigit([[-0.415, -0.29, 0.020], [-0.73, -0.045, 0.055], [-0.95, 0.23, pose === 'wave' ? 0.19 : 0.085]], [0.21, 0.184, 0.154]);
  return { fingers, thumb, wrist: prepareSegment([0, -0.66, -0.012], [0, -1.065, -0.015], 0.285, HAND_PARAMETERS.wristRadius, 0.83) };
}

function makeField(description, pose) {
  return (x, y, z) => {
    let distance = ellipsoidDistance(x, y, z, HAND_PARAMETERS.palmCenter, HAND_PARAMETERS.palmRadii);
    distance = smoothMin(distance, segmentDistance(x, y, z, description.wrist), 0.18);
    distance = smoothMin(distance, ellipsoidDistance(x, y, z, [-0.335, -0.30, 0.025], [0.275, 0.355, 0.242]), 0.12);
    const rootBlend = pose === 'fist' ? 0.080 : mix(HAND_PARAMETERS.rootBlend, HAND_PARAMETERS.tipBlend, clamp((y - 0.35) / 0.42));
    for (const finger of description.fingers) {
      let digitDistance = Infinity;
      for (const segment of finger.segments) digitDistance = smoothMin(digitDistance, segmentDistance(x, y, z, segment), HAND_PARAMETERS.jointBlend);
      distance = smoothMin(distance, digitDistance, rootBlend);
    }
    let thumbDistance = Infinity;
    for (const segment of description.thumb.segments) thumbDistance = smoothMin(thumbDistance, segmentDistance(x, y, z, segment), HAND_PARAMETERS.jointBlend);
    return smoothMin(distance, thumbDistance, pose === 'fist' ? 0.070 : mix(0.16, 0.06, clamp((y + 0.22) / 0.36)));
  };
}

// Six tetrahedra per cube share one body diagonal. Every crossing is reused by
// grid-edge key, producing one indexed, closed mesh rather than overlapping parts.
function extractSurface(field) {
  const [min, max] = HAND_PARAMETERS.bounds;
  const step = HAND_PARAMETERS.gridStep;
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const size = nx * ny * nz, slice = nx * ny;
  const values = new Float32Array(size);
  const gx = new Float32Array(size), gy = new Float32Array(size), gz = new Float32Array(size);
  const idx = (i, j, k) => i + nx * j + slice * k;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    values[idx(i, j, k)] = field(min[0] + i * step, min[1] + j * step, min[2] + k * step);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const n = idx(i, j, k);
    gx[n] = (values[n + 1] - values[n - 1]) / (2 * step);
    gy[n] = (values[n + nx] - values[n - nx]) / (2 * step);
    gz[n] = (values[n + slice] - values[n - slice]) / (2 * step);
  }
  const positions = [], normals = [], indices = [], edgeVertices = new Map();
  const nodePosition = (n) => {
    const k = Math.floor(n / slice), remaining = n - k * slice, j = Math.floor(remaining / nx), i = remaining - j * nx;
    return [min[0] + i * step, min[1] + j * step, min[2] + k * step];
  };
  function crossing(a, b) {
    if (a > b) [a, b] = [b, a];
    const key = a * size + b;
    if (edgeVertices.has(key)) return edgeVertices.get(key);
    const t = clamp(values[a] / (values[a] - values[b]));
    const pa = nodePosition(a), pb = nodePosition(b);
    const id = positions.length / 3;
    positions.push(mix(pa[0], pb[0], t), mix(pa[1], pb[1], t), mix(pa[2], pb[2], t));
    const normalX = mix(gx[a], gx[b], t), normalY = mix(gy[a], gy[b], t), normalZ = mix(gz[a], gz[b], t);
    const length = Math.hypot(normalX, normalY, normalZ) || 1;
    normals.push(normalX / length, normalY / length, normalZ / length);
    edgeVertices.set(key, id);
    return id;
  }
  function triangle(a, b, c) {
    const ia = a * 3, ib = b * 3, ic = c * 3;
    const ux = positions[ib] - positions[ia], uy = positions[ib + 1] - positions[ia + 1], uz = positions[ib + 2] - positions[ia + 2];
    const vx = positions[ic] - positions[ia], vy = positions[ic + 1] - positions[ia + 1], vz = positions[ic + 2] - positions[ia + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    // Very small crossing triangles still close the surface. A generous area
    // cutoff punches pinholes near grid nodes that almost touch the isosurface.
    if (cx * cx + cy * cy + cz * cz < 1e-30) return;
    const orientation = cx * (normals[ia] + normals[ib] + normals[ic])
      + cy * (normals[ia + 1] + normals[ib + 1] + normals[ic + 1])
      + cz * (normals[ia + 2] + normals[ib + 2] + normals[ic + 2]);
    indices.push(a, orientation >= 0 ? b : c, orientation >= 0 ? c : b);
  }
  const offsets = [0, 1, 1 + nx, nx, slice, slice + 1, slice + 1 + nx, slice + nx];
  const tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const origin = idx(i, j, k), nodes = offsets.map((offset) => origin + offset);
    if (nodes.every((n) => values[n] >= 0) || nodes.every((n) => values[n] < 0)) continue;
    for (const tetra of tetrahedra) {
      const inside = [], outside = [];
      for (const local of tetra) (values[nodes[local]] < 0 ? inside : outside).push(nodes[local]);
      if (!inside.length || !outside.length) continue;
      if (inside.length === 1) {
        triangle(...outside.map((n) => crossing(inside[0], n)));
      } else if (outside.length === 1) {
        triangle(...inside.map((n) => crossing(outside[0], n)));
      } else {
        const a = crossing(inside[0], outside[0]), b = crossing(inside[0], outside[1]);
        const c = crossing(inside[1], outside[0]), d = crossing(inside[1], outside[1]);
        triangle(a, b, c); triangle(b, d, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingSphere();
  geometry.userData = { vertices: positions.length / 3, triangles: indices.length / 3, grid: [nx, ny, nz], centerOffset: center.toArray() };
  return geometry;
}

function makeBaseline(description, material) {
  const group = new THREE.Group();
  const sphereGeometry = new THREE.SphereGeometry(1, 18, 12);
  function ellipsoid(center, radii) {
    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.position.fromArray(center); mesh.scale.fromArray(radii); group.add(mesh);
  }
  ellipsoid(HAND_PARAMETERS.palmCenter, HAND_PARAMETERS.palmRadii);
  const allSegments = [description.wrist, ...description.fingers.flatMap((d) => d.segments), ...description.thumb.segments];
  for (const segment of allSegments) {
    const a = new THREE.Vector3().fromArray(segment.a), b = new THREE.Vector3().fromArray(segment.b);
    const vector = b.clone().sub(a), length = vector.length();
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(segment.radiusB, segment.radiusA, length, 14, 1), material);
    cylinder.position.copy(a).add(b).multiplyScalar(0.5);
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
    group.add(cylinder);
    ellipsoid(segment.a, [segment.radiusA, segment.radiusA, segment.radiusA * segment.depthScale]);
    ellipsoid(segment.b, [segment.radiusB, segment.radiusB, segment.radiusB * segment.depthScale]);
  }
  const box = new THREE.Box3().setFromObject(group), center = box.getCenter(new THREE.Vector3());
  for (const child of group.children) child.position.sub(center);
  return group;
}

export function validateHandGeometry(group) {
  const meshes = [];
  group.traverse((object) => { if (object.isMesh) meshes.push(object); });
  if (meshes.length !== 1) return { meshCount: meshes.length, continuousSurface: false, reason: 'baseline overlapping primitives' };
  const geometry = meshes[0].geometry, points = geometry.attributes.position.array, normals = geometry.attributes.normal.array;
  const vertexCount = geometry.attributes.position.count, indices = geometry.index.array;
  const parent = Int32Array.from({ length: vertexCount }, (_, i) => i);
  const rank = new Uint8Array(vertexCount), used = new Set(), edges = new Map();
  const root = (v) => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; };
  const unite = (a, b) => {
    a = root(a); b = root(b); if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a; if (rank[a] === rank[b]) rank[a]++;
  };
  for (let n = 0; n < indices.length; n += 3) {
    const a = indices[n], b = indices[n + 1], c = indices[n + 2];
    used.add(a); used.add(b); used.add(c); unite(a, b); unite(b, c);
    for (let [u, v] of [[a, b], [b, c], [c, a]]) {
      if (u > v) [u, v] = [v, u];
      const key = u * vertexCount + v;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let boundaryEdges = 0, nonManifoldEdges = 0;
  for (const count of edges.values()) { if (count === 1) boundaryEdges++; else if (count !== 2) nonManifoldEdges++; }
  const connectedComponents = new Set([...used].map(root)).size;
  const finite = points.every(Number.isFinite) && normals.every(Number.isFinite);
  return {
    meshCount: 1, vertices: vertexCount, triangles: indices.length / 3,
    connectedComponents, boundaryEdges, nonManifoldEdges, finite,
    eulerCharacteristic: used.size - edges.size + indices.length / 3,
    continuousSurface: finite && connectedComponents === 1 && boundaryEdges === 0 && nonManifoldEdges === 0,
  };
}

export function createHand(pose = 'open', { revision = 'final' } = {}) {
  if (!['open', 'fist', 'wave'].includes(pose)) throw new Error(`Unknown hand pose: ${pose}`);
  if (!['baseline', 'final'].includes(revision)) throw new Error(`Unknown hand revision: ${revision}`);
  const started = performance.now();
  const description = describePose(pose);
  const material = new THREE.MeshStandardMaterial({ color: HAND_PARAMETERS.color, roughness: HAND_PARAMETERS.roughness, metalness: 0 });
  const group = revision === 'baseline' ? makeBaseline(description, material) : new THREE.Group();
  if (revision === 'final') {
    const mesh = new THREE.Mesh(extractSurface(makeField(description, pose)), material);
    mesh.name = `continuous-hand-${pose}`;
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.name = `hand-${pose}-${revision}`;
  let triangles = 0;
  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true; object.receiveShadow = true;
      triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3;
    }
  });
  group.userData = {
    kind: 'hand', pose, revision, buildMs: performance.now() - started, triangles,
    parameters: { ...HAND_PARAMETERS, fingers: description.fingers.map(({ points, radii }) => ({ points, radii })), thumb: { points: description.thumb.points, radii: description.thumb.radii } },
  };
  group.userData.validation = validateHandGeometry(group);
  return group;
}
