// Blender distributions may omit libextern_draco. Use the pinned standalone
// encoder to guarantee that the final delivery really requires Draco.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const args=process.argv.slice(2),dir=args[args.indexOf('--modules')+1];
if(!args.includes('--modules')||!dir)throw Error('--modules /absolute/tooling required');
const require=createRequire(path.resolve(dir,'package.json'));
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco}=require('@gltf-transform/functions'),codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
 'draco3d.encoder':await codec.createEncoderModule(),'draco3d.decoder':await codec.createDecoderModule()
});
const root=path.resolve(import.meta.dirname,'..');
for(const filename of (await fs.readdir(root)).filter(x=>x.endsWith('.glb')).sort()){
 if(args.includes('--asset')&&!args[args.indexOf('--asset')+1].split(',').includes(filename.slice(0,-4)))continue;
 const doc=await io.read(path.join(root,filename));
 await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:10,quantizeColor:8}));
 await io.write(path.join(root,filename),doc);
 console.log(filename,(await fs.stat(path.join(root,filename))).size);
}
