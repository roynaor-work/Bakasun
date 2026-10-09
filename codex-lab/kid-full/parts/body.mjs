import * as THREE from '../vendor/three.module.js';

// All dimensions are in head units. The module deliberately has no renderer,
// camera or lighting: a caller can compare stages under exactly the same rig.
export const PALETTES = {
  blue: { shirt: '#214eb7', shorts: '#1c4099', trim: '#fff6e9', skin: '#edac78', stripe: '#244ba7' },
  coral: { shirt: '#df735a', shorts: '#296c71', trim: '#fff4db', skin: '#edac78', stripe: '#296c71' },
};

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
// Keep radial resolution independent from height: broad toy silhouettes need
// fewer slices, while the exposed knee still needs closely spaced fold samples.
// The dense preset preserves the original 59,920-triangle teaching specimen.
const TESSELLATION = {
  dense: { torsoRadial:48, torsoHeight:34, neckRadial:48, neckHeight:20,
    shirtRadial:64, shirtHeight:58, collarRadial:80, collarHeight:6, hemHeight:5,
    limbRadial:48, armHeight:38, sleeveHeight:36, cuffHeight:7, cuffLipHeight:5,
    shortsRadial:64, shortsHeight:36, shortsHemHeight:4, stripeHeight:24, stripeWidth:3,
    legHeight:42, sockHeight:42, numberSegments:18 },
  balanced: { torsoRadial:24, torsoHeight:16, neckRadial:32, neckHeight:12,
    shirtRadial:32, shirtHeight:32, collarRadial:48, collarHeight:6, hemHeight:3,
    limbRadial:32, armHeight:30, sleeveHeight:26, cuffHeight:4, cuffLipHeight:3,
    armExposedHeight:24, armCoveredHeight:6,
    shortsRadial:32, shortsHeight:28, shortsHemHeight:2, stripeHeight:16, stripeWidth:2,
    legHeight:30, legCoveredLowHeight:8, legExposedHeight:16, legCoveredHighHeight:6,
    sockHeight:28, numberSegments:12 },
  mobile: { torsoRadial:8, torsoHeight:4, neckRadial:10, neckHeight:3,
    shirtRadial:12, shirtHeight:12, collarRadial:16, collarHeight:2, hemHeight:1,
    limbRadial:8, armHeight:8, sleeveHeight:8, cuffHeight:1, cuffLipHeight:1,
    armExposedHeight:6, armCoveredHeight:3,
    shortsRadial:10, shortsHeight:8, shortsHemHeight:1, stripeHeight:5, stripeWidth:1,
    legHeight:10, legCoveredLowHeight:3, legExposedHeight:5, legCoveredHighHeight:3,
    sockHeight:8, numberSegments:4 },
};
const gauss = (n, center, width) => Math.exp(-(((n - center) / width) ** 2));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Cubic Hermite interpolation shares slopes across the radius/path knots.
function profile(rows, y, key) {
  if (y <= rows[0].y) return rows[0][key];
  if (y >= rows.at(-1).y) return rows.at(-1)[key];
  const i = rows.findIndex((r, n) => n + 1 < rows.length && y >= r.y && y <= rows[n + 1].y);
  const a = rows[i], b = rows[i + 1], before = rows[Math.max(0, i - 1)], after = rows[Math.min(rows.length - 1, i + 2)];
  const t = (y - a.y) / (b.y - a.y), distance = b.y - a.y;
  const m0 = (b[key] - before[key]) / (b.y - before.y);
  const m1 = (after[key] - a[key]) / (after.y - a.y);
  return (2*t*t*t-3*t*t+1)*a[key] + (t*t*t-2*t*t+t)*distance*m0
    + (-2*t*t*t+3*t*t)*b[key] + (t*t*t-t*t)*distance*m1;
}

const shirtRows = [
  { y: .918, rx: .320, rz: .197 },
  { y: .948, rx: .331, rz: .203 },
  { y: 1.04, rx: .316, rz: .196 },
  { y: 1.19, rx: .304, rz: .195 },
  { y: 1.34, rx: .308, rz: .203 },
  { y: 1.44, rx: .319, rz: .195 },
  { y: 1.49, rx: .281, rz: .160 },
];

