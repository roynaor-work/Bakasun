// SPDX-License-Identifier: CC0-1.0
// Independent delivery checks: decode the final GLB buffers, not the authoring
// functions. CPU skinning below also probes the delivered mesh at every frame.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3,Quaternion,Triangle} from '../../../vendor/three.module.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contract=JSON.parse(await fs.readFile(path.join(root,'../motion2/soccer.json'),'utf8')).skeleton.bones;
const catalog=JSON.parse(await fs.readFile(path.join(root,'runtime/catalog.json'),'utf8'));
const motions=JSON.parse(await fs.readFile(path.join(root,'runtime/motions.json'),'utf8'));
const main=['idle','jog','whistle','point_penalty','advantage','yellow_card','red_card','goal_signal'];
const assistant=['idle','assistant_run','assistant_offside'];
const expectedIds=[...main,'assistant_run','assistant_offside'];
const report={schemaVersion:1,validator:'Independent GLB accessor decode and CPU skinning',
  generatedAt:new Date().toISOString(),sampleHz:30,checks:0,failures:[],models:[],clips:[],semantics:[],
  limits:{triangles:[900,1500],quaternionNormError:0.000002,soleFloorMeters:0.008,
    meshFloorMeters:0.012,supportDriftMeters:0.008,sourceFloatError:0.000001,whistleTipLipMeters:0.01}};
function check(ok,message){report.checks++;if(!ok)report.failures.push(message);return ok;}
function near(a,b,e=1e-6){return a.length===b.length&&a.every((v,i)=>Number.isFinite(v)&&Math.abs(v-b[i])<=e);}
function maxError(a,b){return a.length===b.length?Math.max(0,...a.map((v,i)=>Math.abs(v-b[i]))):Infinity;}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
function clean(v){return Number.isFinite(v)?Number(v.toFixed(7)):null;}
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const components={5120:[1,'getInt8',127],5121:[1,'getUint8',255],5122:[2,'getInt16',32767],
  5123:[2,'getUint16',65535],5125:[4,'getUint32',4294967295],5126:[4,'getFloat32',1]};
