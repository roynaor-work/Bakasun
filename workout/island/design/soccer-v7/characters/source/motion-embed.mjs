#!/usr/bin/env node
/** Add native 30Hz glTF animation to final Draco GLBs. Authoring only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(process.env.SOCCER_ASSET_TOOLS || '/tmp/soccer-v7-tools/package.json');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const codec = require('draco3dgltf');
const validator = require('gltf-validator');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'asset-manifest.json');
const dryRun = process.argv.includes('--dry-run');
const onlyFile = process.argv.find(argument => argument.startsWith('--only='))?.slice(7);
if (onlyFile && (!dryRun || !/^models\/[a-z0-9-]+\.glb$/.test(onlyFile))) throw Error('--only is a read-only --dry-run option for one models/*.glb file');
const reportPath = path.join(root, 'source', dryRun ? 'motion-embedded-preview.json' : 'motion-embedded-report.json');
const sourceBytes = await fs.readFile(path.join(root, 'animations.json'));
const motion = JSON.parse(sourceBytes);
const motionSHA256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');
const manifestBytes = await fs.readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
if (motion.fps !== 30 || motion.skeleton.bones.length !== 18 || motion.clips.length !== 31) throw Error('Unexpected canonical motion contract');
const roles = manifest.characters.map(character => character.role);
const characterIds = new Set(manifest.characters.map(character => character.id));
const modelPaths = manifest.characters.flatMap(character => (character.kits || [character]).flatMap(kit => [kit.lod0, kit.lod1]));
if (characterIds.size !== 8 || manifest.characters.length !== 8 || roles.filter(role => role === 'field').length !== 6
  || roles.filter(role => role === 'goalkeeper').length !== 1 || roles.filter(role => role === 'referee').length !== 1
  || modelPaths.length !== 16 || new Set(modelPaths).size !== 16) {
  throw Error('Final asset freeze required: six field players, one goalkeeper, one referee, and 16 unique LOD paths');
}
const decoder = await codec.createDecoderModule();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': decoder });
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const quantization = { method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5,
  quantizePosition: 15, quantizeNormal: 12, quantizeTexcoord: 13, quantizeGeneric: 0 };
const staged = [];
const entries = [];

function parseGLB(bytes) {
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length) throw Error('Invalid GLB header');
  let json=null,binary=null;
  for(let offset=12;offset<bytes.length;){
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+length);
    if(type===0x4e4f534a&&!json)json=JSON.parse(chunk.toString('utf8').trim());
    else if(type===0x004e4942&&!binary)binary=Buffer.from(chunk);
    else throw Error('Unexpected or duplicate GLB chunk');
    offset+=8+length;
  }
  if(!json||!binary||json.buffers?.length!==1||json.buffers[0].uri)throw Error('Expected one embedded GLB buffer');
  return {json,binary};
}

function writeGLB(json,binary) {
  const raw=Buffer.from(JSON.stringify(json)),jsonBytes=Buffer.alloc((raw.length+3)&~3,0x20);raw.copy(jsonBytes);
  const binBytes=Buffer.alloc((binary.length+3)&~3);binary.copy(binBytes);
  const result=Buffer.alloc(12+8+jsonBytes.length+8+binBytes.length);
  result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(jsonBytes.length,12);result.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(result,20);
  const binOffset=20+jsonBytes.length;result.writeUInt32LE(binBytes.length,binOffset);result.writeUInt32LE(0x004e4942,binOffset+4);binBytes.copy(result,binOffset+8);
  return result;
}

function appendNativeMotion(bytes) {
  const {json,binary:inputBinary}=parseGLB(bytes),previous=json.extras?.nativeMotion?.embedding;
  let baseBinary=inputBinary;
  if(json.animations?.length){
    if(!previous)throw Error('Input has unrelated animations; cannot replace them without an explicit authoring contract');
    const animationAccessors=[...new Set(json.animations.flatMap(animation=>animation.samplers.flatMap(sampler=>[sampler.input,sampler.output])))],animationViews=[...new Set(animationAccessors.map(index=>json.accessors[index].bufferView))],animationEnd=Math.max(...animationViews.map(index=>{const view=json.bufferViews[index];return(view.byteOffset||0)+view.byteLength;}));
    if(json.accessors.length>Math.max(...animationAccessors)+1||json.bufferViews.length>Math.max(...animationViews)+1||inputBinary.length>((animationEnd+3)&~3))throw Error('Post-animation geometry data is present; refusing to truncate it. Verify the existing native payload without rewriting the GLB.');
    json.accessors.length=previous.baseAccessorCount;json.bufferViews.length=previous.baseBufferViewCount;
    baseBinary=inputBinary.subarray(0,previous.baseBinaryBytes);json.buffers[0].byteLength=previous.baseDeclaredBufferBytes;
  }
  const embedding={baseAccessorCount:json.accessors?.length||0,baseBufferViewCount:json.bufferViews?.length||0,
    baseBinaryBytes:baseBinary.length,baseDeclaredBufferBytes:json.buffers[0].byteLength};
  json.accessors||=[];json.bufferViews||=[];json.animations=[];
  const originalGeometryJSON=JSON.stringify({meshes:json.meshes,skins:json.skins,nodes:json.nodes,materials:json.materials,
    images:json.images,textures:json.textures,samplers:json.samplers,extensions:json.extensions,
    accessors:json.accessors,bufferViews:json.bufferViews});
  const joints=new Map(json.nodes.map((node,index)=>[node.name,index]));
  const unique=new Map(),parts=[baseBinary],clipStats=[];
  let byteLength=baseBinary.length,rawOutputBytes=0,uniqueAccessorBytes=0;
  const accessor=(type,values)=>{
    const array=values instanceof Float32Array?values:new Float32Array(values),payload=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    const key=type+'/'+sha256(payload);rawOutputBytes+=payload.length;
    if(!unique.has(key)){
      const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:payload.length});
      const components={SCALAR:1,VEC3:3,VEC4:4}[type],entry={bufferView:view,componentType:5126,count:array.length/components,type};
      if(type==='SCALAR'){entry.min=[Math.min(...array)];entry.max=[Math.max(...array)];}
      const index=json.accessors.length;json.accessors.push(entry);unique.set(key,index);parts.push(payload);byteLength+=payload.length;uniqueAccessorBytes+=payload.length;
    }
    return unique.get(key);
  };
  for(const clip of motion.clips){
    const input=accessor('SCALAR',clip.frames.map(frame=>frame.timeSeconds)),samplerCache=new Map();
    const animation={name:clip.id,samplers:[],channels:[],extras:{fps:30,rootMotion:false,authored:true,motionCapture:false,
      loop:clip.loop,contactData:'animations.json#'+clip.id,motionSha256:motionSHA256}};
    const add=(name,targetPath,type,values)=>{
      const output=accessor(type,values);let sampler=samplerCache.get(output);
      if(sampler===undefined){sampler=animation.samplers.length;animation.samplers.push({input,output,interpolation:'LINEAR'});samplerCache.set(output,sampler);}
      animation.channels.push({sampler,target:{node:joints.get(name),path:targetPath}});
    };
    for(const spec of motion.skeleton.bones){
      const values=new Float32Array(clip.frames.length*4);
      for(let i=0;i<clip.frames.length;i++){const q=clip.frames[i].rotations[spec.name],norm=Math.hypot(...q);for(let k=0;k<4;k++)values[i*4+k]=q[k]/norm;}
      add(spec.name,'rotation','VEC4',values);
    }
    const hips=motion.skeleton.bones.find(bone=>bone.name==='Hips'),values=new Float32Array(clip.frames.length*3);
    for(let i=0;i<clip.frames.length;i++)for(let k=0;k<3;k++)values[i*3+k]=hips.restTranslationMeters[k]+clip.frames[i].hipsOffsetMeters[k];
    add('Hips','translation','VEC3',values);json.animations.push(animation);
    clipStats.push({id:clip.id,frames:clip.frames.length,duration:clip.duration,channels:animation.channels.length,samplers:animation.samplers.length});
  }
  json.extras={...json.extras,nativeMotion:{clipCount:31,fps:30,rootMotion:false,authored:true,motionCapture:false,source:'animations.json',sha256:motionSHA256,
    referenceRootPath:'omitted; simulation owns character position',contacts:'portable IK/contact metadata in animations.json',embedding}};
  json.buffers[0].byteLength=byteLength;
  const result=writeGLB(json,Buffer.concat(parts,byteLength)),check=parseGLB(result);
  if(!check.binary.subarray(0,baseBinary.length).equals(baseBinary))throw Error('Original embedded binary payload changed');
  const preservedGeometryJSON=JSON.stringify({meshes:check.json.meshes,skins:check.json.skins,nodes:check.json.nodes,materials:check.json.materials,
    images:check.json.images,textures:check.json.textures,samplers:check.json.samplers,extensions:check.json.extensions,
    accessors:check.json.accessors.slice(0,embedding.baseAccessorCount),bufferViews:check.json.bufferViews.slice(0,embedding.baseBufferViewCount)});
  if(originalGeometryJSON!==preservedGeometryJSON)throw Error('Original geometry, material or texture JSON changed');
  return {bytes:result,rawOutputBytes,uniqueAccessorBytes,uniqueAccessors:unique.size,clipStats,
    originalBinaryBytes:baseBinary.length,originalBinarySha256:sha256(baseBinary),originalGeometryJsonSha256:sha256(Buffer.from(originalGeometryJSON))};
}

function triangleCount(document) {
  let count = 0;
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    count += (primitive.getIndices()?.getCount() || primitive.getAttribute('POSITION').getCount()) / 3;
  }
  return count;
}

function textureSignatures(document) {
  return document.getRoot().listTextures().map(texture => ({ mimeType: texture.getMimeType(),
    bytes: texture.getImage().byteLength, sha256: sha256(texture.getImage()) }))
    .sort((a,b) => (a.mimeType+a.sha256).localeCompare(b.mimeType+b.sha256));
}

function extrasSnapshot(document) {
  const root = document.getRoot();
  const properties = [['root',root], ...root.listNodes().map((node,i)=>['node/'+i,node]),
    ...root.listMaterials().map((material,i)=>['material/'+i,material])];
  root.listMeshes().forEach((mesh,i) => {
    properties.push(['mesh/'+i,mesh]);
    mesh.listPrimitives().forEach((primitive,j) => properties.push(['primitive/'+i+'/'+j,primitive]));
  });
  return properties.map(([key,property]) => {
    const extras = { ...property.getExtras() };
    if (key === 'root') delete extras.nativeMotion;
    return [key,extras];
  });
}

function verifyNativeContract(document) {
  const animations=document.getRoot().listAnimations(),seen=new Set();
  let maxTimestampErrorSeconds=0,maxComponentError=0,maxQuaternionNormError=0,keys=0;
  if(animations.length!==31)throw Error('Native clip count mismatch');
  for(const animation of animations){
    const clip=motion.clips.find(candidate=>candidate.id===animation.getName()),extras=animation.getExtras();
    if(!clip||seen.has(clip.id)||extras.fps!==30||extras.rootMotion!==false||extras.authored!==true)throw Error('Native clip metadata mismatch');
    seen.add(clip.id);const tracks=new Set();
    if(animation.listChannels().length!==19)throw Error(clip.id+' must contain19 native channels');
    for(const channel of animation.listChannels()){
      const name=channel.getTargetNode()?.getName(),targetPath=channel.getTargetPath(),sampler=channel.getSampler();
      const specification=motion.skeleton.bones.find(bone=>bone.name===name),track=name+'/'+targetPath;
      if(!specification||tracks.has(track)||!['rotation','translation'].includes(targetPath)||targetPath==='translation'&&name!=='Hips')throw Error(clip.id+' has an unexpected track '+track);
      tracks.add(track);const input=sampler.getInput().getArray(),output=sampler.getOutput().getArray(),components=targetPath==='rotation'?4:3;
      if(input.length!==clip.frames.length||output.length!==clip.frames.length*components)throw Error(clip.id+' changed native sample count');
      for(let i=0;i<clip.frames.length;i++){
        maxTimestampErrorSeconds=Math.max(maxTimestampErrorSeconds,Math.abs(input[i]-clip.frames[i].timeSeconds));
        const expected=targetPath==='rotation'?clip.frames[i].rotations[name]:specification.restTranslationMeters.map((v,k)=>v+clip.frames[i].hipsOffsetMeters[k]);
        const norm=targetPath==='rotation'?Math.hypot(...expected):1;
        for(let k=0;k<components;k++)maxComponentError=Math.max(maxComponentError,Math.abs(output[i*components+k]-expected[k]/norm));
        if(targetPath==='rotation')maxQuaternionNormError=Math.max(maxQuaternionNormError,Math.abs(Math.hypot(...output.subarray(i*4,i*4+4))-1));
        keys++;
      }
    }
    for(const spec of motion.skeleton.bones)if(!tracks.has(spec.name+'/rotation'))throw Error(clip.id+' missing rotation '+spec.name);
    if(!tracks.has('Hips/translation'))throw Error(clip.id+' missing Hips translation');
  }
  const pass=maxTimestampErrorSeconds<2e-6&&maxComponentError<2e-6&&maxQuaternionNormError<1e-6;
  if(!pass)throw Error('Native animation keys differ from authored source');
  return {keys,maxTimestampErrorSeconds,maxComponentError,maxQuaternionNormError,pass};
}

for (const character of manifest.characters) for (const kit of character.kits || [character]) for (const level of ['lod0', 'lod1']) {
  const relative = kit[level];
  if (onlyFile && onlyFile !== relative) continue;
  if (!/^models\/[a-z0-9-]+\.glb$/.test(relative)) throw Error('Unexpected model path: ' + relative);
  const file = path.join(root, relative);
  const before = await fs.readFile(file);
  if(before.length!==kit[level+'Bytes']||sha256(before)!==kit[level+'Sha256'])throw Error(relative+' differs from the frozen manifest; wait for compression to finish');
  const document = await io.readBinary(before);
  const beforeTriangles = triangleCount(document);
  const texturesBefore = textureSignatures(document);
  const extensionsBefore = document.getRoot().listExtensionsUsed().map(extension => extension.extensionName).sort();
  if(!extensionsBefore.includes('KHR_draco_mesh_compression'))throw Error(relative+' is still raw; wait for all compressed final assets');
  const extrasBefore = extrasSnapshot(document);
  const joints = new Map(document.getRoot().listSkins().flatMap(skin => skin.listJoints()).map(node => [node.getName(), node]));
  if (joints.size !== 18) throw Error(relative + ' must retain exactly 18 canonical skin joints');
  for (const spec of motion.skeleton.bones) {
    const node = joints.get(spec.name);
    if (!node) throw Error(relative + ' missing ' + spec.name);
    const rotation = node.getRotation(), translation = node.getTranslation();
    if (Math.abs(rotation[0]) + Math.abs(rotation[1]) + Math.abs(rotation[2]) > 1e-4 || Math.abs(Math.abs(rotation[3]) - 1) > 1e-4) throw Error(relative + ' noncanonical rest quaternion: ' + spec.name);
    if (translation.some((v, i) => Math.abs(v - spec.restTranslationMeters[i]) > 1e-4)) throw Error(relative + ' noncanonical rest translation: ' + spec.name);
  }
  // Append animation accessors to the original binary. Existing Draco payloads,
  // images, buffer views and geometry JSON remain byte-for-byte unchanged.
  const native = appendNativeMotion(before);
  const after = native.bytes;
  if(!appendNativeMotion(after).bytes.equals(after))throw Error(relative+' native append is not byte-idempotent');
  const decoded = await io.readBinary(after);
  const afterTriangles = triangleCount(decoded);
  const texturesAfter = textureSignatures(decoded);
  const extensionsAfter = decoded.getRoot().listExtensionsUsed().map(extension => extension.extensionName).sort();
  if (beforeTriangles !== afterTriangles) throw Error(relative + ' triangle count changed during animation embedding');
  if (JSON.stringify(texturesBefore) !== JSON.stringify(texturesAfter)) throw Error(relative + ' image MIME type or encoded bytes changed during animation embedding');
  for (const extension of extensionsBefore) if (!extensionsAfter.includes(extension)) throw Error(relative + ' lost extension ' + extension);
  if (JSON.stringify(extrasBefore) !== JSON.stringify(extrasSnapshot(decoded))) throw Error(relative + ' source geometry/material/provenance extras changed during animation embedding');
  const nativeContract=verifyNativeContract(decoded);
  const validation = await validator.validateBytes(after, { maxIssues: 100, ignoredIssues: ['UNSUPPORTED_EXTENSION'] });
  const nativeErrors = validation.issues.numErrors;
  const entry = { path: relative, beforeBytes: before.length, bytes: after.length,
    addedBytes: after.length - before.length, sha256: sha256(after),
    triangles: afterTriangles, clipCount: 31, channelsPerClip: 19, fps: 30,
    extensionsBefore, extensionsAfter, texturesPreserved: true, sourceExtrasPreserved: true, embeddedTextures: texturesAfter,
    rawAccessorBytes: native.rawOutputBytes, uniqueAccessorBytes: native.uniqueAccessorBytes, uniqueAccessors: native.uniqueAccessors,
    geometryEncodingUnchanged: true, nativeAppendIdempotent: true, originalBinaryBytes: native.originalBinaryBytes,
    originalBinarySha256: native.originalBinarySha256, originalGeometryJsonSha256: native.originalGeometryJsonSha256,
    nativeContract,
    khronosErrors: nativeErrors, khronosWarnings: validation.issues.numWarnings,
    khronosIssues: validation.issues.messages.map(issue => ({ code: issue.code, severity: issue.severity,
      pointer: issue.pointer, message: issue.message })),
    clips: native.clipStats, pass: after.length <= 1500000 && nativeErrors === 0 };
  entries.push(entry);
  staged.push({ file, bytes: after, sourceSha256:sha256(before), kit, level, entry });
  console.log(JSON.stringify({ path: relative, bytes: after.length, addedBytes: entry.addedBytes, khronosErrors: nativeErrors, pass: entry.pass }));
}

if (!entries.length) throw Error('No manifest model matches the selected preview path');
const report = { schemaVersion: 1, dryRun, partial: entries.length !== modelPaths.length, source: 'animations.json', motionSHA256,
  clipCount: 31, fps: 30, rootMotion: false, authored: true, motionCapture: false,
  modelCount: entries.length, maxGlbBytes: Math.max(...entries.map(entry => entry.bytes)),
  compression: { extension: 'KHR_draco_mesh_compression', geometryReencoded: false, preservedSourceQuantization: quantization },
  referenceRootPathEmbedded: false, entries, pass: entries.every(entry => entry.pass) };
if (!report.pass) {
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  throw Error('Native animation package failed budget/validation; no source GLBs were changed. See ' + path.relative(root, reportPath));
}
if (!dryRun) {
  if(sha256(await fs.readFile(manifestPath))!==sha256(manifestBytes)||sha256(await fs.readFile(path.join(root,'animations.json')))!==motionSHA256)
    throw Error('Motion or manifest changed while native animations were staged; no source GLBs changed');
  for(const item of staged)if(sha256(await fs.readFile(item.file))!==item.sourceSha256)throw Error(item.entry.path+' changed while staging; no source GLBs changed');
  for (const item of staged) {
    await fs.writeFile(item.file, item.bytes);
    item.kit[item.level + 'BytesBeforeAnimations'] ??= item.entry.beforeBytes;
    item.kit[item.level + 'Bytes'] = item.entry.bytes;
    item.kit[item.level + 'Sha256'] = item.entry.sha256;
    item.kit[item.level + 'NativeAnimationCount'] = 31;
  }
  manifest.nativeAnimations = { clipCount: 31, fps: 30, rootMotion: false, authored: true,
    motionCapture: false, source: 'animations.json', motionSHA256,
    channelsPerClip: 19, referenceRootPathEmbedded: false };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ dryRun, models: entries.length, largestBytes: report.maxGlbBytes, pass: report.pass }));
