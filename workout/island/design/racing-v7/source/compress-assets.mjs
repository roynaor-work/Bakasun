// Authoring dependency installed outside the runtime package. See source/README.md.
import { NodeIO } from '/tmp/racing-v7-tools/node_modules/@gltf-transform/core/dist/index.js';
import { ALL_EXTENSIONS } from '/tmp/racing-v7-tools/node_modules/@gltf-transform/extensions/dist/index.js';
import { dedup, prune, draco } from '/tmp/racing-v7-tools/node_modules/@gltf-transform/functions/dist/index.js';
import draco3d from '/tmp/racing-v7-tools/node_modules/draco3dgltf/draco3dgltf.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder':await draco3d.createEncoderModule(),
  'draco3d.decoder':await draco3d.createDecoderModule(),
});
async function walk(dir){const files=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){
  if(e.isDirectory())files.push(...await walk(path.join(dir,e.name)));
  else if(e.name.endsWith('.glb'))files.push(path.join(dir,e.name));
}return files;}
for(const file of await walk(path.join(root,'assets'))){
  const existing=await fs.readFile(file);
  const json=JSON.parse(existing.toString('utf8',20,20+existing.readUInt32LE(12)));
  if(json.extensionsRequired?.includes('KHR_draco_mesh_compression'))continue;
  const doc=await io.read(file);
  await doc.transform(dedup(),prune(),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12}));
  await io.write(file,doc);
  console.log(path.relative(root,file),(await fs.stat(file)).size);
}