async function readGLB(asset){
  const bytes=await fs.readFile(path.join(root,asset));
  if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error(`${asset}: GLB 2 header`);
  check(bytes.readUInt32LE(8)===bytes.length,`${asset}: header byte length`);
  let json,binary;for(let p=12;p<bytes.length;){
    const n=bytes.readUInt32LE(p),kind=bytes.readUInt32LE(p+4);p+=8;
    check(n%4===0&&p+n<=bytes.length,`${asset}: aligned chunk bounds`);
    if(kind===0x4e4f534a)json=JSON.parse(bytes.subarray(p,p+n).toString());
    if(kind===0x004e4942)binary=bytes.subarray(p,p+n);p+=n;
  }
  if(!json||!binary)throw Error(`${asset}: JSON and BIN chunks required`);
  check(json.asset.version==='2.0',`${asset}: glTF 2 version`);
  check((json.buffers?.length??0)===1&&!json.buffers[0].uri,`${asset}: single embedded buffer`);
  check(json.buffers[0].byteLength<=binary.length&&binary.length-json.buffers[0].byteLength<=3,`${asset}: binary length`);
  check(!(json.extensionsRequired?.length),`${asset}: no required decoder extensions`);
  const cache=new Map(),view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  function accessor(id){
    if(cache.has(id))return cache.get(id);
    const a=json.accessors[id],v=json.bufferViews[a.bufferView],width=widths[a.type],c=components[a.componentType];
    if(!a||!v||!width||!c||a.sparse)throw Error(`${asset}: unsupported accessor ${id}`);
    const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||width*c[0];
    if(start+(a.count-1)*stride+width*c[0]>(v.byteOffset||0)+v.byteLength||start<0)throw Error(`${asset}: accessor ${id} bufferView bounds`);
    if(start+(a.count-1)*stride+width*c[0]>binary.length)throw Error(`${asset}: accessor ${id} BIN bounds`);
    const data=[];
    for(let i=0;i<a.count;i++)for(let k=0;k<width;k++){
      let n=view[c[1]](start+i*stride+k*c[0],true);
      if(a.normalized)n=Math.max(a.componentType===5120||a.componentType===5122?-1:0,n/c[2]);
      data.push(n);
    }
    check(data.every(Number.isFinite),`${asset}: accessor ${id} finite values`);
    const result={...a,width,data};cache.set(id,result);return result;
  }
  for(let i=0;i<(json.accessors?.length??0);i++)accessor(i);
  const names=new Map(json.nodes.map((n,i)=>[n.name,i]));
  check(names.size===json.nodes.length,`${asset}: unique node names`);
  const parents=new Map();json.nodes.forEach((n,i)=>(n.children||[]).forEach(child=>{
    check(!parents.has(child),`${asset}: node ${child} single parent`);parents.set(child,i);
  }));
  return {asset,bytes,json,binary,accessor,names,parents};
}
function staticRig(g){
  const {json:j,names,parents,accessor}=g,label=g.asset;
  check(j.skins?.length===1,`${label}: exactly one skin`);
  const skin=j.skins?.[0];if(!skin)return;
  check(skin.joints.length===18,`${label}: exactly canonical 18 skin joints`);
  check(near(skin.joints.map(i=>contract.findIndex(b=>b.name===j.nodes[i]?.name)),contract.map((_,i)=>i),0),`${label}: canonical joint order`);
  const world={};
  for(const b of contract){
    const i=names.get(b.name),n=j.nodes[i];if(!check(!!n,`${label}: joint ${b.name}`))continue;
    check((j.nodes[parents.get(i)]?.name??null)===b.parent,`${label}: ${b.name} exact parent`);
    check(near(n.translation||[0,0,0],b.restTranslationMeters,1e-12),`${label}: ${b.name} exact rest translation`);
    check(near(n.rotation||[0,0,0,1],[0,0,0,1],1e-12),`${label}: ${b.name} identity bind rotation`);
    check(near(n.scale||[1,1,1],[1,1,1],1e-12)&&!n.matrix,`${label}: ${b.name} identity bind scale`);
    world[b.name]=b.restTranslationMeters.map((v,k)=>v+(world[b.parent]?.[k]||0));
  }
  const ibm=accessor(skin.inverseBindMatrices);
  check(ibm.type==='MAT4'&&ibm.count===18,`${label}: 18 inverse bind matrices`);
  for(let i=0;i<18;i++){
    const expected=Array.from(new Float32Array(new Matrix4().makeTranslation(...world[contract[i].name].map(v=>-v)).toArray()));
    check(near(ibm.data.slice(i*16,i*16+16),expected,0),`${label}: ${contract[i].name} exact float32 inverse bind matrix`);
  }
}
function meshStatic(g,isAssistant){
  const {json:j,accessor,names,parents}=g,label=g.asset;
  let triangles=0,vertices=0,skinnedVertices=0,weightError=0;
  const seenWeights=new Set();
  for(const n of j.nodes){if(n.mesh===undefined)continue;
    for(const p of j.meshes[n.mesh].primitives){
      check((p.mode??4)===4,`${label}: triangle primitives`);
      const pos=accessor(p.attributes.POSITION),indices=p.indices===undefined?null:accessor(p.indices);
      vertices+=pos.count;triangles+=(indices?.count??pos.count)/3;
      check(pos.type==='VEC3'&&pos.count>0,`${label}: actual vertex positions`);
      check((indices?.count??pos.count)%3===0,`${label}: complete triangles`);
      if(indices)check(indices.data.every(i=>Number.isInteger(i)&&i>=0&&i<pos.count),`${label}: valid vertex indices`);
      if(n.skin===undefined)continue;
      check(p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined,`${label}: skin attributes`);
      const joints=accessor(p.attributes.JOINTS_0),weights=accessor(p.attributes.WEIGHTS_0);
      if(seenWeights.has(p.attributes.WEIGHTS_0))continue;seenWeights.add(p.attributes.WEIGHTS_0);
      check(joints.count===pos.count&&weights.count===pos.count&&joints.width===4&&weights.width===4,`${label}: four influences per vertex`);
      skinnedVertices+=pos.count;
      for(let i=0;i<pos.count;i++){
        const ix=joints.data.slice(i*4,i*4+4),w=weights.data.slice(i*4,i*4+4);
        weightError=Math.max(weightError,Math.abs(w.reduce((s,v)=>s+v,0)-1));
        check(ix.every(v=>Number.isInteger(v)&&v>=0&&v<18)&&w.every(v=>v>=0&&v<=1),`${label}: vertex ${i} valid skin influences`);
      }
    }
  }
  check(triangles>=900&&triangles<=1500,`${label}: about 1200 actual triangles (got ${triangles})`);
  check(skinnedVertices>200&&weightError<1e-5,`${label}: populated normalized skin weights`);
  check(j.images?.length>0&&j.images.every(i=>i.bufferView!==undefined&&!i.uri),`${label}: embedded texture images`);
  for(const image of j.images||[]){
    const v=j.bufferViews[image.bufferView],b=g.binary.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
    if(image.mimeType==='image/png')check(b.subarray(1,4).toString()==='PNG'&&b.readUInt32BE(16)===512&&b.readUInt32BE(20)===512,`${label}: 512px PNG atlas`);
  }
  if(isAssistant){
    const flag=names.get('Flag');check(flag!==undefined&&j.nodes[parents.get(flag)]?.name==='RightHand',`${label}: flag attached directly to right hand`);
    check(!names.has('YellowCard')&&!names.has('RedCard'),`${label}: assistant has flag equipment only`);
  }else{
    for(const prop of ['YellowCard','RedCard','Whistle']){
      const i=names.get(prop),n=j.nodes[i];check(i!==undefined&&j.nodes[parents.get(i)]?.name==='RightHand',`${label}: ${prop} separate right-hand child`);
      check(n?.mesh!==undefined&&near(n.scale||[],[0,0,0],0),`${label}: ${prop} hidden by default`);
    }
    check(j.nodes[names.get('YellowCard')]?.mesh!==j.nodes[names.get('RedCard')]?.mesh,`${label}: independent card meshes`);
  }
  return {triangles,vertexRecords:vertices,skinnedVertices,maxWeightSumError:clean(weightError),embeddedTextures:j.images?.length||0};
}
function decodeAnimation(g,a){
  const channels=new Map();
  for(const c of a.channels){
    const name=g.json.nodes[c.target.node].name,key=`${name}/${c.target.path}`,s=a.samplers[c.sampler];
    check(!channels.has(key),`${g.asset}/${a.name}: unique channel ${key}`);
    channels.set(key,{name,path:c.target.path,input:g.accessor(s.input),output:g.accessor(s.output),interpolation:s.interpolation||'LINEAR'});
  }
  return {name:a.name,channels,extras:a.extras};
}
function animationChecks(g,a,source){
  const label=`${g.asset}/${a.name}`,frames=source.frames,count=frames.length;
  check(source.sampleHz===30&&source.frameCount===count&&Math.round(source.durationSeconds*30)+1===count,
    `${label}: declared duration and 30Hz frame count agree`);
  check(a.extras?.sampleHz===30&&a.extras.rootMotion===false,`${label}: explicit 30Hz in-place animation`);
  for(const b of contract)check(a.channels.has(`${b.name}/rotation`),`${label}: rotation channel ${b.name}`);
  check(a.channels.has('Hips/translation'),`${label}: hips translation channel`);
  let normError=0,sourceError=0;
  for(const [key,c] of a.channels){
    check(c.input.type==='SCALAR'&&c.input.count===count&&c.output.count===count,`${label}: ${key} frame counts`);
    check(c.input.data.every((t,i)=>Math.abs(t-i/30)<1e-6),`${label}: ${key} exact 30Hz sample times`);
    if(contract.some(b=>b.name===c.name)){
      check(c.path==='rotation'||(c.name==='Hips'&&c.path==='translation'),`${label}: no animated bone scale or non-hips translation`);
      check(c.interpolation==='LINEAR',`${label}: bone linear/spherical interpolation`);
    }
    for(let i=0;i<count;i++){
      const values=c.output.data.slice(i*c.output.width,(i+1)*c.output.width);
      if(c.path==='rotation'){
        normError=Math.max(normError,Math.abs(Math.hypot(...values)-1));
        if(i){const previous=c.output.data.slice((i-1)*4,i*4);check(values.reduce((s,v,k)=>s+v*previous[k],0)>=-1e-8,`${label}: ${key} quaternion continuity frame ${i}`);}
        if(c.name==='Root')check(near(values,[0,0,0,1],1e-7),`${label}: zero Root motion frame ${i}`);
      }
      const target=c.path==='rotation'?frames[i].rotations[c.name]:c.name==='Hips'&&c.path==='translation'?frames[i].hips:
        c.path==='scale'?(g.json.nodes[g.names.get(c.name)].extras?.visibleScale||[1,1,1]).map(v=>v*(frames[i].props[c.name]||0)):null;
      if(target)sourceError=Math.max(sourceError,maxError(values,target));
    }
    if(c.path==='scale')check(c.interpolation==='STEP'&&!contract.some(b=>b.name===c.name),`${label}: discrete prop visibility only`);
  }
  check(normError<2e-6,`${label}: normalized quaternions`);
  check(sourceError<1e-6,`${label}: exported values match runtime frames`);
  if(source.loop){for(const c of a.channels.values())check(near(c.output.data.slice(0,c.output.width),c.output.data.slice(-c.output.width),2e-5),`${label}: ${c.name}/${c.path} seamless loop boundary`);}
  for(let i=0;i<count;i++){
    const active=['YellowCard','RedCard','Whistle'].filter(prop=>{
      const c=a.channels.get(`${prop}/scale`);return c&&c.output.data.slice(i*3,i*3+3).some(v=>v>0);
    });
    check(active.length<=1,`${label}: mutually exclusive props frame ${i}`);
    const intended={yellow_card:'YellowCard',red_card:'RedCard',whistle:'Whistle'}[a.name];
    check(active.every(n=>n===intended),`${label}: no inactive equipment leakage frame ${i}`);
    if(i===0||i===count-1)check(active.length===0,`${label}: props reset at entry and exit`);
  }
  if(g.names.has('YellowCard'))for(const prop of ['YellowCard','RedCard','Whistle']){
    check(a.channels.has(`${prop}/scale`),`${label}: explicit reset channel for ${prop}`);
    if(({YellowCard:'yellow_card',RedCard:'red_card',Whistle:'whistle'})[prop]===a.name)check(a.channels.get(`${prop}/scale`).output.data.some(v=>v>0),`${label}: intended equipment displayed`);
  }
  return {frameCount:count,durationSeconds:clean((count-1)/30),maxQuaternionNormError:clean(normError),maxRuntimeValueError:clean(sourceError)};
}
function transforms(g,a,frame){
  const locals=g.json.nodes.map(n=>({t:[...(n.translation||[0,0,0])],q:[...(n.rotation||[0,0,0,1])],s:[...(n.scale||[1,1,1])]}));
  for(const c of a.channels.values()){
    const value=c.output.data.slice(frame*c.output.width,(frame+1)*c.output.width);
    locals[g.names.get(c.name)][{translation:'t',rotation:'q',scale:'s'}[c.path]]=value;
  }
  const matrices=[];
  function calc(i){if(matrices[i])return matrices[i];const l=locals[i];
    const m=new Matrix4().compose(new Vector3(...l.t),new Quaternion(...l.q),new Vector3(...l.s));
    const parent=g.parents.get(i);if(parent!==undefined)m.premultiply(calc(parent));
    matrices[i]=m;return m;
  }
  g.json.nodes.forEach((_,i)=>calc(i));return {matrices,locals};
}
const position=(g,w,name,local=[0,0,0])=>new Vector3(...local).applyMatrix4(w.matrices[g.names.get(name)]);
function geometry(g){
  const out=[];
  for(let ni=0;ni<g.json.nodes.length;ni++){
    const n=g.json.nodes[ni];if(n.mesh===undefined)continue;
    for(const p of g.json.meshes[n.mesh].primitives){
      const pos=g.accessor(p.attributes.POSITION),ix=p.indices===undefined?Array.from({length:pos.count},(_,i)=>i):g.accessor(p.indices).data;
      const joints=n.skin===undefined?null:g.accessor(p.attributes.JOINTS_0),weights=n.skin===undefined?null:g.accessor(p.attributes.WEIGHTS_0);
      const used=[...new Set(ix)];out.push({node:ni,pos,joints,weights,used,indices:ix,skin:n.skin});
    }
  }return out;
}
function meshProbe(g,w,parts){
  const minimum={all:Infinity,LeftFoot:Infinity,RightFoot:Infinity};
  const matrices=g.json.skins.map(s=>{const ibm=g.accessor(s.inverseBindMatrices).data;
    return s.joints.map((joint,i)=>new Matrix4().multiplyMatrices(w.matrices[joint],new Matrix4().fromArray(ibm,i*16)));});
  for(const part of parts){
    if(part.skin===undefined&&w.locals[part.node].s.every(v=>v===0))continue;
    for(const i of part.used){
      const v=new Vector3(...part.pos.data.slice(i*3,i*3+3)),out=new Vector3(),influences={};
      if(part.skin===undefined)out.copy(v).applyMatrix4(w.matrices[part.node]);
      else for(let k=0;k<4;k++){
        const weight=part.weights.data[i*4+k],joint=part.joints.data[i*4+k];if(!weight)continue;
        out.addScaledVector(v.clone().applyMatrix4(matrices[part.skin][joint]),weight);
        const name=g.json.nodes[g.json.skins[part.skin].joints[joint]].name;influences[name]=(influences[name]||0)+weight;
      }
      minimum.all=Math.min(minimum.all,out.y);
      for(const side of ['LeftFoot','RightFoot'])if(influences[side]>.6)minimum[side]=Math.min(minimum[side],out.y);
    }
  }return minimum;
}
function headSurface(g,w,landmark,tip){
  let top=-Infinity,nearest=Infinity;
  const skin=g.json.skins[0],ibm=g.accessor(skin.inverseBindMatrices).data;
  const matrices=skin.joints.map((joint,i)=>new Matrix4().multiplyMatrices(w.matrices[joint],new Matrix4().fromArray(ibm,i*16)));
  const headJoint=skin.joints.indexOf(g.names.get('Head'));
  for(const part of geometry(g)){
    if(part.skin===undefined)continue;
    const points=new Map();
    for(const i of part.used){
      const weight=part.weights.data.slice(i*4,i*4+4).reduce((s,v,k)=>s+(part.joints.data[i*4+k]===headJoint?v:0),0);
      if(weight<.6)continue;
      const p=new Vector3(...part.pos.data.slice(i*3,i*3+3)),world=new Vector3();
      for(let k=0;k<4;k++)world.addScaledVector(p.clone().applyMatrix4(matrices[part.joints.data[i*4+k]]),part.weights.data[i*4+k]);
      points.set(i,world);top=Math.max(top,world.y);
    }
    if(landmark&&tip)for(let i=0;i<part.indices.length;i+=3){
      const vertices=part.indices.slice(i,i+3).map(v=>points.get(v));if(vertices.some(v=>!v))continue;
      const center=vertices.reduce((s,v)=>s.add(v),new Vector3()).multiplyScalar(1/3);
      if(center.distanceTo(landmark)>.08)continue;
      const closest=new Triangle(...vertices).closestPointToPoint(tip,new Vector3());nearest=Math.min(nearest,closest.distanceTo(tip));
    }
  }return {top,nearest};
}
function physicalChecks(g,a,source){
  const parts=geometry(g),feet={LeftFoot:[],RightFoot:[]},meshFoot={LeftFoot:[],RightFoot:[]};
  let meshMin=Infinity,soleMin=Infinity,meshMax=-Infinity;
  for(let i=0;i<source.frames.length;i++){
    const w=transforms(g,a,i),probe=meshProbe(g,w,parts);meshMin=Math.min(meshMin,probe.all);meshMax=Math.max(meshMax,probe.all);
    check(Number.isFinite(probe.all),`${g.asset}/${a.name}: CPU skinned vertices finite at ${i}`);
    for(const prop of ['YellowCard','RedCard','Whistle','Flag']){
      const node=g.names.get(prop);if(node===undefined||w.locals[node].s.every(v=>v===0))continue;
      const m=w.matrices[node],basis=[0,1,2].map(k=>new Vector3().setFromMatrixColumn(m,k));
      check(basis.every(v=>Math.abs(v.length()-1)<2e-6)&&Math.abs(basis[0].dot(basis[1]))<2e-6&&
        Math.abs(basis[1].dot(basis[2]))<2e-6&&Math.abs(basis[0].dot(basis[2]))<2e-6,
      `${g.asset}/${a.name}: ${prop} rigid orthonormal hand attachment at ${i}`);
      check(position(g,w,prop).distanceTo(position(g,w,'RightHand'))<.08,
        `${g.asset}/${a.name}: ${prop} stays at hand grip at ${i}`);
    }
    for(const side of ['LeftFoot','RightFoot']){
      const p=position(g,w,side,[0,-.08,0]);feet[side].push(p);meshFoot[side].push(probe[side]);soleMin=Math.min(soleMin,p.y);
    }
  }
  let floorError=0,drift=0,meshSupportError=0,supportSamples=0;
  check(near(source.metadata.soleLocal,[0,-.08,0],0),`${g.asset}/${a.name}: canonical physical sole probe`);
  for(const support of source.metadata.supports){
    check(near(support.local,[0,-.08,0],0),`${g.asset}/${a.name}: support probe matches physical sole`);
    const samples=feet[support.bone].map((v,i)=>({v,i,t:i/30})).filter(s=>s.t>=support.start-1e-7&&s.t<=support.end+1e-7);
    if(!check(samples.length>0,`${g.asset}/${a.name}: support window has samples`))continue;
    const speed=source.metadata.speedMps||0,first=samples[0].v.clone().add(new Vector3(0,0,speed*samples[0].t));
    for(const {v,i,t}of samples){
      supportSamples++;floorError=Math.max(floorError,Math.abs(v.y));
      const world=v.clone().add(new Vector3(0,0,speed*t));drift=Math.max(drift,Math.hypot(world.x-first.x,world.z-first.z));
      meshSupportError=Math.max(meshSupportError,Math.abs(meshFoot[support.bone][i]));
    }
  }
  check(soleMin>=-.008&&floorError<=.008,`${g.asset}/${a.name}: declared soles stay at floor during support`);
  check(drift<=.008,`${g.asset}/${a.name}: planted feet do not slide after declared travel`);
  check(meshMin>=-.012,`${g.asset}/${a.name}: actual mesh does not penetrate floor (minimum ${meshMin})`);
  check(meshSupportError<=.012,`${g.asset}/${a.name}: actual skinned shoe contacts floor`);
  return {sampledFrames:source.frames.length,supportSamples,minSoleY:clean(soleMin),maxSupportFloorError:clean(floorError),
    maxSupportDrift:clean(drift),minMeshY:clean(meshMin),maxMeshMinimumY:clean(meshMax),maxSkinnedShoeSupportError:clean(meshSupportError),
    strideMeters:Object.fromEntries(Object.entries(feet).map(([name,ps])=>[name,clean(Math.max(...ps.map(p=>p.z))-Math.min(...ps.map(p=>p.z)))])),
    footLiftMeters:Object.fromEntries(Object.entries(feet).map(([name,ps])=>[name,clean(Math.max(...ps.map(p=>p.y))-Math.min(...ps.map(p=>p.y)))]))};
}
function semantics(g,a,source,physical){
  const frame=Math.round(source.durationSeconds*30/2),w=transforms(g,a,frame);
  const hand=position(g,w,'RightHand'),left=position(g,w,'LeftHand'),head=position(g,w,'Head'),shoulder=position(g,w,'RightArm');
  let ok=true,metrics={};
  if(a.name==='whistle'){
    // The canonical Head joint is below the lips. This surface landmark is
    // [0,1.55,.14] in the unchanged source anatomy's bind space; Head binds
    // at y=1.47. It therefore follows the actual head rotation during a nod.
    const mouth=position(g,w,'Head',[0,.08,.14]);
    const prop=g.json.nodes[g.names.get('Whistle')];
    const mouthpiece=position(g,w,'Whistle',prop.extras.mouthEndLocal);
    const surface=headSurface(g,w,mouth,mouthpiece);
    metrics={handMouthDistance:clean(hand.distanceTo(mouth)),whistleTipMouthDistance:clean(mouthpiece.distanceTo(mouth)),
      whistleTipFaceSurfaceDistance:clean(surface.nearest),whistleTipWorld:mouthpiece.toArray().map(clean),mouthLandmarkWorld:mouth.toArray().map(clean)};
    ok=hand.distanceTo(mouth)<.15&&mouthpiece.distanceTo(mouth)<.01&&surface.nearest<.035&&hand.z>head.z;
  }else if(a.name==='yellow_card'||a.name==='red_card'){
    metrics={handAboveHead:clean(hand.y-head.y),handAboveSkinnedHead:clean(hand.y-headSurface(g,w).top)};
    ok=hand.y-head.y>.20&&metrics.handAboveSkinnedHead>=0;
  }else if(a.name==='advantage'){
    metrics={rightForward:clean(hand.z-shoulder.z),leftForward:clean(left.z-position(g,w,'LeftArm').z)};
    ok=metrics.rightForward>.32&&metrics.leftForward>.32&&Math.abs(hand.y-left.y)<.03;
  }else if(a.name==='point_penalty'){
    metrics={handBelowShoulder:clean(shoulder.y-hand.y),handForward:clean(hand.z-shoulder.z)};
    ok=metrics.handBelowShoulder>.15&&metrics.handForward>.30;
  }else if(a.name==='goal_signal'){
    metrics={rightOutward:clean(shoulder.x-hand.x),leftBelowRight:clean(hand.y-left.y)};
    ok=metrics.rightOutward>.35&&Math.abs(hand.y-shoulder.y)<.15&&metrics.leftBelowRight>.30;
  }else if(a.name==='assistant_offside'){
    const grip=position(g,w,'Flag'),tip=position(g,w,'Flag',[0,-.50,0]);
    metrics={handAboveHead:clean(hand.y-head.y),poleUpward:clean(tip.y-grip.y),tipAboveHead:clean(tip.y-head.y)};
    ok=metrics.handAboveHead>.20&&metrics.poleUpward>.47&&metrics.tipAboveHead>.70;
  }else if(a.name==='jog'||a.name==='assistant_run'){
    metrics={...physical.strideMeters,...Object.fromEntries(Object.entries(physical.footLiftMeters).map(([k,v])=>[k+'Lift',v]))};
    ok=Object.values(physical.strideMeters).every(v=>v>.35)&&Object.values(physical.footLiftMeters).every(v=>v>.075);
  }else return;
  check(ok,`${g.asset}/${a.name}: recognizable semantic hold or gait`);
  report.semantics.push({model:g.asset,clip:a.name,sampleTimeSeconds:frame/30,pass:ok,metrics});
}

