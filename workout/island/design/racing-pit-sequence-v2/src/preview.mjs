// Original standalone reviewer. CC0-1.0. All assets and modules are local.
import * as THREE from '../../racing-v7/vendor/three.module.js';
import { GLTFLoader } from '../../racing-v7/vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from '../../racing-v7/vendor/SkeletonUtils.js';
import { createPitSequence } from './pit-sequence.mjs';

const $ = selector => document.querySelector(selector);
const V = value => new THREE.Vector3(...value);
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const phase = (t, a, b) => smooth((t - a) / (b - a));
const Y = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const IDENTITY = new THREE.Quaternion();
const LABELS = { enter:'כניסה לתא', stop:'עצירה על הסימון', jack_up:'שני ג׳קים עולים', loosen:'פתיחת ארבעה אומים', remove_old:'ארבעה גלגלים יוצאים', mount_new:'ארבעה גלגלים נכנסים', tighten:'הידוק ארבעה אומים', green:'ירוק · השירות הושלם', jack_down:'הורדת שני הג׳קים', signal:'הרמת יד · אישור יציאה', exit:'חוזרים למרוץ' };
const SHORT = {enter:'כניסה',stop:'עצירה',jack_up:'הרמה',loosen:'פתיחה',remove_old:'פירוק',mount_new:'הרכבה',tighten:'הידוק',green:'ירוק',jack_down:'הורדה',signal:'אישור',exit:'יציאה'};
const CAPTIONS = {enter:'המכונית נכנסת לתא · הצוות מוכן',stop:'הגלגלים נעצרים בדיוק על הסימון',jack_up:'הג׳ק הקדמי והג׳ק האחורי נושאים את המכונית',loosen:'ארבעה אקדחים על ארבעה אומים',remove_old:'משיכה מהציר · אחיזה בשתי ידיים · פינוי הגלגלים',mount_new:'אחיזה בגלגלים החדשים · השחלה על הצירים',tighten:'האקדחים חוזרים אל האומים · הידוק ואישור בכל עמדה',green:'ארבעת הגלגלים מאושרים · היציאה עדיין ממתינה לפינוי',jack_down:'שני הג׳קים יורדים ומתפנים מנתיב המכונית',signal:'הצוות פנוי · מפעיל הג׳ק הקדמי מרים יד',exit:'ארבעה גלגלים חדשים · חוזרים למרוץ'};
const api = { ready:false, error:null };
window.__pitPreview = api;
let renderer, scene, camera, controller, configuration;
let ready = false, playing = false, speed = 1, current, animationClips = [];
let car, entryLight, exitLight, highView = false;
const actors = new Map(), wheels = [], jacks = [];
const loader = new GLTFLoader(), assetCache = new Map();

