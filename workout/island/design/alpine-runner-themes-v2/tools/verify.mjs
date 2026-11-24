// SPDX-License-Identifier: CC0-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const prefix = resolve(process.argv[2] ?? "/tmp/alpine-themes-qa");
const khronos = createRequire(join(prefix, "package.json"))("gltf-validator");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const fileTable = new Map();
const v2Ports = [];
const v1Ports = {};
const report = { validator: khronos.version(), glbCount: 0, errors: 0, warnings: 0, infos: 0, hints: 0,
  packages: {}, v2PortPairs: 0, v2ToV1PortPairs: 0, placementCount: 0 };

async function checkFile(file, theme) {
  assert.match(file.path, /^assets\/[a-z-]+\/[a-z0-9_/.\-]+$/);
  assert.ok(file.path.startsWith(`assets/${theme}/`) && !file.path.includes(".."), file.path);
  assert.ok(!fileTable.has(file.path), file.path);
  const bytes = await readFile(join(root, file.path));
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
  fileTable.set(file.path, bytes.length);
  return bytes;
}

function parseModel(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonSize = bytes.readUInt32LE(12);
  return { document: JSON.parse(bytes.toString("utf8", 20, 20 + jsonSize)), binary: bytes.subarray(28 + jsonSize) };
}

function attribute(model, index, componentCount, componentSize, read) {
  const accessor = model.document.accessors[index];
  const view = model.document.bufferViews[accessor.bufferView];
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || componentCount * componentSize;
  return Array.from({ length: accessor.count }, (_, i) => Array.from({ length: componentCount }, (_, k) => (
    model.binary[read](start + stride * i + componentSize * k)
  )));
}

function vertices(model) {
  return model.document.meshes[0].primitives.flatMap(({ attributes }) => {
    const points = attribute(model, attributes.POSITION, 3, 4, "readFloatLE");
    const normals = attribute(model, attributes.NORMAL, 3, 4, "readFloatLE");
    const colors = attributes.COLOR_0 === undefined ? [] : attribute(model, attributes.COLOR_0, 4, 1, "readUInt8");
    return points.map((point, i) => ({ point, normal: normals[i], color: colors[i] }));
  });
}

const round = (n) => Math.round(n * 1e5) / 1e5 + 0;
const crossSection = manifest.coordinates.ports.crossSection;
const equivalent = (a, b) => Math.abs(a - b) < 1e-4;

function portSignatures(points, z) {
  const port = points.filter(({ point }) => equivalent(point[2], z));
  const mainSurface = port.filter(({ point: [x, y], normal }) => normal[1] > 0.9 &&
    crossSection.some(([a, b]) => equivalent(x, a) && equivalent(y, b)) &&
    (Math.abs(x) < 5.5 || Math.abs(normal[0]) > 0.14));
  assert.equal(new Set(mainSurface.map(({ point }) => round(point[0]))).size, 6);
  const signatures = (list, withColor) => [...new Set(list.map(({ point, normal, color }) =>
    JSON.stringify([...point.slice(0, 2).map(round), ...normal.map(round), ...(withColor ? color : [])]),
  ))].sort();
  return { geometry: signatures(port, false), painted: signatures(port, true), v1: signatures(mainSurface, false) };
}

function v1Port(positions, z) {
  const points = positions.filter(({ point: [x, y, localZ], normal }) =>
    equivalent(localZ, z) && normal[1] > 0.9 && crossSection.some(([a, b]) => equivalent(x, a) && equivalent(y, b)));
  return [...new Set(points.map(({ point, normal }) =>
    JSON.stringify([...point.slice(0, 2).map(round), ...normal.map(round)]),
  ))].sort();
}

