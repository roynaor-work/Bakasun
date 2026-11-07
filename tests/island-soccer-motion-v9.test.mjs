import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {composeSoccerRestartMotion,SOCCER_SLIDE_SEQUENCES} from '../workout/island/minigames/soccer-restart-motion.mjs';
import {compileSoccerDesignClips,createSoccerDesignMotion} from '../workout/island/minigames/soccer-design-character.mjs';
import {soccerMotionV9Enabled,armStandPose,armStandWeight,slideRecoverTime,ARM_STAND_DELTAS} from '../workout/island/minigames/soccer-motion-v9.mjs';
import {slideVariant,slideRecoverySeconds} from '../workout/island/minigames/soccer-control-depth.mjs';

const read=async f=>JSON.parse(await readFile(new URL('../workout/island/design/'+f,import.meta.url),'utf8'));
const base=await read('motion/soccer.json'),packs=await Promise.all(['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('motion2/soccer/'+p+'.json')));
const rig=await read('characters/rig.json'),map=await read('viewer/retarget-map.json');
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const data=composeSoccerRestartMotion(base,...packs),clips=compileSoccerDesignClips(data,rig,map);
const deg=r=>r*180/Math.PI,dt=1/60;
function make(){
  const bones={};let root;
  for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else root=b;}
  const group=new T.Group();group.add(root);const mixer=new T.AnimationMixer(group);
  return {bones,group,motion:createSoccerDesignMotion(mixer,clips,data,config)};
}
const W=(bones,n)=>bones[n].getWorldPosition(new T.Vector3());
function arms({bones,group}){
  group.updateMatrixWorld(true);
  return ['Left','Right'].map(side=>{const u=W(bones,side+'ForeArm').sub(W(bones,side+'Arm')),f=W(bones,side+'Hand').sub(W(bones,side+'ForeArm'));return {abd:deg(Math.atan2((side==='Left'?1:-1)*u.x,-u.y)),flex:deg(u.angleTo(f))};});
}
const player=(over={})=>({id:0,x:0,z:0,vx:0,vz:0,fx:1,fz:0,kickTime:0,stealTime:0,slideKind:'straight',slideTime:0,recover:0,slideWon:false,...over});
const state=mode=>({ball:{owner:null,flight:null},mode,event:null});

test('v9 is on by default and off with ?soccerMotion=0',()=>{
  assert.equal(soccerMotionV9Enabled(''),true);assert.equal(soccerMotionV9Enabled('?soccerMotion=0'),false);assert.equal(soccerMotionV9Enabled('?soccerMotion=1'),true);
});

test('a standing player has the arms near the body with bent elbows, never a T-pose',()=>{
  const rt=make(),p=player(),s=state('attack');
  for(let i=0;i<120;i++)rt.motion.update(p,s,{mode:'idle'},dt);
  assert.equal(rt.motion.state,'idle');
  for(const a of arms(rt)){assert.ok(a.abd<20,`upper arm ${a.abd.toFixed(1)} deg from the body`);assert.ok(a.flex>30&&a.flex<80,`elbow ${a.flex.toFixed(1)} deg`);}
});

test('the stand layer leaves running to the swing layer and only touches standing, turning and shadowing states',()=>{
  for(const name of ['idle','decelerate','turn_left','turn_right','defensive_jockey'])assert.equal(armStandWeight(name),1,name);
  for(const name of ['run','sprint','celebrate_arms_up','slide-straight','kick'])assert.equal(armStandWeight(name),0,name);
  for(const [name,d]of Object.entries(ARM_STAND_DELTAS)){const pose=armStandPose(name,0);assert.ok(pose.LeftArm[2]<=0&&pose.RightArm[2]>=0,'arms move toward the body: '+name);assert.ok(pose.LeftForeArm[0]<0,'elbows close: '+name);assert.ok(d.abd<=0);}
  const a=armStandPose('idle',0,0);assert.ok(Object.values(a).every(v=>v.every(x=>Math.abs(x)<1e-9)),'weight 0 adds nothing');
});

test('the aeroplane celebration (arms straight out) is no longer picked after a goal',async()=>{
  const source=await readFile(new URL('../workout/island/minigames/soccer-design-character.mjs',import.meta.url),'utf8');
  assert.match(source,/soccerMotionV9Enabled\(\)\?\['celebrate_arms_up','celebrate_fist_pump','celebrate_victory_leap'\]/);
});

test('every slide composite, including a miss, ends in the getting-up clip',()=>{
  for(const [name,seq]of Object.entries(SOCCER_SLIDE_SEQUENCES)){
    const kind=name.replace('slide-','').replace('-miss',''),last=seq.clips.at(-1);
    assert.equal(last,`slide_${kind}_recover`,name);assert.equal(data.states[name].parts.length,3,name);
  }
});

test('slide recovery maps onto one timeline that never runs faster than three times and ends upright',()=>{
  for(const kind of ['straight','lateral','fast'])for(const name of [`slide-${kind}`,`slide-${kind}-miss`])for(const rec of [.6,.7,.75,.96]){
    const parts=data.states[name].parts;let previous=slideRecoverTime(parts,rec,0);
    assert.ok(Math.abs(previous-data.states[name].slideSeconds)<1e-9,'starts where the slide part ends');
    for(let i=1;i<=100;i++){
      const t=slideRecoverTime(parts,rec,i/100);assert.ok(t>=previous-1e-9,'monotonic');
      assert.ok((t-previous)/(rec/100)<=3.05,`speed ${((t-previous)/(rec/100)).toFixed(2)}x (${name} ${rec})`);previous=t;
    }
    const rise=parts[2];assert.ok(previous>=rise.start+rise.durationSeconds*.7&&previous<data.states[name].durationSeconds,'ends nearly upright, before the clip end');
  }
  assert.equal(slideRecoverTime(null,.6,.5),null);
});

test('slide plus getting up never keeps the player down longer than 1.2 seconds',()=>{
  assert.equal(config.slide.maxTotalSeconds,1.2);
  for(const kind of ['straight','lateral','fast']){
    const v=slideVariant(config,kind);
    for(const flags of [{won:true},{won:false},{won:false,behind:true,late:true}])assert.ok(v.seconds+slideRecoverySeconds(v,flags)<=1.2+1e-9,`${kind} ${JSON.stringify(flags)}`);
  }
  assert.ok(slideRecoverySeconds({recoverSeconds:.6,seconds:.35},{won:false})>.6,'without a cap the old rule still applies');
});

function slideTimes(kind,won,after){
  const rt=make(),v=slideVariant(config,kind),p=player({slideKind:kind,vx:4.5}),s=state('defense');let sim=0;const rows=[];
  const step=mode=>{rt.motion.update(p,s,{mode},dt);sim+=dt;rt.group.updateMatrixWorld(true);rows.push({sim,mode,state:rt.motion.state,hipsY:W(rt.bones,'Hips').y});};
  for(let i=0;i<30;i++)step('run');
  const t0=sim,standing=rows[0].hipsY;p.slideTime=v.seconds;p.vx=v.distance/v.seconds;
  while(p.slideTime>1e-9){p.slideTime=Math.max(0,p.slideTime-dt);if(p.slideTime<v.seconds*.5)p.slideWon=won;step('slide');}
  p.recover=slideRecoverySeconds(v,{won,behind:!won,late:!won});p.vx=0;
  while(p.recover>1e-9){p.recover=Math.max(0,p.recover-dt);step('recover');}
  const control=sim-t0,hipsAtControl=rows.at(-1).hipsY;
  if(after==='run'){p.vx=4.5;for(let i=0;i<40;i++)step('run');}
  return {control,hipsAtControl,standing,rows,t0};
}
for(const kind of ['straight','lateral','fast'])for(const won of [true,false])test(`${kind} slide ${won?'won':'missed'}: control and an upright body within 1.2 s, no pop into the run`,()=>{
  const r=slideTimes(kind,won,'run');
  assert.ok(r.control<=1.2+dt,`control returns after ${r.control.toFixed(2)} s`);
  assert.ok(r.hipsAtControl>=r.standing*.8,`hips ${r.hipsAtControl.toFixed(2)} of ${r.standing.toFixed(2)} when control returns`);
  const run=r.rows.filter(x=>x.mode==='run').slice(30);let worst=0;for(let i=1;i<run.length;i++)worst=Math.max(worst,Math.abs(run[i].hipsY-run[i-1].hipsY));
  assert.ok(worst<.04,`hips move at most ${worst.toFixed(3)} m per frame while running again`);
  assert.ok(run.some(x=>/^run|dribble/.test(x.state)),'running again');
});
