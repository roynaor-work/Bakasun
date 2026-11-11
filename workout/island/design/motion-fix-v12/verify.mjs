/** Original CC0-1.0 structural and file-load verifier. No decoder or WebAssembly. */
import {readFile, readdir, mkdir, writeFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const here=path.dirname(fileURLToPath(import.meta.url));
const execute=promisify(execFile);
const COMPONENTS={5120:{bytes:1,get:'getInt8'},5121:{bytes:1,get:'getUint8'},5122:{bytes:2,get:'getInt16'},5123:{bytes:2,get:'getUint16'},5125:{bytes:4,get:'getUint32'},5126:{bytes:4,get:'getFloat32'}};
const ELEMENTS={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export async function filesUnder(root,relative=''){
 const result=[];
 for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
  if(['.git','.cache','node_modules'].includes(entry.name))continue;
  const name=path.posix.join(relative,entry.name);
  if(entry.isDirectory())result.push(...await filesUnder(root,name));
  else if(entry.isFile())result.push(name);
 }
 return result.sort();
}
export function verifyGLB(input,file='GLB'){
 const b=Buffer.from(input),fail=s=>`${file}: ${s}`;
 check(b.length>=20,fail('truncated header'));
 check(b.readUInt32LE(0)===0x46546c67,fail('invalid glTF magic'));
 check(b.readUInt32LE(4)===2,fail('requires glTF 2'));
 check(b.readUInt32LE(8)===b.length,fail('declared length differs'));
 const chunks=[];let offset=12;
 while(offset<b.length){
  check(offset+8<=b.length,fail('truncated chunk header'));
  const size=b.readUInt32LE(offset),type=b.readUInt32LE(offset+4);offset+=8;
  check(size%4===0&&offset+size<=b.length,fail('invalid chunk alignment/range'));
  chunks.push({type,data:b.subarray(offset,offset+size)});offset+=size;
 }
 check(chunks[0]?.type===0x4e4f534a,fail('first chunk is not JSON'));
 const json=JSON.parse(chunks[0].data.toString('utf8').trim()),bin=chunks.find(c=>c.type===0x004e4942)?.data??Buffer.alloc(0);
 const forbidden=['KHR_draco_mesh_compression','EXT_meshopt_compression'];
 const visit=(v)=>{if(typeof v==='number')check(Number.isFinite(v),fail('non-finite JSON value'));if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){check(!forbidden.includes(k),fail(`forbidden compressed extension ${k}`));if((k==='extensionsRequired'||k==='extensionsUsed')&&Array.isArray(x))check(!x.some(v=>forbidden.includes(v)),fail('requires a compressed decoder'));visit(x);}};visit(json);
 check(json.asset?.version==='2.0',fail('asset version is not 2.0'));
 for(const [i,buffer] of (json.buffers??[]).entries()){
  check(!buffer.uri,fail(`buffer ${i} has external URI`));
  check(i===0&&Number.isInteger(buffer.byteLength)&&buffer.byteLength>=0&&buffer.byteLength<=bin.length,fail(`buffer ${i} exceeds binary chunk`));
 }
 const viewAt=(i)=>{const v=json.bufferViews?.[i];check(v,fail(`missing bufferView ${i}`));return v;};
 for(const [i,v] of (json.bufferViews??[]).entries()){
  check((v.buffer??0)===0,fail(`bufferView ${i} uses missing buffer`));
  check(Number.isInteger(v.byteLength)&&v.byteLength>=0&&(v.byteOffset??0)>=0&&(v.byteOffset??0)+v.byteLength<=bin.length,fail(`bufferView ${i} exceeds binary chunk`));
  if(v.byteStride!==undefined)check(v.byteStride>=4&&v.byteStride<=252&&v.byteStride%4===0,fail(`bufferView ${i} invalid stride`));
 }
 const values=new Map();let scalarValues=0;
 for(const [i,a] of (json.accessors??[]).entries()){
  const c=COMPONENTS[a.componentType],elements=ELEMENTS[a.type];
  check(c&&elements,fail(`accessor ${i} invalid type`));
  check(Number.isInteger(a.count)&&a.count>=0,fail(`accessor ${i} invalid count`));
  const data=new Array(a.count*elements).fill(0);
  if(a.bufferView!==undefined){
   const v=viewAt(a.bufferView),stride=v.byteStride??c.bytes*elements,start=(v.byteOffset??0)+(a.byteOffset??0),end=a.count?start+(a.count-1)*stride+c.bytes*elements:start;
   check(start%c.bytes===0&&stride>=c.bytes*elements&&end<=(v.byteOffset??0)+v.byteLength,fail(`accessor ${i} exceeds bufferView or alignment`));
   const dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
   for(let j=0;j<a.count;j++)for(let k=0;k<elements;k++){
    const value=dv[c.get](start+j*stride+k*c.bytes,true);check(Number.isFinite(value),fail(`accessor ${i} contains non-finite value`));data[j*elements+k]=value;
   }
  }else check(!!a.sparse||a.count===0,fail(`accessor ${i} has no storage`));
  if(a.sparse){
   const s=a.sparse,ic=COMPONENTS[s.indices.componentType],iv=viewAt(s.indices.bufferView),vv=viewAt(s.values.bufferView);
   check([5121,5123,5125].includes(s.indices.componentType)&&s.count<=a.count,fail(`accessor ${i} invalid sparse count/index type`));
   const io=(iv.byteOffset??0)+(s.indices.byteOffset??0),vo=(vv.byteOffset??0)+(s.values.byteOffset??0),dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
   check(io+s.count*ic.bytes<=(iv.byteOffset??0)+iv.byteLength&&vo+s.count*elements*c.bytes<=(vv.byteOffset??0)+vv.byteLength,fail(`accessor ${i} sparse data exceeds bufferView`));
   let previous=-1;for(let j=0;j<s.count;j++){
    const idx=dv[ic.get](io+j*ic.bytes,true);check(idx>previous&&idx<a.count,fail(`accessor ${i} sparse indices not ordered/in range`));previous=idx;
    for(let k=0;k<elements;k++){const value=dv[c.get](vo+(j*elements+k)*c.bytes,true);check(Number.isFinite(value),fail(`accessor ${i} sparse value non-finite`));data[idx*elements+k]=value;}
   }
  }
  scalarValues+=data.length;values.set(i,data);
 }
 for(const [i,node] of (json.nodes??[]).entries()){
  for(const k of ['translation','rotation','scale','matrix'])if(node[k])check(node[k].every(Number.isFinite),fail(`node ${i} invalid ${k}`));
  for(const child of node.children??[])check(json.nodes[child]&&child!==i,fail(`node ${i} invalid child`));
 }
 for(const [i,skin] of (json.skins??[]).entries()){
  check(skin.joints?.length&&skin.joints.every(j=>json.nodes?.[j]),fail(`skin ${i} invalid joint nodes`));
  if(skin.inverseBindMatrices!==undefined)check(json.accessors?.[skin.inverseBindMatrices]?.count===skin.joints.length,fail(`skin ${i} inverse bind count mismatch`));
 }
 let channels=0;
 for(const [i,animation] of (json.animations??[]).entries()){
  for(const [j,s] of animation.samplers.entries()){
   const times=values.get(s.input),out=json.accessors[s.output];check(times?.length&&out,fail(`animation ${i}/${j} missing sampler input/output`));
   check(json.accessors[s.input].type==='SCALAR'&&times.every((v,k)=>v>=0&&(!k||v>times[k-1])),fail(`animation ${i}/${j} time is not strictly increasing`));
   check(out.count===times.length*(s.interpolation==='CUBICSPLINE'?3:1),fail(`animation ${i}/${j} output count mismatch`));
  }
  for(const channel of animation.channels??[]){
   check(json.nodes?.[channel.target?.node]&&animation.samplers[channel.sampler],fail(`animation ${i} invalid target/sampler`));
   check(['translation','rotation','scale','weights'].includes(channel.target.path),fail(`animation ${i} invalid path`));channels++;
   if(channel.target.path==='rotation'){
    const s=animation.samplers[channel.sampler],qs=values.get(s.output),count=json.accessors[s.output].count;
    for(let q=0;q<count;q++)if(s.interpolation!=='CUBICSPLINE'||q%3===1){const norm=Math.hypot(...qs.slice(q*4,q*4+4));check(Math.abs(norm-1)<.002,fail(`animation ${i} non-unit quaternion`));}
   }
  }
 }
 return {file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),nodes:json.nodes?.length??0,meshes:json.meshes?.length??0,skins:json.skins?.length??0,animations:json.animations?.map(a=>a.name??'')??[],channels,accessors:json.accessors?.length??0,scalarValues,compression:'none',pass:true};
}
export async function verifyBundle({root=here,manifest}={}){
 const started=Date.now(),files=await filesUnder(root),results=[],errors=[];
 for(const file of files){
  try{
   const bytes=await readFile(path.join(root,file));
   if(file.endsWith('.glb'))results.push(verifyGLB(bytes,file));
   else if(file.endsWith('.json')||file.endsWith('.json.gz')){const data=JSON.parse((file.endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8'));const finite=v=>{if(typeof v==='number')check(Number.isFinite(v),`${file}: non-finite JSON value`);else if(v&&typeof v==='object')for(const x of Object.values(v))finite(x);};finite(data);results.push({file,bytes:bytes.length,type:file.endsWith('.gz')?'gzip JSON':'JSON',pass:true});}
   else if(file.endsWith('.mjs')||file.endsWith('.js')){await execute(process.execPath,['--check',path.join(root,file)]);results.push({file,bytes:bytes.length,type:'JavaScript syntax',pass:true});}
   else results.push({file,bytes:bytes.length,type:'read',pass:true});
  }catch(e){errors.push({file,error:e.message});}
 }
 manifest??=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
 let runtimeReferences=0;
 const checkReferences=async(v)=>{
  if(!v||typeof v!=='object')return;
  for(const [key,value] of Object.entries(v)){
   if(['asset','model','animation','frames'].includes(key)&&typeof value==='string'&&value.startsWith('runtime/')){
    const resolved=path.resolve(root,value);check(resolved.startsWith(path.resolve(root)+path.sep),`Manifest traversal: ${value}`);
    try{check((await stat(resolved)).isFile(),`${value} is not a file`);runtimeReferences++;}catch(e){errors.push({file:value,error:e.message});}
   }else if(value&&typeof value==='object')await checkReferences(value);
  }
 };await checkReferences(manifest.clips??[]);
 return {generatedAt:new Date().toISOString(),elapsedSeconds:(Date.now()-started)/1000,pass:errors.length===0,fileCount:files.length,glbCount:results.filter(r=>r.compression==='none').length,runtimeReferences,clips:manifest.clips?.length??0,errors,results};
}
/** Read-only final check: run after licenses.mjs so no ledger hash changes here. */
export async function verifyLicenseLedger({root=here}={}){
 const files=await filesUnder(root),ledger=await readFile(path.join(root,'LICENSES.md'),'utf8'),records=new Map(),errors=[];
 for(const line of ledger.split('\n')){
  const match=line.match(/^\| \[([^\]]+)\]\([^)]+\) \| ([^|]+) \| .* \| ([0-9a-f]{64}|—) \|$/);
  if(match)records.set(match[1],{license:match[2].trim(),sha256:match[3]});
 }
 for(const file of files){const record=records.get(file);if(!record){errors.push({file,error:'Missing per-file license/source row'});continue;}if(record.license!=='CC0-1.0')errors.push({file,error:`Non-CC0 new file: ${record.license}`});if(file!=='LICENSES.md'){const sha256=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');if(sha256!==record.sha256)errors.push({file,error:'SHA-256 differs from final license ledger'});}}
 for(const file of records.keys())if(!files.includes(file))errors.push({file,error:'Ledger references absent file'});
 return {pass:errors.length===0,files:files.length,rows:records.size,errors};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--licenses-only')){const result=await verifyLicenseLedger();console.log(JSON.stringify(result));if(!result.pass)process.exitCode=1;}
 else{const result=await verifyBundle();await mkdir(path.join(here,'verification'),{recursive:true});await writeFile(path.join(here,'verification/structural.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,files:result.fileCount,glbs:result.glbCount,errors:result.errors}));if(!result.pass)process.exitCode=1;}
}