async function verifyGlb(item, theme) {
  const data = await checkFile(item, theme);
  const model = parseModel(data);
  assert.ok(!(model.document.extensionsRequired?.length || model.document.extensionsUsed?.length), item.path);
  assert.ok(model.document.buffers.length === 1 && model.document.buffers[0].uri === undefined, item.path);
  assert.ok(!model.document.images && !model.document.textures, item.path);
  const result = await khronos.validateBytes(data, { uri: item.path, maxIssues: 0 });
  const { numErrors, numWarnings, numInfos, numHints } = result.issues;
  report.glbCount++;
  report.errors += numErrors;
  report.warnings += numWarnings;
  report.infos += numInfos;
  report.hints += numHints;
  assert.equal(numErrors + numWarnings, 0, JSON.stringify(result.issues.messages));
  const triangles = model.document.meshes[0].primitives.reduce((sum, primitive) => (
    sum + model.document.accessors[primitive.indices].count / 3
  ), 0);
  assert.equal(triangles, item.triangles, item.path);
  const points = vertices(model);
  const bounds = [Math.min, Math.max].map((op) => [0, 1, 2].map((axis) => op(...points.map(({ point }) => point[axis]))));
  bounds.forEach((side, i) => side.forEach((value, axis) => assert.ok(equivalent(value, item.bounds[i][axis]), item.path)));
  return points;
}

function xzFootprint(prop, { position, yawRadians }) {
  const sin = Math.sin(yawRadians);
  const cos = Math.cos(yawRadians);
  const [lo, hi] = prop.bounds;
  return [lo[0], hi[0]].flatMap((x) => [lo[2], hi[2]].map((z) =>
    [position[0] + x * cos + z * sin, position[2] - x * sin + z * cos],
  ));
}

assert.deepEqual(manifest.coordinates.laneCentersMeters, [-2.4, 0, 2.4]);
assert.equal(manifest.coordinates.tileLengthMeters, 30);
assert.equal(manifest.coordinates.courseLengthMeters, 240);
assert.deepEqual(manifest.preview.viewport, [844, 390]);
assert.deepEqual(manifest.themes.map(({ id }) => id), ["forest", "ice", "frozen-lava", "aurora", "village", "summit"]);
const v1Root = join(root, "../alpine-runner-v1");
const v1Spec = JSON.parse(await readFile(join(v1Root, "world-spec.json"), "utf8"));
assert.deepEqual(v1Spec.ports.crossSection, crossSection);
for (const { id, path, centerline } of v1Spec.tiles) {
  const coordinates = vertices(parseModel(await readFile(join(v1Root, path))));
  v1Ports[id] = [v1Port(coordinates, 0), v1Port(coordinates, 30)];
  const samples = manifest.coordinates.centerlineSamples[id];
  assert.equal(samples.length, centerline.length);
  centerline.forEach(({ z, x, y, dx_dz, dy_dz }, i) => {
    [z, x, y, dx_dz, dy_dz].forEach((n, j) => assert.ok(equivalent(samples[i][j], n), id));
  });
}

