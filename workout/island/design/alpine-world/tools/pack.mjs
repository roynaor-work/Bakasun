// Copies repository-owned source assets without changing their bytes, encodes
// the two original assets, then measures the FINAL Draco deliveries.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const args=process.argv.slice(2), modules=args[args.indexOf('--modules')+1];
if(!args.includes('--modules')||!modules)throw Error('--modules /absolute/tooling required');
const require=createRequire(path.resolve(modules,'package.json'));
const {NodeIO,Accessor}=require('@gltf-transform/core');
const {ALL_EXTENSIONS,KHRMaterialsUnlit}=require('@gltf-transform/extensions');
const {draco}=require('@gltf-transform/functions');
const codec=require('draco3dgltf'), sharp=require('sharp');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
 'draco3d.encoder':await codec.createEncoderModule(),
 'draco3d.decoder':await codec.createDecoderModule()
});
const root=path.resolve(import.meta.dirname,'..'), design=path.dirname(root);
const hash=b=>createHash('sha256').update(b).digest('hex');
const inherited=[
 ['fir-a','אשוח רחב','trees','models2/fir-a.glb'],
 ['fir-b','אשוח גבוה','trees','models2/fir-b.glb'],
 ['fir-c','אשוח צעיר','trees','models2/fir-c.glb'],
 ['rock-small','סלע קטן','rocks','models2/rock-small.glb'],
 ['rock-large','סלע גדול','rocks','models2/rock-large.glb'],
 ['snow-sign','שלט מסלול','signs','models2/snow-sign.glb'],
 ['slalom-gate','שער סלאלום','gates','models2/slalom-gate.glb'],
 ['start-gate','שער זינוק','gates','models2/start-gate.glb'],
 ['finish-gate','שער סיום','gates','models2/finish-gate.glb'],
 ['mogul','מוגול','moguls','alpine-track/models/mogul.glb'],
];
await fs.mkdir(path.join(root,'models'),{recursive:true});
for(const [id,,,source] of inherited)await fs.copyFile(path.join(design,source),path.join(root,'models',id+'.glb'));
const originals=[['ice-wall','קיר קרח','ice-walls'],['snow-powder','אבקת שלג','powder']];
for(const [id] of originals){
 const filename=path.join(root,'models',id+'.glb'), doc=await io.read(filename);
 if(id==='snow-powder'){
  for(const animation of doc.getRoot().listAnimations())animation.dispose();
  const buffer=doc.getRoot().listBuffers()[0];
  const times=doc.createAccessor('powder_frame_times').setType(Accessor.Type.SCALAR).setArray(new Float32Array(Array.from({length:17},(_,i)=>i/20))).setBuffer(buffer);
  const animation=doc.createAnimation('snow_puff').setExtras({durationSeconds:.8,loop:false,presentationOnly:true,frameCount:16,fps:20});
  for(let frame=0;frame<16;frame++){
   const node=doc.getRoot().listNodes().find(n=>n.getName()===`powder_frame_${String(frame).padStart(2,'0')}`);
   if(!node)throw Error('Missing powder frame '+frame);
   node.setScale(frame===7?[1,1,1]:[0,0,0]);
   const values=Array.from({length:17},(_,i)=>Array(3).fill(i===frame?1:0)).flat();
   const output=doc.createAccessor('powder_frame_'+frame+'_scales').setType(Accessor.Type.VEC3).setArray(new Float32Array(values)).setBuffer(buffer);
   const sampler=doc.createAnimationSampler().setInput(times).setOutput(output).setInterpolation('STEP');
   animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('scale').setSampler(sampler));
  }
  const unlit=doc.createExtension(KHRMaterialsUnlit);
  for(const material of doc.getRoot().listMaterials()){
   material.setExtension('KHR_materials_specular',null);
   material.setExtension('KHR_materials_unlit',unlit.createUnlit()).setRoughnessFactor(1);
   const info=material.getBaseColorTextureInfo();
   if(info)info.setMinFilter(9729).setMagFilter(9729).setWrapS(33071).setWrapT(33071);
   material.setExtras({straightAlpha:true,depthWrite:false,presentationOnly:true});
  }
  doc.getRoot().listExtensionsUsed().find(e=>e.extensionName==='KHR_materials_specular')?.dispose();
 }
 await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14,quantizeColor:8}));
 await io.write(filename,doc);
}

