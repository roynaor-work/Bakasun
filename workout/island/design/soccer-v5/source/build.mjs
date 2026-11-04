// Reuse detailed original surfaces, bake existing calibrated motions, collapse
// the two auxiliary shoulders exactly as the established skier3 pipeline does.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../../vendor/three.module.js';
import {Retargeter} from '../../viewer/retarget.js';
import {sample} from '../../viewer/animation.js';
import {root,json,writeJSON,Document,accessor,save,weld,simplify,resample,MeshoptSimplifier,sha} from './common.mjs';

const sourceRig=await json('../characters/rig.json');
const map=await json('../viewer/retarget-map.json');
const base=await json('../motion/soccer.json'),extra=await json('../motion2/soccer.json');
const canonical=base.skeleton.bones,oldNames=sourceRig.joints.map(j=>j.name),newNames=canonical.map(j=>j.name);
const bindScene=new THREE.Group(),bindBones={};
for(const j of sourceRig.joints){
  const b=new THREE.Bone();b.name=j.name;b.position.fromArray(j.translation);
  b.quaternion.fromArray(j.rotation);b.scale.fromArray(j.scale);bindBones[j.name]=b;
  if(j.parent)bindBones[j.parent].add(b);else bindScene.add(b);
}
bindScene.updateMatrixWorld(true);
const bindWorld=Object.fromEntries(oldNames.map(n=>[n,bindBones[n].matrixWorld.clone()]));
const collapsedBind=Object.fromEntries(canonical.map(b=>{
  const matrix=b.parent?bindWorld[b.parent].clone().invert().multiply(bindWorld[b.name]):bindWorld[b.name];
  const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();matrix.decompose(p,q,s);
  return [b.name,{translation:p.toArray(),rotation:q.normalize().toArray(),scale:s.toArray()}];
}));

const sprint=structuredClone(base.states.run);
sprint.durationSeconds=.50;sprint.clip='sprint';
for(const event of sprint.events??[])if(event.atSeconds!==undefined)event.atSeconds=event.time*sprint.durationSeconds;
if(sprint.referenceLocomotion)sprint.referenceLocomotion.speedMetersPerSecond=sprint.referenceLocomotion.strideLengthMeters/sprint.durationSeconds;
// Sprint has a distinct forward lean, stronger thigh swing and faster cadence.
for(const k of sprint.keyframes){
  for(const n of ['Hips','Spine']){
    const lean=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),n==='Hips'?.12:.045);
    k.rotations[n]=new THREE.Quaternion().fromArray(k.rotations[n]).multiply(lean).normalize().toArray();
  }
  for(const n of ['LeftUpLeg','RightUpLeg','LeftArm','RightArm']){
    const q=new THREE.Quaternion().fromArray(k.rotations[n]);
    const angle=2*Math.acos(THREE.MathUtils.clamp(q.w,-1,1));
    const axis=new THREE.Vector3(q.x,q.y,q.z).normalize();
    if(angle>1e-8)k.rotations[n]=new THREE.Quaternion().setFromAxisAngle(axis,angle*1.15).toArray();
  }
}
const defs=[
  {name:'run',label:'ריצה',clip:base.states.run,source:'../motion/soccer.json',state:'run',loop:true},
  {name:'sprint',label:'ספרינט',clip:sprint,source:'source/build.mjs',state:'derived run / lean + stride + cadence',loop:true},
  {name:'kick',label:'בעיטה',clip:base.states.kick,source:'../motion/soccer.json',state:'kick',loop:false},
  {name:'pass',label:'מסירה',clip:extra.states.short_pass,source:'../motion2/soccer.json',state:'short_pass',loop:false},
  {name:'slide',label:'גלישה',clip:extra.states.slide_tackle,source:'../motion2/soccer.json',state:'slide_tackle',loop:false},
];

