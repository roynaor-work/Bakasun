// Independent inspection of the delivered, Draco-compressed assets.
// Dependencies live outside the repository; the preview itself needs none.
// node workout/island/design/alpine-v7/tools/audit-assets.mjs --modules /tmp/alpine-v7-tools
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Matrix4} from '../../../vendor/three.module.js';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const PACK=path.resolve(HERE,'..');
const REPO=path.resolve(PACK,'../../../..');
const args=process.argv.slice(2);
const option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const modules=option('--modules','/tmp/alpine-v7-tools');
const require=createRequire(path.resolve(modules,'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf');
const validator=require('gltf-validator');
const sharp=require('sharp');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder':await draco.createDecoderModule(),
});
const OUTPUT=path.resolve(PACK,option('--out','verification/asset-audit.json'));
if(!OUTPUT.startsWith(PACK+path.sep))throw Error('Report output must stay inside alpine-v7.');
const canonicalFile=path.resolve(PACK,'../motion2/alpine.json');
const canonicalBytes=await fs.readFile(canonicalFile);
const canonical=JSON.parse(canonicalBytes).skeleton.bones;
const canonicalNames=canonical.map(b=>b.name);
const requiredClips=['glide','carve_left','carve_right','crouch','accelerate','ramp_jump','trick_180','trick_360','trick_shifty','trick_tail_grab','trick_backflip','fall_roll','get_up','celebrate'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const relative=f=>path.relative(PACK,f).split(path.sep).join('/');
const errors=[];
const fail=(condition,message)=>{if(!condition)throw Error(message);};
const finite=(a,message)=>fail(a&&Array.from(a).every(Number.isFinite),message);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function filesUnder(dir){
  let entries;
  try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const nested=await Promise.all(entries.map(e=>e.isDirectory()?filesUnder(path.join(dir,e.name)):[path.join(dir,e.name)]));
  return nested.flat().sort();
}
function parseGLB(bytes){
  fail(bytes.length>=28,'GLB too short');
  fail(bytes.readUInt32LE(0)===0x46546c67,'Invalid GLB magic');
  fail(bytes.readUInt32LE(4)===2,'GLB version must be 2');
  fail(bytes.readUInt32LE(8)===bytes.length,'Declared GLB length differs from file');
  let offset=12,json=null,bin=null;
  while(offset<bytes.length){
    fail(offset+8<=bytes.length,'Truncated GLB chunk header');
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;
    fail(length%4===0&&offset+length<=bytes.length,'Invalid GLB chunk length/alignment');
    if(type===0x4e4f534a){fail(!json,'Multiple GLB JSON chunks');json=JSON.parse(bytes.subarray(offset,offset+length).toString());}
    if(type===0x004e4942){fail(!bin,'Multiple GLB BIN chunks');bin=bytes.subarray(offset,offset+length);}
    offset+=length;
  }
  fail(json?.asset?.version==='2.0','Missing glTF 2.0 JSON');
  fail(bin,'Missing embedded BIN chunk');
  return {json,bin};
}
function inspectRaw(json,bin){
  fail(json.extensionsRequired?.includes('KHR_draco_mesh_compression'),'Draco must be required');
  fail(json.meshes?.length>0,'No meshes');
  fail((json.buffers??[]).every(b=>!b.uri),'GLB has an external buffer');
  fail((json.images??[]).every(i=>i.bufferView!==undefined&&!i.uri),'GLB has an external image');
  for(const view of json.bufferViews??[]){
    fail((view.byteOffset??0)>=0&&view.byteLength>=0,'Negative buffer view offset/length');
    fail((view.byteOffset??0)+view.byteLength<=bin.length,'Buffer view exceeds embedded data');
  }
  let triangles=0,primitives=0;
  for(const mesh of json.meshes)for(const p of mesh.primitives){
    fail((p.mode??4)===4,'Only triangle primitives are supported');
    fail(p.extensions?.KHR_draco_mesh_compression,'Primitive is not Draco-compressed');
    fail(p.attributes?.POSITION!==undefined,'Primitive has no POSITION');
    const count=p.indices!==undefined?json.accessors[p.indices]?.count:json.accessors[p.attributes.POSITION]?.count;
    fail(Number.isInteger(count)&&count>0&&count%3===0,'Invalid triangle accessor count');
    triangles+=count/3;primitives++;
  }
  return {uniqueMeshTriangles:triangles,primitives,allPrimitivesDraco:true,embeddedBuffers:true,embeddedImages:true};
}
function inspectSkin(doc){
  const skins=doc.getRoot().listSkins();
  fail(skins.length===1,'A character must have exactly one skin');
  const skin=skins[0],joints=skin.listJoints();
  fail(equal(joints.map(j=>j.getName()),canonicalNames),'Skin names/order differ from motion2 canonical 18 bones');
  for(const bone of canonical){
    const joint=joints.find(j=>j.getName()===bone.name),parent=joint.getParentNode();
    fail(bone.parent?parent?.getName()===bone.parent:!joints.includes(parent),`${bone.name}: canonical parent mismatch`);
  }
  const ibm=skin.getInverseBindMatrices();
  fail(ibm?.getCount()===18,'Expected 18 inverse bind matrices');
  const skinnedNodes=doc.getRoot().listNodes().filter(n=>n.getSkin()===skin);
  fail(skinnedNodes.length>0,'Skin has no skinned mesh');
  let maxBindMatrixError=0,maxWeightSumError=0,weightedVertices=0;
  for(const node of skinnedNodes){
    fail(node.getMesh(),'Skin is attached to a node without a mesh');
    const bind=node.getWorldMatrix();
    for(let j=0;j<18;j++){
      const matrix=new Matrix4().fromArray(joints[j].getWorldMatrix()).multiply(new Matrix4().fromArray(ibm.getElement(j,[]))).elements;
      maxBindMatrixError=Math.max(maxBindMatrixError,...matrix.map((v,k)=>Math.abs(v-bind[k])));
    }
    for(const primitive of node.getMesh().listPrimitives()){
      const indices=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
      fail(indices&&weights,'Skinned primitive lacks joint indices or weights');
      fail(indices.getCount()===weights.getCount()&&weights.getCount()===primitive.getAttribute('POSITION').getCount(),'Skin accessor count mismatch');
      for(let i=0;i<weights.getCount();i++){
        const w=weights.getElement(i,[]),j=indices.getElement(i,[]);
        finite(w,'Non-finite skin weights');
        fail(w.every(v=>v>=0&&v<=1.00001),'Weight outside [0,1]');
        fail(j.every(v=>Number.isInteger(v)&&v>=0&&v<18),'Skin references a joint outside 18-bone rig');
        maxWeightSumError=Math.max(maxWeightSumError,Math.abs(w.reduce((sum,v)=>sum+v,0)-1));
        weightedVertices++;
      }
    }
  }
  fail(maxBindMatrixError<=3e-4,`Inverse bind error ${maxBindMatrixError}`);
  fail(maxWeightSumError<=1e-3,`Skin weight sum error ${maxWeightSumError}`);
  return {jointCount:18,jointNames:canonicalNames,hierarchyMatchesCanonical:true,maxBindMatrixError,maxWeightSumError,weightedVertices};
}
function inspectAnimations(doc){
  const result=[];
  for(const a of doc.getRoot().listAnimations()){
    const channels=a.listChannels();fail(channels.length>0,`${a.getName()}: empty animation`);
    let durationSeconds=0,maxQuaternionNormError=0,maxLoopEndpointDifference=0;
    const movingJoints=new Set(),targets=new Set();
    for(const c of channels){
      fail(c.getTargetNode(),`${a.getName()}: missing target node`);
      const sampler=c.getSampler(),input=sampler?.getInput(),output=sampler?.getOutput();
      fail(input&&output,`${a.getName()}: missing sampler data`);
      const times=input.getArray();finite(times,`${a.getName()}: non-finite times`);finite(output.getArray(),`${a.getName()}: non-finite outputs`);
      fail(times.length>=2&&Math.abs(times[0])<=1e-6,`${a.getName()}: time must start at zero with at least two samples`);
      for(let i=1;i<times.length;i++)fail(times[i]>times[i-1],`${a.getName()}: times are not strictly increasing`);
      const cubic=sampler.getInterpolation()==='CUBICSPLINE';
      fail(output.getCount()===input.getCount()*(cubic?3:1),`${a.getName()}: sampler count mismatch`);
      const start=cubic?1:0,stride=cubic?3:1,lastIndex=output.getCount()-(cubic?2:1);
      const first=output.getElement(start,[]),last=output.getElement(lastIndex,[]);
      const rotation=c.getTargetPath()==='rotation';
      let maxVariation=0;
      for(let i=start;i<output.getCount();i+=stride){
        const value=output.getElement(i,[]);
        if(rotation)maxQuaternionNormError=Math.max(maxQuaternionNormError,Math.abs(Math.hypot(...value)-1));
        const sign=rotation&&first.reduce((sum,v,k)=>sum+v*value[k],0)<0?-1:1;
        maxVariation=Math.max(maxVariation,...value.map((v,k)=>Math.abs(sign*v-first[k])));
      }
      const sign=rotation&&first.reduce((sum,v,k)=>sum+v*last[k],0)<0?-1:1;
      maxLoopEndpointDifference=Math.max(maxLoopEndpointDifference,...last.map((v,k)=>Math.abs(sign*v-first[k])));
      const name=c.getTargetNode().getName();targets.add(name);
      if(maxVariation>1e-5&&canonicalNames.includes(name))movingJoints.add(name);
      durationSeconds=Math.max(durationSeconds,times[times.length-1]);
    }
    fail(maxQuaternionNormError<2e-4,`${a.getName()}: non-unit quaternion`);
    fail(durationSeconds>0,`${a.getName()}: zero duration`);
    result.push({name:a.getName(),durationSeconds,channels:channels.length,targetNodes:[...targets],movingJoints:[...movingJoints],maxQuaternionNormError,maxLoopEndpointDifference});
  }
  return result;
}
async function inspectGeometry(doc,file=''){
  let triangles=0,vertices=0,drawPrimitives=0,degenerateTriangles=0;
  const uvAudit=[],texturePixels=new Map(),surfaceWindingAudit=[],signageWindingAudit=[];
  for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
    const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices();
    fail(positions,'Decoded mesh has no positions');finite(positions.getArray(),'Non-finite positions');
    const normal=primitive.getAttribute('NORMAL');if(normal)finite(normal.getArray(),'Non-finite normals');
    const count=indices?.getCount()??positions.getCount();
    triangles+=count/3;vertices+=positions.getCount();drawPrimitives++;
    const material=primitive.getMaterial(),texture=material?.getBaseColorTexture();
    if(texture){
      const channel=material.getBaseColorTextureInfo()?.getTexCoord()??0;
      const uv=primitive.getAttribute('TEXCOORD_'+channel);
      fail(uv,'Textured primitive is missing texture coordinates');finite(uv.getArray(),'Non-finite texture coordinates');
      if(!texturePixels.has(texture))texturePixels.set(texture,await sharp(Buffer.from(texture.getImage())).ensureAlpha().raw().toBuffer({resolveWithObject:true}));
      const pixels=texturePixels.get(texture);let outOfRange=0,black=0;
      for(let i=0;i<uv.getCount();i++){
        const [u,v]=uv.getElement(i,[]);
        if(u<-.0001||u>1.0001||v<-.0001||v>1.0001)outOfRange++;
        const x=Math.min(pixels.info.width-1,Math.max(0,Math.floor(u*pixels.info.width))),y=Math.min(pixels.info.height-1,Math.max(0,Math.floor(v*pixels.info.height))),index=(y*pixels.info.width+x)*4;
        if(pixels.data[index+3]>2&&Math.max(pixels.data[index],pixels.data[index+1],pixels.data[index+2])<3)black++;
      }
      fail(outOfRange===0,'Atlas UV coordinates leave [0,1]');
      fail(black/uv.getCount()<.95,'Atlas UV mapping samples almost entirely black texels');
      uvAudit.push({node:node.getName(),material:material.getName(),samples:uv.getCount(),outOfRange,blackTexelSamples:black,blackFraction:black/uv.getCount()});
    }
    let deckTopFaces=0,deckTopInwardFaces=0,signFrontFaces=0,signBackFaces=0,signInwardFaces=0;
    const equipment=/laminate equipment top/i.test(material?.getName()??''),board=/snowboard/i.test(node.getName());
    for(let i=0;i<count;i+=3){
      const a=positions.getElement(indices?indices.getScalar(i):i,[]),b=positions.getElement(indices?indices.getScalar(i+1):i+1,[]),c=positions.getElement(indices?indices.getScalar(i+2):i+2,[]);
      const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      if(Math.hypot(...normal)<1e-12)degenerateTriangles++;
      if(equipment){
        const center=a.map((value,k)=>(value+b[k]+c[k])/3),horizontal=Math.abs(normal[1])>3*Math.max(Math.abs(normal[0]),Math.abs(normal[2]));
        // Bind-space central deck faces must face upward. A global-centroid
        // orientation rule can turn a curved ski/board deck inside out.
        // Exclude long triangles spanning curved tips: an LOD bottom-face chord
        // can be above the central camber without being an inverted top face.
        const centralTop=board?[a,b,c].every(p=>Math.abs(p[0])<.45)&&Math.abs(center[2])<.06&&center[1]>.016&&center[1]<.038:[a,b,c].every(p=>Math.abs(p[2])<.3)&&center[1]>.012&&center[1]<.037;
        if(horizontal&&centralTop){deckTopFaces++;if(normal[1]<0)deckTopInwardFaces++;}
      }
      if(file.endsWith('/route-marker.glb')){
        const color=primitive.getAttribute('COLOR_0');
        const ids=[indices?indices.getScalar(i):i,indices?indices.getScalar(i+1):i+1,indices?indices.getScalar(i+2):i+2];
        const white=color&&ids.every(index=>{const c=color.getElement(index,[]);return c[0]>.5&&c[1]>.5&&c[2]>.35;});
        const z=(a[2]+b[2]+c[2])/3,parallel=Math.abs(normal[2])>3*Math.max(Math.abs(normal[0]),Math.abs(normal[1]));
        const broadArrow=Math.max(a[0],b[0],c[0])-Math.min(a[0],b[0],c[0])>.15&&Math.max(a[1],b[1],c[1])-Math.min(a[1],b[1],c[1])>.10;
        if(white&&parallel&&broadArrow&&Math.abs(z)>.027){
          if(z>0)signFrontFaces++;else signBackFaces++;
          if(normal[2]*z<0)signInwardFaces++;
        }
      }
    }
    if(deckTopFaces){
      surfaceWindingAudit.push({node:node.getName(),material:material?.getName(),deckTopFaces,deckTopInwardFaces});
      fail(deckTopInwardFaces===0,`Equipment central top deck has ${deckTopInwardFaces}/${deckTopFaces} inward-facing triangles`);
    }
    if(signFrontFaces||signBackFaces){
      signageWindingAudit.push({node:node.getName(),frontGlyphFaces:signFrontFaces,backGlyphFaces:signBackFaces,inwardGlyphFaces:signInwardFaces});
      fail(signInwardFaces===0,`Route-marker glyph has ${signInwardFaces} inward-facing triangles`);
    }
  }
  const textures=[];
  for(const tex of doc.getRoot().listTextures()){
    const bytes=Buffer.from(tex.getImage()??[]);fail(bytes.length>0,'Empty image');
    const info=await sharp(bytes).metadata();
    fail(info.width>0&&info.height>0&&info.width<=1024&&info.height<=1024,'Embedded texture exceeds 1024px');
    textures.push({name:tex.getName(),width:info.width,height:info.height,mimeType:tex.getMimeType(),bytes:bytes.length,sha256:hash(bytes)});
  }
  return {triangles,vertices,drawPrimitives,degenerateTriangles,textures,uvAudit,surfaceWindingAudit,signageWindingAudit,materials:doc.getRoot().listMaterials().length};
}
async function validateGLTF(bytes,uri){
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri,maxIssues:1000});
  delete report.validatedAt;
  return report;
}
async function inspectGLB(file){
  const bytes=await fs.readFile(file);fail(bytes.length<=1500000,'GLB exceeds 1,500,000 bytes');
  const {json,bin}=parseGLB(bytes),raw=inspectRaw(json,bin);
  const compressed=await validateGLTF(bytes,relative(file));
  fail(compressed.issues.numErrors===0,`Khronos validator: ${compressed.issues.numErrors} compressed errors`);
  const doc=await io.readBinary(new Uint8Array(bytes));
  const geometry=await inspectGeometry(doc,relative(file));
  const character=relative(file).startsWith('characters/');
  let skin=null;
  if(character){
    skin=inspectSkin(doc);
    fail(geometry.textures.length===1,`Character must embed exactly one atlas; found ${geometry.textures.length}`);
  }
  const animations=inspectAnimations(doc);
  if(character){
    const names=new Set(animations.map(a=>a.name));
    for(const name of requiredClips)fail(names.has(name),`Missing required animation: ${name}`);
  }
  for(const ext of [...doc.getRoot().listExtensionsUsed()])if(ext.extensionName==='KHR_draco_mesh_compression')ext.dispose();
  const decoded=await validateGLTF(await io.writeBinary(doc),relative(file).replace('.glb','-decoded.glb'));
  fail(decoded.issues.numErrors===0,`Khronos validator: ${decoded.issues.numErrors} decoded errors`);
  const result={file:relative(file),bytes:bytes.length,MB:bytes.length/1000000,sha256:hash(bytes),...raw,...geometry,skin,animations,
    validator:{compressed:{errors:compressed.issues.numErrors,warnings:compressed.issues.numWarnings,infos:compressed.issues.numInfos},decoded:{errors:decoded.issues.numErrors,warnings:decoded.issues.numWarnings,infos:decoded.issues.numInfos}}};
  const outName=relative(file).replaceAll('/','__').replace(/\.glb$/,'-gltf.json');
  await fs.mkdir(path.join(PACK,'verification','gltf'),{recursive:true});
  await fs.writeFile(path.join(PACK,'verification','gltf',outName),JSON.stringify({compressed,decoded},null,2)+'\n');
  return result;
}

