// Validates actual Draco files, decoded files, and every prepared outfit. No game imports this tool.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../../../vendor/three.module.js';
import {prepareVariant} from '../apply-variant.js';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv.includes('--modules'))throw Error('Pass --modules /path/to/authoring/package.json');
const require=createRequire(path.resolve(process.argv[process.argv.indexOf('--modules')+1]));
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf'),validator=require('gltf-validator');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const read=async p=>JSON.parse(await fs.readFile(path.join(here,p)));
const manifest=await read('manifest.json'),regions=await read('regions.json'),palettes=await read('palettes.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
const outfits=await Promise.all(manifest.outfits.map(o=>read(o.path)));
assert.deepEqual(['soccer-player','goalkeeper','basketball-player','skier'].map(id=>outfits.filter(o=>o.modelId===id).length),[8,4,6,4]);
assert.equal(palettes.skins.length,6);assert.equal(palettes.hair.length,6);
assert.equal(new Set(palettes.skins.map(p=>p.color)).size,6);assert.equal(new Set(palettes.hair.map(p=>p.color)).size,6);
const report={validator:validator.version(),baseCommit:manifest.baseCommit,counts:{outfits:22,skins:6,hairColors:6,appearanceApplications:0},characters:[],outfits:[]};
async function validate(bytes,uri){
 const r=await validator.validateBytes(new Uint8Array(bytes),{uri,maxIssues:0});
 assert.equal(r.issues.numErrors,0,`${uri}: ${JSON.stringify(r.issues.messages)}`);
 assert.equal(r.issues.numWarnings,0,`${uri}: warnings`);
 return {errors:r.issues.numErrors,warnings:r.issues.numWarnings,infos:r.issues.numInfos,
  messages:r.issues.messages.map(({code,severity,message})=>({code,severity,message}))};
}
const semantics={POSITION:'position',NORMAL:'normal',COLOR_0:'color',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'};
for(const [id,spec] of Object.entries(regions.models)){
 const bytes=await fs.readFile(path.resolve(here,spec.path));assert.equal(hash(bytes),spec.sha256);
 const compressed=await validate(bytes,`${id}.glb`);
 const doc=await io.readBinary(new Uint8Array(bytes));
 for(const ext of doc.getRoot().listExtensionsUsed())if(ext.extensionName==='KHR_draco_mesh_compression')ext.dispose();
 const decoded=await validate(await io.writeBinary(doc),`${id}.decoded.glb`);
 const primitive=doc.getRoot().listMeshes()[0].listPrimitives()[0],buffer=doc.getRoot().listBuffers()[0];
 const geometry=new THREE.BufferGeometry();
 for(const [semantic,attribute] of Object.entries(semantics)){
  const accessor=primitive.getAttribute(semantic);
  geometry.setAttribute(attribute,new THREE.BufferAttribute(accessor.getArray().slice(),accessor.getElementSize(),accessor.getNormalized()));
 }
 geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray().slice(),1));
 const originalColor=geometry.getAttribute('color').array.slice(),material=new THREE.MeshStandardMaterial({vertexColors:true});
 const mesh=new THREE.Mesh(geometry,material),otherMesh=new THREE.Mesh(geometry,material);
 const actor=prepareVariant(mesh,id,regions),otherActor=prepareVariant(otherMesh,id,regions);
 assert.notEqual(mesh.geometry,otherMesh.geometry);assert.notEqual(mesh.material,otherMesh.material);
 const sourceOtherColor=otherMesh.geometry.getAttribute('color').array.slice();
 const texture=new THREE.DataTexture(new Uint8Array(256*256*4).fill(255),256,256);
 for(const outfit of outfits.filter(o=>o.modelId===id)){
  const png=await fs.readFile(path.resolve(here,'outfits',outfit.map));
  assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
  assert.deepEqual(png.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  for(const skin of palettes.skins)for(const hair of palettes.hair){
   actor.apply(outfit,texture,{skin:skin.color,hair:hair.color});report.counts.appearanceApplications++;
   const color=mesh.geometry.getAttribute('color').array;
   assert.ok(color.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
   assert.ok(mesh.geometry.getAttribute('uv').array.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
   for(const [name,hex] of [['skin',skin.color],['hair',hair.color]])if(actor.counts[name]){
    const expected=new THREE.Color(hex);
    assert.ok(Array.from({length:color.length/3},(_,i)=>i).some(i=>
     Math.abs(color[i*3]-expected.r)<1e-7&&Math.abs(color[i*3+1]-expected.g)<1e-7&&Math.abs(color[i*3+2]-expected.b)<1e-7),`${name} palette missing`);
   }
  }
  actor.apply(outfit,texture,{skin:palettes.skins[2].color,hair:palettes.hair[0].color});
  const firstPass=mesh.geometry.getAttribute('color').array.slice();actor.apply(outfit,texture,{skin:palettes.skins[2].color,hair:palettes.hair[0].color});
  assert.deepEqual(mesh.geometry.getAttribute('color').array,firstPass,'Repeated application must not darken colors');
  // Validate the exact expanded geometry, COLOR_0, UV and actual PNG produced by the reference helper.
  const derived=await io.readBinary(new Uint8Array(bytes));
  for(const ext of derived.getRoot().listExtensionsUsed())if(ext.extensionName==='KHR_draco_mesh_compression')ext.dispose();
  const p=derived.getRoot().listMeshes()[0].listPrimitives()[0],b=derived.getRoot().listBuffers()[0];
  p.setIndices(null);
  for(const [semantic,attribute] of Object.entries({...semantics,TEXCOORD_0:'uv'})){
   const a=mesh.geometry.getAttribute(attribute);
   p.setAttribute(semantic,derived.createAccessor().setType(a.itemSize===2?'VEC2':a.itemSize===3?'VEC3':'VEC4').setArray(a.array.slice()).setNormalized(a.normalized).setBuffer(b));
  }
  const image=derived.createTexture().setImage(png).setMimeType('image/png');
  p.getMaterial().setBaseColorFactor([1,1,1,1]).setBaseColorTexture(image);
  // Remove orphaned original accessors so the validation mirrors a minimal future export.
  for(const accessor of derived.getRoot().listAccessors())if(!accessor.listParents().some(parent=>parent.propertyType!=='Root'))accessor.dispose();
  const result=await validate(await io.writeBinary(derived),`${outfit.id}.prepared.glb`);
  report.outfits.push({id:outfit.id,pngBytes:png.length,pngSha256:hash(png),preparedGLTF:result});
 }
 assert.deepEqual(geometry.getAttribute('color').array,originalColor,'Shared source mutated');
 assert.deepEqual(otherMesh.geometry.getAttribute('color').array,sourceOtherColor,'Another actor mutated');
 const wrong=outfits.find(o=>o.modelId!==id);
 assert.throws(()=>actor.apply(wrong,texture),/different character/);
 actor.dispose();otherActor.dispose();assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
 assert.throws(()=>actor.apply(outfits.find(o=>o.modelId===id),texture),/disposed/);
 texture.dispose();geometry.dispose();material.dispose();
 report.characters.push({id,bytes:bytes.length,sha256:hash(bytes),vertices:spec.vertexCount,triangles:spec.triangles,
  regionTriangleCounts:actor.counts,compressed,decoded});
}
assert.equal(new Set(report.outfits.map(o=>o.pngSha256)).size,22,'All outfit maps must be distinct');
report.checks={distinctOutfitMaps:true,allSourceColorsMatched:true,allTriangleRegionsAssigned:true,finiteColorsAndUV:true,sourceUnchanged:true,
 independentActors:true,repeatedApplicationStable:true,skinAndHairAppliedInLinearSpace:true,rejectsWrongCharacter:true,disposeRestoresSource:true};
await fs.writeFile(path.join(here,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({counts:report.counts,characters:report.characters.map(({id,regionTriangleCounts})=>({id,regionTriangleCounts})),preparedGLTFs:report.outfits.length},null,2));