function transform(v,m){return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];}
const round=n=>Math.round(n*1e6)/1e6;
const models=[];
for(const [id,displayName,category,sourceFile] of [...inherited,...originals]){
 const file='models/'+id+'.glb', bytes=await fs.readFile(path.join(root,file)),doc=await io.read(path.join(root,file));
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
 const primitiveJSON=gltf.meshes.flatMap(m=>m.primitives);
 if(!gltf.extensionsRequired?.includes('KHR_draco_mesh_compression')||!primitiveJSON.every(p=>p.extensions?.KHR_draco_mesh_compression))throw Error('Missing mandatory Draco: '+id);
 if(bytes.length>1500000)throw Error('File budget exceeded: '+id);
 let triangles=0,vertices=0,primitives=0;
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;
  vertices+=p.getAttribute('POSITION').getCount();primitives++;
 }
 const bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]], anchors={};
 for(const node of doc.getRoot().listNodes()){
  const matrix=node.getWorldMatrix();
  if(node.getName().startsWith('anchor_'))anchors[node.getName()]=transform([0,0,0],matrix).map(round);
  const mesh=node.getMesh();if(!mesh)continue;
  for(const primitive of mesh.listPrimitives()){
   const accessor=primitive.getAttribute('POSITION'),v=[];
   for(let i=0;i<accessor.getCount();i++){
    accessor.getElement(i,v);const world=transform(v,matrix);
    for(let a=0;a<3;a++){bounds[0][a]=Math.min(bounds[0][a],world[a]);bounds[1][a]=Math.max(bounds[1][a],world[a]);}
   }
  }
 }
 const textures=[];
 for(const texture of doc.getRoot().listTextures()){
  const image=texture.getImage(),meta=await sharp(image).metadata();
  if(meta.width>1024||meta.height>1024)throw Error('Texture budget exceeded: '+id);
  textures.push({name:texture.getName(),mimeType:texture.getMimeType(),width:meta.width,height:meta.height,bytes:image.length,embedded:true});
 }
 const source=sourceFile?{file:'../'+sourceFile,sha256:hash(await fs.readFile(path.join(design,sourceFile))),
  license:id==='mogul'?'CC0-1.0; ../alpine-track/LICENSES.md':'repository terms; ../models2/LICENSES.md',copyPolicy:'byte-identical reuse'}:
  {file:'tools/build-originals.py',sha256:hash(await fs.readFile(path.join(root,'tools/build-originals.py'))),license:'original contribution under repository terms',
   ...(id==='snow-powder'?{atlas:{file:'../alpine-track/vfx/ski-powder-atlas.png',sha256:hash(await fs.readFile(path.join(root,'textures/ski-powder-atlas.png'))),license:'CC0-1.0'}}:{})};
 models.push({id,displayName,category,file,bytes:bytes.length,sha256:hash(bytes),triangles,vertices,primitives,materials:doc.getRoot().listMaterials().length,textures,
  bounds:bounds.map(v=>v.map(round)),anchors,units:'metres',up:'+Y',forward:'+Z',compression:'KHR_draco_mesh_compression required on every primitive',source,
  animations:doc.getRoot().listAnimations().map(a=>({name:a.getName(),...a.getExtras()})),
  ...(id==='snow-powder'?{notes:'16 atlas frames on three crossed cards each; 96 stored triangles, 6 visible triangles per frame. Default pose displays frame 7. Play snow_puff once for 0.8s; reset/restart for a new emission. Set transparent mesh material.depthWrite=false in Three.js.'}:{})});
}
const manifest={schemaVersion:1,kind:'alpine-world-design-assets',units:'metres',up:'+Y',forward:'+Z',maxFileBytes:1500000,maxTextureEdge:1024,modelCount:models.length,
 totalModelBytes:models.reduce((n,m)=>n+m.bytes,0),totalStoredTriangles:models.reduce((n,m)=>n+m.triangles,0),models};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({models:models.length,bytes:manifest.totalModelBytes,triangles:manifest.totalStoredTriangles,largest:Math.max(...models.map(m=>m.bytes))}));