const deliveredFiles=(await Promise.all(['characters','world','assets'].map(d=>filesUnder(path.join(PACK,d))))).flat();
const glbs=deliveredFiles.filter(f=>f.endsWith('.glb'));
const images=deliveredFiles.filter(f=>/\.(png|webp|jpe?g)$/i.test(f));
const assets=[],externalTextures=[];
for(const file of glbs){
  try{assets.push(await inspectGLB(file));}
  catch(error){errors.push({file:relative(file),error:error.message});}
}
for(const file of images){
  try{
    const bytes=await fs.readFile(file),info=await sharp(bytes).metadata();
    fail(info.width>0&&info.height>0&&info.width<=1024&&info.height<=1024,'External texture exceeds 1024px');
    externalTextures.push({file:relative(file),bytes:bytes.length,MB:bytes.length/1000000,width:info.width,height:info.height,sha256:hash(bytes)});
  }catch(error){errors.push({file:relative(file),error:error.message});}
}
if(glbs.length===0)errors.push({file:'.',error:'No GLBs delivered yet'});
const characters=assets.filter(a=>a.file.startsWith('characters/'));
const lodGroups={};
for(const asset of characters){
  const id=path.basename(asset.file,'.glb').replace(/-lod\d+$/,'');
  (lodGroups[id]??=[]).push({file:asset.file,triangles:asset.triangles,bytes:asset.bytes});
}
for(const [id,lods]of Object.entries(lodGroups)){
  lods.sort((a,b)=>b.triangles-a.triangles);
  if(lods.length<2)errors.push({file:id,error:'Character has no separate reduced LOD'});
  else if(lods[0].triangles<=lods.at(-1).triangles)errors.push({file:id,error:'Character LOD triangle count does not decrease'});
}
let characterManifest=null;
try{
  characterManifest=JSON.parse(await fs.readFile(path.join(PACK,'characters/manifest.json'),'utf8'));
  const entries=characterManifest.assets??characterManifest.characters??[];
  const sex=new Set(entries.map(e=>e.sex).filter(Boolean));
  if(sex.size<2)errors.push({file:'characters/manifest.json',error:'Both sexes are not documented'});
  if(Object.keys(lodGroups).length!==3)errors.push({file:'characters/',error:`Expected three character identities; found ${Object.keys(lodGroups).length}`});
}catch(error){errors.push({file:'characters/manifest.json',error:'Missing or unreadable character manifest: '+error.message});}

