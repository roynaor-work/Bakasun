// Reuse the detailed CC0 athlete; bake calibrated motion, collapse shoulder helpers.
// All writes are confined to skier3. No browser, CDN, Blender or live game needed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import * as THREE from '../../../vendor/three.module.js';
import {Retargeter} from '../../viewer/retarget.js';
import {sample} from '../../viewer/animation.js';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const require=createRequire(path.resolve(arg('--modules','/tmp/alpine-tools/package.json')));
const {Document,NodeIO}=require('@gltf-transform/core');
const {KHRDracoMeshCompression}=require('@gltf-transform/extensions');
const codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
 'draco3d.encoder':await codec.createEncoderModule(),'draco3d.decoder':await codec.createDecoderModule(),
});
const loadJSON=async p=>JSON.parse(await fs.readFile(path.resolve(root,p),'utf8'));
const sourceRig=await loadJSON('../characters/rig.json');
const map=await loadJSON('../viewer/retarget-map.json');
const base=await loadJSON('../motion/alpine.json'),extra=await loadJSON('../motion2/alpine/alpine.json');
const canonical=base.skeleton.bones;
const doc=await io.read(path.resolve(root,'../characters2/skier.glb'));
const g=doc.getRoot(),skin=g.listSkins()[0],sourceJoints=skin.listJoints();
const byName=Object.fromEntries(sourceJoints.map(n=>[n.getName(),n]));
const originalInverse=skin.getInverseBindMatrices().getArray().slice();
const prim=g.listMeshes()[0].listPrimitives()[0];
const geometry=new THREE.BufferGeometry();
for(const [semantic,key] of [['POSITION','position'],['NORMAL','normal'],['JOINTS_0','skinIndex'],['WEIGHTS_0','skinWeight']]){
 const a=prim.getAttribute(semantic);geometry.setAttribute(key,new THREE.BufferAttribute(a.getArray().slice(),a.getElementSize(),a.getNormalized()));
}
geometry.setIndex(new THREE.BufferAttribute(prim.getIndices().getArray().slice(),1));
const scene=new THREE.Group(),bones={};
for(const j of sourceRig.joints){const b=new THREE.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);b.scale.fromArray(j.scale);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else scene.add(b);}
const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());
scene.add(mesh);scene.updateMatrixWorld(true);
mesh.bind(new THREE.Skeleton(sourceRig.joints.map(j=>bones[j.name]),sourceRig.joints.map(j=>new THREE.Matrix4().fromArray(j.inverseBindMatrix))),new THREE.Matrix4());
const retarget=new Retargeter(scene,sourceRig,base.skeleton,map);
// Save untouched original bind world transforms before posing the actor.
const bindWorld=Object.fromEntries(sourceRig.joints.map(j=>[j.name,bones[j.name].matrixWorld.clone()]));
const collapsedBind={};
for(const b of canonical){const world=bindWorld[b.name];const m=b.parent?bindWorld[b.parent].clone().invert().multiply(world):world.clone();const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();m.decompose(p,q,s);collapsedBind[b.name]={translation:p.toArray(),rotation:q.normalize().toArray(),scale:s.toArray()};}
// Replace 20-joint skin with exactly the canonical 18, keeping inverse binds.
for(const side of ['Left','Right']){
 const shoulder=byName[side+'Shoulder'],arm=byName[side+'Arm'];
 shoulder.removeChild(arm);byName.Chest.removeChild(shoulder);byName.Chest.addChild(arm);
 arm.setTranslation(collapsedBind[side+'Arm'].translation).setRotation(collapsedBind[side+'Arm'].rotation).setScale(collapsedBind[side+'Arm'].scale);
}
const oldNames=sourceJoints.map(j=>j.getName());
const newNames=canonical.map(b=>b.name);
const ji=prim.getAttribute('JOINTS_0'),wa=prim.getAttribute('WEIGHTS_0');
const packedIndices=[],packedWeights=[];
for(let v=0;v<ji.getCount();v++){
 const weights=wa.getElement(v,[]),indices=ji.getElement(v,[]),sum=new Map();
 for(let k=0;k<4;k++)if(weights[k]){let n=oldNames[indices[k]];if(n.endsWith('Shoulder'))n='Chest';const j=newNames.indexOf(n);sum.set(j,(sum.get(j)||0)+weights[k]);}
 const channels=[...sum].sort((a,b)=>b[1]-a[1]);while(channels.length<4)channels.push([0,0]);
 const scaled=channels.map(c=>c[1]*65535),out=scaled.map(Math.floor),order=[0,1,2,3].sort((a,b)=>(scaled[b]-out[b])-(scaled[a]-out[a]));
 for(let n=65535-out.reduce((a,b)=>a+b,0),k=0;k<n;k++)out[order[k%4]]++;
 packedIndices.push(...channels.map((c,k)=>out[k]?c[0]:0));packedWeights.push(...out);
}
ji.setArray(new Uint16Array(packedIndices));wa.setArray(new Uint16Array(packedWeights)).setNormalized(true);
for(const n of sourceJoints)skin.removeJoint(n);
const inverse=[];
for(const b of canonical){skin.addJoint(byName[b.name]);const idx=oldNames.indexOf(b.name);inverse.push(...originalInverse.slice(idx*16,idx*16+16));}
skin.setName('Motion2Canonical18').getInverseBindMatrices().setArray(new Float32Array(inverse));
for(const side of ['Left','Right'])byName[side+'Shoulder'].dispose();
const buffer=g.listBuffers()[0];
const accessor=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
// Lightweight original poles. Y=0 is the palm grip; +Y reaches above the fist.
function poleGeometry(){
 const parts=[];
 const cylinder=(radiusTop,radiusBottom,height,y)=>{const a=new THREE.CylinderGeometry(radiusTop,radiusBottom,height,10,1);a.translate(0,y,0);return a;};
 parts.push({geo:cylinder(.006,.004,.66,-.36),color:[.30,.49,.62]});
 parts.push({geo:cylinder(.012,.010,.074,.010),color:[.13,.20,.29]});
 parts.push({geo:cylinder(.032,.023,.009,-.683),color:[.98,.49,.32]});
 parts.push({geo:cylinder(.004,.0018,.050,-.715),color:[.60,.68,.74]});
 const positions=[],normals=[],colors=[],indices=[];
 for(const {geo,color} of parts){const offset=positions.length/3;positions.push(...geo.attributes.position.array);normals.push(...geo.attributes.normal.array);for(let k=0;k<geo.attributes.position.count;k++)colors.push(...color);indices.push(...geo.index.array.map(i=>i+offset));geo.dispose();}
 const material=doc.createMaterial('Anodized pole / charcoal grip / coral basket').setRoughnessFactor(.38).setMetallicFactor(.32);
 return doc.createMesh('AlpinePole').addPrimitive(doc.createPrimitive().setMaterial(material)
  .setAttribute('POSITION',accessor('Pole positions','VEC3',new Float32Array(positions)))
  .setAttribute('NORMAL',accessor('Pole normals','VEC3',new Float32Array(normals)))
  .setAttribute('COLOR_0',accessor('Pole linear palette','VEC3',new Float32Array(colors)))
  .setIndices(accessor('Pole triangles','SCALAR',new Uint16Array(indices))));
}
const poleMesh=poleGeometry(),poles={},grips={};
const polePositions=poleMesh.listPrimitives()[0].getAttribute('POSITION').getArray();
for(const [side,sign] of [['Left',1],['Right',-1]]){
 const name=side+'Hand',world=bindWorld[name],wrist=new THREE.Vector3().setFromMatrixPosition(world);
 grips[side]=new THREE.Vector3(wrist.x+sign*.048,wrist.y-.004,wrist.z-.015).applyMatrix4(world.clone().invert());
 poles[side]=doc.createNode(side+'Pole').setMesh(poleMesh).setTranslation(grips[side].toArray());
 byName[name].addChild(poles[side]);
}
const clips=[
 {name:'glide',label:'גלישה',clip:base.states.glide,source:'../motion/alpine.json',state:'glide',loop:true},
 {name:'crouch',label:'כריעה',clip:extra.states.tuck,source:'../motion2/alpine/alpine.json',state:'tuck',loop:true},
 {name:'boost',label:'בוסט',clip:base.states.pole_push,source:'../motion/alpine.json',state:'pole_push',loop:true},
 {name:'fall',label:'נפילה',clip:extra.states.fall_forward,source:'../motion2/alpine/alpine.json',state:'fall_forward',loop:false},
 {name:'get_up',label:'קימה',clip:extra.states.recover_forward,source:'../motion2/alpine/alpine.json',state:'recover_forward',loop:false},
];
const clipManifest=[];
for(const def of clips){
 const duration=def.clip.durationSeconds;
 // Preserve every authored key and add a 60Hz presentation bake, including ends.
 const normalizedTimes=[...new Set([0,1,...def.clip.keyframes.map(k=>k.time),...Array.from({length:Math.ceil(duration*60)+1},(_,i)=>Math.min(1,i/(duration*60)))])].sort((a,b)=>a-b);
 const times=normalizedTimes.map(t=>t*duration);
 const values=Object.fromEntries([...newNames,'LeftPole','RightPole'].map(n=>[n,{translation:[],rotation:[]}]));
 let minY=Infinity,maxSupportError=0,maxGripCorrection=0;
 for(const t of times){
  const pose=sample(def.clip,t,false);const result=retarget.apply(pose,{referenceRoot:[0,0,0],contacts:pose.contacts,floor:true});
  minY=Math.min(minY,result.minY);maxSupportError=Math.max(maxSupportError,result.maxSupportErrorMeters);
  for(const b of canonical){const w=bones[b.name].matrixWorld;const m=b.parent?bones[b.parent].matrixWorld.clone().invert().multiply(w):w.clone();const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();m.decompose(p,q,s);values[b.name].translation.push(...p.toArray());values[b.name].rotation.push(...q.normalize().toArray());}
  for(const [side,sign] of [['Left',1],['Right',-1]]){
   const hand=bones[side+'Hand'],grip=grips[side].clone().applyMatrix4(hand.matrixWorld);
   // Keep the basket and tip above the snow by canting the free pole backward.
   // This is presentation equipment, never an extra skeletal joint or physics.
   const downward=Math.max(0,Math.min(.91,(grip.y-.026)/.742));
   const lateral=sign*.13,backward=-Math.sqrt(Math.max(0,1-downward*downward-lateral*lateral));
   const qWorld=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),new THREE.Vector3(lateral,-downward,backward).normalize());
   const qLocal=hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qWorld).normalize();
   // A palm resting on the snow can put the grip rim below the surface even
   // when the shaft and tip clear it. Keep the whole pole above the floor with
   // a millimetre margin; the <=6mm displacement stays inside the glove palm.
   let lowest=Infinity;const vertex=new THREE.Vector3();
   for(let i=0;i<polePositions.length;i+=3){vertex.fromArray(polePositions,i).applyQuaternion(qWorld).add(grip);lowest=Math.min(lowest,vertex.y);}
   const correction=Math.max(0,.001-lowest);maxGripCorrection=Math.max(maxGripCorrection,correction);
   const localGrip=hand.worldToLocal(grip.clone().add(new THREE.Vector3(0,correction,0)));
   values[side+'Pole'].translation.push(...localGrip.toArray());values[side+'Pole'].rotation.push(...qLocal.toArray());
  }
 }
 const animation=doc.createAnimation(def.name).setExtras({loop:def.loop,label:def.label,sourceState:def.state,rootMotion:false});
 const input=accessor(def.name+' time','SCALAR',new Float32Array(times));
 for(const [name,channels] of Object.entries(values))for(const [targetPath,data] of Object.entries(channels)){
  // Keep quaternion tracks in one hemisphere for interpolators using component lerp.
  if(targetPath==='rotation')for(let i=4;i<data.length;i+=4)if(data[i]*data[i-4]+data[i+1]*data[i-3]+data[i+2]*data[i-2]+data[i+3]*data[i-1]<0)for(let k=0;k<4;k++)data[i+k]*=-1;
  const output=accessor(def.name+' '+name+' '+targetPath,targetPath==='rotation'?'VEC4':'VEC3',new Float32Array(data));
  const sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(byName[name]??poles[name.replace('Pole','')]).setTargetPath(targetPath).setSampler(sampler));
 }
 clipManifest.push({name:def.name,label:def.label,durationSeconds:duration,loop:def.loop,samples:times.length,source:{file:def.source,state:def.state},bake:{hz:60,interpolation:'LINEAR',sourceInterpolation:'smoothstep + shortest arc slerp',minimumCharacterY:minY,maxSupportErrorMeters:maxSupportError,maxPoleGripCorrectionMeters:maxGripCorrection}});
 console.log(`${def.name}: ${times.length} samples; minY=${minY.toFixed(6)}`);
}
// Give an unanimated GLB a coherent upright bind; restore arm transforms already collapsed.
for(const b of canonical)byName[b.name].setTranslation(collapsedBind[b.name].translation).setRotation(collapsedBind[b.name].rotation).setScale(collapsedBind[b.name].scale);
for(const side of ['Left','Right']){
 // Pole bind orientation horizontal, avoiding shafts extending below the ground.
 const hWorldQ=new THREE.Quaternion().setFromRotationMatrix(bindWorld[side+'Hand']);
 const qWorld=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,-1));
 poles[side].setRotation(hWorldQ.invert().multiply(qWorld).normalize().toArray());
}
doc.getRoot().getAsset().generator='Island skier3 / canonical18 calibrated 60Hz bake';
doc.getRoot().getAsset().copyright='CC0-1.0 original athlete, equipment and motion; see LICENSES.md';
let extension=g.listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression');
if(!extension)extension=doc.createExtension(KHRDracoMeshCompression);
extension.setRequired(true).setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,encodeSpeed:5,decodeSpeed:5,quantizationBits:{POSITION:16,NORMAL:12,COLOR:14,GENERIC:20}});
await io.write(path.resolve(root,'skier.glb'),doc);
const {createHash}=await import('node:crypto');const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=await fs.readFile(path.resolve(root,'skier.glb'));
if(bytes.length>1500000)throw Error('GLB exceeds 1.5 MB budget');
const decoded=await io.readBinary(bytes);let triangles=0,vertices=0;
for(const node of decoded.getRoot().listNodes())if(node.getMesh())for(const p of node.getMesh().listPrimitives()){vertices+=p.getAttribute('POSITION').getCount();triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;}
const boundsBox=new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
const manifest={schemaVersion:1,kind:'alpine-skier-design',license:'CC0-1.0',file:'skier.glb',rig:'rig.json',bytes:bytes.length,sha256:sha(bytes),vertices,triangles,bounds:{min:boundsBox.min.toArray(),max:boundsBox.max.toArray()},units:'metres',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},compression:'KHR_draco_mesh_compression',maxTextureDimension:0,clips:clipManifest,
 assets:[{id:'skier',file:'skier.glb',category:'character',bytes:bytes.length,sha256:sha(bytes),vertices,triangles,animations:clipManifest}],
 sources:await Promise.all(['../characters2/skier.glb','../characters/rig.json','../viewer/retarget-map.json','../viewer/retarget.js','../viewer/animation.js','../motion/alpine.json','../motion2/alpine/alpine.json'].map(async file=>({file,sha256:sha(await fs.readFile(path.resolve(root,file)))})))};
