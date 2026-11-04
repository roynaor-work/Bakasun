// Independent checks against the final decoded GLBs, not the raw authoring JSON.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../../vendor/three.module.js';
import {root,io,json,writeJSON,require,sha} from './common.mjs';
const validator=require('gltf-validator');
const manifest=await json('manifest.json'),contract=await json('../motion2/soccer.json');
const expected=contract.skeleton.bones,names=expected.map(b=>b.name),clips=['run','sprint','kick','pass','slide'];
const report={schemaVersion:1,allPassed:false,limits:{bytesPerGLB:1500000,textureDimension:1024,floorPenetrationMeters:.005},
  canonicalSource:'../motion2/soccer.json / skeleton.bones',assets:[],sourceHashes:[],errors:[]};
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const finite=a=>Array.from(a).every(Number.isFinite);
const geometryHashes=new Map();

function inspectSkin(doc){
  const skins=doc.getRoot().listSkins();assert(skins.length===1,'Expected one skin');
  const skin=skins[0],joints=skin.listJoints();assert(equal(joints.map(j=>j.getName()),names),'Canonical joint order');
  for(const b of expected)if(b.parent)assert(joints.find(j=>j.getName()===b.name).getParentNode()?.getName()===b.parent,`${b.name}: incorrect parent`);
  let maxBindError=0,maxWeightError=0;
  const inverse=skin.getInverseBindMatrices();assert(inverse.getCount()===18,'Inverse bind count');
  for(let i=0;i<18;i++){
    const product=new THREE.Matrix4().fromArray(joints[i].getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(inverse.getElement(i,[])));
    const identity=new THREE.Matrix4().elements;
    maxBindError=Math.max(maxBindError,...product.elements.map((v,k)=>Math.abs(v-identity[k])));
  }
  assert(maxBindError<2e-5,`Invalid inverse binds: ${maxBindError}`);
  for(const node of doc.getRoot().listNodes().filter(n=>n.getSkin()))for(const p of node.getMesh().listPrimitives()){
    const indices=p.getAttribute('JOINTS_0'),weights=p.getAttribute('WEIGHTS_0');
    assert(indices?.getCount()===p.getAttribute('POSITION').getCount()&&weights?.getCount()===indices.getCount(),'Skin attribute counts');
    for(let i=0;i<weights.getCount();i++){
      const w=weights.getElement(i,[]),j=indices.getElement(i,[]);
      assert(w.every(v=>v>=0&&v<=1),'Weight out of range');
      assert(j.every(v=>Number.isInteger(v)&&v>=0&&v<18),'Joint out of range');
      maxWeightError=Math.max(maxWeightError,Math.abs(w.reduce((a,b)=>a+b,0)-1));
    }
  }
  assert(maxWeightError<2e-4,'Unnormalized skin weights');
  return {joints:18,names,canonicalHierarchy:true,maxBindError,maxWeightError};
}

function inspectClips(doc){
  const animations=doc.getRoot().listAnimations();
  assert(equal(animations.map(a=>a.getName()).sort(),clips.slice().sort()),'Five required clips');
  return animations.map(animation=>{
    const moving=new Set();let duration=0,seam=0;
    for(const channel of animation.listChannels()){
      const name=channel.getTargetNode().getName(),property=channel.getTargetPath(),sampler=channel.getSampler();
      assert(names.includes(name),'Noncanonical animation target');assert(['rotation','translation'].includes(property),'Unexpected animation property');
      const times=sampler.getInput().getArray(),out=sampler.getOutput();
      assert(finite(times)&&finite(out.getArray()),'Nonfinite animation data');
      assert(times.length===out.getCount()&&times.length>=1,'Animation sample count');
      assert(times[0]===0,'Track must start at zero');
      for(let i=1;i<times.length;i++)assert(times[i]>times[i-1],'Duplicate animation times');
      duration=Math.max(duration,times.at(-1));
      const first=out.getElement(0,[]),last=out.getElement(out.getCount()-1,[]);
      const distance=(a,b)=>{const sign=property==='rotation'&&a.reduce((s,v,k)=>s+v*b[k],0)<0?-1:1;return Math.max(...a.map((v,k)=>Math.abs(v-sign*b[k])));};
      let variation=0;
      for(let i=0;i<out.getCount();i++){
        const v=out.getElement(i,[]);variation=Math.max(variation,distance(v,first));
        if(property==='rotation')assert(Math.abs(Math.hypot(...v)-1)<1e-4,'Nonunit quaternion');
      }
      if(variation>1e-4)moving.add(name);seam=Math.max(seam,distance(first,last));
    }
    assert(moving.size>=5,`${animation.getName()}: insufficient moving joints`);
    if(['run','sprint'].includes(animation.getName()))assert(seam<1e-4,'Locomotion loop seam');
    return {name:animation.getName(),durationSeconds:duration,channels:animation.listChannels().length,movingJoints:moving.size,
      loop:['run','sprint'].includes(animation.getName()),loopSeamError:seam};
  });
}

