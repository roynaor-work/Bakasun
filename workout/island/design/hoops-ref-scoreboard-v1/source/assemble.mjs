/** Join the exact canonical animation streams to the delivered referee skin. */
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
function unpack(bytes){
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB header');
  const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length));
  const start=28+length;return {doc,bin:bytes.subarray(start,start+doc.buffers[0].byteLength)};
}
function pack(doc,bin){const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const padded=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(padded);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+padded.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(padded.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,bh,padded]);}
function compact(doc,bin){
  // Simplification leaves original streams behind. Retain only streams actually
  // referenced by the exported primitives, skin, animations and embedded maps.
  const refs=[],keep=(object,key)=>{if(object?.[key]!==undefined)refs.push([object,key]);};
  for(const mesh of doc.meshes??[])for(const p of mesh.primitives){keep(p,'indices');for(const key of Object.keys(p.attributes))keep(p.attributes,key);for(const t of p.targets??[])for(const key of Object.keys(t))keep(t,key);}
  for(const s of doc.skins??[])keep(s,'inverseBindMatrices');
  for(const a of doc.animations??[])for(const s of a.samplers){keep(s,'input');keep(s,'output');}
  const ids=[...new Set(refs.map(([o,k])=>o[k]))].sort((a,b)=>a-b),map=new Map(ids.map((v,i)=>[v,i]));
  doc.accessors=ids.map(i=>doc.accessors[i]);for(const [o,k]of refs)o[k]=map.get(o[k]);
  const views=[];
  const walk=o=>{if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(walk);return;}for(const [k,v]of Object.entries(o)){if(k==='bufferView')views.push([o,k]);else if(k!=='bufferViews'&&k!=='extras')walk(v);}};
  walk(doc);const viewIds=[...new Set(views.map(([o,k])=>o[k]))].sort((a,b)=>a-b),viewMap=new Map(viewIds.map((v,i)=>[v,i])),parts=[];let length=0;
  doc.bufferViews=viewIds.map(id=>{const v=doc.bufferViews[id],pad=(4-length%4)%4;if(pad){parts.push(Buffer.alloc(pad));length+=pad;}const result={...v,byteOffset:length};parts.push(bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength));length+=v.byteLength;return result;});
  for(const [o,k]of views)o[k]=viewMap.get(o[k]);doc.buffers=[{byteLength:length}];return pack(doc,Buffer.concat(parts));
}
const {doc,bin}=unpack(await readFile(new URL('models/referee-base.glb',root)));
const skeleton=JSON.parse(await readFile(new URL('motion/skeleton.json',root)));
const parts=[bin],nodes=new Map(doc.nodes.map((n,i)=>[n.name,i]));let length=bin.length;
doc.animations=[];
const ids=['idle','run','whistle','foul','three_points','direction'];
for(const id of ids){
  const source=unpack(await readFile(new URL(`motion/${id}.glb`,root)));
  const boneNames=source.doc.nodes.map(n=>n.name);
  for(const n of source.doc.nodes){const target=doc.nodes[nodes.get(n.name)];if(!target)throw new Error('Missing rig bone '+n.name);for(const key of ['translation','rotation','scale'])if(JSON.stringify(target[key]??(key==='rotation'?[0,0,0,1]:key==='scale'?[1,1,1]:[0,0,0]))!==JSON.stringify(n[key]??(key==='rotation'?[0,0,0,1]:key==='scale'?[1,1,1]:[0,0,0])))throw new Error('Bind mismatch '+n.name+' '+key);}
  const padding=(4-length%4)%4;if(padding){parts.push(Buffer.alloc(padding));length+=padding;}
  const baseOffset=length,viewOffset=doc.bufferViews.length,accessorOffset=doc.accessors.length;
  for(const view of source.doc.bufferViews)doc.bufferViews.push({...view,byteOffset:(view.byteOffset??0)+baseOffset});
  for(const accessor of source.doc.accessors){if(accessor.sparse)throw new Error('Sparse animation streams unsupported');doc.accessors.push({...accessor,bufferView:accessor.bufferView+viewOffset});}
  for(const animation of source.doc.animations){if(animation.name!==id)throw new Error('Unexpected clip '+animation.name);doc.animations.push({...animation,samplers:animation.samplers.map(s=>({...s,input:s.input+accessorOffset,output:s.output+accessorOffset})),channels:animation.channels.map(c=>({...c,target:{...c.target,node:nodes.get(boneNames[c.target.node])}}))});}
  parts.push(source.bin);length+=source.bin.length;
}
doc.buffers=[{byteLength:length}];doc.asset.generator='hoops-ref-scoreboard-v1: canonical18 referee and six original 30Hz clips';
doc.extras={...doc.extras,package:'hoops-ref-scoreboard-v1',sampleRateHz:30,clipIds:ids,canonicalSkeleton:skeleton};
await writeFile(new URL('models/referee.glb',root),compact(doc,Buffer.concat(parts)));
console.log(JSON.stringify({asset:'models/referee.glb',clips:doc.animations.map(a=>a.name),bytes:(await readFile(new URL('models/referee.glb',root))).length}));
