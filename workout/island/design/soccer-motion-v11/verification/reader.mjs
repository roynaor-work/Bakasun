/** CC0-1.0. Independent GLB channel reader and FK used only for verification.
 * This file intentionally imports neither the animation author nor its writer/IK.
 */
const demand=(ok,message)=>{if(!ok)throw Error(message);};
export const canonical=[
 ['Root',null,[0,0,0]],['Hips','Root',[0,.86,0]],['Spine','Hips',[0,.2,0]],['Chest','Spine',[0,.18,0]],['Neck','Chest',[0,.1,0]],['Head','Neck',[0,.13,0]],
 ['LeftArm','Chest',[.16,.06,0]],['LeftForeArm','LeftArm',[0,-.27,0]],['LeftHand','LeftForeArm',[0,-.24,0]],['RightArm','Chest',[-.16,.06,0]],['RightForeArm','RightArm',[0,-.27,0]],['RightHand','RightForeArm',[0,-.24,0]],
 ['LeftUpLeg','Hips',[.1,0,0]],['LeftLeg','LeftUpLeg',[0,-.41,0]],['LeftFoot','LeftLeg',[0,-.37,0]],['RightUpLeg','Hips',[-.1,0,0]],['RightLeg','RightUpLeg',[0,-.41,0]],['RightFoot','RightLeg',[0,-.37,0]]
].map(([name,parent,rest])=>({name,parent,rest}));
export const names=canonical.map(b=>b.name),identity=[0,0,0,1];
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
export const distance=(a,b)=>Math.hypot(...sub(a,b));
export const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const normalize=q=>{const n=Math.hypot(...q);demand(n>1e-12,'Zero quaternion');return q.map(v=>v/n);};
export const multiply=(a,b)=>[
 a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
 a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
 a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
 a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
];
export function rotate(q,v){const p=multiply(multiply(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);return p.slice(0,3);}
export function slerp(a,b,u){
 a=normalize(a);b=normalize(b);let d=dot(a,b);if(d<0){b=b.map(v=>-v);d=-d;}
 if(d>.9995)return normalize(mix(a,b,u));
 const angle=Math.acos(Math.min(1,d)),s=Math.sin(angle),x=Math.sin((1-u)*angle)/s,y=Math.sin(u*angle)/s;
 return normalize(a.map((v,i)=>v*x+b[i]*y));
}
export const angleDegrees=(a,b)=>2*Math.acos(Math.min(1,Math.abs(dot(normalize(a),normalize(b)))))*180/Math.PI;

export function decode(bytes){
 demand(bytes.length>=28&&bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2,'Expected GLB 2');
 demand(bytes.readUInt32LE(8)===bytes.length,'GLB total length mismatch');
 const chunks=[];
 for(let at=12;at<bytes.length;){demand(at+8<=bytes.length,'Truncated GLB chunk header');const size=bytes.readUInt32LE(at),type=bytes.readUInt32LE(at+4);demand(size%4===0&&at+8+size<=bytes.length,'Invalid GLB chunk extent');chunks.push({type,bytes:bytes.subarray(at+8,at+8+size)});at+=size+8;}
 demand(chunks.length===2&&chunks[0].type===0x4e4f534a&&chunks[1].type===0x004e4942,'Expected one JSON and one BIN chunk');
 const json=JSON.parse(chunks[0].bytes.toString('utf8')),binary=chunks[1].bytes;
 demand(json.asset?.version==='2.0'&&json.buffers?.length===1&&!json.buffers[0].uri,'Expected self-contained glTF 2');
 demand(binary.length>=json.buffers[0].byteLength&&binary.length-json.buffers[0].byteLength<4,'Buffer length mismatch');
 const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
 const readers={5120:[1,'readInt8'],5121:[1,'readUInt8'],5122:[2,'readInt16LE'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
 const read=index=>{
  const a=json.accessors?.[index];demand(a&&!a.sparse,`Missing or sparse accessor ${index}`);
  const view=json.bufferViews?.[a.bufferView],width=widths[a.type],r=readers[a.componentType];demand(view&&view.buffer===0&&width&&r&&a.count>0,`Unsupported accessor ${index}`);
  const [size,method]=r,stride=view.byteStride??width*size,offset=a.byteOffset??0,start=(view.byteOffset??0)+offset;
  demand(stride>=width*size&&offset>=0&&offset+(a.count-1)*stride+width*size<=view.byteLength&&start+(a.count-1)*stride+width*size<=binary.length,`Accessor ${index} exceeds view`);
  return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>binary[method](start+i*stride+j*size)));
 };
 demand(json.animations?.length===1,'Expected one native animation');
 const animation=json.animations[0],tracks={};
 for(const channel of animation.channels){
  const sampler=animation.samplers[channel.sampler],name=json.nodes[channel.target.node]?.name;demand(sampler&&name,'Invalid animation target');
  tracks[name]??={};demand(!tracks[name][channel.target.path],`Duplicate channel ${name}.${channel.target.path}`);
  const times=read(sampler.input).flat(),values=read(sampler.output);demand(times.length===values.length,'Input/output count mismatch');
  demand(times.every((t,i)=>Number.isFinite(t)&&(i===0||t>times[i-1])),'Non-increasing animation timestamps');
  tracks[name][channel.target.path]={times,values,interpolation:sampler.interpolation??'LINEAR'};
 }
 const duration=Math.max(...Object.values(tracks).flatMap(paths=>Object.values(paths).map(track=>track.times.at(-1))));
 return {json,binary,read,tracks,duration};
}

export function bracket(keys,time,getTime=x=>x.time){
 demand(keys?.length>0,'Empty sample track');
 if(time<=getTime(keys[0]))return [0,0,0];
 if(time>=getTime(keys.at(-1)))return [keys.length-1,keys.length-1,0];
 let lo=0,hi=keys.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(getTime(keys[mid])<time)lo=mid;else hi=mid;}
 return [lo,hi,(time-getTime(keys[lo]))/(getTime(keys[hi])-getTime(keys[lo]))];
}
export function trackAt(track,time,isRotation=false){const [a,b,u]=bracket(track.times,time,x=>x);return isRotation?slerp(track.values[a],track.values[b],u):mix(track.values[a],track.values[b],u);}
export function poseAt(data,time){
 const rotations={};for(const name of names){const node=data.json.nodes.find(n=>n.name===name);rotations[name]=data.tracks[name]?.rotation?trackAt(data.tracks[name].rotation,time,true):node?.rotation??identity;}
 return {hips:data.tracks.Hips?.translation?trackAt(data.tracks.Hips.translation,time):data.json.nodes.find(n=>n.name==='Hips').translation,rotations};
}
export function rootAt(meta,time){
 const samples=meta?.referenceRootMotion?.samples??meta?.samples??[{time:0,position:[0,0,0],yaw:0}], [a,b,u]=bracket(samples,time);
 return {position:mix(samples[a].position,samples[b].position,u),yaw:(samples[a].yaw??0)+((samples[b].yaw??0)-(samples[a].yaw??0))*u};
}
export function forward(pose,root={position:[0,0,0],yaw:0}){
 const world={},r=root.yaw*Math.PI/360,outer={position:root.position,rotation:[0,Math.sin(r),0,Math.cos(r)]};
 for(const bone of canonical){const parent=world[bone.parent]??outer;world[bone.name]={position:add(parent.position,rotate(parent.rotation,bone.name==='Hips'?pose.hips:bone.rest)),rotation:multiply(parent.rotation,pose.rotations[bone.name])};}
 return world;
}
export const worldAt=(data,meta,time)=>forward(poseAt(data,time),rootAt(meta,time));
export const point=(world,bone,local=[0,0,0])=>add(world[bone].position,rotate(world[bone].rotation,local));
export function ballAt(meta,time){const keys=meta.ball?.samples??meta.ball?.keys;if(!keys?.length)return null;const [a,b,u]=bracket(keys,time);return mix(keys[a].position,keys[b].position,u);}
