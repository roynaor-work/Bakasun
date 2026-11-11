/** CC0-1.0. Offline sphere/skin calibration; native motion frames stay unchanged.
 * Run author -> bake -> calibrate -> bake -> verification/surfaces.mjs.
 * Reads actual decoded float32 GLB channels and skin triangles. Only contact
 * markers and ball trajectories are changed; the runtime has no solver.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Vector3,Quaternion} from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {decode,ballAt,bracket,rootAt} from '../verification/reader.mjs';
import {SurfaceModel,nearest,inside,R} from '../verification/surfaces.mjs';
const base=new URL('../',import.meta.url),demand=(ok,message)=>{if(!ok)throw Error(message);},hash=b=>createHash('sha256').update(b).digest('hex');
const clone=structuredClone,up=new Vector3(0,1,0);
const lerp=(a,b,u)=>a.clone().lerp(b,u);
const finite=x=>Number.isFinite(x)?Number(x.toFixed(9)):null;
function physicalEvents(clip){return (clip.events??[]).filter(e=>e.ballContact===true);}
function plausibleMarker(event,local,outward,intended){
 if(event.bone.endsWith('Foot')){const heel=event.contactSurface==='heel'||event.local[2]<0;return (heel?local.z>=-.15&&local.z<=.015:local.z>=.18&&local.z<=.38)&&local.y>=-.095&&local.y<=.04&&outward.dot(intended)>.20;}
 if(event.bone==='Chest')return local.z>.045&&outward.dot(intended)>.15;
 if(event.bone==='Head')return local.z>.055&&outward.dot(intended)>.15;
 return true;
}
function fitContact(clip,event,surface,oldCenter,radius=R){
 const seed=surface.localToWorld(event.bone,event.local),rotation=new Quaternion(...surface.world[event.bone].rotation),near=nearest(seed,surface.triangles,event.bone);
 demand(near.point,`${clip.id}: no regional surface for ${event.bone}`);
 const intended=event.normal?new Vector3(...event.normal).normalize():new Vector3(0,0,1).applyQuaternion(rotation).normalize();
 const forward=new Vector3(0,0,1).applyQuaternion(rotation).normalize(),directions=[intended,forward,near.entry.normal.clone(),near.entry.normal.clone().negate(),up.clone()];
 for(const x of [-.6,0,.6])for(const y of [0,.5,1])directions.push(intended.clone().add(new Vector3(x,y,0)).normalize());
 if(event.bone.endsWith('Hand'))for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,1])directions.push(new Vector3(x,y,z).normalize().applyQuaternion(rotation));
 const candidates=[near.point],bins=new Set();
 const triangles=surface.triangles.filter(t=>t.regions.has(event.bone)).map(t=>({t,p:t.triangle.getMidpoint(new Vector3())})).map(r=>({...r,d:r.p.distanceTo(seed)})).filter(r=>r.d<.28).sort((a,b)=>a.d-b.d);
 for(const {p} of triangles){const local=surface.worldToLocal(event.bone,p);if(event.bone.endsWith('Foot')&&((event.local[2]<0?local.z<-.15||local.z>.015:local.z<.18)||local.y<-.095||local.y>.04))continue;const key=[local.x,local.y,local.z].map(v=>Math.round(v/.025)).join(':');if(bins.has(key))continue;bins.add(key);candidates.push(p);if(candidates.length>=12)break;}
 let best;
 for(const marker of candidates)for(const direction of directions){
  if(direction.lengthSq()<.5)continue;
  const start=marker.clone();start.y=Math.max(radius,start.y);let low=0,high=null;
  const centerAt=amount=>start.clone().addScaledVector(direction,amount);
  const clear=center=>center.y>=radius-1e-8&&nearest(center,surface.triangles).distance>=radius;
  for(let amount=0;amount<=.55;amount+=.015){if(clear(centerAt(amount))){high=amount;break;}low=amount;}
  if(high===null)continue;
  for(let i=0;i<23;i++){const mid=(low+high)/2;if(clear(centerAt(mid)))high=mid;else low=mid;}
  const center=centerAt(high),regional=nearest(center,surface.triangles,event.bone),whole=nearest(center,surface.triangles);
  if(!regional.point||Math.abs(regional.distance-radius)>.0015||whole.distance<radius-.00001||inside(center,surface.triangles))continue;
  const local=surface.worldToLocal(event.bone,regional.point),outward=center.clone().sub(regional.point).normalize();
  if(!plausibleMarker(event,local,outward,event.local[2]<0?intended:forward)||regional.point.distanceTo(seed)>.28)continue;
  const cost=center.distanceTo(oldCenter)+.35*regional.point.distanceTo(seed)+.03*(1-outward.dot(intended));
  if(!best||cost<best.cost)best={center,marker:regional.point,local,outward,cost,wholeDistance:whole.distance,regionalDistance:regional.distance};
 }
 demand(best,`${clip.id}: no contact sphere fits ${event.bone} actual skin`);return best;
}
function fitHandPair(clip,event,surface,oldCenter,radius=R){
 const bones=['RightHand','LeftHand'],seed=bones.map(b=>surface.localToWorld(b,[0,-.055,.035])),mid=seed[0].clone().add(seed[1]).multiplyScalar(.5),candidates=[];
 for(const z of [.06,.11,.17,.23])for(const y of [-.08,0,.08])candidates.push(mid.clone().add(new Vector3(0,y,z)));
 candidates.push(oldCenter.clone());let best;
 for(const initial of candidates){let center=initial;
  for(let step=0;step<36;step++){
   const hits=bones.map(b=>nearest(center,surface.triangles,b));if(hits.some(h=>!h.point))break;
   const ns=hits.map(h=>center.clone().sub(h.point).normalize()),errors=hits.map(h=>radius-h.distance),dot=ns[0].dot(ns[1]),den=1-dot*dot;
   if(Math.max(...errors.map(Math.abs))<.0000005)break;
   if(den<.00001){center.add(new Vector3(0,0,.01));continue;}
   const a=(errors[0]-dot*errors[1])/den,b=(errors[1]-dot*errors[0])/den,delta=ns[0].multiplyScalar(a).addScaledVector(ns[1],b);if(delta.length()>.08)delta.setLength(.08);center=center.clone().add(delta);center.y=Math.max(radius,center.y);
  }
  const hits=bones.map(b=>nearest(center,surface.triangles,b)),whole=nearest(center,surface.triangles),errors=hits.map(h=>Math.abs(h.distance-radius));
  if(Math.max(...errors)>.002||whole.distance<radius-.00001||inside(center,surface.triangles)||center.distanceTo(mid)>.4)continue;
  const cost=center.distanceTo(oldCenter)+.15*center.distanceTo(mid);if(!best||cost<best.cost)best={center,cost,hits,whole};
 }
 demand(best,`${clip.id}: no single ball touches BOTH actual hand surfaces`);
 const fits=Object.fromEntries(bones.map((bone,i)=>[bone,{center:best.center.clone(),marker:best.hits[i].point,local:surface.worldToLocal(bone,best.hits[i].point),outward:best.center.clone().sub(best.hits[i].point).normalize(),wholeDistance:best.whole.distance,regionalDistance:best.hits[i].distance}]));
 return {fits,radiusErrors:bones.map((bone,i)=>({bone,radiusErrorMeters:Math.abs(best.hits[i].distance-radius)}))};
}
function clearSphere(center,surface,radius,{margin=.00025}={}){
 center=center.clone();center.y=Math.max(radius,center.y);const hit=nearest(center,surface.triangles),within=inside(center,surface.triangles);
 if(hit.distance>=radius-.000002&&!within)return center;
 const direction=center.clone().sub(hit.point).normalize(),directions=[direction,hit.entry.normal.clone(),hit.entry.normal.clone().negate(),up.clone(),new Vector3(0,0,1),new Vector3(1,0,0),new Vector3(-1,0,0)];let best;
 for(const direction of directions){if(direction.lengthSq()<.5)continue;let lo=0,hi=null;const at=a=>{const p=center.clone().addScaledVector(direction,a);p.y=Math.max(radius,p.y);return p;};const clear=p=>nearest(p,surface.triangles).distance>=radius+margin&&!inside(p,surface.triangles);
  for(let amount=.01;amount<=.9;amount+=.01){if(clear(at(amount))){hi=amount;break;}lo=amount;}
  if(hi===null)continue;for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(clear(at(mid)))hi=mid;else lo=mid;}
  const p=at(hi),cost=p.distanceToSquared(center);if(!best||cost<best.cost)best={p,cost};
 }
 demand(best,'No nearby collision-free ball center');return best.p;
}
function offsetAt(fits,time){
 if(!fits.length)return new Vector3();const keys=fits.map(f=>({time:f.event.time,delta:f.delta})),[a,b,u]=bracket(keys,time);return lerp(keys[a].delta,keys[b].delta,u);
}
function updateMatching(clip,event,updates){
 const kind=event.event??event.type;
 for(const e of clip.events??[])if(e.frame===event.frame&&e.bone===event.bone&&(e.event??e.type)===kind)Object.assign(e,clone(updates));
 if(clip.event?.frame===event.frame&&clip.event?.bone===event.bone&&(clip.event.event??clip.event.type)===kind)Object.assign(clip.event,clone(updates));
}
export async function calibrate(data){
 const cacheDirectory=process.env.V11_CALIBRATION_CACHE,implementationHash=hash(await fs.readFile(fileURLToPath(import.meta.url)));if(cacheDirectory)await fs.mkdir(cacheDirectory,{recursive:true});
 const nativeBefore=JSON.stringify(data.clips.map(c=>c.frames)),report={license:'CC0-1.0',method:'Actual float32 GLB skin triangles; sphere fit at true contact events and whole path clearance at 120Hz; markers and ball paths only',samplingHz:120,clips:[],failures:[]};
 for(const clip of data.clips.filter(c=>c.ball)){
  const bytes=await fs.readFile(new URL(`runtime/clips/${clip.id}.glb`,base)),model=new SurfaceModel(decode(bytes)),old=clone(clip.ball.samples??clip.ball.keys),radius=clip.ball.radius??R,events=physicalEvents(clip).sort((a,b)=>a.time-b.time),fits=[],row={id:clip.id,inputAssetSha256:hash(bytes),calibrationImplementationSha256:implementationHash,events:[],failures:[]};
  const cacheKey=hash(hash(bytes)+JSON.stringify(clip)+implementationHash),cacheFile=cacheDirectory?path.join(cacheDirectory,cacheKey+'.json'):null;if(cacheFile){try{const cached=JSON.parse(await fs.readFile(cacheFile));Object.assign(clip,cached.clip);report.clips.push(cached.row);console.log('cached '+clip.id);continue;}catch{}}
  const oldMeta={ball:{samples:old}};
  const isPair=/^keeper_(catch_|rush$|dive_)/.test(clip.id)||clip.id==='set_throw_in';
  if(isPair&&events.length&&!events.some(e=>e.bone==='LeftHand')){const primary=events[0],secondary={...clone(primary),bone:'LeftHand',local:[0,-.055,.035]};secondary.position=model.at(clip,primary.time).localToWorld('LeftHand',secondary.local).toArray();clip.events.push(secondary);events.push(secondary);}
  let pairFit=null;
  for(const event of events){
   const surface=model.at(clip,event.time),oldCenter=new Vector3(...ballAt(oldMeta,event.time)),oldMarker=surface.localToWorld(event.bone,event.local).toArray();
   let fit;
   // Simultaneous contacts share one physical sphere, rather than independently
   // moving it to each hand. Failure is explicit when the hands cannot meet it.
   const shared=fits.find(f=>Math.abs(f.event.time-event.time)<1e-8);
   if(shared){const regional=nearest(shared.fit.center,surface.triangles,event.bone),whole=nearest(shared.fit.center,surface.triangles);demand(regional.point&&Math.abs(regional.distance-radius)<=.006,`${clip.id}: ${event.bone} cannot share the other hand's ball (${regional.distance-radius}m gap)`);fit={center:shared.fit.center.clone(),marker:regional.point,local:surface.worldToLocal(event.bone,regional.point),outward:shared.fit.center.clone().sub(regional.point).normalize(),wholeDistance:whole.distance,regionalDistance:regional.distance};}
   else if(isPair){pairFit=fitHandPair(clip,event,surface,oldCenter,radius);fit=pairFit.fits[event.bone];row.handPair=pairFit.radiusErrors;}
   else fit=fitContact(clip,event,surface,oldCenter,radius);
   const normal=fit.outward.toArray(),evidence={method:'actual-skinned-triangle',ballCenter:fit.center.toArray(),surfaceNormal:fit.outward.toArray(),regionalRadiusErrorMeters:Math.abs(fit.regionalDistance-radius),skinPenetrationMeters:Math.max(0,radius-fit.wholeDistance)};
   const updates={local:fit.local.toArray(),position:fit.marker.toArray(),normal,normalSpace:'reference-world',contactEvidence:evidence,...(event.bone.endsWith('Foot')?{contactSurface:event.local[2]<0?'heel':'forefoot'}:{})};updateMatching(clip,event,updates);
   const delta=fit.center.clone().sub(oldCenter);fits.push({event:clone(event),fit,delta,centerLocal:surface.worldToLocal(event.bone,fit.center)});row.events.push({frame:event.frame,bone:event.bone,oldMarker,local:fit.local.toArray(),ballCenter:fit.center.toArray(),centerCorrectionMeters:delta.length(),...evidence});
  }
  const uniqueFits=fits.filter((f,i)=>!fits.slice(0,i).some(g=>Math.abs(g.event.time-f.event.time)<1e-8));
  const points=[];let maximumCorrection=0,maximumSpeed=0,maximumPenetration=0,maximumMissCorrection=0;
  for(let i=0;i<=Math.round(clip.duration*120);i++){
   const time=Math.min(clip.duration,i/120),surface=model.at(clip,time),source=new Vector3(...ballAt(oldMeta,time));let desired=source.clone().add(offsetAt(uniqueFits,time));
   const exact=uniqueFits.find(f=>Math.abs(f.event.time-time)<1e-8);
   if(/^dribble_/.test(clip.id)&&uniqueFits.length>=2&&time>uniqueFits.at(-1).event.time){const last=uniqueFits.at(-1),before=uniqueFits.at(-2),dt=last.event.time-before.event.time,velocity=last.fit.center.clone().sub(before.fit.center).multiplyScalar(1/dt);velocity.x=0;velocity.y=0;desired=last.fit.center.clone().addScaledVector(velocity,time-last.event.time);}

   const held=clip.ball.held??clip.ball.hold??(isPair&&clip.id!=='set_throw_in'?{start:fits[0].event.time,end:clip.duration,bone:'RightHand'}:clip.id==='set_throw_in'?{start:0,end:fits[0].event.time,bone:'RightHand'}:null);
   if(held&&fits.length){const start=held.start??fits[0].event.time,end=held.end??clip.duration;if(time>=start&&time<=end){const f=fits.find(f=>f.event.bone===held.bone)??fits[0];desired=surface.localToWorld(f.event.bone,f.centerLocal.toArray());}}
   desired.y=Math.max(radius,desired.y);let center=exact?exact.fit.center.clone():clearSphere(desired,surface,radius);
   // A deliberately missed tackle keeps a measurable positive skin gap.
   if(/miss/.test(clip.id)&&!events.length){const near=nearest(center,surface.triangles);if(near.distance<radius+.017){const result=clearSphere(center,surface,radius+.017,{margin:.00025});maximumMissCorrection=Math.max(maximumMissCorrection,result.distanceTo(center));center=result;}}
   const near=nearest(center,surface.triangles),penetration=inside(center,surface.triangles)?radius+near.distance:Math.max(0,radius-near.distance);maximumPenetration=Math.max(maximumPenetration,penetration);maximumCorrection=Math.max(maximumCorrection,center.distanceTo(source));if(points.length)maximumSpeed=Math.max(maximumSpeed,center.distanceTo(new Vector3(...points.at(-1).position))*120);points.push({time,position:center.toArray()});
  }
  clip.ball.samples=points;delete clip.ball.keys;clip.ball.sampleRateHz=120;for(const event of physicalEvents(clip)){if(event.distanceBasis==='horizontal-to-last-sample'||Number.isFinite(event.distanceMeters)){const p=ballAt(clip,event.time),target=points.at(-1).position;updateMatching(clip,event,{distanceMeters:Math.hypot(target[0]-p[0],target[2]-p[2]),targetPosition:[...target],distanceBasis:'horizontal-to-last-sample'});}}row.path={samples:points.length,maxClearanceCorrectionMeters:finite(maximumCorrection),maxMissExtraCorrectionMeters:finite(maximumMissCorrection),maxSkinPenetrationMeters:finite(maximumPenetration),maxBallSpeedMetersPerSecond:finite(maximumSpeed)};
  if(maximumPenetration>.005)row.failures.push({code:'path-skin-penetration',value:maximumPenetration});
  if(cacheFile)await fs.writeFile(cacheFile,JSON.stringify({clip,row}));report.clips.push(row);console.log(`calibrated ${clip.id}: ${events.length} true contacts, ${(maximumPenetration*1000).toFixed(3)}mm penetration, ${maximumSpeed.toFixed(2)}m/s max ball speed`);
 }
 demand(nativeBefore===JSON.stringify(data.clips.map(c=>c.frames)),'Calibration altered native joint motion');report.nativeMotionFramesUnchanged=true;report.pass=report.clips.every(c=>!c.failures.length);return {data,report};
}
/** Smooth only dribble presentation paths. Every calibrated event centre and
 * every native joint frame is a hard constraint. A cubic centre path receives
 * a continuous reference-forward sine envelope between surrounding contacts;
 * independent per-sample sideways collision pushes are never used here.
 */
