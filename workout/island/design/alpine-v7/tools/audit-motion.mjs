// Samples the embedded glTF channels independently of the runtime animator.
// Measurements are geometric diagnostics, not a substitute for visual critique.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Matrix4,Quaternion,Vector3} from '../../../vendor/three.module.js';

const PACK=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),option=(k,v)=>args.includes(k)?args[args.indexOf(k)+1]:v;
const require=createRequire(path.resolve(option('--modules','/tmp/alpine-v7-tools'),'package.json'));
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const degrees=r=>r*180/Math.PI;
const vector=v=>new Vector3(...v);
const worldPosition=node=>new Vector3().setFromMatrixPosition(new Matrix4().fromArray(node.getWorldMatrix()));
const maxAbs=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const round=v=>Number(v.toFixed(6));
const range=values=>({min:round(Math.min(...values)),max:round(Math.max(...values)),span:round(Math.max(...values)-Math.min(...values))});
const errors=[],characters=[];
const manifest=JSON.parse(await fs.readFile(path.join(PACK,'characters/manifest.json'),'utf8'));
const allLODs=args.includes('--all-lods');
const entries=(manifest.assets??manifest.characters??[]).filter(a=>allLODs||Number(a.lod??0)===0);

function interpolate(sampler,t,property){
  const input=sampler.getInput().getArray(),output=sampler.getOutput();
  if(sampler.getInterpolation()==='CUBICSPLINE')throw Error('Motion audit requires LINEAR or STEP baked tracks.');
  let a=0;
  while(a+1<input.length&&input[a+1]<=t)a++;
  const b=Math.min(a+1,input.length-1),span=input[b]-input[a];
  const f=sampler.getInterpolation()==='STEP'||span<=0?0:Math.max(0,Math.min(1,(t-input[a])/span));
  const av=output.getElement(a,[]),bv=output.getElement(b,[]);
  if(property==='rotation')return new Quaternion(...av).slerp(new Quaternion(...bv),f).normalize().toArray();
  return av.map((v,i)=>v+(bv[i]-v)*f);
}
function applyAnimation(animation,time){
  for(const c of animation.listChannels()){
    const node=c.getTargetNode(),property=c.getTargetPath(),value=interpolate(c.getSampler(),time,property);
    if(property==='translation')node.setTranslation(value);
    else if(property==='rotation')node.setRotation(value);
    else if(property==='scale')node.setScale(value);
  }
}
function kneeFlexion(nodes,side){
  const hip=worldPosition(nodes.get(side+'UpLeg')),knee=worldPosition(nodes.get(side+'Leg')),ankle=worldPosition(nodes.get(side+'Foot'));
  return 180-degrees(hip.sub(knee).angleTo(ankle.sub(knee)));
}
function tilt(nodes,a,b){
  return degrees(worldPosition(nodes.get(b)).sub(worldPosition(nodes.get(a))).angleTo(new Vector3(0,1,0)));
}
function matrixQuaternion(node){
  const p=new Vector3(),q=new Quaternion(),s=new Vector3();
  new Matrix4().fromArray(node.getWorldMatrix()).decompose(p,q,s);return q;
}
function contactGeometry(doc,sport){
  const groups={Left:[],Right:[],Board:[],LeftPole:[],RightPole:[],FullBody:[]};
  for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
    const equipment=/laminate equipment top|snowboard|ski deck/i.test(primitive.getMaterial()?.getName()??'');
    const board=/board/i.test(node.getName())&&!node.getSkin();
    const positions=primitive.getAttribute('POSITION'),joints=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0'),skin=node.getSkin();
    for(let i=0;i<positions.getCount();i++){
      const position=positions.getElement(i,[]);
      if(!skin){
        const vertex={node,position};
        if(board)groups.Board.push(vertex);
        else if(/LeftPole/i.test(node.getName()))groups.LeftPole.push(vertex);
        else if(/RightPole/i.test(node.getName()))groups.RightPole.push(vertex);
        continue;
      }
      const j=joints.getElement(i,[]),w=weights.getElement(i,[]),jointNames=j.map(index=>skin.listJoints()[index].getName());
      const vertex={node,skin,position,joints:j,weights:w};groups.FullBody.push(vertex);
      if(!equipment)continue;
      for(const side of ['Left','Right']){
        const footWeight=w.reduce((sum,value,index)=>sum+(jointNames[index]===side+'Foot'?value:0),0);
        if(footWeight>.8)groups[side].push(vertex);
      }
    }
  }
  return groups;
}
function contactMinima(groups,includeFullBody=false){
  const jointMatrices=new Map(),nodeMatrices=new Map(),result={};
  for(const [group,vertices]of Object.entries(groups)){
    if(group==='FullBody'&&!includeFullBody){result[group]=null;continue;}
    if(!vertices.length){result[group]=null;continue;}
    let minY=Infinity;
    for(const v of vertices){
      if(!v.skin){
        if(!nodeMatrices.has(v.node))nodeMatrices.set(v.node,new Matrix4().fromArray(v.node.getWorldMatrix()));
        const e=nodeMatrices.get(v.node).elements;minY=Math.min(minY,e[1]*v.position[0]+e[5]*v.position[1]+e[9]*v.position[2]+e[13]);continue;
      }
      if(!jointMatrices.has(v.skin)){
        const ibm=v.skin.getInverseBindMatrices();
        jointMatrices.set(v.skin,v.skin.listJoints().map((joint,i)=>new Matrix4().fromArray(joint.getWorldMatrix()).multiply(new Matrix4().fromArray(ibm.getElement(i,[])))));
      }
      const matrices=jointMatrices.get(v.skin);let y=0;
      for(let i=0;i<v.weights.length;i++)if(v.weights[i]>0){const e=matrices[v.joints[i]].elements;y+=(e[1]*v.position[0]+e[5]*v.position[1]+e[9]*v.position[2]+e[13])*v.weights[i];}
      minY=Math.min(minY,y);
    }
    result[group]=minY;
  }
  return result;
}
function extractEndpoints(animation){
  const result=new Map();
  for(const c of animation.listChannels()){
    const a=c.getSampler().getOutput();
    result.set(c.getTargetNode().getName()+'.'+c.getTargetPath(),{start:a.getElement(0,[]),end:a.getElement(a.getCount()-1,[])});
  }
  return result;
}
for(const entry of entries){
  const declaredFile=entry.file??entry.path;
  const file=path.resolve(PACK,'characters',declaredFile);
  // Manifests may use either paths relative to characters/ or pack-relative paths.
  const target=file.includes('/characters/characters/')?path.resolve(PACK,declaredFile):file;
  try{
    const bytes=await fs.readFile(target),doc=await io.readBinary(new Uint8Array(bytes));
    const allNodes=doc.getRoot().listNodes(),nodes=new Map(allNodes.map(n=>[n.getName(),n]));
    const contactGroups=contactGeometry(doc,entry.sport);
    const rest=new Map(allNodes.map(n=>[n,{translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale()}]));
    const reset=()=>{for(const [node,t]of rest)node.setTranslation(t.translation).setRotation(t.rotation).setScale(t.scale);};
    const clips=[];
    for(const animation of doc.getRoot().listAnimations()){
      reset();
      const duration=Math.max(...animation.listChannels().map(c=>c.getSampler().getInput().getArray().at(-1)));
      const samples=[],rootQuaternions=[],boardCoordinates={Left:[],Right:[]};
      const board=nodes.get('Snowboard')??nodes.get('snowboard')??allNodes.find(n=>/board/i.test(n.getName())&&n.getMesh());
      for(let i=0;i<=120;i++){
        const seconds=duration*i/120;applyAnimation(animation,seconds);
        const sample={time:round(seconds),phase:round(i/120),leftKnee:kneeFlexion(nodes,'Left'),rightKnee:kneeFlexion(nodes,'Right'),bodyTilt:tilt(nodes,'Hips','Neck'),hips:worldPosition(nodes.get('Hips')).toArray(),leftFoot:worldPosition(nodes.get('LeftFoot')).toArray(),rightFoot:worldPosition(nodes.get('RightFoot')).toArray()};
        sample.equipmentMinY=contactMinima(contactGroups,['fall_roll','get_up'].includes(animation.getName()));
        samples.push(sample);rootQuaternions.push(matrixQuaternion(nodes.get('Root')));
        if(board){
          const inv=new Matrix4().fromArray(board.getWorldMatrix()).invert();
          for(const side of ['Left','Right'])boardCoordinates[side].push(worldPosition(nodes.get(side+'Foot')).applyMatrix4(inv).toArray());
        }
      }
      let rootAngularTravel=0;
      for(let i=1;i<rootQuaternions.length;i++)rootAngularTravel+=degrees(rootQuaternions[i-1].angleTo(rootQuaternions[i]));
      const apex=samples.reduce((a,b)=>b.bodyTilt>a.bodyTilt?b:a);
      const boardFootDrift=board?Object.fromEntries(['Left','Right'].map(side=>{
        const positions=boardCoordinates[side],center=positions[0];
        return [side,round(Math.max(...positions.map(p=>vector(p).distanceTo(vector(center)))))];
      })):null;
      const equipmentContact=Object.fromEntries(Object.keys(contactGroups).filter(group=>contactGroups[group].length&&samples.some(s=>s.equipmentMinY[group]!==null)).map(group=>[group,{vertices:contactGroups[group].length,heightMeters:range(samples.map(s=>s.equipmentMinY[group]))}]));
      clips.push({name:animation.getName(),durationSeconds:duration,samples:121,leftKneeFlexionDegrees:range(samples.map(s=>s.leftKnee)),rightKneeFlexionDegrees:range(samples.map(s=>s.rightKnee)),bodyInclinationDegrees:range(samples.map(s=>s.bodyTilt)),pelvisHeightMeters:range(samples.map(s=>s.hips[1])),
        leftFootHeightMeters:range(samples.map(s=>s.leftFoot[1])),rightFootHeightMeters:range(samples.map(s=>s.rightFoot[1])),rootAngularTravelDegrees:round(rootAngularTravel),
        carveApex:{phase:apex.phase,inclinationDegrees:round(apex.bodyTilt),leftKneeFlexionDegrees:round(apex.leftKnee),rightKneeFlexionDegrees:round(apex.rightKnee),kneeAsymmetryDegrees:round(Math.abs(apex.leftKnee-apex.rightKnee))},boardNode:board?.getName()??null,boardRelativeFootMaxDriftMeters:boardFootDrift,equipmentContact,
        samplePositions:samples.filter((_,i)=>i%12===0).map(s=>({phase:s.phase,hips:s.hips.map(round),leftFoot:s.leftFoot.map(round),rightFoot:s.rightFoot.map(round)}))});
    }
    const fall=doc.getRoot().listAnimations().find(a=>a.getName()==='fall_roll'),rise=doc.getRoot().listAnimations().find(a=>a.getName()==='get_up');
    let fallRiseSeam=null;
    if(fall&&rise){
      const a=extractEndpoints(fall),b=extractEndpoints(rise);let maxDifference=0;
      for(const [key,value]of a){
        if(!b.has(key))continue;
        const target=b.get(key).start,sign=key.endsWith('.rotation')&&value.end.reduce((sum,v,i)=>sum+v*target[i],0)<0?-1:1;
        maxDifference=Math.max(maxDifference,maxAbs(value.end,target.map(v=>v*sign)));
      }
      fallRiseSeam={maxComponentDifference:maxDifference,withinOneMillimeterOrQuaternionComponent:maxDifference<=.001};
    }
    const gates=[];
    const check=(passed,description)=>{gates.push({passed,description});if(!passed)errors.push({file:path.relative(PACK,target),error:description});};
    for(const clip of clips){
      const body=clip.equipmentContact.FullBody;
      if(body)check(body.heightMeters.min>=-.005,`${clip.name}: full skinned mesh penetrates snow by more than 5mm (minimum ${body.heightMeters.min}m)`);
      for(const side of ['LeftPole','RightPole'])if(clip.equipmentContact[side])check(clip.equipmentContact[side].heightMeters.min>=-.005,`${clip.name}/${side}: rigid pole penetrates snow by more than 5mm`);
      if(['glide','carve_left','carve_right','crouch','accelerate'].includes(clip.name))for(const [group,contact]of Object.entries(clip.equipmentContact)){
        if(group==='FullBody'||group.endsWith('Pole'))continue;
        check(contact.heightMeters.min>=-.005&&contact.heightMeters.max<=.02,`${clip.name}/${group}: grounded equipment must stay between -5mm and +20mm from the surface`);
      }
      if(clip.boardRelativeFootMaxDriftMeters)check(Math.max(...Object.values(clip.boardRelativeFootMaxDriftMeters))<=.02,`${clip.name}: snowboard boot drift exceeds 20mm`);
      if(['carve_left','carve_right'].includes(clip.name)){
        check(clip.bodyInclinationDegrees.max>=15&&clip.bodyInclinationDegrees.span>=3,`${clip.name}: body inclination does not change enough for a loaded turn`);
        if(entry.sport==='ski')check(clip.carveApex.kneeAsymmetryDegrees>=12,`${clip.name}: skier knees lack loaded outside/inside asymmetry`);
      }
      if(['trick_180','trick_360','trick_backflip'].includes(clip.name)){
        const targetAngle=clip.name==='trick_180'?180:360;
        check(clip.rootAngularTravelDegrees>=targetAngle-10&&clip.rootAngularTravelDegrees<=targetAngle+40,`${clip.name}: sampled root angular travel does not preserve the intended rotation winding`);
      }
    }
    check(fallRiseSeam?.withinOneMillimeterOrQuaternionComponent===true,'fall_roll/get_up: pose seam exceeds 0.001 components');
    characters.push({id:entry.id,file:path.relative(PACK,target),sport:entry.sport,sha256:createHash('sha256').update(bytes).digest('hex'),clips,fallRiseSeam,gates});
  }catch(error){errors.push({file:declaredFile,error:error.message});}
}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),allPassed:errors.length===0,allLODs,sampling:'121 uniformly spaced samples per embedded clip; shortest-arc quaternion interpolation; actual target rig world transforms',characters,errors,
  limitations:['Inclination is the Hips-to-Neck vector relative to world +Y. Knee flexion is 180° minus the hip/knee/ankle angle. These are actual retargeted geometry measurements, not authored intention.','Foot height refers to the foot joint. Separate equipmentContact records sample actual skinned equipment and rigid board/pole vertices; FullBody is evaluated for fall_roll/get_up. Sampling cannot exclude penetration between sample times.','Board-relative foot drift is reported when a named snowboard mesh node exists. It measures attachment stability; an incorrectly positioned but stationary boot can still pass.','Root angular travel is the sum of sampled quaternion geodesic angles. It detects missing rotation winding but does not establish correct trick direction or landing quality.']};
await fs.mkdir(path.join(PACK,'verification'),{recursive:true});
await fs.writeFile(path.join(PACK,'verification/motion-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({characters:characters.length,errors,report:'verification/motion-audit.json'},null,2));
if(errors.length)process.exitCode=1;
