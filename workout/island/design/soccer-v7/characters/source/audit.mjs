/**
 * Independent delivery audit. No build step and no npm dependencies required.
 * Decodes the shipped Draco payload with the local decoder instead of trusting
 * triangle counts or bounds declared by the model generator.
 *
 * node workout/island/design/soccer-v7/characters/source/audit.mjs
 * Optional: --sample-motion, --models-dir <path>, --out <path>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {frontSurfaceUVSamples,uvInRectangle} from './semantic-uv-surface.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../../../../..');
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? path.resolve(args[args.indexOf(key) + 1]) : fallback;
const modelsDir = option('--models-dir', path.join(root, 'models'));
const output = option('--out', path.join(root, 'verification/assets.json'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const rounded = number => Math.round(number * 1e8) / 1e8;
const finite = values => values.every(Number.isFinite);
const errors = [], warnings = [];
const semanticHelperBytes=await fs.readFile(path.join(root,'source/semantic-uv-surface.mjs'));
const check = (test, message) => { if (!test) errors.push(message); };
const canonicalBytes=await fs.readFile(path.resolve(root,'../../motion2/soccer.json'));
const canonical=JSON.parse(canonicalBytes.toString('utf8')).skeleton.bones;
const boneNames = canonical.map(bone => bone.name);
const sourceMotionBytes=await fs.readFile(path.join(root,'animations.json')),sourceRigBytes=await fs.readFile(path.join(root,'rig.json'));
const sourceMotion=JSON.parse(sourceMotionBytes.toString('utf8')),sourceRig=JSON.parse(sourceRigBytes.toString('utf8'));
const rigData=[];
for(const [label,data]of [['animations.json/skeleton',sourceMotion.skeleton],['rig.json',sourceRig]]){
  const before=errors.length,bones=data?.bones||[];
  check(bones.length===18&&data.units==='meters',`${label}: expected canonical18 in meters`);
  check((data.up||data.axes?.up)==='+Y'&&(data.forward||data.axes?.forward)==='+Z',`${label}: expected +Y up and +Z forward`);
  for(const [i,expected]of canonical.entries()){
    const actual=bones[i];
    check(actual?.name===expected.name&&actual?.parent===expected.parent&&Array.isArray(actual?.restTranslationMeters)&&actual.restTranslationMeters.length===3&&actual.restTranslationMeters.every((value,k)=>Number.isFinite(value)&&Math.abs(value-expected.restTranslationMeters[k])<1e-8),`${label}: canonical bone${i} differs from motion2 rest contract`);
  }
  rigData.push({file:label,bones:bones.length,pass:errors.length===before,method:'Exact names, order, parent hierarchy, rest translations, meters and axes compared to motion2/soccer.json.'});
}
let khronosTools;
try {
  const require=createRequire(process.env.SOCCER_V7_TOOLS||'/tmp/soccer-v7-tools/package.json');
  const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions');
  const codec=require('draco3dgltf'),validator=require('gltf-validator');
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
  khronosTools={io,validator};
} catch(error) {warnings.push(`Optional Khronos/decoded glTF validation unavailable: ${error.message}. Independent binary/Draco checks still run.`);}

function parseGLB(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('Expected glTF 2 GLB header');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB declared byte length differs from file');
  let json, binary, chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) throw new Error('Malformed/alignment-invalid GLB chunk');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    chunks.push({type, bytes:length});
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').trim());
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error('Missing JSON or embedded BIN chunk');
  if (json.asset?.version !== '2.0') throw new Error('Expected glTF asset version 2.0');
  if ((json.buffers || []).length !== 1 || json.buffers[0].uri) throw new Error('Expected one embedded buffer');
  if (json.buffers[0].byteLength > binary.length || binary.length-json.buffers[0].byteLength>3) throw new Error('BIN length does not match buffer');
  for (const view of json.bufferViews || []) {
    if ((view.byteOffset || 0) + view.byteLength > binary.length) throw new Error('bufferView outside BIN payload');
    if ((view.buffer || 0) !== 0) throw new Error('Unexpected external bufferView');
  }
  return {json, binary, chunks};
}

const component = {
  5120:{bytes:1, read:(b,o)=>b.readInt8(o), normalize:v=>Math.max(-1,v/127)},
  5121:{bytes:1, read:(b,o)=>b.readUInt8(o), normalize:v=>v/255},
  5122:{bytes:2, read:(b,o)=>b.readInt16LE(o), normalize:v=>Math.max(-1,v/32767)},
  5123:{bytes:2, read:(b,o)=>b.readUInt16LE(o), normalize:v=>v/65535},
  5125:{bytes:4, read:(b,o)=>b.readUInt32LE(o), normalize:v=>v/4294967295},
  5126:{bytes:4, read:(b,o)=>b.readFloatLE(o), normalize:v=>v}
};
const dimensions = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
function accessorData(doc, index) {
  const accessor = doc.json.accessors?.[index];
  if (!accessor) throw new Error(`Missing accessor ${index}`);
  const type = component[accessor.componentType], size = dimensions[accessor.type];
  if (!type || !size) throw new Error(`Unsupported accessor type ${accessor.componentType}/${accessor.type}`);
  const array = new Float64Array(accessor.count * size);
  if (accessor.bufferView !== undefined) {
    const view=doc.json.bufferViews[accessor.bufferView];
    const base=(view.byteOffset||0)+(accessor.byteOffset||0), stride=view.byteStride||size*type.bytes;
    for (let i=0;i<accessor.count;i++) for(let k=0;k<size;k++) {
      const value=type.read(doc.binary,base+i*stride+k*type.bytes);
      array[i*size+k]=accessor.normalized?type.normalize(value):value;
    }
  }
  if (accessor.sparse) {
    const s=accessor.sparse, iv=doc.json.bufferViews[s.indices.bufferView], vv=doc.json.bufferViews[s.values.bufferView];
    const it=component[s.indices.componentType], ib=(iv.byteOffset||0)+(s.indices.byteOffset||0), vb=(vv.byteOffset||0)+(s.values.byteOffset||0);
    for(let i=0;i<s.count;i++) {
      const destination=it.read(doc.binary,ib+i*it.bytes);
      if(destination>=accessor.count)throw new Error('Sparse index exceeds accessor');
      for(let k=0;k<size;k++) {const value=type.read(doc.binary,vb+(i*size+k)*type.bytes);array[destination*size+k]=accessor.normalized?type.normalize(value):value;}
    }
  }
  return {array,size,count:accessor.count,accessor};
}

let decoderPromise;
async function decoderModule() {
  if (decoderPromise) return decoderPromise;
  decoderPromise=(async()=>{
    const folders=[path.join(root,'vendor/draco'),path.join(root,'vendor'),path.resolve(root,'../../viewer/draco'),path.resolve(root,'../../../vendor/draco')];
    for(const folder of folders) {
      try {
        const filename=path.join(folder,'draco_wasm_wrapper.js');
        const code=await fs.readFile(filename,'utf8');
        const wasm=await fs.readFile(path.join(folder,'draco_decoder.wasm'));
        const module={exports:{}};
        const factory=new Function('require','module','exports','__filename','__dirname',`${code}\n;return module.exports;`)(createRequire(import.meta.url),module,module.exports,filename,folder);
        return await factory({wasmBinary:new Uint8Array(wasm)});
      } catch(error) { if(error.code!=='ENOENT') throw error; }
    }
    throw new Error('No local Draco WASM decoder found; geometry cannot be independently verified');
  })();
  return decoderPromise;
}

async function primitiveData(doc, primitive) {
  const compressed=primitive.extensions?.KHR_draco_mesh_compression;
  if(!compressed) {
    const attributes=Object.fromEntries(Object.entries(primitive.attributes||{}).map(([name,index])=>[name,accessorData(doc,index)]));
    const count=primitive.indices===undefined?attributes.POSITION.count:accessorData(doc,primitive.indices).count;
    return {attributes,indices:primitive.indices===undefined?Uint32Array.from({length:count},(_,i)=>i):Uint32Array.from(accessorData(doc,primitive.indices).array),triangles:count/3,decoded:false};
  }
  const module=await decoderModule(), decoder=new module.Decoder(), buffer=new module.DecoderBuffer(), mesh=new module.Mesh();
  const view=doc.json.bufferViews[compressed.bufferView], bytes=doc.binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
  buffer.Init(new Int8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),bytes.length);
  const status=decoder.DecodeBufferToMesh(buffer,mesh);
  if(!status.ok()||mesh.ptr===0) {const message=status.error_msg();module.destroy(status);module.destroy(mesh);module.destroy(buffer);module.destroy(decoder);throw new Error(`Draco decode failed: ${message}`);}
  const attributes={};
  try {
    for(const [semantic,accessorIndex] of Object.entries(primitive.attributes||{})) {
      const uniqueID=compressed.attributes[semantic];
      if(uniqueID===undefined) {attributes[semantic]=accessorData(doc,accessorIndex);continue;}
      const attribute=decoder.GetAttributeByUniqueId(mesh,uniqueID), values=new module.DracoFloat32Array();
      try {
        decoder.GetAttributeFloatForAllPoints(mesh,attribute,values);
        const size=attribute.num_components(), count=mesh.num_points(), array=new Float64Array(size*count);
        for(let i=0;i<array.length;i++)array[i]=values.GetValue(i);
        // Draco float retrieval returns the encoded integer components for a
        // normalized glTF accessor; normalize exactly once according to glTF.
        const accessor=doc.json.accessors[accessorIndex];
        if(accessor.normalized && accessor.componentType!==5126)for(let i=0;i<array.length;i++)array[i]=component[accessor.componentType].normalize(array[i]);
        attributes[semantic]={array,size,count,accessor};
      } finally {module.destroy(values);}
    }
    const faces=mesh.num_faces();
    if(primitive.indices!==undefined && doc.json.accessors[primitive.indices].count!==faces*3)throw new Error('Draco face count differs from glTF index accessor count');
    const indices=new Uint32Array(faces*3),face=new module.DracoInt32Array();
    try{for(let i=0;i<faces;i++){decoder.GetFaceFromMesh(mesh,i,face);for(let k=0;k<3;k++)indices[i*3+k]=face.GetValue(k);}}finally{module.destroy(face);}
    return {attributes,indices,triangles:faces,decoded:true};
  } finally {module.destroy(status);module.destroy(mesh);module.destroy(buffer);module.destroy(decoder);}
}

function imageDimensions(bytes,mime) {
  if(bytes.length>24&&bytes.subarray(1,4).toString()==='PNG')return[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  if(bytes[0]===255&&bytes[1]===216) {
    let at=2;
    while(at<bytes.length) {
      if(bytes[at]!==255){at++;continue;}const marker=bytes[at+1];at+=2;
      if(marker===216||marker===217)continue;
      const length=bytes.readUInt16BE(at);
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return[bytes.readUInt16BE(at+5),bytes.readUInt16BE(at+3)];
      at+=length;
    }
  }
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP') {
    const format=bytes.subarray(12,16).toString();
    if(format==='VP8X')return[1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
    if(format==='VP8L') {const n=bytes.readUInt32LE(21);return[(n&16383)+1,((n>>>14)&16383)+1];}
    if(format==='VP8 ')return[bytes.readUInt16LE(26)&16383,bytes.readUInt16LE(28)&16383];
  }
  throw new Error(`Unsupported/unreadable image ${mime||'unknown'}`);
}
const textureImageSource=(json,index)=>json.textures?.[index]?.extensions?.EXT_texture_webp?.source??json.textures?.[index]?.source;

const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function multiply(a,b) {const c=Array(16).fill(0);for(let column=0;column<4;column++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)c[column*4+row]+=a[k*4+row]*b[column*4+k];return c;}
function matrix(t=[0,0,0],q=[0,0,0,1],s=[1,1,1]) {
  const [x,y,z,w]=q,x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return[(1-yy-zz)*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,(xy-wz)*s[1],(1-xx-zz)*s[1],(yz+wx)*s[1],0,(xz+wy)*s[2],(yz-wx)*s[2],(1-xx-yy)*s[2],0,...t,1];
}
function point(m,x,y,z) {return[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}
function worldMatrices(json,pose) {
  const parents=new Map();(json.nodes||[]).forEach((node,i)=>(node.children||[]).forEach(child=>parents.set(child,i)));
  const world=[],visiting=new Set();
  function visit(i) {
    if(world[i])return world[i];if(visiting.has(i))throw new Error('Cyclic glTF node hierarchy');visiting.add(i);
    const n=json.nodes[i],t=[...(n.translation||[0,0,0])],q=pose?.rotations?.[n.name]||n.rotation||[0,0,0,1];
    if(n.name==='Hips'&&pose?.hipsOffsetMeters)for(let k=0;k<3;k++)t[k]+=pose.hipsOffsetMeters[k];
    const local=pose&&boneNames.includes(n.name)?matrix(t,q,n.scale):n.matrix||matrix(t,q,n.scale);
    world[i]=parents.has(i)?multiply(visit(parents.get(i)),local):local;visiting.delete(i);return world[i];
  }
  (json.nodes||[]).forEach((_,i)=>visit(i));return world;
}

function geometryBounds(doc,pieces,pose) {
  const world=worldMatrices(doc.json,pose), min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const piece of pieces) {
    const {attributes:a,nodeIndex}=piece, positions=a.POSITION.array,skinIndex=doc.json.nodes[nodeIndex].skin;
    let jointMatrices;
    if(skinIndex!==undefined) {const skin=doc.json.skins[skinIndex],inv=accessorData(doc,skin.inverseBindMatrices).array;jointMatrices=skin.joints.map((joint,i)=>multiply(world[joint],Array.from(inv.subarray(i*16,i*16+16))));}
    for(let i=0;i<a.POSITION.count;i++) {
      const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];let p;
      if(jointMatrices&&a.JOINTS_0&&a.WEIGHTS_0) {
        p=[0,0,0];for(let k=0;k<4;k++){const weight=a.WEIGHTS_0.array[i*4+k];if(weight<=0)continue;const jm=jointMatrices[a.JOINTS_0.array[i*4+k]];if(!jm)throw new Error('Skin index references absent joint');const v=point(jm,x,y,z);for(let c=0;c<3;c++)p[c]+=v[c]*weight;}
      } else p=point(world[nodeIndex],x,y,z);
      for(let c=0;c<3;c++){min[c]=Math.min(min[c],p[c]);max[c]=Math.max(max[c],p[c]);}
    }
  }
  return{min:min.map(rounded),max:max.map(rounded),size:max.map((v,i)=>rounded(v-min[i]))};
}

function nativeAnimationAudit(doc,relative) {
  const definitions=new Map(sourceMotion.clips.map(clip=>[clip.id,clip])),animations=doc.json.animations||[],rows=[];
  check(animations.length===definitions.size,`${relative}: expected ${definitions.size} native glTF animations, got ${animations.length}`);
  check(new Set(animations.map(a=>a.name)).size===animations.length,`${relative}: duplicate native animation names`);
  for(const animation of animations) {
    const clip=definitions.get(animation.name);check(clip,`${relative}: unexpected native animation ${animation.name}`);if(!clip)continue;
    const rotations=new Set();let hips=0,maxTimeError=0,maxQuaternionError=0,maxHipsError=0,maxNormError=0;
    check(animation.extras?.fps===30&&animation.extras?.rootMotion===false,`${relative}/${animation.name}: native metadata must declare 30 fps and rootMotion:false`);
    check(animation.channels.length===19,`${relative}/${animation.name}: expected 18 rotation and Hips translation channels`);
    for(const channel of animation.channels) {
      const target=doc.json.nodes[channel.target.node],name=target?.name,pathName=channel.target.path,sampler=animation.samplers[channel.sampler];
      check((sampler.interpolation||'LINEAR')==='LINEAR',`${relative}/${animation.name}/${name}: native interpolation must be LINEAR`);
      const input=accessorData(doc,sampler.input),output=accessorData(doc,sampler.output);
      check(input.size===1&&input.count===clip.frames.length&&output.count===clip.frames.length,`${relative}/${animation.name}/${name}: native 30 Hz sample count differs from source`);
      for(let i=0;i<Math.min(input.count,clip.frames.length);i++)maxTimeError=Math.max(maxTimeError,Math.abs(input.array[i]-clip.frames[i].timeSeconds));
      if(pathName==='rotation') {
        rotations.add(name);check(boneNames.includes(name)&&output.size===4,`${relative}/${animation.name}: unexpected rotation channel ${name}`);
        if(!boneNames.includes(name)||output.size!==4)continue;
        for(let i=0;i<Math.min(output.count,clip.frames.length);i++) {
          const q=Array.from(output.array.subarray(i*4,i*4+4)),expected=clip.frames[i].rotations[name];
          const error=Math.min(Math.hypot(...q.map((v,k)=>v-expected[k])),Math.hypot(...q.map((v,k)=>v+expected[k])));
          maxQuaternionError=Math.max(maxQuaternionError,error);maxNormError=Math.max(maxNormError,Math.abs(Math.hypot(...q)-1));
        }
      }else if(pathName==='translation'&&name==='Hips') {
        hips++;check(output.size===3,`${relative}/${animation.name}: Hips native translation must be VEC3`);
        const rest=canonical.find(b=>b.name==='Hips').restTranslationMeters;
        for(let i=0;i<Math.min(output.count,clip.frames.length);i++)for(let k=0;k<3;k++)maxHipsError=Math.max(maxHipsError,Math.abs(output.array[i*3+k]-rest[k]-clip.frames[i].hipsOffsetMeters[k]));
      }else check(false,`${relative}/${animation.name}: forbidden native channel ${name}/${pathName}; reference world trajectory must remain external`);
    }
    check(rotations.size===18&&boneNames.every(name=>rotations.has(name))&&hips===1,`${relative}/${animation.name}: missing canonical rotation or Hips translation channel`);
    check(maxTimeError<2e-6&&maxQuaternionError<2e-6&&maxHipsError<2e-6&&maxNormError<2e-5,`${relative}/${animation.name}: native keyframes differ from canonical source`);
    rows.push({id:animation.name,fps:30,frames:clip.frames.length,channels:animation.channels.length,rootMotion:false,maxTimeErrorSeconds:rounded(maxTimeError),maxQuaternionError:rounded(maxQuaternionError),maxHipsTranslationErrorMeters:rounded(maxHipsError),maxQuaternionNormError:rounded(maxNormError)});
  }
  return{count:animations.length,required:definitions.size,method:'Independent binary-accessor comparison of every native animation keyframe to canonical source JSON; reference world translation is excluded.',clips:rows};
}

let manifest,manifestBytes;
try {manifestBytes=await fs.readFile(path.join(root,'asset-manifest.json'));manifest=JSON.parse(manifestBytes.toString('utf8'));}catch(error){errors.push(`Missing asset-manifest.json: ${error.message}`);}

const files=(await fs.readdir(modelsDir)).filter(file=>file.endsWith('.glb')).sort();
check(files.length===16,`Expected exactly eight characters with two LODs, found ${files.length} GLBs`);
const reports=[],documents=new Map();
for(const filename of files) {
  const absolute=path.join(modelsDir,filename),relative=path.relative(root,absolute),bytes=await fs.readFile(absolute),startErrors=errors.length;
  try {
    const doc=parseGLB(bytes),{json}=doc,lod=Number(filename.match(/lod([012])/i)?.[1]??0);
    check(bytes.length<=1500000,`${relative}: ${bytes.length} bytes exceeds 1,500,000`);
    check(json.extensionsUsed?.includes('KHR_draco_mesh_compression')&&json.extensionsRequired?.includes('KHR_draco_mesh_compression'),`${relative}: Draco must be declared as a used and required extension`);
    const skins=(json.skins||[]).map(skin=>({joints:skin.joints.map(i=>json.nodes[i].name),inverseBindMatrices:skin.inverseBindMatrices}));
    check(skins.length>0,`${relative}: absent skin`);
    const parent=new Map();(json.nodes||[]).forEach((n,i)=>(n.children||[]).forEach(child=>parent.set(child,i)));
    const restWorld=worldMatrices(json);
    const skeleton=[];
    for(const [skinIndex,skin] of (json.skins||[]).entries()) {
      const names=skins[skinIndex].joints;
      check(names.length===18&&new Set(names).size===18&&boneNames.every(n=>names.includes(n)),`${relative}: skeleton differs from canonical18`);
      check(names.every((name,i)=>name===boneNames[i]),`${relative}: skin joint order differs from canonical18`);
      const inverseBinds=accessorData(doc,skin.inverseBindMatrices);
      check(inverseBinds.count===18&&inverseBinds.size===16&&finite(Array.from(inverseBinds.array)),`${relative}: expected eighteen finite MAT4 inverse bind matrices`);
      for(const [jointNumber,index] of skin.joints.entries()) {
        const node=json.nodes[index],expected=canonical.find(b=>b.name===node.name);if(!expected)continue;
        const pn=json.nodes[parent.get(index)]?.name,actualParent=boneNames.includes(pn)?pn:null;
        const translation=node.translation||[0,0,0],q=node.rotation||[0,0,0,1],s=node.scale||[1,1,1];
        const restError=Math.hypot(...translation.map((v,i)=>v-expected.restTranslationMeters[i]));
        const quaternionNorm=Math.hypot(...q);
        const rotationError=2*Math.acos(Math.min(1,Math.abs(q[3])/quaternionNorm));
        const restSkin=multiply(restWorld[index],Array.from(inverseBinds.array.subarray(jointNumber*16,jointNumber*16+16)));
        const inverseBindError=Math.max(...restSkin.map((v,i)=>Math.abs(v-identity()[i])));
        check(actualParent===expected.parent,`${relative}: ${node.name} parent ${actualParent}, expected ${expected.parent}`);
        check(finite(translation)&&finite(q)&&finite(s)&&Math.abs(quaternionNorm-1)<1e-5&&restError<1e-5&&rotationError<1e-5&&s.every(v=>Math.abs(v-1)<1e-5),`${relative}: ${node.name} canonical rest transform mismatch`);
        check(inverseBindError<2e-5,`${relative}: ${node.name} inverse bind does not invert the actual rest-world transform (${inverseBindError})`);
        skeleton.push({name:node.name,parent:actualParent,restTranslationErrorMeters:rounded(restError),restRotationErrorRadians:rounded(rotationError),inverseBindIdentityError:rounded(inverseBindError)});
      }
    }
    const pieces=[],primitives=[];
    let triangles=0,vertices=0,maxWeightSumError=0,maxRootWeight=0,invalidWeights=0,invalidJoints=0;
    for(const [nodeIndex,node] of (json.nodes||[]).entries())if(node.mesh!==undefined) {
      check(node.skin!==undefined,`${relative}: mesh ${node.name||nodeIndex} is not bound to the canonical skin`);
      for(const primitive of json.meshes[node.mesh].primitives) {
        check((primitive.mode??4)===4,`${relative}: only TRIANGLES supported`);
        const data=await primitiveData(doc,primitive),a=data.attributes;
        check(data.decoded,`${relative}: primitive lacks Draco compression`);
        check(a.POSITION&&a.NORMAL&&a.TEXCOORD_0,`${relative}: missing POSITION/NORMAL/TEXCOORD_0`);
        check(!a.TEXCOORD_1,`${relative}: second UV set violates single atlas layout`);
        for(const [name,value]of Object.entries(a))check(finite(Array.from(value.array)),`${relative}: nonfinite ${name}`);
        check(a.POSITION.count===doc.json.accessors[primitive.attributes.POSITION].count,`${relative}: decoded vertex count differs from accessor`);
        if(node.skin!==undefined) {
          check(a.JOINTS_0?.size===4&&a.WEIGHTS_0?.size===4,`${relative}: missing VEC4 skin indices or weights`);
          if(a.JOINTS_0&&a.WEIGHTS_0)for(let i=0;i<a.POSITION.count;i++) {
            let sum=0;for(let k=0;k<4;k++){const joint=a.JOINTS_0.array[i*4+k],w=a.WEIGHTS_0.array[i*4+k];sum+=w;if(joint===0)maxRootWeight=Math.max(maxRootWeight,w);if(w<-.0001||w>1.0001)invalidWeights++;if(joint<0||joint>=18||joint!==Math.round(joint))invalidJoints++;}
            maxWeightSumError=Math.max(maxWeightSumError,Math.abs(sum-1));
          }
        }
        let outsideUV=0;
        for(let i=0;i<(a.TEXCOORD_0?.array.length||0);i++)if(a.TEXCOORD_0.array[i]<-.001||a.TEXCOORD_0.array[i]>1.001)outsideUV++;
        check(outsideUV===0,`${relative}: ${outsideUV} UV components escape atlas`);
        // A numeric0..1 UV check alone missed the round10 face/shirt region regression.
        // Select small physical forehead/chest cores independently of generator object names.
        const materialName=json.materials?.[primitive.material]?.name||primitive.material,semanticAtlasSamples=[];
        if((materialName==='Skin'||materialName==='Cloth')&&a.POSITION&&a.NORMAL&&a.TEXCOORD_0){
          const face=materialName==='Skin',region=face?[.015,.01,.60,.54]:[.62,.01,.99,.44];
          let selected=0,inside=0;
          for(let i=0;i<a.POSITION.count;i++){
            const [x,y,z]=a.POSITION.array.subarray(i*3,i*3+3),nz=a.NORMAL.array[i*3+2];
            if(face?Math.abs(x)<.04&&y>1.635&&y<1.665&&z>.035&&nz>.4:Math.abs(x)<.10&&y>1.12&&y<1.25&&z>.05&&nz>.4){
              selected++;const u=a.TEXCOORD_0.array[i*2],v=a.TEXCOORD_0.array[i*2+1];
              if(u>=region[0]-.001&&v>=region[1]-.001&&u<=region[2]+.001&&v<=region[3]+.001)inside++;
            }
          }
          const minimumFraction=face?(lod===0?.95:.5):.95,vertexFraction=selected?inside/selected:0;
          const grid=face?[-.025,0,.025].flatMap(x=>[1.638,1.650,1.662].map(y=>[x,y])):[];
          const rays=face?frontSurfaceUVSamples(a.POSITION.array,a.TEXCOORD_0.array,data.indices,grid):[];
          for(const ray of rays)if(ray.hit)ray.hit.insideExpectedRegion=uvInRectangle(ray.hit.uv,region);
          const hits=rays.filter(ray=>ray.hit),mappedHits=hits.filter(ray=>ray.hit.insideExpectedRegion),rayFraction=hits.length?mappedHits.length/hits.length:0;
          const fallback=face&&selected===0,validationSampleCount=fallback?hits.length:selected,validationInside=fallback?mappedHits.length:inside;
          const fraction=validationSampleCount?validationInside/validationSampleCount:0;
          // A sparse LOD can have no vertex inside this physical window while
          // real front triangles cover it. Require all9 actual surface hits;
          // interpolate their UVs instead of treating an empty vertex set as
          // either success or a wrong mapping. Existing fractions stay intact.
          const surfacePass=!face||(hits.length===grid.length&&hits.length>0&&rayFraction>=minimumFraction);
          const sample={physicalCore:face?'front forehead':'front chest',expectedAtlasRegion:face?'face':'shirt',topLeftUVBounds:region,vertices:selected,insideExpectedRegion:inside,vertexFraction,fraction,minimumFraction,validationSampleCount,validationInsideExpectedRegion:validationInside,samplingMethod:fallback?'decoded front-surface rays; empty vertex window':'physical vertex window'+(face?' plus decoded front-surface rays':''),...(face?{surfaceRays:rays,surfaceHitCount:hits.length,surfaceMappedHitCount:mappedHits.length,surfaceFraction:rayFraction,surfacePass}:{}),pass:validationSampleCount>0&&fraction>=minimumFraction&&surfacePass};
          semanticAtlasSamples.push(sample);check(sample.pass,`${relative}: ${materialName} physical ${sample.physicalCore} maps to wrong atlas region (${validationInside}/${validationSampleCount}; vertices ${inside}/${selected}${face?'; rays '+mappedHits.length+'/'+hits.length:''})`);
        }
        triangles+=data.triangles;vertices+=a.POSITION.count;
        primitives.push({node:node.name,material:materialName,triangles:data.triangles,vertices:a.POSITION.count,dracoDecoded:data.decoded,...(semanticAtlasSamples.length?{semanticAtlasSamples}:{})});
        pieces.push({...data,nodeIndex});
      }
    }
    check(maxWeightSumError<.0001&&invalidWeights===0&&invalidJoints===0,`${relative}: invalid skin weights/indices (${maxWeightSumError}/${invalidWeights}/${invalidJoints})`);
    check(maxRootWeight<=1e-7,`${relative}: logical Root must not directly influence skin; heading handoff requires zero Root weights`);
    const images=[];
    for(const [index,img]of (json.images||[]).entries()) {
      check(img.bufferView!==undefined&&!img.uri,`${relative}: image ${index} must be embedded`);
      if(img.bufferView===undefined)continue;
      const view=json.bufferViews[img.bufferView],content=doc.binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),size=imageDimensions(content,img.mimeType);
      check(size.every(v=>v>0&&v<=1024),`${relative}: texture exceeds 1024 or has invalid dimensions (${size})`);
      images.push({name:img.name||`image-${index}`,mimeType:img.mimeType,size,bytes:content.length,sha256:sha256(content),estimatedRGBA8WithMipmapsBytes:Math.ceil(size[0]*size[1]*4*4/3)});
    }
    const materials=(json.materials||[]).map(m=>({name:m.name,alphaMode:m.alphaMode||'OPAQUE',alphaCutoff:m.alphaCutoff??.5,doubleSided:!!m.doubleSided,basecolor:m.pbrMetallicRoughness?.baseColorTexture?.index,normal:m.normalTexture?.index,orm:m.pbrMetallicRoughness?.metallicRoughnessTexture?.index,roughnessFactor:m.pbrMetallicRoughness?.roughnessFactor??1,normalScale:m.normalTexture?.scale??1,transmissionFactor:m.extensions?.KHR_materials_transmission?.transmissionFactor??0,ior:m.extensions?.KHR_materials_ior?.ior??1.5,portableOptics:m.extras?.portableOptics===true}));
    const expectedSurfaces=['Skin','Cloth','Eyes','HairCards','EyesCornea'];
    check(materials.length===5&&expectedSurfaces.every(name=>materials.some(material=>material.name===name)),`${relative}: expected five final surface materials including EyesCornea`);
    check(primitives.length===5,`${relative}: final character should use five draw primitives`);
    const cornea=materials.find(material=>material.name==='EyesCornea');
    check(cornea?.alphaMode==='OPAQUE'&&cornea.basecolor!==undefined,`${relative}: final portable cornea must use the opaque shared atlas material`);
    check(Math.abs((cornea?.ior??0)-1.376)<1e-6&&cornea?.portableOptics,`${relative}: final portable cornea IOR/metadata differs from approved optics`);
    const declaredHair=manifest?.characters?.find(character=>character.id===filename.replace(/-lod[0-9]\.glb$/,''))?.design?.hair;
    check(materials.find(material=>material.name==='HairCards')?.doubleSided===(declaredHair==='coils'),`${relative}: HairCards sidedness differs from approved style-specific material`);
    check(materials.find(material=>material.name==='HairCards')?.normalScale===1,`${relative}: final HairCards normal scale must be1`);
    check(materials.every(material=>material.transmissionFactor===0),`${relative}: transmission would require an additional framebuffer`);
    const baseSources=new Set(materials.filter(m=>m.basecolor!==undefined).map(m=>textureImageSource(json,m.basecolor)));
    const normals=new Set(materials.filter(m=>m.normal!==undefined).map(m=>textureImageSource(json,m.normal)));
    const orms=new Set(materials.filter(m=>m.orm!==undefined).map(m=>textureImageSource(json,m.orm)));
    check(baseSources.size===1&&normals.size===1&&orms.size===1&&![baseSources,normals,orms].some(set=>set.has(undefined)),`${relative}: materials must share one atlas layout with one valid image per PBR channel`);
    check(images.length<=3,`${relative}: more than three atlas channel images`);
    check(materials.some(m=>/skin/i.test(m.name||'')&&m.normal!==undefined&&m.orm!==undefined),`${relative}: Skin material lacks normal or roughness texture`);
    check(materials.some(m=>/cloth/i.test(m.name||'')&&m.normal!==undefined&&m.orm!==undefined),`${relative}: Cloth material lacks normal or roughness texture`);
    check(materials.some(m=>/hair/i.test(m.name||'')&&m.alphaMode==='MASK'),`${relative}: alpha-mask hair-card material missing`);
    check(materials.some(m=>/eye/i.test(m.name||'')),`${relative}: distinct eye material missing`);
    const nativeAnimations=nativeAnimationAudit(doc,relative);
    const bounds=geometryBounds(doc,pieces);
    check(bounds.size[1]>=1.45&&bounds.size[1]<=2.1,`${relative}: implausible adult athlete height ${bounds.size[1]}`);
    check(bounds.min[1]>=-.005&&bounds.min[1]<=.05,`${relative}: bind mesh does not stand near ground (${bounds.min[1]})`);
    if(lod===1)check(triangles<=6000,`${relative}: LOD1 exceeds review budget of 6,000 triangles`);
    let khronos;
    if(khronosTools) {
      const {io,validator}=khronosTools;
      const compressed=await validator.validateBytes(new Uint8Array(bytes),{uri:filename,maxIssues:100});
      const decodedDoc=await io.readBinary(new Uint8Array(bytes));
      for(const extension of [...decodedDoc.getRoot().listExtensionsUsed()])if(extension.extensionName==='KHR_draco_mesh_compression')extension.dispose();
      const decoded=await validator.validateBytes(await io.writeBinary(decodedDoc),{uri:`decoded-${filename}`,maxIssues:100});
      check(compressed.issues.numErrors===0&&decoded.issues.numErrors===0,`${relative}: Khronos compressed/decoded glTF validation errors`);
      khronos={compressed:compressed.issues,decoded:decoded.issues};
    }
    reports.push({file:relative,bytes:bytes.length,MB:rounded(bytes.length/1e6),sha256:sha256(bytes),lod,triangles,vertices,drawPrimitives:primitives.length,primitives,images,materials,skins,skeleton,bounds,nativeAnimations,skinWeights:{maxSumError:rounded(maxWeightSumError),maximumLogicalRootWeight:rounded(maxRootWeight),invalidWeights,invalidJoints},draco:true,...(khronos?{khronos}:{}),pass:errors.length===startErrors});
    documents.set(relative,{doc,pieces});
    console.log(`${relative}: ${triangles} triangles, ${(bytes.length/1e6).toFixed(6)} MB, ${primitives.length} primitives, ${errors.length===startErrors?'PASS':'FAIL'}`);
  } catch(error) {errors.push(`${relative}: ${error.message}`);reports.push({file:relative,bytes:bytes.length,MB:rounded(bytes.length/1e6),sha256:sha256(bytes),pass:false,error:error.message});}
}

const externalTextureFiles=new Map();
if(manifest) {
  const characters=manifest.characters||[];
  check(characters.length===8,`Expected exactly eight manifest characters; got ${characters.length}`);
  check(new Set(characters.map(c=>c.id)).size===characters.length,'Manifest character IDs must be unique');
  const field=characters.filter(c=>['player','field'].includes(c.role));
  check(field.length===6,`Expected six field players, found ${field.length}`);
  const colours=field.map(c=>(c.kits?.[0]||c).color).filter(Boolean),colourCounts=Object.fromEntries([...new Set(colours)].map(colour=>[colour,colours.filter(c=>c===colour).length]));
  check(Object.keys(colourCounts).length===2&&Object.values(colourCounts).every(n=>n===3),'Six field players must form two colour-only sets of three');
  check(characters.filter(c=>c.role==='goalkeeper').length===1,'Expected one goalkeeper');
  check(characters.filter(c=>c.role==='referee').length===1,'Expected one referee');
  const referenced=new Set();
  for(const character of characters) {
    check(character.fictional===true,`${character.id}: fictional identity not explicitly declared`);
    check(character.kits?.length===1,`${character.id}: expected exactly one colour-only kit`);
    for(const kit of character.kits||[character]) for(const level of [0,1]) {
      const file=kit[`lod${level}`];check(typeof file==='string',`${character.id}: missing LOD${level} reference`);if(typeof file!=='string')continue;referenced.add(file);
      const actual=reports.find(r=>r.file===file);check(actual,`${character.id}: missing asset ${file}`);if(!actual)continue;
      const triangleBudget=manifest.budgets?.[`lod${level}Triangles`];
      if(triangleBudget!==undefined)check(actual.triangles<=triangleBudget,`${file}: exceeds manifest LOD${level} triangle budget ${triangleBudget}`);
      check(kit[`lod${level}Sha256`]===actual.sha256,`${file}: missing or mismatched manifest SHA256`);
      check(kit[`lod${level}Triangles`]===actual.triangles,`${file}: missing or mismatched manifest triangle count`);
      check(kit[`lod${level}Bytes`]===actual.bytes,`${file}: missing or mismatched manifest byte count`);
      for(const channel of ['basecolor','normal','orm']){
        const texture=kit.textures?.[channel];
        check(typeof texture==='string'&&/^textures\/[a-z0-9-]+\.(png|jpe?g|webp)$/.test(texture),`${character.id}: missing or unexpected ${channel} atlas path`);
        if(typeof texture!=='string'||!/^textures\/[a-z0-9-]+\.(png|jpe?g|webp)$/.test(texture))continue;
        try{
          let record=externalTextureFiles.get(texture);
          if(!record){const content=await fs.readFile(path.join(root,texture)),size=imageDimensions(content);record={file:texture,bytes:content.length,MB:rounded(content.length/1e6),size,sha256:sha256(content)};externalTextureFiles.set(texture,record);}
          check(record.size.every(v=>v>0&&v<=1024),`${texture}: external atlas exceeds texture dimension budget`);
          const material=actual.materials?.find(m=>m[channel]!==undefined),textureIndex=material?.[channel];
          const imageIndex=textureImageSource(documents.get(file)?.doc.json||{},textureIndex);
          check(actual.images?.[imageIndex]?.sha256===record.sha256,`${file}: ${channel} embedded material atlas differs from ${texture}`);
        }catch(error){check(false,`${file}: cannot verify external ${channel} atlas: ${error.message}`);}
      }
    }
  }
  for(const asset of reports)check(referenced.has(asset.file),`${asset.file}: GLB is not referenced by manifest`);
}

let animationData;
try {
  const motion=sourceMotion;
  const required=['idle','run_1','run_2','run_3','run_4','run_5','sprint','decelerate','turn_left','turn_right','kick','short_pass','long_pass','header','dribble','slide_tackle','fall','get_up','celebrate_arms_up','celebrate_fist_pump','celebrate_victory_leap','celebrate_aeroplane','celebrate_applause','keeper_dive_left','keeper_dive_right','keeper_dive_high','keeper_catch','keeper_throw','keeper_punt','referee_whistle','referee_signal'];
  const clips=motion.clips||[],ids=clips.map(c=>c.id),before=errors.length;
  check(motion.fps===30,'Animation library must be sampled at 30fps');
  check(new Set(ids).size===ids.length,'Duplicate animation clip IDs');
  for(const id of required)check(ids.includes(id),`Missing required animation ${id}`);
  const rows=[];
  for(const clip of clips) {
    let maxQuaternionNormError=0,maxTimingError=0,maxLoopSeamRadians=0;
    check(clip.fps===30&&clip.frames?.length>=2,`${clip.id}: invalid 30fps sampling/frames`);
    check(clip.frames.length===Math.round(clip.duration*30)+1,`${clip.id}: frame count differs from duration×30+1`);
    for(const [i,frame] of clip.frames.entries()) {
      maxTimingError=Math.max(maxTimingError,Math.abs(frame.timeSeconds-i/30));
      check(Array.isArray(frame.hipsOffsetMeters)&&frame.hipsOffsetMeters.length===3&&finite(frame.hipsOffsetMeters),`${clip.id}/${i}: invalid hips offset`);
      check(Array.isArray(frame.referenceRootTranslationMeters)&&frame.referenceRootTranslationMeters.length===3&&finite(frame.referenceRootTranslationMeters),`${clip.id}/${i}: invalid reference root path`);
      check(Object.keys(frame.rotations||{}).length===18,`${clip.id}/${i}: expected eighteen local rotations`);
      for(const name of boneNames) {
        const q=frame.rotations?.[name];check(Array.isArray(q)&&q.length===4&&finite(q),`${clip.id}/${i}/${name}: invalid quaternion`);if(!q)continue;
        maxQuaternionNormError=Math.max(maxQuaternionNormError,Math.abs(Math.hypot(...q)-1));
      }
    }
    for(const contact of clip.contacts||[]){
      check(boneNames.includes(contact.bone)&&contact.start>=0&&contact.end>=contact.start&&contact.end<=clip.duration+1e-5,`${clip.id}: invalid contact interval`);
      check(Array.isArray(contact.anchor)&&contact.anchor.length===3&&finite(contact.anchor),`${clip.id}: contact requires a finite three-dimensional anchor`);
      if(contact.yawRadians!==undefined)check(Number.isFinite(contact.yawRadians),`${clip.id}: contact yaw must be finite`);
    }
    if(clip.loop)for(const name of boneNames) {
      const a=clip.frames[0].rotations[name],b=clip.frames.at(-1).rotations[name];
      const dot=Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0))/(Math.hypot(...a)*Math.hypot(...b));
      maxLoopSeamRadians=Math.max(maxLoopSeamRadians,2*Math.acos(Math.min(1,dot)));
    }
    check(maxQuaternionNormError<2e-5,`${clip.id}: quaternion normalization error ${maxQuaternionNormError}`);
    check(maxTimingError<2e-5,`${clip.id}: uneven 30fps timing ${maxTimingError}`);
    if(clip.loop)check(maxLoopSeamRadians<.001,`${clip.id}: discontinuous rotation loop seam ${maxLoopSeamRadians}`);
    rows.push({id:clip.id,duration:clip.duration,frames:clip.frames.length,fps:clip.fps,loop:clip.loop,contacts:clip.contacts?.length||0,maxQuaternionNormError:rounded(maxQuaternionNormError),maxTimingErrorSeconds:rounded(maxTimingError),loopSeamRadians:clip.loop?rounded(maxLoopSeamRadians):null});
  }
  animationData={pass:errors.length===before,clipCount:clips.length,frames:clips.reduce((s,c)=>s+c.frames.length,0),authorship:motion.authorship,method:'Independent source-data checks. Does not prove mocap provenance, visible transition smoothness or displayed-pose contact stability.',clips:rows};
} catch(error) {errors.push(`Animation library audit failed: ${error.message}`);}

let rawMotionEnvelope;
if(args.includes('--sample-motion')) {
  const motion=sourceMotion,clips=motion.states||Object.fromEntries((motion.clips||[]).map(c=>[c.name||c.id,c]));
  const samples=[];
  for(const asset of reports.filter(r=>r.lod===0&&documents.has(r.file))) {
    const {doc,pieces}=documents.get(asset.file);let overallMin=Infinity,overallMax=-Infinity;
    for(const [name,clip]of Object.entries(clips)) {
      const keyframes=clip.keyframes||clip.frames;let minY=Infinity,maxY=-Infinity;
      if(!Array.isArray(keyframes))continue;
      for(const pose of keyframes) {
        const bounds=geometryBounds(doc,pieces,pose);minY=Math.min(minY,bounds.min[1]);maxY=Math.max(maxY,bounds.min[1]);
      }
      samples.push({file:asset.file,clip:name,samples:keyframes.length,minimumVertexY:rounded(minY),maximumVertexMinimumY:rounded(maxY)});
      overallMin=Math.min(overallMin,minY);overallMax=Math.max(overallMax,maxY);
    }
    console.log(`${asset.file} raw motion minimum ${overallMin.toFixed(5)} m; runtime contact/clearance validation remains separate`);
  }
  rawMotionEnvelope={kind:'raw-uncorrected-vertex-envelope',runtimeVerified:false,note:'Checks sampled source keyframes only. Runtime floor correction, between-frame interpolation, foot locking and transitions require displayed-pose evidence.',samples};
}

let scope;
try {
  const status=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const changed=execFileSync('git',['diff','--name-status','origin/main','--'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const baseSha=execFileSync('git',['rev-parse','origin/main'],{cwd:repo,encoding:'utf8'}).trim();
  const allowed='workout/island/design/soccer-v7/characters/';
  scope={baseRef:'origin/main',baseSha,allowedPrefix:allowed,entries:status,trackedDiff:changed,pass:status.every(row=>['??','A ','AM'].includes(row.slice(0,2))&&row.slice(3).startsWith(allowed))&&changed.every(row=>row.startsWith('A\t'+allowed))};
  check(scope.pass,'Worktree includes edits/deletions or paths outside permitted new-file subtree');
}catch(error){warnings.push(`Scope status unavailable: ${error.message}`);}
const allImages=reports.flatMap(r=>r.images||[]),uniqueImages=[...new Map(allImages.map(i=>[i.sha256,i])).values()];
const textureMemoryEstimate={method:'RGBA8 allocation plus full mip chain; approximate, not a device GPU memory measurement.',allGLBsLoadedWithoutDeduplicationBytes:allImages.reduce((s,i)=>s+i.estimatedRGBA8WithMipmapsBytes,0),deduplicatedByImageSHA256Bytes:uniqueImages.reduce((s,i)=>s+i.estimatedRGBA8WithMipmapsBytes,0),uniqueImageCount:uniqueImages.length};
check(sha256(semanticHelperBytes)===sha256(await fs.readFile(path.join(root,'source/semantic-uv-surface.mjs'))),'Semantic surface helper changed during audit');
const result={schemaVersion:1,auditSource:{file:'source/audit.mjs',sha256:sha256(await fs.readFile(fileURLToPath(import.meta.url)))},kind:'independent-draco-character-audit',generatedAt:new Date().toISOString(),inputs:{semanticSurfaceHelper:{file:'source/semantic-uv-surface.mjs',bytes:semanticHelperBytes.length,sha256:sha256(semanticHelperBytes)},motion:{file:'animations.json',bytes:sourceMotionBytes.length,sha256:sha256(sourceMotionBytes)},rig:{file:'rig.json',bytes:sourceRigBytes.length,sha256:sha256(sourceRigBytes)},canonical:{file:'../../motion2/soccer.json',bytes:canonicalBytes.length,sha256:sha256(canonicalBytes)},...(manifestBytes?{manifest:{file:'asset-manifest.json',bytes:manifestBytes.length,sha256:sha256(manifestBytes)}}:{})},method:'Actual Draco WASM decode, binary accessor reads, embedded image headers, canonical skeleton and rest skin bounds; visual quality is not inferred from metadata.',budgets:{perGLBBytes:1500000,maxTextureDimension:1024,lod1ReviewTriangles:6000},pass:errors.length===0,errors,warnings,scope,rigData,totals:{files:reports.length,bytes:reports.reduce((s,r)=>s+r.bytes,0),MB:rounded(reports.reduce((s,r)=>s+r.bytes,0)/1e6),largest:reports.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,5).map(r=>({file:r.file,bytes:r.bytes,MB:r.MB})),textureMemoryEstimate},assets:reports,externalTextureFiles:[...externalTextureFiles.values()],animationData,...(rawMotionEnvelope?{rawMotionEnvelope}:{})};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.pass,files:reports.length,errors:errors.length,report:path.relative(repo,output)}));
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1;}
