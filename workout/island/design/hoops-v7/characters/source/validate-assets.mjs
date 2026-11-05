#!/usr/bin/env node
/** Independent inspection of the delivered bytes, never builder counters.
 * Authoring dependency installation is external to the repository:
 * node source/validate-assets.mjs --modules /tmp/hoops-v7-tools
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const root=path.resolve(arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')));
const require=createRequire(path.resolve(arg('--modules','/tmp/hoops-v7-tools'),'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const codec=require('draco3dgltf'),validator=require('gltf-validator'),sharp=require('sharp');
const {MeshoptDecoder}=require('meshoptimizer');await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule(),'meshopt.decoder':MeshoptDecoder});
const sha=b=>createHash('sha256').update(b).digest('hex');
const BUDGET=1500000;
const EXPECTED=[['pg',1.78],['sg',1.88],['sf',1.99],['pf',2.09],['c',2.20],['referee',null]];
const CANONICAL=[['Root',null],['Hips','Root'],['Spine','Hips'],['Chest','Spine'],['Neck','Chest'],['Head','Neck'],['LeftArm','Chest'],['LeftForeArm','LeftArm'],['LeftHand','LeftForeArm'],['RightArm','Chest'],['RightForeArm','RightArm'],['RightHand','RightForeArm'],['LeftUpLeg','Hips'],['LeftLeg','LeftUpLeg'],['LeftFoot','LeftLeg'],['RightUpLeg','Hips'],['RightLeg','RightUpLeg'],['RightFoot','RightLeg']];
const NAMES=CANONICAL.map(b=>b[0]);
// The brief's independently fixed coverage contract. A removed catalog entry
// must not silently lower the delivery requirement.
const REQUIRED_ACTIONS=['idle_hold','idle','dribble_right','dribble_left','dribble_power','dribble_crossover','dribble_between_legs','shot_set','shot_jump','shot_fadeaway','shot_stepback','layup','dunk_one_hand','dunk_two_hand','dunk_reverse','euro_step','run','decelerate','defense_shuffle','steal','block','rebound','walk','pivot','celebrate','fall','referee_signal'];
const modelDir=path.resolve(arg('--models-dir',path.join(root,'models'))),verification=path.resolve(arg('--output-dir',path.join(root,'verification')));
const authoring=JSON.parse(await fs.readFile(path.join(root,'model-authoring.json'),'utf8'));
await fs.mkdir(verification,{recursive:true});
const files=(await fs.readdir(modelDir)).filter(n=>n.endsWith('.glb')).sort();
const textureSidecars=[];
try{for(const name of await fs.readdir(path.join(root,'textures'))){const full=path.join(root,'textures',name);if(!(await fs.stat(full)).isFile())continue;const b=await fs.readFile(full);let image;try{const m=await sharp(b).metadata();image={width:m.width,height:m.height,format:m.format};}catch{}textureSidecars.push({file:`textures/${name}`,bytes:b.length,MB:b.length/1e6,sha256:sha(b),...image});}}catch(e){if(e.code!=='ENOENT')throw e;}
const vec=(p,m)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
function multiply(a,b){const m=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;}
function glbJSON(bytes){if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('Not a glTF 2 GLB');if(bytes.readUInt32LE(8)!==bytes.length)throw Error('GLB declared length differs from actual bytes');if(bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('First GLB chunk is not JSON');return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());}
function compactValidation(report){return{errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,hints:report.issues.numHints,truncated:report.issues.truncated,messages:report.issues.messages};}
function scanGeometry(doc){
 const result={vertices:0,triangles:0,primitives:0,skinnedVertices:0,badNumbers:0,badIndices:0,badWeights:0,missingSkinAttributes:0,missingUV:0,maxWeightSumError:0,minWeight:Infinity,maxWeight:-Infinity,badInverseBinds:0,normalLengthErrorMax:0,bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},primitivesByMaterial:{}};
 const points=[],torsoPoints=[];
 for(const node of doc.getRoot().listNodes()){
  const mesh=node.getMesh();if(!mesh)continue;
  const skin=node.getSkin(),joints=skin?.listJoints(),ibm=skin?.getInverseBindMatrices();
  const palette=ibm?joints?.map((j,i)=>multiply(j.getWorldMatrix(),ibm.getElement(i,[]))):null;
  if(skin&&(!ibm||ibm.getCount()!==joints.length||!Array.from(ibm.getArray()).every(Number.isFinite)))result.badInverseBinds++;
  for(const primitive of mesh.listPrimitives()){
   result.primitives++;
   const material=primitive.getMaterial()?.getName()||'(unnamed)';result.primitivesByMaterial[material]=(result.primitivesByMaterial[material]||0)+1;
   const pos=primitive.getAttribute('POSITION');if(!pos){result.badNumbers++;continue;}
   const vertexCount=pos.getCount();result.vertices+=vertexCount;
   const count=primitive.getIndices()?.getCount()??vertexCount,mode=primitive.getMode();
   result.triangles+=mode===4?count/3:mode===5||mode===6?Math.max(0,count-2):0;
   for(const semantic of primitive.listSemantics())for(const n of primitive.getAttribute(semantic).getArray())if(!Number.isFinite(n))result.badNumbers++;
   for(const n of primitive.getIndices()?.getArray()??[])if(!Number.isInteger(n)||n<0||n>=vertexCount)result.badIndices++;
   const uv=primitive.getAttribute('TEXCOORD_0');if(!uv||uv.getCount()!==vertexCount)result.missingUV++;
   const weights=primitive.getAttribute('WEIGHTS_0'),indices=primitive.getAttribute('JOINTS_0');
   if(skin){result.skinnedVertices+=vertexCount;if(!weights||!indices)result.missingSkinAttributes++;}
   const normals=primitive.getAttribute('NORMAL');
   for(let i=0;i<vertexCount;i++){
    const position=pos.getElement(i,[]);let point;
    if(skin&&weights&&indices&&palette){
     const w=weights.getElement(i,[]),j=indices.getElement(i,[]),sum=w.reduce((a,b)=>a+b,0),error=Math.abs(sum-1);result.maxWeightSumError=Math.max(result.maxWeightSumError,error);result.minWeight=Math.min(result.minWeight,...w);result.maxWeight=Math.max(result.maxWeight,...w);
     const bad=error>0.0001||w.some(v=>v<0||v>1.000001)||j.some((n,k)=>w[k]>0&&(!Number.isInteger(n)||n<0||n>=joints.length));
     if(bad)result.badWeights++;
     point=[0,0,0];for(let k=0;k<w.length;k++)if(w[k]>0&&palette[j[k]]){const p=vec(position,palette[j[k]]);for(let axis=0;axis<3;axis++)point[axis]+=p[axis]*w[k];}
    }else point=vec(position,node.getWorldMatrix());
    if(normals){const n=normals.getElement(i,[]);result.normalLengthErrorMax=Math.max(result.normalLengthErrorMax,Math.abs(Math.hypot(...n)-1));}
    for(let axis=0;axis<3;axis++){if(!Number.isFinite(point[axis]))result.badNumbers++;result.bounds.min[axis]=Math.min(result.bounds.min[axis],point[axis]);result.bounds.max[axis]=Math.max(result.bounds.max[axis],point[axis]);}
    points.push(point);
    if(/team_primary|jersey|shirt/i.test(material))torsoPoints.push(point);
   }
  }
 }
 result.bounds.size=result.bounds.max.map((v,i)=>v-result.bounds.min[i]);
 const y0=result.bounds.min[1],height=result.bounds.size[1];
 // Use garment vertices so A-pose arms cannot masquerade as chest width.
 // The fallback permits inspection of other material naming conventions.
 const chest=(torsoPoints.length?torsoPoints:points).filter(p=>p[1]>=y0+height*.70&&p[1]<=y0+height*.77&&Math.abs(p[0])<height*.22);
 result.chestSlabWidthMeters=chest.length?Math.max(...chest.map(p=>p[0]))-Math.min(...chest.map(p=>p[0])):null;
 result.chestSlabDepthMeters=chest.length?Math.max(...chest.map(p=>p[2]))-Math.min(...chest.map(p=>p[2])):null;
 if(!Number.isFinite(result.minWeight))result.minWeight=null;if(!Number.isFinite(result.maxWeight))result.maxWeight=null;
 return result;
}
function scanGripMorphs(doc){
 const records=Object.fromEntries(['grip_left','grip_right'].map(name=>[name,{name,primitiveTargets:0,changedVertices:0,nonFiniteDeltas:0,wrongVertexCount:0,nonHandVertices:0,oppositeSideVertices:0,maxDeltaMeters:0,minimumHandWeight:Infinity,normalTargets:0,changedNormalVertices:0,nonFiniteNormalDeltas:0,wrongNormalVertexCount:0,nonHandNormalVertices:0,oppositeSideNormalVertices:0,maxNormalDelta:0}]));
 for(const node of doc.getRoot().listNodes()){
  const mesh=node.getMesh(),skin=node.getSkin();if(!mesh||!skin)continue;
  const names=skin.listJoints().map(j=>j.getName());
  for(const primitive of mesh.listPrimitives()){
   const position=primitive.getAttribute('POSITION'),indices=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
   for(const [index,target] of primitive.listTargets().entries()){
    const name=target.getName()||mesh.getExtras().targetNames?.[index],record=records[name];if(!record)continue;record.primitiveTargets++;
    const delta=target.getAttribute('POSITION');if(!delta||delta.getCount()!==position?.getCount()){record.wrongVertexCount++;continue;}
    const side=name==='grip_left'?'Left':'Right',sign=side==='Left'?1:-1;
    const normalDelta=target.getAttribute('NORMAL');if(normalDelta){record.normalTargets++;if(normalDelta.getCount()!==position.getCount())record.wrongNormalVertexCount++;for(let i=0;i<normalDelta.getCount();i++){const value=normalDelta.getElement(i,[]);if(!value.every(Number.isFinite)){record.nonFiniteNormalDeltas++;continue;}const length=Math.hypot(...value);record.maxNormalDelta=Math.max(record.maxNormalDelta,length);if(length<=1e-7)continue;record.changedNormalVertices++;const joint=indices?.getElement(i,[])??[],weight=weights?.getElement(i,[])??[],handWeight=weight.reduce((sum,w,k)=>sum+(names[joint[k]]===side+'Hand'?w:0),0);if(handWeight<.25)record.nonHandNormalVertices++;if(position.getElement(i,[])[0]*sign<-.005)record.oppositeSideNormalVertices++;}}
    for(let i=0;i<delta.getCount();i++){
     const change=delta.getElement(i,[]);if(!change.every(Number.isFinite)){record.nonFiniteDeltas++;continue;}
     const distance=Math.hypot(...change);if(distance<1e-7)continue;
     record.changedVertices++;record.maxDeltaMeters=Math.max(record.maxDeltaMeters,distance);
     const joint=indices?.getElement(i,[])??[],weight=weights?.getElement(i,[])??[];
     const handWeight=weight.reduce((sum,w,k)=>sum+(names[joint[k]]===side+'Hand'?w:0),0);
     record.minimumHandWeight=Math.min(record.minimumHandWeight,handWeight);if(handWeight<.25)record.nonHandVertices++;
     if(position.getElement(i,[])[0]*sign<-.005)record.oppositeSideVertices++;
    }
   }
  }
 }
 for(const record of Object.values(records)){if(!Number.isFinite(record.minimumHandWeight))record.minimumHandWeight=null;record.pass=record.primitiveTargets>0&&record.changedVertices>=8&&record.nonFiniteDeltas===0&&record.wrongVertexCount===0&&record.nonHandVertices===0&&record.oppositeSideVertices===0&&record.maxDeltaMeters>.001&&record.maxDeltaMeters<.20&&record.nonFiniteNormalDeltas===0&&record.wrongNormalVertexCount===0&&record.nonHandNormalVertices===0&&record.oppositeSideNormalVertices===0&&record.maxNormalDelta<=2.0001;}
 return Object.values(records);
}
const records=[];
for(const filename of files){
 const file=`models/${filename}`,bytes=await fs.readFile(path.join(modelDir,filename));const checks={};const check=(name,pass,detail={})=>checks[name]={pass:Boolean(pass),...detail};
 try{
  const json=glbJSON(bytes),rawPrimitives=(json.meshes??[]).flatMap(m=>m.primitives??[]),compressedPrimitives=rawPrimitives.filter(p=>p.extensions?.KHR_draco_mesh_compression).length;
  const compressedValidation=compactValidation(await validator.validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:1000}));
  const doc=await io.readBinary(new Uint8Array(bytes)),g=doc.getRoot(),geometry=scanGeometry(doc);
  const id=filename.replace(/-lod1\.glb$/, '').replace(/\.glb$/,''),isLOD1=filename.endsWith('-lod1.glb'),expectedHeight=EXPECTED.find(r=>r[0]===id)?.[1];
  const authored=authoring.profiles.find(p=>p.id===id);
  const authoringHeightTolerance=isLOD1?.002:.0001;
  check('authoringCounters',authored&&geometry.triangles===(isLOD1?authored.lod1Triangles:authored.triangles)&&Math.abs(geometry.bounds.size[1]-authored.heightMeters)<authoringHeightTolerance,{definition:'Authoring metadata is cross-checked against independently decoded triangle counts and weighted bind height; it is not the source of those measurements. The LOD silhouette may differ by up to2mm after decimation and13-bit quantization.',authoringTriangles:(isLOD1?authored?.lod1Triangles:authored?.triangles)??null,decodedTriangles:geometry.triangles,authoringHeightMeters:authored?.heightMeters??null,decodedHeightMeters:geometry.bounds.size[1],heightToleranceMeters:authoringHeightTolerance});
  check('fileBudget',bytes.length<=BUDGET,{bytes:bytes.length,maxBytes:BUDGET});
  const externalBuffers=(json.buffers??[]).filter(b=>b.uri&&!b.uri.startsWith('data:')),externalImages=(json.images??[]).filter(i=>i.uri&&!i.uri.startsWith('data:'));
  check('selfContained',externalBuffers.length===0&&externalImages.length===0,{externalBuffers:externalBuffers.length,externalImages:externalImages.length});
  check('draco',compressedPrimitives>0&&compressedPrimitives===rawPrimitives.length&&(json.extensionsRequired??[]).includes('KHR_draco_mesh_compression'),{primitives:rawPrimitives.length,compressedPrimitives,required:(json.extensionsRequired??[]).includes('KHR_draco_mesh_compression')});
  const animationAccessorIds=new Set((json.animations??[]).flatMap(a=>a.samplers.flatMap(s=>[s.input,s.output]))),animationViewIds=new Set([...animationAccessorIds].map(i=>json.accessors[i].bufferView).filter(i=>i!==undefined)),meshoptViews=(json.bufferViews??[]).flatMap((v,i)=>v.extensions?.EXT_meshopt_compression?[{bufferView:i,logicalBytes:v.byteLength,logicalBuffer:v.buffer,...v.extensions.EXT_meshopt_compression}]:[]);
  const nonAnimationViewIds=new Set([...(json.accessors??[]).flatMap((a,i)=>[...(!animationAccessorIds.has(i)?[a.bufferView]:[]),a.sparse?.indices?.bufferView,a.sparse?.values?.bufferView]),...(json.images??[]).map(i=>i.bufferView),...rawPrimitives.map(p=>p.extensions?.KHR_draco_mesh_compression?.bufferView)].filter(i=>i!==undefined));
  const meshoptOK=meshoptViews.length>0&&(json.extensionsRequired??[]).includes('EXT_meshopt_compression')&&meshoptViews.every(v=>animationViewIds.has(v.bufferView)&&!nonAnimationViewIds.has(v.bufferView)&&v.mode==='ATTRIBUTES'&&(!v.filter||v.filter==='NONE')&&v.byteStride*v.count===v.logicalBytes&&json.buffers[v.logicalBuffer]?.extensions?.EXT_meshopt_compression?.fallback===true);
  check('losslessAnimationCompression',meshoptOK,{definition:'Only animation bufferViews use required EXT_meshopt_compression ATTRIBUTES with no lossy filter. Geometry, textures, weights and grip morphs retain their original Draco/sparse storage. Full before/after accessor byte identity is independently recorded by motion-export.mjs.',views:meshoptViews});
  check('compressedKhronos',compressedValidation.errors===0,compressedValidation);
  check('geometry',geometry.vertices>0&&geometry.triangles>0&&geometry.badNumbers===0&&geometry.badIndices===0&&geometry.badInverseBinds===0,{vertices:geometry.vertices,triangles:geometry.triangles,badNumbers:geometry.badNumbers,badIndices:geometry.badIndices,badInverseBinds:geometry.badInverseBinds});
  check('weights',geometry.skinnedVertices>0&&geometry.badWeights===0&&geometry.missingSkinAttributes===0,{skinnedVertices:geometry.skinnedVertices,badVertices:geometry.badWeights,missingAttributes:geometry.missingSkinAttributes,maxWeightSumError:geometry.maxWeightSumError,tolerance:0.0001});
  const skinRecords=g.listSkins().map(s=>({name:s.getName(),joints:s.listJoints().map(j=>({name:j.getName(),parent:j.getParentNode()?.getName()??null}))}));
  const skeletonOK=skinRecords.length>0&&skinRecords.every(s=>s.joints.length===18&&new Set(s.joints.map(j=>j.name)).size===18&&CANONICAL.every(([name,parent])=>{const joint=s.joints.find(j=>j.name===name);return joint&&(parent===null?!NAMES.includes(joint.parent):joint.parent===parent);}));
  check('canonical18',skeletonOK,{skins:skinRecords,expected:CANONICAL.map(([name,parent])=>({name,parent})),orderMatters:false});
  const jointWorldPositions=Object.fromEntries((g.listSkins()[0]?.listJoints()??[]).map(j=>{const m=j.getWorldMatrix();return[j.getName(),[m[12],m[13],m[14]]];}));
  const restAxesOK=['LeftArm','LeftHand','LeftUpLeg','LeftFoot'].every(left=>{const right=left.replace('Left','Right');return jointWorldPositions[left]?.[0]>jointWorldPositions[right]?.[0];})&&jointWorldPositions.Head?.[1]>jointWorldPositions.Hips?.[1]&&jointWorldPositions.Hips?.[1]>jointWorldPositions.LeftFoot?.[1];
  check('restAxes',restAxesOK,{definition:'+Y up and +X anatomical left, tested from named bind joints. +Z facing is confirmed by rendered face/front review.',jointWorldPositions});
  const gripMorphs=scanGripMorphs(doc);
  check('independentGripMorphs',gripMorphs.every(m=>m.pass),{definition:'Left/right POSITION morphs contain finite nonzero finger deformation localized to vertices weighted at least25% to the corresponding canonical Hand joint; no extra finger joints are introduced. Actual thumb/finger surface contact requires rendered and deformed-mesh checks.',morphs:gripMorphs});
  check('gripNormalMorphs',gripMorphs.every(m=>m.normalTargets>0&&m.changedNormalVertices>=8&&m.nonFiniteNormalDeltas===0&&m.wrongNormalVertexCount===0&&m.nonHandNormalVertices===0&&m.oppositeSideNormalVertices===0&&m.maxNormalDelta>0&&m.maxNormalDelta<=2.0001),{definition:'Both grip targets include finite nonzero NORMAL deltas localized to the same hand-weighted side, so curled fingers retain corrected surface shading.',morphs:gripMorphs.map(m=>({name:m.name,normalTargets:m.normalTargets,changedNormalVertices:m.changedNormalVertices,nonFiniteNormalDeltas:m.nonFiniteNormalDeltas,wrongNormalVertexCount:m.wrongNormalVertexCount,nonHandNormalVertices:m.nonHandNormalVertices,oppositeSideNormalVertices:m.oppositeSideNormalVertices,maxNormalDelta:m.maxNormalDelta}))});
  const textures=[];for(const texture of g.listTextures()){const image=texture.getImage(),metadata=image?await sharp(image).metadata():{},stats=image?await sharp(image).stats():null;const digest=image?sha(image):null;textures.push({name:texture.getName(),width:metadata.width,height:metadata.height,mimeType:texture.getMimeType(),bytes:image?.length??0,MB:(image?.length??0)/1e6,sha256:digest,channelStatistics:stats?.channels.map(c=>({min:c.min,max:c.max,mean:c.mean,standardDeviation:c.stdev}))??null,identicalSidecars:textureSidecars.filter(t=>t.sha256===digest).map(t=>t.file)});}
  const materials=g.listMaterials().map(m=>({name:m.getName(),alphaMode:m.getAlphaMode(),doubleSided:m.getDoubleSided(),baseColorTexture:m.getBaseColorTexture()?.getName()??null,normalTexture:m.getNormalTexture()?.getName()??null,normalScale:m.getNormalScale(),baseTexCoord:m.getBaseColorTextureInfo()?.getTexCoord()??null,normalTexCoord:m.getNormalTextureInfo()?.getTexCoord()??null}));
  const baseTextures=new Set(g.listMaterials().map(m=>m.getBaseColorTexture()).filter(Boolean)),normalTextures=new Set(g.listMaterials().map(m=>m.getNormalTexture()).filter(Boolean));
  check('textureDimensions',textures.length>0&&textures.every(t=>t.width>0&&t.height>0&&t.width<=1024&&t.height<=1024),{maxDimension:1024,textures});
  check('singleAtlas',textures.length<=2&&baseTextures.size===1&&normalTextures.size===1&&geometry.missingUV===0&&materials.every(m=>(m.baseTexCoord===null||m.baseTexCoord===0)&&(m.normalTexCoord===null||m.normalTexCoord===0)),{definition:'One UV atlas layout, one base-color image and one tangent-space normal image; every sampled material uses TEXCOORD_0.',textureCount:textures.length,baseColorImages:baseTextures.size,normalImages:normalTextures.size,missingUV:geometry.missingUV,materials});
  const normalRecords=[...normalTextures].map(t=>textures.find(r=>r.sha256===sha(t.getImage()))),normalMaterials=materials.filter(m=>m.normalTexture);
  check('nonFlatNormalMap',normalRecords.length>0&&normalRecords.every(t=>t?.channelStatistics?.[2]?.mean>180&&Math.max(t.channelStatistics[0].standardDeviation,t.channelStatistics[1].standardDeviation)>.1)&&normalMaterials.some(m=>Math.abs(m.normalScale)>.001)&&[...normalTextures].every(t=>!baseTextures.has(t)),{definition:'Normal texture has blue-facing tangent-space values and measurable XY variation, and at least one material samples it at nonzero strength. Visual cloth realism still requires rendered review.',normalTextures:normalRecords.map(t=>({name:t?.name,channelStatistics:t?.channelStatistics})),materialScales:normalMaterials.map(m=>({name:m.name,normalScale:m.normalScale}))});
  const height=geometry.bounds.size[1];check('height',expectedHeight===null||expectedHeight===undefined?(height>=1.70&&height<=2.22):Math.abs(height-expectedHeight)<=.020,{targetMeters:expectedHeight??null,actualMeters:height,toleranceMeters:.020});
  check('plausibleBindBounds',geometry.bounds.min.every(Number.isFinite)&&geometry.bounds.max.every(Number.isFinite)&&geometry.bounds.size[0]>.3&&geometry.bounds.size[0]<height*1.35&&geometry.bounds.size[2]>.08&&geometry.bounds.size[2]<height*.65&&Math.abs((geometry.bounds.min[0]+geometry.bounds.max[0])/2)<height*.1,{bounds:geometry.bounds,definition:'All weighted bind vertices lie in a finite, centered human-scale envelope; isolated far-away triangles or broken mesh transforms cannot pass merely because total height is correct.'});
  check('bindGround',Math.abs(geometry.bounds.min[1])<=.020,{minimumY:geometry.bounds.min[1],toleranceMeters:.020});
  const animations=g.listAnimations().map(a=>{
   const signature=createHash('sha256');
   for(const channel of [...a.listChannels()].sort((a,b)=>(a.getTargetNode()?.getName()+' / '+a.getTargetPath()).localeCompare(b.getTargetNode()?.getName()+' / '+b.getTargetPath()))){
    signature.update(channel.getTargetNode()?.getName()??'');signature.update(channel.getTargetPath());const sampler=channel.getSampler();for(const accessor of [sampler.getInput(),sampler.getOutput()]){const array=accessor?.getArray();if(array)signature.update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));}
   }
   return{name:a.getName(),channels:a.listChannels().length,contentSha256:signature.digest('hex'),targets:[...new Set(a.listChannels().map(c=>c.getTargetNode()?.getName()))],samplers:a.listSamplers().map(s=>{const output=s.getOutput();let maxVariation=0;if(output&&output.getCount()>0){const first=output.getElement(0,[]);for(let i=1;i<output.getCount();i++)for(const [k,n] of output.getElement(i,[]).entries())maxVariation=Math.max(maxVariation,Math.abs(n-first[k]));}return{frames:s.getInput()?.getCount()??0,start:s.getInput()?.getMin([])?.[0]??null,end:s.getInput()?.getMax([])?.[0]??null,maxVariation,finite:Array.from(output?.getArray()??[]).every(Number.isFinite)};})};
  });
  check('animationNumbers',animations.every(a=>a.samplers.every(s=>s.finite&&s.frames>0&&s.end>=s.start)),{animationCount:animations.length,animations});
  const missingActions=REQUIRED_ACTIONS.filter(id=>!animations.some(a=>a.name===id)),staticActions=animations.filter(a=>REQUIRED_ACTIONS.includes(a.name)&&!a.samplers.some(s=>s.frames>=2&&s.end>s.start&&s.maxVariation>.00001)).map(a=>a.name),duplicates=[];
  for(let i=0;i<animations.length;i++)for(let j=i+1;j<animations.length;j++)if(animations[i].contentSha256===animations[j].contentSha256)duplicates.push([animations[i].name,animations[j].name]);
  check('requiredAnimationCoverage',missingActions.length===0&&staticActions.length===0&&duplicates.length===0,{requiredActions:REQUIRED_ACTIONS,missingActions,staticActions,duplicateContent:duplicates,definition:'Each named action is embedded, finite, time-varying and has distinct sampled channels. This detects missing/static/byte-identical clips; rendered choreography and contact are reviewed separately.'});
  const anchors=g.listNodes().filter(n=>n.getName()==='MotionBallAnchor'),anchor=anchors[0],skinJoints=new Set(g.listSkins().flatMap(s=>s.listJoints()));
  const ballClipCoverage=REQUIRED_ACTIONS.map(name=>{const animation=g.listAnimations().find(a=>a.getName()===name),channels=animation?.listChannels()??[],anchorPaths=[...new Set(channels.filter(c=>c.getTargetNode()===anchor).map(c=>c.getTargetPath()))],boneChannels=channels.filter(c=>skinJoints.has(c.getTargetNode())).length,morphChannels=channels.filter(c=>c.getTargetPath()==='weights').length;return{action:name,anchorPaths,boneChannels,morphChannels,pass:['translation','rotation','scale'].every(p=>anchorPaths.includes(p))&&boneChannels>0&&morphChannels>0};});
  check('presentationBallAnchor',anchors.length===1&&!skinJoints.has(anchor)&&!anchor.getSkin()&&anchor.getExtras().presentationOnly===true&&Math.abs((anchor.getExtras().radiusMeters??0)-.12)<1e-8&&ballClipCoverage.every(c=>c.pass),{definition:'Exactly one nonjoint MotionBallAnchor carries reusable radius0.12m presentation trajectory in all27 clips, with scale-based visibility. Skeleton and finger morph tracks remain present; gameplay ownership/physics are outside this asset contract.',anchorCount:anchors.length,joint:skinJoints.has(anchor),extras:anchor?.getExtras()??null,clips:ballClipCoverage});
  for(const extension of [...g.listExtensionsUsed()])if(['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(extension.extensionName))extension.dispose();
  const decodedValidation=compactValidation(await validator.validateBytes(await io.writeBinary(doc),{uri:file.replace('.glb','-decoded.glb'),maxIssues:1000}));
  check('decodedKhronos',decodedValidation.errors===0,decodedValidation);
  records.push({file,id,lod:isLOD1?1:0,bytes:bytes.length,MB:bytes.length/1e6,sha256:sha(bytes),geometry,textures,materials,checks,pass:Object.values(checks).every(c=>c.pass)});
 }catch(error){records.push({file,bytes:bytes.length,MB:bytes.length/1e6,sha256:sha(bytes),pass:false,error:error.stack??String(error),checks});}
 const r=records.at(-1);console.log(`${r.pass?'PASS':'FAIL'} ${file}: ${bytes.length} B / ${r.geometry?.triangles??'?'} triangles${r.error?` / ${r.error.split('\n')[0]}`:''}${Object.entries(r.checks).filter(([,c])=>!c.pass).map(([n])=>` / ${n}`).join('')}`);
}
const expectedFiles=EXPECTED.flatMap(([id])=>[`${id}.glb`,`${id}-lod1.glb`]);
const missingFiles=expectedFiles.filter(file=>!files.includes(file));
const unexpectedFiles=files.filter(file=>!expectedFiles.includes(file));
const lodPairs=EXPECTED.map(([id])=>{const high=records.find(r=>r.id===id&&r.lod===0),low=records.find(r=>r.id===id&&r.lod===1),ratio=high?.geometry&&low?.geometry?low.geometry.triangles/high.geometry.triangles:null;return{id,highTriangles:high?.geometry?.triangles??null,lowTriangles:low?.geometry?.triangles??null,ratio,pass:ratio!==null&&ratio<.70};});
const players=EXPECTED.slice(0,5).map(([id])=>records.find(r=>r.id===id&&r.lod===0));
const builds=players.filter(Boolean).map(r=>({id:r.id,heightMeters:r.geometry?.bounds.size[1]??null,chestSlabWidthMeters:r.geometry?.chestSlabWidthMeters??null,chestSlabDepthMeters:r.geometry?.chestSlabDepthMeters??null}));
const heights=builds.map(b=>b.heightMeters);
const atlasPairs=EXPECTED.map(([id])=>{const high=records.find(r=>r.id===id&&r.lod===0),low=records.find(r=>r.id===id&&r.lod===1),highImages=(high?.textures??[]).map(t=>t.sha256).sort(),lowImages=(low?.textures??[]).map(t=>t.sha256).sort();return{id,highImages,lowImages,pass:highImages.length>0&&JSON.stringify(highImages)===JSON.stringify(lowImages)};});
const packageChecks={completeRoster:{pass:missingFiles.length===0,expectedFiles,missingFiles},realLOD:{pass:lodPairs.every(p=>p.pass),maximumTriangleRatio:.70,pairs:lodPairs},sharedLODAtlas:{pass:atlasPairs.every(p=>p.pass),pairs:atlasPairs},increasingRoleHeights:{pass:heights.length===5&&heights.every((h,i)=>Number.isFinite(h)&&(i===0||h>heights[i-1]+.06)),builds},distinctBodyBuilds:{pass:builds.length===5&&builds.every((b,i)=>i===0||Math.abs(b.chestSlabWidthMeters-builds[i-1].chestSlabWidthMeters)>.008||Math.abs(b.chestSlabDepthMeters-builds[i-1].chestSlabDepthMeters)>.006),builds,scope:'Bind-pose central torso slab at 70–77% height. This confirms geometric differences, not subjective realism.'}};
packageChecks.completeRoster.unexpectedFiles=unexpectedFiles;packageChecks.completeRoster.pass&&=unexpectedFiles.length===0;
const assetBytes=records.reduce((n,r)=>n+r.bytes,0),sidecarBytes=textureSidecars.reduce((n,r)=>n+r.bytes,0);
const result={schemaVersion:1,generatedAtUTC:new Date().toISOString(),scope:'Independent decoding of delivered GLB bytes. Compressed and decoded Khronos validation, canonical skeleton, weighted skin bind bounds, geometry, atlases and LOD budgets. This is neither physical-phone FPS measurement nor visual quality scoring.',validatorVersion:validator.version(),budget:{maxBytesPerGLB:BUDGET,maxTextureDimension:1024,assetBytes,assetMB:assetBytes/1e6,textureSidecarBytes:sidecarBytes,textureSidecarMB:sidecarBytes/1e6},checks:packageChecks,assets:records,pass:records.every(r=>r.pass)&&Object.values(packageChecks).every(c=>c.pass)};
const uniqueImages=new Map();for(const r of records)for(const t of r.textures??[]){const image=uniqueImages.get(t.sha256)??{sha256:t.sha256,bytes:t.bytes,width:t.width,height:t.height,embeddedIn:[],sidecars:t.identicalSidecars};image.embeddedIn.push(r.file);uniqueImages.set(t.sha256,image);}
const weights={schemaVersion:1,generatedAtUTC:result.generatedAtUTC,units:{MB:'decimal bytes / 1,000,000',triangles:'decoded glTF primitives',textures:'embedded compressed image bytes; GPU RGBA8 estimate includes full mip chain'},models:records.map(r=>({file:r.file,bytes:r.bytes,MB:r.MB,triangles:r.geometry?.triangles??null,vertices:r.geometry?.vertices??null,drawPrimitives:r.geometry?.primitives??null,skinJoints:r.checks?.canonical18?.skins?.map(s=>s.joints.length)??[],textures:r.textures??[],estimatedTextureGPUMB:(r.textures??[]).reduce((n,t)=>n+(t.width??0)*(t.height??0)*4*4/3,0)/1e6,sha256:r.sha256})),totals:{modelsBytes:assetBytes,modelsMB:assetBytes/1e6,sidecarBytes,sidecarMB:sidecarBytes/1e6,uniqueEmbeddedImageBytes:[...uniqueImages.values()].reduce((n,t)=>n+t.bytes,0),allEmbeddedImageBytes:records.reduce((n,r)=>n+(r.textures??[]).reduce((m,t)=>m+t.bytes,0),0),estimatedUniqueImageGPUMB:[...uniqueImages.values()].reduce((n,t)=>n+t.width*t.height*4*4/3,0)/1e6,estimatedNaiveAllImageGPUMB:records.reduce((n,r)=>n+(r.textures??[]).reduce((m,t)=>m+(t.width??0)*(t.height??0)*4*4/3,0),0)/1e6},uniqueImages:[...uniqueImages.values()],sidecars:textureSidecars,lodPairs,note:'Sidecar textures are inspection/authoring copies when their SHA matches embedded images; do not fetch both copies in the viewer. Model byte totals already include all embedded textures. GPU estimates assume RGBA8 textures with mipmaps; actual renderer sharing and device formats may differ.'};
result.inputModelDirectory=modelDir;result.outputDirectory=verification;
await fs.writeFile(path.join(verification,'asset-validation.json'),JSON.stringify(result,null,2)+'\n');
await fs.writeFile(path.join(verification,'weights.json'),JSON.stringify(weights,null,2)+'\n');
console.log(`${result.pass?'PASS':'FAIL'} package: ${records.length} GLBs, ${assetBytes} B; ${missingFiles.length} missing; ${records.filter(r=>!r.pass).length} failed assets.`);
if(!result.pass)process.exitCode=1;
