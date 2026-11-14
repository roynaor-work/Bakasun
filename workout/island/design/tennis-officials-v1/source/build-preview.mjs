// Rebuild the local browser runtime from the package versions in package.json.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire('/tmp/tennis-officials-tools/package.json');
const {build}=require('esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));
await fs.mkdir(root+'vendor',{recursive:true});
await build({stdin:{contents:"export * from 'three'; export {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'; export {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';",resolveDir:'/tmp/tennis-officials-tools',sourcefile:'tennis-officials-runtime.mjs'},bundle:true,format:'esm',minify:true,outfile:root+'vendor/three-gltf-r160.mjs'});
// Shader strings keep their newlines; remove insignificant end-of-line spaces.
const output=root+'vendor/three-gltf-r160.mjs';
await fs.writeFile(output,(await fs.readFile(output,'utf8')).replace(/[ \t]+$/gm,''));
await fs.copyFile(path.resolve(path.dirname(require.resolve('three')),'../LICENSE'),root+'vendor/LICENSE.three');
