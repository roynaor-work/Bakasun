// Original CC0 diagnostic reader. Geometry is deliberately never decompressed.
import * as THREE from '../../soccer-motion-v8/runtime/vendor/three.module.js';

const widths = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const types = {5120:[1,'getInt8',127],5121:[1,'getUint8',255],5122:[2,'getInt16',32767],5123:[2,'getUint16',65535],5125:[4,'getUint32',4294967295],5126:[4,'getFloat32',1]};
const assert = (ok,message) => {if(!ok) throw new Error(message);};
export function parseGLB(input) {
 const bytes = Buffer.from(input.buffer ?? input,input.byteOffset ?? 0,input.byteLength ?? input.length);
 assert(bytes.length>=20,'Truncated GLB header');
 assert(bytes.readUInt32LE(0)===0x46546c67,'Invalid GLB magic');
 assert(bytes.readUInt32LE(4)===2,'Unsupported GLB version');
 assert(bytes.readUInt32LE(8)===bytes.length,'GLB declared length mismatch');
 let json, binary=Buffer.alloc(0), offset=12, count=0;
 while(offset<bytes.length) {
  assert(offset+8<=bytes.length,'Truncated GLB chunk header');
  const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;
  assert(size%4===0 && offset+size<=bytes.length,'Invalid GLB chunk length');
  if(type===0x4e4f534a){assert(!json&&count===0,'JSON must be first and unique');json=JSON.parse(bytes.toString('utf8',offset,offset+size).replace(/\0+$/,''));}
  else if(type===0x004e4942){assert(binary.length===0,'Duplicate BIN chunk');binary=bytes.subarray(offset,offset+size);}
  offset+=size;count++;
 }
 assert(json?.asset?.version==='2.0','Missing glTF 2.0 JSON');
 assert((json.buffers??[]).every(b=>!b.uri),'External GLB buffers unsupported');
 assert((json.buffers?.length??0)<=1,'Multiple GLB buffers unsupported');
 assert((json.buffers?.[0]?.byteLength??0)<=binary.length,'Truncated GLB BIN');
 return {json,binary};
}
export function readAccessor(glb,index) {
 const {json,binary}=glb,a=json.accessors?.[index];assert(a,`Missing accessor ${index}`);
 const width=widths[a.type],type=types[a.componentType];
 assert(width&&type&&Number.isInteger(a.count)&&a.count>=0,'Unsupported accessor type/count');
 const result=new Float64Array(a.count*width), view=new DataView(binary.buffer,binary.byteOffset,binary.length);
 const readView=(viewIndex,offset,count,components,componentType,strideOverride)=>{
  const bv=json.bufferViews?.[viewIndex],tt=types[componentType];
  assert(bv&&tt&&(bv.buffer??0)===0,'Invalid accessor bufferView');
  const stride=strideOverride??bv.byteStride??tt[0]*components;
  assert(stride>=tt[0]*components&&stride%tt[0]===0,'Invalid accessor stride');
  const start=(bv.byteOffset??0)+(offset??0),end=count?start+(count-1)*stride+components*tt[0]:start;
  assert(start>=(bv.byteOffset??0)&&end<=(bv.byteOffset??0)+bv.byteLength&&end<=binary.length,'Accessor out of bounds');
  const values=[];for(let i=0;i<count;i++) for(let c=0;c<components;c++) values.push(view[tt[1]](start+i*stride+c*tt[0],true));
  return values;
 };
 if(a.bufferView!==undefined) result.set(readView(a.bufferView,a.byteOffset,a.count,width,a.componentType));
 if(a.sparse){
  const s=a.sparse;assert(Number.isInteger(s.count)&&s.count>=0&&s.count<=a.count,'Invalid sparse count');
  assert([5121,5123,5125].includes(s.indices.componentType),'Invalid sparse index type');
  const ids=readView(s.indices.bufferView,s.indices.byteOffset,s.count,1,s.indices.componentType);
  const values=readView(s.values.bufferView,s.values.byteOffset,s.count,width,a.componentType);
  let previous=-1;ids.forEach((id,i)=>{assert(id>previous&&id<a.count,'Invalid sparse index');previous=id;for(let c=0;c<width;c++) result[id*width+c]=values[i*width+c];});
 }
 if(a.normalized&&a.componentType!==5126) for(let i=0;i<result.length;i++) result[i]=Math.max(-1,result[i]/type[2]);
 assert([...result].every(Number.isFinite),'Non-finite accessor value');return result;
}

