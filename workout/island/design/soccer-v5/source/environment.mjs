// The proven original stadium shell is reused; new spectators, pennants,
// embedded turf and evening luminaires are additive assets for design review.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../../vendor/three.module.js';
import {Retargeter} from '../../viewer/retarget.js';
import {sample} from '../../viewer/animation.js';
import {root,io,json,writeJSON,Document,accessor,save,weld,simplify,prune,MeshoptSimplifier,KHRLightsPunctual,sha} from './common.mjs';

const manifest=await json('manifest.json');
manifest.assets=manifest.assets.filter(a=>a.category==='character');
const stadium=await io.read(path.resolve(root,'../models2/soccer-stadium.glb'));
// The distant chair mesh is replaced by the lightweight illustrated audience.
for(const n of stadium.getRoot().listNodes())if(n.getName()==='upper_seats')n.dispose();
const grass=stadium.createTexture('Original full-field mowing / 1024px').setImage(await fs.readFile(path.resolve(root,'textures/turf.jpg'))).setMimeType('image/jpeg');
for(const node of stadium.getRoot().listNodes())if(node.getMesh()){
  const name=node.getName();
  for(const p of node.getMesh().listPrimitives()){
    const colors=p.getAttribute('COLOR_0');
    if(name==='pitch_surface'){
      const pos=p.getAttribute('POSITION'),uv=[];
      for(let i=0;i<pos.getCount();i++){const v=pos.getElement(i,[]);uv.push((v[0]+34)/68,(v[2]+52.5)/105);}
      p.setAttribute('TEXCOORD_0',accessor(stadium,'Full field UV','VEC2',new Float32Array(uv)));
      p.setAttribute('COLOR_0',null);
      p.setMaterial(stadium.createMaterial('Non-tiled striped turf').setBaseColorTexture(grass).setRoughnessFactor(1));
    }else if(['roof','stand_shell','upper_stands','beams','seating'].includes(name)&&colors){
      for(let i=0;i<colors.getCount();i++){
        const v=colors.getElement(i,[]),l=(v[0]+v[1]+v[2])/3;
        let color;
        if(name==='roof')color=new THREE.Color('#233D56');
        else if(name==='beams')color=new THREE.Color('#14273F');
        else if(name==='seating')color=new THREE.Color(i%13<7?'#277F83':'#A76259');
        else color=new THREE.Color(l>.45?'#526D7A':'#273E54');
        colors.setElement(i,[color.r,color.g,color.b]);
      }
    }else if(name==='floodlights'){
      p.setMaterial(stadium.createMaterial('Warm evening light panels').setRoughnessFactor(.6).setEmissiveFactor([.8,.69,.48]));
    }
  }
}
const lightExtension=stadium.createExtension(KHRLightsPunctual);
for(const [x,z] of [[-41,-59],[41,-59],[-41,59],[41,59]]){
  const light=lightExtension.createLight('Evening floodlight').setType('spot').setColor([1,.86,.68]).setIntensity(6000).setRange(155).setInnerConeAngle(.26).setOuterConeAngle(.92);
  const direction=new THREE.Vector3(-x,-16,-z).normalize();
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),direction).toArray();
  stadium.getRoot().listScenes()[0].addChild(stadium.createNode('Floodlight '+x+' '+z).setTranslation([x,16,z]).setRotation(rotation).setExtension('KHR_lights_punctual',light));
}
await stadium.transform(prune());
manifest.assets.push(await save(stadium,'models/stadium-evening.glb',{id:'stadium',category:'environment',fieldMeters:[68,105],textureMaxDimension:1024,punctualLights:4}));

