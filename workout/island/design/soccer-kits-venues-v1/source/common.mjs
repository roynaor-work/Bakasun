import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repo = path.resolve(root, '../../../..');
const require = createRequire(path.resolve(process.env.SOCCER_KITS_TOOLS || '/tmp/soccer-kits-venues-tools', 'package.json'));
export const {Document, NodeIO} = require('@gltf-transform/core');
export const {ALL_EXTENSIONS, KHRDracoMeshCompression, KHRLightsPunctual, KHRMaterialsUnlit} = require('@gltf-transform/extensions');
export const {prune, resample} = require('@gltf-transform/functions');
export const validator = require('gltf-validator');
const draco = require('draco3dgltf');
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco.createEncoderModule(),
  'draco3d.decoder': await draco.createDecoderModule(),
});
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
export const writeJSON = async (name, data) => fs.writeFile(path.join(root, name), JSON.stringify(data, null, 2) + '\n');
export function rgb(hex) {
  return hex.replace('#', '').match(/../g).map(h => {
    const x = parseInt(h, 16) / 255;
    return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  });
}
export const accessor = (doc, name, type, array) => doc.createAccessor(name).setType(type).setArray(array)
  .setBuffer(doc.getRoot().listBuffers()[0] || doc.createBuffer());
export async function save(doc, file) {
  const old = doc.getRoot().listExtensionsUsed().find(e => e.extensionName === 'KHR_draco_mesh_compression');
  const draco = old || doc.createExtension(KHRDracoMeshCompression);
  draco.setRequired(true).setEncoderOptions({method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    encodeSpeed: 5, decodeSpeed: 5, quantizationBits: {POSITION: 18, NORMAL: 12, COLOR: 12, GENERIC: 20}});
  doc.getRoot().getAsset().generator = 'Bakasun soccer-kits-venues-v1 / glTF Transform 4.5.1';
  doc.getRoot().getAsset().copyright = 'CC0-1.0; see LICENSES.md. Original unbranded designs.';
  await doc.transform(prune({keepAttributes: true, keepLeaves: true}));
  const bytes = await io.writeBinary(doc);
  await fs.mkdir(path.dirname(path.join(root, file)), {recursive: true});
  await fs.writeFile(path.join(root, file), bytes);
  const decoded = await io.readBinary(bytes);
  let triangles = 0, vertices = 0;
  for (const mesh of decoded.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    vertices += p.getAttribute('POSITION').getCount();
    triangles += (p.getIndices()?.getCount() || p.getAttribute('POSITION').getCount()) / 3;
  }
  const record = {file, bytes: bytes.length, sha256: sha(bytes), triangles, vertices};
  console.log(JSON.stringify(record));
  return record;
}
