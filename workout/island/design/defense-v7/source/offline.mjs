import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(process.env.DEFENSE_TOOLS||'/tmp/defense-v7-tools/package.json');
const {build}=require('esbuild');
const root=path.resolve(import.meta.dirname,'..');
const result=await build({entryPoints:[path.join(root,'app.mjs')],bundle:true,write:false,format:'iife',platform:'browser',target:'es2020',minify:true,legalComments:'inline',alias:{three:path.join(root,'vendor/three.module.js')}});
const table={};
for(const name of (await fs.readdir(path.join(root,'models'))).filter(n=>n.endsWith('.glb')).sort())table['models/'+name]=(await fs.readFile(path.join(root,'models',name))).toString('base64');
for(const name of ['farm-layout.json','textures/effects-atlas.png','textures/farm-shadow.png','textures/water-wave.png','vendor/draco/draco_wasm_wrapper.js','vendor/draco/draco_decoder.wasm'])table[name]=(await fs.readFile(path.join(root,name))).toString('base64');
let html=await fs.readFile(path.join(root,'preview.html'),'utf8');
const css=await fs.readFile(path.join(root,'theme.css'),'utf8');
html=html.replace('<link rel="stylesheet" href="theme.css">','<style>'+css+'</style>')
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/,'')
  .replace('<script type="module" src="app.mjs"></script>',()=>'<script>globalThis.DEFENSE_EMBEDDED='+JSON.stringify(table)+';\n'+result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>')
  .replace('<meta charset="utf-8">','<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'wasm-unsafe-eval\' blob:; worker-src blob:; style-src \'unsafe-inline\'; img-src data: blob:; connect-src blob:; font-src \'self\'; base-uri \'none\'; form-action \'none\'">');
await fs.writeFile(path.join(root,'offline.html'),html);
console.log(JSON.stringify({file:'offline.html',bytes:Buffer.byteLength(html),embeddedFiles:Object.keys(table).length,bundleBytes:result.outputFiles[0].contents.length}));
