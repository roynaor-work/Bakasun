// SPDX-License-Identifier: CC0-1.0
// Decode the existing fictional keeper once; no geometry or skin is authored here.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {unpack,compact,readAccessor} from './glb.mjs';

const base=new URL('../',import.meta.url);
const source=new URL('../soccer-motion-v8/runtime/keeper.glb',base);
const reference=new URL('../soccer-header-v1/runtime/reference/idle_relaxed.glb',base);
const require=createRequire(`${process.env.KEEPER_TOOLS_DIR??'/tmp/keeper-tools'}/package.json`);
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf');
const bytes=await readFile(source),referenceGLB=unpack(await readFile(reference));
const original=unpack(bytes);
const signature=d=>d.skins[0].joints.map(j=>({name:d.nodes[j].name,
  parent:d.nodes.find(n=>n.children?.includes(j))?.name??null,
  translation:d.nodes[j].translation??[0,0,0],rotation:d.nodes[j].rotation??[0,0,0,1],scale:d.nodes[j].scale??[1,1,1]}));
if(JSON.stringify(signature(original.document))!==JSON.stringify(signature(referenceGLB.document)))throw Error('Existing keeper does not match canonical rig.');
const originalBinds=readAccessor(original,original.document.skins[0].inverseBindMatrices).values;
const referenceBinds=readAccessor(referenceGLB,referenceGLB.document.skins[0].inverseBindMatrices).values;
if(originalBinds.some((v,i)=>v!==referenceBinds[i]))throw Error('Existing keeper inverse binds differ from reference.');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const document=await io.readBinary(new Uint8Array(bytes));
document.getRoot().listAnimations().forEach(a=>a.dispose());
document.getRoot().listExtensionsUsed().filter(e=>e.extensionName==='KHR_draco_mesh_compression').forEach(e=>e.dispose());
const decoded=unpack(await io.writeBinary(document));
decoded.document.asset.generator='soccer-keeper-motion-v3 / decoded existing CC0 goalkeeper';
decoded.document.asset.copyright='CC0-1.0 existing fictional goalkeeper; see LICENSES.md';
decoded.document.extras={preparedFrom:{path:'workout/island/design/soccer-motion-v8/runtime/keeper.glb',
  sha256:createHash('sha256').update(bytes).digest('hex')},rig:'canonical18',compression:'none',animationsRemoved:true};
const output=compact(decoded.document,decoded.binary),final=unpack(output);
if(JSON.stringify(signature(final.document))!==JSON.stringify(signature(referenceGLB.document)))throw Error('Decoder changed canonical rig.');
await mkdir(new URL('reference/',base),{recursive:true});
await writeFile(new URL('reference/keeper-template.glb',base),output);
const record={asset:'reference/keeper-template.glb',bytes:output.length,sha256:createHash('sha256').update(output).digest('hex'),
  source:decoded.document.extras.preparedFrom,canonicalBones:signature(final.document).length,animations:final.document.animations?.length??0};
await mkdir(new URL('verification/',base),{recursive:true});
await writeFile(new URL('verification/keeper-template.json',base),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));