function bake(raw){
  const scene=new THREE.Group(),bones={};
  for(const j of sourceRig.joints){
    const b=new THREE.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);
    bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else scene.add(b);
  }
  const geometry=new THREE.BufferGeometry();
  for(const [key,data,size,Type] of [['position',raw.positions,3,Float32Array],['skinIndex',raw.joints,4,Uint16Array],['skinWeight',raw.weights,4,Float32Array]])
    geometry.setAttribute(key,new THREE.BufferAttribute(new Type(data.flat()),size));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());scene.add(mesh);scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(oldNames.map(n=>bones[n]),sourceRig.joints.map(j=>new THREE.Matrix4().fromArray(j.inverseBindMatrix))),new THREE.Matrix4());
  const adapter=new Retargeter(scene,sourceRig,base.skeleton,map),clips=[];
  for(const def of defs){
    const duration=def.clip.durationSeconds;
    const nt=[0,1,...def.clip.keyframes.map(k=>k.time),...Array.from({length:Math.ceil(duration*60)+1},(_,i)=>Math.min(1,i/(duration*60)))].sort((a,b)=>a-b);
    const times=nt.filter((t,i)=>i===0||t-nt[i-1]>1e-6).map(t=>t*duration);
    const values=Object.fromEntries(newNames.map(n=>[n,{translation:[],rotation:[]}]));
    let minY=Infinity,maxSupportError=0;
    for(const t of times){
      const pose=sample(def.clip,t,false);
      // Translate both the actor and its authored support anchors into the
      // same in-place frame. Keeping world-path anchors with a stationary Root
      // makes the IK drag the pelvis forward and breaks the locomotion seam.
      const contacts=pose.contacts.map(c=>({...c,anchorMeters:c.anchorMeters.map((v,i)=>v-pose.referenceRootTranslationMeters[i])}));
      const result=adapter.apply(pose,{referenceRoot:[0,0,0],contacts,floor:true});
      minY=Math.min(minY,result.minY);maxSupportError=Math.max(maxSupportError,result.maxSupportErrorMeters);
      for(const b of canonical){
        const world=bones[b.name].matrixWorld;
        const matrix=b.parent?bones[b.parent].matrixWorld.clone().invert().multiply(world):world;
        const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();matrix.decompose(p,q,s);
        values[b.name].translation.push(...p.toArray());values[b.name].rotation.push(...q.normalize().toArray());
      }
    }
    // Explicit looping endpoints remove numerical contact-solver drift.
    if(def.loop)for(const channels of Object.values(values))for(const [key,data] of Object.entries(channels)){
      const size=key==='rotation'?4:3;data.splice(data.length-size,size,...data.slice(0,size));
    }
    clips.push({times,values,metadata:{name:def.name,label:def.label,durationSeconds:duration,
      loop:def.loop,rootMotion:false,source:{file:def.source,state:def.state},
      events:def.clip.events??[],bake:{hz:60,samples:times.length,minimumY:minY,maxSupportErrorMeters:maxSupportError}}});
    console.log(`Bake ${raw.team} ${def.name}: ${times.length} samples, minY ${minY.toFixed(6)}`);
  }
  geometry.dispose();mesh.material.dispose();
  return clips;
}

function createActor(raw,clips,id){
  const doc=new Document();doc.createBuffer();
  const nodes=Object.fromEntries(canonical.map(b=>{
    const t=collapsedBind[b.name];
    return [b.name,doc.createNode(b.name).setTranslation(t.translation).setRotation(t.rotation).setScale(t.scale)];
  }));
  for(const b of canonical)if(b.parent)nodes[b.parent].addChild(nodes[b.name]);
  const skin=doc.createSkin('Motion2Canonical18').setSkeleton(nodes.Root);
  const inverse=[];
  for(const b of canonical){skin.addJoint(nodes[b.name]);inverse.push(...sourceRig.joints[oldNames.indexOf(b.name)].inverseBindMatrix);}
  skin.setInverseBindMatrices(accessor(doc,'Canonical inverse binds','MAT4',new Float32Array(inverse)));
  const material=doc.createMaterial('Toon vertex palette / unbranded kit').setRoughnessFactor(.86).setMetallicFactor(0);
  const indices=[],weights=[];
  for(let v=0;v<raw.joints.length;v++){
    const combined=new Map();
    for(let k=0;k<4;k++)if(raw.weights[v][k]){
      let name=oldNames[raw.joints[v][k]];if(name.endsWith('Shoulder'))name='Chest';
      const j=newNames.indexOf(name);combined.set(j,(combined.get(j)||0)+raw.weights[v][k]);
    }
    const channels=[...combined].sort((a,b)=>b[1]-a[1]);while(channels.length<4)channels.push([0,0]);
    const exact=channels.map(c=>c[1]*65535),packed=exact.map(Math.floor);
    const order=[0,1,2,3].sort((a,b)=>(exact[b]-packed[b])-(exact[a]-packed[a]));
    for(let n=65535-packed.reduce((a,b)=>a+b,0),k=0;k<n;k++)packed[order[k%4]]++;
    indices.push(...channels.map((c,k)=>packed[k]?c[0]:0));weights.push(...packed);
  }
  const prim=doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION',accessor(doc,'Athlete surface','VEC3',new Float32Array(raw.positions.flat())))
    .setAttribute('NORMAL',accessor(doc,'Surface normals','VEC3',new Float32Array(raw.normals.flat())))
    .setAttribute('COLOR_0',accessor(doc,'Linear kit palette','VEC3',new Float32Array(raw.colors.flat())))
    .setAttribute('JOINTS_0',accessor(doc,'Canonical joints','VEC4',new Uint16Array(indices)))
    .setAttribute('WEIGHTS_0',accessor(doc,'Normalized weights','VEC4',new Uint16Array(weights)).setNormalized(true))
    .setIndices(accessor(doc,'Triangles','SCALAR',new Uint32Array(raw.indices.flat())));
  for(const [name,delta] of Object.entries(raw.morphs))prim.addTarget(doc.createPrimitiveTarget(name)
    .setAttribute('POSITION',accessor(doc,name+' expression','VEC3',new Float32Array(delta.flat()))));
  const actorMesh=doc.createMesh(id).addPrimitive(prim).setWeights([0,0]).setExtras({targetNames:['smile','focus']});
  const actor=doc.createNode('Athlete').setMesh(actorMesh).setSkin(skin).setWeights([0,0]);
  doc.createScene(id).addChild(nodes.Root).addChild(actor);
  for(const clip of clips){
    const animation=doc.createAnimation(clip.metadata.name).setExtras(clip.metadata);
    const input=accessor(doc,clip.metadata.name+' seconds','SCALAR',new Float32Array(clip.times));
    for(const [name,channels] of Object.entries(clip.values))for(const [property,original] of Object.entries(channels)){
      const data=[...original];
      if(property==='rotation')for(let i=4;i<data.length;i+=4)
        if(data.slice(i,i+4).reduce((s,v,k)=>s+v*data[i-4+k],0)<0)for(let k=0;k<4;k++)data[i+k]*=-1;
      const output=accessor(doc,clip.metadata.name+' '+name+' '+property,property==='rotation'?'VEC4':'VEC3',new Float32Array(data));
      const sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[name]).setTargetPath(property).setSampler(sampler));
    }
  }
  return doc;
}

