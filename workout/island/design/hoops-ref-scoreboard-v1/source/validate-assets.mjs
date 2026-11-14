/** Independent glTF, rig, keyframe and full-vertex skin audit. No model mutation. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {Matrix4,Quaternion,Vector3} from '../vendor/three.module.js';
const require=createRequire(import.meta.url);
const validator=require(process.env.GLTF_VALIDATOR_PATH??'/tmp/hoops-ref-validation/node_modules/gltf-validator');
const root=new URL('../',import.meta.url),expected=['idle','run','whistle','foul','three_points','direction'];
const canonical=JSON.parse(await readFile(new URL('motion/skeleton.json',root)));
const motion=JSON.parse(await readFile(new URL('motion/motions.json',root)));
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const types={5121:[1,'getUint8',255],5123:[2,'getUint16',65535],5125:[4,'getUint32',4294967295],5126:[4,'getFloat32',1],5120:[1,'getInt8',127],5122:[2,'getInt16',32767]};
const findings=[];
function check(value,message){if(!value)findings.push(message);return Boolean(value);}
function open(bytes){
  check(bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'Invalid GLB envelope');
  const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength));
  const binary=bytes.subarray(28+jsonLength);
  const cache=new Map();
  function accessor(index){
    if(cache.has(index))return cache.get(index);
    const a=doc.accessors[index],v=doc.bufferViews[a.bufferView];
    if(a.sparse)throw new Error('Independent decoder deliberately rejects sparse data');
    const [size,method,max]=types[a.componentType],width=widths[a.type],stride=v.byteStride??size*width;
    const data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength),values=[];
    for(let i=0;i<a.count;i++){const row=[];for(let k=0;k<width;k++){let value=data[method]((v.byteOffset??0)+(a.byteOffset??0)+i*stride+k*size,true);if(a.normalized)value=Math.max(-1,value/max);row.push(value);}values.push(row);}
    cache.set(index,values);return values;
  }
  return {doc,binary,accessor};
}
function matrices(asset,animation,time){
  const {doc,accessor}=asset,transforms=doc.nodes.map(n=>({t:[...(n.translation??[0,0,0])],q:[...(n.rotation??[0,0,0,1])],s:[...(n.scale??[1,1,1])]}));
  for(const channel of animation?.channels??[]){const sampler=animation.samplers[channel.sampler],times=accessor(sampler.input).map(v=>v[0]),values=accessor(sampler.output);let i=0;while(i<times.length-2&&times[i+1]<time-1e-7)i++;const u=times[i+1]!==undefined?Math.max(0,Math.min(1,(time-times[i])/(times[i+1]-times[i]))):0;const a=values[i],b=values[Math.min(i+1,values.length-1)];const t=transforms[channel.target.node];if(channel.target.path==='rotation')t.q=new Quaternion(...a).slerp(new Quaternion(...b),u).toArray();else if(channel.target.path==='translation')t.t=a.map((v,k)=>v+(b[k]-v)*u);else if(channel.target.path==='scale')t.s=a.map((v,k)=>v+(b[k]-v)*u);}
  const parents=new Map();doc.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
  const world=[];
  function get(i){if(world[i])return world[i];const n=doc.nodes[i],t=transforms[i],local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...t.t),new Quaternion(...t.q),new Vector3(...t.s));world[i]=parents.has(i)?get(parents.get(i)).clone().multiply(local):local;return world[i];}
  doc.nodes.forEach((_,i)=>get(i));return world;
}
function geometry(asset){
  const {doc,accessor}=asset;let triangles=0,vertices=0,degenerate=0,minDoubleArea=Infinity,maxWeightSumError=0,invalidWeights=0;
  for(const mesh of doc.meshes??[])for(const p of mesh.primitives){const pos=accessor(p.attributes.POSITION),idx=p.indices===undefined?pos.map((_,i)=>[i]):accessor(p.indices);vertices+=pos.length;triangles+=idx.length/3;for(let i=0;i<idx.length;i+=3){const [a,b,c]=[idx[i][0],idx[i+1][0],idx[i+2][0]].map(j=>new Vector3(...pos[j]));const area=b.sub(a).cross(c.sub(a)).length();minDoubleArea=Math.min(minDoubleArea,area);if(area<1e-13)degenerate++;}
    if(p.attributes.WEIGHTS_0!==undefined){const weights=accessor(p.attributes.WEIGHTS_0),joints=accessor(p.attributes.JOINTS_0);for(let i=0;i<weights.length;i++){const sum=weights[i].reduce((s,v)=>s+v,0);maxWeightSumError=Math.max(maxWeightSumError,Math.abs(sum-1));if(weights[i].some(v=>!Number.isFinite(v)||v<0||v>1)||joints[i].some(j=>j<0||j>=18))invalidWeights++;}}
    for(const values of pos)if(values.some(v=>!Number.isFinite(v)))findings.push('Non-finite vertex');
  }
  return {triangles,vertices,degenerate,minDoubleArea,maxWeightSumError,invalidWeights};
}
function skinAudit(asset){
  const {doc,accessor}=asset,skin=doc.skins[0],rest=matrices(asset),inverse=accessor(skin.inverseBindMatrices).map(v=>new Matrix4().fromArray(v));
  let inverseBindMaxError=0;
  for(let j=0;j<skin.joints.length;j++){const m=rest[skin.joints[j]].clone().multiply(inverse[j]).elements;for(let k=0;k<16;k++)inverseBindMaxError=Math.max(inverseBindMaxError,Math.abs(m[k]-(k%5===0?1:0)));}
  const vertices=[];
  for(const n of doc.nodes)if(n.skin===0)for(const p of doc.meshes[n.mesh].primitives){const pos=accessor(p.attributes.POSITION),joint=accessor(p.attributes.JOINTS_0),weight=accessor(p.attributes.WEIGHTS_0);for(let i=0;i<pos.length;i++)vertices.push({p:new Vector3(...pos[i]),j:joint[i],w:weight[i]});}
  const p=new Vector3(),v=new Vector3();const clips=[];
  for(const animation of doc.animations){const entry=motion.clips.find(c=>c.id===animation.name),duration=entry.duration,times=[...new Set([...Array.from({length:Math.round(duration*120)+1},(_,i)=>i/120),...(entry.metadata.supports??[]).flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b),frameCount=times.length;let minY=Infinity,maxY=-Infinity,maxMagnitude=0,nonFinite=0,maxSupportSoleY=-Infinity,minSupportSoleY=Infinity,supportSamples=0;const worstSole={};
    for(const time of times){const world=matrices(asset,animation,time),boneMatrices=skin.joints.map((j,i)=>world[j].clone().multiply(inverse[i])),footMin={LeftFoot:Infinity,RightFoot:Infinity};
      for(const vertex of vertices){p.set(0,0,0);for(let k=0;k<4;k++)if(vertex.w[k]>0)p.addScaledVector(v.copy(vertex.p).applyMatrix4(boneMatrices[vertex.j[k]]),vertex.w[k]);if(!Number.isFinite(p.x+p.y+p.z)){nonFinite++;continue;}minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);maxMagnitude=Math.max(maxMagnitude,p.length());for(const foot of ['LeftFoot','RightFoot']){const joint=skin.joints.findIndex(i=>doc.nodes[i].name===foot);let w=0;for(let k=0;k<4;k++)if(vertex.j[k]===joint)w+=vertex.w[k];if(w>.5)footMin[foot]=Math.min(footMin[foot],p.y);}}
      for(const support of entry.metadata.supports??[])if(time>=support.start-1e-6&&time<=support.end+1e-6){const y=footMin[support.bone];if(Number.isFinite(y)){minSupportSoleY=Math.min(minSupportSoleY,y);maxSupportSoleY=Math.max(maxSupportSoleY,y);supportSamples++;if(y<0&&(!worstSole[support.bone]||y<worstSole[support.bone].y))worstSole[support.bone]={time,y};}}
    }
    clips.push({id:animation.name,sampleRateHz:120,additionalSamples:'Exact authored support boundaries',frameCount,verticesPerFrame:vertices.length,minimumSkinnedY:minY,maximumSkinnedY:maxY,maximumFloorPenetrationMeters:Math.max(0,-minY),maximumVertexDistanceFromOrigin:maxMagnitude,nonFiniteVertices:nonFinite,supportSamples,minimumSupportingSoleY:minSupportSoleY,maximumSupportingSoleY:maxSupportSoleY,worstSupportingSole:worstSole});
  }
  return {inverseBindMaxError,clips};
}
const nativeSources=new Map(await Promise.all(motion.clips.map(async c=>[c.id,open(await readFile(new URL(c.asset,root)))])));
const assets=[];
for(const path of ['models/referee.glb','models/scoreboard.glb']){
  const before=findings.length,bytes=await readFile(new URL(path,root)),asset=open(bytes),{doc,accessor}=asset;
  const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:path,maxIssues:1000});
  check(validation.issues.numErrors===0,path+': Khronos validation errors');
  check((doc.buffers??[]).every(b=>!b.uri)&&(doc.images??[]).every(i=>!i.uri),path+': external resources');
  const g=geometry(asset);check(g.degenerate===0,path+': degenerate triangles');check(g.invalidWeights===0&&g.maxWeightSumError<1e-5,path+': invalid skin weights');
  const result={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),validator:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,messages:validation.issues.messages},geometry:g,selfContained:true};
  if(path.includes('referee')){
    const skin=doc.skins?.[0],parents=new Map();doc.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
    check(doc.skins?.length===1&&skin.joints.length===18,'Referee requires exactly 18 joints');
    const rig=canonical.bones.map((b,i)=>{const index=skin.joints[i],n=doc.nodes[index],parent=parents.has(index)?doc.nodes[parents.get(index)].name:null,translation=n.translation??[0,0,0],error=Math.max(...translation.map((v,k)=>Math.abs(v-b.restTranslationMeters[k])));const pass=n.name===b.name&&parent===b.parent&&error<1e-7&&(n.rotation??[0,0,0,1]).every((v,k)=>Math.abs(v-[0,0,0,1][k])<1e-7);check(pass,'Canonical rest mismatch '+b.name);return {name:n.name,parent,restTranslationMeters:translation,error,pass};});
    check(g.triangles>=1050&&g.triangles<=1350,'Referee outside approximately 1200 triangle budget');
    check(JSON.stringify(doc.animations.map(a=>a.name))===JSON.stringify(expected),'Incorrect clip inventory');
    result.rig=rig;
    result.animations=doc.animations.map(a=>{let maxStepError=0,maxQuaternionNormError=0;const counts=new Set(),paths=new Set(),entry=motion.clips.find(c=>c.id===a.name),native=nativeSources.get(a.name),nativeAnimation=native.doc.animations.find(n=>n.name===a.name);let seamAngle=0,seamTranslation=0,matchesSource=true;for(const channel of a.channels){const sampler=a.samplers[channel.sampler],times=accessor(sampler.input).map(v=>v[0]),values=accessor(sampler.output),name=doc.nodes[channel.target.node].name;counts.add(times.length);paths.add(name+':'+channel.target.path);check(sampler.interpolation===undefined||sampler.interpolation==='LINEAR','Unexpected animation interpolation');check(Math.abs(times[0])<1e-7&&Math.abs(times.at(-1)-entry.duration)<1e-6,a.name+': missing initial or final keyframe');check(times.length===Math.round(entry.duration*30)+1,a.name+': unexpected native sample count');for(let i=1;i<times.length;i++)maxStepError=Math.max(maxStepError,Math.abs(times[i]-times[i-1]-1/30));const sourceChannel=nativeAnimation.channels.find(c=>native.doc.nodes[c.target.node].name===name&&c.target.path===channel.target.path);if(!sourceChannel)matchesSource=false;else{const sourceSampler=nativeAnimation.samplers[sourceChannel.sampler];if(JSON.stringify(native.accessor(sourceSampler.input).map(v=>v[0]))!==JSON.stringify(times)||JSON.stringify(native.accessor(sourceSampler.output))!==JSON.stringify(values))matchesSource=false;}if(channel.target.path==='rotation'){for(const q of values)maxQuaternionNormError=Math.max(maxQuaternionNormError,Math.abs(Math.hypot(...q)-1));seamAngle=Math.max(seamAngle,new Quaternion(...values[0]).angleTo(new Quaternion(...values.at(-1))));}else if(channel.target.path==='translation'&&!(a.name==='run'&&name==='Root'))seamTranslation=Math.max(seamTranslation,new Vector3(...values[0]).distanceTo(new Vector3(...values.at(-1))));}
      check(matchesSource,a.name+': final mesh animation differs from delivered animation-only GLB');check(maxStepError<1e-6&&maxQuaternionNormError<1e-5,a.name+': sampling or quaternion normalization');check(canonical.bones.every(b=>paths.has(b.name+':rotation')),a.name+': missing bone rotation track');check(seamAngle<.001&&seamTranslation<1e-5,a.name+': body endpoint seam');return {id:a.name,sampleRateHz:30,sampleCounts:[...counts],matchesAnimationOnlySource:matchesSource,maxSampleStepError:maxStepError,maxQuaternionNormError,bodyEndpointAngleRadians:seamAngle,bodyEndpointTranslationMeters:seamTranslation};});
    result.skin=skinAudit(asset);check(result.skin.inverseBindMaxError<1e-5,'Invalid inverse binds');for(const c of result.skin.clips){check(c.nonFiniteVertices===0,'Non-finite skinned vertices '+c.id);check(c.maximumFloorPenetrationMeters<=.003,c.id+': actual skinned floor penetration exceeds 3mm');}
  }else{
    const digits=doc.nodes.filter(n=>/^digit_(front|right|back|left)_/.test(n.name));check(digits.length===52,'Board needs 52 digit quads');check(doc.images.length===1&&doc.textures.length===1,'Board requires one shared atlas');
    for(const n of digits){const p=doc.meshes[n.mesh].primitives;check(p.length===1&&accessor(p[0].attributes.POSITION).length===4&&accessor(p[0].indices).length===6,n.name+': digit must be one quad');}
    result.scoreboard={faces:['front','right','back','left'].map(face=>({face,digitCount:digits.filter(n=>n.name.startsWith('digit_'+face+'_')).length})),digitQuads:digits.length,textureCount:doc.textures.length,imageCount:doc.images.length,lampCount:doc.nodes.filter(n=>n.name.startsWith('lamp_')).length};
  }
  result.pass=findings.length===before;assets.push(result);
}
const report={schemaVersion:1,method:'Independent unmodified Khronos glTF Validator + explicit binary accessor, canonical rig, keyframe and full-vertex linear blend skin audit',validatorVersion:validator.version(),limits:{refereeTriangleRange:[1050,1350],maxActualSkinnedFloorPenetrationMeters:.003,nativeKeyframeRateHz:30,fullVertexAuditRateHz:120},pass:findings.length===0,findings,assets};
await mkdir(new URL('verification/',root),{recursive:true});await writeFile(new URL('verification/assets.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,findings,assets:assets.map(a=>({path:a.path,triangles:a.geometry.triangles,validator:a.validator.errors,skin:a.skin?.clips.map(c=>({id:c.id,minY:c.minimumSkinnedY,supportMin:c.minimumSupportingSoleY,supportMax:c.maximumSupportingSoleY}))}))},null,2));
if(!report.pass)process.exitCode=1;
