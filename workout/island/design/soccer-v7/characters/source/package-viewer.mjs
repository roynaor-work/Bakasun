#!/usr/bin/env node
/** Authoring utility. Classic scripts/embedded assets avoid runtime HTTP requests. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(process.env.SOCCER_V7_TOOLS||'/tmp/soccer-v7-tools/package.json');
const {build}=require('esbuild');
const readJSON=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const [manifestRaw,motionRaw,wrapper,wasm]=await Promise.all([
  fs.readFile(path.join(root,'asset-manifest.json'),'utf8'),fs.readFile(path.join(root,'animations.json'),'utf8'),
  fs.readFile(path.join(root,'vendor/draco_wasm_wrapper.js'),'utf8'),
  fs.readFile(path.join(root,'vendor/draco_decoder.wasm')),
]);
const manifest=JSON.parse(manifestRaw),motion=JSON.parse(motionRaw);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const runtimeSources={preview:'preview.js',motionRuntime:'source/motion-runtime.js',locomotion:'source/locomotion-space.js',locomotionCurve:'source/locomotion-curve.js',dribble:'source/locomotion-dribble.js',recovery:'source/recovery-state.js',palmSupport:'source/palm-support.js',scene:'source/scene.js',props:'source/props.js'};
const sourceHashes=Object.fromEntries(await Promise.all(Object.entries(runtimeSources).map(async([key,file])=>[key,hash(await fs.readFile(path.join(root,file)))])));
const hashes={manifest:hash(manifestRaw),motion:hash(motionRaw),...sourceHashes,models:Object.fromEntries(manifest.characters.flatMap(c=>(c.kits||[c]).flatMap(k=>[[k.lod0,k.lod0Sha256],[k.lod1,k.lod1Sha256]])))};
let floor=await readJSON('verification/floor-envelope.json').catch(()=>null);
if(!floor?.pass||!floor?.complete||floor.motionSha256!==hashes.motion||floor.runtimeSha256!==hashes.motionRuntime||Object.entries(hashes.models).some(([p,h])=>floor.modelSha256?.[p]!==h))floor=null;
let bootBounds=null;
const bootRaw=await fs.readFile(path.join(root,'verification/boot-bounds.json'),'utf8').catch(()=>null);
if(bootRaw){
  const proof=JSON.parse(bootRaw),modelSha256=Object.fromEntries((proof.models||[]).map(m=>[m.file,m.sha256]));
  if(proof.pass&&proof.complete&&proof.inputs?.manifest?.sha256===hashes.manifest&&Object.entries(hashes.models).every(([p,h])=>modelSha256[p]===h)&&['LeftFoot','RightFoot'].every(name=>proof.feet?.[name]?.supportHull?.vertices?.length)){
    bootBounds={paddingMeters:proof.paddingMeters,modelSha256,feet:Object.fromEntries(['LeftFoot','RightFoot'].map(name=>[name,{vertices:proof.feet[name].supportHull.vertices}]))};
    hashes.bootBounds=hash(bootRaw);
  }
}
await fs.mkdir(path.join(root,'offline'),{recursive:true});
const payload={manifest,motion,floor,bootBounds,hashes,decoderJS:wrapper,decoderWasm:wasm.toString('base64')};
const paths=[...new Set(manifest.characters.flatMap(c=>(c.kits||[c]).flatMap(k=>[k.lod0,k.lod1])).filter(Boolean))];
const entries=[],writes=[];
for(const p of paths){
  if(!/^models\/[a-z0-9-]+\.glb$/.test(p))throw Error('Unexpected model path '+p);
  const bytes=await fs.readFile(path.join(root,p));
  if(bytes.length>1500000)throw Error(p+' exceeds the 1.5 MB GLB budget');
  if(!hashes.models[p]||hash(bytes)!==hashes.models[p])throw Error(p+' changed during authoring; finish compression/manifest before packaging');
  const output='offline/'+path.basename(p,'.glb')+'.js';
  writes.push([output,'/* Local Draco GLB payload. */\n(globalThis.SOCCER_V7_ASSETS??={})['+JSON.stringify(p)+']='+JSON.stringify(bytes.toString('base64'))+';\n']);
  entries.push({path:p,payload:output,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
writes.push(['vendor/data.js','/* Generated offline data; no network access. */\nglobalThis.SOCCER_V7_DATA='+JSON.stringify(payload)+';\n']);
for(const [output,content] of writes){const file=path.join(root,output);await fs.writeFile(file+'.tmp',content);await fs.rename(file+'.tmp',file);}
const runtimeOutput=path.join(root,'vendor/viewer-runtime.js');
await build({entryPoints:[path.join(root,'preview.js')],outfile:runtimeOutput+'.tmp',bundle:true,format:'iife',target:['es2020'],minify:true,legalComments:'eof',alias:{three:path.join(root,'vendor/three.module.js')},logLevel:'info'});
for(const [key,file] of Object.entries(runtimeSources))if(hash(await fs.readFile(path.join(root,file)))!==sourceHashes[key])throw Error(file+' changed during packaging; freeze the runtime sources and package again');
await fs.rename(runtimeOutput+'.tmp',runtimeOutput);
const license=await fs.readFile(path.join(root,'vendor/LICENSE.three'),'utf8');
await fs.writeFile(path.join(root,'vendor/viewer-runtime.LICENSE.txt'),license+'\nDraco decoder is Apache-2.0 licensed; see LICENSE.draco.\n');
await fs.writeFile(path.join(root,'verification/offline-package.json'),JSON.stringify({schemaVersion:1,threeRevision:'160',kind:'static-package-inventory',runtime:'local classic scripts; embedded WASM and lazy GLB payloads; internal blob image decoding, no HTTP asset requests',buildRequiredAtRuntime:false,externalDependencies:[],intendedFileProtocol:true,fileProtocolVerified:false,fileProtocolVerificationLimit:'Managed Chromium blocks file:// navigation; observed local-HTTP execution and remote-request counts are recorded by browser audits.',assets:entries},null,2)+'\n');
console.log('Offline package: '+entries.length+' models, '+(entries.reduce((n,e)=>n+e.bytes,0)/1e6).toFixed(3)+' MB GLB.');
