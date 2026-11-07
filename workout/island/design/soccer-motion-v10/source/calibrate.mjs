/** Original v10 offline triangle contact calibration. CC0-1.0.
 * Run author -> bake -> calibrate -> bake. Native joint tracks are untouched.
 * Uses the decoded, skinned CC0 mesh at the exact native event frame. Runtime
 * playback performs no correction, ray casting, IK or WebAssembly decoding.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {GLTFLoader} from '../../soccer-motion-v8/runtime/vendor/GLTFLoader.js';

const base=new URL('../',import.meta.url),R=.11;
const v=new THREE.Vector3(),q=new THREE.Vector3();
const insist=(condition,message)=>{if(!condition)throw Error(message);};
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const subtract=(a,b)=>a.map((x,i)=>x-b[i]);
const length=a=>Math.hypot(...a);

function regionFor(bone){
 if(bone.endsWith('Foot'))return new Set([bone]);
 if(bone==='Chest')return new Set(['Chest','Spine']);
 return new Set([bone]);
}
function poseScene(loaded,clip,frameIndex,skeleton){
 const group=loaded.scene.parent??new THREE.Group();if(!loaded.scene.parent)group.add(loaded.scene);
 const index=Math.min(clip.frames.length-2,Math.floor(frameIndex)),u=Math.max(0,Math.min(1,frameIndex-index)),a=clip.frames[index],b=clip.frames[index+1];
 const rs=clip.referenceRootMotion?.samples,ra=rs?.[index]??{position:[0,0,0],yaw:0},rb=rs?.[index+1]??ra;
 const r={position:ra.position.map((x,i)=>x+(rb.position[i]-x)*u),yaw:ra.yaw+(rb.yaw-ra.yaw)*u};
 group.position.fromArray(r.position);group.rotation.y=(r.yaw??0)*(clip.referenceRootMotion?.yawUnit==='radians'?1:Math.PI/180);
 for(const bone of skeleton){const n=loaded.scene.getObjectByName(bone.name);insist(n,`Missing canonical bone ${bone.name}`);n.quaternion.fromArray(a.rotations[bone.name]).slerp(new THREE.Quaternion(...b.rotations[bone.name]),u);if(bone.name==='Hips')n.position.fromArray(a.hips.map((x,i)=>x+(b.hips[i]-x)*u));}
 group.updateMatrixWorld(true);return group;
}
function surfaces(scene,bone){
 const triangles=[],regional=[],names=regionFor(bone);
 scene.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  mesh.skeleton.update();const g=mesh.geometry,vertices=[],weights=[],sw=g.attributes.skinWeight,si=g.attributes.skinIndex;
  for(let i=0;i<g.attributes.position.count;i++){
   mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);vertices.push(v.clone());let weight=0;
   for(let j=0;j<4;j++)if(names.has(mesh.skeleton.bones[si.getComponent(i,j)]?.name))weight+=sw.getComponent(i,j);weights.push(weight);
  }
  const count=g.index?.count??vertices.length;
  for(let i=0;i<count;i+=3){
   const ids=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k),tri=new THREE.Triangle(...ids.map(k=>vertices[k]));
   const record={tri,mesh:mesh.uuid,normal:tri.getNormal(new THREE.Vector3()),box:new THREE.Box3().setFromPoints(ids.map(k=>vertices[k])),solid:!/(Eye|Hair)/i.test(mesh.material?.name??'')};
   triangles.push(record);if(Math.max(...ids.map(k=>weights[k]))>=.5||ids.reduce((sum,k)=>sum+weights[k],0)/3>=.3)regional.push(record);
  }
 });
 insist(regional.length>0,`No skinned triangles for ${bone}`);return {triangles,regional};
}
function boxDistanceSquared(p,b){let sum=0;for(const key of ['x','y','z']){const d=p[key]<b.min[key]?b.min[key]-p[key]:p[key]>b.max[key]?p[key]-b.max[key]:0;sum+=d*d;}return sum;}
function nearest(p,triangles){
 let distanceSquared=Infinity,point,triangle;
 for(const entry of triangles){if(boxDistanceSquared(p,entry.box)>=distanceSquared)continue;entry.tri.closestPointToPoint(p,q);const d=p.distanceToSquared(q);if(d<distanceSquared){distanceSquared=d;point=q.clone();triangle=entry;}}
 return {distance:Math.sqrt(distanceSquared),point,triangle};
}
function inside(p,triangles){
 const ray=new THREE.Ray(p,new THREE.Vector3(.017,.023,1).normalize()),hits=new Map(),hit=new THREE.Vector3();
 for(const entry of triangles){if(!entry.solid)continue;if(ray.intersectTriangle(entry.tri.a,entry.tri.b,entry.tri.c,false,hit)){const d=p.distanceTo(hit);if(d<1e-7)continue;if(!hits.has(entry.mesh))hits.set(entry.mesh,[]);hits.get(entry.mesh).push(d);}}
 for(const distances of hits.values()){distances.sort((a,b)=>a-b);let count=0,previous=-Infinity;for(const d of distances)if(d-previous>1e-5){count++;previous=d;}if(count%2)return true;}return false;
}

function fitSphere(clip,event,node,skin,oldCenter,{fast=false}={}){
 const seed=new THREE.Vector3(...event.position),near=nearest(seed,skin.regional),rotation=node.getWorldQuaternion(new THREE.Quaternion());
 const side=clip.id.includes('first_touch_inside_')?1:clip.id.includes('first_touch_outside_')?-1:0;
 const intended=clip.id==='goalkeeper_hand_roll'?new THREE.Vector3(-1,0,.2).normalize():new THREE.Vector3(side||0,0,side?0:1).applyQuaternion(rotation).normalize();
 const inverse=node.matrixWorld.clone().invert(),normal=near.triangle.normal;
 const directions=[intended,normal,normal.clone().negate(),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)];
 if(side)for(const z of [-1,-.5,.5,1])directions.push(new THREE.Vector3(side,0,z).applyQuaternion(rotation).normalize());
 if(!fast)for(const x of [-.6,0,.6])for(const y of [0,.5,1]){
  directions.push(intended.clone().add(new THREE.Vector3(x,y,0)).normalize());
  directions.push(normal.clone().add(new THREE.Vector3(x,y,.4)).normalize());
 }
 const seeds=[near.point];
 // Nearby triangle centroids offer surface alternatives at a toe edge or a
 // concave glove. Limit the search to the declared effector neighbourhood.
 const nearby=skin.regional.map(t=>{const p=t.tri.getMidpoint(new THREE.Vector3());return {t,p,d:p.distanceTo(seed)};}).filter(r=>r.d<.27).sort((a,b)=>a.d-b.d);
 if(!fast){const bins=new Set();for(const candidate of nearby){const local=candidate.p.clone().applyMatrix4(inverse);if(event.bone.endsWith('Foot')&&(local.y>.035||local.y<-.095||side&&local.x*side<.02))continue;const key=[local.x,local.y,local.z].map(x=>Math.round(x/.04)).join(':');if(bins.has(key))continue;bins.add(key);seeds.push(candidate.p);if(seeds.length>=(event.bone.endsWith('Foot')?12:5))break;}}
 let best;
 for(const initial of seeds)for(const direction of directions){
  if(direction.lengthSq()<.5)continue;
  const start=initial.clone();start.y=Math.max(R,start.y);let previous=0,upper=null;
  const at=t=>{const p=start.clone().addScaledVector(direction,t);if(p.y<R-1e-8)return {p,clear:false};return {p,clear:nearest(p,skin.triangles).distance>=R};};
  for(let t=0;t<=.551;t+=.015){const result=at(t);if(result.clear){upper=t;break;}previous=t;}
  if(upper===null)continue;
  let lower=previous;
  for(let i=0;i<25;i++){const mid=(lower+upper)/2;if(at(mid).clear)upper=mid;else lower=mid;}
  const center=at(upper).p,regional=nearest(center,skin.regional),whole=nearest(center,skin.triangles);
  if(Math.abs(regional.distance-R)>.0015||whole.distance<R-.00001||center.y<R-1e-8||inside(center,skin.triangles))continue;
  const marker=regional.point,local=marker.clone().applyMatrix4(inverse);
  if(side&&local.x*side<.02)continue;
  // The ankle is the Foot origin. A calf/shin point is not a shoe contact,
  // even when the skinned transition vertices retain some Foot weight.
  if(event.bone.endsWith('Foot')&&(local.y>.035||local.y<-.095))continue;
  if(marker.distanceTo(seed)>.27)continue;
  const outward=center.clone().sub(marker).normalize();
  // Kicks and controlled turning touches use the forefoot, facing the boot
  // direction. A nearby medial/heel surface can be clear at one instant yet
  // lie directly in the other leg's next step. Inside/outside receives keep
  // their explicit side-face constraints instead.
  if(event.bone.endsWith('Foot')&&!side&&(local.z<.18||outward.dot(intended)<.60))continue;
  // Preserve the intended side and favour the closest plausible contact.
  const cost=center.distanceTo(oldCenter)+.25*marker.distanceTo(seed)+(clip.id==='goalkeeper_hand_roll'?.22:.025)*(1-outward.dot(intended));
  if(!best||cost<best.cost)best={cost,center,marker,local,outward,whole,regional};
 }
 insist(best,`${clip.id}: no outward ${event.bone} surface sphere fits`);return best;
}

function valueAt(samples,time){
 if(time<=samples[0].time)return new THREE.Vector3(...samples[0].position);
 for(let i=1;i<samples.length;i++)if(time<=samples[i].time+1e-10){const a=samples[i-1],b=samples[i],u=(time-a.time)/(b.time-a.time||1);return new THREE.Vector3(...a.position).lerp(new THREE.Vector3(...b.position),u);}
 return new THREE.Vector3(...samples.at(-1).position);
}
function clearCenter(center,skin){
 center=center.clone();center.y=Math.max(R,center.y);const first=nearest(center,skin.triangles),within=inside(center,skin.triangles);
 if(first.distance>=R-.000005&&!within)return center;
 const direction=center.clone().sub(first.point).normalize(),normal=first.triangle.normal;
 const directions=[normal,normal.clone().negate(),direction,new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0)];
 let best;
 for(const d of directions){if(d.lengthSq()<.5)continue;let lo=0,hi=null;
  const at=t=>{const p=center.clone().addScaledVector(d,t);p.y=Math.max(R,p.y);return p;};
  for(let t=.012;t<.85;t+=.012){const p=at(t),hit=nearest(p,skin.triangles);if(hit.distance>=R+.0005&&!inside(p,skin.triangles)){hi=t;break;}lo=t;}
  if(hi===null)continue;
  for(let i=0;i<18;i++){const mid=(lo+hi)/2,p=at(mid);if(nearest(p,skin.triangles).distance>=R+.0005&&!inside(p,skin.triangles))hi=mid;else lo=mid;}
  const p=at(hi),cost=p.distanceToSquared(center);if(!best||cost<best.cost)best={p,cost};
 }
 insist(best,'No nearby collision-free sphere centre');return best.p;
}
function clearAlong(center,skin,direction){
 const clear=p=>p.y>=R-1e-8&&nearest(p,skin.triangles).distance>=R-.000005&&!inside(p,skin.triangles);
 if(clear(center))return {center:center.clone(),amount:0};
 let lo=0,hi=null;
 for(let t=.008;t<=.8;t+=.008){if(clear(center.clone().addScaledVector(direction,t))){hi=t;break;}lo=t;}
 insist(hi!==null,'No outward clearance along the contact normal');
 for(let i=0;i<20;i++){const mid=(lo+hi)/2;if(clear(center.clone().addScaledVector(direction,mid)))hi=mid;else lo=mid;}
 return {center:center.clone().addScaledVector(direction,hi+.0005),amount:hi+.0005};
}

async function bakeBallPath(loaded,clip,skeleton,fit,oldSamples,delta){
 const event=clip.event,c=event.time,D=clip.duration,centerLocal=fit.center.clone().applyMatrix4(loaded.scene.getObjectByName(event.bone).matrixWorld.clone().invert()),markerLocal=fit.local.clone(),points=[];
 const quick=clip.id.startsWith('first_touch_'),roll=clip.id==='goalkeeper_hand_roll',turning=/^(ball_spin_|shield_pressure_)/.test(clip.id),eventRoot=clip.referenceRootMotion.samples[event.frame],eventLocal=fit.center.clone().sub(new THREE.Vector3(...eventRoot.position)).applyAxisAngle(new THREE.Vector3(0,1,0),-eventRoot.yaw*Math.PI/180);
 let maximumPenetration=0,maximumHeldGap=0,maximumSpeed=0,maximumCorrection=0,speedPeak,clearanceEnvelope=null;
 const turnDirection=fit.outward.clone();turnDirection.y=Math.max(0,turnDirection.y);turnDirection.normalize();const desiredPoints=[],turnRequirements=[];
 for(let i=0;i<=Math.round(D*120);i++){
  const time=i/120,group=poseScene(loaded,clip,time*30,skeleton),node=loaded.scene.getObjectByName(event.bone),skin=surfaces(loaded.scene,event.bone),old=valueAt(oldSamples,time);
  let desired=old.clone().add(new THREE.Vector3(...delta));
  const held=(roll&&time<=c+1e-8)||(quick&&time>=c-1e-8);
  if(quick&&time<c){
   const approach=new THREE.Vector3(0,0,1),amount=1-time/c;
   desired=fit.center.clone().addScaledVector(approach,1.7*amount);desired.y+=(clip.id.includes('chest')?.18:clip.id.includes('thigh')?.12:0)*amount;
  }else if(held){
   desired=centerLocal.clone().applyMatrix4(node.matrixWorld);
   if(quick&&time>c){
    const elapsed=time-c,outward=desired.clone().sub(markerLocal.clone().applyMatrix4(node.matrixWorld)).normalize();
    if(/chest|thigh/.test(clip.id)){desired.y-=.5*9.81*elapsed*elapsed;desired.addScaledVector(outward,.25*elapsed);}
    else {
     // A received ball leaves the boot with a gentle forward roll. Attaching
     // it to a retracting medial boot drags it through the supporting shin.
     desired=fit.center.clone().add(new THREE.Vector3(0,-.5*9.81*elapsed*elapsed,2*elapsed));
    }
   }
  }else if(turning){
   // Keep the free ball in front of the boots and approach the real contact
   // over 300ms, avoiding a one-frame clearance jump near a turning foot.
   const x=Math.max(0,1-Math.abs(time-c)/.30),weight=x*x*(3-2*x),local=new THREE.Vector3(-.10,R,.50).lerp(eventLocal,weight);
   desired=local.applyAxisAngle(new THREE.Vector3(0,1,0),group.rotation.y).add(group.position);
  }
  desired.y=Math.max(R,desired.y);
  let center;
  if(Math.abs(time-c)<1e-8)center=fit.center.clone();
  else if(turning&&Math.abs(time-c)<.24){const fitted=clearAlong(desired,skin,turnDirection);center=fitted.center;turnRequirements[i]=fitted.amount;}
  else center=clearCenter(desired,skin);
  desiredPoints.push(desired.clone());
  if(roll&&time<c-1e-8&&Math.abs(nearest(center,skin.regional).distance-R)>.003){
   const marker=markerLocal.clone().applyMatrix4(node.matrixWorld),currentEvent={...event,position:marker.toArray()};
   try{center=fitSphere(clip,currentEvent,node,skin,desired,{fast:true}).center;}catch{center=fitSphere(clip,currentEvent,node,skin,desired).center;}
  }
  const hit=nearest(center,skin.triangles),penetration=inside(center,skin.triangles)?R+hit.distance:Math.max(0,R-hit.distance);
  maximumPenetration=Math.max(maximumPenetration,penetration);maximumCorrection=Math.max(maximumCorrection,center.distanceTo(desired));
  if(roll&&time<=c+1e-8)maximumHeldGap=Math.max(maximumHeldGap,Math.abs(nearest(center,skin.regional).distance-R));
  if(points.length){const speed=center.distanceTo(new THREE.Vector3(...points.at(-1).position))*120;if(speed>maximumSpeed){maximumSpeed=speed;speedPeak={time,previous:points.at(-1).position,current:center.toArray(),desired:desired.toArray(),correction:center.distanceTo(desired)};}}
  points.push({time,position:center.toArray()});
 }
 if(turning){
  const required=points.map((_,i)=>turnRequirements[i]??0),rate=Math.max(1.5,...required.map((shift,i)=>shift/(Math.abs(points[i].time-c)||Infinity)))+1e-5;
  insist(rate<=6,`${clip.id}: contact clearance would require ${rate.toFixed(2)}m/s displacement: ${JSON.stringify(required.map((shift,i)=>({time:points[i].time,shift,rate:shift/(Math.abs(points[i].time-c)||Infinity)})).sort((a,b)=>b.rate-a.rate).slice(0,3))}`);
  const envelope=points.map((p,i)=>Math.max(0,...required.map((amount,j)=>amount-rate*Math.abs(p.time-points[j].time))));
  for(let i=0;i<points.length;i++)if(envelope[i]>0)points[i].position=desiredPoints[i].clone().addScaledVector(turnDirection,envelope[i]).toArray();
  points[Math.round(c*120)].position=fit.center.toArray();
  maximumPenetration=0;maximumSpeed=0;maximumCorrection=0;
  for(let i=0;i<points.length;i++){
   poseScene(loaded,clip,points[i].time*30,skeleton);const skin=surfaces(loaded.scene,event.bone),p=new THREE.Vector3(...points[i].position),hit=nearest(p,skin.triangles),penetration=inside(p,skin.triangles)?R+hit.distance:Math.max(0,R-hit.distance);
   maximumPenetration=Math.max(maximumPenetration,penetration);maximumCorrection=Math.max(maximumCorrection,p.distanceTo(desiredPoints[i]));
   if(i){const speed=p.distanceTo(new THREE.Vector3(...points[i-1].position))*120;if(speed>maximumSpeed){maximumSpeed=speed;speedPeak={time:points[i].time,previous:points[i-1].position,current:points[i].position};}}
  }
  clearanceEnvelope={direction:turnDirection.toArray(),maximumAddedDisplacementMeters:Math.max(...envelope),displacementVelocityLimitMetersPerSecond:rate,exactContactProtected:true};
 }
 insist(maximumPenetration<=.005,`${clip.id}: baked ball path penetrates skin by ${maximumPenetration}`);
 insist(maximumSpeed<=(roll?8:clip.id==='goalkeeper_long_goal_kick'?25:12),`${clip.id}: collision correction caused an implausible ${maximumSpeed.toFixed(2)}m/s ball spike: ${JSON.stringify(speedPeak)}`);
 clip.ball.samples=points;clip.ball.sampleRateHz=120;clip.ball.contactCenterLocal=centerLocal.toArray();
 return {samples:points.length,samplingHz:120,maximumSkinPenetrationMeters:maximumPenetration,maximumHeldHandRadiusErrorMeters:maximumHeldGap,maximumSpeedMetersPerSecond:maximumSpeed,maximumClearanceCorrectionMeters:maximumCorrection,...(clearanceEnvelope?{clearanceEnvelope}:{})};
}

/** Calibrate actual event surfaces and complete visual ball paths.
 * Exact event contact is protected. Ball paths are baked at 120Hz against
 * interpolated native joint tracks, with effector-relative cushioning and
 * held-hand movement plus whole-body clearance. No runtime solver is needed.
 */