function shirtFold(x, y, theta, enabled) {
  if (!enabled) return 0;
  const front = Math.abs(Math.sin(theta)) ** 3;
  const side = gauss(Math.abs(x), .265, .085);
  const underarmY = 1.202 + .45 * (Math.abs(x) - .22);
  const underarm = side * (.012 * gauss(y, underarmY, .044) - .006 * gauss(y, underarmY + .052, .035));
  const waistY = 1.005 + .065 * Math.sin(theta) + .095 * x;
  const waist = front * (.009 * gauss(y, waistY, .035) - .004 * gauss(y, waistY + .039, .036));
  const flank = .003 * gauss(y, 1.10, .14) * Math.cos(theta * 4);
  return underarm + waist + flank;
}

function jerseyRadii(y) {
  let rx = profile(shirtRows, y, 'rx'), rz = profile(shirtRows, y, 'rz');
  const topBlend = smooth(1.36, 1.58, y);
  rx = THREE.MathUtils.lerp(rx, .132, topBlend);
  rz = THREE.MathUtils.lerp(rz, .112, topBlend);
  // Narrow the hem and torso, while keeping the opening clear of the neck.
  rx *= THREE.MathUtils.lerp(.90, 1, smooth(1.49, 1.58, y));
  return {rx,rz};
}

function jerseyPoint(y, theta, folded, extra = 0) {
  const {rx,rz} = jerseyRadii(y);
  const x = rx * Math.cos(theta);
  const delta = shirtFold(x, y, theta, folded);
  // The ring closes at a V opening, not a plugged cone at the neck.
  const roundedAbsX = (Math.sqrt(Math.cos(theta)**2 + .0025) - .05) / (Math.sqrt(1.0025)-.05);
  const vDip = Math.sin(theta) > 0 ? 1 - roundedAbsX : 0;
  const mappedY = y - .118 * vDip * smooth(1.24, 1.58, y);
  return new THREE.Vector3((rx + delta + extra) * Math.cos(theta), mappedY,
    (rz + delta + extra) * Math.sin(theta));
}

