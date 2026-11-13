// SPDX-License-Identifier: CC0-1.0
// מקור: בדיקת מגע מקורית של קודקודי הרשת המוצללים, לא נקודות שלד בלבד.
// node workout/island/design/hockey-v2/source/mesh-contact-audit.mjs
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CANON_NAMES,normaliseSoccerClip,sampleCanonical,jointWorld,qrotate} from '../../../minigames/athletes-core.mjs';

const folder=new URL('../',import.meta.url);
const clipBytes=readFileSync(process.env.HOCKEY_FIX_CLIPS || new URL('clips.json',folder));
const pack=JSON.parse(clipBytes);
const typeSize={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const arity={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const methods={5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const round=x=>+x.toFixed(7);
function load(relative) {
  const bytes=readFileSync(new URL('../../hockey-v1/'+relative,import.meta.url));let json,bin;
  for(let at=12;at<bytes.length;){const n=bytes.readUInt32LE(at),kind=bytes.readUInt32LE(at+4);if(kind===0x4e4f534a)json=JSON.parse(bytes.subarray(at+8,at+8+n).toString());if(kind===0x004e4942)bin=bytes.subarray(at+8,at+8+n);at+=8+n;}
  function read(index) {
    const a=json.accessors[index],v=json.bufferViews[a.bufferView],size=typeSize[a.componentType],n=arity[a.type],stride=v.byteStride||n*size,offset=(v.byteOffset||0)+(a.byteOffset||0),out=[];
    for(let i=0;i<a.count;i++){const row=[];for(let k=0;k<n;k++)row.push(bin[methods[a.componentType]](offset+i*stride+k*size));if(a.normalized){const d={5120:127,5121:255,5122:32767,5123:65535}[a.componentType];for(let k=0;k<n;k++)row[k]=Math.max(-1,row[k]/d);}out.push(row);}
    return out;
  }
  const skin=json.skins?.[0],bones=skin?.joints.map(i=>json.nodes[i].name),inverseBind=skin?read(skin.inverseBindMatrices):null;
  const transform=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
  const vertices=[];
  for(const primitive of json.meshes[0].primitives) {
    const a=primitive.attributes,position=read(a.POSITION),joints=a.JOINTS_0===undefined?null:read(a.JOINTS_0),weights=a.WEIGHTS_0===undefined?null:read(a.WEIGHTS_0),used=new Set(primitive.indices===undefined?position.map((_,i)=>i):read(primitive.indices).flat());
    const material=json.materials[primitive.material]?.name||'';
    for(const index of used) {
      const p=position[index],bindings=[];
      if(skin)for(let k=0;k<4;k++)if(weights[index][k]>0)bindings.push({bone:bones[joints[index][k]],weight:weights[index][k],point:transform(inverseBind[joints[index][k]],p)});
      vertices.push({position:p,bindings,material,index});
    }
  }
  return {json,vertices,sha256:createHash('sha256').update(bytes).digest('hex')};
}
const models={skater:load('models/skater.glb'),goalie:load('models/goalie.glb')},stick=load('models/stick.glb');
const gripName=pack.stickAttachment?.node||'RightHandGrip';
const grip=stick.json.nodes.find(n=>n.name===gripName)||stick.json.nodes.find(n=>n.name==='RightHandGrip');
const gripPosition=grip?.translation||[0,0,0],handOffset=pack.stickAttachment?.handLocalMeters||[0,0,0];
function referenceAt(state,t){
 const keys=state.referenceRootMotion||[];
 if(!keys.length)return (state.referenceVelocityMps||[0,0,0]).map(v=>v*t);
 let i=0;while(i<keys.length-2&&keys[i+1].timeSeconds<t)i++;
 const a=keys[i],b=keys[Math.min(i+1,keys.length-1)],u=Math.max(0,Math.min(1,(t-a.timeSeconds)/(b.timeSeconds-a.timeSeconds||1)));
 return a.translationMeters.map((v,k)=>v+(b.translationMeters[k]-v)*u);
}
const clips=[];
for(const [id,state] of Object.entries(pack.states)) {
  if(process.env.HOCKEY_AUDIT_IDS&&!process.env.HOCKEY_AUDIT_IDS.split(',').includes(id))continue;
  const clip={...normaliseSoccerClip(id,state,'hockey-v1'),loop:false},role=state.role||(/^goalie/.test(id)?'goalie':'skater'),model=models[role];
  const N=Math.ceil(clip.dur*60),materials={},rows=[];
  let bodyMin={y:Infinity},stickMin={y:Infinity},framesBodyBelow5mm=0,framesStickBelow5mm=0;
  for(let frame=0;frame<=N;frame++) {
    const t=clip.dur*frame/N,w=jointWorld(sampleCanonical(clip,t)),root=referenceAt(state,t);let bodyY=Infinity,stickY=Infinity;
    for(const vertex of model.vertices) {
      const p=[0,0,0];
      for(const binding of vertex.bindings){const b=w[binding.bone],v=add(qrotate(b.q,binding.point),b.p);for(let k=0;k<3;k++)p[k]+=v[k]*binding.weight;}
      for(let k=0;k<3;k++)p[k]+=root[k];
      if(p[1]<bodyMin.y||!materials[vertex.material]||p[1]<materials[vertex.material].y){
        const result={y:round(p[1]),timeSeconds:round(t),material:vertex.material,vertex:vertex.index,positionMeters:p.map(round)};
        if(p[1]<bodyMin.y)bodyMin=result;
        if(!materials[vertex.material]||p[1]<materials[vertex.material].y)materials[vertex.material]=result;
      }
      bodyY=Math.min(bodyY,p[1]);
    }
    for(const vertex of stick.vertices) {
      const p=add(w.RightHand.p,qrotate(w.RightHand.q,add(sub(vertex.position,gripPosition),handOffset)));
      for(let k=0;k<3;k++)p[k]+=root[k];
      if(p[1]<stickMin.y)stickMin={y:round(p[1]),timeSeconds:round(t),material:vertex.material,vertex:vertex.index,positionMeters:p.map(round)};
      stickY=Math.min(stickY,p[1]);
    }
    if(bodyY<-.005)framesBodyBelow5mm++;
    if(stickY<-.005)framesStickBelow5mm++;
    rows.push({timeSeconds:round(t),bodyMinYMeters:round(bodyY),stickMinYMeters:round(stickY)});
  }
  clips.push({id,role,samples:N+1,bodyMin,stickMin,framesBodyBelow5mm,framesStickBelow5mm,materials,samplesMinY:rows});
}
const result={schemaVersion:1,license:'CC0-1.0',source:'source/mesh-contact-audit.mjs',
  inputs:{clipsSha256:createHash('sha256').update(clipBytes).digest('hex'),skaterSha256:models.skater.sha256,goalieSha256:models.goalie.sha256,stickSha256:stick.sha256},
  methodHe:'דגימת כל קודקודי המשולשים המצוירים ב־60 הרץ, עם משקלי הרשת ומטריצות הקשירה של GLB. קודקודי המקל מותמרים דרך יד ימין ואחיזת המקל; מסלול השורש מתווסף לכל הקודקודים. נמדדת חדירה למישור קרח Y=0 בלבד. הבדיקה אינה מאבחנת התנגשויות בין איברים או בין המקל לגוף.',
  fps:60,floorYMeters:0,toleranceMeters:.005,stickAttachment:{gripName:grip?.name,gripPosition,handOffset},
  summary:{clipCount:clips.length,bodyFailures:clips.filter(c=>c.framesBodyBelow5mm).map(c=>({id:c.id,...c.bodyMin})),stickFailures:clips.filter(c=>c.framesStickBelow5mm).map(c=>({id:c.id,...c.stickMin})),allBodyAboveTolerance:clips.every(c=>!c.framesBodyBelow5mm),allStickAboveTolerance:clips.every(c=>!c.framesStickBelow5mm)},clips};
mkdirSync(new URL('evidence/',folder),{recursive:true});
writeFileSync(process.env.HOCKEY_FIX_MESH_OUT || new URL('evidence/mesh-contact.json',folder),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.summary));
