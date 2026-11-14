/**
 * Asset QA, independent of the generators and preview.
 * npm install --prefix /tmp/fire-chase-tools --cache /tmp/fire-chase-npm-cache \
 *   --no-audit --no-fund gltf-validator@2.0.0-dev.3.10
 * node scripts/validate_assets.mjs
 * Override the validator path with GLTF_VALIDATOR_PATH when needed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const validator = require(process.env.GLTF_VALIDATOR_PATH || '/tmp/fire-chase-tools/node_modules/gltf-validator');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'verification');
await fs.mkdir(path.join(output, 'gltf'), { recursive: true });
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const multiply = (a, b) => Array.from({ length: 16 }, (_, i) => {
  const row = i % 4, col = Math.floor(i / 4);
  return a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
});
const point = (m, p) => [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
function localMatrix(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function unpack(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB v2 header');
  let json, bin;
  for (let at = 12; at < bytes.length;) {
    const size = bytes.readUInt32LE(at), type = bytes.readUInt32LE(at + 4);
    const chunk = bytes.subarray(at + 8, at + 8 + size);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) bin = chunk;
    at += 8 + size;
  }
  if (!json || !bin) throw Error('Missing GLB JSON or BIN');
  return { json, bin };
}
function audit(bytes, filename) {
  const { json: gltf, bin } = unpack(bytes);
  const count = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const readers = { 5120: ['readInt8', 1], 5121: ['readUInt8', 1], 5122: ['readInt16LE', 2], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] };
  const cache = new Map();
  function accessor(i) {
    if (cache.has(i)) return cache.get(i);
    const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
    if (a.sparse || a.bufferView === undefined || v.buffer !== 0) throw Error('Audit supports dense embedded accessors only');
    const [read, size] = readers[a.componentType];
    const components = count[a.type], stride = v.byteStride || size * components;
    const offset = (v.byteOffset || 0) + (a.byteOffset || 0);
    const values = Array.from({ length: a.count }, (_, j) => Array.from({ length: components }, (_, k) => bin[read](offset + stride * j + size * k)));
    cache.set(i, values);
    return values;
  }
  let meshTriangles = 0, vertices = 0, degenerates = 0, oppositeNormals = 0, nonfinite = 0, maxNormalLengthError = 0;
  const primitiveStats = [];
  for (const [mi, mesh] of (gltf.meshes || []).entries()) {
    for (const [pi, p] of mesh.primitives.entries()) {
      if ((p.mode ?? 4) !== 4) throw Error('Expected triangle primitive');
      const positions = accessor(p.attributes.POSITION), normals = p.attributes.NORMAL === undefined ? null : accessor(p.attributes.NORMAL);
      const indices = p.indices === undefined ? positions.map((_, i) => i) : accessor(p.indices).flat();
      let badArea = 0, badFacing = 0;
      for (const v of positions) for (const x of v) if (!Number.isFinite(x)) nonfinite++;
      for (const n of normals || []) maxNormalLengthError = Math.max(maxNormalLengthError, Math.abs(Math.hypot(...n) - 1));
      for (let i = 0; i < indices.length; i += 3) {
        const a = positions[indices[i]], b = positions[indices[i + 1]], c = positions[indices[i + 2]];
        const ab = b.map((v, k) => v - a[k]), ac = c.map((v, k) => v - a[k]);
        const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const area2 = Math.hypot(...cross);
        if (area2 < 1e-10) badArea++;
        else if (normals) {
          const normal = [0, 1, 2].map(k => (normals[indices[i]][k] + normals[indices[i + 1]][k] + normals[indices[i + 2]][k]) / 3);
          if (cross.reduce((v, x, k) => v + x * normal[k], 0) < -area2 * 0.01) badFacing++;
        }
      }
      meshTriangles += indices.length / 3;
      vertices += positions.length;
      degenerates += badArea;
      oppositeNormals += badFacing;
      primitiveStats.push({ mesh: mi, primitive: pi, triangles: indices.length / 3, vertices: positions.length, degenerateTriangles: badArea, oppositeNormalTriangles: badFacing, hasNormals: !!normals });
    }
  }
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let sceneTriangles = 0, visibleTriangles = 0;
  const nodes = [];
  const roadSurfaceTriangles = [];
  function visit(i, parent, parentName, visible = true) {
    const n = gltf.nodes[i], matrix = multiply(parent, localMatrix(n));
    const active = visible && !(n.scale || []).some(x => Math.abs(x) < 1e-8);
    const row = { index: i, name: n.name || `node-${i}`, parent: parentName, translation: n.translation || [0, 0, 0], rotation: n.rotation || [0, 0, 0, 1], scale: n.scale || [1, 1, 1], worldPosition: point(matrix, [0, 0, 0]), visibleByScale: active };
    if (n.mesh !== undefined) {
      row.mesh = n.mesh;
      row.triangles = primitiveStats.filter(p => p.mesh === n.mesh).reduce((sum, p) => sum + p.triangles, 0);
      sceneTriangles += row.triangles;
      if (active) visibleTriangles += row.triangles;
      const nodeBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const p of gltf.meshes[n.mesh].primitives) for (const v of accessor(p.attributes.POSITION)) {
        const xyz = point(matrix, v);
        for (let k = 0; k < 3; k++) {
          nodeBounds.min[k] = Math.min(nodeBounds.min[k], xyz[k]);
          nodeBounds.max[k] = Math.max(nodeBounds.max[k], xyz[k]);
          if (active) {
            bounds.min[k] = Math.min(bounds.min[k], xyz[k]);
            bounds.max[k] = Math.max(bounds.max[k], xyz[k]);
          }
        }
      }
      if (filename.startsWith('road-')) for (const p of gltf.meshes[n.mesh].primitives) {
        if (gltf.materials[p.material]?.name !== 'asphalt') continue;
        const positions = accessor(p.attributes.POSITION).map(v => point(matrix, v));
        const indices = p.indices === undefined ? positions.map((_, i) => i) : accessor(p.indices).flat();
        for (let j = 0; j < indices.length; j += 3) roadSurfaceTriangles.push(indices.slice(j, j + 3).map(k => positions[k]));
      }
      row.worldBounds = nodeBounds;
    }
    nodes.push(row);
    for (const child of n.children || []) visit(child, matrix, row.name, active);
  }
  for (const node of gltf.scenes[gltf.scene || 0].nodes) visit(node, identity(), null);
  bounds.size = bounds.max.map((x, k) => x - bounds.min[k]);
  const externalURIs = [...(gltf.buffers || []), ...(gltf.images || [])].filter(x => x.uri && !x.uri.startsWith('data:')).map(x => x.uri);
  let roadPortChecks;
  if (filename.startsWith('road-')) {
    const ports = [
      { name: 'in', position: [0, 0, -3], inward: [0, 0, 1] },
      filename === 'road-right.glb' ? { name: 'out', position: [3, 0, 0], inward: [-1, 0, 0] }
        : filename === 'road-left.glb' ? { name: 'out', position: [-3, 0, 0], inward: [1, 0, 0] }
          : { name: 'out', position: [0, 0, 3], inward: [0, 0, -1] },
    ];
    if (filename === 'road-cross.glb') ports.push({ name: 'left', position: [-3, 0, 0], inward: [1, 0, 0] }, { name: 'right', position: [3, 0, 0], inward: [-1, 0, 0] });
    function surfaceHeight(x, z) {
      const hits = [];
      for (const [a, b, c] of roadSurfaceTriangles) {
        const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(denominator) < 1e-12) continue;
        const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
        const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
        if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) hits.push(u * a[1] + v * b[1] + (1 - u - v) * c[1]);
      }
      return hits.length ? Math.max(...hits) : null;
    }
    roadPortChecks = ports.map(port => ({
      name: port.name,
      position: port.position,
      sampling: '1mm inside module, transverse offsets ±2.5m/±1.3m/0; asphalt triangles only',
      samples: [-2.5, -1.3, 0, 1.3, 2.5].map(offset => {
        const x = port.position[0] + port.inward[0] * .001 + port.inward[2] * offset;
        const z = port.position[2] + port.inward[2] * .001 - port.inward[0] * offset;
        const y = surfaceHeight(x, z);
        return { x, z, y, passed: y !== null && Math.abs(y) < 1e-6 };
      }),
    }));
  }
  let flameStateChecks;
  if (filename === 'house-burning.glb') {
    const labels = ['Low', 'Medium', 'High'];
    flameStateChecks = labels.map(label => {
      const selected = `Flames${label}`;
      const flameBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      let triangles = 0, meshNodes = 0;
      function selectedWalk(i, parent, inSelected = false) {
        const original = gltf.nodes[i];
        const isState = labels.some(value => original.name === `Flames${value}`);
        const n = isState ? { ...original, scale: original.name === selected ? [1, 1, 1] : [0, 0, 0] } : original;
        const matrix = multiply(parent, localMatrix(n));
        const isSelected = inSelected || original.name === selected;
        if (isSelected && n.mesh !== undefined) {
          meshNodes++;
          for (const p of gltf.meshes[n.mesh].primitives) {
            triangles += p.indices === undefined ? accessor(p.attributes.POSITION).length / 3 : accessor(p.indices).length / 3;
            for (const v of accessor(p.attributes.POSITION)) {
              const xyz = point(matrix, v);
              for (let k = 0; k < 3; k++) {
                flameBounds.min[k] = Math.min(flameBounds.min[k], xyz[k]);
                flameBounds.max[k] = Math.max(flameBounds.max[k], xyz[k]);
              }
            }
          }
        }
        for (const child of n.children || []) selectedWalk(child, matrix, isSelected);
      }
      for (const i of gltf.scenes[gltf.scene || 0].nodes) selectedWalk(i, identity());
      const targetGroups = [1, 2, 3].map(i => `Target${i}${label}`);
      return { label: label.toLowerCase(), node: selected, exists: gltf.nodes.some(n => n.name === selected), defaultScale: gltf.nodes.find(n => n.name === selected)?.scale || [1, 1, 1], targetGroups: targetGroups.map(name => ({ name, exists: gltf.nodes.some(n => n.name === name) })), triangles, meshNodes, boundsWithStateSelected: flameBounds };
    });
  }
  const animations = (gltf.animations || []).map(a => ({
    name: a.name,
    startSeconds: Math.min(...a.samplers.flatMap(s => accessor(s.input).flat())),
    durationSeconds: Math.max(...a.samplers.flatMap(s => accessor(s.input).flat())),
    channels: a.channels.map(c => {
      const sampler = a.samplers[c.sampler], values = accessor(sampler.output);
      const first = values[0], last = values.at(-1);
      const difference = Math.hypot(...first.map((x, k) => x - last[k]));
      // q and -q represent the same rotation; compare physical orientation.
      const seamDelta = c.target.path === 'rotation' ? Math.min(difference, Math.hypot(...first.map((x, k) => x + last[k]))) : difference;
      const maxDeltaFromFirst = Math.max(...values.map(value => {
        const direct = Math.hypot(...first.map((x, k) => x - value[k]));
        return c.target.path === 'rotation' ? Math.min(direct, Math.hypot(...first.map((x, k) => x + value[k]))) : direct;
      }));
      return { node: gltf.nodes[c.target.node].name, path: c.target.path, interpolation: sampler.interpolation || 'LINEAR', keyframes: accessor(sampler.input).length, first, last, seamDelta, maxDeltaFromFirst };
    }),
  }));
  return { meshTriangles, sceneTriangles, defaultVisibleTriangles: visibleTriangles, vertices, degenerateTriangles: degenerates, oppositeNormalTriangles: oppositeNormals, nonfiniteCoordinates: nonfinite, maxNormalLengthError, bounds, externalURIs, nodes, animations, roadPortChecks, flameStateChecks, primitiveStats, materials: (gltf.materials || []).map(m => ({ name: m.name, doubleSided: !!m.doubleSided, alphaMode: m.alphaMode || 'OPAQUE' })) };
}

const names = (await fs.readdir(path.join(root, 'models'))).filter(n => n.endsWith('.glb')).sort();
const results = [];
for (const name of names) {
  const bytes = await fs.readFile(path.join(root, 'models', name));
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: name, maxIssues: 1000 });
  await fs.writeFile(path.join(output, 'gltf', `${name.replace('.glb', '')}.json`), JSON.stringify(report, null, 2) + '\n');
  const geometry = audit(bytes, name);
  const flamesPassed = !geometry.flameStateChecks || (
    geometry.flameStateChecks.every(s => s.exists && s.triangles > 0 && s.targetGroups.every(g => g.exists)
      && s.boundsWithStateSelected.max.every((x, k) => Number.isFinite(x) && x - s.boundsWithStateSelected.min[k] > .01))
    && geometry.flameStateChecks[0].boundsWithStateSelected.max[1] < geometry.flameStateChecks[1].boundsWithStateSelected.max[1]
    && geometry.flameStateChecks[1].boundsWithStateSelected.max[1] < geometry.flameStateChecks[2].boundsWithStateSelected.max[1]
  );
  const passed = report.issues.numErrors === 0 && report.issues.numWarnings === 0 && geometry.degenerateTriangles === 0 && geometry.oppositeNormalTriangles === 0 && geometry.nonfiniteCoordinates === 0 && geometry.externalURIs.length === 0 && (!geometry.roadPortChecks || geometry.roadPortChecks.every(p => p.samples.every(s => s.passed))) && flamesPassed && (name !== 'fire-truck.glb' || geometry.sceneTriangles <= 2700);
  results.push({ file: `models/${name}`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, passed, errors: report.issues.numErrors, warnings: report.issues.numWarnings, infos: report.issues.numInfos, ...geometry, flameSelectionPassed: geometry.flameStateChecks ? flamesPassed : undefined });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${geometry.sceneTriangles} triangles, ${geometry.degenerateTriangles} degenerates, ${geometry.oppositeNormalTriangles} opposite normals${geometry.flameStateChecks ? `, flame selection ${flamesPassed ? 'PASS' : 'FAIL'}` : ''}`);
}
const summary = {
  generatedAtUTC: new Date().toISOString(),
  validator: { package: 'gltf-validator', version: validator.version(), upstream: 'https://github.com/KhronosGroup/glTF-Validator' },
  scope: 'Every models/*.glb, embedded buffers, all scene instances including hidden flame states',
  expectedModels: 14,
  checkedModels: results.length,
  passedModels: results.filter(r => r.passed).length,
  allPassed: results.length === 14 && results.every(r => r.passed),
  results,
};
await fs.writeFile(path.join(output, 'assets.json'), JSON.stringify(summary, null, 2) + '\n');
if (!summary.allPassed) process.exitCode = 1;
