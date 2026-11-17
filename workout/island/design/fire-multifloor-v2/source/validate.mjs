#!/usr/bin/env node
/**
 * Independent package checks plus the official Khronos glTF validator.
 * Install outside the repository:
 * npm install --cache /tmp/fire-v2-npm-cache --prefix /tmp/fire-v2-tools gltf-validator@2.0.0-dev.3.10
 * node workout/island/design/fire-multifloor-v2/source/validate.mjs
 * Optional: GLTF_VALIDATOR_PATH=/absolute/path/to/node_modules/gltf-validator
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let validator;
for (const location of [process.env.GLTF_VALIDATOR_PATH, 'gltf-validator', '/tmp/fire-v2-tools/node_modules/gltf-validator'].filter(Boolean)) {
  try {validator = require(location); break;} catch {}
}
if (!validator) throw Error('Install gltf-validator as documented at the top of source/validate.mjs, or set GLTF_VALIDATOR_PATH.');

const checks = [];
const assert = (id, condition, detail) => checks.push({id, pass: Boolean(condition), detail});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const round = x => Math.round(x * 1e6) / 1e6;
const list = async directory => {
  const result = [];
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await list(absolute));
    else if (entry.isFile()) result.push({file: path.relative(root, absolute).split(path.sep).join('/'), bytes: (await fs.stat(absolute)).size});
  }
  return result.sort((a,b) => a.file.localeCompare(b.file));
};

function glb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB v2 header/length');
  let json, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').trim());
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw Error('GLB requires JSON and BIN chunks');
  return {json,binary};
}

const identity = () => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function multiply(a,b) {
  const out = Array(16).fill(0);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++) for (let k=0;k<4;k++) out[c*4+r] += a[k*4+r]*b[c*4+k];
  return out;
}
function localMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x,y,z,w] = node.rotation || [0,0,0,1], [sx,sy,sz] = node.scale || [1,1,1], [tx,ty,tz] = node.translation || [0,0,0];
  return [
    (1-2*y*y-2*z*z)*sx,(2*x*y+2*w*z)*sx,(2*x*z-2*w*y)*sx,0,
    (2*x*y-2*w*z)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*w*x)*sy,0,
    (2*x*z+2*w*y)*sz,(2*y*z-2*w*x)*sz,(1-2*x*x-2*y*y)*sz,0,
    tx,ty,tz,1,
  ];
}
function transform(m,p) {return [0,1,2].map(r => m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);}
const widths = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const bytesPer = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const readers = {5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function accessorValues(json, binary, index) {
  const acc=json.accessors[index], view=json.bufferViews[acc.bufferView], count=widths[acc.type], stride=view.byteStride || bytesPer[acc.componentType]*count;
  const base=(view.byteOffset || 0)+(acc.byteOffset || 0), values=[];
  for (let i=0;i<acc.count;i++) for (let c=0;c<count;c++) values.push(binary[readers[acc.componentType]](base+i*stride+c*bytesPer[acc.componentType]));
  return values;
}
function measure(json,binary,file) {
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  const meshTriangles=(json.meshes || []).map(mesh => mesh.primitives.reduce((sum,p) => {
    const count = json.accessors[p.indices ?? p.attributes.POSITION].count;
    return sum + ((p.mode ?? 4) === 4 ? count/3 : (p.mode === 5 || p.mode === 6 ? Math.max(0,count-2) : 0));
  },0));
  let sceneTriangles=0,visibleTriangles=0;
  const walk = (index,parent,visible) => {
    const node=json.nodes[index], matrix=multiply(parent,localMatrix(node));
    const active=visible && !(node.scale || [1,1,1]).some(v=>Math.abs(v)<1e-8);
    if (node.mesh !== undefined) {
      sceneTriangles += meshTriangles[node.mesh];
      if (active) {
        visibleTriangles += meshTriangles[node.mesh];
        for (const primitive of json.meshes[node.mesh].primitives) {
          const acc=json.accessors[primitive.attributes.POSITION];
          if (!acc.min || !acc.max) continue;
          for (let corner=0;corner<8;corner++) {
            const point=transform(matrix,[0,1,2].map(axis=>(corner&(1<<axis)) ? acc.max[axis] : acc.min[axis]));
            for (let axis=0;axis<3;axis++) {bounds.min[axis]=Math.min(bounds.min[axis],point[axis]); bounds.max[axis]=Math.max(bounds.max[axis],point[axis]);}
          }
        }
      }
    }
    for (const child of node.children || []) walk(child,matrix,active);
  };
  for (const node of json.scenes[json.scene || 0].nodes) walk(node,identity(),true);
  const animations=(json.animations || []).map(animation=> {
    let duration=0,nonConstant=0;
    const targets=[];
    for (const channel of animation.channels) {
      const sampler=animation.samplers[channel.sampler], times=accessorValues(json,binary,sampler.input), values=accessorValues(json,binary,sampler.output);
      assert(`${file}:${animation.name}:finite`,times.every(Number.isFinite) && values.every(Number.isFinite),'Finite keyframe times and values');
      assert(`${file}:${animation.name}:time-order`,times.every((v,i)=>!i || v>times[i-1]),'Strictly increasing keyframe timestamps');
      duration=Math.max(duration,...times);
      const width=widths[json.accessors[sampler.output].type];
      if (values.some((v,i)=>Math.abs(v-values[i%width])>1e-6)) nonConstant++;
      targets.push({node:json.nodes[channel.target.node].name,path:channel.target.path,keys:times.length});
    }
    assert(`${file}:${animation.name}:motion`,duration>0 && nonConstant>0,{duration,nonConstantChannels:nonConstant});
    return {name:animation.name,duration:round(duration),channels:targets,nonConstantChannels:nonConstant};
  });
  return {sceneTriangles,visibleTriangles,meshTriangles:meshTriangles.reduce((a,b)=>a+b,0),nodeCount:json.nodes.length,meshCount:json.meshes?.length || 0,materialCount:json.materials?.length || 0,bounds:{min:bounds.min.map(round),max:bounds.max.map(round),dimensions:bounds.max.map((v,i)=>round(v-bounds.min[i]))},animations};
}

function inspectPNG(bytes) {
  if (bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw Error('Invalid PNG signature');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),depth=bytes[24],type=bytes[25],interlace=bytes[28];
  if (depth!==8 || type!==6 || interlace!==0) return {width,height,depth,type,interlace,error:'Expected noninterlaced RGBA8 sheet'};
  const chunks=[];
  for(let offset=8;offset<bytes.length;) {
    const size=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);
    if(kind==='IDAT') chunks.push(bytes.subarray(offset+8,offset+8+size));
    offset+=12+size;
  }
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(height*stride);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb && pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)];
    for(let x=0;x<stride;x++) {
      const left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,upperLeft=y && x>=4?pixels[(y-1)*stride+x-4]:0;
      const predictor=[0,left,up,Math.floor((left+up)/2),paeth(left,up,upperLeft)][filter];
      pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  const frameWidth=width/8,frames=[];
  for(let f=0;f<8;f++) {
    let opaque=0,transparent=0;
    const hash=createHash('sha256');
    for(let y=0;y<height;y++) {
      const row=pixels.subarray(y*stride+f*frameWidth*4,y*stride+(f+1)*frameWidth*4);
      hash.update(row);
      for(let x=3;x<row.length;x+=4) {if(row[x]>0)opaque++;else transparent++;}
    }
    frames.push({index:f,nontransparentPixels:opaque,transparentPixels:transparent,sha256:hash.digest('hex')});
  }
  return {width,height,depth,type,interlace,frameWidth,frames};
}

await fs.mkdir(path.join(root,'evidence'),{recursive:true});
let files=await list(root);
const models=[];
const official=[];
for (const entry of files.filter(entry=>entry.file.endsWith('.glb'))) {
  const bytes=await fs.readFile(path.join(root,entry.file));
  const {json,binary}=glb(bytes);
  assert(`${entry.file}:embedded`,!(json.buffers || []).some(b=>b.uri) && !(json.images || []).some(i=>i.uri),'All buffers and images embedded in GLB');
  assert(`${entry.file}:standard`,!(json.extensionsRequired || []).length,{extensionsRequired:json.extensionsRequired || []});
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:entry.file,maxIssues:10000});
  official.push({file:entry.file,bytes:bytes.length,sha256:sha256(bytes),report});
  assert(`${entry.file}:khronos`,report.issues.numErrors===0 && report.issues.numWarnings===0,{errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,hints:report.issues.numHints});
  const measured=measure(json,binary,entry.file);
  models.push({file:entry.file,bytes:bytes.length,sha256:sha256(bytes),...measured});
  if (entry.file.endsWith('/fire-truck.glb')) {
    assert('truck:triangle-budget',measured.sceneTriangles>=2500 && measured.sceneTriangles<=3500,measured.sceneTriangles);
    const clips=new Set(measured.animations.map(a=>a.name));
    for (const name of ['drive','ladder_extend','ladder_retract','lights']) assert(`truck:clip:${name}`,clips.has(name),[...clips]);
    for (const name of ['ladder_tip','hose_outlet']) assert(`truck:attachment:${name}`,json.nodes.some(n=>n.name===name),name);
    const endpoints = animation => new Map((animation?.channels || []).map(channel => {
      const sampler=animation.samplers[channel.sampler],values=accessorValues(json,binary,sampler.output),width=widths[json.accessors[sampler.output].type];
      return [`${channel.target.node}:${channel.target.path}`,{start:values.slice(0,width),end:values.slice(-width),path:channel.target.path}];
    }));
    const extend=endpoints(json.animations.find(a=>a.name==='ladder_extend')),retract=endpoints(json.animations.find(a=>a.name==='ladder_retract'));
    assert('truck:ladder-inverse',extend.size>=3 && extend.size===retract.size && [...extend].every(([key,value])=> {
      const reverse=retract.get(key);
      return reverse && value.start.every((v,i)=>Math.abs(v-reverse.end[i])<1e-5) && value.end.every((v,i)=>Math.abs(v-reverse.start[i])<1e-5);
    }),'Extension/retraction must reverse the same transform endpoints');
    assert('truck:telescoping', [...extend.values()].filter(channel=>channel.path==='translation' && channel.start.some((v,i)=>Math.abs(v-channel.end[i])>1)).length>=2,'Two translating telescope stages, at least one metre travel each');
    assert('truck:rest-height',measured.bounds.dimensions[1]<4.5,measured.bounds.dimensions[1]);
  }
  if (/models\/(extinguisher-(powder|foam)|wall-hose|hydrant|fire-blanket)\.glb$/.test(entry.file)) {
    assert(`${entry.file}:use-clip`,measured.animations.some(a=>a.name==='use'),measured.animations.map(a=>a.name));
    if(entry.file.endsWith('/fire-blanket.glb')) {
      const unfold=measured.animations.find(a=>a.name==='use')?.channels.filter(c=>c.node==='blanket_unfold') || [];
      assert('blanket:unfold-transforms',['translation','rotation','scale'].every(p=>unfold.some(c=>c.path===p)),unfold);
    }
  }
  if (/building-floor-\d\.glb$/.test(entry.file)) {
    const burnables=json.nodes.filter(n=>n.name?.startsWith('burn_'));
    assert(`${entry.file}:burnables`,burnables.length>=3,burnables.map(n=>n.name));
    for (const parent of burnables) {
      const id=parent.name.slice(5),children=(parent.children || []).map(i=>json.nodes[i]);
      for (const prefix of ['intact_','burnt_','fire_']) assert(`${entry.file}:${parent.name}:${prefix}`,children.some(n=>n.name===prefix+id),children.map(n=>n.name));
      const burnt=children.find(n=>n.name==='burnt_'+id);
      assert(`${entry.file}:${parent.name}:default-burnt-hidden`,burnt && (burnt.scale || [1,1,1]).every(v=>v===0),burnt?.scale);
    }
    const rooms=json.nodes.filter(n=>n.name?.startsWith('room_'));
    assert(`${entry.file}:three-rooms`,rooms.length===3,rooms.map(n=>n.name));
  }
}
const modelNames=new Set(models.map(m=>m.file));
for(const file of ['fire-truck','building-shell','building-floor-1','building-floor-2','building-floor-3','extinguisher-powder','extinguisher-foam','wall-hose','hydrant','fire-blanket']) assert(`required:model:${file}`,modelNames.has(`models/${file}.glb`),`models/${file}.glb`);
assert('truck:single-model',models.filter(m=>m.file.includes('truck')).length===1,models.filter(m=>m.file.includes('truck')).map(m=>m.file));
const buildingBytes=models.filter(m=>m.file.includes('building-')).reduce((sum,m)=>sum+m.bytes,0);
assert('building:budget',buildingBytes<=3_000_000,{bytes:buildingBytes,limit:3_000_000});
const effects=[];
for(const kind of ['powder','foam','water','blanket']) {
  const match=files.find(f=>f.file.startsWith(`effects/${kind}`) && f.file.endsWith('.png'));
  assert(`required:effect:${kind}`,Boolean(match),match?.file || `effects/${kind}*.png`);
  if(!match)continue;
  const info=inspectPNG(await fs.readFile(path.join(root,match.file)));
  effects.push({file:match.file,...info});
  assert(`${kind}:eight-frames`,!info.error && Number.isInteger(info.frameWidth) && info.frameWidth>0 && info.frames?.length===8,info.error || {width:info.width,height:info.height,frameWidth:info.frameWidth});
  if(info.frames) {
    assert(`${kind}:alpha`,info.frames.every(f=>f.transparentPixels>0 && f.nontransparentPixels>0),info.frames.map(f=>({index:f.index,content:f.nontransparentPixels,transparent:f.transparentPixels})));
    assert(`${kind}:distinct`,new Set(info.frames.map(f=>f.sha256)).size===8,'Every frame has distinct RGBA content');
  }
}
for (const id of ['extinguisher-powder','extinguisher-foam','wall-hose','hydrant','fire-blanket']) {
  const icon=files.find(f=>f.file===`icons/${id}.svg`);
  assert(`required:icon:${id}`,Boolean(icon),`icons/${id}.svg`);
  if(icon) {
    const svg=await fs.readFile(path.join(root,icon.file),'utf8');
    assert(`icon:${id}:standalone`,/\bviewBox=/.test(svg) && !/\b(?:href|src)=["'](?:https?:|\/\/)/.test(svg),'SVG viewBox present; no remote images or fonts');
  }
}
for (const file of ['manifest.json','preview.html','LICENSES.md','REPORT.md']) assert(`required:${file}`,files.some(f=>f.file===file),file);
await fs.writeFile(path.join(root,'evidence/khronos.json'),JSON.stringify({validatorVersion:validator.version(),models:official},null,2)+'\n');
// Recount after writing reports so the size check includes evidence itself.
const result={passed:false,checks:[],models,effects,files:[],budget:{}};
const summaryPath=path.join(root,'evidence/asset-checks.json');
// Stabilize the serialized byte count including this report (decimal length can change).
let previousTotal=-1;
for (let iteration=0;iteration<5;iteration++) {
  files=await list(root);
  const totalBytes=files.reduce((sum,file)=>sum+file.bytes,0);
  const budgetCheck={id:'package:budget',pass:totalBytes<=8_000_000,detail:{bytes:totalBytes,limit:8_000_000}};
  result.checks=[...checks,budgetCheck];result.passed=result.checks.every(c=>c.pass);
  result.files=files;result.budget={totalBytes,limitBytes:8_000_000,buildingBytes,buildingLimitBytes:3_000_000};
  await fs.writeFile(summaryPath,JSON.stringify(result,null,2)+'\n');
  if(totalBytes===previousTotal)break;
  previousTotal=totalBytes;
}
const failed=result.checks.filter(c=>!c.pass);
console.log(JSON.stringify({passed:result.passed,checks:result.checks.length,failed,models:models.map(m=>({file:m.file,bytes:m.bytes,triangles:m.sceneTriangles,visibleTriangles:m.visibleTriangles,clips:m.animations.map(a=>a.name)})),budget:result.budget},null,2));
if(failed.length)process.exitCode=1;