const manifestChecks=[],sourceChecks=[];
for(const name of ['characters/manifest.json','world/manifest-models.json','world/manifest-textures.json','world/manifest-pine-source.json']){
  const manifestFile=path.join(PACK,name);
  let manifest;
  try{manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));}catch{continue;}
  const declaredSources=Array.isArray(manifest.sources)?[...manifest.sources]:[];
  if(manifest.source&&typeof manifest.source==='object'&&manifest.source.sha256)declaredSources.push(manifest.source);
  for(const source of declaredSources){
    const declared=source.path??source.file;
    if(!declared||!source.sha256)continue;
    try{
      const file=declared.startsWith('workout/')?path.resolve(REPO,declared):path.resolve(path.dirname(manifestFile),declared);
      const bytes=await fs.readFile(file);
      fail(hash(bytes)===source.sha256,'Source SHA-256 mismatch');
      sourceChecks.push({file:path.relative(REPO,file),sha256:hash(bytes),license:source.license??null,passed:true});
    }catch(error){errors.push({file:name+' → source '+declared,error:error.message});}
  }
  if(manifest.tool&&manifest.toolSha256){
    try{
      const file=path.resolve(path.dirname(manifestFile),manifest.tool),bytes=await fs.readFile(file);
      fail(hash(bytes)===manifest.toolSha256,'Authoring tool SHA-256 mismatch');
      sourceChecks.push({file:path.relative(REPO,file),sha256:hash(bytes),role:'recorded authoring tool',passed:true});
    }catch(error){errors.push({file:name+' → tool '+manifest.tool,error:error.message});}
  }
  const entries=[...(manifest.file?[manifest]:[]),...(manifest.assets??[]),...(manifest.models??[]),...(manifest.maps??[]),...(manifest.backgrounds??[]),...(manifest.inspectionSheet?[manifest.inspectionSheet]:[])];
  for(const entry of entries){
    if(!entry.file)continue;
    const file=entry.file.startsWith('characters/')?path.resolve(PACK,entry.file):path.resolve(path.dirname(manifestFile),entry.file);
    try{
      fail(file.startsWith(PACK+path.sep),'Manifest file resolves outside the pack');
      const bytes=await fs.readFile(file),actual=assets.find(a=>a.file===relative(file))??externalTextures.find(a=>a.file===relative(file));
      for(const [key,value]of Object.entries({bytes:bytes.length,sha256:hash(bytes),triangles:actual?.triangles,width:actual?.width,height:actual?.height})){
        if(value!==undefined&&entry[key]!==undefined)fail(entry[key]===value,`Manifest ${key} mismatch: declared ${entry[key]}, actual ${value}`);
      }
      let seamEdgeMaxDifference=null;
      if(entry.wrap==='repeat'){
        const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        seamEdgeMaxDifference=0;
        for(let y=0;y<info.height;y++)for(let c=0;c<3;c++)seamEdgeMaxDifference=Math.max(seamEdgeMaxDifference,Math.abs(data[(y*info.width)*4+c]-data[(y*info.width+info.width-1)*4+c]));
        for(let x=0;x<info.width;x++)for(let c=0;c<3;c++)seamEdgeMaxDifference=Math.max(seamEdgeMaxDifference,Math.abs(data[x*4+c]-data[((info.height-1)*info.width+x)*4+c]));
        if(entry.seamEdgeMaxDifference!==undefined)fail(seamEdgeMaxDifference===entry.seamEdgeMaxDifference,`Texture edge seam mismatch: ${seamEdgeMaxDifference}`);
      }
      manifestChecks.push({manifest:name,file:relative(file),passed:true,seamEdgeMaxDifference});
      if(entry.sourceSha256&&typeof entry.source==='string'){
        const source=path.resolve(path.dirname(manifestFile),entry.source),sourceBytes=await fs.readFile(source);
        fail(hash(sourceBytes)===entry.sourceSha256,'Source SHA-256 mismatch');
        sourceChecks.push({file:path.relative(REPO,source),sha256:hash(sourceBytes),passed:true});
      }
    }catch(error){errors.push({file:name+' → '+entry.file,error:error.message});}
  }
}

