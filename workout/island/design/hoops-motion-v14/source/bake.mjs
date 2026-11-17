// SPDX-License-Identifier: CC0-1.0
// Bake native canonical animation-only GLBs and one shared basketball mesh.
// The original CC0 guard mesh is rest-retargeted; no new character is drawn.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CANON_BONES} from '../../../minigames/athletes-core.mjs';
import {unpack,compact,pack,readAccessor} from '../../soccer-header-v1/source/glb.mjs';

const base=new URL('../',import.meta.url),runtime=new URL('runtime/',base);
await fs.mkdir(new URL('clips/',runtime),{recursive:true});
await fs.mkdir(new URL('reference/',runtime),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
function writer(document,binary=Buffer.alloc(0)){
 const parts=[binary];let length=binary.length;
 return {
  accessor(values,width,type=width===1?'SCALAR':width===3?'VEC3':width===4?'VEC4':'MAT4'){
   const bytes=Buffer.from(new Float32Array(values).buffer),padding=(4-length%4)%4;
   if(padding){parts.push(Buffer.alloc(padding));length+=padding;}
   const view=document.bufferViews.length;
   document.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});parts.push(bytes);length+=bytes.length;
   const a={bufferView:view,componentType:5126,count:values.length/width,type};
   if(type==='SCALAR'){a.min=[Math.min(...values)];a.max=[Math.max(...values)];}
   if(type==='VEC3'){a.min=[0,1,2].map(k=>Math.min(...values.filter((v,i)=>i%3===k)));a.max=[0,1,2].map(k=>Math.max(...values.filter((v,i)=>i%3===k)));}
   document.accessors.push(a);return document.accessors.length-1;
  },
  finish(){document.buffers=[{byteLength:length}];return Buffer.concat(parts);},
 };
}
const canonicalNodes=()=>CANON_BONES.map(b=>({name:b.name,translation:[...b.rest],children:CANON_BONES.flatMap((c,i)=>c.parent===b.name?[i]:[])}));
const worldPositions=nodes=>{
 const out={};
 for(const n of nodes){const parent=nodes.find(p=>p.children?.includes(nodes.indexOf(n))),a=out[parent?.name]??[0,0,0];out[n.name]=(n.translation??[0,0,0]).map((v,i)=>v+a[i]);}
 return out;
};
// Rest-space weighted affine remap: each segment keeps the existing topology,
// texture, material and weights, and is fitted to the canonical18 proportions.
const sourceURL=new URL('../../../assets/hoops-tall/guard.glb',import.meta.url);
const sourceBytes=await fs.readFile(sourceURL),source=unpack(sourceBytes),model=structuredClone(source.document);
const modelWriter=writer(model,source.binary),sourceWorld=worldPositions(model.nodes),targetNodes=canonicalNodes(),targetWorld=worldPositions(targetNodes);
const segmentScale=name=>{
 const old=model.nodes.find(n=>n.name===name),fresh=targetNodes.find(n=>n.name===name);
 const oldChildren=(old.children??[]).map(i=>model.nodes[i]).filter(n=>targetWorld[n.name]);
 const newChildren=(fresh.children??[]).map(i=>targetNodes[i]);
 const main=oldChildren.find(n=>n.name.endsWith('ForeArm')||n.name.endsWith('Hand')||n.name.endsWith('Leg')||n.name.endsWith('Foot')||n.name==='Spine'||n.name==='Chest'||n.name==='Neck');
 const next=main&&newChildren.find(n=>n.name===main.name);
 if(main&&next){const ratio=Math.hypot(...next.translation)/Math.hypot(...main.translation);return [Math.min(1,ratio+.12),ratio,Math.min(1,ratio+.12)];}
 if(name.endsWith('Foot'))return [.9,.985,.9];
 if(name.endsWith('Hand'))return [.78,.78,.78];
 if(name==='Head'||name==='Neck')return [.90,.90,.90];
 return [.85,.85,.85];
};
const scales=Object.fromEntries(CANON_BONES.map(b=>[b.name,segmentScale(b.name)]));
const normalized=(a,i)=>{
 const d=source.document.accessors[i],f=d.normalized?({5121:255,5123:65535,5120:127,5122:32767}[d.componentType]??1):1;
 return a.map(v=>Math.max(-1,v/f));
};
for(const mesh of model.meshes)for(const p of mesh.primitives){
 const position=readAccessor(source,p.attributes.POSITION).values,normal=readAccessor(source,p.attributes.NORMAL).values;
 const joints=readAccessor(source,p.attributes.JOINTS_0).values,weights=normalized(readAccessor(source,p.attributes.WEIGHTS_0).values,p.attributes.WEIGHTS_0);
 const positions=[],normals=[];
 for(let i=0;i<position.length/3;i++){
  const old=position.slice(i*3,i*3+3),n=normal.slice(i*3,i*3+3),q=[0,0,0],nn=[0,0,0];let total=0;
  for(let k=0;k<4;k++){
   const w=weights[i*4+k];if(!w)continue;total+=w;
   const j=source.document.skins[0].joints[joints[i*4+k]],name=source.document.nodes[j].name;
   for(let a=0;a<3;a++){q[a]+=w*(targetWorld[name][a]+(old[a]-sourceWorld[name][a])*scales[name][a]);nn[a]+=w*n[a]/scales[name][a];}
  }
  const nl=Math.hypot(...nn)||1;positions.push(...q.map(v=>v/Math.max(1e-9,total)));normals.push(...nn.map(v=>v/nl));
 }
 p.attributes.POSITION=modelWriter.accessor(positions,3);p.attributes.NORMAL=modelWriter.accessor(normals,3);
}
for(const b of CANON_BONES){const node=model.nodes.find(n=>n.name===b.name);node.translation=[...b.rest];delete node.rotation;delete node.scale;}
const ibm=CANON_BONES.flatMap(b=>{const p=targetWorld[b.name];return [1,0,0,0,0,1,0,0,0,0,1,0,-p[0],-p[1],-p[2],1];});
model.skins[0].inverseBindMatrices=modelWriter.accessor(ibm,16,'MAT4');model.skins[0].name='canonical18-basketball-rest-retarget';
delete model.animations;
model.asset.generator='hoops-motion-v14: weighted rest-space retarget of original CC0 hoops-tall guard';
model.asset.copyright='Original CC0-1.0 basketball mesh and materials; see LICENSES.md';
model.extras={library:'hoops-motion-v14',canonicalBoneCount:18,sourceMesh:'assets/hoops-tall/guard.glb',sourceSha256:sha(sourceBytes),retarget:'weighted rest-space affine fit; original topology, texture, materials and skin weights',compression:'none'};
const modelBytes=compact(model,modelWriter.finish());await fs.writeFile(new URL('reference/athlete.glb',runtime),modelBytes);
await fs.writeFile(new URL('../verification/model-provenance.json',runtime),JSON.stringify({source:'workout/island/assets/hoops-tall/guard.glb',sourceSha256:sha(sourceBytes),sourceBytes:sourceBytes.length,target:'runtime/reference/athlete.glb',targetSha256:sha(modelBytes),targetBytes:modelBytes.length,skeleton:CANON_BONES,localSegmentScales:scales,license:'CC0-1.0',meshChanged:'Rest-space affine fit only; original UVs, topology, weights, texture and material surfaces retained.'},null,2)+'\n');
if(process.argv.includes('--model-only')){console.log('Baked shared canonical basketball reference model.');process.exit(0);}

