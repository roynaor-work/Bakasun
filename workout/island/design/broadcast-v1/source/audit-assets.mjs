import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir, readdir, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire('/tmp/broadcast-tools/package.json');
const validator = require('gltf-validator');
const {NodeIO} = require('@gltf-transform/core');
const {ALL_EXTENSIONS} = require('@gltf-transform/extensions');
const draco3d = require('draco3dgltf');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder': await draco3d.createDecoderModule()});
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {date: '2026-11-04', units: 'decimal MB = bytes / 1000000', assets: [], sources: []};
await mkdir(resolve(root, 'verification'), {recursive: true});
for (const name of (await readdir(resolve(root, 'assets'))).filter(n => n.endsWith('.glb'))) {
  const bytes = await readFile(resolve(root, 'assets', name)), jsonLength = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const triangles = gltf.meshes.reduce((sum, m) => sum + m.primitives.reduce((s, p) => s + gltf.accessors[p.indices].count / 3, 0), 0);
  assert.ok(bytes.length <= 1500000, name + ' file budget'); assert.ok(gltf.extensionsRequired.includes('KHR_draco_mesh_compression'));
  if (name.startsWith('athlete')) {assert.ok(triangles <= (name.includes('lod0') ? 8000 : 3000)); assert.equal(gltf.materials.length, 1); assert.equal(gltf.meshes.length, 1); assert.equal(gltf.images.length, 2);}
  const validation = await validator.validateBytes(new Uint8Array(bytes), {uri: name, maxIssues: 50});
  assert.equal(validation.issues.numErrors, 0, `${name}: ${JSON.stringify(validation.issues.messages)}`);
  const decoded = await io.readBinary(new Uint8Array(bytes));
  for (const extension of decoded.getRoot().listExtensionsUsed()) if (extension.extensionName === 'KHR_draco_mesh_compression') extension.dispose();
  const decodedValidation = await validator.validateBytes(await io.writeBinary(decoded), {uri: name + '-decoded', maxIssues: 50});
  assert.equal(decodedValidation.issues.numErrors, 0, `${name} decoded: ${JSON.stringify(decodedValidation.issues.messages)}`);
  const images = [];
  const binStart = 20 + jsonLength + 8;
  for (const img of gltf.images || []) {
    const view = gltf.bufferViews[img.bufferView], data = bytes.subarray(binStart + (view.byteOffset || 0), binStart + (view.byteOffset || 0) + view.byteLength);
    if (img.mimeType === 'image/png') {const width = data.readUInt32BE(16), height = data.readUInt32BE(20); assert.ok(width <= 1024 && height <= 1024); images.push({width, height, mimeType: img.mimeType});}
  }
  report.assets.push({name, bytes: bytes.length, MB: +(bytes.length / 1e6).toFixed(4), triangles, primitives: gltf.meshes.reduce((n, m) => n + m.primitives.length, 0), materials: gltf.materials.length, images, animations: (gltf.animations || []).map(a => a.name), sha256: hash(bytes), validator: {errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, messages: validation.issues.messages}, decodedValidator: {errors: decodedValidation.issues.numErrors, warnings: decodedValidation.issues.numWarnings, messages: decodedValidation.issues.messages}});
}
for (const path of ['hoops/lod-v4/hoops-v4-pg-lod.glb', 'soccer-v4/soccer-stadium.glb', 'hoops/lod-v4/hoops-v4-arena-lod.glb']) {
  const bytes = await readFile(resolve(root, '..', path)); report.sources.push({path: '../' + path, bytes: bytes.length, sha256: hash(bytes)});
}
report.passed = true;
await writeFile(resolve(root, 'verification/assets.json'), JSON.stringify(report, null, 2) + '\n'); console.log(report.assets.map(a => ({name: a.name, MB: a.MB, triangles: a.triangles, errors: a.validator.errors, warnings: a.validator.warnings})));
