// The preview-only CC0 ship comes from the existing repository. npm dependencies
// live outside the repository. No Blender Draco native library is required.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(`${process.env.SEA_TOOLCHAIN || '/tmp/naval-sea-v2-tools/node_modules'}/package.json`);
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder':await draco.createDecoderModule()
});
const doc=await io.read(fileURLToPath(new URL('../../../assets/naval-v7/ships/corvette-lod1.glb',import.meta.url)));
for(const e of doc.getRoot().listExtensionsUsed())e.dispose();
for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){
 const unused=p.getAttribute('TEXCOORD_1');
 if(unused){p.setAttribute('TEXCOORD_1',null);unused.dispose();}
}
for(const n of doc.getRoot().listNodes())if(!n.getMesh()&&!n.getCamera()&&!n.getSkin()&&!n.listChildren().length)n.dispose();
await io.write(fileURLToPath(new URL('reference-corvette.glb',import.meta.url)),doc);
