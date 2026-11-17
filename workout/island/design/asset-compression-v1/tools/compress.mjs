import {readFile,readdir,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync,brotliCompressSync,gunzipSync,brotliDecompressSync,constants} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import sharp from 'sharp';
import {ROOT,ISLAND,REPO,TARGETS,sha256,readOffline,save,saveJSON,safeOutput,sourcePath,resolveDependency,unique,mb} from './common.mjs';
import {writeMeasurement} from './measure.mjs';
import {encodeMotion16,MOTION_LIMITS} from './motion.mjs';
import {losslessWebP} from './images.mjs';
import {compressGLB,GLB_LIMITS} from './glb.mjs';
import {compressAudio,AUDIO_LIMITS} from './audio.mjs';
import {writeReport} from './report.mjs';

const args=new Set(process.argv.slice(2));
if([...args].some(a=>!['--all','--help'].includes(a)))throw Error('Usage: node tools/compress.mjs [--all]');
if(args.has('--help')){console.log('Copy offline-manifest assets (or --all inventory assets), compress copies, measure quality, create report and SHA-256 manifest. Sources are read-only.');process.exit(0);}
const output=await safeOutput('compressed'),work=await safeOutput('.work'),inventory=await writeMeasurement(),offline=await readOffline();
const paths=unique([...offline.paths,...args.has('--all')?inventory.assets.map(a=>a.source):[]]).sort();
// Snapshot every selected source before starting any codec. The snapshot is also
// used to verify that compression never mutates the original source tree.
const snapshots=new Map();
for(const source of paths) {
  const file=await sourcePath(source),bytes=await readFile(file),snapshot=path.join(work,'input',source);
  await save(snapshot,bytes);snapshots.set(source,{file:snapshot,sha256:sha256(bytes),bytes:bytes.length});
}
const assets=[],quality=[],bySource=new Map(),allArtifacts=new Map();
async function artifact(bytes,extension) {
  const hash=sha256(bytes),outputPath=`compressed/${hash}.${extension}`;
  if(!allArtifacts.has(outputPath)){await save(path.join(ROOT,outputPath),bytes);allArtifacts.set(outputPath,{output:outputPath,bytes:bytes.length,sha256:hash});}
  return {output:outputPath,bytes:bytes.length,sha256:hash};
}
const images=paths.filter(p=>/\.(png|jpe?g|webp)$/i.test(p)),models=paths.filter(p=>p.endsWith('.glb')),rest=paths.filter(p=>!images.includes(p)&&!models.includes(p));
let index=0;
const forbiddenSource=source=>/\.wasm$/.test(source)||/^vendor\/(draco\/|meshopt_decoder|DRACOLoader)/.test(source)||/^minigames\/.*(?:draco|meshopt-worker)\.mjs$/.test(source);
for(const source of [...images,...rest,...models]) {
  const start=performance.now(),snapshot=snapshots.get(source),input=await readFile(snapshot.file),ext=path.extname(source).slice(1).toLowerCase();
  let bytes=input,codec='original',encoding=null,extension=ext||'bin',compressionSafe=true,selected=false,metrics={},variants,reference;
  if(forbiddenSource(source)) {
    const entry={source,sourceBytes:snapshot.bytes,sourceSHA256:snapshot.sha256,output:null,bytes:0,sha256:null,omitted:true,reason:'WASM mesh decoder or adapter omitted under script-src self policy',requiresWASM:true,compressionSafe:false,selected:false,dependencies:[]};
    assets.push(entry);bySource.set(source,entry);quality.push({source,omitted:true,reason:entry.reason});index++;continue;
  }
  if(['png','jpg','jpeg'].includes(ext)) {
    const r=await losslessWebP(input);({bytes,selected}=r);compressionSafe=r.safe;codec=selected?'webp-lossless':'original';if(selected)extension='webp';metrics={...r,bytes:undefined};
  } else if(ext==='json') {
    const parsed=JSON.parse(input),motion=encodeMotion16(parsed),plain=Buffer.from(JSON.stringify(parsed));
    // Compare both representations under the same outer compressors.
    const choices=[{name:'json',bytes:plain},...motion?.safe?[{name:'motion16',bytes:motion.buffer}]:[]];
    const candidates=[];
    for(const choice of choices)for(const enc of ['gzip','br']) {
      const packed=enc==='gzip'?gzipSync(choice.bytes,{level:9,mtime:0}):brotliCompressSync(choice.bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:11}});
      const decoded=enc==='gzip'?gunzipSync(packed):brotliDecompressSync(packed);
      if(!decoded.equals(choice.bytes))throw Error('Supercompression roundtrip failed');
      candidates.push({...choice,encoding:enc,packed});
    }
    candidates.sort((a,b)=>a.packed.length-b.packed.length);
    const best=candidates.filter(c=>c.encoding==='gzip')[0];
    if(best.packed.length<input.length){bytes=best.packed;encoding=best.encoding;codec=best.name;extension=encoding==='gzip'?'gz':'br';selected=true;}
    variants=[];
    // Both motion16 gzip and Brotli are retained for reproducible comparisons.
    // Only the selected variant is included in runtime download totals.
    for(const candidate of candidates)variants.push({codec:candidate.name,encoding:candidate.encoding,...await artifact(candidate.packed,candidate.encoding==='gzip'?'gz':'br')});
    metrics={motion:motion?.quality||null,motionSafe:motion?.safe??null,candidates:candidates.map(c=>({codec:c.name,encoding:c.encoding,bytes:c.packed.length})),sourceJSONBytes:input.length};
  } else if(['ogg','mp3'].includes(ext)) {
    const loop=/loop|(?:^|\/)(?:engine|wind|waves|fire|crowd)(?:[-.]|$)/i.test(source);
    const r=await compressAudio(snapshot.file,path.join(work,'audio-candidate.ogg'),{loop});
    ({bytes,selected}=r);compressionSafe=r.safe;codec=r.codec;if(selected)extension='ogg';metrics={...r,bytes:undefined};
  } else if(ext==='glb') {
    const r=await compressGLB(input,{readResource:uri=>{
      const dependency=resolveDependency(source,uri),entry=snapshots.get(dependency);
      if(!entry)throw Error(`Missing source texture: ${source}: ${uri}`);
      return readFile(entry.file);
    }});
    compressionSafe=r.safe;const choices=[],seen=new Set();
    for(const [name,value]of [['transformed',r.bytes],['source',r.baselineBytes]]) {
      const hash=sha256(value);if(seen.has(hash))continue;seen.add(hash);
      choices.push({name,bytes:value,encoding:null});
      choices.push({name,bytes:gzipSync(value,{level:9,mtime:0}),encoding:'gzip'});
    }
    choices.sort((a,b)=>a.bytes.length-b.bytes.length);const best=choices[0];
    bytes=best.bytes;encoding=best.encoding;extension=encoding?'gz':'glb';selected=!bytes.equals(input);codec=best.name==='source'?'native-glb':r.codec;
    reference={...await artifact(gzipSync(r.baselineBytes,{level:9,mtime:0}),'gz'),encoding:'gzip',codec:'native-glb',requiresWASM:false};
    metrics={...r,bytes:undefined,baselineBytes:undefined,selected,representation:best.name,glbCandidates:choices.map(c=>({representation:c.name,encoding:c.encoding,bytes:c.bytes.length}))};
  }
  const stored=await artifact(bytes,extension),entry={source,sourceBytes:snapshot.bytes,sourceSHA256:snapshot.sha256,...stored,codec,encoding,requiresWASM:false,compressionSafe,selected,dependencies:offline.dependencies[source]||[]};
  entry.selected=Boolean(entry.selected);
  if(metrics.quality?.loop)entry.loopSafe=metrics.quality.outputSeam.pass;
  if(variants)entry.variants=variants;
  if(reference)entry.reference=reference;
  assets.push(entry);bySource.set(source,entry);quality.push({source,elapsedMS:Number((performance.now()-start).toFixed(3)),...metrics});
  if(++index%50===0)console.log(`${index}/${paths.length} assets`);
}
assets.sort((a,b)=>a.source.localeCompare(b.source,'en'));quality.sort((a,b)=>a.source.localeCompare(b.source,'en'));

