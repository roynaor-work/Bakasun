// Original verification code, CC0-1.0. Run with Node.js 22+ from any directory.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../vendor/three.module.js';
import { GLTFLoader } from '../../../vendor/GLTFLoader.js';

const folder = new URL('../', import.meta.url);
const expected = ['armored-boss', 'cone', 'pickup', 'player-ship', 'police-car', 'roadblock', 'sports-car'];
const wheelNames = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'];
const vehicles = ['armored-boss', 'pickup', 'police-car', 'sports-car'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const round = n => Number(n.toFixed(6));
const vector = v => v.toArray().map(round);
const output = { format: 'ship-chase-models-v1', loader: 'repository Three.js GLTFLoader', assets: [] };
const files = (await readdir(new URL('runtime/', folder))).filter(f => f.endsWith('.glb')).sort();
assert.deepEqual(files, expected.map(id => id + '.glb'), 'exactly seven requested runtime models');

for (const id of expected) {
  const file = `runtime/${id}.glb`;
  const data = await readFile(new URL(file, folder));
  assert.equal(data.readUInt32LE(0), 0x46546c67, `${file}: GLB magic`);
  assert.equal(data.readUInt32LE(4), 2, `${file}: glTF 2.0`);
  assert.equal(data.readUInt32LE(8), data.length, `${file}: declared length`);
  assert.equal(data.readUInt32LE(16), 0x4e4f534a, `${file}: JSON first chunk`);
  const jsonSize = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonSize).toString());
  assert.equal(json.asset.version, '2.0');
  assert(data.length <= 300_000, `${file}: <=300 KB (decimal)`);
  const used = json.extensionsUsed || [];
  assert(!used.includes('KHR_draco_mesh_compression'), `${file}: no Draco`);
  assert(!used.includes('EXT_meshopt_compression'), `${file}: no meshopt`);
  assert(!used.includes('KHR_meshopt_compression'), `${file}: no meshopt`);
  assert.equal((json.images || []).length, 0, `${file}: texture-free materials`);
  assert.equal((json.textures || []).length, 0);
  assert.equal(json.buffers.length, 1, `${file}: one embedded binary buffer`);
  assert(!json.buffers[0].uri, `${file}: self-contained`);
  const binStart = 20 + jsonSize;
  assert.equal(data.readUInt32LE(binStart + 4), 0x004e4942, `${file}: BIN chunk`);
  const binLength = data.readUInt32LE(binStart);
  assert.equal(binStart + 8 + binLength, data.length);
  assert(json.buffers[0].byteLength <= binLength);
  for (const view of json.bufferViews || []) {
    assert.equal(view.buffer, 0);
    assert((view.byteOffset || 0) + view.byteLength <= json.buffers[0].byteLength, `${file}: buffer bounds`);
  }

  // Exercise the same parser used by the browser, not just the JSON envelope.
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  let triangles = 0, drawCalls = 0;
  const names = new Map(), actualBox = new THREE.Box3();
  scene.traverse(node => {
    if (node.name) names.set(node.name, [...(names.get(node.name) || []), node]);
    if (!node.isMesh) return;
    const geometry = node.geometry, position = geometry.getAttribute('position');
    assert(position && position.count > 0, `${file}: nonempty positions`);
    const normal = geometry.getAttribute('normal');
    assert(normal && normal.count === position.count, `${file}: vertex normals`);
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      assert(point.toArray().every(Number.isFinite), `${file}: finite vertices`);
      actualBox.expandByPoint(point.applyMatrix4(node.matrixWorld));
      point.fromBufferAttribute(normal, i);
      assert(Math.abs(point.length() - 1) < .005, `${file}: normalized normals`);
    }
    if (geometry.index) for (const index of geometry.index.array) assert(index < position.count, `${file}: valid indices`);
    const count = geometry.index?.count || position.count;
    assert.equal(count % 3, 0, `${file}: triangles`);
    triangles += count / 3;
    drawCalls += geometry.groups.length || 1;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) assert(!material.map && !material.normalMap, `${file}: no texture fetches`);
  });
  assert(triangles > 0 && triangles <= (id === 'player-ship' ? 4000 : 3000), `${file}: triangle budget`);
  assert(Math.abs(actualBox.min.y) < .025, `${file}: rests at y=0`);
  const need = name => {
    assert.equal(names.get(name)?.length, 1, `${file}: exactly one ${name}`);
    return names.get(name)[0];
  };
  const nodeMeasurements = {};
  const inspectNode = name => {
    const node = need(name);
    nodeMeasurements[name] = { position: vector(node.getWorldPosition(new THREE.Vector3())), quaternion: node.quaternion.toArray().map(round), children: node.children.length };
    return node;
  };
  if (vehicles.includes(id)) {
    for (const name of wheelNames) {
      const node = inspectNode(name);
      assert(node.children.some(child => child.isMesh || child.children.length), `${file}: wheel has visible geometry`);
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()));
      assert(axis.dot(new THREE.Vector3(1, 0, 0)) > .999, `${file}: local X axle`);
      const box = new THREE.Box3().setFromObject(node, true), center = box.getCenter(new THREE.Vector3());
      const pivot = node.getWorldPosition(new THREE.Vector3());
      assert(Math.abs(center.y - pivot.y) < .025 && Math.abs(center.z - pivot.z) < .025, `${file}: centered wheel pivot`);
    }
    assert(need('Wheel_FL').position.z > need('Wheel_RL').position.z, `${file}: front wheels toward +Z`);
    assert(need('Wheel_FR').position.z > need('Wheel_RR').position.z);
  }
  if (id === 'police-car') for (const name of ['Light_R', 'Light_B']) {
    const node = inspectNode(name);
    assert(node.position.y > 1, `${file}: roof light height`);
  }
  if (id === 'player-ship') for (const side of ['L', 'R']) {
    const barrel = inspectNode(`Barrel_${side}`), muzzle = inspectNode(`Muzzle_${side}`);
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(barrel.getWorldQuaternion(new THREE.Quaternion()));
    assert(axis.dot(new THREE.Vector3(0, 0, 1)) > .999, `${file}: local Z barrel axis`);
    assert(muzzle.getWorldPosition(new THREE.Vector3()).z > barrel.getWorldPosition(new THREE.Vector3()).z, `${file}: muzzle ahead of rotor`);
    assert(!muzzle.isMesh, `${file}: muzzle is an attachment point`);
    const before = muzzle.getWorldPosition(new THREE.Vector3());
    barrel.rotation.z += .43;
    scene.updateMatrixWorld(true);
    assert(before.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())) < 1e-5, `${file}: muzzle stays on firing axis`);
    barrel.rotation.z -= .43;
    scene.updateMatrixWorld(true);
  }
  output.assets.push({ id, file, bytes: data.length, sha256: sha256(data), triangles, drawCalls, dimensionsM: vector(actualBox.getSize(new THREE.Vector3())), boundsM: { min: vector(actualBox.min), max: vector(actualBox.max) }, materials: (json.materials || []).length, textures: 0, extensionsUsed: used, nodes: nodeMeasurements, gltfLoader: 'PASS' });
}
output.totalBytes = output.assets.reduce((sum, a) => sum + a.bytes, 0);
output.totalTriangles = output.assets.reduce((sum, a) => sum + a.triangles, 0);
assert(output.totalBytes <= 3_000_000, 'total <=3 MB (decimal)');
output.allPassed = true;
await writeFile(new URL('verification/asset-results.json', folder), JSON.stringify(output, null, 2) + '\n');
console.table(output.assets.map(({id, bytes, triangles, drawCalls, dimensionsM}) => ({id, bytes, triangles, drawCalls, dimensionsM: dimensionsM.join(' × ')})));
console.log(`PASS: ${output.assets.length} models; ${output.totalBytes} bytes; ${output.totalTriangles} triangles. ${fileURLToPath(folder)}`);
