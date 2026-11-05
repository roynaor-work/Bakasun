// Verify that local multi-file and standalone previews embed the audited assets.
// This is a CPU-only inspection: it neither launches a browser nor runs module code.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const PACK=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const VENDOR=path.resolve(PACK,'../../vendor');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const errors=[],warnings=[],assets=[],modules=[];
const assert=(ok,message)=>{if(!ok)throw Error(message);};
function decodeAsset(container,record){
  if(typeof record.base64==='string')return Buffer.from(record.base64,'base64');
  assert(Array.isArray(record.chunks),'Asset has neither base64 data nor a chunk list');
  const parts=record.chunks.map(key=>{
    const chunk=container.chunks?.[key];
    assert(chunk!==undefined,`Missing content chunk ${key}`);
    const base64=typeof chunk==='string'?chunk:chunk.base64;
    assert(typeof base64==='string',`Invalid content chunk ${key}`);
    const bytes=Buffer.from(base64,'base64');
    if(/^[a-f0-9]{64}$/i.test(key))assert(hash(bytes)===key,`Content chunk SHA-256 mismatch: ${key}`);
    return bytes;
  });
  return Buffer.concat(parts);
}
const html=await fs.readFile(path.join(PACK,'preview.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m=>m[1]);
const sandbox={window:{}};vm.createContext(sandbox);
for(const script of scripts){
  try{
    assert(!/^(https?:|\/\/|data:)/i.test(script),'Preview script must be a local file');
    const target=path.resolve(PACK,script);assert(target.startsWith(PACK+path.sep),'Script resolves outside alpine-v7');
    if(!script.startsWith('offline/'))continue;
    vm.runInContext(await fs.readFile(target,'utf8'),sandbox,{filename:script,timeout:3000});
  }catch(error){errors.push({file:script,error:error.message});}
}
const pack=sandbox.window.ALPINE_PACK;
assert(pack?.assets&&pack?.modules&&pack?.manifest,'Offline payload registry is missing or incomplete');
let deduplication=null;
if(pack.chunks){
  const used=new Set(Object.values(pack.assets).flatMap(a=>a.chunks??[])),sizes=[];
  for(const [key,record]of Object.entries(pack.chunks)){
    const bytes=Buffer.from(typeof record==='string'?record:record.base64,'base64');sizes.push(bytes.length);
    if(hash(bytes)!==key)errors.push({file:'chunk:'+key,error:'Content dictionary chunk SHA-256 mismatch'});
    if(!used.has(key))warnings.push({file:'chunk:'+key,warning:'Unreferenced content chunk is embedded in the package'});
  }
  const originalAssetBytes=Object.values(pack.assets).reduce((sum,a)=>sum+a.bytes,0),uniqueChunkBytes=sizes.reduce((sum,n)=>sum+n,0);
  deduplication={encoding:pack.chunkEncoding??null,chunks:sizes.length,originalAssetBytes,uniqueChunkBytes,savingsBytes:originalAssetBytes-uniqueChunkBytes,savingsPercent:(1-uniqueChunkBytes/originalAssetBytes)*100,minimumChunkBytes:Math.min(...sizes),maximumChunkBytes:Math.max(...sizes)};
}
for(const [file,record]of Object.entries(pack.assets)){
  try{
    const embedded=decodeAsset(pack,record);
    assert(embedded.length===record.bytes,'Embedded byte count differs from registry');
    assert(hash(embedded)===record.sha256,'Embedded data SHA-256 differs from registry');
    const target=file.startsWith('engine/')?path.join(VENDOR,'draco',file.slice('engine/'.length)):path.resolve(PACK,file);
    const original=await fs.readFile(target);
    assert(hash(original)===record.sha256,'Offline payload differs from final source file');
    assets.push({file,bytes:embedded.length,sha256:record.sha256,passed:true});
  }catch(error){errors.push({file,error:error.message});}
}
const modulePaths={three:path.join(VENDOR,'three.module.js'),geometry:path.join(VENDOR,'BufferGeometryUtils.js'),gltf:path.join(VENDOR,'GLTFLoader.js'),draco:path.join(VENDOR,'DRACOLoader.js'),world:path.join(PACK,'world/world.js'),preview:path.join(PACK,'preview-client.mjs'),motion:path.join(PACK,'motion/motion.mjs')};
for(const [name,code]of Object.entries(pack.modules)){
  try{
    assert(modulePaths[name],'Unknown embedded module');
    const actual=await fs.readFile(modulePaths[name]);
    assert(hash(Buffer.from(code))===hash(actual),'Module source differs from final source file');
    assert(hash(actual)===pack.sourceHashes[name],'Module source hash differs from registry');
    modules.push({name,sha256:hash(actual),bytes:actual.length,passed:true});
  }catch(error){errors.push({file:'module:'+name,error:error.message});}
}
const manifest=JSON.parse(await fs.readFile(path.join(PACK,'characters/manifest.json'),'utf8'));
if(JSON.stringify(manifest)!==JSON.stringify(pack.manifest))errors.push({file:'characters/manifest.json',error:'Offline character manifest is stale'});
const assetAudit=JSON.parse(await fs.readFile(path.join(PACK,'verification/asset-audit.json'),'utf8'));
for(const audited of assetAudit.assets??[]){
  const embedded=pack.assets[audited.file];
  if(!embedded||embedded.sha256!==audited.sha256||embedded.bytes!==audited.bytes)errors.push({file:audited.file,error:'Offline payload does not match the independently audited GLB'});
}

let standalone=null;
try{
  const file=path.join(PACK,'preview-standalone.html'),bytes=await fs.readFile(file),text=bytes.toString();
  assert(!/<(?:script|link)\b[^>]*(?:src|href)="(?:https?:|\/\/)/i.test(text),'Standalone page references an external script or stylesheet');
  const css=await fs.readFile(path.join(PACK,'preview.css'),'utf8'),bootstrap=await fs.readFile(path.join(PACK,'bootstrap.js'),'utf8');
  assert(text.includes('<style>'+css+'</style>'),'Standalone stylesheet differs from final preview.css');
  assert(text.includes(bootstrap.replace(/<\/script/gi,'<\\/script')),'Standalone bootstrap differs from final bootstrap.js');
  const notices=(await fs.readFile(path.join(PACK,'licenses/three-MIT.txt'),'utf8'))+'\n\n'+(await fs.readFile(path.join(PACK,'licenses/draco-Apache-2.0.txt'),'utf8'));
  const noticeMarkup='<template id="third-party-notices">'+notices.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</template>';
  assert(text.includes(noticeMarkup),'Standalone third-party license notices differ from the supplied licenses');
  const markup=source=>source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<template\b[^>]*id="third-party-notices"[^>]*>[\s\S]*?<\/template>/gi,'').replace(/<link\b[^>]*href="preview\.css"[^>]*>/gi,'').replace(/\s+/g,' ').trim();
  assert(markup(text)===markup(html),'Standalone HTML interface differs from final preview.html');
  const match=text.match(/atob\(("[A-Za-z0-9+/=]+")\)/);
  assert(match,'Standalone gzip payload not found');
  const compressed=Buffer.from(JSON.parse(match[1]),'base64'),decoded=gunzipSync(compressed,{maxOutputLength:64*1024*1024}),copy=JSON.parse(decoded);
  assert(JSON.stringify(copy.manifest)===JSON.stringify(pack.manifest),'Standalone manifest differs from multi-file preview');
  assert(JSON.stringify(copy.sourceHashes)===JSON.stringify(pack.sourceHashes),'Standalone module hashes differ from multi-file preview');
  assert(JSON.stringify(Object.keys(copy.assets).sort())===JSON.stringify(Object.keys(pack.assets).sort()),'Standalone asset inventory differs');
  for(const [name,record]of Object.entries(copy.assets)){
    const data=decodeAsset(copy,record);
    assert(hash(data)===record.sha256&&record.sha256===pack.assets[name].sha256,`Standalone asset differs: ${name}`);
  }
  for(const [name,code]of Object.entries(copy.modules))assert(hash(Buffer.from(code))===pack.sourceHashes[name],`Standalone module differs: ${name}`);
  standalone={file:'preview-standalone.html',bytes:bytes.length,sha256:hash(bytes),stylesheetSha256:hash(Buffer.from(css)),bootstrapSha256:hash(Buffer.from(bootstrap)),interfaceMarkupSha256:hash(Buffer.from(markup(html))),gzipPayloadBytes:compressed.length,decodedPayloadBytes:decoded.length,assetCount:Object.keys(copy.assets).length,passed:true};
}catch(error){errors.push({file:'preview-standalone.html',error:error.message});}

const referenced=new Set(scripts.filter(s=>s.startsWith('offline/')).map(s=>path.basename(s)));
for(const file of await fs.readdir(path.join(PACK,'offline'))){
  if(/^(assets-\d+|chunks-\d+|module-.+)\.js$/.test(file)&&!referenced.has(file))warnings.push({file:'offline/'+file,warning:'Unreferenced generated payload remains in the directory'});
}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),allPassed:errors.length===0,bundleBuiltAt:pack.builtAt,contentChunks:pack.chunks?Object.keys(pack.chunks).length:0,deduplication,assets,modules,standalone,errors,warnings,
  limitations:['Checks embedded bytes and source hashes without executing Three.js or rendering shaders. Browser behavior and frame rate require the separate browser audit.','A gzip payload in the standalone HTML depends on browser DecompressionStream support; the multi-file preview retains ordinary local script payloads.']};
await fs.writeFile(path.join(PACK,'verification/package-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({allPassed:report.allPassed,bundleBuiltAt:pack.builtAt,assets:assets.length,modules:modules.length,deduplication,standalone,errors,warnings},null,2));
if(errors.length)process.exitCode=1;
