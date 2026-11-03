// Validate the final compressed delivery, independently of authoring and the viewer.
// Usage: node workout/island/design/skier3/tools/validate-assets.mjs --modules /tmp/alpine-tools
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Matrix4} from '../../../vendor/three.module.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const skierDir=path.resolve(here,'..'),worldDir=path.resolve(skierDir,'../alpine-world');
const args=process.argv.slice(2),modules=args.includes('--modules')?args[args.indexOf('--modules')+1]:'/tmp/alpine-tools';
if(!modules)throw Error('--modules requires a tooling directory');
const require=createRequire(path.resolve(modules,'package.json'));
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf'),validator=require('gltf-validator'),sharp=require('sharp');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const canonicalBytes=await fs.readFile(path.resolve(skierDir,'../motion2/alpine.json'));
const canonical=JSON.parse(canonicalBytes.toString()).skeleton;
const canonicalNames=canonical.bones.map(b=>b.name),clipNames=['glide','crouch','boost','fall','get_up'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const finite=(array,label)=>assert(array&&Array.from(array).every(Number.isFinite),`${label}: non-finite or missing values`);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const out=path.join(skierDir,'verification');await fs.mkdir(out,{recursive:true});

async function validateGLTF(bytes,uri){
  const result=await validator.validateBytes(new Uint8Array(bytes),{uri,maxIssues:0});
  delete result.validatedAt;
  return result;
}
function matricesEqual(a,b,tolerance=2e-5){return a.every((v,i)=>Math.abs(v-b[i])<=tolerance);}
function inspectSkin(doc){
  const skins=doc.getRoot().listSkins();assert(skins.length===1,'skier: expected exactly one skin');
  const skin=skins[0],joints=skin.listJoints();
  assert(equal(joints.map(j=>j.getName()),canonicalNames),'skier: joint names/order differ from canonical 18');
  for(const bone of canonical.bones){
    const joint=joints.find(j=>j.getName()===bone.name),parent=joint.getParentNode();
    if(bone.parent)assert(parent?.getName()===bone.parent,`${bone.name}: wrong parent`);
    else assert(!parent||!joints.includes(parent),'Root: unexpected joint parent');
  }
  const ibm=skin.getInverseBindMatrices();assert(ibm?.getCount()===18,'skier: inverse bind matrix count');
  const skinnedNodes=doc.getRoot().listNodes().filter(n=>n.getSkin()===skin);
  assert(skinnedNodes.length>0,'skier: skin is not attached to a mesh');
  let maxBindMatrixError=0,maxWeightSumError=0,weightedVertices=0;
  for(const node of skinnedNodes){
    assert(node.getMesh(),'skier: skinned node without a mesh');
    const bind=node.getWorldMatrix();
    for(let i=0;i<18;i++){
      const computed=new Matrix4().fromArray(joints[i].getWorldMatrix()).multiply(new Matrix4().fromArray(ibm.getElement(i,[]))).elements;
      maxBindMatrixError=Math.max(maxBindMatrixError,...computed.map((v,k)=>Math.abs(v-bind[k])));
      assert(matricesEqual(computed,bind),`${joints[i].getName()}: inverse bind does not reproduce bind mesh`);
    }
    for(const primitive of node.getMesh().listPrimitives()){
      const indices=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
      assert(indices&&weights,'skier: missing skin attributes');
      assert(indices.getCount()===weights.getCount()&&weights.getCount()===primitive.getAttribute('POSITION').getCount(),'skier: skin attribute count');
      for(let i=0;i<weights.getCount();i++){
        const w=weights.getElement(i,[]),j=indices.getElement(i,[]);finite(w,'weights');
        assert(w.every(v=>v>=0&&v<=1),'skier: invalid weight');
        assert(j.every(v=>Number.isInteger(v)&&v>=0&&v<18),'skier: invalid joint index');
        const error=Math.abs(w.reduce((a,b)=>a+b,0)-1);maxWeightSumError=Math.max(error,maxWeightSumError);
        assert(error<=2e-4,'skier: unnormalized skin weights');weightedVertices++;
      }
    }
  }
  return {jointCount:18,jointNames:canonicalNames,hierarchyMatchesCanonical:true,inverseBindMatricesValid:true,maxBindMatrixError,maxWeightSumError,weightedVertices};
}
function inspectAnimations(doc,manifest){
  const animations=doc.getRoot().listAnimations();
  assert(equal(animations.map(a=>a.getName()).sort(),[...clipNames].sort()),'skier: expected exactly glide, crouch, boost, fall, get_up');
  const entries=manifest.assets?.find(a=>a.id==='skier')?.animations??manifest.animations??[];
  const records=[];
  for(const animation of animations){
    const channels=animation.listChannels(),targets=new Set(),varyingTargets=new Set();let durationSeconds=0,maxLoopSeamError=0;
    assert(channels.length>0,`${animation.getName()}: no channels`);
    for(const channel of channels){
      const name=channel.getTargetNode()?.getName(),sampler=channel.getSampler(),property=channel.getTargetPath();
      assert(canonicalNames.includes(name)||['LeftPole','RightPole'].includes(name),`${animation.getName()}: unexpected animation target`);
      assert(['rotation','translation','scale'].includes(property),`${animation.getName()}: unexpected animation property`);
      const times=sampler?.getInput(),values=sampler?.getOutput();assert(times&&values,`${animation.getName()}: missing sampler accessor`);
      assert(sampler.getInterpolation()!=='CUBICSPLINE',`${animation.getName()}: cubic tracks need explicit tangent validation`);
      assert(times.getCount()>=2&&values.getCount()===times.getCount(),`${animation.getName()}: insufficient or mismatched samples`);
      const input=times.getArray();finite(input,'animation times');finite(values.getArray(),'animation output');
      assert(Math.abs(input[0])<1e-6,`${animation.getName()}: track does not start at zero`);
      for(let i=1;i<input.length;i++)assert(input[i]>input[i-1],`${animation.getName()}: unordered keyframe times`);
      durationSeconds=Math.max(durationSeconds,input[input.length-1]);targets.add(name);
      const first=values.getElement(0,[]),last=values.getElement(values.getCount()-1,[]);
      let variation=0;
      for(let i=0;i<values.getCount();i++){
        const value=values.getElement(i,[]);
        if(property==='rotation')assert(Math.abs(Math.hypot(...value)-1)<=1e-4,`${animation.getName()}: non-unit quaternion`);
        const sign=property==='rotation'&&first.reduce((s,v,k)=>s+v*value[k],0)<0?-1:1;
        variation=Math.max(variation,...value.map((v,k)=>Math.abs(sign*v-first[k])));
      }
      if(variation>1e-5&&canonicalNames.includes(name))varyingTargets.add(name);
      const endSign=property==='rotation'&&first.reduce((s,v,k)=>s+v*last[k],0)<0?-1:1;
      maxLoopSeamError=Math.max(maxLoopSeamError,...last.map((v,k)=>Math.abs(endSign*v-first[k])));
    }
    assert(durationSeconds>0,`${animation.getName()}: zero duration`);
    // A held tuck can breathe through the spine while preserving its crouched silhouette.
    const minimumMovingJoints=animation.getName()==='crouch'?1:3;
    assert(varyingTargets.size>=minimumMovingJoints,`${animation.getName()}: insufficient genuinely animated joints`);
    const entry=entries.find(e=>e.name===animation.getName());
    if(entry?.durationSeconds!==undefined)assert(Math.abs(durationSeconds-entry.durationSeconds)<1e-4,`${animation.getName()}: manifest duration mismatch`);
    if(entry?.loop)assert(maxLoopSeamError<=1e-4,`${animation.getName()}: looping endpoints differ`);
    records.push({name:animation.getName(),durationSeconds,channels:channels.length,animatedNodes:targets.size,animatedJoints:[...targets].filter(name=>canonicalNames.includes(name)).length,varyingJoints:varyingTargets.size,loop:entry?.loop??null,maxLoopSeamError});
  }
  const endpoints=new Map(animations.map(animation=>[animation.getName(),new Map(animation.listChannels().map(channel=>{
    const values=channel.getSampler().getOutput();
    return [channel.getTargetNode().getName()+'.'+channel.getTargetPath(),{first:values.getElement(0,[]),last:values.getElement(values.getCount()-1,[])}];
  }))]));
  const error=(a,b,key)=>{
    const sign=key.endsWith('.rotation')&&a.reduce((s,v,k)=>s+v*b[k],0)<0?-1:1;
    return Math.max(...a.map((v,k)=>Math.abs(v-sign*b[k])));
  };
  let fallRecoverySeamError=0,crouchPoseDifference=0;
  for(const [key,value]of endpoints.get('fall')){
    const recovery=endpoints.get('get_up').get(key);assert(recovery,'recovery missing fall track');
    fallRecoverySeamError=Math.max(fallRecoverySeamError,error(value.last,recovery.first,key));
  }
  assert(fallRecoverySeamError<=1e-4,'fall end and get_up start poses differ');
  for(const [key,value]of endpoints.get('crouch')){
    if(!canonicalNames.includes(key.slice(0,key.lastIndexOf('.'))))continue;
    const glide=endpoints.get('glide').get(key);
    if(glide)crouchPoseDifference=Math.max(crouchPoseDifference,error(value.first,glide.first,key));
  }
  assert(crouchPoseDifference>.05,'crouch does not differ meaningfully from glide');
  records.find(a=>a.name==='get_up').fallRecoverySeamError=fallRecoverySeamError;
  records.find(a=>a.name==='crouch').glidePoseDifference=crouchPoseDifference;
  return records;
}
function inspectOtherAnimations(doc){
  return doc.getRoot().listAnimations().map(animation=>{
    let durationSeconds=0;
    for(const channel of animation.listChannels()){
      assert(channel.getTargetNode(),'animation channel has no target');
      const sampler=channel.getSampler(),input=sampler?.getInput(),output=sampler?.getOutput();
      assert(input&&output,'animation channel has no data');
      const times=input.getArray();finite(times,'animation times');finite(output.getArray(),'animation output');
      assert(times.length>=2&&times[0]>=0,'invalid animation time range');
      for(let i=1;i<times.length;i++)assert(times[i]>times[i-1],'unordered animation keyframes');
      const cubic=sampler.getInterpolation()==='CUBICSPLINE';
      assert(output.getCount()===input.getCount()*(cubic?3:1),'animation input/output count mismatch');
      if(channel.getTargetPath()==='rotation')for(let i=cubic?1:0;i<output.getCount();i+=cubic?3:1)assert(Math.abs(Math.hypot(...output.getElement(i,[]))-1)<1e-4,'non-unit animation quaternion');
      durationSeconds=Math.max(durationSeconds,times[times.length-1]);
    }
    assert(durationSeconds>0,'empty animation');
    return {name:animation.getName(),durationSeconds,channels:animation.listChannels().length,finiteSamples:true,strictlyIncreasingTimes:true};
  });
}
async function validateAsset(filename,manifestEntry,skierManifest){
  const bytes=await fs.readFile(filename),id=path.basename(filename,'.glb');
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert(bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2,'invalid GLB header');
  assert(bytes.readUInt32LE(8)===bytes.length,'GLB declared length mismatch');
  assert(bytes.length<=1500000,'1,500,000-byte file budget exceeded');
  assert(json.extensionsRequired?.includes('KHR_draco_mesh_compression'),'Draco is not required');
  assert(json.meshes?.length&&json.meshes.every(m=>m.primitives.every(p=>p.extensions?.KHR_draco_mesh_compression)),'uncompressed primitive');
  assert((json.buffers??[]).every(b=>!b.uri),'external GLB buffer');
  assert((json.images??[]).every(i=>i.bufferView!==undefined&&!i.uri),'external GLB image');
  const compressed=await validateGLTF(bytes,id+'.glb');
  assert(compressed.issues.numErrors===0,'Khronos Validator errors in compressed GLB');
  const doc=await io.readBinary(new Uint8Array(bytes)),root=doc.getRoot();
  let triangles=0,vertices=0,primitives=0,degenerateTriangles=0;
  for(const node of root.listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
    assert(primitive.getMode()===4,'non-triangle primitive');
    const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices();assert(positions,'missing positions');
    finite(positions.getArray(),'positions');finite(primitive.getAttribute('NORMAL')?.getArray(),'normals');
    const count=indices?.getCount()??positions.getCount();assert(count%3===0,'invalid triangle index count');
    triangles+=count/3;vertices+=positions.getCount();primitives++;
    for(let i=0;i<count;i+=3){
      const a=positions.getElement(indices?indices.getScalar(i):i,[]),b=positions.getElement(indices?indices.getScalar(i+1):i+1,[]),c=positions.getElement(indices?indices.getScalar(i+2):i+2,[]);
      const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
      if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<=1e-12)degenerateTriangles++;
    }
  }
  assert(triangles>0,'empty geometry');
  const uniqueMeshTriangles=root.listMeshes().reduce((sum,mesh)=>sum+mesh.listPrimitives().reduce((subtotal,p)=>subtotal+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
  const textures=[];
  for(const texture of root.listTextures()){
    const metadata=await sharp(Buffer.from(texture.getImage())).metadata();
    assert(metadata.width>0&&metadata.height>0&&metadata.width<=1024&&metadata.height<=1024,'texture exceeds 1024px');
    textures.push({name:texture.getName(),width:metadata.width,height:metadata.height,mimeType:texture.getMimeType()});
  }
  let skin=null,animations=[];
  if(filename===path.join(skierDir,'skier.glb')){skin=inspectSkin(doc);animations=inspectAnimations(doc,skierManifest);}
  else animations=inspectOtherAnimations(doc);
  for(const extension of [...root.listExtensionsUsed()])if(extension.extensionName==='KHR_draco_mesh_compression')extension.dispose();
  const decoded=await validateGLTF(await io.writeBinary(doc),id+'-decoded.glb');
  assert(decoded.issues.numErrors===0,'Khronos Validator errors in independently decoded GLB');
  const sha256=hash(bytes);
  if(manifestEntry){
    for(const [key,value]of Object.entries({bytes:bytes.length,triangles,sha256}))if(manifestEntry[key]!==undefined)assert(manifestEntry[key]===value,`manifest ${key} mismatch`);
    const source=manifestEntry.source;
    if(source?.file&&source.sha256){
      const sourceBytes=await fs.readFile(path.resolve(path.dirname(filename),filename.startsWith(worldDir)?'..':'.',source.file));
      assert(hash(sourceBytes)===source.sha256,'manifest source hash mismatch');
    }
  }
  await fs.writeFile(path.join(out,id+'-gltf.json'),JSON.stringify({compressed,decoded},null,2)+'\n');
  return {id,file:path.relative(path.resolve(skierDir,'..'),filename),bytes:bytes.length,sha256,triangles,triangleCounting:'all scene mesh instances in the default pose; animated visibility may draw fewer',uniqueMeshTriangles,vertices,primitives,materials:root.listMaterials().length,textures,degenerateTriangles,dracoRequired:true,allPrimitivesDraco:true,skin,animations,validator:{compressed:{errors:compressed.issues.numErrors,warnings:compressed.issues.numWarnings},decoded:{errors:decoded.issues.numErrors,warnings:decoded.issues.numWarnings}}};
}
const report={schemaVersion:1,allPassed:false,limits:{maxBytesPerGLB:1500000,maxTextureDimension:1024},tools:{validator:validator.version()},canonicalSkeleton:{file:'motion2/alpine.json',sha256:hash(canonicalBytes)},assets:[],externalTextures:[],errors:[]};
const only=args.includes('--only')?args[args.indexOf('--only')+1]:null;
const worldManifest=only==='skier'?null:JSON.parse(await fs.readFile(path.join(worldDir,'manifest.json'),'utf8'));
const skierManifest=only==='world'?null:JSON.parse(await fs.readFile(path.join(skierDir,'manifest.json'),'utf8'));
const files=[];
if(only!=='world')files.push({file:path.join(skierDir,'skier.glb'),entry:skierManifest.assets?.find(e=>e.id==='skier')});
if(only!=='skier'){
  const names=(await fs.readdir(path.join(worldDir,'models'))).filter(n=>n.endsWith('.glb')).sort();
  assert(names.length>=7,'world: incomplete asset inventory');
  for(const name of names)files.push({file:path.join(worldDir,'models',name),entry:worldManifest.models?.find(e=>e.id===name.slice(0,-4))});
  const categories=new Set((worldManifest.models??[]).map(m=>m.category));
  report.worldCategories=[...categories].sort();
}
for(const {file,entry}of files){
  try{report.assets.push(await validateAsset(file,entry,skierManifest));}
  catch(error){report.errors.push({file:path.relative(path.resolve(skierDir,'..'),file),message:error.message});}
}
async function inspectTextureDirectory(folder){
  let entries;try{entries=await fs.readdir(folder,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries){
    const filename=path.join(folder,entry.name);
    if(entry.isDirectory()){await inspectTextureDirectory(filename);continue;}
    if(!/\.(png|jpe?g|webp|avif)$/i.test(entry.name))continue;
    const bytes=await fs.readFile(filename),meta=await sharp(bytes).metadata();
    const record={file:path.relative(path.resolve(skierDir,'..'),filename),width:meta.width,height:meta.height,bytes:bytes.length,sha256:hash(bytes)};
    report.externalTextures.push(record);
    if(!(meta.width>0&&meta.height>0&&meta.width<=1024&&meta.height<=1024))report.errors.push({file:record.file,message:'texture exceeds 1024px'});
  }
}
for(const folder of [skierDir,worldDir])for(const subfolder of ['textures','vfx'])await inspectTextureDirectory(path.join(folder,subfolder));
report.allPassed=report.errors.length===0&&report.assets.length===files.length;
report.totals={files:report.assets.length,bytes:report.assets.reduce((n,a)=>n+a.bytes,0),triangles:report.assets.reduce((n,a)=>n+a.triangles,0),maximumFileBytes:Math.max(0,...report.assets.map(a=>a.bytes))};
await fs.writeFile(path.join(out,'assets-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({allPassed:report.allPassed,...report.totals,errors:report.errors},null,2));
if(!report.allPassed)process.exitCode=1;
