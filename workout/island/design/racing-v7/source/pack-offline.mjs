// Produces a direct-file HTML distribution. This is an optional authoring step;
// the delivered page needs no build, dependencies, localhost server or Internet.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const moduleFiles=['app.mjs','world.mjs','loader.mjs','effects.mjs','vendor/three.module.js','vendor/GLTFLoader.js','vendor/DRACOLoader.js','vendor/BufferGeometryUtils.js','vendor/SkeletonUtils.js'];
const moduleIDs=new Map(moduleFiles.map(file=>[file,'racing/'+file]));
const modules={};
for(const file of moduleFiles){
  let source=await fs.readFile(path.join(root,file),'utf8');
  source=source.replace(/(from\s*|import\s*)(['"])(\.[^'"]+)\2/g,(all,head,quote,specifier)=>{
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));
    if(!moduleIDs.has(resolved))throw new Error(`Unmapped module ${resolved}`);
    return head+quote+moduleIDs.get(resolved)+quote;
  });
  modules[moduleIDs.get(file)]=source;
}
const files={};
async function walk(dir){
  for(const item of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
    const rel=path.posix.join(dir,item.name);
    if(item.isDirectory())await walk(rel);
    else if(/\.(glb|json|png|webp|wasm)$/.test(item.name)||rel==='vendor/draco/draco_wasm_wrapper.js'){
      files[rel]=(await fs.readFile(path.join(root,rel))).toString('base64');
    }
  }
}
await walk('assets');await walk('textures');await walk('vendor/draco');
let html=await fs.readFile(path.join(root,'index.html'),'utf8');
const css=await fs.readFile(path.join(root,'style.css'),'utf8');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const threeLicense=await fs.readFile(path.join(root,'vendor/LICENSE.three'),'utf8');
const dracoLicense=await fs.readFile(path.join(root,'vendor/draco/LICENSE.draco'),'utf8');
const credits=`<details class="credits"><summary>מקורות ורישיונות</summary><p dir="ltr">Car bodies derived from Car Concept, Eric Chadwick for Darmstadt Graphics Group GmbH, 2024. CC-BY-4.0. Modified proportions, body details, neutral materials, original wheels and aero, three LODs and Draco compression. Source textures and trademarks removed.</p><p dir="ltr"><a href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept">Source attribution</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC-BY-4.0</a></p><details><summary>Three.js MIT license</summary><pre>${escape(threeLicense)}</pre></details><details><summary>Draco Apache-2.0 license</summary><pre>${escape(dracoLicense)}</pre></details></details>`;
html=html.replace('</dialog>',credits+'</dialog>');
html=html.replace('href="./index.html"','href=""');
html=html.replace('<a href="./REPORT.md">דוח מסירה</a> · <a href="./LICENSES.md">מקורות ורישיונות</a>','<span>דוח המסירה נמצא בתיקיית החבילה. הייחוס מופיע בהמשך.</span>');
html=html.replace('<link rel="stylesheet" href="./style.css">',`<style>${css}</style>`);
html=html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/,'');
const bundle=gzipSync(Buffer.from(JSON.stringify({modules,files})),{level:9}).toString('base64');
const bootstrap=`
// All modules, meshes, maps and the decoder are embedded in this local file.
(async()=>{
const compressed=Uint8Array.from(atob('${bundle}'),c=>c.charCodeAt(0));
const expanded=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
const embedded=JSON.parse(new TextDecoder().decode(expanded));
const blobs=new Map();
const mime=path=>path.endsWith('.png')?'image/png':path.endsWith('.webp')?'image/webp':path.endsWith('.wasm')?'application/wasm':path.endsWith('.json')?'application/json':path.endsWith('.glb')?'model/gltf-binary':'text/javascript';
function resourceKey(url){
  const text=String(url);const match=text.match(/(?:^|\\/)(assets\\/.*|textures\\/.*|vendor\\/draco\\/.*)$/);
  return match?match[1].split('?')[0]:text.replace(/^\\.\\//,'');
}
function bytes(key){if(!embedded.files[key])throw new Error('Missing embedded asset: '+key);return Uint8Array.from(atob(embedded.files[key]),c=>c.charCodeAt(0));}
globalThis.__racingAssetURL=url=>{
  const key=resourceKey(url);if(!blobs.has(key))blobs.set(key,URL.createObjectURL(new Blob([bytes(key)],{type:mime(key)})));return blobs.get(key);
};
const nativeFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(input,init)=>{
  const url=typeof input==='string'?input:input.url;const key=resourceKey(url);
  if(embedded.files[key])return Promise.resolve(new Response(bytes(key),{status:200,headers:{'Content-Type':mime(key)}}));
  if(String(url).startsWith('blob:')||String(url).startsWith('data:'))return nativeFetch(input,init);
  return Promise.reject(new Error('Offline page blocked an unembedded request: '+url));
};
const imports={};
for(const [id,source] of Object.entries(embedded.modules))imports[id]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
imports.three=imports['racing/vendor/three.module.js'];
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.appendChild(map);
const main=document.createElement('script');main.type='module';main.textContent='import "racing/app.mjs";';document.body.appendChild(main);
addEventListener('pagehide',()=>{for(const url of blobs.values())URL.revokeObjectURL(url);for(const url of Object.values(imports))URL.revokeObjectURL(url);},{once:true});
})().catch(error=>{console.error(error);document.getElementById('loading').innerHTML='<strong>לא ניתן לפתוח את התצוגה</strong><small>נדרש דפדפן עדכני עם WebGL ו-DecompressionStream.</small>';});
`;
html=html.replace('<script type="module" src="./app.mjs"></script>',`<script>${bootstrap}</script>`);
html=html.replace('<title>מרוצים · חמישה רכבים, שלוש דרכים</title>','<title>מרוצים · תצוגה מקומית ללא רשת</title>');
await fs.writeFile(path.join(root,'offline.html'),html);
console.log('offline.html',Buffer.byteLength(html),'bytes;',Object.keys(files).length,'embedded assets;',moduleFiles.length,'modules');
