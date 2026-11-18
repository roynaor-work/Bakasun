// racing-v24.4 (Roy after v24.3 on the phone: "there is still no real change of the wheels"): the Codex pit stop sequence v2 (design/racing-pit-sequence-v2, CC0;
// assets/racing-pit-seq-v2) at the player's box instead of the v1 crew. Four wheel changers each loosen the nut with the gun, pull the old wheel off its hub, drop it
// on their rack, take a new wheel from the other rack, put it on the hub and tighten it; two jack operators lift the car 16 cm and lower it; the front one raises a
// hand; the exit light turns green. The choreography, the attachment windows and the two-bone arm reach are the package's preview (src/preview.mjs) ported to the
// game: everything is computed in the box frame (the group `root` is put at the origin for the solve and back at the box for drawing), the car of the sequence is a
// frame inside the root that carries the four hubs, and the player's real car is lifted by the same amount while its own wheels are hidden (from the stop to the
// release; before and after, its own wheels drive).
// Game time -> sequence time (racing-pit.mjs with config.pitSeq): the last 6 m before the box = 'enter' (0 .. 0.38), the stop (0.1 s) = 'stop' (0.38 .. 0.46), the
// change (PIT_SEQ.change s) = 'jack_up' .. 'signal' (0.46 .. 2.30), the leave phase = 'exit' (2.30 .. 2.88). ?racingPitSeq=0 keeps the v1 crew (racing-pit-crew.mjs).
import {clone as cloneSkinned} from '../vendor/SkeletonUtils.js';
import {samplePitSequence,validateSequence} from './racing-pit-sequence.mjs?v=island-v2-20261107-19';
import {pitLane} from './racing-v24.mjs?v=island-v2-20261107-19';
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export const pitSeqEnabled=search=>read(search).get('racingPitSeq')!=='0';
const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp01(v);return t*t*(3-2*t);};
const phaseOf=(t,a,b)=>smooth((t-a)/(b-a));
/** Game pit phase -> sequence seconds (null: no crew to show). Pure, for the tests. */
export function seqTime(pit,{toBox=Infinity,change=2.4,stop=.1}={}){
 const ph=pit?.phase;if(!ph)return null;
 if(ph==='lane')return toBox<6?.38*clamp01(1-toBox/6):toBox<30?0:null;
 if(ph==='stop')return .38+.08*clamp01((pit.t||0)/Math.max(.01,stop));
 if(ph==='change')return .46+1.84*clamp01((pit.t||0)/Math.max(.1,pit.dur||change));
 if(ph==='leave')return Math.min(2.88,2.30+(pit.t||0)*.77);
 return null;
}
export async function loadPitSeq({T,GLTFLoader,track,lane=pitLane(track),boxIndex=0,count=12,team='#d93228',keep=x=>x,car,
 base=new URL('../assets/racing-pit-seq-v2/',import.meta.url),crewBase=new URL('../assets/racing-pit-v1/models/',import.meta.url),version='island-v2-20261107-19',fetchFn=globalThis.fetch}){
 if(!car||!car.body||!Array.isArray(car.wheels))throw new Error('pit seq: no player car');
 const realWheels=new Map(car.wheels.map(w=>[w.name,w]));
 const config=await (await fetchFn(new URL(`sequence.json?v=${version}`,base).href)).json();
 const check=validateSequence(config);if(!check.valid)throw new Error('pit seq: '+check.errors[0]);
 for(const w of config.wheels)if(!realWheels.has(w.carNode))throw new Error('pit seq: car has no '+w.carNode);
 const loader=new GLTFLoader(),load=url=>loader.loadAsync(url.href);
 const crewUrl=name=>new URL(`${name}.glb?v=${version}`,crewBase),seqUrl=name=>new URL(`${name}.glb?v=${version}`,base);
 const modelOf=def=>def.model.split('/').pop().replace(/\.glb$/,'');
 const names=[...new Set(config.actors.map(modelOf))];
 const [clipsGltf,models,jackGltf,spareGltf,gunGltf,lightGltf]=await Promise.all([load(seqUrl('pit-actions')),Promise.all(names.map(n=>load(crewUrl(n)))),load(seqUrl('jack')),load(seqUrl('spare_wheel')),load(seqUrl('wheel_gun')),load(crewUrl('pit_light_exit'))]);
 const byModel=new Map(names.map((n,i)=>[n,models[i]])),clips=clipsGltf.animations;
 const V=a=>new T.Vector3(a[0],a[1],a[2]),Y=new T.Vector3(0,1,0),DOWN=new T.Vector3(0,-1,0),X=new T.Vector3(1,0,0),IDENTITY=new T.Quaternion();
 const root=new T.Group();root.name='racing-pit-seq';root.visible=false;
 const own=o=>{o.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;keep(n.geometry);for(const m of [].concat(n.material))keep(m);}});return o;};
 const mats=new Map(),material=(color,roughness=.7,metalness=0)=>{const k=`${color}/${roughness}/${metalness}`;if(!mats.has(k))mats.set(k,keep(new T.MeshStandardMaterial({color,roughness,metalness})));return mats.get(k);};
 const mesh=(parent,geometry,mat,p=[0,0,0])=>{const o=new T.Mesh(keep(geometry),mat);o.position.set(p[0],p[1],p[2]);o.castShadow=o.receiveShadow=true;parent.add(o);return o;};
 const box=(parent,size,p,color,r=.8,m=0)=>mesh(parent,new T.BoxGeometry(size[0],size[1],size[2]),material(color,r,m),p);
 const teamLinear=new T.Color(team).convertSRGBToLinear();
 // the racks of the old and the new wheels (the package's ground geometry), one per station
 for(const w of config.wheels){const r=w.radiusMeters,h=w.newRack[1]-r-.0405;
  box(root,[.46,.025,.76],[w.newRack[0],w.newRack[1]-r-.028,w.newRack[2]],'#355d5c');
  for(const x of [-.17,.17])for(const z of [-.28,.28])box(root,[.035,h,.035],[w.newRack[0]+x,h/2,w.newRack[2]+z],'#355d5c');
  box(root,[.46,.015,.86],[w.oldRack[0],.002,w.oldRack[2]],'#7f8d81');}
 // the car of the sequence: a frame in the box at the car's place; it carries the four hubs (the old wheel until it is pulled, the new one from its mounting)
 const carFrame=new T.Group();carFrame.name='SeqCar';root.add(carFrame);
 const actors=new Map();
 for(const def of config.actors){const src=byModel.get(modelOf(def)).scene,obj=own(cloneSkinned(src));obj.name='Actor/'+def.id;root.add(obj);
  obj.traverse(n=>{if(!n.isMesh)return;const mask=n.geometry.attributes._team_mask||n.geometry.attributes._TEAM_MASK,col=n.geometry.attributes.color;if(!mask||!col)return;n.geometry=keep(n.geometry.clone());const c=n.geometry.attributes.color;for(let k=0;k<c.count;k++)if(mask.getX(k)>.5)c.setXYZ(k,teamLinear.r,teamLinear.g,teamLinear.b);c.needsUpdate=true;});
  const bones={};obj.traverse(o=>{if(o.isBone)bones[o.name]=o;});actors.set(def.id,{id:def.id,def,root:obj,bones,clip:null});}
 const nut=(parent,sign)=>{const o=mesh(parent,new T.CylinderGeometry(.055,.055,.034,6),material('#d4ded8',.22,.9),[sign*.169,0,0]);o.rotation.z=Math.PI/2;return o;};
 const wheels=[];
 for(const def of config.wheels){const real=realWheels.get(def.carNode),sign=Math.sign(def.hub[0]);
  const hub=new T.Group();hub.name='Hub/'+def.id;hub.position.copy(real.position);carFrame.add(hub);
  const old=real.clone(true);old.name=def.oldId;old.position.set(0,0,0);old.rotation.set(0,0,0);old.traverse(o=>{if(o.isMesh&&o.geometry?.type==='CircleGeometry')o.visible=false;});hub.add(old);   // the motion-blur disc stays on the car
  const fresh=new T.Group();fresh.name=def.newId;const geo=own(spareGltf.scene.clone(true));geo.scale.setScalar(def.radiusMeters/.34);fresh.add(geo);
  const oldNut=nut(old,sign),newNut=nut(fresh,sign),actor=actors.get(def.actor),gun=own(gunGltf.scene.clone(true));gun.name='Gun/'+def.id;
  const holster=new T.Group();holster.name='Holster/'+def.id;holster.position.set(-.24,.01,-.035);holster.rotation.x=-Math.PI/2;actor.bones.Hips.add(holster);
  wheels.push({def,actor,sign,hub,old,fresh,gun,holster,oldNut,newNut,real,contact:false});}
 const jacks=[];
 for(const id of ['front','rear']){const def=config.props.attachments.find(a=>a.id==='jack_'+id),obj=own(jackGltf.scene.clone(true));obj.name='Jack/'+id;obj.rotation.y=def.yaw;root.add(obj);
  const handle=obj.getObjectByName('Handle');handle.position.z=def.handleAdjustment.localPositionZ;
  box(obj,[.048,.04,def.handleAdjustment.extensionMeters],[0,.13,(-.24+handle.position.z)/2],'#839c9a',.3,.8);
  const arm=obj.getObjectByName('LiftArm');if(arm)arm.visible=false;
  const piston=mesh(obj,new T.CylinderGeometry(.033,.033,1,10),material('#b5c8c2',.25,.8)),links=[-1,1].map(()=>mesh(obj,new T.BoxGeometry(.035,1,.035),material('#238b82',.45,.3)));
  const pad=obj.getObjectByName('LiftPad');if(id==='rear')pad.scale.set(.5,1,.5);
  jacks.push({id,def,root:obj,rest:V(def.position),pad,handle,piston,links});}
 const exitLight=own(lightGltf.scene.clone(true));exitLight.position.set(2.8,0,2.6);exitLight.rotation.y=.4;root.add(exitLight);
 const lampMats={};exitLight.traverse(o=>{if(o.isMesh&&/^Lamp/.test(o.name)){o.material=keep(o.material.clone());lampMats[o.name.slice(4).toLowerCase()]=o.material;}});
 let lampState='';const lamp=state=>{if(state===lampState)return;lampState=state;for(const [name,m] of Object.entries(lampMats)){m.color?.set(name===state?'#f4fff3':'#45606a');m.emissive?.set({red:'#f05243',amber:'#ffc557',green:'#6bffd0'}[name]||'#000');m.emissiveIntensity=name===state?3.1:.01;}};lamp('red');

 // ---- the solve (the package preview, in the box frame: `root` is at the origin while it runs, so a world point is a box-frame point)
 const local=(o,parent,p,q=IDENTITY)=>{if(o.parent!==parent)parent.add(o);o.position.copy(p);o.quaternion.copy(q);o.updateMatrixWorld(true);};
 const world=(o,p,q=IDENTITY)=>local(o,root,p,q);
 const worldPoint=(o,p=[0,0,0])=>o.localToWorld(V(p));
 const worldQuaternion=o=>o.getWorldQuaternion(new T.Quaternion());
 let current=null;
 function sampleActor(actor,spec){
  const clip=clips.find(c=>c.name===spec.clip);if(!clip)return;
  actor.samples??=new Map();
  if(!actor.samples.has(spec.clip))actor.samples.set(spec.clip,clip.tracks.map(track=>{const at=track.name.lastIndexOf('.'),bone=track.name.slice(0,at),property=track.name.slice(at+1);
   const target=actor.bones[bone]??actor.root.getObjectByName(bone);return target&&['position','quaternion','scale'].includes(property)?{target,property,interpolant:track.createInterpolant()}:null;}).filter(Boolean));
  const time=Math.max(0,Math.min(clip.duration,spec.clipTime));
  for(const s of actor.samples.get(spec.clip))s.target[s.property].fromArray(s.interpolant.evaluate(time));
  actor.poseDeltas??=Object.entries(actor.def.poseAdjustment?.bones??{}).map(([bone,d])=>({bone,q:new T.Quaternion().setFromEuler(new T.Euler(d[0],d[1],d[2]))}));
  for(const d of actor.poseDeltas)actor.bones[d.bone]?.quaternion.multiply(d.q).normalize();
  actor.authored={};for(const n of ['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'])actor.authored[n]=actor.bones[n].quaternion.clone();
  actor.root.position.copy(V(actor.def.position));actor.root.rotation.set(0,actor.def.yaw,0);actor.root.updateMatrixWorld(true);
  actor.authoredWorldHands={Left:worldQuaternion(actor.bones.LeftHand),Right:worldQuaternion(actor.bones.RightHand)};
 }
 // the package's analytic two-bone reach (no limb scaling)
 function arm(actor,side,target,handQ=IDENTITY){
  const upper=actor.bones[side+'Arm'],fore=actor.bones[side+'ForeArm'],hand=actor.bones[side+'Hand'];
  const shoulder=worldPoint(upper),delta=target.clone().sub(shoulder),distance=delta.length(),l1=fore.position.length(),l2=hand.position.length();
  const d=Math.max(1e-5,Math.min(l1+l2-1e-6,distance)),dir=delta.normalize(),signed=side==='Left'?1:-1;
  const lateral=new T.Vector3(signed,0,0).applyQuaternion(worldQuaternion(actor.bones.Root));
  const pole=lateral.multiplyScalar(.85).add(new T.Vector3(0,.25,0)),perp=pole.addScaledVector(dir,-pole.dot(dir));
  if(perp.lengthSq()<1e-5)perp.set(0,1,0).addScaledVector(dir,-dir.y);perp.normalize();
  const a=(l1*l1-l2*l2+d*d)/(2*d),h=Math.sqrt(Math.max(0,l1*l1-a*a)),elbow=shoulder.clone().addScaledVector(dir,a).addScaledVector(perp,h);
  upper.quaternion.copy(worldQuaternion(upper.parent).invert().multiply(new T.Quaternion().setFromUnitVectors(DOWN,elbow.clone().sub(shoulder).normalize())));upper.updateMatrixWorld(true);
  const realElbow=worldPoint(fore);fore.quaternion.copy(worldQuaternion(fore.parent).invert().multiply(new T.Quaternion().setFromUnitVectors(DOWN,target.clone().sub(realElbow).normalize())));fore.updateMatrixWorld(true);
  hand.quaternion.copy(worldQuaternion(hand.parent).invert().multiply(handQ));hand.updateMatrixWorld(true);
 }
 function wheelCenter(w,t){
  const s=w.sign,hub=V(w.def.hub).add(new T.Vector3(0,.16,0)),high=w.def.radiusMeters+.5*9.81*.16*.16;
  if(t<1.08)return hub.lerp(new T.Vector3(s*1.25,high,w.def.hub[2]+s*.12),phaseOf(t,.90,1.08));
  if(t<1.24){const dt=t-1.08,from=new T.Vector3(s*1.25,high,w.def.hub[2]+s*.12);from.lerp(V(w.def.oldRack),clamp01(dt/.16));from.y=w.def.radiusMeters+.5*9.81*(.16*.16-dt*dt);return from;}
  if(t<1.6)return V(w.def.newRack).lerp(hub,phaseOf(t,1.24,w.def.events.mounted));
  return hub;
 }
 function wheelHands(w,center,q,obj){
  arm(w.actor,'Left',center.clone().add(new T.Vector3(w.sign*.145,0,w.sign*.24).applyQuaternion(q)),q);
  if(obj){local(obj,w.actor.bones.LeftHand,new T.Vector3(-w.sign*.145,0,-w.sign*.24),IDENTITY);center=worldPoint(obj);}
  arm(w.actor,'Right',center.clone().add(new T.Vector3(w.sign*.145,0,-w.sign*.24).applyQuaternion(q)),q);
 }
 const gunInHand=(w,socket,q)=>{arm(w.actor,'Right',socket.clone().sub(V([0,0,.28]).applyQuaternion(q)).add(V([0,-.07,-.02]).applyQuaternion(q)),q);local(w.gun,w.actor.bones.RightHand,V([0,.07,.02]));};
 const gunHolster=w=>local(w.gun,w.holster,new T.Vector3());
 function toolMotion(w,t){
  const hub=t<.38?V(w.def.hub).add(new T.Vector3(0,current.car.liftMeters,0)):worldPoint(w.hub),socket=hub.clone().add(new T.Vector3(w.sign*.17,0,0));
  const useQ=new T.Quaternion().setFromAxisAngle(Y,-w.sign*Math.PI/2),parked=worldPoint(w.holster,[0,0,.28]),parkedQ=worldQuaternion(w.holster);w.contact=false;
  if(t<.80){const q=useQ.clone(),target=socket.clone(),ready=new T.Vector3(w.sign*1.15,.79,w.def.hub[2]-w.sign*.16);
   if(t<.46)target.copy(ready);else if(t<.66)target.copy(ready).lerp(socket,phaseOf(t,.46,.66));
   if(t>=.74){const f=clamp01((t-.74)/.06);target.lerp(parked,f);q.slerp(parkedQ,f);}
   w.contact=t>=.66&&t<=.74;gunInHand(w,target,q);}
  else if(t<1.62)gunHolster(w);
  else if(t<1.88){const target=socket.clone(),q=useQ.clone();
   if(t<1.69){const f=phaseOf(t,1.62,1.69);target.copy(parked).lerp(socket,f);q.copy(parkedQ).slerp(useQ,f);}
   if(t>1.81){const f=phaseOf(t,1.81,1.88);target.lerp(parked,f);q.slerp(parkedQ,f);}
   w.contact=t>=1.69&&t<=1.81;gunInHand(w,target,q);}
  else gunHolster(w);
 }
 function composeWheel(w,t){
  const def=w.def,actor=w.actor,hub=worldPoint(w.hub),ev=def.events;
  if(t<ev.detach){local(w.old,w.hub,new T.Vector3());
   if(t>=.74){const f=clamp01((t-.74)/.16),target=hub.clone().add(new T.Vector3(w.sign*.145,0,w.sign*.24));arm(actor,'Left',worldPoint(actor.bones.LeftHand).lerp(target,f),worldQuaternion(actor.bones.LeftHand).slerp(IDENTITY,f));
    for(const n of ['LeftArm','LeftForeArm','LeftHand'])actor.bones[n].quaternion.slerp(actor.authored[n],1-f);actor.root.updateMatrixWorld(true);}
   if(t>=.80){const parked=worldPoint(w.holster,[0,-.07,-.02]),f=clamp01((t-.80)/.10);arm(actor,'Right',parked.lerp(hub.clone().add(new T.Vector3(w.sign*.145,0,-w.sign*.24)),f),worldQuaternion(w.holster).slerp(IDENTITY,f));}}
  else if(t<ev.oldReleased)wheelHands(w,wheelCenter(w,t),IDENTITY,w.old);
  else if(t<ev.newGripped)world(w.old,wheelCenter(w,t),new T.Quaternion().setFromAxisAngle(X,-(t-ev.oldReleased)*3*w.sign));
  else world(w.old,V(def.oldRack),new T.Quaternion().setFromAxisAngle(X,-.48*w.sign));
  if(t<ev.newGripped)world(w.fresh,V(def.newRack));
  else if(t<ev.mounted)wheelHands(w,wheelCenter(w,t),IDENTITY,w.fresh);
  else{local(w.fresh,w.hub,new T.Vector3());if(t<1.88)arm(actor,'Left',hub.clone().add(new T.Vector3(w.sign*.145,0,w.sign*.24)),IDENTITY);}
  if(t>=ev.oldReleased&&t<ev.newGripped)wheelHands(w,wheelCenter(w,ev.oldReleased).lerp(V(def.newRack),phaseOf(t,ev.oldReleased,ev.newGripped)),IDENTITY,null);
  if(t>=1.50&&t<1.62){const f=clamp01((t-1.50)/.12),start=wheelCenter(w,1.50).add(new T.Vector3(w.sign*.145,0,-w.sign*.24));arm(actor,'Right',start.lerp(worldPoint(w.holster,[0,-.07,-.02]),f),IDENTITY.clone().slerp(worldQuaternion(w.holster),f));}
  toolMotion(w,t);
  if(t>=1.88&&t<1.98){arm(actor,'Right',worldPoint(w.holster,[0,-.07,-.02]),worldQuaternion(w.holster));arm(actor,'Left',hub.clone().add(new T.Vector3(w.sign*.145,0,w.sign*.24)),IDENTITY);
   const f=clamp01((t-1.88)/.10),wrist={Left:worldQuaternion(actor.bones.LeftHand),Right:worldQuaternion(actor.bones.RightHand)};
   for(const n of ['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'])actor.bones[n].quaternion.slerp(actor.authored[n],f);actor.root.updateMatrixWorld(true);
   for(const side of ['Left','Right']){const hand=actor.bones[side+'Hand'];hand.quaternion.copy(worldQuaternion(hand.parent).invert().multiply(wrist[side].slerp(actor.authoredWorldHands[side],f)));hand.updateMatrixWorld(true);}}
  w.oldNut.rotation.x=-phaseOf(t,.66,.74)*Math.PI*4;w.newNut.rotation.x=phaseOf(t,1.69,1.81)*Math.PI*4;
  actor.root.updateMatrixWorld(true);
 }
 function composeJacks(snap,t){
  for(const jack of jacks){const js=snap.jacks[jack.id],lift=js.liftMeters,side=jack.id==='front'?1:-1;
   if(js.position)jack.root.position.copy(V(js.position));else jack.root.position.copy(jack.rest).add(new T.Vector3(side*1.25*phaseOf(t,2.04,2.10),0,0));
   jack.pad.position.y=jack.def.restPadY+lift;
   jack.handle.rotation.x=t<.66?-.5*phaseOf(t,.46,.66):t<=2.04?-.5:-.5*(1-phaseOf(t,2.04,2.25));
   const top=jack.pad.position.y-.03;
   for(const [part,from,to] of [[jack.piston,V([0,.06,.08]),V([0,top,.08])],[jack.links[0],V([-.13,.08,-.12]),V([0,top,.08])],[jack.links[1],V([.13,.08,-.12]),V([0,top,.08])]]){const d=to.clone().sub(from);part.position.copy(from).addScaledVector(d,.5);part.scale.y=d.length();part.quaternion.setFromUnitVectors(Y,d.normalize());}
   jack.root.updateMatrixWorld(true);
   const grips={Left:worldPoint(jack.handle,[.14,.88,-.23]),Right:worldPoint(jack.handle,[-.14,.88,-.23])},op=actors.get('jack_'+jack.id);
   if(t>=.20&&t<=2.10){const blend=t<.46?smooth((t-.20)/.26):t>2.00?1-clamp01((t-2.00)/.10):1;
    for(const hand of ['Left','Right']){const authored={};for(const part of ['Arm','ForeArm','Hand'])authored[part]=op.bones[hand+part].quaternion.clone();
     const anchor=V([hand==='Left'?.14:-.14,.88,-.23]);if(t>2.00)anchor.applyAxisAngle(X,-.5);else anchor.applyQuaternion(jack.handle.quaternion);anchor.add(jack.handle.position).applyAxisAngle(Y,jack.root.rotation.y).add(jack.rest);
     const target=t<.46||t>2.00?anchor:grips[hand],gq=t>2.00?worldQuaternion(jack.root).multiply(new T.Quaternion().setFromAxisAngle(X,-.5)):worldQuaternion(jack.handle);
     arm(op,hand,target,gq);for(const part of ['Arm','ForeArm','Hand'])op.bones[hand+part].quaternion.slerp(authored[part],1-blend);op.root.updateMatrixWorld(true);}}
  }
 }
 function solve(t){
  current=samplePitSequence(config,t);
  carFrame.position.set(0,current.car.liftMeters,0);
  for(const a of actors.values()){const spec=current.actors[a.id];if(spec)sampleActor(a,spec);}
  root.updateMatrixWorld(true);
  for(const w of wheels)composeWheel(w,t);
  composeJacks(current,t);lamp(current.light==='green'?'green':'red');
 }
 // the box (where racing-pit.mjs stops the player's car): the root is drawn there; while the car stands the root follows the car itself (same point, same heading)
 const s=lane.boxS(boxIndex,count),q=track.sample(s),boxPos=new T.Vector3(q.x+q.normal.x*lane.boxLat,q.y+.04,q.z+q.normal.z*lane.boxLat),boxYaw=q.heading;
 let seqT=null,doneAt=-1,wheelsOwn=true,solves=0,lastSolved=-1;
 const ownWheels=on=>{if(on===wheelsOwn)return;wheelsOwn=on;for(const w of wheels){w.real.visible=on;w.hub.visible=!on;}};
 for(const w of wheels)w.hub.visible=false;
 return {root,config,
  /** every frame (after the view placed the cars): follow the player's stop, lift the car, solve and draw the crew */
  update(state,dt){
   const p=state.player,P=p?.pit,toBox=P?P.box-p.routeS:Infinity;let t=seqTime(P,{toBox});
   if(t==null&&doneAt>=0&&state.time-doneAt<4)t=2.88;   // the crew stays in its last pose a moment after the car left, the old wheels on their racks
   if(P?.phase==='leave'&&doneAt<0)doneAt=state.time;if(!P&&doneAt>=0&&state.time-doneAt>=4)doneAt=-1;
   root.visible=t!=null;seqT=t;
   if(t==null){ownWheels(true);return;}
   // the car's own wheels drive before the stop and after the release; between, the hubs of the sequence carry the old and then the new wheels
   const standing=t>=.38&&t<2.30&&!!P;ownWheels(!standing);
   if(standing){root.position.copy(car.root.position);root.rotation.set(0,car.root.rotation.y,0);}else{root.position.copy(boxPos);root.rotation.set(0,boxYaw,0);}
   if(t!==lastSolved){const pos=root.position.clone(),rot=root.rotation.y;root.position.set(0,0,0);root.rotation.set(0,0,0);root.updateMatrixWorld(true);solve(t);solves++;lastSolved=t;root.position.copy(pos);root.rotation.y=rot;}
   root.updateMatrixWorld(true);
   if(standing&&current)car.body.position.y+=current.car.liftMeters;   // the view set it to the drop height this frame
  },
  metrics:()=>({actors:actors.size,visible:root.visible,t:seqT,lift:current?.car?.liftMeters??0,light:lampState,solves,wheels:Object.fromEntries(wheels.map(w=>[w.def.id,{old:w.old.parent?.name||null,fresh:w.fresh.parent?.name||null,own:w.real.visible}])),
   stage:current?.stage||null,replaced:current?Object.values(current.wheels).filter(x=>x.replaced).length:0}),
  dispose(){ownWheels(true);root.removeFromParent();}
 };
}
