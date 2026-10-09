import * as THREE from '../vendor/three.module.js';

// Units are arbitrary toy units: toe +Z, heel -Z, height +Y.
// The upper is an annulus: its inner boundary is a real opening, not a painted oval.
export const SHOE_PARAMETERS = Object.freeze({
  length: 3.13,
  widestWidth: 1.50,
  heelWidth: 0.98,
  upperAngularSegments: 128,
  upperRadialSegments: 24,
  soleSegments: 128,
  collarCenterZ: -0.76,
  collarHalfWidth: 0.355,
  collarHalfLength: 0.48,
  upperBaseY: -0.27,
  collarFrontY: 0.51,
  collarRearY: 0.71,
  crownExponent: 0.60,
  soleBottomY: -0.53,
  soleTopY: -0.265,
  studCount: 10,
  studHeight: 0.26,
  stripeCountPerSide: 3,
  stripeProjectedWidth: 0.14,
  stripeTopY: 0.40,
  stripeBottomY: -0.16,
  stripeSlantZ: 0.28,
  laceRadius: 0.025,
  referenceMatched: false,
});

export const SHOE_DETAILS = Object.freeze({
  dense: { upperAngularSegments: 128, upperRadialSegments: 24, soleSegments: 128, collarSegments: 96, liningRows: 8, rimSegments: 112, tubeRadialSegments: 8, stripeRows: 30, stripeCols: 6, tongueRows: 32, tongueCols: 12, eyelets: true, eyeletRadialSegments: 6, eyeletTubularSegments: 12, studSegments: 16, studProfile: 'full', ribDetails: true, segmentScale: 1, knotWidthSegments: 12, knotHeightSegments: 8 },
  balanced: { upperAngularSegments: 48, upperRadialSegments: 10, soleSegments: 48, collarSegments: 32, liningRows: 4, rimSegments: 40, tubeRadialSegments: 6, stripeRows: 12, stripeCols: 2, tongueRows: 12, tongueCols: 5, eyelets: true, eyeletRadialSegments: 4, eyeletTubularSegments: 8, studSegments: 10, studProfile: 'full', ribDetails: true, segmentScale: 0.5, knotWidthSegments: 8, knotHeightSegments: 6 },
  mobile: { upperAngularSegments: 16, upperRadialSegments: 3, soleSegments: 16, collarSegments: 8, liningRows: 1, rimSegments: 10, tubeRadialSegments: 3, stripeRows: 3, stripeCols: 1, tongueRows: 3, tongueCols: 1, eyelets: false, eyeletRadialSegments: 3, eyeletTubularSegments: 6, studSegments: 6, studProfile: 'short', ribDetails: false, segmentScale: 0.15, knotWidthSegments: 4, knotHeightSegments: 2 },
});

export function createShoe({ revision = 'final', detail = 'mobile' } = {}) {
  if (!SHOE_DETAILS[detail]) throw new Error(`Unknown shoe detail: ${detail}`);
  const started = performance.now();
  const P = { ...SHOE_PARAMETERS, ...SHOE_DETAILS[detail] };
const TAU = Math.PI * 2;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;

const outlineControls = [
  [0, 1.63], [0.38, 1.54], [0.65, 1.25], [0.75, 0.80],
  [0.71, 0.30], [0.60, -0.18], [0.53, -0.66], [0.49, -1.15],
  [0.38, -1.40], [0, -1.50], [-0.38, -1.40], [-0.49, -1.15],
  [-0.53, -0.66], [-0.60, -0.18], [-0.71, 0.30], [-0.75, 0.80],
  [-0.65, 1.25], [-0.38, 1.54],
];
const footprintCurve = new THREE.CatmullRomCurve3(
  outlineControls.map(([x, z]) => v3(x, 0, z)), true, 'centripetal',
);
const footprint = footprintCurve.getPoints(512);
const outerPointCache = new Map();

function material(color, roughness = 0.58) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.025 });
}

