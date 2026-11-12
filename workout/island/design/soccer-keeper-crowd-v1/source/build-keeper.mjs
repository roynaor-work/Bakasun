// SPDX-License-Identifier: CC0-1.0. Derive the CC0 canonical keeper with a closed right glove.
// Geometry only: the 18 bind bones, skin and inverse bind matrices remain unchanged.
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),repo=fileURLToPath(new URL('../../../../',root));
const commit='5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad',source='workout/island/design/motion-fix-v12/runtime/models/canonical-keeper.glb';
try{execFileSync('git',['cat-file','-e',commit],{cwd:repo,stdio:'ignore'});}catch{execFileSync('git',['fetch','origin',commit],{cwd:repo,stdio:'inherit'});}
const original=execFileSync('git',['show',`${commit}:${source}`],{cwd:repo,maxBuffer:4*1024*1024}),jsonLength=original.readUInt32LE(12),json=JSON.parse(original.subarray(20,20+jsonLength)),binStart=20+jsonLength+8;
let bin=Buffer.from(original.subarray(binStart,binStart+json.buffers[0].byteLength));
const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},components={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
function value(index,i,k){const a=json.accessors[index],v=json.bufferViews[a.bufferView],[size,read]=components[a.componentType];return bin[read]((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??width[a.type]*size)+k*size);}
let hiddenVertices=0;
for(const mesh of json.meshes)for(const p of mesh.primitives){if(p.attributes.JOINTS_0===undefined)continue;const index=p.attributes.POSITION,a=json.accessors[index],v=json.bufferViews[a.bufferView];
 for(let i=0;i<a.count;i++)if([0,1,2,3].some(k=>value(p.attributes.JOINTS_0,i,k)===11&&value(p.attributes.WEIGHTS_0,i,k)>.8)){
  const before=[0,1,2].map(k=>value(index,i,k)),center=[-.16,.75,0],after=before.map((x,k)=>center[k]+(x-center[k])*.12);
  after.forEach((x,k)=>bin.writeFloatLE(x,(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??12)+k*4));hiddenVertices++;
 }
 // Accessor bounds must describe the modified data, including the unchanged rest of the character.
 a.min=[0,1,2].map(k=>{let m=Infinity;for(let i=0;i<a.count;i++)m=Math.min(m,value(index,i,k));return m;});
 a.max=[0,1,2].map(k=>{let m=-Infinity;for(let i=0;i<a.count;i++)m=Math.max(m,value(index,i,k));return m;});
}
const positions=[],normals=[],indices=[];
function ellipsoid(center,radii,segments=12,rings=8){const base=positions.length/3;for(let row=0;row<=rings;row++){const theta=Math.PI*row/rings;for(let col=0;col<=segments;col++){const phi=2*Math.PI*col/segments,n=[Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi)],normal=n.map((v,i)=>v/radii[i]),length=Math.hypot(...normal);positions.push(...n.map((v,i)=>center[i]+v*radii[i]));normals.push(...normal.map(v=>v/length));}}
 for(let row=0;row<rings;row++)for(let col=0;col<segments;col++){const a=base+row*(segments+1)+col,b=a+segments+1;if(row)indices.push(a,a+1,b);if(row<rings-1)indices.push(a+1,b+1,b);}
}
ellipsoid([0,-.04,0],[.047,.04,.043]);
// Four knuckles and a tucked thumb make the closed glove read as a fist at close range.
for(const x of[-.027,-.009,.009,.027])ellipsoid([x,-.049,.034],[.012,.014,.014],8,5);
ellipsoid([.039,-.027,.014],[.017,.025,.021],8,5);
function append(values,type,componentType){const pad=(4-bin.length%4)%4;if(pad)bin=Buffer.concat([bin,Buffer.alloc(pad)]);const byteOffset=bin.length,size=componentType===5126?4:2,data=Buffer.alloc(values.length*size);values.forEach((x,i)=>componentType===5126?data.writeFloatLE(x,i*size):data.writeUInt16LE(x,i*size));const bufferView=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset,byteLength:data.length});bin=Buffer.concat([bin,data]);const accessor={bufferView,componentType,count:values.length/width[type],type};if(type==='VEC3'){accessor.min=[0,1,2].map(k=>Math.min(...values.filter((_,i)=>i%3===k)));accessor.max=[0,1,2].map(k=>Math.max(...values.filter((_,i)=>i%3===k)));}json.accessors.push(accessor);return json.accessors.length-1;}
const POSITION=append(positions,'VEC3',5126),NORMAL=append(normals,'VEC3',5126),INDEX=append(indices,'SCALAR',5123),material=json.materials.length;
json.materials.push({name:'Original unbranded closed keeper glove',pbrMetallicRoughness:{baseColorFactor:[.88,.91,.88,1],metallicFactor:0,roughnessFactor:.84}});
const mesh=json.meshes.length;json.meshes.push({name:'KeeperRightFist',primitives:[{attributes:{POSITION,NORMAL},indices:INDEX,material}]});
const node=json.nodes.length;json.nodes.push({name:'KeeperRightFist',mesh});(json.nodes[11].children??=[]).push(node);
json.asset.generator='soccer-keeper-crowd-v1 CC0 canonical keeper with closed right glove';json.asset.extras={sourceCommit:commit,sourcePath:source,geometryChange:'Original closed right glove; canonical 18-bone bind skeleton and skin unchanged',hiddenOriginalGloveVertices:hiddenVertices,addedTriangles:indices.length/3};
json.buffers[0].byteLength=bin.length;
const raw=Buffer.from(JSON.stringify(json)),jc=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),bc=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]),out=Buffer.alloc(28+jc.length+bc.length);
out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jc.length,12);out.writeUInt32LE(0x4e4f534a,16);jc.copy(out,20);const p=20+jc.length;out.writeUInt32LE(bc.length,p);out.writeUInt32LE(0x004e4942,p+4);bc.copy(out,p+8);
await writeFile(new URL('runtime/keeper.glb',root),out);console.log(JSON.stringify({bytes:out.length,hiddenVertices,addedTriangles:indices.length/3,bones:json.skins[0].joints.length}));