// Pose the existing CC0 Kenney-derived crowd actor, then flatten and simplify it.
// Four gestures and deterministic skin/kit/hair palettes are baked into a single
// draw call. Spectators are ordinary geometry, with no 224 skeletons to animate.
const sourceRig=await json('../characters/rig.json'),map=await json('../viewer/retarget-map.json');
const motion=await json('../motion/soccer.json'),regions=(await json('../variants/regions.json')).models['soccer-player'].sources;
const crowdSource=await io.read(path.resolve(root,'../characters/soccer-player.glb'));
const sourcePrimitive=crowdSource.getRoot().listMeshes()[0].listPrimitives()[0];
const sourcePos=sourcePrimitive.getAttribute('POSITION'),sourceColor=sourcePrimitive.getAttribute('COLOR_0');
const geometry=new THREE.BufferGeometry();
for(const [semantic,key] of [['POSITION','position'],['JOINTS_0','skinIndex'],['WEIGHTS_0','skinWeight']]){
  const a=sourcePrimitive.getAttribute(semantic);geometry.setAttribute(key,new THREE.BufferAttribute(a.getArray().slice(),a.getElementSize(),a.getNormalized()));
}
const scene=new THREE.Group(),bones={};
for(const j of sourceRig.joints){const b=new THREE.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else scene.add(b);}
const skinned=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());scene.add(skinned);scene.updateMatrixWorld(true);
skinned.bind(new THREE.Skeleton(sourceRig.joints.map(j=>bones[j.name]),sourceRig.joints.map(j=>new THREE.Matrix4().fromArray(j.inverseBindMatrix))),new THREE.Matrix4());
const adapter=new Retargeter(scene,sourceRig,motion.skeleton,map),prototypes=[];
for(let gesture=0;gesture<4;gesture++){
  const pose=sample(motion.states.idle,0,false);
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const raised=gesture===1||gesture===3&&side==='Left'||gesture===2&&side==='Right';
    if(raised){
      pose.rotations[side+'Arm']=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.2,0,sign*2.48)).toArray();
      pose.rotations[side+'ForeArm']=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.7).toArray();
    }
  }
  adapter.apply(pose,{referenceRoot:[0,0,0],floor:true});
  const doc=new Document();doc.createBuffer();const points=[];
  for(let v=0;v<sourcePos.getCount();v++)points.push(...skinned.getVertexPosition(v,new THREE.Vector3()).toArray());
  const p=doc.createPrimitive()
    .setAttribute('POSITION',accessor(doc,'Posed spectator','VEC3',new Float32Array(points)))
    .setAttribute('COLOR_0',accessor(doc,'Source palette','VEC3',sourceColor.getArray().slice()))
    .setIndices(accessor(doc,'Spectator triangles','SCALAR',sourcePrimitive.getIndices().getArray().slice()));
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(p)));
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.24,error:.006}));
  prototypes.push(p);
}
const positions=[],colors=[],indices=[];
const skins=['#714336','#9F6948','#C58C61','#E0AD85','#B47C58','#825743'];
const shirts=['#35B7A9','#EF8068','#E5C25C','#D1DAE0','#6869A0','#3D89B1'];
const hairs=['#25232D','#3A2B2A','#8A5435','#C3A16A'];
const placements=[];
for(const side of [-1,1])for(let row=0;row<4;row++){
  for(let col=0;col<14;col++)placements.push({x:(col-6.5)*3.5,z:side*(55.4+row*1.35),y:row*1.16+1.42,yaw:side===-1?0:Math.PI});
  for(let col=0;col<14;col++)placements.push({x:side*(36.4+row*1.35),z:(col-6.5)*6.4,y:row*1.16+1.42,yaw:side===-1?Math.PI/2:-Math.PI/2});
}
for(let index=0;index<placements.length;index++){
  const at=placements[index],p=prototypes[index%4],pos=p.getAttribute('POSITION'),col=p.getAttribute('COLOR_0'),offset=positions.length/3;
  const scale=1.10+(index*17%9)*.035,rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),at.yaw);
  for(let v=0;v<pos.getCount();v++){
    const point=new THREE.Vector3().fromArray(pos.getElement(v,[])),original=point.clone();
    positions.push(...point.multiplyScalar(scale).applyQuaternion(rotation).add(new THREE.Vector3(at.x,at.y,at.z)).toArray());
    const rgb=col.getElement(v,[]);
    const source=regions.find(s=>s.linearRGB.every((a,k)=>Math.abs(a-rgb[k])<.002));
    const rule=source?.rules.find(r=>(r.yMax===undefined||original.y<=r.yMax)&&(r.yMin===undefined||original.y>=r.yMin));
    const region=rule?.region;
    const hex=region==='skin'?skins[index%skins.length]:region==='hair'?hairs[(index*3)%hairs.length]:region==='shirt'?shirts[(index*5)%shirts.length]:null;
    colors.push(...(hex?new THREE.Color(hex).toArray():rgb));
  }
  indices.push(...Array.from(p.getIndices().getArray(),i=>i+offset));
}
const crowdDoc=new Document();crowdDoc.createBuffer();
const cg=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));cg.setIndex(indices);cg.computeVertexNormals();
const cp=crowdDoc.createPrimitive().setMaterial(crowdDoc.createMaterial('Illustrated diverse spectators').setRoughnessFactor(1))
  .setAttribute('POSITION',accessor(crowdDoc,'Crowd positions','VEC3',new Float32Array(positions)))
  .setAttribute('NORMAL',accessor(crowdDoc,'Crowd normals','VEC3',cg.attributes.normal.array))
  .setAttribute('COLOR_0',accessor(crowdDoc,'Diverse skin and clothing','VEC3',new Float32Array(colors)))
  .setIndices(accessor(crowdDoc,'Crowd triangles','SCALAR',new Uint32Array(indices)));