export function createRig(glb) {
 const {json}=glb, nodes=(json.nodes??[]).map((n,i)=>{
  const obj=new THREE.Object3D();obj.name=n.name??`node_${i}`;
  if(n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(obj.position,obj.quaternion,obj.scale);
  else {obj.position.fromArray(n.translation??[0,0,0]);obj.quaternion.fromArray(n.rotation??[0,0,0,1]);obj.scale.fromArray(n.scale??[1,1,1]);}
  return obj;
 });
 const parents=new Set();
 for(const [i,n] of (json.nodes??[]).entries()) for(const child of n.children??[]) {
  assert(nodes[child]&&child!==i&&!parents.has(child),'Invalid or multiply-parented node');parents.add(child);
  let ancestor=i;const seen=new Set([child]);while(ancestor!==undefined){assert(!seen.has(ancestor),'Cyclic node graph');seen.add(ancestor);ancestor=(json.nodes??[]).findIndex(x=>(x.children??[]).includes(ancestor));if(ancestor<0)break;}
  nodes[i].add(nodes[child]);
 }
 const scene=new THREE.Group();nodes.forEach((n,i)=>{if(!parents.has(i))scene.add(n);});scene.updateMatrixWorld(true);
 return {scene,nodes,rest:nodes.map(n=>({position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone()}))};
}

function interpolate(channel,t) {
 const {times,values,width,path,interpolation}=channel,n=times.length;
 let hi=1;while(hi<n&&times[hi]<t)hi++;hi=Math.min(hi,n-1);const lo=Math.max(0,hi-1);
 const cubic=interpolation==='CUBICSPLINE',factor=cubic?3:1;
 const key=i=>Array.from(values.slice((i*factor+(cubic?1:0))*width,(i*factor+(cubic?1:0)+1)*width));
 if(n===1||t<=times[0])return key(0);if(t>=times[n-1])return key(n-1);
 if(interpolation==='STEP') return key(t===times[hi]?hi:lo);
 const dt=times[hi]-times[lo],u=(t-times[lo])/dt,a=key(lo),b=key(hi);
 if(cubic){const u2=u*u,u3=u2*u;return a.map((v,c)=>(2*u3-3*u2+1)*v+(u3-2*u2+u)*dt*values[(lo*3+2)*width+c]+(-2*u3+3*u2)*b[c]+(u3-u2)*dt*values[hi*3*width+c]);}
 if(path==='rotation')return new THREE.Quaternion().fromArray(a).normalize().slerp(new THREE.Quaternion().fromArray(b).normalize(),u).normalize().toArray();
 return a.map((v,c)=>v+(b[c]-v)*u);
}
export function sampleGLB(input,{animation,fps=60,extraTimes=[]}={}) {
 assert(Number.isFinite(fps)&&fps>0&&fps<=1000,'Invalid sample rate');
 const glb=input?.json?input:parseGLB(input),{json}=glb;
 const anim=animation===undefined?json.animations?.[0]:json.animations?.find(a=>a.name===animation);
 assert(anim,`Missing animation ${animation??'(first)'}`);
 const {scene,nodes,rest}=createRig(glb);
 const channels=anim.channels.filter(c=>c.target.path!=='weights').map(c=>{
  const s=anim.samplers[c.sampler];assert(s,'Missing animation sampler');
  const times=Array.from(readAccessor(glb,s.input)),values=readAccessor(glb,s.output),width=widths[json.accessors[s.output].type];
  assert(times.length>0&&times.every((v,i)=>v>=0&&(i===0||v>times[i-1])),'Animation times must strictly increase');
  const interpolation=s.interpolation??'LINEAR';assert(['STEP','LINEAR','CUBICSPLINE'].includes(interpolation),'Unsupported interpolation');
  assert(nodes[c.target.node]&&['translation','rotation','scale'].includes(c.target.path),'Invalid animation target');
  assert(width===(c.target.path==='rotation'?4:3),'Animation channel width mismatch');
  assert(values.length===times.length*width*(interpolation==='CUBICSPLINE'?3:1),'Animation sampler count mismatch');
  return {node:c.target.node,path:c.target.path,times,values,width,interpolation};
 });
 const duration=Math.max(...channels.map(c=>c.times.at(-1)));assert(Number.isFinite(duration)&&duration>0,'Invalid animation duration');
 const times=new Set([0,duration]);for(let i=1;i<Math.ceil(duration*fps);i++)times.add(i/fps);
 for(const c of channels)for(const t of c.times)times.add(t);
 for(const t of extraTimes)if(Number.isFinite(t)&&t>=0&&t<=duration)times.add(t);
 const names=/^(Root|Hips|Spine\d*|Chest|UpperChest|Neck|Head|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|Toes))$/;
 const entries=nodes.filter(n=>names.test(n.name));assert(entries.some(n=>n.name==='Hips'),'Canonical skeleton has no Hips');
 const head=entries.find(n=>n.name==='Head'),foot=entries.find(n=>n.name==='LeftFoot');
 const height=head&&foot?head.getWorldPosition(new THREE.Vector3()).y-foot.getWorldPosition(new THREE.Vector3()).y+0.30:1.8;
 const ballNode=nodes.find(n=>/^ball$/i.test(n.name));
 const frames=[...times].sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-6).map(t=>{
  nodes.forEach((n,i)=>{n.position.copy(rest[i].position);n.quaternion.copy(rest[i].quaternion);n.scale.copy(rest[i].scale);});
  for(const c of channels){const v=interpolate(c,t),n=nodes[c.node];if(c.path==='translation')n.position.fromArray(v);else if(c.path==='scale')n.scale.fromArray(v);else n.quaternion.fromArray(v).normalize();}
  scene.updateMatrixWorld(true);
  const joints={},rotations={},localRotations={},scales={},floorPoints=[];
  for(const n of entries){joints[n.name]=n.getWorldPosition(new THREE.Vector3()).toArray();rotations[n.name]=n.getWorldQuaternion(new THREE.Quaternion()).toArray();localRotations[n.name]=n.quaternion.toArray();scales[n.name]=n.getWorldScale(new THREE.Vector3()).toArray();if(/Foot$/.test(n.name))floorPoints.push({bone:n.name,position:n.localToWorld(new THREE.Vector3(0,-.08,0)).toArray()});}
  return {t,joints,rotations,localRotations,scales,root:joints.Root??[0,0,0],ball:ballNode?.getWorldPosition(new THREE.Vector3()).toArray()??null,floorPoints};
 });
 return {frames,duration,height,animation:anim.name,animationCount:json.animations.length,geometryDecoded:false};
}
