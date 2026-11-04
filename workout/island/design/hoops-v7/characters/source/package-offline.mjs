/** Authoring utility: packs the local preview into one file:// capable HTML.
 * No build or network access is needed to open the resulting standalone.html.
 * Run: node source/package-offline.mjs --modules /tmp/hoops-v7-tools
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.argv.includes('--modules')?process.argv[process.argv.indexOf('--modules')+1]:'/tmp/hoops-v7-tools';
const require=createRequire(path.resolve(requested,'package.json'));
const {build}=require('esbuild');
/** The viewer drives the canonical skeleton itself. Keep full baked clips in
 * the delivered GLBs, but omit their unused bytes from the embedded viewer
 * copies. Geometry, skin weights, inverse binds, textures and morphs are copied
 * byte-for-byte; Draco data is neither decoded nor re-encoded here.
 */
function repackEmbeddedCopy(input,{omitClips=true,imagePool=null}={}){
  if(input.readUInt32LE(0)!==0x46546c67||input.readUInt32LE(4)!==2)throw Error('Expected GLB v2');
  let json,bin;for(let offset=12;offset<input.length;){const size=input.readUInt32LE(offset),type=input.readUInt32LE(offset+4);const chunk=input.subarray(offset+8,offset+8+size);if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8'));if(type===0x004e4942)bin=chunk;offset+=8+size;}
  const clipCount=json?.animations?.length||0;if((!clipCount||!omitClips)&&!imagePool)return {bytes:input,clipCount:0,pooledImages:0};
  if(!bin||json.buffers?.[0]?.uri)throw Error('Viewer packing requires an embedded primary buffer');
  const usedAccessors=new Set(),accessorRefs=[];
  const accessorRef=(object,key)=>{if(object[key]===undefined)return;usedAccessors.add(object[key]);accessorRefs.push([object,key]);};
  for(const mesh of json.meshes||[])for(const primitive of mesh.primitives||[]){accessorRef(primitive,'indices');for(const key of Object.keys(primitive.attributes||{}))accessorRef(primitive.attributes,key);for(const target of primitive.targets||[])for(const key of Object.keys(target))accessorRef(target,key);}
  for(const skin of json.skins||[])accessorRef(skin,'inverseBindMatrices');
  if(!omitClips)for(const animation of json.animations||[])for(const sampler of animation.samplers||[]){accessorRef(sampler,'input');accessorRef(sampler,'output');}
  let pooledImages=0;
  if(imagePool)for(const image of json.images||[]){if(image.bufferView===undefined)continue;const view=json.bufferViews[image.bufferView];if(view.buffer!==0||(view.byteOffset||0)+view.byteLength>bin.length)throw Error('Image payload must be inside the embedded buffer');const bytes=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);const hash=createHash('sha256').update(bytes).digest('hex'),mimeType=image.mimeType||'application/octet-stream',extension=mimeType==='image/webp'?'webp':mimeType==='image/png'?'png':'jpg',uri=`hoops-image-${hash}.${extension}`;imagePool[uri]||={mimeType,base64:bytes.toString('base64'),bytes:bytes.length,sha256:hash};image.uri=uri;delete image.bufferView;pooledImages++;}
  const accessorOrder=[...usedAccessors].sort((a,b)=>a-b),accessorMap=new Map(accessorOrder.map((old,index)=>[old,index]));
  for(const [object,key]of accessorRefs)object[key]=accessorMap.get(object[key]);
  const retainedAccessors=accessorOrder.map(index=>json.accessors[index]);
  const usedViews=new Set(),viewRefs=[];
  const viewRef=(object,key)=>{if(object?.[key]===undefined)return;usedViews.add(object[key]);viewRefs.push([object,key]);};
  for(const accessor of retainedAccessors){viewRef(accessor,'bufferView');viewRef(accessor.sparse?.indices,'bufferView');viewRef(accessor.sparse?.values,'bufferView');}
  for(const image of json.images||[])viewRef(image,'bufferView');
  for(const mesh of json.meshes||[])for(const primitive of mesh.primitives||[])viewRef(primitive.extensions?.KHR_draco_mesh_compression,'bufferView');
  const viewOrder=[...usedViews].sort((a,b)=>a-b),viewMap=new Map(viewOrder.map((old,index)=>[old,index]));
  for(const [object,key]of viewRefs)object[key]=viewMap.get(object[key]);
  let length=0;const parts=[],fallbackBuffers=[],fallbackMap=new Map();
  const append=bytes=>{const offset=length;parts.push(bytes);length+=bytes.length;const padding=(4-length%4)%4;if(padding){parts.push(Buffer.alloc(padding));length+=padding;}return offset;};
  const slice=(offset,size)=>{if(offset<0||size<0||offset+size>bin.length)throw Error('Buffer view exceeds embedded binary');return bin.subarray(offset,offset+size);};
  const retainedViews=viewOrder.map(index=>{const source=json.bufferViews[index],extension=source.extensions?.EXT_meshopt_compression;if(source.extensions&&Object.keys(source.extensions).some(name=>name!=='EXT_meshopt_compression'))throw Error('Unexpected bufferView extension; refusing to change encoded data');const result={...source};
    if(extension){if(extension.buffer!==0)throw Error('Meshopt payload must be in the embedded buffer');const compressedOffset=append(slice(extension.byteOffset||0,extension.byteLength));result.extensions={EXT_meshopt_compression:{...extension,buffer:0,byteOffset:compressedOffset}};
      if(source.buffer===0){result.buffer=0;result.byteOffset=append(slice(source.byteOffset||0,source.byteLength));}
      else{const fallback=json.buffers[source.buffer];if(fallback?.uri||!fallback?.extensions?.EXT_meshopt_compression?.fallback)throw Error('Unexpected external Meshopt fallback buffer');if(!fallbackMap.has(source.buffer)){fallbackMap.set(source.buffer,fallbackBuffers.length+1);fallbackBuffers.push(fallback);}result.buffer=fallbackMap.get(source.buffer);}
    }else{if(source.buffer!==0)throw Error('Unexpected external buffer');result.buffer=0;result.byteOffset=append(slice(source.byteOffset||0,source.byteLength));}return result;});
  if(omitClips)delete json.animations;json.accessors=retainedAccessors;json.bufferViews=retainedViews;json.buffers=[{byteLength:length},...fallbackBuffers];
  if(!retainedViews.some(view=>view.extensions?.EXT_meshopt_compression))for(const key of ['extensionsUsed','extensionsRequired'])if(json[key]){json[key]=json[key].filter(name=>name!=='EXT_meshopt_compression');if(!json[key].length)delete json[key];}
  const metadata=Buffer.from(JSON.stringify(json));const jsonPadding=(4-metadata.length%4)%4,jsonBytes=Buffer.concat([metadata,Buffer.alloc(jsonPadding,0x20)]),binaryBytes=Buffer.concat(parts);const output=Buffer.alloc(12+8+jsonBytes.length+8+binaryBytes.length);
  output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(jsonBytes.length,12);output.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(output,20);const offset=20+jsonBytes.length;output.writeUInt32LE(binaryBytes.length,offset);output.writeUInt32LE(0x004e4942,offset+4);binaryBytes.copy(output,offset+8);return {bytes:output,clipCount:omitClips?clipCount:0,pooledImages};
}
const profiles=['pg','sg','sf','pf','c','referee'];
const names=profiles.flatMap(id=>[`models/${id}.glb`,`models/${id}-lod1.glb`]);
names.push('vendor/draco/draco_wasm_wrapper.js','vendor/draco/draco_decoder.wasm');
names.push('rig.json','model-authoring.json');
const files={},images={},embeddedCopies=[],useImagePool=!process.argv.includes('--no-image-pool');for(const name of names){const original=await fs.readFile(path.join(root,name));const packed=name.endsWith('.glb')?repackEmbeddedCopy(original,{omitClips:!process.argv.includes('--include-baked-clips'),imagePool:useImagePool?images:null}):{bytes:original,clipCount:0,pooledImages:0};files[name]=packed.bytes.toString('base64');if(name.endsWith('.glb')){const json=JSON.parse(original.subarray(20,20+original.readUInt32LE(12)).toString('utf8'));const triangles=(json.meshes||[]).flatMap(mesh=>mesh.primitives||[]).reduce((sum,primitive)=>sum+(json.accessors[primitive.indices??primitive.attributes.POSITION].count/3),0);embeddedCopies.push({file:name,deliveredBytes:original.length,embeddedBytes:packed.bytes.length,deliveredSha256:createHash('sha256').update(original).digest('hex'),embeddedSha256:createHash('sha256').update(packed.bytes).digest('hex'),triangles,omittedBakedClips:packed.clipCount,pooledImages:packed.pooledImages});}}
// Refuse a mixed snapshot when an authoring process is rebuilding the GLBs.
// The final portable page must carry matching geometry and profile metadata.
const authored=JSON.parse(Buffer.from(files['model-authoring.json'],'base64').toString('utf8'));for(const entry of embeddedCopies){const id=path.basename(entry.file).replace(/-lod1\.glb$|\.glb$/g,''),profile=authored.profiles.find(profile=>profile.id===id),expected=entry.file.endsWith('-lod1.glb')?profile?.lod1Triangles:profile?.triangles;if(entry.triangles!==expected)throw Error(`${entry.file} has ${entry.triangles} triangles but metadata says ${expected}; run packaging after model generation has completed`);}
const result=await build({entryPoints:[path.join(root,'preview.mjs')],bundle:true,write:false,minify:true,format:'iife',platform:'browser',target:['es2020'],legalComments:'inline'});
const css=await fs.readFile(path.join(root,'preview.css'),'utf8');
let html=await fs.readFile(path.join(root,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="preview.css">',()=>`<style>${css}</style>`);
const pack=JSON.stringify({version:2,files,embeddedCopies,...(useImagePool?{images}:{})}).replace(/<\//g,'<\\/');
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
html=html.replace('<script type="module" src="preview.mjs"></script>',()=>`<script>window.__HOOPS_PACK__=${pack};</script><script>${js}</script>`);
// The report link is useful in the modular preview. The self-contained artifact
// carries a text copy of the report when available, without filesystem requests.
try{const report=await fs.readFile(path.join(root,'REPORT.md'),'utf8');html=html.replace('<a href="REPORT.md">דוח הנכסים והבדיקות ↗</a>','<a href="#" id="offline-report">דוח הנכסים והבדיקות ↗</a>');html=html.replace('</body>',()=>`<script>document.getElementById('offline-report').addEventListener('click',function(event){event.preventDefault();const blob=new Blob([${JSON.stringify(report).replace(/<\//g,'<\\/')}],{type:'text/markdown;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='REPORT.md';link.click();setTimeout(function(){URL.revokeObjectURL(link.href)},1000)});</script></body>`);}catch{}
const destination=path.join(root,'standalone.html');await fs.writeFile(destination,html);
const summary={path:path.relative(root,destination),bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),embeddedGLBs:profiles.length*2,embeddedCopies,uniqueInlineImages:Object.keys(images).length,inlineImageBytes:Object.values(images).reduce((sum,image)=>sum+image.bytes,0),threeRevision:160,noNetworkRequired:true};
await fs.mkdir(path.join(root,'verification'),{recursive:true});await fs.writeFile(path.join(root,'verification/package.json'),JSON.stringify({schema:'hoops-characters-offline-package/v1',createdAtUtc:new Date().toISOString(),...summary,transform:{diskGLBsChanged:false,bakedClipsIncludedInEmbeddedCopies:process.argv.includes('--include-baked-clips'),compressedGeometryReencoded:false,imagePooling:useImagePool?'exact SHA256 byte identity':'disabled'},inlineImages:Object.entries(images).map(([uri,image])=>({uri,mimeType:image.mimeType,bytes:image.bytes,sha256:image.sha256}))},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