// The phone receives only JavaScript and uses native DecompressionStream.
const runtimeFiles=['runtime/loader.mjs','runtime/motion16.mjs'];
const runtime=[];for(const file of runtimeFiles){const b=await readFile(path.join(ROOT,file));runtime.push({output:file,bytes:b.length,sha256:sha256(b)});}
// Originals must still match their initial snapshot, including noncompressed data.
for(const [source,snapshot]of snapshots)if(sha256(await readFile(await sourcePath(source)))!==snapshot.sha256)throw Error(`Original changed during compression: ${source}`);
const downloaded=ps=>{const seen=new Set();return ps.reduce((sum,p)=>{const a=bySource.get(p);if(seen.has(a.output))return sum;seen.add(a.output);return sum+a.bytes;},0);};
const original=ps=>ps.reduce((sum,p)=>sum+snapshots.get(p).bytes,0),shared=unique([...offline.groups.core,...offline.groups.shell]),overhead=runtime.reduce((s,a)=>s+a.bytes,0);
const games=Object.fromEntries(Object.entries(offline.manifest.games).map(([name,ps])=>{const direct=unique(ps),closed=offline.close(ps),full=offline.close([...shared,...ps]);return [name,{files:direct.length,beforeBytes:original(direct),dependencyCompleteBeforeBytes:original(closed),afterBytes:downloaded(closed),withSharedBeforeBytes:original(full),withSharedAfterBytes:downloaded(full)+overhead}];}));
const manifest={schema:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:REPO,encoding:'utf8'}).trim(),offlineManifestSHA256:offline.sha256,scope:args.has('--all')?'all scanned assets plus offline shell':'offline manifest plus GLB external dependencies',units:'decimal MB',runtimeRequiresWASM:false,toolVersions:{node:process.version,platform:process.platform,architecture:process.arch,sharp:sharp.versions,legacyBuildOnly:'gltf-transform 4.2.1, draco3dgltf 1.5.7, meshoptimizer 0.25.0; never shipped',webpExact:'@jsquash/webp 1.5.0 (authoring only)',ffmpeg:execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0]},qualityLimits:{motion:MOTION_LIMITS,audio:AUDIO_LIMITS,geometry:GLB_LIMITS,imageMaxRGBAError:0},target:{webp:'Android Chrome and iOS Safari 14+; lossless RGBA',opus:'OGG Opus native: Android Chrome; iOS Safari 18.4+. Retained MP3 entries remain MP3.',json:'Native gzip DecompressionStream; motion16 uses JavaScript only',glb:'Native GLB and KHR_mesh_quantization; no Draco, Meshopt, KTX2 or decoder'},integrationRequired:true,games,totals:{uniqueManifestBeforeBytes:original(offline.direct),dependencyCompleteBeforeBytes:original(offline.paths),selectedAssetBytes:downloaded(offline.paths),runtimeDecoderBytes:overhead,selectedWithRuntimeBytes:downloaded(offline.paths)+overhead,physicalArtifactsBytes:[...allArtifacts.values()].reduce((s,a)=>s+a.bytes,0)},groups:offline.groups,extraDependencies:inventory.extraDependencies,assets,runtime};
await saveJSON(path.join(ROOT,'quality.json'),{schema:1,assets:quality});
await saveJSON(path.join(ROOT,'manifest.json'),manifest);
// A small runtime index excludes quality evidence and rejected variants.
const indexManifest={schema:1,runtimeRequiresWASM:false,sourceCommit:manifest.sourceCommit,offlineManifestSHA256:manifest.offlineManifestSHA256,groups:Object.fromEntries(Object.entries(manifest.groups).map(([k,ps])=>[k,ps.filter(p=>!bySource.get(p).omitted)])),runtime:manifest.runtime,assets:assets.filter(a=>!a.omitted).map(({source,output,bytes,sha256,codec,encoding})=>({source,output,bytes,sha256,codec,encoding}))};
await save(path.join(ROOT,'offline-pack.json'),JSON.stringify(indexManifest)+'\n');
manifest.totals.runtimeIndexBytes=(await stat(path.join(ROOT,'offline-pack.json'))).size;
manifest.totals.selectedWithRuntimeAndIndexBytes=manifest.totals.selectedWithRuntimeBytes+manifest.totals.runtimeIndexBytes;
await saveJSON(path.join(ROOT,'manifest.json'),manifest);
// Prune only stale content-addressed outputs owned by this tool, after the new
// manifest is complete. Authoring files and original assets are never removed.
for(const name of await readdir(output))if(/^[a-f0-9]{64}\.[a-z0-9]+$/.test(name)&&!allArtifacts.has(`compressed/${name}`))await rm(path.join(output,name));
await writeReport(manifest,inventory,quality);
console.log(JSON.stringify({beforeMB:mb(manifest.totals.dependencyCompleteBeforeBytes),afterMB:mb(manifest.totals.selectedWithRuntimeAndIndexBytes),assets:assets.length,changed:assets.filter(a=>a.selected).length,unsafeCandidates:assets.filter(a=>!a.compressionSafe).length}));