export async function calibrate(data){
 const nativeBefore=JSON.stringify(data.clips.map(c=>c.frames)),report={license:'CC0-1.0',method:'Actual decoded skinned triangles; event sphere fit and 120Hz baked full ball paths; no motion-track edits',ballRadiusMeters:R,eventPenetrationLimitMeters:.005,globalPathSkinCollisionTested:true,pathSamplingHz:120,clips:[]};
 const loader=new GLTFLoader(); // No compression loader is configured.
 loader.register(()=>({name:'EXT_texture_webp',loadTexture(){return Promise.resolve(new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1));}}));
 for(const clip of data.clips.filter(c=>c.ball&&c.event)){
  const event=clip.event,index=event.frame,oldMarker=[...event.position],oldSamples=structuredClone(clip.ball.samples),oldCenter=valueAt(oldSamples,event.time);
  const url=new URL(`runtime/clips/${clip.id}.glb`,base),bytes=await fs.readFile(url),loaded=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const group=poseScene(loaded,clip,index,data.skeleton),node=loaded.scene.getObjectByName(event.bone);
  insist(node?.isBone&&event.bone!=='Root',`${clip.id}: event needs a real effector bone`);
  const skin=surfaces(loaded.scene,event.bone),fit=fitSphere(clip,event,node,skin,oldCenter),delta=fit.center.clone().sub(oldCenter).toArray();
  const position=fit.marker.toArray(),local=fit.local.toArray(),evidence={method:'skinned-triangle-surface',ballCenter:fit.center.toArray(),surfaceNormal:fit.outward.toArray(),skinPenetrationMeters:Math.max(0,R-fit.whole.distance),regionalRadiusErrorMeters:Math.abs(R-fit.regional.distance),floorClearanceMeters:fit.center.y-R};
  const oldBone=event.bone,oldType=event.event??event.type;
  for(const e of clip.events??[])if(e.frame===event.frame&&e.bone===oldBone&&(e.event??e.type)===oldType)Object.assign(e,{local:[...local],position:[...position],contactEvidence:structuredClone(evidence)});
  Object.assign(event,{local,position,contactEvidence:evidence});
  const pathAudit=await bakeBallPath(loaded,clip,data.skeleton,fit,oldSamples,delta);
  const penetration=Math.max(0,R-nearest(fit.center,skin.triangles).distance);
  insist(penetration<=.005,`${clip.id}: calibrated sphere penetrates skin`);
  const row={id:clip.id,frame:index,bone:event.bone,event:oldType,marker:position,local,ballCenter:fit.center.toArray(),sourceMarker:oldMarker,sourceBallCenter:oldCenter.toArray(),centerCorrectionMeters:length(delta),markerCorrectionMeters:length(subtract(position,oldMarker)),...evidence,path:pathAudit};
  report.clips.push(row);console.log(`surface ${clip.id}: ${(penetration*1000).toFixed(4)}mm skin penetration, ${(evidence.regionalRadiusErrorMeters*1000).toFixed(4)}mm radius error, max ball ${pathAudit.maximumSpeedMetersPerSecond.toFixed(2)}m/s`);
  group.remove(loaded.scene);loaded.scene.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m?.dispose();});
 }
 insist(nativeBefore===JSON.stringify(data.clips.map(c=>c.frames)),'Calibration changed native motion frames');
 report.maximumEventSkinPenetrationMeters=Math.max(0,...report.clips.map(c=>c.skinPenetrationMeters));report.maximumEventRadiusErrorMeters=Math.max(0,...report.clips.map(c=>c.regionalRadiusErrorMeters));
 report.maximumPathSkinPenetrationMeters=Math.max(0,...report.clips.map(c=>c.path.maximumSkinPenetrationMeters));report.maximumHeldHandRadiusErrorMeters=Math.max(0,...report.clips.map(c=>c.path.maximumHeldHandRadiusErrorMeters));
 report.nativeMotionFramesUnchanged=true;return {data,report};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const initial=await fs.readFile(new URL('runtime/motions.json',base),'utf8'),data=JSON.parse(initial),{report}=await calibrate(data);
 insist(initial===await fs.readFile(new URL('runtime/motions.json',base),'utf8'),'Motion input changed during calibration; retry from stable authored inputs');
 const output=JSON.stringify(data);report.outputMotionSha256=createHash('sha256').update(output).digest('hex');
 await fs.writeFile(new URL('runtime/motions.json',base),output);
 await fs.mkdir(new URL('verification/',base),{recursive:true});
 await fs.writeFile(new URL('verification/contact-surfaces.json',base),JSON.stringify(report,null,2)+'\n');
 console.log(`Calibrated ${report.clips.length} actual skin contacts; native joint frames unchanged.`);
}