const sourceMotion=await fs.readFile(new URL('motions.json',runtime)),data=JSON.parse(sourceMotion),entries=[];
for(const motion of data.clips){
 const document={asset:{version:'2.0',generator:'Original CC0 hoops-motion-v14 canonical18 30Hz',copyright:'CC0-1.0'},scene:0,scenes:[{nodes:[0]}],nodes:canonicalNodes(),buffers:[],bufferViews:[],accessors:[],animations:[],extras:{library:'hoops-motion-v14',id:motion.id,nativeRate:30,canonicalBoneCount:18,rootMotion:false,compression:'none',mesh:'../reference/athlete.glb'}};
 const w=writer(document),input=w.accessor(motion.frames.map(f=>f.time),1),animation={name:motion.id,samplers:[],channels:[],extras:{nativeRate:30,rootMotion:false,license:'CC0-1.0'}};
 function channel(name,path,values,width){const node=document.nodes.findIndex(n=>n.name===name);if(node<0)throw Error('Missing '+name);animation.channels.push({sampler:animation.samplers.length,target:{node,path}});animation.samplers.push({input,output:w.accessor(values,width),interpolation:'LINEAR'});}
 for(const {name}of CANON_BONES){let previous;const values=[];for(const f of motion.frames){let q=f.rotations[name],n=Math.hypot(...q);q=q.map(v=>v/n);if(previous&&q.reduce((s,v,i)=>s+v*previous[i],0)<0)q=q.map(v=>-v);values.push(...q);previous=q;}channel(name,'rotation',values,4);}
 channel('Hips','translation',motion.frames.flatMap(f=>f.hips),3);
 document.animations=[animation];const binary=w.finish(),bytes=pack(document,binary);await fs.writeFile(new URL(`clips/${motion.id}.glb`,runtime),bytes);
 const {frames,...entry}=motion;entries.push({...entry,asset:`clips/${motion.id}.glb`,bytes:bytes.length,sha256:sha(bytes),compression:'none',meshAsset:'reference/athlete.glb'});
}
await fs.writeFile(new URL('catalog.json',runtime),JSON.stringify({...data,clips:entries,sourceMotionSha256:sha(sourceMotion),sharedModel:{asset:'reference/athlete.glb',bytes:modelBytes.length,sha256:sha(modelBytes),source:'workout/island/assets/hoops-tall/guard.glb',sourceSha256:sha(sourceBytes),license:'CC0-1.0'}},null,2)+'\n');

