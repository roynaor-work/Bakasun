// Build two standard glTF 2.0 skinned drivers. Dependencies are authoring only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createMotionBaker} from './motions.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/racing-podium-tools/package.json');
const T=require('three');
const {Document,NodeIO}=require('@gltf-transform/core');
const {weld,prune,resample}=require('@gltf-transform/functions');
const rig=JSON.parse(await fs.readFile(root+'/rig.json','utf8'));
const canonical=rig.joints.map(j=>j.name);
const old=JSON.parse(await fs.readFile(root+'/../characters/rig.json','utf8')).joints.map(j=>j.name);
const io=new NodeIO();
const records=[];
let metadata;
for(const gender of ['male','female']){
 const raw=JSON.parse(await fs.readFile('/tmp/racing-podium-raw/driver-'+gender+'.json','utf8'));
 const soleY=raw.bounds[0][1]-rig.joints.find(j=>j.name==='LeftFoot').worldPosition[1];
 const {clips}=createMotionBaker(rig,soleY);
 const doc=new Document(),buffer=doc.createBuffer();
 const acc=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
 const material=doc.createMaterial('Racing suit / skin / hair · vertex team colors').setBaseColorFactor([1,1,1,1]).setRoughnessFactor(.78).setMetallicFactor(0);
 const nodes=Object.fromEntries(rig.joints.map(j=>[j.name,doc.createNode(j.name).setTranslation(j.translation)]));
 for(const j of rig.joints)if(j.parent)nodes[j.parent].addChild(nodes[j.name]);
 const skin=doc.createSkin('Canonical18').setSkeleton(nodes.Root);
 const inverse=[];
 for(const j of rig.joints){skin.addJoint(nodes[j.name]);inverse.push(...new T.Matrix4().makeTranslation(...j.worldPosition.map(v=>-v)).toArray());}
 skin.setInverseBindMatrices(acc('Canonical18 inverse bind matrices','MAT4',new Float32Array(inverse)));
 const joints=[],weights=[];
 for(let i=0;i<raw.joints.length;i++){
  const map=new Map();
  for(let k=0;k<4;k++)if(raw.weights[i][k]){
   let n=old[raw.joints[i][k]];if(n.endsWith('Shoulder'))n='Chest';
   const index=canonical.indexOf(n);if(index<0)throw Error('Noncanonical joint '+n);
   map.set(index,(map.get(index)??0)+raw.weights[i][k]);
  }
  const entries=[...map].sort((a,b)=>b[1]-a[1]);while(entries.length<4)entries.push([0,0]);
  const exact=entries.map(v=>v[1]*65535),packed=exact.map(Math.floor);
  const order=[0,1,2,3].sort((a,b)=>(exact[b]-packed[b])-(exact[a]-packed[a]));
  for(let n=65535-packed.reduce((s,v)=>s+v,0),k=0;k<n;k++)packed[order[k%4]]++;
  joints.push(...entries.map((v,k)=>packed[k]?v[0]:0));weights.push(...packed);
 }
 const primitive=doc.createPrimitive().setMaterial(material)
  .setAttribute('POSITION',acc('Driver surface','VEC3',new Float32Array(raw.positions.flat())))
  .setAttribute('NORMAL',acc('Driver normals','VEC3',new Float32Array(raw.normals.flat())))
  .setAttribute('COLOR_0',acc('Vertex team colors','VEC3',new Uint8Array(raw.colors.flat().map(v=>Math.round(T.MathUtils.clamp(v,0,1)*255)))).setNormalized(true))
  .setAttribute('_TEAM_MASK',acc('Team regions: 0 fixed, 1 primary, 2 secondary','SCALAR',new Float32Array(raw.teamMask)))
  .setAttribute('JOINTS_0',acc('Canonical18 vertex joints','VEC4',new Uint8Array(joints)))
  .setAttribute('WEIGHTS_0',acc('Normalized exact vertex weights','VEC4',new Uint16Array(weights)).setNormalized(true))
  .setIndices(acc('Driver triangles','SCALAR',new Uint16Array(raw.indices.flat())));
 const body=doc.createNode('Body').setMesh(doc.createMesh('Driver '+gender).addPrimitive(primitive)).setSkin(skin);
 nodes.Root.setExtras({gender,heightMeters:raw.bounds[1][1]-raw.bounds[0][1],teamPrimary:raw.look.shirt,teamSecondary:raw.look.shorts,
  teamMask:'_TEAM_MASK scalar: 0 fixed, 1 primary, 2 secondary',soleLocal:[0,soleY,0],propSocket:rig.sockets.RightHand});
 doc.createScene('Racing podium '+gender).addChild(nodes.Root).addChild(body);
 for(const clip of clips){
  const {samples,times,...extras}=clip;
  const animation=doc.createAnimation(clip.id).setExtras({...extras,heightMeters:raw.bounds[1][1]-raw.bounds[0][1]});
  const input=acc(clip.id+' seconds','SCALAR',new Float32Array(times));
  for(const name of canonical){
   const rotation=samples.flatMap(s=>s.values[name].rotation);
   for(let i=4;i<rotation.length;i+=4)if(rotation.slice(i,i+4).reduce((s,v,k)=>s+v*rotation[i-4+k],0)<0)for(let k=0;k<4;k++)rotation[i+k]*=-1;
   const variation=Math.max(...samples.map(s=>Math.abs(s.values[name].rotation[3]-1)));
   if(variation>1e-9){
    const sampler=doc.createAnimationSampler().setInput(input).setOutput(acc(clip.id+' '+name+' rotation','VEC4',new Float32Array(rotation))).setInterpolation('LINEAR');
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[name]).setTargetPath('rotation').setSampler(sampler));
   }
   if(name==='Hips'){
    const sampler=doc.createAnimationSampler().setInput(input).setOutput(acc(clip.id+' Hips translation','VEC3',new Float32Array(samples.flatMap(s=>s.values.Hips.translation)))).setInterpolation('LINEAR');
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[name]).setTargetPath('translation').setSampler(sampler));
   }
  }
 }
 await doc.transform(weld(),resample({tolerance:.00003}),prune());
 doc.getRoot().getAsset().generator='Racing Podium v1 · original CC0 driver adaptation · glTF Transform 4.5.1';
 doc.getRoot().getAsset().copyright='Original fictional drivers; CC0-1.0. See LICENSES.md.';
 const bytes=await io.writeBinary(doc),file='assets/driver-'+gender+'.glb';
 await fs.writeFile(root+'/'+file,bytes);
 records.push({file,gender,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),vertices:primitive.getAttribute('POSITION').getCount(),triangles:primitive.getIndices().getCount()/3,heightMeters:raw.bounds[1][1]-raw.bounds[0][1],soleLocal:[0,soleY,0]});
 metadata=clips.map(({samples,times,...clip})=>({...clip,maxReachError:Math.max(...samples.map(s=>s.maxReachError)),maxTargetClamp:Math.max(...samples.map(s=>s.maxTargetClamp)),bakedFPS:30}));
 console.log(file,bytes.length,'bytes',records.at(-1));
}
await fs.writeFile(root+'/motions.json',JSON.stringify({schemaVersion:1,rig:'rig.json',rootMotion:false,units:'metres',bakedFPS:30,interpolation:'Smoothstep authored poses, two-bone IK, linear baked glTF channels',
 characters:records,props:{helmet_lift:{file:'assets/helmet.glb',bone:'RightHand',...rig.sockets.RightHand},trophy_lift:{file:'assets/trophy.glb',bone:'RightHand',...rig.sockets.RightHand}},
 interaction:{handshake:{partnerTranslation:[-.39,0,.832],partnerRotationY:Math.PI,gripContact:[-.195,1.10,.416],contactWindowSeconds:[.704,2.496]},exit_car:{seatCushionCenter:[-.40,.52,-.10],seatReleaseSeconds:1.0}},clips:metadata},null,2)+'\n');