let git={};
try{
  const run=promisify(execFile);
  git={head:(await run('git',['rev-parse','HEAD'],{cwd:REPO,encoding:'utf8'})).stdout.trim(),branch:(await run('git',['branch','--show-current'],{cwd:REPO,encoding:'utf8'})).stdout.trim()};
}catch(error){git={error:error.message};}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),allPassed:errors.length===0,limits:{maxBytesPerGLB:1500000,maxTextureDimension:1024,canonicalBones:18,atlasesPerCharacter:1},
  tools:{node:process.version,gltfValidator:validator.version(),gltfTransform:JSON.parse(await fs.readFile(path.resolve(modules,'node_modules/@gltf-transform/core/package.json'),'utf8')).version,draco:require('draco3dgltf/package.json').version},
  git,canonicalSkeleton:{file:'../motion2/alpine.json',sha256:hash(canonicalBytes),jointNames:canonicalNames},
  assetCount:glbs.length,assets,externalTextures,lodGroups,manifestChecks,sourceChecks,errors,
  limitations:['This audit validates delivered data, compression, skinning and animation structure. It does not establish visual realism or physical-phone frame rate.','Triangle counts include every mesh node instance in each GLB default scene, separately from unique mesh triangles. Runtime instancing and LOD visibility must be measured by the browser audit.']};
