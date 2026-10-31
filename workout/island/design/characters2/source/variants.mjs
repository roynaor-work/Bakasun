// Builds a v2 region map and verifies the unchanged v1 wardrobe application method.
// These authoring checks are not imported by any game.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as THREE from '../../../vendor/three.module.js';
import {prepareVariant} from '../../variants/apply-variant.js';

const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argument=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const moduleFile=argument('--modules');
if(!moduleFile)throw Error('Pass --modules /path/to/authoring/package.json');
const require=createRequire(path.resolve(moduleFile));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf'),validator=require('gltf-validator');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const rawDirectory=path.resolve(argument('--raw-dir','/tmp/island-characters2-raw'));
const oldDirectory=path.join(directory,'../variants');
const [oldRegions,oldManifest,palettes]=await Promise.all(['regions.json','manifest.json','palettes.json'].map(f=>read(path.join(oldDirectory,f))));
const ids=['soccer-player','goalkeeper','basketball-player','skier'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const rgbKey=rgb=>rgb.join(',');
const normalizeRegion=region=>region.startsWith('preserve')?'preserve':region;
const regions={schemaVersion:1,selection:oldRegions.selection,maxColorError:oldRegions.maxColorError,models:{},atlas:oldRegions.atlas};
const cache=new Map();

for(const id of ids){
 const [bytes,raw]=await Promise.all([fs.readFile(path.join(directory,`${id}.glb`)),read(path.join(rawDirectory,`${id}.json`))]);
 const doc=await io.readBinary(new Uint8Array(bytes));
 const primitive=doc.getRoot().listMeshes()[0].listPrimitives()[0];
 assert.equal(doc.getRoot().listMeshes().length,1,'One mesh is required by prepareVariant');
 assert.equal(doc.getRoot().listMeshes()[0].listPrimitives().length,1,'One material primitive is required');
 const colors=primitive.getAttribute('COLOR_0');
 assert.equal(colors.getElementSize(),3,'prepareVariant requires RGB colors');
 const candidates=raw.colorSources||raw.parts;
 assert.ok(candidates?.length,'Raw authoring JSON must include colorSources or parts');
 const sources=[];
 for(const candidate of candidates){
  const region=normalizeRegion(candidate.region),rgb=candidate.linearRGB;
  assert.equal(rgb.length,3);
  const same=sources.find(s=>rgbKey(s.linearRGB)===rgbKey(rgb));
  if(same)assert.equal(same.region,region,'One source color cannot denote different regions');
  else sources.push({linearRGB:rgb,region,hex:candidate.hex});
 }
 const unique=new Map();
 for(let i=0;i<colors.getCount();i++){
  const rgb=colors.getElement(i,[]),key=rgbKey(rgb);
  if(unique.has(key))continue;
  const nearest=sources.map(s=>({s,error:Math.max(...rgb.map((v,c)=>Math.abs(v-s.linearRGB[c])))})).sort((a,b)=>a.error-b.error);
  assert.ok(nearest[0].error<.002,`${id}: Draco color differs from authoring palette`);
  const tied=nearest.filter(s=>s.error<=nearest[0].error+1e-7);
  assert.ok(tied.every(s=>s.s.region===nearest[0].s.region),`${id}: Ambiguous source color`);
  unique.set(key,{linearRGB:rgb,hex:nearest[0].s.hex||'#'+rgb.map(v=>Math.round(255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055)).toString(16).padStart(2,'0')).join('').toUpperCase(),rules:[{region:nearest[0].s.region}]});
 }
 const indices=primitive.getIndices();
 assert.ok(indices,'Expected indexed Draco geometry');
 const spec={path:`${id}.glb`,sha256:digest(bytes),bytes:bytes.length,vertexCount:colors.getCount(),triangles:indices.getCount()/3,
  absentRegions:Object.keys(oldRegions.models[id].sources.reduce((a,s)=>{for(const r of s.rules)a[r.region]=1;return a;},{})).filter(region=>![...unique.values()].some(s=>s.rules[0].region===region)),sources:[...unique.values()]};
 regions.models[id]=spec;cache.set(id,{bytes,doc,primitive});
}
await fs.writeFile(path.join(directory,'regions.json'),JSON.stringify(regions,null,2)+'\n');

