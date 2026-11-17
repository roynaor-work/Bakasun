// Inspect final decoded payloads, not authoring arrays. Fail closed on any
// invalid glTF, color/skin contract, asset hash, external resource or budget.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {root,repo,io,json,writeJSON,sha,validator,rgb} from './common.mjs';
await fs.mkdir(path.join(root,'verification'),{recursive:true});
const manifest=await json('manifest.json'),rig=await json('rig.json'),kits=await json('kits.json'),venues=await json('venues.json');
const names=rig.joints.map(j=>j.name),expected=JSON.parse(await fs.readFile(path.join(repo,'workout/island/design/motion2/soccer.json'),'utf8')).skeleton.bones;
assert.equal(names.length,18);assert.deepEqual(rig.joints.map(j=>[j.name,j.parent]),expected.map(j=>[j.name,j.parent]));
assert.equal(kits.kits.length,8);assert.equal(venues.venues.length,3);assert.equal(new Set(kits.kits.map(k=>Object.values(k.palette).join('/'))).size,8);
const report={schemaVersion:1,passed:false,baseCommit:manifest.baseCommit,assets:[],sources:[],canonicalBones:names,errors:[]};
function skinCheck(doc){
  assert.equal(doc.getRoot().listSkins().length,1,'one canonical shared skin');
  const skin=doc.getRoot().listSkins()[0],bones=skin.listJoints(),inverse=skin.getInverseBindMatrices();
  assert.deepEqual(bones.map(b=>b.getName()),names,'canonical joint order');
  assert.equal(inverse.getCount(),18);
  let maxBindError=0,maxWeightError=0,maxRestError=0;
  for(let i=0;i<18;i++){
    const b=bones[i],j=rig.joints[i];
    assert.equal(b.getParentNode()?.getName()||null,j.parent,'canonical parent');
    for(const [actual,wanted]of[[b.getTranslation(),j.translation],[b.getRotation(),j.rotation],[b.getScale(),j.scale]])
      for(let k=0;k<actual.length;k++)maxRestError=Math.max(maxRestError,Math.abs(actual[k]-wanted[k]));
    const product=new T.Matrix4().fromArray(b.getWorldMatrix()).multiply(new T.Matrix4().fromArray(inverse.getElement(i,[])));
    for(let k=0;k<16;k++)maxBindError=Math.max(maxBindError,Math.abs(product.elements[k]-new T.Matrix4().elements[k]));
  }
  assert.ok(maxRestError<1e-6,`rest transforms changed: ${maxRestError}`);
  assert.ok(maxBindError<2e-5,`inverse bind error ${maxBindError}`);
  for(const node of doc.getRoot().listNodes())if(node.getSkin()){
    assert.ok(node.getMesh(),'skin node must have a mesh');
    for(const p of node.getMesh().listPrimitives()){
      const positions=p.getAttribute('POSITION'),joints=p.getAttribute('JOINTS_0'),weights=p.getAttribute('WEIGHTS_0');
      assert.equal(joints.getCount(),positions.getCount());assert.equal(weights.getCount(),positions.getCount());
      for(let v=0;v<positions.getCount();v++){
        const j=joints.getElement(v,[]),w=weights.getElement(v,[]);
        assert.ok(j.every(v=>Number.isInteger(v)&&v>=0&&v<18),'joint index bounds');
        assert.ok(w.every(v=>Number.isFinite(v)&&v>=-1e-7&&v<=1+1e-7),'finite nonnegative weights');
        maxWeightError=Math.max(maxWeightError,Math.abs(w.reduce((a,b)=>a+b,0)-1));
      }
    }
  }
  assert.ok(maxWeightError<.0002,`skin weights sum ${maxWeightError}`);
  return {bones:18,canonicalHierarchy:true,maxRestError,maxBindError,maxWeightError};
}
for(const source of manifest.sources){
  const bytes=await fs.readFile(path.join(repo,source.file));assert.equal(sha(bytes),source.sha256,source.file+' source changed');
  report.sources.push({file:source.file,sha256:source.sha256,unchanged:true});
}
for(const record of manifest.assets){
  const bytes=await fs.readFile(path.join(root,record.file));
  assert.equal(bytes.length,record.bytes,record.file+' size');assert.equal(sha(bytes),record.sha256,record.file+' SHA-256');
  const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:record.file,maxIssues:20});
  const doc=await io.readBinary(bytes),r=doc.getRoot(),out={file:record.file,bytes:bytes.length,sha256:sha(bytes),
    validator:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,
      messages:validation.issues.messages.filter(m=>m.severity<=1)}};
  assert.equal(validation.issues.numErrors,0,record.file+' validator: '+JSON.stringify(out.validator.messages));
  assert.equal(validation.issues.numWarnings,0,record.file+' warnings: '+JSON.stringify(out.validator.messages));
  assert.equal(r.listTextures().length,0,'no raster textures');
  let triangles=0;
  for(const mesh of r.listMeshes())for(const p of mesh.listPrimitives()){
    const pos=p.getAttribute('POSITION'),color=p.getAttribute('COLOR_0');
    assert.ok(color,'every primitive has COLOR_0');assert.equal(color.getCount(),pos.getCount());
    for(const attr of p.listAttributes())assert.ok(Array.from(attr.getArray()).every(Number.isFinite),'finite attributes');
    triangles+=(p.getIndices()?.getCount()||pos.getCount())/3;
  }
  assert.equal(triangles,record.triangles,'decoded triangle count');out.triangles=triangles;
  if(record.file.startsWith('kits/')){
    out.skin=skinCheck(doc);
    if(record.file.endsWith('numbers-01-11.glb')){
      const nodes=r.listNodes().filter(n=>n.getMesh());
      assert.equal(nodes.length,11);assert.deepEqual(nodes.map(n=>n.getExtras().number).sort((a,b)=>a-b),Array.from({length:11},(_,i)=>i+1));
      assert.ok(nodes.every(n=>n.getExtras().role==='back-number'));
      out.numberRange=[1,11];
    }else{
      const kit=kits.kits.find(k=>k.file===record.file),body=r.listNodes().find(n=>n.getMesh()?.getExtras().role==='canonical-footballer');
      assert.ok(body,'body metadata');
      assert.equal(r.listNodes().filter(n=>n.getExtras().role==='back-number').length,1);
      assert.equal(r.listNodes().find(n=>n.getExtras().role==='back-number').getExtras().number,kit.defaultNumber);
      const c=body.getMesh().listPrimitives()[0].getAttribute('COLOR_0');
      const hits={};for(const region of['shirt','shorts','socks']){
        const wanted=rgb(kit.palette[region]);let n=0;
        for(let i=0;i<c.getCount();i++)if(c.getElement(i,[]).every((v,k)=>Math.abs(v-wanted[k])<.003))n++;
        assert.ok(n>20,record.file+' '+region+' palette missing');hits[region]=n;
      }
      out.clothingPaletteVertexCounts=hits;
      assert.deepEqual(r.listAnimations().map(a=>a.getName()),['run']);
      const run=r.listAnimations()[0];assert.equal(run.listChannels().length,36);
      let duration=0;
      for(const channel of run.listChannels()){
        assert.ok(names.includes(channel.getTargetNode().getName()));
        const times=channel.getSampler().getInput().getArray();
        assert.equal(times[0],0);for(let i=1;i<times.length;i++)assert.ok(times[i]>times[i-1]);
        duration=Math.max(duration,times.at(-1));
      }
      assert.ok(duration>.3);out.runDurationSeconds=duration;
    }
  }else{
    const venue=venues.venues.find(v=>v.file===record.file);
    for(const name of['Sky','Stands_Tier01','Stands_Tier02','Stands_Tier03','Boards_Blank'])assert.ok(r.listNodes().some(n=>n.getName()===name),name+' present');
    const lights=r.listNodes().map(n=>n.getExtension('KHR_lights_punctual')).filter(Boolean);
    assert.equal(lights.filter(l=>l.getType()==='spot').length,venue.lighting.spots);
    assert.equal(lights.filter(l=>l.getType()==='directional').length,1);
    assert.equal(r.listNodes().find(n=>n.getName()==='Boards_Blank').getExtras().text,false);
    out.venue={standLayers:3,blankBoards:true,sky:true,lights:lights.map(l=>({type:l.getType(),intensity:l.getIntensity()}))};
  }
  const jsonLength=bytes.readUInt32LE(12),raw=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  assert.ok((raw.buffers||[]).every(b=>!b.uri),'no external buffers');assert.equal((raw.images||[]).length,0);
  report.assets.push(out);
}
const files=[];
async function walk(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  const name=path.join(directory,entry.name);if(entry.isDirectory())await walk(name);else if(entry.isFile())files.push({file:path.relative(root,name),bytes:(await fs.stat(name)).size});
}}
await walk(root);
const total=files.reduce((n,f)=>n+f.bytes,0);
assert.ok(total<=manifest.budget.maxBytes,`package ${total} > ${manifest.budget.maxBytes}`);
report.package={measuredBytes:total,maxBytes:manifest.budget.maxBytes,files:files.length,scope:'Every regular file recursively; this report is measured before its own rewrite. Recheck exact final bytes with source/package-audit.mjs.'};
report.passed=true;await writeJSON('verification/assets.json',report);
console.log(JSON.stringify({passed:true,glbs:report.assets.length,validatorErrors:0,validatorWarnings:0,packageBytes:total}));
