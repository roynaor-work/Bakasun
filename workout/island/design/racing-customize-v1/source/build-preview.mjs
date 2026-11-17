import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.resolve(process.env.RACING_TOOLS || '/tmp/racing-customize-tools','package.json'));
const {build}=require('esbuild');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const paths=new Set([manifest.compatibility.previewBase,manifest.paint.stripeMask,
  ...manifest.items.flatMap(item=>[item.icon,...(item.asset?[item.asset]:[])]),...manifest.categories.map(c=>c.icon)]);
const assets={};for(const file of paths)assets[file]=(await fs.readFile(path.join(root,file))).toString('base64');
const result=await build({entryPoints:[path.join(root,'source/preview.mjs')],bundle:true,format:'iife',target:'es2020',minify:true,
  legalComments:'inline',write:false,nodePaths:[path.resolve(process.env.RACING_TOOLS || '/tmp/racing-customize-tools','node_modules')]});
const script=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const thirdPartyLicense=await fs.readFile(require.resolve('three').replace(/build\/three\.cjs$/,'LICENSE'),'utf8');
const css=await fs.readFile(path.join(root,'source/preview.css'),'utf8');
const data=JSON.stringify({manifest,assets}).replace(/</g,'\\u003c');
let html=await fs.readFile(path.join(root,'source/template.html'),'utf8');
html=html.replace('/* STYLE */',()=>css).replace('/* DATA */',()=>data).replace('/* SCRIPT */',()=>script);
html=html.replace('</head>',()=>`<!-- Bundled Three.js, RoomEnvironment and DecalGeometry license:\n${thirdPartyLicense}\n-->\n</head>`);
await fs.writeFile(path.join(root,'preview.html'),html);
console.log('Self-contained preview:',Buffer.byteLength(html),'bytes;',paths.size,'embedded resources');