const rig={schemaVersion:1,name:'Motion2Canonical18',units:'metres',up:'+Y',forward:'+Z',bindPose:'T-pose calibrated to the original detailed athlete',boneCount:18,canonicalSource:'../motion2/alpine.json skeleton.bones',joints:canonical.map((b,i)=>({name:b.name,parent:b.parent,...collapsedBind[b.name],inverseBindMatrix:inverse.slice(i*16,i*16+16)})),
 retarget:{mode:'world-basis-retarget with preserved athlete segment lengths',sourceRig:'../characters/rig.json',sourceMap:'../viewer/retarget-map.json',motionScale:map.motionScale,canonicalRestBones:canonical,basis:map.bones.filter(b=>newNames.includes(b.target)).map(b=>({name:b.target,source:b.source,basisWorldQuaternion:b.targetBasisWorldQuaternion})),removedHelpers:['LeftShoulder','RightShoulder'],collapse:'Arm local = inverse(animated Chest world) * animated Arm world; shoulder weights map to Chest because both helpers inherit Chest rigidly. All retained inverse binds stay unchanged.'},
 equipment:{jointCount:0,nodes:['LeftPole','RightPole'],attachment:'Palm offsets parented to LeftHand/RightHand; baked local orientations keep pole tips clear. A small palm offset during snow contact keeps the full grip rim clear as well.',clearanceMarginMeters:.001,maxPalmCorrectionMeters:Math.max(...clipManifest.map(c=>c.bake.maxPoleGripCorrectionMeters))}};
await fs.writeFile(path.resolve(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.resolve(root,'rig.json'),JSON.stringify(rig,null,2)+'\n');
console.log(`skier.glb: ${bytes.length} bytes; ${triangles} triangles, ${vertices} drawn vertices; exact canonical 18 joints`);
