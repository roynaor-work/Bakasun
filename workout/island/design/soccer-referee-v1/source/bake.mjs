// SPDX-License-Identifier: CC0-1.0
// Self-contained glTF 2.0 animation writer. No extensions or npm build required.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {authorClips,bones} from './motions.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
export function unpack(bytes) {
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('Not GLB2');
  const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString());
  const binary=bytes.subarray(28+n,28+n+bytes.readUInt32LE(20+n));
  return {json,binary};
}
export function pack(json,binary) {
  json.buffers=[{byteLength:binary.length}];
  const raw=Buffer.from(JSON.stringify(json)),j=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(j);
  const b=Buffer.alloc(Math.ceil(binary.length/4)*4);binary.copy(b);
  const out=Buffer.alloc(28+j.length+b.length);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);
  out.writeUInt32LE(b.length,20+j.length);out.writeUInt32LE(0x004e4942,24+j.length);b.copy(out,28+j.length);
  return out;
}
function animated(base,clips) {
  const json=structuredClone(base.json),chunks=[base.binary];let size=base.binary.length;
  json.animations=[];json.accessors??=[];json.bufferViews??=[];
  const nodeIndices=Object.fromEntries(json.nodes.map((n,i)=>[n.name,i]));
  function accessor(values,type,range=false) {
    const width={SCALAR:1,VEC3:3,VEC4:4}[type],array=new Float32Array(values);
    const pad=(4-size%4)%4;if(pad){chunks.push(Buffer.alloc(pad));size+=pad;}
    const view=json.bufferViews.push({buffer:0,byteOffset:size,byteLength:array.byteLength})-1;
    const a={bufferView:view,componentType:5126,count:array.length/width,type};
    if(range){a.min=[values[0]];a.max=[values.at(-1)];}
    chunks.push(Buffer.from(array.buffer));size+=array.byteLength;
    return json.accessors.push(a)-1;
  }
  for(const clip of clips) {
    const anim={name:clip.id,samplers:[],channels:[],extras:{sampleHz:30,loop:clip.loop,
      rootMotion:false,presentationOnly:true,labelHe:clip.labelHe,role:clip.role}};
    const input=accessor(clip.frames.map(f=>f.time),'SCALAR',true);
    function channel(nodeName,targetPath,values,type,interpolation='LINEAR') {
      const node=nodeIndices[nodeName];if(node===undefined)return;
      const output=accessor(values,type),sampler=anim.samplers.push({input,output,interpolation})-1;
      anim.channels.push({sampler,target:{node,path:targetPath}});
    }
    for(const b of bones)channel(b.name,'rotation',clip.frames.flatMap(f=>f.rotations[b.name]),'VEC4');
    channel('Hips','translation',clip.frames.flatMap(f=>f.hips),'VEC3');
    for(const prop of ['YellowCard','RedCard','Whistle']) {
      const node=json.nodes[nodeIndices[prop]],visible=node?.extras?.visibleScale??[1,1,1];
      // Discrete prop exposure is a glTF STEP scale channel; it is never an
      // extra bone and never changes the animation of the canonical skin.
      channel(prop,'scale',clip.frames.flatMap(f=>visible.map(v=>v*(f.props[prop]??0))),'VEC3','STEP');
    }
    json.animations.push(anim);
  }
  return pack(json,Buffer.concat(chunks));
}
await fs.mkdir(path.join(root,'clips'),{recursive:true});
await fs.mkdir(path.join(root,'runtime'),{recursive:true});
const clips=authorClips(),models={};
// The model builder owns base/*.glb; these are the reproducible unanimated inputs.
for(const id of ['referee','assistant-left','assistant-right']) {
  const model=path.join(root,'source','base',id+'.glb');
  models[id]=unpack(await fs.readFile(model));
  if(!models[id].json.meshes?.length)throw Error(`${id}: build source/base geometry first`);
}
for(const clip of clips) {
  const model=clip.id.startsWith('assistant_')?models['assistant-left']:models.referee;
  await fs.writeFile(path.join(root,'clips',clip.id+'.glb'),animated(model,[clip]));
}
const modelRecords=[];
await fs.mkdir(path.join(root,'models'),{recursive:true});
for(const [id,model]of Object.entries(models)) {
  const selected=id==='referee'?clips.filter(c=>!c.id.startsWith('assistant_')):
    clips.filter(c=>c.id==='idle'||c.id.startsWith('assistant_'));
  const bytes=animated(model,selected);
  await fs.writeFile(path.join(root,'models',id+'.glb'),bytes);
  modelRecords.push({id,asset:'models/'+id+'.glb',bytes:bytes.length,sha256:hash(bytes),clips:selected.map(c=>c.id),
    geometryPresent:!!model.json.meshes?.length});
}
const catalog={schemaVersion:1,id:'soccer-referee-v1',license:'CC0-1.0',sampleHz:30,
  skeleton:bones.map(({name,parent,rest})=>({name,parent,restTranslationMeters:rest})),
  axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},units:'meters',models:modelRecords,
  clips:await Promise.all(clips.map(async({frames,...clip})=>{
    const asset='clips/'+clip.id+'.glb',bytes=await fs.readFile(path.join(root,asset));
    return {...clip,asset,bytes:bytes.length,sha256:hash(bytes)};
  }))};
await fs.writeFile(path.join(root,'runtime','catalog.json'),JSON.stringify(catalog,null,2)+'\n');
await fs.writeFile(path.join(root,'runtime','motions.json'),JSON.stringify({schemaVersion:1,sampleHz:30,
  skeleton:catalog.skeleton,clips})+'\n');
console.log(JSON.stringify({models:modelRecords,clips:clips.map(c=>({id:c.id,frames:c.frameCount,
  maxTargetReachError:Math.max(...c.frames.map(f=>f.reachError))}))},null,2));
