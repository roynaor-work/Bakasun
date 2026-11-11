/** CC0-1.0. Bake markers on real Draco-decoded skinned triangles.
 * Simultaneous two-hand cues share one sphere. Cue coordinates and held offsets
 * are derived from actual surfaces; no independent left/right ball centres. */
import {Vector3,Triangle,Quaternion,Ray} from '../runtime/vendor/three.module.js';
import {loadNativeGLTF} from '../verification/glb-reader.mjs';
import {point,unit,add} from './rig.mjs';
import {pathFor} from './ball-paths.mjs';
const R=.11;
function region(bone){if(bone.endsWith('Foot'))return new Set([bone,bone.replace('Foot','Leg')]);if(bone.endsWith('Hand'))return new Set([bone]);if(bone==='Chest')return new Set(['Chest','Spine']);if(bone==='Head')return new Set(['Head','Neck']);return new Set([bone]);}
function surface(meshes){const result=[],v=new Vector3();for(const mesh of meshes){mesh.skeleton.update();const g=mesh.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,vertices=[];for(let i=0;i<g.attributes.position.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);const weights={};for(let k=0;k<4;k++){const name=mesh.skeleton.bones[si.getComponent(i,k)]?.name;if(name)weights[name]=(weights[name]||0)+sw.getComponent(i,k);}vertices.push({p:v.clone(),weights});}const count=g.index?.count??vertices.length;for(let i=0;i<count;i+=3){const vs=[0,1,2].map(k=>vertices[g.index?g.index.getX(i+k):i+k]);result.push({tri:new Triangle(...vs.map(v=>v.p)),weights:vs.map(v=>v.weights),mesh:mesh.uuid,solid:!/(Hair|Eye)/i.test(mesh.material?.name||'')});}}return result;}
function regional(s,names){return s.filter(t=>{const ws=t.weights.map(w=>[...names].reduce((n,name)=>n+(w[name]||0),0));return Math.max(...ws)>=.5||ws.reduce((a,b)=>a+b,0)/3>=.25;});}
function nearest(p,s){let distance=Infinity,hit,point;const q=new Vector3();for(const t of s){t.tri.closestPointToPoint(p,q);const d=p.distanceToSquared(q);if(d<distance){distance=d;hit=t;point=q.clone();}}return {distance:Math.sqrt(distance),hit,point};}
function singleSphere(seed,skin,regionSkin,normal,preferDirection=false,pointConstraint){
 const near=nearest(seed,regionSkin),intended=unit(normal||[0,0,1]);let best;
 for(const directionArray of [intended,unit(add(intended,[.4,.15,0])),unit(add(intended,[-.4,.15,0])),unit(add(intended,[0,.6,0])),[1,0,0],[-1,0,0],[0,1,0],[0,0,-1],unit([1,.3,1]),unit([-1,.3,1])]){
  const base=near.point.clone();base.y=Math.max(R,base.y);const direction=new Vector3(...directionArray);let lo=0,hi=.75;
  if(nearest(base.clone().addScaledVector(direction,hi),skin).distance<R)continue;
  let collision=false,previous=hi;for(let t=hi-.015;t>=-.001;t-=.015){if(nearest(base.clone().addScaledVector(direction,Math.max(0,t)),skin).distance<R){lo=Math.max(0,t);hi=previous;collision=true;break;}previous=t;}
  if(!collision)continue;
  for(let i=0;i<26;i++){const mid=(lo+hi)/2;if(nearest(base.clone().addScaledVector(direction,mid),skin).distance<R)lo=mid;else hi=mid;}
  const center=base.clone().addScaledVector(direction,hi),hit=nearest(center,skin),regional=nearest(center,regionSkin);if(center.y<R-1e-8||regional.distance>R+.0001||signedNearest(center,skin).signed<-.0005||pointConstraint&&!pointConstraint(regional.point))continue;
  const cost=center.distanceTo(seed);if(!best||cost<best.cost)best={center,hit,cost};if(preferDirection)return best;
 }
 return best;
}
function sharedSphere(seeds,skin,regions,preferred){
 const middle=seeds.reduce((s,p)=>s.add(p),new Vector3()).multiplyScalar(1/seeds.length);let best;
 for(const offset of (preferred?[[0,0,0],[0,0,.04],[0,0,-.04],[0,0,.1],[0,0,-.1],[0,.1,0],[0,-.1,0],[.05,0,0],[-.05,0,0]]:[[0,0,.1],[0,0,.16],[0,.05,.1],[0,-.05,.1],[0,.1,0],[0,-.1,0],[0,0,.04],[0,0,-.1]])){
  const center=(preferred||middle).clone().add(new Vector3(...offset));center.y=Math.max(R,center.y);
  for(let iteration=0;iteration<65;iteration++){
   const near=regions.map(s=>nearest(center,s)),res=near.map(n=>n.distance-R),normals=near.map(n=>center.clone().sub(n.point).normalize());
   if(Math.max(...res.map(Math.abs))<.00001)break;
   let delta=new Vector3();
   if(near.length===2){const k=normals[0].dot(normals[1]),det=Math.max(.00001,1-k*k),a=(-res[0]+k*res[1])/det,b=(-res[1]+k*res[0])/det;delta.addScaledVector(normals[0],a).addScaledVector(normals[1],b);}
   else for(let i=0;i<near.length;i++)delta.addScaledVector(normals[i],-res[i]/near.length);
   if(delta.length()>.04)delta.multiplyScalar(.04/delta.length());center.addScaledVector(delta,.8);center.y=Math.max(R,center.y);
  }
  const hits=regions.map(s=>nearest(center,s)),whole=nearest(center,skin),error=Math.max(...hits.map(h=>Math.abs(h.distance-R))),overlap=Math.max(0,R-whole.distance),cost=center.distanceTo(preferred||middle);
  if(error<.002&&overlap<.002&&signedNearest(center,skin).signed>=-.0005&&(!best||cost<best.cost))best={center,hit:whole,cost,error};
 }
 return best;
}
export async function calibrate(motions,sources){const diagnostics=[];for(const role of ['field','keeper']){
 const gltf=await loadNativeGLTF(sources[role]),scene=gltf.scene,nodes=new Map(),meshes=[];scene.traverse(o=>{if(o.isBone)nodes.set(o.name,o);if(o.isSkinnedMesh)meshes.push(o);});
 for(const motion of motions.filter(m=>m.metadata.role===role)){
  const groups=new Map();for(const e of motion.metadata.events){const f=motion.frames[Math.round(e.time*30)];e.position=point(f,e.bone,e.local);if(['contact','release'].includes(e.type)){const key=e.time.toFixed(8);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}}
  for(const group of groups.values()){
   const f=motion.frames[Math.round(group[0].time*30)];for(const[name,bone]of nodes)bone.quaternion.fromArray(f.rotations[name].map(Math.fround));nodes.get('Hips').position.fromArray(f.hips.map(Math.fround));scene.updateMatrixWorld(true);
   const skin=surface(meshes),unique=[...new Map(group.map(e=>[e.bone,e])).values()],regions=unique.map(e=>regional(skin,region(e.bone))),seeds=unique.map(e=>new Vector3(...e.position)),twoHands=unique.length===2&&unique.every(e=>e.bone.endsWith('Hand'));
   const toeStrike=unique.length===1&&unique[0].bone.endsWith('Foot')&&(/dribble/.test(motion.metadata.id)||motion.d.ballKind==='kick'),side=/^first_touch_inside_/.test(motion.metadata.id)?1:/^first_touch_outside_/.test(motion.metadata.id)?-1:0,footMatrix=nodes.get(unique[0].bone).matrixWorld,normal=side?new Vector3(side,0,0).transformDirection(footMatrix).toArray():toeStrike?new Vector3(0,0,1).transformDirection(footMatrix).toArray():unique[0].normal,footInverse=side?footMatrix.clone().invert():null,sideConstraint=side?p=>p.clone().applyMatrix4(footInverse).x*side>.02:undefined;
   const throwPreference=twoHands&&motion.metadata.id==='throw_in'?seeds.reduce((s,p)=>s.add(p),new Vector3()).multiplyScalar(1/seeds.length).add(new Vector3(0,.08,group.some(e=>e.type==='release')?.10:.02)):undefined;
   const result=twoHands?sharedSphere(seeds,skin,regions,throwPreference):singleSphere(seeds[0],skin,regions[0],normal,toeStrike||!!side,sideConstraint);
   if(!result)throw Error(`${motion.metadata.id}/${group[0].time}: ${twoHands?'no shared sphere fits both actual gloves':'effector hidden by another body region'}`);
   for(const e of group){const regionSkin=regions[unique.findIndex(u=>u.bone===e.bone)],near=nearest(result.center,regionSkin),bone=nodes.get(e.bone),inverse=bone.matrixWorld.clone().invert();
    e.local=near.point.clone().applyMatrix4(inverse).toArray();e.position=near.point.toArray();e.center=result.center.toArray();e.centerLocal=result.center.clone().applyMatrix4(inverse).toArray();e.normal=result.center.clone().sub(near.point).normalize().toArray();
    diagnostics.push({id:motion.metadata.id,time:e.time,type:e.type,bone:e.bone,sharedSphere:twoHands,sphereSurfaceError:Math.abs(near.distance-R),wholeBodyPenetration:Math.max(0,R-result.hit.distance),seedAdjustment:result.cost,position:e.position,center:e.center});
   }
  }
  await bakePath(motion,scene,nodes,meshes);
 }
 for(const mesh of meshes){mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();}
 }return diagnostics;}


