// Encode only the three arena assets. Run after build_arena.py; tooling is external.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const args=process.argv.slice(2),i=args.indexOf('--modules');
if(i<0||!args[i+1])throw Error('--modules /absolute/tooling required');
const require=createRequire(path.resolve(args[i+1],'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco}=require('@gltf-transform/functions');
const codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
 'draco3d.encoder':await codec.createEncoderModule(),
 'draco3d.decoder':await codec.createDecoderModule()
});
const root=path.resolve(import.meta.dirname,'../assets');
for(const filename of ['arena.glb','ball.glb','hoop.glb']){
 const doc=await io.read(path.join(root,filename));
 await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:10,quantizeColor:8}));
 await io.write(path.join(root,filename),doc);
 console.log(filename,(await fs.stat(path.join(root,filename))).size);
}
