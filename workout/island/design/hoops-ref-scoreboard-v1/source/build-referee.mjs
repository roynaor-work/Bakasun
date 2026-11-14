/**
 * Low-budget canonical18 referee, derived from the repository's MakeHuman
 * official. Build tools are intentionally outside the checkout:
 * npm install --prefix /tmp/hoops-ref-tools --cache /tmp/hoops-ref-npm-cache
 *   @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1
 *   @gltf-transform/functions@4.2.1 meshoptimizer@0.25.0
 *   draco3dgltf@1.5.7 sharp@0.34.3 three@0.160.1
 * node source/build-referee.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire('/tmp/hoops-ref-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {dequantize,weld,prune,dedup,join,simplifyPrimitive,compactPrimitive}=require('@gltf-transform/functions');
const {MeshoptDecoder,MeshoptSimplifier}=require('meshoptimizer');
const draco=require('draco3dgltf');
const sharp=require('sharp');
const THREE=require('three');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../../..');
const sourceRel='workout/island/design/hoops-v7/characters/models/referee-lod1.glb';
const source=path.join(repo,sourceRel);
const skeleton=JSON.parse(await fs.readFile(path.join(repo,'workout/island/design/naval-v7/assets/crew/canonical-skeleton.json'),'utf8'));
await Promise.all([MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder':await draco.createDecoderModule(),
  'meshopt.decoder':MeshoptDecoder,
});
const doc=await io.read(source),r=doc.getRoot(),skin=r.listSkins()[0],joints=skin.listJoints();
if(joints.length!==18||joints.some((j,i)=>j.getName()!==skeleton.bones[i].name))throw new Error('Unexpected source joint order');
const V=a=>new THREE.Vector3(...a),world={},target={};
// Allocate the small budget by visible anatomy. A global decimator spends too
// much on hidden torso and shoes and can erase one complete eye.
for(const mesh of r.listMeshes())for(const p of [...mesh.listPrimitives()]){
  const material=p.getMaterial().getName();
  if(material==='official_uniform'){mesh.removePrimitive(p);for(const t of p.listTargets())t.dispose();p.dispose();continue;}
  if(material!=='human_surface')continue;
  const groups=new Map(),positions=p.getAttribute('POSITION'),indices=p.getIndices().getArray(),js=p.getAttribute('JOINTS_0'),ws=p.getAttribute('WEIGHTS_0');
  for(let i=0;i<indices.length;i+=3){
    const ids=Array.from(indices.slice(i,i+3)),jointTotals={};let y=0,maxX=0;
    for(const id of ids){const point=positions.getElement(id,[]);y+=point[1]/3;maxX=Math.max(maxX,Math.abs(point[0]));const j=js.getElement(id,[]),w=ws.getElement(id,[]);for(let k=0;k<4;k++)jointTotals[j[k]]=(jointTotals[j[k]]||0)+w[k]/3;}
    const dominant=+Object.entries(jointTotals).sort((a,b)=>b[1]-a[1])[0][0];
    const region=(y>1.63||y>1.565&&maxX<.10)?'human_face':[14,17].includes(dominant)?'human_shoes':[8,11].includes(dominant)?'human_hand_'+dominant:[7,10].includes(dominant)?'human_forearm_'+dominant:[6,9].includes(dominant)?'human_upper_'+dominant:null;
    if(region){if(!groups.has(region))groups.set(region,[]);groups.get(region).push(...ids);}
  }
  for(const [region,ids]of groups){
    const q=doc.createPrimitive().setMaterial(p.getMaterial().clone().setName(region));
    for(const semantic of p.listSemantics())q.setAttribute(semantic,p.getAttribute(semantic));
    q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(ids)).setBuffer(r.listBuffers()[0]));
    compactPrimitive(q);mesh.addPrimitive(q);
  }
  mesh.removePrimitive(p);for(const t of p.listTargets())t.dispose();p.dispose();
}
for(const j of joints)world[j.getName()]=V(j.getWorldTranslation());
for(const b of skeleton.bones)target[b.name]=V(b.restTranslationMeters).add(b.parent?target[b.parent]:new THREE.Vector3());
const child={Root:'Hips',Hips:'Spine',Spine:'Chest',Chest:'Neck',Neck:'Head',LeftArm:'LeftForeArm',LeftForeArm:'LeftHand',RightArm:'RightForeArm',RightForeArm:'RightHand',LeftUpLeg:'LeftLeg',LeftLeg:'LeftFoot',RightUpLeg:'RightLeg',RightLeg:'RightFoot'};
const rotations={},scales={};
for(const j of joints){
  const name=j.getName(),c=child[name];
  let sourceAxis,targetAxis;
  if(/Hand$/.test(name)){const p=name.replace('Hand','ForeArm');sourceAxis=world[name].clone().sub(world[p]);targetAxis=new THREE.Vector3(0,-1,0);}
  else if(/Foot$/.test(name)){const p=name.replace('Foot','Leg');sourceAxis=world[name].clone().sub(world[p]);targetAxis=new THREE.Vector3(0,-1,0);}
  else if(c&&/Arm|Leg/.test(name)){sourceAxis=world[c].clone().sub(world[name]);targetAxis=target[c].clone().sub(target[name]);}
  if(sourceAxis){rotations[name]=new THREE.Quaternion().setFromUnitVectors(sourceAxis.clone().normalize(),targetAxis.clone().normalize());scales[name]=c&&/Arm|Leg/.test(name)?targetAxis.length()/sourceAxis.length():.84;}
  else{rotations[name]=new THREE.Quaternion();scales[name]=name==='Head'?.88:.84;}
}
for(const a of [...r.listAnimations()]){const samplers=new Set();for(const c of a.listChannels()){samplers.add(c.getSampler());c.dispose();}for(const s of samplers)s.dispose();a.dispose();}
for(const mesh of r.listMeshes()){
  mesh.setWeights([]);
  for(const p of mesh.listPrimitives()){
    for(const t of [...p.listTargets()]){p.removeTarget(t);t.dispose();}
    // Normal-map tangent streams are not useful at this budget and lock seams.
    p.setAttribute('TANGENT',null);
    const positions=p.getAttribute('POSITION'),normals=p.getAttribute('NORMAL'),weights=p.getAttribute('WEIGHTS_0'),indices=p.getAttribute('JOINTS_0');
    const newPos=new Float32Array(positions.getCount()*3),newNormals=new Float32Array(normals.getCount()*3);
    for(let i=0;i<positions.getCount();i++){
      const sourcePoint=V(positions.getElement(i,[])),sourceNormal=V(normals.getElement(i,[])),jointIndices=indices.getElement(i,[]),jointWeights=weights.getElement(i,[]);
      const out=new THREE.Vector3(),normal=new THREE.Vector3();let sum=0;
      for(let k=0;k<4;k++){
        const w=jointWeights[k];if(w<1e-8)continue;sum+=w;
        const name=p.getMaterial().getName()==='human_face'?'Head':joints[jointIndices[k]].getName();
        out.addScaledVector(sourcePoint.clone().sub(world[name]).applyQuaternion(rotations[name]).multiplyScalar(scales[name]).add(target[name]),w);
        normal.addScaledVector(sourceNormal.clone().applyQuaternion(rotations[name]),w);
      }
      out.multiplyScalar(1/(sum||1));normal.normalize();
      newPos.set(out.toArray(),i*3);newNormals.set(normal.toArray(),i*3);
    }
    positions.setArray(newPos).setNormalized(false);normals.setArray(newNormals).setNormalized(false);
    if(p.getMaterial().getName()==='human_face'){
      const j=new Uint16Array(positions.getCount()*4),w=new Float32Array(positions.getCount()*4);for(let i=0;i<positions.getCount();i++){j[i*4]=5;w[i*4]=1;}
      indices.setArray(j).setNormalized(false);weights.setArray(w).setNormalized(false);
    }
    if(p.getMaterial().getName()==='official_trousers')for(let i=0;i<positions.getCount();i++){const v=positions.getElement(i,[]);v[0]*=.85;positions.setElement(i,v);}
    if(p.getMaterial().getName()==='human_shoes'){
      // Skin soles rigidly to Foot. Blended shin weights can push actual toe
      // vertices below floor despite correct ankle/sole QA proxies.
      const mins={left:Infinity,right:Infinity};for(let i=0;i<positions.getCount();i++){const v=positions.getElement(i,[]),side=v[0]>=0?'left':'right';mins[side]=Math.min(mins[side],v[1]);}
      const j=new Uint16Array(positions.getCount()*4),w=new Float32Array(positions.getCount()*4);
      for(let i=0;i<positions.getCount();i++){const v=positions.getElement(i,[]),side=v[0]>=0?'left':'right';v[1]+=.0035-mins[side];positions.setElement(i,v);j[i*4]=side==='left'?14:17;w[i*4]=1;}
      indices.setArray(j).setNormalized(false);weights.setArray(w).setNormalized(false);
      p.getMaterial().setBaseColorTexture(null).setBaseColorFactor([.025,.029,.035,1]).setRoughnessFactor(.82);
    }
  }
}
for(let i=0;i<joints.length;i++)joints[i].setTranslation(skeleton.bones[i].restTranslationMeters).setRotation([0,0,0,1]).setScale([1,1,1]);
const ibm=new Float32Array(18*16);
for(let i=0;i<18;i++)new THREE.Matrix4().makeTranslation(...target[joints[i].getName()].toArray().map(v=>-v)).toArray(ibm,i*16);
skin.getInverseBindMatrices().setArray(ibm);
for(const n of r.listNodes())n.setWeights([]);
for(const mat of r.listMaterials())mat.setNormalTexture(null);
// A single embedded, standard PNG atlas; no Draco, WebP or meshopt runtime.
for(const texture of r.listTextures()){
  if(!texture.getImage())continue;
  const png=await sharp(texture.getImage()).resize(512,512).png({compressionLevel:9}).toBuffer();
  texture.setImage(png).setMimeType('image/png').setURI('referee-atlas.png');
}
for(const ext of [...r.listExtensionsUsed()])ext.dispose();
await doc.transform(dequantize(),weld({overwrite:true}));
const budgets={human_face:300,human_shoes:70,human_hand_8:50,human_hand_11:50,human_forearm_7:30,human_forearm_10:30,human_upper_6:25,human_upper_9:25,official_trousers:150,hair:50,eyes:64,compression:24};
const counts=[];
for(const mesh of r.listMeshes())for(const p of mesh.listPrimitives()){
  const name=p.getMaterial().getName(),before=p.getIndices().getCount()/3;
  simplifyPrimitive(p,{simplifier:MeshoptSimplifier,ratio:Math.min(1,(budgets[name]||24)/before),error:1,lockBorder:/human_(hand|upper|forearm|shoes)/.test(name)});
  if(name==='human_shoes'){
    const a=p.getAttribute('POSITION'),mins={left:Infinity,right:Infinity};for(let i=0;i<a.getCount();i++){const v=a.getElement(i,[]),side=v[0]>=0?'left':'right';mins[side]=Math.min(mins[side],v[1]);}
    for(let i=0;i<a.getCount();i++){const v=a.getElement(i,[]),side=v[0]>=0?'left':'right';v[1]+=.0035-mins[side];a.setElement(i,v);}
  }
  counts.push({material:name,sourceTriangles:before,triangles:p.getIndices().getCount()/3});
}
const buffer=r.listBuffers()[0];
function primitive(name,positions,indices,normalData,joint){
  const material=doc.createMaterial(name).setBaseColorFactor(name==='whistle_mouthpiece'?[.014,.018,.023,1]:[.66,.71,.74,1]).setMetallicFactor(name==='whistle_mouthpiece'?.1:.8).setRoughnessFactor(name==='whistle_mouthpiece'?.45:.28);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
  const count=positions.length/3,j=new Uint16Array(count*4),w=new Float32Array(count*4);for(let i=0;i<count;i++){j[i*4]=joint;w[i*4]=1;}
  const p=doc.createPrimitive().setMaterial(material);
  for(const [semantic,array,type]of [['POSITION',new Float32Array(positions),'VEC3'],['NORMAL',g.attributes.normal.array,'VEC3'],['JOINTS_0',j,'VEC4'],['WEIGHTS_0',w,'VEC4']])p.setAttribute(semantic,doc.createAccessor().setType(type).setArray(array).setBuffer(buffer));
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer));
  return p;
}
const actor=r.listMeshes()[0],right=target.RightHand;
// Fitted striped garments are original clothing over the reused anatomy. This
// small coherent surface avoids cracks between old A-pose garment patches.
const uniform=r.listMaterials().find(m=>m.getName()==='official_uniform')||doc.createMaterial('official_uniform');
const garmentData={positions:[],uv:[],joints:[],weights:[],indices:[]};
function garmentRing(center,rx,rz,bone,blend=0){
  const offset=garmentData.positions.length/3;
  for(let i=0;i<=12;i++){
    const a=i/12*Math.PI*2,p=[center[0]+Math.cos(a)*rx,center[1],center[2]+Math.sin(a)*rz];
    garmentData.positions.push(...p);garmentData.uv.push(.004+i/12*.492,.755+(1-(center[1]-.97)/.43)*.24);
    garmentData.joints.push(bone,blend?3:0,0,0);garmentData.weights.push(1-blend,blend,0,0);
    if(offset&&i){const j=offset+i;garmentData.indices.push(j-14,j-1,j-13,j-13,j-1,j);}
  }
}
garmentRing([0,.97,0],.139,.09,1);
garmentRing([0,1.08,0],.151,.099,2);
garmentRing([0,1.23,0],.182,.099,3);
garmentRing([0,1.37,0],.204,.081,3);
garmentRing([0,1.42,0],.064,.056,4,.25);
function makeGarment(data){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);g.computeVertexNormals();
  const p=doc.createPrimitive().setMaterial(uniform);
  for(const [semantic,array,type]of [['POSITION',new Float32Array(data.positions),'VEC3'],['NORMAL',g.attributes.normal.array,'VEC3'],['TEXCOORD_0',new Float32Array(data.uv),'VEC2'],['JOINTS_0',new Uint16Array(data.joints),'VEC4'],['WEIGHTS_0',new Float32Array(data.weights),'VEC4']])p.setAttribute(semantic,doc.createAccessor().setType(type).setArray(array).setBuffer(buffer));
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(data.indices)).setBuffer(buffer));actor.addPrimitive(p);
}
makeGarment(garmentData);
for(const [side,bone]of [[1,6],[-1,9]]){
  const d={positions:[],uv:[],joints:[],weights:[],indices:[]};
  for(let ring=0;ring<3;ring++)for(let i=0;i<=8;i++){
    const a=i/8*Math.PI*2,y=1.38-ring*.125,rad=ring===0?.071:ring===1?.069:.059;
    d.positions.push(side*.17+Math.cos(a)*rad,y,Math.sin(a)*rad);d.uv.push(.006+i/8*.485,.77+ring*.095);d.joints.push(bone,0,0,0);d.weights.push(1,0,0,0);
    if(ring&&i){const j=ring*9+i;d.indices.push(j-10,j-9,j-1,j-9,j,j-1);}
  }
  makeGarment(d);
}
function addBox(name,center,scale,joint=11){const g=new THREE.BoxGeometry(...scale);g.translate(...center);actor.addPrimitive(primitive(name,Array.from(g.attributes.position.array),Array.from(g.index.array),null,joint));}
addBox('whistle_body',right.clone().add(new THREE.Vector3(0,-.025,.035)).toArray(),[.029,.024,.035]);
addBox('whistle_mouthpiece',right.clone().add(new THREE.Vector3(0,-.025,.010)).toArray(),[.017,.012,.025]);
for(const [side,joint]of [[1,14],[-1,17]]){
  addBox('shoe_core_'+side,[side*.10,.045,.06],[.10,.083,.22],joint);
  actor.listPrimitives().at(-1).getMaterial().setBaseColorFactor([.025,.029,.035,1]).setMetallicFactor(0).setRoughnessFactor(.82);
}
// Thin neck loop, skinned to Chest: equipment follows upper-body motion.
const collar=new THREE.TorusGeometry(.075,.0027,3,6,Math.PI*2);collar.rotateX(Math.PI/2);collar.scale(.74,1,1);collar.translate(0,1.425,.006);
actor.addPrimitive(primitive('lanyard',Array.from(collar.attributes.position.array),Array.from(collar.index.array),null,3));
actor.listPrimitives().at(-1).getMaterial().setBaseColorFactor([.018,.024,.027,1]).setMetallicFactor(0).setRoughnessFactor(.9);
for(const mesh of r.listMeshes())for(const p of mesh.listPrimitives()){
  const j=p.getAttribute('JOINTS_0'),w=p.getAttribute('WEIGHTS_0');if(!j||!w)continue;
  for(let i=0;i<j.getCount();i++){const a=j.getElement(i,[]),b=w.getElement(i,[]),sum=b.reduce((s,x)=>s+x,0)||1;for(let k=0;k<4;k++){b[k]/=sum;if(b[k]===0)a[k]=0;}j.setElement(i,a);w.setElement(i,b);}
}
await doc.transform(prune(),dedup(),weld({overwrite:true}),join({keepMeshes:true}),prune());
for(const material of r.listMaterials())if(material.getName().startsWith('human_')&&material.getBaseColorTexture())material.setName('human_surface');
r.getAsset().generator='Bakasun hoops-ref-scoreboard-v1; MakeHuman-derived canonical18 referee';
r.getAsset().copyright='See LICENSES.md; source anatomy reused from repository MakeHuman official.';
await fs.mkdir(path.join(root,'models'),{recursive:true});await fs.mkdir(path.join(root,'textures'),{recursive:true});
await io.write(path.join(root,'models/referee-base.glb'),doc);
const atlas=r.listTextures()[0];if(atlas)await fs.writeFile(path.join(root,'textures/referee-atlas.png'),atlas.getImage());
const tris=r.listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),0),allPos=[];
for(const m of r.listMeshes())for(const p of m.listPrimitives()){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++)allPos.push(a.getElement(i,[]));}
const bounds={min:[0,1,2].map(k=>Math.min(...allPos.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...allPos.map(p=>p[k])))};
const metadata={schemaVersion:1,source:{path:sourceRel,sha256:createHash('sha256').update(await fs.readFile(source)).digest('hex'),provenance:'MakeHuman/MPFB repository asset; see source package LICENSES.md and island/ASSETS.md'},method:'Decode existing realistic referee; visible-anatomy regional budget; weight-aware per-limb rebind to canonical rest; meshoptimizer simplification; original fitted striped clothing, whistle, collar loop and opaque shoe cores.',canonicalSkeleton:'workout/island/design/naval-v7/assets/crew/canonical-skeleton.json',boneCount:18,axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},units:'meters',triangles:tris,primitiveCounts:r.listMeshes().flatMap(m=>m.listPrimitives().map(p=>({material:p.getMaterial().getName(),triangles:p.getIndices().getCount()/3}))),simplification:counts,bounds,whistle:{joint:'RightHand',centerOffsetMeters:[0,-.025,.035],mouthpieceOffsetMeters:[0,-.025,.010],handWorldQuaternionAtBlow:[0,0,0,1],lipLandmarkHeadLocalMeters:[-.0023,.0357,.1198]},soleContact:{method:'All shoe vertices rigidly weighted to corresponding Foot; baseline calibrated after simplification.',bindClearanceMeters:.0035,reason:'Allowance for subframe quaternion interpolation below nominal 30Hz sole target.'},textures:{baseColor:'textures/referee-atlas.png',embedded:true,dimensions:[512,512]},runtimeExtensionsRequired:[],limitations:['Collar loop is rigid equipment skinned to Chest; a simulated connecting cord is intentionally omitted.','At approximately 1200 triangles, finger detail derives from simplified source anatomy; gesture readability is primarily arm silhouette.']};
await fs.writeFile(path.join(root,'model-metadata.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({triangles:tris,counts:metadata.primitiveCounts,bounds}));