await fs.mkdir(path.resolve(root,'models'),{recursive:true});
const rawDir=process.argv.includes('--raw')?process.argv[process.argv.indexOf('--raw')+1]:'/tmp/soccer-v5-raw';
const assets=[],bakes=new Map();
for(const id of ['teal-quiff','teal-curls','teal-knot','coral-quiff','coral-curls','coral-knot','goalkeeper']){
  const raw=JSON.parse(await fs.readFile(path.join(rawDir,id+'.json'),'utf8'));
  const key=id==='goalkeeper'?'keeper':'player';
  if(!bakes.has(key))bakes.set(key,bake(raw));
  const clips=bakes.get(key),doc=createActor(raw,clips,id);
  // Preserve the modeled silhouette and facial channels while reducing dense
  // rings from the source. This is a small-screen asset, not the raw sculpt.
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.48,error:.0008}),resample({tolerance:.00005}));
  assets.push(await save(doc,`models/${id}.glb`,{id,category:'character',look:raw.look,team:raw.team,
    jointCount:18,expressions:['neutral','smile','focus'],clips:clips.map(c=>c.metadata)}));
}
const inverse=canonical.flatMap(b=>sourceRig.joints[oldNames.indexOf(b.name)].inverseBindMatrix);
await writeJSON('rig.json',{schemaVersion:1,name:'Motion2Canonical18',boneCount:18,units:'metres',up:'+Y',forward:'+Z',
  bindPose:'Original athlete T-pose; calibrated axes, same lengths as characters/rig.json',
  canonicalSource:'../motion2/soccer.json / skeleton.bones',
  joints:canonical.map((b,i)=>({name:b.name,parent:b.parent,...collapsedBind[b.name],inverseBindMatrix:inverse.slice(i*16,i*16+16)})),
  retarget:{sourceRig:'../characters/rig.json',sourceMap:'../viewer/retarget-map.json',motionScale:map.motionScale,
    note:'Canonical names/order/parents. Arm local transform collapses Chest → Shoulder → Arm. Shoulder weights map to Chest. Retained inverse binds are unchanged. Canonical JSON rotations need world-basis calibration; embedded clips play directly.'}});
const sourceFiles=['source/characters.py','source/build.mjs','source/common.mjs','../characters2/source/mesh.py','../characters2/source/body.py',
  '../characters2/source/head_hands.py','../characters2/source/gear.py','../characters/rig.json','../viewer/retarget-map.json',
  '../viewer/retarget.js','../viewer/animation.js','../motion/soccer.json','../motion2/soccer.json'];
await writeJSON('manifest.json',{schemaVersion:1,kind:'soccer-v5-cartoon',style:'A / original fictional toon athletes',
  license:'CC0-1.0',maxBytesPerGLB:1500000,rig:'rig.json',assets,
  sources:await Promise.all(sourceFiles.map(async file=>({file,sha256:sha(await fs.readFile(path.resolve(root,file)))})))});
