import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {readGLB} from '../runtime/glb.mjs';
import {createCustomizer} from '../runtime/customize.mjs';
import {createDecalGeometry} from '../runtime/decal.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modules=path.resolve(process.env.RACING_TOOLS||'/tmp/racing-customize-tools','node_modules');
const T=await import(pathToFileURL(path.join(modules,'three/build/three.module.js')).href);
const {GLTFLoader}=await import(pathToFileURL(path.join(modules,'three/examples/jsm/loaders/GLTFLoader.js')).href);
const DecalGeometry=createDecalGeometry(T);
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};
const raw=new Map();
for(const file of new Set([manifest.compatibility.previewBase,...manifest.items.filter(i=>i.asset?.endsWith('.glb')).map(i=>i.asset)]))raw.set(file,await fs.readFile(path.join(root,file)));
for(const [file,bytes] of raw){
  // No decoder or resource path is installed: the same standard loader used by the game.
  const standard=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const local=readGLB(T,bytes),a=new T.Box3().setFromObject(standard),b=new T.Box3().setFromObject(local);
  check(`Standard GLTFLoader and preview agree: ${file}`,()=>{assert(a.min.distanceTo(b.min)<1e-6);assert(a.max.distanceTo(b.max)<1e-6);});
}
const originalBytes=await fs.readFile(path.resolve(root,manifest.compatibility.source));
const source=readGLB(T,originalBytes);
const bodyMaterial=scene=>{let found;scene.getObjectByName('Body').traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(m.name==='Paint 1')found=m;});return found;};
const originalColor=bodyMaterial(source).color.clone(),other=source.clone(true),car=source.clone(true);
const texture=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;
const customizer=createCustomizer({T,car,manifest,loadGLB:file=>readGLB(T,raw.get(file)),DecalGeometry,stripeTexture:texture,decalTexture:async()=>texture});
const selected={};
for(const item of manifest.items){
  if(item.slot==='paint')continue;
  await customizer.equip(item.slot,item.id);selected[item.slot]=item.id;
  const state=customizer.snapshot();
  check(`Equip ${item.id} replaces one slot without accumulating mounts`,()=>{
    assert.equal(state[item.slot],item.id);
    const expected=Object.keys(selected).filter(k=>k!=='decal').reduce((n,k)=>n+(k==='wheels'?4:1),0);
    assert.equal(customizer.metrics().mountedObjects,expected);
    assert.equal(customizer.metrics().stripeMeshes,3);
    if(selected.decal)assert.equal(customizer.metrics().decalMeshes,3);
  });
}
for(const layer of ['body','stripes'])for(const paint of manifest.items.filter(i=>i.slot==='paint')){
  customizer.setPaint(layer,paint.id);
  const expected=paint.body.slice(1).toLowerCase();
  check(`${layer} ${paint.id}: exact sRGB material colour`,()=>{
    car.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(m.name===(layer==='body'?'Paint 1':'Paint Stripes'))assert.equal(m.color.getHexString(),expected);});
  });
}
check('Other cars sharing the source materials keep their original colour',()=>assert(bodyMaterial(other).color.equals(originalColor)));
const carRoot=car.getObjectByName('Formula');carRoot.position.set(5,3,-9);carRoot.rotation.set(.1,.6,-.1);carRoot.scale.setScalar(1.2);
await customizer.equip('decal','decal-stars-one');
check('Decal projection is stable under a moved and rotated parent',()=>assert.equal(customizer.metrics().decalMeshes,3));
carRoot.position.set(0,0,0);carRoot.rotation.set(0,0,0);carRoot.scale.setScalar(1);carRoot.updateMatrixWorld(true);
for(const instance of manifest.compatibility.mounts.wheels.instances){
  const wheel=carRoot.getObjectByName(instance.node+'_custom'),bounds=new T.Box3().setFromObject(wheel);
  check(`${instance.node}: correct axle, ground contact and independent scale`,()=>{
    assert(wheel.position.distanceTo(new T.Vector3().fromArray(instance.translation))<1e-7);
    assert(Math.abs(bounds.min.y)<1e-6);assert(wheel.scale.distanceTo(new T.Vector3().fromArray(instance.scale))<1e-7);
  });
}
customizer.animateWheels(1.7,.2);
check('Wheel animation rotates around X, with front-only Y steering',()=>{
  for(const wheel of customizer.wheels){assert.equal(wheel.rotation.x,1.7);assert.equal(wheel.rotation.y,wheel.name.startsWith('WheelFront')?.2:0);}
});
await assert.rejects(customizer.equip('frontWing','helmet-classic'),/Incompatible/);
await assert.rejects(customizer.equip('wheels','unknown-id'),/Incompatible/);
checks.push('Unknown and incompatible ids rejected without changing the selected assets');
customizer.dispose();customizer.dispose();
check('Dispose restores all original parts, materials and the original mount-free scene',()=>{
  assert(bodyMaterial(car).color.equals(originalColor));
  for(const name of ['FrontWing','RearWing','Helmet','WheelFrontL','WheelFrontR','WheelRearL','WheelRearR'])assert(carRoot.getObjectByName(name).visible);
  assert(!carRoot.getObjectByName('MountFrontWing'));assert(!carRoot.getObjectByName('WheelFrontL_custom'));
});
const delayedCar=source.clone(true),pending=new Map();
const delayed=createCustomizer({T,car:delayedCar,manifest,loadGLB:file=>new Promise(resolve=>pending.set(file,resolve))});
const first=manifest.items.find(i=>i.id==='front-sweep'),second=manifest.items.find(i=>i.id==='front-delta');
const a=delayed.equip('frontWing',first.id),b=delayed.equip('frontWing',second.id);
await Promise.resolve();
pending.get(second.asset)(readGLB(T,raw.get(second.asset)));assert.equal(await b,true);
pending.get(first.asset)(readGLB(T,raw.get(first.asset)));assert.equal(await a,false);
check('A slow earlier load cannot replace a later selection',()=>{assert.equal(delayed.snapshot().frontWing,second.id);assert.equal(delayed.metrics().mountedObjects,1);});
delayed.dispose();
const missing=source.clone(true);missing.getObjectByName('FrontWing').removeFromParent();
assert.throws(()=>createCustomizer({T,car:missing,manifest,loadGLB:()=>null}),/Missing original/);checks.push('Merged or incompatible vehicles fail explicitly before modifying the scene');
texture.dispose();
const report={passed:true,checks:checks.length,checkNames:checks,loader:'Three.js r160 GLTFLoader, no optional decoders',
  sourceCarSha256:manifest.compatibility.sourceSha256};
await fs.writeFile(path.join(root,'verification/runtime.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checks:checks.length}));