check(catalog.sampleHz===30&&motions.sampleHz===30,'catalog and motion sampleHz 30');
check(catalog.models.length===3&&catalog.models.every(m=>m.geometryPresent===true),'three catalog models contain geometry');
check(JSON.stringify(catalog.skeleton)===JSON.stringify(contract),'catalog exact canonical skeleton');
check(JSON.stringify(motions.skeleton)===JSON.stringify(contract),'motion exact canonical skeleton');
check(near(catalog.clips.map(c=>expectedIds.indexOf(c.id)),expectedIds.map((_,i)=>i),0),'exactly ten declared clips');
const standalone=new Map();
for(const record of catalog.clips){
  const g=await readGLB(record.asset),source=motions.clips.find(c=>c.id===record.id);
  check(g.bytes.length===record.bytes&&sha(g.bytes)===record.sha256,`${record.asset}: byte count and SHA-256`);
  staticRig(g);
  check(g.json.animations?.length===1&&g.json.animations[0].name===record.id,`${record.asset}: exactly named standalone clip`);
  const a=decodeAnimation(g,g.json.animations[0]);standalone.set(record.id,a);
  report.clips.push({id:record.id,asset:record.asset,bytes:g.bytes.length,sha256:sha(g.bytes),...animationChecks(g,a,source)});
}
for(const id of ['referee','assistant-left','assistant-right']){
  const record=catalog.models.find(m=>m.id===id),g=await readGLB(`models/${id}.glb`),isAssistant=id!=='referee';
  check(record?.bytes===g.bytes.length&&record.sha256===sha(g.bytes),`${id}: catalog model byte count and SHA-256`);
  staticRig(g);const mesh=meshStatic(g,isAssistant),expected=isAssistant?assistant:main;
  const names=(g.json.animations||[]).map(a=>a.name);
  check(JSON.stringify(names)===JSON.stringify(expected),`${id}: exact embedded animation set and names`);
  const clips=[];
  for(const raw of g.json.animations||[]){
    const source=motions.clips.find(c=>c.id===raw.name),a=decodeAnimation(g,raw),single=standalone.get(raw.name);
    const animation=animationChecks(g,a,source);
    for(const [key,c]of a.channels){
      const s=single.channels.get(key);
      check(!!s&&near(c.input.data,s.input.data,0)&&near(c.output.data,s.output.data,0)&&c.interpolation===s.interpolation,`${id}/${a.name}: exact standalone channel parity ${key}`);
    }
    const physical=physicalChecks(g,a,source);semantics(g,a,source,physical);
    clips.push({id:a.name,...animation,...physical});
  }
  report.models.push({id,asset:g.asset,bytes:g.bytes.length,sha256:sha(g.bytes),...mesh,clips});
}
report.pass=report.failures.length===0;
await fs.mkdir(path.join(root,'verification'),{recursive:true});
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,checks:report.checks,failures:report.failures,
  models:report.models.map(m=>({id:m.id,triangles:m.triangles,clips:m.clips.map(c=>({id:c.id,minMeshY:c.minMeshY,maxSupportDrift:c.maxSupportDrift}))}))},null,2));
if(!report.pass)process.exitCode=1;