function addMesh(group, geometry, mat, name) {
  if (detail === 'mobile' && geometry.index) {
    // Lathe axis rings and tapered decal endpoints contain zero-area faces.
    // Removing only these faces preserves every visible surface and silhouette.
    const position = geometry.attributes.position, old = geometry.index.array, clean = [];
    for (let i = 0; i < old.length; i += 3) {
      const a = v3().fromBufferAttribute(position, old[i]);
      const b = v3().fromBufferAttribute(position, old[i + 1]).sub(a);
      const c = v3().fromBufferAttribute(position, old[i + 2]).sub(a);
      if (b.cross(c).lengthSq() > 1e-24) clean.push(old[i], old[i + 1], old[i + 2]);
    }
    geometry.setIndex(clean);
  }
  geometry.userData.vertices = geometry.attributes.position.count;
  geometry.userData.triangles = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function indexedGeometry(points, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Intersect a ray from the collar centre with the closed spline silhouette.
// Mapping both boundaries by direction avoids twists around the opening.
function outerPoint(theta) {
  if (outerPointCache.has(theta)) return outerPointCache.get(theta);
  const dx = Math.sin(theta);
  const dz = Math.cos(theta);
  let distance = Infinity;
  for (let i = 0; i < footprint.length - 1; i++) {
    const a = footprint[i];
    const b = footprint[i + 1];
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const az = a.z - P.collarCenterZ;
    const determinant = dx * sz - dz * sx;
    if (Math.abs(determinant) < 1e-9) continue;
    const rayT = (a.x * sz - az * sx) / determinant;
    const segmentT = (a.x * dz - az * dx) / determinant;
    if (rayT > 0 && segmentT >= 0 && segmentT <= 1) distance = Math.min(distance, rayT);
  }
  if (!Number.isFinite(distance)) throw new Error('Shoe silhouette ray did not intersect.');
  const point = v3(dx * distance, 0, P.collarCenterZ + dz * distance);
  outerPointCache.set(theta, point);
  return point;
}

// Radius of an ellipse in this direction, not merely sin/cos ellipse sampling.
function innerPoint(theta) {
  const dx = Math.sin(theta);
  const dz = Math.cos(theta);
  const r = 1 / Math.sqrt((dx / P.collarHalfWidth) ** 2 + (dz / P.collarHalfLength) ** 2);
  return v3(r * dx, 0.61 - 0.10 * dz, P.collarCenterZ + r * dz);
}

function upperPoint(t, theta) {
  const inside = innerPoint(theta);
  const outside = outerPoint(theta);
  const toeLift = 0.045 * Math.max(0, outside.z / 1.63) ** 2;
  const base = P.upperBaseY + toeLift;
  const p = inside.clone().lerp(outside, t);
  p.y = base + (inside.y - base) * Math.pow(Math.max(0, Math.cos(t * Math.PI / 2)), P.crownExponent);
  return p;
}

function surfaceNormal(t, theta) {
  const dt = upperPoint(clamp(t + 0.001, 0, 1), theta)
    .sub(upperPoint(clamp(t - 0.001, 0, 1), theta));
  const dtheta = upperPoint(t, theta + 0.001).sub(upperPoint(t, theta - 0.001));
  return dt.cross(dtheta).normalize();
}

function upperGeometry() {
  const positions = [];
  const indices = [];
  const n = P.upperAngularSegments;
  for (let j = 0; j <= P.upperRadialSegments; j++) {
    for (let i = 0; i < n; i++) {
      const p = upperPoint(j / P.upperRadialSegments, i / n * TAU);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < P.upperRadialSegments; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + (i + 1) % n;
      const c = (j + 1) * n + i;
      const d = (j + 1) * n + (i + 1) % n;
      indices.push(a, c, b, b, c, d);
    }
  }
  return indexedGeometry(positions, indices);
}

function soleGeometry(levels) {
  const positions = [];
  const indices = [];
  const n = P.soleSegments;
  for (const [y, scale] of levels) {
    for (let i = 0; i < n; i++) {
      const p = footprintCurve.getPoint(i / n);
      const toeLift = 0.035 * Math.max(0, p.z / 1.63) ** 2;
      positions.push(p.x * scale, y + toeLift, (p.z - 0.06) * scale + 0.06);
    }
  }
  for (let j = 0; j < levels.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + (i + 1) % n;
      const c = (j + 1) * n + i;
      const d = (j + 1) * n + (i + 1) % n;
      indices.push(a, b, c, b, d, c);
    }
  }
  const bottomCentre = positions.length / 3;
  positions.push(0, levels[0][0], 0.06);
  const topCentre = positions.length / 3;
  positions.push(0, levels.at(-1)[0], 0.06);
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    indices.push(bottomCentre, next, i);
    const offset = (levels.length - 1) * n;
    indices.push(topCentre, offset + i, offset + next);
  }
  return indexedGeometry(positions, indices);
}

