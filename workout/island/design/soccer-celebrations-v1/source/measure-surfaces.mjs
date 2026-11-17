// SPDX-License-Identifier: CC0-1.0
// Independent skin-vertex floor scan and triangle-backed contact-probe audit.
// Reads the delivered GLBs; does not correct any pose, vertex, probe or transform.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Object3D,Group,Matrix4,Quaternion,Vector3,Triangle} from '../vendor/three.module.js';
import {unpack,readAccessor} from './glb.mjs';
const base=new URL('../',import.meta.url),fps=60;
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',base)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const round=x=>Number(x.toFixed(9));
const read=(g,i)=>{
 const a=readAccessor(g,i),normal=g.document.accessors[i].normalized;
 if(normal&&a.accessor.componentType!==5126){const max={5120:127,5121:255,5122:32767,5123:65535,5125:4294967295}[a.accessor.componentType];a.values=a.values.map(x=>Math.max(-1,x/max));}
 return a;
};
function createScene(g){
 const d=g.document,nodes=d.nodes.map(n=>{const o=new Object3D();if(n.matrix)new Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);else{o.position.fromArray(n.translation??[0,0,0]);o.quaternion.fromArray(n.rotation??[0,0,0,1]);o.scale.fromArray(n.scale??[1,1,1]);}return o;});
 const roots=new Set(nodes.map((_,i)=>i));d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>{nodes[i].add(nodes[c]);roots.delete(c);}));
 const scene=new Group();for(const i of roots)scene.add(nodes[i]);
 const channels=d.animations[0].channels.filter(c=>['translation','rotation','scale'].includes(c.target.path)).map(c=>{const s=d.animations[0].samplers[c.sampler];if(s.interpolation&&s.interpolation!=='LINEAR')throw Error('Surface scanner expects the delivered LINEAR 30Hz channels');return {...c,times:read(g,s.input).values,data:read(g,s.output)};});
 function at(t){
  for(const c of channels){const ts=c.times;let hi=1;while(hi<ts.length&&ts[hi]<t)hi++;hi=Math.min(hi,ts.length-1);const lo=Math.max(0,hi-1),u=hi===lo?0:Math.max(0,Math.min(1,(t-ts[lo])/(ts[hi]-ts[lo]))),a=c.data.values.slice(lo*c.data.width,(lo+1)*c.data.width),b=c.data.values.slice(hi*c.data.width,(hi+1)*c.data.width),o=nodes[c.target.node];if(c.target.path==='rotation')o.quaternion.fromArray(a).normalize().slerp(new Quaternion(...b).normalize(),u);else o[c.target.path==='translation'?'position':'scale'].fromArray(a.map((x,i)=>x+(b[i]-x)*u));}
  scene.updateMatrixWorld(true);
 }
 return {nodes,at};
}
function geometry(g,scene,nodeIndex){
 const d=g.document,node=d.nodes[nodeIndex],skin=d.skins?.[node.skin],ibm=skin?read(g,skin.inverseBindMatrices).values:null;
 const primitives=d.meshes[node.mesh].primitives.map((p,primitive)=>{
  const positions=read(g,p.attributes.POSITION).values,indices=p.indices===undefined?Array.from({length:positions.length/3},(_,i)=>i):read(g,p.indices).values;
  const joints=skin?read(g,p.attributes.JOINTS_0).values:null,weights=skin?read(g,p.attributes.WEIGHTS_0).values:null;
  const influence=[];
  for(let i=0;i<positions.length/3;i++){
   const v=new Vector3(...positions.slice(i*3,i*3+3)),list=[];
   if(skin){for(let k=0;k<4;k++)if(weights[i*4+k]){const joint=joints[i*4+k],local=v.clone().applyMatrix4(new Matrix4().fromArray(ibm.slice(joint*16,joint*16+16)));list.push({node:skin.joints[joint],w:weights[i*4+k],p:local.toArray()});}}
   else list.push({node:nodeIndex,w:1,p:v.toArray()});
   influence.push(list);
  }
  return {primitive,material:d.materials?.[p.material]?.name??null,indices,influence};
 });
 function vertex(p,index){const out=new Vector3();for(const f of p.influence[index])out.add(new Vector3(...f.p).applyMatrix4(scene.nodes[f.node].matrixWorld).multiplyScalar(f.w));return out;}
 function minimumY(){let best=Infinity;for(const p of primitives)for(const list of p.influence){let y=0;for(const f of list){const m=scene.nodes[f.node].matrixWorld.elements;y+=f.w*(m[1]*f.p[0]+m[5]*f.p[1]+m[9]*f.p[2]+m[13]);}best=Math.min(best,y);}return best;}
 function nearest(probe){let best;for(const p of primitives){const vertices=p.influence.map((_,i)=>vertex(p,i));for(let i=0;i<p.indices.length;i+=3){const ids=p.indices.slice(i,i+3),triangle=new Triangle(...ids.map(k=>vertices[k])),close=triangle.closestPointToPoint(probe,new Vector3()),distance=close.distanceTo(probe);if(!best||distance<best.distance){best={distance,primitive:p.primitive,material:p.material,triangle:i/3,vertexIndices:ids,barycentric:triangle.getBarycoord(close,new Vector3()).toArray(),world:close.toArray()};}}}return best;}
 function follow(record){const p=primitives[record.primitive],out=new Vector3();record.vertexIndices.forEach((id,i)=>out.add(vertex(p,id).multiplyScalar(record.barycentric[i])));return out;}
 return {minimumY,nearest,follow};
}
const results=[];
for(const entry of catalog.clips){
 const bytes=await fs.readFile(new URL(entry.asset,base)),g=unpack(bytes),d=g.document,scene=createScene(g),meshes=new Map();
 for(const actor of entry.actors){const i=d.nodes.findIndex(n=>n.skin!==undefined&&n.name.startsWith(`${actor.id}_`));if(i<0)throw Error(`Missing skinned mesh for ${actor.id}`);meshes.set(actor.id,geometry(g,scene,i));}
 for(const contact of entry.contacts??[])for(const e of [contact.a,contact.b])if(e.node&&!meshes.has(e.node)){const i=d.nodes.findIndex(n=>n.name===e.node&&n.mesh!==undefined);if(i<0)throw Error(`Missing prop mesh ${e.node}`);meshes.set(e.node,geometry(g,scene,i));}
 function endpoint(e){const name=e.node??`${e.actor}_${e.bone}`,index=d.nodes.findIndex(n=>n.name===name);if(index<0)throw Error(`Missing endpoint ${name}`);return new Vector3(...(e.local??[0,0,0])).applyMatrix4(scene.nodes[index].matrixWorld);}
 const times=[...new Set([...Array.from({length:Math.ceil(entry.duration*fps)+1},(_,i)=>Math.min(entry.duration,i/fps)),...(entry.events??[]).map(e=>e.time),...(entry.supports??[]).flatMap(w=>[w.start,w.end])])].sort((a,b)=>a-b);
 const floor=entry.actors.map(a=>({actor:a.id,minimumSkinY:Infinity,time:0,samples:times.length}));
 for(const t of times){scene.at(t);for(const [i,a]of entry.actors.entries()){const y=meshes.get(a.id).minimumY();if(y<floor[i].minimumSkinY){floor[i].minimumSkinY=y;floor[i].time=t;}}}
 const contacts=[];
 for(const contact of entry.contacts??[]){
  const t=(contact.start+contact.end)/2;scene.at(t);
  const endpoints=[contact.a,contact.b].map(e=>{const marker=endpoint(e),surface=meshes.get(e.node??e.actor).nearest(marker),index=d.nodes.findIndex(n=>n.name===(e.node??`${e.actor}_${e.bone}`));return {endpoint:e,calibrationTime:t,markerToSurfaceMeters:surface.distance,surfaceBoneLocal:new Vector3(...surface.world).applyMatrix4(scene.nodes[index].matrixWorld.clone().invert()).toArray(),surface};});
  const samples=[...new Set([contact.start,contact.end,...Array.from({length:Math.ceil((contact.end-contact.start)*fps)+1},(_,i)=>Math.min(contact.end,contact.start+i/fps))])].sort((a,b)=>a-b);
  let maxMarkerSurfaceDistanceMeters=0,maxCalibratedSurfaceGapMeters=0;
  for(const time of samples){scene.at(time);const surfaces=endpoints.map(e=>meshes.get(e.endpoint.node??e.endpoint.actor).follow(e.surface));maxCalibratedSurfaceGapMeters=Math.max(maxCalibratedSurfaceGapMeters,surfaces[0].distanceTo(surfaces[1]));endpoints.forEach((e,i)=>{maxMarkerSurfaceDistanceMeters=Math.max(maxMarkerSurfaceDistanceMeters,endpoint(e.endpoint).distanceTo(surfaces[i]));});}
  contacts.push({type:contact.type,start:contact.start,end:contact.end,samples:samples.length,endpoints,maxMarkerSurfaceDistanceMeters,maxCalibratedSurfaceGapMeters});
 }
 results.push({id:entry.id,asset:entry.asset,sha256:hash(bytes),floor,contacts});
 console.log(`${entry.id}: skin floor ${Math.min(...floor.map(f=>f.minimumSkinY)).toFixed(6)}m; calibrated surface gap ${Math.max(0,...contacts.map(c=>c.maxCalibratedSurfaceGapMeters)).toFixed(6)}m`);
}
const report={schemaVersion:1,generatedAt:new Date().toISOString(),sampleRate:fps,source:'Final delivered GLB buffers, canonical skinning using each vertex actual normalized weights and inverse bind matrices',method:'60Hz plus exact events/support boundaries. Every skinned vertex is floor-scanned. At each contact midpoint the nearest real mesh triangle is recorded with vertex IDs and barycentric coordinates; those actual skinned triangle points are followed throughout the declared interval.',limitations:'The hand endpoint is the wrist-joint center; it lies about 1cm within the real hand surface. Surface gaps are diagnostic Euclidean distances between calibrated real triangle points. This is not a full continuous interpenetration, palm orientation, garment collision, or biomechanical certification. A contact marker may be close to a triangle while the contacted hand uses another surface.',results};
report.summary={minimumSkinY:Math.min(...results.flatMap(c=>c.floor.map(f=>f.minimumSkinY))),maxMarkerSurfaceDistanceMeters:Math.max(0,...results.flatMap(c=>c.contacts.map(w=>w.maxMarkerSurfaceDistanceMeters))),maxCalibratedSurfaceGapMeters:Math.max(0,...results.flatMap(c=>c.contacts.map(w=>w.maxCalibratedSurfaceGapMeters)))};
await fs.mkdir(new URL('verification/',base),{recursive:true});
await fs.writeFile(new URL('verification/surfaces.json',base),JSON.stringify(report,(_,v)=>typeof v==='number'?round(v):v,2)+'\n');
console.log(JSON.stringify(report.summary));