for (const theme of manifest.themes) {
  const { id, props, tiles, parallax, weather, signs } = theme;
  const totalBefore = [...fileTable.values()].reduce((sum, n) => sum + n, 0);
  assert.equal(new Set(props.map((prop) => prop.id)).size, 10, id);
  assert.deepEqual(tiles.map((tile) => tile.id), v1Spec.tiles.map((tile) => tile.id), id);
  assert.deepEqual(parallax.map((layer) => layer.id), ["sky", "ridges", "foothills"], id);
  let triangles = 0;
  for (const prop of props) {
    await verifyGlb(prop, id);
    assert.ok(Math.abs(prop.bounds[0][1]) <= 0.035, `${prop.path} ground pivot`);
    triangles += prop.triangles;
  }
  const used = new Set();
  for (const [index, tile] of tiles.entries()) {
    assert.equal(tile.lengthMeters, 30, tile.path);
    assert.equal(tile.startMeters, 30 * index, tile.path);
    const points = await verifyGlb(tile, id);
    const ports = [portSignatures(points, 0), portSignatures(points, 30)];
    v2Ports.push({ theme: id, ports });
    assert.ok(equivalent(tile.bounds[0][2], 0) && equivalent(tile.bounds[1][2], 30), tile.path);
    for (const placement of tile.placements) {
      const prop = props.find((entry) => entry.id === placement.prop);
      assert.ok(prop, tile.path);
      used.add(prop.id);
      const footprint = xzFootprint(prop, placement);
      const near = Math.min(...footprint.map(([, z]) => z));
      const far = Math.max(...footprint.map(([, z]) => z));
      assert.ok(near >= 0 && far <= 30, `${tile.path}/${prop.id} crosses a port`);
      const centerline = manifest.coordinates.centerlineSamples[tile.id];
      const rowLength = centerline[1][0] - centerline[0][0];
      const first = Math.floor(near / rowLength);
      const last = Math.ceil(far / rowLength);
      const centers = centerline.slice(first, last + 1).map(([, x]) => x);
      const leftmost = Math.min(...footprint.map(([x]) => x));
      const rightmost = Math.max(...footprint.map(([x]) => x));
      assert.ok(rightmost < Math.min(...centers) - 3.6 || leftmost > Math.max(...centers) + 3.6,
        `${tile.path}/${prop.id} enters a lane`);
      report.placementCount++;
    }
    triangles += tile.triangles;
  }
  assert.equal(used.size, 10, id);
  for (const [sign, z] of [["start", 0], ["finish", 240]]) {
    assert.equal(signs[sign].position[2], z, id);
    const points = await verifyGlb(signs[sign], id);
    assert.ok(points.filter(({ point: [x] }) => Math.abs(x) < 3.6)
      .every(({ point: [, y] }) => y + signs[sign].position[1] >= 3.5), signs[sign].path);
    triangles += signs[sign].triangles;
  }
  for (const [index, layer] of parallax.entries()) {
    assert.ok(layer.wrapX && layer.width === 1536 && layer.height === 512, layer.path);
    assert.ok(layer.pixelsPerMeter > (parallax[index - 1]?.pixelsPerMeter ?? 0), layer.path);
    const bytes = await checkFile(layer, id);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", layer.path);
  }
  const effect = JSON.parse(await checkFile(weather, id));
  assert.ok(["snow", "fog", "glow"].includes(effect.kind), weather.path);
  assert.equal(effect.kind, weather.kind, weather.path);
  report.packages[id] = { assetBytes: [...fileTable.values()].reduce((sum, n) => sum + n, 0) - totalBefore, triangles };
}

for (const from of v2Ports) {
  for (const to of v2Ports) {
    assert.deepEqual(from.ports[1].geometry, to.ports[0].geometry, `${from.theme} to ${to.theme}`);
    if (from.theme === to.theme) {
      assert.deepEqual(from.ports[1].painted, to.ports[0].painted, from.theme);
    }
    report.v2PortPairs++;
  }
  for (const ports of Object.values(v1Ports)) {
    assert.deepEqual(from.ports[1].v1, ports[0]);
    assert.deepEqual(from.ports[0].v1, ports[1]);
    report.v2ToV1PortPairs += 2;
  }
}

const actual = (await readdir(join(root, "assets"), { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name).slice(root.length).replaceAll("\\", "/")).sort();
assert.deepEqual(actual, [...fileTable.keys()].sort());
report.assetCount = fileTable.size;
report.assetBytes = [...fileTable.values()].reduce((sum, n) => sum + n, 0);
assert.equal(report.assetBytes, manifest.budget.assetBytes);
assert.equal(report.glbCount, 120);
assert.equal(report.assetCount, 144);

const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
assert.ok(files.every((file) => !/\.(wasm|drc|ktx2)$/i.test(file.name)));
const packageBytes = (await Promise.all(files.map((entry) => stat(join(entry.parentPath, entry.name)))))
  .reduce((sum, file) => sum + file.size, 0);
assert.ok(packageBytes <= manifest.budget.maxPackageBytes, `Package has ${packageBytes} bytes`);

await mkdir(join(root, "verification"), { recursive: true });
await writeFile(join(root, "verification/assets.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, packageBytes }, null, 2));
