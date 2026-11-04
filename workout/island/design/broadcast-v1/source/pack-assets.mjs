// Offline only: npm dependencies live outside the repository, in /tmp/broadcast-tools.
import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
const require = createRequire('/tmp/broadcast-tools/package.json');
const {NodeIO} = require('@gltf-transform/core');
const {ALL_EXTENSIONS} = require('@gltf-transform/extensions');
const {draco, dedup, prune, tangents, unweld, weld} = require('@gltf-transform/functions');
const draco3d = require('draco3dgltf');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule()
});
if (process.argv[2] === 'decode') {
  await mkdir('/tmp/broadcast-decoded', {recursive: true});
  for (const [name, path] of [['athlete', 'hoops/lod-v4/hoops-v4-pg-lod.glb'], ['soccer', 'soccer-v4/soccer-stadium.glb'], ['basketball', 'hoops/lod-v4/hoops-v4-arena-lod.glb']]) {
    const doc = await io.read(resolve(root, '..', path));
    for (const extension of doc.getRoot().listExtensionsUsed()) if (extension.extensionName === 'KHR_draco_mesh_compression') extension.dispose();
    await io.write(`/tmp/broadcast-decoded/${name}.glb`, doc);
  }
} else {
  const {generateTangents} = require('mikktspace');
  const meta = JSON.parse(await readFile(resolve(root, 'assets/geometry.json'), 'utf8'));
  for (const name of Object.keys(meta)) {
    const path = resolve(root, 'assets', name), doc = await io.read(path);
    if (name.startsWith('athlete')) {
      for (const node of doc.getRoot().listNodes()) if (node.getMesh() && node.getSkin()) doc.getRoot().getDefaultScene().addChild(node);
      for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        const weights = primitive.getAttribute('WEIGHTS_0');
        if (!weights) continue;
        const array = new Uint16Array(weights.getCount() * 4);
        for (let i = 0; i < weights.getCount(); i++) {
          const w = weights.getElement(i, []), sum = w.reduce((a, b) => a + b, 0) || 1;
          let total = 0, largest = 0;
          for (let k = 0; k < 4; k++) {array[i * 4 + k] = Math.round(w[k] / sum * 65535); total += array[i * 4 + k]; if (w[k] > w[largest]) largest = k;}
          array[i * 4 + largest] += 65535 - total;
        }
        weights.setArray(array).setNormalized(true);
      }
    }
    if (name === 'spectator.glb') for (const material of doc.getRoot().listMaterials()) material.setNormalTexture(null);
    await doc.transform(dedup(), prune(), unweld(), tangents({generateTangents}), weld(), draco({method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeGeneric: 16}));
    await io.write(path, doc);
    meta[name].bytes = (await readFile(path)).length;
  }
  await writeFile(resolve(root, 'assets/geometry.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(meta);
}
