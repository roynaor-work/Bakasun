import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(process.env.SOCCER_V4_MODULES||'/tmp/soccer-v4-tools/package.json');
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),codec=require('draco3dgltf'),validator=require('gltf-validator');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
const root=path.resolve(import.meta.dirname,'..'),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex'),reports=[];
for(const asset of manifest.assets){
  const bytes=await fs.readFile(path.join(root,asset.path));assert.equal(sha(bytes),asset.sha256);assert.equal(bytes.length,asset.bytes);
  const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:asset.path,maxIssues:50});
  assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
  const doc=await io.read(path.join(root,asset.path)),report={path:asset.path,bytes:bytes.length,sha256:sha(bytes),gltfErrors:validation.issues.numErrors,gltfWarnings:validation.issues.numWarnings,messages:validation.issues.messages};
  let triangles=0;
  for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
    for(const semantic of p.listSemantics())assert.ok(p.getAttribute(semantic).getArray().every(Number.isFinite));
    triangles+=p.getIndices().getCount()/3;
  }
  report.triangles=triangles;report.meshes=doc.getRoot().listMeshes().length;
  if(asset.path!=='soccer-stadium.glb'){
    assert.ok(bytes.length<=300000);assert.equal(doc.getRoot().listTextures().length,0);assert.equal(doc.getRoot().listSkins()[0].listJoints().length,20);
    const expected=manifest.clips[asset.path.slice(0,-4)];assert.deepEqual(doc.getRoot().listAnimations().map(c=>c.getName()),expected.map(c=>c.name));
    report.clips=[];
    for(const clip of doc.getRoot().listAnimations()){
      let maxLoopAngle=0,maxLoopTranslation=0;
      const spec=expected.find(c=>c.name===clip.getName());
      for(const channel of clip.listChannels()){
        const s=channel.getSampler(),times=s.getInput().getArray(),out=s.getOutput();
        for(let i=1;i<times.length;i++)assert.ok(times[i]>times[i-1],`${clip.getName()} duplicate or unsorted time ${times[i]}`);
        assert.ok(Math.abs(times.at(-1)-spec.durationSeconds)<1e-5);
        if(channel.getTargetPath()==='rotation'){
          for(let i=0;i<out.getCount();i++)assert.ok(Math.abs(Math.hypot(...out.getElement(i,[]))-1)<1e-5);
          const a=out.getElement(0,[]),b=out.getElement(out.getCount()-1,[]);
          maxLoopAngle=Math.max(maxLoopAngle,2*Math.acos(Math.min(1,Math.abs(a.reduce((s,v,i)=>s+v*b[i],0)))));
        }else{
          if(channel.getTargetNode().getName()==='Root')for(let i=0;i<out.getCount();i++){const p=out.getElement(i,[]);assert.ok(Math.abs(p[0])<1e-6&&Math.abs(p[2])<1e-6,'Root motion leaked into GLB');}
          const a=out.getElement(0,[]),b=out.getElement(out.getCount()-1,[]);maxLoopTranslation=Math.max(maxLoopTranslation,Math.hypot(...a.map((v,k)=>v-b[k])));
        }
      }
      if(spec.loop){assert.ok(maxLoopAngle<.02,`${clip.getName()} loop rotation ${maxLoopAngle}`);assert.ok(maxLoopTranslation<.005,`${clip.getName()} loop position ${maxLoopTranslation}`);}
      report.clips.push({name:clip.getName(),duration:spec.durationSeconds,channels:clip.listChannels().length,loop:spec.loop,...spec.loop?{maxLoopAngleRadians:maxLoopAngle,maxLoopTranslationMetres:maxLoopTranslation}:{}});
    }
    const primitive=doc.getRoot().listMeshes()[0].listPrimitives()[0],weights=primitive.getAttribute('WEIGHTS_0');
    for(let i=0;i<weights.getCount();i++)assert.ok(Math.abs(weights.getElement(i,[]).reduce((a,b)=>a+b,0)-1)<1e-5);
    report.bones=20;report.textureCount=0;
  }else{
    const original=await io.read(path.join(root,'../models2/soccer-stadium.glb'));
    const anchors=original.getRoot().listNodes().filter(n=>n.getName().startsWith('anchor_'));
    for(const a of anchors){const b=doc.getRoot().listNodes().find(n=>n.getName()===a.getName());assert.ok(b,`Missing ${a.getName()}`);assert.deepEqual(b.getTranslation(),a.getTranslation());}
    report.preservedAnchors=anchors.length;
    const pitch=doc.getRoot().listNodes().find(n=>n.getName()==='pitch_surface').getMesh().listPrimitives()[0];
    const p=pitch.getAttribute('POSITION');assert.ok(Math.abs(p.getMin([])[0]+34)<.003);assert.ok(Math.abs(p.getMax([])[2]-52.5)<.003);
    assert.equal(doc.getRoot().listTextures().length,2);
    for(const t of doc.getRoot().listTextures())assert.deepEqual(t.getSize(),[512,512]);
    report.spectators=manifest.stadium.spectators;report.crowdDrawCalls=1;report.textureCount=2;
  }
  // Validate decoded geometry independently: Khronos cannot inspect Draco data.
  for(const e of [...doc.getRoot().listExtensionsUsed()])if(e.extensionName==='KHR_draco_mesh_compression')e.dispose();
  const decoded=await validator.validateBytes(await io.writeBinary(doc),{uri:`decoded-${asset.path}`,maxIssues:50});
  assert.equal(decoded.issues.numErrors,0,JSON.stringify(decoded.issues));
  report.decodedErrors=decoded.issues.numErrors;report.decodedWarnings=decoded.issues.numWarnings;report.decodedMessages=decoded.issues.messages;
  reports.push(report);
}
assert.ok(manifest.runtimeBytes<manifest.runtimeBudgetBytes);
const report={pass:true,runtimeBytes:manifest.runtimeBytes,runtimeBudgetBytes:manifest.runtimeBudgetBytes,assets:reports};
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
