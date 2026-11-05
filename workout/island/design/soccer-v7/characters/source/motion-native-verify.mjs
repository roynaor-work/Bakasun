import fs from 'node:fs/promises';import path from'node:path';import crypto from'node:crypto';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
const require=createRequire(process.env.SOCCER_ASSET_TOOLS||'/tmp/soccer-v7-tools/package.json'),{NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),codec=require('draco3dgltf'),validator=require('gltf-validator');
const root=process.env.SOCCER_VERIFY_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arg=n=>process.argv.find(x=>x.startsWith('--'+n+'='))?.slice(n.length+3),sha256=b=>crypto.createHash('sha256').update(b).digest('hex'),motion=JSON.parse(await fs.readFile(path.join(root,'animations.json'))),motionSHA256=sha256(await fs.readFile(path.join(root,'animations.json'))),decoder=await codec.createDecoderModule(),io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':decoder});
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


const publish=process.argv.includes('--publish-report'),manifestPath=arg('manifest')||path.join(root,'asset-manifest.json'),manifestBytes=await fs.readFile(manifestPath),manifest=JSON.parse(manifestBytes),baselineRoot=arg('baseline-root')||path.join(root,'iterations/35/frozen-package'),selected=arg('file')?[{file:arg('file'),relative:arg('canonical')||'models/'+path.basename(arg('file'))}]:manifest.characters.flatMap(c=>(c.kits||[c]).flatMap(k=>['lod0','lod1'].map(level=>({file:path.resolve(arg('models-root')||root,k[level]),relative:'models/'+path.basename(k[level]),kit:k,level}))));
const entries=[];
if(publish&&(arg('file')||selected.length!==16||new Set(selected.map(x=>x.relative)).size!==16))throw Error('Publishing requires the complete16-model manifest');
for(const {file,relative,kit,level}of selected){
 const before=await fs.readFile(file),baselineFile=arg('baseline')||path.join(baselineRoot,relative),base=await fs.readFile(baselineFile),a=parseGLB(base),b=parseGLB(before),stableFileHash=sha256(before);
 if(kit&&(before.length!==kit[level+'Bytes']||stableFileHash!==kit[level+'Sha256']))throw Error('Manifest does not bind current bytes '+relative);
 if(!b.json.animations||b.json.animations.length!==31||b.json.extras?.nativeMotion?.sha256!==motionSHA256)throw Error('Expected current7c native payload '+file);
 const prefixPreserved=b.binary.length>=a.binary.length&&b.binary.subarray(0,a.binary.length).equals(a.binary);if(!prefixPreserved)throw Error('Original full BIN prefix changed '+file);
 const equal=(x,y)=>JSON.stringify(x)===JSON.stringify(y),nativeJSONUnchanged=equal(a.json.animations,b.json.animations)&&equal(a.json.extras.nativeMotion,b.json.extras.nativeMotion),nativeAccessorIds=[...new Set(a.json.animations.flatMap(x=>x.samplers.flatMap(s=>[s.input,s.output])))].sort((x,y)=>x-y),payloadParts=[];
 if(!nativeJSONUnchanged)throw Error('Native animation JSON changed '+file);
 for(const id of nativeAccessorIds){const ac=a.json.accessors[id],bc=b.json.accessors[id];if(!equal(ac,bc)||!equal(a.json.bufferViews[ac.bufferView],b.json.bufferViews[bc.bufferView]))throw Error('Native accessor changed '+id);const view=a.json.bufferViews[ac.bufferView],bytes=a.binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);payloadParts.push(Buffer.from(String(id)+':'),bytes);}
 if(!equal(a.json.nodes,b.json.nodes)||!equal(a.json.skins,b.json.skins))throw Error('Canonical rig/node binding changed');
 for(const key of['materials','images','textures','samplers'])if(!equal(a.json[key],b.json[key]))throw Error('Material/image/texture JSON changed '+key);
 let clothChanged=0;
 for(let mi=0;mi<a.json.meshes.length;mi++)for(let pi=0;pi<a.json.meshes[mi].primitives.length;pi++){const ap=a.json.meshes[mi].primitives[pi],bp=b.json.meshes[mi].primitives[pi],name=a.json.materials[ap.material].name;if(name!=='Cloth'){if(!equal(ap,bp))throw Error('Non-Cloth primitive changed '+name);}else if(!equal(ap,bp))clothChanged++;}
 const doc=await io.readBinary(before),joints=new Map(doc.getRoot().listSkins().flatMap(s=>s.listJoints()).map(j=>[j.getName(),j]));if(joints.size!==18)throw Error('Rig not18');for(const spec of motion.skeleton.bones){const n=joints.get(spec.name);if(!n||n.getTranslation().some((v,i)=>Math.abs(v-spec.restTranslationMeters[i])>1e-4)||n.getRotation().slice(0,3).some(v=>Math.abs(v)>1e-4)||Math.abs(Math.abs(n.getRotation()[3])-1)>1e-4)throw Error('Noncanonical rest '+spec.name);}
 const nativeContract=verifyNativeContract(doc),validation=await validator.validateBytes(before,{maxIssues:100,ignoredIssues:['UNSUPPORTED_EXTENSION']}),textures=textureSignatures(doc),baseDoc=await io.readBinary(base);if(!equal(textures,textureSignatures(baseDoc)))throw Error('Encoded textures changed');if(triangleCount(doc)!==triangleCount(baseDoc))throw Error('Triangles changed');const rerender=await fs.readFile(file);if(sha256(rerender)!==stableFileHash)throw Error('Candidate changed during verification');
 const entry={path:relative,candidateFile:file,baselineFile,beforeBytes:base.length,bytes:before.length,addedBytes:before.length-base.length,sha256:stableFileHash,baselineSha256:sha256(base),clipCount:31,channelsPerClip:19,fps:30,triangles:triangleCount(doc),originalFullBinaryBytes:a.binary.length,originalFullBinarySha256:sha256(a.binary),fullOriginalBinaryPrefixPreserved:prefixPreserved,nativeAnimationJsonUnchanged:nativeJSONUnchanged,nativeAccessorCount:nativeAccessorIds.length,nativeAccessorPayloadSha256:sha256(Buffer.concat(payloadParts)),nativePayloadRetainedByteExact:true,postNativeGeometryBytes:b.binary.length-a.binary.length,modifiedClothPrimitives:clothChanged,modelsMutated:false,sourceMotionSha256:motionSHA256,nativeContract,embeddedTextures:textures,extensions:doc.getRoot().listExtensionsUsed().map(e=>e.extensionName).sort(),khronosErrors:validation.issues.numErrors,khronosWarnings:validation.issues.numWarnings,khronosIssues:validation.issues.messages,pass:before.length<=1500000&&validation.issues.numErrors===0};entries.push(entry);console.log(JSON.stringify({file,path:relative,bytes:entry.bytes,pass:entry.pass,errors:entry.khronosErrors,postNativeGeometryBytes:entry.postNativeGeometryBytes}));
}
const report={schemaVersion:2,partial:entries.length!==16,mode:'verifyExistingNativeAfterAppendOnlyGeometryPatch',dryRun:!publish,modelsMutated:false,source:'animations.json',motionSHA256,clipCount:31,fps:30,rootMotion:false,authored:true,motionCapture:false,modelCount:entries.length,maxGlbBytes:Math.max(...entries.map(e=>e.bytes)),nativePayloadRetainedByteExact:true,entries,pass:entries.every(e=>e.pass)};if(publish&&(!report.pass||sha256(await fs.readFile(manifestPath))!==sha256(manifestBytes)||sha256(await fs.readFile(path.join(root,'animations.json')))!==motionSHA256))throw Error('Native report inputs changed or failed; refusing publish');
if(publish)for(const entry of entries)if(sha256(await fs.readFile(entry.candidateFile))!==entry.sha256)throw Error('Model changed before report publication '+entry.path);
const output=arg('output')||(publish?path.join(root,'source/motion-embedded-report.json'):'/tmp/soccer-v7-native-retained-report.json');await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');if(!report.pass)process.exitCode=1;