// Wire-compatible tall layout. The canonical profile is declared explicitly;
// applying it to original tall proportions requires the consumer's retargeter.
const b64=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
function sample(keys,t){if(t<=keys[0].time)return keys[0].position;for(let i=1;i<keys.length;i++)if(t<=keys[i].time){const a=keys[i-1],b=keys[i],u=(t-a.time)/(b.time-a.time);return a.position.map((v,k)=>v+(b.position[k]-v)*u);}return keys.at(-1).position;}
const packData={version:1,fps:30,bones:CANON_BONES.map(b=>b.name),profiles:{canonical:{height:1.69,hips:[0,.86,0],palm:[0,-.08,.025]}},coordinateConvention:'canonical18 absolute local rotations; hips offsets in metres',profileNote:'Canonical reference mesh. Original hoops-tall guard/wing/center proportions require retargeting before use.',encodedBallConvention:'Int16 /10000 only for bounded carry/dribble tracks. Release actions use ball:null; the complete independent ball trajectory remains in motions.json and catalog.json for the simulation and QA.',clips:{}};
for(const motion of data.clips){
 const boundedBall=motion.id==='idle_ball'||motion.id.startsWith('dribble_');
 const n=motion.frames.length,quat=new Int16Array(n*18*4),hips=new Int16Array(n*3),ball=motion.ball&&boundedBall?new Int16Array(n*3):null;
 motion.frames.forEach((f,i)=>{CANON_BONES.forEach((b,j)=>{const q=f.rotations[b.name];for(let k=0;k<4;k++)quat[(i*18+j)*4+k]=Math.round(q[k]*32767);});for(let k=0;k<3;k++){const v=Math.round((f.hips[k]-CANON_BONES[1].rest[k])*10000);if(v<-32768||v>32767)throw Error(`Hips outside tall Int16 range: ${motion.id}`);hips[i*3+k]=v;}if(ball){const bp=sample(motion.ball.samples,f.time);for(let k=0;k<3;k++){const v=Math.round(bp[k]*10000);if(v<-32768||v>32767)throw Error(`Ball outside tall Int16 range: ${motion.id}; use the full trajectory instead`);ball[i*3+k]=v;}}});
 const events={};for(const e of motion.events??[])(events[e.type??e.name]??=[]).push(e.time??e.timeSeconds??e.atSeconds);
 packData.clips[motion.id]={duration:motion.durationSeconds,frames:n,loop:!!motion.loop,kind:motion.category??motion.kind,events,refSpeed:motion.speedMps??0,rootEnd:motion.referenceTravel?.samples?.at(-1)?.position??[0,0,0],quat:b64(quat),hips:b64(hips),ball:ball?b64(ball):null,jumpScale:null};
}
await fs.writeFile(new URL('motion.json',runtime),JSON.stringify(packData)+'\n');
console.log(`Baked ${entries.length} animation GLBs, shared canonical basketball athlete and tall-format motion.json.`);