export async function smoothDribbles(data){
 const original=JSON.stringify(data.clips.map(c=>c.frames)),report={license:'CC0-1.0',method:'Hard calibrated contact knots; cubic Hermite free-ball trajectory; consistent reference-forward clearance sine envelopes; actual skinned triangles at120Hz; no pose or event changes',samplingHz:120,clips:[]};
 for(const clip of data.clips.filter(c=>/^dribble_/.test(c.id))){
  const events=physicalEvents(clip),old=clone(clip.ball.samples),radius=clip.ball.radius??R,bytes=await fs.readFile(new URL(`runtime/clips/${clip.id}.glb`,base)),model=new SurfaceModel(decode(bytes)),D=clip.duration,N=Math.round(D*120);
  const rootPoint=(time,lead=.70)=>{const r=rootAt(clip,time),a=r.yaw*Math.PI/180;return new Vector3(r.position[0]+Math.sin(a)*lead,radius,r.position[2]+Math.cos(a)*lead);};
  const knots=[{time:0,p:rootPoint(0)},...events.map(e=>({time:e.time,p:new Vector3(...ballAt(clip,e.time))})),{time:D,p:rootPoint(D)}].sort((a,b)=>a.time-b.time).filter((k,i,a)=>!i||Math.abs(k.time-a[i-1].time)>1e-8);
  // Static feints already have a smooth free ball and no travelling gait.
  if(clip.id.includes('feint_')){report.clips.push({id:clip.id,unchanged:true,reason:'Stationary feint has no travelling ball correction'});continue;}
  for(let i=0;i<knots.length;i++){const a=knots[Math.max(0,i-1)],b=knots[Math.min(knots.length-1,i+1)];knots[i].v=b.p.clone().sub(a.p).multiplyScalar(1/(b.time-a.time));}
  const segmentAt=time=>{for(let i=1;i<knots.length;i++)if(time<=knots[i].time+1e-9)return i-1;return knots.length-2;};
  const basis=[],directions=[];
  for(let i=0;i<=N;i++){const time=i/120,k=segmentAt(time),a=knots[k],b=knots[k+1],dt=b.time-a.time,u=Math.max(0,Math.min(1,(time-a.time)/dt)),u2=u*u,u3=u2*u,p=a.p.clone().multiplyScalar(2*u3-3*u2+1).addScaledVector(a.v,(u3-2*u2+u)*dt).addScaledVector(b.p,-2*u3+3*u2).addScaledVector(b.v,(u3-u2)*dt);p.y=Math.max(radius,p.y);basis.push(p);const r=rootAt(clip,time),angle=r.yaw*Math.PI/180;directions.push(new Vector3(Math.sin(angle),0,Math.cos(angle)));}
  const heights=Array(knots.length-1).fill(0),envelope=(time,k=segmentAt(time))=>{const a=knots[k],b=knots[k+1],u=Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));return heights[k]*Math.sin(Math.PI*u);};
  let iterations=0;
  for(;iterations<5;iterations++){
   let changed=false;
   for(let i=0;i<=N;i++){
    const time=i/120,surface=model.at(clip,time),k=segmentAt(time),a=knots[k],b=knots[k+1],u=Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time))),sine=Math.sin(Math.PI*u),current=envelope(time,k),direction=directions[i],at=amount=>basis[i].clone().addScaledVector(direction,amount),clear=p=>p.y>=radius-1e-8&&nearest(p,surface.triangles).distance>=radius-.000002&&!inside(p,surface.triangles);
    if(clear(at(current)))continue;
    demand(sine>1e-6,`${clip.id}: protected contact or endpoint is not clear at${time}`);
    let lo=current,hi=null;for(let amount=current+.005;amount<=1.2;amount+=.005){if(clear(at(amount))){hi=amount;break;}lo=amount;}
    demand(hi!==null,`${clip.id}: reference-forward dribble clearance unavailable at${time}`);for(let j=0;j<18;j++){const mid=(lo+hi)/2;if(clear(at(mid)))hi=mid;else lo=mid;}
    heights[k]=Math.max(heights[k],(hi+.00015)/sine);demand(heights[k]<=1.2,`${clip.id}: clearance envelope exceeds1.2m`);changed=true;
   }
   if(!changed)break;
  }
  const points=[],row={id:clip.id,inputAssetSha256:hash(bytes),inputBallPathSha256:hash(JSON.stringify(old)),envelopes:heights.map((height,i)=>({start:knots[i].time,end:knots[i+1].time,maxForwardCorrectionMeters:height})),iterations:iterations+1};let penetration=0,maxSpeed=0,previous=null,previousVelocity=null,maxStep=0;
  for(let i=0;i<=N;i++){const time=i/120,surface=model.at(clip,time),p=basis[i].clone().addScaledVector(directions[i],envelope(time)),exact=knots.find(k=>Math.abs(k.time-time)<1e-8);if(exact)p.copy(exact.p);const hit=nearest(p,surface.triangles),within=inside(p,surface.triangles);penetration=Math.max(penetration,within?radius+hit.distance:Math.max(0,radius-hit.distance));if(previous){const velocity=p.clone().sub(previous).multiplyScalar(120);maxSpeed=Math.max(maxSpeed,velocity.length());if(previousVelocity&&!events.some(e=>Math.abs(e.time-time)<1/30+1e-9))maxStep=Math.max(maxStep,velocity.distanceTo(previousVelocity));previousVelocity=velocity;}points.push({time,position:p.toArray()});previous=p;}
  demand(penetration<=.005,`${clip.id}: smoothed path skin penetration${penetration}`);demand(maxStep<=2,`${clip.id}: smoothed off-contact velocity step${maxStep}m/s`);
  clip.ball.samples=points;clip.ball.sampleRateHz=120;
  let contactError=0;for(const event of events){const before=old.find(s=>Math.abs(s.time-event.time)<1e-8).position,after=ballAt(clip,event.time);contactError=Math.max(contactError,Math.hypot(...before.map((v,i)=>v-after[i])));if(event.distanceBasis==='horizontal-to-last-sample'||Number.isFinite(event.distanceMeters)){const target=points.at(-1).position;updateMatching(clip,event,{distanceMeters:Math.hypot(target[0]-after[0],target[2]-after[2]),targetPosition:[...target],distanceBasis:'horizontal-to-last-sample'});}}
  demand(contactError<1e-8,'Smoothing moved calibrated contact centre');Object.assign(row,{outputBallPathSha256:hash(JSON.stringify(points)),maxContactCenterChangeMeters:contactError,maxSkinPenetrationMeters:penetration,maxBallSpeedMetersPerSecond:maxSpeed,maxOffContactVelocityStepMetersPerSecond:maxStep});report.clips.push(row);console.log(`smoothed ${clip.id}: penetration${(penetration*1000).toFixed(4)}mm, speed${maxSpeed.toFixed(3)}m/s, off-contact velocity step${maxStep.toFixed(3)}m/s`);
 }
 demand(original===JSON.stringify(data.clips.map(c=>c.frames)),'Dribble smoothing changed native frames');report.nativeMotionFramesUnchanged=true;report.pass=true;return {data,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const bytes=await fs.readFile(new URL('runtime/motions.json',base)),data=JSON.parse(bytes),smoothing=process.argv.includes('--smooth-dribbles'),{report}=await (smoothing?smoothDribbles(data):calibrate(data));demand(hash(bytes)===hash(await fs.readFile(new URL('runtime/motions.json',base))),'Motion input changed during calibration');const output=JSON.stringify(data);report.sourceMotionSha256=hash(bytes);report.outputMotionSha256=hash(output);await fs.writeFile(new URL('runtime/motions.json',base),output);await fs.writeFile(new URL(smoothing?'verification/path-smoothing.json':'verification/contact-calibration.json',base),JSON.stringify(report,null,2)+'\n');if(!report.pass)process.exitCode=1;
}
