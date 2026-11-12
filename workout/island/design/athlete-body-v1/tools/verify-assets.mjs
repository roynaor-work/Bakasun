/** CC0-1.0. Loads every package file and measures the delivered glTF skin, not a proxy skeleton.
 * Install tooling outside this package; run ATHLETE_TOOL_ROOT=/tmp/athlete-tools node tools/verify-assets.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {CANON_BONES} from '../../../minigames/athletes-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const loadOnly = process.argv.includes('--load-only');
const tooling = process.env.ATHLETE_TOOL_ROOT || '/tmp/athlete-tools';
const requireTool = createRequire(path.join(tooling, 'package.json'));
const validator = requireTool('gltf-validator');
const sharp = requireTool('sharp');
const THREE = await import(pathToFileURL(requireTool.resolve('three')).href);
const {Matrix4, Vector3, Quaternion} = THREE;
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const digest = data => createHash('sha256').update(data).digest('hex');
const loadJSON = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const relative = name => path.relative(root, name).split(path.sep).join('/');
const number = value => Number(value.toPrecision(8));
const decodeUTF8 = data => new TextDecoder('utf-8', {fatal: true}).decode(data);
const sizeOf = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const components = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const readComponent = {5120:'getInt8',5121:'getUint8',5122:'getInt16',5123:'getUint16',5125:'getUint32',5126:'getFloat32'};
const bounds = points => {
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (let i=0;i<points.length;i++) { const k=i%3; min[k]=Math.min(min[k],points[i]); max[k]=Math.max(max[k],points[i]); }
  return {min:min.map(number),max:max.map(number),height:number(max[1]-min[1])};
};

async function enumerate(directory) {
  const out=[];
  for (const entry of await fs.readdir(directory, {withFileTypes:true})) {
    const name=path.join(directory,entry.name);
    if (entry.isDirectory()) out.push(...await enumerate(name)); else if (entry.isFile()) out.push(name);
    else check(false,`${relative(name)}: symlinks and special files are not runtime assets`);
  }
  return out.sort();
}

async function readGLB(filename, bytes) {
  bytes ||= await fs.readFile(filename);
  if (bytes.readUInt32LE(0)!==0x46546c67 || bytes.readUInt32LE(4)!==2 || bytes.readUInt32LE(8)!==bytes.length) throw Error('Invalid GLB header');
  let json,bin;
  for (let offset=12;offset<bytes.length;) {
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+length);
    if(type===0x4e4f534a)json=JSON.parse(decodeUTF8(chunk));
    if(type===0x004e4942)bin=chunk;
    offset+=8+length;
  }
  if(!json)throw Error('Missing GLB JSON chunk');
  const buffers=await Promise.all((json.buffers||[]).map(async (b,i)=>b.uri ? await fs.readFile(path.resolve(path.dirname(filename),decodeURIComponent(b.uri))) : i===0 ? bin : null));
  const dataView=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
  const cache=new Map();
  function accessor(index) {
    if(cache.has(index))return cache.get(index);
    const a=json.accessors[index],n=components[a.type],width=sizeOf[a.componentType],out=new Float64Array(a.count*n);
    function read(view,offset,type,normalised=false){
      const v=view[readComponent[type]](offset,true);
      if(!normalised)return v;
      if(type===5120)return Math.max(v/127,-1);if(type===5121)return v/255;if(type===5122)return Math.max(v/32767,-1);if(type===5123)return v/65535;
      return v;
    }
    if(a.bufferView!==undefined){
      const b=json.bufferViews[a.bufferView],view=dataView(buffers[b.buffer||0]),start=(b.byteOffset||0)+(a.byteOffset||0),stride=b.byteStride||n*width;
      for(let i=0;i<a.count;i++)for(let c=0;c<n;c++)out[i*n+c]=read(view,start+i*stride+c*width,a.componentType,a.normalized);
    }
    if(a.sparse){
      const s=a.sparse,ib=json.bufferViews[s.indices.bufferView],vb=json.bufferViews[s.values.bufferView],iv=dataView(buffers[ib.buffer||0]),vv=dataView(buffers[vb.buffer||0]);
      for(let i=0;i<s.count;i++){
        const j=read(iv,(ib.byteOffset||0)+(s.indices.byteOffset||0)+i*sizeOf[s.indices.componentType],s.indices.componentType);
        for(let c=0;c<n;c++)out[j*n+c]=read(vv,(vb.byteOffset||0)+(s.values.byteOffset||0)+(i*n+c)*width,a.componentType,a.normalized);
      }
    }
    cache.set(index,out);return out;
  }
  const parents=new Map();json.nodes?.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
  return {json,accessor,parents,filename};
}

function nodeLocal(n) {
  if(n.matrix)return new Matrix4().fromArray(n.matrix);
  return new Matrix4().compose(new Vector3().fromArray(n.translation||[0,0,0]),new Quaternion().fromArray(n.rotation||[0,0,0,1]),new Vector3().fromArray(n.scale||[1,1,1]));
}
function worldMatrices(glb,overrides=new Map()) {
  const worlds=[];
  const visit=i=>{
    if(worlds[i])return worlds[i];
    const local=overrides.has(i)?nodeLocal(overrides.get(i)):nodeLocal(glb.json.nodes[i]);
    const p=glb.parents.get(i);return worlds[i]=p===undefined?local:new Matrix4().multiplyMatrices(visit(p),local);
  };
  glb.json.nodes.forEach((_,i)=>visit(i));return worlds;
}
function canonicalCheck(glb,label,hasSkin) {
  const names=glb.json.nodes.map(n=>n.name);
  if(hasSkin)check(glb.json.skins?.length===1,`${label}: expected exactly one skin`);
  const indices=hasSkin?glb.json.skins?.[0]?.joints:CANON_BONES.map(b=>names.indexOf(b.name));
  check(indices?.length===18,`${label}: expected 18 canonical joints`);
  for(let b=0;b<CANON_BONES.length;b++){
    const canon=CANON_BONES[b],idx=indices?.[b],n=glb.json.nodes[idx];
    check(n?.name===canon.name,`${label}: joint ${b} must be ${canon.name}`);if(!n)continue;
    check(canon.rest.every((v,k)=>Math.abs(v-(n.translation||[0,0,0])[k])<1e-6),`${label}: ${canon.name} rest position differs`);
    check([0,0,0,1].every((v,k)=>Math.abs(v-(n.rotation||[0,0,0,1])[k])<1e-6),`${label}: ${canon.name} rest rotation differs`);
    check((n.scale||[1,1,1]).every(v=>Math.abs(v-1)<1e-6),`${label}: ${canon.name} joint scale differs`);
    if(canon.parent)check(glb.json.nodes[glb.parents.get(idx)]?.name===canon.parent,`${label}: ${canon.name} parent differs`);
  }
  return indices;
}

function modelData(glb) {
  const meshIndex=glb.json.nodes.findIndex(n=>n.mesh!==undefined && n.skin!==undefined),meshNode=glb.json.nodes[meshIndex],mesh=glb.json.meshes[meshNode.mesh],skin=glb.json.skins[meshNode.skin];
  check(mesh.primitives.length===1,`${relative(glb.filename)}: expected one draw primitive`);
  const p=mesh.primitives[0],a=p.attributes,position=glb.accessor(a.POSITION),joints=glb.accessor(a.JOINTS_0),weights=glb.accessor(a.WEIGHTS_0),indices=glb.accessor(p.indices),uv=glb.accessor(a.TEXCOORD_0);
  const inverse=skin.inverseBindMatrices!==undefined?glb.accessor(skin.inverseBindMatrices):new Float64Array(skin.joints.length*16);
  const morphNames=mesh.extras?.targetNames||[];
  const morphs=(p.targets||[]).map(t=>t.POSITION===undefined?new Float64Array(position.length):glb.accessor(t.POSITION));
  // glTF skinning follows joint world transforms; the skinned mesh is a scene
  // root. Its actor placement comes from the parent of the canonical Root.
  const canonWorld=worldMatrices(glb),rootJoint=glb.json.nodes.findIndex(n=>n.name==='Root');
  const placementIndex=glb.parents.get(rootJoint),placementWorld=placementIndex===undefined?new Matrix4():canonWorld[placementIndex];
  const sourceBounds=bounds(position),wrapperScale=new Vector3().setFromMatrixScale(placementWorld).y;
  const jointVertices=[];
  const jointSets=[['LeftArm','LeftForeArm','leftElbow'],['RightArm','RightForeArm','rightElbow'],['LeftUpLeg','LeftLeg','leftKnee'],['RightUpLeg','RightLeg','rightKnee']];
  for(let i=0;i<position.length/3;i++){
    check(Array.from(position.subarray(i*3,i*3+3)).every(Number.isFinite),`${relative(glb.filename)}: nonfinite position ${i}`);
    let sum=0;const influence=new Map();
    for(let k=0;k<4;k++){const idx=joints[i*4+k],w=weights[i*4+k];sum+=w;check(Number.isInteger(idx)&&idx>=0&&idx<skin.joints.length,`${relative(glb.filename)}: invalid skin joint at ${i}`);check(Number.isFinite(w)&&w>=0,`${relative(glb.filename)}: invalid skin weight at ${i}`);if(w>0.005)influence.set(glb.json.nodes[skin.joints[idx]]?.name,w);}
    check(Math.abs(sum-1)<1e-5,`${relative(glb.filename)}: skin weights sum ${sum} at ${i}`);
    for(const [upper,lower,label] of jointSets)if(influence.has(upper)&&influence.has(lower)){jointVertices.push({index:i,label});break;}
  }
  const jointByIndex=new Map(jointVertices.map(v=>[v.index,v.label])),edgeMap=new Map(),rigidHeadEdges=new Map();
  const rigidHeadVertex=i=>{for(let k=0;k<4;k++)if(weights[i*4+k]>.999999&&glb.json.nodes[skin.joints[joints[i*4+k]]]?.name==='Head')return true;return false;};
  for(let t=0;t<indices.length;t+=3)for(const [x,y]of[[indices[t],indices[t+1]],[indices[t+1],indices[t+2]],[indices[t+2],indices[t]]]){
    const key=x<y?`${x}/${y}`:`${y}/${x}`;
    if(rigidHeadVertex(x)&&rigidHeadVertex(y))rigidHeadEdges.set(key,{a:x,b:y});
    const label=jointByIndex.get(x)||jointByIndex.get(y);if(label&&!edgeMap.has(key))edgeMap.set(key,{a:x,b:y,label});
  }
  return {glb,meshIndex,meshNode,mesh,skin,p,position,joints,weights,indices,inverse,uv,morphNames,morphs,wrapperScale,placementWorld,sourceBounds,jointVertices,jointEdges:[...edgeMap.values()],rigidHeadEdges:[...rigidHeadEdges.values()]};
}

const vector=new Vector3();
function skinPositions(model,worlds,position=model.position) {
  const palette=model.skin.joints.map((j,i)=>new Matrix4().multiplyMatrices(worlds[j],new Matrix4().fromArray(model.inverse,i*16)).elements),out=new Float64Array(position.length);
  for(let i=0;i<position.length/3;i++){
    const x=position[i*3],y=position[i*3+1],z=position[i*3+2];
    for(let k=0;k<4;k++){
      const w=model.weights[i*4+k];if(w===0)continue;const m=palette[model.joints[i*4+k]];
      out[i*3]+=w*(m[0]*x+m[4]*y+m[8]*z+m[12]);out[i*3+1]+=w*(m[1]*x+m[5]*y+m[9]*z+m[13]);out[i*3+2]+=w*(m[2]*x+m[6]*y+m[10]*z+m[14]);
    }
  }
  return {positions:out,palette};
}

function histogram() {
  const bins=new Uint32Array(1024);let min=Infinity,max=-Infinity,count=0;
  return {add(v){if(!Number.isFinite(v))throw Error('Nonfinite deformation metric');min=Math.min(min,v);max=Math.max(max,v);count++;const idx=Math.max(0,Math.min(1023,Math.floor((Math.log10(Math.max(1e-8,v))+8)/10*1024)));bins[idx]++;},json(){const q=p=>{let sum=0;for(let i=0;i<1024;i++){sum+=bins[i];if(sum>=count*p)return number(Math.min(max,Math.max(min,10**((i+.5)/1024*10-8))));}return max;};return count?{samples:count,min:number(min),p01:q(.01),p50:q(.5),p99:q(.99),max:number(max),quantiles:'log10 histogram, 1024 bins; min/max exact'}:{samples:0};}};
}
function determinantOfBlend(model,palette,i) {
  const a=new Float64Array(9);
  for(let k=0;k<4;k++){const w=model.weights[i*4+k];if(!w)continue;const m=palette[model.joints[i*4+k]];a[0]+=w*m[0];a[1]+=w*m[4];a[2]+=w*m[8];a[3]+=w*m[1];a[4]+=w*m[5];a[5]+=w*m[9];a[6]+=w*m[2];a[7]+=w*m[6];a[8]+=w*m[10];}
  return (a[0]*(a[4]*a[8]-a[5]*a[7])-a[1]*(a[3]*a[8]-a[5]*a[6])+a[2]*(a[3]*a[7]-a[4]*a[6]))/model.wrapperScale**3;
}

function animationData(glb) {
  const animation=glb.json.animations?.[0];if(!animation)throw Error('Missing delivered animation');
  const channels=animation.channels.map(c=>{
    const sampler=animation.samplers[c.sampler];return {name:glb.json.nodes[c.target.node].name,path:c.target.path,input:glb.accessor(sampler.input),output:glb.accessor(sampler.output),interpolation:sampler.interpolation||'LINEAR'};
  });
  const duration=Math.max(...channels.map(c=>c.input[c.input.length-1])),times=new Set([0,duration]);
  channels.forEach(c=>c.input.forEach(t=>times.add(t)));for(let f=0;f<=Math.ceil(duration*30);f++)times.add(Math.min(f/30,duration));
  return {name:animation.name,duration,channels,times:[...times].sort((a,b)=>a-b)};
}
function sampleChannel(c,time) {
  const width=c.path==='rotation'?4:3;let a=0;while(a<c.input.length-2&&c.input[a+1]<=time)a++;const b=Math.min(a+1,c.input.length-1),u=c.interpolation==='STEP'?0:Math.max(0,Math.min(1,(time-c.input[a])/(c.input[b]-c.input[a]||1)));
  if(c.interpolation==='CUBICSPLINE')throw Error('CUBICSPLINE is not supported by the independent QA sampler');
  if(c.path==='rotation')return new Quaternion().fromArray(c.output,a*4).slerp(new Quaternion().fromArray(c.output,b*4),u).toArray();
  return Array.from({length:width},(_,k)=>c.output[a*width+k]+u*(c.output[b*width+k]-c.output[a*width+k]));
}
function posedWorlds(model,animation,time) {
  const named=new Map(model.glb.json.nodes.map((n,i)=>[n.name,i])),overrides=new Map();
  for(const c of animation.channels){
    const idx=named.get(c.name);if(idx===undefined)continue;
    const n=overrides.get(idx)||{...model.glb.json.nodes[idx]};n[c.path]=sampleChannel(c,time);overrides.set(idx,n);
  }
  return worldMatrices(model.glb,overrides);
}

await fs.mkdir(path.join(root,'verification'),{recursive:true});
const inventory=[],glbs=new Map(),validations=[];
const generatedNames=new Set(['verification/assets.json','verification/gltf-validator.json']);
for(const filename of await enumerate(root)) {
  const name=relative(filename);if(generatedNames.has(name)&&!loadOnly)continue;
  const bytes=await fs.readFile(filename),ext=path.extname(filename).toLowerCase(),entry={path:name,bytes:bytes.length,sha256:digest(bytes),loaded:false};
  try {
    if(ext==='.glb'){
      const g=await readGLB(filename,bytes);glbs.set(name,g);
      const required=[...(g.json.extensionsRequired||[]),...(g.json.extensionsUsed||[])];
      check(!required.some(e=>/draco|meshopt/i.test(e)),`${name}: compressed runtime extension is forbidden`);
      const result=await validator.validateBytes(new Uint8Array(bytes),{uri:name,writeTimestamp:false,maxIssues:0,externalResourceFunction:async uri=>new Uint8Array(await fs.readFile(path.resolve(path.dirname(filename),decodeURIComponent(uri))))});
      validations.push({path:name,validator:validator.version(),issues:result.issues,info:result.info});check(result.issues.numErrors===0,`${name}: ${result.issues.numErrors} glTF validation errors`);check(result.issues.numWarnings===0,`${name}: ${result.issues.numWarnings} glTF validation warnings`);entry.parser='glTF 2.0 + Khronos glTF Validator';
    } else if(['.png','.webp','.jpg','.jpeg'].includes(ext)){
      const decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});entry.image={width:decoded.info.width,height:decoded.info.height,channels:decoded.info.channels};entry.parser='full image decode';
    } else {
      const text=decodeUTF8(bytes);
      if(ext==='.json'){JSON.parse(text);entry.parser='JSON';}
      else if(['.mjs','.js'].includes(ext)){execFileSync(process.execPath,['--check',filename],{stdio:'pipe'});entry.parser='UTF-8 + node --check';}
      else if(ext==='.py'){execFileSync('python3',['-c','import sys; compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec")',filename],{stdio:'pipe'});entry.parser='UTF-8 + Python syntax compile, without bytecode output';}
      else if(['.md','.html','.css','.txt','.svg','.sh'].includes(ext)||!ext){entry.parser='strict UTF-8';}
      else throw Error(`Unrecognised package file type ${ext}`);
    }
    entry.loaded=true;
  } catch(error){entry.error=String(error.message||error);failures.push(`${name}: ${entry.error}`);}
  inventory.push(entry);
}
if(loadOnly){console.log(JSON.stringify({passed:!failures.length,filesLoaded:inventory.length,glbs:validations.length,errors:validations.reduce((s,v)=>s+v.issues.numErrors,0),warnings:validations.reduce((s,v)=>s+v.issues.numWarnings,0),failures},null,2));process.exit(failures.length?1:0);}

const body=await loadJSON('body-manifest.json'),motion=await loadJSON('motion-manifest.json'),models=[],bodyRows=[];
for(const entry of body.models) {
  const g=glbs.get(entry.path);if(!g){check(false,`${entry.path}: body GLB missing`);continue;}
  const name=entry.id||entry.path;canonicalCheck(g,name,true);
  check(g.json.materials?.length===1,`${name}: expected one material`);check(g.json.images?.length===1,`${name}: expected one atlas image`);
  check(g.json.images?.[0]?.uri?.endsWith('athlete-atlas.png'),`${name}: expected shared external PNG atlas`);
  const imagePath=g.json.images?.[0]?.uri&&path.resolve(path.dirname(g.filename),g.json.images[0].uri),imageEntry=inventory.find(i=>i.path===relative(imagePath||root));
  check(imageEntry?.image?.width===1024&&imageEntry?.image?.height===1024,`${name}: atlas must be 1024 by 1024`);
  const model=modelData(g);models.push({entry,model});
  check(model.p.attributes.COLOR_0!==undefined,`${name}: missing vertex colours`);check(model.p.attributes._REGION!==undefined,`${name}: missing per-vertex region IDs`);
  const regions=g.accessor(model.p.attributes._REGION),regionIds=[...new Set(regions)].sort((a,b)=>a-b);
  for(const id of regions)check(Number.isInteger(id)&&id>=0&&id<=8,`${name}: invalid region ${id}`);
  for(const id of [0,1,2,3,4,5,6,8])check(regionIds.includes(id),`${name}: required region ${id} is empty`);
  const rest=skinPositions(model,worldMatrices(g)).positions,expected=new Float64Array(model.position.length),meshWorld=model.placementWorld;
  let bindError=0;
  for(let i=0;i<model.position.length;i+=3){vector.fromArray(model.position,i).applyMatrix4(meshWorld);expected.set(vector.toArray(),i);bindError=Math.max(bindError,Math.hypot(rest[i]-expected[i],rest[i+1]-expected[i+1],rest[i+2]-expected[i+2]));}
  check(bindError<1e-5,`${name}: inverse bind mismatch ${bindError}`);
  check(Math.abs(bounds(rest).height-entry.height)<1e-5,`${name}: measured stature differs from declared height`);
  const uvHash=digest(Buffer.from(Float32Array.from(model.uv).buffer)),indexHash=digest(Buffer.from(model.indices.buffer));
  if(bodyRows.length){check(uvHash===bodyRows[0].uvSha256,`${name}: shared UV differs`);check(indexHash===bodyRows[0].topologySha256,`${name}: shared topology differs`);}
  const baseTriangles=model.indices.length/3,maxHairTriangles=Math.max(0,...(body.hair||[]).map(h=>h.triangles||0));
  check(baseTriangles+maxHairTriangles<=7000,`${name}: body + selected hair exceeds 7000 triangles`);
  bodyRows.push({id:name,path:entry.path,triangles:baseTriangles,maximumSelectedHairTriangles:maxHairTriangles,maximumVisibleTriangles:baseTriangles+maxHairTriangles,bytes:inventory.find(i=>i.path===entry.path)?.bytes,vertices:model.position.length/3,regionIds,morphNames:model.morphNames,uvSha256:uvHash,topologySha256:indexHash,bindMatrixMaximumPositionErrorMeters:number(bindError),restWorldBounds:bounds(rest),declaredHeightMeters:entry.height,wrapperScale:number(model.wrapperScale),jointBlendVertices:model.jointVertices.length,jointEdges:model.jointEdges.length});
}
check((body.hair||[]).length===8,'Eight hair styles are required');
check((body.palettes?.skin||body.skinTones||[]).length===6,'Six skin tones are required');
for(const clip of motion.clips){const g=glbs.get(clip.path);if(g)canonicalCheck(g,clip.id,false);else check(false,`${clip.path}: motion GLB missing`);}
const libraries={};motion.clips.forEach(c=>libraries[c.library]=(libraries[c.library]||0)+1);
for(const library of ['soccer-v9','soccer-v10','soccer-v11','hoops-tall-v1','hoops-v11'])check(libraries[library]>=5,`${library}: five clips are required`);

const deformationRows=[];
for(const {entry,model}of models)for(const clip of motion.clips){
  const glb=glbs.get(clip.path);if(!glb)continue;const animation=animationData(glb),determinants=histogram(),stretch=histogram(),perJoint={},sweptMin=[Infinity,Infinity,Infinity],sweptMax=[-Infinity,-Infinity,-Infinity];let badVertices=0,negativeDeterminants=0,vertexEvaluations=0,headRigidStretchError=0,boneLengthError=0;
  for(const channel of animation.channels)check(channel.path==='rotation'||channel.path==='translation'&&['Root','Hips'].includes(channel.name),`${clip.id}: unexpected joint translation or scale track ${channel.name}.${channel.path}`);
  const namedBoneIndices=new Map(model.glb.json.nodes.map((n,i)=>[n.name,i]));
  const sports=[{name:'soccer',positions:model.position},...model.morphs.map((delta,i)=>({name:model.morphNames[i]||`morph-${i}`,positions:Float64Array.from(model.position,(v,k)=>v+delta[k])}))];
  for(const sport of sports){
    const edgeLength=model.jointEdges.map(e=>Math.hypot(sport.positions[e.a*3]-sport.positions[e.b*3],sport.positions[e.a*3+1]-sport.positions[e.b*3+1],sport.positions[e.a*3+2]-sport.positions[e.b*3+2])*model.wrapperScale);
    const headEdgeLength=model.rigidHeadEdges.map(e=>Math.hypot(sport.positions[e.a*3]-sport.positions[e.b*3],sport.positions[e.a*3+1]-sport.positions[e.b*3+1],sport.positions[e.a*3+2]-sport.positions[e.b*3+2])*model.wrapperScale);
    for(const time of animation.times){
      const worlds=posedWorlds(model,animation,time),{positions,palette}=skinPositions(model,worlds,sport.positions);vertexEvaluations+=positions.length/3;
      for(const bone of CANON_BONES){if(!bone.parent||bone.name==='Hips')continue;const a=worlds[namedBoneIndices.get(bone.name)].elements,b=worlds[namedBoneIndices.get(bone.parent)].elements;boneLengthError=Math.max(boneLengthError,Math.abs(Math.hypot(a[12]-b[12],a[13]-b[13],a[14]-b[14])-Math.hypot(...bone.rest)*model.wrapperScale));}
      for(let i=0;i<positions.length;i++){if(!Number.isFinite(positions[i]))badVertices++;const k=i%3;sweptMin[k]=Math.min(sweptMin[k],positions[i]);sweptMax[k]=Math.max(sweptMax[k],positions[i]);}
      for(const {index,label}of model.jointVertices){const det=determinantOfBlend(model,palette,index);if(det<0)negativeDeterminants++;determinants.add(Math.abs(det));const joint=perJoint[label]||=( {determinant:histogram(),edgeStretch:histogram()} );joint.determinant.add(Math.abs(det));}
      model.jointEdges.forEach((e,i)=>{if(edgeLength[i]<1e-8)return;const ratio=Math.hypot(positions[e.a*3]-positions[e.b*3],positions[e.a*3+1]-positions[e.b*3+1],positions[e.a*3+2]-positions[e.b*3+2])/edgeLength[i];stretch.add(ratio);(perJoint[e.label]||=( {determinant:histogram(),edgeStretch:histogram()} )).edgeStretch.add(ratio);});
      model.rigidHeadEdges.forEach((e,i)=>{if(headEdgeLength[i]<1e-8)return;const ratio=Math.hypot(positions[e.a*3]-positions[e.b*3],positions[e.a*3+1]-positions[e.b*3+1],positions[e.a*3+2]-positions[e.b*3+2])/headEdgeLength[i];headRigidStretchError=Math.max(headRigidStretchError,Math.abs(ratio-1));});
    }
  }
  check(badVertices===0,`${entry.id}/${clip.id}: nonfinite skinned vertex values`);
  check(boneLengthError<1e-5,`${entry.id}/${clip.id}: bone length changed ${boneLengthError}`);check(headRigidStretchError<1e-4,`${entry.id}/${clip.id}: rigid head geometry changed ${headRigidStretchError}`);
  const row={body:entry.id,clip:clip.id,library:clip.library,duration:number(animation.duration),poseSamples:animation.times.length,sports:sports.map(s=>s.name),vertexEvaluations,badVertexComponents:badVertices,maximumBoneLengthErrorMeters:number(boneLengthError),rigidHeadEdges:model.rigidHeadEdges.length,rigidHeadMaximumRelativeEdgeLengthError:number(headRigidStretchError),negativeBlendDeterminants:negativeDeterminants,jointBlendDeterminantMagnitude:determinants.json(),jointEdgeStretch:stretch.json(),perJoint:Object.fromEntries(Object.entries(perJoint).map(([k,v])=>[k,{determinant:v.determinant.json(),edgeStretch:v.edgeStretch.json()}])),sweptWorldBounds:{min:sweptMin.map(number),max:sweptMax.map(number)}};
  deformationRows.push(row);process.stdout.write(`Measured ${entry.id}: ${clip.id}\n`);
}

const report={schemaVersion:1,tool:'tools/verify-assets.mjs',runtimeCompression:'No Draco or meshopt extensions accepted; no decoder is invoked',filesLoaded:inventory.length,inventory,generatedReports:{paths:[...generatedNames],loadedAfterWrite:true,selfHashesOmitted:true},models:bodyRows,libraries,deformation:{method:'Independent glTF accessor decoder, sampler and CPU linear blend skinning. All delivered key times plus uniform 30 Hz; every body, every clip, soccer and all garment morph extremes. Joint metrics use vertices blending the two adjoining elbow/knee bones and triangle edges touching those vertices.',limits:'Finite vertices, unit weights, canonical bind and topology are hard checks. Determinant and edge-stretch values are measurements rather than a universal perceptual threshold. Garment collapse targets may contain hidden triangles. Inspect the corresponding rendered eight-frame sheets for folds, intersections and joint appearance. This does not certify a physical-device frame rate.',samplePairs:deformationRows.length,totalVertexEvaluations:deformationRows.reduce((s,r)=>s+r.vertexEvaluations,0),rows:deformationRows},failures,passed:failures.length===0};
await fs.writeFile(path.join(root,'verification/gltf-validator.json'),JSON.stringify({schemaVersion:1,validatorVersion:validator.version(),files:validations,totalErrors:validations.reduce((s,r)=>s+r.issues.numErrors,0),totalWarnings:validations.reduce((s,r)=>s+r.issues.numWarnings,0)},null,2)+'\n');
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(report,null,2)+'\n');
for(const name of generatedNames)JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
console.log(JSON.stringify({passed:report.passed,filesLoaded:report.filesLoaded,glbs:validations.length,bodyClipPairs:deformationRows.length,totalVertexEvaluations:report.deformation.totalVertexEvaluations,failures},null,2));
if(failures.length)process.exitCode=1;