await fs.mkdir(path.dirname(OUTPUT),{recursive:true});
await fs.writeFile(OUTPUT,JSON.stringify(report,null,2)+'\n');
const rows=assets.map(a=>`| ${a.file} | ${a.triangles.toLocaleString('en-US')} | ${(a.bytes/1000000).toFixed(3)} | ${a.textures.map(t=>`${t.width}×${t.height}`).join(', ')||'—'} | ${a.skin?.jointCount??'—'} | ${a.animations.length} |`);
const textureRows=externalTextures.map(t=>`| ${t.file} | ${(t.bytes/1000000).toFixed(3)} | ${t.width}×${t.height} |`);
await fs.writeFile(path.join(PACK,'verification/asset-weights.md'),`# מדידות קבצים\n\nמקור: audit-assets.mjs, בדיקה של קובצי המסירה הדחוסים. MB עשרוני = 1,000,000 בתים.\n\n| קובץ | משולשים | MB | טקסטורות | עצמות | קליפים |\n|---|---:|---:|---|---:|---:|\n${rows.join('\n')}\n\n| תמונה חיצונית | MB | מידות |\n|---|---:|---|\n${textureRows.join('\n')}\n\n${errors.length?'חסרים/כשלים:\n\n'+errors.map(e=>`- ${e.file}: ${e.error}`).join('\n'):'כל בדיקות מבנה הנכסים עברו.'}\n`);
console.log(JSON.stringify({allPassed:report.allPassed,assets:assets.length,externalTextures:externalTextures.length,errors,report:relative(OUTPUT)},null,2));
if(errors.length)process.exitCode=1;
