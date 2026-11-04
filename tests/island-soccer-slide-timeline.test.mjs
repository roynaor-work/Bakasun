import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {composeSoccerRestartMotion,SOCCER_SLIDE_SEQUENCES} from '../workout/island/minigames/soccer-restart-motion.mjs';
import {compileSoccerDesignClips,createSoccerDesignMotion} from '../workout/island/minigames/soccer-design-character.mjs';

const read=async f=>JSON.parse(await readFile(new URL('../workout/island/design/'+f,import.meta.url),'utf8'));
const base=await read('motion/soccer.json'),packs=await Promise.all(['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('motion2/soccer/'+p+'.json')));
const rig=await read('characters/rig.json'),map=await read('viewer/retarget-map.json');
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const data=composeSoccerRestartMotion(base,...packs),clips=compileSoccerDesignClips(data,rig,map);
function rigMotion(){
  const bones={};let root;
  for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else root=b;}
  const group=new T.Group();group.add(root);const mixer=new T.AnimationMixer(group);
  return {bones,group,motion:createSoccerDesignMotion(mixer,clips,data,config)};
}
const dt=1/60;
/** Simulated slide of `kind`: run, slide for the variant's seconds, recover, then stand or run. */
function playSlide(kind,won,after='stand'){
  const {motion,bones,group}=rigMotion(),variant={...config.slide,...config.slide.variants[kind]};
  const p={id:0,x:0,z:0,vx:4.5,vz:0,fx:1,fz:0,kickTime:0,stealTime:0,slideKind:kind,slideTime:0,recover:0,slideWon:false},s={ball:{owner:null,flight:null},mode:'defense',event:null};
  const rows=[];const step=(mode,n)=>{for(let i=0;i<n;i++){motion.update(p,s,{mode},dt);group.updateMatrixWorld(true);const hips=bones.Hips.getWorldPosition(new T.Vector3());rows.push({mode,state:motion.state,time:motion.slide?.time??null,slide:motion.slide,hipsY:hips.y,weight:motion.actions[motion.state].getEffectiveWeight()});}};
  step('run',30);
  p.slideTime=variant.seconds;p.vx=variant.distance/variant.seconds;
  while(p.slideTime>1e-9){p.slideTime=Math.max(0,p.slideTime-dt);if(p.slideTime<variant.seconds*.5)p.slideWon=won;step('slide',1);}
  p.recover=variant.recoverSeconds;p.vx=0;
  while(p.recover>1e-9){p.recover=Math.max(0,p.recover-dt);step('recover',1);}
  if(after==='stand')step('idle',90);else{p.vx=4.5;step('run',40);}
  return rows;
}

test('slide sequences compose the authored slide, fall and getting-up (or miss) clips into one timeline',()=>{
  for(const [name,sequence]of Object.entries(SOCCER_SLIDE_SEQUENCES)){
    const state=data.states[name];assert.ok(state,name);
    const total=sequence.clips.reduce((n,id)=>n+data.states[id].durationSeconds,0);
    assert.ok(Math.abs(state.durationSeconds-total)<1e-9);assert.equal(state.slideSeconds,data.states[sequence.slide].durationSeconds);
    assert.ok(clips.some(c=>c.name===name),'compiled for the rig');
    for(let i=1;i<state.keyframes.length;i++)assert.ok(state.keyframes[i].time>state.keyframes[i-1].time,'monotonic keys');
  }
});

for(const kind of ['straight','lateral','fast'])for(const won of [true,false])test(`${kind} slide ${won?'won':'missed'}: one timeline, clock never jumps, no cut between slide, fall and getting up`,()=>{
  const rows=playSlide(kind,won);
  const during=rows.filter(r=>r.mode==='slide'||r.mode==='recover');
  assert.ok(during.every(r=>r.state.startsWith('slide-'+kind)),'the composite owns the whole slide and recovery: '+[...new Set(during.map(r=>r.state))]);
  const finalName=won?`slide-${kind}`:`slide-${kind}-miss`;assert.equal(during.at(-1).state,finalName);
  let previous=null;for(const r of during){if(previous!==null){assert.ok(r.time>=previous-1e-9,'clock is monotonic');assert.ok(r.time-previous<=dt*3.2+1e-9,`no jump larger than three frames (${(r.time-previous).toFixed(3)}s)`);}previous=r.time;}
  const slideDur=data.states[`slide-${kind}`].slideSeconds,slidePart=during.filter(r=>r.mode==='slide');
  assert.ok(Math.abs(slidePart.at(-1).time-slideDur)<dt*2.5,'the authored slide ends with the simulated slide');
  const lowest=Math.min(...during.map(r=>r.hipsY)),standing=rows[0].hipsY;
  assert.ok(lowest<standing*.6,`the body goes down to the turf (hips ${lowest.toFixed(2)} vs ${standing.toFixed(2)})`);
  const after=rows.filter(r=>r.mode==='idle'),rest=data.states[finalName].durationSeconds-slideDur,variant={...config.slide,...config.slide.variants[kind]};
  if(rest>variant.recoverSeconds+1e-9)assert.ok(after.some(r=>r.slide?.follow),'the getting up keeps playing while the player stands');
  else assert.ok(during.at(-1).time>=data.states[finalName].durationSeconds-dt*2.5,'a short authored reaction finishes inside the recovery');
  assert.ok(after.at(-1).state==='idle'&&after.at(-1).slide===null,'and hands over to idle when it is done');
});

test('a slide that ends in a run blends straight into locomotion',()=>{
  const rows=playSlide('straight',true,'run'),after=rows.filter(r=>r.mode==='run').slice(-5);
  assert.ok(after.every(r=>r.state==='run'||r.state==='dribble_run'),after.map(r=>r.state).join());
  assert.ok(rows.filter(r=>r.mode==='run').slice(30).every(r=>r.slide===null));
});
