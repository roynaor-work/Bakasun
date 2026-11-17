#!/usr/bin/env node
// A small ESM bootstrap, not a compiler: embeds the already local modules and
// resolves their known imports to Blob URLs. This also works from file://.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const names=['vendor/three.module.js','vendor/BufferGeometryUtils.js','vendor/GLTFLoader.js','tools/lod-policy.mjs','preview.mjs'];
const sources=Object.fromEntries(await Promise.all(names.map(async name=>[name,await fs.readFile(path.join(root,name),'utf8')])));
const data=JSON.stringify(sources).replaceAll('<','\\u003c');
const bootstrap=`<script id="local-modules" type="application/json">${data}</script>\n<script type="module">
const sources=JSON.parse(document.getElementById('local-modules').textContent);
const moduleURL=source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
const three=moduleURL(sources['vendor/three.module.js']);
const utils=moduleURL(sources['vendor/BufferGeometryUtils.js'].replaceAll('./three.module.js',three));
const loader=moduleURL(sources['vendor/GLTFLoader.js'].replaceAll('./three.module.js',three).replaceAll('./BufferGeometryUtils.js',utils));
const policy=moduleURL(sources['tools/lod-policy.mjs']);
const app=moduleURL(sources['preview.mjs'].replaceAll('./vendor/three.module.js',three).replaceAll('./vendor/GLTFLoader.js',loader).replaceAll('./tools/lod-policy.mjs',policy));
await import(app);
</script>`;
const template=await fs.readFile(path.join(root,'tools/preview-template.html'),'utf8');
const css=await fs.readFile(path.join(root,'preview.css'),'utf8');
if(!template.includes('<script type="module" src="preview.mjs"></script>'))throw Error('Preview template marker is missing');
await fs.writeFile(path.join(root,'preview.html'),template.replace('<link rel="stylesheet" href="preview.css">',`<style>${css}</style>`).replace('<script type="module" src="preview.mjs"></script>',bootstrap));
console.log('Built self-contained JavaScript preview bootstrap (HTTP and file://)');
