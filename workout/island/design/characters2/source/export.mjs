// Reproducible original meshes → glTF2 with the unchanged twenty-joint contract.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1]; };
const require=createRequire(path.resolve(arg('--modules','/tmp/island-characters2-tools/package.json')));
const {Document,NodeIO}=require('@gltf-transform/core');
const {KHRDracoMeshCompression}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf');
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
  'draco3d.encoder':await draco.createEncoderModule(),
  'draco3d.decoder':await draco.createDecoderModule(),
});
const rig=JSON.parse(await fs.readFile(path.join(root,'../characters/rig.json'),'utf8'));
for(const model of ['soccer-player','goalkeeper','basketball-player','skier']) {
  const raw=JSON.parse(await fs.readFile(path.join(arg('--raw-dir','/tmp/island-characters2-raw'),`${model}.json`),'utf8'));
  const doc=new Document();
  doc.getRoot().getAsset().generator='Island Characters2 original geometry / glTF Transform 4.5.1';
  doc.getRoot().getAsset().copyright='Original fictional characters, 2026. CC0-1.0. See LICENSES.md.';
  const buffer=doc.createBuffer();
  const accessor=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
  const nodes=new Map(rig.joints.map(j=>[j.name,doc.createNode(j.name).setTranslation(j.translation).setRotation(j.rotation).setScale(j.scale)]));
  for(const j of rig.joints)if(j.parent)nodes.get(j.parent).addChild(nodes.get(j.name));
  const skin=doc.createSkin('Island20').setSkeleton(nodes.get('Root'));
  for(const j of rig.joints)skin.addJoint(nodes.get(j.name));
  skin.setInverseBindMatrices(accessor('Exact source inverse bind matrices','MAT4',new Float32Array(rig.joints.flatMap(j=>j.inverseBindMatrix))));
  const material=doc.createMaterial('Vertex palette / replaceable 256px outfit atlas')
    .setBaseColorFactor([1,1,1,1]).setRoughnessFactor(.72).setMetallicFactor(0);
  // Balanced UNORM16 weights sum to exactly 65535, including three-joint crotch
  // blends. Draco stores these integer channels losslessly, avoiding float drift.
  const packedWeights=[],packedJoints=[];
  for(let i=0;i<raw.weights.length;i++){
    const scaled=raw.weights[i].map(v=>v*65535),weights=scaled.map(Math.floor);
    const order=[0,1,2,3].sort((a,b)=>(scaled[b]-weights[b])-(scaled[a]-weights[a]));
    let remainder=65535-weights.reduce((a,b)=>a+b,0);
    for(let k=0;k<remainder;k++)weights[order[k%4]]++;
    packedWeights.push(...weights);
    packedJoints.push(...raw.joints[i].map((joint,k)=>weights[k]?joint:0));
  }
  const primitive=doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION',accessor('Original surface','VEC3',new Float32Array(raw.positions.flat())))
    .setAttribute('NORMAL',accessor('Sculpted surface normals','VEC3',new Float32Array(raw.normals.flat())))
    .setAttribute('COLOR_0',accessor('Linear outfit region colors','VEC3',new Float32Array(raw.colors.flat())))
    .setAttribute('JOINTS_0',accessor('Island20 joints','VEC4',new Uint16Array(packedJoints)))
    .setAttribute('WEIGHTS_0',accessor('Smooth normalized skin weights','VEC4',new Uint16Array(packedWeights)).setNormalized(true))
    .setIndices(accessor('Surface triangles','SCALAR',new Uint32Array(raw.indices.flat())));
  const mesh=doc.createMesh(model).addPrimitive(primitive);
  const actor=doc.createNode(model).setMesh(mesh).setSkin(skin);
  doc.createScene('Original fictional athlete').addChild(nodes.get('Root')).addChild(actor);
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
    method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    encodeSpeed:5,decodeSpeed:5,
    quantizationBits:{POSITION:16,NORMAL:12,COLOR:14,TEX_COORD:12,GENERIC:20},
  });
  await io.write(path.join(root,`${model}.glb`),doc);
  const bytes=(await fs.stat(path.join(root,`${model}.glb`))).size;
  if(bytes>300000)throw Error(`${model} exceeds 300000 bytes: ${bytes}`);
  console.log(`${model}: ${bytes} bytes`);
}
