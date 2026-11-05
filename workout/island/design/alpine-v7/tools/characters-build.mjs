// Tailored connected CC0 winter athletes, canonical18 skin, one 1024 atlas.
// All authoring dependencies stay outside the repository; runtime needs no build.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {bakeMotions} from './motion-bake.mjs';
import {CLIPS} from '../motion/motion.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/alpine-v7-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {KHRDracoMeshCompression}=require('@gltf-transform/extensions');
const {simplify,prune}=require('@gltf-transform/functions');
const {MeshoptSimplifier}=require('meshoptimizer');
const codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
 'draco3d.encoder':await codec.createEncoderModule(),
 'draco3d.decoder':await codec.createDecoderModule(),
});
const rig=JSON.parse(await fs.readFile(path.join(ROOT,'../skier3/rig.json'),'utf8'));
const oldRig=JSON.parse(await fs.readFile(path.join(ROOT,'../characters/rig.json'),'utf8'));
const newNames=rig.joints.map(j=>j.name), oldNames=oldRig.joints.map(j=>j.name);
const sha=b=>createHash('sha256').update(b).digest('hex');
await fs.writeFile(path.join(ROOT,'characters/rig.json'),JSON.stringify(rig,null,2)+'\n');
const groupFor=region=>region==='goggle_lens'?'lens':region==='helmet'?'shell':region==='skin'||region.startsWith('preserve_')?'skin':region==='metal'?'metal':region==='rubber'||region==='shoes'||region==='soles'?'rubber':region==='equipment'||region.startsWith('board')?'equipment':'cloth';
const PBR={
 cloth:{name:'Technical shell / woven textile / shared atlas',rough:.75,metal:0},
 skin:{name:'Fictional face / shared atlas',rough:.75,metal:0},
 shell:{name:'Vented helmet hard shell / shared atlas',rough:.38,metal:.06},
 lens:{name:'Mirrored alpine goggles / shared atlas',rough:.115,metal:.92},
 metal:{name:'Unbranded buckles and metal edges / shared atlas',rough:.30,metal:.75},
 rubber:{name:'Boot shells straps and protective padding / shared atlas',rough:.63,metal:.03},
 ski_boot:{name:'Rigid ski boot shell / shared atlas',rough:.32,metal:.08},
 equipment:{name:'Laminate equipment top / shared atlas',rough:.36,metal:.12},
};
const assets=[],characters=[];
function smoothFinalCoatNormals(doc){
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
  if(p.getMaterial()?.getName()!==PBR.cloth.name)continue;
  const pos=p.getAttribute('POSITION'),a=pos.getArray(),ids=p.getIndices()?.getArray();
  const n=new Float32Array(a.length),count=ids?.length??pos.getCount();
  for(let i=0;i<count;i+=3){
   const ia=(ids?ids[i]:i)*3,ib=(ids?ids[i+1]:i+1)*3,ic=(ids?ids[i+2]:i+2)*3;
   const ux=a[ib]-a[ia],uy=a[ib+1]-a[ia+1],uz=a[ib+2]-a[ia+2];
   const vx=a[ic]-a[ia],vy=a[ic+1]-a[ia+1],vz=a[ic+2]-a[ia+2];
   const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
   for(const j of [ia,ib,ic]){n[j]+=x;n[j+1]+=y;n[j+2]+=z;}
  }
  for(let i=0;i<n.length;i+=3){const length=Math.hypot(n[i],n[i+1],n[i+2]);if(length){n[i]/=length;n[i+1]/=length;n[i+2]/=length;}else n[i+1]=1;}
  p.getAttribute('NORMAL').setArray(n);
 }
}
for(const id of ['ski-male','ski-female','snowboard-female']){
 const raw=JSON.parse(await fs.readFile('/tmp/alpine-v7-character-raw/'+id+'.json','utf8'));
 const doc=await io.read(path.join(ROOT,'../skier3/skier.glb'));
 const root=doc.getRoot(),buffer=root.listBuffers()[0],skin=root.listSkins()[0];
 for(const animation of root.listAnimations())animation.dispose();
 const nodes=Object.fromEntries(root.listNodes().map(n=>[n.getName(),n]));
 const actor=root.listNodes().find(n=>n.getSkin()===skin);
 const oldMesh=actor.getMesh(); actor.setMesh(null); oldMesh.dispose();
 const tex=doc.createTexture(id+' single 1024 outfit atlas').setImage(await fs.readFile(path.join(ROOT,'characters',id+'-atlas.png'))).setMimeType('image/png');
 const materials=Object.fromEntries(Object.entries(PBR).map(([key,p])=>[key,doc.createMaterial(p.name).setBaseColorTexture(tex).setRoughnessFactor(p.rough).setMetallicFactor(p.metal).setDoubleSided(key==='lens')]));
 const accessor=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
 const partUV=new Float32Array(raw.positions.length*2);
 for(const part of raw.parts){
  const points=raw.positions.slice(part.firstVertex,part.firstVertex+part.vertexCount);
  const lo=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));
  const axes=[0,1,2].sort((a,b)=>(hi[b]-lo[b])-(hi[a]-lo[a]));
  // Long garments: Y and circumferential angle avoid a planar smear on the side.
  const garment=['shirt','shorts','gaiter'].includes(part.region), lens=part.region==='goggle_lens';
  for(let i=0;i<points.length;i++){
   const p=points[i]; let u,v;
   if(lens){u=(p[0]-lo[0])/Math.max(.001,hi[0]-lo[0]);v=(p[1]-lo[1])/Math.max(.001,hi[1]-lo[1]);}
   else if(garment&&hi[1]-lo[1]>.12){
    const cx=(hi[0]+lo[0])/2,cz=(hi[2]+lo[2])/2;
    u=(Math.atan2(p[2]-cz,p[0]-cx)+Math.PI)/(Math.PI*2);v=(p[1]-lo[1])/Math.max(.001,hi[1]-lo[1]);
   }else {u=(p[axes[0]]-lo[axes[0]])/Math.max(.001,hi[axes[0]]-lo[axes[0]]);v=(p[axes[1]]-lo[axes[1]])/Math.max(.001,hi[axes[1]]-lo[axes[1]]);}
   u=Math.max(0,Math.min(1,u));v=Math.max(0,Math.min(1,v));
   const [rx,ry,rw,rh]=part.atlasRect;
   partUV[(part.firstVertex+i)*2]=(rx+3+u*(rw-6))/1024;
   // glTF UV origin is the top-left image corner (Texture.flipY=false).
   partUV[(part.firstVertex+i)*2+1]=(ry+3+(1-v)*(rh-6))/1024;
  }
 }
 function makeMesh(name,selectedParts,staticRoot=false){
  const mesh=doc.createMesh(name),groups={};
  for(const part of selectedParts){const key=part.region==='shoes'&&raw.sport==='ski'?'ski_boot':groupFor(part.region);(groups[key]??=[]).push(part);}
  for(const [category,parts] of Object.entries(groups)){
   const pos=[],norm=[],uv=[],joint=[],weight=[],indices=[];
   for(const part of parts){
    const start=part.firstVertex,end=start+part.vertexCount,offset=pos.length/3;
    for(let i=start;i<end;i++){
     pos.push(...raw.positions[i]);norm.push(...raw.normals[i]);uv.push(partUV[i*2],partUV[i*2+1]);
     const weights=raw.weights[i],newWeights=new Map();
     for(let k=0;k<4;k++)if(weights[k]){
      let name=oldNames[raw.joints[i][k]];if(name.endsWith('Shoulder'))name='Chest';
      const idx=newNames.indexOf(name);newWeights.set(idx,(newWeights.get(idx)||0)+weights[k]);
     }
     const channels=[...newWeights].sort((a,b)=>b[1]-a[1]);while(channels.length<4)channels.push([0,0]);
     const scaled=channels.map(c=>c[1]*65535),packed=scaled.map(Math.floor);
     const order=[0,1,2,3].sort((a,b)=>(scaled[b]-packed[b])-(scaled[a]-packed[a]));
     for(let k=0,n=65535-packed.reduce((a,b)=>a+b,0);k<n;k++)packed[order[k%4]]++;
     joint.push(...channels.map((c,k)=>packed[k]?c[0]:0));weight.push(...packed);
    }
    for(let i=part.firstTriangle;i<part.firstTriangle+part.triangles;i++)indices.push(...raw.indices[i].map(idx=>idx-start+offset));
   }
   const primitive=doc.createPrimitive().setMaterial(materials[category])
    .setAttribute('POSITION',accessor(name+' '+category+' positions','VEC3',new Float32Array(pos)))
    .setAttribute('NORMAL',accessor(name+' '+category+' normals','VEC3',new Float32Array(norm)))
    .setAttribute('TEXCOORD_0',accessor(name+' '+category+' atlas coordinates','VEC2',new Float32Array(uv)))
    .setIndices(accessor(name+' '+category+' triangles','SCALAR',new Uint32Array(indices)));
   if(!staticRoot)primitive
    .setAttribute('JOINTS_0',accessor(name+' '+category+' canonical joints','VEC4',new Uint16Array(joint)))
    .setAttribute('WEIGHTS_0',accessor(name+' '+category+' normalized weights','VEC4',new Uint16Array(weight)).setNormalized(true));
   mesh.addPrimitive(primitive);
  }
  return mesh;
 }
 actor.setName(id).setMesh(makeMesh(id,raw.board?raw.parts.slice(0,raw.board.firstPart):raw.parts));
 if(raw.board){
  for(const side of ['Left','Right'])nodes[side+'Pole']?.dispose();
  const board=doc.createNode('Snowboard').setMesh(makeMesh('Twin tip snowboard',raw.parts.slice(raw.board.firstPart),true));
  nodes.Root.addChild(board);
 }
 root.getAsset().generator='Alpine v7 tailored CC0 athlete / canonical18 / Draco / single atlas';
 root.getAsset().copyright='CC0-1.0 original fictional athlete and original alpine tailoring. See LICENSES.md.';
 actor.setExtras({id,sport:raw.sport,sex:raw.sex,canonicalBoneCount:18,atlas:id+'-atlas.png',forward:'+Z',heightMeters:1.29});
 await bakeMotions(doc,{rig,sport:raw.sport,hz:30,
  jsonPath:id==='ski-female'?null:path.join(ROOT,'motion',raw.sport+'.json'),
  metricsPath:path.join(ROOT,'motion',id+'-metrics.json')});
 // Keep the detailed master in a temporary GLB, then derive practical mobile LODs.
 await doc.transform(prune());
 await io.write('/tmp/alpine-v7-character-raw/'+id+'-master.glb',doc);
 const lodRatios=[.60,.30,.115];
 for(let lod=0;lod<3;lod++){
  const d=await io.read('/tmp/alpine-v7-character-raw/'+id+'-master.glb');
  await d.transform(simplify({simplifier:MeshoptSimplifier,ratio:lodRatios[lod],error:lod===0?.002:.008}),prune());
  smoothFinalCoatNormals(d);
  let ext=d.getRoot().listExtensionsUsed().find(x=>x.extensionName==='KHR_draco_mesh_compression');
  if(!ext)ext=d.createExtension(KHRDracoMeshCompression);
  ext.setRequired(true).setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,encodeSpeed:5,decodeSpeed:5,quantizationBits:{POSITION:16,NORMAL:12,TEX_COORD:14,GENERIC:20}});
  const file='characters/'+id+(lod?'-lod'+lod:'')+'.glb';
  await io.write(path.join(ROOT,file),d);
  const bytes=await fs.readFile(path.join(ROOT,file));
  if(bytes.length>1500000)throw new Error(file+' exceeds 1.5MB');
  // Measure the actual encoded file: Draco can discard a collapsed seam triangle.
  const decoded=await io.readBinary(bytes);let triangles=0,vertices=0;
  for(const n of decoded.getRoot().listNodes())if(n.getMesh())for(const p of n.getMesh().listPrimitives()){
   triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;vertices+=p.getAttribute('POSITION').getCount();
  }
  assets.push({id:id+'-lod'+lod,file,lod,sex:raw.sex,sport:raw.sport,triangles,vertices,bytes:bytes.length,sha256:sha(bytes),skinBones:18,clips:CLIPS.map(c=>c.name),texture:{file:'characters/'+id+'-atlas.png',width:1024,height:1024,embedded:true}});
  console.log(`${file}: ${triangles} tris, ${bytes.length} bytes`);
 }
 characters.push({id,label:({'ski-male':'גולש · אורן','ski-female':'גולשת · ניב','snowboard-female':'סנובורד · שחר'})[id],sex:raw.sex,sport:raw.sport,worldYawRadians:raw.sport==='snowboard'?Math.PI/2:0,localTravelAxis:raw.sport==='snowboard'?'-X':'+Z',model:'characters/'+id+'.glb',lods:[{path:'characters/'+id+'-lod1.glb',distance:10},{path:'characters/'+id+'-lod2.glb',distance:22}],atlas:'characters/'+id+'-atlas.png'});
}
const sourceFiles=['skier3/skier.glb','skier3/rig.json','characters/rig.json','characters2/source/body.py','characters2/source/mesh.py','characters2/source/head_hands.py','characters2/source/gear.py'];
const sources=await Promise.all(sourceFiles.map(async file=>({path:'workout/island/design/'+file,sha256:sha(await fs.readFile(path.join(ROOT,'..',file))),license:'CC0-1.0',role:file.endsWith('.py')?'Detailed source anatomy, connected pants and equipment read-only; v7 replaces coat, goggles, helmet and grip.':'Exact canonical18 calibration and pole geometry, read-only.'})));
await fs.writeFile(path.join(ROOT,'characters/manifest.json'),JSON.stringify({schemaVersion:1,kind:'alpine-v7-fictional-athletes',units:'metres',recommendedWorldScale:1.35,worldScaleMeaning:'Apply uniformly to the complete actor group, preserving the calibrated skin; actor height approximately 1.74 m; board 1.485 m × 0.27 m.',canonicalRig:'characters/rig.json',characters,assets,sources},null,2)+'\n');