function assetURL(path) { return new URL(`../${path}`, import.meta.url).href; }
async function asset(path) {
  const url = assetURL(path);
  // All delivered GLBs are self-contained. Consume the native fetch completely
  // before parsing, rather than wrapping its body in FileLoader's progress
  // stream; Chromium can otherwise report a late abort when that stream is GC'd.
  if (!assetCache.has(url)) assetCache.set(url, (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Asset ${path}: HTTP ${response.status}`);
    return loader.parseAsync(await response.arrayBuffer(), new URL('.', url).href);
  })());
  return assetCache.get(url);
}
function prepare(root) {
  root.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  return root;
}
function mesh(parent, geometry, material, position = [0,0,0]) {
  const object = new THREE.Mesh(geometry, material); object.position.copy(V(position));
  object.castShadow = object.receiveShadow = true; parent.add(object); return object;
}
const materials = {};
function material(color, roughness = .7, metalness = 0) {
  const key = `${color}/${roughness}/${metalness}`;
  return materials[key] ??= new THREE.MeshStandardMaterial({color,roughness,metalness});
}
function box(parent, size, position, color, roughness = .8, metalness = 0) {
  return mesh(parent,new THREE.BoxGeometry(...size),material(color,roughness,metalness),position);
}
function buildEnvironment() {
  scene = new THREE.Scene(); scene.background = new THREE.Color('#a9bec0');
  scene.fog = new THREE.Fog('#a9bec0',24,45);
  camera = new THREE.PerspectiveCamera(35,1,.1,70);
  scene.add(new THREE.HemisphereLight('#eff9f3','#667e83',2.5));
  const sun = new THREE.DirectionalLight('#fff0d8',3.2); sun.position.set(4,10,6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); sun.shadow.normalBias = .018;
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:1,far:30}); scene.add(sun);
  const rim = new THREE.DirectionalLight('#c5eaf3',1.0); rim.position.set(-4,6,-4); scene.add(rim);
  box(scene,[30,.08,30],[0,-.06,0],'#aabdbb');
  box(scene,[5.3,.01,7.2],[0,-.012,0],'#839f9d');
  for (const x of [-2.54,2.54]) box(scene,[.035,.012,7.2],[x,-.004,0],'#e7ead5');
  for (const z of [-3.6,3.6]) box(scene,[5.1,.012,.035],[0,-.004,z],'#e7ead5');
  // Stop targets are ground geometry; characters, car and tools are the authored GLBs.
  for (const wheel of configuration.wheels) {
    box(scene,[.42,.018,.055],[wheel.hub[0],.005,wheel.hub[2]+.38],'#f2ca68');
    box(scene,[.42,.018,.055],[wheel.hub[0],.005,wheel.hub[2]-.38],'#f2ca68');
    const r = wheel.radiusMeters;
    box(scene,[.46,.025,.76],[wheel.newRack[0],wheel.newRack[1]-r-.028,wheel.newRack[2]],'#355d5c');
    const legHeight=wheel.newRack[1]-r-.0405;
    for(const x of [-.17,.17])for(const z of [-.28,.28])box(scene,[.035,legHeight,.035],[wheel.newRack[0]+x,legHeight/2,wheel.newRack[2]+z],'#355d5c');
    for(const side of [-1,1]) box(scene,[.035,.07,.76],[wheel.newRack[0]+side*.21,wheel.newRack[1]-r-.005,wheel.newRack[2]],'#73b8a8');
    box(scene,[.46,.015,.86],[wheel.oldRack[0],.002,wheel.oldRack[2]],'#7f8d81');
    for(const side of [-1,1]) box(scene,[.03,.06,.86],[wheel.oldRack[0]+side*.21,.035,wheel.oldRack[2]],'#caae75');
  }
  for(const x of [-3.7,3.7]) box(scene,[3.6,2.3,.18],[x,1.1,-5.2],'#6a888b');
  box(scene,[11,.16,.22],[0,2.28,-5.18],'#25444b');
  for(const x of [-4.6,-2.25,2.25,4.6]) box(scene,[.1,2.4,.24],[x,1.1,-5.10],'#35535b');
  for(const x of [-3.5,3.5]) {
    box(scene,[2.7,1.9,.04],[x,.94,-5.08],'#526f75');
    box(scene,[2.7,.035,.05],[x,1.98,-5.02],'#b8d4c6');
  }
  const checkers = new THREE.Group(); scene.add(checkers);
  for(let i=0;i<16;i++) box(checkers,[.29,.012,.12],[-2.25+i*.30,.006,3.61],i%2?'#e7ead5':'#294d52');
}
function cameraView() {
  const portrait = $('.viewport').clientWidth / $('.viewport').clientHeight < 1.15;
  if(highView) camera.position.set(0.05,14,.05);
  else camera.position.set(portrait?9.2:6.7,portrait?10.4:6.2,portrait?10.5:2.8);
  camera.lookAt(0,.45,.08); camera.updateProjectionMatrix();
}
function resize() {
  if(!renderer || !camera) return;
  const rect = $('.viewport').getBoundingClientRect(); renderer.setSize(rect.width,rect.height,false);
  camera.aspect = rect.width / rect.height; cameraView();
  if(ready) renderer.render(scene,camera);
}
function lamp(root, state) {
  root.traverse(object => {
    if(!object.isMesh || !/^Lamp/.test(object.name)) return;
    if(!object.userData.localMaterial) { object.material = object.material.clone(); object.userData.localMaterial = true; }
    const name = object.name.slice(4).toLowerCase();
    object.material.color.set(name===state?'#f4fff3':'#45606a');
    object.material.emissive.set({red:'#f05243',amber:'#ffc557',green:'#6bffd0'}[name]);
    object.material.emissiveIntensity = name===state?3.1:.01;
  });
  root.userData.state = state;
}

function local(object, parent, position, quaternion = IDENTITY) {
  if(object.parent !== parent) parent.add(object);
  object.position.copy(position); object.quaternion.copy(quaternion); object.updateMatrixWorld(true);
}
function world(object, position, quaternion = IDENTITY) { local(object,scene,position,quaternion); }
function worldPoint(object, point = [0,0,0]) { return object.localToWorld(V(point)); }
function worldQuaternion(object) { return object.getWorldQuaternion(new THREE.Quaternion()); }

function sampleActor(actor, specification) {
  const name = specification.clip, clip = animationClips.find(value => value.name === name);
  if(!clip) throw new Error(`Animation clip missing: ${name}`);
  actor.samples??=new Map();
  if(!actor.samples.has(name))actor.samples.set(name,clip.tracks.map(track=>{
    const at=track.name.lastIndexOf('.'),boneName=track.name.slice(0,at),property=track.name.slice(at+1);
    const target=actor.bones[boneName]??actor.root.getObjectByName(boneName);
    if(!target||!['position','quaternion','scale'].includes(property))throw new Error(`Unsupported canonical track: ${track.name}`);
    return {target,property,interpolant:track.createInterpolant()};
  }));
  const time=Math.max(0,Math.min(clip.duration,specification.clipTime));
  // Always write every authored channel. AnimationMixer can skip constant values
  // after an external IK edit, making a seek depend on the preceding frame.
  for(const sample of actor.samples.get(name))sample.target[sample.property].fromArray(sample.interpolant.evaluate(time));
  actor.poseDeltas??=Object.entries(actor.def.poseAdjustment?.bones??{}).map(([bone,delta])=>({bone,quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(...delta))}));
  // A fixed workspace stance keeps the knees outside the tires. Apply local
  // torso offsets after each GLB sample and before solving the tool/rim grips.
  for(const delta of actor.poseDeltas)actor.bones[delta.bone].quaternion.multiply(delta.quaternion).normalize();
  actor.clip=name;
  actor.authored={};
  for(const name of ['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'])actor.authored[name]=actor.bones[name].quaternion.clone();
  actor.root.position.copy(V(actor.def.position)); actor.root.rotation.set(0,actor.def.yaw,0);
  actor.root.updateMatrixWorld(true);
  actor.authoredWorldHands={Left:worldQuaternion(actor.bones.LeftHand),Right:worldQuaternion(actor.bones.RightHand)};
}

// Analytic two-bone reach, using the canonical .27m upper arm and .24m forearm.
// No limb scaling. The LeftHand is the actual wheel parent, with a fixed rim offset.
function arm(actor, side, target, handWorldQuaternion = IDENTITY) {
  const upper = actor.bones[`${side}Arm`], fore = actor.bones[`${side}ForeArm`], hand = actor.bones[`${side}Hand`];
  const shoulder = worldPoint(upper), delta = target.clone().sub(shoulder), distance = delta.length();
  const l1 = fore.position.length(), l2 = hand.position.length();
  const d = Math.max(.00001,Math.min(l1+l2-.000001,distance)), direction = delta.normalize();
  const signed = side === 'Left'?1:-1;
  const lateral = new THREE.Vector3(signed,0,0).applyQuaternion(worldQuaternion(actor.bones.Root));
  const pole = lateral.multiplyScalar(.85).add(new THREE.Vector3(0,.25,0));
  const perpendicular = pole.addScaledVector(direction,-pole.dot(direction));
  if(perpendicular.lengthSq()<.00001) perpendicular.set(0,1,0).addScaledVector(direction,-direction.y);
  perpendicular.normalize();
  const a = (l1*l1-l2*l2+d*d)/(2*d), h = Math.sqrt(Math.max(0,l1*l1-a*a));
  const elbow = shoulder.clone().addScaledVector(direction,a).addScaledVector(perpendicular,h);
  const upperWorld = new THREE.Quaternion().setFromUnitVectors(DOWN,elbow.clone().sub(shoulder).normalize());
  upper.quaternion.copy(worldQuaternion(upper.parent).invert().multiply(upperWorld)); upper.updateMatrixWorld(true);
  const actualElbow = worldPoint(fore);
  const foreWorld = new THREE.Quaternion().setFromUnitVectors(DOWN,target.clone().sub(actualElbow).normalize());
  fore.quaternion.copy(worldQuaternion(fore.parent).invert().multiply(foreWorld)); fore.updateMatrixWorld(true);
  hand.quaternion.copy(worldQuaternion(hand.parent).invert().multiply(handWorldQuaternion)); hand.updateMatrixWorld(true);
  return worldPoint(hand).distanceTo(target);
}

function relativeWheelCenter(wheel, t) {
  const actor = wheel.actor, s = wheel.sign, hub = V(wheel.def.hub).add(new THREE.Vector3(0,.16,0));
  if(t < 1.08) {
    const f = phase(t,.90,1.08);
    return hub.lerp(new THREE.Vector3(s*1.25,wheel.def.radiusMeters+.5*9.81*.16*.16,wheel.def.hub[2]+s*.12),f);
  }
  if(t < 1.24) {
    const dt = t-1.08, f = clamp(dt/.16);
    const from = new THREE.Vector3(s*1.25,wheel.def.radiusMeters+.5*9.81*.16*.16,wheel.def.hub[2]+s*.12);
    const to = V(wheel.def.oldRack); from.lerp(to,f); from.y = wheel.def.radiusMeters+.5*9.81*(.16*.16-dt*dt); return from;
  }
  if(t < 1.6) {
    // The authored diagonal step keeps the fresh wheel in front of the torso.
    return V(wheel.def.newRack).lerp(hub,phase(t,1.24,wheel.def.events.mounted));
  }
  return hub;
}
function wheelQuaternion(wheel,t) {
  return IDENTITY.clone();
}
function wheelHands(wheel, center, quaternion, object) {
  const offset = new THREE.Vector3(wheel.sign*.145,0,wheel.sign*.24).applyQuaternion(quaternion);
  arm(wheel.actor,'Left',center.clone().add(offset),quaternion);
  if(object) {
    local(object,wheel.actor.bones.LeftHand,new THREE.Vector3(-wheel.sign*.145,0,-wheel.sign*.24),IDENTITY);
    center = worldPoint(object); // The second hand follows the wheel actually held by the first.
  }
  arm(wheel.actor,'Right',center.clone().add(new THREE.Vector3(wheel.sign*.145,0,-wheel.sign*.24).applyQuaternion(quaternion)),quaternion);
  return center;
}

function gunInHand(wheel, targetSocket, quaternion) {
  const handTarget = targetSocket.clone().sub(V([0,0,.28]).applyQuaternion(quaternion)).add(V([0,-.07,-.02]).applyQuaternion(quaternion));
  arm(wheel.actor,'Right',handTarget,quaternion);
  local(wheel.gun,wheel.actor.bones.RightHand,V([0,.07,.02]));
}
function gunHolster(wheel) { local(wheel.gun,wheel.holster,new THREE.Vector3()); }
function holsterSocket(wheel) { return worldPoint(wheel.holster,[0,0,.28]); }
function toolMotion(wheel,t) {
  const hub = t<.38?V(wheel.def.hub).add(new THREE.Vector3(0,current.car.liftMeters,0)):worldPoint(wheel.hub);
  const socket = hub.clone().add(new THREE.Vector3(wheel.sign*.17,0,0));
  const useQuaternion = new THREE.Quaternion().setFromAxisAngle(Y,-wheel.sign*Math.PI/2);
  const parkedSocket = holsterSocket(wheel), parkedQuaternion = worldQuaternion(wheel.holster);
  wheel.contact = false;
  if(t < .80) {
    let q = useQuaternion.clone(), target = socket.clone();
    const readyTarget=new THREE.Vector3(wheel.sign*1.15,.79,wheel.def.hub[2]-wheel.sign*.16);
    if(t<.46)target.copy(readyTarget);
    else if(t<.66)target.copy(readyTarget).lerp(socket,phase(t,.46,.66));
    if(t>=.74) { const f=clamp((t-.74)/.06); target.lerp(parkedSocket,f); q.slerp(parkedQuaternion,f); }
    wheel.contact = t>=.66 && t<=.74;
    gunInHand(wheel,target,q);
  } else if(t<1.62) gunHolster(wheel);
  else if(t<1.88) {
    let target=socket.clone(),q=useQuaternion.clone();
    if(t<1.69) { const f=phase(t,1.62,1.69); target.copy(parkedSocket).lerp(socket,f);q.copy(parkedQuaternion).slerp(useQuaternion,f); }
    if(t>1.81) { const f=phase(t,1.81,1.88); target.lerp(parkedSocket,f);q.slerp(parkedQuaternion,f); }
    wheel.contact = t>=1.69 && t<=1.81;
    gunInHand(wheel,target,q);
  } else gunHolster(wheel);
  wheel.gunTargetSocket = socket;
}

function composeWheel(wheel,t) {
  const def=wheel.def, actor=wheel.actor, hub=worldPoint(wheel.hub);
  const release=def.events.oldReleased, detach=def.events.detach, grip=def.events.newGripped, mount=def.events.mounted;
  // Work wrists are first restored by the GLB sampler each frame. Each ownership
  // interval then has a real scene-graph parent and a constant local grip transform.
  if(t<detach) {
    local(wheel.old,wheel.hub,new THREE.Vector3());
    if(t>=.74) {
      const f=clamp((t-.74)/.16),target=hub.clone().add(new THREE.Vector3(wheel.sign*.145,0,wheel.sign*.24));
      const position=worldPoint(actor.bones.LeftHand).lerp(target,f),q=worldQuaternion(actor.bones.LeftHand).slerp(IDENTITY,f);
      arm(actor,'Left',position,q);
      for(const name of ['LeftArm','LeftForeArm','LeftHand'])actor.bones[name].quaternion.slerp(actor.authored[name],1-f);
      actor.root.updateMatrixWorld(true);
    }
    if(t>=.80) {
      const parked=worldPoint(wheel.holster,[0,-.07,-.02]);
      const f=clamp((t-.80)/.10),q=worldQuaternion(wheel.holster).slerp(IDENTITY,f);
      arm(actor,'Right',parked.lerp(hub.clone().add(new THREE.Vector3(wheel.sign*.145,0,-wheel.sign*.24)),f),q);
    }
  } else if(t<release) wheelHands(wheel,relativeWheelCenter(wheel,t),IDENTITY,wheel.old);
  else if(t<grip) {
    const p=relativeWheelCenter(wheel,t), q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-(t-release)*3.0*wheel.sign);
    world(wheel.old,p,q);
  } else world(wheel.old,V(def.oldRack),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.48*wheel.sign));

  const freshRotation = IDENTITY.clone();
  if(t<grip) world(wheel.fresh,V(def.newRack),freshRotation);
  else if(t<mount) wheelHands(wheel,relativeWheelCenter(wheel,t),wheelQuaternion(wheel,t),wheel.fresh);
  else {
    local(wheel.fresh,wheel.hub,new THREE.Vector3());
    if(t<1.88)arm(actor,'Left',hub.clone().add(new THREE.Vector3(wheel.sign*.145,0,wheel.sign*.24)),IDENTITY);
  }

  if(t>=release && t<grip) {
    const f=phase(t,release,grip), start=relativeWheelCenter(wheel,release), target=V(def.newRack);
    const q=IDENTITY.clone().slerp(freshRotation,f);
    wheelHands(wheel,start.lerp(target,f),q,null);
  }
  if(t>=1.50&&t<1.62) {
    const f=clamp((t-1.50)/.12),start=relativeWheelCenter(wheel,1.50).add(new THREE.Vector3(wheel.sign*.145,0,-wheel.sign*.24));
    const target=start.lerp(worldPoint(wheel.holster,[0,-.07,-.02]),f);
    arm(actor,'Right',target,IDENTITY.clone().slerp(worldQuaternion(wheel.holster),f));
  }
  toolMotion(wheel,t);
  if(t>=1.88&&t<1.98) {
    arm(actor,'Right',worldPoint(wheel.holster,[0,-.07,-.02]),worldQuaternion(wheel.holster));
    arm(actor,'Left',hub.clone().add(new THREE.Vector3(wheel.sign*.145,0,wheel.sign*.24)),IDENTITY);
    const f=clamp((t-1.88)/.10);
    const wristWorld={Left:worldQuaternion(actor.bones.LeftHand),Right:worldQuaternion(actor.bones.RightHand)};
    for(const name of ['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand'])actor.bones[name].quaternion.slerp(actor.authored[name],f);
    actor.root.updateMatrixWorld(true);
    // Blend wrist orientation in world space. Independently blending all local
    // joints can make their accumulated rotations take opposite arcs at once.
    for(const side of ['Left','Right']) {
      const hand=actor.bones[side+'Hand'];
      const target=wristWorld[side].slerp(actor.authoredWorldHands[side],f);
      hand.quaternion.copy(worldQuaternion(hand.parent).invert().multiply(target));
      hand.updateMatrixWorld(true);
    }
  }
  wheel.oldNut.rotation.x = -phase(t,.66,.74)*Math.PI*4;
  wheel.newNut.rotation.x = phase(t,1.69,1.81)*Math.PI*4;
  wheel.old.visible = wheel.fresh.visible = true;
  wheel.actor.root.updateMatrixWorld(true);
}

function composeJacks(snapshot,t) {
  for(const jack of jacks) {
    const lift=snapshot.jacks[jack.id].liftMeters;
    const clear=phase(t,2.04,2.10),side=jack.id==='front'?1:-1;
    const approach=jack.id==='rear'?-1.40*(1-phase(t,.30,.46)):0;
    if(snapshot.jacks[jack.id].position)jack.root.position.copy(V(snapshot.jacks[jack.id].position));
    else jack.root.position.copy(jack.rest).add(new THREE.Vector3(side*1.25*clear+approach,0,0));
    jack.pad.position.y=jack.def.restPadY+lift;
    // A hydraulic drop valve lowers the saddle while the operator holds pressure.
    jack.handle.rotation.x=t<.66?-.5*phase(t,.46,.66):t<=2.04?-.5:-.5*(1-phase(t,2.04,2.25));
    const top=jack.pad.position.y-.03;
    for(const [part,from,to]of [[jack.piston,V([0,.06,.08]),V([0,top,.08])],[jack.links[0],V([-.13,.08,-.12]),V([0,top,.08])],[jack.links[1],V([.13,.08,-.12]),V([0,top,.08])]]) {
      const delta=to.clone().sub(from);part.position.copy(from).addScaledVector(delta,.5);part.scale.y=delta.length();part.quaternion.setFromUnitVectors(Y,delta.normalize());
    }
    jack.root.updateMatrixWorld(true);
    jack.grips={Left:worldPoint(jack.handle,[.14,.88,-.23]),Right:worldPoint(jack.handle,[-.14,.88,-.23])};
    const operator=actors.get(`jack_${jack.id}`);
    jack.contact=t>=.46&&t<=2.00;
    if(t>=.20&&t<=2.10) {
      const blend=t<.46?smooth((t-.20)/.26):t>2.00?1-clamp((t-2.00)/.10):1;
      // Jack operators stand beside the car. Both hands grip the real crossbar.
      // A brief release blend ends before the front operator raises the left hand.
      for(const hand of ['Left','Right']) {
        const authored={};for(const part of ['Arm','ForeArm','Hand'])authored[part]=operator.bones[hand+part].quaternion.clone();
        const anchor=V([hand==='Left'?.14:-.14,.88,-.23]);
        if(t>2.00)anchor.applyAxisAngle(new THREE.Vector3(1,0,0),-.5);
        else anchor.applyQuaternion(jack.handle.quaternion);
        anchor.add(jack.handle.position).applyAxisAngle(Y,jack.root.rotation.y).add(jack.rest);
        const fixedTarget=t<.46||t>2.00?anchor:jack.grips[hand];
        const gripQuaternion=t>2.00?worldQuaternion(jack.root).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.5)):worldQuaternion(jack.handle);
        arm(operator,hand,fixedTarget,gripQuaternion);
        for(const part of ['Arm','ForeArm','Hand'])operator.bones[hand+part].quaternion.slerp(authored[part],1-blend);
        operator.root.updateMatrixWorld(true);
      }
    }
    if(t<=2.04)jack.releaseGrips={Left:jack.grips.Left.clone(),Right:jack.grips.Right.clone()};
  }
}

function updateUI(snapshot) {
  const index=configuration.stages.findIndex(stage=>stage.id===snapshot.state);
  $('#time').textContent=snapshot.time.toFixed(2); $('#stage-count').textContent=`${String(index+1).padStart(2,'0')} / 11`;
  $('#action').textContent=LABELS[snapshot.state]??snapshot.state;
  $('#scene-caption').textContent=CAPTIONS[snapshot.state]??'';
  $('#timeline').value=String(snapshot.time);
  for(const button of $('#stages').children)button.setAttribute('aria-current',String(button.dataset.stage===snapshot.state));
  for(const [id,state]of Object.entries(snapshot.wheels)) {
    const card=$(`[data-wheel="${id}"]`); if(!card)continue;
    const complete=state.confirmed&&state.replaced;
    card.dataset.state=complete?'done':snapshot.time>=.66?'working':'waiting';
    card.querySelector('b').textContent=complete?'חדש · מהודק':state.newState==='held'?'גלגל חדש':state.oldState==='held'?'גלגל יוצא':state.fastener==='tightening'?'מהדקים':snapshot.time>=.66?'בטיפול':'ממתין';
  }
  $('#signal').classList.toggle('green',snapshot.light==='green');
  $('#release-label').textContent=snapshot.canExit?'הנתיב פנוי · יציאה מאושרת':snapshot.light==='green'?'ירוק · השירות הושלם':'אדום · המכונית בעצירה';
  $('#clear-note').textContent=snapshot.canExit?'ארבעה חיבורים מאושרים, שני ג׳קים פנויים והרמת יד.':snapshot.light==='green'?'הירוק מסמן סיום שירות. התנועה ממתינה לג׳קים, לצוות ולהרמת יד.':'היציאה ממתינה להידוק, להורדת הג׳קים ולפינוי הצוות.';
  $('#play-icon').textContent=playing?'Ⅱ':'▶';
  $('#play-label').textContent=playing?'השהיה':snapshot.complete?'ניגון מחדש':'הפעלת העצירה';
}
function render() {
  if(!ready)return;
  current=controller.getSnapshot();
  const t=current.time;
  car.position.copy(V(current.car.position));
  for(const actor of actors.values())sampleActor(actor,current.actors[actor.id]);
  scene.updateMatrixWorld(true);
  for(const wheel of wheels)composeWheel(wheel,t);
  composeJacks(current,t);
  lamp(entryLight,t<.38?'green':'amber'); lamp(exitLight,current.light);
  scene.updateMatrixWorld(true); updateUI(current); renderer.render(scene,camera);
}

function tireAccent(parent,radius,color,sign) {
  const stripe=mesh(parent,new THREE.TorusGeometry(radius*.92,.012,4,48),material(color,.6),[sign*.157,0,0]);
  stripe.rotation.y=Math.PI/2; return stripe;
}
function nut(parent,sign) {
  const object=mesh(parent,new THREE.CylinderGeometry(.055,.055,.034,6),material('#d4ded8',.22,.9),[sign*.169,0,0]);
  object.rotation.z=Math.PI/2; return object;
}
async function load() {
  const response=await fetch(assetURL('sequence.json')); if(!response.ok)throw new Error(`sequence.json: ${response.status}`);
  configuration=await response.json(); controller=createPitSequence(configuration);
  $('#timeline').max=String(configuration.duration);
  $('.time-unit').textContent=`/ ${configuration.duration.toFixed(2)} ש׳`;
  $('.duration-label').textContent=`${configuration.duration.toFixed(2)} שניות בקצב המשחק`;
  renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  buildEnvironment();
  const paths=[configuration.car.asset,'clips/pit-actions.glb',...new Set(configuration.actors.map(actor=>actor.model)), '../racing-pit-v1/models/spare_wheel.glb','../racing-pit-v1/models/wheel_gun.glb','../racing-pit-v1/models/jack.glb','../racing-pit-v1/models/pit_light_entry.glb','../racing-pit-v1/models/pit_light_exit.glb','../racing-pit-v1/models/stop_star.glb'];
  let count=0;
  await Promise.all(paths.map(async path=>{await asset(path);$('#loading').textContent=`טוען את התחנה · ${++count} / ${paths.length}`;}));
  animationClips=(await asset('clips/pit-actions.glb')).animations;
  car=prepare((await asset(configuration.car.asset)).scene.clone(true)); car.name='FormulaCar';
  car.traverse(object=>{if(object.isMesh){const list=Array.isArray(object.material)?object.material:[object.material];for(const m of list)if(m.name==='Paint 1')m.color.set('#26b6aa');}});scene.add(car);
  for(const def of configuration.actors) {
    const root=prepare(cloneSkeleton((await asset(def.model)).scene)); root.name=`Actor/${def.id}`; scene.add(root);
    const bones={}; root.traverse(object=>{if(object.isBone)bones[object.name]=object;});
    actors.set(def.id,{id:def.id,def,root,bones,clip:null});
  }
  for(const def of configuration.wheels) {
    const original=car.getObjectByName(def.carNode); if(!original)throw new Error(`Car hub missing: ${def.carNode}`);
    original.visible=false;
    const hub=new THREE.Group();hub.name=`Hub/${def.id}`;hub.position.copy(original.position);car.add(hub);
    const old=prepare(original.clone(true));old.name=def.oldId;old.visible=true;old.position.set(0,0,0);hub.add(old);
    const fresh=prepare((await asset('../racing-pit-v1/models/spare_wheel.glb')).scene.clone(true));fresh.name=def.newId;
    const scaled=new THREE.Group();scaled.name=def.newId;fresh.name=`NewWheelGeometry/${def.id}`;scaled.add(fresh);fresh.scale.setScalar(def.radiusMeters/.34);
    const sign=Math.sign(def.hub[0]);tireAccent(old,def.radiusMeters,'#e0b873',sign);tireAccent(scaled,def.radiusMeters,'#65efc7',sign);
    const oldNut=nut(old,sign),newNut=nut(scaled,sign);
    const actor=actors.get(def.actor),gun=prepare((await asset('../racing-pit-v1/models/wheel_gun.glb')).scene.clone(true));gun.name=`Gun/${def.id}`;
    const holster=new THREE.Group();holster.name=`Holster/${def.id}`;holster.position.set(-.24,.01,-.035);holster.rotation.x=-Math.PI/2;actor.bones.Hips.add(holster);
    wheels.push({def,actor,sign,hub,old,fresh:scaled,gun,holster,oldNut,newNut,contact:false});
  }
  for(const id of ['front','rear']) {
    const def=configuration.props.attachments.find(value=>value.id===`jack_${id}`);
    const root=prepare((await asset('../racing-pit-v1/models/jack.glb')).scene.clone(true));root.name=`Jack/${id}`;root.rotation.y=def.yaw;scene.add(root);
    const handle=root.getObjectByName('Handle');handle.position.z=def.handleAdjustment.localPositionZ;
    box(root,[.048,.04,def.handleAdjustment.extensionMeters],[0,.13,(-.24+handle.position.z)/2],'#839c9a',.3,.8);
    root.getObjectByName('LiftArm').visible=false;
    const piston=mesh(root,new THREE.CylinderGeometry(.033,.033,1,10),material('#b5c8c2',.25,.8));piston.name='TelescopicPiston';
    const links=[-1,1].map(sign=>{const part=mesh(root,new THREE.BoxGeometry(.035,1,.035),material('#238b82',.45,.3));part.name=`SaddleLink/${sign}`;return part;});
    const pad=root.getObjectByName('LiftPad');if(id==='rear')pad.scale.set(.5,1,.5);
    jacks.push({id,def,root,rest:V(def.position),pad,handle,piston,links,releaseGrips:{Left:new THREE.Vector3(),Right:new THREE.Vector3()}});
  }
  entryLight=prepare((await asset('../racing-pit-v1/models/pit_light_entry.glb')).scene.clone(true));entryLight.position.set(-2.5,0,-3.0);entryLight.rotation.y=.4;scene.add(entryLight);
  exitLight=prepare((await asset('../racing-pit-v1/models/pit_light_exit.glb')).scene.clone(true));exitLight.position.set(2.8,0,2.6);exitLight.rotation.y=.4;scene.add(exitLight);
  const star=prepare((await asset('../racing-pit-v1/models/stop_star.glb')).scene.clone(true));star.position.set(0,.0,2.72);scene.add(star);
  for(const [index,stage]of configuration.stages.entries()) {
    const button=document.createElement('button');button.type='button';button.dataset.stage=stage.id;button.title=`${LABELS[stage.id]} · ${stage.start.toFixed(2)}–${stage.end.toFixed(2)} ש׳`;
    button.setAttribute('aria-label',button.title);button.innerHTML=`<span>${String(index+1).padStart(2,'0')}</span>${SHORT[stage.id]}`;
    button.onclick=()=>seek(stage.start);$('#stages').append(button);
  }
  ready=true;api.ready=true;api.controller=controller;api.seek=seek;api.play=play;api.pause=pause;api.snapshot=()=>controller.getSnapshot();api.pose=pose;api.diagnostics=diagnostics;
  api.setLaneClear=value=>{controller.setLaneClear(value);render();};
  api.setConfirmation=(id,value)=>{controller.setConfirmation(id,value);render();};
  api.setView=value=>{highView=value==='top';cameraView();render();};
  $('#loading').hidden=true;$('#play').disabled=$('#replay').disabled=false;
  new ResizeObserver(resize).observe($('.viewport')); resize(); render();
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)play();
}

function seek(time) { playing=false;controller.pause();controller.seek(time);render();return controller.getSnapshot(); }
function play() { if(!ready)return;if(controller.getSnapshot().complete)controller.reset();controller.start();playing=true;render(); }
function pause() { playing=false;controller?.pause();if(ready)render(); }
function array(vector) { return vector.toArray().map(value=>Math.abs(value)<1e-12?0:value); }
function pose() {
  scene.updateMatrixWorld(true);const result={};
  for(const actor of actors.values()) {
    const joints={},rotations={},localRotations={},scales={};
    for(const [name,bone]of Object.entries(actor.bones)){joints[name]=array(worldPoint(bone));rotations[name]=array(worldQuaternion(bone));localRotations[name]=array(bone.quaternion);scales[name]=array(bone.scale);}
    const floorPoints=[];
    for(const name of ['LeftFoot','RightFoot'])for(const xof of [-.082,.082])for(const z of [-.085,.175])floorPoints.push({bone:name,position:array(worldPoint(actor.bones[name],[xof,-.08,z]))});
    result[actor.id]={role:actor.def.wheel?'wheel_mechanic':'jack_operator',height:1.6675,joints,rotations,localRotations,root:joints.Root,floorPoints,scales};
  }
  return result;
}
function diagnostics() {
  scene.updateMatrixWorld(true);
  const objectInfo=object=>({position:array(worldPoint(object)),quaternion:array(worldQuaternion(object)),parent:object.parent?.name??null,visible:object.visible});
  const info=wheels.map(wheel=>{
    const hand=wheel.actor.bones.LeftHand,offset=new THREE.Vector3(wheel.sign*.145,0,wheel.sign*.24),rightOffset=new THREE.Vector3(wheel.sign*.145,0,-wheel.sign*.24);
    const held=wheel.old.parent===hand?wheel.old:wheel.fresh.parent===hand?wheel.fresh:null;
    const leftGrip=held?worldPoint(held,array(offset)):null,rightGrip=held?worldPoint(held,array(rightOffset)):null;
    return {id:wheel.def.id,old:objectInfo(wheel.old),new:objectInfo(wheel.fresh),hub:array(worldPoint(wheel.hub)),gun:objectInfo(wheel.gun),
      held:held?.name??null,leftGripActive:!!held,rightGripActive:!!held&&current.time<1.50,leftGripErrorMeters:held?leftGrip.distanceTo(worldPoint(hand)):null,rightGripErrorMeters:held?rightGrip.distanceTo(worldPoint(wheel.actor.bones.RightHand)):null,
      gunSocket:array(worldPoint(wheel.gun,[0,0,.28])),gunSocketTarget:array(wheel.gunTargetSocket??new THREE.Vector3()),gunInContact:wheel.contact,
      gunSocketErrorMeters:wheel.contact?worldPoint(wheel.gun,[0,0,.28]).distanceTo(wheel.gunTargetSocket):null};
  });
  return {time:current.time,car:objectInfo(car),wheels:info,jacks:jacks.map(jack=>{
    const contact=car.localToWorld(V(jack.def.contactPosition));
    const operator=actors.get(`jack_${jack.id}`);
    return {id:jack.id,pad:array(worldPoint(jack.pad,[0,.025,0])),padCenter:array(worldPoint(jack.pad)),chassisContact:array(contact),padErrorMeters:worldPoint(jack.pad,[0,.025,0]).distanceTo(contact),clear:current.jacks[jack.id].clear,handContact:jack.contact,
      leftGrip:array(jack.grips.Left),rightGrip:array(jack.grips.Right),leftGripErrorMeters:worldPoint(operator.bones.LeftHand).distanceTo(jack.grips.Left),rightGripErrorMeters:worldPoint(operator.bones.RightHand).distanceTo(jack.grips.Right)};
  }),renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},ready};
}

$('#play').onclick=()=>playing?pause():play();$('#replay').onclick=()=>{seek(0);play();};
$('#timeline').addEventListener('input',event=>seek(Number(event.target.value)));
$('#speed').onchange=event=>{speed=Number(event.target.value);};
$('#view').onclick=()=>{highView=!highView;$('#view').textContent=highView?'מבט אלכסוני':'מבט על';cameraView();render();};
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.code==='Space'){event.preventDefault();playing?pause():play();}
  if(event.code==='ArrowRight'||event.code==='ArrowLeft'){event.preventDefault();seek((current?.time??0)+(event.code==='ArrowRight'?1:-1)/60);}
  if(event.code==='Home'){event.preventDefault();seek(0);}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();last=performance.now();});
$('#scene').addEventListener('webglcontextlost',event=>{event.preventDefault();pause();$('#loading').hidden=false;$('#loading').textContent='תצוגת התלת־ממד נעצרה. יש לטעון את הדף מחדש.';});
let last=performance.now();
function frame(now) {
  requestAnimationFrame(frame);const delta=Math.min(.08,(now-last)/1000);last=now;
  if(!ready||!playing||document.hidden)return;
  controller.update(delta*speed);if(controller.getSnapshot().complete)playing=false;render();
}
load().catch(error=>{api.error=String(error);$('#loading').hidden=false;$('#loading').classList.add('error');$('#loading').textContent='טעינת התחנה נכשלה. יש לפתוח את התצוגה דרך שרת HTTP משורש המאגר.';console.error(error);});
requestAnimationFrame(frame);