function tube(group, points, radius, mat, name, closed = false, segments = 40) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const phoneSteps = name === 'crossed-round-lace' ? 2 : name === 'soft-lace-bow' ? 3 : name === 'tongue-rounded-edge' ? 2 : null;
  const pathSegments = detail === 'mobile' && phoneSteps ? phoneSteps : Math.max(3, Math.round(segments * P.segmentScale));
  return addMesh(group, new THREE.TubeGeometry(curve, pathSegments, radius, P.tubeRadialSegments, closed), mat, name);
}

function cavity(group, lining, rimMaterial) {
  const positions = [];
  const indices = [];
  const n = P.collarSegments;
  for (let j = 0; j <= P.liningRows; j++) {
    const depth = j / P.liningRows;
    for (let i = 0; i < n; i++) {
      const p = innerPoint(i / n * TAU);
      const radiusScale = 1 - 0.15 * depth;
      positions.push(p.x * radiusScale, THREE.MathUtils.lerp(p.y, -0.14, depth),
        P.collarCenterZ + (p.z - P.collarCenterZ) * radiusScale);
    }
  }
  for (let j = 0; j < P.liningRows; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + (i + 1) % n;
      const c = (j + 1) * n + i;
      const d = (j + 1) * n + (i + 1) % n;
      // Faces point inward, into the empty collar.
      indices.push(a, b, c, b, d, c);
    }
  }
  const centre = positions.length / 3;
  positions.push(0, -0.14, P.collarCenterZ);
  for (let i = 0; i < n; i++) indices.push(centre, P.liningRows * n + i, P.liningRows * n + (i + 1) % n);
  addMesh(group, indexedGeometry(positions, indices), lining, 'actual-open-collar-lining');
  const rimPoints = Array.from({ length: P.collarSegments }, (_, i) => innerPoint(i / P.collarSegments * TAU));
  tube(group, rimPoints, 0.045, rimMaterial, 'padded-collar-rim', true, P.rimSegments / P.segmentScale);
}

// Invert the crown formula at a requested elevation, then solve the ray angle
// for the requested Z. Equal Y/Z patches give equal-width, parallel side marks;
// equal angular patches do not, because heel/toe radii differ.
function sidePointAt(z, y, side) {
  const atAngle = theta => {
    const inside = innerPoint(theta);
    const outside = outerPoint(theta);
    const base = P.upperBaseY + 0.045 * Math.max(0, outside.z / 1.63) ** 2;
    const crown = clamp((y - base) / (inside.y - base), 0, 1);
    const t = 2 / Math.PI * Math.acos(Math.pow(crown, 1 / P.crownExponent));
    return { t, p: upperPoint(t, theta) };
  };
  let low = 0;
  let high = Math.PI;
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    if (atAngle(mid).p.z > z) low = mid;
    else high = mid;
  }
  const theta = side * (low + high) / 2;
  const { t, p } = atAngle(theta);
  return p.addScaledVector(surfaceNormal(t, theta), 0.010);
}

