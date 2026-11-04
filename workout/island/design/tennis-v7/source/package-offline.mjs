// Authoring utility. The delivered preview uses classic local scripts, including
// preloaded GLB bytes and a JS Draco worker, so file:// requires no fetch or build.
import fs from 'node:fs/promises';
import {root,json,writeJSON,sha,require} from './common.mjs';
const esbuild=require('esbuild');
await fs.mkdir(root+'/vendor',{recursive:true});await fs.mkdir(root+'/offline',{recursive:true});
const entry='/tmp/tennis-v7-tools/runtime-entry.mjs';
await fs.writeFile(entry,"import * as THREE from 'three';\nexport { THREE };\nexport {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';\nexport {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';\n");
await esbuild.build({entryPoints:[entry],outfile:root+'/vendor/three-r160-loaders.js',bundle:true,minify:true,format:'iife',globalName:'TennisEngine',legalComments:'eof'});
const decoder=await fs.readFile('/tmp/tennis-v7-tools/node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js','utf8');
await fs.writeFile(root+'/vendor/draco-source.js','window.TENNIS_DRACO_SOURCE='+JSON.stringify(decoder)+';\n');
const assets=[...await json('actors.json'),...await json('environment.json'),...await json('props.json')];
for(const asset of assets){
 const bytes=await fs.readFile(root+'/'+asset.file),id=asset.file.split('/').at(-1).replace('.glb','');
 await fs.writeFile(root+'/offline/'+id+'.js',`window.TENNIS_BYTES[${JSON.stringify(id)}]=${JSON.stringify(bytes.toString('base64'))};\n`);
}
const layout=await json('crowd-layout.json'),motions=await json('motions.json');
const data={assets,layout,motions,rig:await json('rig.json')};
await fs.writeFile(root+'/offline/index.js','window.TENNIS_BYTES={};\nwindow.TENNIS_CONFIG='+JSON.stringify(data)+';\n');
await writeJSON('manifest.json',{schemaVersion:1,title:'Tennis v7',created:'2026-11-04',license:'CC0-1.0',maxGLBBytes:1500000,maxTextureSize:1024,rig:'rig.json',assets,
 sources:await Promise.all(['source/characters.py','source/motions.mjs','source/build-actors.mjs','source/build-environment.mjs','source/build-props.mjs','source/textures.py','../characters2/source/mesh.py','../characters2/source/body.py','../characters2/source/head_hands.py','../characters2/source/gear.py','../characters/rig.json','../motion2/soccer.json'].map(async file=>({file,sha256:sha(await fs.readFile(root+'/'+file))}))),
 offline:{entry:'preview.html',mode:'classic local scripts, embedded bytes, preloaded Draco JS worker',buildAtRuntime:false,networkAtRuntime:false}});
console.log('Offline runtime ready:',assets.length,'GLBs, THREE r160');
// A truly self-contained deliverable also opens from a phone's file picker.
// It has no linked styles, scripts, images or GLBs, and performs no fetch.
const codeFiles=['vendor/three-r160-loaders.js','vendor/draco-source.js','offline/index.js',
 ...assets.map(a=>'offline/'+a.file.split('/').at(-1).replace('.glb','.js')),'preview.js'];
const scripts=await Promise.all(codeFiles.map(async file=>'<script>\n'+(await fs.readFile(root+'/'+file,'utf8')).replace(/<\/script/gi,'<\\/script')+'\n</script>'));
let html=await fs.readFile(root+'/preview.html','utf8');
const css=await fs.readFile(root+'/preview.css','utf8');
const icon='href="data:image/svg+xml,'+encodeURIComponent(await fs.readFile(root+'/icon.svg','utf8'))+'"';
html=html.replace(/\s*<script src="[^"]+" defer><\/script>/g,'')
 .replace('<link rel="stylesheet" href="preview.css">',()=>'<style>'+css+'</style>')
 .replace('href="icon.svg"',()=>icon)
 .replace('</body>',()=>scripts.join('\n')+'\n</body>');
await fs.writeFile(root+'/standalone.html',html);
console.log('Self-contained HTML:',Buffer.byteLength(html),'bytes');
