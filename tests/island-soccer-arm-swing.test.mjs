import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {composeSoccerRestartMotion} from '../workout/island/minigames/soccer-restart-motion.mjs';
import {compileSoccerDesignClips,createSoccerDesignMotion} from '../workout/island/minigames/soccer-design-character.mjs';
import {armSwingPose,armSwingState,ARM_SWING_ORDER} from '../workout/island/minigames/soccer-arm-swing.mjs';

const read=async f=>JSON.parse(await readFile(new URL('../workout/island/design/'+f,import.meta.url),'utf8'));
const base=await read('motion/soccer.json'),packs=await Promise.all(['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('motion2/soccer/'+p+'.json')));
const rig=await read('characters/rig.json'),map=await read('viewer/retarget-map.json');
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const data=composeSoccerRestartMotion(base,...packs),clips=compileSoccerDesignClips(data,rig,map);

/** The authored rig as a live three.js skeleton, so the layer is measured on real bones. */
function skeleton(){
  const bones={};let root;
  for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);b.scale.fromArray(j.scale);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else root=b;}
  const group=new T.Group();group.add(root);
  const v=new T.Vector3(),pos=n=>{group.updateMatrixWorld(true);return bones[n].getWorldPosition(v).clone();};
  const angle=(a,b,c)=>{const A=pos(a),B=pos(b),C=pos(c);return A.sub(B).angleTo(C.sub(B))*180/Math.PI;};
  return {group,bones,pos,angle};
}
const sample=(motion,p,s,mode,steps,dt,measure)=>{const rows=[];for(let i=0;i<steps;i++){motion.update(p,s,{mode},dt);rows.push(measure());}return rows;};

test('arm swing pose: counter-phase, symmetric, closes the elbows and never opens the arms sideways',()=>{
  const a=armSwingPose(0,1,0),b=armSwingPose(.5,1,0);
  assert.ok(a.LeftArm[0]>0&&a.RightArm[0]<0,'left foot forward at phase 0: left arm back, right arm forward');
  assert.ok(Math.abs(a.LeftArm[0]+b.LeftArm[0])<1e-9,'half a cycle later the swing is mirrored');
  assert.ok(a.LeftForeArm[0]<0&&a.RightForeArm[0]<0,'elbows flex (negative X)');
  assert.ok(a.LeftArm[2]<0&&a.RightArm[2]>0,'hands are pulled toward the body, not spread');
  assert.ok(Math.sign(a.Chest[1])===Math.sign(a.Spine[1])&&a.Chest[1]!==0,'spine and chest counter-rotate together');
  const sprint=armSwingPose(.25,1,1),run=armSwingPose(.25,1,0);
  assert.ok(sprint.LeftForeArm[0]<run.LeftForeArm[0]&&Math.abs(sprint.LeftArm[0])>Math.abs(run.LeftArm[0]),'sprint closes the elbows more and swings more');
  assert.ok(Math.abs(armSwingPose(.25,1,0,1).LeftArm[0])<Math.abs(run.LeftArm[0]),'a dribbler swings less');
  const still=armSwingPose(.3,0,1);for(const name of ARM_SWING_ORDER)assert.ok(still[name].every(v=>Math.abs(v)<1e-12),name+' is untouched when standing');
});

test('arm swing state: the weight rises while running, falls off in actions and the phase keeps advancing',()=>{
  const st={phase:0,weight:0,sprint:0,carry:0};
  for(let i=0;i<60;i++)armSwingState(st,1/60,{locomotion:true,clipPhase:(i/60)%1,speed01:1,sprint01:0,carrying:false});
  assert.ok(st.weight>.99);assert.ok(Math.abs(st.phase-(59/60))<1e-9,'the clip phase is followed');
  for(let i=0;i<60;i++)armSwingState(st,1/60,{locomotion:false,clipPhase:NaN,speed01:1,sprint01:0,carrying:false});
  assert.equal(st.weight,0,'fully off within a second of a kick or fall');
  assert.ok(st.phase>=0&&st.phase<1);
});

for(const [label,speed,mode,owner] of [['run',4.5,'run',null],['sprint',6.5,'sprint',null],['dribble',4.5,'run',0]])test(`design run (${label}): hands swing against the feet, elbows near 90 degrees, no T-pose`,()=>{
  const sk=skeleton(),mixer=new T.AnimationMixer(sk.group),motion=createSoccerDesignMotion(mixer,clips,data,config);
  const p={id:0,x:0,z:0,vx:speed,vz:0,fx:1,fz:0,kickTime:0,stealTime:0},s={ball:{owner,flight:null},mode:'attack',event:null};
  sample(motion,p,s,mode,45,1/60,()=>0);
  const rows=sample(motion,p,s,mode,24,.72/24,()=>({state:motion.state,weight:motion.armSwing.weight,lh:sk.pos('LeftHand'),rh:sk.pos('RightHand'),lf:sk.pos('LeftFoot').z,rf:sk.pos('RightFoot').z,elbows:[sk.angle('LeftArm','LeftForeArm','LeftHand'),sk.angle('RightArm','RightForeArm','RightHand')]}));
  assert.ok(rows.every(r=>r.weight>.98),'the layer is fully on while running');
  const travel=Math.max(...rows.map(r=>r.lh.z))-Math.min(...rows.map(r=>r.lh.z));
  assert.ok(travel>=.3,`hands travel fore and aft (${travel.toFixed(2)} m)`);
  let counter=0;for(const r of rows)if(Math.abs(r.lf-r.rf)>.08&&(r.lh.z-r.rh.z)*(r.lf-r.rf)<0)counter++;
  const decided=rows.filter(r=>Math.abs(r.lf-r.rf)>.08).length;
  assert.ok(counter>=decided*(label==='dribble'?.75:.8),`left hand forward when the left foot is back (${counter}/${decided})`);
  for(const r of rows){
    for(const e of r.elbows)assert.ok(e>=(label==='dribble'?95:60)&&e<=(label==='dribble'?125:110),`elbow ${e.toFixed(0)} degrees in ${r.state}`);
    assert.ok(Math.abs(r.lh.x)<.3&&Math.abs(r.rh.x)<.3,'hands stay near the body (rest pose is at 0.56 m)');
    assert.ok(r.lh.y>.55&&r.rh.y>.55&&r.lh.y<1.15&&r.rh.y<1.15,'hands between the hips and the shoulders');
  }
});

test('design kick: the arm layer fades out so the authored strike is not disturbed',()=>{
  const sk=skeleton(),mixer=new T.AnimationMixer(sk.group),motion=createSoccerDesignMotion(mixer,clips,data,config);
  const p={id:0,x:0,z:0,vx:4.5,vz:0,fx:1,fz:0,kickTime:0,stealTime:0},s={ball:{owner:0,flight:null},mode:'attack',event:null};
  sample(motion,p,s,'run',45,1/60,()=>0);assert.ok(motion.armSwing.weight>.98);
  p.kickTime=.42;p.vx=0;motion.update(p,s,{mode:'kick'},1/60);assert.match(motion.state,/kick|pass/);
  sample(motion,p,s,'kick',8,1/60,()=>0);assert.ok(motion.armSwing.weight<.2,'the layer is mostly gone within 150 ms of the strike');
  sample(motion,p,s,'kick',51,1/60,()=>0);assert.equal(motion.armSwing.weight,0);
});
