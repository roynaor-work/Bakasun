// CC0-1.0. Pass the absolute path to gltf-validator/module.mjs as the first argument.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const validatorURL = process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : 'gltf-validator';
const { validateBytes } = await import(validatorURL);
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const docs = new Map();
const reports = [];
let surfaces = 0;
let items = 0;

function meshTriangles(doc, meshIndex) {
  return doc.meshes[meshIndex].primitives.reduce((sum, { indices }) => sum + doc.accessors[indices].count / 3, 0);
}

for (const asset of [...manifest.assets, ...manifest.base.models]) {
  const buffer = readFileSync(resolve(root, asset.path));
  assert.equal(buffer.length, asset.bytes, asset.path);
  assert.equal(createHash('sha256').update(buffer).digest('hex'), asset.sha256, asset.path);
  assert.equal(buffer.subarray(0, 4).toString(), 'glTF');
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  const jsonSize = buffer.readUInt32LE(12);
  const binaryStart = 28 + jsonSize;
  const doc = JSON.parse(buffer.subarray(20, 20 + jsonSize));
  assert.equal(doc.buffers.length, 1);
  assert.ok(doc.buffers.every(buffer => !buffer.uri));
  assert.ok((doc.images ?? []).every(image => !image.uri));
  assert.deepEqual(doc.extensionsRequired ?? [], []);
  assert.deepEqual(doc.extensionsUsed ?? [], []);
  assert.equal(new Set(doc.nodes.map(node => node.name)).size, doc.nodes.length, asset.path);
  if (asset.storedTriangles) {
    assert.equal(doc.nodes.length, asset.nodeCount);
    assert.equal(doc.meshes.reduce((sum, _, index) => sum + meshTriangles(doc, index), 0), asset.storedTriangles);
    assert.equal(doc.nodes.reduce((sum, node) => sum + (node.mesh === undefined ? 0 : meshTriangles(doc, node.mesh)), 0),
      asset.sceneTriangles);
  }
  const report = await validateBytes(buffer, { uri: asset.path });
  const { numErrors, numWarnings, numHints, numInfos, messages } = report.issues;
  assert.deepEqual([numErrors, numWarnings, numHints, numInfos], [0, 0, 0, 0], JSON.stringify(messages));
  reports.push({
    path: asset.path, version: report.validatorVersion, sha256: asset.sha256,
    issues: { numErrors, numWarnings, numHints, numInfos }, triangles: report.info.totalTriangleCount,
  });
  docs.set(asset.id, { doc, buffer, binaryStart });
}

function named(asset, name) {
  const found = asset.doc.nodes.find(node => node.name === name);
  assert.ok(found, `Missing node ${name}`);
  return found;
}

for (const room of manifest.rooms) {
  const asset = docs.get(room.model);
  assert.ok(manifest.assets.find(model => model.id === room.model).storedTriangles <= manifest.limits.roomTotalTriangles);
  assert.equal(named(asset, 'camera_game').camera, 0);
  assert.deepEqual(named(asset, room.doorExit).translation, room.doorLocal);
  assert.deepEqual(named(asset, room.rescue).translation, room.rescueLocal);
  assert.deepEqual(named(asset, room.flood.node).extras.size, room.flood.size);
  const layers = manifest.effects.smoke.layers.map(layer => named(asset, room.smokeNodes[layer]).translation[1]);
  assert.ok(layers[0] > layers[1] && layers[1] > layers[2] && layers[2] > 0);
  const burnNodes = asset.doc.nodes.filter(node => node.name.startsWith('burn_')).length;
  assert.equal(burnNodes, room.items.length);
  for (const item of room.items) {
    const parent = named(asset, item.parent);
    const [intact, burnt, fire] = parent.children.map(index => asset.doc.nodes[index]);
    assert.deepEqual([intact.name, burnt.name, fire.name], [item.intact, item.burnt, item.fire]);
    assert.equal(parent.extras.defaultState, 'intact');
    assert.deepEqual(burnt.scale, [0, 0, 0]);
    assert.deepEqual(burnt.extras.restScale, [1, 1, 1]);
    assert.equal(fire.mesh, undefined);
    assert.deepEqual(fire.translation, item.fireLocal);
    assert.deepEqual([meshTriangles(asset.doc, intact.mesh), meshTriangles(asset.doc, burnt.mesh)],
      [item.triangles.intact, item.triangles.burnt]);
    assert.notEqual(intact.mesh, burnt.mesh);
    items++;
  }
}