function inspectExpressions(doc){
  const mesh=doc.getRoot().listMeshes()[0],primitive=mesh.listPrimitives()[0];
  assert(equal(mesh.getExtras().targetNames,['smile','focus']),'Named expressions');
  const targets=primitive.listTargets();assert(targets.length===2,'Expression target count');
  return targets.map((target,index)=>{
    const position=target.getAttribute('POSITION'),joints=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
    assert(position.getCount()===primitive.getAttribute('POSITION').getCount(),'Morph vertex count');
    let affected=0,maxDisplacement=0;
    for(let v=0;v<position.getCount();v++){
      const delta=position.getElement(v,[]),length=Math.hypot(...delta);maxDisplacement=Math.max(maxDisplacement,length);
      if(length>1e-6){
        affected++;const ji=joints.getElement(v,[]),w=weights.getElement(v,[]);
        assert(ji.reduce((sum,j,k)=>sum+(j===names.indexOf('Head')?w[k]:0),0)>.999,'Facial expression deforms another body part');
      }
    }
    assert(affected>30&&maxDisplacement>.002,'Empty or imperceptible expression');
    return {name:['smile','focus'][index],affectedVertices:affected,maxDisplacementMeters:maxDisplacement};
  });
}

function inspectFloor(doc){
  const skin=doc.getRoot().listSkins()[0],scene=new THREE.Group(),bones={};
  for(const j of skin.listJoints()){
    const b=new THREE.Bone();b.name=j.getName();b.position.fromArray(j.getTranslation());b.quaternion.fromArray(j.getRotation());bones[b.name]=b;
    const parent=j.getParentNode()?.getName();if(bones[parent])bones[parent].add(b);else scene.add(b);
  }
  const source=doc.getRoot().listMeshes()[0].listPrimitives()[0],geometry=new THREE.BufferGeometry();
  for(const [semantic,key] of [['POSITION','position'],['JOINTS_0','skinIndex'],['WEIGHTS_0','skinWeight']]){
    const a=source.getAttribute(semantic);geometry.setAttribute(key,new THREE.BufferAttribute(a.getArray().slice(),a.getElementSize(),a.getNormalized()));
  }
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());scene.add(mesh);scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(names.map(n=>bones[n]),names.map((n,i)=>new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[])))),new THREE.Matrix4());
  const records=[];
  for(const sourceClip of doc.getRoot().listAnimations()){
    const tracks=sourceClip.listChannels().map(channel=>{
      const p=channel.getTargetPath(),sampler=channel.getSampler(),name=channel.getTargetNode().getName();
      const Class=p==='rotation'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
      return new Class(name+'.'+(p==='rotation'?'quaternion':'position'),sampler.getInput().getArray(),sampler.getOutput().getArray());
    });
    const clip=new THREE.AnimationClip(sourceClip.getName(),-1,tracks),mixer=new THREE.AnimationMixer(scene);
    const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    let minimum=Infinity,maximumMinimum=-Infinity;const p=new THREE.Vector3();
    for(let frame=0;frame<=48;frame++){
      mixer.setTime(Math.max(0,clip.duration*frame/48-1e-8));scene.updateMatrixWorld(true);mesh.skeleton.update();
      let min=Infinity;
      for(let v=0;v<geometry.attributes.position.count;v++)min=Math.min(min,mesh.getVertexPosition(v,p).y);
      minimum=Math.min(minimum,min);maximumMinimum=Math.max(maximumMinimum,min);
    }
    assert(minimum>=-.005,`${sourceClip.getName()}: floor penetration ${minimum.toFixed(5)}m`);
    records.push({clip:sourceClip.getName(),independentSamples:49,minimumY:minimum,maximumLowestVertexY:maximumMinimum});mixer.stopAllAction();
  }
  geometry.dispose();mesh.material.dispose();return records;
}

