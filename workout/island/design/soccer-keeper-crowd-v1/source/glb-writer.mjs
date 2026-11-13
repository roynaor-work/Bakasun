/** Original CC0-1.0. Portable glTF 2.0 skeleton animation exporter.
 * No geometry compression, Draco, meshopt, decoder, or WebAssembly is used.
 * Every varying channel keeps all authored 30 Hz samples. Constant channels
 * are collapsed losslessly. The serialized GLB is independently remeasured.
 */
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=a=>{const n=Math.hypot(...a);if(!n)throw new Error('Zero quaternion');return a.map(v=>v/n);};
const equal=(a,b,quaternion)=>{const sign=quaternion&&dot(a,b)<0?-1:1;return a.every((v,i)=>Math.abs(v-sign*b[i])<1e-12);};
export function animationGLB({rig,poses,name,extras={}}){
 if(!poses?.length||poses.length<2)throw new Error('Animation needs at least two poses');
 if(!poses.every((p,i)=>Number.isFinite(p.t)&&p.t>=0&&(!i||p.t>poses[i-1].t)))throw new Error('Pose times must strictly increase');
 const json={asset:{version:'2.0',generator:'soccer-keeper-crowd-v1 original CC0 skeleton baker'},scene:0,scenes:[{nodes:[]}],nodes:[],animations:[{name,samplers:[],channels:[],extras:{version:'soccer-keeper-crowd-v1',sampling:{fps:30,denseVaryingTracks:true},...extras}}],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
 const chunks=[],animation=json.animations[0],inputCache=new Map();let offset=0,hasDuration=false;
 const append=(values,type)=>{const width={SCALAR:1,VEC3:3,VEC4:4}[type];if(values.length%width||!values.every(Number.isFinite))throw new Error(`Invalid ${type} accessor`);const data=Buffer.alloc(values.length*4);values.forEach((v,i)=>data.writeFloatLE(v,i*4));const bv=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});chunks.push(data);offset+=data.length;const a={bufferView:bv,componentType:5126,count:values.length/width,type};if(type==='SCALAR'){a.min=[Math.min(...values)];a.max=[Math.max(...values)];}json.accessors.push(a);return json.accessors.length-1;};
 const inputFor=times=>{const key=times.join(',');if(!inputCache.has(key))inputCache.set(key,append(times,'SCALAR'));return inputCache.get(key);};
 const emit=(index,path,type,times,values)=>{const sampler=animation.samplers.length;animation.samplers.push({input:inputFor(times),output:append(values.flat(),type),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:index,path}});if(times.at(-1)===poses.at(-1).t)hasDuration=true;};
 const times=poses.map(p=>p.t);
 for(const n of rig.nodes){const node={name:n.name,translation:n.translation,rotation:n.rotation??[0,0,0,1],scale:n.scale??[1,1,1]},index=json.nodes.length;json.nodes.push(node);if(!n.parent)json.scenes[0].nodes.push(index);}
 const indices=Object.fromEntries(rig.nodes.map((n,i)=>[n.name,i]));
 for(const [i,n] of rig.nodes.entries()){
  if(n.parent!==null&&n.parent!==undefined){const parent=json.nodes[indices[n.parent]];if(!parent)throw new Error(`Missing parent ${n.parent}`);(parent.children??=[]).push(i);}
  for(const [field,path,type,identity] of [['rotations','rotation','VEC4',n.rotation??[0,0,0,1]],['translations','translation','VEC3',n.translation]]){
   const quaternion=path==='rotation',values=poses.map(p=>quaternion?norm(p[field]?.[n.name]??identity):p[field]?.[n.name]??identity),rest=quaternion?norm(identity):identity;
   // Only exact constants are omitted or collapsed. Reduction tolerances apply
   // exclusively to genuinely varying channels and never erase a small action.
   if(values.every(v=>equal(v,rest,quaternion)))continue;
   if(values.every(v=>equal(v,values[0],quaternion))){emit(i,path,type,[times[0]],[values[0]]);continue;}
   const selected=times.map((_,j)=>j);emit(i,path,type,selected.map(j=>times[j]),selected.map(j=>values[j]));
  }
 }
 // glTF duration derives from sampler inputs. A constant source still needs a
 // full-duration track; a single-key non-rest channel remains single-key.
 if(!hasDuration){const index=indices.Root??0,n=rig.nodes[index],value=n.scale??[1,1,1];emit(index,'scale','VEC3',[times[0],times.at(-1)],[value,value]);}
 json.buffers[0].byteLength=offset;const raw=Buffer.from(JSON.stringify(json)),padding=(4-raw.length%4)%4,jsonChunk=Buffer.concat([raw,Buffer.alloc(padding,32)]),bin=Buffer.concat(chunks),binPadding=(4-bin.length%4)%4,binChunk=Buffer.concat([bin,Buffer.alloc(binPadding)]),result=Buffer.alloc(12+8+jsonChunk.length+8+binChunk.length);
 result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonChunk.length,12);result.writeUInt32LE(0x4e4f534a,16);jsonChunk.copy(result,20);const b=20+jsonChunk.length;result.writeUInt32LE(binChunk.length,b);result.writeUInt32LE(0x004e4942,b+4);binChunk.copy(result,b+8);return result;
}