function valueAt(keys,t){if(t<=keys[0].time)return [...keys[0].position];for(let i=1;i<keys.length;i++)if(t<=keys[i].time){const a=keys[i-1],b=keys[i],u=(t-a.time)/(b.time-a.time);return a.position.map((v,j)=>v+(b.position[j]-v)*u);}return [...keys.at(-1).position];}
function poseNative(motion,nodes,scene,time){const f=time*30,i=Math.min(motion.frames.length-2,Math.floor(f)),u=Math.max(0,Math.min(1,f-i)),a=motion.frames[i],b=motion.frames[i+1];for(const[name,bone]of nodes){bone.quaternion.fromArray(a.rotations[name].map(Math.fround)).slerp(new Quaternion(...b.rotations[name].map(Math.fround)),u);if(name==='Hips')bone.position.fromArray(a.hips.map((v,j)=>Math.fround(v)+(Math.fround(b.hips[j])-Math.fround(v))*u));}scene.updateMatrixWorld(true);}
function signedNearest(center,skin){const hit=nearest(center,skin),ray=new Ray(center,new Vector3(.017,.023,1).normalize()),intersections=new Map(),p=new Vector3();for(const entry of skin){if(!entry.solid)continue;const q=ray.intersectTriangle(entry.tri.a,entry.tri.b,entry.tri.c,false,p);if(q){const d=center.distanceTo(q);if(d<1e-7)continue;if(!intersections.has(entry.mesh))intersections.set(entry.mesh,[]);intersections.get(entry.mesh).push(d);}}let inside=false;for(const distances of intersections.values()){distances.sort((a,b)=>a-b);let count=0,previous=-Infinity;for(const d of distances)if(d-previous>1e-5){count++;previous=d;}if(count%2)inside=true;}hit.signed=inside?-hit.distance:hit.distance;return hit;}
function frontClearance(center,skin){const original=signedNearest(center,skin);if(original.distance>=R-.0005&&original.signed>=-.0005)return 0;const direction=new Vector3(0,0,1);let lo=0,hi=1.1,previous=hi;for(let t=hi-.015;t>=-.001;t-=.015){const h=signedNearest(center.clone().addScaledVector(direction,Math.max(0,t)),skin);if(h.distance<R||h.signed<0){lo=Math.max(0,t);hi=previous;break;}previous=t;}for(let i=0;i<22;i++){const mid=(lo+hi)/2,h=signedNearest(center.clone().addScaledVector(direction,mid),skin);if(h.distance<R+.0005||h.signed<0)lo=mid;else hi=mid;}return hi;}
async function bakePath(motion,scene,nodes,meshes){
 const {metadata:m,d}=motion,initial=pathFor(motion);if(!m.events.some(e=>e.type==='contact')){motion.bakedBall=initial;return;}
 const timeSet=new Set([...Array.from({length:Math.round(m.duration*120)+1},(_,i)=>i/120),...m.events.filter(e=>['contact','release'].includes(e.type)).map(e=>e.time)]),times=[...timeSet].sort((a,b)=>a-b),events=m.events.filter(e=>['contact','release'].includes(e.type)),contactTime=Math.min(...events.filter(e=>e.type==='contact').map(e=>e.time)),releaseEvents=events.filter(e=>e.type==='release'),releaseTime=releaseEvents.length?Math.max(...releaseEvents.map(e=>e.time)):m.duration;
 const held=(!releaseEvents.length&&d.ballKind==='catch')||['throw','roll','receive'].includes(d.ballKind),heldEvents=events.filter(e=>e.type==='contact'&&Math.abs(e.time-contactTime)<1e-7),heldBones=[...new Set(heldEvents.map(e=>e.bone))];
 const keys=[],required=[],protectedCue=[],isHeld=[];let previous,previousMid;
 for(const time of times){poseNative(motion,nodes,scene,time);const desired=new Vector3(...valueAt(initial.keys,time)),cue=events.some(e=>Math.abs(e.time-time)<1e-7),holds=held&&time>=contactTime-1e-7&&time<=releaseTime+1e-7;let center=desired.clone(),need=0;
  if(holds&&!cue){const skin=surface(meshes),regions=heldBones.map(b=>regional(skin,region(b))),mid=heldBones.reduce((s,b)=>s.add(nodes.get(b).getWorldPosition(new Vector3())),new Vector3()).multiplyScalar(1/heldBones.length),prediction=previous&&previousMid?previous.clone().add(mid.clone().sub(previousMid)):desired.clone(),preferred=prediction.lerp(desired,.25);
   if(m.id==='throw_in'){const target=mid.clone().add(new Vector3(0,.08,.02)),releaseCenter=releaseEvents.reduce((s,e)=>s.add(new Vector3(...e.center)),new Vector3()).multiplyScalar(1/releaseEvents.length),u=Math.max(0,Math.min(1,(time-releaseTime+.28)/.28));const goal=target.lerp(releaseCenter,u*u*(3-2*u)),nudge=goal.sub(prediction);if(nudge.length()>.008)nudge.multiplyScalar(.008/nudge.length());preferred.copy(prediction).add(nudge);}
   let fit;if(heldBones.length===2&&heldBones.every(b=>b.endsWith('Hand'))){fit=sharedSphere(heldBones.map((b,i)=>nearest(preferred,regions[i]).point),skin,regions,preferred);}else{const near=nearest(preferred,regions[0]);fit=singleSphere(preferred,skin,regions[0],preferred.clone().sub(near.point).toArray());}
   if(!fit)throw Error(`${m.id}/${time}: held sphere cannot stay on the authored effector(s)`);center=fit.center;previousMid=mid;previous=center.clone();
  }else if(holds){previous=center.clone();previousMid=heldBones.reduce((s,b)=>s.add(nodes.get(b).getWorldPosition(new Vector3())),new Vector3()).multiplyScalar(1/heldBones.length);}
  else if(!cue){const hips=nodes.get('Hips').getWorldPosition(new Vector3());if(center.distanceTo(hips)<1.8){need=frontClearance(center,surface(meshes));}}
  keys.push({time,position:center.toArray()});required.push(need);protectedCue.push(cue||holds);isHeld.push(holds);
 }
 // Spread free-ball clearance over neighbouring samples with a bounded added
 // velocity, fixing exact cue centres. The envelope anticipates an obstacle;
 // it never inserts a one-frame correction spike at a touch.
 let slope=2,shifts;for(;slope<=20;slope+=1){shifts=times.map((t,i)=>Math.max(0,...required.map((v,j)=>{let dt=Math.abs(t-times[j]);if(m.loop)dt=Math.min(dt,m.duration-dt);return v-slope*dt;})));if(shifts.every((v,i)=>!protectedCue[i]||v<.0005))break;}
 if(slope>20)throw Error(`${m.id}: free ball needs an implausible >20m/s avoidance impulse near a fixed cue: ${JSON.stringify(times.map((time,i)=>({time,need:required[i],held:isHeld[i],cue:protectedCue[i],shift:shifts[i],position:keys[i].position})).filter((r,i)=>r.need>.1||r.cue&&r.shift>.0005).slice(-6))}`);
 for(let i=0;i<keys.length;i++)if(!protectedCue[i])keys[i].position[2]+=shifts[i];
 if(m.loop)keys.at(-1).position=[...keys[0].position];
 if(keys.some(k=>k.position[1]<R-1e-8))throw Error(`${m.id}: calibrated sphere crosses the floor`);
 let penetration=0,heldError=0,largestStep=0;for(let i=0;i<keys.length;i++){const key=keys[i];poseNative(motion,nodes,scene,key.time);const center=new Vector3(...key.position),hips=nodes.get('Hips').getWorldPosition(new Vector3());if(center.distanceTo(hips)<1.8){const skin=surface(meshes),hit=signedNearest(center,skin),overlap=hit.signed<0?R+hit.distance:Math.max(0,R-hit.distance);penetration=Math.max(penetration,overlap);if(isHeld[i])for(const bone of heldBones)heldError=Math.max(heldError,Math.abs(nearest(center,regional(skin,region(bone))).distance-R));}if(i)largestStep=Math.max(largestStep,center.distanceTo(new Vector3(...keys[i-1].position))/(key.time-keys[i-1].time));}
 motion.ballAudit={id:m.id,samples:keys.length,rateHz:120,maximumSkinPenetrationM:penetration,maximumHeldSurfaceErrorM:heldError,maximumNativeSpeedMps:largestStep,clearanceVelocityBoundMps:slope,maxForwardCorrectionM:Math.max(...shifts)};
 if(penetration>.0021)throw Error(`${m.id}: baked ball intersects actual skin by ${penetration}m`);
 if(heldError>.003)throw Error(`${m.id}: held ball loses physical effector contact by ${heldError}m`);
 motion.bakedBall={radius:R,keys};
 console.log(`ball ${m.id}: ${keys.length} skin samples, ${(penetration*1000).toFixed(3)}mm penetration, ${(heldError*1000).toFixed(3)}mm held gap`);
}