for(const entry of manifest.assets){
  try{
    const bytes=await fs.readFile(path.resolve(root,entry.file));
    assert(bytes.length<=1500000,'GLB size limit');assert(bytes.length===entry.bytes&&sha(bytes)===entry.sha256,'Manifest hash/size mismatch');
    const glb=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());
    assert(glb.buffers.every(b=>!b.uri)&&!(glb.images??[]).some(i=>i.uri),'External GLB resources');
    assert(glb.extensionsRequired.includes('KHR_draco_mesh_compression'),'Missing Draco compression');
    const gltf=await validator.validateBytes(new Uint8Array(bytes),{uri:entry.file,maxIssues:0});
    assert(gltf.issues.numErrors===0,`Khronos validation: ${gltf.issues.numErrors} errors`);
    const doc=await io.readBinary(bytes);let triangles=0,vertices=0;
    for(const node of doc.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()??[]){
      for(const a of p.listAttributes())assert(finite(a.getArray()),'Nonfinite geometry');
      const position=p.getAttribute('POSITION');vertices+=position.getCount();triangles+=(p.getIndices()?.getCount()??position.getCount())/3;
    }
    assert(triangles===entry.triangles&&vertices===entry.vertices,'Manifest geometry counts');
    const textures=doc.getRoot().listTextures().map(t=>({name:t.getName(),size:t.getSize(),bytes:t.getImage().length}));
    assert(textures.every(t=>t.size&&Math.max(...t.size)<=1024),'Texture dimension limit');
    const record={id:entry.id,file:entry.file,bytes:bytes.length,sha256:sha(bytes),triangles,vertices,textures,
      khronos:{errors:gltf.issues.numErrors,warnings:gltf.issues.numWarnings,messages:gltf.issues.messages}};
    if(entry.category==='character'){
      record.skin=inspectSkin(doc);record.clips=inspectClips(doc);record.expressions=inspectExpressions(doc);record.floor=inspectFloor(doc);
      const data=doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getArray();
      geometryHashes.set(entry.id,sha(Buffer.from(data.buffer,data.byteOffset,data.byteLength)));
    }
    report.assets.push(record);console.log(`PASS ${entry.id}: ${triangles} triangles / ${bytes.length} bytes`);
  }catch(error){report.errors.push({asset:entry.file,error:String(error)});console.error(`FAIL ${entry.file}: ${error.message}`);}
}
try{
  const looks=['quiff','curls','knot'];
  assert(new Set(looks.map(look=>geometryHashes.get('teal-'+look))).size===3,'Three faces must have different geometry');
  for(const look of looks)assert(geometryHashes.get('teal-'+look)===geometryHashes.get('coral-'+look),'Team kits must share the same facial geometry');
  assert(new Set(manifest.sources.map(s=>s.file)).size===manifest.sources.length,'Duplicate provenance entry');
  for(const source of manifest.sources){const match=sha(await fs.readFile(path.resolve(root,source.file)))===source.sha256;assert(match,`Changed source ${source.file}`);report.sourceHashes.push({...source,match});}
}catch(error){report.errors.push({asset:'provenance/variants',error:String(error)});}
report.allPassed=report.errors.length===0&&report.assets.length===11;
report.totals={files:report.assets.length,bytes:report.assets.reduce((s,a)=>s+a.bytes,0),triangles:report.assets.reduce((s,a)=>s+a.triangles,0)};
await writeJSON('verification/assets.json',report);
if(!report.allPassed)process.exitCode=1;
