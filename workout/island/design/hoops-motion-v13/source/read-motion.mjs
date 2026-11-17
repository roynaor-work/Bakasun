// SPDX-License-Identifier: CC0-1.0
// Small strict reader for the uncompressed FLOAT animation accessors emitted by this package.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CANON_NAMES} from '../../../minigames/athletes-core.mjs';

export function readMotion(file,entry){
  const bytes=readFileSync(file);
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error(`Invalid GLB: ${file}`);
  const jsonLength=bytes.readUInt32LE(12);
  if(bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Missing JSON chunk');
  const doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8'));
  const binOffset=20+jsonLength;
  if(bytes.readUInt32LE(binOffset+4)!==0x004e4942)throw Error('Missing BIN chunk');
  const bin=bytes.subarray(binOffset+8,binOffset+8+bytes.readUInt32LE(binOffset));
  const accessor=index=>{
    const a=doc.accessors[index],view=doc.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4}[a.type];
    if(a.componentType!==5126||a.sparse||view.byteStride||!width)throw Error('Expected tightly packed FLOAT accessors');
    const offset=(view.byteOffset??0)+(a.byteOffset??0),length=a.count*width*4;
    if(offset+length>bin.length||length>view.byteLength)throw Error('Truncated FLOAT accessor');
    const out=[];for(let i=0;i<length;i+=4)out.push(bin.readFloatLE(offset+i));return out;
  };
  if(doc.animations.length!==1||doc.animations[0].name!==entry.id)throw Error(`Expected single named animation: ${entry.id}`);
  const animation=doc.animations[0],tracks=animation.channels.map(channel=>{
    const sampler=animation.samplers[channel.sampler];
    if((sampler.interpolation??'LINEAR')!=='LINEAR')throw Error('Expected LINEAR animation interpolation');
    return {name:doc.nodes[channel.target.node].name,path:channel.target.path,times:accessor(sampler.input),values:accessor(sampler.output)};
  });
  const hips=tracks.find(t=>t.name==='Hips'&&t.path==='translation'),rotations=tracks.filter(t=>t.path==='rotation');
  if(!hips||rotations.length!==18||CANON_NAMES.some(name=>!rotations.some(t=>t.name===name)))throw Error('Expected canonical 18 rotations and Hips position');
  if(tracks.some(t=>t.times.length!==hips.times.length||t.times.some((v,i)=>v!==hips.times[i])))throw Error('Animation channel times differ');
  const frames=hips.times.map((time,i)=>({time,hips:hips.values.slice(i*3,i*3+3),
    rotations:Object.fromEntries(rotations.map(t=>[t.name,t.values.slice(i*4,i*4+4)]))}));
  return {id:entry.id,loop:!!entry.loop,duration:hips.times.at(-1),frames,sha256:createHash('sha256').update(bytes).digest('hex')};
}
