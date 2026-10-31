import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {composeSoccerRestartMotion,installSoccerRestartMotion,SOCCER_RESTART_SEQUENCES,sampleSoccerRestartBall,soccerRestartBallAttachment,alignSoccerRestartStrike} from '../workout/island/minigames/soccer-restart-motion.mjs';
import {restartActionProfile,sampleRestartAction,restartBallPose} from '../workout/island/minigames/soccer-restarts.mjs';
import {compileSoccerDesignClips,createSoccerDesignMotion} from '../workout/island/minigames/soccer-design-character.mjs';
import {loadSoccerRestartMotion} from '../workout/island/minigames/soccer-athlete-motion.mjs';
import {SOCCER_RESTART_RIG_CALIBRATION} from '../workout/island/minigames/soccer-restart-poses.mjs';
import {calibrateSoccerRestartPoses} from '../workout/island/tools/soccer-restart-calibrate.mjs';
const read=async file=>JSON.parse(await readFile(new URL('../workout/island/design/'+file,import.meta.url),'utf8'));
const base=await read('motion/soccer.json'),packs=await Promise.all(['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('motion2/soccer/'+p+'.json')));
const library=composeSoccerRestartMotion(base,...packs);
const close=(a,b,message,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<=epsilon,`${message}: ${a} versus ${b}`);
const originalStates=Object.assign({},base.states,...packs.map(p=>p.states));

test('motion2 composition keeps all baseline and extension states without mutation or collisions',()=>{
  for(const [id,state]of Object.entries(originalStates))assert.equal(library.states[id],state);
  assert.equal(library.initialState,base.initialState);
  assert.equal(Object.keys(library.states).length,Object.keys(originalStates).length+5);
  assert.equal(library.transitions.length,base.transitions.length+packs.reduce((n,p)=>n+p.transitions.length,0));
  assert.throws(()=>composeSoccerRestartMotion(base,{...packs[0],states:{idle:packs[0].states.throw_in_prepare}}),/Duplicate/);
  assert.throws(()=>composeSoccerRestartMotion(base,{...packs[0],skeleton:{bones:[]}}),/skeleton mismatch/);
});

for(const [kind,sequence]of Object.entries(SOCCER_RESTART_SEQUENCES))test(`${kind}: simulation release clock equals the unique authored motion2 contact event`,()=>{
  let offset=0,contact=null;
  for(const clip of sequence.clips){const state=originalStates[clip];for(const event of state.events)if(event.name===sequence.event){assert.equal(contact,null);contact=offset+event.atSeconds;}offset+=state.durationSeconds;}
  const profile=restartActionProfile(kind),action=library.states[kind];
  close(profile.duration,offset,'duration');close(profile.contact,contact,'contact');close(action.durationSeconds,offset,'composed duration');
  assert.equal(action.events.filter(e=>e.name===sequence.event).length,1);
  close(action.events.find(e=>e.name===sequence.event).atSeconds,contact,'composed contact');
  assert.equal(sampleRestartAction(kind,contact-1e-5).released,false);
  assert.equal(sampleRestartAction(kind,contact).released,true);
  assert.equal(sampleRestartAction(kind,offset).stage,'complete');
  for(const c of action.supportContacts){assert.ok(Number.isFinite(c.startTime)&&Number.isFinite(c.endTime));assert.ok(c.startTime>=0&&c.endTime<=1&&c.startTime<=c.endTime);}
  assert.equal(action.rootMotion,false);
});

test('composite clip phase boundaries preserve the outgoing pose and all contact event clocks',()=>{
  for(const sequence of Object.values(SOCCER_RESTART_SEQUENCES)){
    if(sequence.clips.length<2)continue;
    const kind=Object.keys(SOCCER_RESTART_SEQUENCES).find(k=>SOCCER_RESTART_SEQUENCES[k]===sequence),composed=library.states[kind];let offset=0;
    for(let index=0;index<sequence.clips.length-1;index++){
      const outgoing=originalStates[sequence.clips[index]];offset+=outgoing.durationSeconds;
      const boundary=composed.keyframes.find(f=>Math.abs(f.time*composed.durationSeconds-offset)<1e-8);assert.ok(boundary);
      for(const bone of base.skeleton.bones){const a=boundary.rotations[bone.name],b=outgoing.keyframes.at(-1).rotations[bone.name];close(Math.abs(a.reduce((n,v,i)=>n+v*b[i],0)),1,'continuous '+bone.name,1e-7);}
    }
  }
});

test('throw-in ball travels with the authored preparation from chest to overhead and through release',()=>{
  installSoccerRestartMotion(library);
  const start=restartBallPose('throwIn',0),rising=restartBallPose('throwIn',.4),loaded=restartBallPose('throwIn',.648),release=restartBallPose('throwIn',restartActionProfile('throwIn').contact);
  const keys=SOCCER_RESTART_RIG_CALIBRATION.paths.throwIn;
  close(start.height,keys[0][1],'calibrated gather height',2e-6);assert.ok(rising.height>start.height+.15);
  assert.ok(loaded.height>1.8);assert.ok(loaded.forward<start.forward-.1,'ball moves from the chest over the head instead of floating at a static point');
  close(release.height,keys.at(-1)[1],'actual rig release height',2e-6);close(release.forward,keys.at(-1)[2],'actual rig release forward',2e-6);
});

test('keeper punt leaves the hands only at authored drop and follows a continuous falling path to the foot',()=>{
  installSoccerRestartMotion(library);const p=SOCCER_RESTART_SEQUENCES.keeperPunt;
  const before=sampleSoccerRestartBall('keeperPunt',p.drop-1e-5),drop=sampleSoccerRestartBall('keeperPunt',p.drop),after=sampleSoccerRestartBall('keeperPunt',p.drop+1e-5),strike=sampleSoccerRestartBall('keeperPunt',p.contact);
  close(before.height,drop.height,'drop continuity before',.001);close(after.height,drop.height,'drop continuity after',.001);
  const end=SOCCER_RESTART_RIG_CALIBRATION.paths.keeperPunt.at(-1);close(strike.height,end[1],'actual retargeted foot contact height',1e-6);close(strike.forward,end[2],'actual retargeted foot contact forward',1e-6);
  assert.ok(sampleSoccerRestartBall('keeperPunt',(p.drop+p.contact)/2).height<drop.height-.1);
});

const rig=await read('characters/rig.json'),map=await read('viewer/retarget-map.json');
function makeRig(){
  const root=new T.Group(),pivot=new T.Group(),bones={};pivot.add(root);root.scale.setScalar(1/map.motionScale);
  for(const joint of rig.joints){const bone=new T.Bone();bone.name=joint.name;bone.position.fromArray(joint.translation);bone.quaternion.fromArray(joint.rotation);bone.scale.fromArray(joint.scale);bones[joint.name]=bone;(joint.parent?bones[joint.parent]:root).add(bone);}
  return {root,pivot,restartContactMap:map,bones};
}
const attachmentPoint=(character,name,local)=>{
  const entry=map.bones.find(e=>e.target===name),q=new T.Quaternion().fromArray(entry.targetBasisWorldQuaternion).invert(),p=new T.Vector3().fromArray(local).applyQuaternion(q).multiplyScalar(map.motionScale);
  return character.root.getObjectByName(name).localToWorld(p);
};
for(const kind of ['throwIn','keeperThrow','keeperPunt'])test(`${kind}: rendered sphere stays on actual animated calibrated palm contacts at its physical radius`,()=>{
  const character=makeRig(),state=library.states[kind],clips=compileSoccerDesignClips({...library,states:{[kind]:state}},rig,map),mixer=new T.AnimationMixer(character.root),action=mixer.clipAction(clips[0]);action.play();action.timeScale=0;
  const contact=restartActionProfile(kind).contact,limit=kind==='keeperPunt'?SOCCER_RESTART_SEQUENCES.keeperPunt.drop:contact-1e-5;
  for(let index=0;index<=12;index++){
    const t=limit*index/12;action.time=t;mixer.update(0);character.pivot.updateMatrixWorld(true);
    const out=new T.Vector3(),motion=sampleRestartAction(kind,t);assert.equal(soccerRestartBallAttachment(T,character,motion,.11,out),true);
    if(kind==='keeperThrow'){const hand=attachmentPoint(character,'RightHand',[0,-.05,.02]);close(out.distanceTo(hand),.11,'right hand surface contact',1e-7);}
    else for(const side of ['LeftHand','RightHand']){const local=kind==='keeperPunt'?[side==='LeftHand'?-.02:.02,0,0]:[0,-.05,.02],palm=attachmentPoint(character,side,local);close(out.distanceTo(palm),.11,'two hand surface contact',1e-5);}
  }
  assert.equal(soccerRestartBallAttachment(T,character,sampleRestartAction(kind,contact),.11,new T.Vector3()),false,'released ball is physics owned');
  if(kind==='keeperPunt')assert.equal(soccerRestartBallAttachment(T,character,sampleRestartAction(kind,SOCCER_RESTART_SEQUENCES.keeperPunt.drop+.01),.11,new T.Vector3()),false,'punt is no longer held after the drop event');
  mixer.stopAllAction();mixer.uncacheRoot(character.root);
});

test('paused authored action restores its clean mixer pose before hand correction without accumulating drift',()=>{
  const character=makeRig(),data={...library,initialState:'throwIn',states:{throwIn:library.states.throwIn}},clips=compileSoccerDesignClips(data,rig,map),mixer=new T.AnimationMixer(character.root),motion=createSoccerDesignMotion(mixer,clips,data,{view:{animation:{idleSpeed:.2,runSpeed:4.5}}});
  const p={restartMotion:sampleRestartAction('throwIn',.9),kickTime:0,stealTime:0},state={ball:{}};
  motion.update(p,state,{mode:'throw'},0);const center=new T.Vector3();soccerRestartBallAttachment(T,character,p.restartMotion,.11,center);const original=center.clone(),hand=character.bones.LeftHand.quaternion.clone();
  for(let i=0;i<40;i++){character.bones.Head.rotation.x+=.2;motion.update(p,state,{mode:'throw'},0);soccerRestartBallAttachment(T,character,p.restartMotion,.11,center);close(center.distanceTo(original),0,'stable frozen attachment',1e-8);close(character.bones.LeftHand.quaternion.angleTo(hand),0,'stable corrected wrist',1e-7);}
  assert.equal(motion.state,'throwIn');close(motion.actions.throwIn.time,.9,'authoritative paused action clock');mixer.stopAllAction();mixer.uncacheRoot(character.root);
});

for(const kind of ['corner','goalKick','keeperPunt'])test(`${kind}: calibrated toe strikes the physical sphere without moving it or snapping the displayed body`,()=>{
  const character=makeRig(),clips=compileSoccerDesignClips({...library,states:{[kind]:library.states[kind]}},rig,map),mixer=new T.AnimationMixer(character.root),action=mixer.clipAction(clips[0]);action.play();action.timeScale=0;
  const profile=restartActionProfile(kind),pose=restartBallPose(kind,profile.contact),ball={x:-pose.side+.2,y:pose.height,z:pose.forward+.15},original={...ball};
  action.time=profile.contact-1e-5;mixer.update(0);const before=alignSoccerRestartStrike(T,character,sampleRestartAction(kind,profile.contact-1e-5),ball,.11);
  assert.ok(before.footDistance<=.21,`${kind} foot contact distance ${before.footDistance}`);assert.ok(before.shiftMetres<=.45+1e-8);assert.deepEqual(ball,original,'retarget correction never moves the physical ball');
  const position=character.pivot.position.clone();character.pivot.position.set(0,0,0);action.time=profile.contact+1e-5;mixer.update(0);alignSoccerRestartStrike(T,character,sampleRestartAction(kind,profile.contact+1e-5),ball,.11);
  assert.ok(character.pivot.position.distanceTo(position)<.001,'follow-through carries the contact correction without a body jump');mixer.stopAllAction();mixer.uncacheRoot(character.root);
});

test('motion preload retries after a real failed request and shares the successful package across reopenings',async()=>{
  const previous=globalThis.fetch;let failed=true,requests=0;
  globalThis.fetch=async url=>{requests++;if(failed)return {ok:false,status:503};return {ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))};};
  try{
    await assert.rejects(loadSoccerRestartMotion(),/503/);failed=false;
    const [a,b]=await Promise.all([loadSoccerRestartMotion(),loadSoccerRestartMotion()]);assert.equal(a,b);assert.equal(requests,8);
    assert.equal((await loadSoccerRestartMotion()),a);assert.equal(requests,8);assert.ok(a.states.throw_in_prepare&&a.states.corner_kick&&a.states.slide_straight);
  }finally{globalThis.fetch=previous;}
});

test('checked-in physical contact paths exactly match a fresh decode, retarget and floor bake of the real GLBs',async()=>{
  const fresh=await calibrateSoccerRestartPoses();assert.deepEqual(fresh,SOCCER_RESTART_RIG_CALIBRATION);
  assert.equal(fresh.heightMetres,1.8);assert.equal(fresh.ballRadiusMetres,.11);assert.ok(fresh.puntDrop.initialVerticalVelocity<=0);assert.ok(fresh.puntDrop.gravity>4&&fresh.puntDrop.gravity<14);
  for(const [kind,keys]of Object.entries(fresh.paths)){
    close(keys.at(-1)[0],restartActionProfile(kind).contact,'actual contact clock');
    for(const [time,height,forward,side]of keys){const pose=restartBallPose(kind,time);close(pose.height,height,'static physical height');close(pose.forward,forward,'static physical forward');close(pose.side,side,'static physical side');}
  }
  const p=restartActionProfile('keeperPunt');let previous=restartBallPose('keeperPunt',p.drop).height;
  for(let t=p.drop+.001;t<p.contact;t+=.001){const y=restartBallPose('keeperPunt',t).height;assert.ok(y<=previous+1e-8,'actual hand drop falls continuously toward actual foot');previous=y;}
});