crowdDoc.createScene('224 original spectators / four gestures').addChild(crowdDoc.createNode('Crowd').setMesh(crowdDoc.createMesh('Crowd / single draw').addPrimitive(cp)));
manifest.assets.push(await save(crowdDoc,'models/crowd.glb',{id:'crowd',category:'environment',spectators:placements.length,gestures:4,skinTones:skins.length,clothingColors:shirts.length}));

const flags=new Document();flags.createBuffer();const flagScene=flags.createScene('Unbranded supporter pennants'),flagNodes=[];
function primitiveFromGeometry(doc,geo,name,color){
  const c=new THREE.Color(color);
  return doc.createPrimitive().setMaterial(doc.createMaterial(name).setBaseColorFactor([...c.toArray(),1]).setRoughnessFactor(.9).setDoubleSided(true))
    .setAttribute('POSITION',accessor(doc,name+' surface','VEC3',geo.attributes.position.array.slice()))
    .setAttribute('NORMAL',accessor(doc,name+' normals','VEC3',geo.attributes.normal.array.slice()))
    .setIndices(accessor(doc,name+' triangles','SCALAR',geo.index.array.slice()));
}
for(const [i,x] of [-27,-12,12,27].entries())for(const sign of [-1,1]){
  const pole=new THREE.CylinderGeometry(.045,.055,3.7,8);pole.translate(0,1.85,0);
  const holder=flags.createNode('Flagpole '+i+' '+sign).setMesh(flags.createMesh().addPrimitive(primitiveFromGeometry(flags,pole,'Ivory pole','#E5DBC4'))).setTranslation([x,4,sign*59.7]);
  const cloth=new THREE.PlaneGeometry(2.3,1.3,10,4);cloth.translate(1.15,3.02,0);
  const a=cloth.attributes.position;
  for(let k=0;k<a.count;k++)a.setZ(k,.17*Math.sin(a.getX(k)*3.2+a.getY(k)*2)*(a.getX(k)/2.3));
  cloth.computeVertexNormals();
  const pennant=flags.createNode('Pennant '+i+' '+sign).setMesh(flags.createMesh().addPrimitive(primitiveFromGeometry(flags,cloth,'Plain team flag',i%2?'#F17963':'#2FC1B0')));
  holder.addChild(pennant);flagScene.addChild(holder);flagNodes.push(pennant);
}
const animation=flags.createAnimation('flag_wave').setExtras({loop:true,durationSeconds:2.4});
const input=accessor(flags,'Breeze seconds','SCALAR',new Float32Array([0,.6,1.2,1.8,2.4]));
for(const [i,n] of flagNodes.entries()){
  const angles=[0,.13,0,-.13,0].map(a=>a*(i%2?-1:1));
  const output=accessor(flags,'Breeze rotation','VEC4',new Float32Array(angles.flatMap(a=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),a).toArray())));
  const sampler=flags.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  animation.addSampler(sampler).addChannel(flags.createAnimationChannel().setTargetNode(n).setTargetPath('rotation').setSampler(sampler));
}
manifest.assets.push(await save(flags,'models/flags.glb',{id:'flags',category:'environment',flags:8,clips:[{name:'flag_wave',loop:true,durationSeconds:2.4}]}));
const ball=await io.read(path.resolve(root,'../models/soccer-ball.glb'));
manifest.assets.push(await save(ball,'models/ball.glb',{id:'ball',category:'equipment',diameterMeters:.22}));
const environmentSources=['source/environment.mjs','source/turf.py','textures/turf.jpg','../models2/soccer-stadium.glb','../models/soccer-ball.glb','../characters/soccer-player.glb','../variants/regions.json'];
manifest.sources=manifest.sources.filter(s=>!environmentSources.includes(s.file));
for(const file of environmentSources)
  manifest.sources.push({file,sha256:sha(await fs.readFile(path.resolve(root,file)))});
await writeJSON('manifest.json',manifest);
