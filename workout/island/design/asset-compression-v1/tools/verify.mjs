import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {ROOT,sha256,sourcePath,saveJSON,parseGLB,resolveDependency} from './common.mjs';
import {decodeMotion16} from '../runtime/motion16.mjs';
import {compareMotion,MOTION_LIMITS} from './motion.mjs';
import {nativeIO,readSourceGLB,assertNative,compareNative,GLB_LIMITS} from './glb.mjs';
import {pixelDifference} from './images.mjs';
const validator=createRequire(import.meta.url)('gltf-validator'),manifest=JSON.parse(await readFile(path.join(ROOT,'manifest.json'))),failures=[],warnings=[];
let passed=0;const io=await nativeIO();
async function artifact(entry){const file=path.resolve(ROOT,entry.output);if(!file.startsWith(ROOT))throw Error('Output escaped package');const bytes=await readFile(file);if(sha256(bytes)!==entry.sha256||bytes.length!==entry.bytes)throw Error('SHA-256 or length mismatch');return entry.encoding==='gzip'?gunzipSync(bytes):entry.encoding==='br'?brotliDecompressSync(bytes):bytes;}
for(const entry of [...manifest.assets,...manifest.runtime])try {
  const original=entry.source?await readFile(await sourcePath(entry.source)):null;
  if(original&&(original.length!==entry.sourceBytes||sha256(original)!==entry.sourceSHA256))throw Error('Original source changed');
  if(entry.omitted){if(entry.output!==null)throw Error('Omitted decoder has an output');passed++;continue;}
  if(entry.requiresWASM||entry.output.endsWith('.wasm')||entry.encoding==='br')throw Error('Non-native runtime artifact');
  const bytes=await artifact(entry);for(const variant of entry.variants||[])await artifact(variant);
  if(entry.source?.endsWith('.json')) {
    const before=JSON.parse(original),after=entry.codec==='motion16'?decodeMotion16(bytes):JSON.parse(bytes),q=compareMotion(before,after);
    if(q.maxComponentError>MOTION_LIMITS.component||q.maxRotationDegrees>MOTION_LIMITS.rotationDegrees||q.maxTranslationMeters>MOTION_LIMITS.translationMeters||q.maxForwardKinematicsMeters>MOTION_LIMITS.forwardKinematicsMeters)throw Error('Motion threshold exceeded');
  }
  if(entry.codec==='webp-lossless'&&(await pixelDifference(original,bytes)).maxRGBAError)throw Error('RGBA pixels changed');
  if(entry.source?.endsWith('.glb')) {
    const referenceBytes=await artifact(entry.reference),reference=await io.readBinary(referenceBytes),after=await io.readBinary(bytes),source=await readSourceGLB(original,uri=>sourcePath(resolveDependency(entry.source,uri)).then(readFile));
    assertNative(parseGLB(referenceBytes).json);assertNative(parseGLB(bytes).json);
    const beforeQuality=compareNative(source,reference),q=compareNative(reference,after);
    if(beforeQuality.maxPositionError||beforeQuality.maxUVError>1e-10||beforeQuality.maxNormalDegrees>0.00001)throw Error('Reference is not source-equivalent');
    if(q.maxPositionError>GLB_LIMITS.maxPositionError||q.maxNormalDegrees>GLB_LIMITS.maxNormalDegrees||q.maxUVError>GLB_LIMITS.maxUVError)throw Error('Native mesh quality threshold exceeded');
    const oldTextures=reference.getRoot().listTextures(),textures=after.getRoot().listTextures();if(oldTextures.length!==textures.length)throw Error('Texture count changed');
    for(let i=0;i<textures.length;i++){const a=Buffer.from(oldTextures[i].getImage()),b=Buffer.from(textures[i].getImage());if(!a.equals(b)&&(await pixelDifference(a,b)).maxRGBAError)throw Error('Embedded texture pixels changed');}
    const report=await validator.validateBytes(new Uint8Array(bytes),{uri:entry.output,maxIssues:100}),baseline=await validator.validateBytes(new Uint8Array(referenceBytes),{uri:'reference.glb',maxIssues:100});
    const counts=r=>r.issues.messages.filter(e=>e.severity===0).reduce((o,e)=>(o[e.code]=(o[e.code]||0)+1,o),{}),old=counts(baseline),now=counts(report);
    for(const [code,n]of Object.entries(now))if(n>(old[code]||0))throw Error(`New glTF validator error: ${code}`);
    if(report.issues.numErrors||report.issues.numWarnings)warnings.push({source:entry.source,errors:now,warnings:report.issues.numWarnings});
  }
  passed++;
} catch(error){failures.push({source:entry.source||entry.output,error:error.message});}
const bySource=new Map(manifest.assets.map(a=>[a.source,a]));
const total=ps=>{const seen=new Set();let n=0;for(const p of ps){const a=bySource.get(p);for(const source of [p,...a.dependencies]){const b=bySource.get(source);if(!seen.has(b.output)){seen.add(b.output);n+=b.bytes;}}}return n;};
for(const [game,g]of Object.entries(manifest.games))if(total(manifest.groups[game])!==g.afterBytes)failures.push({source:game,error:'Game total mismatch'});
for(const file of manifest.runtime){const text=await readFile(path.join(ROOT,file.output),'utf8');if(/WebAssembly\s*\.|\.wasm|new Worker\s*\(/.test(text))failures.push({source:file.output,error:'Runtime contains WASM or worker code'});}
const result={schema:1,runtimeRequiresWASM:false,passed,failed:failures.length,failures,sourceHashesUnchanged:failures.every(f=>f.error!=='Original source changed'),checks:['Original and selected artifact SHA-256','No Draco, Meshopt, Basis, KTX2, WASM or Brotli-WASM in runtime','Native GLB geometry, skin, animation, normal/UV thresholds','Source-equivalent native preview references','Exact RGBA including hidden RGB','Motion16 and gzip roundtrip','No new native glTF validator errors','Per-game download totals'],validatorWarnings:warnings};
await saveJSON(path.join(ROOT,'verification/verify.json'),result);console.log(JSON.stringify({passed,failed:failures.length,failures}));if(failures.length)process.exitCode=1;