// Test the authored running surface under each waypoint using GLB vertex/index data.
function hasSurface(asset, nodeName, [x, y, z], tolerance = .017) {
  const { doc, buffer, binaryStart } = asset;
  const node = named(asset, nodeName);
  return doc.meshes[node.mesh].primitives.some(primitive => {
    const position = doc.accessors[primitive.attributes.POSITION];
    const indices = doc.accessors[primitive.indices];
    assert.equal(position.componentType, 5126);
    assert.equal(indices.componentType, 5123);
    const start = accessor => binaryStart + (doc.bufferViews[accessor.bufferView].byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const p = start(position);
    const ix = start(indices);
    const vector = index => [
      buffer.readFloatLE(p + index * 12), buffer.readFloatLE(p + index * 12 + 4), buffer.readFloatLE(p + index * 12 + 8),
    ];
    for (let i = 0; i < indices.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => vector(buffer.readUInt16LE(ix + 2 * (i + j))));
      if ([a, b, c].some(point => Math.abs(point[1] - y) > tolerance)) continue;
      const area = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      if (area < 1e-9) continue;
      const s = ((z - a[2]) * (c[0] - a[0]) - (x - a[0]) * (c[2] - a[2])) / area;
      const t = ((b[2] - a[2]) * (x - a[0]) - (b[0] - a[0]) * (z - a[2])) / area;
      if (s >= -1e-5 && t >= -1e-5 && s + t <= 1.00001) return true;
    }
    return false;
  });
}

function surface(asset, name, point) {
  assert.ok(hasSurface(asset, name, point), `No support surface at ${name} [${point}]`);
  surfaces++;
}

const { building } = manifest;
const stair = docs.get('stairwell');
const shell = docs.get('upper-shell');
const roof = docs.get(building.roof.model);
const toLocal = (point, origin) => point.map((value, i) => value - origin[i]);
assert.deepEqual(building.upperFloorNumbers, [4, 5, 6, 7, 8, 9, 10]);
assert.equal(building.stairs.stops.length, 8);
assert.deepEqual(building.elevator.floors, building.upperFloorNumbers);
assert.equal(building.elevator.evacuation, false);
assert.equal(named(shell, building.elevator.car).extras.parkedAt, 4);
for (const [i, stop] of building.stairs.stops.entries()) {
  assert.equal(stop.from, i + 3);
  assert.equal(stop.to, i === 7 ? 'roof' : i + 4);
  assert.equal(stop.translation[1], Math.round((stop.from - 1) * building.floorHeight * 10) / 10);
  const path = stop.path.map(point => toLocal(point, stop.translation));
  assert.equal(path.filter((point, index) => index && point[1] - path[index - 1][1] > .01).length, 16);
  if (stop.from === 3) surface(docs.get('building-shell'), 'corridor_f3', [stop.path[0][0], .114, stop.path[0][2]]);
  else surface(stair, 'stair_front_landing', path[0]);
  for (const step of path.slice(1, -1)) surface(stair, 'stair_flights_and_turn_landing', step);
  const top = path.at(-1);
  if (stop.to === 'roof') surface(roof, 'roof_deck_and_parapet', stop.path.at(-1).map((x, index) => x - building.roof.translation[index]));
  else surface(stair, 'stair_front_landing', [top[0], 0, top[2]]);
}
for (const entry of building.floors) {
  assert.equal(entry.rooms.length, 3);
  const translation = [0, entry.elevation, 0];
  assert.deepEqual(named(shell, entry.shellNode).translation, translation);
  for (const room of entry.rooms) {
    const info = manifest.rooms.find(item => item.id === room.type);
    assert.ok(info);
    surface(docs.get(info.model), 'room_architecture', info.rescueLocal);
    surface(shell, `corridor_f${entry.number}`, room.door.map((value, i) => value - translation[i]).map((value, i) => i === 2 ? value + .22 : value));
  }
  for (const point of entry.elevator.approach.slice(1)) surface(shell, `elevator_approach_f${entry.number}`, toLocal(point, translation));
  assert.equal(named(shell, entry.elevator.threshold).extras.evacuation, false);
  for (const name of entry.elevator.panels) assert.equal(named(shell, name).extras.lockedDuringFire, true);
}
for (const point of building.roof.path) surface(roof, 'roof_deck_and_parapet', toLocal(point, building.roof.translation));
assert.equal(manifest.effects.smoke.modes.filter(mode => mode.id !== 'off').length, 3);
assert.equal(manifest.effects.flood.maxDepthMeters, .32);

const evidencePath = join(root, 'evidence/khronos.json');
writeFileSync(evidencePath, JSON.stringify({ models: reports, burnableTemplates: items, supportSamples: surfaces }, null, 2) + '\n');
const files = readdirSync(root, { recursive: true }).filter(file => statSync(join(root, file)).isFile());
assert.equal(files.filter(file => /\.(wasm|ktx2|drc)$/i.test(file)).length, 0);
const bytes = files.reduce((sum, file) => sum + statSync(join(root, file)).size, 0);
assert.ok(bytes <= manifest.limits.packageBytes, `Package is ${bytes} bytes`);
console.log(`${manifest.assets.length} new GLBs + ${manifest.base.models.length} base GLBs; zero Khronos issues.`);
console.log(`${items} burnable templates; ${surfaces} GLB support samples; ${bytes} package bytes.`);
