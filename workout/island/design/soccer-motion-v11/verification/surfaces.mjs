/** CC0-1.0. CPU skin and actual triangle contact audit of delivered GLB bytes.
 * No source poses, runtime IK, texture stand-ins, geometry codec or WebAssembly.
 * The canonical skinned mesh is transformed by joint-world * inverse-bind.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3,Quaternion,Triangle,Ray,Box3} from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {decode,worldAt,point,ballAt} from './reader.mjs';
const base=new URL('../',import.meta.url),v=new Vector3(),unit=new Vector3(1,1,1),closest=new Vector3();
const demand=(ok,message)=>{if(!ok)throw Error(message);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const round=x=>Number.isFinite(x)?Number(x.toFixed(9)):null;
export const R=.11;
const regions=bone=>bone==='Chest'?new Set(['Chest','Spine']):new Set([bone]);
const atComponent=(a,i)=>a[i]??0;
export function boxDistanceSquared(p,b){let d=0;for(const key of ['x','y','z']){const x=p[key]<b.min[key]?b.min[key]-p[key]:p[key]>b.max[key]?p[key]-b.max[key]:0;d+=x*x;}return d;}
function makeTree(entries){
 const box=new Box3();for(const e of entries)box.union(e.box);const regionSet=new Set(entries.flatMap(e=>[...e.regions]));
 if(entries.length<=10)return {box,entries,regions:regionSet};const size=box.getSize(new Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';entries.sort((a,b)=>(a.box.min[axis]+a.box.max[axis])-(b.box.min[axis]+b.box.max[axis]));const middle=entries.length>>1;return {box,regions:regionSet,left:makeTree(entries.slice(0,middle)),right:makeTree(entries.slice(middle))};
}
export function nearest(p,triangles,bone=null){
 let distanceSquared=Infinity,marker=null,entry=null;
 triangles.queryCount=(triangles.queryCount??0)+1;if(triangles.queryCount===8)triangles.tree=makeTree([...triangles]);
 const visit=t=>{if(bone&&!t.regions.has(bone)||boxDistanceSquared(p,t.box)>=distanceSquared)return;t.triangle.closestPointToPoint(p,closest);const d=p.distanceToSquared(closest);if(d<distanceSquared){distanceSquared=d;marker=closest.clone();entry=t;}};
 if(triangles.tree){const stack=[triangles.tree];while(stack.length){const n=stack.pop();if(bone&&!n.regions.has(bone)||boxDistanceSquared(p,n.box)>=distanceSquared)continue;if(n.entries)for(const e of n.entries)visit(e);else{const dl=boxDistanceSquared(p,n.left.box),dr=boxDistanceSquared(p,n.right.box);if(dl<dr){stack.push(n.right,n.left);}else stack.push(n.left,n.right);}}}else for(const t of triangles)visit(t);
 return {distance:Math.sqrt(distanceSquared),point:marker,entry};
}
export function inside(p,triangles){
 const ray=new Ray(p,new Vector3(.017,.023,1).normalize()),hit=new Vector3(),hits=new Map();
 for(const t of triangles){if(!t.solid||!ray.intersectsBox(t.box))continue;if(ray.intersectTriangle(t.triangle.a,t.triangle.b,t.triangle.c,false,hit)){const d=p.distanceTo(hit);if(d<1e-7)continue;const values=hits.get(t.primitive)??[];values.push(d);hits.set(t.primitive,values);}}
 for(const values of hits.values()){values.sort((a,b)=>a-b);let count=0,last=-Infinity;for(const d of values)if(d-last>1e-5){count++;last=d;}if(count%2)return true;}return false;
}
export class SurfaceModel {
 constructor(data){
  this.data=data;this.primitives=[];
  const {json,read}=data;
  for(const node of json.nodes.filter(n=>n.mesh!==undefined)){
   demand(node.skin!==undefined,'Expected skinned geometry only');
   demand(!node.matrix&&!node.rotation&&!node.scale&&(!node.translation||Math.hypot(...node.translation)<1e-9),'CPU skin expects identity mesh node transform');
   const skin=json.skins[node.skin],inverse=read(skin.inverseBindMatrices).map(x=>new Matrix4().fromArray(x)),joints=skin.joints.map(i=>json.nodes[i].name);
   for(const primitive of json.meshes[node.mesh].primitives){
    const positions=read(primitive.attributes.POSITION),weights=read(primitive.attributes.WEIGHTS_0),indices=read(primitive.attributes.JOINTS_0),faces=primitive.indices===undefined?positions.map((_,i)=>i):read(primitive.indices).flat(),solid=!/Eye|Hair/i.test(json.materials[primitive.material]?.name??'');
    demand(faces.length%3===0,'Expected triangle primitives');
    const vertexRegions=weights.map((ws,i)=>Object.fromEntries(joints.map(bone=>[bone,ws.reduce((sum,w,k)=>sum+(joints[indices[i][k]]===bone?w:0),0)])));
    const triangleRegions=[];
    for(let f=0;f<faces.length;f+=3){const ids=faces.slice(f,f+3),set=new Set();for(const bone of joints){const names=regions(bone),ww=ids.map(i=>[...names].reduce((sum,name)=>sum+(vertexRegions[i][name]??0),0));if(Math.max(...ww)>=.5||ww.reduce((s,w)=>s+w,0)/3>=.3)set.add(bone);}triangleRegions.push(set);}
    this.primitives.push({positions,weights,indices,faces,inverse,joints,solid,triangleRegions});
   }
  }
 }
 at(meta,time){
  const world=worldAt(this.data,meta,time),matrices=Object.fromEntries(Object.entries(world).map(([name,b])=>[name,new Matrix4().compose(new Vector3(...b.position),new Quaternion(...b.rotation),unit)])),triangles=[];
  for(let p=0;p<this.primitives.length;p++){
   const primitive=this.primitives[p],skinMatrices=primitive.joints.map((name,i)=>matrices[name].clone().multiply(primitive.inverse[i]));
   const vertices=primitive.positions.map((position,i)=>{
    const out=new Vector3();for(let j=0;j<4;j++){const w=atComponent(primitive.weights[i],j);if(!w)continue;v.fromArray(position).applyMatrix4(skinMatrices[primitive.indices[i][j]]);out.addScaledVector(v,w);}return out;
   });
   for(let f=0;f<primitive.faces.length;f+=3){const triangle=new Triangle(...primitive.faces.slice(f,f+3).map(i=>vertices[i]));triangles.push({triangle,regions:primitive.triangleRegions[f/3],normal:triangle.getNormal(new Vector3()),box:new Box3().setFromPoints([triangle.a,triangle.b,triangle.c]),solid:primitive.solid,primitive:p});}
  }
  return {world,triangles,localToWorld:(bone,local)=>new Vector3(...point(world,bone,local)),worldToLocal:(bone,p)=>p.clone().sub(new Vector3(...world[bone].position)).applyQuaternion(new Quaternion(...world[bone].rotation).invert())};
 }
}

export function auditEvent(surface,event,center,radius=R){
 const marker=surface.localToWorld(event.bone,event.local),skin=nearest(marker,surface.triangles,event.bone),regional=nearest(center,surface.triangles,event.bone),whole=nearest(center,surface.triangles),isInside=inside(center,surface.triangles);
 return {frame:event.frame,bone:event.bone,event:event.event??event.type,ballContact:!!event.ballContact,local:event.local,marker:marker.toArray(),ballCenter:center.toArray(),markerToSurfaceMeters:round(skin.distance),ballRadiusErrorMeters:round(Math.abs(regional.distance-radius)),wholeSkinPenetrationMeters:round(isInside?radius+whole.distance:Math.max(0,radius-whole.distance)),centerInsideSkin:isInside,floorPenetrationMeters:round(Math.max(0,radius-center.y)),markerDeclaredPositionErrorMeters:round(event.position?marker.distanceTo(new Vector3(...event.position)):0)};
}
export async function auditSurfaces(catalog,{output=true}={}){
 const report={license:'CC0-1.0',method:'Delivered float32 GLB skin matrices, decoded mesh triangles and shortest-path animation interpolation; complete ball path sampled at 120Hz; reference trajectory applied once; no runtime IK or geometry decoder',samplingHz:120,limits:{markerToSurfaceMeters:.003,eventRadiusErrorMeters:.003,skinPenetrationMeters:.005,missClearanceMeters:.015},clips:[]};
 for(const clip of catalog.clips.filter(c=>c.ball)){
  const bytes=await fs.readFile(new URL('runtime/'+clip.asset,base)),model=new SurfaceModel(decode(bytes)),events=(clip.events??[]).filter(e=>e.ballContact===true),row={id:clip.id,assetSha256:hash(bytes),events:[],failures:[]};
  const radius=clip.ball.radius??R;
  for(const event of events){const t=event.time??event.frame/30,surface=model.at(clip,t),center=new Vector3(...ballAt(clip,t)),item=auditEvent(surface,event,center,radius);row.events.push(item);if(item.markerToSurfaceMeters>.003)row.failures.push({code:'marker-off-skin',frame:event.frame,value:item.markerToSurfaceMeters});if(item.ballRadiusErrorMeters>.003)row.failures.push({code:'event-radius',frame:event.frame,value:item.ballRadiusErrorMeters});if(item.wholeSkinPenetrationMeters>.005)row.failures.push({code:'event-penetration',frame:event.frame,value:item.wholeSkinPenetrationMeters});if(item.floorPenetrationMeters>.001)row.failures.push({code:'event-floor',frame:event.frame,value:item.floorPenetrationMeters});if(item.markerDeclaredPositionErrorMeters>.001)row.failures.push({code:'marker-position',frame:event.frame,value:item.markerDeclaredPositionErrorMeters});}
  let maximum=0,speed=0,minGap=Infinity,previous=null,previousVelocity=null,velocityStep=0,samples=0,peak=null;
  for(let i=0;i<=Math.round(clip.duration*120);i++){
   const t=Math.min(clip.duration,i/120),center=new Vector3(...ballAt(clip,t)),surface=model.at(clip,t),near=nearest(center,surface.triangles),within=inside(center,surface.triangles),penetration=within?radius+near.distance:Math.max(0,radius-near.distance);
   if(penetration>maximum){maximum=penetration;peak={time:t,position:center.toArray()};}minGap=Math.min(minGap,near.distance-radius);if(previous){const velocity=center.clone().sub(previous).multiplyScalar(120);speed=Math.max(speed,velocity.length());if(previousVelocity&&!events.some(e=>Math.abs((e.time??e.frame/30)-t)<1/30+1e-9))velocityStep=Math.max(velocityStep,velocity.distanceTo(previousVelocity));previousVelocity=velocity;}previous=center;samples++;
  }
  row.path={samples,maxSkinPenetrationMeters:round(maximum),maxBallSpeedMetersPerSecond:round(speed),maxOffContactVelocityStepMetersPerSecond:round(velocityStep),maxOffContactAccelerationMetersPerSecondSquared:round(velocityStep*120),minimumSkinGapMeters:round(minGap),peak};
  if(maximum>.005)row.failures.push({code:'path-penetration',value:maximum,peak});const speedLimit=clip.id.startsWith('dribble_')?18:clip.id.startsWith('pass_ground_')?14:/^keeper_(catch_|rush$|dive_)/.test(clip.id)?8:null;row.path.speedLimitMetersPerSecond=speedLimit;if(speedLimit&&speed>speedLimit)row.failures.push({code:'clearance-speed-spike',value:speed,limit:speedLimit});
  const isMiss=/miss/.test(clip.id);if(isMiss){row.path.minMissClearanceMeters=round(minGap);if(events.length)row.failures.push({code:'invented-miss-ball-contact'});if(minGap<.015)row.failures.push({code:'miss-too-close',value:minGap});}
  if(!events.length&&!isMiss&&clip.ballContact!==false)row.failures.push({code:'no-physical-ball-event'});
  row.pass=row.failures.length===0;report.clips.push(row);console.log(`skin ${row.pass?'PASS':'FAIL'} ${clip.id}: penetration ${(maximum*1000).toFixed(3)}mm; ${row.events.length} ball events`);
 }
 const rows=report.clips;report.summary={clips:rows.length,passed:rows.filter(c=>c.pass).length,events:rows.reduce((s,c)=>s+c.events.length,0),maxEventRadiusErrorMeters:Math.max(0,...rows.flatMap(c=>c.events.map(e=>e.ballRadiusErrorMeters))),maxMarkerToSurfaceMeters:Math.max(0,...rows.flatMap(c=>c.events.map(e=>e.markerToSurfaceMeters))),maxEventSkinPenetrationMeters:Math.max(0,...rows.flatMap(c=>c.events.map(e=>e.wholeSkinPenetrationMeters))),maxPathSkinPenetrationMeters:Math.max(0,...rows.map(c=>c.path.maxSkinPenetrationMeters)),maxDribbleBallSpeedMetersPerSecond:Math.max(0,...rows.filter(c=>c.id.startsWith('dribble_')).map(c=>c.path.maxBallSpeedMetersPerSecond)),maxGroundPassBallSpeedMetersPerSecond:Math.max(0,...rows.filter(c=>c.id.startsWith('pass_ground_')).map(c=>c.path.maxBallSpeedMetersPerSecond)),maxHeldBallSpeedMetersPerSecond:Math.max(0,...rows.filter(c=>/^keeper_(catch_|rush$|dive_)/.test(c.id)).map(c=>c.path.maxBallSpeedMetersPerSecond)),maxOffContactVelocityStepMetersPerSecond:Math.max(0,...rows.map(c=>c.path.maxOffContactVelocityStepMetersPerSecond)),minMissClearanceMeters:Math.min(Infinity,...rows.filter(c=>/miss/.test(c.id)).map(c=>c.path.minimumSkinGapMeters))};if(!Number.isFinite(report.summary.minMissClearanceMeters))report.summary.minMissClearanceMeters=null;
 report.pass=rows.every(c=>c.pass);if(output)await fs.writeFile(new URL('verification/contact-surfaces.json',base),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const bytes=await fs.readFile(new URL('runtime/catalog.json',base)),catalog=JSON.parse(bytes),report=await auditSurfaces(catalog,{output:false});report.sourceMotionSha256=catalog.sourceMotionSha256;report.catalogSha256=hash(bytes);report.catalogSha256After=hash(await fs.readFile(new URL('runtime/catalog.json',base)));report.pass&&=report.catalogSha256===report.catalogSha256After;await fs.writeFile(new URL('verification/contact-surfaces.json',base),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));if(!report.pass)process.exitCode=1;
}
