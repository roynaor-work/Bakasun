// Decode the shipped GLBs, verify floor origins and check opposite arm/foot
// swing from their actual skeletal animation channels, independently of authoring.
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire('/tmp/fire-v7-tools/package.json');
const{NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),draco=require('draco3dgltf'),THREE=require('three');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')),report={generatedAt:new Date().toISOString(),assets:[],walkOpposition:[],failures:[]};
for(const a of manifest.assets){
 const doc=await io.read(path.join(root,a.file));let minY=Infinity,maxY=-Infinity;
 for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){const v=p.getAttribute('POSITION').getArray();for(let i=1;i<v.length;i+=3){minY=Math.min(minY,v[i]);maxY=Math.max(maxY,v[i]);}}
 report.assets.push({id:a.id,category:a.category,lod:a.lod,minY,maxY,originShiftMeters:a.originShiftMeters??0});
 if(a.category!=='street'&&(minY<-.002||minY>.002))report.failures.push({id:a.id,issue:'Geometry origin is not at the ground plane',minY});
 if(a.category==='crew'){
  const skin=doc.getRoot().listSkins()[0],joints=skin.listJoints(),clip=doc.getRoot().listAnimations().find(c=>c.getName()==='walk');
  for(const time of [0,.5]){
   const group=new THREE.Group(),bones={};
   for(const node of joints){const b=new THREE.Bone();b.name=node.getName();b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation());bones[b.name]=b;}
   for(const node of joints){const parent=node.getParentNode();if(parent&&bones[parent.getName()])bones[parent.getName()].add(bones[node.getName()]);else group.add(bones[node.getName()]);}
   for(const ch of clip.listChannels()){
    const sampler=ch.getSampler(),t=sampler.getInput().getArray(),v=sampler.getOutput().getArray(),width=sampler.getOutput().getElementSize();
    let i=0;for(let k=0;k<t.length;k++)if(Math.abs(t[k]-time)<1e-5){i=k;break;}
    const b=bones[ch.getTargetNode().getName()];if(ch.getTargetPath()==='rotation')b.quaternion.fromArray(v,i*width);else if(ch.getTargetPath()==='translation')b.position.fromArray(v,i*width);
   }
   group.updateMatrixWorld(true);const leftFoot=bones.LeftFoot.getWorldPosition(new THREE.Vector3()),leftHand=bones.LeftHand.getWorldPosition(new THREE.Vector3()),rightFoot=bones.RightFoot.getWorldPosition(new THREE.Vector3()),rightHand=bones.RightHand.getWorldPosition(new THREE.Vector3());
   const passed=leftFoot.z*leftHand.z<0&&rightFoot.z*rightHand.z<0;
   report.walkOpposition.push({id:a.id,time,leftFootZ:leftFoot.z,leftHandZ:leftHand.z,rightFootZ:rightFoot.z,rightHandZ:rightHand.z,passed});
   if(!passed)report.failures.push({id:a.id,time,issue:'Arm swing is not opposite foot advance'});
  }
 }
}
for(const type of ['engine-pumper','engine-ladder','response-unit']){
 const h=report.assets.find(a=>a.id===type),l=report.assets.find(a=>a.id===type+'-lod');
 if(Math.abs(h.originShiftMeters-l.originShiftMeters)>.0001)report.failures.push({id:type,issue:'LOD ground envelope mismatch'});
}
report.passed=report.failures.length===0;await fs.writeFile(path.join(root,'verification/grounding.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,assets:report.assets.length,walkSamples:report.walkOpposition.length,failures:report.failures}));if(!report.passed)process.exitCode=1;