function surfacePatch(group, centreZ, side, mat, name) {
  const positions = [];
  const indices = [];
  const rows = P.stripeRows;
  const cols = P.stripeCols;
  for (let row = 0; row <= rows; row++) {
    const u = row / rows;
    const y = THREE.MathUtils.lerp(P.stripeTopY, P.stripeBottomY, u);
    // Short taper makes the decal's ends rounded in silhouette.
    const rounding = Math.sqrt(clamp(Math.sin(u * Math.PI) * 7, 0, 1));
    const z = centreZ + P.stripeSlantZ * (u - 0.5);
    for (let col = 0; col <= cols; col++) {
      const p = sidePointAt(z + P.stripeProjectedWidth * rounding * (col / cols - 0.5), y, side);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = row * (cols + 1) + col;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      if (side > 0) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  return addMesh(group, indexedGeometry(positions, indices), mat, name);
}

function topHeight(x, z) {
  const theta = Math.atan2(x, z - P.collarCenterZ);
  const inside = innerPoint(theta);
  const outside = outerPoint(theta);
  const radius = Math.hypot(x, z - P.collarCenterZ);
  const innerRadius = Math.hypot(inside.x, inside.z - P.collarCenterZ);
  const outerRadius = Math.hypot(outside.x, outside.z - P.collarCenterZ);
  const t = clamp((radius - innerRadius) / (outerRadius - innerRadius), 0, 1);
  return upperPoint(t, theta).y;
}

function tongueAndLaces(group, tongueMaterial, laceMaterial, eyeletMaterial) {
  const positions = [];
  const indices = [];
  const rows = P.tongueRows;
  const cols = P.tongueCols;
  for (let row = 0; row <= rows; row++) {
    const u = row / rows;
    const z = THREE.MathUtils.lerp(-0.55, 0.94, u);
    const width = 0.26 * (0.92 + 0.08 * Math.sin(u * Math.PI));
    for (let col = 0; col <= cols; col++) {
      const across = col / cols * 2 - 1;
      const x = width * across;
      const y = z < -0.21 ? 0.62 - (z + 0.55) * 0.24 : topHeight(x, z) + 0.024;
      positions.push(x, y + 0.024 * (1 - across ** 2), z);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = row * (cols + 1) + col;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const tongue = addMesh(group, indexedGeometry(positions, indices), tongueMaterial, 'padded-tongue');
  tongue.material.side = THREE.DoubleSide;
  // Round top edge hides the open edge of the thin decorative tongue panel.
  tube(group, [v3(-0.23, 0.62, -0.55), v3(0, 0.66, -0.58), v3(0.23, 0.62, -0.55)],
    0.023, tongueMaterial, 'tongue-rounded-edge', false, 20);
  const rowsZ = [-0.05, 0.13, 0.31, 0.49, 0.67];
  const anchors = rowsZ.map((z) => {
    const halfWidth = 0.30 + z * 0.025;
    const y = topHeight(halfWidth, z) + 0.045;
    for (const side of P.eyelets ? [-1, 1] : []) {
      const ring = addMesh(group, new THREE.TorusGeometry(0.047, 0.012, P.eyeletRadialSegments, P.eyeletTubularSegments), eyeletMaterial, 'lace-eyelet');
      ring.position.set(side * halfWidth, y - 0.012, z);
      ring.rotation.x = -Math.PI / 2 - 0.22;
    }
    return { z, halfWidth, y };
  });
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    for (const side of [-1, 1]) {
      const midZ = (a.z + b.z) / 2;
      tube(group, [v3(side * a.halfWidth, a.y, a.z), v3(0, topHeight(0, midZ) + 0.083, midZ),
        v3(-side * b.halfWidth, b.y, b.z)], P.laceRadius, laceMaterial, 'crossed-round-lace', false, 16);
    }
  }
  const first = anchors[0];
  const knotY = topHeight(0, first.z) + 0.105;
  const knot = addMesh(group, new THREE.SphereGeometry(0.052, P.knotWidthSegments, P.knotHeightSegments), laceMaterial, 'lace-knot');
  knot.position.set(0, knotY, first.z);
  for (const side of [-1, 1]) {
    tube(group, [v3(0, knotY, first.z), v3(side * 0.14, knotY + 0.01, first.z - 0.12),
      v3(side * 0.24, knotY, first.z - 0.025), v3(side * 0.09, knotY + 0.015, first.z + 0.04),
      v3(0, knotY, first.z)], 0.018, laceMaterial, 'soft-lace-bow', false, 28);
  }
}

const studLayout = [
  [-0.34, 1.25], [0.34, 1.25], [-0.56, 0.75], [0.56, 0.75],
  [-0.50, 0.20], [0.50, 0.20], [-0.32, -0.74], [0.32, -0.74],
  [-0.30, -1.19], [0.30, -1.19],
];

function studs(group, studMaterial, accentMaterial) {
  const profile = P.studProfile === 'short' ? [[0, -0.14], [0.08, -0.14], [0.13, 0.09], [0, 0.12]] : [[0, -0.14], [0.074, -0.14], [0.10, -0.124],
    [0.113, -0.08], [0.13, 0.092], [0.115, 0.12], [0, 0.12]];
  const geometry = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), P.studSegments);
  for (const [x, z] of studLayout) {
    const stud = addMesh(group, geometry, studMaterial, 'rounded-football-stud');
    stud.position.set(x, -0.635 + 0.025 * Math.max(0, z / 1.63) ** 2, z);
  }
  if (!P.ribDetails) return;
  // Underfoot ribs connect paired lugs; they remain visible in the bottom view.
  for (const z of [-1.19, -0.74, 0.20, 0.75, 1.25]) {
    const halfWidth = z > 0.5 ? (z > 1 ? 0.34 : 0.56) : z > 0 ? 0.50 : 0.31;
    tube(group, [v3(-halfWidth, -0.525, z), v3(0, -0.53, z + 0.025), v3(halfWidth, -0.525, z)],
      0.023, accentMaterial, 'sole-lug-bridge', false, 16);
  }
  tube(group, [v3(0, -0.533, -1.30), v3(0, -0.54, -0.3), v3(0, -0.53, 0.75), v3(0, -0.515, 1.36)],
    0.025, accentMaterial, 'sole-longitudinal-rib', false, 32);
}

function baselineShoe(group, materials) {
  const upper = addMesh(group, new THREE.SphereGeometry(1, 28, 18), materials.upper, 'baseline-ellipsoid-upper');
  upper.scale.set(0.73, 0.56, 1.53);
  upper.position.set(0, 0.03, 0.05);
  const sole = addMesh(group, new THREE.SphereGeometry(1, 28, 12), materials.sole, 'baseline-ellipsoid-sole');
  sole.scale.set(0.78, 0.11, 1.61);
  sole.position.set(0, -0.43, 0.05);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const stripe = addMesh(group, new THREE.BoxGeometry(0.022, 0.49, 0.115), materials.stripe, 'baseline-flat-stripe');
      stripe.position.set(side * 0.69, -0.04, -0.37 + i * 0.31);
      stripe.rotation.x = -0.36;
    }
  }
  for (const [x, z] of studLayout) {
    const stud = addMesh(group, new THREE.CylinderGeometry(0.12, 0.10, 0.21, 10), materials.stud, 'baseline-cylinder-stud');
    stud.position.set(x, -0.61, z);
  }
}

  const group = new THREE.Group();
  group.name = `football-shoe-${revision}`;
  const materials = {
    upper: material('#209999'),
    sole: material('#f6e9cd', 0.67),
    outsole: material('#20475b', 0.73),
    stripe: material('#fff3dc', 0.61),
    lining: material('#163e50', 0.9),
    collar: material('#11646c', 0.71),
    tongue: material('#147c83', 0.72),
    lace: material('#ffb291', 0.66),
    eyelet: material('#f2d7b4', 0.5),
    stud: material('#d5ed84', 0.53),
    rib: material('#548181', 0.74),
  };
  if (revision === 'baseline') {
    baselineShoe(group, materials);
  } else {
    addMesh(group, upperGeometry(), materials.upper, 'continuous-annular-upper');
    addMesh(group, soleGeometry(detail === 'mobile' ? [[-0.49, 0.970], [-0.475, 1.024], [-0.30, 1.026], [-0.265, 0.989]] : [[-0.49, 0.970], [-0.475, 1.024], [-0.40, 1.043],
      [-0.30, 1.026], [-0.265, 0.989]]), materials.sole, 'separate-bevelled-sole');
    addMesh(group, soleGeometry(detail === 'mobile' ? [[-0.53, 0.971], [-0.477, 1.024]] : [[-0.53, 0.971], [-0.515, 1.014], [-0.477, 1.024]]),
      materials.outsole, 'separate-dark-outsole');
    cavity(group, materials.lining, materials.collar);
    for (const side of [-1, 1]) {
      for (const [i, centreZ] of [-0.52, -0.20, 0.12].entries()) {
        surfacePatch(group, centreZ, side, materials.stripe, `conforming-side-stripe-${side}-${i + 1}`);
      }
    }
    tongueAndLaces(group, materials.tongue, materials.lace, materials.eyelet);
    studs(group, materials.stud, materials.rib);
    const toeSeam = Array.from({ length: 40 }, (_, i) => {
      const theta = -0.71 + i / 39 * 1.42;
      return upperPoint(0.74, theta).addScaledVector(surfaceNormal(0.74, theta), 0.004);
    });
    if (detail !== 'mobile') tube(group, toeSeam, 0.008, materials.collar, 'subtle-toe-panel-line', false, 44);
  }
  let triangles = 0;
  group.traverse(object => { if (object.isMesh) triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3; });
  group.userData = {
    triangles,
    buildMs: performance.now() - started,
    revision, detail,
    anklePivot: [0, 0.61, P.collarCenterZ],
    parameters: P,
    referenceStatus: 'No target images were available; modeled from the written brief.',
  };
  return group;
}