function ringGeometry(ys, sides, point, materialForRow) {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i < ys.length; i++) {
    for (let j = 0; j <= sides; j++) {
      const v = point(ys[i], TAU * j / sides, i);
      positions.push(v.x, v.y, v.z);
      uvs.push(j / sides, i / (ys.length - 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (let i = 0; i < ys.length - 1; i++) {
    const start = indices.length;
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j, b = a + 1, c = a + sides + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    if (materialForRow) {
      const materialIndex = materialForRow((ys[i] + ys[i + 1]) / 2);
      const previous = geometry.groups.at(-1), count = indices.length - start;
      // Five sock colour bands need five draws, rather than one draw per row.
      if (previous && previous.materialIndex === materialIndex && previous.start + previous.count === start) previous.count += count;
      else geometry.addGroup(start, count, materialIndex);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData.radialSegments = sides;
  geometry.userData.ringRows = ys.length;
  geometry.computeVertexNormals();
  // Identical seam vertices must also have identical normals.
  const n = geometry.attributes.normal;
  for (let i = 0; i < ys.length; i++) {
    const a = i * (sides + 1), b = a + sides;
    const v = new THREE.Vector3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
  return geometry;
}

const range = (a, b, steps) => Array.from({ length: steps + 1 }, (_, i) => a + (b - a) * i / steps);

function tubePoint(rows, side, folded = false, type = '') {
  return (y, theta) => {
    const cx = profile(rows, y, 'x') * side, z = profile(rows, y, 'z');
    let rx = profile(rows, y, 'rx'), rz = profile(rows, y, 'rz');
    const epsilon = .003;
    const slopeLow = Math.max(rows[0].y, y - epsilon), slopeHigh = Math.min(rows.at(-1).y, y + epsilon);
    let slope = (profile(rows, slopeHigh, 'x') - profile(rows, slopeLow, 'x')) / Math.max(.0001, slopeHigh-slopeLow) * side;
    // Keep the section tilted through the roof; flattening it late made a ridge.
    const normal = new THREE.Vector3(1, -slope, 0).normalize();
    let puff = 0;
    if (folded && type === 'leg') {
      // A broad kneecap, then a shallow compression at the back of the knee.
      puff = .003 * gauss(y, .545, .07) * Math.max(0, Math.sin(theta))
        - .0018 * gauss(y, .57, .045) * Math.max(0, -Math.sin(theta));
    }
    if (folded && type === 'arm') puff = -.003 * gauss(y, 1.057, .03) * Math.max(0, -Math.sin(theta));
    if (folded && type === 'sleeve') {
      puff = .004 * gauss(y, 1.29, .045) * Math.cos(theta * 2)
        - .003 * gauss(y, 1.35, .03) * Math.cos(theta * 2);
    }
    rx += puff; rz += puff;
    const widthScale = type === 'arm' || type === 'sleeve' ? .95 : 1;
    return new THREE.Vector3((cx + normal.x * rx * Math.cos(theta)) * widthScale, y + normal.y * rx * Math.cos(theta), z + rz * Math.sin(theta));
  };
}

const armRows = [
  { y: .790, x: .496, z: .010, rx: .048, rz: .050 },
  { y: .842, x: .494, z: .010, rx: .057, rz: .060 },
  { y: .960, x: .465, z: .003, rx: .085, rz: .083 },
  { y: 1.065, x: .441, z: -.003, rx: .092, rz: .094 },
  { y: 1.19, x: .387, z: .0, rx: .100, rz: .105 },
  { y: 1.33, x: .335, z: .0, rx: .121, rz: .119 },
  { y: 1.445, x: .263, z: .0, rx: .116, rz: .128 },
];
const sleeveRows = [
  { y: 1.206, x: .382, z: 0, rx: .124, rz: .136 },
  { y: 1.231, x: .375, z: 0, rx: .128, rz: .139 },
  { y: 1.31, x: .343, z: 0, rx: .137, rz: .145 },
  { y: 1.36, x: .318, z: 0, rx: .134, rz: .144 },
  { y: 1.405, x: .296, z: 0, rx: .121, rz: .136 },
  { y: 1.446, x: .276, z: 0, rx: .094, rz: .112 },
  { y: 1.469, x: .265, z: 0, rx: .064, rz: .081 },
  { y: 1.486, x: .257, z: 0, rx: .001, rz: .001 },
];
const legRows = [
  { y: .080, x: .198, z: -.008, rx: .092, rz: .090 },
  { y: .20, x: .197, z: .001, rx: .099, rz: .102 },
  { y: .37, x: .190, z: .000, rx: .122, rz: .114 },
  { y: .48, x: .184, z: .0, rx: .109, rz: .108 },
  { y: .56, x: .180, z: .002, rx: .117, rz: .117 },
  { y: .68, x: .169, z: .0, rx: .136, rz: .138 },
  { y: .84, x: .163, z: -.001, rx: .105, rz: .119 },
];
const sockRows = [
  { y: .080, x: .198, z: -.008, rx: .096, rz: .096 },
  { y: .115, x: .198, z: -.005, rx: .098, rz: .099 },
  { y: .27, x: .194, z: .000, rx: .121, rz: .115 },
  { y: .35, x: .191, z: .000, rx: .130, rz: .122 },
  { y: .43, x: .187, z: .000, rx: .118, rz: .115 },
  { y: .484, x: .184, z: .000, rx: .116, rz: .113 },
  { y: .490, x: .184, z: .000, rx: .112, rz: .110 },
];

function shortsPoint(side, folded) {
  return (y, theta) => {
    // Elliptical leg openings morph into matching halves of a common pelvis.
    // Only the internal D walls coincide; the visible front/back join smoothly.
    const blend = smooth(.705, .86, y);
    const bottomX = .181 + .155 * Math.cos(theta);
    // The waist fits below the narrower shirt; thighs keep the wider openings.
    // An everywhere-positive rounded cosine left a slit at x=0, so the two
    // internal D walls must still meet exactly at the center plane.
    const topX = .282 * Math.max(0, Math.cos(theta));
    let x = THREE.MathUtils.lerp(bottomX, topX, blend);
    const depth = THREE.MathUtils.lerp(.179, .197, smooth(.64, .92, y));
    let z = depth * Math.sin(theta);
    if (folded) {
      const front = Math.abs(Math.sin(theta)) ** 3;
      z += Math.sign(z) * front * (.005 * gauss(y, .71 + .05 * Math.cos(theta), .039)
        - .0025 * gauss(y, .774, .031));
      x += .0025 * gauss(y, .66, .02) * Math.cos(theta);
    }
    return new THREE.Vector3(x * side, y, z);
  };
}

function canvasNumber(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 345px Arial, sans-serif';
  context.fillText('10', 256, 280);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1; // glTF samplers preserve filtering, not anisotropy
  return texture;
}

function numberGeometry(back, folded, segments) {
  const p = [], uv = [], indices = [], nx = segments, ny = segments;
  const width = back ? .268 : .251, height = back ? .283 : .255;
  const cy = back ? 1.288 : 1.258;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = (i / nx - .5) * width, y = cy + (j / ny - .5) * height;
    const {rx} = jerseyRadii(y);
    const theta = (back ? -1 : 1) * Math.acos(clamp(x / rx, -1, 1));
    const v = jerseyPoint(y, theta, folded, .0011);
    p.push(v.x, v.y, v.z);
    uv.push(back ? 1 - i / nx : i / nx, j / ny);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    indices.push(...(back ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

function finishTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d'), data = context.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    // Fixed seed; the texture and every screenshot are deterministic.
    const x = i % 128, y = Math.floor(i / 128);
    const v = 123 + ((x * 17 + y * 29 + x * y * 3) % 11);
    data.data.set([v, v, v, 255], i * 4);
  }
  context.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

function neckGeometry(tessellation) {
  const rows = [
    { y: 1.456, rx: .131, rz: .111 },
    { y: 1.552, rx: .128, rz: .108 },
    { y: 1.633, rx: .119, rz: .106 },
    { y: 1.670, rx: .128, rz: .111 },
  ];
  return ringGeometry(range(1.456, 1.67, tessellation.neckHeight), tessellation.neckRadial, (y, t) => new THREE.Vector3(
    profile(rows, y, 'rx') * Math.cos(t), y, profile(rows, y, 'rz') * Math.sin(t)));
}

function collarGeometry(tessellation) {
  // An annular ribbon follows the actual V-neck opening. No torus or dark line.
  return ringGeometry(range(0, 1, tessellation.collarHeight), tessellation.collarRadial, (v, theta) => {
    // Ascend like the other lofts. Descending rows reversed the collar's
    // winding and only remained visible while DoubleSide hid that mistake.
    return jerseyPoint(1.537+v*.043,theta,false,.0015+.0008*Math.sin(v*Math.PI));
  });
}

function capGeometry(point, y, down, sides) {
  const positions = [], indices = [];
  const ring = Array.from({ length: sides }, (_, i) => point(y, i * TAU / sides));
  const center = ring.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / sides);
  positions.push(center.x, center.y, center.z);
  for (const p of ring) positions.push(p.x, p.y, p.z);
  for (let j = 0; j < sides; j++) {
    const a = j + 1, b = (j + 1) % sides + 1;
    indices.push(...(down ? [0, a, b] : [0, b, a]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

export function buildKidBody({ palette = 'blue', stage = 'final', detail = 'balanced' } = {}) {
  const started = performance.now(), folded = stage === 'final';
  if (!Object.hasOwn(TESSELLATION, detail)) throw new Error('Unknown detail: ' + detail);
  const tessellation = TESSELLATION[detail];
  const p = PALETTES[palette] || PALETTES.blue;
  const group = new THREE.Group(); group.name = 'kid-body';
  const fabricFinish = null; // glTF-safe finish: geometric folds, no renderer-only bump
  const material = (color, roughness) => new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0, side: THREE.DoubleSide,
  });
  const skin = material(p.skin, .52, 'skin'), shirt = material(p.shirt, .65), shorts = material(p.shorts, .69);
  const trim = material(p.trim, .70), stripe = material(p.stripe, .68);
  const add = (name, geometry, mat, part = name) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name; mesh.userData.part = part;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  if (stage === 'blockout') {
    const ellipsoid = (name, center, scale, mat) => {
      const mesh = add(name, new THREE.SphereGeometry(1, 24, 16), mat);
      mesh.position.set(...center); mesh.scale.set(...scale); return mesh;
    };
    ellipsoid('shirt-block', [0, 1.236, 0], [.324, .330, .203], shirt);
    ellipsoid('neck-block', [0, 1.606, 0], [.12, .064, .11], skin);
    ellipsoid('pelvis-block', [0, .854, 0], [.331, .105, .192], shorts);
    for (const side of [-1, 1]) {
      ellipsoid('arm-block', [side * .415, 1.105, 0], [.106, .315, .101], skin).rotation.z = side * .22;
      ellipsoid('sleeve-block', [side * .334, 1.358, 0], [.150, .154, .15], shirt);
      const short = add('short-leg-block', new THREE.CylinderGeometry(.164, .154, .275, 24), shorts);
      short.position.set(side * .181, .777, 0);
      ellipsoid('leg-block', [side * .185, .427, 0], [.121, .341, .117], skin);
      const sock = add('sock-block', new THREE.CylinderGeometry(.118, .096, .410, 24), trim);
      sock.position.set(side * .191, .285, 0);
    }
  } else {
    // Hidden torso remains useful for explaining garment clearance and sockets.
    add('torso', ringGeometry(range(.933, 1.56, tessellation.torsoHeight), tessellation.torsoRadial, (y, t) => {
      const v = jerseyPoint(y, t, false); v.x *= .89;v.z *= .88;v.y -= .01;return v;
    }), skin).castShadow = false;
    add('neck', neckGeometry(tessellation), skin);
    add('jersey', ringGeometry(range(.918, 1.58, tessellation.shirtHeight), tessellation.shirtRadial, (y, t) => jerseyPoint(y, t, folded)), shirt);
    add('collar-v', collarGeometry(tessellation), trim, 'collar');
    // Narrow rolled hem uses the same surface equations, including the folds.
    add('shirt-hem', ringGeometry(range(.922, .943, tessellation.hemHeight), tessellation.shirtRadial, (y, t) => jerseyPoint(y, t, folded, .0017)), shirt, 'hem');
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'left' : 'right';
      const arm = tubePoint(armRows, side, folded, 'arm');
      const sleeve = tubePoint(sleeveRows, side, folded, 'sleeve');
      // Keep the hidden upper end below the closed shoulder roof.
      const armYs = detail === 'dense' ? range(.79, 1.38, tessellation.armHeight)
        : [...range(.79, 1.206, tessellation.armExposedHeight),
          ...range(1.206, 1.38, tessellation.armCoveredHeight).slice(1)];
      add(`arm-${suffix}`, ringGeometry(armYs, tessellation.limbRadial, arm), skin, 'arm');
      add(`wrist-port-${suffix}`, capGeometry(arm, .79, true, tessellation.limbRadial), skin, 'wrist-port');
      add(`sleeve-${suffix}`, ringGeometry(range(1.206, 1.486, tessellation.sleeveHeight), tessellation.limbRadial, sleeve), shirt, 'sleeve');
      const cuffPoint = (y, t) => {
        const v = sleeve(y, t), c = new THREE.Vector3(profile(sleeveRows, y, 'x') * side * .95, y, 0);
        const roll = .002 + .001 * Math.sin((y - 1.206) / .035 * Math.PI);
        return v.add(v.clone().sub(c).normalize().multiplyScalar(roll));
      };
      add(`sleeve-cuff-${suffix}`, ringGeometry(range(1.206, 1.241, tessellation.cuffHeight), tessellation.limbRadial, cuffPoint), trim, 'cuff');
      add(`sleeve-cuff-lip-${suffix}`, ringGeometry(range(0, 1, tessellation.cuffLipHeight), tessellation.limbRadial, (v, t) => {
        const outer = cuffPoint(1.206, t), inner = arm(1.206, t);
        return outer.lerp(inner, v).add(new THREE.Vector3(0, -.0015*Math.sin(v*Math.PI), 0));
      }), trim, 'cuff');
      const pants = shortsPoint(side, folded);
      const mirrorWinding = geometry => {
        if (side < 0) {
          const ix = geometry.index;
          for (let i = 0; i < ix.count; i += 3) { const a=ix.getX(i); ix.setX(i,ix.getX(i+1));ix.setX(i+1,a); }
          geometry.computeVertexNormals();
        }
        return geometry;
      };
      add(`shorts-${suffix}`, mirrorWinding(ringGeometry(range(.641, .959, tessellation.shortsHeight), tessellation.shortsRadial, pants)), shorts, 'shorts');
      add(`shorts-hem-${suffix}`, mirrorWinding(ringGeometry(range(.644, .658, tessellation.shortsHemHeight), tessellation.shortsRadial, (y, t) => {
        const v = pants(y, t); v.x += side * .0013 * Math.cos(t); v.z += .0013 * Math.sin(t); return v;
      })), shorts, 'hem');
      // Two fine vertical stripes lie on each curved outer side of the shorts.
      for (const offset of [-.11, .11]) {
        const pos = [], uv = [], idx = [], rows = tessellation.stripeHeight, cols = tessellation.stripeWidth;
        for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
          const y = .657 + (.944 - .657) * j / rows;
          const theta = offset + (i / cols - .5) * .055;
          const v = pants(y, theta); v.x += side * .0018; pos.push(v.x, v.y, v.z); uv.push(i / cols, j / rows);
        }
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        add(`shorts-stripe-${suffix}-${offset}`, mirrorWinding(g), trim, 'stripe');
      }
      const leg = tubePoint(legRows, side, folded, 'leg');
      const legYs = detail === 'dense' ? range(.08, .84, tessellation.legHeight)
        : [...range(.08, .49, tessellation.legCoveredLowHeight),
          ...range(.49, .641, tessellation.legExposedHeight).slice(1),
          ...range(.641, .84, tessellation.legCoveredHighHeight).slice(1)];
      add(`leg-${suffix}`, ringGeometry(legYs, tessellation.limbRadial, leg), skin, 'leg');
      const sock = tubePoint(sockRows, side);
      const sockYs = [...new Set([...range(.08, .49, tessellation.sockHeight), .438, .450, .469, .481,
        ...(detail === 'balanced' ? [.484] : [])])].sort((a, b) => a - b);
      add(`sock-${suffix}`, ringGeometry(sockYs, tessellation.limbRadial, sock,
        y => (y > .438 && y < .450) || (y > .469 && y < .481) ? 1 : 0), [trim, stripe], 'sock');
      add(`ankle-port-${suffix}`, capGeometry(sock, .08, true, tessellation.limbRadial), trim, 'ankle-port');
    }
    const numberTexture = canvasNumber(p.trim);
    const numberMat = new THREE.MeshStandardMaterial({ map: numberTexture, transparent: true,
      alphaTest: .01, roughness: .71, metalness: 0, depthWrite: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide });
    add('number-10-front', numberGeometry(false, folded, tessellation.numberSegments), numberMat, 'number').castShadow = false;
    add('number-10-back', numberGeometry(true, folded, tessellation.numberSegments), numberMat, 'number').castShadow = false;
  }
  const stats = { triangles: 0, meshes: 0, vertices: 0, buildMs: 0, stage, palette, detail };
  // Match measured vertical landmarks in the reference, after authoring in a
  // regular working coordinate system. Hands are separate, so wrist height has
  // its own map; shortening the legs must not accidentally shorten the arms.
  const bodyLandmarks = [
    { y: .08, finalY: .10 }, { y: .49, finalY: .46 },
    { y: .641, finalY: .57 }, { y: .918, finalY: .856 },
    { y: 1.206, finalY: 1.19 }, { y: 1.446, finalY: 1.49 },
    { y: 1.58, finalY: 1.57 }, { y: 1.67, finalY: 1.60 },
  ];
  const armLandmarks = [
    { y: .70, finalY: .77 }, { y: .79, finalY: .84 },
    { y: 1.206, finalY: 1.19 }, { y: 1.446, finalY: 1.49 },
    { y: 1.58, finalY: 1.57 },
  ];
  const landmarkY = (landmarks, y) => {
    const i = landmarks.findIndex((r, n) => n + 1 < landmarks.length && y >= r.y && y <= landmarks[n + 1].y);
    if (i < 0) return y < landmarks[0].y ? landmarks[0].finalY + y - landmarks[0].y : landmarks.at(-1).finalY + y - landmarks.at(-1).y;
    return profile(landmarks,y,'finalY');
  };
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    // The baseline primitives carry object transforms; bake before remapping.
    mesh.updateMatrix(); mesh.geometry.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
    const positions = mesh.geometry.attributes.position;
    const landmarks = /arm|sleeve|cuff|wrist/.test(mesh.userData.part) ? armLandmarks : bodyLandmarks;
    for (let i = 0; i < positions.count; i++) positions.setY(i, landmarkY(landmarks, positions.getY(i)));
    positions.needsUpdate = true; mesh.geometry.computeVertexNormals();
    // A ring seam is duplicated for UVs. Restore normal continuity after baking
    // the vertical landmark map, which otherwise exposes a long lighting line.
    const radial = mesh.geometry.userData.radialSegments;
    if (radial && positions.count === mesh.geometry.userData.ringRows * (radial + 1)) {
      const n = mesh.geometry.attributes.normal;
      for (let i = 0; i < positions.count / (radial + 1); i++) {
        const a = i * (radial + 1), b = a + radial;
        const v = new THREE.Vector3(n.getX(a)+n.getX(b),n.getY(a)+n.getY(b),n.getZ(a)+n.getZ(b)).normalize();
        n.setXYZ(a,v.x,v.y,v.z);n.setXYZ(b,v.x,v.y,v.z);
      }
    }
    stats.meshes++;
    stats.vertices += mesh.geometry.attributes.position.count;
    stats.triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
  });
  stats.buildMs = performance.now() - started;
  const parameters = {
    headUnit: 1, ankleY: .10, neckTopY: 1.60, bodyHeight: 1.50,
    virtualHeadHeight: 1, virtualShoeClearance: .15, virtualTotalHeadUnits: 2.65,
    bodyLandmarks, armLandmarks,
    shirtRows, armRows, sleeveRows, legRows, sockRows,
    detail, tessellation: { ...tessellation },
    shirtRadialSegments: tessellation.shirtRadial, shirtHeightSegments: tessellation.shirtHeight,
    limbRadialSegments: tessellation.limbRadial, shortsRadialSegments: tessellation.shortsRadial,
    clothClearance: { radial: .031, depth: .022 },
    shirtWidthScale: .90, shirtWidthScaleNeckFade: [1.49,1.58], limbWidthScale: .95,
    shortsWaistRadius: .282, shortsPelvisBlend: [.705,.86],
    foldAmplitude: { underarm: .012, waist: .009, knee: .003, kneeBack: .0018 },
    foldWidths: { underarm: .044, waist: .035, knee: .07, kneeBack: .045 },
    collarAuthoringSpan: .043, collarSurfaceOffset: .0015, cuffHeight: .035, bumpScale: .00045,
    coordinateSystem: '+Y up, +Z front; body stops at flat wrist and ankle ports',
  };
  group.userData.parameters = parameters;
  group.userData.stats = stats;
  const dispose = () => {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(mat); if (mat.map) textures.add(mat.map); if (mat.bumpMap) textures.add(mat.bumpMap);
      }
    });
    // The baseline does not use every material created above.
    [skin, shirt, shorts, trim, stripe].forEach(m => materials.add(m));
    if (fabricFinish) textures.add(fabricFinish);
    textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
  };
  return { group, stats, parameters, dispose };
}