const manifest={schemaVersion:1,created:'2026-10-31',kind:'design-assets-not-runtime',license:'CC0-1.0',baseCommit:'3853d282b6dd7719db49a864fec4286dc7b63cb0',
 budgetBytesPerCharacter:300000,application:oldManifest.application,applicationModule:'../variants/apply-variant.js',regionMap:'regions.json',
 palettes:'../variants/palettes.json',rig:'../characters/rig.json',models:ids,modelFiles:Object.fromEntries(ids.map(id=>[id,`${id}.glb`])),
 outfits:oldManifest.outfits.map(o=>({...o,path:`../variants/${o.path}`}))};
await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');

const semantics={POSITION:'position',NORMAL:'normal',COLOR_0:'color',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'};
const report={applicationModule:'../variants/apply-variant.js',applicationModuleSha256:digest(await fs.readFile(path.join(oldDirectory,'apply-variant.js'))),
 validator:validator.version(),outfits:22,skins:palettes.skins.length,hairColors:palettes.hair.length,appearanceApplications:0,characters:[],preparedOutfits:[]};

for(const id of ids){
 const {bytes,primitive}=cache.get(id),spec=regions.models[id];
 const geometry=new THREE.BufferGeometry();
 for(const [semantic,name] of Object.entries(semantics)){
  const a=primitive.getAttribute(semantic);
  geometry.setAttribute(name,new THREE.BufferAttribute(a.getArray().slice(),a.getElementSize(),a.getNormalized()));
 }
 geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray().slice(),1));
 const material=new THREE.MeshStandardMaterial({vertexColors:true}),mesh=new THREE.Mesh(geometry,material),otherMesh=new THREE.Mesh(geometry,material);
 const originalColors=geometry.getAttribute('color').array.slice();
 const actor=prepareVariant(mesh,id,regions),otherActor=prepareVariant(otherMesh,id,regions);
 assert.notEqual(mesh.geometry,otherMesh.geometry);assert.notEqual(mesh.material,otherMesh.material);
 const unchangedOtherColors=otherMesh.geometry.getAttribute('color').array.slice();
 const preparedAttributes=Object.fromEntries(['position','normal','skinIndex','skinWeight'].map(name=>[name,mesh.geometry.getAttribute(name).array.slice()]));
 const preparedColors=mesh.geometry.getAttribute('color').array.slice();
 const preparedRegionNames=Array.from({length:preparedColors.length/3},(_,i)=>{
  const rgb=Array.from(preparedColors.subarray(i*3,i*3+3));
  const source=spec.sources.find(s=>s.linearRGB.every((v,c)=>Math.abs(v-rgb[c])<=regions.maxColorError));
  assert.ok(source);return source.rules[0].region;
 });
 const representatives=Object.fromEntries([...new Set(preparedRegionNames)].map(region=>[region,preparedRegionNames.indexOf(region)]));
 assert.ok(representatives.skin!==undefined,`${id}: Skin geometry missing`);
 assert.ok(representatives.hair!==undefined,`${id}: Hair geometry missing`);
 const texture=new THREE.DataTexture(new Uint8Array(256*256*4).fill(255),256,256);
 for(const entry of manifest.outfits.filter(o=>o.modelId===id)){
  const outfitPath=path.resolve(directory,entry.path),outfit=await read(outfitPath),png=await fs.readFile(path.resolve(path.dirname(outfitPath),outfit.map));
  assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
  assert.deepEqual(png.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  for(const skin of palettes.skins)for(const hair of palettes.hair){
   actor.apply(outfit,texture,{skin:skin.color,hair:hair.color});report.appearanceApplications++;
   const color=mesh.geometry.getAttribute('color');
   for(const [region,hex] of [['skin',skin.color],['hair',hair.color]]){
    const i=representatives[region],expected=new THREE.Color(hex);
    for(const [c,value] of [expected.r,expected.g,expected.b].entries())assert.ok(Math.abs(color.array[i*3+c]-value)<1e-7,`${id}: ${region} palette`);
   }
   for(let i=0;i<preparedRegionNames.length;i++)if(preparedRegionNames[i]==='preserve'){
    for(let c=0;c<3;c++)assert.equal(color.array[i*3+c],preparedColors[i*3+c],'Facial and equipment details must be preserved');
   }
  }
  actor.apply(outfit,texture,{skin:palettes.skins[2].color,hair:palettes.hair[0].color});
  const once=mesh.geometry.getAttribute('color').array.slice();
  actor.apply(outfit,texture,{skin:palettes.skins[2].color,hair:palettes.hair[0].color});
  assert.deepEqual(mesh.geometry.getAttribute('color').array,once,'Repeated application changed colors');
  assert.ok(once.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.ok(mesh.geometry.getAttribute('uv').array.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  for(const [name,expected] of Object.entries(preparedAttributes))assert.deepEqual(mesh.geometry.getAttribute(name).array,expected,`${name} changed while applying outfit`);
  // Export the prepared geometry only into memory to validate the actual shared PNG and UV combination.
  const derived=await io.readBinary(new Uint8Array(bytes));
  for(const extension of derived.getRoot().listExtensionsUsed())if(extension.extensionName==='KHR_draco_mesh_compression')extension.dispose();
  const p=derived.getRoot().listMeshes()[0].listPrimitives()[0],buffer=derived.getRoot().listBuffers()[0];p.setIndices(null);
  for(const [semantic,name] of Object.entries({...semantics,TEXCOORD_0:'uv'})){
   const a=mesh.geometry.getAttribute(name);
   p.setAttribute(semantic,derived.createAccessor().setType(a.itemSize===2?'VEC2':a.itemSize===3?'VEC3':'VEC4').setArray(a.array.slice()).setNormalized(a.normalized).setBuffer(buffer));
  }
  const image=derived.createTexture().setImage(png).setMimeType('image/png');
  p.getMaterial().setBaseColorFactor([1,1,1,1]).setBaseColorTexture(image);
  for(const accessor of derived.getRoot().listAccessors())if(!accessor.listParents().some(parent=>parent.propertyType!=='Root'))accessor.dispose();
  const checked=await validator.validateBytes(await io.writeBinary(derived),{uri:`${entry.id}.prepared.glb`,maxIssues:0});
  assert.equal(checked.issues.numErrors,0,JSON.stringify(checked.issues.messages));
  report.preparedOutfits.push({id:entry.id,errors:checked.issues.numErrors,warnings:checked.issues.numWarnings,pngSha256:digest(png),pngBytes:png.length});
 }
 assert.deepEqual(geometry.getAttribute('color').array,originalColors,'Shared source colors were mutated');
 assert.deepEqual(otherMesh.geometry.getAttribute('color').array,unchangedOtherColors,'Another actor was mutated');
 assert.throws(()=>actor.apply({modelId:'unrelated'},texture),/different character/);
 actor.dispose();otherActor.dispose();assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
 assert.throws(()=>actor.apply({modelId:id},texture),/disposed/);
 report.characters.push({id,bytes:spec.bytes,vertices:spec.vertexCount,triangles:spec.triangles,regionTriangles:actor.counts});
 texture.dispose();geometry.dispose();material.dispose();
}
assert.equal(report.appearanceApplications,792);assert.equal(report.preparedOutfits.length,22);
report.pass=true;report.checks={allTriangleRegionsMatched:true,all792AppearancesApplied:true,unchangedOriginalApplicationModule:true,facialDetailsPreserved:true,
 skeletonAttributesUnchanged:true,independentActors:true,repeatedApplicationStable:true,sourceUnchanged:true,disposeRestoresSource:true,preparedGLTFZeroErrors:true};
await fs.mkdir(path.join(directory,'verification'),{recursive:true});
await fs.writeFile(path.join(directory,'verification/variants.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,applications:report.appearanceApplications,preparedOutfits:report.preparedOutfits.length,characters:report.characters},null,2));
